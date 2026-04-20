// match-entry.js - unified entry flow for Start/Resume

async function onResumeOrStart(matchId, tournamentId, isStart) {
    try {
        const baseUrl = window.BACKEND_BASE_URL || "";
        const userId = window.CURRENT_USER || 'unknown';
        
        showToast('🔄 Initializing session...', 'default');
        
        const match = DB.getMatch(matchId);
        if (!match && !isStart) {
            showToast('Match data missing locally. Fetching...', 'default');
            await window.pullGlobalData();
        }
        
        closeModal('modal-tournament-matches');
        showModeSelectionModal(match || { id: matchId, team1: 'TBD', team2: 'TBD' });
    } catch (err) {
        console.error('onResumeOrStart', err);
        showToast('Failed to initialize match', 'error');
    }
}

function showModeSelectionModal(match) {
    // Remove any existing statically defined or dynamically created modal
    const existingStatic = document.getElementById('modal-select-mode');
    if (existingStatic) existingStatic.remove();
    
    const existingDyn = document.getElementById('selection-overlay-dynamic');
    if (existingDyn) existingDyn.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'selection-overlay-dynamic';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.85)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '10000';
    
    const renderModeSelection = () => {
        overlay.innerHTML = `
            <div class="modal-box" style="max-width:440px; text-align:center">
                <div style="font-size:56px; margin-bottom:12px">🏏</div>
                <div class="modal-title">Select Scoring Mode</div>
                <div class="modal-sub">Match: ${match.team1} vs ${match.team2}</div>

                <div style="display:grid; grid-template-columns:1fr; gap:16px; margin:24px 0">
                    <button class="btn btn-primary" style="display:flex; align-items:center; justify-content:center; gap:12px; height:70px; font-size:18px" id="dyn-btn-scorer">
                        <span style="font-size:24px">📱</span>
                        <div style="text-align:left">
                            <div style="font-weight:900">Score Match</div>
                            <div style="font-size:11px; font-weight:400; opacity:0.7">Full scoring dashboard</div>
                        </div>
                    </button>

                    <button class="btn btn-secondary" style="display:flex; align-items:center; justify-content:center; gap:12px; height:70px; font-size:18px" id="dyn-btn-hotkey">
                        <span style="font-size:24px">⌨️</span>
                        <div style="text-align:left">
                            <div style="font-weight:900">Hotkey Mode</div>
                            <div style="font-size:11px; font-weight:400; opacity:0.7">Remote Broadcast Controller</div>
                        </div>
                    </button>
                </div>

                <button class="btn btn-ghost btn-full" id="dyn-btn-cancel">Cancel</button>
            </div>
        `;

        document.getElementById('dyn-btn-cancel').onclick = () => overlay.remove();

        document.getElementById('dyn-btn-scorer').onclick = () => {
            const isNewMatch = !match.status || match.status === 'setup' || match.status === 'scheduled';
            if (isNewMatch) {
                renderTossSelection();
            } else {
                overlay.remove();
                openScorerDashboard(match.id);
            }
        };

        document.getElementById('dyn-btn-hotkey').onclick = () => {
            overlay.remove();
            openHotkeyPanel(match.id);
        };
    };

    const renderTossSelection = () => {
        overlay.innerHTML = `
            <div class="modal-box" style="max-width:440px; text-align:center">
                <div class="modal-title">Match Setup: Toss</div>
                <div class="modal-sub" style="font-weight:700">${match.team1} <span style="opacity:0.5;margin:0 5px">vs</span> ${match.team2}</div>
                
                <div class="form-group" style="text-align:left; margin-top:20px;">
                    <label class="form-label" style="color:var(--c-amber)">Toss Winner</label>
                    <select class="form-select" id="dyn-toss-winner">
                        <option value="${match.team1}">${match.team1}</option>
                        <option value="${match.team2}">${match.team2}</option>
                    </select>
                </div>
                <div class="form-group" style="text-align:left; margin-bottom:20px;">
                    <label class="form-label" style="color:var(--c-primary)">Decision</label>
                    <select class="form-select" id="dyn-toss-decision">
                        <option value="bat">Bat First</option>
                        <option value="field">Field First</option>
                    </select>
                </div>
                <div style="display:flex; gap:10px">
                    <div class="form-group" style="text-align:left; flex:1">
                        <label class="form-label">Total Overs</label>
                        <input type="number" class="form-input" id="dyn-overs" value="${match.overs || 20}" min="1" max="1000">
                    </div>
                    <div class="form-group" style="text-align:left; flex:1">
                        <label class="form-label">Balls/Over</label>
                        <input type="number" class="form-input" id="dyn-bpo" value="${match.ballsPerOver || 6}" min="4" max="10">
                    </div>
                </div>
                <div style="display:flex; gap:10px; margin-top:20px">
                    <button class="btn btn-ghost" style="flex:1" onclick="document.getElementById('selection-overlay-dynamic').remove()">Cancel</button>
                    <button class="btn btn-primary" style="flex:2; font-weight:800; border-radius:12px; height:50px" id="dyn-btn-start-scoring">🏏 Confirm & Start Match</button>
                </div>
            </div>
        `;

        document.getElementById('dyn-btn-start-scoring').onclick = () => {
            const tWinner = document.getElementById('dyn-toss-winner').value;
            const tDec = document.getElementById('dyn-toss-decision').value;
            const ov = parseInt(document.getElementById('dyn-overs').value) || match.overs;
            const bpo = parseInt(document.getElementById('dyn-bpo').value) || match.ballsPerOver;
            
            match.tossWinner = tWinner;
            match.tossDecision = tDec;
            match.overs = ov;
            match.ballsPerOver = bpo;
            
            if (tDec === 'bat') {
                match.battingFirst = tWinner;
                match.fieldingFirst = (tWinner === match.team1) ? match.team2 : match.team1;
            } else {
                match.fieldingFirst = tWinner;
                match.battingFirst = (tWinner === match.team1) ? match.team2 : match.team1;
            }
            
            if (typeof DB !== 'undefined' && DB.saveMatch) {
                if (match.innings && match.innings.length > 0) {
                    match.innings[0].battingTeam = match.battingFirst;
                    match.innings[0].bowlingTeam = match.fieldingFirst;
                }
                DB.saveMatch(match);
            }
            overlay.remove();
            openScorerDashboard(match.id);
        };
    };

    renderModeSelection();
    document.body.appendChild(overlay);
}

function openScorerDashboard(matchId) {
    // Back to CLASSIC INLINE FLOW - Load match in current tab
    const m = DB.getMatch(matchId);
    if (!m) {
        showToast('Getting match data...', 'default');
        window.pullGlobalData().then(() => {
            const m2 = DB.getMatch(matchId);
            if (m2) loadMatch(m2);
            else showToast('Match not found locally.', 'error');
        });
        return;
    }
    loadMatch(m);
}

function openHotkeyPanel(matchId) {
    // FIX: Redirect to score-match.html (Broadcast Controller) NOT overlay.html
    const mUrl = `score-match.html?matchId=${encodeURIComponent(matchId)}&hotkey=true`;
    window.open(mUrl, '_blank');
}
