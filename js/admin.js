document.addEventListener('DOMContentLoaded', () => {
    if (sessionStorage.getItem('cricpro_admin') === 'true') {
        showAdminContent();
    }
});

function loginAdmin() {
    const un = document.getElementById('admin-username').value.trim();
    const pw = document.getElementById('admin-password').value.trim();
    
    // SECURITY NOTE: Hardcoded credentials should be replaced with server-side 
    // authentication for production versions to prevent unauthorized access.
    if (un === 'STgamage' && pw === 'ST23gamage@') {
        sessionStorage.setItem('cricpro_admin', 'true');
        showAdminContent();
        showToast('✅ Logged in successfully', 'success');
    } else {
        showToast('❌ Invalid credentials', 'error');
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('cricpro_admin');
    document.getElementById('admin-username').value = '';
    document.getElementById('admin-password').value = '';
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('admin-content-section').style.display = 'none';
}

function showAdminContent() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-content-section').style.display = 'block';
    switchAdminTab('requests');
}

function switchAdminTab(tab) {
    document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
    document.getElementById('tab-' + tab).style.display = 'block';

    document.getElementById('btn-tab-requests').className = 'btn btn-sm ' + (tab === 'requests' ? 'btn-primary' : 'btn-ghost');
    document.getElementById('btn-tab-matches').className = 'btn btn-sm ' + (tab === 'matches' ? 'btn-primary' : 'btn-ghost');
    document.getElementById('btn-tab-tournaments').className = 'btn btn-sm ' + (tab === 'tournaments' ? 'btn-primary' : 'btn-ghost');
    document.getElementById('btn-tab-players').className = 'btn btn-sm ' + (tab === 'players' ? 'btn-primary' : 'btn-ghost');
    document.getElementById('btn-tab-store').className = 'btn btn-sm ' + (tab === 'store' ? 'btn-primary' : 'btn-ghost');
    document.getElementById('btn-tab-match-entry').className = 'btn btn-sm ' + (tab === 'match-entry' ? 'btn-primary' : 'btn-ghost');

    if (tab === 'requests') renderRequests();
    if (tab === 'matches') renderSystemMatches();
    if (tab === 'tournaments') renderTournamentsAdmin();
    if (tab === 'players') renderPlayersAdmin();
    if (tab === 'store') renderStoreAdmin();
    if (tab === 'match-entry') {
        if (typeof initMatchEntryTab === 'function') initMatchEntryTab();
    }
}

function renderStoreAdmin() {
    renderStoreItems();
}

function renderRequests() {
    const container = document.getElementById('requests-list');
    const reqs = DB.getRequests();

    if (!reqs || !reqs.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">📥</div>
          <div class="empty-state-title">Inbox is empty</div>
          <div class="empty-state-sub">No pending requests to score matches</div>
        </div>`;
        return;
    }

    const pendingList = reqs.filter(r => r.status === 'pending');

    if (!pendingList.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">✔️</div>
          <div class="empty-state-title">All Caught Up</div>
          <div class="empty-state-sub">All requests have been approved or processed.</div>
        </div>`;
        return;
    }

    container.innerHTML = pendingList.map(req => {
        let titleBlock = '';
        let targetType = '';
        if (req.type === 'tournament') {
            const t = DB.getTournament(req.tournamentId);
            titleBlock = t ? `🏆 ${t.name}` : 'Unknown Tournament';
            targetType = 'Tournament';
        } else {
            const m = DB.getMatch(req.matchId);
            titleBlock = m ? `${m.scheduledName || 'Match'} - ${m.tournamentName || ''} (${m.team1} vs ${m.team2})` : 'Unknown Match';
            targetType = 'Match';
        }

        const date = new Date(req.createdAt).toLocaleString();
        let detailsHtml = '';
        if (req.type === 'tournament') {
            const t = DB.getTournament(req.tournamentId);
            if (t) {
                detailsHtml = `
                    <div style="margin-top:10px; padding:10px; background:rgba(255,193,7,0.05); border-radius:8px; font-size:13px; border:1px solid rgba(255,193,7,0.2)">
                        <p>📅 <b>Starts:</b> ${t.startDate || 'Not set'}</p>
                        <p>🏏 <b>Matches:</b> ${t.matchCount || 0}</p>
                        <p>💰 <b>Prizes:</b> 1st: ${t.prizes?.first || '-'}, 2nd: ${t.prizes?.second || '-'}, 3rd: ${t.prizes?.third || '-'}</p>
                        <p>👥 <b>Teams:</b> ${t.teams?.join(', ') || 'None'}</p>
                    </div>
                `;
            }
        }

        return `<div class="request-card">
            <div class="req-info" style="flex:1">
                <h3>📝 ${req.requesterName} wants to manage ${targetType}</h3>
                <p><strong>${targetType}:</strong> ${titleBlock}</p>
                <p><strong>Time:</strong> ${date}</p>
                ${req.organizerPhone ? `<p><strong>Organizer Phone:</strong> ${req.organizerPhone}</p>` : ''}
                <p><strong>Requested Password:</strong> <span style="font-family: monospace; background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${req.requestedPassword}</span></p>
                ${detailsHtml}
            </div>
            <div class="req-actions">
                <button class="btn btn-green" onclick="approveRequest('${req.id}')">✅ Approve</button>
            </div>
        </div>`;
    }).join('');
}

