// Ongoing Matches JS
let currentTab = 'live';
let selectedTournId = null;
let selectedTourn_SubTab = 'standings';
let refreshInterval;

document.addEventListener('DOMContentLoaded', () => {
  renderLive();
  startAutoRefresh();
});

function startAutoRefresh() {
  clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (currentTab === 'live') renderLive();
    if (currentTab === 'tournament' && selectedTournId) renderTournDetails(selectedTournId);
  }, 5000);
}

function refreshAll() {
  renderLive();
  renderTournamentSelector();
  showToast('🔄 Refreshed!');
}

function switchTab(tab) {
  currentTab = tab;
  ['live', 'tournament', 'recent'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('panel-' + t).style.display = t === tab ? '' : 'none';
  });
  if (tab === 'live') renderLive();
  if (tab === 'tournament') renderTournamentSelector();
  if (tab === 'recent') renderRecent();
}

// ========== LIVE MATCHES ==========
function renderLive() {
  const grid = document.getElementById('live-matches-grid');
  const matches = DB.getMatches().filter(m => (m.status === 'live' || m.status === 'paused') && m.publishLive);

  if (!matches.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon"><svg style="width:48px;height:48px;opacity:0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1"/></svg></div>
      <div class="empty-state-title">No Live Matches</div>
      <div class="empty-state-sub">Start a match from "Score New Match" and publish it live</div>
    </div>`;
    return;
  }

  grid.innerHTML = matches.map(m => buildMatchCard(m, true)).join('');
}

function buildMatchCard(m, isLive) {
  const inn0 = m.innings[0];
  const inn1 = m.innings[1];
  const curInn = m.innings[m.currentInnings];
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
    else targetInfo = `<span style="color:#00e676">Won!</span>`;
  }

  const typeLabel = m.type === 'tournament' ? `Tournament` : 'Single Match';

  return `<div class="match-card ${isLive ? 'live-card' : ''}" onclick="openMatchDetail('${m.id}')">
    <div class="match-card-header">
      <span class="match-type-badge badge badge-${m.type === 'tournament' ? 'amber' : 'blue'}">${typeLabel}</span>
      <span style="font-size:12px;font-weight:700;color:${statusColor}">${statusLabel}</span>
    </div>
    <div class="match-teams">
      <div class="match-vs-row">
        <span class="match-team-name">${m.battingFirst || m.team1}</span>
        <span class="match-vs-sep">vs</span>
        <span class="match-team-name">${m.fieldingFirst || m.team2}</span>
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
      <span class="match-crr">${m.overs} overs · ${m.venue || 'Home'}</span>
    </div>
  </div>`;
}

// ========== MATCH DETAIL MODAL ==========
function openMatchDetail(matchId) {
  const m = DB.getMatch(matchId);
  if (!m) return;
  const modal = document.getElementById('match-detail-modal');
  const content = document.getElementById('match-detail-content');
  content.innerHTML = buildFullScorecard(m);
  modal.style.display = 'flex';
}

function closeMatchDetail(e) {
  if (!e || e.target === document.getElementById('match-detail-modal')) {
    document.getElementById('match-detail-modal').style.display = 'none';
  }
}

function buildFullScorecard(m) {
  const inn0 = m.innings[0];
  const inn1 = m.innings[1];

  let html = `<div style="padding-right:30px">
    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
      <div>
        <div style="font-size:22px;font-weight:900;margin-bottom:4px">${m.team1} vs ${m.team2}</div>
        <div style="font-size:13px;color:var(--c-muted);margin-bottom:20px">
          ${m.overs} overs &middot; ${m.venue || 'Home Ground'} &middot; ${m.type === 'tournament' ? (m.tournamentName || 'Tournament') : 'Single Match'}
        </div>
      </div>
      <a href="overlay.html?match=${m.id}" target="_blank" class="badge badge-amber" style="text-decoration:none; display:flex; align-items:center; gap:5px; padding:6px 12px;">📺 TV Streaming Overlay</a>
    </div>`;

  if (inn0) html += renderInningsCard(inn0, '1st Innings', m.ballsPerOver);
  if (inn1) html += renderInningsCard(inn1, '2nd Innings', m.ballsPerOver);

  // Result
  if (m.status === 'completed' && m.result) {
    html += `<div style="background:linear-gradient(135deg,rgba(255,193,7,0.15),rgba(255,109,0,0.08));border:1px solid rgba(255,193,7,0.3);border-radius:14px;padding:20px;margin-top:16px;text-align:center">
      <div style="font-size:13px;color:var(--c-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px">Match Result</div>
      <div style="font-size:24px;font-weight:900;color:#ffc107">${m.result}</div>
    </div>`;
  }

  html += '</div>';
  return html;
}

function renderInningsCard(inn, label, bpo = 6) {
  const extras = inn.extras || {};
  const totalExtras = (extras.wides || 0) + (extras.noBalls || 0) + (extras.byes || 0) + (extras.legByes || 0);

  // Batsmen table
  let batHtml = `<table class="data-table" style="margin-bottom:12px">
    <thead><tr>
      <th>Batsman</th><th>Status</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th>
    </tr></thead><tbody>`;
  (inn.batsmen || []).forEach(b => {
    const sr = formatSR(b.runs || 0, b.balls || 0);
    const status = b.dismissal || (b.notOut ? 'Not Out' : 'Did not bat');
    batHtml += `<tr>
      <td><strong>${b.name}</strong>${b.playerId ? ' <span class="badge badge-blue" style="font-size:10px">' + b.playerId + '</span>' : ''}</td>
      <td style="font-size:12px;color:var(--c-muted)">${status}</td>
      <td><strong>${b.runs || 0}</strong></td>
      <td>${b.balls || 0}</td>
      <td>${b.fours || 0}</td>
      <td>${b.sixes || 0}</td>
      <td style="font-family:'JetBrains Mono',monospace">${sr}</td>
    </tr>`;
  });
  batHtml += `<tr style="border-top:1px solid var(--c-border)">
    <td colspan="2" style="color:var(--c-muted)">Extras</td>
    <td colspan="5" style="color:var(--c-muted);font-size:13px">
      ${totalExtras} (Wd:${extras.wides || 0}, Nb:${extras.noBalls || 0}, By:${extras.byes || 0}, Lb:${extras.legByes || 0})
    </td>
  </tr></tbody></table>`;

  // Bowlers table
  let bowlHtml = `<table class="data-table">
    <thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>`;
  (inn.bowlers || []).forEach(b => {
    const ov = formatOvers(b.balls || 0, bpo);
    const econ = formatEcon(b.runs || 0, b.balls || 0, bpo);
    bowlHtml += `<tr>
      <td><strong>${b.name}</strong></td>
      <td>${ov}</td><td>${b.maidens || 0}</td>
      <td>${b.runs || 0}</td><td><strong>${b.wickets || 0}</strong></td>
      <td style="font-family:'JetBrains Mono',monospace">${econ}</td>
    </tr>`;
  });
  bowlHtml += '</tbody></table>';

  // Fall of wickets
  let fowHtml = '';
  if (inn.fallOfWickets && inn.fallOfWickets.length) {
    fowHtml = `<div style="margin-top:12px;font-size:13px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-muted);margin-bottom:8px">Fall of Wickets</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${inn.fallOfWickets.map((fw, i) => `<span class="badge badge-red">${i + 1}—${fw.runs} (${fw.batsmanName}, ${formatOvers(fw.balls, bpo)} ov)</span>`).join('')}
      </div>
    </div>`;
  }

  // Over history dots
  let overHtml = '';
  if (inn.overHistory && inn.overHistory.length) {
    overHtml = `<div style="margin-top:12px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-muted);margin-bottom:8px">Over by Over</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${inn.overHistory.map((ov, i) => {
      const runs = ov.reduce((s, b) => s + (b.runs || 0), 0);
      const dots = ov.map(b => {
        const cls = b.wicket ? 'b-wicket' : b.type === 'four' ? 'b-four' : b.type === 'six' ? 'b-six' : b.type === 'wide' ? 'b-wide' : b.type === 'noball' ? 'b-noball' : b.runs === 0 ? 'b-dot' : '';
        const label = b.wicket ? 'W' : b.type === 'wide' ? 'Wd' : b.type === 'noball' ? 'Nb' : b.type === 'bye' ? 'By' : b.type === 'legbye' ? 'Lb' : (b.runs || '·');
        return `<span class="ball-chip ${cls}">${label}</span>`;
      }).join('');
      return `<div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:11px;color:var(--c-muted);width:30px">Ov${i + 1}</span>
            <div class="ball-timeline">${dots}</div>
            <span style="font-size:13px;font-weight:700;margin-left:auto">${runs}</span>
          </div>`;
    }).join('')}
      </div>
    </div>`;
  }

  return `<div style="margin-bottom:20px">
    <div class="sc-innings-title">
      <span>${label} – ${inn.battingTeam}</span>
      <span style="display:flex;align-items:baseline;gap:8px">
        <span class="sc-total">${inn.runs}/${inn.wickets}</span>
        <span class="sc-overs">(${formatOvers(inn.balls, bpo)} ov)</span>
      </span>
    </div>
    <div style="background:var(--c-surface);border:1px solid var(--c-border);border-radius:14px;padding:16px">
      ${batHtml}
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-muted);margin:14px 0 8px">Bowling</div>
      ${bowlHtml}
      ${fowHtml}
      ${overHtml}
    </div>
  </div>`;
}

// ========== TOURNAMENT ==========
function renderTournamentSelector() {
  const container = document.getElementById('tournament-selector');
  const tournaments = DB.getTournaments();

  if (!tournaments.length) {
    container.innerHTML = '';
    document.getElementById('tournament-details').innerHTML = `<div class="empty-state">
      <div class="empty-state-icon"><svg style="width:48px;height:48px;opacity:0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg></div>
      <div class="empty-state-title">No Tournaments Yet</div>
      <div class="empty-state-sub">Go to "Score New Match" and start a tournament</div>
    </div>`;
    return;
  }

  container.innerHTML = tournaments.map(t =>
    `<button class="tourn-select-btn ${t.id === selectedTournId ? 'active' : ''}" onclick="selectTournament('${t.id}')">
      ${t.name}
    </button>`
  ).join('');

  if (!selectedTournId || !tournaments.find(t => t.id === selectedTournId)) {
    selectedTournId = tournaments[0].id;
  }
  renderTournDetails(selectedTournId);
}

function selectTournament(id) {
  selectedTournId = id;
  renderTournamentSelector();
}

function renderTournDetails(id) {
  const t = DB.getTournament(id);
  if (!t) return;
  const details = document.getElementById('tournament-details');

  // Recompute standings from match results
  computeTournamentStandings(t);

  const totalMatches = t.matches.length;
  const completedMatches = DB.getMatches().filter(m => m.tournamentId === id && m.status === 'completed' && m.publishLive).length;
  const liveMatches = DB.getMatches().filter(m => m.tournamentId === id && m.status === 'live' && m.publishLive).length;

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
           <button class="badge badge-amber" style="cursor:pointer;border:none;padding:10px 14px;font-size:12px;font-weight:700" onclick="window.print()">Get PDF Report</button>
           <a href="overlay.html?tournament=${t.id}" target="_blank" class="badge badge-green" style="text-decoration:none; margin-left:10px; padding:10px 14px; font-size:12px; font-weight:700">TV Display</a>
        </div>
      </div>
    </div>
    <div class="tourn-sub-tabs">
      <button class="tourn-sub-tab ${selectedTourn_SubTab === 'standings' ? 'active' : ''}" onclick="switchTournSubTab('standings','${id}')">📊 Standings</button>
      <button class="tourn-sub-tab ${selectedTourn_SubTab === 'batting' ? 'active' : ''}" onclick="switchTournSubTab('batting','${id}')">🏏 Best Batsman</button>
      <button class="tourn-sub-tab ${selectedTourn_SubTab === 'bowling' ? 'active' : ''}" onclick="switchTournSubTab('bowling','${id}')">🎳 Best Bowler</button>
      <button class="tourn-sub-tab ${selectedTourn_SubTab === 'nrr' ? 'active' : ''}" onclick="switchTournSubTab('nrr','${id}')">📈 Net Run Rate</button>
      <button class="tourn-sub-tab ${selectedTourn_SubTab === 'fixtures' ? 'active' : ''}" onclick="switchTournSubTab('fixtures','${id}')">📅 Fixtures</button>
    </div>
    <div id="tourn-sub-content">${buildTournSubTab(t, selectedTourn_SubTab)}</div>
  `;
}

