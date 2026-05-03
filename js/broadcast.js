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
        .then(r => { if (r.status === 404) return null; return r.json(); })
        .then(d => { if (d) console.log('✅ Broadcast sync response:', d); })
        .catch(() => {}); // Silently ignore — socket.io handles real-time relay
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
        // Support multiple possible input IDs from different UI layouts
        const aEl = document.getElementById('broadcast-next-a') ||
                    document.getElementById('next-match-teama') ||
                    document.getElementById('next-teama');
        const bEl = document.getElementById('broadcast-next-b') ||
                    document.getElementById('next-match-teamb') ||
                    document.getElementById('next-teamb');
        const teamA = (aEl && aEl.value.trim()) || '';
        const teamB = (bEl && bEl.value.trim()) || '';
        if (!teamA || !teamB) {
            showToast('Enter both team names!', 'error');
            return;
        }

        this.send('SHOW_NEXT_MATCH', { teamA, teamB });
        showToast('📅 Next Match Published!', 'success');
    },

    setOverlayMode(mode) {
        this.send('SET_OVERLAY_MODE', { mode });
    },

    setOverlaySubMode(subMode) {
        this.send('SET_OVERLAY_SUBMODE', { subMode });
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
    },

    /**
     * Toggle Live Scorebar visibility
     */
    toggleScorebar() {
        const btn = document.getElementById('btn-toggle-scorebar');
        const txt = document.getElementById('txt-toggle-scorebar');
        const checkbox = document.getElementById('scorebar-toggle');
        
        let newState = true;
        if (txt) {
            newState = !txt.innerText.includes('ON');
        } else if (checkbox) {
            newState = !checkbox.checked;
        }

        this.send('SET_SCOREBAR_VISIBILITY', { visible: newState });
        this.syncToggleUI(newState);
        showToast(newState ? 'Scorebar Visible!' : 'Scorebar Hidden!', newState ? 'success' : 'default');
    },

    /**
     * Keep the Controller UI in sync with the broadcast state
     */
    syncToggleUI(isVisible) {
        const btn = document.getElementById('btn-toggle-scorebar');
        const txt = document.getElementById('txt-toggle-scorebar');
        const checkbox = document.getElementById('scorebar-toggle');

        if (btn && txt) {
            if (isVisible) {
                txt.innerText = '👁 LIVE SCOREBAR (ON)';
                btn.className = 'btn btn-green btn-full';
                btn.style.boxShadow = '0 0 10px rgba(0,255,0,0.3)';
            } else {
                txt.innerText = '👁 LIVE SCOREBAR (OFF)';
                btn.className = 'btn btn-red btn-full';
                btn.style.boxShadow = '0 0 10px rgba(255,0,0,0.3)';
            }
        }
        if (checkbox) {
            checkbox.checked = isVisible;
        }
    },

    /**
     * Change active Scorebar Overlay Theme
     */
    changeOverlayTheme(themeValue) {
        // themeValue is "theme1", "theme2", "theme3" etc
        const modeNum = parseInt(themeValue.replace('theme', '')) || 1;
        this.send('SET_OVERLAY_MODE', { mode: modeNum });
        showToast('🎨 Theme Updated!', 'success');
    }
};
