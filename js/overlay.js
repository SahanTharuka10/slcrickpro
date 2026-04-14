let matchId = new URLSearchParams(window.location.search).get('match') || new URLSearchParams(window.location.search).get('matchId');
let tournId = new URLSearchParams(window.location.search).get('tournament') || new URLSearchParams(window.location.search).get('tournamentId');
let refreshInterval;
let currentPopupView = null;
let latestSocketScore = null;
let latestSocketScoreTime = 0; // track when socket data was received
if (typeof OVERLAY_DEFAULT_PLAYER_PHOTO === 'undefined') {
    var OVERLAY_DEFAULT_PLAYER_PHOTO = '../assets/default-player.svg';
}

function getShortName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function formatOvers(balls, bpo = 6) {
    const ov = Math.floor(balls / bpo);
    const rem = balls % bpo;
    return `${ov}.${rem}`;
}

function formatCRR(runs, balls) {
    if (!balls) return '0.00';
    return ( (runs / balls) * 6 ).toFixed(2);
}

function toggleShortcutMenu() {
    const menu = document.getElementById('shortcut-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }
}

function showOverlayPopup(view) {
    currentPopupView = view;
    const popup = document.getElementById('overlay-popup');
    popup.style.display = 'block';
    renderTournamentStats(view);
}

function closeOverlayPopup() {
    currentPopupView = null;
    const popup = document.getElementById('overlay-popup');
    popup.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    // Instant same-device cross-tab communication
    if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel('cricpro_live');
        bc.onmessage = (event) => {
            if (event.data && event.data.type === 'score_update') {
                if (matchId !== event.data.matchId && !tournId) {
                    matchId = event.data.matchId;
                }
                renderOverlay();
            }
        };
    }
    
    // Fallback for cross-tab updates via localStorage (if BroadcastChannel fails)
    window.addEventListener('storage', (e) => {
        if (e.key === 'cricpro_force_update') {
            renderOverlay();
        }
    });

    if (!matchId && !tournId) {
        document.getElementById('overlay-container').innerHTML = '<div style="padding: 20px; font-weight: bold; color: #ff0000; background: white; border-radius: 10px;">No Match or Tournament ID specified!</div>';
        return;
    }

    // Attempt to load match immediately to populate tournId if needed
    let m = null;
    if (matchId) {
        m = DB.getMatch(matchId);
        if (m && m.tournamentId && !tournId) {
            tournId = m.tournamentId; // Adopt tournament ID from match
        }
    } else if (tournId) {
        m = DB.getMatches().find(mt => mt.tournamentId === tournId && (mt.status === 'live' || mt.status === 'paused'));
        if (m) matchId = m.id; // Adopt match ID so it doesn't get lost
    }

    if (tournId) {
        const fixBtn = document.getElementById('btn-fix');
        const batBtn = document.getElementById('btn-bat');
        const bowlBtn = document.getElementById('btn-bowl');
        if(fixBtn) fixBtn.style.display = 'block';
        if(batBtn) batBtn.style.display = 'block';
        if(bowlBtn) bowlBtn.style.display = 'block';
    }

    // CRITICAL: Clear any stuck broadcast command from local storage on load
    localStorage.removeItem('cricpro_broadcast_cmd');
    hideAllBroadcastOverlays();

    // Add match stats button logic if not already there
    const menuContainer = document.getElementById('shortcut-menu');
    if (menuContainer && !document.getElementById('btn-match-stats-menu')) {
        menuContainer.innerHTML += `<button onclick="showOverlayPopup('matchstats'); toggleShortcutMenu();" class="btn-tv" id="btn-match-stats-menu">📊 Match Stats</button>`;
    }

    // ── Backend URL Discovery ─────────────────────────────────
    const baseUrl = window.BACKEND_BASE_URL || ('http' + (window.location.protocol === 'https:' ? 's' : '') + '://' + window.location.hostname + ':3000');

    // ── Socket.io: Instant push-based updates from the server
    // Reuse existing socket if db.js initialized it, otherwise create new
    const socket = window._cricproSocket || (typeof io !== 'undefined' ? io(baseUrl, { 
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 10, 
        timeout: 5000 
    }) : null);

    
    if (socket) {
        try {
            // Emit join_global to join the global broadcast room
            socket.emit('join_global', {});
            // Emit join_match to join the specific match room
            if (matchId) socket.emit('join_match', matchId);
            if (tournId) socket.emit('join_match', tournId);

            socket.on('scoreUpdate', (updatedData) => {
                if (!updatedData) return;
                const isOurs = (matchId && updatedData.id === matchId)
                             || (tournId && updatedData.tournamentId === tournId);
                if (!isOurs) return;
                
                console.log('⚡ Socket scoreUpdate received for', updatedData.id);
                // If it's a full match object (no .score wrapper), wrap it or handle it
                if (updatedData.score) {
                    latestSocketScore = updatedData;
                } else if (updatedData.innings) {
                    // It's a full match object
                    latestSocketScore = { id: updatedData.id, fullMatch: updatedData, score: updatedData.innings[updatedData.currentInnings] };
                }
                
                // Force immediate render
                renderOverlay();
            });

            socket.on('broadcast_command', (payload) => {
                if (!payload || !payload.cmd) return;
                console.log('⚡ Socket broadcast_command:', payload.cmd);
                handleBroadcastCommand(payload.cmd, { ...(payload.data || {}), tournamentId: payload.tournamentId || null, matchId: payload.matchId || null });
            });

            socket.on('connect', () => {
                console.log('🟢 TV: Socket connected to ' + (socket.io ? socket.io.uri : baseUrl));
                if (matchId) {
                    socket.emit('join_match', matchId);
                    socket.emit('request_sync', { matchId });
                }
                if (tournId) {
                    socket.emit('request_sync', { tournId });
                }
            });

            socket.on('disconnect', () => console.warn('🔴 TV: Socket disconnected — API polling continues'));
        } catch (e) { console.warn('Socket.io init failed:', e.message); }
    } else {
        console.warn('Socket.io not loaded — using API polling only.');
    }


    renderOverlay();

    // ── Server API polling: works on ANY device on the same network
    //    Polls the cached /tv/matches/:id/light endpoint every 3 seconds
    // (baseUrl is already defined above)


    let pollFailCount = 0;
    function pollServerScore() {
        if (!matchId && !tournId) return;

        const targetUrl = matchId 
            ? (baseUrl + '/tv/matches/' + matchId + '/light')
            : (baseUrl + '/sync/matches');

        fetch(targetUrl)
            .then(r => {
                if (r.status === 404) {
                    if (pollFailCount % 10 === 0) console.log('📡 TV: Match not yet synced to server, waiting...');
                    pollFailCount++;
                    return null;
                }
                pollFailCount = 0;
                return r.ok ? r.json() : null;
            })
            .then(data => {
                if (!data) return;
                
                // Handle tournament list vs light score payload
                let scoreItem = data.score ? data : null;
                let fullMatchObj = null;

                if (!scoreItem && data.matches) {
                    // Tournament mode: find live or paused match
                    fullMatchObj = data.matches.find(m => 
                        m.id === matchId || 
                        (m.tournamentId === tournId && (m.status === 'live' || m.status === 'paused'))
                    );
                    if (fullMatchObj) {
                        // CRITICAL: persist to local DB so renderOverlay() can use it on OBS device
                        if (typeof DB !== 'undefined' && DB.saveMatch) {
                            DB.saveMatch(fullMatchObj);
                        }
                        // Switch overlay to track this specific match directly
                        if (!matchId && fullMatchObj.id) {
                            matchId = fullMatchObj.id;
                            console.log('📡 TV: Tournament mode locked onto live match:', matchId);
                            if (socket) socket.emit('join_match', matchId);
                        }
                        // Wrap for scoreItem only if innings ready
                        const inn = fullMatchObj.innings && fullMatchObj.innings[fullMatchObj.currentInnings || 0];
                        if (inn) {
                            scoreItem = { score: inn, fullMatch: fullMatchObj };
                        } else {
                            // Match found but innings not started yet — force a re-render to update "Next Match" state
                            renderOverlay();
                            return;
                        }
                    }
                } else if (data.fullMatch) {
                    fullMatchObj = data.fullMatch;
                    // Persist light payload full match too
                    if (fullMatchObj && typeof DB !== 'undefined' && DB.saveMatch) {
                        DB.saveMatch(fullMatchObj);
                    }
                }

                if (!scoreItem || !scoreItem.score) return;

                const prevBalls = latestSocketScore && latestSocketScore.score ? latestSocketScore.score.balls : -1;
                const containerHidden = document.getElementById('overlay-container').style.display === 'none' || document.getElementById('overlay-container').innerHTML === '';
                
                if (scoreItem.score.balls !== prevBalls || containerHidden) {
                    latestSocketScore = scoreItem;
                    renderOverlay();
                }
            }).catch(err => {
                // Silently handle network errors
            });
    }

    // Poll immediately then every 3 seconds
    setTimeout(pollServerScore, 600);
    refreshInterval = setInterval(() => {
        if (currentPopupView) {
            renderTournamentStats(currentPopupView);
        } else {
            pollServerScore();   // Fetch latest from server (cross-device)
            renderOverlay();     // Also re-render from localStorage (same device)
        }
    }, 1500); // Speed up for better real-time feel

    // ── Live Clock Ticker ──────────────────────────────────
    function updateClock() {
        // Look for the clock in both the normal score-pill and the fallback overlay
        const elements = document.querySelectorAll('#overlay-live-clock');
        if (elements.length === 0) return;
        
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const timeStr = `${h}:${m}:${s}`;
        
        elements.forEach(el => {
            if (el.textContent !== timeStr) el.textContent = timeStr;
        });
    }
    // High-frequency clock update for multi-element support
    setInterval(updateClock, 500);
    updateClock();


    // ── Storage events: instant cross-tab updates on the same machine
    window.addEventListener('storage', (e) => {
        if (e.key === 'cricpro_broadcast_cmd') {
            try {
                const payload = JSON.parse(e.newValue);
                handleBroadcastCommand(payload.cmd, { ...(payload.data || {}), tournamentId: payload.tournamentId || null, matchId: payload.matchId || null });
            } catch (err) { console.error('Broadcast parse err', err); }
        }
        if (e.key === 'cricpro_matches' || e.key === 'cricpro_tournaments' || e.key === 'cricpro_force_update') {
            if (!currentPopupView) renderOverlay();
            else renderTournamentStats(currentPopupView);
        }
    });

    // ── Instant postMessage listener for embedded IFRAME previews
    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'cricpro_broadcast_cmd') {
            try {
                const payload = e.data.payload;
                handleBroadcastCommand(payload.cmd, { ...(payload.data || {}), tournamentId: payload.tournamentId || null, matchId: payload.matchId || null });
            } catch (err) {}
        }
    });
});