function switchTournSubTab(tab, tornId) {
  selectedTourn_SubTab = tab;
  // Update buttons
  document.querySelectorAll('.tourn-sub-tab').forEach(b => {
    b.classList.toggle('active', b.getAttribute('onclick').includes(`'${tab}'`));
  });
  const t = DB.getTournament(tornId);
  document.getElementById('tourn-sub-content').innerHTML = buildTournSubTab(t, tab);
}

function buildTournSubTab(t, tab) {
  const sortedTeams = t.teams.map(team => ({ name: team, ...((t.standings && t.standings[team]) || {}) }))
    .sort((a, b) => (b.points || 0) - (a.points || 0) || (b.nrr || 0) - (a.nrr || 0));

  if (tab === 'standings') {
    return `<div class="card">
      <table class="data-table">
        <thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>Pts</th><th>NRR</th></tr></thead>
        <tbody>${sortedTeams.map((ts, i) => `<tr>
          <td class="standings-pos">${i + 1}</td>
          <td class="standings-team">${ts.name}</td>
          <td>${ts.played || 0}</td><td>${ts.won || 0}</td><td>${ts.lost || 0}</td><td>${ts.tied || 0}</td>
          <td class="standings-pts">${ts.points || 0}</td>
          <td class="${(ts.nrr || 0) >= 0 ? 'nrr-positive' : 'nrr-negative'} " style="font-family:'JetBrains Mono',monospace">
            ${(ts.nrr || 0) >= 0 ? '+' : ''}${(ts.nrr || 0).toFixed(3)}
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
  }

  if (tab === 'batting') {
    const batsmen = getBestBatsmen(t.id);
    if (!batsmen.length) return '<div class="empty-state"><div class="empty-state-icon">🏏</div><div class="empty-state-title">No batting data yet</div></div>';
    return batsmen.slice(0, 10).map((b, i) => leaderCard(i + 1, b.name, b.team, b.runs, 'Runs', `SR: ${b.sr} | Balls: ${b.balls}`)).join('');
  }

  if (tab === 'bowling') {
    const bowlers = getBestBowlers(t.id);
    if (!bowlers.length) return '<div class="empty-state"><div class="empty-state-icon">🎳</div><div class="empty-state-title">No bowling data yet</div></div>';
    return bowlers.slice(0, 10).map((b, i) => leaderCard(i + 1, b.name, b.team, b.wickets, 'Wkts', `Econ: ${b.econ} | Overs: ${b.overs}`)).join('');
  }

  if (tab === 'nrr') {
    return `<div class="card">
      <div class="card-head">Net Run Rate Table</div>
      <table class="data-table">
        <thead><tr><th>#</th><th>Team</th><th>Runs For</th><th>Overs Faced</th><th>Runs Agnst</th><th>Overs Bowled</th><th>NRR</th></tr></thead>
        <tbody>${sortedTeams.map((ts, i) => {
      const rfor = parseFloat(((ts.runsScored || 0) / Math.max(1, (ts.ballsFaced || 0) / 6)).toFixed(2));
      const ragn = parseFloat(((ts.runsConceded || 0) / Math.max(1, (ts.ballsBowled || 0) / 6)).toFixed(2));
      return `<tr>
            <td>${i + 1}</td><td class="standings-team">${ts.name}</td>
            <td>${ts.runsScored || 0}</td>
            <td style="font-family:'JetBrains Mono',monospace">${formatOvers(ts.ballsFaced || 0)}</td>
            <td>${ts.runsConceded || 0}</td>
            <td style="font-family:'JetBrains Mono',monospace">${formatOvers(ts.ballsBowled || 0)}</td>
            <td class="${(ts.nrr || 0) >= 0 ? 'nrr-positive' : 'nrr-negative'}" style="font-weight:800;font-family:'JetBrains Mono',monospace">
              ${(ts.nrr || 0) >= 0 ? '+' : ''}${(ts.nrr || 0).toFixed(3)}
            </td>
          </tr>`;
    }).join('')}</tbody>
      </table>
    </div>`;
  }

  if (tab === 'fixtures') {
    const allMatches = DB.getMatches().filter(m => m.tournamentId === t.id && m.publishLive);
    if (!allMatches.length) return '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">No fixtures yet</div></div>';
    return `<div style="display:flex;flex-direction:column;gap:12px">` +
      allMatches.map(m => buildMatchCard(m, m.status === 'live')).join('') + `</div>`;
  }

  return '';
}

