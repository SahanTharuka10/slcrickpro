// Ongoing Matches JS
let currentTab = 'live';
let selectedTournId = null;
let selectedTournSubTab = 'standings';
let tournamentPageView = 'matches';
let refreshInterval;

window.renderOngoing = function() {
    try {
        console.log("🔄 Ongoing UI refreshing from Global Sync...");
        const target = document.getElementById('panel-live');
        if (!target && currentTab === 'live') {
            console.warn("⚠️ Live panel container not found in DOM.");
        }

        if (currentTab === 'live') renderLive();
        if (currentTab === 'tournament') {
            renderTournamentSelector();
            if (selectedTournId) renderTournDetails(selectedTournId);
        }
        if (currentTab === 'recent') renderRecent();
    } catch (e) {
        console.error("❌ UI Render Failure:", e);
    }
};

// Global sync connection
window.renderAll = window.renderOngoing;

// Export globally for sync updates
window.renderLive = renderLive;

const optimizeMobileLabels = () => {
    const tabLive = document.getElementById('tab-live');
    const tabTourn = document.getElementById('tab-tournament');
    const tabRecent = document.getElementById('tab-recent');
    
    if (window.innerWidth < 500) {
        if (tabLive) tabLive.innerHTML = 'Live';
        if (tabTourn) tabTourn.innerHTML = 'Tourn';
        if (tabRecent) tabRecent.innerHTML = 'Recent';
    } else {
        if (tabLive) tabLive.innerHTML = 'Live Matches';
        if (tabTourn) tabTourn.innerHTML = 'Tournament';
        if (tabRecent) tabRecent.innerHTML = 'Completed';
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    optimizeMobileLabels();
    window.addEventListener('resize', optimizeMobileLabels);

    // Stage 1: Render Local Cache Immediately (Fast Load)
    renderOngoing(); 
    
    // Stage 2: Synchronize with Cloud (Background)
    if (typeof syncCloudData === 'function') {
        await syncCloudData({ silent: true }); 
    }
    
    // Stage 3: Render Final Results after sync
    renderOngoing();
});

function startAutoRefresh() {
  // Manual polling removed. syncCloudData now handles live refreshes.
}

function refreshAll() {
    // Force a full cloud synchronization instead of just a UI refresh
    if (typeof pullGlobalData === 'function') {
        const btn = document.querySelector('.header-right-group .btn');
        if (btn) btn.innerHTML = '🔄 Syncing...';
        
        pullGlobalData(true).then(() => {
            if (btn) btn.innerHTML = '🔄 Refresh';
            renderOngoing();
            showToast('✅ Cloud Sync Complete!');
        }).catch(err => {
            if (btn) btn.innerHTML = '🔄 Refresh';
            console.error("Sync Error:", err);
            showToast('❌ Sync failed. Check connection.', 'error');
        });
    } else {
        renderOngoing();
        showToast('🔄 UI Refreshed');
    }
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
  if (tab === 'tournament') {
    renderTournamentSelector();
    if (selectedTournId) renderTournDetails(selectedTournId);
  }
  if (tab === 'recent') renderRecent();
}