function handleBroadcastCommand(cmd, data = {}) {
    if (!cmd) return;
    try {
        if (data && typeof data === 'object') {
            if (data.tournamentId && tournId && String(data.tournamentId) !== String(tournId)) return;
            if (data.matchId && matchId && String(data.matchId) !== String(matchId)) return;
        }
    } catch (e) {
        console.warn('Broadcast filter error', e);
    }
    if (!window.gsap) { console.error("🚫 GSAP not loaded. Broadcast animations skipped."); return; }
    console.log("📥 Received Broadcast:", cmd, data);
    
    // Clear existing special overlays if needed
    if (cmd === 'STOP_OVERLAY') {
        hideAllBroadcastOverlays();
        hideBroadcastOverlay();
        return;
    }

    switch (cmd) {
        case 'SHOW_RUNS_BALLS':
            showRunsBallsGraphic(data);
            break;
        case 'SHOW_NEXT_MATCH':
            showNextMatchGraphic(data);
            break;
        case 'SHOW_SCORECARD':
            toggleBroadcastScorecard(data.matchId || matchId);
            break;
        case 'SHOW_SUMMARY':
            toggleBroadcastSummary(data.tournamentId || tournId);
            break;
        case 'SHOW_CRR': 
            showCRRGraphic(data); 
            break;
        case 'SHOW_TEAM_ROSTER':
            showTeamRosterGraphic(data);
            break;
        case 'SHOW_TEAM_CARD':
            showTeamCardGraphic(data);
            break;
        case 'SHOW_BATTER_PROFILES':
            showBatterProfilesCinema(data);
            break;
        case 'SHOW_BIG_EVENT':
            showBigEventGraphic(data);
            break;
        case 'SHOW_STRIKER_PROFILE':
            showStrikerProfileLeft(data);
            break;
        case 'SHOW_NON_STRIKER_PROFILE':
            showStrikerProfileLeft(data, 'NON-STRIKER');
            break;
        case 'SHOW_BOWLER_PROFILE':
            showBowlerProfileGraphic(data);
            break;
        case 'SHOW_GUEST':
            showGuestGraphic(data);
            break;
        case 'SYNC_SCORE':
            if (data && data.match) _renderOverlayFromMatch(data.match);
            break;
        case 'SHOW_PARTNERSHIP':
            showPartnershipGraphicCinema(data);
            break;
        case 'STOP_OVERLAY': 
            hideAllBroadcastOverlays(); 
            break;
        default:
            console.log("ℹ️ Unhandled Broadcast Command:", cmd);
    }
}

function hideAllBroadcastOverlays() {
    gsap.to('.broadcast-overlay', { opacity: 0, scale: 0.9, duration: 0.4, onComplete: () => {
        document.querySelectorAll('.broadcast-overlay').forEach(el => el.style.display = 'none');
    }});
}

function showCRRGraphic(data) {
    const el = document.getElementById('broadcast-crr');
    document.getElementById('crr-val').textContent = data.crr;
    
    el.style.display = 'flex';
    gsap.fromTo(el, { x: 300, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'back.out(1.7)' });
    
    // Auto hide after 8 seconds
    setTimeout(() => {
        gsap.to(el, { x: 300, opacity: 0, duration: 0.8, ease: 'power4.in', onComplete: () => {
            el.style.display = 'none';
        }});
    }, 8000);
}

function showRunsBallsGraphic(data) {
    if (!window.gsap) return;
    const el = document.querySelector('.runs-balls-overlay');
    const inner = document.getElementById('rb-inner');
    
    document.getElementById('rb-runs').textContent = data.runs;
    document.getElementById('rb-balls').textContent = data.balls;
    
    el.style.display = 'flex';
    
    // Cinematic Timeline
    const tl = gsap.timeline();
    tl.to(el, { opacity: 1, duration: 0.5 })
      .fromTo(inner, { scale: 0.5, rotateX: 45, opacity: 0 }, { scale: 1, rotateX: 0, opacity: 1, duration: 1, ease: 'back.out(1.2)' }, "-=0.3")
      .from('#rb-title-anim', { y: -20, opacity: 0, duration: 0.6 }, "-=0.5")
      .from('.rb-main span', { scale: 1.5, opacity: 0, stagger: 0.2, duration: 0.8, ease: 'elastic.out(1, 0.5)' }, "-=0.4")
      .from('.rb-footer', { opacity: 0, duration: 1 }, "-=0.5");
    
    // Auto-hide after 10 seconds (User requested slower)
    setTimeout(() => {
        if (el.style.display === 'flex') {
            gsap.to(el, { opacity: 0, duration: 0.8, onComplete: () => {
                el.style.display = 'none';
                gsap.set(inner, { scale: 0.8, opacity: 0 }); // Reset for next time
            }});
        }
    }, 10000);
}

