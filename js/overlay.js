let matchId = null;
let tournId = null;
let isMasterOverlay = false;

// ── GSAP Safety Wrapper ──
if (typeof gsap === 'undefined') {
    var gsap = {
        to: function() { return this; },
        from: function() { return this; },
        fromTo: function() { return this; }
    };
    console.warn('⚠️ GSAP not loaded, using fallback animations');
}

try {
    const searchStr = window.location.search || '';
    if (searchStr.includes('?')) {
        const urlParams = new URLSearchParams(searchStr);
        matchId = urlParams.get('match') || urlParams.get('matchId') || null;
        tournId = urlParams.get('tournament') || urlParams.get('tournamentId') || null;
        
        // Safety clean up to avoid any hashes breaking the ID
        if (matchId && matchId.includes('#')) matchId = matchId.split('#')[0];
        if (tournId && tournId.includes('#')) tournId = tournId.split('#')[0];
    }
} catch (e) {
    console.error("URL Params Error safely caught:", e);
}

// If no matchId is provided, we run in Master Mode
if (!matchId) isMasterOverlay = true;

let refreshInterval;
let currentPopupView = null;
let latestSocketScore = null;
let latestSocketScoreTime = 0; 
let isScorebarVisible = true;
let currentOverlayMode = 4; // Default to Mode 4 (Scorebar 2)
let currentSubMode = 1;

if (typeof OVERLAY_DEFAULT_PLAYER_PHOTO === 'undefined') {
    var OVERLAY_DEFAULT_PLAYER_PHOTO = '../assets/default-player.svg';
}

function getShortName(fullName) {
    if (!fullName || typeof fullName !== 'string') return '';
    try {
        const parts = fullName.trim().split(' ');
        if (parts.length === 0) return '';
        if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
        return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    } catch (e) {
        return '';
    }
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

document.addEventListener('DOMContentLoaded', () => {
    // ── Previews & Scale ──────────────────────────────────
    const isPreview = new URLSearchParams(window.location.search).get('preview');
    if (isPreview) {
        document.body.classList.add('preview-mode');
        const scaleToFit = () => {
            const scale = window.innerWidth / 1920;
            document.body.style.width = '1920px';
            document.body.style.height = '1080px';
            document.body.style.transform = `scale(${scale})`;
            document.body.style.transformOrigin = 'top left';
            document.body.style.overflow = 'hidden';
            document.body.style.margin = '0';
        };
        window.addEventListener('resize', scaleToFit);
        setTimeout(scaleToFit, 10);
    }

    if (!matchId && !tournId && !isMasterOverlay) {
        document.getElementById('overlay-container').innerHTML = '<div style="padding: 20px; color: red;">No Match or Tournament ID!</div>';
        return;
    }

    // ── Backend & Socket ──────────────────────────────────
    const baseUrl = window.BACKEND_BASE_URL || (typeof DB !== 'undefined' ? DB.getCloudURL() : "https://slcrickpro.onrender.com");
    const socket = window._cricproSocket || (typeof io !== 'undefined' ? io(baseUrl, { 
        transports: ['polling', 'websocket'],
        closeOnBeforeunload: false
    }) : null);

    if (socket) {
        socket.emit('join_global', {});
        if (matchId) socket.emit('join_match', matchId);
        if (tournId) socket.emit('join_tournament', tournId); // Also join tournament room
        
        socket.on('scoreUpdate', (data) => {
            // If in master mode and this is from a different match, handle appropriately
            if (isMasterOverlay && data && data.fullMatch) {
                // If we specified a tournament, ensure this match belongs to it
                if (tournId && data.fullMatch.tournamentId !== tournId) return;
                
                if (matchId !== data.fullMatch.id) {
                    matchId = data.fullMatch.id;
                    socket.emit('join_match', matchId);
                }
            }
            latestSocketScore = data;
            renderOverlay();
        });
        socket.on('broadcast_command', (payload) => {
            handleBroadcastCommand(payload.cmd, payload.data);
        });
    }

    // ── Server Polling Fallback ───────────────────────────
    function pollServerScore() {
        if (!matchId && !isMasterOverlay) return;
        
        // If we have local DB and are on localhost, local data is always fresher than server
        const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocal && typeof DB !== 'undefined') {
            const localMatch = DB.getMatch(matchId);
            if (localMatch) {
                latestSocketScore = { fullMatch: localMatch };
                renderOverlay();
                // On localhost, we rely on localStorage/postMessage primarily.
                // We only poll the server if we are NOT on localhost or if localMatch is missing.
                return; 
            }
        }
        if (isMasterOverlay && !matchId) {
            targetUrl = baseUrl + '/api/active-match' + (tournId ? '?tournamentId=' + tournId : '');
        } else {
            targetUrl = baseUrl + '/tv/matches/' + matchId + '/light';
        }
        
        fetch(targetUrl)
            .then(r => {
                if (r.status === 404) return null; // Silently handle 404
                return r.ok ? r.json() : null;
            })
            .then(data => {
                if (!data || data.error) return;
                
                // If master mode, data represents the active match
                if (isMasterOverlay && data.fullMatch) {
                    if (matchId !== data.fullMatch.id) {
                        matchId = data.fullMatch.id; // Switch to the active match
                        if (socket) socket.emit('join_match', matchId);
                    }
                }
                
                // Only update if server data is newer or if we have no local data
                const serverMatch = data.fullMatch || null;
                const localMatch = (typeof DB !== 'undefined') ? DB.getMatch(matchId) : null;
                
                if (serverMatch && localMatch) {
                    const serverTime = serverMatch.lastUpdated || 0;
                    const localTime = localMatch.lastUpdated || 0;
                    if (serverTime < localTime) return; // Local is newer, don't overwrite
                }

                latestSocketScore = data.score ? data : (data.fullMatch ? { score: data.fullMatch.innings[data.fullMatch.currentInnings], fullMatch: data.fullMatch } : null);
                if (latestSocketScore && latestSocketScore.fullMatch && typeof DB !== 'undefined') DB.saveMatch(latestSocketScore.fullMatch, true); // skipCloud to avoid loop
                renderOverlay();
            }).catch(() => {});
    }

    setInterval(() => {
        if (!currentPopupView) { pollServerScore(); renderOverlay(); }
    }, 1500);

    // ── Clock ─────────────────────────────────────────────
    setInterval(() => {
        const elements = document.querySelectorAll('#overlay-live-clock');
        if (elements.length === 0) return;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        elements.forEach(el => { if (el.textContent !== timeStr) el.textContent = timeStr; });
    }, 1000);

    // ── Cross-tab communication ───────────────────────────
    window.addEventListener('storage', (e) => {
        if (e.key === 'cricpro_broadcast_cmd') {
            try {
                const payload = JSON.parse(e.newValue);
                handleBroadcastCommand(payload.cmd, payload.data);
            } catch (err) {}
        }
    });

    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'cricpro_broadcast_cmd') {
            handleBroadcastCommand(e.data.payload.cmd, e.data.payload.data);
        }
    });
});