// ========== LIVE MATCHES ==========
function renderLive() {
  const grid = document.getElementById('live-matches-grid');
  if (!grid) return;

  const matches = DB.getMatches().filter(m => {
    const isPublic = m.publishLive !== false; 
    if (!isPublic) return false;
    // Show live, paused, AND scheduled matches in this view if they are "active"
    return (m.status === 'live' || m.status === 'paused' || m.status === 'scheduled');
  });

  const uniqueMatches = Array.from(new Map(matches.map(m => [m.id, m])).values());

  if (!uniqueMatches.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🏏</div>
      <div class="empty-state-title">No Live Matches Currently</div>
      <div class="empty-state-sub">Currently playing or paused matches will appear here</div>
    </div>`;
    return;
  }

  grid.innerHTML = uniqueMatches.map(m => buildMatchCard(m, true)).join('');
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
    if (tabBtn) {
        tabBtn.click();
    }
    
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
    // Show all tournaments that are active or scheduled
    // Show all available tournaments (sync already handles deleted items)
    const tournaments = DB.getTournaments();

    if (!tournaments.length) {
        selector.innerHTML = `<div class="empty-state" style="padding:40px; border:1px dashed rgba(255,255,255,0.1); border-radius:16px; margin:20px 0;">
            <div style="font-size:40px; margin-bottom:15px">🏆</div>
            <div style="font-weight:700; color:#fff">No Active Tournaments</div>
            <div style="font-size:13px; opacity:0.6; margin-top:8px">Matches and standings will appear here once a tournament is created or synced.</div>
        </div>`;
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
                    <a href="score-match.html?tournamentId=${t.id}&hotkey=true" target="_blank" class="badge badge-red" style="text-decoration:none; padding:10px 14px; font-size:12px; font-weight:800; border-radius:8px; background:#e61b4d; color:#fff">Broadcast Station</a>
                    <a href="overlay.html?tournament=${t.id}" target="_blank" class="badge badge-green" style="text-decoration:none; padding:10px 14px; font-size:12px; font-weight:800; border-radius:8px">TV Display</a>
                </div>
            </div>
        </div>
        <div class="tourn-sub-tabs">
            ${isKO ? `<button class="tourn-sub-tab active" id="subtab-bracket" onclick="switchTournSubTab('bracket')">🌳 ${window.innerWidth < 480 ? 'Brkt' : 'Bracket'}</button>` : `<button class="tourn-sub-tab active" id="subtab-standings" onclick="switchTournSubTab('standings')">📊 ${window.innerWidth < 480 ? 'Table' : 'Standings'}</button>`}
            <button class="tourn-sub-tab" onclick="switchTournSubTab('batting')">🏏 ${window.innerWidth < 480 ? 'Bat' : 'Batsmen'}</button>
            <button class="tourn-sub-tab" onclick="switchTournSubTab('bowling')">🎳 ${window.innerWidth < 480 ? 'Bowl' : 'Bowlers'}</button>
            ${!isKO ? `<button class="tourn-sub-tab" onclick="switchTournSubTab('nrr')">📈 NRR</button>` : ''}
            <button class="tourn-sub-tab" onclick="switchTournSubTab('fixtures')">📅 ${window.innerWidth < 480 ? 'Fix' : 'Fixtures'}</button>
        </div>
        <div id="tourn-sub-content"></div>
    `;
    
    // Auto-select tab (preserve if already on tournament view)
    let defaultTab = 'fixtures'; // Default to Fixtures/Matches to show scheduled matches immediately
    if (isKO) defaultTab = 'bracket';
    
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
        const bpo = t.ballsPerOver || 6;
        return `<div class="card"><table class="data-table">
            <thead><tr><th>#</th><th>Team</th><th>Runs For</th><th>Overs F.</th><th>Runs Ag.</th><th>Overs B.</th><th>NRR</th></tr></thead>
            <tbody>${sortedTeams.map((ts, i) => `<tr>
                <td>${i+1}</td><td class="standings-team">${ts.name}</td>
                <td>${ts.runsScored || 0}</td><td>${formatOvers(ts.ballsFaced || 0, bpo)}</td>
                <td>${ts.runsConceded || 0}</td><td>${formatOvers(ts.ballsBowled || 0, bpo)}</td>
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
    
    // Create persistent broadcast station entry at the top of the schedule
    const broadcastHtml = `
        <div class="tournament-header-card" style="margin-bottom:20px; background:linear-gradient(135deg, rgba(230,27,77,0.1), rgba(0,0,0,0.4)); border:1px solid rgba(230,27,77,0.3)">
            <div>
                <div class="tourn-name" style="color:#ff3366; font-size:18px"><i style="font-style:normal">📡</i> Tournament Broadcast Master</div>
                <div class="tourn-format" style="opacity:0.8">One persistent control panel for all matches in this tournament. No need to open new links for each match.</div>
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap">
                <a href="score-match.html?tournamentId=${t.id}&hotkey=true" target="_blank" class="btn btn-red btn-sm" style="background:#e61b4d; color:#fff; text-decoration:none; padding:8px 16px; border-radius:8px; font-weight:800; white-space:nowrap; box-shadow: 0 4px 12px rgba(230,27,77,0.3)">
                    ⌨️ Open Hotkey Mode
                </a>
                <a href="overlay.html?tournament=${t.id}" target="_blank" class="btn btn-green btn-sm" style="text-decoration:none; padding:8px 16px; border-radius:8px; font-weight:800; white-space:nowrap; color:#000">
                    📺 TV Display
                </a>
            </div>
        </div>
    `;

    container.innerHTML = broadcastHtml + `<div style="display:flex; flex-direction:column; gap:12px">` + 
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
    return Object.values(stats).map(s => ({ ...s, econ: formatEcon(s.runs, s.balls, DB.getTournament(tournId)?.ballsPerOver || 6), overs: formatOvers(s.balls, DB.getTournament(tournId)?.ballsPerOver || 6) }))
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
    
    showToast('⏳ Generating Professional Match Report...', 'default');
    
    const container = document.createElement('div');
    // Using position absolute with 0 opacity instead of huge negative left to ensure better rendering on some browsers
    container.style = `position:absolute; top:0; left:0; width:1000px; padding:60px 40px; background:#fff; color:#111; font-family:'Outfit',sans-serif; z-index:-1; opacity:0; pointer-events:none;`;
    
    const inn0 = m.innings ? m.innings[0] : null;
    const inn1 = m.innings ? m.innings[1] : null;

    const renderInningsTablePDF = (inn, teamName, innLabel) => {
        if (!inn) return `<div style="margin-bottom:30px; padding:20px; border:1px dashed #ddd; text-align:center; color:#999; border-radius:12px">No data for ${innLabel}</div>`;
        
        const hasBatsmen = inn.batsmen && inn.batsmen.length > 0;
        const runs = inn.runs || 0;
        const wkts = inn.wickets || 0;
        const balls = inn.balls || 0;

        let contentHtml = '';
        if (!hasBatsmen) {
            contentHtml = `<div style="padding:40px; text-align:center; color:#999; font-style:italic; font-size:14px">Detailed player statistics not yet available for this innings.</div>`;
        } else {
            const extras = inn.extras || { total: 0, wd: 0, nb: 0, b: 0, lb: 0 };
            contentHtml = `
                    <div style="padding:25px">
                        <div style="font-size:11px; font-weight:800; color:#1a237e; margin-bottom:15px; letter-spacing:2px; border-bottom:2px solid #f0f0f0; padding-bottom:8px">BATTING SCORECARD</div>
                        <table style="width:100%; border-collapse:collapse; margin-bottom:25px; font-size:13px">
                            <thead>
                                <tr style="text-align:left; color:#1a237e; font-size:10px; border-bottom:1px solid #eee">
                                    <th style="padding:10px 5px">BATSMAN</th>
                                    <th style="padding:10px 5px; text-align:center">R</th>
                                    <th style="padding:10px 5px; text-align:center">B</th>
                                    <th style="padding:10px 5px; text-align:center">4s</th>
                                    <th style="padding:10px 5px; text-align:center">6s</th>
                                    <th style="padding:10px 5px; text-align:right">SR</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${inn.batsmen.map(b => `
                                <tr style="border-bottom:1px solid #f5f5f5">
                                    <td style="padding:12px 5px; color:#333">
                                        <div style="font-weight:700; font-size:14px">${b.name || 'Unknown'}</div>
                                        <div style="font-size:10px; color:#c62828; font-weight:600; text-transform:uppercase">${b.dismissal || (b.notOut ? 'not out' : 'did not bat')}</div>
                                    </td>
                                    <td style="padding:12px 5px; font-weight:900; color:#1a237e; text-align:center; font-size:15px">${b.runs || 0}</td>
                                    <td style="padding:12px 5px; text-align:center; color:#666">${b.balls || 0}</td>
                                    <td style="padding:12px 5px; text-align:center; color:#666">${b.fours || 0}</td>
                                    <td style="padding:12px 5px; text-align:center; color:#666">${b.sixes || 0}</td>
                                    <td style="padding:12px 5px; text-align:right; color:#888; font-family:'JetBrains Mono', monospace; font-weight:700">${formatSR(b.runs || 0, b.balls || 0)}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                        
                        <div style="padding:12px 20px; background:#f8f9fa; border-radius:10px; font-size:12px; margin-bottom:30px; border-left:5px solid #1a237e; color:#444">
                            <span style="font-weight:800; color:#1a237e">EXTRAS: ${extras.total || 0}</span> 
                            <span style="margin-left:15px; opacity:0.7">(Wides: ${extras.wd || 0}, No Balls: ${extras.nb || 0}, Byes: ${extras.b || 0}, Leg Byes: ${extras.lb || 0})</span>
                        </div>

                        <div style="font-size:11px; font-weight:800; color:#c62828; margin-bottom:15px; letter-spacing:2px; border-bottom:2px solid #f0f0f0; padding-bottom:8px">BOWLING ANALYSIS</div>
                        <table style="width:100%; border-collapse:collapse; font-size:13px">
                            <thead>
                                <tr style="text-align:left; color:#c62828; font-size:10px; border-bottom:1px solid #eee">
                                    <th style="padding:10px 5px">BOWLER</th>
                                    <th style="padding:10px 5px; text-align:center">O</th>
                                    <th style="padding:10px 5px; text-align:center">M</th>
                                    <th style="padding:10px 5px; text-align:center">R</th>
                                    <th style="padding:10px 5px; text-align:center">W</th>
                                    <th style="padding:10px 5px; text-align:right">ECON</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(inn.bowlers || []).map(b => `
                                <tr style="border-bottom:1px solid #f5f5f5">
                                    <td style="padding:12px 5px; font-weight:700; color:#333; font-size:14px">${b.name || 'Unknown'}</td>
                                    <td style="padding:12px 5px; text-align:center; color:#666">${formatOvers(b.balls || 0, m.ballsPerOver)}</td>
                                    <td style="padding:12px 5px; text-align:center; color:#666">${b.maidens || 0}</td>
                                    <td style="padding:12px 5px; text-align:center; color:#666">${b.runs || 0}</td>
                                    <td style="padding:12px 5px; font-weight:900; color:#c62828; text-align:center; font-size:15px">${b.wickets || 0}</td>
                                    <td style="padding:12px 5px; text-align:right; color:#888; font-family:'JetBrains Mono', monospace; font-weight:700">${formatEcon(b.runs || 0, b.balls || 0, m.ballsPerOver)}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`;
        }

        return `
            <div style="margin-bottom:45px; border:1px solid #e0e0e0; border-radius:20px; overflow:hidden; box-shadow:0 12px 40px rgba(0,0,0,0.06); background:#fff">
                <div style="background:linear-gradient(90deg, #1a237e, #311b92); padding:22px 30px; display:flex; justify-content:space-between; align-items:center; color:#fff">
                    <div>
                        <div style="font-size:11px; font-weight:800; opacity:0.8; letter-spacing:2px; margin-bottom:4px; text-transform:uppercase">${innLabel}</div>
                        <div style="font-size:24px; font-weight:950; letter-spacing:-0.5px">${teamName.toUpperCase()}</div>
                    </div>
                    <div style="text-align:right">
                        <div style="font-size:32px; font-weight:950; color:#ffc107; line-height:1">${runs}/${wkts}</div>
                        <div style="font-size:13px; font-weight:700; opacity:0.9; margin-top:5px">${formatOvers(balls, m.ballsPerOver)} Overs <span style="margin:0 8px; opacity:0.3">|</span> ${formatCRR(runs, balls)} CRR</div>
                    </div>
                </div>
                ${contentHtml}
            </div>`;
    };

    let inningsHtml = renderInningsTablePDF(inn0, m.battingFirst || m.team1 || 'Team 1', '1st Innings');
    if (m.matchFormat === 'test') {
        const inn1t = m.innings[1];
        const inn2 = m.innings[2];
        const inn3 = m.innings[3];
        inningsHtml += renderInningsTablePDF(inn1t, m.fieldingFirst || m.team2 || 'Team 2', '2nd Innings');
        if (inn2) inningsHtml += renderInningsTablePDF(inn2, m.battingFirst || m.team1, '3rd Innings');
        if (inn3) inningsHtml += renderInningsTablePDF(inn3, m.fieldingFirst || m.team2, '4th Innings');
    } else if (inn1) {
        inningsHtml += renderInningsTablePDF(inn1, m.fieldingFirst || m.team2 || 'Team 2', '2nd Innings');
    }

    container.innerHTML = `
        <div style="background:linear-gradient(135deg, #0a0e27 0%, #1a237e 100%); color:#fff; padding:60px 50px; text-align:center; border-radius:20px 20px 0 0; position:relative; overflow:hidden">
            <div style="position:absolute; top:-60px; right:-60px; width:220px; height:220px; background:radial-gradient(circle, rgba(255,193,7,0.15) 0%, transparent 70%); border-radius:50%"></div>
            <div style="font-size:52px; font-weight:950; letter-spacing:-2px; margin-bottom:5px; line-height:1">SLCRICK<span style="color:#ffc107">PRO</span></div>
            <div style="font-size:13px; letter-spacing:6px; font-weight:800; opacity:0.7; text-transform:uppercase; margin-top:10px">Premier Cricket Management Suite</div>
            
            <div style="margin-top:40px; display:flex; justify-content:center; gap:40px">
                <div style="text-align:left">
                    <div style="font-size:10px; opacity:0.5; font-weight:900; letter-spacing:1px">MATCH VENUE</div>
                    <div style="font-size:16px; font-weight:700; color:#fff">${m.venue || 'NOT SPECIFIED'}</div>
                </div>
                <div style="width:1px; background:rgba(255,255,255,0.15)"></div>
                <div style="text-align:left">
                    <div style="font-size:10px; opacity:0.5; font-weight:900; letter-spacing:1px">MATCH DATE</div>
                    <div style="font-size:16px; font-weight:700; color:#fff">${new Date(m.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
                </div>
                <div style="width:1px; background:rgba(255,255,255,0.15)"></div>
                <div style="text-align:left">
                    <div style="font-size:10px; opacity:0.5; font-weight:900; letter-spacing:1px">COMPETITION NAME</div>
                    <div style="font-size:16px; font-weight:700; color:#ffc107">${(m.tournamentName || 'SINGLE MATCH').toUpperCase()}</div>
                </div>
            </div>
        </div>
        
        <div style="padding:50px; background:#fff; border:1px solid #e0e0e0; border-top:none; border-radius:0 0 20px 20px">
            <div style="background:linear-gradient(90deg, #f1f8e9, #e8f5e9); border:1px solid #c8e6c9; padding:25px; border-radius:15px; text-align:center; font-weight:950; color:#1b5e20; font-size:24px; margin-bottom:50px; box-shadow: 0 4px 15px rgba(0,0,0,0.03); text-transform:uppercase; letter-spacing:1px">
                🏆 ${m.status === 'live' ? 'Match Currently Live' : (m.status === 'paused' ? 'Match Paused' : (m.result || 'Match Completed'))}
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:50px; padding:0 20px">
                 <div style="text-align:center; flex:1">
                    <div style="font-size:36px; font-weight:950; color:#1a237e; line-height:1.1">${(m.team1 || 'Team A').toUpperCase()}</div>
                    <div style="font-size:11px; color:#aaa; font-weight:800; letter-spacing:2px; margin-top:8px">HOST TEAM</div>
                 </div>
                 <div style="font-size:24px; font-weight:900; color:#eee; padding:0 40px; font-style:italic">VS</div>
                 <div style="text-align:center; flex:1">
                    <div style="font-size:36px; font-weight:950; color:#1a237e; line-height:1.1">${(m.team2 || 'Team B').toUpperCase()}</div>
                    <div style="font-size:11px; color:#aaa; font-weight:800; letter-spacing:2px; margin-top:8px">VISITOR TEAM</div>
                 </div>
            </div>

            ${inningsHtml}

            <div style="margin-top:80px; padding-top:30px; border-top:1px solid #f0f0f0; display:flex; justify-content:space-between; align-items:center">
                <div style="font-size:11px; color:#ccc; font-weight:600">This report was automatically generated by SLCRICKPRO v4.0 Professional Analytics.</div>
                <div style="font-size:10px; color:#eee; font-family:monospace">${m.id}</div>
            </div>
        </div>
    `;

    document.body.appendChild(container);
    
    // Allow more time for local images and components to render
    await new Promise(r => setTimeout(r, 2000));

    const opt = {
        margin: [10, 10, 10, 10],
        filename: `SLCRICKPRO_Report_${(m.team1||'T1').replace(/\s+/g, '_')}_vs_${(m.team2||'T2').replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            letterRendering: true,
            allowTaint: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(container).save();
        showToast('✅ Full Detail Report Generated!', 'success');
    } catch (err) {
        console.error("PDF Production Error:", err);
        showToast('❌ Report Generation Failed', 'error');
    } finally {
        container.remove();
    }
}"PDF Export Fail", err);
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
        console.error("Stats Preview Generation Error:", err);
        showToast('❌ Failed to generate preview', 'error');
    } finally {
        if (card.parentElement) document.body.removeChild(card);
    }
}

async function generateTournamentPDF(tournId) {
    const t = DB.getTournament(tournId);
    if (!t) return showToast('Tournament not found', 'error');

    showToast('📊 Generating Season Analytics Review...', 'default');
    computeTournamentStandings(t);

    const sortedStandings = t.teams
        .map(name => ({ name, ...(t.standings[name] || {}) }))
        .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.nrr || 0) - (a.nrr || 0));

    const allMatches = (t.matches || []).map(mId => DB.getMatch(mId)).filter(m => m);
    const completed = allMatches.filter(m => m.status === 'completed');
    const batsmen = getBestBatsmen(t.id).slice(0, 10);
    const bowlers = getBestBowlers(t.id).slice(0, 10);
    const generatedAt = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

    const container = document.createElement('div');
    // Using absolute with 0 opacity for stability
    container.style = `position:absolute; top:0; left:0; width:1000px; background:#fff; color:#111; font-family:'Outfit',sans-serif; z-index:-1; opacity:0; pointer-events:none;`;

    let html = `
    <div style="padding:60px 50px; background:linear-gradient(135deg, #0a0e27 0%, #1a237e 100%); color:#fff; text-align:center; border-radius:0 0 30px 30px; position:relative; overflow:hidden">
        <div style="position:absolute; top:-40px; right:-40px; width:180px; height:180px; background:rgba(255,193,7,0.1); border-radius:50%"></div>
        <div style="font-size:56px; font-weight:950; letter-spacing:-3px; margin-bottom:5px; line-height:1">SLCRICK<span style="color:#ffc107">PRO</span></div>
        <div style="font-size:13px; letter-spacing:8px; font-weight:400; opacity:0.6; margin-bottom:40px; text-transform:uppercase">Season Performance Analytics</div>
        
        <div style="font-size:42px; font-weight:900; color:#ffc107; margin-bottom:10px; line-height:1.2">${(t.name || 'Tournament').toUpperCase()}</div>
        <div style="font-size:16px; opacity:0.8; font-weight:500; letter-spacing:1px">${capitalize(t.format || 'League')} Format · ${t.overs || 0} Overs · ${t.teams?.length || 0} Professional Teams</div>
        
        <div style="margin-top:60px; display:flex; justify-content:center; gap:80px">
            <div style="text-align:center"><div style="font-size:44px; font-weight:950">${completed.length}</div><div style="font-size:10px; opacity:0.5; font-weight:900; letter-spacing:2px">MATCHES FINISHED</div></div>
            <div style="width:1px; background:rgba(255,255,255,0.15)"></div>
            <div style="text-align:center"><div style="font-size:44px; font-weight:950">${allMatches.length}</div><div style="font-size:10px; opacity:0.5; font-weight:900; letter-spacing:2px">SCHEDULED TOTAL</div></div>
            <div style="width:1px; background:rgba(255,255,255,0.15)"></div>
            <div style="text-align:center"><div style="font-size:44px; font-weight:950">${t.teams?.length || 0}</div><div style="font-size:10px; opacity:0.5; font-weight:900; letter-spacing:2px">PARTICIPATING TEAMS</div></div>
        </div>
    </div>

    <div style="padding:60px 50px">
        <div style="font-size:22px; font-weight:900; color:#1a237e; border-left:6px solid #ffc107; padding-left:20px; margin-bottom:30px; letter-spacing:1px">OFFICIAL LEAGUE STANDINGS</div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:60px; font-size:15px; box-shadow:0 15px 45px rgba(0,0,0,0.03); border-radius:15px; overflow:hidden">
            <thead><tr style="background:#f1f3f8; text-align:left; color:#1a237e">
                <th style="padding:18px">POS</th><th style="padding:18px">TEAM ENTITY</th><th style="padding:18px; text-align:center">P</th><th style="padding:18px; text-align:center">W</th><th style="padding:18px; text-align:center">L</th><th style="padding:18px; text-align:center">PTS</th><th style="padding:18px; text-align:right">NRR</th>
            </tr></thead>
            <tbody>
                ${sortedStandings.map((s, i) => `
                <tr style="border-bottom:1px solid #f0f0f0; ${i < 4 ? 'background:rgba(255,193,7,0.03)' : ''}">
                    <td style="padding:18px; font-weight:900; color:${i < 3 ? '#ffc107' : '#aaa'}; font-size:16px">${i + 1}</td>
                    <td style="padding:18px; font-weight:800; color:#333">${s.name || 'Unknown Team'}</td>
                    <td style="padding:18px; text-align:center">${s.played || 0}</td>
                    <td style="padding:18px; font-weight:700; color:#2e7d32; text-align:center">${s.won || 0}</td>
                    <td style="padding:18px; text-align:center">${s.lost || 0}</td>
                    <td style="padding:18px; font-weight:950; color:#1a237e; text-align:center">${s.points || 0}</td>
                    <td style="padding:18px; font-weight:800; text-align:right; color:${(s.nrr || 0) >= 0 ? '#2e7d32' : '#c62828'}; font-family:monospace">${(s.nrr || 0).toFixed(3)}</td>
                </tr>`).join('')}
            </tbody>
        </table>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:45px; margin-bottom:65px">
            <div style="background:#fcfdff; border:1px solid #eef2f7; border-radius:20px; padding:30px">
                <div style="font-size:18px; font-weight:900; color:#1a237e; border-left:5px solid #ffc107; padding-left:15px; margin-bottom:20px; letter-spacing:1px">BATTING LEADERS</div>
                <table style="width:100%; border-collapse:collapse; font-size:13px">
                    <thead><tr style="background:#1a237e; color:#fff"><th style="padding:12px; border-radius:8px 0 0 8px">PLAYER</th><th style="padding:12px; text-align:center">RUNS</th><th style="padding:12px; text-align:right; border-radius:0 8px 8px 0">SR</th></tr></thead>
                    <tbody>
                    ${batsmen.length ? batsmen.map(b => `<tr style="border-bottom:1px solid #eef2f7"><td style="padding:12px; font-weight:700; color:#333">${b.name || 'Unknown'}</td><td style="padding:12px; font-weight:900; color:#1a237e; text-align:center">${b.runs || 0}</td><td style="padding:12px; color:#888; text-align:right; font-family:monospace">${b.sr || '0.0'}</td></tr>`).join('') : '<tr><td colspan="3" style="padding:20px; text-align:center; color:#999">No batting data available</td></tr>'}
                    </tbody>
                </table>
            </div>
            <div style="background:#fffcfc; border:1px solid #f7eeee; border-radius:20px; padding:30px">
                <div style="font-size:18px; font-weight:900; color:#c62828; border-left:5px solid #ffc107; padding-left:15px; margin-bottom:20px; letter-spacing:1px">BOWLING LEADERS</div>
                <table style="width:100%; border-collapse:collapse; font-size:13px">
                    <thead><tr style="background:#c62828; color:#fff"><th style="padding:12px; border-radius:8px 0 0 8px">PLAYER</th><th style="padding:12px; text-align:center">WKTS</th><th style="padding:12px; text-align:right; border-radius:0 8px 8px 0">ECON</th></tr></thead>
                    <tbody>
                    ${bowlers.length ? bowlers.map(b => `<tr style="border-bottom:1px solid #f7eeee"><td style="padding:12px; font-weight:700; color:#333">${b.name || 'Unknown'}</td><td style="padding:12px; font-weight:900; color:#c62828; text-align:center">${b.wickets || 0}</td><td style="padding:12px; color:#888; text-align:right; font-family:monospace">${b.econ || '0.0'}</td></tr>`).join('') : '<tr><td colspan="3" style="padding:20px; text-align:center; color:#999">No bowling data available</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>

        <div style="font-size:18px; font-weight:900; color:#1a237e; border-left:5px solid #ffc107; padding-left:15px; margin-bottom:25px; letter-spacing:1px">FULL TOURNAMENT MATCH LOG</div>
        <table style="width:100%; border-collapse:collapse; font-size:14px; background:#fff; border-radius:15px; overflow:hidden; border:1px solid #f0f0f0">
            <thead><tr style="background:#f8f9fa; text-align:left; color:#1a237e"><th style="padding:18px">MATCH FIXTURE</th><th style="padding:18px; text-align:right">OFFICIAL STATUS / RESULT</th></tr></thead>
            <tbody>
            ${allMatches.map((m, i) => `
                <tr style="border-bottom:1px solid #f5f5f5">
                    <td style="padding:18px">
                        <div style="font-weight:800; color:#333; font-size:16px">${m.team1 || 'TBD'} <span style="color:#ccc; font-weight:300; margin:0 5px">vs</span> ${m.team2 || 'TBD'}</div>
                        <div style="font-size:11px; color:#999; margin-top:4px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px">${m.scheduledName || (m.knockout ? 'Knockout Stage' : 'Group Stage')}</div>
                    </td>
                    <td style="padding:18px; text-align:right">
                         <div style="font-weight:900; font-size:15px; color:${m.status === 'completed' ? '#1b5e20' : (m.status === 'live' ? '#d32f2f' : '#666')}">${m.status === 'completed' ? (m.result || 'Match Finalized') : (m.status === 'live' ? '⚡ LIVE NOW' : '🗓 Scheduled')}</div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table>

        <div style="margin-top:100px; text-align:center; padding-top:30px; border-top:1px solid #eee">
            <div style="font-size:13px; font-weight:900; color:#ccc; letter-spacing:4px; text-transform:uppercase">SLCRICKPRO Season Management v4.0</div>
            <div style="font-size:11px; color:#ddd; margin-top:8px; font-weight:600">Confidential Report Generated on ${generatedAt}</div>
        </div>
    </div>
    `;

    container.innerHTML = html;
    document.body.appendChild(container);

    const opt = {
        margin: [10, 0, 10, 0],
        filename: `SLCRICKPRO_Season_${(t.name || 'Tournament').replace(/\s+/g,'_')}.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            letterRendering: true,
            allowTaint: false 
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await new Promise(r => setTimeout(r, 2500));
        await html2pdf().set(opt).from(container).save();
        showToast('📈 Season Analytics Exported!', 'success');
    } catch (err) {
        console.error('Tournament PDF Export Error:', err);
        showToast('❌ PDF Export Failed', 'error');
    } finally {
        container.remove();
    }
}
        console.error('PDF Error:', err);
        showToast('❌ Report Generation Failed', 'error');
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