function showNextMatchGraphic(data) {
    const teamA = data.teamA || 'TBD';
    const teamB = data.teamB || 'TBD';

    // Remove existing if any
    const existing = document.getElementById('nm-wrapper');
    if(existing) existing.remove();

    const html = `
        <div id="next-match-popup" style="position:fixed; top:50%; left:50%; transform:translate(-50%, -50%) scale(0.9); opacity:0; z-index:20000; font-family:'Outfit', sans-serif;">
            <div style="background:linear-gradient(135deg, rgba(20, 20, 35, 0.95), rgba(5, 5, 10, 0.98)); 
                border-radius:30px; border:2px solid rgba(230,27,77,0.5); padding:50px 70px; text-align:center;
                box-shadow: 0 40px 100px rgba(0,0,0,0.95), 0 0 60px rgba(230,27,77,0.3); backdrop-filter:blur(20px);">
                
                <div style="background:#e61b4d; color:#fff; display:inline-block; padding:10px 40px; border-radius:25px; 
                    font-size:18px; font-weight:900; letter-spacing:5px; margin-bottom:40px; position:absolute; top:-25px; left:50%; transform:translateX(-50%); box-shadow:0 10px 20px rgba(230,27,77,0.5);">
                    COMING UP NEXT
                </div>
                
                <div style="display:flex; align-items:center; gap:60px;">
                    <div style="font-size:62px; font-weight:950; color:#fff; text-shadow:0 10px 20px rgba(0,0,0,0.5);">${teamA.toUpperCase()}</div>
                    <div style="width:80px; height:80px; background:#e61b4d; border-radius:50%; display:flex; align-items:center; justify-content:center; 
                        color:#fff; font-size:30px; font-weight:900; font-style:italic; box-shadow:0 0 30px rgba(230,27,77,0.6); flex-shrink:0;">VS</div>
                    <div style="font-size:62px; font-weight:950; color:#fff; text-shadow:0 10px 20px rgba(0,0,0,0.5);">${teamB.toUpperCase()}</div>
                </div>
                
                <div style="margin-top:50px; font-size:16px; color:rgba(255,255,255,0.3); font-weight:800; letter-spacing:8px;">
                    SLCRICKPRO LIVE PRODUCTION
                </div>
            </div>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'nm-wrapper';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    if (typeof gsap !== 'undefined') {
        gsap.to('#next-match-popup', { scale: 1, opacity: 1, duration: 1, ease: 'elastic.out(1, 0.6)' });
        
        if (window._nmTimeout) clearTimeout(window._nmTimeout);
        window._nmTimeout = setTimeout(() => {
            gsap.to('#next-match-popup', { scale: 0.9, opacity: 0, y: 50, duration: 0.6, ease: 'power3.in', onComplete: () => wrapper.remove() });
        }, 8000);
    } else {
        document.getElementById('next-match-popup').style.opacity = 1;
        document.getElementById('next-match-popup').style.transform = 'translate(-50%, -50%)';
        setTimeout(() => wrapper.remove(), 8000);
    }
}

// Milestone Graphic Removed as per User Request

function toggleBroadcastScorecard(mId) {
    const el = document.getElementById('broadcast-full-scorecard');
    if (el.style.display === 'flex') {
        gsap.to(el, { opacity: 0, scale: 0.95, duration: 0.5, onComplete: () => el.style.display = 'none' });
    } else {
        const success = renderFullScorecardOverlay(mId || matchId);
        if (success) {
            el.style.display = 'flex';
            gsap.fromTo(el, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out' });
        } else {
            console.error("🚫 Cannot show scorecard: No match data found.");
        }
    }
}

function renderFullScorecardOverlay(mId) {
    const m = DB.getMatch(mId);
    if (!m) return false;
    
    let html = `
    <div class="fs-header">
        <div style="font-size:32px; font-weight:900; letter-spacing:3px">MATCH SCORECARD</div>
        <div style="font-size:14px; opacity:0.7; letter-spacing:1px">${m.team1} vs ${m.team2}</div>
    </div>
    <div class="fs-grid">`;
    
    m.innings.forEach((inn, i) => {
        if (!inn) return;
        html += `
        <div class="fs-column">
            <!-- Innings Header -->
            <div style="display:flex; justify-content:space-between; align-items:center; background:#1b1642; color:#fff; padding:12px 20px; border-radius:8px">
                <div style="font-size:18px; font-weight:800">${inn.battingTeam.toUpperCase()}</div>
                <div style="font-size:20px; font-weight:900">${inn.runs}/${inn.wickets} <small style="font-size:12px; opacity:0.8">(${formatOvers(inn.balls, m.ballsPerOver)})</small></div>
            </div>

            <!-- Batting Table -->
            <div style="background:#fff; border:1px solid #ddd; border-radius:8px; overflow:hidden">
                <table style="width:100%; border-collapse:collapse; font-size:12px">
                    <thead style="background:#f5f5f5; border-bottom:1px solid #ddd">
                        <tr>
                            <th style="padding:6px; text-align:left">Batsman</th>
                            <th style="padding:6px; text-align:center">R</th>
                            <th style="padding:6px; text-align:center">B</th>
                            <th style="padding:6px; text-align:center">SR</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${inn.batsmen.map(b => `
                        <tr style="border-bottom:1px solid #eee">
                            <td style="padding:6px; font-weight:700">${b.name} <span style="font-size:9px; color:#999; font-weight:400">(${b.dismissal || (b.notOut ? 'not out' : 'did not bat')})</span></td>
                            <td style="padding:6px; text-align:center; font-weight:800; color:#e61b4d">${b.runs || 0}</td>
                            <td style="padding:6px; text-align:center">${b.balls || 0}</td>
                            <td style="padding:6px; text-align:center; font-weight:600">${formatSR(b.runs || 0, b.balls || 0)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Bowling Table -->
            <div style="border:1px solid rgba(27,22,66,0.1); border-radius:8px; overflow:hidden">
                <table style="width:100%; border-collapse:collapse; font-size:11px; background:#fafafa">
                    <thead style="background:#1b1642; color:#fff">
                        <tr>
                            <th style="padding:4px; text-align:left">Bowler</th>
                            <th style="padding:4px; text-align:center">O</th>
                            <th style="padding:4px; text-align:center">M</th>
                            <th style="padding:4px; text-align:center">R</th>
                            <th style="padding:4px; text-align:center">W</th>
                            <th style="padding:4px; text-align:center">Econ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(inn.bowlers || []).map(b => `
                        <tr style="border-bottom:1px solid #eee">
                            <td style="padding:5px; font-weight:700">${b.name}</td>
                            <td style="padding:5px; text-align:center">${formatOvers(b.balls || 0)}</td>
                            <td style="padding:5px; text-align:center">${b.maidens || 0}</td>
                            <td style="padding:5px; text-align:center">${b.runs || 0}</td>
                            <td style="padding:5px; text-align:center; font-weight:900; color:#00c853">${b.wickets || 0}</td>
                            <td style="padding:5px; text-align:center; opacity:0.7">${formatEcon(b.runs || 0, b.balls || 0)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    });
    
    html += `</div>`;
    document.getElementById('fs-content').innerHTML = html;
    return true;
}

function toggleBroadcastSummary(tId) {
    const el = document.getElementById('broadcast-summary');
    if (el.style.display === 'block') {
        gsap.to(el, { opacity: 0, y: 100, duration: 0.5, onComplete: () => el.style.display = 'none' });
    } else {
        const success = renderTournamentSummaryOverlay(tId || tournId);
        if (success) {
            el.style.display = 'block';
            gsap.fromTo(el, { opacity: 0, y: 100 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' });
        } else {
            console.error("🚫 Cannot show summary: No tournament data found.");
        }
    }
}

function renderTournamentSummaryOverlay(tId) {
    const t = DB.getTournament(tId);
    if (!t) return false;
    
    const sortedTeams = Object.entries(t.standings || {}).map(([team, s]) => ({ team, ...s }))
        .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.nrr || 0) - (a.nrr || 0));
        
    let html = `
    <div class="sm-header">
        <h1 class="sm-title">TOURNAMENT SUMMARY</h1>
        <div class="sm-subtitle">${t.name?.toUpperCase() || 'OFFICIAL TOURNAMENT'}</div>
    </div>
    <div style="display:grid; grid-template-columns: 2fr 1.2fr; gap:40px">
        <div>
            <h3 style="border-bottom:2px solid #1b1642; display:inline-block; margin-bottom:15px">OFFICIAL STANDINGS</h3>
            <table style="width:100%; border-collapse:collapse; font-size:16px">
                <thead style="border-bottom:2px solid #1b1642">
                    <tr style="text-align:left">
                        <th style="padding:10px">Pos</th>
                        <th style="padding:10px">Team</th>
                        <th style="padding:10px; text-align:center">P</th>
                        <th style="padding:10px; text-align:center">W</th>
                        <th style="padding:10px; text-align:center">Pts</th>
                        <th style="padding:10px; text-align:right">NRR</th>
                    </tr>
                </thead>
                <tbody>
                    ${sortedTeams.map((s, i) => `
                    <tr style="border-bottom:1px solid #ddd">
                        <td style="padding:12px; font-weight:800">${i + 1}</td>
                        <td style="padding:12px; font-weight:900; color:#1b1642">${s.team}</td>
                        <td style="padding:12px; text-align:center">${s.played || 0}</td>
                        <td style="padding:12px; text-align:center; color:#00c853">${s.won || 0}</td>
                        <td style="padding:12px; text-align:center; font-weight:900">${s.points || 0}</td>
                        <td style="padding:12px; text-align:right; font-family:'JetBrains Mono', monospace; font-weight:700; color:${(s.nrr || 0) >= 0 ? '#00c853' : '#e61b4d'}">${(s.nrr || 0).toFixed(3)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>
        <div style="background:rgba(230,27,77,0.05); padding:20px; border-radius:12px; border:2px dashed rgba(230,27,77,0.3)">
            <h3 style="color:#e61b4d; margin-top:0">TOURNAMENT NOTES</h3>
            <p style="font-size:14px; line-height:1.6; color:#444">
                This summary represents the latest validated standings based on completed matches. 
                NRR is calculated using total runs and overs throughout the series.
            </p>
            <div style="margin-top:30px; padding-top:20px; border-top:1px solid #ddd; text-align:center">
                <div style="font-weight:900; font-size:24px; color:#1b1642">🏆</div>
                <div style="font-size:12px; font-weight:700; color:#aaa; margin-top:10px">SLCRICKPRO OFFICIAL DATA</div>
            </div>
        </div>
    </div>`;
    
    document.getElementById('sm-content').innerHTML = html;
    return true;
}

function formatSR(runs, balls) {
    if (!balls) return '0.0';
    return ((runs / balls) * 100).toFixed(1);
}

function formatEcon(runs, balls) {
    if (!balls) return '0.0';
    return ((runs / balls) * 6).toFixed(1);
}

function hideAllOverlays() {
    hideAllBroadcastOverlays();
}

function renderOverlay() {
    // Always read fresh match data from localStorage (DB)
    // Only fall back to socket light payload if DB has no live match
    const freshMatch = matchId ? DB.getMatch(matchId)
        : DB.getMatches().find(mt => mt.tournamentId === tournId && (mt.status === 'live' || mt.status === 'paused'));

    if (freshMatch && freshMatch.innings && freshMatch.innings[freshMatch.currentInnings]) {
        // We have full, fresh data — always prefer this over stale socket cache
        latestSocketScore = null; // clear stale socket cache
        return _renderOverlayFromMatch(freshMatch);
    }

    // No local data — try socket light payload or full match from socket as fallback
    if (latestSocketScore) {
        if (latestSocketScore.fullMatch) return _renderOverlayFromMatch(latestSocketScore.fullMatch);
        if (latestSocketScore.score) return renderOverlayFromLightPayload(latestSocketScore);
        // If it's the match object itself
        if (latestSocketScore.innings) return _renderOverlayFromMatch(latestSocketScore);
    }

    // Default Fallback (No match in progress or innings hasn't started)
    const container = document.getElementById('overlay-container');
    if (!container) return;
    
    const tourn = tournId ? DB.getTournament(tournId) : null;
    let title = "LIVE CRICKET BROADCAST";
    let sub = "Match will begin shortly";
    
    if (tourn) {
        title = tourn.name?.toUpperCase() || title;
        const venueText = tourn.ground || tourn.venue || "TBD VENUE";
        sub = `NEXT MATCH WILL SOON • ${venueText.toUpperCase()}`;
    } else if (matchId) {
        title = "LIVE MATCH";
        sub = "MATCH STARTING SOON";
    }

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="score-center-section" style="width: auto; padding: 10px 60px; margin: 0 auto;">
            <span class="score-clock" id="overlay-live-clock"></span>
            <div class="score-top" style="justify-content: center;">
                <span class="teams" style="font-size:24px;">${title}</span>
            </div>
            <div class="score-bottom" style="font-size: 15px; text-transform:uppercase;">${sub}</div>
        </div>
    `;
}

// ─── Full match renderer ─────────────────────────────────────────────────────
function _renderOverlayFromMatch(m) {
    const container = document.getElementById('overlay-container');
    if (!container) return;
    const curInn = m.innings[m.currentInnings];
    if (!curInn) { container.style.display = 'none'; return; }
    
    // Performance optimization: prevent unnecessary DOM re-renders
    const matchFingerprint = JSON.stringify(m);
    if (window._lastOverlayFingerprint === matchFingerprint && container.style.display !== 'none' && container.innerHTML !== '') return;
    window._lastOverlayFingerprint = matchFingerprint;

    container.style.display = 'flex';

    const t1Short = getShortName((curInn.battingTeam && curInn.battingTeam !== 'TBD') ? curInn.battingTeam : (m.team1 || 'T1'));
    const t2Short = getShortName((curInn.bowlingTeam && curInn.bowlingTeam !== 'TBD') ? curInn.bowlingTeam : (m.team2 || 'T2'));
    const score   = curInn.runs + '-' + curInn.wickets;
    const ov      = formatOvers(curInn.balls, m.ballsPerOver);

    const siIdx = (curInn.currentBatsmenIdx && typeof curInn.strikerIdx !== 'undefined') ? curInn.currentBatsmenIdx[curInn.strikerIdx] : null;
    const nsiIdx = (curInn.currentBatsmenIdx && typeof curInn.strikerIdx !== 'undefined') ? curInn.currentBatsmenIdx[curInn.strikerIdx === 0 ? 1 : 0] : null;

    const striker    = (typeof siIdx === 'number' && curInn.batsmen && curInn.batsmen[siIdx]) ? curInn.batsmen[siIdx] : { name:'Batsman 1', runs:0, balls:0 };
    const nonStriker = (typeof nsiIdx === 'number' && curInn.batsmen && curInn.batsmen[nsiIdx]) ? curInn.batsmen[nsiIdx] : { name:'Batsman 2', runs:0, balls:0 };
    
    const bowler     = (curInn.bowlers && typeof curInn.currentBowlerIdx !== 'undefined' && curInn.bowlers[curInn.currentBowlerIdx]) ? curInn.bowlers[curInn.currentBowlerIdx] : { name:'Bowler', wickets:0, runs:0, balls:0 };
    const b_overs    = formatOvers(bowler.balls || 0, m.ballsPerOver);

    const ballsToShow = (curInn.currentOver || []).slice(Math.max(0, (curInn.currentOver || []).length - 6));
    const recentBallsHtml = ballsToShow.map(b => {
        let cls='', lbl=b.runs||'0';
        if (b.wicket)              { cls='wicket';   lbl='W'; }
        else if (b.type==='six')   { cls='six';      lbl='6'; }
        else if (b.type==='four')  { cls='boundary'; lbl='4'; }
        else if (b.type==='wide')  { cls='extra';    lbl='Wd'; }
        else if (b.type==='noball'){ cls='extra';    lbl='Nb'; }
        else if (b.type==='bye')   { cls='extra';    lbl='B'+b.runs; }
        else if (b.type==='legbye'){ cls='extra';    lbl='Lb'+b.runs; }
        else if (b.runs===0)       { cls='dot';      lbl='0'; }
        else                       { cls='runs'; }
        return `<div class="recent-ball ${cls}">${lbl}</div>`;
    }).join('');

    const ovNum = Math.floor(curInn.balls / m.ballsPerOver);
    const phase = m.overs>20 ? (ovNum>=40?'P3':ovNum>=10?'P2':'P1') : (ovNum>=6?'P2':'P1');

    let bottomText;
    if (m.status === 'completed') {
        bottomText = `<span style="color:#fff; font-weight: 800; font-size: 15px;">🎉 ${m.result || 'MATCH COMPLETED'}</span>`;
    } else if (m.currentInnings===1 && m.innings[0]) {
        const need      = m.innings[0].runs + 1 - curInn.runs;
        const ballsLeft = (m.overs * m.ballsPerOver) - curInn.balls;
        bottomText = need>0  ? `NEED <span style="color:#fff">${need}</span> FROM <span style="color:#fff">${ballsLeft}</span> BALLS`
                   : need===0? `<span style="color:#fff">SCORES LEVEL</span>`
                             : `<span style="color:#fff; font-weight: 800; font-size: 15px;">🎉 WON BY ${m.playersPerSide-curInn.wickets-1} WICKETS</span>`;
    } else {
        bottomText = `TOSS: ${m.tossWinner||'TBD'} CHOSE TO ${(m.tossDecision||'bat').toUpperCase()}`;
    }

    // Compute RRR for 2nd innings
    let rrrText = '';
    if (m.currentInnings === 1 && m.innings[0]) {
        const need = m.innings[0].runs + 1 - curInn.runs;
        const ballsLeft = (m.overs * m.ballsPerOver) - curInn.balls;
        if (need > 0 && ballsLeft > 0) {
            const rrr = ((need / ballsLeft) * 6).toFixed(2);
            rrrText = `RRR ${rrr}`;
        }
    }

    // Detect if the last ball was a wicket for the flash
    const lastBall = (curInn.currentOver && curInn.currentOver.length > 0)
        ? curInn.currentOver[curInn.currentOver.length - 1]
        : null;
    const isWicketBall = lastBall && lastBall.wicket;

    container.innerHTML = `
        <div class="team-logo-box left">
            <div class="logo-circle">${t1Short}</div>
        </div>
        <div class="batsmen-section">
            <div class="player-row">
                <div class="player-name">
                    <span class="striker-mark">${siIdx === 0 ? '▶' : '&nbsp;'}</span>
                    ${striker.name}
                </div>
                <div class="player-value runs">${striker.runs || 0}</div>
                <div class="player-value balls">${striker.balls || 0}</div>
            </div>
            <div class="player-row">
                <div class="player-name">
                    <span class="striker-mark">${siIdx === 1 ? '▶' : '&nbsp;'}</span>
                    ${nonStriker.name}
                </div>
                <div class="player-value runs">${nonStriker.runs || 0}</div>
                <div class="player-value balls">${nonStriker.balls || 0}</div>
            </div>
        </div>
        <div class="score-center-section${isWicketBall ? ' wicket-flash' : ''}" id="score-pill">
            <span class="score-clock" id="overlay-live-clock"></span>
            <div class="score-top">
                <span class="teams">${t1Short} <span class="v">v</span> ${t2Short}</span>
                <div class="score-pill-main">
                    <span class="total">${score}</span>
                    <span class="phase">${phase}</span>
                    <span class="overs">${ov}</span>
                </div>
            </div>
            <div class="score-bottom">${bottomText}</div>
            ${rrrText ? `<span class="score-rrr">${rrrText}</span>` : ''}
        </div>
        <div class="bowler-section">
            <div class="player-row" style="margin-bottom: 2px;">
                <div class="player-name" style="color: #1a1a2e;">${bowler.name}</div>
                <div class="player-value runs">${bowler.wickets || 0}-${bowler.runs || 0}</div>
                <div class="player-value balls">${b_overs}</div>
            </div>
            <div class="recent-balls-row">${recentBallsHtml}</div>
        </div>
        <div class="team-logo-box right">
            <div class="logo-circle">${t2Short}</div>
        </div>
    `;

    // Re-start clock in the newly rendered pill
    const clockEl = document.getElementById('overlay-live-clock');
    if (clockEl) {
        const now = new Date();
        clockEl.textContent = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    }

    // Remove wicket-flash class after animation ends to allow re-triggering
    if (isWicketBall) {
        const pill = document.getElementById('score-pill');
        if (pill) {
            pill.addEventListener('animationend', () => pill.classList.remove('wicket-flash'), { once: true });
        }
    }
}

function renderOverlayFromLightPayload(payload) {
    if (payload && payload.fullMatch) return _renderOverlayFromMatch(payload.fullMatch);
    const cur = payload ? payload.score : null;
    if (!cur) return;
    document.getElementById('overlay-container').style.display = 'flex';
    const t1Name = cur.battingTeam || payload.team1 || "T1";
    const t2Name = cur.bowlingTeam || payload.team2 || "T2";
    const t1Short = getShortName(t1Name);
    const t2Short = getShortName(t2Name);
    const score = `${cur.runs || 0}-${cur.wickets || 0}`;
    const ov = formatOvers(cur.balls || 0, payload.ballsPerOver || 6);
    const striker = cur.striker || { name: 'Batsman 1', runs: 0, balls: 0 };
    const nonStriker = cur.nonStriker || { name: 'Batsman 2', runs: 0, balls: 0 };
    const bowler = cur.bowler || { name: 'Bowler', wickets: 0, runs: 0, balls: 0 };
    const b_overs = formatOvers(bowler.balls || 0, payload.ballsPerOver || 6);
    const recentBallsHtml = (cur.currentOver || []).map(b => {
        let cls = '';
        let lbl = b.runs || '0';
        if (b.wicket) { cls = 'wicket'; lbl = 'W'; }
        else if (b.type === 'six') { cls = 'six'; lbl = '6'; }
        else if (b.type === 'four') { cls = 'boundary'; lbl = '4'; }
        else if (b.type === 'wide') { cls = 'extra'; lbl = 'Wd'; }
        else if (b.type === 'noball') { cls = 'extra'; lbl = 'Nb'; }
        else if (b.type === 'bye') { cls = 'extra'; lbl = 'B' + (b.runs || 0); }
        else if (b.type === 'legbye') { cls = 'extra'; lbl = 'Lb' + (b.runs || 0); }
        else if ((b.runs || 0) === 0) { cls = 'dot'; lbl = '0'; }
        else { cls = 'runs'; }
        return `<div class="recent-ball ${cls}">${lbl}</div>`;
    }).join('');
    const html = `
        <div class="team-logo-box left"><div class="logo-circle">${t1Short}</div></div>
        <div class="batsmen-section">
            <div class="player-row"><div class="player-name">▶ ${striker.name}</div><div class="player-value runs">${striker.runs || 0}</div><div class="player-value balls">${striker.balls || 0}</div></div>
            <div class="player-row"><div class="player-name">&nbsp; ${nonStriker.name}</div><div class="player-value runs">${nonStriker.runs || 0}</div><div class="player-value balls">${nonStriker.balls || 0}</div></div>
        </div>
        <div class="score-center-section">
            <div class="score-top"><span class="teams">${t1Short} <span class="v">v</span> ${t2Short}</span><span class="total">${score}</span><span class="phase">LIVE</span><span class="overs">${ov}</span></div>
            <div class="score-bottom">SLCRICKPRO LIVE UPDATE</div>
        </div>
        <div class="bowler-section">
            <div class="player-row"><div class="player-name">${bowler.name}</div><div class="player-value runs">${bowler.wickets || 0}-${bowler.runs || 0}</div><div class="player-value balls">${b_overs}</div></div>
            <div class="recent-balls-row">${recentBallsHtml}</div>
        </div>
        <div class="team-logo-box right"><div class="logo-circle">${t2Short}</div></div>
    `;
    document.getElementById('overlay-container').innerHTML = html;

}

function renderTournamentStats(view) {
    const t = DB.getTournament(tournId);
    if (!t) return;
    let title = '';
    let contentHtml = '';

    if (view === 'fixtures') {
        title = 'TOURNAMENT FIXTURES & RESULTS';
        const matches = DB.getMatches().filter(m => m.tournamentId === tournId).slice(-5);
        if (!matches.length) contentHtml = '<div style="background:#fff;color:#000;padding:10px;border-radius:6px;">No fixtures found.</div>';
        else {
            contentHtml = `<div style="display:flex;flex-direction:column;gap:10px;width:100%;">
                ${matches.map(m => {
                    const s0 = m.innings[0] ? `${m.innings[0].runs}/${m.innings[0].wickets}` : '-';
                    const s1 = m.innings[1] ? `${m.innings[1].runs}/${m.innings[1].wickets}` : '-';
                    return `<div style="background:#fff;color:#000;padding:10px;border-radius:6px;display:flex;justify-content:space-between">
                        <b>${m.team1} (${s0})</b> vs <b>${m.team2} (${s1})</b> <span>${m.status.toUpperCase()}</span>
                    </div>`;
                }).join('')}
            </div>`;
        }
    } else if (view === 'batting') {
        title = 'TOP RUN SCORERS';
        const bats = getBestBatsmen(tournId).slice(0, 5);
        if (!bats.length) contentHtml = '<div style="background:#fff;color:#000;padding:10px;border-radius:6px;">No batting stats found.</div>';
        else {
            contentHtml = `<table style="width:100%;color:#000;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden">
                <thead style="background:#f1f1f1"><tr><th style="padding:10px;text-align:left">Player</th><th style="padding:10px;text-align:left">Team</th><th style="padding:10px">Runs</th><th style="padding:10px">SR</th></tr></thead>
                <tbody>
                    ${bats.map(b => `<tr><td style="padding:10px;border-top:1px solid #ccc"><b>${b.name}</b></td><td style="padding:10px;border-top:1px solid #ccc">${b.team}</td><td style="padding:10px;border-top:1px solid #ccc;text-align:center">${b.runs}</td><td style="padding:10px;border-top:1px solid #ccc;text-align:center">${b.sr}</td></tr>`).join('')}
                </tbody>
            </table>`;
        }
    } else if (view === 'bowling') {
        title = 'TOP WICKET TAKERS';
        const bowls = getBestBowlers(tournId).slice(0, 5);
        if (!bowls.length) contentHtml = '<div style="background:#fff;color:#000;padding:10px;border-radius:6px;">No bowling stats found.</div>';
        else {
            contentHtml = `<table style="width:100%;color:#000;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden">
                <thead style="background:#f1f1f1"><tr><th style="padding:10px;text-align:left">Player</th><th style="padding:10px;text-align:left">Team</th><th style="padding:10px">Wickets</th><th style="padding:10px">Econ</th></tr></thead>
                <tbody>
                    ${bowls.map(b => `<tr><td style="padding:10px;border-top:1px solid #ccc"><b>${b.name}</b></td><td style="padding:10px;border-top:1px solid #ccc">${b.team}</td><td style="padding:10px;border-top:1px solid #ccc;text-align:center"><b>${b.wickets}</b></td><td style="padding:10px;border-top:1px solid #ccc;text-align:center">${b.econ}</td></tr>`).join('')}
                </tbody>
            </table>`;
        }
    } else if (view === 'matchstats') {
        const m = matchId ? DB.getMatch(matchId) : null;
        if (!m) {
            contentHtml = '<div style="background:#fff;color:#000;padding:20px;border-radius:6px;text-align:center">No active match to show statistics for.</div>';
        } else {
            title = 'CURRENT MATCH SUMMARY';
            const inn0 = m.innings[0];
            const inn1 = m.innings[1];
            
            const renderInnStat = (inn, lbl) => {
                if(!inn) return `<div style="padding:10px;text-align:center;color:#fff;background:rgba(255,255,255,0.1);border-radius:6px;margin-bottom:10px">Yet to bat</div>`;
                const rr = formatCRR(inn.runs, inn.balls);
                const ext = (inn.extras.wides||0) + (inn.extras.noBalls||0) + (inn.extras.byes||0) + (inn.extras.legByes||0);
                return `
                <div style="background:#fff;padding:16px;border-radius:8px;margin-bottom:12px;color:#000">
                    <div style="display:flex;justify-content:space-between;font-weight:900;margin-bottom:8px;font-size:18px">
                        <span>${inn.battingTeam}</span>
                        <span style="color:#e61b4d">${inn.runs}/${inn.wickets} <span style="font-size:14px;color:#666">(${formatOvers(inn.balls, m.ballsPerOver)} ov)</span></span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:14px;color:#444;border-top:1px solid #eee;padding-top:8px">
                        <span>Run Rate: <b>${rr}</b></span>
                        <span>Extras: <b style="color:#e61b4d">${ext}</b></span>
                    </div>
                </div>`;
            };
            
            contentHtml = `
            <div style="width:100%;text-align:left">
                <div style="font-size:14px;text-align:center;color:#fff;margin-bottom:15px;letter-spacing:1px;text-transform:uppercase">${m.team1} vs ${m.team2} · ${m.venue || 'Home Ground'}</div>
                ${renderInnStat(inn0, '1st Innings')}
                ${renderInnStat(inn1, '2nd Innings')}
            </div>`;
        }
    } else if (view === 'match_players') {
        const m = matchId ? DB.getMatch(matchId) : null;
        if (!m) {
            contentHtml = '<div style="background:#fff;color:#000;padding:20px;border-radius:6px;text-align:center">No active match to show players for.</div>';
        } else {
            title = 'MATCH PLAYERS (Select to Pop-up)';
            const inn0 = m.innings[0];
            const inn1 = m.innings[1];
            
            const renderTable = (inn, idx) => {
                if(!inn) return '';
                let html = `<div style="background:#fff;color:#000;padding:10px;border-radius:6px;margin-bottom:10px;">
                    <h3 style="margin:0 0 10px 0">${inn.battingTeam} Batters</h3>
                    <table style="width:100%;border-collapse:collapse;margin-bottom:15px">
                        <thead><tr style="background:#eee"><th style="padding:5px;text-align:left">Name</th><th style="padding:5px">R</th><th style="padding:5px">B</th></tr></thead>
                        <tbody>`;
                inn.batsmen.forEach((b, pi) => {
                    html += `<tr class="player-row-clickable" onclick="showSidePlayerDetails('batsman', ${idx}, ${pi})">
                        <td style="padding:5px;border-top:1px solid #ddd">${b.name}</td>
                        <td style="padding:5px;border-top:1px solid #ddd;text-align:center">${b.runs||0}</td>
                        <td style="padding:5px;border-top:1px solid #ddd;text-align:center">${b.balls||0}</td>
                    </tr>`;
                });
                html += `</tbody></table>
                    <h3 style="margin:0 0 10px 0">${inn.bowlingTeam} Bowlers</h3>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead><tr style="background:#eee"><th style="padding:5px;text-align:left">Name</th><th style="padding:5px">W</th><th style="padding:5px">R</th></tr></thead>
                        <tbody>`;
                inn.bowlers.forEach((b, pi) => {
                    html += `<tr class="player-row-clickable" onclick="showSidePlayerDetails('bowler', ${idx}, ${pi})">
                        <td style="padding:5px;border-top:1px solid #ddd">${b.name}</td>
                        <td style="padding:5px;border-top:1px solid #ddd;text-align:center"><b>${b.wickets||0}</b></td>
                        <td style="padding:5px;border-top:1px solid #ddd;text-align:center">${b.runs||0}</td>
                    </tr>`;
                });
                html += `</tbody></table></div>`;
                return html;
            };
            
            contentHtml = `<div style="width:100%;text-align:left;">
                ${renderTable(inn0, 0)}
                ${renderTable(inn1, 1)}
            </div>`;
        }
    }

    document.getElementById('overlay-popup').innerHTML = `
        <div style="font-size:24px;font-weight:900;color:#00e676;margin-bottom:15px;text-align:center">${title}</div>
        ${contentHtml}
        <div style="text-align:center;margin-top:15px">
            <button onclick="closeOverlayPopup()" style="background:#333;color:#fff;border:none;padding:5px 15px;border-radius:4px;cursor:pointer">Close</button>
        </div>
    `;
}

function showSidePlayerDetails(type, innIdx, playerIdx) {
    if (!matchId) return;
    const m = DB.getMatch(matchId);
    if (!m || !m.innings[innIdx]) return;
    
    const inn = m.innings[innIdx];
    const sp = document.getElementById('side-player-popup');
    
    // Auto-close main modal for better view
    closeOverlayPopup();
    
    let html = '';
    if (type === 'batsman') {
        const b = inn.batsmen[playerIdx];
        if(!b) return;
        const sr = b.balls ? ((b.runs/b.balls)*100).toFixed(1) : '0.0';
        html = `
            <div style="font-size:12px;text-transform:uppercase;color:#e61b4d;font-weight:900;margin-bottom:8px">BATSMAN</div>
            <div style="font-size:24px;font-weight:900;text-transform:uppercase;margin-bottom:15px;line-height:1">${b.name}</div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.2);padding-top:15px">
                <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#00e676">${b.runs||0}</div><div style="font-size:10px;color:#aaa">RUNS</div></div>
                <div style="text-align:center"><div style="font-size:20px;font-weight:800">${b.balls||0}</div><div style="font-size:10px;color:#aaa">BALLS</div></div>
                <div style="text-align:center"><div style="font-size:20px;font-weight:800">${b.fours||0}/${b.sixes||0}</div><div style="font-size:10px;color:#aaa">4s / 6s</div></div>
                <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#fff">${sr}</div><div style="font-size:10px;color:#aaa">SR</div></div>
            </div>
            <div style="margin-top:15px;font-size:11px;color:#ccc;text-align:right">Status: ${b.dismissal || (b.notOut?'Not Out':'At Crease')}</div>
        `;
    } else {
        const b = inn.bowlers[playerIdx];
        if(!b) return;
        const econ = b.balls ? ((b.runs/b.balls)*6).toFixed(1) : '0.0';
        html = `
            <div style="font-size:12px;text-transform:uppercase;color:#e61b4d;font-weight:900;margin-bottom:8px">BOWLER</div>
            <div style="font-size:24px;font-weight:900;text-transform:uppercase;margin-bottom:15px;line-height:1">${b.name}</div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.2);padding-top:15px">
                <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#00e676">${formatOvers(b.balls||0, m.ballsPerOver)}</div><div style="font-size:10px;color:#aaa">OVERS</div></div>
                <div style="text-align:center"><div style="font-size:20px;font-weight:800">${b.maidens||0}</div><div style="font-size:10px;color:#aaa">MDNS</div></div>
                <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:#e61b4d">${b.runs||0}</div><div style="font-size:10px;color:#aaa">RUNS</div></div>
                <div style="text-align:center"><div style="font-size:20px;font-weight:800">${b.wickets||0}</div><div style="font-size:10px;color:#aaa">WKTS</div></div>
            </div>
            <div style="margin-top:15px;text-align:right"><div style="display:inline-block;background:#e61b4d;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:800">ECON: ${econ}</div></div>
        `;
    }
    
    sp.innerHTML = html;
    sp.style.display = 'block';
}

function hideSidePlayer() {
    const sp = document.getElementById('side-player-popup');
    if(sp) sp.style.display = 'none';
}

// Helpers for stats
function getBestBatsmen(tournId) {
  const matches = DB.getMatches().filter(m => m.tournamentId === tournId && m.status === 'completed');
  const playerMap = {};
  matches.forEach(m => {
    m.innings.forEach((inn, ii) => {
      if (!inn) return;
      inn.batsmen.forEach(b => {
        if (!playerMap[b.name]) playerMap[b.name] = { name: b.name, team: ii === 0 ? m.battingFirst : m.fieldingFirst, runs: 0, balls: 0 };
        playerMap[b.name].runs += b.runs || 0;
        playerMap[b.name].balls += b.balls || 0;
      });
    });
  });
  return Object.values(playerMap).map(p => ({ ...p, sr: p.balls ? ((p.runs/p.balls)*100).toFixed(1) : '0.0' })).sort((a, b) => b.runs - a.runs);
}

function getBestBowlers(tournId) {
  const matches = DB.getMatches().filter(m => m.tournamentId === tournId && m.status === 'completed');
  const playerMap = {};
  matches.forEach(m => {
    m.innings.forEach((inn, ii) => {
      if (!inn) return;
      inn.bowlers.forEach(b => {
        if (!playerMap[b.name]) playerMap[b.name] = { name: b.name, team: ii === 0 ? m.fieldingFirst : m.battingFirst, wickets: 0, balls: 0, runs: 0 };
        playerMap[b.name].wickets += b.wickets || 0;
        playerMap[b.name].balls += b.balls || 0;
        playerMap[b.name].runs += b.runs || 0;
      });
    });
  });
  return Object.values(playerMap).map(p => ({
    ...p,
    overs: formatOvers(p.balls),
    econ: p.balls ? ((p.runs/p.balls)*6).toFixed(1) : '0.0',
  })).sort((a, b) => b.wickets - a.wickets || parseFloat(a.econ) - parseFloat(b.econ));
}


function showTeamRosterGraphic(data) {
    const { teamName, players } = data;
    let html = `
        <div class="overlay-container show" id="overlay-team">
            <div class="overlay-card team-card">
                <div class="overlay-header">
                    <div class="overlay-title">${teamName}</div>
                    <div class="overlay-subtitle">TEAM ROSTER</div>
                </div>
                <div class="overlay-body roster-grid">
    `;
    
    if (players && players.length > 0) {
        players.forEach((p, index) => {
            const src = (p && p.photo && String(p.photo).trim()) ? p.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
            html += `
                <div class="roster-item" style="animation: fadeInUp 0.4s ease forwards; animation-delay: ${index * 0.05}s">
                    <div class="roster-photo">
                        <img src="${src}" alt="" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                    </div>
                    <div class="roster-info">
                        <div class="roster-name">${p.name}</div>
                        <div class="roster-role">${(p.role || 'Player').toUpperCase()}</div>
                    </div>
                </div>
            `;
        });
    } else {
        html += '<div style="grid-column: span 2; padding: 20px; text-align: center; color: rgba(255,255,255,0.5);">No registered players in roster</div>';
    }
    
    html += '</div></div></div>';
    renderBroadcastOverlay(html);
}

function showTeamCardGraphic(data) {
    const { teamName, players } = data;
    if (!players || players.length === 0) return;

    const accentColor = '#e61b4d';
    const accentAlt = '#7c4dff';

    // Build 11-player grid (4-4-3 layout like the reference image)
    const playersHtml = players.slice(0, 11).map((p, idx) => {
        const src = (p.photo && String(p.photo).trim()) ? p.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
        const isCaptain = (p.role && p.role.toLowerCase().includes('captain'));
        return `
        <div class="tc-player" style="opacity:0; transform:scale(0.8) translateY(20px)">
            <div class="tc-photo-wrap">
                <img src="${src}" class="tc-photo" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                <div class="tc-photo-gradient"></div>
                ${isCaptain ? `<div class="tc-captain-badge">C</div>` : ''}
            </div>
            <div class="tc-name">${(p.name || 'Player').split(' ').slice(-1)[0].toUpperCase()}</div>
            <div class="tc-fullname">${(p.name || 'Player').toUpperCase()}</div>
        </div>`;
    }).join('');

    const html = `
    <div class="overlay-container show" id="overlay-team-squad" style="display:flex; justify-content:center; align-items:center;
        background:linear-gradient(160deg, rgba(8,12,28,0.97) 0%, rgba(20,5,40,0.97) 100%); backdrop-filter:blur(12px);">
        <style>
            #overlay-team-squad {
                font-family: 'Outfit', 'Inter', sans-serif;
            }
            .tc-main {
                width: 96%; max-width: 1400px;
                display: flex; flex-direction: column; align-items: center; gap: 24px;
            }
            .tc-header {
                width: 100%; text-align: center; position: relative;
                border-bottom: 3px solid ${accentColor};
                padding-bottom: 16px;
            }
            .tc-header-label {
                font-size: 14px; font-weight: 900; color: ${accentColor};
                letter-spacing: 6px; text-transform: uppercase; margin-bottom: 6px;
            }
            .tc-header-team {
                font-size: 56px; font-weight: 950; color: #fff;
                text-transform: uppercase; line-height: 1;
                text-shadow: 0 4px 20px rgba(0,0,0,0.6);
            }
            .tc-grid {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                gap: 16px; width: 100%;
            }
            /* Row 1: 6 players */
            .tc-player:nth-child(-n+6) { grid-column: span 1; }
            /* Row 2: next 5 players — center them */
            .tc-player:nth-child(n+7) { grid-column: span 1; }
            .tc-player:nth-child(7) { grid-column-start: 1; }
            /* Override: 5 in second row, offset by half column */
            @supports (display: grid) {
                .tc-grid { grid-template-columns: repeat(12, 1fr); }
                .tc-player { grid-column: span 2; }
                .tc-player:nth-child(7) { grid-column-start: 2; }
                .tc-player:nth-child(n+7) { grid-column: span 2; }
            }
            .tc-player {
                display: flex; flex-direction: column; align-items: center;
                transition: 0.3s;
            }
            .tc-photo-wrap {
                position: relative; width: 100%; padding-bottom: 120%;
                border-radius: 14px; overflow: hidden;
                background: rgba(255,255,255,0.05);
                box-shadow: 0 8px 30px rgba(0,0,0,0.7);
                border: 2px solid rgba(255,255,255,0.12);
            }
            .tc-photo {
                position: absolute; top: 0; left: 0;
                width: 100%; height: 100%; object-fit: cover;
            }
            .tc-photo-gradient {
                position: absolute; bottom: 0; left: 0; right: 0; height: 45%;
                background: linear-gradient(transparent, rgba(0,0,0,0.85));
            }
            .tc-captain-badge {
                position: absolute; top: 8px; right: 8px;
                width: 28px; height: 28px; background: ${accentColor};
                border-radius: 50%; display: flex; align-items: center; justify-content: center;
                font-size: 13px; font-weight: 900; color: #fff;
                box-shadow: 0 4px 12px rgba(230,27,77,0.6);
            }
            .tc-name {
                margin-top: 8px; font-size: 13px; font-weight: 900;
                color: #fff; text-align: center; text-transform: uppercase;
                letter-spacing: 0.5px; line-height: 1.1;
            }
            .tc-fullname {
                font-size: 9px; font-weight: 700; color: rgba(255,255,255,0.4);
                text-align: center; letter-spacing: 0.5px;
            }
            .tc-footer {
                width: 100%; text-align: center;
                font-size: 13px; font-weight: 900; color: rgba(255,255,255,0.3);
                letter-spacing: 6px; text-transform: uppercase;
                border-top: 1px solid rgba(255,255,255,0.06); padding-top: 12px;
            }
        </style>
        <div class="tc-main">
            <div class="tc-header">
                <div class="tc-header-label">PLAYING XI</div>
                <div class="tc-header-team">${teamName.toUpperCase()}</div>
            </div>
            <div class="tc-grid">
                ${playersHtml}
            </div>
            <div class="tc-footer">SLCRICKPRO LIVE PRODUCTION</div>
        </div>
    </div>`;

    renderBroadcastOverlay(html);

    // Staggered GSAP entrance
    setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to('.tc-player', {
                opacity: 1, scale: 1, y: 0,
                duration: 0.7, stagger: 0.06, ease: 'back.out(1.4)'
            });
        } else {
            document.querySelectorAll('.tc-player').forEach(el => {
                el.style.opacity = '1'; el.style.transform = 'none';
            });
        }
    }, 100);
}