function approveRequest(reqId) {
    if (!confirm('Approve this request? The content will be unlocked with the custom password.')) return;

    const reqs = DB.getRequests();
    const req = reqs.find(r => r.id === reqId);
    if (!req) return;

    if (req.type === 'tournament') {
        const t = DB.getTournament(req.tournamentId);
        if (t) {
            t.password = req.requestedPassword;
            t.status = 'approved';
            DB.saveTournament(t);
        }
    } else {
        const m = DB.getMatch(req.matchId);
        if (m) {
            m.password = req.requestedPassword;
            m.status = 'approved';
            DB.saveMatch(m);
        }
    }

    req.status = 'approved';
    DB.saveRequests(reqs);
    renderRequests();

    showToast('✅ Request approved!', 'success');
}

function renderSystemMatches() {
    const container = document.getElementById('matches-list');
    const matches = DB.getMatches().filter(m => ['live', 'paused', 'setup', 'completed'].includes(m.status));

    if (!matches.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">🏏</div>
          <div class="empty-state-title">No Ongoing Matches</div>
          <div class="empty-state-sub">There are no matches currently running in the system.</div>
        </div>`;
        return;
    }

    container.innerHTML = matches.map(m => {
        const inn = m.innings ? m.innings[m.currentInnings] : null;
        let scoreStr = m.status.toUpperCase();
        if (inn && ['live', 'paused'].includes(m.status)) {
            const bpo = m.ballsPerOver || 6;
            scoreStr = `${inn.runs}/${inn.wickets} (${Math.floor(inn.balls / bpo)}.${inn.balls % bpo})`;
        }

        const typeStr = m.type === 'tournament' ? `🏆 ${m.tournamentName}` : 'Single Match';

        return `<div class="request-card">
            <div class="req-info">
                <h3>${m.team1} vs ${m.team2}</h3>
                <p><strong>Status:</strong> ${scoreStr} · <strong>Type:</strong> ${typeStr}</p>
                <p><strong>ID:</strong> <span style="font-family: monospace; font-size:11px">${m.id}</span></p>
            </div>
            <div class="req-actions">
                <button class="btn btn-red btn-sm" onclick="forceDeleteMatch('${m.id}')">🗑️ Delete</button>
            </div>
        </div>`;
    }).join('');
}

function renderTournamentsAdmin() {
    const container = document.getElementById('tournaments-list');
    const tournaments = DB.getTournaments();

    if (!tournaments.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">🏆</div>
          <div class="empty-state-title">No Tournaments</div>
          <div class="empty-state-sub">There are no tournaments currently in the system.</div>
        </div>`;
        return;
    }

    container.innerHTML = tournaments.map(t => {
        const statusColor = t.status === 'active' ? '#00e676' : '#ffc107';
        const statusLabel = t.status === 'active' ? 'Active' : 'Completed';

        return `<div class="request-card">
            <div class="req-info">
                <h3>🏆 ${t.name}</h3>
                <p><strong>Status:</strong> <span style="color:${statusColor}">${statusLabel}</span> · <strong>Teams:</strong> ${t.teams.length}</p>
                <p><strong>ID:</strong> <span style="font-family: monospace; font-size:11px">${t.id}</span></p>
            </div>
            <div class="req-actions">
                ${t.status === 'active' ? `<button class="btn btn-amber btn-sm" onclick="endTournamentAdmin('${t.id}')">🏁 End</button>` : ''}
                <button class="btn btn-red btn-sm" onclick="deleteTournamentAdmin('${t.id}')">🗑️ Delete</button>
            </div>
        </div>`;
    }).join('');
}

