const fs = require('fs');

let html = fs.readFileSync('pages/score-match.html', 'utf8');

// Replace Chunk 1
const chunk1_search = `        <!-- Two-column content -->\r
        <div class="scorer-layout" id="scorer-layout">`;
const chunk1_replace = `        <!-- TABS NAV -->\r
        <div class="setup-tabs" style="margin-top: 16px; margin-bottom: 16px; max-width: 1300px; margin-left: auto; margin-right: auto; padding: 0 24px;">\r
            <button class="setup-tab-btn active" id="tab-btn-scoring" onclick="switchScoringTab('scoring')" style="padding: 10px 16px;">🏏 Scoring</button>\r
            <button class="setup-tab-btn" id="tab-btn-scorecard" onclick="switchScoringTab('scorecard')" style="padding: 10px 16px;">📋 ScoreCard</button>\r
            <button class="setup-tab-btn" id="tab-btn-hotkeys" onclick="switchScoringTab('hotkeys')" style="padding: 10px 16px;">📺 Hotkeys</button>\r
        </div>\r
\r
        <script>\r
            function switchScoringTab(tabId) {\r
                document.querySelectorAll('.scoring-tab-panel').forEach(p => p.style.display = 'none');\r
                document.querySelectorAll('.setup-tabs .setup-tab-btn').forEach(b => b.classList.remove('active'));\r
                \r
                const panel = document.getElementById('panel-' + tabId);\r
                if(panel) panel.style.display = 'block';\r
                const btn = document.getElementById('tab-btn-' + tabId);\r
                if(btn) btn.classList.add('active');\r
            }\r
        </script>\r
\r
        <!-- TAB 1: SCORING -->\r
        <div class="scoring-tab-panel" id="panel-scoring">\r
            <div class="scorer-layout" id="scorer-layout">`;

html = html.replace(chunk1_search, chunk1_replace);

// Also try replacing it with just '\n' if '\r\n' wasn't matched
if (html.indexOf(chunk1_replace) === -1) {
    const fallback_search = `        <!-- Two-column content -->\n        <div class="scorer-layout" id="scorer-layout">`;
    const fallback_replace = chunk1_replace.replace(/\r\n/g, '\n');
    html = html.replace(fallback_search, fallback_replace);
}

// Find and Extract Partnership and FOW
const p_start = html.indexOf('                <!-- Partnership & FoW -->');
const p_end = html.indexOf('            <!-- RIGHT: Input controls -->');
if(p_start === -1 || p_end === -1) {
    console.log("Could not find Partnership block boundaries.");
} else {
    // Extract everything up to the closing div of stats-column which is right before <!-- RIGHT: Input controls -->
    // Actually let's search for "            </div>\r\n\r\n            <!-- RIGHT: Input controls -->"
    const p_exact_end = html.lastIndexOf('            </div>', p_end);
    let partnershipHtml = html.substring(p_start, p_exact_end);
    html = html.substring(0, p_start) + html.substring(p_exact_end);
    
    // Find and Extract Broadcast Card
    const b_start = html.indexOf('                <!-- BROADCAST CONTROL PANEL (Master UI) -->');
    const b_end = html.indexOf('            </div> <!-- End input-column -->');
    if(b_start === -1 || b_end === -1) {
        console.log("Could not find Broadcast block boundaries.");
    } else {
        let broadcastHtml = html.substring(b_start, b_end);
        html = html.substring(0, b_start) + html.substring(b_end);

        // Append the rest of the tabs before the closing of screen-scoring
        const end_scoring_search = `            </div> <!-- End input-column -->\r
        </div> <!-- End scorer-layout -->\r
    </div> <!-- End screen-scoring -->`;
        
        let end_scoring_replace = `            </div> <!-- End input-column -->\r
        </div> <!-- End scorer-layout -->\r
        </div> <!-- End panel-scoring -->\r
\r
        <!-- TAB 2: SCORECARD -->\r
        <div class="scoring-tab-panel" id="panel-scorecard" style="display:none; max-width: 1300px; margin: 0 auto; padding: 24px;">\r
            <div class="scorer-layout" style="grid-template-columns: 1fr;">\r
                \r
                <div class="card" style="margin-bottom:16px">\r
                     <div class="card-head">📋 Full Match Scorecard</div>\r
                     <button class="btn btn-primary btn-full" onclick="openScorecard()" style="font-size:16px; padding:15px; font-weight:800">Open Full Detailed Scorecard</button>\r
                </div>\r
\r
` + partnershipHtml + `\r
            </div>\r
        </div> <!-- End panel-scorecard -->\r
\r
        <!-- TAB 3: HOTKEYS -->\r
        <div class="scoring-tab-panel" id="panel-hotkeys" style="display:none; max-width: 1300px; margin: 0 auto; padding: 24px;">\r
            <div class="scorer-layout" style="grid-template-columns: 1fr; max-width:800px; margin: 0 auto;">\r
` + broadcastHtml + `\r
            </div>\r
        </div> <!-- End panel-hotkeys -->\r
    </div> <!-- End screen-scoring -->`;

        html = html.replace(end_scoring_search, end_scoring_replace);
        if (html.indexOf(end_scoring_replace) === -1) {
            html = html.replace(end_scoring_search.replace(/\r\n/g, '\n'), end_scoring_replace.replace(/\r\n/g, '\n'));
        }

        fs.writeFileSync('pages/score-match.html', html);
        console.log("Replaced successfully!");
    }
}