function showBatterProfilesCinema(data) {
    const { profiles } = data;
    if (!profiles || profiles.length === 0) return;
    
    // Clear old ones
    document.querySelectorAll('.batter-cinema-left').forEach(el => el.remove());

    const html = `
    <div id="batter-cinema-dual" style="position:fixed; left:40px; top:50%; transform:translateY(-50%); display:flex; gap:20px; z-index:15500; font-family:'Outfit', sans-serif">
        ${profiles.map((item, idx) => {
            const { name, profile: p, stats: s, age } = item;
            const stats = s || { runs: 0, balls: 0, sixes: 0 };
            const src = (p && p.photo) ? p.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
            const accent = (idx === 0) ? '#00e676' : '#3b82f6';
            const bg = (idx === 0) 
                ? 'linear-gradient(135deg, rgba(8, 62, 33, 0.98) 0%, rgba(0,0,0,1) 100%)'
                : 'linear-gradient(135deg, rgba(7, 30, 62, 0.98) 0%, rgba(0,0,0,1) 100%)';
            
            return `
            <div class="batter-cinema-left" style="width:280px; background:${bg}; border-left:10px solid ${accent}; border-radius:0 30px 30px 0; overflow:hidden; box-shadow:0 30px 60px rgba(0,0,0,0.8)">
                <div style="height:6px; background:${accent}; opacity:0.3"></div>
                <div style="padding:25px 20px">
                    <div style="color:${accent}; font-weight:900; letter-spacing:3px; font-size:10px; text-transform:uppercase; margin-bottom:15px">
                        ${idx === 0 ? 'STRIKER' : 'NON-STRIKER'}
                    </div>
                    <div style="width:100%; height:250px; background:rgba(255,255,255,0.05); border-radius:15px; overflow:hidden; margin-bottom:20px">
                        <img src="${src}" style="width:100%; height:100%; object-fit:cover" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                    </div>
                    <div style="text-align:left">
                        <div style="font-size:24px; font-weight:950; color:#fff; text-transform:uppercase; line-height:1">${(name||'PLAYER').split(' ')[0]}</div>
                        <div style="font-size:32px; font-weight:950; color:${accent}; text-transform:uppercase; line-height:1.1; margin-bottom:5px">${(name||'PROFILE').split(' ').slice(1).join(' ')}</div>
                    </div>
                    <div style="margin-top:20px; display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.1); padding-top:15px">
                        <div style="text-align:center"><div style="font-size:22px; font-weight:900; color:#fff">${stats.runs || 0}</div><div style="font-size:9px; font-weight:800; color:#aaa; letter-spacing:1px">RUNS</div></div>
                        <div style="text-align:center"><div style="font-size:22px; font-weight:900; color:#fff">${stats.balls || 0}</div><div style="font-size:9px; font-weight:800; color:#aaa; letter-spacing:1px">BALLS</div></div>
                        <div style="text-align:center"><div style="font-size:22px; font-weight:900; color:${accent}">${stats.sixes || 0}</div><div style="font-size:9px; font-weight:800; color:#aaa; letter-spacing:1px">SIXES</div></div>
                    </div>
                </div>
            </div>
            `;
        }).join('')}
    </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'active-broadcast-wrapper';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    if (typeof gsap !== 'undefined') {
        gsap.from('.batter-cinema-left', { x: -600, opacity: 0, stagger: 0.2, duration: 1, ease: 'expo.out' });
    }

    activeBroadcastOverlayId = setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to('#batter-cinema-dual', { x: -600, opacity:0, duration:0.8, onComplete: () => wrapper.remove() });
        } else wrapper.remove();
    }, 12000);
}


function showStrikerProfileLeft(data, label = 'STRIKER') {
    if (!data) return;
    const { name, profile: p, stats: s, age } = data;
    const stats = s || { runs: 0, balls: 0, sixes: 0 };
    let src = (p && p.photo && String(p.photo).trim()) ? p.photo : null;
    if (!src && p && p.playerId) src = localStorage.getItem('cricpro_photo_' + p.playerId);
    if (!src) src = OVERLAY_DEFAULT_PLAYER_PHOTO;
    
    // UI Artifact removal if exists
    const old = document.getElementById('striker-profile-left');
    if(old) old.remove();

    // Custom Label Support (STRIKER / NON-STRIKER)
    const displayLabel = label === 'NON-STRIKER' ? 'NON-STRIKER TRACKER' : 'PLAYER TRACKER';
    const accentColor = label === 'NON-STRIKER' ? '#3b82f6' : '#00e676';
    const bgGradient = label === 'NON-STRIKER' 
        ? 'linear-gradient(135deg, rgba(7, 30, 62, 0.98) 0%, rgba(0,0,0,1) 100%)'
        : 'linear-gradient(135deg, rgba(8, 62, 33, 0.98) 0%, rgba(0,0,0,1) 100%)';
    
    // Premium Vertical Design on the Left
    const htmlSnippet = `
    <div id="striker-profile-left" style="position:fixed; left:40px; top:50%; transform:translateY(-50%); width:330px; 
        background: ${bgGradient}; 
        border-left: 12px solid ${accentColor}; border-radius: 0 40px 40px 0; overflow:hidden; z-index:15000;
        box-shadow: 0 40px 100px rgba(0,0,0,0.9), 20px 0 50px ${accentColor}11; font-family:'Outfit', sans-serif">
        
        <div style="height:10px; background: repeating-linear-gradient(90deg, ${accentColor} 0px, ${accentColor} 10px, transparent 10px, transparent 20px); opacity:0.3"></div>
        
        <div style="padding:40px 30px">
            <div style="color:${accentColor}; font-weight:900; letter-spacing:4px; font-size:12px; text-transform:uppercase; margin-bottom:20px; opacity:0.8">
                ${displayLabel}
            </div>

            <!-- PLAYER PHOTO -->
            <div style="position:relative; width:100%; height:350px; background:rgba(255,255,255,0.05); border-radius:20px; overflow:hidden; margin-bottom:30px">
                <img src="${src}" style="width:100%; height:100%; object-fit:cover" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 100%)"></div>
            </div>

            <!-- NAME & AGE -->
            <div style="text-align:left">
                <div style="font-size:36px; font-weight:950; color:#fff; text-transform:uppercase; line-height:1; letter-spacing:1px">${(name||'PLAYER').split(' ')[0]}</div>
                <div style="font-size:42px; font-weight:950; color:${accentColor}; text-transform:uppercase; line-height:1.1; margin-bottom:5px">${(name||'PROFILE').split(' ').slice(1).join(' ')}</div>
                ${age ? `<div style="font-size:18px; font-weight:800; color:rgba(255,255,255,0.5); letter-spacing:2px">AGE: ${age} YEARS</div>` : ''}
            </div>

            <div style="margin-top:30px; width:60px; height:6px; background:${accentColor}; border-radius:3px"></div>
            
            <!-- MINI STATS -->
            <div style="margin-top:40px; display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.1); padding-top:25px">
                <div style="text-align:center"><div style="font-size:28px; font-weight:900; color:#fff">${stats.runs || 0}</div><div style="font-size:11px; font-weight:800; color:#aaa; letter-spacing:1px">RUNS</div></div>
                <div style="text-align:center"><div style="font-size:28px; font-weight:900; color:#fff">${stats.balls || 0}</div><div style="font-size:11px; font-weight:800; color:#aaa; letter-spacing:1px">BALLS</div></div>
                <div style="text-align:center"><div style="font-size:28px; font-weight:900; color:${accentColor}">${stats.sixes || 0}</div><div style="font-size:11px; font-weight:800; color:#aaa; letter-spacing:1px">SIXES</div></div>
            </div>
        </div>

        <div style="height:40px; background:${accentColor}05; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.2); font-size:10px; font-weight:800; letter-spacing:3px">
            LIVE PRODUCTION
        </div>
    </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'active-broadcast-wrapper';
    wrapper.innerHTML = htmlSnippet;
    document.body.appendChild(wrapper);

    // GSAP Entrance
    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#striker-profile-left', 
            { x: -500, opacity: 0, skewX: 10 }, 
            { x: 0, opacity: 1, skewX: 0, duration: 1.2, ease: "expo.out" }
        );
    }
    
    // Auto-hide after 12 seconds
    if (window._strikerTO) clearTimeout(window._strikerTO);
    window._strikerTO = setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to('#striker-profile-left', { x: -500, opacity:0, duration:0.8, ease:"expo.in", onComplete: () => wrapper.remove() });
        } else wrapper.remove();
    }, 12000);
}