function endTournamentAdmin(id) {
    if (!confirm('Are you sure you want to end this tournament? It will be marked as completed.')) return;
    const t = DB.getTournament(id);
    if (t) {
        t.status = 'completed';
        DB.saveTournament(t);
        showToast('✅ Tournament marked as completed', 'success');
        renderTournamentsAdmin();
    }
}

function deleteTournamentAdmin(id) {
    if (!confirm('Are you strictly sure you want to delete this tournament? All related data will be removed.')) return;
    DB.deleteTournament(id);
    showToast('✅ Tournament deleted completely', 'success');
    renderTournamentsAdmin();
}

async function reSyncAllStats() {
    if (!confirm("This will recalculate ALL player and team statistics from the entire match history. Continue?")) return;

    try {
        showToast('⏳ Resyncing database...', 'info');

        // 1. Reset all player stats
        const players = DB.getPlayers();
        players.forEach(p => {
            p.stats = {
                matches: 0, innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0,
                notOuts: 0, highScore: 0, hundreds: 0, fifties: 0, thirties: 0,
                wickets: 0, bowlingRuns: 0, overs: 0, maidens: 0, bestBowling: '0/0'
            };
        });
        DB.savePlayers(players);

        // 2. Reset all team stats
        const teams = DB.getTeams();
        teams.forEach(t => {
            t.stats = { played: 0, won: 0, lost: 0, tied: 0, prizeMoney: 0 };
        });
        DB.saveTeams(teams);

        // 3. Re-run sync for every completed official match
        const allMatches = DB.getMatches().filter(m => m.status === 'completed');
        const allTournaments = DB.getTournaments();

        // We need the syncOfficialStats function from scorer.js, but it's not exported.
        // We'll reimplement a simplified version here for maintenance.
        allMatches.forEach(m => {
            const t = allTournaments.find(tourn => tourn.id === m.tournamentId);
            if (!t || !t.isOfficial) return; // Only sync official match data to rankings

            // (Simplified sync logic similar to scorer.js:syncOfficialStats)
            // Note: This logic must match scorer.js for consistency.
            reprocessMatchStats(m, t);
        });

        // 4. Update tournament completion prizes
        allTournaments.forEach(t => {
            if (t.isOfficial && t.status === 'completed' && t.standings) {
                const sorted = Object.values(t.standings).sort((a,b) => b.points - a.points || b.nrr - a.nrr);
                const prizeMap = { first: 0, second: 1, third: 2 };
                ['first', 'second', 'third'].forEach(rank => {
                    if (sorted[prizeMap[rank]] && t.prizes && t.prizes[rank]) {
                        const val = parseFloat((t.prizes[rank] + '').replace(/[^\d.-]/g, '')) || 0;
                        const teamObj = DB.getTeams().find(tm => tm.name === sorted[prizeMap[rank]].name);
                        if (teamObj) {
                            teamObj.stats.prizeMoney = (teamObj.stats.prizeMoney || 0) + val;
                        }
                    }
                });
                DB.saveTeams(DB.getTeams());
            }
        });

        showToast('✅ Database Re-synced successfully!', 'success');
        if (typeof renderAll === 'function') renderAll();
    } catch (e) {
        console.error(e);
        showToast('❌ Error during resync: ' + e.message, 'error');
    }
}

