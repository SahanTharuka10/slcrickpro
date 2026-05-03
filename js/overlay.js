let matchId = new URLSearchParams(window.location.search).get('match') || new URLSearchParams(window.location.search).get('matchId');
let tournId = new URLSearchParams(window.location.search).get('tournament') || new URLSearchParams(window.location.search).get('tournamentId');
let refreshInterval;
let currentPopupView = null;
let latestSocketScore = null;
let latestSocketScoreTime = 0; 
let isScorebarVisible = true;
let currentOverlayMode = 1;
let currentSubMode = 1;

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

    if (!matchId && !tournId) {
        document.getElementById('overlay-container').innerHTML = '<div style="padding: 20px; color: red;">No Match or Tournament ID!</div>';
        return;
    }

    // ── Backend & Socket ──────────────────────────────────
    const baseUrl = window.BACKEND_BASE_URL || (typeof DB !== 'undefined' ? DB.getCloudURL() : "https://slcrickpro.onrender.com");
    const socket = window._cricproSocket || (typeof io !== 'undefined' ? io(baseUrl, { transports: ['polling', 'websocket'] }) : null);

    if (socket) {
        socket.emit('join_global', {});
        if (matchId) socket.emit('join_match', matchId);
        socket.on('scoreUpdate', (data) => {
            latestSocketScore = data;
            renderOverlay();
        });
        socket.on('broadcast_command', (payload) => {
            handleBroadcastCommand(payload.cmd, payload.data);
        });
    }

    // ── Server Polling Fallback ───────────────────────────
    function pollServerScore() {
        if (!matchId && !tournId) return;
        const targetUrl = matchId ? (baseUrl + '/tv/matches/' + matchId + '/light') : (baseUrl + '/sync/matches');
        fetch(targetUrl)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
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
    
    if (cmd === 'STOP_OVERLAY') {
        hideAllBroadcastOverlays();
        return;
    }

    switch (cmd) {
        case 'SHOW_RUNS_BALLS': showRunsBallsGraphic(data); break;
        case 'SHOW_NEXT_MATCH': showNextMatchGraphic(data); break;
        case 'SHOW_SCORECARD': toggleBroadcastScorecard(data.matchId || matchId); break;
        case 'SHOW_SUMMARY': toggleBroadcastSummary(data.tournamentId || tournId); break;
        case 'SHOW_CRR': showCRRGraphic(data); break;
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
        case 'SHOW_TEAM_ROSTER': showTeamRosterGraphic(data); break;
        case 'SHOW_BIG_EVENT': showBigEventGraphic(data); break;
        case 'SHOW_STRIKER_PROFILE': showStrikerProfileLeft(data); break;
        case 'SHOW_NON_STRIKER_PROFILE': showStrikerProfileLeft(data, 'NON-STRIKER'); break;
        case 'SHOW_BOWLER_PROFILE': showBowlerProfileGraphic(data); break;
        case 'SHOW_PARTNERSHIP': showPartnershipGraphicCinema(data); break;
        case 'SHOW_GUEST': showGuestGraphic(data); break;
    }
}

