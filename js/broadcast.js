/**
 * SLCRICKPRO – Broadcast Control Logic
 * Handles communication between Scorer and TV Display Overlay
 */

const BROADCAST_KEYS = {
    COMMAND: 'cricpro_broadcast_cmd',
    DATA: 'cricpro_broadcast_data'
};

const Broadcast = {
    _buildBroadcastData(cmd, data = {}) {
        if (data && Object.keys(data).length > 0) return data;
        if (typeof currentMatch === 'undefined' || !currentMatch) return data;

        const m = currentMatch;
        const inn = m.innings?.[m.currentInnings || 0];
        if (!inn) return data;

        const strikerIdx = inn.currentBatsmenIdx ? inn.currentBatsmenIdx[inn.strikerIdx || 0] : null;
        const nonStrikerIdx = inn.currentBatsmenIdx ? inn.currentBatsmenIdx[inn.strikerIdx === 0 ? 1 : 0] : null;
        const striker = strikerIdx != null ? inn.batsmen?.[strikerIdx] : null;
        const nonStriker = nonStrikerIdx != null ? inn.batsmen?.[nonStrikerIdx] : null;
        const bowler = (inn.currentBowlerIdx != null) ? inn.bowlers?.[inn.currentBowlerIdx] : null;

        const avatar = (player) => {
            if (!player) return null;
            return (typeof DB !== 'undefined' && DB.getPlayerPhoto) ? DB.getPlayerPhoto(player.playerId) : null;
        };

        const makeProfile = (player) => ({
            playerName: player?.name || 'PLAYER',
            playerRuns: player?.runs || 0,
            playerBalls: player?.balls || 0,
            playerPhoto: avatar(player)
        });

        switch (cmd) {
            case 'SHOW_STRIKER_PROFILE':
                return striker ? makeProfile(striker) : data;
            case 'SHOW_NON_STRIKER_PROFILE':
                return nonStriker ? makeProfile(nonStriker) : data;
            case 'SHOW_BOWLER_PROFILE':
                return bowler ? {
                    playerName: bowler.name || 'BOWLER',
                    playerRuns: bowler.wickets || 0,
                    playerBalls: bowler.runs || 0,
                    playerSixes: bowler.overs || 0,
                    playerPhoto: avatar(bowler)
                } : data;
            case 'SHOW_BATTER_PROFILES':
                return {
                    profiles: [striker, nonStriker].filter(Boolean).map((player, idx) => ({
                        playerName: player.name || `BATSMAN ${idx + 1}`,
                        stats: { runs: player.runs || 0, balls: player.balls || 0, sixes: player.sixes || 0 },
                        profile: { photo: avatar(player) }
                    }))
                };
            case 'SHOW_PARTNERSHIP':
                return {
                    player1: striker?.name || 'STRIKER',
                    player1Photo: avatar(striker) || OVERLAY_DEFAULT_PLAYER_PHOTO,
                    player2: nonStriker?.name || 'NON-STRIKER',
                    player2Photo: avatar(nonStriker) || OVERLAY_DEFAULT_PLAYER_PHOTO,
                    runs: inn.runs || 0,
                    balls: inn.balls || 0,
                    wicketNumber: (m.currentInnings || 0) + 1,
                    battingTeam: inn.battingTeam || m.team1 || 'TEAM'
                };
            default:
                return data;
        }
    },

    /**
     * Send a command to the TV Display
     * @param {string} cmd - Command name (e.g., 'SHOW_RUNS_BALLS')
     * @param {object} data - Optional data payload
     */
    send(cmd, data = {}) {
        data = this._buildBroadcastData(cmd, data);
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

        // PostMessage to embedded IFRAME preview
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
        this.send('STOP_ALL');
        this.syncToggleUI(true);
        showToast('⏹ All Overlays Cleared', 'default');
    },

    /**
     * Show Striker Profile
     */
    broadcastStrikerProfile() {
        if (!window.currentMatch || !window.DB) return showToast('No active match', 'error');
        const m = window.currentMatch;
        const inn = m.innings[m.currentInnings];
        if (!inn || !inn.currentBatsmenIdx) return showToast('No innings active', 'error');
        const strikerIdx = inn.currentBatsmenIdx[inn.strikerIdx];
        const striker = inn.batsmen[strikerIdx];
        if (!striker) return showToast('No striker found', 'error');

        const photo = window.__photo_striker || DB.getPlayerPhoto(striker.playerId);
        this.send('SHOW_STRIKER_PROFILE', {
            playerName: striker.name,
            playerRuns: striker.runs,
            playerBalls: striker.balls,
            playerPhoto: photo
        });
        showToast('⚡ Striker Profile Published!', 'success');
    },

    /**
     * Show Non-Striker Profile
     */
    broadcastNonStrikerProfile() {
        if (!window.currentMatch || !window.DB) return showToast('No active match', 'error');
        const m = window.currentMatch;
        const inn = m.innings[m.currentInnings];
        if (!inn || !inn.currentBatsmenIdx) return showToast('No innings active', 'error');
        const nonStrikerIdx = inn.currentBatsmenIdx[inn.strikerIdx === 0 ? 1 : 0];
        const nonStriker = inn.batsmen[nonStrikerIdx];
        if (!nonStriker) return showToast('No non-striker found', 'error');

        const photo = window.__photo_nonstriker || DB.getPlayerPhoto(nonStriker.playerId);
        this.send('SHOW_NON_STRIKER_PROFILE', {
            playerName: nonStriker.name,
            playerRuns: nonStriker.runs,
            playerBalls: nonStriker.balls,
            playerPhoto: photo
        });
        showToast('🛡️ Non-Striker Profile Published!', 'success');
    },

    /**
     * Show Both Batters
     */
    broadcastCurrentBatters() {
        if (!window.currentMatch || !window.DB) return showToast('No active match', 'error');
        const m = window.currentMatch;
        const inn = m.innings[m.currentInnings];
        if (!inn || !inn.currentBatsmenIdx) return showToast('No innings active', 'error');
        const b1 = inn.batsmen[inn.currentBatsmenIdx[0]];
        const b2 = inn.batsmen[inn.currentBatsmenIdx[1]];
        if (!b1 && !b2) return showToast('No batters found', 'error');

        const profiles = [];
        if (b1) profiles.push({
            name: b1.name,
            stats: { runs: b1.runs, balls: b1.balls },
            profile: { photo: (inn.strikerIdx === 0 ? window.__photo_striker : window.__photo_nonstriker) || DB.getPlayerPhoto(b1.playerId) }
        });
        if (b2) profiles.push({
            name: b2.name,
            stats: { runs: b2.runs, balls: b2.balls },
            profile: { photo: (inn.strikerIdx === 1 ? window.__photo_striker : window.__photo_nonstriker) || DB.getPlayerPhoto(b2.playerId) }
        });

        this.send('SHOW_BATTER_PROFILES', { profiles });
        showToast('🏏 Batters Published!', 'success');
    },

    /**
     * Show Partnership
     */
    broadcastPartnership() {
        if (!window.currentMatch || !window.DB) return showToast('No active match', 'error');
        const m = window.currentMatch;
        const inn = m.innings[m.currentInnings];
        if (!inn || !inn.partnerships || inn.partnerships.length === 0) return showToast('No partnership data', 'error');
        
        const currentPartnership = inn.partnerships[inn.partnerships.length - 1];
        const b1 = inn.batsmen[inn.currentBatsmenIdx[0]];
        const b2 = inn.batsmen[inn.currentBatsmenIdx[1]];

        this.send('SHOW_PARTNERSHIP', {
            player1: b1 ? b1.name : 'TBD',
            player1Photo: (inn.strikerIdx === 0 ? window.__photo_striker : window.__photo_nonstriker) || (b1 ? DB.getPlayerPhoto(b1.playerId) : ''),
            player2: b2 ? b2.name : 'TBD',
            player2Photo: (inn.strikerIdx === 1 ? window.__photo_striker : window.__photo_nonstriker) || (b2 ? DB.getPlayerPhoto(b2.playerId) : ''),
            runs: currentPartnership.runs,
            balls: currentPartnership.balls,
            wicketNumber: inn.wickets + 1,
            battingTeam: inn.battingTeam
        });
        showToast('🤝 Partnership Published!', 'success');
    },

    /**
     * Show Bowler Profile
     */
    broadcastBowlerProfile() {
        if (!window.currentMatch || !window.DB) return showToast('No active match', 'error');
        const m = window.currentMatch;
        const inn = m.innings[m.currentInnings];
        if (!inn || inn.currentBowlerIdx == null) return showToast('No bowler active', 'error');
        const bowler = inn.bowlers[inn.currentBowlerIdx];
        if (!bowler) return showToast('No bowler found', 'error');

        const photo = window.__photo_bowler || DB.getPlayerPhoto(bowler.playerId);
        this.send('SHOW_BOWLER_PROFILE', {
            playerName: bowler.name,
            playerRuns: bowler.wickets,  // Using playerRuns for wickets in profile left
            playerBalls: bowler.runs,    // Using playerBalls for runs in profile left
            playerPhoto: photo
        });
        showToast('⚾ Bowler Profile Published!', 'success');
    },


    /**
     * Show Team Card (squad card with player photos)
     */
    broadcastTeamCard(teamIdx) {
        if (!window.currentMatch || !window.DB) return showToast('No active match', 'error');
        const m = window.currentMatch;
        const teamName = teamIdx === 0 ? m.team1 : m.team2;
        if (!teamName) return showToast('Team not found', 'error');

        // Try to get squad from tournament or match
        let players = [];
        const tourn = window.currentTournament;
        if (tourn && tourn.teams) {
            const teamObj = tourn.teams.find(t => t.name === teamName);
            if (teamObj && teamObj.players) {
                players = teamObj.players.map(p => ({
                    name: p.name || p,
                    role: p.role || 'Player',
                    photo: p.id ? DB.getPlayerPhoto(p.id) : (DB.getPlayerPhoto((p.name||p).replace(/\s+/g,'_').toUpperCase()) || '')
                }));
            }
        }
        if (players.length === 0 && m.innings) {
            const inn = m.innings.find(i => i.battingTeam === teamName || i.bowlingTeam === teamName);
            if (inn) {
                const allPlayers = [...(inn.batsmen||[]), ...(inn.bowlers||[])];
                const seen = new Set();
                allPlayers.forEach(p => {
                    if (p && p.name && !seen.has(p.name)) {
                        seen.add(p.name);
                        players.push({ name: p.name, role: p.role || 'Player', photo: DB.getPlayerPhoto(p.playerId) || '' });
                    }
                });
            }
        }

        const logo = DB.getTeamPhoto(teamName, m.tournamentId) || '';
        this.send('SHOW_TEAM_CARD', { teamName, teamLogo: logo, players });
        showToast(`🛡️ ${teamName} Squad Card Published!`, 'success');
    },

    /**
     * Show Special Guest Overlay
     */
    broadcastSpecialGuest(photoUrl, name) {
        if (!name) {
            showToast('Please enter guest name', 'error');
            return;
        }
        this.send('SHOW_GUEST', { photo: photoUrl, name: name });
        showToast('👤 Special Guest Published!', 'success');
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
        
        // Detect current state: if text includes ':ON' or '(ON)' it is currently ON → we want to turn OFF
        let currentlyOn = true;
        if (txt) {
            const t = txt.innerText || '';
            currentlyOn = t.includes(': ON') || t.includes('(ON)') || t.includes(':ON');
        } else if (checkbox) {
            currentlyOn = checkbox.checked;
        }
        const newState = !currentlyOn;

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
            const isBBtn = btn.classList.contains('b-btn'); // Broadcast Controller style
            if (isVisible) {
                txt.innerText = isBBtn ? 'LIVE SCOREBAR: ON' : '👁 LIVE SCOREBAR (ON)';
                if (!isBBtn) {
                    btn.className = 'btn btn-green btn-full';
                    btn.style.boxShadow = '0 0 10px rgba(0,255,0,0.3)';
                } else {
                    btn.style.background = 'linear-gradient(135deg, #059669, #10b981)';
                    btn.style.boxShadow = '0 0 15px rgba(0,255,0,0.3)';
                }
            } else {
                txt.innerText = isBBtn ? 'LIVE SCOREBAR: OFF' : '👁 LIVE SCOREBAR (OFF)';
                if (!isBBtn) {
                    btn.className = 'btn btn-red btn-full';
                    btn.style.boxShadow = '0 0 10px rgba(255,0,0,0.3)';
                } else {
                    btn.style.background = 'linear-gradient(135deg, #991b1b, #ef4444)';
                    btn.style.boxShadow = '0 0 15px rgba(255,0,0,0.3)';
                }
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
