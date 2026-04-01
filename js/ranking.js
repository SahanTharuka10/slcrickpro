let cloudPlayerData = null;
let cloudTeamData = null;
let currentTab = 'batting';

document.addEventListener('DOMContentLoaded', async () => {
    addStatusBadge();
    await fetchLiveStats();
    populateTeamFilter();
    renderAll();
});

async function fetchLiveStats() {
    const baseUrl = window.BACKEND_BASE_URL || localStorage.getItem('cricpro_backend_url') || 'https://slcrickpro-server.onrender.com';
    if (!baseUrl) return;
    
    try {
        const [pRes, tRes] = await Promise.all([
            fetch(baseUrl + '/stats/players').then(r => r.ok ? r.json() : null),
            fetch(baseUrl + '/team-stats').then(r => r.ok ? r.json() : null)
        ]);
        
        if (pRes) {
            cloudPlayerData = pRes;
            console.log('✅ Player stats loaded from Cloud');
        }
        if (tRes) {
            cloudTeamData = tRes;
            console.log('✅ Team stats loaded from Cloud');
        }
        updateStatusBadge(!!pRes);
    } catch (e) {
        console.warn('⚠️ Cloud sync failed, using Local data');
        updateStatusBadge(false);
    }
}

function addStatusBadge() {
    const header = document.querySelector('.header-content');
    if (!header) return;
    const badge = document.createElement('div');
    badge.id = 'db-status-badge';
    badge.style = 'margin-left:auto; font-size:12px; font-weight:700; padding:4px 10px; border-radius:20px; display:flex; align-items:center; gap:6px; background:rgba(0,0,0,0.2); transition:all 0.3s';
    badge.innerHTML = '<span>Checking...</span>';
    header.appendChild(badge);
}

function updateStatusBadge(isOnline) {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;
    if (isOnline) {
        badge.style.background = 'rgba(0, 230, 118, 0.15)';
        badge.style.color = '#00e676';
        badge.innerHTML = '<span style="width:8px;height:8px;background:#00e676;border-radius:50%;display:inline-block"></span> Live Cloud Data';
    } else {
        badge.style.background = 'rgba(255, 109, 59, 0.15)';
        badge.style.color = '#ff6d3b';
        badge.innerHTML = '<span style="width:8px;height:8px;background:#ff6d3b;border-radius:50%;display:inline-block"></span> Local Data Only';
    }
}

function populateTeamFilter() {
    const sel = document.getElementById('team-filter');
    if (!sel) return;
    const teams = DB.getTeams().map(t => t.name);
    const matches = DB.getMatches();
    const matchTeams = [];
    matches.forEach(m => {
        if (m.battingFirst) matchTeams.push(m.battingFirst);
        if (m.fieldingFirst) matchTeams.push(m.fieldingFirst);
    });
    const all = [...new Set([...teams, ...matchTeams])].filter(Boolean).sort();
    sel.innerHTML = '<option value="">All Teams</option>' +
        all.map(t => `<option value="${t}">${t}</option>`).join('');
}

function switchTab(tab) {
    currentTab = tab;
    ['batting', 'bowling', 'allround', 'teams'].forEach(t => {
        document.getElementById('tab-' + t).classList.toggle('active', t === tab);
        document.getElementById('panel-' + t).style.display = t === tab ? '' : 'none';
    });
    renderAll();
}

function renderAll() {
    if (currentTab === 'batting') renderBatting();
    if (currentTab === 'bowling') renderBowling();
    if (currentTab === 'allround') renderAllRound();
    if (currentTab === 'teams') renderTeams();
}

function getFilters() {
    return {
        q: (document.getElementById('search-player')?.value || '').toLowerCase().trim(),
        team: (document.getElementById('team-filter')?.value || ''),
    };
}