function hideAllBroadcastOverlays() {
    gsap.to('.broadcast-overlay', { opacity: 0, scale: 0.9, duration: 0.4, onComplete: () => {
        document.querySelectorAll('.broadcast-overlay').forEach(el => el.style.display = 'none');
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

    let infoHtml = '';
    if (effectiveSubMode === 1) {
        const tourney = (typeof DB !== 'undefined') ? DB.getTournament(m.tournamentId) : null;
        const ground = m.venue || (tourney ? tourney.venue : 'STADIUM');
        const dateStr = m.date || new Date().toLocaleDateString();
        infoHtml = `<div class="m4-info-item"><div class="label" style="color:#00e676">${ground.toUpperCase()}</div><div class="value" style="font-size:16px">${dateStr}</div></div>`;
    } else if (effectiveSubMode === 2) {
        const crr = formatCRR(curInn.runs, curInn.balls);
        infoHtml = `<div class="m4-info-item"><div class="label">CRR</div><div class="value highlight">${crr}</div></div>`;
    } else {
        if (m.currentInnings === 1 && m.innings[0]) {
            const target = m.innings[0].runs + 1;
            const needed = target - curInn.runs;
            const ballsLeft = (m.overs * m.ballsPerOver) - curInn.balls;
            infoHtml = `<div class="m4-info-item"><div class="label" style="color:#ff1744">NEED ${needed} RUNS</div><div class="value" style="font-size:18px">${ballsLeft} BALLS</div></div>`;
        } else {
            infoHtml = `<div class="m4-info-item"><div class="label">1ST INNINGS</div><div class="value">${getShortName(curInn.battingTeam)} BATTING</div></div>`;
        }
    }

    const recentBalls = (curInn.currentOver || []).slice(-6).map(b => {
        let cls = b.wicket ? 'w' : (b.runs >= 4 ? 'b' : '');
        return `<div class="m4-ball ${cls}">${b.wicket ? 'W' : b.runs}</div>`;
    }).join('');

    let flashClass = '';
    if (_m4PrevWickets !== -1 && curInn.wickets > _m4PrevWickets) {
        flashClass = 'm4-wicket-flash';
    }
    _m4PrevWickets = curInn.wickets;

    container.innerHTML = `
        <div class="m4-bar-wrapper">
            <div class="m4-logo left"><img src="${t1Logo}"></div>
            <div class="m4-section m4-score-section ${flashClass}">
                <div class="m4-team-name">${getShortName(t1Name)}</div>
                <div class="m4-main-score">${curInn.runs}-${curInn.wickets}</div>
                <div class="m4-overs">${formatOvers(curInn.balls, m.ballsPerOver)}</div>
            </div>
            <div class="m4-section m4-players-section">
                <div style="display:flex; flex-direction:column; justify-content:center; width:100%; gap:4px;">
                    <div class="m4-player active">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <img class="m4-striker-photo" src="${(typeof DB !== 'undefined') ? DB.getPlayerPhoto(striker.playerId) : OVERLAY_DEFAULT_PLAYER_PHOTO}" style="width:30px; height:30px; border:2px solid #00e676; border-radius:50%; object-fit:cover;">
                            <span class="name">${striker.name.toUpperCase()}</span>
                        </div>
                        <span class="score">${striker.runs}<small>(${striker.balls})</small></span>
                    </div>
                    <div class="m4-player">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <img class="m4-striker-photo" src="${(typeof DB !== 'undefined') ? DB.getPlayerPhoto(nonStriker.playerId) : OVERLAY_DEFAULT_PLAYER_PHOTO}" style="width:26px; height:26px; border:1px solid rgba(255,255,255,0.3); border-radius:50%; object-fit:cover; opacity:0.7;">
                            <span class="name" style="opacity:0.6">${nonStriker.name.toUpperCase()}</span>
                        </div>
                        <span class="score" style="opacity:0.6">${nonStriker.runs}<small>(${nonStriker.balls})</small></span>
                    </div>
                </div>
            </div>
            <div class="m4-section m4-info-section">${infoHtml}</div>
            <div class="m4-section m4-bowler-section">
                <div class="m4-bowler-info"><span class="name">${bowler.name.toUpperCase()}</span><span class="score">${bowler.wickets}-${bowler.runs}</span></div>
                <div class="m4-recent-balls">${recentBalls}</div>
            </div>
            <div class="m4-logo right"><img src="${t2Logo}"></div>
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
    // Basic scorecard renderer
    const el = document.getElementById('fs-content');
    if (!el) return;
    let html = `<div style="padding:40px; color:white;"><h2>${m.team1} vs ${m.team2}</h2><table style="width:100%; border-collapse:collapse;">`;
    m.innings.forEach((inn, i) => {
        if (!inn) return;
        html += `<tr><td colspan="4" style="background:rgba(255,255,255,0.1); padding:10px;"><b>${inn.battingTeam}</b>: ${inn.runs}/${inn.wickets} (${formatOvers(inn.balls)})</td></tr>`;
    });
    html += `</table></div>`;
    el.innerHTML = html;
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

function showBigEventGraphic(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.innerHTML = `<div style="background:#e61b4d; color:white; padding:40px 100px; border-radius:100px; font-size:80px; font-weight:950; letter-spacing:10px;">${data.event.toUpperCase()}</div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { scale: 0, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.8, ease: 'back.out(1.7)' });
    setTimeout(() => gsap.to(el, { scale: 1.5, opacity: 0, duration: 0.5, onComplete: () => el.remove() }), 5000);
}

function showStrikerProfileLeft(data, label = 'BATSMAN') {
    const photo = data.playerPhoto || OVERLAY_DEFAULT_PLAYER_PHOTO;
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.style.left = '40px'; el.style.top = '50%'; el.style.transform = 'translateY(-50%)';
    el.innerHTML = `<div style="background:#0f172a; border-left:8px solid #00e676; padding:30px; border-radius:0 30px 30px 0; color:white; width:350px;">
        <div style="font-size:12px; color:#00e676; letter-spacing:3px; margin-bottom:15px;">${label}</div>
        <img src="${photo}" style="width:100%; height:300px; object-fit:cover; border-radius:15px; margin-bottom:20px;">
        <div style="font-size:32px; font-weight:950;">${data.playerName.toUpperCase()}</div>
        <div style="font-size:18px; opacity:0.7;">${data.playerRuns || 0} (${data.playerBalls || 0})</div>
    </div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { x: -500, opacity: 0 }, { x: 0, opacity: 1, duration: 0.8, ease: 'expo.out' });
    setTimeout(() => gsap.to(el, { x: -500, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 8000);
}

function showBowlerProfileGraphic(data) {
    showStrikerProfileLeft(data, 'BOWLER');
}

function showPartnershipGraphicCinema(data) {
    const el = document.createElement('div');
    el.className = 'broadcast-overlay';
    el.innerHTML = `<div style="background:rgba(0,0,0,0.95); padding:40px; border-radius:40px; border:2px solid #ffd700; color:white; min-width:600px; text-align:center;">
        <div style="color:#ffd700; font-weight:900; letter-spacing:4px; margin-bottom:20px;">PARTNERSHIP</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:40px;">
            <div style="font-size:30px; font-weight:900;">${data.player1}</div>
            <div style="font-size:60px; font-weight:950; color:#ffd700;">${data.runs}</div>
            <div style="font-size:30px; font-weight:900;">${data.player2}</div>
        </div>
        <div style="opacity:0.6; margin-top:10px;">OFF ${data.balls} BALLS</div>
    </div>`;
    document.body.appendChild(el);
    gsap.fromTo(el, { y: 200, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: 'back.out' });
    setTimeout(() => gsap.to(el, { y: 200, opacity: 0, duration: 0.6, onComplete: () => el.remove() }), 8000);
}

function showTeamRosterGraphic(data) {
    // Placeholder for roster
}

function showGuestGraphic(data) {
    showStrikerProfileLeft(data, data.title || 'SPECIAL GUEST');
}

