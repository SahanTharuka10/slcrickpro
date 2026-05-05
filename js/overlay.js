let matchId = null;
let tournId = null;
let isMasterOverlay = false;

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
    const socket = window._cricproSocket || (typeof io !== 'undefined' ? io(baseUrl, { transports: ['polling', 'websocket'] }) : null);

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
        
        let targetUrl = '';
        if (isMasterOverlay && !matchId) {
            targetUrl = baseUrl + '/api/active-match' + (tournId ? '?tournamentId=' + tournId : '');
        } else {
            targetUrl = baseUrl + '/tv/matches/' + matchId + '/light';
        }
        
        fetch(targetUrl)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || data.error) return;
                
                // If master mode, data represents the active match
                if (isMasterOverlay && data.fullMatch) {
                    if (matchId !== data.fullMatch.id) {
                        matchId = data.fullMatch.id; // Switch to the active match
                        if (socket) socket.emit('join_match', matchId);
                    }
                }
                
                latestSocketScore = data.score ? data : (data.fullMatch ? { score: data.fullMatch.innings[data.fullMatch.currentInnings], fullMatch: data.fullMatch } : null);
                if (latestSocketScore && latestSocketScore.fullMatch && typeof DB !== 'undefined') DB.saveMatch(latestSocketScore.fullMatch);
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
    if (!cmd || !window.gsap) return;
    
    if (cmd === 'STOP_OVERLAY' || cmd === 'CLEAR_STAY_OVERLAYS' || cmd === 'STOP_ALL') {
        hideAllBroadcastOverlays();
        return;
    }
    if (cmd === 'FORCE_UPDATE') {
        renderOverlay();
        return;
    }
    if (cmd === 'TOGGLE_SCOREBAR') {
        isScorebarVisible = !isScorebarVisible;
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
                if (typeof DB !== 'undefined') DB.saveMatch(data.match);
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
    gsap.to('.broadcast-overlay', { opacity: 0, scale: 0.9, duration: 0.4, onComplete: () => {
        document.querySelectorAll('.broadcast-overlay').forEach(el => el.remove());
    }});
}