function leaderCard(rank, name, team, statVal, statLbl, sub) {
  const rankColors = ['gold', 'silver', 'bronze'];
  const emoji = rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank;
  return `<div class="leader-card">
    <div class="leader-rank ${rankColors[rank - 1] || ''}">${rank <= 3 ? emoji : rank}</div>
    <div class="leader-avatar">${getAvatarEmoji(name)}</div>
    <div class="leader-info">
      <div class="leader-name">${name}</div>
      <div class="leader-team">${team || ''} ${sub ? '· ' + sub : ''}</div>
    </div>
    <div class="leader-stat">
      <div class="leader-stat-val" style="color:${rank === 1 ? '#ffd700' : rank === 2 ? '#c0c0c0' : rank === 3 ? '#cd7f32' : '#fff'}">${statVal}</div>
      <div class="leader-stat-lbl">${statLbl}</div>
    </div>
  </div>`;
}

function getAvatarEmoji(name) {
  const emojis = ['🧑', '👨', '👩', '🧔', '👱', '🧑‍🦱', '👨‍🦱', '👩‍🦱'];
  let hash = 0; for (const c of name) hash += c.charCodeAt(0);
  return emojis[hash % emojis.length];
}

function getBestBatsmen(tournId) {
  const matches = DB.getMatches().filter(m => m.tournamentId === tournId && m.status === 'completed' && m.publishLive);
  const playerMap = {};
  matches.forEach(m => {
    m.innings.forEach((inn, ii) => {
      if (!inn) return;
      inn.batsmen.forEach(b => {
        if (!playerMap[b.name]) playerMap[b.name] = { name: b.name, team: ii === 0 ? m.battingFirst : m.fieldingFirst, runs: 0, balls: 0, fours: 0, sixes: 0 };
        playerMap[b.name].runs += b.runs || 0;
        playerMap[b.name].balls += b.balls || 0;
        playerMap[b.name].fours += b.fours || 0;
        playerMap[b.name].sixes += b.sixes || 0;
      });
    });
  });
  return Object.values(playerMap).map(p => ({ ...p, sr: formatSR(p.runs, p.balls) })).sort((a, b) => b.runs - a.runs);
}

