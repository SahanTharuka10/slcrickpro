const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'overlay.js');
let content = fs.readFileSync(filePath, 'utf8');

// The file got corrupted between `score-pill` in `_renderOverlayClassic` and `_renderOverlayMode2`.
// I will just fetch `_renderOverlayClassic` from a backup or recreate it.

// Recreating _renderOverlayClassic's bottom half correctly
const p1Start = content.indexOf('<div class="score-center-section${isWicketBall ? \' wicket-flash\' : \'\'}" id="score-pill">');
const clockStart = content.indexOf('const clockEl = document.getElementById(\'overlay-live-clock\');');

if (p1Start !== -1 && clockStart !== -1) {
    const fixedContent = `<div class="score-center-section\${isWicketBall ? ' wicket-flash' : ''}" id="score-pill">
            \${isPreview ? '<div style="position:absolute; top:-25px; left:50%; transform:translateX(-50%); background:#e32459; color:#fff; font-size:9px; font-weight:900; padding:2px 10px; border-radius:4px; letter-spacing:1px; box-shadow:0 5px 15px rgba(227,36,89,0.3)">LIVE PREVIEW</div>' : ''}
            <span class="score-clock" id="overlay-live-clock"></span>
            <div class="score-top">
                <span class="teams" style="font-size: 14px;">\${t1Short} <span class="v">v</span> \${t2Short}</span>
                <div class="score-badges" style="gap: 10px; margin-top: 4px;">
                    <span class="total" style="font-size: 26px; background: #e32459; padding: 4px 16px; border-radius: 12px; box-shadow: 0 4px 12px rgba(227,36,89,0.4)">\${score}</span>
                    <div style="display:flex; flex-direction:column; align-items:center;">
                        <span class="phase" style="margin-bottom: 2px;">\${phase}</span>
                        <span class="overs" style="font-size: 15px;">\${ov}</span>
                    </div>
                </div>
            </div>
            <div class="score-bottom" style="margin-top: 6px; letter-spacing: 1.5px; opacity: 0.6;">\${bottomText}</div>
            \${rrrText ? \`<span class="score-rrr" style="bottom: -22px; right: 50%; transform: translateX(50%); font-size: 11px; white-space: nowrap; color: #38bdf8; opacity: 0.9; font-weight: 800;">\${rrrText}</span>\` : ''}
        </div>

        <div class="bowler-section" style="padding-right: 20px;">
            <div class="player-row" style="margin-bottom: 6px; justify-content: flex-end;">
                <div class="player-name" style="color: #1a1a2e; text-align: right; font-size: 16px; font-weight: 800;">\${bowler.name.split(' ').pop()}</div>
                <div class="player-value runs" style="width: 65px; font-weight: 900; font-size: 18px;">\${bowler.wickets || 0}-\${bowler.runs || 0}</div>
                <div class="player-value balls" style="width: 45px; opacity: 0.6; font-size: 13px;">(\${b_overs})</div>
            </div>
            <div class="recent-balls-row" style="justify-content: flex-end;">\${recentBallsHtml}</div>
        </div>
        <div class="team-logo-box right" style="background: \${m.team2Color || '#f4f4f8'}">
            <div class="logo-circle">\${t2Short}</div>
        </div>
    \`;

    // Re-start clock in the newly rendered pill
    `;
    
    content = content.substring(0, p1Start) + fixedContent + content.substring(clockStart);
}

// Now replace Mode 2 right side 
const m2RightSearch = '<!-- Team 2 Side (Bowling Team) -->';
const mode3Search = '/**\n * Overlay Mode 3: Manual Input Mode';

const m2RightIdx = content.indexOf(m2RightSearch);
const mode3Idx = content.indexOf(mode3Search);

if (m2RightIdx !== -1 && mode3Idx !== -1) {
    const fixedM2Right = `<!-- Team 2 Side (Bowling Team) -->
        <div class="m2-team-score right-side">
            <div class="m2-logo-box right-logo" style="background: \${m.team2Color || '#38bdf8'}">\${t2Short}</div>
            <div class="m2-team-names" style="text-align: right; padding: 10px 20px;">
                <div class="name">\${t2Short}</div>
                <div class="vs">BOWLING</div>
            </div>
        </div>
    \`;
}

`;
    content = content.substring(0, m2RightIdx) + fixedM2Right + content.substring(mode3Idx);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed overlay.js structure.');
