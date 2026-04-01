let matchId = new URLSearchParams(window.location.search).get('match');
let tournId = new URLSearchParams(window.location.search).get('tournament');
let refreshInterval;
let currentPopupView = null;
let latestSocketScore = null;
let latestSocketScoreTime = 0; // track when socket data was received

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
    const baseUrl = window.BACKEND_BASE_URL ||
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3000' : 'https://slcrickpro-server.onrender.com');

    // ── Socket.io: Instant push-based updates from the server
    if (typeof io !== 'undefined') {
        try {
            const socket = io(baseUrl, { reconnectionAttempts: 5, timeout: 5000 });
            if (matchId) socket.emit('joinMatch', matchId);
            if (tournId) socket.emit('joinTournament', tournId);

            socket.on('scoreUpdate', (updatedData) => {
                if (!updatedData) return;
                const isOurs = (matchId && updatedData.id === matchId)
                             || (tournId && updatedData.tournamentId === tournId);
                if (!isOurs) return;
                console.log('⚡ Socket scoreUpdate:', updatedData.id);
                if (updatedData.score) {
                    latestSocketScore = updatedData;
                } else {
                    const matches = DB.getMatches();
                    const idx = matches.findIndex(m => m.id === updatedData.id);
                    if (idx !== -1) { matches[idx] = updatedData; DB.saveMatches(matches); }
                }
                renderOverlay();
            });

            socket.on('broadcastCmd', (payload) => {
                if (!payload || !payload.cmd) return;
                console.log('⚡ Socket broadcastCmd:', payload.cmd);
                handleBroadcastCommand(payload.cmd, { ...(payload.data || {}), tournamentId: payload.tournamentId || null, matchId: payload.matchId || null });
            });

            socket.on('connect', () => console.log('🟢 TV: Socket connected to ' + baseUrl));

            socket.on('disconnect', () => console.log('🔴 TV: Socket disconnected — API polling continues'));
        } catch (e) { console.warn('Socket.io init failed:', e.message); }
    } else {
        console.warn('Socket.io not loaded — using API polling only.');
    }


    renderOverlay();

    // ── Server API polling: works on ANY device on the same network
    //    Polls the cached /tv/matches/:id/light endpoint every 3 seconds
    // (baseUrl is already defined above)


    function pollServerScore() {
        if (document.hidden) return; // Don't poll when tab is hidden
        if (matchId) {
            fetch(baseUrl + '/tv/matches/' + matchId + '/light')
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (!data || !data.score) return;
                    const prevBalls = latestSocketScore && latestSocketScore.score ? latestSocketScore.score.balls : -1;
                    if (data.score.balls !== prevBalls) {
                        latestSocketScore = data;
                        renderOverlay();
                    }
                }).catch(() => {});
        } else if (tournId) {
            fetch(baseUrl + '/sync/matches')
                .then(r => r.ok ? r.json() : [])
                .then(matches => {
                    if (!Array.isArray(matches)) return null;
                    const live = matches.find(m => m && m.tournamentId === tournId && (m.status === 'live' || m.status === 'paused'));
                    if (!live) return null;
                    if (matchId !== live.id) { matchId = live.id; }
                    return fetch(baseUrl + '/tv/matches/' + live.id + '/light').then(r => r.ok ? r.json() : null);
                })
                .then(data => {
                    if (!data || !data.score) return;
                    latestSocketScore = data;
                    renderOverlay();
                }).catch(() => {});
        }
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
    }, 3000);

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
});