// Build player stats from match history
function buildPlayerStats() {
    // If we have cloud data, use it
    if (cloudPlayerData && cloudPlayerData.length > 0) {
        return cloudPlayerData.map(p => {
            const st = p.stats || {};
            const runs = st.runs || 0;
            const balls = st.balls || 0;
            const innings = st.innings || 0;
            const notOuts = st.notOuts || 0;
            const bowlBalls = (st.overs || 0) * 6;
            const wickets = st.wickets || 0;
            const bowlRuns = st.bowlingRuns || 0;

            const dism = innings - notOuts;
            const avg = dism > 0 ? (runs / dism).toFixed(1) : (innings > 0 ? runs.toFixed(1) : '—');
            const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';
            const bowlEcon = bowlBalls > 0 ? ((bowlRuns / bowlBalls) * 6).toFixed(2) : '0.00';
            const bowlAvg = wickets > 0 ? (bowlRuns / wickets).toFixed(1) : '—';

            return {
                name: p.name,
                playerId: p.playerId,
                team: p.team || '',
                matchCount: st.matches || 0,
                innings,
                notOuts,
                runs,
                balls,
                fours: st.fours || 0,
                sixes: st.sixes || 0,
                highScore: st.highScore || 0,
                thirties: st.thirties || 0,
                fifties: st.fifties || 0,
                hundreds: st.hundreds || 0,
                wickets,
                bowlBalls,
                bowlRuns,
                maidens: st.maidens || 0,
                avg,
                sr,
                bowlEcon,
                bowlAvg
            };
        });
    }

    // Fallback to local data
    return DB.getPlayers().map(p => {
        const st = p.stats || {};
        const runs = st.runs || 0;
        const balls = st.balls || 0;
        const innings = st.innings || 0;
        const notOuts = st.notOuts || 0;
        const bowlBalls = (st.overs || 0) * 6;
        const wickets = st.wickets || 0;
        const bowlRuns = st.bowlingRuns || 0;

        const dism = innings - notOuts;
        const avg = dism > 0 ? (runs / dism).toFixed(1) : (innings > 0 ? runs.toFixed(1) : '—');
        const sr = balls > 0 ? ((runs / balls) * 100).toFixed(1) : '0.0';
        const bowlEcon = bowlBalls > 0 ? ((bowlRuns / bowlBalls) * 6).toFixed(2) : '0.00';
        const bowlAvg = wickets > 0 ? (bowlRuns / wickets).toFixed(1) : '—';

        return {
            name: p.name,
            playerId: p.playerId,
            team: p.team || '',
            matchCount: st.matches || 0,
            innings,
            notOuts,
            runs,
            balls,
            fours: st.fours || 0,
            sixes: st.sixes || 0,
            highScore: st.highScore || 0,
            thirties: st.thirties || 0,
            fifties: st.fifties || 0,
            hundreds: st.hundreds || 0,
            wickets,
            bowlBalls,
            bowlRuns,
            maidens: st.maidens || 0,
            avg,
            sr,
            bowlEcon,
            bowlAvg
        };
    });
}

// ── Batting tab ──
function renderBatting() {
    const { q, team } = getFilters();
    const sort = document.getElementById('bat-sort')?.value || 'runs';

    let all = buildPlayerStats().filter(p => p.runs > 0);
    if (q) all = all.filter(p => p.name.toLowerCase().includes(q));
    if (team) all = all.filter(p => (p.team || '') === team);

    const sorted = all.sort((a, b) => {
        if (sort === 'runs') return b.runs - a.runs;
        if (sort === 'avg') return parseFloat(b.avg) - parseFloat(a.avg);
        if (sort === 'sr') return parseFloat(b.sr) - parseFloat(a.sr);
        if (sort === 'hs') return b.highScore - a.highScore;
        return 0;
    });

    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('batting-tbody').innerHTML = sorted.map((p, i) => `<tr>
    <td><strong>${i < 3 ? medals[i] : i + 1}</strong></td>
    <td>
      <div style="font-weight:700">${p.name} ${p.playerId ? `<span class="badge badge-blue" style="font-size:10px">${p.playerId}</span>` : ''}</div>
      <div style="font-size:12px;color:var(--c-muted)">${p.team || ''}</div>
    </td>
    <td>${p.matchCount}</td>
    <td>${p.innings}</td>
    <td style="font-weight:900;font-family:'JetBrains Mono',monospace;color:${i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff'}">${p.runs}</td>
    <td>${p.highScore}</td>
    <td style="font-family:'JetBrains Mono',monospace">${p.avg}</td>
    <td style="font-family:'JetBrains Mono',monospace">${p.sr}</td>
    <td>${p.hundreds}</td>
    <td>${p.fifties}</td>
    <td>${p.thirties}</td>
    <td>${p.fours}</td>
    <td>${p.sixes}</td>
  </tr>`).join('') || noData(12);
}

