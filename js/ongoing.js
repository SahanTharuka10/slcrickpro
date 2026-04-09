// Ongoing Matches JS
let currentTab = 'live';
let selectedTournId = null;
let selectedTournSubTab = 'standings';
let tournamentPageView = 'matches';
let refreshInterval;

window.renderOngoing = function() {
    console.log("🔄 Ongoing UI refreshing from Global Sync...");
    if (currentTab === 'live') renderLive();
    if (currentTab === 'tournament') renderTournamentSelector();
    if (currentTab === 'recent') renderRecent();
};

// Global sync connection
window.renderAll = window.renderOngoing;

// Export globally for sync updates
window.renderLive = renderLive;

document.addEventListener('DOMContentLoaded', async () => {
    // Stage 1: Render Local Cache Immediately (Fast Load)
    renderLive();
    
    // Stage 2: Synchronize with Cloud (Background)
    if (typeof syncCloudData === 'function') {
        // Subtle background sync
        await syncCloudData({ silent: true }); 
    }
    
    // Stage 3: Render Final Results after sync
    renderLive();
});

function startAutoRefresh() {
  // Manual polling removed. syncCloudData now handles live refreshes.
}

function refreshAll() {
  renderLive();
  renderTournamentSelector();
  showToast('🔄 Refreshed!');
}