function reprocessMatchStats(m, t) {
    // Re-implementation of syncOfficialStats logic for admin maintenance
    [0, 1].forEach(innIdx => {
        const inn = m.innings[innIdx];
        if (!inn) return;
        inn.batsmen.forEach(b => {
            if (!b.playerId) return;
            const p = DB.getPlayerById(b.playerId);
            if (!p) return;
            const r = b.runs || 0;
            p.stats.innings++;
            p.stats.runs += r;
            p.stats.balls += (b.balls || 0);
            p.stats.fours += (b.fours || 0);
            p.stats.sixes += (b.sixes || 0);
            if (b.notOut) p.stats.notOuts++;
            p.stats.highScore = Math.max(p.stats.highScore, r);
            if (r >= 100) p.stats.hundreds = (p.stats.hundreds || 0) + 1;
            else if (r >= 50) p.stats.fifties = (p.stats.fifties || 0) + 1;
            else if (r >= 30) p.stats.thirties = (p.stats.thirties || 0) + 1;
            DB.updatePlayerStats(p.playerId, p.stats);
        });
        inn.bowlers.forEach(b => {
            if (!b.playerId) return;
            const p = DB.getPlayerById(b.playerId);
            if (!p) return;
            const w = b.wickets || 0;
            p.stats.wickets += w;
            p.stats.bowlingRuns += (b.runs || 0);
            p.stats.overs += ((b.balls || 0) / 6);
            p.stats.maidens += (b.maidens || 0);
            const bp = (p.stats.bestBowling || '0/0').split('/');
            if (w > parseInt(bp[0]) || (w === parseInt(bp[0]) && (b.runs || 0) < (parseInt(bp[1]) || 999))) {
                p.stats.bestBowling = `${w}/${b.runs || 0}`;
            }
            DB.updatePlayerStats(p.playerId, p.stats);
        });
    });
    const pids = new Set();
    m.innings.forEach(inn => {
        [...(inn.batsmen || []), ...(inn.bowlers || [])].forEach(b => { if(b.playerId) pids.add(b.playerId); });
    });
    pids.forEach(id => {
        const p = DB.getPlayerById(id);
        if(p) { p.stats.matches++; DB.updatePlayerStats(id, p.stats); }
    });
    // Team stats
    const t1 = DB.getTeams().find(x => x.name === m.battingFirst);
    const t2 = DB.getTeams().find(x => x.name === m.fieldingFirst);
    if (t1 && t2) {
        t1.stats.played++; t2.stats.played++;
        const r1 = m.innings[0].runs, r2 = m.innings[1].runs;
        if (r1 > r2) { t1.stats.won++; t2.stats.lost++; }
        else if (r2 > r1) { t2.stats.won++; t1.stats.lost++; }
        else { t1.stats.tied++; t2.stats.tied++; }
        DB.saveTeams(DB.getTeams());
    }
}

function forceDeleteMatch(mId) {
    if (!confirm('Are you strictly sure you want to delete this match? It will be removed from the system completely.')) return;
    DB.deleteMatch(mId);
    showToast('✅ Match deleted completely', 'success');
    renderSystemMatches();
}

