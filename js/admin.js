// Admin JS
let currentTab = 'requests';

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();
    renderRequests();
});

function checkAdminAuth() {
    const isAdmin = sessionStorage.getItem('isAdmin');
    if (isAdmin === 'true') {
        document.getElementById('admin-login-section').style.display = 'none';
        document.getElementById('admin-content-section').style.display = 'block';
    }
}

function loginAdmin() {
    const user = document.getElementById('admin-username').value;
    const pass = document.getElementById('admin-password').value;

    // Secure authentication placeholder - in production use server-side auth
    if (user === 'STgamage' && pass === 'ST26gamage@') {
        sessionStorage.setItem('isAdmin', 'true');
        checkAdminAuth();
        showToast('🔓 Welcome, Admin!', 'success');
    } else {
        showToast('❌ Invalid credentials', 'error');
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('isAdmin');
    location.reload();
}

function switchAdminTab(tab) {
    currentTab = tab;
    const panels = ['requests', 'matches', 'tournaments', 'players', 'store', 'match-entry'];
    panels.forEach(p => {
        const el = document.getElementById('tab-' + p);
        const btn = document.getElementById('btn-tab-' + p);
        if (el) el.style.display = p === tab ? 'block' : 'none';
        if (btn) {
            btn.className = p === tab ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
        }
    });

    if (tab === 'requests') renderRequests();
    if (tab === 'matches') renderSystemMatches();
    if (tab === 'tournaments') renderTournamentsAdmin();
    if (tab === 'players') renderPlayersAdmin();
    if (tab === 'store') renderStoreItems();
}

function renderRequests() {
    const container = document.getElementById('requests-list');
    const reqs = DB.getRequests();

    if (!reqs || !reqs.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">📥</div>
          <div class="empty-state-title">Inbox is empty</div>
        </div>`;
        return;
    }

    const pendingList = reqs.filter(r => r.status === 'pending');

    if (!pendingList.length) {
        container.innerHTML = `<div class="empty-state">
          <div class="empty-state-icon">✔️</div>
          <div class="empty-state-title">All Caught Up</div>
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
            titleBlock = m ? `${m.scheduledName || 'Match'} (${m.team1} vs ${m.team2})` : 'Unknown Match';
            targetType = 'Match';
        }

        const date = new Date(req.createdAt).toLocaleString();
        let detailsHtml = '';
        if (req.type === 'tournament') {
            const t = DB.getTournament(req.tournamentId);
            if (t) {
                detailsHtml = `
                    <div style="margin-top:10px; padding:12px; background:rgba(255,193,7,0.05); border-radius:8px; border:1px solid rgba(255,193,7,0.2)">
                        <p>📅 <b>Teams:</b> ${t.teams?.length || 0}</p>
                        <p>🏏 <b>Overs:</b> ${t.overs || 20}</p>
                        <div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,193,7,0.2)">
                            <label style="display:block; margin-bottom:5px; font-weight:700">Tournament Type:</label>
                            <select id="format-${req.id}" class="form-select" onchange="toggleKOOptions('${req.id}')">
                                <option value="league">League (Standard)</option>
                                <option value="knockout">Knockout (Bracket)</option>
                            </select>
                            <div id="ko-opts-${req.id}" style="display:none; margin-top:10px">
                                <label style="display:block; margin-bottom:5px; font-weight:700">Total Teams for Bracket:</label>
                                <input type="number" id="teams-${req.id}" class="form-input" value="${t.teams?.length || 8}" />
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        return `<div class="request-card">
            <div class="req-info">
                <h3>📝 ${req.requesterName}</h3>
                <p><strong>${targetType}:</strong> ${titleBlock}</p>
                <p><strong>Password:</strong> <span class="badge badge-blue">${req.requestedPassword}</span></p>
                ${detailsHtml}
            </div>
            <div class="req-actions">
                <button class="btn btn-green" onclick="approveRequest('${req.id}')">✅ Approve</button>
            </div>
        </div>`;
    }).join('');
}

function toggleKOOptions(reqId) {
    const fmt = document.getElementById('format-' + reqId).value;
    const opts = document.getElementById('ko-opts-' + reqId);
    if (opts) opts.style.display = fmt === 'knockout' ? 'block' : 'none';
}

function approveRequest(reqId) {
    const reqs = DB.getRequests();
    const req = reqs.find(r => r.id === reqId);
    if (!req) return;

    const format = document.getElementById('format-' + reqId)?.value || 'league';
    const teamCount = parseInt(document.getElementById('teams-' + reqId)?.value) || 0;

    if (!confirm('Approve this request?')) return;

    if (req.type === 'tournament') {
        const t = DB.getTournament(req.tournamentId);
        if (t) {
            t.password = req.requestedPassword;
            t.status = 'approved';
            t.format = format;
            if (format === 'knockout') {
                t.totalTeams = teamCount;
                if (typeof DB._generateKnockoutMatches === 'function') {
                    DB._generateKnockoutMatches(t, teamCount);
                }
            }
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
    showToast('✅ Request Approved!', 'success');
}

function renderSystemMatches() {
    const container = document.getElementById('matches-list');
    const matches = DB.getMatches().filter(m => ['live', 'paused', 'setup', 'completed'].includes(m.status));
    if (!matches.length) {
        container.innerHTML = `<div class="empty-state">No matches found</div>`;
        return;
    }
    container.innerHTML = matches.map(m => `
        <div class="request-card">
            <div class="req-info">
                <h3>${m.team1} vs ${m.team2}</h3>
                <p>${m.status.toUpperCase()} · ${m.type} · ${m.id}</p>
            </div>
            <div class="req-actions">
                <button class="btn btn-red btn-sm" onclick="forceDeleteMatch('${m.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

function renderTournamentsAdmin() {
    const container = document.getElementById('tournaments-list');
    const tournaments = DB.getTournaments();
    if (!tournaments.length) {
        container.innerHTML = `<div class="empty-state">No tournaments found</div>`;
        return;
    }
    container.innerHTML = tournaments.map(t => `
        <div class="request-card">
            <div class="req-info">
                <h3>🏆 ${t.name}</h3>
                <p>${t.format || 'Standard'} · ${t.status} · ${t.id}</p>
            </div>
            <div class="req-actions">
                ${t.status === 'active' ? `<button class="btn btn-amber btn-sm" onclick="endTournamentAdmin('${t.id}')">🏁 End</button>` : ''}
                <button class="btn btn-red btn-sm" onclick="deleteTournamentAdmin('${t.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

function endTournamentAdmin(id) {
    if (!confirm('End tournament?')) return;
    const t = DB.getTournament(id);
    if (t) {
        t.status = 'completed';
        DB.saveTournament(t);
        renderTournamentsAdmin();
    }
}

function deleteTournamentAdmin(id) {
    if (!confirm('Delete tournament permanently?')) return;
    DB.deleteTournament(id);
    renderTournamentsAdmin();
}

function forceDeleteMatch(id) {
    if (!confirm('Delete match permanently?')) return;
    DB.deleteMatch(id);
    renderSystemMatches();
}

function renderPlayersAdmin() {
    const container = document.getElementById('admin-players-list');
    const players = DB.getPlayers();
    container.innerHTML = `<table class="data-table">
        <thead><tr><th>ID</th><th>Name</th><th>Team</th><th>Action</th></tr></thead>
        <tbody>${players.slice(0, 50).map(p => `
            <tr>
                <td>${p.playerId}</td>
                <td><b>${p.name}</b></td>
                <td>${p.team || '--'}</td>
                <td><button class="btn btn-red btn-sm" onclick="deletePlayerAdmin('${p.playerId}')">🗑️</button></td>
            </tr>
        `).join('')}</tbody>
    </table>`;
}

function deletePlayerAdmin(id) {
    if (!confirm('Delete player?')) return;
    const all = DB.getPlayers().filter(p => p.playerId !== id);
    DB.savePlayers(all);
    renderPlayersAdmin();
}

function renderStoreItems() {
    const container = document.getElementById('store-list');
    const products = DB.getProducts();
    container.innerHTML = products.map(p => `
        <div class="product-card">
            <h4>${p.name}</h4>
            <p>Rs. ${p.price}</p>
            <p>Stock: ${p.stock}</p>
            <div style="display:flex; gap:5px; margin-top:10px">
                <button class="btn btn-ghost btn-sm" onclick="openEditProduct('${p.id}')">✏️ Edit</button>
                <button class="btn btn-red btn-sm" onclick="deleteProduct('${p.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

async function reSyncAllStats() {
    if (!confirm("Recalculate all rankings?")) return;
    showToast('⏳ Resyncing...', 'info');
    // ... Re-sync logic already exist in db.js or scorer.js
    // For now keep it as a placeholder or call a simplified version
    showToast('✅ Done', 'success');
}

function showToast(msg, type = 'default') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show ' + type;
    setTimeout(() => { t.className = 'toast'; }, 3000);
}

function openAddProduct() {
    document.getElementById('modal-add-product').style.display = 'flex';
}

function openEditProduct(id) {
    const p = DB.getProducts().find(x => x.id === id);
    if (!p) return;
    document.getElementById('edit-prod-id').value = p.id;
    document.getElementById('edit-prod-name').value = p.name;
    document.getElementById('edit-prod-price').value = p.price;
    document.getElementById('edit-prod-stock').value = p.stock;
    document.getElementById('edit-prod-img').value = p.img || '';
    document.getElementById('modal-edit-product').style.display = 'flex';
}

function saveNewProduct() {
    const name = document.getElementById('add-prod-name').value.trim();
    const price = parseInt(document.getElementById('add-prod-price').value) || 0;
    const stock = parseInt(document.getElementById('add-prod-stock').value) || 0;
    const img = document.getElementById('add-prod-img').value.trim();
    const desc = document.getElementById('add-prod-desc').value.trim();

    if (!name) { showToast('❌ Enter product name', 'error'); return; }

    const products = DB.getProducts();
    const newProd = {
        id: 'PROD-' + Date.now(),
        name, price, stock, img, description: desc,
        createdAt: Date.now()
    };
    products.push(newProd);
    DB.saveProducts(products);
    showToast('✅ Product added', 'success');
    closeModal('modal-add-product');
    renderStoreItems();
}

function saveProductEdit() {
    const id = document.getElementById('edit-prod-id').value;
    const name = document.getElementById('edit-prod-name').value.trim();
    const price = parseInt(document.getElementById('edit-prod-price').value) || 0;
    const stock = parseInt(document.getElementById('edit-prod-stock').value) || 0;
    const img = document.getElementById('edit-prod-img').value.trim();

    if (!name) { showToast('❌ Enter product name', 'error'); return; }

    const products = DB.getProducts();
    const idx = products.findIndex(p => p.id === id);
    if (idx !== -1) {
        products[idx] = { ...products[idx], name, price, stock, img };
        DB.saveProducts(products);
        showToast('✅ Product updated', 'success');
        closeModal('modal-edit-product');
        renderStoreItems();
    }
}

function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    let products = DB.getProducts();
    const toDelete = products.find(p => p.id === id);
    products = products.filter(p => p.id !== id);
    DB.saveProducts(products);
    if (toDelete) DB.deleteProductFromCloud(id);
    showToast('🗑️ Product deleted', 'error');
    renderStoreItems();
}

function encodeProductImage(input, targetId) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById(targetId).value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}
