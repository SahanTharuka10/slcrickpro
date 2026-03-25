// Ongoing Matches JS
let currentTab = 'live';
let selectedTournId = null;
let selectedTournSubTab = 'standings';
let refreshInterval;

document.addEventListener('DOMContentLoaded', () => {
  renderLive();
  startAutoRefresh();
  
  // Visibility API to stop polling when tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearInterval(refreshInterval);
    } else {
      startAutoRefresh();
    }
  });
});

function startAutoRefresh() {
  clearInterval(refreshInterval);
  
  // Dynamic interval: 10s on mobile, 5s on desktop
  const isMobile = window.innerWidth < 768;
  const interval = isMobile ? 10000 : 5000;

  refreshInterval = setInterval(() => {
    if (currentTab === 'live') renderLive();
    if (currentTab === 'tournament' && selectedTournId) renderTournDetails(selectedTournId);
  }, interval);
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
  const matches = DB.getMatches().filter(m => (m.status === 'live' || m.status === 'paused') && m.publishLive);

  if (!matches.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🏏</div>
      <div class="empty-state-title">No Live Matches</div>
      <div class="empty-state-sub">Start a match and publish it live to see it here</div>
    </div>`;
    return;
  }

  grid.innerHTML = matches.map(m => buildMatchCard(m, true)).join('');
}

function buildMatchCard(m, isLive) {
  const inn0 = m.innings ? m.innings[0] : null;
  const inn1 = m.innings ? m.innings[1] : null;
  const curInn = m.innings ? m.innings[m.currentInnings] : null;
  const statusColor = m.status === 'live' ? '#00e676' : '#ffc107';
  const statusLabel = m.status === 'live' ? '🔴 LIVE' : (m.status === 'paused' ? '⏸ Paused' : '✅ Done');

  const score0 = inn0 ? `${inn0.runs}/${inn0.wickets}` : '-';
  const ov0 = inn0 ? `(${formatOvers(inn0.balls, m.ballsPerOver)} ov)` : '';
  const score1 = inn1 ? `${inn1.runs}/${inn1.wickets}` : m.status !== 'completed' && m.currentInnings === 1 ? 'Yet to bat' : '-';
  const ov1 = inn1 ? `(${formatOvers(inn1.balls, m.ballsPerOver)} ov)` : '';

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

  return `<div class="match-card ${isLive ? 'live-card' : ''}" onclick="openMatchDetail('${m.id}')">
    <div class="match-card-header">
      <span class="match-type-badge badge badge-${m.type === 'tournament' ? 'amber' : 'blue'}">${typeLabel}</span>
      <span style="font-size:12px;font-weight:700;color:${statusColor}">${statusLabel}</span>
    </div>
    <div class="match-teams">
      <div class="match-vs-row">
        <span class="match-team-name">${m.team1}</span>
        <span class="match-vs-sep">vs</span>
        <span class="match-team-name">${m.team2}</span>
      </div>
      <div class="match-score-row" style="margin-top:14px">
        <div class="match-team-score">
          <div class="match-score-val">${score0}</div>
          <div class="match-score-overs">${ov0}</div>
        </div>
        <div class="match-team-score">
          <div class="match-score-val" style="color:${m.currentInnings === 1 ? '#fff' : 'rgba(255,255,255,0.4)'}">${score1}</div>
          <div class="match-score-overs">${ov1}</div>
        </div>
      </div>
    </div>
    <div class="match-meta">
      <span class="match-crr">CRR: ${crr}</span>
      <span class="match-target-info" style="color:#ffc107">${targetInfo}</span>
      <span class="match-crr">${m.overs} ov · ${subText}</span>
    </div>
  </div>`;
}

// ========== TOURNAMENT ==========
function renderTournamentSelector() {
    const selector = document.getElementById('tournament-selector');
    if (!selector) return;
    const tournaments = DB.getTournaments().filter(t => t.status === 'active');

    if (!tournaments.length) {
        selector.innerHTML = `<p style="color:var(--c-muted); padding:20px;">No active tournaments</p>`;
        const details = document.getElementById('tournament-details');
        if (details) details.innerHTML = '';
        return;
    }

    selector.innerHTML = tournaments.map(t => {
        const activeClass = selectedTournId === t.id ? 'active' : '';
        return `<button class="tourn-select-btn ${activeClass}" onclick="selectTournament('${t.id}')">🏆 ${t.name}</button>`;
    }).join('');

    if (!selectedTournId && tournaments.length) {
        selectTournament(tournaments[0].id);
    }
}

function selectTournament(id) {
    selectedTournId = id;
    renderTournamentSelector();
    renderTournDetails(id);
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
    } else if (tab === 'fixtures') {
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
                <div class="tsm-item" style="display:flex;align-items:center;margin-left:15px">
                    <button class="badge badge-amber" style="cursor:pointer;border:none;padding:10px 14px;font-size:12px;font-weight:700" onclick="window.print()">Report</button>
                    <a href="overlay.html?tournament=${t.id}" target="_blank" class="badge badge-green" style="text-decoration:none; margin-left:10px; padding:10px 14px; font-size:12px; font-weight:700">Display</a>
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
    
    // Auto-select first tab
    switchTournSubTab(isKO ? 'bracket' : 'standings');
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
        return batsmen.slice(0, 10).map((b, i) => leaderCard(i + 1, b.name, b.team, b.runs, 'Runs', `SR: ${b.sr}`)).join('');
    }

    if (tab === 'bowling') {
        const bowlers = getBestBowlers(t.id);
        if (!bowlers.length) return '<div class="empty-state">No bowling data yet</div>';
        return bowlers.slice(0, 10).map((b, i) => leaderCard(i + 1, b.name, b.team, b.wickets, 'Wkts', `Econ: ${b.econ}`)).join('');
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
    const matches = DB.getMatches().filter(m => m.tournamentId === tournId && m.status === 'completed');
    const stats = {};
    matches.forEach(m => {
        m.innings.forEach(inn => {
            if (!inn) return;
            inn.batsmen.forEach(b => {
                if (!stats[b.name]) stats[b.name] = { name: b.name, team: b.team || inn.battingTeam || '', runs: 0, balls: 0 };
                stats[b.name].runs += (b.runs || 0);
                stats[b.name].balls += (b.balls || 0);
            });
        });
    });
    return Object.values(stats).map(s => ({ ...s, sr: formatSR(s.runs, s.balls) })).sort((a, b) => b.runs - a.runs);
}

function getBestBowlers(tournId) {
    const matches = DB.getMatches().filter(m => m.tournamentId === tournId && m.status === 'completed');
    const stats = {};
    matches.forEach(m => {
        m.innings.forEach(inn => {
            if (!inn) return;
            inn.bowlers.forEach(b => {
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

function leaderCard(rank, name, team, statVal, statLbl, sub) {
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
    return `<div class="leader-card">
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
    t.standings = t.standings || {};
    t.teams.forEach(team => {
        t.standings[team] = { played: 0, won: 0, lost: 0, tied: 0, points: 0, runsScored: 0, ballsFaced: 0, runsConceded: 0, ballsBowled: 0, nrr: 0 };
    });
    const matches = DB.getMatches().filter(m => m.tournamentId === t.id && m.status === 'completed' && m.publishLive);
    matches.forEach(m => {
        const inn0 = m.innings ? m.innings[0] : null;
        const inn1 = m.innings ? m.innings[1] : null;
        if (!inn0 || !inn1) return;
        const s1 = t.standings[m.battingFirst];
        const s2 = t.standings[m.fieldingFirst];
        if (!s1 || !s2) return;
        s1.played++; s2.played++;
        s1.runsScored += inn0.runs; s1.ballsFaced += (inn0.wickets >= (m.playersPerSide-1) ? (m.overs*6) : inn0.balls);
        s1.runsConceded += inn1.runs; s1.ballsBowled += (inn1.wickets >= (m.playersPerSide-1) ? (m.overs*6) : inn1.balls);
        s2.runsScored += inn1.runs; s2.ballsFaced += (inn1.wickets >= (m.playersPerSide-1) ? (m.overs*6) : inn1.balls);
        s2.runsConceded += inn0.runs; s2.ballsBowled += (inn0.wickets >= (m.playersPerSide-1) ? (m.overs*6) : inn0.balls);
        if (inn1.runs > inn0.runs) { s2.won++; s2.points += 2; s1.lost++; }
        else if (inn1.runs < inn0.runs) { s1.won++; s1.points += 2; s2.lost++; }
        else { s1.tied++; s2.tied++; s1.points++; s2.points++; }
    });
    t.teams.forEach(team => {
        const s = t.standings[team];
        const batRR = s.ballsFaced ? (s.runsScored / (s.ballsFaced / 6)) : 0;
        const bowlRR = s.ballsBowled ? (s.runsConceded / (s.ballsBowled / 6)) : 0;
        s.nrr = batRR - bowlRR;
    });
}

function renderRecent() {
    const grid = document.getElementById('recent-matches-grid');
    if (!grid) return;
    const matches = DB.getMatches().filter(m => m.status === 'completed' && m.publishLive);
    if (!matches.length) {
        grid.innerHTML = `<p style="padding:20px; color:var(--c-muted)">No recently completed matches</p>`;
        return;
    }
    grid.innerHTML = matches.slice().reverse().map(m => buildMatchCard(m, false)).join('');
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
    }
}

