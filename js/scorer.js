// ================================================
//  SLCRICKPRO – Scorer Engine v2 (FIXED)
//  Bugs fixed: wicket fall, leg bye, partnership
// ================================================

let currentMatch = null;
let currentMatchType = 'single';
let wicketRuns = 0;
let byeExtraType = 'bye';
let byeRuns = 1;
let currentPendingWicket = 0;
let pendingBallEvent = null;
let pendingExtraType = null;
let _innings_ending = false; // guard to prevent double-modal
let currentTournament = null;
let _pendingTournPayload = null;
const SCORING_AUTH_KEY = 'cricpro_scoring_auth';
let currentOverlayTeam = null;
let currentOverlayPlayer = null;
let activeOverlayId = null;
const DEFAULT_PLAYER_PHOTO = '../assets/default-player.svg';

function getOnCreaseBatterNames(inn) {
    if (!inn || !Array.isArray(inn.batsmen) || !Array.isArray(inn.currentBatsmenIdx)) return [];
    const names = [];
    for (const slot of [0, 1]) {
        const idx = inn.currentBatsmenIdx[slot];
        if (idx != null && inn.batsmen[idx]) names.push(inn.batsmen[idx].name);
    }
    return names.filter(Boolean);
}

function getStrikerBatterName(inn) {
    if (!inn || !Array.isArray(inn.batsmen) || !Array.isArray(inn.currentBatsmenIdx)) return null;
    const slot = inn.strikerIdx === 1 ? 1 : 0;
    const idx = inn.currentBatsmenIdx[slot];
    return idx != null && inn.batsmen[idx] ? inn.batsmen[idx].name : null;
}

function resolvePlayerProfileForBatter(inn, bName) {
    if (!bName || !inn || !Array.isArray(inn.batsmen)) return null;
    const bRec = inn.batsmen.find(x => x.name === bName);
    if (bRec && bRec.playerId) {
        const byId = DB.getPlayerById(bRec.playerId);
        if (byId) return byId;
    }
    return DB.getPlayers().find(x => x.name.toLowerCase().trim() === bName.toLowerCase().trim()) || null;
}

function playerPhotoSrc(p) {
    if (p && p.photo && String(p.photo).trim()) return p.photo;
    return DEFAULT_PLAYER_PHOTO;
}

document.addEventListener('DOMContentLoaded', () => {
    const tf = document.getElementById('tourn-format');
    if (tf) {
        tf.addEventListener('change', (e) => {
            const kg = document.getElementById('knockout-team-count-group');
            if (kg) kg.style.display = e.target.value === 'knockout' ? 'block' : 'none';
        });
    }

    renderResumeMatches();
    
    // Check for matchId parameter for direct scoring access
    const urlParams = new URLSearchParams(window.location.search);
    const mId = urlParams.get('matchId');
    const tId = urlParams.get('tournamentId');

    if (mId) {
        const m = DB.getMatch(mId);
        if (m) {
            if (m.tournamentId && !isTournamentAuthorized(m.tournamentId)) {
                currentTournament = DB.getTournament(m.tournamentId) || { id: m.tournamentId, name: m.tournamentName || 'Tournament' };
                currentMatch = m;
                document.getElementById('login-match-title').textContent = `Tournament: ${currentTournament.name}`;
                document.getElementById('login-password').value = '';
                showScreen('login');
                return;
            }
            if (m.status === 'scheduled') {
                startOfficialMatch(mId);
            } else if (m.status === 'live' || m.status === 'paused') {
                resumeMatch(mId);
            }
        }
    } else if (tId) {
        showScreen('setup');
        setTimeout(() => openTournamentHub(tId), 200);
    } else {
        showScreen('setup');
    }

    if (typeof switchSetupTab === 'function') switchSetupTab('new');
});

