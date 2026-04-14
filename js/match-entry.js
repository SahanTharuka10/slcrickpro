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
    const existing = document.getElementById('modal-select-mode');
    
    const setupHandlers = (idScorer, idHotkey) => {
        const btnS = document.getElementById(idScorer);
        const btnH = document.getElementById(idHotkey);
        if (btnS) btnS.onclick = () => { 
            closeModal('modal-select-mode'); 
            const dyn = document.getElementById('selection-overlay-dynamic');
            if (dyn) dyn.remove();
            
            // Ask for overs and balls per over
            const newOvers = prompt("Confirm/Change Total Overs:", match.overs || 20);
            if (newOvers !== null) {
                const newBpo = prompt("Confirm/Change Balls Per Over:", match.ballsPerOver || 6);
                if (newBpo !== null) {
                    match.overs = parseInt(newOvers) || match.overs;
                    match.ballsPerOver = parseInt(newBpo) || match.ballsPerOver;
                    DB.saveMatch(match);
                    openScorerDashboard(match.id); 
                }
            }
        };
        if (btnH) btnH.onclick = () => { 
            closeModal('modal-select-mode'); 
            const dyn = document.getElementById('selection-overlay-dynamic');
            if (dyn) dyn.remove();
            openHotkeyPanel(match.id); 
        };
    };

    if (existing) {
        setupHandlers('mode-btn-scorer', 'mode-btn-hotkey');
        showModal('modal-select-mode');
        return;
    }

    // Otherwise create premium inline modal
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

    document.body.appendChild(overlay);
    setupHandlers('dyn-btn-scorer', 'dyn-btn-hotkey');
    document.getElementById('dyn-btn-cancel').onclick = () => overlay.remove();
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
