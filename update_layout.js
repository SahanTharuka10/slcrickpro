const fs = require('fs');

let html = fs.readFileSync('pages/score-match.html', 'utf8');

// 1. Extract card-batting and card-bowling
const bat_start = html.indexOf('                <!-- Batting -->');
const bowl_end_str = '                        </tbody>\r\n                    </table>\r\n                </div>';
const bowl_end_alt = '                        </tbody>\n                    </table>\n                </div>';

let bowl_end = html.indexOf(bowl_end_str, html.indexOf('<!-- Bowling -->'));
if(bowl_end === -1) bowl_end = html.indexOf(bowl_end_alt, html.indexOf('<!-- Bowling -->'));

const exact_bowl_end = bowl_end + bowl_end_str.length;

let battingBowlingHtml = html.substring(bat_start, exact_bowl_end);
html = html.substring(0, bat_start) + html.substring(exact_bowl_end);

// 2. Insert battingBowlingHtml into Tab 2 (panel-scorecard) right before card-partnership
const partnership_start = html.indexOf('                <!-- Partnership & FoW -->');
html = html.substring(0, partnership_start) + battingBowlingHtml + '\r\n\r\n' + html.substring(partnership_start);

// 3. Fix Tab 1 (panel-scoring)
const panel1_start = html.indexOf('<div class="scoring-tab-panel" id="panel-scoring">');
const panel1_end = html.indexOf('        </div> <!-- End panel-scoring -->');

let panel1 = html.substring(panel1_start, panel1_end);

// Replace layout wrapper
panel1 = panel1.replace('<div class="scorer-layout" id="scorer-layout">', '<div class="compact-scoring-layout" id="scorer-layout" style="max-width: 600px; margin: 0 auto; padding: 10px; display: flex; flex-direction: column; gap: 8px;">\r\n<style>\r\n.compact-scoring-layout .card { padding: 12px; margin-bottom: 0 !important; }\r\n.compact-scoring-layout .card-head { margin-bottom: 8px; padding-bottom: 4px; font-size: 10px; }\r\n.compact-scoring-layout .ball-btn { min-height: 55px; padding: 8px 4px; border-radius: 10px; }\r\n.compact-scoring-layout .ball-n { font-size: 18px; }\r\n.compact-scoring-layout .ball-l { font-size: 9px; }\r\n.compact-scoring-layout .ball-grid { gap: 6px; }\r\n.compact-scoring-layout .striker-opt { padding: 6px; font-size: 13px; }\r\n.compact-scoring-layout .btn { padding: 8px; font-size: 13px; }\r\n.compact-grid-top { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\r\n@media (max-width: 400px) { .compact-grid-top { grid-template-columns: 1fr; } }\r\n</style>');

// Clean up old wrappers
panel1 = panel1.replace('            <!-- RIGHT: Input controls -->\r\n            <div class="input-column">', '');
panel1 = panel1.replace('            <!-- RIGHT: Input controls -->\n            <div class="input-column">', '');
panel1 = panel1.replace('            </div> <!-- End input-column -->\r\n        </div> <!-- End scorer-layout -->', '        </div> <!-- End scorer-layout -->');
panel1 = panel1.replace('            </div> <!-- End input-column -->\n        </div> <!-- End scorer-layout -->', '        </div> <!-- End scorer-layout -->');

const s_start = panel1.indexOf('                <!-- Striker toggle -->');
const b_start = panel1.indexOf('                <!-- Ball buttons -->');
const h_start = panel1.indexOf('                <!-- Undo / Redo -->');
const c_start = panel1.indexOf('                <!-- Publish & Controls -->');

let striker_html = panel1.substring(s_start, b_start);
let hist_html = panel1.substring(h_start, c_start);
let btns_html = panel1.substring(b_start, h_start);
let ctrl_html = panel1.substring(c_start, panel1.indexOf('        </div> <!-- End scorer-layout -->'));

panel1 = panel1.substring(0, s_start) + 
`                <div class="compact-grid-top">
${striker_html}
${hist_html}
                </div>
${btns_html}
${ctrl_html}
` + panel1.substring(panel1.indexOf('        </div> <!-- End scorer-layout -->'));

html = html.substring(0, panel1_start) + panel1 + html.substring(panel1_end);

fs.writeFileSync('pages/score-match.html', html);
console.log("Updated layout successfully!");