// ── Bowling tab ──
function renderBowling() {
    const { q, team } = getFilters();
    const sort = document.getElementById('bowl-sort')?.value || 'wickets';

    let all = buildPlayerStats().filter(p => p.wickets > 0 || p.bowlBalls > 0);
    if (q) all = all.filter(p => p.name.toLowerCase().includes(q));
    if (team) all = all.filter(p => (p.team || '') === team);

    const sorted = all.sort((a, b) => {
        if (sort === 'wickets') return b.wickets - a.wickets;
        if (sort === 'econ') return parseFloat(a.bowlEcon) - parseFloat(b.bowlEcon);
        if (sort === 'avg') return parseFloat(a.bowlAvg) - parseFloat(b.bowlAvg);
        return 0;
    });

    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('bowling-tbody').innerHTML = sorted.map((p, i) => `<tr>
    <td><strong>${i < 3 ? medals[i] : i + 1}</strong></td>
    <td>
      <div style="font-weight:700">${p.name} ${p.playerId ? `<span class="badge badge-blue" style="font-size:10px">${p.playerId}</span>` : ''}</div>
      <div style="font-size:12px;color:var(--c-muted)">${p.team || ''}</div>
    </td>
    <td>${p.matchCount}</td>
    <td style="font-weight:900;font-family:'JetBrains Mono',monospace;color:${i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#fff'}">${p.wickets}</td>
    <td>${formatOvers(p.bowlBalls)}</td>
    <td>${p.bowlRuns}</td>
    <td style="font-family:'JetBrains Mono',monospace">${p.bowlEcon}</td>
    <td style="font-family:'JetBrains Mono',monospace">${p.bowlAvg}</td>
    <td>${p.maidens}</td>
  </tr>`).join('') || noData(9);
}

// ── All-round tab ──
function renderAllRound() {
    const { q, team } = getFilters();
    let all = buildPlayerStats().filter(p => p.runs > 0 && p.wickets > 0);
    if (q) all = all.filter(p => p.name.toLowerCase().includes(q));
    if (team) all = all.filter(p => (p.team || '') === team);

    const sorted = all.map(p => ({
        ...p, index: (p.runs * 0.5) + (p.wickets * 20) + (p.fours * 1) + (p.sixes * 2)
    })).sort((a, b) => b.index - a.index);

    const medals = ['🥇', '🥈', '🥉'];
    document.getElementById('allround-tbody').innerHTML = sorted.map((p, i) => `<tr>
    <td><strong>${i < 3 ? medals[i] : i + 1}</strong></td>
    <td><div style="font-weight:700">${p.name}</div><div style="font-size:12px;color:var(--c-muted)">${p.team || ''}</div></td>
    <td style="color:#5c9aff;font-weight:700">${p.runs}</td>
    <td style="color:#ff6d3b;font-weight:700">${p.wickets}</td>
    <td>${p.fours}</td><td>${p.sixes}</td>
    <td style="font-family:'JetBrains Mono',monospace">${p.sr}</td>
    <td style="font-family:'JetBrains Mono',monospace">${p.bowlEcon}</td>
    <td style="font-weight:900;color:#ffd700;font-family:'JetBrains Mono',monospace">${Math.round(p.index)}</td>
  </tr>`).join('') || noData(9);
}