function handleBroadcastCommand(cmd, data) {
    if (data && typeof data === 'object') {
        if (data.tournamentId && tournId && data.tournamentId !== tournId) return;
        if (data.matchId && matchId && data.matchId !== matchId) return;
    }
    if (!window.gsap) { console.error("🚫 GSAP not loaded. Broadcast animations skipped."); return; }
    console.log("📥 Received Broadcast:", cmd, data);
    
    // Clear existing special overlays if needed
    if (cmd === 'STOP_OVERLAY') {
        hideAllBroadcastOverlays();
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
            toggleBroadcastScorecard();
            break;
        case 'SHOW_SUMMARY':
            toggleBroadcastSummary();
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
            showBatterProfilesGraphic(data);
            break;
        case 'SHOW_BIG_EVENT':
            showBigEventGraphic(data);
            break;
        case 'SHOW_BOWLER_PROFILE':
            showBowlerProfileGraphic(data);
            break;
        case 'SHOW_PARTNERSHIP':
            showPartnershipGraphic(data);
            break;
        case 'STOP_OVERLAY': 
            hideAllBroadcastOverlays(); 
            break;
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
    const el = document.getElementById('broadcast-next-match');
    if (!el) return;
    
    document.getElementById('nm-team-a').textContent = data.teamA || 'TBD';
    document.getElementById('nm-team-b').textContent = data.teamB || 'TBD';
    
    el.style.display = 'flex';
    // Cinematic entrance
    gsap.fromTo(el, { opacity: 0, scale: 1.1 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out' });
    gsap.from('.nm-artwork', { y: 60, opacity: 0, duration: 1, delay: 0.2, ease: 'expo.out' });
    
    // Auto-hide after 8 seconds
    if (window._nmTimeout) clearTimeout(window._nmTimeout);
    window._nmTimeout = setTimeout(() => {
        gsap.to(el, { opacity: 0, scale: 0.95, duration: 0.8, ease: 'power3.in', onComplete: () => el.style.display = 'none' });
    }, 8000);
}

// Milestone Graphic Removed as per User Request

function toggleBroadcastScorecard() {
    const el = document.getElementById('broadcast-full-scorecard');
    if (el.style.display === 'flex') {
        gsap.to(el, { opacity: 0, scale: 0.95, duration: 0.5, onComplete: () => el.style.display = 'none' });
    } else {
        const success = renderFullScorecardOverlay();
        if (success) {
            el.style.display = 'flex';
            gsap.fromTo(el, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out' });
        } else {
            console.error("🚫 Cannot show scorecard: No match data found.");
        }
    }
}

function renderFullScorecardOverlay() {
    const m = DB.getMatch(matchId);
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

function toggleBroadcastSummary() {
    const el = document.getElementById('broadcast-summary');
    if (el.style.display === 'block') {
        gsap.to(el, { opacity: 0, y: 100, duration: 0.5, onComplete: () => el.style.display = 'none' });
    } else {
        const success = renderTournamentSummaryOverlay();
        if (success) {
            el.style.display = 'block';
            gsap.fromTo(el, { opacity: 0, y: 100 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' });
        } else {
            console.error("🚫 Cannot show summary: No tournament data found.");
        }
    }
}

function renderTournamentSummaryOverlay() {
    const t = DB.getTournament(tournId);
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

    // No local data — try socket light payload as fallback
    if (latestSocketScore && latestSocketScore.score) {
        return renderOverlayFromLightPayload(latestSocketScore);
    }

    // No match found — hide
    document.getElementById('overlay-container').style.display = 'none';
    document.getElementById('overlay-container').innerHTML = '';
}

// ─── Full match renderer ─────────────────────────────────────────────────────
function _renderOverlayFromMatch(m) {
    const container = document.getElementById('overlay-container');
    if (!container) return;
    const curInn = m.innings[m.currentInnings];
    if (!curInn) { container.style.display = 'none'; return; }
    container.style.display = 'flex';

    const t1Short = getShortName(curInn.battingTeam || 'T1');
    const t2Short = getShortName(curInn.bowlingTeam || 'T2');
    const score   = curInn.runs + '-' + curInn.wickets;
    const ov      = formatOvers(curInn.balls, m.ballsPerOver);

    const si  = curInn.currentBatsmenIdx[curInn.strikerIdx];
    const nsi = curInn.currentBatsmenIdx[curInn.strikerIdx === 0 ? 1 : 0];
    const striker    = curInn.batsmen[si]  || { name:'Batsman 1', runs:0, balls:0 };
    const nonStriker = curInn.batsmen[nsi] || { name:'Batsman 2', runs:0, balls:0 };
    const bowler     = curInn.bowlers[curInn.currentBowlerIdx] || { name:'Bowler', wickets:0, runs:0, balls:0 };
    const b_overs    = formatOvers(bowler.balls || 0, m.ballsPerOver);

    const ballsToShow = curInn.currentOver.slice(Math.max(0, curInn.currentOver.length - 6));
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
    if (m.currentInnings===1 && m.innings[0]) {
        const need      = m.innings[0].runs + 1 - curInn.runs;
        const ballsLeft = (m.overs * m.ballsPerOver) - curInn.balls;
        bottomText = need>0  ? `NEED <span style="color:#fff">${need}</span> FROM <span style="color:#fff">${ballsLeft}</span> BALLS`
                   : need===0? `<span style="color:#fff">SCORES LEVEL</span>`
                             : `<span style="color:#fff">🎉 WON BY ${m.playersPerSide-curInn.wickets-1} WICKETS</span>`;
    } else {
        bottomText = `TOSS: ${m.tossWinner||'TBD'} CHOSE TO ${(m.tossDecision||'bat').toUpperCase()}`;
    }

    container.innerHTML = `
        <div class="team-logo-box left"><div class="logo-circle">${t1Short}</div></div>
        <div class="batsmen-section">
            <div class="player-row">
                <div class="player-name"><span class="striker-mark">${curInn.strikerIdx===0?'▶':'&nbsp;'}</span> ${striker.name}</div>
                <div class="player-value runs">${striker.runs||0}</div>
                <div class="player-value balls">${striker.balls||0}</div>
            </div>
            <div class="player-row">
                <div class="player-name"><span class="striker-mark">${curInn.strikerIdx===1?'▶':'&nbsp;'}</span> ${nonStriker.name}</div>
                <div class="player-value runs">${nonStriker.runs||0}</div>
                <div class="player-value balls">${nonStriker.balls||0}</div>
            </div>
        </div>
        <div class="score-center-section">
            <div class="score-top">
                <span class="teams">${t1Short} <span class="v">v</span> ${t2Short}</span>
                <span class="total">${score}</span>
                <span class="phase">${phase}</span>
                <span class="overs">${ov}</span>
            </div>
            <div class="score-bottom">${bottomText}</div>
        </div>
        <div class="bowler-section">
            <div class="player-row">
                <div class="player-name">${bowler.name}</div>
                <div class="player-value runs">${bowler.wickets||0}-${bowler.runs||0}</div>
                <div class="player-value balls">${b_overs}</div>
            </div>
            <div class="recent-balls-row">${recentBallsHtml}</div>
        </div>
        <div class="team-logo-box right"><div class="logo-circle">${t2Short}</div></div>`;
}

function renderOverlayFromLightPayload(payload) {
    const cur = payload.score;
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

function formatOvers(balls, bpo = 6) {
    const ov = Math.floor(balls / bpo);
    const b = balls % bpo;
    return `${ov}.${b}`;
}

function formatCRR(runs, balls) {
    if (!balls) return '0.00';
    return (runs / (balls / 6)).toFixed(2);
}

// Helper to get 3-letter short name
function getShortName(fullName) {
    if (!fullName) return "TBD";
    return fullName.substring(0, 3).toUpperCase();
}

const OVERLAY_DEFAULT_PLAYER_PHOTO = '../assets/default-player.svg';

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

    // Create the HTML for the player grid (up to 11 players)
    const playersHtml = players.slice(0, 11).map((p, idx) => {
        const src = (p.photo && String(p.photo).trim()) ? p.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
        return `
            <div class="squad-player-item" style="opacity:0; transform:translateY(30px)">
                <div class="squad-photo-wrapper">
                    <img src="${src}" class="squad-photo" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                    <div class="squad-photo-ring"></div>
                </div>
                <div class="squad-player-info">
                    <div class="squad-player-name">${p.name.toUpperCase()}</div>
                    <div class="squad-player-role">${p.role || 'Player'}</div>
                </div>
            </div>
        `;
    }).join('');

    const html = `
        <div class="overlay-container show" id="overlay-team-squad">
            <style>
                #overlay-team-squad {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    background: radial-gradient(circle at center, rgba(13, 71, 161, 0.4) 0%, rgba(0,0,0,0.85) 100%);
                    backdrop-filter: blur(10px);
                }
                .squad-main-container {
                    width: 90%;
                    max-width: 1200px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .squad-header {
                    text-align: center;
                    margin-bottom: 40px;
                    border-bottom: 4px solid #ff1744;
                    padding-bottom: 10px;
                    width: 100%;
                }
                .squad-header-sub {
                    font-size: 18px;
                    font-weight: 900;
                    color: #ffc107;
                    letter-spacing: 4px;
                }
                .squad-header-title {
                    font-size: 52px;
                    font-weight: 950;
                    color: #fff;
                    text-shadow: 0 4px 15px rgba(0,0,0,0.5);
                }
                .squad-grid {
                    display: grid;
                    grid-template-columns: repeat(12, 1fr);
                    gap: 30px;
                    width: 100%;
                    justify-items: center;
                }
                .squad-player-item {
                    grid-column: span 3;
                    width: 180px;
                    text-align: center;
                    transition: 0.3s;
                }
                /* Custom grid positioning for rows (4 per row, total 11) */
                /* Players 1-4: span 3 each = 12 */
                /* Players 5-8: span 3 each = 12 */
                /* Players 9-11 (last row): span 4 each = 12 */
                .squad-player-item:nth-child(n+9) {
                    grid-column: span 4;
                }
                .squad-photo-wrapper {
                    position: relative;
                    width: 130px;
                    height: 130px;
                    margin: 0 auto 15px;
                }
                .squad-photo {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.1);
                    border: 4px solid #fff;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .squad-photo-ring {
                    position: absolute;
                    top: -5px;
                    left: -5px;
                    right: -5px;
                    bottom: -5px;
                    border: 2px solid #ff1744;
                    border-radius: 50%;
                    animation: pulse 2s infinite;
                }
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 0.5; }
                    50% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(1); opacity: 0.5; }
                }
                .squad-player-name {
                    font-weight: 900;
                    font-size: 14px;
                    color: #fff;
                    margin-bottom: 4px;
                    background: rgba(255,255,255,0.1);
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                .squad-player-role {
                    font-size: 11px;
                    color: #ffc107;
                    font-weight: 800;
                    letter-spacing: 1px;
                }
            </style>
            <div class="squad-main-container">
                <div class="squad-header">
                    <div class="squad-header-sub">OFFICIAL PLAYING XI</div>
                    <div class="squad-header-title">${teamName.toUpperCase()}</div>
                </div>
                <div class="squad-grid">
                    ${playersHtml}
                </div>
            </div>
        </div>
    `;

    renderBroadcastOverlay(html);

    // Staggered GSAP Animation
    setTimeout(() => {
        if (typeof gsap !== 'undefined') {
            gsap.to('.squad-player-item', {
                opacity: 1,
                y: 0,
                duration: 0.8,
                stagger: 0.1,
                ease: "back.out(1.7)"
            });
        } else {
            document.querySelectorAll('.squad-player-item').forEach(el => el.style.opacity = '1');
        }
    }, 100);
}

function showBatterProfilesGraphic(data) {
    const { profiles } = data;
    if (!profiles || profiles.length === 0) return;
    
    let html = `
        <div class="overlay-container show" id="overlay-players">
            <div class="overlay-card players-card" style="${profiles.length === 1 ? 'max-width:500px' : ''}">
                <div class="overlay-header">
                    <div class="overlay-title">${profiles.length === 1 ? 'PLAYER PROFILE' : 'CURRENT BATTERS'}</div>
                </div>
                <div class="overlay-body ${profiles.length === 1 ? '' : 'player-stats-flex'}">
    `;
    
    profiles.forEach(item => {
        const { name, profile: p, stats } = item;
        const src = (p && p.photo && String(p.photo).trim()) ? p.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
        html += `
            <div class="player-stat-card" style="${profiles.length === 1 ? 'margin-bottom:0' : ''}; animation: slideInLeft 0.5s ease forwards">
                <div class="player-main-info">
                    <div class="player-large-photo">
                        <img src="${src}" alt="" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                    </div>
                    <div>
                        <div class="player-lg-name">${name}</div>
                        <div class="player-lg-role" style="font-size:16px; color:var(--c-primary)">${p ? (p.role || 'Player').toUpperCase() : 'BATSMAN'}</div>
                    </div>
                </div>
                <div class="player-mini-stats">
                    <div class="m-stat"><div class="m-val">${stats.runs || 0}</div><div class="m-lbl">Runs</div></div>
                    <div class="m-stat"><div class="m-val">${stats.balls || 0}</div><div class="m-lbl">Balls</div></div>
                    <div class="m-stat"><div class="m-val">${stats.fours || 0}</div><div class="m-lbl">4s</div></div>
                    <div class="m-stat"><div class="m-val">${stats.sixes || 0}</div><div class="m-lbl">6s</div></div>
                </div>
            </div>
        `;
    });
    
    html += '</div></div></div>';
    renderBroadcastOverlay(html);
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
    const { name, profile: p, stats } = data;
    const src = (p && p.photo && String(p.photo).trim()) ? p.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
    
    let html = `
        <div class="overlay-container show" id="overlay-bowler">
            <div class="overlay-card players-card" style="max-width:500px; border: 2px solid #00e676; background: linear-gradient(135deg, rgba(0,0,0,0.95), rgba(0,30,10,0.98))">
                <div class="overlay-header" style="border-bottom: 2px solid rgba(0,230,118,0.3)">
                    <div class="overlay-title" style="color:#00e676">BOWLER PROFILE</div>
                </div>
                <div class="overlay-body">
                    <div class="player-stat-card" style="margin-bottom:0; animation: slideInLeft 0.5s ease forwards">
                        <div class="player-main-info">
                            <div class="player-large-photo" style="border-color:#00e676">
                                <img src="${src}" alt="" onerror="this.onerror=null;this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'" />
                            </div>
                            <div>
                                <div class="player-lg-name">${name}</div>
                                <div class="player-lg-role" style="font-size:16px; color:#00e676">${p ? (p.role || 'Player').toUpperCase() : 'BOWLER'}</div>
                            </div>
                        </div>
                        <div class="player-mini-stats">
                            <div class="m-stat"><div class="m-val">${stats.overs || '0.0'}</div><div class="m-lbl">Overs</div></div>
                            <div class="m-stat"><div class="m-val">${stats.maidens || 0}</div><div class="m-lbl">Mdns</div></div>
                            <div class="m-stat"><div class="m-val">${stats.runs || 0}</div><div class="m-lbl">Runs</div></div>
                            <div class="m-stat"><div class="m-val" style="color:#00e676">${stats.wickets || 0}</div><div class="m-lbl">Wkts</div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    renderBroadcastOverlay(html);
}
function showBigEventGraphic(data) {
    const { type, playerName, playerPhoto, playerRuns, playerBalls, bowlerName, teamName, matchScore } = data;
    
    let themeColor = '#FFD700'; // Gold
    let label = type === 'WICKET' ? 'WICKET' : (type === 'SIX' ? 'SIX!' : 'FOUR!');
    let bgGradient = 'linear-gradient(135deg, rgba(10,10,20,0.98), rgba(0,0,0,1))';
    let accentColor = '#FFC107'; 

    if (type === 'SIX') {
        themeColor = '#7c4dff'; 
        accentColor = '#b39ddb';
    } else if (type === 'WICKET') {
        themeColor = '#ff1744'; 
        accentColor = '#ff8a80';
    }

    const labelHtml = label.split('').map(char => `<span class="be-char" style="display:inline-block">${char}</span>`).join('');

    const html = `
        <div id="big-event-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; display:flex; 
            align-items:center; justify-content:center; background:${bgGradient}; z-index:20000; overflow:hidden; font-family:'Outfit', sans-serif">
            
            <!-- Animated Background Particles/Glows -->
            <div id="be-glow-main" style="position:absolute; width:1200px; height:1200px; background:radial-gradient(circle, ${themeColor}15 0%, transparent 70%); 
                filter:blur(80px); border-radius:50%; opacity:0"></div>
            
            <div id="be-light-streak-1" style="position:absolute; width:150%; height:300px; background:linear-gradient(90deg, transparent, ${themeColor}11, transparent); 
                transform:rotate(-35deg) translateY(-300%); filter:blur(60px)"></div>

            <!-- Cinematic Decorative Borders (NEW Artwork) -->
            <div class="be-border" style="position:absolute; top:20px; left:20px; right:20px; bottom:20px; border:1px solid rgba(255,255,255,0.05); pointer-events:none; border-radius:30px"></div>
            <div class="be-border-accent" style="position:absolute; top:60px; left:60px; right:60px; bottom:60px; border:2px solid ${themeColor}22; pointer-events:none; border-radius:20px; opacity:0"></div>
            
            <!-- Content Container -->
            <div id="big-event-container" style="position:relative; width:100%; display:flex; flex-direction:column; align-items:center; transform:perspective(1500px) rotateX(20deg); opacity:0">
                
                <!-- Match Context Bar -->
                <div id="be-match-context" style="margin-bottom:40px; opacity:0; transform:translateY(-20px)">
                    <span style="color:rgba(255,255,255,0.4); letter-spacing:4px; font-weight:700; font-size:14px; text-transform:uppercase">
                        ${teamName} • ${matchScore}
                    </span>
                </div>

                <!-- Main Event Text -->
                <div id="be-main-text" style="font-size:160px; font-weight:900; color:#fff; letter-spacing:20px; 
                    text-shadow: 0 20px 40px rgba(0,0,0,0.4), 0 0 50px ${themeColor}33; 
                    line-height:0.8; margin-bottom:40px">${labelHtml}</div>

                <!-- PLAYER CARD (The "WOW" Component) -->
                <div id="be-player-card" style="display:flex; align-items:center; gap:25px; padding:20px 40px; 
                    background:rgba(255,255,255,0.03); backdrop-filter:blur(30px); border:2px solid ${themeColor}44; 
                    border-radius:24px; box-shadow:0 30px 60px rgba(0,0,0,0.5); opacity:0; transform:translateY(50px);
                    box-shadow: 0 0 50px ${themeColor}22">
                    
                    <div style="width:110px; height:110px; border-radius:50%; overflow:hidden; border:4px solid ${themeColor}; box-shadow: 0 0 20px ${themeColor}66">
                        <img src="${playerPhoto || '../assets/default-player.svg'}" style="width:100%; height:100%; object-fit:cover" />
                    </div>
                    
                    <div style="text-align:left">
                        <div style="font-size:36px; font-weight:950; color:#fff; margin-bottom:4px; letter-spacing:2px; text-transform:uppercase">${playerName || 'Unknown Player'}</div>
                        <div style="font-size:20px; font-weight:800; color:${themeColor}; letter-spacing:3px; opacity:0.9">
                            ${playerRuns || 0} (${playerBalls || 0}) <span style="color:rgba(255,255,255,0.4); margin-left:14px; letter-spacing:1px">VS ${bowlerName || 'Bowler'}</span>
                        </div>
                    </div>
                </div>

                <!-- Divider Lines -->
                <div class="be-line" style="position:absolute; bottom:-60px; width:0%; height:1px; background:linear-gradient(90deg, transparent, ${themeColor}, transparent); opacity:0.5"></div>
            </div>

            <!-- Corners -->
            <div class="be-corner" style="position:absolute; top:40px; left:40px; width:40px; height:40px; border-top:2px solid ${themeColor}; border-left:2px solid ${themeColor}; opacity:0"></div>
            <div class="be-corner" style="position:absolute; bottom:40px; right:40px; width:40px; height:40px; border-bottom:2px solid ${themeColor}; border-right:2px solid ${themeColor}; opacity:0"></div>

            <!-- Footer Branding -->
            <div id="be-footer" style="position:absolute; bottom:40px; width:100%; text-align:center; letter-spacing:8px; color:rgba(255,255,255,0.2); font-weight:800; font-size:11px; opacity:0">
                LIVE BROADCAST PRODUCTION • SLCRICKPRO MAX
            </div>
        </div>
    `;

    const wrapper = document.createElement('div');
    wrapper.id = 'big-event-wrapper';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);

    // Timeline execution
    const tl = gsap.timeline();
    
    // Reset/Initial states
    gsap.set('.be-char', { opacity: 0, y: 50, scale: 0.5, rotateX: -90 });
    
    // ENTRANCE SEQUENCE
    tl.to('#big-event-overlay', { opacity: 1, duration: 0.4 })
      .to('#be-glow-main', { opacity: 1, scale: 1.2, duration: 2, ease: 'power2.out' }, 0)
      .to('.be-corner', { opacity: 0.4, duration: 1 }, 0.2)
      .to('#big-event-container', { opacity: 1, rotateX: 0, duration: 1.2, ease: 'power4.out' }, 0.1)
      .to('#be-match-context', { opacity: 1, y: 0, duration: 0.8 }, 0.3)
      .to('.be-char', { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.8, stagger: 0.05, ease: 'back.out(1.7)' }, 0.2)
      .to('#be-player-card', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }, 0.5)
      .to('.be-border-accent', { opacity: 1, scale: 1.05, duration: 2, ease: 'sine.inOut' }, 0.1)
      .to('.be-line', { width: '80%', duration: 1.5, ease: 'expo.out' }, 0.6)
      .to('#be-footer', { opacity: 1, duration: 1 }, 0.8)
      .to('#be-light-streak-1', { y: '800%', duration: 2.5, ease: 'power1.inOut' }, 0.2);

    // LOOPING / EMPHASIS
    if (type === 'SIX') {
        tl.to('#be-main-text', { scale: 1.05, duration: 0.4, repeat: -1, yoyo: true, ease: 'sine.inOut' }, 1);
        tl.to('#be-player-card', { boxShadow: `0 0 40px ${themeColor}33`, repeat: -1, yoyo: true, duration: 1 }, 1);
    } else if (type === 'WICKET') {
        tl.to('#big-event-overlay', { background: '#300', duration: 0.1, repeat: 3, yoyo: true }, 0.1);
    }

    // EXIT SEQUENCE
    setTimeout(() => {
        tl.timeScale(2).reverse();
        setTimeout(() => wrapper.remove(), 1000);
    }, 5500);
}

function showPartnershipGraphic(data) {
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
                opacity: 1,
                rotateX: 0,
                y: 0,
                duration: 1,
                ease: "expo.out"
            });
        } else if (card) {
            card.style.opacity = '1';
            card.style.transform = 'none';
        }
    }, 100);
}
