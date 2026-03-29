let matchId = new URLSearchParams(window.location.search).get('match');
let tournId = new URLSearchParams(window.location.search).get('tournament');
let refreshInterval;
let currentPopupView = null;
let latestSocketScore = null;

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

    // Socket.io integration (Graceful Deprecation)
    if (typeof io !== 'undefined') {
        const socket = io();
        if (matchId) {
            socket.emit('joinMatch', matchId);
        }
        if (tournId) {
            socket.emit('joinTournament', tournId);
        }
        socket.on('scoreUpdate', (updatedData) => {
            console.log("⚡ Real-time Update Received:", updatedData);
            if (updatedData && updatedData.score) {
                if ((matchId && updatedData.id === matchId) || (tournId && updatedData.tournamentId === tournId)) {
                    latestSocketScore = updatedData;
                }
                renderOverlay();
                return;
            }
            // Sync local DB with received data
            if (updatedData && updatedData.id) {
                const matches = DB.getMatches();
                const idx = matches.findIndex(m => m.id === updatedData.id);
                if (idx !== -1) {
                    matches[idx] = updatedData;
                    DB.saveMatches(matches);
                }
            }
            renderOverlay();
        });
    } else {
        console.warn('Socket.io not found. Using local polling mode.');
    }

    renderOverlay();
    // Intervals reduced as socket handles live updates
    refreshInterval = setInterval(() => {
        if (currentPopupView) {
            renderTournamentStats(currentPopupView);
        }
    }, 10000); // Only for stats/standings

    // BROADCAST COMMAND LISTENER
    window.addEventListener('storage', (e) => {
        if (e.key === 'cricpro_broadcast_cmd') {
            try {
                const payload = JSON.parse(e.newValue);
                handleBroadcastCommand(payload.cmd, { ...(payload.data || {}), tournamentId: payload.tournamentId || null, matchId: payload.matchId || null });
            } catch (err) { console.error("Broadcast parse err", err); }
        }
        if (e.key === 'matches' || e.key === 'cricpro_tournaments' || e.key === 'cricpro_force_update') {
            if (!currentPopupView) {
                renderOverlay();
            } else {
                renderTournamentStats(currentPopupView);
            }
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
        case 'SHOW_BATTER_PROFILES':
            showBatterProfilesGraphic(data);
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
    document.getElementById('nm-team-a').textContent = data.teamA;
    document.getElementById('nm-team-b').textContent = data.teamB;
    
    el.style.display = 'flex';
    // Cinematic entrance
    gsap.fromTo(el, { opacity: 0, scale: 1.2 }, { opacity: 1, scale: 1, duration: 1, ease: 'power4.out' });
    gsap.from('.nm-artwork', { y: 100, opacity: 0, duration: 1.2, delay: 0.3, ease: 'back.out(1.2)' });
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
    if (latestSocketScore && latestSocketScore.score) {
        return renderOverlayFromLightPayload(latestSocketScore);
    }

    let m = null;
    if (matchId) {
        m = DB.getMatch(matchId);
    } else if (tournId) {
        m = DB.getMatches().find(mt => mt.tournamentId === tournId && (mt.status === 'live' || mt.status === 'paused'));
    }

    if (!m) {
        document.getElementById('overlay-container').style.display = 'none';
        document.getElementById('overlay-container').innerHTML = '';
        return;
    }

    document.getElementById('overlay-container').style.display = 'flex';

    const curInn = m.innings[m.currentInnings];
    if (!curInn) {
        document.getElementById('overlay-container').style.display = 'none';
        return;
    }

    // Team info
    const t1Name = curInn.battingTeam || "T1";
    const t2Name = curInn.bowlingTeam || "T2";
    const t1Short = getShortName(t1Name);
    const t2Short = getShortName(t2Name);

    // Score & Overs
    const score = curInn.runs + '-' + curInn.wickets;
    const ov = formatOvers(curInn.balls, m.ballsPerOver);
    const rr = formatCRR(curInn.runs, curInn.balls);

    // Batsmen info
    const strikerRealIdx = curInn.currentBatsmenIdx[curInn.strikerIdx];
    let striker = curInn.batsmen[strikerRealIdx];
    if (!striker) striker = { name: 'Batsman 1', runs: 0, balls: 0 };

    const nonStrikerSlot = curInn.strikerIdx === 0 ? 1 : 0;
    const nonStrikerRealIdx = curInn.currentBatsmenIdx[nonStrikerSlot];
    let nonStriker = curInn.batsmen[nonStrikerRealIdx];
    if (!nonStriker) nonStriker = { name: 'Batsman 2', runs: 0, balls: 0 };

    // Bowler info
    let bowler = curInn.bowlers[curInn.currentBowlerIdx];
    if (!bowler) bowler = { name: 'Bowler', wickets: 0, runs: 0, balls: 0 };
    const b_overs = formatOvers(bowler.balls || 0, m.ballsPerOver);

    // Last 6 Balls (Current Over array)
    let recentBallsHtml = '';
    let startIdx = Math.max(0, curInn.currentOver.length - 6); // Max 6 balls shown
    const ballsToShow = curInn.currentOver.slice(startIdx);

    if (ballsToShow.length > 0) {
        recentBallsHtml = ballsToShow.map(b => {
            let cls = '';
            let lbl = b.runs || '0';

            if (b.wicket) { cls = 'wicket'; lbl = 'W'; }
            else if (b.type === 'six') { cls = 'six'; lbl = '6'; }
            else if (b.type === 'four') { cls = 'boundary'; lbl = '4'; }
            else if (b.type === 'wide') { cls = 'extra'; lbl = 'Wd'; }
            else if (b.type === 'noball') { cls = 'extra'; lbl = 'Nb'; }
            else if (b.type === 'bye') { cls = 'extra'; lbl = 'B' + b.runs; }
            else if (b.type === 'legbye') { cls = 'extra'; lbl = 'Lb' + b.runs; }
            else if (b.runs === 0) { cls = 'dot'; lbl = '0'; }
            else { cls = 'runs'; }

            return `<div class="recent-ball ${cls}">${lbl}</div>`;
        }).join('');
    }

    let bottomText = `<span style="color:#fff">NEED </span>`;
    const ovNum = Math.floor(curInn.balls / m.ballsPerOver);
    let phase = 'P1';
    if (m.overs > 20) {
        if (ovNum >= 10 && ovNum < 40) phase = 'P2';
        else if (ovNum >= 40) phase = 'P3';
    } else {
        if (ovNum >= 6) phase = 'P2';
    }

    if (m.currentInnings === 1 && m.innings[0]) {
        const target = m.innings[0].runs + 1;
        const need = target - curInn.runs;
        const ballsLeft = (m.overs * m.ballsPerOver) - curInn.balls;
        if (need > 0) {
            bottomText = `NEED <span style="color:#fff">${need}</span> RUNS FROM <span style="color:#fff">${ballsLeft}</span> BALLS`;
        } else if (need === 0) {
            bottomText = `<span style="color:#fff">SCORES LEVEL</span>`;
        } else {
            bottomText = `<span style="color:#fff">🎉 WON BY ${m.playersPerSide - curInn.wickets - 1} WICKETS</span>`;
        }
    } else {
        bottomText = `TOSS: ${m.tossWinner || 'TBD'} CHOSE TO ${m.tossDecision ? m.tossDecision.toUpperCase() : 'BAT'}`;
    }

    const html = `
        <div class="team-logo-box left">
            <div class="logo-circle">${t1Short}</div>
        </div>
        
        <div class="batsmen-section">
            <div class="player-row">
                <div class="player-name"><span class="striker-mark">${curInn.strikerIdx === 0 ? '▶' : '&nbsp;'}</span> ${striker.name}</div>
                <div class="player-value runs">${striker.runs || 0}</div>
                <div class="player-value balls">${striker.balls || 0}</div>
            </div>
            <div class="player-row">
                <div class="player-name"><span class="striker-mark">${curInn.strikerIdx === 1 ? '▶' : '&nbsp;'}</span> ${nonStriker.name}</div>
                <div class="player-value runs">${nonStriker.runs || 0}</div>
                <div class="player-value balls">${nonStriker.balls || 0}</div>
            </div>
        </div>
        
        <div class="score-center-section">
            <div class="score-top">
                <span class="teams">${t1Short} <span class="v">v</span> ${t2Short}</span>
                <span class="total">${score}</span>
                <span class="phase">${phase}</span>
                <span class="overs">${ov}</span>
            </div>
            <div class="score-bottom">
                ${bottomText}
            </div>
        </div>
        
        <div class="bowler-section">
            <div class="player-row">
                <div class="player-name">${bowler.name}</div>
                <div class="player-value runs">${bowler.wickets || 0}-${bowler.runs || 0}</div>
                <div class="player-value balls">${b_overs}</div>
            </div>
            <div class="recent-balls-row">
                ${recentBallsHtml}
            </div>
        </div>
        
        <div class="team-logo-box right">
            <div class="logo-circle">${t2Short}</div>
        </div>
    `;

    document.getElementById('overlay-container').innerHTML = html;

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
    if (el) el.remove();
}