// ── Teams tab ──
function renderTeams() {
    const { q } = getFilters();
    let sorted = [];

    if (cloudTeamData && cloudTeamData.length > 0) {
        sorted = cloudTeamData.map(t => ({
            name: t.name,
            played: t.stats.played || 0,
            won: t.stats.won || 0,
            lost: t.stats.lost || 0,
            tied: t.stats.tied || 0,
            runsFor: t.stats.runsScored || 0,
            ballsFaced: t.stats.ballsFaced || 0,
            runsAgainst: t.stats.runsConceded || 0,
            ballsBowled: t.stats.ballsBowled || 0,
            prizeMoney: t.stats.prizeMoney || 0
        }));
    } else {
        const teams = DB.getTeams();
        sorted = teams.map(t => {
            const s = t.stats || { played: 0, won: 0, lost: 0, tied: 0, prizeMoney: 0 };
            return {
                name: t.name,
                played: s.played || 0,
                won: s.won || 0,
                lost: s.lost || 0,
                tied: s.tied || 0,
                prizeMoney: s.prizeMoney || 0,
                runsFor: s.runsScored || 0,
                ballsFaced: s.ballsFaced || 0,
                runsAgainst: s.runsConceded || 0,
                ballsBowled: s.ballsBowled || 0,
                prizeMoney: s.prizeMoney || 0,
            };
        });
    }

    if (q) {
        sorted = sorted.filter(t => t.name.toLowerCase().includes(q));
    }

    const sort = document.getElementById('team-sort')?.value || 'wins';
    sorted.sort((a, b) => {
        const nrrA = a.ballsFaced > 0 && a.ballsBowled > 0 ? (a.runsFor / (a.ballsFaced / 6)) - (a.runsAgainst / (a.ballsBowled / 6)) : 0;
        const nrrB = b.ballsFaced > 0 && b.ballsBowled > 0 ? (b.runsFor / (b.ballsFaced / 6)) - (b.runsAgainst / (b.ballsBowled / 6)) : 0;

        if (sort === 'prizes') return (b.prizeMoney || 0) - (a.prizeMoney || 0) || (b.won || 0) - (a.won || 0) || nrrB - nrrA;
        if (sort === 'wins') return (b.won || 0) - (a.won || 0) || nrrB - nrrA || (b.played || 0) - (a.played || 0);
        if (sort === 'matches') return (b.played || 0) - (a.played || 0) || (b.won || 0) - (a.won || 0) || nrrB - nrrA;
        return 0;
    });

    if (!sorted.length) {
        document.getElementById('team-cards-grid').innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🏟️</div><div class="empty-state-title">No Team Data</div>
      <div class="empty-state-sub">Complete some matches to see team rankings</div></div>`;
        return;
    }

    const tiers = ['🥇', '🥈', '🥉'];
    document.getElementById('team-cards-grid').innerHTML = sorted.map((t, i) => {
        const wp = t.played > 0 ? ((t.won / t.played) * 100).toFixed(0) : 0;
        const rrFor = t.ballsFaced > 0 ? (t.runsFor / (t.ballsFaced / 6)) : 0;
        const rrAgainst = t.ballsBowled > 0 ? (t.runsAgainst / (t.ballsBowled / 6)) : 0;
        const nrr = (rrFor - rrAgainst).toFixed(3);
        return `<div class="team-card">
      <div class="team-card-name">${i < 3 ? tiers[i] : ''} ${t.name}</div>
      <div class="progress-bar" style="margin-bottom:14px">
        <div class="progress-fill" style="width:${wp}%;background:${wp >= 50 ? '#00e676' : '#ff6d3b'}"></div>
      </div>
      <div class="team-stat-row"><span class="team-stat-key">Matches Played</span><span class="team-stat-val">${t.played}</span></div>
      <div class="team-stat-row"><span class="team-stat-key">Won</span><span class="team-stat-val" style="color:#00e676">${t.won}</span></div>
      <div class="team-stat-row"><span class="team-stat-key">Lost</span><span class="team-stat-val" style="color:#ff6d3b">${t.lost}</span></div>
      <div class="team-stat-row"><span class="team-stat-key">Win %</span><span class="team-stat-val">${wp}%</span></div>
      <div class="team-stat-row"><span class="team-stat-key">Total Prize Money</span><span class="team-stat-val" style="color:#ffd700;font-weight:900;font-family:'JetBrains Mono',monospace">Rs. ${t.prizeMoney.toLocaleString()}</span></div>
      <div class="team-stat-row"><span class="team-stat-key">NRR (Approx)</span><span class="team-stat-val" style="color:${nrr >= 0 ? '#00e676' : '#ff6d3b'}">${nrr >= 0 ? '+' : ''}${nrr}</span></div>
    </div>`;
    }).join('');
}

function noData(cols) {
    return `<tr><td colspan="${cols}" style="text-align:center;color:var(--c-muted);padding:32px">No data yet. Complete matches to see rankings.</td></tr>`;
}
