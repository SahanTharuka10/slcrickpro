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

    // Re-use the existing centralized socket from db.js
    const sharedSocket = window._cricproSocket;
    if (sharedSocket) {
        hotkeySocket = sharedSocket;
        if (sharedSocket.connected) {
            console.log('📡 Hotkey Mode: Reusing stable global socket');
            if (activeMatchId) sharedSocket.emit('join_match', activeMatchId);
        } else {
            sharedSocket.once('connect', () => {
                if (activeMatchId) sharedSocket.emit('join_match', activeMatchId);
            });
        }

        // Listen for match updates on the shared socket
        sharedSocket.on('scoreUpdate', () => {
            // db.js already triggers syncCloudData on scoreUpdate, 
            // but we can refresh our dashboard view explicitly if needed.
            if (typeof renderScoring === 'function') renderScoring();
            else if (typeof DB !== 'undefined' && activeMatchId) {
                const refreshedMatch = DB.getMatch(activeMatchId);
                if (refreshedMatch) updateHotkeyDashboard(refreshedMatch);
            }
        });
    } else {
        console.warn('Hotkey Mode: Global socket not found — falling back to manual refresh');
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

    const baseUrl = window.BACKEND_BASE_URL || '';
    
    fetch(baseUrl + '/match/update', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json', 
            'Session-Token': sessionToken,
            'x-scoring-token': localStorage.getItem('cricpro_token') || '' 
        },
        body: JSON.stringify(payload)
    }).then(async (r) => {
        if (!r.ok) {
            console.warn('hotkey update failed', await r.text());
            return;
        }
        const updated = await r.json();
        updateHotkeyDashboard(updated);
        
        // AUTO-BROADCAST BIG EVENTS TO TV
        if (typeof Broadcast !== 'undefined') {
            if (action.eventType === 'FOUR') Broadcast.send('SHOW_BIG_EVENT', { type: 'FOUR', playerName: 'BATSMAN', matchScore: `${updated.runs}/${updated.wickets}`, teamName: updated.battingTeam });
            if (action.eventType === 'SIX') Broadcast.send('SHOW_BIG_EVENT', { type: 'SIX', playerName: 'BATSMAN', matchScore: `${updated.runs}/${updated.wickets}`, teamName: updated.battingTeam });
            if (action.eventType === 'WICKET') Broadcast.send('SHOW_BIG_EVENT', { type: 'WICKET', playerName: 'BATSMAN', matchScore: `${updated.runs}/${updated.wickets}`, teamName: updated.battingTeam });
        } else if (typeof sendBroadcast === 'function') {
            if (action.eventType === 'FOUR') sendBroadcast('SHOW_BIG_EVENT', { type: 'FOUR' });
            if (action.eventType === 'SIX') sendBroadcast('SHOW_BIG_EVENT', { type: 'SIX' });
            if (action.eventType === 'WICKET') sendBroadcast('SHOW_BIG_EVENT', { type: 'WICKET' });
        }

        if (isBroadcastMirror) {
            fetch(baseUrl + '/tv-display', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
        }
    }).catch(e => console.error('Hotkey fetch error:', e));
}

function updateHotkeyDashboard(match) {
    const scoreEl = document.getElementById('hotkeyScore');
    if (scoreEl) scoreEl.innerText = `${match.runs}/${match.wickets} (Overs ${match.overs}.${match.ballsInOver})`;
    const lastEl = document.getElementById('hotkeyLast');
    if (lastEl) lastEl.innerText = `Last modified: ${match.lastModifiedByDevice} @ ${new Date(match.lastUpdatedAt).toLocaleTimeString()}`;
}
