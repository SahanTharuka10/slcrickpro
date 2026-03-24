// Player Registration JS
let currentTab = 'reg';

document.addEventListener('DOMContentLoaded', () => {
    populateTeamsDropdown();
    renderPreview();
    initPreviewListeners();
    renderPlayerList();
    renderTeamsList();
});

function switchTab(tab) {
    currentTab = tab;
    ['reg', 'players', 'teams', 'lookup'].forEach(t => {
        document.getElementById('tab-' + t).classList.toggle('active', t === tab);
        document.getElementById('panel-' + t).style.display = t === tab ? '' : 'none';
    });
    if (tab === 'players') renderPlayerList();
    if (tab === 'teams') renderTeamsList();
}

// ========== FORM LISTENERS ==========
function initPreviewListeners() {
    ['reg-name', 'reg-dob', 'reg-nic', 'reg-role', 'reg-team', 'reg-team-custom', 'reg-bat-style', 'reg-bowl-style', 'reg-jersey'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', renderPreview);
        if (el) el.addEventListener('change', renderPreview);
    });
}

function renderPreview() {
    const name = document.getElementById('reg-name').value.trim() || 'Player Name';
    const team = document.getElementById('reg-team-custom').value.trim() ||
        (() => { const s = document.getElementById('reg-team'); return s?.options[s.selectedIndex]?.text !== 'Select team...' ? s?.options[s.selectedIndex]?.text : ''; })()
        || '—';
    const role = document.getElementById('reg-role').value;
    const batStyle = document.getElementById('reg-bat-style').value;
    const bowlStyle = document.getElementById('reg-bowl-style').value;
    const jersey = document.getElementById('reg-jersey').value;
    const dob = document.getElementById('reg-dob').value;

    const players = DB.getPlayers();
    const nextId = DB.generatePlayerId(players);

    document.getElementById('preview-pid').textContent = nextId;
    document.getElementById('preview-name').textContent = name;
    document.getElementById('preview-role').textContent = capitalize(role) + ' · ' + team;
    document.getElementById('preview-style').textContent = batStyle + ' · ' + bowlStyle;
    document.getElementById('preview-date').textContent = 'Issued: ' + new Date().toLocaleDateString('en-GB');
    document.getElementById('preview-jersey').textContent = jersey ? '#' + jersey : '#--';
    document.getElementById('preview-avatar').textContent = name[0]?.toUpperCase() || '?';
}

// ========== REGISTER ==========
function registerPlayer() {
    const name = document.getElementById('reg-name').value.trim();
    if (!name) { showToast('❌ Enter player name', 'error'); return; }

    const teamSel = document.getElementById('reg-team');
    const teamCustom = document.getElementById('reg-team-custom').value.trim();
    const team = teamCustom || (teamSel.value ? teamSel.options[teamSel.selectedIndex].text : '');

    const player = {
        name,
        dob: document.getElementById('reg-dob').value,
        phone: document.getElementById('reg-phone').value.trim(),
        address: document.getElementById('reg-address').value.trim(),
        team,
        role: document.getElementById('reg-role').value,
        batStyle: document.getElementById('reg-bat-style').value,
        bowlStyle: document.getElementById('reg-bowl-style').value,
        jersey: document.getElementById('reg-jersey').value || null,
    };

    const saved = DB.addPlayer(player);
    showToast(`${saved.name} registered as ${saved.playerId}!`, 'success');
    renderPreview();
    clearForm();

    // Print ID card option
    setTimeout(() => {
        if (confirm(`Player registered with ID: ${saved.playerId}\n\nDo you want to view the player profile?`)) {
            switchTab('lookup');
            document.getElementById('lookup-pid').value = saved.playerId;
            lookupPlayerById();
        }
    }, 500);
}

