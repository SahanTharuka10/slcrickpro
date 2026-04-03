// match-entry.js - unified entry flow for Start/Resume

async function onResumeOrStart(matchId, tournamentId, isStart) {
    try {
        const userId = window.CURRENT_USER || 'unknown';
        const response = await fetch('/match/initialize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matchId, tournamentId, start: isStart, userId })
        });

        if (!response.ok) {
            const text = await response.text();
            showToast('Error initializing match: ' + text, 'error');
            return;
        }

        const data = await response.json();
        sessionStorage.setItem('match_session_token', data.sessionToken);
        showModeSelectionModal(data.match);
    } catch (err) {
        console.error('onResumeOrStart', err);
        showToast('Failed to initialize match', 'error');
    }
}

function showModeSelectionModal(match) {
    const existing = document.getElementById('selection-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'selection-modal';
    modal.style = 'position:fixed;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:9999;';
    modal.innerHTML = `
        <div style="width:320px;padding:20px;border-radius:14px;background:#15293b;color:#fff;font-family:Arial, sans-serif;">
            <h2 style="margin:0 0 14px;font-size:1.2rem;">Resume Match ${match.id}</h2>
            <button id="entry-score" style="width:100%;padding:10px;margin-bottom:10px;background:#107163;border:none;border-radius:8px;cursor:pointer;color:#fff;font-weight:700;">Score Match</button>
            <button id="entry-hotkey" style="width:100%;padding:10px;margin-bottom:10px;background:#9333ea;border:none;border-radius:8px;cursor:pointer;color:#fff;font-weight:700;">Hotkey Access</button>
            <button id="entry-cancel" style="width:100%;padding:10px;background:#1f2937;border:none;border-radius:8px;cursor:pointer;color:#fff;">Cancel</button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('entry-score').onclick = () => {
        modal.remove();
        openScorerDashboard(match.id);
    };

    document.getElementById('entry-hotkey').onclick = () => {
        modal.remove();
        openHotkeyPanel(match.id);
    };

    document.getElementById('entry-cancel').onclick = () => modal.remove();
}

function openScorerDashboard(matchId) {
    const match = DB.getMatch(matchId);
    if (!match) return showToast('Match not found', 'error');

    match.status = 'LIVE';
    match.lastModifiedByDevice = 'SCORER';
    match.lastUpdatedAt = Date.now();
    DB.saveMatch(match);
    saveMatch(match);
    loadMatch(match);
}

function openHotkeyPanel(matchId) {
    sessionStorage.setItem('hotkey_match_id', matchId);
    window.location.href = 'hotkey.html?matchId=' + encodeURIComponent(matchId);
}