function renderOverlay() {
    const m = (typeof DB !== 'undefined') ? DB.getMatch(matchId) : null;
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

    const t1Name = curInn.battingTeam;
    const t2Name = curInn.bowlingTeam;
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

    container.innerHTML = `
        <div class="m4-bar-wrapper">
            <!-- Left Logo -->
            <div class="m4-logo-box"><div class="m4-logo-circle" style="position:relative; overflow:hidden;">${getShortName(t1Name)}<img src="${t1Logo}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:16px; z-index:2;" onerror="this.style.display='none'"></div></div>
            
            <!-- Batsmen Section -->
            <div class="m4-batsmen">
                <div class="m4-player">
                    <div class="m4-pname"><span class="striker-mark">${curInn.strikerIdx === 0 ? '▶' : '&nbsp;'}</span> ${striker.name || 'Batter'}</div>
                    <div class="m4-pruns">${striker.runs || 0}</div>
                    <div class="m4-pballs">${striker.balls || 0}</div>
                </div>
                <div class="m4-player">
                    <div class="m4-pname"><span class="striker-mark">${curInn.strikerIdx === 1 ? '▶' : '&nbsp;'}</span> ${nonStriker.name || 'Batter'}</div>
                    <div class="m4-pruns">${nonStriker.runs || 0}</div>
                    <div class="m4-pballs">${nonStriker.balls || 0}</div>
                </div>
            </div>
            
            <!-- Center Dark Pill -->
            <div class="m4-center-pill ${flashClass}">
                <div class="m4-pill-top">${topText}</div>
                <div class="m4-pill-mid">
                    <span class="m4-teams">${t1Name || 'TEAM A'} <span class="v">v</span> ${t2Name || 'TEAM B'}</span>
                    <span class="m4-score-box">${curInn.runs}-${curInn.wickets}</span>
                    <span class="m4-phase-box">P1</span>
                    <span class="m4-overs">${formatOvers(curInn.balls, m.ballsPerOver)}</span>
                </div>
                <div class="m4-pill-bot">${botText}</div>
            </div>
            
            <!-- Bowler & Recent Balls Section -->
            <div class="m4-bowler-section">
                <div class="m4-bowler-stats">
                    <div class="m4-bname"><span class="striker-mark">▶</span> ${bowler.name || 'Bowler'}</div>
                    <div class="m4-bwickets">${bowler.wickets || 0}-${bowler.runs || 0}</div>
                    <div class="m4-bovers">${formatOvers(bowler.balls, m.ballsPerOver)}</div>
                </div>
                <div class="m4-recent-balls">
                    ${recentBalls}
                </div>
            </div>
            
            <!-- Right Logo -->
            <div class="m4-logo-box"><div class="m4-logo-circle" style="position:relative; overflow:hidden;">${getShortName(t2Name)}<img src="${t2Logo}" style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; border-radius:16px; z-index:2;" onerror="this.style.display='none'"></div></div>
        </div>
    `;
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
    el.innerHTML = `<div style="background:rgba(15, 23, 42, 0.95); backdrop-filter:blur(10px); padding:40px 60px; border-radius:40px; border:1px solid rgba(255,255,255,0.1); color:white; min-width:800px; display:flex; align-items:center; gap:50px; position:relative;">
        <div style="flex:1; text-align:right; font-size:40px; font-weight:950;">${(data.teamA || 'TEAM A').toUpperCase()}</div>
        <div style="background:#e61b4d; color:white; padding:10px 20px; font-weight:950; font-size:24px; border-radius:10px;">VS</div>
        <div style="flex:1; text-align:left; font-size:40px; font-weight:950;">${(data.teamB || 'TEAM B').toUpperCase()}</div>
        <div style="position:absolute; top:-20px; left:50%; transform:translateX(-50%); background:#00e676; color:black; padding:5px 20px; border-radius:20px; font-size:12px; font-weight:900; letter-spacing:2px; white-space:nowrap;">COMING UP NEXT</div>
    </div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.8, ease: 'expo.out' });
    setTimeout(() => gsap.to(el, { scale: 0.8, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 10000);
}

function showCRRGraphic(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
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
    
    let bg = 'linear-gradient(135deg, #2962ff 0%, #00b0ff 100%)'; // Default
    if (type === 'FOUR') bg = 'linear-gradient(135deg, #1a237e 0%, #2962ff 100%)';
    if (type === 'SIX') bg = 'linear-gradient(135deg, #4a148c 0%, #7c4dff 100%)';
    if (type === 'WICKET') bg = 'linear-gradient(135deg, #b71c1c 0%, #ff1744 100%)';

    el.innerHTML = `
        <div style="background:${bg}; backdrop-filter:blur(20px); color:white; padding:60px 120px; border-radius:30px; border:4px solid rgba(255,255,255,0.2); box-shadow:0 0 100px rgba(0,0,0,0.5); text-align:center;">
            <div style="font-size:120px; font-weight:950; letter-spacing:15px; text-shadow:0 10px 30px rgba(0,0,0,0.5); line-height:1;">${type}</div>
            <div style="font-size:24px; font-weight:800; letter-spacing:5px; margin-top:20px; opacity:0.8;">${(data.playerName || '').toUpperCase()}</div>
        </div>
    `;
    document.body.appendChild(el);
    gsap.fromTo(el, { scale: 0.5, opacity: 0, y: 100 }, { scale: 1, opacity: 1, y: 0, duration: 0.8, ease: 'back.out(1.7)' });
    
    // Pulse effect
    gsap.to(el, { scale: 1.05, duration: 0.4, repeat: 7, yoyo: true });
    
    setTimeout(() => {
        gsap.to(el, { scale: 1.5, opacity: 0, filter: 'blur(20px)', duration: 0.6, onComplete: () => el.remove() });
    }, 6000);
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
    gsap.fromTo(el.children, { x: -500, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, stagger: 0.2, ease: 'expo.out' });
    setTimeout(() => gsap.to(el.children, { x: -500, opacity: 0, duration: 0.6, stagger: 0.1, onComplete: () => el.remove() }), 5000);
}