function handleBroadcastCommand(cmd, data = {}) {
    if (!cmd) return;
    const requiresGsap = [
        'SHOW_RUNS_BALLS', 'SHOW_NEXT_MATCH', 'SHOW_SCORECARD', 'SHOW_SUMMARY',
        'SHOW_CRR', 'SET_SCOREBAR_VISIBILITY', 'SET_OVERLAY_MODE', 'SET_OVERLAY_SUBMODE',
        'SHOW_TEAM_CARD', 'SHOW_TEAM_ROSTER', 'SHOW_BIG_EVENT', 'SHOW_STRIKER_PROFILE',
        'SHOW_NON_STRIKER_PROFILE', 'SHOW_BOWLER_PROFILE', 'SHOW_PARTNERSHIP',
        'SHOW_BATTER_PROFILES', 'SHOW_GUEST', 'STOP_OVERLAY', 'CLEAR_STAY_OVERLAYS', 'STOP_ALL'
    ];
    if (!window.gsap && requiresGsap.includes(cmd)) return;
    
    if (cmd === 'STOP_OVERLAY' || cmd === 'CLEAR_STAY_OVERLAYS' || cmd === 'STOP_ALL' || cmd === 'STOP_BROADCAST') {
        hideAllBroadcastOverlays();
        isScorebarVisible = true; // Always ensure scorebar returns
        renderOverlay();
        return;
    }
    if (cmd === 'FORCE_UPDATE') {
        renderOverlay();
        return;
    }
    if (cmd === 'TOGGLE_SCOREBAR' || cmd === 'SET_SCOREBAR_VISIBILITY') {
        if (cmd === 'SET_SCOREBAR_VISIBILITY') isScorebarVisible = !!data.visible;
        else isScorebarVisible = !isScorebarVisible;
        renderOverlay();
        return;
    }

    switch (cmd) {
        case 'SHOW_RUNS_BALLS': showRunsBallsGraphic(data); break;
        case 'SHOW_NEXT_MATCH': showNextMatchGraphic(data); break;
        case 'SHOW_SCORECARD': toggleBroadcastScorecard(data.matchId || matchId); break;
        case 'SHOW_SUMMARY': toggleBroadcastSummary(data.tournamentId || tournId); break;
        case 'SHOW_CRR': showCRRGraphic(data); break;
        case 'SYNC_MATCH':
        case 'SYNC_SCORE':
            if (data.matchId) {
                matchId = data.matchId;
                if (window._cricproSocket) window._cricproSocket.emit('join_match', matchId);
            }
            if (data.match) {
                matchId = data.match.id;
                latestSocketScore = { fullMatch: data.match };
                if (data.match.isManual && data.match.manualData) {
                    const manual = data.match.manualData;
                    latestSocketScore.fullMatch.currentInnings = 0;
                    latestSocketScore.fullMatch.overs = parseInt(manual.overs, 10) || latestSocketScore.fullMatch.overs || 0;
                    latestSocketScore.fullMatch.ballsPerOver = 6;
                    latestSocketScore.fullMatch.innings = latestSocketScore.fullMatch.innings || [{
                        battingTeam: manual.team1 || 'TEAM A',
                        bowlingTeam: manual.team2 || 'TEAM B',
                        runs: parseInt(manual.runs, 10) || 0,
                        wickets: parseInt(manual.wickets, 10) || 0,
                        balls: parseInt(manual.overs, 10) || 0,
                        batsmen: [
                            { name: manual.striker || 'Batter', runs: parseInt(manual.runs, 10) || 0, balls: 0 },
                            { name: manual.nonStriker || 'Batter', runs: 0, balls: 0 }
                        ],
                        bowlers: [{ name: manual.bowler || 'Bowler', wickets: 0, runs: 0, balls: 0 }],
                        currentBatsmenIdx: [0,1],
                        strikerIdx: 0,
                        currentBowlerIdx: 0
                    }];
                }
                if (typeof DB !== 'undefined' && DB.saveMatch) DB.saveMatch(latestSocketScore.fullMatch);
                renderOverlay();
            }
            break;
        case 'SET_SCOREBAR_VISIBILITY':
            isScorebarVisible = !!data.visible;
            renderOverlay();
            break;
        case 'SET_OVERLAY_MODE':
            currentOverlayMode = parseInt(data.mode) || 1;
            renderOverlay();
            break;
        case 'SET_OVERLAY_SUBMODE':
            currentSubMode = parseInt(data.subMode) || 1;
            renderOverlay();
            break;
        case 'SHOW_TEAM_CARD': showTeamCardGraphic(data); break;
        case 'SHOW_TEAM_ROSTER': showTeamRosterGraphic(data); break;
        case 'SHOW_BIG_EVENT': showBigEventGraphic(data); break;
        case 'SHOW_STRIKER_PROFILE': showStrikerProfileLeft(data, 'STRIKER'); break;
        case 'SHOW_NON_STRIKER_PROFILE': showStrikerProfileLeft(data, 'NON-STRIKER'); break;
        case 'SHOW_BOWLER_PROFILE': showBowlerProfileGraphic(data); break;
        case 'SHOW_PARTNERSHIP': showPartnershipGraphicCinema(data); break;
        case 'SHOW_BATTER_PROFILES': showBatterProfilesGraphic(data); break;
        case 'SHOW_GUEST': showGuestGraphic(data); break;
    }
}