function showPartnershipGraphicCinema(data) {
    const { player1, player2, p1Profile, p2Profile, runs, balls, teamName, wicketNum } = data;
    const src1 = (p1Profile && p1Profile.photo) ? p1Profile.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
    const src2 = (p2Profile && p2Profile.photo) ? p2Profile.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;

    const html = `
    <div id="partnership-cinema" style="position:fixed; top:0; left:0; width:100%; height:100%; z-index:16000; font-family:'Outfit', sans-serif">
        <!-- PLAYER 1 (Left Wing) -->
        <div id="p-left-card" style="position:absolute; left:40px; bottom:120px; width:280px; background:rgba(0,0,0,0.9); border-left:8px solid #00e676; border-radius:0 20px 20px 0; overflow:hidden">
            <div style="height:220px; width:100%"><img src="${src1}" style="width:100%; height:100%; object-fit:cover" /></div>
            <div style="padding:15px; text-align:center; color:#fff; font-size:18px; font-weight:900; background:#00e67611">${player1.toUpperCase()}</div>
        </div>

        <!-- PLAYER 2 (Right Wing) -->
        <div id="p-right-card" style="position:absolute; right:40px; bottom:120px; width:280px; background:rgba(0,0,0,0.9); border-right:8px solid #00e676; border-radius:20px 0 0 20px; overflow:hidden">
            <div style="height:220px; width:100%"><img src="${src2}" style="width:100%; height:100%; object-fit:cover" /></div>
            <div style="padding:15px; text-align:center; color:#fff; font-size:18px; font-weight:900; background:#00e67611">${player2.toUpperCase()}</div>
        </div>

        <!-- CENTER STATS (Elevated Bar) -->
        <div id="p-center-bar" style="position:absolute; left:50%; bottom:100px; transform:translateX(-50%); width:600px; 
            background:linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(10,12,20,0.95) 15%, rgba(10,12,20,0.95) 85%, rgba(0,0,0,0) 100%);
            padding:30px; text-align:center; border-bottom:3px solid #00e676; backdrop-filter:blur(10px)">
            
            <div style="color:#00e676; font-size:12px; font-weight:900; letter-spacing:5px; margin-bottom:10px; text-transform:uppercase">
                ${wicketNum || '3RD'} WICKET PARTNERSHIP
            </div>
            <div style="display:flex; align-items:center; justify-content:center; gap:30px">
                <div style="font-size:72px; font-weight:950; color:#fff; line-height:1">${runs}</div>
                <div style="width:1px; height:50px; background:rgba(255,255,255,0.1)"></div>
                <div style="text-align:left">
                    <div style="font-size:24px; font-weight:950; color:#fff">${balls} <span style="font-size:14px; opacity:0.5; font-weight:700">BALLS</span></div>
                    <div style="font-size:14px; font-weight:800; color:#00e676; letter-spacing:1px">${teamName.toUpperCase()}</div>
                </div>
            </div>
        </div>
    </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'active-broadcast-wrapper';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    // Dual Animation Intro
    if (typeof gsap !== 'undefined') {
        gsap.from('#p-left-card', { x: -400, opacity: 0, skewX: 10, duration: 1, ease: 'expo.out' });
        gsap.from('#p-right-card', { x: 400, opacity: 0, skewX: -10, duration: 1, ease: 'expo.out' });
        gsap.from('#p-center-bar', { y: 150, opacity: 0, duration: 1, delay: 0.3, ease: 'back.out(1.7)' });
    }

    activeBroadcastOverlayId = setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to('#partnership-cinema', { opacity: 0, y: 50, duration: 0.8, onComplete: () => wrapper.remove() });
        } else wrapper.remove();
    }, 10000);
}

let activeBroadcastOverlayId = null;
function renderBroadcastOverlay(html) {
    hideAllBroadcastOverlays();
    hideBroadcastOverlay();
    const div = document.createElement('div');
    div.id = 'active-broadcast-wrapper';
    div.innerHTML = html;
    div.style.position = 'fixed';
    div.style.top = '0';
    div.style.left = '0';
    div.style.width = '100%';
    div.style.height = '100%';
    div.style.pointerEvents = 'none';
    div.style.zIndex = '13000'; // Make sure it sits on top!
    document.body.appendChild(div);
    
    // Auto hide after 8 seconds
    activeBroadcastOverlayId = setTimeout(() => hideBroadcastOverlay(), 8000);
}

function hideBroadcastOverlay() {
    if (activeBroadcastOverlayId) clearTimeout(activeBroadcastOverlayId);
    const el = document.getElementById('active-broadcast-wrapper');
    if (el) {
        gsap.to(el, { opacity:0, duration:0.5, onComplete: () => el.remove() });
    }
}

function showBowlerProfileGraphic(data) {
    if (!data || !data.name) return;
    const { name, profile: p, stats: s } = data;
    const stats = s || { wickets: 0, runs: 0, balls: 0, overs: '0.0', econ: '0.00' };
    let src = (p && p.photo && String(p.photo).trim()) ? p.photo : null;
    if (!src && p && p.playerId) src = localStorage.getItem('cricpro_photo_' + p.playerId);
    if (!src) src = OVERLAY_DEFAULT_PLAYER_PHOTO;

    // Premium Color Palette for Bowler: Deep Purple Accent
    const accentColor = '#8b5cf6';
    const bgGradient = 'linear-gradient(135deg, rgba(29, 13, 62, 0.98) 0%, rgba(0,0,0,1) 100%)';

    const html = `
    <div id="bowler-profile-left" style="position:fixed; left:40px; top:50%; transform:translateY(-50%); width:330px; 
        background: ${bgGradient}; 
        border-left: 12px solid ${accentColor}; border-radius: 0 40px 40px 0; overflow:hidden; z-index:15000;
        box-shadow: 0 40px 100px rgba(0,0,0,0.9), 20px 0 50px ${accentColor}11; font-family:'Outfit', sans-serif">
        
        <div style="height:10px; background: repeating-linear-gradient(90deg, ${accentColor} 0px, ${accentColor} 10px, transparent 10px, transparent 20px); opacity:0.3"></div>
        
        <div style="padding:40px 30px">
            <div style="color:${accentColor}; font-weight:900; letter-spacing:4px; font-size:12px; text-transform:uppercase; margin-bottom:20px; opacity:0.8">
                BOWLER TRACKER
            </div>

            <!-- PLAYER PHOTO -->
            <div style="position:relative; width:100%; height:350px; background:rgba(255,255,255,0.05); border-radius:20px; overflow:hidden; margin-bottom:30px">
                <img src="${src}" style="width:100%; height:100%; object-fit:cover" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.4) 100%)"></div>
            </div>

            <!-- NAME & DETAILS -->
            <div style="text-align:left">
                <div style="font-size:36px; font-weight:950; color:#fff; text-transform:uppercase; line-height:1; letter-spacing:1px">${(name||'PLAYER').split(' ')[0]}</div>
                <div style="font-size:42px; font-weight:950; color:${accentColor}; text-transform:uppercase; line-height:1.1; margin-bottom:5px">${(name||'PROFILE').split(' ').slice(1).join(' ')}</div>
                <div style="font-size:18px; font-weight:800; color:rgba(255,255,255,0.5); letter-spacing:1px">
                    ${stats.wickets} WICKETS / ${stats.runs} RUNS
                </div>
            </div>

            <div style="margin-top:30px; width:60px; height:6px; background:${accentColor}; border-radius:3px"></div>
            
            <!-- MINI STATS BAR -->
            <div style="margin-top:40px; display:flex; justify-content:space-between; border-top:1px solid rgba(255,255,255,0.1); padding-top:25px">
                <div style="text-align:center"><div style="font-size:28px; font-weight:900; color:#fff">${stats.overs}</div><div style="font-size:11px; font-weight:800; color:#aaa; letter-spacing:1px">OVERS</div></div>
                <div style="text-align:center"><div style="font-size:28px; font-weight:900; color:#fff">${stats.econ}</div><div style="font-size:11px; font-weight:800; color:#aaa; letter-spacing:1px">ECON</div></div>
                <div style="text-align:center"><div style="font-size:28px; font-weight:900; color:${accentColor}">${stats.maidens || 0}</div><div style="font-size:11px; font-weight:800; color:#aaa; letter-spacing:1px">MDNS</div></div>
            </div>
        </div>

        <div style="height:40px; background:${accentColor}05; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.2); font-size:10px; font-weight:800; letter-spacing:3px">
            LIVE PRODUCTION
        </div>
    </div>
    `;

    const div = document.createElement('div');
    div.id = 'active-broadcast-wrapper';
    div.innerHTML = html;
    document.body.appendChild(div);

    if (typeof gsap !== 'undefined') {
        gsap.fromTo('#bowler-profile-left', { x: -500, opacity: 0, skewX: 10 }, { x: 0, opacity: 1, skewX: 0, duration: 1.2, ease: "expo.out" });
    }
    
    activeBroadcastOverlayId = setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to('#bowler-profile-left', { x: -500, opacity:0, duration:0.8, ease:"expo.in", onComplete: () => div.remove() });
        } else div.remove();
    }, 12000);
}

function showBigEventGraphic(data) {
    if (!data) return;
    const { type, playerName, playerPhoto, playerRuns, playerBalls, bowlerName, teamName, matchScore } = data;
    
    let themeColor = '#FFD700'; // Gold
    let label = type === 'WICKET' ? 'WICKET' : (type === 'SIX' ? 'SIX!' : 'FOUR!');
    let accentColor = '#FFC107'; 

    if (type === 'SIX') {
        themeColor = '#7c4dff'; 
        accentColor = '#b39ddb';
    } else if (type === 'WICKET') {
        themeColor = '#ff1744'; 
        accentColor = '#ff8a80';
    }

    const existing = document.getElementById('big-event-wrapper');
    if(existing) existing.remove();

    const html = `
        <div id="big-event-pop" style="position:fixed; bottom:120px; left:50%; transform:translate(-50%, 50px); opacity:0; z-index:20000; font-family:'Outfit', sans-serif; display:flex; flex-direction:column; align-items:center;">
            
            <div id="be-popup-card" style="position:relative; width:auto; min-width:650px; background:linear-gradient(135deg, rgba(15,18,30,0.98), rgba(5,5,10,0.98)); 
                border-top:6px solid ${themeColor}; border-radius:30px; padding:35px 50px; 
                box-shadow: 0 40px 80px rgba(0,0,0,0.9), 0 0 50px ${themeColor}33; backdrop-filter:blur(20px); overflow:visible;">
                
                <!-- LABEL BADGE -->
                <div style="position:absolute; top:-35px; left:50%; transform:translateX(-50%); 
                    background:${themeColor}; color:${type === 'SIX' ? '#fff' : '#111'}; padding:12px 50px; border-radius:40px; 
                    font-size:36px; font-weight:950; letter-spacing:8px; box-shadow: 0 15px 30px ${themeColor}66; z-index:2;">
                    ${label}
                </div>
                
                <div style="display:flex; align-items:center; gap:35px; margin-top:25px;">
                    <!-- PHOTO -->
                    <div style="width:130px; height:130px; border-radius:50%; overflow:hidden; border:4px solid ${themeColor}; flex-shrink:0; box-shadow: 0 0 30px ${themeColor}44;">
                        <img src="${playerPhoto || '../assets/default-player.svg'}" style="width:100%; height:100%; object-fit:cover" onerror="this.onerror=null;this.src='../assets/default-player.svg'" />
                    </div>
                    
                    <!-- NAME & STATS -->
                    <div style="flex:1;">
                        <div style="font-size:38px; font-weight:950; color:#fff; text-transform:uppercase; margin-bottom:8px; line-height:1;">${playerName || 'PLAYER'}</div>
                        <div style="font-size:22px; color:${accentColor}; font-weight:800; letter-spacing:2px;">
                            ${playerRuns || 0} (${playerBalls || 0}) 
                            <span style="color:rgba(255,255,255,0.4); margin-left:12px; font-size:16px;">VS ${bowlerName || 'Bowler'}</span>
                        </div>
                    </div>

                    <!-- MATCH INFO -->
                    <div style="text-align:right; border-left:1px solid rgba(255,255,255,0.15); padding-left:30px; display:flex; flex-direction:column; justify-content:center;">
                        <div style="font-size:14px; color:rgba(255,255,255,0.5); font-weight:800; letter-spacing:3px; margin-bottom:8px;">${teamName || 'TEAM'}</div>
                        <div style="font-size:28px; font-weight:950; color:#fff; white-space:nowrap;">${matchScore || ''}</div>
                    </div>
                </div>

            </div>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'big-event-wrapper';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    if (typeof gsap !== 'undefined') {
        const tl = gsap.timeline();
        // Entrance
        tl.to('#big-event-pop', { y: 0, opacity: 1, duration: 0.8, ease: 'back.out(1.5)' })
          .from('#be-popup-card', { rotateX: 30, transformPerspective: 1200, duration: 0.8 }, "<");
        
        // Emphasize
        if(type === 'SIX' || type === 'WICKET') {
            tl.to('#big-event-pop', { scale: 1.03, duration: 0.3, repeat: 3, yoyo: true, ease: 'power1.inOut' }, "+=0.2");
        }

        if (window._beTimeout) clearTimeout(window._beTimeout);
        window._beTimeout = setTimeout(() => {
            gsap.to('#big-event-pop', { y: 60, opacity: 0, scale: 0.95, duration: 0.6, ease: 'power3.in', onComplete: () => wrapper.remove() });
        }, 7000);
    } else {
        document.getElementById('big-event-pop').style.opacity = 1;
        document.getElementById('big-event-pop').style.transform = 'translate(-50%, 0)';
        setTimeout(() => wrapper.remove(), 7000);
    }
}