function renderMatchDetailContent(m) {
    const inn0 = m.innings ? m.innings[0] : null;
    const inn1 = m.innings ? m.innings[1] : null;

    const renderInningsTable = (inn, teamName) => {
        if (!inn) return `<div class="sc-extras">No data for ${teamName} innings</div>`;
        
        const totalScore = `${inn.runs}/${inn.wickets}`;
        const totalOvers = formatOvers(inn.balls, m.ballsPerOver);
        
        let batsmenHtml = inn.batsmen.map(b => `
            <tr>
                <td>
                    <div class="sc-name">${b.name}</div>
                    <div class="sc-status">${b.status || 'Not Out'}</div>
                </td>
                <td class="sc-val">${b.runs}</td>
                <td class="sc-muted-val">${b.balls}</td>
                <td class="sc-muted-val">${b.fours}</td>
                <td class="sc-muted-val">${b.sixes}</td>
                <td class="sc-muted-val">${formatSR(b.runs, b.balls)}</td>
            </tr>
        `).join('');

        let bowlersHtml = inn.bowlers.map(b => `
            <tr>
                <td class="sc-name">${b.name}</td>
                <td class="sc-val">${formatOvers(b.balls, m.ballsPerOver)}</td>
                <td class="sc-muted-val">${b.maidens || 0}</td>
                <td class="sc-muted-val">${b.runs}</td>
                <td class="sc-val" style="color:#00e676">${b.wickets}</td>
                <td class="sc-muted-val">${formatEcon(b.runs, b.balls, m.ballsPerOver)}</td>
            </tr>
        `).join('');

        const extras = inn.extras || { total: 0, wd: 0, nb: 0, b: 0, lb: 0 };
        const extrasText = `Extras: ${extras.total || 0} (Wd:${extras.wd || 0}, Nb:${extras.nb || 0}, By:${extras.b || 0}, Lb:${extras.lb || 0})`;

        return `
            <div class="scorecard-inn-header">
                <div class="scorecard-inn-name">${teamName} Innings</div>
                <div class="scorecard-inn-total">${totalScore} <span class="scorecard-inn-overs">(${totalOvers} ov)</span></div>
            </div>
            
            <table class="sc-table">
                <thead>
                    <tr><th>Batsman</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>
                </thead>
                <tbody>${batsmenHtml}</tbody>
            </table>

            <div class="sc-extras">${extrasText}</div>

            <div class="scorecard-inn-name" style="margin-bottom:12px; font-size:12px">Bowling</div>
            <table class="sc-table">
                <thead>
                    <tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr>
                </thead>
                <tbody>${bowlersHtml}</tbody>
            </table>
        `;
    };

    const typeLabel = m.type === 'tournament' ? `Tournament` : 'Single Match';
    const subInfo = `${m.overs} overs · ${m.venue || 'Home'} · ${typeLabel}`;

    return `
        <div class="scorecard-container">
            <div class="scorecard-header-flex">
                <div>
                    <h1 class="scorecard-title">${m.team1} vs ${m.team2}</h1>
                    <div class="scorecard-subtitle">${subInfo}</div>
                </div>
                <a href="overlay.html?match=${m.id}" target="_blank" class="btn btn-amber btn-sm" style="text-decoration:none">
                    📺 TV Streaming Overlay
                </a>
            </div>

            <div style="background:rgba(255,193,7,0.1); padding:12px; border-radius:10px; text-align:center; font-weight:900; color:#ffc107; font-size:16px; margin-bottom:20px">
                ${m.result || 'Match in Progress'}
            </div>

            ${renderInningsTable(inn0, m.battingFirst || m.team1)}
            ${inn1 ? `<hr style="border-color:var(--c-border); margin:40px 0">` : ''}
            ${inn1 ? renderInningsTable(inn1, m.fieldingFirst || m.team2) : ''}

            <div style="margin-top:30px; display:flex; gap:12px">
                <button class="btn btn-ghost" style="flex:1" onclick="closeMatchDetail()">Close</button>
            </div>
        </div>
    `;
}

function closeMatchDetail() {
    const modal = document.getElementById('match-detail-modal');
    if (modal) modal.style.display = 'none';
}