function clearForm() {
    ['reg-name', 'reg-dob', 'reg-phone', 'reg-address', 'reg-team-custom', 'reg-jersey'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const ts = document.getElementById('reg-team');
    if (ts) ts.selectedIndex = 0;
    renderPreview();
}

// ========== PLAYER LIST ==========
function escapeHTML(str) {
    if (typeof str !== 'string') return str || '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

function renderPlayerList() {
    const q = (document.getElementById('player-search')?.value || '').toLowerCase();
    const players = DB.getPlayers();
    const filtered = q ? players.filter(p => p.name.toLowerCase().includes(q) || p.playerId.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q)) : players;

    // Stat boxes
    const statBox = document.getElementById('player-stat-boxes');
    if (statBox) statBox.innerHTML = `
    <div class="stat-box"><div class="stat-val" style="color:#00bcd4">${players.length}</div><div class="stat-lbl">Total Players</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#ffc107">${[...new Set(players.map(p => p.team).filter(Boolean))].length}</div><div class="stat-lbl">Teams</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#7c4dff">${players.filter(p => p.role === 'allrounder').length}</div><div class="stat-lbl">All-Rounders</div></div>
  `;

    const tbody = document.getElementById('player-table-body');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--c-muted);padding:32px">No players registered yet</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const age = p.dob ? Math.floor((Date.now() - new Date(p.dob)) / (365.25 * 24 * 3600 * 1000)) : '—';
        const since = new Date(p.createdAt).toLocaleDateString('en-GB');
        return `<tr>
      <td><span class="badge badge-blue" style="font-family:'JetBrains Mono',monospace">${escapeHTML(p.playerId)}</span></td>
      <td>
        <div style="font-weight:700">${escapeHTML(p.name)}</div>
      </td>
      <td>${escapeHTML(p.team) || '—'}</td>
      <td><span class="badge badge-purple">${escapeHTML(capitalize(p.role || 'batsman'))}</span></td>
      <td>${escapeHTML(p.jersey ? '#' + p.jersey : '—')}</td>
      <td>${age}</td>
      <td style="font-size:12px;color:var(--c-muted)">${since}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="viewPlayerModal('${escapeHTML(p.playerId)}')">View Profile</button>
      </td>
    </tr>`;
    }).join('');
}

function deletePlayer(pid) {
    if (!confirm('Delete this player? This cannot be undone.')) return;
    const all = DB.getPlayers().filter(p => p.playerId !== pid);
    DB.savePlayers(all);
    DB.deletePlayerFromCloud(pid);
    renderPlayerList();
    showToast('Player deleted', 'error');
}

function exportPlayers() {
    const players = DB.getPlayers();
    const csv = ['Player ID,Name,Team,Role,DOB,Phone,Jersey,Registered']
        .concat(players.map(p => [
            p.playerId, p.name, p.team || '', capitalize(p.role || ''), p.dob || '', p.phone || '', p.jersey || '',
            new Date(p.createdAt).toLocaleDateString()
        ].join(','))).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'cricpro_players.csv';
    a.click();
    showToast('📥 CSV exported!', 'success');
}

// ========== TEAMS ==========
function populateTeamsDropdown() {
    const teams = DB.getTeams();
    const sel = document.getElementById('reg-team');
    if (!sel) return;
    const existing = Array.from(sel.options).map(o => o.value);
    teams.forEach(t => {
        if (!existing.includes(t.id)) {
            const opt = document.createElement('option');
            opt.value = t.id; opt.textContent = t.name;
            sel.appendChild(opt);
        }
    });
}

function registerTeam() {
    const name = document.getElementById('team-name').value.trim();
    if (!name) { showToast('Enter team name', 'error'); return; }

    const team = {
        name,
        ground: document.getElementById('team-ground').value.trim(),
        captain: document.getElementById('team-captain').value.trim(),
        manager: document.getElementById('team-manager').value.trim(),
        contact: document.getElementById('team-contact').value.trim(),
        year: document.getElementById('team-year').value,
    };
    DB.addTeam(team);
    // Sync team registration to Google Sheets
    DB.addTeamToSheets(team);
    showToast(`${name} registered!`, 'success');
    ['team-name', 'team-ground', 'team-captain', 'team-manager', 'team-contact', 'team-year'].forEach(id => { document.getElementById(id).value = ''; });
    renderTeamsList();
    populateTeamsDropdown();
}

function renderTeamsList() {
    const teams = DB.getTeams();
    const container = document.getElementById('teams-list');
    if (!teams.length) {
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon"><svg style="width:48px;height:48px;opacity:0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.3 11c.3-1.1 1.3-2 2.6-2h10.2c1.3 0 2.3.9 2.6 2"/><path d="m3 11 1.5 1h15L21 11"/><path d="M12 2A10 10 0 1 0 22 12"/><path d="M7 12v5"/><path d="M17 12v5"/><path d="M7 15h10"/></svg></div><div class="empty-state-title">No teams yet</div></div>`;
        return;
    }
    const players = DB.getPlayers();
    container.innerHTML = teams.map(t => {
        const memberCount = players.filter(p => p.team === t.name).length;
        return `<div class="team-list-card">
      <div>
        <div class="team-list-name">${escapeHTML(t.name)}</div>
        <div class="team-list-info">${memberCount} players · ${escapeHTML(t.ground) || 'No ground'} · ${escapeHTML(t.captain) ? 'Cap: ' + escapeHTML(t.captain) : ''} · Est. ${escapeHTML(t.year) || '—'}</div>
        ${t.manager ? `<div class="team-list-info" style="margin-top:4px">Manager: ${escapeHTML(t.manager)} ${t.contact ? '(' + escapeHTML(t.contact) + ')' : ''}</div>` : ''}
      </div>
    </div>`;
    }).join('');
}

