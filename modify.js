const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'pages', 'score-match.html');
let content = fs.readFileSync(filePath, 'utf8');

// Replace header actions
content = content.replace(
    '<div style="margin-left:auto;display:flex;gap:10px;align-items:center" id="header-actions">',
    `<div style="margin-left:auto;display:flex;gap:10px;align-items:center" id="header-actions">
            <button class="btn btn-primary btn-sm" id="btn-switch-match" style="border-radius:20px; font-weight:800; padding:6px 16px; background:#e61b4d; border:none; box-shadow:0 4px 10px rgba(230,27,77,0.4);" onclick="if(typeof currentMatch !== 'undefined' && currentMatch && currentMatch.tournamentId) { openTournamentMatchesModal(currentMatch.tournamentId); } else if (typeof tournId !== 'undefined' && tournId) { openTournamentMatchesModal(tournId); } else { showToast('Not a tournament match', 'error'); }">
                📅 Matches
            </button>`
);

// Replace panel-hotkeys
const startStr = '<!-- TAB 3: HOTKEYS -->';
const endStr = '</div> <!-- End panel-hotkeys -->';
const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr, startIndex);

if (startIndex !== -1 && endIndex !== -1) {
    const newPanel = `<!-- TAB 3: HOTKEYS -->
        <div class="scoring-tab-panel" id="panel-hotkeys" style="display:none; max-width: 1400px; margin: 0 auto; padding: 16px;">
            <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <div style="font-size:12px; color:var(--c-muted); font-weight:800; letter-spacing:2px">REMOTE STATION</div>
                    <div style="font-size:24px; font-weight:950; letter-spacing:1px; line-height:1.2">BROADCAST MASTER</div>
                </div>
                <div style="display:flex; gap:12px; align-items:center;">
                    <div style="background:rgba(255,255,255,0.05); border:1px solid var(--c-border); padding:8px 16px; border-radius:20px; font-weight:800; font-size:14px" id="bm-score-indicator">
                        0/0 (0.0)
                    </div>
                    <div style="background:rgba(0, 200, 83, 0.15); color:#00e676; border:1px solid rgba(0, 200, 83, 0.3); padding:8px 16px; border-radius:20px; font-weight:800; font-size:12px">
                        LIVE • <span id="bm-vs-indicator">A vs B</span>
                    </div>
                </div>
            </div>

            <div class="scorer-layout" style="grid-template-columns: 1fr 1.6fr 1fr; gap:16px; align-items: start;">
                <!-- LEFT COLUMN -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <!-- MASTER CONTROL -->
                    <div class="card" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px">🎮 MASTER CONTROL</div>
                        <button class="btn btn-red btn-full" style="height:54px; font-size:16px; font-weight:900; border-radius:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; padding:0 20px" onclick="Broadcast.stopAll()">
                            <div style="display:flex; align-items:center; gap:8px"><div style="width:12px; height:12px; background:#fff; border-radius:2px"></div> STOP ALL</div>
                            <div style="font-size:10px; background:rgba(0,0,0,0.3); padding:4px 8px; border-radius:6px">ESC</div>
                        </button>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <button class="btn btn-ghost btn-sm" style="border-radius:10px; height:42px; font-weight:800" onclick="location.reload()">🔌 RECONNECT</button>
                            <button class="btn btn-green btn-sm" style="border-radius:10px; height:42px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:6px" onclick="copyObsLink()"><span style="font-size:16px">🔗</span> OBS URL</button>
                        </div>
                    </div>

                    <!-- SCOREBAR CONTROL -->
                    <div class="card" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px">⚙️ SCOREBAR CONTROL</div>
                        <button class="btn btn-green btn-full" id="btn-toggle-scorebar" style="height:54px; font-size:15px; font-weight:900; border-radius:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:center; padding:0 20px" onclick="Broadcast.toggleScorebar()">
                            <div id="txt-toggle-scorebar">👁 LIVE SCOREBAR (ON)</div>
                            <div style="font-size:10px; background:rgba(0,0,0,0.2); padding:4px 8px; border-radius:6px">S+V</div>
                        </button>
                        
                        <div class="form-group" style="margin-bottom:0">
                            <label class="form-label" style="font-size:10px; letter-spacing:1px; opacity:0.8">ACTIVE THEME</label>
                            <select class="form-select" id="broadcast-theme-select" onchange="changeBroadcastTheme()" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; font-size:14px; font-weight:700">
                                <option value="theme1">Classic Scoreboard (Default)</option>
                                <option value="theme2">Scorecard 2 (Modern)</option>
                                <option value="theme3">Manual Input Scorecard</option>
                            </select>
                        </div>
                    </div>

                    <!-- MANUAL INPUT SETTINGS (Shows only when Theme 3 is selected) -->
                    <div class="card" id="manual-input-section" style="display:none; border: 1px solid rgba(124,77,255,0.4); background: rgba(124,77,255,0.05);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px; color:#7c4dff">✍️ MANUAL OVERLAY DATA</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px">
                            <input type="text" id="man-t1" class="form-input" placeholder="Team 1" style="font-size:12px" />
                            <input type="text" id="man-t2" class="form-input" placeholder="Team 2" style="font-size:12px" />
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; margin-bottom:8px">
                            <input type="number" id="man-runs" class="form-input" placeholder="Runs" style="font-size:12px; font-weight:800" />
                            <input type="number" id="man-wkts" class="form-input" placeholder="Wkts" style="font-size:12px; font-weight:800" />
                            <input type="number" id="man-overs" class="form-input" placeholder="Overs" step="0.1" style="font-size:12px; font-weight:800" />
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:8px">
                            <input type="text" id="man-bat1" class="form-input" placeholder="Striker (R/B)" style="font-size:12px" />
                            <input type="text" id="man-bat2" class="form-input" placeholder="Non-Str (R/B)" style="font-size:12px" />
                        </div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px">
                            <input type="text" id="man-bowl" class="form-input" placeholder="Bowler (O/R/W)" style="font-size:12px" />
                            <input type="text" id="man-target" class="form-input" placeholder="Target/CRR" style="font-size:12px" />
                        </div>
                        <button class="btn btn-primary btn-full btn-sm" style="border-radius:8px; font-weight:800; background:#7c4dff; border:none" onclick="pushManualOverlayData()">🚀 Push to Live Stream</button>
                    </div>

                    <!-- QUICK TRIGGERS -->
                    <div class="card" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px">⚡ QUICK TRIGGERS</div>
                        <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px">
                            <button class="btn btn-ghost" onclick="triggerVisualBigEvent('FOUR')" style="border-color:#2962ff; color:#82b1ff; height:45px; font-size:18px; font-weight:900; border-radius:10px">4</button>
                            <button class="btn btn-ghost" onclick="triggerVisualBigEvent('SIX')" style="border-color:#7c4dff; color:#b388ff; height:45px; font-size:18px; font-weight:900; border-radius:10px">6</button>
                            <button class="btn btn-ghost" onclick="triggerVisualBigEvent('WICKET')" style="border-color:#d50000; color:#ff8a80; height:45px; font-size:18px; font-weight:900; border-radius:10px">W</button>
                        </div>
                    </div>
                </div>

                <!-- MIDDLE COLUMN -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <!-- PREVIEW -->
                    <div style="background:rgba(0,0,0,0.3); border-radius:16px; padding:12px; border:1px solid rgba(255,255,255,0.05)">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                            <div style="display:flex; align-items:center; gap:6px">
                                <div style="width:8px; height:8px; background:#ff1744; border-radius:50%; box-shadow:0 0 8px #ff1744"></div>
                                <span style="font-size:12px; font-weight:900; letter-spacing:1px">REAL-TIME OUTPUT PREVIEW</span>
                            </div>
                            <span style="font-size:10px; color:var(--c-muted); font-weight:700">1920×1080 (SCALED)</span>
                        </div>
                        <div id="iframe-wrapper" style="position:relative; width:100%; aspect-ratio:16/9; background:#000; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.1)">
                            <!-- Iframe dynamically scaled to fit wrapper -->
                            <iframe id="broadcast-preview-iframe" src="../pages/overlay.html?preview=true" style="position:absolute; top:0; left:0; width:1920px; height:1080px; transform-origin: top left; border:none; pointer-events:none;"></iframe>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-top:12px; padding:0 4px">
                            <div style="display:flex; align-items:center; gap:6px; font-size:10px; font-weight:800; color:var(--c-muted)">
                                <div style="width:6px; height:6px; background:#00e676; border-radius:50%"></div> LIVE FEED ACTIVE
                            </div>
                            <div style="display:flex; align-items:center; gap:6px; font-size:10px; font-weight:800; color:var(--c-muted)">
                                ⚡ ZERO LATENCY SYNC
                            </div>
                            <div style="display:flex; align-items:center; gap:6px; font-size:10px; font-weight:800; color:var(--c-muted)">
                                🖥️ OBS/VMIX READY
                            </div>
                        </div>
                    </div>

                    <!-- CINEMATIC PRODUCTIONS -->
                    <div class="card" style="border: 1px solid rgba(124,77,255,0.2); background: rgba(124,77,255,0.03);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px; color:#b388ff">🎬 CINEMATIC PRODUCTIONS</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                            <button class="btn btn-primary" style="background:#2962ff; border:none; height:70px; border-radius:12px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px" onclick="Broadcast.send('SHOW_STRIKER_PROFILE')">
                                <div style="font-size:18px">⚡</div>
                                <div style="font-size:12px; font-weight:900">STRIKER</div>
                                <div style="font-size:9px; opacity:0.7">S+H</div>
                            </button>
                            <button class="btn btn-primary" style="background:#00c853; border:none; height:70px; border-radius:12px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px" onclick="Broadcast.send('SHOW_BATTER_PROFILES')">
                                <div style="font-size:18px">🏏</div>
                                <div style="font-size:12px; font-weight:900">BATTERS</div>
                                <div style="font-size:9px; opacity:0.7">S+P</div>
                            </button>
                            <button class="btn btn-primary" style="background:#ff8f00; border:none; height:70px; border-radius:12px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px" onclick="Broadcast.send('SHOW_PARTNERSHIP')">
                                <div style="font-size:18px">🤝</div>
                                <div style="font-size:12px; font-weight:900">PARTNER</div>
                                <div style="font-size:9px; opacity:0.7">S+N</div>
                            </button>
                            <button class="btn btn-primary" style="background:#7c4dff; border:none; height:70px; border-radius:12px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px" onclick="Broadcast.send('SHOW_BOWLER_PROFILE')">
                                <div style="font-size:18px">⚾</div>
                                <div style="font-size:12px; font-weight:900">BOWLER</div>
                                <div style="font-size:9px; opacity:0.7">S+L</div>
                            </button>
                            <button class="btn btn-ghost" style="background:#111; border-color:#333; height:70px; border-radius:12px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px" onclick="broadcastTeamCard(0)">
                                <div style="font-size:18px">🛡️</div>
                                <div style="font-size:12px; font-weight:900" id="btn-team1-label">TEAM A</div>
                                <div style="font-size:9px; opacity:0.7">CARD</div>
                            </button>
                            <button class="btn btn-ghost" style="background:#111; border-color:#333; height:70px; border-radius:12px; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:4px" onclick="broadcastTeamCard(1)">
                                <div style="font-size:18px">🛡️</div>
                                <div style="font-size:12px; font-weight:900" id="btn-team2-label">TEAM B</div>
                                <div style="font-size:9px; opacity:0.7">CARD</div>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- RIGHT COLUMN -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <!-- PLAYER PHOTOS -->
                    <div class="card" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px">📸 PLAYER PHOTOS</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                            <div style="display:flex; flex-direction:column; align-items:center; gap:6px">
                                <img id="bm-photo-striker" src="../assets/default-player.svg" style="width:60px; height:60px; border-radius:8px; border:1px solid #2962ff; object-fit:cover; background:rgba(41,98,255,0.1)" />
                                <div style="font-size:10px; font-weight:800; color:#82b1ff">STRIKER</div>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center; gap:6px">
                                <img id="bm-photo-nonstriker" src="../assets/default-player.svg" style="width:60px; height:60px; border-radius:8px; border:1px solid #ff1744; object-fit:cover; background:rgba(255,23,68,0.1)" />
                                <div style="font-size:10px; font-weight:800; color:#ff8a80">NON-STR</div>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center; gap:6px">
                                <img id="bm-photo-bowler" src="../assets/default-player.svg" style="width:60px; height:60px; border-radius:8px; border:1px solid #7c4dff; object-fit:cover; background:rgba(124,77,255,0.1)" />
                                <div style="font-size:10px; font-weight:800; color:#b388ff">BOWLER</div>
                            </div>
                        </div>
                    </div>

                    <!-- DATA OVERLAYS -->
                    <div class="card" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px">📊 DATA OVERLAYS</div>
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                            <button class="btn btn-primary" style="background:#2962ff; border:none; height:60px; border-radius:12px; display:flex; align-items:center; justify-content:flex-start; padding-left:16px; gap:8px" onclick="Broadcast.showRunsNeeded()">
                                <span style="font-size:16px">🎯</span>
                                <div style="text-align:left"><div style="font-weight:900; font-size:13px">NEEDED</div><div style="font-size:9px; opacity:0.7">S+R</div></div>
                            </button>
                            <button class="btn btn-primary" style="background:#00c853; border:none; height:60px; border-radius:12px; display:flex; align-items:center; justify-content:flex-start; padding-left:16px; gap:8px" onclick="Broadcast.showCRR()">
                                <span style="font-size:16px">📈</span>
                                <div style="text-align:left"><div style="font-weight:900; font-size:13px">RRATE</div><div style="font-size:9px; opacity:0.7">S+C</div></div>
                            </button>
                            <button class="btn btn-primary" style="background:#7c4dff; border:none; height:60px; border-radius:12px; display:flex; align-items:center; justify-content:flex-start; padding-left:16px; gap:8px" onclick="Broadcast.showScorecard()">
                                <span style="font-size:16px">📋</span>
                                <div style="text-align:left"><div style="font-weight:900; font-size:13px">CARD</div><div style="font-size:9px; opacity:0.7">S+S</div></div>
                            </button>
                            <button class="btn btn-primary" style="background:#ff8f00; border:none; height:60px; border-radius:12px; display:flex; align-items:center; justify-content:flex-start; padding-left:16px; gap:8px" onclick="Broadcast.showSummary()">
                                <span style="font-size:16px">🏆</span>
                                <div style="text-align:left"><div style="font-weight:900; font-size:13px">SUMRY</div><div style="font-size:9px; opacity:0.7">S+T</div></div>
                            </button>
                        </div>
                    </div>

                    <!-- PROMOTIONS -->
                    <div class="card" style="border: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.2);">
                        <div class="card-head" style="font-size:11px; margin-bottom:12px">📣 PROMOTIONS</div>
                        <div style="display:flex; gap:8px; margin-bottom:12px">
                            <input type="text" id="next-match-teama" class="form-input" placeholder="TEAM A" style="font-size:11px; text-align:center" />
                            <input type="text" id="next-match-teamb" class="form-input" placeholder="TEAM B" style="font-size:11px; text-align:center" />
                        </div>
                        <button class="btn btn-primary btn-full" style="background:#2962ff; border:none; height:45px; border-radius:10px; font-weight:900; letter-spacing:1px; font-size:13px" onclick="Broadcast.publishNextMatch()">
                            NEXT MATCH PREVIEW
                        </button>
                    </div>
                </div>
            </div>
            
            <script>
                // Make iframe fully fit the wrapper
                const iframeWrap = document.getElementById('iframe-wrapper');
                const iframe = document.getElementById('broadcast-preview-iframe');
                if (iframeWrap && iframe) {
                    new ResizeObserver(entries => {
                        for (let entry of entries) {
                            const w = entry.contentRect.width;
                            iframe.style.transform = \`scale(\${w / 1920})\`;
                        }
                    }).observe(iframeWrap);
                }

                function changeBroadcastTheme() {
                    const themeSelect = document.getElementById('broadcast-theme-select');
                    const manualSection = document.getElementById('manual-input-section');
                    if (themeSelect.value === 'theme3') {
                        manualSection.style.display = 'block';
                    } else {
                        manualSection.style.display = 'none';
                    }
                    Broadcast.changeOverlayTheme(themeSelect.value);
                }
                
                function pushManualOverlayData() {
                    const data = {
                        team1: document.getElementById('man-t1').value,
                        team2: document.getElementById('man-t2').value,
                        runs: document.getElementById('man-runs').value || 0,
                        wickets: document.getElementById('man-wkts').value || 0,
                        overs: document.getElementById('man-overs').value || 0,
                        striker: document.getElementById('man-bat1').value,
                        nonStriker: document.getElementById('man-bat2').value,
                        bowler: document.getElementById('man-bowl').value,
                        target: document.getElementById('man-target').value
                    };
                    Broadcast.send('SYNC_SCORE', { match: { id: 'manual-match', isManual: true, manualData: data } });
                }
                
                function broadcastTeamCard(teamIdx) {
                    Broadcast.send('SHOW_TEAM_CARD', { teamIndex: teamIdx });
                }
            </script>
        </div> <!-- End panel-hotkeys -->`;
    content = content.substring(0, startIndex) + newPanel + content.substring(endIndex + endStr.length);
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Update complete.');
