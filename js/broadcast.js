/**
 * SLCRICKPRO – Broadcast Control Logic
 * Handles communication between Scorer and TV Display Overlay
 */

const BROADCAST_KEYS = {
    COMMAND: 'cricpro_broadcast_cmd',
    DATA: 'cricpro_broadcast_data'
};

const Broadcast = {
    /**
     * Send a command to the TV Display
     * @param {string} cmd - Command name (e.g., 'SHOW_RUNS_BALLS')
     * @param {object} data - Optional data payload
     */
    send(cmd, data = {}) {
        const scopeTournamentId = (typeof currentMatch !== 'undefined' && currentMatch && currentMatch.tournamentId) ||
            (typeof currentTournament !== 'undefined' && currentTournament && currentTournament.id) || null;
        const scopeMatchId = (typeof currentMatch !== 'undefined' && currentMatch && currentMatch.id) || null;
        const payload = {
            cmd,
            data,
            tournamentId: scopeTournamentId,
            matchId: scopeMatchId,
            timestamp: Date.now()
        };
        // Use a unique key with timestamp to ensure the 'storage' event fires even if command is same
        localStorage.setItem(BROADCAST_KEYS.COMMAND, JSON.stringify(payload));
        console.log(`📡 Broadcast Sent (Local): ${cmd}`, data);

        // PostMessage to embedded IFRAME preview instantly
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(f => {
            if (f.contentWindow) {
                f.contentWindow.postMessage({ type: 'cricpro_broadcast_cmd', payload: payload }, '*');
            }
        });

        // SYNC TO REMOTE SCREEN (Real-Time WebSocket Support)
        if (typeof socket !== 'undefined' && socket) {
            socket.emit('broadcast_command', payload);
            console.log('📡 Sync Broadcast:', cmd);
        }

        // SYNC TO SERVER (HTTP Fallback)
        const baseUrl = window.BACKEND_BASE_URL || localStorage.getItem('cricpro_backend_url') || ('http://' + window.location.hostname + ':3000');
                
        fetch(baseUrl + '/sync/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        })
        .then(r => r.json())
        .then(d => console.log('✅ Broadcast sync response:', d))
        .catch(err => console.error('❌ Broadcast sync failed:', err));
    },

    /**
     * Trigger the "Runs Needed" motion graphic
     */
    showRunsNeeded() {
        if (!currentMatch) return;
        const inn0 = currentMatch.innings[0];
        const inn1 = currentMatch.innings[1];
        if (currentMatch.currentInnings !== 1 || !inn0 || !inn1) {
            showToast('Only available in 2nd Innings!', 'error');
            return;
        }

        const target = inn0.runs + 1;
        const runsNeeded = target - inn1.runs;
        const ballsRemaining = (currentMatch.overs * currentMatch.ballsPerOver) - inn1.balls;

        this.send('SHOW_RUNS_BALLS', {
            runs: runsNeeded,
            balls: ballsRemaining
        });
        showToast('🚀 Graphic Published to TV!', 'success');
    },

    /**
     * Set the "Coming Up Next" graphic
     */
    publishNextMatch() {
        const teamA = document.getElementById('broadcast-next-a').value.trim();
        const teamB = document.getElementById('broadcast-next-b').value.trim();
        if (!teamA || !teamB) {
            showToast('Enter both team names!', 'error');
            return;
        }

        this.send('SHOW_NEXT_MATCH', { teamA, teamB });
        showToast('📅 Next Match Published!', 'success');
    },

    /**
     * Show Current Run Rate graphic
     */
    showCRR() {
        if (!currentMatch) return;
        const target = (currentMatch.innings[1]?.runs / (currentMatch.innings[1]?.balls / 6)) || 0;
        this.send('SHOW_CRR', { crr: target.toFixed(2) });
        showToast('📈 CRR Published!', 'success');
    },

    // Milestone Option Removed as per User Request

    /**
     * Stop all overlays and return to live score
     */
    stopAll() {
        this.send('STOP_OVERLAY');
        showToast('⏹ All Overlays Cleared', 'default');
    },

    /**
     * Toggle full scorecard overlay
     */
    showScorecard() {
        this.send('SHOW_SCORECARD');
        showToast('📋 Scorecard Published!', 'success');
    },

    /**
     * Toggle tournament summary overlay
     */
    showSummary() {
        this.send('SHOW_SUMMARY');
        showToast('🏆 Summary Published!', 'success');
    }
};