function showPartnershipGraphic(data) {
    if (!data) return;
    const { player1, player2, runs, balls, teamName } = data;
    const html = `
        <div class="overlay-container show" id="overlay-partnership" style="display: flex; align-items: center; justify-content: center; background: radial-gradient(circle, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 80%);">
            <div class="partnership-card" style="width: 800px; background: rgba(10, 10, 30, 0.95); backdrop-filter: blur(20px); border-left: 6px solid #FFD700; border-right: 6px solid #FFD700; border-radius: 40px; padding: 30px 60px; box-shadow: 0 40px 100px rgba(0,0,0,0.8); border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-direction: column; align-items: center; opacity: 0; transform: perspective(1000px) rotateX(-20deg) translateY(50px);">
                
                <div style="font-size: 14px; font-weight: 800; color: rgba(255,255,255,0.4); letter-spacing: 4px; text-transform: uppercase; margin-bottom: 20px;">
                    ${teamName} • CURRENT PARTNERSHIP
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 40px;">
                    <div style="flex: 1; text-align: right;">
                        <div style="font-size: 32px; font-weight: 950; color: #fff; text-transform: uppercase; letter-spacing: 1px;">${player1}</div>
                    </div>

                    <div style="display: flex; flex-direction: column; align-items: center; min-width: 180px;">
                        <div style="font-size: 82px; font-weight: 950; color: #FFD700; line-height: 1; text-shadow: 0 10px 30px rgba(255, 215, 0, 0.3);">${runs}</div>
                        <div style="font-size: 18px; font-weight: 800; color: rgba(255,255,255,0.6); letter-spacing: 2px;">RUNS OFF ${balls} BALLS</div>
                    </div>

                    <div style="flex: 1; text-align: left;">
                        <div style="font-size: 32px; font-weight: 950; color: #fff; text-transform: uppercase; letter-spacing: 1px;">${player2}</div>
                    </div>
                </div>

                <div style="margin-top: 25px; width: 60%; height: 2px; background: linear-gradient(90deg, transparent, #FFD700, transparent); opacity: 0.3;"></div>
            </div>
        </div>
    `;

    renderBroadcastOverlay(html);

    // GSAP Animation Sequence
    setTimeout(() => {
        const card = document.querySelector('.partnership-card');
        if (card && typeof gsap !== 'undefined') {
            gsap.to(card, {
                y: 0,
                rotateX: 0,
                duration: 1,
                ease: "expo.out"
            });
        }
    }, 50);
}