// ========== LOOKUP ==========
function lookupPlayerById() {
    const pid = document.getElementById('lookup-pid').value.trim().toUpperCase();
    if (!pid) { showToast('Enter a Player ID', 'error'); return; }

    const player = DB.getPlayerById(pid);
    const container = document.getElementById('lookup-result');

    if (!player) {
        container.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">❓</div>
      <div class="empty-state-title">Player Not Found</div>
      <div class="empty-state-sub">No player with ID: ${pid}</div>
    </div>`;
        return;
    }

    const age = player.dob ? Math.floor((Date.now() - new Date(player.dob)) / (365.25 * 24 * 3600 * 1000)) : '—';
    const since = new Date(player.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const st = player.stats || {};

    container.innerHTML = `<div class="lookup-card">
    <div style="display:flex;align-items:center;gap:20px;margin-bottom:20px;flex-wrap:wrap">
      <div style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,#00bcd4,#7c4dff);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;border:2px solid rgba(0,188,212,0.4)">
        ${escapeHTML(player.name[0]?.toUpperCase() || '?')}
      </div>
      <div>
        <div class="lookup-id">${escapeHTML(player.playerId)}</div>
        <div class="lookup-name">${escapeHTML(player.name)}</div>
        <div style="font-size:13px;color:var(--c-muted)">${escapeHTML(capitalize(player.role || 'batsman'))} · ${escapeHTML(player.team) || 'No team'}</div>
      </div>
    </div>

    <div style="margin-bottom:20px">
      <div class="lookup-row"><span class="lookup-key">Date of Birth</span><span class="lookup-val">${player.dob ? escapeHTML(new Date(player.dob).toLocaleDateString('en-GB')) : '—'} ${age !== '—' ? '(' + escapeHTML(age.toString()) + ' yrs)' : ''}</span></div>
      <div class="lookup-row"><span class="lookup-key">Phone</span><span class="lookup-val">${escapeHTML(player.phone) || '—'}</span></div>
      <div class="lookup-row"><span class="lookup-key">Address</span><span class="lookup-val">${escapeHTML(player.address) || '—'}</span></div>
      <div class="lookup-row"><span class="lookup-key">Batting</span><span class="lookup-val">${escapeHTML(player.batStyle) || '—'}</span></div>
      <div class="lookup-row"><span class="lookup-key">Bowling</span><span class="lookup-val">${escapeHTML(player.bowlStyle) || '—'}</span></div>
      <div class="lookup-row"><span class="lookup-key">Jersey No.</span><span class="lookup-val">${player.jersey ? '#' + escapeHTML(player.jersey.toString()) : '—'}</span></div>
      <div class="lookup-row"><span class="lookup-key">Registered</span><span class="lookup-val">${escapeHTML(since)}</span></div>
    </div>

    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--c-muted);margin-bottom:12px">Career Statistics</div>
    <div class="stat-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-box"><div class="stat-val" style="font-size:24px">${escapeHTML((st.runs || 0).toString())}</div><div class="stat-lbl">Runs</div></div>
      <div class="stat-box"><div class="stat-val" style="font-size:24px">${escapeHTML((st.wickets || 0).toString())}</div><div class="stat-lbl">Wickets</div></div>
      <div class="stat-box"><div class="stat-val" style="font-size:24px">${escapeHTML((st.matches || 0).toString())}</div><div class="stat-lbl">Matches</div></div>
      <div class="stat-box"><div class="stat-val" style="font-size:24px">${escapeHTML((st.highScore || 0).toString())}</div><div class="stat-lbl">High</div></div>
    </div>
  </div>`;
}

// ========== PLAYER MODAL ==========
function viewPlayerModal(pid) {
    document.getElementById('lookup-pid') && (document.getElementById('lookup-pid').value = pid);
    switchTab('lookup');
    lookupPlayerById();
}

function closePlayerModal(e) {
    if (!e || e.target === document.getElementById('modal-player')) {
        document.getElementById('modal-player').style.display = 'none';
    }
}

function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