function getBestBowlers(tournId) {
  const matches = DB.getMatches().filter(m => m.tournamentId === tournId && m.status === 'completed' && m.publishLive);
  const playerMap = {};
  matches.forEach(m => {
    m.innings.forEach((inn, ii) => {
      if (!inn) return;
      inn.bowlers.forEach(b => {
        if (!playerMap[b.name]) playerMap[b.name] = { name: b.name, team: ii === 0 ? m.fieldingFirst : m.battingFirst, wickets: 0, balls: 0, runs: 0 };
        playerMap[b.name].wickets += b.wickets || 0;
        playerMap[b.name].balls += b.balls || 0;
        playerMap[b.name].runs += b.runs || 0;
      });
    });
  });
  return Object.values(playerMap).map(p => ({
    ...p,
    overs: formatOvers(p.balls),
    econ: formatEcon(p.runs, p.balls),
  })).sort((a, b) => b.wickets - a.wickets || parseFloat(a.econ) - parseFloat(b.econ));
}

function computeTournamentStandings(t) {
  // Reset
  t.teams.forEach(team => {
    if (!t.standings[team]) t.standings[team] = {};
    Object.assign(t.standings[team], { played: 0, won: 0, lost: 0, tied: 0, points: 0, runsScored: 0, ballsFaced: 0, runsConceded: 0, ballsBowled: 0, nrr: 0 });
  });

  const matches = DB.getMatches().filter(m => m.tournamentId === t.id && m.status === 'completed' && m.publishLive);
  matches.forEach(m => {
    const inn0 = m.innings[0]; const inn1 = m.innings[1];
    if (!inn0 || !inn1) return;
    const t1 = m.battingFirst; const t2 = m.fieldingFirst;
    if (!t.standings[t1]) t.standings[t1] = {};
    if (!t.standings[t2]) t.standings[t2] = {};
    const s1 = t.standings[t1]; const s2 = t.standings[t2];
    s1.played++; s2.played++;

    let b0 = inn0.balls;
    if (inn0.wickets >= m.playersPerSide - 1) b0 = m.overs * m.ballsPerOver;
    let b1 = inn1.balls;
    if (inn1.wickets >= m.playersPerSide - 1) b1 = m.overs * m.ballsPerOver;

    s1.runsScored += inn0.runs; s1.ballsFaced += b0;
    s1.runsConceded += inn1.runs; s1.ballsBowled += b1;
    s2.runsScored += inn1.runs; s2.ballsFaced += b1;
    s2.runsConceded += inn0.runs; s2.ballsBowled += b0;
    if (inn1.runs > inn0.runs) { s2.won++; s2.points += 2; s1.lost++; }
    else if (inn1.runs < inn0.runs) { s1.won++; s1.points += 2; s2.lost++; }
    else { s1.tied++; s2.tied++; s1.points++; s2.points++; }
  });

  t.teams.forEach(team => {
    const s = t.standings[team];
    const runRate = (s.ballsFaced ? (s.runsScored / (s.ballsFaced / 6)) : 0);
    const runRateAgainst = (s.ballsBowled ? (s.runsConceded / (s.ballsBowled / 6)) : 0);
    s.nrr = parseFloat((runRate - runRateAgainst).toFixed(3));
  });

  DB.saveTournament(t);
}

// ========== RECENT / COMPLETED ==========
function renderRecent() {
  const grid = document.getElementById('recent-matches-grid');
  const matches = DB.getMatches().filter(m => m.status === 'completed' && m.publishLive);

  if (!matches.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon"><svg style="width:48px;height:48px;opacity:0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></div>
      <div class="empty-state-title">No Completed Matches</div>
      <div class="empty-state-sub">Completed matches will appear here</div>
    </div>`;
    return;
  }

  grid.innerHTML = matches.reverse().map(m => buildMatchCard(m, false)).join('');
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