function hideAllBroadcastOverlays() {
    try {
        const overlays = document.querySelectorAll('.broadcast-overlay');
        if (overlays.length > 0 && typeof gsap !== 'undefined') {
            gsap.to('.broadcast-overlay', { opacity: 0, scale: 0.9, duration: 0.4, onComplete: () => {
                document.querySelectorAll('.broadcast-overlay').forEach(el => {
                    if (el.id) {
                        el.style.display = 'none';
                        // Reset for next GSAP animation
                        gsap.set(el, { opacity: 1, scale: 1, x: 0, y: 0, clearProps: 'transform,opacity' });
                    } else {
                        el.remove();
                    }
                });
            }});
        } else {
            overlays.forEach(el => {
                if (el.id) el.style.display = 'none';
                else el.remove();
            });
        }
    } catch(err) {
        console.warn('Error hiding overlays:', err);
        document.querySelectorAll('.broadcast-overlay').forEach(el => {
            if (el.id) el.style.display = 'none';
            else el.remove();
        });
    }
}

function renderOverlay() {
    let m = (typeof DB !== 'undefined') ? DB.getMatch(matchId) : null;
    if (!m && latestSocketScore && latestSocketScore.fullMatch) {
        m = latestSocketScore.fullMatch;
        if (!matchId && latestSocketScore.fullMatch.id) {
            matchId = latestSocketScore.fullMatch.id;
        }
    }
    if (!m) return;
    
    const container = document.getElementById('overlay-container');
    if (!isScorebarVisible) {
        container.innerHTML = '';
        return;
    }

    if (currentOverlayMode === 4) {
        _renderOverlayMode4(m);
    } else {
        // Fallback for other modes if they exist
        container.innerHTML = `<div class="score-pill">Fallback Mode ${currentOverlayMode}</div>`;
    }
}

let _m4PrevWickets = -1;

