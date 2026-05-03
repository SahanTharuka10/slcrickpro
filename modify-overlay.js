const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'overlay.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace _renderOverlayFromMatch
const matchFuncStart = 'function _renderOverlayFromMatch(m) {';
const matchFuncEnd = 'function _renderOverlayClassic(m) {';
const matchStartIdx = content.indexOf(matchFuncStart);
const matchEndIdx = content.indexOf(matchFuncEnd);

if (matchStartIdx !== -1 && matchEndIdx !== -1) {
    const newMatchFunc = `function _renderOverlayFromMatch(m) {
    const container = document.getElementById('overlay-container');
    if (!container) return;

    if (m.isManual) {
        const matchFingerprint = JSON.stringify(m);
        if (matchFingerprint === window._lastOverlayFingerprint && !forceRefresh) return;
        window._lastOverlayFingerprint = matchFingerprint;
        if (!isScorebarVisible) { container.style.display = 'none'; return; }
        container.style.display = 'flex';
        _renderOverlayMode3(m);
        return;
    }

    const curInn = m.innings && m.innings[m.currentInnings];
    if (!curInn) { container.style.display = 'none'; return; }
    
    // Performance optimization: prevent unnecessary DOM re-renders
    const matchFingerprint = JSON.stringify(m);
    if (matchFingerprint === window._lastOverlayFingerprint && !forceRefresh) return;
    window._lastOverlayFingerprint = matchFingerprint;

    if (!isScorebarVisible) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';

    if (currentOverlayMode === 2) {
        _renderOverlayMode2(m);
    } else if (currentOverlayMode === 3) {
        _renderOverlayMode3(m);
    } else {
        _renderOverlayClassic(m);
    }
}

`;
    content = content.substring(0, matchStartIdx) + newMatchFunc + content.substring(matchEndIdx);
}

// Replace _renderOverlayMode2 and _renderOverlayMode3
const mode2Start = '/**\n * Overlay Mode 2: Modern Photo Bar (Based on user image)\n */\nfunction _renderOverlayMode2(m) {';
const renderLightStart = 'function renderOverlayFromLightPayload(payload) {';
const m2StartIdx = content.indexOf('/**\n * Overlay Mode 2:');
const lightStartIdx = content.indexOf(renderLightStart);