function getScoringAuthMap() {
    try {
        return JSON.parse(sessionStorage.getItem(SCORING_AUTH_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveScoringAuthMap(map) {
    sessionStorage.setItem(SCORING_AUTH_KEY, JSON.stringify(map || {}));
}

function setTournamentAuthorized(tournamentId, token, expiresInMs) {
    if (!tournamentId || !token) return;
    const map = getScoringAuthMap();
    map[tournamentId] = {
        token,
        exp: Date.now() + (Number(expiresInMs) || (2 * 60 * 60 * 1000))
    };
    saveScoringAuthMap(map);
}

function getTournamentToken(tournamentId) {
    if (!tournamentId) return null;
    const map = getScoringAuthMap();
    const auth = map[tournamentId];
    if (!auth || !auth.token || !auth.exp || auth.exp < Date.now()) return null;
    return auth.token;
}

function isTournamentAuthorized(tournamentId) {
    return !!getTournamentToken(tournamentId);
}

// ========== SCREEN ==========
function showScreen(name) {
    document.querySelectorAll('.scorer-screen').forEach(s => s.style.display = 'none');
    const el = document.getElementById('screen-' + name);
    if (el) el.style.display = 'block';
}

function handleBack() {
    if (currentMatch && (currentMatch.status === 'live' || currentMatch.status === 'paused')) {
        if (confirm('Match is in progress. It will be saved. Go back?')) pauseAndExit(true);
    } else if (currentMatch && currentMatch.tournamentId) {
        openTournamentHub(currentMatch.tournamentId);
        currentMatch = null;
    } else if (currentTournament) {
        openTournamentHub(currentTournament.id);
        currentTournament = null;
    } else { location.href = '../index.html'; }
}

// ========== EVENT LISTENERS & INITIALIZATION ==========


// ========== SETUP TABS ==========
function switchSetupTab(tabName) {
    // Toggle Buttons
    document.querySelectorAll('.setup-tab-btn').forEach(btn => {
        const isTarget = (tabName === 'new' && btn.innerText.includes('NEW')) ||
                         (tabName === 'resume' && btn.innerText.includes('RESUME')) ||
                         (tabName === 'nrr' && btn.innerText.includes('NRR'));
        btn.classList.toggle('active', isTarget);
    });

    // Toggle Panels
    document.querySelectorAll('.setup-panel').forEach(panel => {
        panel.style.display = panel.id === `panel-setup-${tabName}` ? 'block' : 'none';
        panel.classList.toggle('active', panel.id === `panel-setup-${tabName}`);
    });

    // Special handling for NRR
    if (tabName === 'nrr') {
        const placeholder = document.getElementById('instant-nrr-placeholder');
        if (placeholder && !placeholder.innerHTML.trim()) {
            placeholder.innerHTML = `
                <div class="card" style="text-align:center; padding:40px">
                    <div style="font-size:48px; margin-bottom:20px">⚡</div>
                    <h3>Instant NRR Calculator</h3>
                    <p style="margin-bottom:24px; opacity:0.7">Quickly calculate Net Run Rate for any match scenario.</p>
                    <button class="btn btn-amber" onclick="showScreen('instant-nrr')">Launch Calculator</button>
                </div>
            `;
        }
    }
}

// ========== SETUP ==========
function selectMatchType(type) {
    currentMatchType = type;
    document.getElementById('type-single').classList.toggle('active', type === 'single');
    document.getElementById('type-tournament').classList.toggle('active', type === 'tournament');
    document.getElementById('type-instant-nrr').classList.toggle('active', type === 'instant-nrr');
    
    document.getElementById('tournament-setup-section').style.display = type === 'tournament' ? '' : 'none';

    if (type === 'tournament') {
        onTournamentSelect('new');
    } else if (type === 'instant-nrr') {
        showScreen('instant-nrr');
    } else {
        toggleMatchConfig(true);
    }
}

function toggleOfficialSettings(val) {
    const el = document.getElementById('official-settings');
    if (el) el.style.display = val === 'official' ? '' : 'none';
}

function onTournamentSelect(val) {
    document.getElementById('new-tournament-form').style.display = val === 'new' ? '' : 'none';
    toggleMatchConfig(val !== 'new');
}

function toggleMatchConfig(show) {
    const teams = document.getElementById('teams-grid');
    const toss = document.getElementById('toss-grid');
    const btn = document.getElementById('start-btn');
    const head = document.getElementById('match-config-head');

    if (teams) teams.style.display = show ? '' : 'none';
    if (toss) toss.style.display = show ? '' : 'none';

    if (head) head.textContent = show ? 'Match Configuration' : 'Tournament Base Settings';
    if (btn) btn.innerHTML = show ? 'Start Match' : 'Create Tournament';
}

function renderResumeMatches() {
    const container = document.getElementById('resume-matches-list');
    if (!container) return;

    // 1. Get ALL matches (live, paused, AND scheduled)
    const matches = DB.getMatches().filter(m => {
        // Only show matches that are NOT part of an official tournament OR are specifically scheduled
        // If it's a tournament match, we usually show it via the Tournament Hub, 
        // but user wants them "under" or accessible.
        // For now, let's show all Live/Paused matches and any Scheduled matches not in a tournament.
        if (['live', 'paused'].includes(m.status)) return true;
        if (m.status === 'scheduled' && !m.tournamentId) return true;
        return false;
    });

    const tourns = DB.getTournaments().filter(t => ['requested', 'approved', 'active'].includes(t.status));

    if (!matches.length && !tourns.length) {
        container.innerHTML = `<div style="color:var(--c-muted);font-size:14px;padding:20px;text-align:center;background:rgba(255,255,255,0.02);border-radius:12px">No active matches or tournaments.</div>`;
        return;
    }

    let html = '';

    // Tournaments first
    tourns.forEach(t => {
        const locked = (t.scoringPassword || t.password) ? '🔒 ' : '';
        const matchCount = t.matches ? t.matches.length : 0;
        
        let actionBtn = '';
        if (t.status === 'requested') {
            actionBtn = `<button class="btn btn-ghost btn-sm" disabled>Pending Approval</button>`;
        } else {
            actionBtn = `<button class="btn btn-green btn-sm" onclick="openTournamentHub('${t.id}')">Open Tournament</button>`;
        }

        html += `
            <div class="resume-card" style="border-left: 4px solid var(--c-primary)">
                <div class="resume-card-info">
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; opacity:0.6; margin-bottom:4px">Tournament</div>
                    <h4>${locked}${t.name}</h4>
                    <p>${t.isOfficial ? 'Official' : 'Unofficial'} · ${matchCount} matches scheduled</p>
                </div>
                ${actionBtn}
            </div>
        `;
    });

    // Individual Matches
    matches.forEach(m => {
        const inn = m.innings ? m.innings[m.currentInnings] : null;
        const score = m.status === 'scheduled' ? 'Scheduled' : (inn ? `${inn.runs}/${inn.wickets} (${formatOvers(inn.balls, m.ballsPerOver)})` : m.status.toUpperCase());
        const locked = (m.scoringPassword || m.password) ? '🔒 ' : '';
        const tName = m.type === 'tournament' ? (m.tournamentName || 'Tournament') : 'Single Match';
        const isLive = ['live', 'paused'].includes(m.status);

        html += `
            <div class="resume-card" style="border-left: 4px solid ${isLive ? 'var(--c-green)' : 'var(--c-amber)'}">
                <div class="resume-card-info">
                    <div style="font-size:10px; text-transform:uppercase; letter-spacing:1px; opacity:0.6; margin-bottom:4px">${m.status.toUpperCase()}</div>
                    <h4>${locked}${m.team1} vs ${m.team2}</h4>
                    <p>${score} · ${tName} · ${m.overs} overs</p>
                </div>
                <button class="btn ${isLive ? 'btn-primary' : 'btn-amber'} btn-sm" onclick="resumeMatch('${m.id}')">
                    ${isLive ? '▶ Resume' : '🏁 Start'}
                </button>
            </div>
        `;
    });

    container.innerHTML = html;
}

function submitMatchRequest() {
    const name = document.getElementById('req-name').value.trim();
    const pw = document.getElementById('req-password').value.trim();
    const phone = document.getElementById('req-phone') ? document.getElementById('req-phone').value.trim() : '';
    if (!name || !pw) { showToast('Name and Password are required!', 'error'); return; }

    if (_pendingTournPayload) {
        const tourn = DB.createTournament(_pendingTournPayload);
        tourn.status = 'requested';
        tourn.scoringPassword = pw;
        DB.saveTournament(tourn);

        DB.addRequest({ tournamentId: tourn.id, requesterName: name, organizerPhone: phone, requestedPassword: pw, type: 'tournament' });

        setTournamentAuthorized(tourn.id, 'local-creator', 7200000);
        _pendingTournPayload = null;
        closeModal('modal-request');
        showToast('Tournament request sent to Admin!');
        
        // Open the tournament hub in a NEW TAB
        const hubUrl = `score-match.html?tournamentId=${tourn.id}`;
        window.open(hubUrl, '_blank');
        
        renderResumeMatches();
    }
}

function resumeMatch(id) {
    const m = DB.getMatch(id);
    if (!m) return;

    if (m.tournamentId && isTournamentAuthorized(m.tournamentId)) {
        loadMatch(m);
        return;
    }

    if (m.scoringPassword || m.password) {
        currentMatch = m;
        currentTournament = null; // Important: reset tournament context
        document.getElementById('login-match-title').textContent = m.scheduledName || `${m.team1} vs ${m.team2}`;
        document.getElementById('login-password').value = '';
        showScreen('login');
    } else { loadMatch(m); }
}

let currentTournamentTab = 'matches';

function switchTournamentTab(tab) {
    currentTournamentTab = tab;
    const tMatches = document.getElementById('tm-tab-matches');
    const tTeams = document.getElementById('tm-tab-teams');
    const pMatches = document.getElementById('tm-panel-matches');
    const pTeams = document.getElementById('tm-panel-teams');

    if (tab === 'matches') {
        tMatches.classList.add('active');
        tTeams.classList.remove('active');
        pMatches.style.display = 'block';
        pTeams.style.display = 'none';
        renderTournamentMatches();
    } else {
        tMatches.classList.remove('active');
        tTeams.classList.add('active');
        pMatches.style.display = 'none';
        pTeams.style.display = 'block';
        renderTournamentTeams();
    }
}

function openTournamentHub(id) {
    const t = typeof id === 'object' ? id : DB.getTournament(id);
    if (!t) {
        showToast('Tournament not found!', 'error');
        return;
    }

    // Auth check
    if (t.scoringPassword && !isTournamentAuthorized(t.id)) {
        currentTournament = t;
        currentMatch = null;
        document.getElementById('login-match-title').textContent = `Tournament: ${t.name}`;
        document.getElementById('login-password').value = '';
        showScreen('login');
        return;
    }

    currentTournament = t;
    currentMatch = null;
    if (!t.rosters) t.rosters = {};
    
    document.getElementById('tm-title').textContent = t.name;
    document.getElementById('btn-add-tourn-match').onclick = () => {
        _setup_tourn_match_defaults(t);
        showScreen('setup');
        setTab('single');
    };

    switchTournamentTab('matches');
    openModal('modal-tournament-matches');
}

function promptTournamentLogin() {
    const tId = prompt('Enter Tournament ID:');
    if (tId) openTournamentHub(tId.trim());
}

function renderTournamentMatches() {
    const t = currentTournament;
    if (!t) return;
    
    // Security check
    if (t.scoringPassword && !isTournamentAuthorized(t.id)) {
        openTournamentHub(t.id);
        return;
    }

    let html = '';
    t.matches.forEach((mId, index) => {
        const m = DB.getMatch(mId);
        if (!m) return;

        let statusBadge = '';
        let btn = '';
        let matchName = `Match ${index + 1}`;
        let subInfo = 'Scheduled';
        let cardStyle = '';
        let locked = (m.scoringPassword || m.password) ? '🔒 ' : '';

        if (m.status === 'live' || m.status === 'paused') {
            statusBadge = `<span class="badge badge-green" style="font-size:10px">🔴 LIVE</span>`;
            btn = `<button class="btn btn-primary btn-sm" onclick="resumeMatch('${m.id}')">Resume</button>`;
            matchName = `${m.team1 || 'TBD'} vs ${m.team2 || 'TBD'}`;
            subInfo = `Match ${index + 1} · ${m.overs} ov`;
            cardStyle = 'border-left: 4px solid #00e676;';
        } else if (m.status === 'completed') {
            statusBadge = `<span class="badge badge-blue" style="font-size:10px">✅ Done</span>`;
            btn = `<button class="btn btn-ghost btn-sm" disabled>View Result</button>`;
            matchName = `${m.team1} vs ${m.team2}`;
            subInfo = `Match ${index + 1} · Completed`;
            cardStyle = 'opacity: 0.8;';
        } else {
            // Default: Scheduled, Requested, or any other status
            statusBadge = `<span class="badge badge-amber" style="font-size:10px">Scheduled</span>`;
            btn = `<button class="btn btn-primary btn-sm" onclick="startOfficialMatch('${m.id}')">Start Match</button>`;
            if (m.team1 && m.team2 && m.team1 !== 'TBD') {
                matchName = `${m.team1} vs ${m.team2}`;
            }
        }

        html += `<div class="resume-card" style="margin-bottom:8px; align-items: center; ${cardStyle}">
            <div class="resume-card-info" style="flex: 1">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--c-muted); margin-bottom: 2px">${subInfo}</div>
                <h4 style="font-size: 16px; font-weight: 800">${locked}${matchName}</h4>
            </div>
            <div style="text-align: right; display: flex; flex-direction: column; gap: 4px; align-items: flex-end">
                ${statusBadge}
                ${btn}
            </div>
        </div>`;
    });

    document.getElementById('tm-list').innerHTML = html;
    
    // Add Match listener
    const btnAdd = document.getElementById('btn-add-tourn-match');
    if (btnAdd) {
        btnAdd.onclick = () => {
            const count = t.matches.length + 1;
            const newM = DB.createMatch({
                type: 'tournament',
                tournamentId: t.id,
                tournamentName: t.name,
                scoringPassword: t.scoringPassword || t.password,
                team1: 'TBD',
                team2: 'TBD',
                overs: t.overs,
                ballsPerOver: t.ballsPerOver,
                playersPerSide: 11
            });
            newM.scheduledName = `Match ${count}`;
            newM.status = 'scheduled';
            DB.saveMatch(newM);
            t.matches.push(newM.id);
            DB.saveTournament(t);
            renderTournamentMatches(); // Refresh the list
        };
    }

    // End Tournament listener
    const btnEnd = document.getElementById('btn-end-tournament');
    if (btnEnd) {
        btnEnd.style.display = (t.status === 'active' || t.status === 'approved') ? 'block' : 'none';
        btnEnd.onclick = () => endTournamentManually(t.id);
    }

    showScreen('setup');
    openModal('modal-tournament-matches');
}

function endTournamentManually(tournId) {
    if (!confirm("Are you sure you want to end this tournament? This will mark it as completed and finalize results.")) return;
    const t = DB.getTournament(tournId);
    if (t) {
        t.status = 'completed';
        t.rosters = {}; // Clear rosters when tournament is COMPLETED
        DB.saveTournament(t);
        showToast('Tournament marked as COMPLETED!', 'success');
        closeModal('modal-tournament-matches');
        // Optionally refresh summary if applicable
        if (currentMatch && currentMatch.tournamentId === tournId) {
           openTournamentSummary();
        }
    }
}

function startOfficialMatch(mId) {
    const m = DB.getMatch(mId);
    if (!m) return;

    if (m.tournamentId && !isTournamentAuthorized(m.tournamentId)) {
        currentMatch = m;
        currentMatch.isScheduledTemplate = true;
        document.getElementById('login-match-title').textContent = m.scheduledName || `${m.team1} vs ${m.team2}`;
        document.getElementById('login-password').value = '';
        showScreen('login');
        closeModal('modal-tournament-matches');
        return;
    }

    closeModal('modal-tournament-matches');

    showScreen('setup');
    document.getElementById('type-tournament').click();
    currentMatch = m; // Set it early to avoid null issues in other handlers
    setTimeout(() => {
        document.getElementById('tournament-setup-section').style.display = 'none';
        document.getElementById('team1-name').value = (m.team1 !== 'TBD' ? m.team1 : '');
        document.getElementById('team2-name').value = (m.team2 !== 'TBD' ? m.team2 : '');
        document.getElementById('setup-overs').value = m.overs;
        document.getElementById('setup-bpo').value = m.ballsPerOver;
        document.getElementById('setup-pps').value = m.playersPerSide || 11;
        
        const datalist = document.getElementById('team-suggestions');
        if (datalist && currentTournament && currentTournament.teams) {
            datalist.innerHTML = currentTournament.teams.map(t => `<option value="${t}"></option>`).join('');
        }
        
        currentMatch.isScheduledTemplate = true;
    }, 100);
}

async function loginToMatch() {
    const pw = document.getElementById('login-password').value.trim();
    if (!pw) { showToast('Password required!', 'error'); return; }

    const baseUrl = window.BACKEND_BASE_URL || 'http://localhost:3000';
    const tournamentId = currentTournament?.id || currentMatch?.tournamentId || null;

    // 1. LOCAL CHECK FIRST
    if (!tournamentId) {
        if (currentMatch && (currentMatch.scoringPassword || currentMatch.password)) {
            const localPw = currentMatch.scoringPassword || currentMatch.password;
            if (pw === localPw) {
                loadMatch(currentMatch);
                return;
            } else {
                showToast('Invalid password!', 'error');
                return;
            }
        }
    } else {
        const localT = DB.getTournament(tournamentId);
        if (localT && localT.scoringPassword) {
            if (localT.scoringPassword === pw) {
                setTournamentAuthorized(tournamentId, 'local-token', 1000 * 60 * 60 * 24);
                if (currentTournament && !currentMatch) {
                    openTournamentHub(currentTournament.id);
                    currentTournament = null;
                    showScreen('setup');
                    return;
                }
                if (currentMatch) {
                    const matchData = currentMatch;
                    if (matchData.isScheduledTemplate) {
                        showScreen('setup');
                        document.getElementById('type-tournament').click();
                        setTimeout(() => {
                            document.getElementById('tournament-setup-section').style.display = 'none';
                            document.getElementById('team1-name').value = (matchData.team1 !== 'TBD' ? matchData.team1 : '');
                            document.getElementById('team2-name').value = (matchData.team2 !== 'TBD' ? matchData.team2 : '');
                            document.getElementById('setup-overs').value = matchData.overs;
                            document.getElementById('setup-bpo').value = matchData.ballsPerOver;
                            document.getElementById('setup-pps').value = matchData.playersPerSide || 11;
                            
                            const datalist = document.getElementById('team-suggestions');
                            if (datalist && localT && localT.teams) {
                                datalist.innerHTML = localT.teams.map(t => `<option value="${t}"></option>`).join('');
                            }
                        }, 100);
                    } else {
                        loadMatch(matchData);
                    }
                }
                return;
            } else if (!localT.isOfficial) {
                // If it's purely local and unofficial, password failed. Don't fetch backend.
                showToast('Invalid password!', 'error');
                return;
            }
        }
    }

    // 2. BACKEND FALLBACK
    try {
        if (!tournamentId) {
            const fallbackRes = await fetch(baseUrl + '/api/verify-scoring-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: currentMatch?.id, type: 'match', password: pw })
            });
            const fallbackData = await fallbackRes.json();
            if (fallbackData.ok) {
                if (currentMatch && currentMatch.isScheduledTemplate) {
                    showScreen('setup');
                } else if (currentMatch) {
                    loadMatch(currentMatch);
                }
                return;
            }
            showToast('Invalid password!', 'error');
            return;
        }

        const res = await fetch(baseUrl + `/api/tournaments/${tournamentId}/verify-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw })
        });
        const data = await res.json();
        
        if (data.ok) {
            if (data.token) {
                setTournamentAuthorized(tournamentId, data.token, data.expiresInMs);
            }
            if (currentTournament && !currentMatch) {
                openTournamentHub(currentTournament.id);
                currentTournament = null;
                showScreen('setup');
                return;
            }
            if (currentMatch) {
                const matchData = currentMatch;
                if (matchData.isScheduledTemplate) {
                    showScreen('setup');
                    document.getElementById('type-tournament').click();
                    setTimeout(() => {
                        document.getElementById('tournament-setup-section').style.display = 'none';
                        document.getElementById('team1-name').value = (matchData.team1 !== 'TBD' ? matchData.team1 : '');
                        document.getElementById('team2-name').value = (matchData.team2 !== 'TBD' ? matchData.team2 : '');
                        document.getElementById('setup-overs').value = matchData.overs;
                        document.getElementById('setup-bpo').value = matchData.ballsPerOver;
                        document.getElementById('setup-pps').value = matchData.playersPerSide || 11;

                        const datalist = document.getElementById('team-suggestions');
                        if (datalist && tournamentId) {
                            fetch(baseUrl + '/api/tournaments/' + tournamentId)
                                .then(r => r.json())
                                .then(data => {
                                    if (data && data.teams) {
                                        datalist.innerHTML = data.teams.map(t => `<option value="${t}"></option>`).join('');
                                    }
                                }).catch(() => {});
                        }
                    }, 100);
                } else {
                    loadMatch(matchData);
                }
            }
        } else {
            showToast(data.error || 'Invalid password!', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Security verification failed. Check backend connection.', 'error');
    }
}

function startNewMatch() {
    let existingOfficialTournamentId = null;

    if (!currentMatch || !currentMatch.isScheduledTemplate) {
        if (currentMatchType === 'tournament') {
            const sel = 'new';
            if (sel === 'new') {
                const tName = document.getElementById('tourn-name').value.trim();
                const scoringPw = document.getElementById('tourn-scoring-password').value.trim();
                const teamLines = document.getElementById('tourn-teams').value.split('\n').map(l => l.trim()).filter(Boolean);
                const overs = parseInt(document.getElementById('setup-overs').value) || 20;
                const bpo = parseInt(document.getElementById('setup-bpo').value) || 6;
                const tournType = document.getElementById('tourn-type') ? document.getElementById('tourn-type').value : 'unofficial';
                const format = document.getElementById('tourn-format').value;

                if (!tName) { showToast('Enter tournament name', 'error'); return; }
                if (teamLines.length < 2) { showToast('Enter at least 2 teams', 'error'); return; }
                if (!scoringPw) { showToast('Tournament scoring password is required', 'error'); return; }

                if (tournType === 'official') {
                    const matchCount = format === 'knockout' 
                        ? (parseInt(document.getElementById('tourn-team-count').value) - 1)
                        : (parseInt(document.getElementById('tourn-match-count')?.value) || 10);
                    const startDate = document.getElementById('tourn-start-date')?.value || '';
                    const prize1 = document.getElementById('tourn-prize-1')?.value || '';
                    const prize2 = document.getElementById('tourn-prize-2')?.value || '';
                    const prize3 = document.getElementById('tourn-prize-3')?.value || '';

                    _pendingTournPayload = {
                        name: tName, format, overs, ballsPerOver: bpo, teams: teamLines, isOfficial: true, 
                        scoringPassword: scoringPw,
                        totalTeams: format === 'knockout' ? parseInt(document.getElementById('tourn-team-count').value) : teamLines.length,
                        matchCount,
                        startDate, prizes: { first: prize1, second: prize2, third: prize3 }
                    };

                    document.getElementById('req-name').value = '';
                    document.getElementById('req-password').value = '';
                    document.getElementById('request-match-title').textContent = tName;
                    openModal('modal-request');
                    return;
                } else {
                    const matchCount = format === 'knockout' 
                        ? (parseInt(document.getElementById('tourn-team-count').value) - 1)
                        : (parseInt(document.getElementById('tourn-match-count')?.value) || 10);
                    const tourn = DB.createTournament({
                        name: tName, format, overs, ballsPerOver: bpo, 
                        scoringPassword: scoringPw,
                        teams: teamLines, isOfficial: false, 
                        totalTeams: format === 'knockout' ? parseInt(document.getElementById('tourn-team-count').value) : teamLines.length,
                        matchCount: matchCount 
                    });
                    setTournamentAuthorized(tourn.id, 'local-creator', 7200000);
                    showToast(`Tournament "${tName}" created!`, 'success');
                    renderResumeMatches();
                    // window.open removed as per user request
                    return;
                }
            } else {
                const tourn = DB.getTournament(sel);
                if (tourn && tourn.isOfficial) {
                    existingOfficialTournamentId = tourn.id;
                }
            }
        }
    }

    if (existingOfficialTournamentId) {
        showToast('Official Tournament selected! Matches are already scheduled below. Please request to score them.', 'default');
        return;
    }

    const overs = parseInt(document.getElementById('setup-overs').value) || 20;
    const bpo = parseInt(document.getElementById('setup-bpo').value) || 6;

    const t1 = document.getElementById('team1-name').value.trim();
    const t2 = document.getElementById('team2-name').value.trim();
    if (!t1 || !t2) { showToast('Enter both team names', 'error'); return; }

    const pps = parseInt(document.getElementById('setup-pps').value) || 11;
    const venue = document.getElementById('setup-venue').value.trim();
    const tossWinner = document.getElementById('setup-toss').value === 'team1' ? t1 : t2;
    const dec = document.getElementById('setup-decision').value;
    const battingFirst = dec === 'bat' ? tossWinner : (tossWinner === t1 ? t2 : t1);
    const fieldingFirst = battingFirst === t1 ? t2 : t1;
    const scorerName = document.getElementById('setup-scorer') ? document.getElementById('setup-scorer').value.trim() : '';

    let match = null;

    if (currentMatch && currentMatch.isScheduledTemplate) {
        // We are starting an approved scheduled match
        match = currentMatch;
        match.team1 = t1;
        match.team2 = t2;
        match.overs = overs;
        match.ballsPerOver = bpo;
        match.playersPerSide = pps;
        match.venue = venue;
        match.scorerName = scorerName;
        match.tossWinner = tossWinner;
        match.tossDecision = dec;
        match.battingFirst = battingFirst;
        match.fieldingFirst = fieldingFirst;
        match.innings = [DB.createInnings(battingFirst, fieldingFirst), null];
        match.currentInnings = 0;
        match.history = [];
        match.redoStack = [];
        delete match.isScheduledTemplate;
    } else {
        if (!match) {
            let tournamentId = null, tournamentName = null;
            // Since tournament-select is gone, we check if we just created a tournament
            // or if we are in tournament mode (which now always creates a new one first).
            // Usually, this part of startNewMatch is only reached for SINGLE matches 
            // or if tournament creation happened and we are proceeding (though we use new tab now).
            
            if (currentMatchType === 'tournament') {
                // If we reach here in tournament mode, it's likely an error unless we handle it.
                // But for safety, we'll try to find the latest tournament.
                const allTourns = DB.getTournaments();
                if (allTourns.length) {
                    const lastT = allTourns[allTourns.length - 1];
                    tournamentId = lastT.id;
                    tournamentName = lastT.name;
                }
            }

             let scoringPassword = document.getElementById('match-scoring-password').value.trim() || null;
             
             if (currentMatchType === 'tournament' && !scoringPassword && tournamentId) {
                 const t = DB.getTournament(tournamentId);
                 if (t && t.scoringPassword) scoringPassword = t.scoringPassword;
             }

            match = DB.createMatch({ 
                type: currentMatchType, 
                tournamentId, 
                tournamentName, 
                scoringPassword, 
                scorerName,
                team1: t1, 
                team2: t2, 
                overs, 
                ballsPerOver: bpo, 
                playersPerSide: pps, 
                venue, 
                tossWinner, 
                tossDecision: dec, 
                battingFirst, 
                fieldingFirst 
            });
        }
    }

    match.status = 'live';

    if (match.tournamentId) {
        const tourn = DB.getTournament(match.tournamentId);
        if (tourn && !tourn.matches.includes(match.id)) { tourn.matches.push(match.id); DB.saveTournament(tourn); }
    }

    DB.saveMatch(match);
    _innings_ending = false;
    loadMatch(match);
    setTimeout(() => openOpenBatsmenModal(), 300);
}

function loadMatch(m) {
    currentMatch = m;
    m.status = 'live';

    // Auto-populate player datalist for suggestions in official tournaments
    const dl = document.getElementById('db-players-list');
    if (dl) {
        if (m.type === 'tournament' && DB.getTournament(m.tournamentId)?.isOfficial) {
            const players = DB.getPlayers();
            dl.innerHTML = players.map(p => `<option value="${p.name}">${p.playerId} - ${p.team}</option>`).join('');
        } else {
            dl.innerHTML = '';
        }
    }
    _innings_ending = false;
    DB.saveMatch(m);
    showScreen('scoring');
    renderScoring();
    const pt = document.getElementById('publish-toggle');
    if (pt) pt.checked = m.publishLive;
    updateHeaderActions();
}

function updateHeaderActions() {
    const el = document.getElementById('header-actions');
    const m = currentMatch;
    if (!m) { el.innerHTML = ''; return; }
    el.innerHTML = `
    <span class="badge badge-${m.status === 'live' ? 'green' : 'amber'}">${m.status === 'live' ? 'LIVE' : 'Paused'}</span>`;
}

function editPlayerName(role, idx) {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn) return;

    if (role === 'batsman') {
        const batIdx = inn.currentBatsmenIdx[idx];
        if (batIdx === undefined || batIdx === null) return;
        const bat = inn.batsmen[batIdx];
        const newName = prompt("Edit Batsman Name:", bat.name);
        if (newName && newName.trim() !== '') {
            bat.name = newName.trim();
            saveMatchState();
            renderScoring();
            showToast('Batsman name updated!', 'success');
        }
    } else if (role === 'bowler') {
        if (inn.currentBowlerIdx === null) return;
        const bowl = inn.bowlers[inn.currentBowlerIdx];
        const newName = prompt("Edit Bowler Name:", bowl.name);
        if (newName && newName.trim() !== '') {
            bowl.name = newName.trim();
            saveMatchState();
            renderScoring();
            showToast('Bowler name updated!', 'success');
        }
    }
}

// ========== RENDER SCORING UI ==========
function renderScoring() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn) return;

    // Banner
    document.getElementById('sb-batting-team').textContent = inn.battingTeam;
    document.getElementById('sb-bowling-team').textContent = inn.bowlingTeam;
    document.getElementById('sb-score').textContent = `${inn.runs}/${inn.wickets}`;
    document.getElementById('sb-overs').textContent = `${formatOvers(inn.balls, m.ballsPerOver)} ov`;
    document.getElementById('sb-crr').textContent = formatCRR(inn.runs, inn.balls);

    // Target info
    const tbArea = document.getElementById('sb-target-area');
    if (m.currentInnings === 1 && m.innings[0]) {
        const target = m.innings[0].runs + 1;
        const need = target - inn.runs;
        const ballsLeft = (m.overs * m.ballsPerOver) - inn.balls;
        const rrr = ballsLeft > 0 ? ((need / ballsLeft) * m.ballsPerOver).toFixed(2) : '—';
        tbArea.innerHTML = `
      <div class="sb-target-text">Target: ${target}</div>
      <div class="sb-need-text">${need > 0 ? `Need ${need} off ${ballsLeft} balls` : '🎉 Won!'} · RRR: ${rrr}</div>`;
    } else { tbArea.innerHTML = ''; }

    // Current over balls strip
    const strip = document.getElementById('over-balls-strip');
    strip.innerHTML = inn.currentOver.map(b => {
        const cls = b.wicket ? 'wicket' : b.type === 'four' ? 'four' : b.type === 'six' ? 'six'
            : b.type === 'wide' ? 'wide' : b.type === 'noball' ? 'noball'
                : b.type === 'bye' ? 'bye' : b.type === 'legbye' ? 'legbye'
                    : b.runs === 0 ? 'dot' : '';
        const label = b.wicket ? 'W' : b.type === 'wide' ? 'Wd' : b.type === 'noball' ? 'Nb'
            : b.type === 'bye' ? `By${b.runs}` : b.type === 'legbye' ? `Lb${b.runs}` : (b.runs || '·');
        return `<div class="obs-chip ${cls}">${label}</div>`;
    }).join('');

    // Batting stats
    [0, 1].forEach(i => {
        const batIdx = inn.currentBatsmenIdx[i];
        const bat = (batIdx !== undefined && batIdx !== null) ? inn.batsmen[batIdx] : null;
        document.getElementById(`bat${i}-name`).textContent = bat ? bat.name : '-';
        document.getElementById(`bat${i}-runs`).textContent = bat ? (bat.runs || 0) : 0;
        document.getElementById(`bat${i}-balls`).textContent = bat ? (bat.balls || 0) : 0;
        document.getElementById(`bat${i}-4s`).textContent = bat ? (bat.fours || 0) : 0;
        document.getElementById(`bat${i}-6s`).textContent = bat ? (bat.sixes || 0) : 0;
        document.getElementById(`bat${i}-sr`).textContent = bat ? formatSR(bat.runs || 0, bat.balls || 0) : '0.0';
        const rowEl = document.getElementById(`bat-row-${i}`);
        rowEl.style.background = i === inn.strikerIdx ? 'rgba(124,77,255,0.12)' : 'transparent';
        document.getElementById(`bat${i}-name`).className = i === inn.strikerIdx ? 'striker-name' : '';
        document.getElementById(`striker-opt-label-${i}`).textContent = bat ? bat.name : `Batter ${i + 1}`;
        document.getElementById(`striker-opt-${i}`).classList.toggle('active', i === inn.strikerIdx);
    });

    // Bowling
    const bowler = inn.currentBowlerIdx !== null ? inn.bowlers[inn.currentBowlerIdx] : null;
    document.getElementById('bowler-name').textContent = bowler ? bowler.name : '-';
    document.getElementById('bowler-overs').textContent = bowler ? formatOvers(bowler.balls || 0, m.ballsPerOver) : '0';
    document.getElementById('bowler-maidens').textContent = bowler ? (bowler.maidens || 0) : '0';
    document.getElementById('bowler-runs').textContent = bowler ? (bowler.runs || 0) : '0';
    document.getElementById('bowler-wkts').textContent = bowler ? (bowler.wickets || 0) : '0';
    document.getElementById('bowler-econ').textContent = bowler ? formatEcon(bowler.runs || 0, bowler.balls || 0, m.ballsPerOver) : '0.0';

    // Partnership – track per partnership object
    const p = getPartnership(inn);
    document.getElementById('partner-runs').textContent = p.runs;
    document.getElementById('partner-balls').textContent = p.balls;
    document.getElementById('partner-sr').textContent = formatSR(p.runs, p.balls);

    // Fall of wickets
    const fowEl = document.getElementById('fow-list');
    if (inn.fallOfWickets && inn.fallOfWickets.length) {
        fowEl.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px">` +
            inn.fallOfWickets.map((fw, i) =>
                `<span class="badge badge-red" title="${fw.batsmanName} – ${fw.wicketType}">${i + 1}–${fw.runs} (${fw.batsmanName}, ${formatOvers(fw.balls, m.ballsPerOver)} ov)</span>`
            ).join('') + `</div>`;
    } else { fowEl.textContent = 'No wickets yet'; }

    // Undo/Redo states
    document.getElementById('undo-btn').disabled = !(m.history && m.history.length);
    document.getElementById('redo-btn').disabled = !(m.redoStack && m.redoStack.length);
    const lastBall = m.history && m.history.length ? m.history[m.history.length - 1] : null;
    document.getElementById('last-ball-info').textContent = lastBall ? 'Last action can be undone' : '';
}

function getPartnership(inn) {
    // Use dedicated partnership tracker
    if (!inn.currentPartnership) inn.currentPartnership = { runs: 0, balls: 0 };
    return inn.currentPartnership;
}

function setStriker(i) {
    if (!currentMatch) return;
    currentMatch.innings[currentMatch.currentInnings].strikerIdx = i;
    saveAndRender();
}

// ========== RECORD BALL ==========
function recordBall(event) {
    const m = currentMatch;
    if (!m || m.status !== 'live') return;
    const inn = m.innings[m.currentInnings];
    if (!inn || inn.isDone) return;

    // Need bowler?
    if (inn.currentBowlerIdx === null) {
        pendingBallEvent = event; openNewBowlerModal(); return;
    }
    // Need batsmen?
    const idx0 = inn.currentBatsmenIdx[0], idx1 = inn.currentBatsmenIdx[1];
    if (idx0 === undefined || idx0 === null || !inn.batsmen[idx0]) {
        pendingBallEvent = event; openNewBatsmanModal(0, '1st Batsman'); return;
    }
    if (idx1 === undefined || idx1 === null || !inn.batsmen[idx1]) {
        pendingBallEvent = event; openNewBatsmanModal(1, '2nd Batsman'); return;
    }

    pushHistory();
    applyBall(inn, event);
    saveAndRender();
    // Check order matters: over end first, then innings end
    checkEndOfOver(inn);
    checkEndOfInnings(inn, null);
}

function applyBall(inn, event) {
    const m = currentMatch;
    const bpo = m.ballsPerOver;
    const strikerSlot = inn.strikerIdx;
    const strikerIdx = inn.currentBatsmenIdx[strikerSlot];
    const striker = inn.batsmen[strikerIdx];
    const bowler = inn.bowlers[inn.currentBowlerIdx];

    const isLegal = (event.type !== 'wide' && event.type !== 'noball');
    const runs = event.runs || 0;

    if (isLegal) {
        inn.balls++;
        striker.balls++;
    }

    inn.runs += runs;

    // Batsman scoring: runs go to striker (not for bye/legbye)
    if (event.type !== 'bye' && event.type !== 'legbye') {
        striker.runs += runs;
        if (event.type === 'four') striker.fours++;
        if (event.type === 'six') striker.sixes++;
    }

    // Bowler concedes runs (NOT for bye/legbye)
    if (bowler) {
        if (isLegal) bowler.balls++;
        if (event.type !== 'bye' && event.type !== 'legbye') bowler.runs += runs;
        // Maiden check: done at end of over
    }

    // Partnership tracking
    if (!inn.currentPartnership) inn.currentPartnership = { runs: 0, balls: 0 };
    inn.currentPartnership.runs += runs;
    if (isLegal) inn.currentPartnership.balls++;

    // Push ball record
    inn.currentOver.push({
        type: event.type,
        runs,
        wicket: false,
        batsmanIdx: strikerIdx,
        bowlerIdx: inn.currentBowlerIdx,
        legal: isLegal,
    });

    // Rotate strike on odd runs (legal balls only)
    if (isLegal && runs % 2 === 1) {
        inn.strikerIdx = inn.strikerIdx === 0 ? 1 : 0;
    }
}

function recordExtra(type) {
    const m = currentMatch;
    if (!m || m.status !== 'live') return;
    const inn = m.innings[m.currentInnings];
    if (!inn || inn.isDone) return;
    if (inn.currentBowlerIdx === null) { pendingExtraType = type; openNewBowlerModal(); return; }

    pushHistory();
    if (type === 'wide') {
        inn.runs++; inn.extras.wides++;
        inn.bowlers[inn.currentBowlerIdx].runs++;
        if (!inn.currentPartnership) inn.currentPartnership = { runs: 0, balls: 0 };
        inn.currentPartnership.runs++;
        inn.currentOver.push({ type: 'wide', runs: 1, wicket: false, legal: false });
    } else if (type === 'noball') {
        openNoballModal(); // Redirect to new modal flow
        return;
    }
    saveAndRender();
    checkEndOfInnings(inn, null);
}

// ---- Bye / Leg Bye ----
function openByeModal() {
    byeExtraType = 'bye';
    document.getElementById('bye-modal-title').textContent = 'Bye Runs';
    byeRuns = 1;
    document.querySelectorAll('#modal-bye .wr-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    openModal('modal-bye');
}
function openLegByeModal() {
    byeExtraType = 'legbye';
    document.getElementById('bye-modal-title').textContent = 'Leg Bye Runs';
    byeRuns = 1;
    document.querySelectorAll('#modal-bye .wr-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    openModal('modal-bye');
}
function selectByeRuns(btn) {
    byeRuns = parseInt(btn.dataset.val);
    document.querySelectorAll('#modal-bye .wr-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function confirmBye() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn || inn.isDone) { closeModal('modal-bye'); return; }

    if (inn.currentBowlerIdx === null) {
        closeModal('modal-bye');
        pendingExtraType = byeExtraType;
        openNewBowlerModal(); return;
    }

    // Ensure batsmen exist
    if (!inn.batsmen.length || inn.currentBatsmenIdx[0] === null) {
        closeModal('modal-bye'); return;
    }

    pushHistory();

    // Bye/LegBye: runs go to team total and extras, NOT to batsman
    // BUT it IS a legal delivery (ball counts, bowler ball counts)
    inn.runs += byeRuns;
    inn.balls++;

    const bowler = inn.bowlers[inn.currentBowlerIdx];
    if (bowler) bowler.balls++; // bowler's ball count increases but NOT runs

    if (byeExtraType === 'bye') inn.extras.byes += byeRuns;
    else inn.extras.legByes += byeRuns;

    if (!inn.currentPartnership) inn.currentPartnership = { runs: 0, balls: 0 };
    inn.currentPartnership.runs += byeRuns;
    inn.currentPartnership.balls += 1;

    // Batsman at strike: ball counts for THEIR balls faced (it's a legal delivery)
    const strikerIdx = inn.currentBatsmenIdx[inn.strikerIdx];
    if (strikerIdx !== null && inn.batsmen[strikerIdx]) {
        inn.batsmen[strikerIdx].balls++;
    }

    inn.currentOver.push({ type: byeExtraType, runs: byeRuns, wicket: false, legal: true });

    // Rotate strike on odd runs
    if (byeRuns % 2 === 1) inn.strikerIdx = inn.strikerIdx === 0 ? 1 : 0;

    closeModal('modal-bye');
    saveAndRender();
    checkEndOfOver(inn);
    checkEndOfInnings(inn, null);
}

// ---- No Ball ----
let noballRuns = 0;

function openNoballModal() {
    noballRuns = 0;
    document.querySelectorAll('#modal-noball .wr-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
    openModal('modal-noball');
}

function selectNoballRuns(btn) {
    noballRuns = parseInt(btn.dataset.val);
    document.querySelectorAll('#modal-noball .wr-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function confirmNoball() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn || inn.isDone) { closeModal('modal-noball'); return; }

    if (inn.currentBowlerIdx === null) {
        closeModal('modal-noball');
        pendingExtraType = 'custom_noball';
        openNewBowlerModal(); return;
    }

    if (!inn.batsmen.length || inn.currentBatsmenIdx[0] === null) {
        closeModal('modal-noball'); return;
    }

    pushHistory();

    const totalRuns = 1 + noballRuns;
    inn.runs += totalRuns;
    inn.extras.noBalls += 1;

    const strikerIdx = inn.currentBatsmenIdx[inn.strikerIdx];
    const striker = inn.batsmen[strikerIdx];
    if (striker && noballRuns > 0) {
        striker.runs += noballRuns;
        if (noballRuns === 4) striker.fours++;
        if (noballRuns === 6) striker.sixes++;
        striker.balls++; 
    }

    const bowler = inn.bowlers[inn.currentBowlerIdx];
    if (bowler) bowler.runs += totalRuns;

    if (!inn.currentPartnership) inn.currentPartnership = { runs: 0, balls: 0 };
    inn.currentPartnership.runs += totalRuns;

    inn.currentOver.push({ type: 'noball', runs: noballRuns, wicket: false, legal: false });

    if (noballRuns % 2 === 1) inn.strikerIdx = inn.strikerIdx === 0 ? 1 : 0;

    closeModal('modal-noball');
    saveAndRender();
    checkEndOfInnings(inn, null);
}

// ========== WICKET ==========
function openWicketModal() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn) return;


    const bat0 = inn.batsmen[inn.currentBatsmenIdx[0]];
    const bat1 = inn.batsmen[inn.currentBatsmenIdx[1]];
    document.getElementById('wk-bat-name-0').textContent = bat0 ? bat0.name : 'Batter 1';
    document.getElementById('wk-bat-name-1').textContent = bat1 ? bat1.name : 'Batter 2';

    // Reset wicket runs selection
    wicketRuns = 0;
    document.querySelectorAll('#modal-wicket .wr-btn').forEach(b =>
        b.classList.toggle('active', parseInt(b.dataset.val) === 0)
    );
    document.getElementById('wicket-fielder').value = '';
    document.getElementById('wicket-type').selectedIndex = 0;

    openModal('modal-wicket');
}

function selectWicketRuns(btn) {
    wicketRuns = parseInt(btn.dataset.val || 0);
    document.querySelectorAll('#modal-wicket .wr-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function confirmWicket() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn || inn.isDone) { closeModal('modal-wicket'); return; }

    if (inn.currentBowlerIdx === null) { closeModal('modal-wicket'); openNewBowlerModal(); return; }

    const radio = document.querySelector('input[name="dismissed"]:checked');
    const dismissedSlot = radio ? parseInt(radio.value) : inn.strikerIdx;
    const dismissedBatIdx = inn.currentBatsmenIdx[dismissedSlot];
    const dismissedBat = inn.batsmen[dismissedBatIdx];
    const wicketType = document.getElementById('wicket-type').value;
    const fielder = document.getElementById('wicket-fielder').value.trim();

    pushHistory();

    // This is a legal delivery → balls++
    inn.balls++;
    inn.wickets++;
    inn.runs += wicketRuns;

    // Dismissed batsman stats
    if (dismissedBat) {
        dismissedBat.balls++;                           // ball faced on dismissal
        dismissedBat.runs += wicketRuns;               // if they ran before getting out
        dismissedBat.notOut = false;
        dismissedBat.dismissal = buildDismissalText(wicketType, fielder,
            inn.bowlers[inn.currentBowlerIdx]?.name);
    }

    // Bowler stats
    const bowler = inn.bowlers[inn.currentBowlerIdx];
    if (bowler) {
        bowler.balls++;
        bowler.runs += wicketRuns;
        const notBowlerWickets = ['Run Out', 'Obstructing', 'Handled Ball', 'Timed Out'];
        if (!notBowlerWickets.includes(wicketType)) bowler.wickets++;
    }

    // Fall of wickets
    inn.fallOfWickets.push({
        runs: inn.runs, balls: inn.balls,
        batsmanName: dismissedBat ? dismissedBat.name : '?',
        wicketType,
    });

    // Reset partnership for new pair
    inn.currentPartnership = { runs: 0, balls: 0 };

    // Ball record
    inn.currentOver.push({ type: 'run', runs: wicketRuns, wicket: true, legal: true });

    // Rotate on odd wicket-ball runs
    if (wicketRuns % 2 === 1) inn.strikerIdx = inn.strikerIdx === 0 ? 1 : 0;

    currentPendingWicket = dismissedSlot;
    closeModal('modal-wicket');
    saveAndRender();

    // Check end of over first
    const overDone = checkEndOfOver(inn);

    // Check end of innings
    const m2 = currentMatch;
    const needWickets = m2.playersPerSide - 1;
    const needBalls = m2.overs * m2.ballsPerOver;
    const innsEnded = inn.wickets >= needWickets || inn.balls >= needBalls;

    if (m2.currentInnings === 1 && m2.innings[0] && inn.runs >= m2.innings[0].runs + 1) {
        // Chase complete
        inn.isDone = true;
        finishInnings(inn, 'chase_won');
        return;
    }

    if (innsEnded) {
        inn.isDone = true;
        finishInnings(inn, 'all_out_or_overs');
    } else {
        // Need new batsman
        setTimeout(() => openNewBatsmanModal(dismissedSlot, 'New Batsman In'), overDone ? 500 : 100);
    }
}

function buildDismissalText(type, fielder, bowlerName) {
    switch (type) {
        case 'Bowled': return `b ${bowlerName || '?'}`;
        case 'Caught': return `c ${fielder || '?'} b ${bowlerName || '?'}`;
        case 'LBW': return `lbw b ${bowlerName || '?'}`;
        case 'Run Out': return `run out (${fielder || '?'})`;
        case 'Stumped': return `st ${fielder || '?'} b ${bowlerName || '?'}`;
        case 'Hit Wicket': return `hit wkt b ${bowlerName || '?'}`;
        case 'C&B': return `c & b ${bowlerName || '?'}`;
        default: return type;
    }
}

// ========== NEW BATSMAN ==========
function openNewBatsmanModal(slot, title) {
    currentPendingWicket = (slot !== undefined) ? slot : 0;
    document.getElementById('new-batsman-sub').textContent = title || 'New Batsman';
    document.getElementById('new-bat-name').value = '';
    document.getElementById('new-bat-pid').value = '';
    document.getElementById('player-lookup-result').textContent = '';
    openModal('modal-new-batsman');
}

function lookupPlayer() {
    const pid = document.getElementById('new-bat-pid').value.trim().toUpperCase();
    const player = DB.getPlayerById(pid);
    const resultEl = document.getElementById('player-lookup-result');
    if (player) {
        document.getElementById('new-bat-name').value = player.name;
        resultEl.innerHTML = `✅ <b>${player.name}</b> | ${capitalize(player.role || 'player')} | ${player.team || 'No team'}`;
        resultEl.style.color = '#00e676';
    } else {
        resultEl.textContent = `❌ Player ID "${pid}" not found in database`;
        resultEl.style.color = '#ff6d3b';
    }
}

function confirmNewBatsman() {
    const name = document.getElementById('new-bat-name').value.trim();
    let pid = document.getElementById('new-bat-pid').value.trim().toUpperCase();
    if (!name) { showToast('❌ Enter batsman name', 'error'); return; }

    if (!pid) {
        const pMatch = DB.getPlayers().find(p => p.name.toLowerCase() === name.toLowerCase());
        if (pMatch) pid = pMatch.playerId;
    }

    const m = currentMatch;
    const inn = m.innings[m.currentInnings];
    const bat = {
        name, playerId: pid || null,
        runs: 0, balls: 0, fours: 0, sixes: 0,
        notOut: true, dismissal: null,
    };
    inn.batsmen.push(bat);
    const newIdx = inn.batsmen.length - 1;

    const idx0 = inn.currentBatsmenIdx[0];
    const idx1 = inn.currentBatsmenIdx[1];

    // Replace dismissed slot or fill first empty
    if (idx0 === undefined || idx0 === null) {
        inn.currentBatsmenIdx[0] = newIdx;
    } else if (idx1 === undefined || idx1 === null) {
        inn.currentBatsmenIdx[1] = newIdx;
    } else {
        inn.currentBatsmenIdx[currentPendingWicket] = newIdx;
    }
    
    // Auto-set striker to the new batsman
    inn.strikerIdx = (idx0 === undefined || idx0 === null) ? 0 : 
                    (idx1 === undefined || idx1 === null) ? 1 : currentPendingWicket;

    // Reset partnership
    inn.currentPartnership = { runs: 0, balls: 0 };

    closeModal('modal-new-batsman');
    if (inn.currentBowlerIdx === null) {
        setTimeout(() => openNewBowlerModal(), 200);
    } else { saveAndRender(); }
    
    showToast(`🏏 ${name} is now at the crease!`, 'success');
    
    // Pro feature: Auto-show profile overlay for new batsman after a short delay
    setTimeout(() => {
        showPlayerOverlay(true, name);
    }, 1000);
}

// ========== NEW BOWLER ==========
function openNewBowlerModal() {
    document.getElementById('new-bowl-name').value = '';
    document.getElementById('new-bowl-pid').value = '';
    const m = currentMatch;
    const inn = m ? m.innings[m.currentInnings] : null;
    const recentEl = document.getElementById('recent-bowlers-opts');
    if (recentEl && inn) {
        const unique = [...new Set(inn.bowlers.map(b => b.name))];
        recentEl.innerHTML = unique.map(n =>
            `<button class="bowler-quick-btn" onclick="document.getElementById('new-bowl-name').value='${n}'">${n}</button>`
        ).join('');
    }
    openModal('modal-new-bowler');
}

function lookupBowler() {
    const pid = document.getElementById('new-bowl-pid').value.trim().toUpperCase();
    const player = DB.getPlayerById(pid);
    if (player) {
        document.getElementById('new-bowl-name').value = player.name;
        showToast(`✅ Found: ${player.name}`, 'success');
    } else { showToast(`❌ Player "${pid}" not found`, 'error'); }
}

function confirmNewBowler() {
    const name = document.getElementById('new-bowl-name').value.trim();
    let pid = document.getElementById('new-bowl-pid').value.trim().toUpperCase();
    if (!name) { showToast('❌ Enter bowler name', 'error'); return; }

    if (!pid) {
        const pMatch = DB.getPlayers().find(p => p.name.toLowerCase() === name.toLowerCase());
        if (pMatch) pid = pMatch.playerId;
    }

    const m = currentMatch;
    const inn = m.innings[m.currentInnings];

    let bowlerIdx = inn.bowlers.findIndex(b => b.name === name);
    if (bowlerIdx === -1) {
        inn.bowlers.push({ name, playerId: pid || null, balls: 0, runs: 0, wickets: 0, maidens: 0 });
        bowlerIdx = inn.bowlers.length - 1;
    }
    inn.currentBowlerIdx = bowlerIdx;
    closeModal('modal-new-bowler');

    if (pendingBallEvent) {
        const ev = pendingBallEvent; pendingBallEvent = null;
        setTimeout(() => recordBall(ev), 100);
    } else if (pendingExtraType) {
        const et = pendingExtraType; pendingExtraType = null;
        if (et === 'custom_noball') { setTimeout(() => confirmNoball(), 100); }
        else { setTimeout(() => recordExtra(et), 100); }
    } else { saveAndRender(); }
    showToast(`⚾ ${name} is now bowling`, 'success');
}

// ========== END OF OVER ==========
// Returns true if over ended
function checkEndOfOver(inn) {
    const m = currentMatch;
    const bpo = m.ballsPerOver;
    if (inn.balls > 0 && inn.balls % bpo === 0) {
        // Maiden detection
        const bowler = inn.bowlers[inn.currentBowlerIdx];
        if (bowler) {
            const overRuns = inn.currentOver.reduce((s, b) => {
                // Only count runs that go to bowler (not byes/legbyes)
                if (b.type !== 'bye' && b.type !== 'legbye') return s + (b.runs || 0);
                return s;
            }, 0);
            if (overRuns === 0 && inn.currentOver.length > 0) bowler.maidens++;
        }

        // Save completed over
        inn.overHistory.push([...inn.currentOver]);
        inn.currentOver = [];
        inn.currentBowlerIdx = null;

        // Rotate strike at end of over
        inn.strikerIdx = inn.strikerIdx === 0 ? 1 : 0;

        saveAndRender();
        const overNum = inn.balls / bpo;
        showToast(`Over ${overNum} complete!`);

        // Check if innings ended to prevent showing bowler modal
        let isEnd = (inn.balls >= m.overs * bpo) || (inn.wickets >= (m.playersPerSide - 1));
        if (m.currentInnings === 1 && m.innings[0] && inn.runs >= m.innings[0].runs + 1) isEnd = true;

        if (!isEnd) {
            setTimeout(() => openNewBowlerModal(), 400);
        }
        return true;
    }
    return false;
}

// ========== END OF INNINGS ==========
function checkEndOfInnings(inn, callback) {
    if (_innings_ending) return;
    const m = currentMatch;
    const maxWickets = m.playersPerSide - 1;
    const maxBalls = m.overs * m.ballsPerOver;

    // Chase complete
    if (m.currentInnings === 1 && m.innings[0]) {
        const target = m.innings[0].runs + 1;
        if (inn.runs >= target) {
            _innings_ending = true;
            inn.isDone = true;
            finishInnings(inn, 'chase_won');
            return;
        }
    }

    if (inn.wickets >= maxWickets || inn.balls >= maxBalls) {
        _innings_ending = true;
        inn.isDone = true;
        finishInnings(inn, 'all_out_or_overs');
    } else if (callback) {
        callback();
    }
}

function finishInnings(inn, reason) {
    const m = currentMatch;
    // Mark all not-dismissed batsmen as not out
    inn.batsmen.forEach(b => { if (!b.dismissal) b.notOut = true; });
    DB.saveMatch(m);

    if (m.currentInnings === 0) {
        showInningsEndModal(inn, reason);
    } else {
        showMatchResult();
    }
}

function confirmEndInnings() {
    if (!confirm('Force-end this innings?')) return;
    const inn = currentMatch.innings[currentMatch.currentInnings];
    inn.isDone = true;
    _innings_ending = true;
    finishInnings(inn, 'declared');
}

function showInningsEndModal(inn, reason) {
    const m = currentMatch;
    document.getElementById('innings-end-title').textContent =
        reason === 'declared' ? '📢 Innings Declared!' : '1st Innings Complete!';
    document.getElementById('innings-end-summary').innerHTML = `
    <div style="font-size:22px;font-weight:900;color:#ffc107;margin:8px 0">${inn.battingTeam}: ${inn.runs}/${inn.wickets}</div>
    <div style="color:var(--c-muted)">${formatOvers(inn.balls, m.ballsPerOver)} overs · CRR: ${formatCRR(inn.runs, inn.balls)}</div>
    <div style="margin-top:10px;font-size:14px">Target for ${inn.bowlingTeam}: <strong style="color:#00e676">${inn.runs + 1}</strong></div>`;
    openModal('modal-innings-end');
}

function proceedAfterInnings() {
    const m = currentMatch;
    closeModal('modal-innings-end');
    m.currentInnings = 1;
    m.innings[1] = DB.createInnings(m.fieldingFirst, m.battingFirst);
    _innings_ending = false;
    saveAndRender();
    setTimeout(() => openOpenBatsmenModal(), 300);
}

// ========== MATCH RESULT ==========
function showMatchResult() {
    const m = currentMatch;
    const inn0 = m.innings[0];
    const inn1 = m.innings[1];
    m.status = 'completed';

    let winner, resultText;
    if (m.currentInnings === 1 && inn1 && inn1.runs >= inn0.runs + 1) {
        winner = inn1.battingTeam;
        const wicketsLeft = (m.playersPerSide - 1) - inn1.wickets;
        resultText = `${winner} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
    } else if (!inn1 || inn1.runs < inn0.runs + 1) {
        winner = inn0.battingTeam;
        const diff = inn0.runs - (inn1 ? inn1.runs : 0);
        resultText = `${winner} won by ${diff} run${diff !== 1 ? 's' : ''}`;
    } else {
        winner = null;
        resultText = 'Match Tied!';
    }

    m.result = resultText;
    DB.saveMatch(m);

    // Update tournament
    if (m.tournamentId) {
        const t = DB.getTournament(m.tournamentId);
        if (t) {
            if (t.format === 'knockout') {
                // Promote winner to next match if applicable
                if (m.knockout && m.knockout.nextMatchId && winner) {
                    const nextMatch = DB.getMatch(m.knockout.nextMatchId);
                    if (nextMatch) {
                        if (m.knockout.slot === 1) nextMatch.team1 = winner;
                        else if (m.knockout.slot === 2) nextMatch.team2 = winner;
                        DB.saveMatch(nextMatch);
                    }
                }
            } else {
                computeStandings(t);
            }
            DB.saveTournament(t);
            if (t.isOfficial) {
                syncOfficialStats(m, t);
            }
        }
    }

    document.getElementById('result-winner').textContent = winner ? `${winner}` : 'Tie!';
    document.getElementById('result-summary').textContent = resultText;

    // Player of Match
    const allBats = [...(inn0.batsmen || []), ...(inn1 ? inn1.batsmen || [] : [])]
        .sort((a, b) => (b.runs || 0) - (a.runs || 0));
    const mom = allBats[0];
    if (mom) {
        document.getElementById('result-mom').innerHTML = `
      <div style="font-size:11px;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.08em;mb:6px">Player of the Match</div>
      <div style="font-size:18px;font-weight:800">${mom.name}</div>
      <div style="font-size:13px;color:var(--c-muted)">${mom.runs || 0} runs off ${mom.balls || 0} balls · SR ${formatSR(mom.runs || 0, mom.balls || 0)}</div>`;
    }
    const mrHomeBtn = document.querySelector('#modal-result .btn-primary');
    const mrBackBtn = document.querySelector('#modal-result .btn-ghost');
    if (mrHomeBtn && mrBackBtn) {
        if (m.tournamentId) {
            mrHomeBtn.innerHTML = 'Tournament Summary';
            mrHomeBtn.onclick = () => { closeModal('modal-result'); openTournamentSummary(); };
            mrBackBtn.innerHTML = '📅 Match Schedule';
            mrBackBtn.onclick = () => { closeModal('modal-result'); openTournamentHub(m.tournamentId); };
        } else {
            mrHomeBtn.innerHTML = '🏠 Home';
            mrHomeBtn.onclick = () => { location.href = '../index.html'; };
            mrBackBtn.innerHTML = 'Back to Setup';
            mrBackBtn.onclick = () => { closeModal('modal-result'); showScreen('setup'); };
        }
    }

    openModal('modal-result');
}

function openTournamentSummary() {
    const m = currentMatch;
    if (!m || !m.tournamentId) return;
    const t = DB.getTournament(m.tournamentId);
    if (!t) return;
    
    computeStandings(t);
    
    // Render points table
    const ptsBody = document.getElementById('ts-points-body');
    if (ptsBody && t.standings) {
        const sortedTeams = Object.entries(t.standings).map(([team, s]) => ({ team, ...s }))
            .sort((a, b) => b.points - a.points || b.nrr - a.nrr);
            
        ptsBody.innerHTML = sortedTeams.map(s => `<tr>
            <td><strong>${s.team}</strong></td>
            <td>${s.played}</td><td>${s.won}</td><td>${s.lost}</td><td>${s.tied}</td>
            <td><strong>${s.points}</strong></td><td>${(s.nrr || 0).toFixed(3)}</td>
        </tr>`).join('');
    }
    
    // Render top players
    const tMatches = DB.getMatches().filter(match => match.tournamentId === t.id && match.status === 'completed');
    const batStats = {};
    const bowlStats = {};
    
    tMatches.forEach(match => {
        [0, 1].forEach(innIdx => {
            const inn = match.innings[innIdx];
            if(!inn) return;
            
            inn.batsmen.forEach(b => {
                if(!b.name || Number.isNaN(b.runs)) return;
                if(!batStats[b.name]) batStats[b.name] = { matches: 0, runs: 0, balls: 0, hs: 0 };
                batStats[b.name].matches++;
                batStats[b.name].runs += (b.runs || 0);
                batStats[b.name].balls += (b.balls || 0);
                batStats[b.name].hs = Math.max(batStats[b.name].hs, b.runs || 0);
            });
            
            inn.bowlers.forEach(b => {
                if(!b.name) return;
                if(!bowlStats[b.name]) bowlStats[b.name] = { matches: 0, wickets: 0, runs: 0, balls: 0 };
                bowlStats[b.name].matches++;
                bowlStats[b.name].wickets += (b.wickets || 0);
                bowlStats[b.name].runs += (b.runs || 0);
                bowlStats[b.name].balls += (b.balls || 0);
            });
        });
    });
    
    const topBat = Object.entries(batStats).map(([name, s]) => ({ name, ...s }))
        .sort((a,b) => b.runs - a.runs).slice(0, 10);
        
    const topBowl = Object.entries(bowlStats).map(([name, s]) => ({ name, ...s }))
        .sort((a,b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 10);
        
    const batBody = document.getElementById('ts-batting-body');
    if (batBody) {
        batBody.innerHTML = topBat.map(s => `<tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.matches}</td><td><strong>${s.runs}</strong></td><td>${s.hs}</td>
            <td>${s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0'}</td>
        </tr>`).join('');
    }
    
    const bowlBody = document.getElementById('ts-bowling-body');
    if (bowlBody) {
        bowlBody.innerHTML = topBowl.map(s => `<tr>
            <td><strong>${s.name}</strong></td>
            <td>${s.matches}</td><td><strong>${s.wickets}</strong></td>
            <td>${s.balls > 0 ? (s.runs / (s.balls / 6)).toFixed(2) : '0.00'}</td>
        </tr>`).join('');
    }
    
    showScreen('tournament-summary');
}

function computeStandings(t) {
    t.teams.forEach(team => {
        if (!t.standings[team]) t.standings[team] = {};
        Object.assign(t.standings[team], { played: 0, won: 0, lost: 0, tied: 0, points: 0, runsScored: 0, ballsFaced: 0, runsConceded: 0, ballsBowled: 0, nrr: 0 });
    });
    DB.getMatches().filter(m => m.tournamentId === t.id && m.status === 'completed').forEach(m => {
        const i0 = m.innings[0]; const i1 = m.innings[1];
        if (!i0 || !i1) return;
        const s1 = t.standings[m.battingFirst] || {}; const s2 = t.standings[m.fieldingFirst] || {};
        s1.played++; s2.played++;

        let b0 = i0.balls;
        if (i0.wickets >= m.playersPerSide - 1) b0 = m.overs * m.ballsPerOver;
        let b1 = i1.balls;
        if (i1.wickets >= m.playersPerSide - 1) b1 = m.overs * m.ballsPerOver;

        s1.runsScored += i0.runs; s1.ballsFaced += b0; s1.runsConceded += i1.runs; s1.ballsBowled += b1;
        s2.runsScored += i1.runs; s2.ballsFaced += b1; s2.runsConceded += i0.runs; s2.ballsBowled += b0;

        if (i1.runs > i0.runs) { s2.won++; s2.points += 2; s1.lost++; }
        else if (i1.runs < i0.runs) { s1.won++; s1.points += 2; s2.lost++; }
        else { s1.tied++; s2.tied++; s1.points++; s2.points++; }
        t.standings[m.battingFirst] = s1; t.standings[m.fieldingFirst] = s2;
    });
    t.teams.forEach(team => {
        const s = t.standings[team];
        const bpo = t.ballsPerOver || 6;
        const rr = s.ballsFaced ? (s.runsScored / (s.ballsFaced / bpo)) : 0;
        const ra = s.ballsBowled ? (s.runsConceded / (s.ballsBowled / bpo)) : 0;
        s.nrr = parseFloat((rr - ra).toFixed(3)) || 0;
    });
}

// ========== PUBLISH ==========
function togglePublish(checked) {
    if (!currentMatch) return;
    currentMatch.publishLive = checked;
    DB.saveMatch(currentMatch);
    if (checked && currentMatch.tournamentId && !isTournamentAuthorized(currentMatch.tournamentId)) {
        showToast('Unlock this tournament first to publish securely.', 'error');
        currentMatch.publishLive = false;
        DB.saveMatch(currentMatch);
        return;
    }
    showToast(checked ? 'Score published live!' : 'Live score hidden', 'success');
    updateHeaderActions();
}

// ========== UNDO / REDO ==========
function pushHistory() {
    const m = currentMatch;
    const snapshot = JSON.stringify({ innings: m.innings, currentInnings: m.currentInnings });
    m.history = m.history || [];
    m.history.push(snapshot);
    m.redoStack = [];
    if (m.history.length > 150) m.history.shift();
}

function undoAction() {
    const m = currentMatch;
    if (!m || !m.history || !m.history.length) { showToast('Nothing to undo', 'error'); return; }
    const current = JSON.stringify({ innings: m.innings, currentInnings: m.currentInnings });
    m.redoStack = m.redoStack || [];
    m.redoStack.push(current);
    const prev = JSON.parse(m.history.pop());
    m.innings = prev.innings;
    m.currentInnings = prev.currentInnings;
    _innings_ending = false;
    saveAndRender();
    showToast('↩ Undone!', 'success');
}

function redoAction() {
    const m = currentMatch;
    if (!m || !m.redoStack || !m.redoStack.length) { showToast('Nothing to redo', 'error'); return; }
    const current = JSON.stringify({ innings: m.innings, currentInnings: m.currentInnings });
    m.history = m.history || [];
    m.history.push(current);
    const next = JSON.parse(m.redoStack.pop());
    m.innings = next.innings;
    m.currentInnings = next.currentInnings;
    _innings_ending = false;
    saveAndRender();
    showToast('↪ Redone!', 'success');
}

// ========== SCORECARD MODAL ==========
function openScorecard() {
    const m = currentMatch;
    if (!m) return;
    let html = '';
    m.innings.forEach((inn, i) => {
        if (!inn) return;
        const ex = inn.extras || {};
        const totalEx = (ex.wides || 0) + (ex.noBalls || 0) + (ex.byes || 0) + (ex.legByes || 0);
        html += `<div style="margin-bottom:22px">
      <div style="font-weight:800;text-transform:uppercase;letter-spacing:0.06em;color:var(--c-muted);margin-bottom:10px;font-size:12px">
        ${i === 0 ? '1st' : '2nd'} Innings – ${inn.battingTeam}
        <span style="color:#fff;margin-left:8px;font-size:18px">${inn.runs}/${inn.wickets} (${formatOvers(inn.balls, m.ballsPerOver)} ov)</span>
      </div>
      <table class="data-table" style="margin-bottom:8px">
        <thead><tr><th>Batsman</th><th>How Out</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
        <tbody>
          ${(inn.batsmen || []).map(b => `<tr>
            <td><strong>${b.name}</strong></td>
            <td style="font-size:12px;color:var(--c-muted)">${b.dismissal || (b.notOut ? 'not out' : 'did not bat')}</td>
            <td><strong>${b.runs || 0}</strong></td><td>${b.balls || 0}</td>
            <td>${b.fours || 0}</td><td>${b.sixes || 0}</td>
            <td>${formatSR(b.runs || 0, b.balls || 0)}</td>
          </tr>`).join('')}
          <tr style="border-top:1px solid var(--c-border)">
            <td colspan="2" style="color:var(--c-muted)">Extras (${totalEx})</td>
            <td colspan="5" style="font-size:12px;color:var(--c-muted)">
              Wd:${ex.wides || 0} Nb:${ex.noBalls || 0} By:${ex.byes || 0} Lb:${ex.legByes || 0}
            </td>
          </tr>
        </tbody>
      </table>
      <table class="data-table">
        <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead>
        <tbody>
          ${(inn.bowlers || []).map(b => `<tr>
            <td><strong>${b.name}</strong></td>
            <td>${formatOvers(b.balls || 0, m.ballsPerOver)}</td><td>${b.maidens || 0}</td>
            <td>${b.runs || 0}</td><td><strong>${b.wickets || 0}</strong></td>
            <td>${formatEcon(b.runs || 0, b.balls || 0, m.ballsPerOver)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${inn.fallOfWickets && inn.fallOfWickets.length ? `
      <div style="margin-top:10px;font-size:12px">
        <span style="color:var(--c-muted);font-weight:700">FOW: </span>
        ${inn.fallOfWickets.map((fw, j) => `${j + 1}-${fw.runs} (${fw.batsmanName}, ${formatOvers(fw.balls, m.ballsPerOver)} ov)`).join(', ')}
      </div>`: ''}
    </div>`;
    });
    document.getElementById('scorecard-content').innerHTML = html;
    openModal('modal-scorecard');
}

// ========== PAUSE / SAVE ==========
function pauseAndExit(noConfirm) {
    if (!currentMatch) { location.href = '../index.html'; return; }
    currentMatch.status = 'paused';
    DB.saveMatch(currentMatch);
    showToast('⏸ Match saved! Resume anytime.', 'success');
    setTimeout(() => {
        if (currentMatch.tournamentId) {
            openTournamentHub(currentMatch.tournamentId);
        } else {
            location.href = '../index.html';
        }
    }, 1200);
}

// ========== HELPERS ==========
// BroadcastChannel for instant same-browser cross-tab TV display updates
const _scorerBC = (typeof BroadcastChannel !== 'undefined') ? new BroadcastChannel('cricpro_live') : null;

function saveAndRender() {
    if (currentMatch) {
        DB.saveMatch(currentMatch);
        renderScoring();
        // Signal TV overlay: BroadcastChannel (instant, same browser) + localStorage (cross-tab fallback)
        if (_scorerBC) _scorerBC.postMessage({ type: 'score_update', matchId: currentMatch.id, ts: Date.now() });
        localStorage.setItem('cricpro_force_update', Date.now().toString());
        // Update hotkey label team names
        const t1el = document.getElementById('hk-team1-name');
        const t2el = document.getElementById('hk-team2-name');
        if (t1el) t1el.textContent = currentMatch.team1 || 'Team A';
        if (t2el) t2el.textContent = currentMatch.team2 || 'Team B';
    }
}
function openModal(id) { const e = document.getElementById(id); if (e) e.style.display = 'flex'; }
function closeModal(id) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function printScorecard() {
    closeModal('modal-result');
    openScorecard();
    setTimeout(() => {
        window.print();
    }, 500);
}

// ========== NEW OPEN BATSMEN ==========
function openOpenBatsmenModal() {
    document.getElementById('open-bat1-pid').value = '';
    document.getElementById('open-bat1-name').value = '';
    document.getElementById('open-bat2-pid').value = '';
    document.getElementById('open-bat2-name').value = '';
    openModal('modal-open-batsmen');
}

function lookupPlayerOpen(num) {
    const pid = document.getElementById(`open-bat${num}-pid`).value.trim().toUpperCase();
    const player = DB.getPlayerById(pid);
    if (player) {
        document.getElementById(`open-bat${num}-name`).value = player.name;
        showToast(`✅ Found: ${player.name}`, 'success');
    } else { showToast(`❌ Player ID "${pid}" not found`, 'error'); }
}

function confirmOpenBatsmen() {
    const n1 = document.getElementById('open-bat1-name').value.trim();
    let pid1 = document.getElementById('open-bat1-pid').value.trim().toUpperCase() || null;
    const n2 = document.getElementById('open-bat2-name').value.trim();
    let pid2 = document.getElementById('open-bat2-pid').value.trim().toUpperCase() || null;

    if (!n1 || !n2) { showToast('❌ Enter both opening batsmen names', 'error'); return; }

    if (!pid1) {
        const pMatch1 = DB.getPlayers().find(p => p.name.toLowerCase() === n1.toLowerCase());
        if (pMatch1) pid1 = pMatch1.playerId;
    }
    if (!pid2) {
        const pMatch2 = DB.getPlayers().find(p => p.name.toLowerCase() === n2.toLowerCase());
        if (pMatch2) pid2 = pMatch2.playerId;
    }

    const m = currentMatch;
    const inn = m.innings[m.currentInnings];

    inn.batsmen.push({ name: n1, playerId: pid1, runs: 0, balls: 0, fours: 0, sixes: 0, notOut: true, dismissal: null });
    inn.batsmen.push({ name: n2, playerId: pid2, runs: 0, balls: 0, fours: 0, sixes: 0, notOut: true, dismissal: null });

    inn.currentBatsmenIdx[0] = 0;
    inn.currentBatsmenIdx[1] = 1;
    // Striker is bat1 (at index 0)
    inn.strikerIdx = 0;

    closeModal('modal-open-batsmen');
    setTimeout(() => openNewBowlerModal(), 200);
}

// ========== STATS SYNC ==========
function syncOfficialStats(m, t) {
    if (!m.innings[0]) return;

    [0, 1].forEach(innIdx => {
        const inn = m.innings[innIdx];
        if (!inn) return;

        inn.batsmen.forEach(b => {
            if (!b.playerId) return;
            const existing = DB.getPlayerById(b.playerId);
            if (!existing) return;

            const s = existing.stats || {};
            const runs = b.runs || 0;
            const stats = {
                innings:  (s.innings  || 0) + 1,
                runs:     (s.runs     || 0) + runs,
                balls:    (s.balls    || 0) + (b.balls || 0),
                fours:    (s.fours    || 0) + (b.fours || 0),
                sixes:    (s.sixes    || 0) + (b.sixes || 0),
                notOuts:  (s.notOuts  || 0) + (b.notOut ? 1 : 0),
                highScore: Math.max((s.highScore || 0), runs),
            };
            if (runs >= 100) stats.hundreds = (existing.stats.hundreds || 0) + 1;
            else if (runs >= 50) stats.fifties = (existing.stats.fifties || 0) + 1;
            else if (runs >= 30) stats.thirties = (existing.stats.thirties || 0) + 1;

            existing.stats = { ...existing.stats, ...stats };
            DB.updatePlayerStats(b.playerId, existing.stats);
        });

        inn.bowlers.forEach(b => {
            if (!b.playerId) return;
            const p = DB.getPlayerById(b.playerId);
            if (!p) return;

            const s = p.stats || {};
            const wkt = b.wickets || 0;
            const bestParts = (s.bestBowling || '0/0').split('/');
            const bestW = parseInt(bestParts[0]) || 0;
            const bestR = parseInt(bestParts[1]) || 999;
            let newBest = s.bestBowling || '0/0';
            if (wkt > bestW || (wkt === bestW && (b.runs || 0) < bestR)) {
                newBest = `${wkt}/${b.runs || 0}`;
            }
            const stats = {
                wickets:      (s.wickets     || 0) + wkt,
                bowlingRuns:  (s.bowlingRuns || 0) + (b.runs || 0),
                overs:        (s.overs       || 0) + ((b.balls || 0) / 6),
                maidens:      (s.maidens     || 0) + (b.maidens || 0),
                bestBowling:  newBest,
            };
            p.stats = { ...p.stats, ...stats };
            DB.updatePlayerStats(b.playerId, p.stats);
        });
    });

    // Increment match count for all players in this match (once per match)
    const allPids = new Set();
    [0, 1].forEach(innIdx => {
        const inn = m.innings[innIdx];
        if (!inn) return;
        [...(inn.batsmen || []), ...(inn.bowlers || [])].forEach(b => {
            if (b.playerId) allPids.add(b.playerId);
        });
    });
    allPids.forEach(pid => {
        const p = DB.getPlayerById(pid);
        if (p) {
            p.stats.matches = (p.stats.matches || 0) + 1;
            DB.updatePlayerStats(pid, p.stats);
        }
    });

    // Update Team Stats (Played/Won/NRR Components)
    const teamsList = [m.battingFirst, m.fieldingFirst];
    teamsList.forEach((tName, i) => {
        const team = DB.getTeams().find(t => t.name === tName);
        if (team) {
            const s = team.stats || { played: 0, won: 0, lost: 0, tied: 0, runsScored: 0, ballsFaced: 0, runsConceded: 0, ballsBowled: 0, prizeMoney: 0 };
            s.played++;
            
            const i0 = m.innings[0], i1 = m.innings[1];
            if (i0 && i1) {
                const isBatFirst = (m.battingFirst === tName);
                const myInn = isBatFirst ? i0 : i1;
                const oppInn = isBatFirst ? i1 : i0;
                
                // Wins/Loss/Tie
                if (myInn.runs > oppInn.runs) s.won++;
                else if (myInn.runs < oppInn.runs) s.lost++;
                else s.tied++;

                // NRR Components
                // In cricket, if a team is all out, they are considered to have faced their full quota of overs for NRR purposes.
                let myBalls = myInn.balls;
                if (myInn.wickets >= m.playersPerSide - 1) myBalls = m.overs * m.ballsPerOver;
                
                let oppBalls = oppInn.balls;
                if (oppInn.wickets >= m.playersPerSide - 1) oppBalls = m.overs * m.ballsPerOver;

                s.runsScored += myInn.runs;
                s.ballsFaced += myBalls;
                s.runsConceded += oppInn.runs;
                s.ballsBowled += oppBalls;
            }
            DB.updateTeamStats(tName, s);
        }
    });

    // Check if this is the last match of the tournament — if so, bulk-push all player stats
    const allMatches = DB.getMatches().filter(mx => mx.tournamentId === t.id);
    const allDone = allMatches.every(mx => mx.status === 'completed' || mx.id === m.id);
    if (allDone && t.isOfficial) {
        // mark tournament complete
        t.status = 'completed';
        
        // Distribution of Prizes
        if (t.standings) {
            const sorted = Object.values(t.standings).sort((a,b) => b.points - a.points || b.nrr - a.nrr);
            const prizeMap = { first: 0, second: 1, third: 2 };
            ['first', 'second', 'third'].forEach(rank => {
                if (sorted[prizeMap[rank]] && t.prizes && t.prizes[rank]) {
                    const val = parseFloat((t.prizes[rank] + '').replace(/[^\d.-]/g, '')) || 0;
                    const teamName = sorted[prizeMap[rank]].name;
                    const teamObj = DB.getTeams().find(tm => tm.name === teamName);
                    if (teamObj) {
                        const s = teamObj.stats || { played: 0, won: 0, lost: 0, tied: 0, prizeMoney: 0 };
                        s.prizeMoney = (s.prizeMoney || 0) + val;
                        DB.updateTeamStats(teamName, s);
                    }
                }
            });
        }

        DB.saveTournament(t);
        // Push all player stats + team stats to MongoDB
        if (typeof pushAllStatsAfterTournament === 'function') {
            pushAllStatsAfterTournament(t.id);
        }
    }
}

// ========== ROSTER & OVERLAYS ==========
function renderTournamentTeams() {
    const t = currentTournament;
    const container = document.getElementById('tm-teams-list');
    if (!t || !t.teams || !t.teams.length) {
        container.innerHTML = '<div style="text-align:center;color:white;padding:20px;opacity:0.6">No teams found</div>';
        return;
    }

    container.innerHTML = t.teams.map(teamName => {
        const roster = t.rosters[teamName] || [];
        return `
            <div class="card" style="padding:12px;display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:12px">
                    <div style="width:40px;height:40px;background:var(--c-primary);border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px">${teamName[0].toUpperCase()}</div>
                    <div>
                        <div style="font-weight:700;font-size:16px">${teamName}</div>
                        <div style="font-size:12px;opacity:0.6">${roster.filter(n => n && n.trim()).length} / 11 Players Registered</div>
                    </div>
                </div>
                <button class="btn btn-sm btn-ghost" onclick="openRosterEditor('${escapeHTML(teamName)}')">📋 Edit Roster</button>
            </div>
        `;
    }).join('');
}

let editingTeamName = null;
function openRosterEditor(teamName) {
    const t = currentTournament;
    if (!t) return;
    
    editingTeamName = teamName || (t.teams && t.teams.length ? t.teams[0] : null);
    if (!editingTeamName) return;

    if (!t.rosters) t.rosters = {};
    const roster = t.rosters[editingTeamName] || [];
    
    const listEl = document.getElementById('tm-teams-list');
    if (!listEl) return;

    // We want 11 blanks
    let inputsHtml = '';
    for (let i = 0; i < 11; i++) {
        const val = roster[i] || '';
        inputsHtml += `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
                <div style="width:24px;font-size:12px;opacity:0.5;font-weight:700">${i + 1}</div>
                <input type="text" class="form-input roster-player-input" 
                       value="${escapeHTML(val)}" placeholder="Player Name" 
                       style="background:#1a1a2e; border:1px solid rgba(255,255,255,0.1); height:36px; font-size:13px" />
            </div>
        `;
    }

    listEl.innerHTML = `
        <div style="margin-bottom:15px; display:flex; justify-content:space-between; align-items:center">
            <div style="font-weight:900; color:var(--c-amber); font-size:14px">📝 ROSTER: ${editingTeamName}</div>
            <button class="btn btn-sm btn-ghost" onclick="renderTournamentTeams()" style="font-size:11px">← Back to List</button>
        </div>

        <div style="background:rgba(255,255,255,0.02); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.05)">
            ${inputsHtml}
        </div>

        <div style="margin-top:20px">
            <button class="btn btn-primary btn-full" onclick="saveRoster('${escapeHTML(editingTeamName)}')">💾 Save Roster</button>
        </div>
    `;
}

function saveRoster(teamName) {
    const t = currentTournament;
    if (!t) return;
    
    const inputs = document.querySelectorAll('.roster-player-input');
    const newRoster = [];
    inputs.forEach(inp => {
        newRoster.push(inp.value.trim());
    });
    
    if (!t.rosters) t.rosters = {};
    t.rosters[teamName] = newRoster;
    
    DB.saveTournament(t);
    showToast('Roster saved for ' + teamName, 'success');
    renderTournamentTeams();
}


function showTeamOverlay(teamIdx) {
    const m = currentMatch;
    if (!m) return;
    const teamName = teamIdx === 0 ? m.team1 : m.team2;
    const t = m.tournamentId ? DB.getTournament(m.tournamentId) : null;
    const rosterIds = (t && t.rosters) ? (t.rosters[teamName] || []) : [];
    
    let html = `
        <div class="overlay-container show" id="overlay-team">
            <div class="overlay-card team-card">
                <div class="overlay-header">
                    <div class="overlay-title">${teamName}</div>
                    <div class="overlay-subtitle">TEAM ROSTER</div>
                </div>
                <div class="overlay-body roster-grid">
    `;
    
    if (rosterIds.length > 0) {
        rosterIds.forEach((pid, index) => {
            const p = DB.getPlayerById(pid);
            if (p) {
                const photoSrc = playerPhotoSrc(p);
                html += `
                    <div class="roster-item" style="animation: fadeInUp 0.4s ease forwards; animation-delay: ${index * 0.05}s">
                        <div class="roster-photo">
                            <img src="${photoSrc}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_PLAYER_PHOTO}'" />
                        </div>
                        <div class="roster-info">
                            <div class="roster-name">${p.name}</div>
                            <div class="roster-role">${capitalize(p.role || 'Player')}</div>
                        </div>
                    </div>
                `;
            }
        });
    } else {
        html += '<div style="grid-column: span 2; padding: 20px; text-align: center; color: rgba(255,255,255,0.5);">No registered players in roster</div>';
    }
    
    html += '</div></div></div>';
    renderOverlay(html);
}

function showPlayerOverlay(single, specificName) {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn) return;
    
    let batters = [];
    if (specificName) {
        batters = [specificName];
    } else if (single) {
        batters = [getStrikerBatterName(inn)].filter(Boolean);
    } else {
        batters = getOnCreaseBatterNames(inn);
    }
    
    let html = `
        <div class="overlay-container show" id="overlay-players">
            <div class="overlay-card players-card" style="${batters.length === 1 ? 'max-width:500px' : ''}">
                <div class="overlay-header">
                    <div class="overlay-title">${batters.length === 1 ? 'Player Profile' : 'Current Batters'}</div>
                </div>
                <div class="overlay-body ${batters.length === 1 ? '' : 'player-stats-flex'}">
    `;
    
    batters.forEach(bName => {
        const p = resolvePlayerProfileForBatter(inn, bName);
        const stats = inn.batsmen.find(x => x.name === bName) || { runs:0, balls:0, fours:0, sixes:0 };
        const photoSrc = playerPhotoSrc(p);
        
        html += `
            <div class="player-stat-card" style="${batters.length === 1 ? 'margin-bottom:0' : ''}; animation: slideInLeft 0.5s ease forwards">
                <div class="player-main-info">
                    <div class="player-large-photo">
                        <img src="${photoSrc}" alt="" onerror="this.onerror=null;this.src='${DEFAULT_PLAYER_PHOTO}'" />
                    </div>
                    <div>
                        <div class="player-lg-name">${bName}</div>
                        <div class="player-lg-role" style="font-size:16px; color:var(--c-primary)">${p ? capitalize(p.role || 'Player') : 'Batsman'}</div>
                    </div>
                </div>
                <div class="player-mini-stats">
                    <div class="m-stat"><div class="m-val">${stats.runs}</div><div class="m-lbl">Runs</div></div>
                    <div class="m-stat"><div class="m-val">${stats.balls}</div><div class="m-lbl">Balls</div></div>
                    <div class="m-stat"><div class="m-val">${stats.fours}</div><div class="m-lbl">4s</div></div>
                    <div class="m-stat"><div class="m-val">${stats.sixes}</div><div class="m-lbl">6s</div></div>
                </div>
            </div>
        `;
    });
    
    html += '</div></div></div>';
    renderOverlay(html);
}

function renderOverlay(html) {
    hideOverlay();
    const div = document.createElement('div');
    div.id = 'active-overlay-wrapper';
    div.innerHTML = html;
    document.body.appendChild(div);
    
    // Auto hide after 8 seconds
    activeOverlayId = setTimeout(() => hideOverlay(), 8000);
}

function hideOverlay() {
    if (activeOverlayId) clearTimeout(activeOverlayId);
    const el = document.getElementById('active-overlay-wrapper');
    if (el) el.remove();
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
}

function forceUpdateTV() {
    localStorage.setItem('cricpro_force_update', Date.now().toString());
    saveAndRender(); // Ensures current match is saved to DB and triggers storage update
    showToast('📺 TV Scoreboard forcefully updated!', 'success');
}

// ========== HOTKEYS & BROADCASTS ==========
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

    if (e.key === 'Escape') {
        hideOverlay();
        return;
    }

    if (!e.shiftKey) return;

    if (e.key === '1') {
        e.preventDefault();
        showTeamOverlay(0);
        broadcastTeamRoster(0);
    } else if (e.key === '2') {
        e.preventDefault();
        showTeamOverlay(1);
        broadcastTeamRoster(1);
    } else if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        showPlayerOverlay(false);
        broadcastCurrentBatters();
    } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        showPlayerOverlay(true);
        broadcastStrikerProfile();
    }
});

function sendBroadcast(cmd, data) {
    if (!currentMatch) return;
    const payload = {
        cmd,
        data,
        matchId: currentMatch.id,
        tournamentId: currentMatch.tournamentId,
        timestamp: Date.now()
    };
    localStorage.setItem('cricpro_broadcast_cmd', JSON.stringify(payload));
}

function broadcastTeamRoster(teamIdx) {
    const m = currentMatch;
    if (!m) return;
    const teamName = teamIdx === 0 ? m.team1 : m.team2;
    const t = m.tournamentId ? DB.getTournament(m.tournamentId) : null;
    const rosterIds = (t && t.rosters) ? (t.rosters[teamName] || []) : [];
    
    const players = rosterIds.map(pid => DB.getPlayerById(pid)).filter(Boolean);
    sendBroadcast('SHOW_TEAM_ROSTER', { teamName, players });
}

function broadcastCurrentBatters() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn) return;
    const batters = getOnCreaseBatterNames(inn);
    
    const profiles = batters.map(bName => {
        const p = resolvePlayerProfileForBatter(inn, bName);
        const stats = inn.batsmen.find(x => x.name === bName) || { runs:0, balls:0, fours:0, sixes:0 };
        return { name: bName, profile: p, stats };
    });
    sendBroadcast('SHOW_BATTER_PROFILES', { profiles });
}

function broadcastStrikerProfile() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn) return;
    const strikerName = getStrikerBatterName(inn);
    if (!strikerName) return;
    
    const p = resolvePlayerProfileForBatter(inn, strikerName);
    const stats = inn.batsmen.find(x => x.name === strikerName) || { runs:0, balls:0, fours:0, sixes:0 };
    
    sendBroadcast('SHOW_BATTER_PROFILES', { profiles: [{ name: strikerName, profile: p, stats }] });
}
