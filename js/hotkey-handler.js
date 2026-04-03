// hotkey-handler.js - low-latency hotkey controller for TV/overlay

let hotkeySocket;
let activeMatchId = null;
let sessionToken = null;
let isBroadcastMirror = false;

function resolveMatchId() {
    const params = new URLSearchParams(window.location.search);
    let matchId = params.get('matchId') || params.get('match') || sessionStorage.getItem('hotkey_match_id') || localStorage.getItem('hotkey_match_id');

    if (!matchId && typeof DB !== 'undefined' && typeof DB.getMatches === 'function') {
        const live = DB.getMatches().find(m => m.status === 'live' || m.status === 'paused');
        if (live) matchId = live.id;
    }

    // additional fallback to any known active match stored for hotkey mode
    if (!matchId) {
        const lastActive = localStorage.getItem('cricpro_last_active_match');
        if (lastActive) matchId = lastActive;
    }

    return matchId;
}

document.addEventListener('DOMContentLoaded', () => {
    activeMatchId = resolveMatchId();
    sessionToken = sessionStorage.getItem('match_session_token');

    if (!activeMatchId) {
        // console.warn('Hotkey Mode: missing matchId in URL and session');
        return;
    }

    if (typeof io === 'undefined') {
        console.warn('Socket.IO client is not available. Hotkey socket updates will not work.');
    } else {
        const backendOrigin = window.BACKEND_BASE_URL || (window.location.protocol + '//' + window.location.host);
        hotkeySocket = io(backendOrigin, { transports: ['websocket', 'polling'] });

        hotkeySocket.on('connect', () => {
            hotkeySocket.emit('joinMatch', activeMatchId);
        });

        hotkeySocket.on('match-update', (msg) => {
            if (msg && msg.match && msg.match.id === activeMatchId) {
                updateHotkeyDashboard(msg.match);
            }
        });

        hotkeySocket.on('disconnect', () => console.warn('Hotkey socket disconnected'));
        hotkeySocket.on('connect_error', (e) => console.warn('Hotkey socket connect_error', e));
    }


    document.addEventListener('keydown', handleHotkeyKeydown);
    const broadcastCheckbox = document.getElementById('broadcastMirror');
    if (broadcastCheckbox) {
        broadcastCheckbox.addEventListener('change', (e) => isBroadcastMirror = e.target.checked);
    }

    if (!activeMatchId) {
        // Hide dashboard until a match is available
        const scoreEl = document.getElementById('hotkeyScore');
        const lastEl = document.getElementById('hotkeyLast');
        if (scoreEl) scoreEl.innerText = 'No match selected';
        if (lastEl) lastEl.innerText = '';
    }
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