function renderPlayersAdmin() {
    const container = document.getElementById('admin-players-list');
    const q = (document.getElementById('admin-player-search')?.value || '').toLowerCase();
    const players = DB.getPlayers();
    const filtered = q ? players.filter(p => p.name.toLowerCase().includes(q) || p.playerId.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q)) : players;

    if (!filtered.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">👤</div>
          <div class="empty-state-title">No players found</div>
        </div>`;
        return;
    }

    container.innerHTML = `<div class="card"><table class="data-table">
        <thead>
            <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Team</th>
                <th>Role</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            ${filtered.slice(0, 50).map(p => `
                <tr>
                    <td><span class="badge badge-blue">${p.playerId}</span></td>
                    <td><b>${p.name}</b></td>
                    <td>${p.team || '—'}</td>
                    <td>${p.role || '—'}</td>
                    <td><button class="btn btn-red btn-sm" onclick="deletePlayerAdmin('${p.playerId}')">🗑️</button></td>
                </tr>
            `).join('')}
        </tbody>
    </table></div>`;
}

function deletePlayerAdmin(pid) {
    if (!confirm(`Are you sure you want to delete player ${pid}?`)) return;
    const all = DB.getPlayers().filter(p => p.playerId !== pid);
    DB.savePlayers(all);
    DB.deletePlayerFromCloud(pid);
    showToast('✅ Player deleted successfully', 'success');
    renderPlayersAdmin();
}

function renderStoreItems() {
    const container = document.getElementById('store-list');
    const products = DB.getProducts();

    container.innerHTML = products.map(p => {
        let imgHtml = '';
        if (p.img) {
            imgHtml = `<img src="${p.img}" alt="${p.name}" onerror="this.src=''; this.style.display='none';" />`;
        } else {
            imgHtml = `<div style="font-size:48px;text-align:center;margin-bottom:12px;background:rgba(0,0,0,0.2);padding:20px;border-radius:8px">${p.imgFallback || '📦'}</div>`;
        }

        return `<div class="product-card">
            ${imgHtml}
            <h4>${p.name}</h4>
            <p style="color:var(--c-amber);font-weight:700;margin-bottom:6px">Rs. ${p.price}</p>
            <p style="color:var(--c-muted);font-size:13px;margin-bottom:16px">Stock: ${p.stock}</p>
            <div style="display: flex; gap: 8px; margin-top: auto;">
                <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openEditProduct('${p.id}')">✏️ Edit</button>
                <button class="btn btn-red btn-sm" style="flex:1" onclick="deleteProduct('${p.id}')">🗑️ Delete</button>
            </div>
        </div>`;
    }).join('');
}

function openEditProduct(pId) {
    const p = DB.getProducts().find(x => x.id === pId);
    if (!p) return;
    document.getElementById('edit-prod-id').value = p.id;
    document.getElementById('edit-prod-name').value = p.name;
    document.getElementById('edit-prod-price').value = p.price;
    document.getElementById('edit-prod-stock').value = p.stock;
    document.getElementById('edit-prod-img').value = p.img || '';

    document.getElementById('modal-edit-product').style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function saveProductEdit() {
    const pId = document.getElementById('edit-prod-id').value;
    const prods = DB.getProducts();
    const idx = prods.findIndex(x => x.id === pId);
    if (idx !== -1) {
        prods[idx].name = document.getElementById('edit-prod-name').value.trim();
        prods[idx].price = parseFloat(document.getElementById('edit-prod-price').value) || 0;
        prods[idx].stock = parseInt(document.getElementById('edit-prod-stock').value) || 0;
        prods[idx].img = document.getElementById('edit-prod-img').value.trim();
        DB.saveProducts(prods);

        showToast('✅ Product updated!', 'success');
        closeModal('modal-edit-product');
        renderStoreItems();
    }
}

function showToast(msg, type = 'default') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function encodeProductImage(input, targetId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById(targetId).value = e.target.result;
            showToast('✅ Image loaded!', 'success');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function openAddProduct() {
    document.getElementById('add-prod-name').value = '';
    document.getElementById('add-prod-price').value = '';
    document.getElementById('add-prod-stock').value = '';
    document.getElementById('add-prod-emoji').value = '📦';
    document.getElementById('add-prod-img').value = '';
    document.getElementById('add-prod-desc').value = '';
    document.getElementById('add-prod-category').value = 'bat';

    document.getElementById('modal-add-product').style.display = 'flex';
}

function saveNewProduct() {
    const name = document.getElementById('add-prod-name').value.trim();
    if (!name) {
        showToast('❌ Name is required', 'error');
        return;
    }
    const price = parseFloat(document.getElementById('add-prod-price').value) || 0;
    const stock = parseInt(document.getElementById('add-prod-stock').value) || 0;
    const imgFallback = document.getElementById('add-prod-emoji').value.trim() || '📦';
    const img = document.getElementById('add-prod-img').value.trim();
    const desc = document.getElementById('add-prod-desc').value.trim();
    const category = document.getElementById('add-prod-category').value || 'misc';

    const catLabels = { bat: 'Bat', ball: 'Ball', gear: 'Gear', equipment: 'Equipment', bag: 'Bag', shoes: 'Shoes', service: 'Service', misc: 'Misc' };

    const newProd = {
        id: 'PROD-' + Date.now().toString(36).toUpperCase(),
        name,
        price,
        stock,
        imgFallback,
        img,
        desc,
        category,
        rating: 4.0,
        brand: 'SLCRICKPRO',
        type: catLabels[category] || 'Misc'
    };

    const prods = DB.getProducts();
    prods.push(newProd);
    DB.saveProducts(prods);

    showToast('✅ Product added!', 'success');
    closeModal('modal-add-product');
    renderStoreItems();
}

function deleteProduct(pId) {
    if (!confirm('Are you sure you want to delete this product?')) return;
    const prods = DB.getProducts();
    const updated = prods.filter(p => p.id !== pId);
    DB.saveProducts(updated);
    DB.deleteProductFromCloud(pId);
    showToast('✅ Product deleted!', 'success');
    renderStoreItems();
}