function showGuestGraphic(data) {
    const { name, title, photo } = data;
    const accent = '#FFD700'; // Golden for guests
    const photoSrc = photo || OVERLAY_DEFAULT_PLAYER_PHOTO;

    // Remove existing
    document.querySelectorAll('.guest-intro-left').forEach(el => el.remove());

    const html = `
    <div id="guest-intro-cinema" class="guest-intro-left" style="position:fixed; left:40px; top:50%; transform:translateY(-50%); display:flex; z-index:15500; font-family:'Outfit', sans-serif">
        <div style="width:300px; background:linear-gradient(135deg, rgba(20, 20, 20, 0.98) 0%, rgba(0,0,0,1) 100%); border-left:10px solid ${accent}; border-radius:0 30px 30px 0; overflow:hidden; box-shadow:0 30px 60px rgba(0,0,0,0.8)">
            <div style="height:6px; background:${accent}; opacity:0.3"></div>
            <div style="padding:30px 25px">
                <div style="color:${accent}; font-weight:900; letter-spacing:4px; font-size:11px; text-transform:uppercase; margin-bottom:20px; text-shadow:0 0 10px ${accent}44">
                    ${title || 'SPECIAL GUEST'}
                </div>
                <div style="width:100%; height:280px; background:rgba(255,255,255,0.05); border-radius:20px; overflow:hidden; margin-bottom:25px; border:1px solid rgba(255,255,255,0.1)">
                    <img src="${photoSrc}" style="width:100%; height:100%; object-fit:cover" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                </div>
                <div style="text-align:left">
                    <div style="font-size:26px; font-weight:950; color:#fff; text-transform:uppercase; line-height:1; letter-spacing:1px">${(name||'SPECIAL').split(' ')[0]}</div>
                    <div style="font-size:38px; font-weight:950; color:${accent}; text-transform:uppercase; line-height:1.1; margin-bottom:5px; letter-spacing:1px">${(name||'GUEST').split(' ').slice(1).join(' ')}</div>
                </div>
                <div style="margin-top:25px; border-top:1px solid rgba(255,255,255,0.1); padding-top:20px; display:flex; align-items:center; gap:10px">
                    <div style="width:8px; height:8px; background:${accent}; border-radius:50%; box-shadow:0 0 10px ${accent}"></div>
                    <div style="font-size:10px; font-weight:800; color:rgba(255,255,255,0.4); letter-spacing:2px">LIVE BROADCAST GUEST</div>
                </div>
            </div>
        </div>
    </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'active-broadcast-wrapper';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    if (typeof gsap !== 'undefined') {
        gsap.from('.guest-intro-left', { x: -600, opacity: 0, duration: 1.2, ease: 'expo.out' });
        // Auto-hide after 15 seconds
        setTimeout(() => {
            gsap.to('.guest-intro-left', { x: -600, opacity: 0, duration: 1, ease: 'expo.in', onComplete: () => {
                document.querySelectorAll('.guest-intro-left').forEach(el => el.remove());
            }});
        }, 15000);
    } else {
        const el = document.querySelector('.guest-intro-left');
        if(el) {
            el.style.opacity = '1';
            el.style.transform = 'translateY(-50%)';
            setTimeout(() => el.remove(), 15000);
        }
    }
}
