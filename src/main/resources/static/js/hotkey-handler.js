// hotkey-handler.js - low-latency hotkey controller for TV/overlay

const hotkeyWs = new WebSocket((window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + '/ws');
let activeMatchId = null;
let sessionToken = null;
let isBroadcastMirror = false;

document.addEventListener('DOMContentLoaded', () => {
    activeMatchId = new URLSearchParams(window.location.search).get('matchId') || sessionStorage.getItem('hotkey_match_id');
    sessionToken = sessionStorage.getItem('match_session_token');

    if (!activeMatchId) {
        alert('Match ID missing for Hotkey Mode');
        return;
    }

    hotkeyWs.addEventListener('open', () => {
        hotkeyWs.send(JSON.stringify({ type: 'join', matchId: activeMatchId }));
    });

    hotkeyWs.addEventListener('message', (e) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'match-update' && msg.match && msg.match.id === activeMatchId) {
                updateHotkeyDashboard(msg.match);
            }
        } catch (err) {
            console.error('Hotkey websocket message parse failed', err);
        }
    });

    document.addEventListener('keydown', handleHotkeyKeydown);
    document.getElementById('broadcastMirror').addEventListener('change', (e) => isBroadcastMirror = e.target.checked);
});

function handleHotkeyKeydown(evt) {
    const mapping = {
        'Numpad0': { runs: 0, eventType: 'RUN' },
        'Numpad1': { runs: 1, eventType: 'RUN' },
        'Numpad2': { runs: 2, eventType: 'RUN' },
        'Numpad3': { runs: 3, eventType: 'RUN' },
        'Numpad4': { runs: 4, eventType: 'FOUR' },
        'Numpad5': { runs: 5, eventType: 'RUN' },
        'Numpad6': { runs: 6, eventType: 'SIX' },
        'KeyW': { wickets: 1, eventType: 'WICKET' },
        'KeyO': { eventType: 'OVER_END' }
    };

    const action = mapping[evt.code];
    if (!action) return;

    const payload = {
        matchId: activeMatchId,
        actor: 'HOTKEY',
        sessionToken,
        ...action
    };

    fetch('/match/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Session-Token': sessionToken },
        body: JSON.stringify(payload)
    }).then(async (r) => {
        if (!r.ok) {
            console.warn('hotkey update failed', await r.text());
            return;
        }
        const updated = await r.json();
        updateHotkeyDashboard(updated);
        if (isBroadcastMirror) {
            fetch('/tv-display', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
        }
    }).catch(console.error);
}

function updateHotkeyDashboard(match) {
    const scoreEl = document.getElementById('hotkeyScore');
    if (scoreEl) scoreEl.innerText = `${match.runs}/${match.wickets} (Overs ${match.overs}.${match.ballsInOver})`;
    const lastEl = document.getElementById('hotkeyLast');
    if (lastEl) lastEl.innerText = `Last modified: ${match.lastModifiedByDevice} @ ${new Date(match.lastUpdatedAt).toLocaleTimeString()}`;
}