if (m2StartIdx !== -1 && lightStartIdx !== -1) {
    const newModes = `/**
 * Overlay Mode 2: Scorecard 2 (Modern with Logos)
 */
function _renderOverlayMode2(m) {
    const container = document.getElementById('overlay-container');
    const curInn = m.innings[m.currentInnings];
    container.className = 'overlay-container mode-2';

    const t1Name = (curInn.battingTeam && curInn.battingTeam !== 'TBD') ? curInn.battingTeam : (m.team1 || 'T1');
    const t2Name = (curInn.bowlingTeam && curInn.bowlingTeam !== 'TBD') ? curInn.bowlingTeam : (m.team2 || 'T2');
    const t1Short = getShortName(t1Name);
    const t2Short = getShortName(t2Name);
    const scoreVal = curInn.runs + '-' + curInn.wickets;
    const ovVal = formatOvers(curInn.balls, m.ballsPerOver);

    const siIdx = (curInn.currentBatsmenIdx && typeof curInn.strikerIdx !== 'undefined') ? curInn.currentBatsmenIdx[curInn.strikerIdx] : null;
    const nsiIdx = (curInn.currentBatsmenIdx && typeof curInn.strikerIdx !== 'undefined') ? curInn.currentBatsmenIdx[curInn.strikerIdx === 0 ? 1 : 0] : null;

    const b1 = (typeof siIdx === 'number' && curInn.batsmen && curInn.batsmen[siIdx]) ? curInn.batsmen[siIdx] : { name:'Batter 1', runs:0, balls:0 };
    const b2 = (typeof nsiIdx === 'number' && curInn.batsmen && curInn.batsmen[nsiIdx]) ? curInn.batsmen[nsiIdx] : { name:'Batter 2', runs:0, balls:0 };
    const bowler = (curInn.bowlers && typeof curInn.currentBowlerIdx !== 'undefined' && curInn.bowlers[curInn.currentBowlerIdx]) ? curInn.bowlers[curInn.currentBowlerIdx] : { name:'Bowler', wickets:0, runs:0, balls:0 };
    
    // Resolve photos
    const getPhoto = (pName) => {
        if (!pName) return OVERLAY_DEFAULT_PLAYER_PHOTO;
        const p = DB.getMatches().flatMap(mx => (mx.players && mx.players[0]) ? mx.players[0].concat(mx.players[1]) : [])
                    .find(px => px && px.name === pName);
        if (p && p.photo) return p.photo;
        const dp = DB.getPlayers().find(px => px.name === pName);
        return (dp && dp.photo) ? dp.photo : OVERLAY_DEFAULT_PLAYER_PHOTO;
    };

    const b1Photo = getPhoto(b1.name);
    const b2Photo = getPhoto(b2.name);
    const bowlPhoto = getPhoto(bowler.name);

    container.innerHTML = \`
        <!-- Team 1 Side (Batting Team) -->
        <div class="m2-team-score">
            <div class="m2-logo-box" style="background: \${m.team1Color || '#e61b4d'}">\${t1Short}</div>
            <div class="m2-team-names">
                <div class="name">\${t1Short}</div>
                <div class="vs">vs \${t2Short}</div>
            </div>
            <div class="m2-score-box">
                <div class="score">\${scoreVal}</div>
                <div class="overs">\${ovVal}</div>
            </div>
        </div>

        <!-- Striker Section -->
        <div class="m2-player-box active">
            <div class="m2-player-photo"><img src="\${b1Photo}"></div>
            <div class="m2-player-info">
                <div class="p-name">\${b1.name}</div>
                <div class="p-score">\${b1.runs}<span>\${b1.balls}</span></div>
            </div>
        </div>

        <!-- Non-Striker Section -->
        <div class="m2-player-box">
            <div class="m2-player-photo"><img src="\${b2Photo}"></div>
            <div class="m2-player-info">
                <div class="p-name">\${b2.name}</div>
                <div class="p-score">\${b2.runs}<span>\${b2.balls}</span></div>
            </div>
        </div>

        <!-- Middle Info (CRR) -->
        <div class="m2-info-pill">
            <div class="label">CRR</div>
            <div class="value">\${formatCRR(curInn.runs, curInn.balls)}</div>
        </div>

        <!-- Bowler Section -->
        <div class="m2-bowler-box">
            <div class="m2-player-photo"><img src="\${bowlPhoto}"></div>
            <div class="m2-player-info">
                <div class="p-name">\${bowler.name}</div>
                <div class="p-score">\${bowler.wickets}-\${bowler.runs}<span>\${formatOvers(bowler.balls, m.ballsPerOver)}</span></div>
            </div>
        </div>

        <!-- Over Dots -->
        <div class="m2-dots-section">
            <div class="m2-dots-row">
                \${(curInn.currentOver || []).slice(-6).map(b => {
                    let cls = b.wicket ? 'w' : (b.runs >= 4 ? 'b' : '');
                    let lbl = b.wicket ? 'W' : b.runs;
                    return \\\`<div class="dot \${cls}">\${lbl}</div>\\\`;
                }).join('')}
            </div>
        </div>

        <!-- Team 2 Side (Bowling Team) -->
        <div class="m2-team-score right-side">
            <div class="m2-logo-box right-logo" style="background: \${m.team2Color || '#38bdf8'}">\${t2Short}</div>
        </div>
    \`;
}

/**
 * Overlay Mode 3: Manual Input Mode
 */
function _renderOverlayMode3(m) {
    const container = document.getElementById('overlay-container');
    container.className = 'overlay-container mode-3';

    let t1Short = 'T1', t2Short = 'T2', runs = 0, wkts = 0, overs = '0.0';
    let b1Name = 'Striker', b1Runs = '0', b1Balls = '0';
    let b2Name = 'Non-Striker', b2Runs = '0', b2Balls = '0';
    let bowlName = 'Bowler', bowlWkts = '0', bowlRuns = '0', bowlOvers = '0.0';
    let crr = '0.0', rrr = '-';
    let recent = [];

    if (m.isManual && m.manualData) {
        const d = m.manualData;
        t1Short = getShortName(d.team1 || 'TEAM A');
        t2Short = getShortName(d.team2 || 'TEAM B');
        runs = d.runs || 0;
        wkts = d.wickets || 0;
        overs = d.overs || '0.0';
        
        crr = d.target || '0.0';

        if (d.striker) {
            const m1 = d.striker.match(/^(.*?)\\s*\\((\\d+)\\/(\\d+)\\)$/);
            if(m1) { b1Name = m1[1]; b1Runs = m1[2]; b1Balls = m1[3]; } else { b1Name = d.striker; }
        }
        if (d.nonStriker) {
            const m2 = d.nonStriker.match(/^(.*?)\\s*\\((\\d+)\\/(\\d+)\\)$/);
            if(m2) { b2Name = m2[1]; b2Runs = m2[2]; b2Balls = m2[3]; } else { b2Name = d.nonStriker; }
        }
        if (d.bowler) {
            const mb = d.bowler.match(/^(.*?)\\s*\\((\\d+\\.?\\d*)\\/(\\d+)\\/(\\d+)\\)$/);
            if(mb) { bowlName = mb[1]; bowlOvers = mb[2]; bowlRuns = mb[3]; bowlWkts = mb[4]; } else { bowlName = d.bowler; }
        }
    } else {
        // Fallback if rendered with regular match data but mode 3 selected
        const curInn = m.innings[m.currentInnings];
        t1Short = getShortName(curInn.battingTeam);
        t2Short = getShortName(curInn.bowlingTeam);
        runs = curInn.runs; wkts = curInn.wickets; overs = formatOvers(curInn.balls, m.ballsPerOver);
        
        const siIdx = (curInn.currentBatsmenIdx && typeof curInn.strikerIdx !== 'undefined') ? curInn.currentBatsmenIdx[curInn.strikerIdx] : null;
        const b1 = (typeof siIdx === 'number' && curInn.batsmen && curInn.batsmen[siIdx]) ? curInn.batsmen[siIdx] : null;
        if(b1) { b1Name=b1.name; b1Runs=b1.runs; b1Balls=b1.balls; }

        const bowl = (curInn.bowlers && typeof curInn.currentBowlerIdx !== 'undefined' && curInn.bowlers[curInn.currentBowlerIdx]) ? curInn.bowlers[curInn.currentBowlerIdx] : null;
        if(bowl) { bowlName=bowl.name; bowlRuns=bowl.runs; bowlWkts=bowl.wickets; bowlOvers=formatOvers(bowl.balls, m.ballsPerOver); }

        crr = formatCRR(curInn.runs, curInn.balls);
        if (m.currentInnings === 1 && m.innings[0]) {
            rrr = (( (m.innings[0].runs + 1 - curInn.runs) / ((m.overs * m.ballsPerOver) - curInn.balls) ) * 6).toFixed(2);
        }
        recent = (curInn.currentOver || []).slice(-8);
    }

    container.innerHTML = \`
        <div class="m3-left">
            <div class="m3-score">\${runs}-\${wkts} <small>\${overs}</small></div>
            <div class="m3-teams">\${t1Short} v \${t2Short}</div>
        </div>
        <div class="m3-center">
            <div class="m3-row">
                <span class="lbl">STR:</span> <span class="val" style="width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">\${b1Name}</span>
                <span class="lbl">RUNS:</span> <span class="val highlight">\${b1Runs} (\${b1Balls})</span>
            </div>
            <div class="m3-row">
                <span class="lbl">BWL:</span> <span class="val" style="width:120px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">\${bowlName}</span>
                <span class="lbl">FIG:</span> <span class="val highlight">\${bowlWkts}-\${bowlRuns} <small style="font-size:12px; font-weight:700">(\${bowlOvers})</small></span>
                <span class="lbl">INFO:</span> <span class="val" style="color:#fbbf24">\${crr}</span>
            </div>
        </div>
        <div class="m3-right">
             <div class="m3-right-title">RECENT LOG</div>
             <div class="m3-recent">
                \${recent.length > 0 ? recent.map(b => \\\`<span class="\${b.wicket?'w':(b.runs>=4?'b':'')}">\${b.wicket?'W':b.runs}</span>\\\`).join('') : '<span style="background:transparent; border:1px dashed rgba(255,255,255,0.2)"></span>'}
             </div>
        </div>
    \`;
}

`;
    content = content.substring(0, m2StartIdx) + newModes + content.substring(lightStartIdx);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Update complete.');