function _renderOverlayMode4(m) {
    const container = document.getElementById('overlay-container');
    const curInn = m.innings[m.currentInnings];
    if (!curInn) return;
    
    container.className = 'overlay-container mode-4';

    const t1Name = curInn.battingTeam || m.team1 || 'TEAM A';
    const t2Name = curInn.bowlingTeam || m.team2 || 'TEAM B';
    const t1Logo = (typeof DB !== 'undefined') ? DB.getTeamPhoto(t1Name, m.tournamentId) : '../assets/default-team.svg';
    const t2Logo = (typeof DB !== 'undefined') ? DB.getTeamPhoto(t2Name, m.tournamentId) : '../assets/default-team.svg';

    const strikerIdx = curInn.currentBatsmenIdx ? curInn.currentBatsmenIdx[curInn.strikerIdx] : null;
    const striker = (strikerIdx != null && curInn.batsmen[strikerIdx]) ? curInn.batsmen[strikerIdx] : { name: 'Batter', runs: 0, balls: 0 };
    
    const nonStrikerIdx = curInn.currentBatsmenIdx ? curInn.currentBatsmenIdx[curInn.strikerIdx === 0 ? 1 : 0] : null;
    const nonStriker = (nonStrikerIdx != null && curInn.batsmen[nonStrikerIdx]) ? curInn.batsmen[nonStrikerIdx] : { name: 'Batter', runs: 0, balls: 0 };
    
    const bowler = (curInn.bowlers && curInn.currentBowlerIdx != null) ? curInn.bowlers[curInn.currentBowlerIdx] : { name: 'Bowler', wickets: 0, runs: 0, balls: 0 };

    let effectiveSubMode = currentSubMode;
    if (m.currentInnings === 1 && effectiveSubMode === 1) effectiveSubMode = 3;

    let topText = `${curInn.wickets + 1}WKT PARTNERSHIP`;
    let botText = `TOSS: ${m.tossResult ? m.tossResult.toUpperCase() : 'N/A'}`;

    if (effectiveSubMode === 3) {
        if (m.currentInnings === 1 && m.innings[0]) {
            const target = m.innings[0].runs + 1;
            const needed = target - curInn.runs;
            const ballsLeft = (m.overs * m.ballsPerOver) - curInn.balls;
            topText = `TARGET: ${target}`;
            botText = `NEED ${needed} RUNS FROM ${ballsLeft} BALLS`;
        }
    } else if (effectiveSubMode === 2) {
        const crr = formatCRR(curInn.runs, curInn.balls);
        topText = `CURRENT RUN RATE`;
        botText = `CRR: ${crr}`;
    }

    const recentBalls = (curInn.currentOver || []).slice(-6).map(b => {
        let cls = b.wicket ? 'w' : (b.runs >= 4 ? 'boundary' : 'run');
        if (b.runs === 6) cls = 'boundary six';
        return `<div class="m4-ball ${cls}">${b.wicket ? 'W' : b.runs}</div>`;
    }).join('');

    let flashClass = '';
    if (_m4PrevWickets !== -1 && curInn.wickets > _m4PrevWickets) {
        flashClass = 'm4-wicket-flash';
    }
    _m4PrevWickets = curInn.wickets;

    let wrapper = container.querySelector('.m4-bar-wrapper');
    if (!wrapper) {
        container.innerHTML = `
            <div class="m4-bar-wrapper">
                <div class="m4-logo-box"><div class="m4-logo-circle" style="position:relative; overflow:hidden;"><span id="m4-t1-short"></span><img id="m4-t1-logo" src="" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:16px; z-index:2;" onerror="this.style.display='none'"></div></div>
                <div class="m4-batsmen">
                    <div class="m4-player">
                        <div class="m4-pname"><span class="striker-mark" id="m4-s1-mark"></span> <span id="m4-s1-name"></span></div>
                        <div class="m4-pruns" id="m4-s1-runs"></div>
                        <div class="m4-pballs" id="m4-s1-balls"></div>
                    </div>
                    <div class="m4-player">
                        <div class="m4-pname"><span class="striker-mark" id="m4-s2-mark"></span> <span id="m4-s2-name"></span></div>
                        <div class="m4-pruns" id="m4-s2-runs"></div>
                        <div class="m4-pballs" id="m4-s2-balls"></div>
                    </div>
                </div>
                <div class="m4-center-pill" id="m4-center-pill">
                    <div class="m4-pill-top" id="m4-pill-top"></div>
                    <div class="m4-pill-mid">
                        <span class="m4-teams" id="m4-teams-text"></span>
                        <span class="m4-score-box" id="m4-score-text"></span>
                        <span class="m4-phase-box">LIVE</span>
                        <span class="m4-overs" id="m4-overs-text"></span>
                    </div>
                    <div class="m4-pill-bot" id="m4-pill-bot"></div>
                </div>
                <div class="m4-bowler-section">
                    <div class="m4-bowler-stats">
                        <div class="m4-bname"><span class="striker-mark">▶</span> <span id="m4-b-name"></span></div>
                        <div class="m4-bwickets" id="m4-b-wkts"></div>
                        <div class="m4-bovers" id="m4-b-overs"></div>
                    </div>
                    <div class="m4-recent-balls" id="m4-recent-balls"></div>
                </div>
                <div class="m4-logo-box" style="width:70px; height:70px;"><div class="m4-logo-circle" style="width:100%; height:100%; position:relative; overflow:hidden; border:3px solid rgba(255,255,255,0.15);"><span id="m4-t2-short">${getShortName(t2Name)}</span><img id="m4-t2-logo" src="${t2Logo}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:0; z-index:2;" onerror="this.style.display='none'"></div></div>
            </div>
        `;
    }

    // Dynamic Style Adjustments for larger fonts
    const m4wrapper = container.querySelector('.m4-bar-wrapper');
    if (m4wrapper) {
        m4wrapper.style.gap = '25px';
        m4wrapper.style.padding = '0 30px';
    }

    const nameElements = container.querySelectorAll('.m4-pname');
    nameElements.forEach(el => {
        el.style.fontSize = '18px';
        el.style.fontWeight = '900';
    });

    // Update values only - no full innerHTML refresh
    const t1Short = document.getElementById('m4-t1-short');
    if (t1Short) t1Short.textContent = getShortName(t1Name);
    
    const t1Img = document.getElementById('m4-t1-logo');
    if (t1Img && t1Img.src !== new URL(t1Logo, document.baseURI).href) {
        t1Img.src = t1Logo;
        t1Img.style.display = 'block';
    }

    const s1Mark = document.getElementById('m4-s1-mark');
    if (s1Mark) s1Mark.innerHTML = curInn.strikerIdx === 0 ? '▶' : '&nbsp;';
    const s1Name = document.getElementById('m4-s1-name');
    if (s1Name) s1Name.textContent = striker.name || 'Batter';
    const s1Runs = document.getElementById('m4-s1-runs');
    if (s1Runs) s1Runs.textContent = striker.runs || 0;
    const s1Balls = document.getElementById('m4-s1-balls');
    if (s1Balls) s1Balls.textContent = striker.balls || 0;

    const s2Mark = document.getElementById('m4-s2-mark');
    if (s2Mark) s2Mark.innerHTML = curInn.strikerIdx === 1 ? '▶' : '&nbsp;';
    const s2Name = document.getElementById('m4-s2-name');
    if (s2Name) s2Name.textContent = nonStriker.name || 'Batter';
    const s2Runs = document.getElementById('m4-s2-runs');
    if (s2Runs) s2Runs.textContent = nonStriker.runs || 0;
    const s2Balls = document.getElementById('m4-s2-balls');
    if (s2Balls) s2Balls.textContent = nonStriker.balls || 0;

    const pTop = document.getElementById('m4-pill-top');
    if (pTop) pTop.textContent = topText;
    const tText = document.getElementById('m4-teams-text');
    if (tText) tText.innerHTML = `${t1Name || 'TEAM A'} <span class="v">v</span> ${t2Name || 'TEAM B'}`;
    const sText = document.getElementById('m4-score-text');
    if (sText) sText.textContent = `${curInn.runs}-${curInn.wickets}`;
    const oText = document.getElementById('m4-overs-text');
    if (oText) oText.textContent = formatOvers(curInn.balls, m.ballsPerOver);
    const pBot = document.getElementById('m4-pill-bot');
    if (pBot) pBot.textContent = botText;

    const bName = document.getElementById('m4-b-name');
    if (bName) bName.textContent = bowler.name || 'Bowler';
    const bWkts = document.getElementById('m4-b-wkts');
    if (bWkts) bWkts.textContent = `${bowler.wickets || 0}-${bowler.runs || 0}`;
    const bOvers = document.getElementById('m4-b-overs');
    if (bOvers) bOvers.textContent = formatOvers(bowler.balls, m.ballsPerOver);

    const rBalls = document.getElementById('m4-recent-balls');
    if (rBalls) rBalls.innerHTML = recentBalls;

    const t2Short = document.getElementById('m4-t2-short');
    if (t2Short) t2Short.textContent = getShortName(t2Name);
    const t2Img = document.getElementById('m4-t2-logo');
    if (t2Img && t2Img.src !== new URL(t2Logo, document.baseURI).href) {
        t2Img.src = t2Logo;
        t2Img.style.display = 'block';
    }

    if (flashClass) {
        const centerPill = document.getElementById('m4-center-pill');
        if (centerPill) {
            centerPill.classList.add('m4-wicket-flash');
            setTimeout(() => centerPill.classList.remove('m4-wicket-flash'), 1000);
        }
    }
}

function toggleBroadcastScorecard(mId) {
    const el = document.getElementById('broadcast-full-scorecard');
    if (!el) return;
    if (el.style.display === 'flex') {
        gsap.to(el, { opacity: 0, scale: 0.95, duration: 0.5, onComplete: () => el.style.display = 'none' });
    } else {
        const m = DB.getMatch(mId || matchId);
        if (m) {
            renderFullScorecardOverlay(m);
            el.style.display = 'flex';
            gsap.fromTo(el, { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'expo.out' });
        }
    }
}