function switchTab(tab) {
  currentTab = tab;
  ['live', 'tournament', 'recent'].forEach(t => {
    const el = document.getElementById('panel-' + t);
    const btn = document.getElementById('tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'live') renderLive();
  if (tab === 'tournament') renderTournamentSelector();
  if (tab === 'recent') renderRecent();
}

// ========== LIVE MATCHES ==========
function renderLive() {
  const grid = document.getElementById('live-matches-grid');
  if (!grid) return;

  const matches = DB.getMatches().filter(m => {
    if (!m.publishLive) return false;
    // Hide scheduled/setup matches ONLY if they are part of a tournament (they belong in Tournament Hub)
    if (m.type === 'tournament' && (m.status === 'scheduled' || m.status === 'setup')) return false;
    // Show single matches even if they are in setup/scheduled state
    return (m.status === 'live' || m.status === 'paused' || m.status === 'setup' || m.status === 'scheduled');
  });

  if (!matches.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🏏</div>
      <div class="empty-state-title">No Live Matches Currently</div>
      <div class="empty-state-sub">Currently playing or paused matches will appear here</div>
    </div>`;
    return;
  }

  grid.innerHTML = matches.map(m => buildMatchCard(m, true)).join('');
}

function buildMatchCard(m, isLive) {
  const inn0 = m.innings ? m.innings[0] : null;
  const inn1 = m.innings ? m.innings[1] : null;
  const curInn = m.innings ? m.innings[m.currentInnings] : null;
  const statusColor = m.status === 'live' ? '#00e676' : (m.status === 'scheduled' ? '#00bcd4' : '#ffc107');
  const statusLabel = m.status === 'live' ? '🔴 LIVE' : (m.status === 'scheduled' ? '🗓 Scheduled' : (m.status === 'paused' ? '⏸ Paused' : '✅ COMPLETE'));
  const hasPw = (m.scoringPassword || m.password || m.isLocked);

  const score0 = m.status === 'scheduled' ? '-' : (inn0 ? `${inn0.runs}/${inn0.wickets}` : '-');
  const ov0 = m.status === 'scheduled' ? '' : (inn0 ? `(${formatOvers(inn0.balls, m.ballsPerOver)} ov)` : '');
  const score1 = m.status === 'scheduled' ? '-' : (inn1 ? `${inn1.runs}/${inn1.wickets}` : (m.status !== 'completed' && m.currentInnings === 1 ? 'Yet to bat' : '-'));
  const ov1 = m.status === 'scheduled' ? '' : (inn1 ? `(${formatOvers(inn1.balls, m.ballsPerOver)} ov)` : '');

  const crr = curInn ? formatCRR(curInn.runs, curInn.balls) : '0.00';
  let targetInfo = '';
  if (m.currentInnings === 1 && inn0 && inn1) {
    const target = inn0.runs + 1;
    const need = target - inn1.runs;
    const ballsLeft = (m.overs * m.ballsPerOver) - inn1.balls;
    if (need > 0) targetInfo = `Need ${need} off ${ballsLeft} balls`;
    else if (m.status === 'completed') targetInfo = `<span style="color:#00e676">Won!</span>`;
  }

  const typeLabel = m.type === 'tournament' ? `Tournament` : 'Single Match';
  const subText = m.knockout ? `KO Match ${m.knockout.matchNum}` : (m.venue || 'Home');

  return `
    <div class="match-card ${isLive ? 'live-card' : ''}" onclick="openMatchDetail('${m.id}')">
        <div class="match-card-header" style="justify-content: space-between">
            <div style="display:flex; gap:6px; align-items:center">
                <span class="match-type-badge badge badge-${m.type === 'tournament' ? 'amber' : 'blue'}">${typeLabel}</span>
                ${hasPw ? `<span style="font-size:9px; background:rgba(0,0,0,0.3); color:#ffc107; padding:2px 6px; border-radius:4px; font-weight:800; letter-spacing:0.5px">🔒 LOCKED</span>` : ''}
            </div>
            <span style="font-size:12px;font-weight:700;color:${statusColor}">${statusLabel}</span>
        </div>
        <div class="match-teams">
            <div class="match-vs-row">
                <span class="match-team-name">${m.team1}</span>
                <span class="match-vs-sep">vs</span>
                <span class="match-team-name">${m.team2}</span>
            </div>
            <div class="match-score-row" style="margin-top:14px">
                <div class="match-team-score" style="flex:1">
                    <div class="match-score-val" style="${m.currentInnings === 0 ? 'color:#00e676' : 'opacity:0.6'}">${score0}</div>
                    <div class="match-score-overs" style="opacity:0.6">${ov0}</div>
                </div>
                <div class="match-team-score" style="flex:1">
                    <div class="match-score-val" style="${m.currentInnings === 1 ? 'color:#00e676' : 'opacity:0.6'}">${score1}</div>
                    <div class="match-score-overs" style="opacity:0.6">${ov1}</div>
                </div>
            </div>
        </div>
        <div class="match-meta" style="border-top-style: dashed; opacity: 0.8">
            <span class="match-crr">CRR: ${crr}</span>
            <span class="match-target-info" style="color:#ffc107">${targetInfo}</span>
            <span class="match-crr">${m.overs} ov · ${subText}</span>
        </div>
        ${(m.status === 'live' || m.status === 'paused' || m.status === 'scheduled') ? `
        <div class="match-card-actions" style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; display:flex; justify-content:space-between; gap:10px">
            <button class="btn btn-primary" style="flex:2; font-weight:900; border-radius:12px; height:44px; display:flex; align-items:center; justify-content:center; gap:8px" onclick="event.stopPropagation(); scoreMatchRedirect('${m.id}')">
                 ${m.status === 'live' ? '⚡ SCORE' : (m.status === 'paused' ? '🔑 RESUME' : '🏏 START')}
            </button>
            <button class="btn btn-ghost" style="flex:1; font-weight:800; border-radius:12px; height:44px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1)" onclick="event.stopPropagation(); generateMatchPDF('${m.id}')">
                📄 PDF
            </button>
        </div>` : (m.status === 'completed' ? `
        <div class="match-card-actions" style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; display:flex; justify-content:space-between; gap:8px">
            <button class="btn btn-sm" style="flex:1; font-weight:800; background:rgba(255,255,255,0.05); color:#fff; border:1px solid rgba(255,255,255,0.1); height:44px; border-radius:12px" onclick="event.stopPropagation(); generateMatchPDF('${m.id}')">
                📄 PDF
            </button>
            <button class="btn btn-primary btn-sm" style="flex:1.5; font-weight:900; height:44px; border-radius:12px" onclick="event.stopPropagation(); openMatchDetail('${m.id}')">
                📊 STATS
            </button>
        </div>` : '')}
    </div>`;
}

function goToTournament(id) {
    const tabBtn = document.getElementById('tab-tournament');
    if (tabBtn) tabBtn.click();
    
    selectedTournId = id;
    renderTournDetails(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function scoreMatchRedirect(id) {
    const matches = DB.getMatches();
    const tournament = DB.getTournaments();
    const target = matches.find(m => m.id === id) || tournament.find(t => t.id === id);
    
    if (!target) {
        window.location.href = `score-match.html?matchId=${id}`;
        return;
    }

    // If it's locked and we don't have a local grant, prompt
    const grants = JSON.parse(localStorage.getItem('cricpro_grants') || '{}');
    const needsPassword = (target.isLocked || target.scoringPassword || target.password);
    
    if (needsPassword && !grants[id]) {
        const password = prompt("🔐 This match is protected. Enter the Scoring Password to continue:");
        if (password === null) return; // User cancelled
        
        const res = await DB.handshake(id, password);
        if (res.ok) {
            window.location.href = `score-match.html?matchId=${id}`;
        } else {
            alert("❌ Incorrect password. Access denied.");
        }
    } else {
        window.location.href = `score-match.html?matchId=${id}`;
    }
}

// ========== TOURNAMENT ==========
function renderTournamentSelector() {
    const selector = document.getElementById('tournament-selector');
    const viewTabs = document.getElementById('tournament-view-tabs');
    if (!selector) return;
    const tournaments = DB.getTournaments().filter(t => t.status === 'active');

    if (!tournaments.length) {
        selector.innerHTML = `<p style="color:var(--c-muted); padding:20px;">No active tournaments</p>`;
        const details = document.getElementById('tournament-details');
        if (details) details.innerHTML = '';
        if (viewTabs) viewTabs.style.display = 'none';
        return;
    }

    if (viewTabs) viewTabs.style.display = 'flex';

    selector.innerHTML = tournaments.map(t => {
        const activeClass = selectedTournId === t.id ? 'active' : '';
        return `<button class="tourn-select-btn ${activeClass}" onclick="selectTournament('${t.id}')">🏆 ${t.name}</button>`;
    }).join('');

    if (!selectedTournId && tournaments.length) {
        selectTournament(tournaments[0].id);
    }
}

function onTournSelect(id) {
    selectedTournId = id;
    selectedTournSubTab = 'standings';
    
    // WebSocket Room Join
    if (typeof socket !== 'undefined' && socket) {
        socket.emit('joinTournament', id);
    }
    
    renderTournDetails(id);
}

function selectTournament(id) {
    if (selectedTournId && typeof socket !== 'undefined' && socket) {
        socket.emit('leaveTournament', selectedTournId);
    }
    onTournSelect(id);
    tournamentPageView = 'matches';
    renderTournamentSelector();
    switchTournamentPageView('matches');
}

function switchTournamentPageView(mode) {
    tournamentPageView = mode === 'squads' ? 'squads' : 'matches';
    const btnM = document.getElementById('tvt-matches');
    const btnS = document.getElementById('tvt-squads');
    const block = document.getElementById('tournament-schedule-block');
    const squads = document.getElementById('tournament-squads-panel');
    if (btnM) btnM.classList.toggle('active', tournamentPageView === 'matches');
    if (btnS) btnS.classList.toggle('active', tournamentPageView === 'squads');
    if (block) block.style.display = tournamentPageView === 'matches' ? '' : 'none';
    if (squads) {
        squads.style.display = tournamentPageView === 'squads' ? 'block' : 'none';
        if (tournamentPageView === 'squads' && selectedTournId) renderTournamentSquadsPanel(selectedTournId);
    }
}

function escapeHtmlOngoing(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

function renderTournamentSquadsPanel(id) {
    const t = DB.getTournament(id);
    const el = document.getElementById('tournament-squads-panel');
    if (!t || !el) return;
    if (!t.rosters) t.rosters = {};
    const defaultPh = '../assets/default-player.svg';

    let html = `
        <div class="tournament-header-card" style="margin-bottom:16px">
            <div>
                <div class="tourn-name">${escapeHtmlOngoing(t.name)}</div>
                <div class="tourn-format">Squad lists use registered players (photos from Player Registration)</div>
            </div>
            <a href="score-match.html?tournamentId=${encodeURIComponent(t.id)}" class="btn btn-primary btn-sm" style="text-decoration:none;white-space:nowrap">Open scorer · Team Rosters</a>
        </div>`;

    (t.teams || []).forEach(teamName => {
        const ids = t.rosters[teamName] || [];
        html += `<div class="card" style="margin-bottom:12px">
            <div style="font-weight:800;margin-bottom:10px">${escapeHtmlOngoing(teamName)}</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px">`;
        if (!ids.length) {
            html += `<span style="opacity:0.65;font-size:13px">No players in this squad yet. In the scorer, open this tournament → <b>Team Rosters</b> and add registered players.</span>`;
        } else {
            ids.forEach(pid => {
                const p = DB.getPlayerById(pid);
                const src = p && p.photo ? p.photo : defaultPh;
                const name = p ? p.name : pid;
                const role = p ? capitalize(p.role || 'Player') : '';
                html += `<div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.04);padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.08)">
                    <img src="${src}" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.12)" onerror="this.onerror=null;this.src='${defaultPh}'" />
                    <div><div style="font-weight:600;font-size:13px">${escapeHtmlOngoing(name)}</div><div style="font-size:11px;opacity:0.6">${escapeHtmlOngoing(role)}</div></div>
                </div>`;
            });
        }
        html += `</div></div>`;
    });

    el.innerHTML = html;
}

function switchTournSubTab(tab) {
    selectedTournSubTab = tab;
    
    document.querySelectorAll('.tourn-sub-tab').forEach(btn => {
        const onClick = btn.getAttribute('onclick');
        if (onClick && onClick.includes(`'${tab}'`)) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    const t = DB.getTournament(selectedTournId);
    if (!t) return;

    const content = document.getElementById('tourn-sub-content');
    const bracketPanel = document.getElementById('tournament-bracket');
    const fixturePanel = document.getElementById('tournament-full-schedule');

    if (bracketPanel) bracketPanel.style.display = 'none';
    if (fixturePanel) fixturePanel.style.display = 'none';
    if (content) content.style.display = 'block';

    if (tab === 'bracket') {
        if (content) content.style.display = 'none';
        if (bracketPanel) { bracketPanel.style.display = 'block'; renderBracket(selectedTournId); }
    } else if (tab === 'fixtures' || tab === 'matches') {
        if (content) content.style.display = 'none';
        if (fixturePanel) { fixturePanel.style.display = 'block'; renderFullSchedule(selectedTournId); }
    } else {
        if (content) content.innerHTML = buildTournSubTab(t, tab);
    }
}

function renderTournDetails(id) {
    const t = DB.getTournament(id);
    if (!t) return;
    const details = document.getElementById('tournament-details');
    if (!details) return;

    computeTournamentStandings(t);

    const completedMatches = DB.getMatches().filter(m => m.tournamentId === id && m.status === 'completed' && m.publishLive).length;
    const liveMatches = DB.getMatches().filter(m => m.tournamentId === id && m.status === 'live' && m.publishLive).length;

    const isKO = t.format === 'knockout';

    details.innerHTML = `
        <div class="tournament-header-card">
            <div>
                <div class="tourn-name">${t.name}</div>
                <div class="tourn-format">${capitalize(t.format)} · ${t.overs} overs · ${t.teams.length} teams</div>
            </div>
            <div class="tourn-stats-mini">
                <div class="tsm-item"><div class="tsm-val">${t.teams.length}</div><div class="tsm-lbl">Teams</div></div>
                <div class="tsm-item"><div class="tsm-val">${completedMatches}</div><div class="tsm-lbl">Played</div></div>
                <div class="tsm-item"><div class="tsm-val" style="color:#00e676">${liveMatches}</div><div class="tsm-lbl">Live</div></div>
                <div class="tsm-item" style="display:flex;align-items:center;margin-left:15px;gap:8px">
                    <button class="badge badge-amber" style="cursor:pointer;border:none;padding:10px 14px;font-size:12px;font-weight:800;border-radius:8px" onclick="generateTournamentPDF('${t.id}')">Report</button>
                    <a href="score-match.html?tournamentId=${t.id}" class="badge" style="text-decoration:none; padding:10px 14px; font-size:12px; font-weight:800; border-radius:8px; background:#673ab7; color:#fff">Tournament Hub</a>
                    <a href="overlay.html?tournament=${t.id}" target="_blank" class="badge badge-green" style="text-decoration:none; padding:10px 14px; font-size:12px; font-weight:800; border-radius:8px">Display</a>
                </div>
            </div>
        </div>
        <div class="tourn-sub-tabs">
            ${isKO ? `<button class="tourn-sub-tab active" id="subtab-bracket" onclick="switchTournSubTab('bracket')">🌳 Bracket</button>` : `<button class="tourn-sub-tab active" id="subtab-standings" onclick="switchTournSubTab('standings')">📊 Standings</button>`}
            <button class="tourn-sub-tab" onclick="switchTournSubTab('batting')">🏏 Batsmen</button>
            <button class="tourn-sub-tab" onclick="switchTournSubTab('bowling')">🎳 Bowlers</button>
            ${!isKO ? `<button class="tourn-sub-tab" onclick="switchTournSubTab('nrr')">📈 NRR</button>` : ''}
            <button class="tourn-sub-tab" onclick="switchTournSubTab('fixtures')">📅 Fixtures</button>
        </div>
        <div id="tourn-sub-content"></div>
    `;
    
    // Auto-select tab (preserve if already on tournament view)
    let defaultTab = isKO ? 'bracket' : 'standings';
    if (selectedTournId === id && selectedTournSubTab) {
        // Validation to ensure it doesn't try to open 'standings' on a KO tournament if it was just changed
        if (selectedTournSubTab === 'standings' && isKO) defaultTab = 'bracket';
        else if (selectedTournSubTab === 'bracket' && !isKO) defaultTab = 'standings';
        else defaultTab = selectedTournSubTab;
    }
    switchTournSubTab(defaultTab);
}

function buildTournSubTab(t, tab) {
    if (!t) return '';
    const sortedTeams = t.teams.map(team => ({ name: team, ...((t.standings && t.standings[team]) || {}) }))
        .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.nrr || 0) - (a.nrr || 0));

    if (tab === 'standings') {
        if (t.format === 'knockout') return `<div class="info-banner" style="margin-top:20px; border-color:var(--c-amber)">Knockout format: See <b>Bracket</b> tab for progress.</div>`;
        return `<div class="card"><table class="data-table">
            <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>NRR</th></tr></thead>
            <tbody>${sortedTeams.map((ts, i) => `<tr>
                <td class="standings-pos">${i + 1}</td>
                <td class="standings-team">${ts.name}</td>
                <td>${ts.played || 0}</td><td>${ts.won || 0}</td><td>${ts.lost || 0}</td><td>${ts.tied || 0}</td>
                <td class="standings-pts">${ts.points || 0}</td>
                <td class="${(ts.nrr || 0) >= 0 ? 'nrr-positive' : 'nrr-negative'}">${(ts.nrr || 0).toFixed(3)}</td>
            </tr>`).join('')}</tbody>
        </table></div>`;
    }

    if (tab === 'batting') {
        const batsmen = getBestBatsmen(t.id);
        if (!batsmen.length) return '<div class="empty-state">No batting data yet</div>';
        return batsmen.slice(0, 10).map((b, i) => leaderCard(i + 1, b.name, b.team, b.runs, 'Runs', `SR: ${b.sr}`, t.id, t.name)).join('');
    }

    if (tab === 'bowling') {
        const bowlers = getBestBowlers(t.id);
        if (!bowlers.length) return '<div class="empty-state">No bowling data yet</div>';
        return bowlers.slice(0, 10).map((b, i) => leaderCard(i + 1, b.name, b.team, b.wickets, 'Wkts', `Econ: ${b.econ}`, t.id, t.name)).join('');
    }

    if (tab === 'nrr') {
        if (t.format === 'knockout') return `<div class="info-banner" style="margin-top:20px">NRR is not tracked for knockout tournaments.</div>`;
        return `<div class="card"><table class="data-table">
            <thead><tr><th>#</th><th>Team</th><th>Runs For</th><th>Overs F.</th><th>Runs Ag.</th><th>Overs B.</th><th>NRR</th></tr></thead>
            <tbody>${sortedTeams.map((ts, i) => `<tr>
                <td>${i+1}</td><td class="standings-team">${ts.name}</td>
                <td>${ts.runsScored || 0}</td><td>${formatOvers(ts.ballsFaced || 0)}</td>
                <td>${ts.runsConceded || 0}</td><td>${formatOvers(ts.ballsBowled || 0)}</td>
                <td class="${(ts.nrr || 0) >= 0 ? 'nrr-positive' : 'nrr-negative'}">${(ts.nrr || 0).toFixed(3)}</td>
            </tr>`).join('')}</tbody>
        </table></div>`;
    }
    return '';
}

function renderBracket(id) {
    const t = DB.getTournament(id);
    if (!t || t.format !== 'knockout') return;
    const container = document.getElementById('tournament-bracket');
    if (!container) return;
    
    const matches = t.matches.map(mId => DB.getMatch(mId)).filter(m => m && m.knockout);
    const roundGroups = {};
    matches.forEach(m => {
        const r = m.knockout.round;
        if (!roundGroups[r]) roundGroups[r] = [];
        roundGroups[r].push(m);
    });

    const maxRound = Math.max(...Object.keys(roundGroups).map(Number));
    if (isNaN(maxRound)) { container.innerHTML = '<div class="empty-state">Bracket data error</div>'; return; }

    let html = '<div class="bracket-container">';
    for (let r = 1; r <= maxRound; r++) {
        const rMatches = roundGroups[r] || [];
        html += `<div class="bracket-round">`;
        rMatches.forEach(m => {
            const inn0 = m.innings ? m.innings[0] : null;
            const inn1 = m.innings ? m.innings[1] : null;
            let winner = null;
            if (m.status === 'completed') {
                if (inn1 && inn1.runs > (inn0 ? inn0.runs : 0)) winner = m.team2;
                else if (inn0) winner = m.team1;
            }

            html += `
                <div class="bracket-match" onclick="openMatchDetail('${m.id}')">
                    <div class="bracket-match-info">${m.scheduledName || `Match ${m.knockout.matchNum}`}</div>
                    <div class="bracket-team-row ${winner === m.team1 ? 'winner' : ''}">
                        <span class="bracket-team-name">${m.team1 || 'TBD'}</span>
                        <span class="bracket-team-score">${inn0 ? inn0.runs : '-'}</span>
                    </div>
                    <div class="bracket-team-row ${winner === m.team2 ? 'winner' : ''}">
                        <span class="bracket-team-name">${m.team2 || 'TBD'}</span>
                        <span class="bracket-team-score">${inn1 ? inn1.runs : '-'}</span>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderFullSchedule(id) {
    const t = DB.getTournament(id);
    if (!t) return;
    const container = document.getElementById('tournament-full-schedule');
    if (!container) return;
    const matches = t.matches.map(mId => DB.getMatch(mId)).filter(m => m);
    container.innerHTML = `<div style="display:flex; flex-direction:column; gap:12px">` + 
        matches.map(m => buildMatchCard(m, (m.status === 'live' || m.status === 'paused'))).join('') + 
        `</div>`;
}

function getBestBatsmen(tournId) {
    const matches = DB.getMatches().filter(m => m.tournamentId === tournId && (m.status === 'completed' || m.status === 'live' || m.status === 'paused'));
    const stats = {};
    matches.forEach(m => {
        (m.innings || []).forEach(inn => {
            if (!inn) return;
            (inn.batsmen || []).forEach(b => {
                const key = b.name;
                if (!stats[key]) stats[key] = { name: b.name, team: b.team || inn.battingTeam || '', runs: 0, balls: 0, fours: 0, sixes: 0 };
                stats[key].runs  += (b.runs  || 0);
                stats[key].balls += (b.balls || 0);
                stats[key].fours += (b.fours || 0);
                stats[key].sixes += (b.sixes || 0);
            });
        });
    });
    return Object.values(stats).map(s => ({ ...s, sr: formatSR(s.runs, s.balls) })).sort((a, b) => b.runs - a.runs);
}

function getBestBowlers(tournId) {
    const matches = DB.getMatches().filter(m => m.tournamentId === tournId && (m.status === 'completed' || m.status === 'live' || m.status === 'paused'));
    const stats = {};
    matches.forEach(m => {
        (m.innings || []).forEach(inn => {
            if (!inn) return;
            (inn.bowlers || []).forEach(b => {
                if (!stats[b.name]) stats[b.name] = { name: b.name, team: b.team || inn.bowlingTeam || '', wickets: 0, runs: 0, balls: 0 };
                stats[b.name].wickets += (b.wickets || 0);
                stats[b.name].runs += (b.runs || 0);
                stats[b.name].balls += (b.balls || 0);
            });
        });
    });
    return Object.values(stats).map(s => ({ ...s, econ: formatEcon(s.runs, s.balls), overs: formatOvers(s.balls) }))
        .sort((a, b) => b.wickets - a.wickets || parseFloat(a.econ) - parseFloat(b.econ));
}

function leaderCard(rank, name, team, statVal, statLbl, sub, tournId, tournName) {
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    const clickHandler = tournId ? `onclick="handlePlayerStatsClick('${name}', '${tournId}', '${tournName || ''}')"` : '';
    return `<div class="leader-card" ${clickHandler} style="${tournId ? 'cursor:pointer' : ''}">
        <div class="leader-rank">${medal}</div>
        <div class="leader-avatar">${name.charAt(0)}</div>
        <div class="leader-info">
            <div class="leader-name">${name}</div>
            <div class="leader-team">${team} ${sub ? '· ' + sub : ''}</div>
        </div>
        <div class="leader-stat">
            <div class="leader-stat-val">${statVal}</div>
            <div class="leader-stat-lbl">${statLbl}</div>
        </div>
    </div>`;
}

function computeTournamentStandings(t) {
    if (!t || t.format === 'knockout') return;
    t.standings = {};
    t.teams.forEach(team => {
        t.standings[team] = { played: 0, won: 0, lost: 0, tied: 0, points: 0, runsScored: 0, ballsFaced: 0, runsConceded: 0, ballsBowled: 0, nrr: 0 };
    });
    
    // Filter matches for this tournament that are live, paused, or completed
    const matches = DB.getMatches().filter(m => 
        m.tournamentId === t.id && 
        (m.status === 'completed' || m.status === 'live' || m.status === 'paused') && 
        m.publishLive
    );
    
    matches.forEach(m => {
        const team1 = m.team1;
        const team2 = m.team2;
        const s1 = t.standings[team1];
        const s2 = t.standings[team2];
        if (!s1 || !s2) return;

        // 1. Points & Win/Loss - ONLY for completed matches
        if (m.status === 'completed') {
            s1.played++;
            s2.played++;

            if (m.winner) {
                if (t.standings[m.winner]) {
                    t.standings[m.winner].won++;
                    t.standings[m.winner].points += 2;
                }
                const loser = m.winner === team1 ? team2 : team1;
                if (t.standings[loser]) t.standings[loser].lost++;
            } else if (m.resultType === 'tied') {
                s1.tied++; s1.points += 1;
                s2.tied++; s2.points += 1;
            } else if (m.resultType === 'abandoned') {
                s1.points += 1;
                s2.points += 1;
            }
        }

        // 2. NRR Components - Includes Live data for real-time standings
        const inn0 = m.innings && m.innings[0];
        const inn1 = m.innings && m.innings[1];
        if (!inn0 || !inn1) return;

        const battingFirst = m.battingFirst || team1;
        const bpo = m.ballsPerOver || 6;
        const maxBalls = (m.overs || 0) * bpo;
        const pps = m.playersPerSide || 11;

        // All out rule: if all wickets down, use full quota of balls
        const b0 = (inn0.wickets >= pps - 1) ? maxBalls : (inn0.balls || 0);
        const b1 = (inn1.wickets >= pps - 1) ? maxBalls : (inn1.balls || 0);

        if (battingFirst === team1) {
            // Team 1 batted first
            s1.runsScored += (inn0.runs || 0); s1.ballsFaced += b0;
            s2.runsConceded += (inn0.runs || 0); s2.ballsBowled += b0;
            s2.runsScored += (inn1.runs || 0); s2.ballsFaced += b1;
            s1.runsConceded += (inn1.runs || 0); s1.ballsBowled += b1;
        } else {
            // Team 2 batted first
            s2.runsScored += (inn0.runs || 0); s2.ballsFaced += b0;
            s1.runsConceded += (inn0.runs || 0); s1.ballsBowled += b0;
            s1.runsScored += (inn1.runs || 0); s1.ballsFaced += b1;
            s2.runsConceded += (inn1.runs || 0); s2.ballsBowled += b1;
        }
    });

    // 3. Final NRR Calculation
    t.teams.forEach(team => {
        const s = t.standings[team];
        const bpo = t.ballsPerOver || 6;
        const batRR = s.ballsFaced ? (s.runsScored / (s.ballsFaced / bpo)) : 0;
        const bowlRR = s.ballsBowled ? (s.runsConceded / (s.ballsBowled / bpo)) : 0;
        s.nrr = parseFloat((batRR - bowlRR).toFixed(3));
    });
}

function renderRecent() {
    const grid = document.getElementById('recent-matches-grid');
    if (!grid) return;
    
    // All completed matches
    const allRecentMatches = DB.getMatches().filter(m => m.status === 'completed' && m.publishLive);
    
    // Identify all tournaments that have at least one completed match
    const allTournaments = DB.getTournaments();
    const activeTournamentsWithCompletedMatches = allTournaments.filter(t => {
        return allRecentMatches.some(m => m.tournamentId === t.id);
    });

    const singleMatches = allRecentMatches.filter(m => !m.tournamentId);
    
    let html = '';
    
    if (activeTournamentsWithCompletedMatches.length > 0) {
        html += `<h3 style="grid-column:1/-1; margin-bottom:12px; font-weight:800; color:#ffc107; border-left:4px solid #ffc107; padding-left:12px; font-size:18px; letter-spacing:1px">TOURNAMENTS</h3>`;
        html += activeTournamentsWithCompletedMatches.map(t => {
            const tMatches = DB.getMatches().filter(m => m.tournamentId === t.id && m.status === 'completed');
            const finished = t.status === 'completed' || (t.matches.length > 0 && t.matches.every(mId => DB.getMatch(mId)?.status === 'completed'));
            
            return `
                <div class="match-card tournament-card" style="border-color:${finished ? '#ffc107' : 'rgba(255,255,255,0.1)'}; background:rgba(255,193,7,0.05); position:relative" onclick="goToTournament('${t.id}')">
                    <div style="font-size:10px; font-weight:800; color:#ffc107; margin-bottom:6px; letter-spacing:1px">${finished ? 'TOURNAMENT FINISHED' : 'TOURNAMENT ONGOING'}</div>
                    <div style="font-size:22px; font-weight:900; color:#fff">${t.name}</div>
                    <div style="font-size:13px; color:rgba(255,255,255,0.5); margin-top:4px">${t.teams.length} Teams · ${tMatches.length} Finished Matches</div>
                    <div style="margin-top:20px"><button class="btn btn-amber btn-full btn-sm" style="color:#000; font-weight:800">${finished ? 'VIEW FINAL RESULTS' : 'VIEW TOURNAMENT HUB'}</button></div>
                </div>
            `;
        }).join('');
    }

    if (singleMatches.length > 0) {
        html += `<h3 style="grid-column:1/-1; margin-top:30px; margin-bottom:12px; font-weight:800; color:#fff; border-left:4px solid #fff; padding-left:12px; font-size:18px; letter-spacing:1px">SINGLE MATCHES</h3>`;
        html += singleMatches.slice().reverse().map(m => buildMatchCard(m, false)).join('');
    }

    if (!activeTournamentsWithCompletedMatches.length && !singleMatches.length) {
        grid.innerHTML = '<div class="empty-state">No completed matches or tournaments found</div>';
    } else {
        grid.innerHTML = html;
    }
}


function formatOvers(balls, bpo = 6) { return `${Math.floor(balls / bpo)}.${balls % bpo}`; }
function formatCRR(runs, balls, bpo = 6) { return balls ? (runs / (balls / bpo)).toFixed(2) : '0.00'; }
function formatSR(runs, balls) { return balls ? ((runs / balls) * 100).toFixed(2) : '0.00'; }
function formatEcon(runs, balls, bpo = 6) { return balls ? (runs / (balls / bpo)).toFixed(2) : '0.00'; }
function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function openMatchDetail(id) {
    const m = DB.getMatch(id);
    if (!m) return;
    const modal = document.getElementById('match-detail-modal');
    const content = document.getElementById('match-detail-content');
    if (modal && content) {
        content.innerHTML = renderMatchDetailContent(m);
        modal.style.display = 'flex';
        
        // GSAP Premium Entrance
        gsap.fromTo('.scorecard-container', 
            { opacity: 0, y: 30, scale: 0.95, rotateX: 10 }, 
            { opacity: 1, y: 0, scale: 1, rotateX: 0, duration: 0.6, ease: 'back.out(1.4)' }
        );
        gsap.from('.sc-table tbody tr', { opacity: 0, x: -20, stagger: 0.05, duration: 0.4, delay: 0.2 });
    }
}

function renderMatchDetailContent(m) {
    const inn0 = m.innings ? m.innings[0] : null;
    const inn1 = m.innings ? m.innings[1] : null;

    const renderInningsTable = (inn, teamName, isCurrent) => {
        if (!inn) return `<div class="sc-extras">No data for ${teamName} innings</div>`;
        
        const totalScore = `${inn.runs}/${inn.wickets}`;
        const totalOvers = formatOvers(inn.balls, m.ballsPerOver);
        let batsmenHtml = inn.batsmen.map(b => `
            <tr style="${b.status === 'Batting' ? 'background:rgba(0,230,118,0.05)' : ''}">
                <td>
                    <div style="font-weight:700; color:#fff; ${m.tournamentId ? 'cursor:pointer; text-decoration:underline' : ''}" ${m.tournamentId ? `onclick="handlePlayerStatsClick('${b.name}', '${m.tournamentId}', '${m.tournamentName || ''}')"` : ''}>${b.name} ${b.status === 'Batting' ? '<span style="color:#00e676; font-size:10px">★</span>' : ''}</div>
                    <div style="font-size:10px; opacity:0.6">${b.status || 'Yet to Bat'}</div>
                </td>
                <td style="font-weight:800; color:var(--c-primary)">${b.runs}</td>
                <td style="opacity:0.7">${b.balls}</td>
                <td style="opacity:0.7">${b.fours}</td>
                <td style="opacity:0.7">${b.sixes}</td>
                <td style="font-weight:700; color:rgba(255,255,255,0.4)">${formatSR(b.runs, b.balls)}</td>
            </tr>
        `).join('');
 
        let bowlersHtml = inn.bowlers.map(b => `
            <tr>
                <td style="font-weight:700; color:#fff; ${m.tournamentId ? 'cursor:pointer; text-decoration:underline' : ''}" ${m.tournamentId ? `onclick="handlePlayerStatsClick('${b.name}', '${m.tournamentId}', '${m.tournamentName || ''}')"` : ''}>${b.name}</td>
                <td style="opacity:0.7">${formatOvers(b.balls, m.ballsPerOver)}</td>
                <td style="opacity:0.7">${b.maidens || 0}</td>
                <td style="opacity:0.7">${b.runs}</td>
                <td style="font-weight:800; color:#ff1744">${b.wickets}</td>
                <td style="font-weight:700; color:rgba(255,255,255,0.4)">${formatEcon(b.runs, b.balls, m.ballsPerOver)}</td>
            </tr>
        `).join('');

        const extras = inn.extras || { total: 0, wd: 0, nb: 0, b: 0, lb: 0 };
        const extrasText = `Extras: <b>${extras.total || 0}</b> (Wd:${extras.wd || 0}, Nb:${extras.nb || 0}, By:${extras.b || 0}, Lb:${extras.lb || 0})`;

        return `
            <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.1); border-radius:16px; padding:20px; margin-bottom:24px; position:relative; overflow:hidden">
                <div style="position:absolute; top:0; right:0; padding:8px 16px; background:rgba(255,255,255,0.05); font-size:10px; font-weight:800; letter-spacing:1px; color:var(--c-muted)">${teamName.toUpperCase()}</div>
                
                <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:16px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:12px">
                    <div style="font-size:24px; font-weight:900; color:#fff; letter-spacing:-0.5px">${totalScore} <span style="font-size:14px; color:var(--c-muted); font-weight:400; margin-left:8px">(${totalOvers} ov)</span></div>
                    <div style="font-size:10px; font-weight:800; background:var(--c-primary-dark); color:var(--c-primary); padding:4px 10px; border-radius:4px">${isCurrent ? 'INNINGS IN PROGRESS' : 'INNINGS COMPLETED'}</div>
                </div>
                
                <div style="font-size:11px; font-weight:800; color:rgba(255,255,255,0.3); letter-spacing:1px; margin-bottom:10px; padding-left:4px">BATTING</div>
                <table class="data-table" style="margin-bottom:16px; background:transparent">
                    <thead>
                        <tr><th style="background:transparent">Name</th><th style="background:transparent">R</th><th style="background:transparent">B</th><th style="background:transparent">4s</th><th style="background:transparent">6s</th><th style="background:transparent">SR</th></tr>
                    </thead>
                    <tbody>${batsmenHtml}</tbody>
                </table>

                <div style="background:rgba(0,0,0,0.2); padding:10px 16px; border-radius:8px; font-size:12px; color:var(--c-muted); margin-bottom:24px">${extrasText}</div>

                <div style="font-size:11px; font-weight:800; color:rgba(255,255,255,0.3); letter-spacing:1px; margin-bottom:10px; padding-left:4px">BOWLING</div>
                <table class="data-table" style="background:transparent">
                    <thead>
                        <tr><th style="background:transparent">Bowler</th><th style="background:transparent">O</th><th style="background:transparent">M</th><th style="background:transparent">R</th><th style="background:transparent">W</th><th style="background:transparent">Econ</th></tr>
                    </thead>
                    <tbody>${bowlersHtml}</tbody>
                </table>
            </div>
        `;
    };

    const typeLabel = m.type === 'tournament' ? `Tournament` : 'Single Match';
    const subInfo = `${m.overs} overs · ${m.venue || 'Home'} · ${typeLabel}`;

    return `
        <div class="scorecard-container" style="padding:0; background:transparent; perspective: 1000px">
            <div style="padding:32px 32px 24px; background: linear-gradient(135deg, #1a1a1a, #000); border-radius: 20px 20px 0 0; border-bottom: 1px solid rgba(255,255,255,0.1)">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px">
                    <span class="match-type-badge badge badge-${m.type === 'tournament' ? 'amber' : 'blue'}" style="margin:0">${typeLabel}</span>
                    <a href="overlay.html?match=${m.id}" target="_blank" class="btn btn-amber btn-sm" style="text-decoration:none; font-weight:800; box-shadow: 0 4px 15px rgba(255,193,7,0.2)">
                        📺 TV BROADCAST
                    </a>
                </div>
                <h1 style="font-size:32px; font-weight:900; color:#fff; letter-spacing:-1px; margin-bottom:4px">${m.team1} <span style="font-weight:400; font-family:'JetBrains Mono'; opacity:0.3; font-size:20px; vertical-align:middle; margin:0 12px">VS</span> ${m.team2}</h1>
                <div style="font-size:13px; font-weight:600; color:var(--c-muted); opacity:0.7">${subInfo}</div>
            </div>

            <div style="padding:24px 32px 32px">
                <div style="background:rgba(255,193,7,0.05); border:1px solid rgba(255,193,7,0.2); padding:16px; border-radius:12px; text-align:center; font-weight:900; color:#ffc107; font-size:16px; margin-bottom:28px; letter-spacing:1px; text-transform:uppercase">
                    ${m.result || (m.status === 'live' ? '🔴 LIVE ACTION' : '⏸ MATCH PAUSED')}
                </div>

                ${renderInningsTable(inn0, m.battingFirst || m.team1, m.currentInnings === 0)}
                ${inn1 ? renderInningsTable(inn1, m.fieldingFirst || m.team2, m.currentInnings === 1) : ''}

                <div style="margin-top:32px">
                    <button class="btn btn-ghost btn-full" style="height:50px; font-weight:800; border-color:rgba(255,255,255,0.1)" onclick="closeMatchDetail()">Close Scorecard</button>
                </div>
            </div>
        </div>
    `;
}

function closeMatchDetail() {
    const modal = document.getElementById('match-detail-modal');
    if (modal) modal.style.display = 'none';
}

async function generateMatchPDF(matchId) {
    const m = DB.getMatch(matchId);
    if (!m) return showToast('Match not found', 'error');
    
    showToast('⏳ Generating PDF...', 'default');
    
    // Improved container for better PDF capture
    const container = document.createElement('div');
    container.style = `position:fixed; top:0; left:-10000px; width:900px; padding:40px; background:#fff; color:#000; font-family:'Outfit',sans-serif; z-index:9999; opacity:1; pointer-events:none; border-radius:0; line-height:1.5;`;
    
    const inn0 = m.innings ? m.innings[0] : null;
    const inn1 = m.innings ? m.innings[1] : null;

    const renderInningsTablePDF = (inn, teamName) => {
        const hasBatsmen = inn && inn.batsmen && inn.batsmen.length > 0;
        const runs = (inn && inn.runs) || 0;
        const wkts = (inn && inn.wickets) || 0;
        const balls = (inn && inn.balls) || 0;

        if (!hasBatsmen) {
            return `<div style="margin-bottom:30px; border:1px solid #eee; border-radius:12px; overflow:hidden">
                <div style="background:#1a237e; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; color:#fff">
                    <span style="font-size:20px; font-weight:900; letter-spacing:0.5px">${teamName.toUpperCase()}</span>
                    <span style="font-size:22px; font-weight:900">${runs}/${wkts} <span style="font-size:14px; font-weight:400; opacity:0.8">(${formatOvers(balls, m.ballsPerOver)} ov)</span></span>
                </div>
                <div style="padding:20px; text-align:center; color:#888; font-style:italic">Detailed player statistics not yet recorded for this innings.</div>
            </div>`;
        }
        const extras = inn.extras || { total: 0, wd: 0, nb: 0, b: 0, lb: 0 };
        return `
            <div style="margin-bottom:30px; border:1px solid #eee; border-radius:12px; overflow:hidden">
                <div style="background:#1a237e; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; color:#fff">
                    <span style="font-size:20px; font-weight:900; letter-spacing:0.5px">${teamName.toUpperCase()}</span>
                    <span style="font-size:22px; font-weight:900">${inn.runs}/${inn.wickets} <span style="font-size:14px; font-weight:400; opacity:0.8">(${formatOvers(inn.balls, m.ballsPerOver)} ov)</span></span>
                </div>
                <div style="padding:15px">
                    <table style="width:100%; border-collapse:collapse; margin-bottom:15px; font-size:13px">
                        <thead>
                            <tr style="border-bottom:2px solid #f0f0f0; text-align:left; color:#1a237e">
                                <th style="padding:10px 8px">BATSMAN</th>
                                <th style="padding:10px 8px">R</th>
                                <th style="padding:10px 8px">B</th>
                                <th style="padding:10px 8px">4s</th>
                                <th style="padding:10px 8px">6s</th>
                                <th style="padding:10px 8px">SR</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${inn.batsmen.map(b => {
                                const outDetails = b.dismissal ? `<br/><span style="font-size:11px; color:#c62828; font-weight:600">${b.dismissal}</span>` : `<span style="font-size:10px; color:#999; font-weight:400; margin-left:6px">(${b.status || 'DNB'})</span>`;
                                return `
                                <tr style="border-bottom:1px solid #f5f5f5">
                                    <td style="padding:10px 8px; color:#333"><span style="font-weight:700">${b.name}</span> ${outDetails}</td>
                                    <td style="padding:10px 8px; font-weight:800; color:#1a237e">${b.runs || 0}</td>
                                    <td style="padding:10px 8px">${b.balls || 0}</td>
                                    <td style="padding:10px 8px">${b.fours || 0}</td>
                                    <td style="padding:10px 8px">${b.sixes || 0}</td>
                                    <td style="padding:10px 8px; color:#888">${formatSR(b.runs, b.balls)}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                    <div style="font-size:12px; color:#666; padding:12px; background:#f8f9fa; border-radius:8px; margin-bottom:20px; border-left:4px solid #7b1fa2">
                        <b>EXTRAS: ${extras.total || 0}</b> (Wides: ${extras.wd || 0}, No Balls: ${extras.nb || 0}, Byes: ${extras.b || 0}, Leg Byes: ${extras.lb || 0})
                    </div>
                    <table style="width:100%; border-collapse:collapse; font-size:13px">
                        <thead>
                            <tr style="border-bottom:2px solid #f0f0f0; text-align:left; color:#7b1fa2">
                                <th style="padding:10px 8px">BOWLER</th>
                                <th style="padding:10px 8px">O</th>
                                <th style="padding:10px 8px">M</th>
                                <th style="padding:10px 8px">R</th>
                                <th style="padding:10px 8px">W</th>
                                <th style="padding:10px 8px">ECON</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(inn.bowlers || []).map(b => `
                                <tr style="border-bottom:1px solid #f5f5f5">
                                    <td style="padding:10px 8px; font-weight:700; color:#333">${b.name}</td>
                                    <td style="padding:10px 8px">${formatOvers(b.balls || 0, m.ballsPerOver)}</td>
                                    <td style="padding:10px 8px">${b.maidens || 0}</td>
                                    <td style="padding:10px 8px">${b.runs || 0}</td>
                                    <td style="padding:10px 8px; font-weight:800; color:#c62828">${b.wickets || 0}</td>
                                    <td style="padding:10px 8px; color:#888">${formatEcon(b.runs, b.balls, m.ballsPerOver)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    container.innerHTML = `
        <div style="background:linear-gradient(135deg, #1a237e 0%, #311b92 100%); color:#fff; padding:30px; text-align:center; border-radius:12px 12px 0 0">
            <div style="font-size:38px; font-weight:950; letter-spacing:-1.5px; margin-bottom:5px">SLCRICK<span style="color:#ffc107">PRO</span></div>
            <div style="font-size:11px; letter-spacing:4px; font-weight:800; opacity:0.8; text-transform:uppercase">Professional Match Summary Report</div>
        </div>
        
        <div style="padding:30px; background:#fff; border:1px solid #eee; border-top:none; border-radius:0 0 12px 12px">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; padding-bottom:20px; border-bottom:1px solid #f0f0f0">
                <div>
                    <div style="font-size:24px; font-weight:900; color:#1a237e; margin-bottom:5px">${m.team1} <span style="font-weight:400; opacity:0.3">vs</span> ${m.team2}</div>
                    <div style="font-size:13px; color:#777; font-weight:600">${m.overs} Overs Match · ${m.venue || 'Neutral Ground'} · ${m.type === 'tournament' ? (m.tournamentName || 'Tournament') : 'Single Match'}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:10px; font-weight:900; color:#999; margin-bottom:2px">MATCH DATE</div>
                    <div style="font-size:14px; font-weight:800; color:#333">${new Date(m.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
                </div>
            </div>

            <div style="background:#f1f8e9; border:2px solid #43a047; padding:20px; border-radius:12px; text-align:center; font-weight:950; color:#1b5e20; font-size:18px; margin-bottom:40px; box-shadow: 0 4px 12px rgba(0,0,0,0.05)">
                🏆 ${m.status === 'live' ? 'MATCH IN PROGRESS (LIVE)' : (m.status === 'paused' ? 'MATCH PAUSED' : (m.result || 'MATCH COMPLETED'))}
            </div>

            ${renderInningsTablePDF(inn0, m.battingFirst || m.team1)}
            <div style="height:30px"></div>
            ${inn1 ? renderInningsTablePDF(inn1, m.fieldingFirst || m.team2) : ''}

            <div style="margin-top:60px; padding-top:20px; border-top:2px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center">
                <div style="font-size:11px; color:#bbb; font-weight:600">Generated by SLCRICKPRO Performance Management Suite</div>
                <div style="font-size:11px; color:#bbb">MATCH ID: ${m.id}</div>
            </div>
        </div>
    `;

    document.body.appendChild(container);

    // Wait for internal rendering browser-side
    await new Promise(resolve => setTimeout(resolve, 1500));

    const opt = {
        margin: [10, 10, 10, 10],
        filename: `SLCRICKPRO_Report_${m.team1}_vs_${m.team2}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(container).save();
        showToast('✅ PDF Report Downloaded!', 'success');
    } catch (err) {
        console.error("PDF Export Fail", err);
        showToast('❌ PDF Generation Failed', 'error');
    } finally {
        container.remove();
    }
}

// ========== PLAYER STATS CARD GENERATOR ==========
let activeStatsPlayer = null;
let activeStatsTournId = null;
let activeStatsTournName = null;
let activeStatsPhotoBase64 = null;

function handlePlayerStatsClick(name, tournId, tournName) {
    activeStatsPlayer = name;
    activeStatsTournId = tournId;
    activeStatsTournName = tournName;
    activeStatsPhotoBase64 = null;

    const modal = document.getElementById('stats-card-modal');
    const nameEl = document.getElementById('stats-player-name');
    const preview = document.getElementById('photo-preview-container');
    if (modal) modal.style.display = 'flex';
    if (nameEl) nameEl.textContent = name;
    if (preview) preview.style.display = 'none';
}

function handlePlayerPhotoSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        activeStatsPhotoBase64 = e.target.result;
        const previewImg = document.getElementById('photo-preview');
        const previewContainer = document.getElementById('photo-preview-container');
        if (previewImg) previewImg.src = activeStatsPhotoBase64;
        if (previewContainer) previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);
}

function getTournamentPlayerStats(playerName, tournId) {
    const matches = DB.getMatches().filter(m => m.tournamentId === tournId && m.status === 'completed');
    const stats = {
        matches: 0,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        wickets: 0,
        bowlingRuns: 0,
        bowlingBalls: 0,
        bestBowling: "0/0",
        teams: new Set()
    };

    let bestWickets = -1;
    let correspondingRuns = 0;

    matches.forEach(m => {
        let playedInMatch = false;
        m.innings.forEach(inn => {
            if (!inn) return;
            
            // Batting
            const bat = inn.batsmen.find(b => b.name === playerName);
            if (bat) {
                playedInMatch = true;
                stats.runs += (bat.runs || 0);
                stats.balls += (bat.balls || 0);
                stats.fours += (bat.fours || 0);
                stats.sixes += (bat.sixes || 0);
            }

            // Bowling
            const bowl = inn.bowlers.find(b => b.name === playerName);
            if (bowl) {
                playedInMatch = true;
                stats.wickets += (bowl.wickets || 0);
                stats.bowlingRuns += (bowl.runs || 0);
                stats.bowlingBalls += (bowl.balls || 0);
                
                if (bowl.wickets > bestWickets) {
                    bestWickets = bowl.wickets;
                    correspondingRuns = bowl.runs;
                } else if (bowl.wickets === bestWickets && bowl.runs < correspondingRuns) {
                    correspondingRuns = bowl.runs;
                }
            }
        });
        if (playedInMatch) {
            stats.matches++;
            stats.teams.add(m.team1);
            stats.teams.add(m.team2);
        }
    });

    stats.bestBowling = bestWickets === -1 ? "0/0" : `${bestWickets}/${correspondingRuns}`;
    stats.teams = Array.from(stats.teams).join(', ');
    return stats;
}

async function generateFinalStatsCard() {
    if (!activeStatsPlayer || !activeStatsTournId) return;
    const stats = getTournamentPlayerStats(activeStatsPlayer, activeStatsTournId);
    
    showToast('🎨 Creating your Masterpiece...', 'default');
    
    const card = document.createElement('div');
    card.style = `
        position: fixed; top: -5000px; left: 0;
        width: 1080px; height: 1350px;
        background: #000; color: #fff;
        font-family: 'Outfit', sans-serif;
        display: flex; flex-direction: column;
        overflow: hidden;
    `;

    const sr = stats.balls ? ((stats.runs / stats.balls) * 100).toFixed(1) : '0.0';
    const econ = stats.bowlingBalls ? ((stats.bowlingRuns / (stats.bowlingBalls / 6))).toFixed(2) : '0.00';

    card.innerHTML = `
        <!-- Background Overlay -->
        <div style="position:absolute; top:0; left:0; width:100%; height:100%; background: linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.8) 70%, #000 100%); z-index:1"></div>
        
        <!-- Top Branding -->
        <div style="position:absolute; top:60px; left:0; width:100%; display:flex; justify-content:center; align-items:center; z-index:2; gap:15px">
            <div style="background:#ffc107; color:#000; padding:8px 20px; border-radius:4px; font-weight:900; font-size:24px; letter-spacing:2px">PLAYER STATS</div>
            <div style="font-size:20px; font-weight:400; opacity:0.6; letter-spacing:1px">${activeStatsTournName.toUpperCase()}</div>
        </div>

        <!-- Main Player Image (Background style) -->
        <div style="position:absolute; top:0; left:0; width:100%; height:80%; z-index:0; display:flex; justify-content:center; align-items:center; overflow:hidden">
            <img src="${activeStatsPhotoBase64}" style="width:110%; height:110%; object-fit:cover; filter: grayscale(0.5) contrast(1.1) brightness(0.6) blur(2px); transform: scale(1.1)">
        </div>

        <!-- Foreground Player Image -->
        <div style="position:absolute; top:15%; left:0; width:100%; height:65%; z-index:2; display:flex; justify-content:center; align-items:flex-end">
            <img src="${activeStatsPhotoBase64}" style="height:90%; object-fit:contain; filter: drop-shadow(0 20px 50px rgba(0,0,0,0.8))">
        </div>

        <!-- Player Name -->
        <div style="position:absolute; bottom:320px; left:0; width:100%; text-align:center; z-index:3">
            <div style="font-size:120px; font-weight:900; line-height:0.9; text-transform:uppercase; letter-spacing:-4px; color:#ffc107">${activeStatsPlayer}</div>
        </div>

        <!-- Stats Grid -->
        <div style="position:absolute; bottom:80px; left:0; width:100%; z-index:3; display:flex; justify-content:center; gap:60px; padding:0 60px">
            <div style="text-align:center">
                <div style="font-size:18px; color:rgba(255,255,255,0.5); font-weight:800; margin-bottom:10px; letter-spacing:1px">MATCHES</div>
                <div style="font-size:48px; font-weight:900; color:#fff">${stats.matches}</div>
            </div>
            <div style="width:2px; height:80px; background:rgba(255,255,255,0.1); align-self:center"></div>
            <div style="text-align:center">
                <div style="font-size:18px; color:rgba(255,255,255,0.5); font-weight:800; margin-bottom:10px; letter-spacing:1px">TOTAL RUNS</div>
                <div style="font-size:48px; font-weight:900; color:#fff">${stats.runs}<span style="font-size:20px; color:#ffc107; margin-left:5px">(${sr})</span></div>
            </div>
            <div style="width:2px; height:80px; background:rgba(255,255,255,0.1); align-self:center"></div>
            <div style="text-align:center">
                <div style="font-size:18px; color:rgba(255,255,255,0.5); font-weight:800; margin-bottom:10px; letter-spacing:1px">WICKETS</div>
                <div style="font-size:48px; font-weight:900; color:#fff">${stats.wickets}</div>
            </div>
            <div style="width:2px; height:80px; background:rgba(255,255,255,0.1); align-self:center"></div>
            <div style="text-align:center">
                <div style="font-size:18px; color:rgba(255,255,255,0.5); font-weight:800; margin-bottom:10px; letter-spacing:1px">BBI</div>
                <div style="font-size:48px; font-weight:900; color:#fff">${stats.bestBowling}</div>
            </div>
        </div>

        <!-- Footer Logo -->
        <div style="position:absolute; bottom:30px; left:0; width:100%; display:flex; justify-content:center; z-index:3; opacity:0.6">
             <div style="font-size:16px; font-weight:800; letter-spacing:4px">SLCRICKPRO CRICKET SYSTEM</div>
        </div>
    `;

    document.body.appendChild(card);
    
    try {
        const canvas = await html2canvas(card, {
            useCORS: true,
            scale: 2,
            backgroundColor: '#000'
        });
        
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        
        // Open in new tab or download
        const link = document.createElement('a');
        link.href = imgData;
        link.download = `Stats_${activeStatsPlayer.replace(/\s+/g, '_')}_${activeStatsTournName.replace(/\s+/g, '_')}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Also open image in new tab for viewing
        const win = window.open();
        win.document.write(`<body style="margin:0; background:#111; display:flex; justify-content:center; align-items:center; height:100vh;"><img src="${imgData}" style="max-height:95%; box-shadow:0 0 50px rgba(0,0,0,0.5); border-radius:10px;"></body>`);
        
        showToast('🔥 Stats Card Generated!', 'success');
        document.getElementById('stats-card-modal').style.display = 'none';
        
    } catch (err) {
        console.error(err);
        showToast('❌ Failed to generate image', 'error');
    } finally {
        document.body.removeChild(card);
    }
}

async function generateTournamentPDF(tournId) {
    const t = DB.getTournament(tournId);
    if (!t) return showToast('Tournament not found', 'error');

    showToast('📊 Building Comprehensive Report…', 'default');

    // ── Compute all stats locally (no backend required) ──────────────────────
    computeTournamentStandings(t);

    const sortedStandings = t.teams
        .map(name => ({ name, ...(t.standings[name] || {}) }))
        .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.nrr || 0) - (a.nrr || 0));

    const allTournMatches = (t.matches || []).map(mId => DB.getMatch(mId)).filter(m => m);
    const completedMatches = allTournMatches.filter(m => m.status === 'completed');
    const liveMatches = allTournMatches.filter(m => m.status === 'live' || m.status === 'paused');

    const batsmen = getBestBatsmen(t.id);
    const bowlers = getBestBowlers(t.id);

    const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

    // ── PDF styles ─────────────────────────────────────────────────────────────
    const style = `
        body { font-family: 'Outfit', Arial, sans-serif; margin:0; color:#111; }
        .page-break { page-break-before: always; }
        table { width:100%; border-collapse:collapse; margin-bottom:22px; font-size:13px; }
        th { background:#1a237e; color:#fff; padding:9px 10px; text-align:left; font-size:12px; font-weight:700; letter-spacing:0.04em; }
        td { padding:8px 10px; border-bottom:1px solid #f0f0f0; }
        tr:nth-child(even) td { background:#f9f9fb; }
        .section-title { font-size:17px; font-weight:900; color:#1a237e; border-left:4px solid #ffc107; padding-left:10px; margin:30px 0 14px; text-transform:uppercase; letter-spacing:0.06em; }
        .result-banner { background:#e8f5e9; border:2px solid #43a047; padding:12px 18px; border-radius:10px; text-align:center; font-weight:800; color:#1b5e20; font-size:15px; margin:16px 0; }
        .live-banner { background:#fff3e0; border:2px solid #f57c00; padding:12px 18px; border-radius:10px; text-align:center; font-weight:800; color:#e65100; font-size:13px; margin:16px 0; }
        .nrr-pos { color:#1b5e20; font-weight:700; }
        .nrr-neg { color:#c62828; font-weight:700; }
        .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; }
        .badge-live { background:#ff6d00; color:#fff; }
        .badge-done { background:#2e7d32; color:#fff; }
        .badge-sched { background:#0277bd; color:#fff; }
        .rank1 td:first-child { font-weight:900; color:#f9a825; }
        .rank2 td:first-child { font-weight:800; color:#9e9e9e; }
        .rank3 td:first-child { font-weight:800; color:#bf360c; }
        .inn-header { background:#1a237e; color:#fff; padding:12px 15px; display:flex; justify-content:space-between; align-items:center; border-radius:8px 8px 0 0; }
        .inn-team { font-size:16px; font-weight:900; }
        .inn-score { font-size:20px; font-weight:900; }
        .inn-ov { font-size:12px; font-weight:400; opacity:0.8; margin-left:6px; }
    `;

    // ── Header ─────────────────────────────────────────────────────────────────
    let html = `<!DOCTYPE html><html><head><style>${style}</style></head><body>
    <div style="background:linear-gradient(135deg,#1a237e,#283593); color:#fff; padding:36px 40px; border-radius:0 0 16px 16px; margin-bottom:30px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div>
                <div style="font-size:13px; font-weight:700; letter-spacing:4px; opacity:0.7; margin-bottom:6px;">TOURNAMENT SUMMARY REPORT</div>
                <div style="font-size:34px; font-weight:950; letter-spacing:-1px; line-height:1.1;">${t.name}</div>
                <div style="margin-top:8px; font-size:14px; opacity:0.75;">
                    ${capitalize(t.format)} &nbsp;·&nbsp; ${t.overs || '—'} Overs &nbsp;·&nbsp; ${t.teams.length} Teams
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:40px; font-weight:900; color:#ffc107;">${completedMatches.length}</div>
                <div style="font-size:12px; opacity:0.7; font-weight:700;">MATCHES PLAYED</div>
                ${liveMatches.length ? `<div style="margin-top:6px; font-size:12px; background:#ff6d00; padding:3px 10px; border-radius:20px; font-weight:700; display:inline-block;">${liveMatches.length} LIVE</div>` : ''}
            </div>
        </div>
        <div style="margin-top:20px; display:flex; gap:30px; flex-wrap:wrap;">
            <div><span style="opacity:0.6; font-size:12px;">GENERATED</span><br><b>${generatedAt}</b></div>
            <div><span style="opacity:0.6; font-size:12px;">TEAMS</span><br><b>${t.teams.join(', ')}</b></div>
            <div><span style="opacity:0.6; font-size:12px;">TOTAL MATCHES</span><br><b>${allTournMatches.length}</b></div>
        </div>
    </div>`;

    // ── Points Table ────────────────────────────────────────────────────────────
    if (t.format !== 'knockout') {
        html += `<div style="padding:0 40px;">
        <div class="section-title">📊 Points Table &amp; NRR</div>
        <table>
            <thead><tr>
                <th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th>
                <th>Runs For</th><th>Ov Faced</th><th>Runs Ag.</th><th>Ov Bowled</th><th>NRR</th>
            </tr></thead>
            <tbody>`;
        sortedStandings.forEach((s, i) => {
            const nrr = (s.nrr || 0).toFixed(3);
            const nrrClass = (s.nrr || 0) >= 0 ? 'nrr-pos' : 'nrr-neg';
            const rowClass = i === 0 ? 'rank1' : i === 1 ? 'rank2' : i === 2 ? 'rank3' : '';
            html += `<tr class="${rowClass}">
                <td>${i+1}</td><td><b>${s.name}</b></td>
                <td>${s.played||0}</td><td>${s.won||0}</td><td>${s.lost||0}</td><td>${s.tied||0}</td>
                <td align="center"><b>${s.points||0}</b></td>
                <td>${s.runsScored||0}</td><td>${formatOvers(s.ballsFaced||0)}</td>
                <td>${s.runsConceded||0}</td><td>${formatOvers(s.ballsBowled||0)}</td>
                <td class="${nrrClass}">${nrrClass === 'nrr-pos' ? '+' : ''}${nrr}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // ── Batting Stats ───────────────────────────────────────────────────────────
    if (batsmen.length) {
        html += `<div style="padding:0 40px;">
        <div class="section-title">🏏 Tournament Batting Rankings</div>
        <table>
            <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Runs</th><th>Balls</th><th>SR</th><th>4s</th><th>6s</th></tr></thead>
            <tbody>`;
        batsmen.slice(0, 10).forEach((b, i) => {
            const rowClass = i === 0 ? 'rank1' : i === 1 ? 'rank2' : i === 2 ? 'rank3' : '';
            html += `<tr class="${rowClass}">
                <td>${i+1}</td><td><b>${b.name}</b></td><td>${b.team}</td>
                <td><b>${b.runs}</b></td><td>${b.balls}</td><td>${b.sr}</td>
                <td>${b.fours||0}</td><td>${b.sixes||0}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // ── Bowling Stats ───────────────────────────────────────────────────────────
    if (bowlers.length) {
        html += `<div style="padding:0 40px;">
        <div class="section-title">🎳 Tournament Bowling Rankings</div>
        <table>
            <thead><tr><th>#</th><th>Player</th><th>Team</th><th>Wkts</th><th>Runs</th><th>Overs</th><th>Econ</th></tr></thead>
            <tbody>`;
        bowlers.slice(0, 10).forEach((b, i) => {
            const rowClass = i === 0 ? 'rank1' : i === 1 ? 'rank2' : i === 2 ? 'rank3' : '';
            html += `<tr class="${rowClass}">
                <td>${i+1}</td><td><b>${b.name}</b></td><td>${b.team}</td>
                <td><b>${b.wickets}</b></td><td>${b.runs}</td><td>${b.overs}</td><td>${b.econ}</td>
            </tr>`;
        });
        html += `</tbody></table></div>`;
    }

    // ── Match Scorecards ────────────────────────────────────────────────────────
    const scorecardMatches = [...completedMatches, ...liveMatches];
    if (scorecardMatches.length) {
        html += `<div class="page-break" style="padding:0 40px;">
        <div class="section-title">📋 Match Scorecards</div>`;

        scorecardMatches.forEach(m => {
            const inn0 = m.innings && m.innings[0];
            const inn1 = m.innings && m.innings[1];
            const isLive = m.status === 'live' || m.status === 'paused';

            html += `<div style="margin-bottom:36px; border:1px solid #e0e0e0; border-radius:10px; overflow:hidden;">
                <div style="background:#1a237e; color:#fff; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <span style="font-size:18px; font-weight:900;">${m.team1} vs ${m.team2}</span>
                        <span style="font-size:12px; opacity:0.7; margin-left:10px;">${m.overs} ov · ${m.venue || 'Neutral'}</span>
                    </div>
                    <span style="font-size:11px; background:${isLive ? '#ff6d00' : '#2e7d32'}; padding:4px 10px; border-radius:20px; font-weight:700;">
                        ${isLive ? (m.status === 'paused' ? 'PAUSED' : 'LIVE') : 'COMPLETED'}
                    </span>
                </div>`;

            if (m.result) {
                html += `<div class="${isLive ? 'live-banner' : 'result-banner'}">${isLive ? '⏸ ' : '🏆 '}${m.result}</div>`;
            }

            const renderInningsPDF = (inn, teamName) => {
                if (!inn) return '';
                const hasBat = inn.batsmen && inn.batsmen.length > 0;
                const hasBowl = inn.bowlers && inn.bowlers.length > 0;

                let s = `<div style="padding:16px 18px;">
                    <div style="font-size:14px; font-weight:900; color:#1a237e; margin-bottom:10px;">
                        ${teamName.toUpperCase()} — ${inn.runs||0}/${inn.wickets||0} (${formatOvers(inn.balls||0, m.ballsPerOver)} ov)
                    </div>`;

                if (hasBat) {
                    s += `<table style="margin-bottom:10px;">
                        <thead><tr><th>Batsman</th><th>Dismissal</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead>
                        <tbody>`;
                    inn.batsmen.forEach(b => {
                        s += `<tr>
                            <td><b>${b.name}</b></td>
                            <td style="font-size:11px; color:#555;">${b.dismissal || (b.notOut ? 'not out' : 'dnb')}</td>
                            <td><b>${b.runs||0}</b></td><td>${b.balls||0}</td>
                            <td>${b.fours||0}</td><td>${b.sixes||0}</td>
                            <td>${formatSR(b.runs||0, b.balls||0)}</td>
                        </tr>`;
                    });
                    // Extras
                    const ex = inn.extras || {};
                    const exTotal = (ex.wides||0)+(ex.noBalls||0)+(ex.byes||0)+(ex.legByes||0);
                    s += `<tr style="background:#f5f5f5;">
                        <td colspan="2" style="color:#555;"><i>Extras (${exTotal}): Wd:${ex.wides||0} Nb:${ex.noBalls||0} By:${ex.byes||0} Lb:${ex.legByes||0}</i></td>
                        <td colspan="5"></td>
                    </tr></tbody></table>`;
                } else {
                    s += `<p style="color:#888; font-style:italic; font-size:12px;">Batting details not recorded.</p>`;
                }

                if (hasBowl) {
                    s += `<table><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>`;
                    inn.bowlers.forEach(b => {
                        s += `<tr>
                            <td><b>${b.name}</b></td>
                            <td>${formatOvers(b.balls||0, m.ballsPerOver)}</td>
                            <td>${b.maidens||0}</td>
                            <td>${b.runs||0}</td>
                            <td><b style="color:#c62828;">${b.wickets||0}</b></td>
                            <td>${formatEcon(b.runs||0, b.balls||0, m.ballsPerOver)}</td>
                        </tr>`;
                    });
                    s += `</tbody></table>`;
                }

                // Fall of Wickets
                if (inn.fallOfWickets && inn.fallOfWickets.length) {
                    s += `<div style="font-size:11px; color:#666; margin-top:6px;"><b>FOW:</b> ${
                        inn.fallOfWickets.map((fw,j) => `${j+1}-${fw.runs} (${fw.batsmanName}, ${formatOvers(fw.balls, m.ballsPerOver)} ov)`).join(', ')
                    }</div>`;
                }

                s += `</div>`;
                return s;
            };

            if (inn0) html += renderInningsPDF(inn0, m.battingFirst || m.team1);
            if (inn1) html += `<div style="border-top:2px dashed #e8eaf6;"></div>` + renderInningsPDF(inn1, m.fieldingFirst || m.team2);
            html += `</div>`;
        });
        html += `</div>`;
    }

    // ── Fixtures Summary ────────────────────────────────────────────────────────
    html += `<div style="padding:0 40px;">
    <div class="section-title">📅 Fixtures &amp; Results</div>
    <table>
        <thead><tr><th>#</th><th>Match</th><th>Status</th><th>Result</th></tr></thead>
        <tbody>`;
    allTournMatches.forEach((m, i) => {
        const st = m.status === 'completed' ? '<span class="badge badge-done">DONE</span>' 
                 : (m.status === 'live' ? '<span class="badge badge-live">LIVE</span>' 
                 : `<span class="badge badge-sched">${m.status.toUpperCase()}</span>`);
        const result = m.status === 'completed' ? (m.result || 'Completed') : 
                       (m.status === 'live' || m.status === 'paused') ? '(In progress)' : 'Scheduled';
        html += `<tr>
            <td>${i+1}</td>
            <td><b>${m.team1}</b> vs <b>${m.team2}</b></td>
            <td>${st}</td>
            <td style="font-size:12px; color:#444;">${result}</td>
        </tr>`;
    });
    html += `</tbody></table>
    <div style="margin-top:40px; padding-top:16px; border-top:2px solid #f0f0f0; text-align:center; font-size:11px; color:#aaa; letter-spacing:2px; font-weight:700;">
        GENERATED BY SLCRICKPRO PERFORMANCE MANAGEMENT SUITE · ${generatedAt}
    </div>
    </div></body></html>`;

    // ── Render & Export ─────────────────────────────────────────────────────────
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed; top:0; left:-9999px; width:960px; background:#fff; z-index:9999; opacity:1; pointer-events:none;';
    container.innerHTML = html;
    document.body.appendChild(container);

    const opt = {
        margin: [8, 0],
        filename: `SLCRICKPRO_${t.name.replace(/\s+/g,'_')}_Report.pdf`,
        image: { type: 'jpeg', quality: 0.97 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await new Promise(resolve => setTimeout(resolve, 800));
        await html2pdf().set(opt).from(container).save();
        showToast('🔥 Report Generated Successfully!', 'success');
    } catch (err) {
        console.error('PDF Error:', err);
        showToast('❌ Failed to generate PDF', 'error');
    } finally {
        container.remove();
    }
}

// ========== GLOBAL SYNC HANDLERS ==========

function renderOngoing() {
    if (currentTab === 'live') renderLive();
    if (currentTab === 'tournament') {
        if (selectedTournId) {
            renderTournDetails(selectedTournId);
        } else {
            renderTournamentSelector();
        }
    }
    if (currentTab === 'recent') renderRecent();
}

window.switchTab = switchTab;
window.renderTournDetails = renderTournDetails;
window.refreshAll = refreshAll;
window.renderOngoing = renderOngoing;

// Handle cross-tab updates (e.g. from score-match.html)
window.addEventListener('storage', (e) => {
    if (e.key === 'cricpro_force_update') {
        renderOngoing();
    }
});