function renderFullScorecardOverlay(m) {
    const el = document.getElementById('fs-content');
    if (!el) return;
    
    const inn = m.innings[m.currentInnings] || m.innings[0];
    if (!inn) return;

    let batsHtml = (inn.batsmen || []).map(b => `
        <div style="display:grid; grid-template-columns: 1fr 60px 60px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:700;">
            <div style="color:#fff;">${b.name.toUpperCase()} <small style="color:#aaa; font-weight:400; margin-left:10px;">${b.outDesc || 'not out'}</small></div>
            <div style="text-align:right; color:#ffd700;">${b.runs}</div>
            <div style="text-align:right; opacity:0.6;">${b.balls}</div>
        </div>
    `).join('');

    let bowlHtml = (inn.bowlers || []).map(b => `
        <div style="display:grid; grid-template-columns: 1fr 60px 60px 60px; padding:12px 20px; border-bottom:1px solid rgba(255,255,255,0.05); font-weight:700; opacity:0.9;">
            <div style="color:#fff;">${b.name.toUpperCase()}</div>
            <div style="text-align:right;">${formatOvers(b.balls)}</div>
            <div style="text-align:right; color:#38bdf8;">${b.runs}</div>
            <div style="text-align:right; color:#ff1744;">${b.wickets}</div>
        </div>
    `).join('');

    el.innerHTML = `
        <div style="background:rgba(26, 35, 126, 0.9); padding:25px; border-radius:15px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="font-size:14px; opacity:0.7; letter-spacing:2px;">NOW BATTING</div>
                <div style="font-size:36px; font-weight:950; color:#fff;">${inn.battingTeam.toUpperCase()}</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:48px; font-weight:950; color:#ffd700;">${inn.runs}/${inn.wickets} <small style="font-size:24px; color:#fff; opacity:0.6;">(${formatOvers(inn.balls)})</small></div>
            </div>
        </div>
        <div class="fs-grid">
            <div class="fs-column" style="background:rgba(0,0,0,0.2); border-radius:15px; overflow:hidden;">
                <div style="background:rgba(255,255,255,0.1); padding:10px 20px; font-size:12px; font-weight:900; letter-spacing:2px; color:#aaa;">BATSMEN</div>
                ${batsHtml}
            </div>
            <div class="fs-column" style="background:rgba(0,0,0,0.2); border-radius:15px; overflow:hidden;">
                <div style="background:rgba(255,255,255,0.1); padding:10px 20px; font-size:12px; font-weight:900; letter-spacing:2px; color:#aaa;">BOWLERS</div>
                ${bowlHtml}
            </div>
        </div>
    `;
}

function showTeamCardGraphic(data) {
    if (!data || !data.teamName) return;
    // Remove any existing team card first
    document.querySelectorAll('.broadcast-team-card').forEach(el => el.remove());

    const el = document.createElement('div');
    el.className = 'broadcast-overlay broadcast-team-card';
    el.style.display = 'block';
    el.style.right = '40px'; el.style.top = '50%'; el.style.transform = 'translateY(-50%)';
    el.style.left = 'auto';

    const players = data.players || [];
    const playersHtml = players.map(p => `
        <div style="display:flex; align-items:center; gap:12px; padding:9px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
            <img src="${p.photo || OVERLAY_DEFAULT_PLAYER_PHOTO}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid rgba(0,230,118,0.4);flex-shrink:0;" onerror="this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'">
            <div style="flex:1;min-width:0;">
                <div style="font-size:15px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${(p.name||'PLAYER').toUpperCase()}</div>
                <div style="font-size:9px;color:#00e676;font-weight:700;letter-spacing:1px;">${(p.role||'PLAYER').toUpperCase()}</div>
            </div>
        </div>
    `).join('');

    el.innerHTML = `
        <div style="background:rgba(10,15,35,0.94);backdrop-filter:blur(20px);padding:28px;border-radius:0;border-left:5px solid #00e676;color:white;width:370px;max-height:600px;overflow:hidden;box-shadow:-15px 0 50px rgba(0,0,0,0.6);">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid rgba(0,230,118,0.2);">
                <img src="${data.teamLogo || OVERLAY_DEFAULT_PLAYER_PHOTO}" style="width:54px;height:54px;border-radius:10px;object-fit:cover;border:2px solid rgba(0,230,118,0.4);flex-shrink:0;" onerror="this.style.display='none'">
                <div>
                    <div style="font-size:10px;color:#00e676;letter-spacing:3px;font-weight:900;">MATCH SQUAD</div>
                    <div style="font-size:26px;font-weight:950;line-height:1.1;">${data.teamName.toUpperCase()}</div>
                </div>
            </div>
            <div style="max-height:500px;overflow:hidden;">${playersHtml}</div>
        </div>
    `;
    document.body.appendChild(el);
    gsap.fromTo(el, { x: 400, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
    // Stays until STOP ALL
}

function showGuestGraphic(data) {
    const photo = data.playerPhoto || data.photo || OVERLAY_DEFAULT_PLAYER_PHOTO;
    const name = (data.playerName || data.name || 'GUEST').toUpperCase();
    const role = (data.title || 'SPECIAL GUEST').toUpperCase();

    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.display = 'block';
    el.style.left = '40px'; el.style.bottom = '130px';
    el.style.top = 'auto'; el.style.transform = 'none';

    el.innerHTML = `
        <div style="display:flex;align-items:flex-end;gap:0;overflow:hidden;border-radius:15px 15px 15px 0;box-shadow:0 20px 50px rgba(0,0,0,0.5);">
            <img src="${photo}" style="width:180px;height:220px;object-fit:cover;flex-shrink:0;" onerror="this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'">
            <div style="background:linear-gradient(135deg,#0f172a,#1a2540);border-left:5px solid #ffd700;padding:20px 22px;min-width:240px;">
                <div style="font-size:10px;color:#ffd700;letter-spacing:3px;font-weight:900;margin-bottom:6px;">${role}</div>
                <div style="font-size:24px;font-weight:950;color:#fff;line-height:1.1;">${name}</div>
            </div>
        </div>
    `;
    document.body.appendChild(el);
    gsap.fromTo(el, { x: -500, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
    setTimeout(() => gsap.to(el, { x: -500, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 12000);
}

function toggleBroadcastSummary(tId) {
    const el = document.getElementById('broadcast-summary');
    if (!el) return;
    if (el.style.display === 'block') {
        gsap.to(el, { opacity: 0, y: 100, duration: 0.5, onComplete: () => el.style.display = 'none' });
    } else {
        el.style.display = 'block';
        gsap.fromTo(el, { opacity: 0, y: 100 }, { opacity: 1, y: 0, duration: 0.6 });
    }
}

function showRunsBallsGraphic(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.inset = '0';
    el.innerHTML = `<div style="background:linear-gradient(135deg, #2a1458, #110524); border:2px solid #00e676; padding:40px; border-radius:30px; color:white; text-align:center; min-width:400px; box-shadow:0 20px 50px rgba(0,0,0,0.5);">
        <div style="font-size:14px; color:#00e676; letter-spacing:4px; margin-bottom:10px; font-weight:900;">RUNS NEEDED</div>
        <div style="font-size:72px; font-weight:950;">${data.runs}</div>
        <div style="font-size:24px; opacity:0.7; font-weight:700;">FROM ${data.balls} BALLS</div>
    </div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { y: 100, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'back.out' });
    setTimeout(() => gsap.to(el, { y: 100, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 8000);
}

function showNextMatchGraphic(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.alignItems = 'center';
    el.innerHTML = `<div style="background:rgba(15, 23, 42, 0.95); backdrop-filter:blur(10px); padding:40px 60px; border-radius:40px; border:1px solid rgba(255,255,255,0.1); color:white; min-width:800px; display:flex; align-items:center; gap:50px; position:relative; margin-bottom: 250px;">
        <div style="flex:1; text-align:right; font-size:40px; font-weight:950;">${(data.teamA || 'TEAM A').toUpperCase()}</div>
        <div style="background:#e61b4d; color:white; padding:10px 20px; font-weight:950; font-size:24px; border-radius:10px;">VS</div>
        <div style="flex:1; text-align:left; font-size:40px; font-weight:950;">${(data.teamB || 'TEAM B').toUpperCase()}</div>
        <div style="position:absolute; top:-20px; left:50%; transform:translateX(-50%); background:#00e676; color:black; padding:5px 20px; border-radius:20px; font-size:12px; font-weight:900; letter-spacing:2px; white-space:nowrap;">COMING UP NEXT</div>
    </div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { scale: 0.8, opacity: 0, y: -50 }, { scale: 1, opacity: 1, y: 0, duration: 0.8, ease: 'expo.out' });
    setTimeout(() => gsap.to(el, { scale: 0.8, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 5000);
}

function showCRRGraphic(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.display = 'flex';
    el.style.alignItems = 'flex-end';
    el.style.justifyContent = 'flex-end';
    el.style.inset = '0';
    el.style.padding = '40px';
    el.innerHTML = `<div style="background:rgba(0,0,0,0.9); padding:30px 60px; border-radius:100px; border:2px solid #3b82f6; color:white; display:flex; align-items:center; gap:30px; box-shadow:0 0 30px rgba(59,130,246,0.3);">
        <div style="font-size:14px; font-weight:900; color:#3b82f6; letter-spacing:3px;">CURRENT RUN RATE</div>
        <div style="font-size:50px; font-weight:950;">${data.crr || '0.00'}</div>
    </div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { x: 200, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'power4.out' });
    setTimeout(() => gsap.to(el, { x: 200, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 7000);
}

function showBigEventGraphic(data) {
    if (!data) return;
    const type = (data.type || data.event || 'EVENT').toUpperCase();
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.inset = '0';
    
    let bg = 'linear-gradient(135deg, #2962ff 0%, #00b0ff 100%)'; // Default
    if (type === 'FOUR') bg = 'linear-gradient(135deg, #1a237e 0%, #2962ff 100%)';
    if (type === 'SIX') bg = 'linear-gradient(135deg, #4a148c 0%, #7c4dff 100%)';
    if (type === 'WICKET') bg = 'linear-gradient(135deg, #b71c1c 0%, #ff1744 100%)';

    el.innerHTML = `
        <div style="background:${bg}; backdrop-filter:blur(25px); color:white; padding:50px 100px; border-radius:100px; border:8px solid rgba(255,255,255,0.3); box-shadow:0 0 120px rgba(0,0,0,0.8); text-align:center; transform: skewX(-10deg);">
            <div style="font-size:140px; font-weight:950; letter-spacing:10px; text-shadow:0 15px 40px rgba(0,0,0,0.6); line-height:1; font-style:italic;">${type}</div>
            <div style="font-size:32px; font-weight:800; letter-spacing:8px; margin-top:15px; color:rgba(255,255,255,0.9); text-transform:uppercase;">${(data.playerName || '').toUpperCase()}</div>
        </div>
    `;
    document.body.appendChild(el);
    gsap.fromTo(el, { scale: 0.2, opacity: 0, rotation: -15 }, { scale: 1.1, opacity: 1, rotation: 0, duration: 0.6, ease: 'back.out(2)' });
    gsap.to(el, { scale: 1, duration: 0.2, delay: 0.6 });
    
    // Quick Pulse
    gsap.to(el, { scale: 1.03, duration: 0.3, repeat: 5, yoyo: true, delay: 0.8 });
    
    setTimeout(() => {
        gsap.to(el, { scale: 0, opacity: 0, rotation: 15, duration: 0.5, onComplete: () => el.remove() });
    }, 4000);
}

function showStrikerProfileLeft(data, label = 'STRIKER') {
    const photo = data.playerPhoto || data.profile?.photo || OVERLAY_DEFAULT_PLAYER_PHOTO;
    const nameStr = (data.playerName || data.name || 'PLAYER').toUpperCase();
    const val1 = data.playerRuns !== undefined ? data.playerRuns : (data.stats?.runs !== undefined ? data.stats.runs : (data.stats?.wickets || 0));
    const val2 = data.playerBalls !== undefined ? data.playerBalls : (data.stats?.balls !== undefined ? data.stats.balls : (data.stats?.bowlingRuns || 0));
    const val3 = data.playerSixes !== undefined ? data.playerSixes : (data.stats?.sixes !== undefined ? data.stats.sixes : (data.stats?.overs || 0));
    
    let accentColor = '#00e676';
    let lbl1 = 'RUNS', lbl2 = 'BALLS', lbl3 = 'SIXES';

    if (label.toUpperCase().includes('NON')) {
        accentColor = '#2962ff'; // Blue
    } else if (label.toUpperCase().includes('BOWL')) {
        accentColor = '#7c4dff'; // Purple
        lbl1 = 'WICKETS'; lbl2 = 'RUNS'; lbl3 = 'OVERS';
    }

    const nameParts = nameStr.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.display = 'block';
    el.style.left = '40px'; el.style.top = '50%'; el.style.transform = 'translateY(-50%)';

    el.innerHTML = `
        <div style="width:240px; background:#1a202c; border-radius:15px; overflow:hidden; border-left:6px solid ${accentColor}; box-shadow:0 15px 35px rgba(0,0,0,0.5);">
            <div style="padding:15px 15px 10px 15px; background:#1a202c;">
                <div style="color:${accentColor}; font-size:10px; font-weight:900; letter-spacing:2px;">${label.toUpperCase()}</div>
            </div>
            <div style="height:220px; background:#2d3748; display:flex; justify-content:center; align-items:flex-end;">
                <img src="${photo}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'">
            </div>
            <div style="background:#0f172a; padding:15px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="font-weight:900; font-size:22px; color:#fff; line-height:1.1;">${firstName}</div>
                ${lastName ? `<div style="font-weight:950; font-size:22px; color:${accentColor}; line-height:1.1;">${lastName}</div>` : ''}
            </div>
            <div style="background:#1a202c; padding:15px; display:flex; justify-content:space-between; align-items:center;">
                <div style="text-align:center; flex:1;">
                    <div style="color:#fff; font-size:18px; font-weight:950; line-height:1;">${val1}</div>
                    <div style="color:${accentColor}; font-size:8px; font-weight:900; letter-spacing:1px; margin-top:4px;">${lbl1}</div>
                </div>
                <div style="text-align:center; flex:1; border-left:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1);">
                    <div style="color:#fff; font-size:18px; font-weight:950; line-height:1;">${val2}</div>
                    <div style="color:${accentColor}; font-size:8px; font-weight:900; letter-spacing:1px; margin-top:4px;">${lbl2}</div>
                </div>
                <div style="text-align:center; flex:1;">
                    <div style="color:#fff; font-size:18px; font-weight:950; line-height:1;">${val3}</div>
                    <div style="color:${accentColor}; font-size:8px; font-weight:900; letter-spacing:1px; margin-top:4px;">${lbl3}</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(el);
    gsap.fromTo(el, { x: -500, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
    setTimeout(() => gsap.to(el, { x: -500, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 5000);
}

function showBowlerProfileGraphic(data) {
    // Stats are now sent as flat fields: playerRuns=wickets, playerBalls=runsGiven, playerSixes=overs
    showStrikerProfileLeft(data, 'BOWLER');
}

function showPartnershipGraphicCinema(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    
    // Fallbacks — support both old and new data shape
    const p1Photo = (data.p1Profile && data.p1Profile.photo) || data.player1Photo || OVERLAY_DEFAULT_PLAYER_PHOTO;
    const p2Photo = (data.p2Profile && data.p2Profile.photo) || data.player2Photo || OVERLAY_DEFAULT_PLAYER_PHOTO;
    const p1Name = (data.player1 || 'BATSMAN 1').toUpperCase();
    const p2Name = (data.player2 || 'BATSMAN 2').toUpperCase();
    const runs = data.runs || 0;
    const balls = data.balls || 0;
    const wicketNum = data.wicketNumber || data.wicketNum || 1;
    const teamName = (data.battingTeam || data.teamName || 'TBD').toUpperCase();

    // Suffix logic (1st, 2nd, 3rd, etc)
    let suffix = 'TH';
    if (wicketNum % 10 === 1 && wicketNum !== 11) suffix = 'ST';
    if (wicketNum % 10 === 2 && wicketNum !== 12) suffix = 'ND';
    if (wicketNum % 10 === 3 && wicketNum !== 13) suffix = 'RD';
    const wicketLabel = `${wicketNum}${suffix} WICKET PARTNERSHIP`;

    el.style.inset = '0';
    el.style.display = 'flex';
    el.style.alignItems = 'flex-end';
    el.style.justifyContent = 'center';
    el.style.paddingBottom = '100px';

    el.innerHTML = `
        <div style="display:flex; align-items:flex-end; gap:20px;">
            <!-- Player 1 (Left) -->
            <div class="partnership-player-card" style="width:240px; background:#1a202c; border-radius:15px; overflow:hidden; border-left:6px solid #00e676; box-shadow:0 15px 35px rgba(0,0,0,0.4);">
                <div style="height:220px; background:#2d3748; display:flex; justify-content:center; align-items:flex-end;">
                    <img src="${p1Photo}" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div style="background:#0f172a; padding:15px; text-align:center;">
                    <div style="font-weight:900; font-size:18px; color:#fff; letter-spacing:1px;">${p1Name}</div>
                </div>
            </div>

            <!-- Partnership Stats (Center) -->
            <div class="partnership-center-card" style="background:linear-gradient(to right, rgba(15,23,42,0) 0%, rgba(15,23,42,0.95) 20%, rgba(15,23,42,0.95) 80%, rgba(15,23,42,0) 100%); padding:30px 60px; min-width:500px; text-align:center; position:relative;">
                <div style="position:absolute; top:0; left:20%; right:20%; height:4px; background:#00e676;"></div>
                <div style="position:absolute; bottom:0; left:20%; right:20%; height:4px; background:#00e676;"></div>
                <div style="color:#00e676; font-weight:900; font-size:14px; letter-spacing:4px; margin-bottom:15px;">${wicketLabel}</div>
                <div style="display:flex; align-items:center; justify-content:center; gap:25px;">
                    <div style="font-size:70px; font-weight:950; color:#fff; line-height:1;">${runs}</div>
                    <div style="width:2px; height:60px; background:rgba(255,255,255,0.2);"></div>
                    <div style="text-align:left;">
                        <div style="font-size:24px; font-weight:950; color:#fff; line-height:1;">${balls} <span style="font-size:14px; color:#aaa;">BALLS</span></div>
                        <div style="font-size:16px; font-weight:900; color:#00e676; margin-top:5px;">${teamName}</div>
                    </div>
                </div>
            </div>

            <!-- Player 2 (Right) -->
            <div class="partnership-player-card" style="width:240px; background:#1a202c; border-radius:15px; overflow:hidden; border-right:6px solid #00e676; box-shadow:0 15px 35px rgba(0,0,0,0.4);">
                <div style="height:220px; background:#2d3748; display:flex; justify-content:center; align-items:flex-end;">
                    <img src="${p2Photo}" style="width:100%; height:100%; object-fit:cover;">
                </div>
                <div style="background:#0f172a; padding:15px; text-align:center;">
                    <div style="font-weight:900; font-size:18px; color:#fff; letter-spacing:1px;">${p2Name}</div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(el);
    
    const centerCard = el.querySelector('.partnership-center-card');
    const playerCards = el.querySelectorAll('.partnership-player-card');

    gsap.fromTo(centerCard, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'expo.out' });
    gsap.fromTo(playerCards[0], { x: -100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, delay: 0.2, ease: 'back.out' });
    gsap.fromTo(playerCards[1], { x: 100, opacity: 0 }, { x: 0, opacity: 1, duration: 0.7, delay: 0.2, ease: 'back.out' });

    setTimeout(() => gsap.to(el, { y: 100, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 5000);
}

function showTeamRosterGraphic(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'flex-end';
    el.style.inset = '0';
    el.style.paddingRight = '40px';
    const playersHtml = (data.players || []).map(p => `
        <div style="padding:10px; border-bottom:1px solid rgba(255,255,255,0.1); font-size:20px; font-weight:700;">${p.toUpperCase()}</div>
    `).join('');
    
    el.innerHTML = `<div style="background:rgba(15, 23, 42, 0.85); backdrop-filter:blur(15px); padding:40px; border-radius:40px; border:2px solid rgba(59, 130, 246, 0.5); color:white; min-width:500px; box-shadow:0 30px 60px rgba(0,0,0,0.6);">
        <div style="color:#3b82f6; font-weight:900; letter-spacing:4px; margin-bottom:20px;">${(data.teamName || 'TEAM').toUpperCase()} SQUAD</div>
        <div style="max-height:600px; overflow-y:hidden;">${playersHtml}</div>
    </div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: 'expo.out' });
    // Removed setTimeout so it stays until "Stop All" is pressed
}



function showBatterProfilesGraphic(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.left = '40px'; 
    el.style.top = '50%'; 
    el.style.transform = 'translateY(-50%)';
    el.style.display = 'flex';
    el.style.gap = '20px';

    const profiles = data.profiles || [];
    if (!profiles || profiles.length === 0) return;
    
    const html = profiles.map((p, idx) => {
        const isNonStriker = idx === 1;
        const label = isNonStriker ? 'NON-STRIKER' : 'STRIKER';
        const accentColor = isNonStriker ? '#2962ff' : '#00e676';
        
        const photo = p.profile?.photo || p.playerPhoto || OVERLAY_DEFAULT_PLAYER_PHOTO;
        const nameStr = (p.name || p.playerName || 'BATSMAN').toUpperCase();
        const runs = p.stats?.runs || p.playerRuns || 0;
        const balls = p.stats?.balls || p.playerBalls || 0;
        const sixes = p.stats?.sixes || p.playerSixes || 0;

        const nameParts = nameStr.split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

        return `
        <div style="width:240px; background:#1a202c; border-radius:15px; overflow:hidden; border-left:6px solid ${accentColor}; box-shadow:0 15px 35px rgba(0,0,0,0.5);">
            <div style="padding:15px 15px 10px 15px; background:#1a202c;">
                <div style="color:${accentColor}; font-size:10px; font-weight:900; letter-spacing:2px;">${label}</div>
            </div>
            <div style="height:220px; background:#2d3748; display:flex; justify-content:center; align-items:flex-end;">
                <img src="${photo}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='${OVERLAY_DEFAULT_PLAYER_PHOTO}'">
            </div>
            <div style="background:#0f172a; padding:15px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="font-weight:900; font-size:22px; color:#fff; line-height:1.1;">${firstName}</div>
                ${lastName ? `<div style="font-weight:950; font-size:22px; color:${accentColor}; line-height:1.1;">${lastName}</div>` : ''}
            </div>
            <div style="background:#1a202c; padding:15px; display:flex; justify-content:space-between; align-items:center;">
                <div style="text-align:center; flex:1;">
                    <div style="color:#fff; font-size:18px; font-weight:950; line-height:1;">${runs}</div>
                    <div style="color:${accentColor}; font-size:8px; font-weight:900; letter-spacing:1px; margin-top:4px;">RUNS</div>
                </div>
                <div style="text-align:center; flex:1; border-left:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.1);">
                    <div style="color:#fff; font-size:18px; font-weight:950; line-height:1;">${balls}</div>
                    <div style="color:${accentColor}; font-size:8px; font-weight:900; letter-spacing:1px; margin-top:4px;">BALLS</div>
                </div>
                <div style="text-align:center; flex:1;">
                    <div style="color:#fff; font-size:18px; font-weight:950; line-height:1;">${sixes}</div>
                    <div style="color:${accentColor}; font-size:8px; font-weight:900; letter-spacing:1px; margin-top:4px;">SIXES</div>
                </div>
            </div>
        </div>
        `;
    }).join('');

    el.innerHTML = html;
    document.body.appendChild(el);
    
    // Safe GSAP animation with null checks
    try {
        const cards = Array.from(el.querySelectorAll('div[style*="width:240px"]'));
        if (cards && cards.length > 0 && typeof gsap !== 'undefined') {
            gsap.fromTo(cards, { x: -500, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, stagger: 0.2, ease: 'expo.out' });
            setTimeout(() => {
                if (el.parentNode) {
                    gsap.to(cards, { x: -500, opacity: 0, duration: 0.6, stagger: 0.1, onComplete: () => {
                        if (el.parentNode) el.remove();
                    }});
                }
            }, 5000);
        } else {
            // Fallback if GSAP not available
            setTimeout(() => {
                if (el.parentNode) el.remove();
            }, 5000);
        }
    } catch(err) {
        console.warn('GSAP animation error:', err);
        // Fallback timeout
        setTimeout(() => {
            if (el.parentNode) el.remove();
        }, 5000);
    }
}

