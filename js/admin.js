// Admin JS
let currentTab = 'requests';

document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.pullGlobalData === 'function') window.pullGlobalData();
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

let loginAttempts = 0;

async function loginAdmin() {
    const user = (document.getElementById('admin-username').value || '').trim();
    const pass = (document.getElementById('admin-password').value || '').trim();

    if (!pass) {
        showToast('❌ Please enter your Admin PIN', 'error');
        return;
    }

    const btn = document.querySelector('#admin-login-section .btn-primary');
    if (btn) { btn.disabled = true; btn.textContent = 'Logging in…'; }

    try {
        const response = await fetch(BACKEND_BASE_URL + '/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user || 'admin', password: pass })
        });

        const result = await response.json();

        if (result.success) {
            loginAttempts = 0;
            sessionStorage.setItem('isAdmin', 'true');
            sessionStorage.setItem('adminToken', result.token);
            checkAdminAuth();
            showToast('🔓 Welcome, Admin!', 'success');
        } else {
            loginAttempts++;
            showToast('❌ ' + (result.message || 'Wrong PIN'), 'error');
            // Show PIN hint after 2 failed attempts
            if (loginAttempts >= 2) {
                const hint = document.getElementById('login-hint');
                if (hint) hint.style.display = 'block';
            }
        }
    } catch (err) {
        console.error('Login failed:', err);
        showToast('❌ Cannot reach server. Check connection.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Login'; }
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('isAdmin');
    location.reload();
}

function switchAdminTab(tab) {
    currentTab = tab;
    const panels = ['requests', 'matches', 'tournaments', 'players', 'store', 'posts', 'feedback', 'match-entry'];
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
    if (tab === 'posts') renderPostsAdmin();
    if (tab === 'feedback') renderFeedbackAdmin();
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
            t.scoringPassword = req.requestedPassword;
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
    const matches = DB.getMatches().filter(m => ['live', 'paused', 'setup', 'completed', 'scheduled'].includes(m.status));
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
                <button class="btn btn-primary btn-sm" onclick="scoreAdminMatchRedirect('${m.id}')">⚡ Score</button>
                <button class="btn btn-red btn-sm" onclick="forceDeleteMatch('${m.id}')">🗑️ Delete</button>
            </div>
        </div>
    `).join('');
}

async function scoreAdminMatchRedirect(id) {
    const m = DB.getMatch(id) || DB.getTournament(id);
    if (!m) {
        window.location.href = 'score-match.html?matchId=' + id;
        return;
    }
    const needsPassword = (m.isLocked || m.scoringPassword || m.password);
    const grants = JSON.parse(localStorage.getItem('cricpro_grants') || '{}');
    if (needsPassword && !grants[id]) {
        const password = prompt("🔐 This match is protected. Enter the Scoring Password to continue:");
        if (password === null) return;
        const res = await DB.handshake(id, password);
        if (res.ok) {
            window.location.href = 'score-match.html?matchId=' + id;
        } else {
            showToast("❌ Incorrect password", "error");
        }
    } else {
        window.location.href = 'score-match.html?matchId=' + id;
    }
}

function renderTournamentsAdmin() {
    const container = document.getElementById('tournaments-list');
    const tournaments = DB.getTournaments();
    if (!tournaments.length) {
        container.innerHTML = `<div class="empty-state">No tournaments found</div>`;
        return;
    }
    
    container.innerHTML = tournaments.map(t => {
        let matchHtml = '';
        if (t.matches && t.matches.length > 0) {
            matchHtml = `<div style="margin-top:10px; padding:10px; background:rgba(0,0,0,0.03); border-radius:6px; font-size:12px;">
                <strong style="display:block; margin-bottom:6px;">Scheduled Matches (${t.matches.length}):</strong>
                <ul style="padding-left:16px; margin:0; line-height:1.6">
                    ${t.matches.map(mId => {
                        const m = DB.getMatch(mId);
                        if (!m) return `<li style="color:#888;">${mId} (Missing)</li>`;
                        return `<li><b>${m.team1} vs ${m.team2}</b> <span class="badge ${m.status === 'completed' ? 'badge-blue' : m.status==='scheduled'?'badge-amber':'badge-green'}" style="font-size:9px; padding:2px 4px">${m.status.toUpperCase()}</span></li>`;
                    }).join('')}
                </ul>
            </div>`;
        } else {
            matchHtml = `<div style="margin-top:10px; font-size:12px; color:var(--c-muted)">No matches scheduled yet.</div>`;
        }
        
        return `<div class="request-card">
            <div class="req-info">
                <h3>🏆 ${t.name}</h3>
                <p>${t.format || 'Standard'} · ${t.status} · ${t.id} · <strong style="color:var(--c-primary)">${t.scoringPassword || 'No PIN'}</strong></p>
                ${matchHtml}
            </div>
            <div class="req-actions">
                ${t.status === 'active' ? `<button class="btn btn-amber btn-sm" onclick="endTournamentAdmin('${t.id}')">🏁 End</button>` : ''}
                <button class="btn btn-red btn-sm" onclick="deleteTournamentAdmin('${t.id}')">🗑️ Delete</button>
            </div>
        </div>`;
    }).join('');
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
    renderSystemMatches(); 
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
                <td>
                    <button class="btn btn-ghost btn-sm" onclick="editPlayerAdmin('${p.playerId}')">✏️</button>
                    <button class="btn btn-red btn-sm" onclick="deletePlayerAdmin('${p.playerId}')">🗑️</button>
                </td>
            </tr>
        `).join('')}</tbody>
    </table>`;
}

function deletePlayerAdmin(id) {
    if (!confirm('Delete player?')) return;
    const all = DB.getPlayers().filter(p => p.playerId !== id);
    DB.savePlayers(all);
    DB.deletePlayerFromCloud(id);
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

function openAddPlayer() {
    document.getElementById('add-player-name').value = '';
    document.getElementById('add-player-role').value = 'batsman';
    document.getElementById('add-player-photo').value = '';
    document.getElementById('add-player-file').value = '';
    document.getElementById('add-player-preview').style.display = 'none';
    document.getElementById('add-player-preview').src = '';
    document.getElementById('modal-add-player').style.display = 'flex';
}

function encodePlayerImage(input, targetId) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        // Resize image to keep payload small for DB sync
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_SIZE = 150; // Keep it small for avatars
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                document.getElementById(targetId).value = dataUrl;
                
                const preview = document.getElementById('add-player-preview');
                preview.src = dataUrl;
                preview.style.display = 'block';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function saveNewPlayer() {
    const name = document.getElementById('add-player-name').value.trim();
    if (!name) {
        showToast('Please enter a player name', 'error');
        return;
    }
    const role = document.getElementById('add-player-role').value;
    const photo = document.getElementById('add-player-photo').value; // base64

    // Generate new player object
    const p = DB.addPlayer({
        name: name,
        role: role,
        photo: photo || null
    });

    if (p) {
        showToast('✅ Player Registered: ' + p.playerId, 'success');
        closeModal('modal-add-player');
        renderPlayersAdmin(); // refresh the player list
    } else {
        showToast('❌ Failed to register player', 'error');
    }
}

function editPlayerAdmin(id) {
    const p = DB.getPlayerById(id);
    if (!p) return;
    document.getElementById('edit-player-id').value = p.playerId;
    document.getElementById('edit-player-name').value = p.name;
    document.getElementById('edit-player-role').value = p.role || 'batsman';
    document.getElementById('edit-player-photo').value = p.photo || '';
    
    const preview = document.getElementById('edit-player-preview');
    if (p.photo) {
        preview.src = p.photo;
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
    
    showModal('modal-edit-player');
}

function savePlayerEditAdmin() {
    const id = document.getElementById('edit-player-id').value;
    const name = document.getElementById('edit-player-name').value.trim();
    const role = document.getElementById('edit-player-role').value;
    const photo = document.getElementById('edit-player-photo').value;

    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }

    const p = DB.getPlayerById(id);
    if (p) {
        p.name = name;
        p.role = role;
        p.photo = photo;
        DB.updatePlayer(p);
        showToast('✅ Player updated!', 'success');
        closeModal('modal-edit-player');
        renderPlayersAdmin();
    }
}
async function renderStoreItems() {
    const list = document.getElementById('store-list');
    const ordersList = document.getElementById('admin-orders-list');
    if (!list) return;

    // --- RENDER PRODUCTS ---
    const products = DB.getProducts();
    list.innerHTML = products.map(p => `
        <div class="card product-card">
            <div style="display:flex; justify-content:space-between; margin-bottom:12px">
                <span class="badge badge-blue">${p.category}</span>
                <span style="font-weight:700">Rs. ${p.price}</span>
            </div>
            <h4>${p.name}</h4>
            <p style="font-size:12px; color:var(--c-muted); margin-bottom:12px">Stock: ${p.stock}</p>
            <button class="btn btn-red btn-sm" onclick="deleteProduct('${p.id}')">🗑️ Delete</button>
        </div>
    `).join('');

    // --- RENDER ORDERS ---
    if (ordersList) {
        ordersList.innerHTML = '<div style="color:var(--c-muted)">Loading active orders...</div>';
        try {
            const r = await fetch(BACKEND_BASE_URL + '/sync/orders');
            const orders = await r.json();
            if (!orders || !orders.length) {
                ordersList.innerHTML = '<div style="color:var(--c-muted)">No orders found.</div>';
                return;
            }
            ordersList.innerHTML = orders.map(o => `
                <div class="card" style="margin-bottom:10px; background:rgba(0,0,0,0.02); border-left:4px solid var(--c-primary)">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
                        <span style="font-weight:700; color:var(--c-primary)">${o._id || o.id}</span>
                        <span style="font-size:12px; font-weight:700" class="badge ${o.status === 'pending' ? 'badge-amber' : 'badge-green'}">${o.status.toUpperCase()}</span>
                    </div>
                    <div style="font-size:14px; margin-bottom:8px">
                        <strong>Customer:</strong> ${o.name} (${o.phone})<br/>
                        <strong>Address:</strong> ${o.address}<br/>
                        <strong>Items:</strong> ${o.items?.map(i => `${i.qty}x ${i.name}`).join(', ') || 'None'}<br/>
                        <strong style="color:var(--c-green)">Total: Rs. ${o.total}</strong>
                    </div>
                    <div>
                         ${o.status === 'pending' ? `<button class="btn btn-primary btn-sm" onclick="completeOrder('${o._id || o.id}')">Mark Complete</button>` : ''}
                         <button class="btn btn-ghost btn-sm" onclick="deleteOrder('${o._id || o.id}')">🗑️ Remove</button>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            ordersList.innerHTML = '<div style="color:var(--c-red)">Failed to load orders from cloud.</div>';
        }
    }
}

async function completeOrder(id) {
    if(!confirm('Mark this order as completed?')) return;
    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/order', {
             method: 'POST',
             headers: {'Content-Type': 'application/json'},
             body: JSON.stringify({id, status: 'completed'})
        });
        if(r.ok) {
            showToast('Order completed!', 'success');
            renderStoreItems();
        }
    } catch(e) { showToast('Sync failed', 'error'); }
}

async function deleteOrder(id) {
    if(!confirm('Permanently remove this order?')) return;
    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/orders/' + id, { method: 'DELETE' });
        if(r.ok) {
            showToast('Order removed', 'success');
            renderStoreItems();
        }
    } catch(e) { showToast('Delete failed', 'error'); }
}

async function renderPostsAdmin() {
    const list = document.getElementById('admin-posts-list');
    if (!list) return;
    list.innerHTML = '<div>Loading posts...</div>';

    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/posts');
        const posts = await r.json();
        
        if (!posts || !posts.length) {
            list.innerHTML = '<div class="empty-state">No posts found.</div>';
            return;
        }

        list.innerHTML = posts.map(p => `
            <div class="card" style="margin-bottom:12px; border-left:4px solid ${p.status === 'pending' ? 'var(--c-amber)' : 'var(--c-primary)'}">
                <div style="display:flex; justify-content:space-between">
                    <strong>${p.author === 'Admin' ? '🛡️' : '👤'} ${p.title || 'Untitled'} <span class="badge ${p.status==='pending' ? 'badge-amber' : 'badge-green'}">${p.status}</span></strong>
                    <span style="font-size:12px; color:var(--c-muted)">${new Date(p.createdAt).toLocaleString()}</span>
                </div>
                ${p.image ? `<img src="${p.image}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px; margin:10px 0;" />` : ''}
                <div style="margin:10px 0; line-height:1.5">${p.content}</div>
                <div>
                    ${p.status === 'pending' ? `<button class="btn btn-green btn-sm" onclick='approvePost(${JSON.stringify(p.id)}, ${JSON.stringify(p.title || '')}, ${JSON.stringify(p.content || '')}, ${JSON.stringify(p.image || '')})'>✅ Approve</button>` : ''}
                    <button class="btn ${p.status === 'pending' ? 'btn-red' : 'btn-ghost'} btn-sm" onclick="deletePostAdmin('${p.id}')">${p.status === 'pending' ? '❌ Reject' : '🗑️ Delete'}</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div style="color:var(--c-red)">Failed to load posts from cloud.</div>';
    }
}

async function approvePost(id, title, content, image) {
    try {
        const post = {
            id,
            title,
            content,
            image: image || null,
            status: 'approved',
            updatedAt: Date.now()
        };
        const r = await fetch(BACKEND_BASE_URL + '/sync/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(post)
        });
        if (r.ok) {
            showToast('✅ Post approved', 'success');
            renderPostsAdmin();
        }
    } catch(e) {
        showToast('❌ Failed to approve', 'error');
    }
}

async function renderFeedbackAdmin() {
    const list = document.getElementById('admin-feedback-list');
    if (!list) return;
    list.innerHTML = '<div>Loading feedback...</div>';

    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/feedback');
        const feedbacks = await r.json();
        
        if (!feedbacks || !feedbacks.length) {
            list.innerHTML = '<div class="empty-state">No feedback yet.</div>';
            return;
        }

        list.innerHTML = feedbacks.map(f => `
            <div class="card" style="margin-bottom:12px">
                <div style="display:flex; justify-content:space-between">
                    <span style="font-size:12px; color:var(--c-muted)">${new Date(f.createdAt).toLocaleString()}</span>
                    <button class="btn btn-ghost btn-sm" onclick="deleteFeedback('${f.id}')">🗑️ Delete</button>
                </div>
                <div style="margin:10px 0; line-height:1.5">${f.message}</div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div style="color:var(--c-red)">Failed to load feedback.</div>';
    }
}

async function deleteFeedback(id) {
    if (!confirm('Delete this feedback?')) return;
    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/feedback/' + id, { method: 'DELETE' });
        if (r.ok) {
            showToast('🗑️ Feedback deleted', 'success');
            renderFeedbackAdmin();
        }
    } catch (e) {
        showToast('❌ Delete failed', 'error');
    }
}

function openAdminCreatePost() {
    document.getElementById('admin-post-title').value = '';
    document.getElementById('admin-post-content').value = '';
    document.getElementById('admin-post-image-data').value = '';
    document.getElementById('admin-post-preview').style.display = 'none';
    showModal('modal-admin-post');
}

function encodePostImage(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200;
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                document.getElementById('admin-post-image-data').value = dataUrl;
                
                const preview = document.getElementById('admin-post-preview');
                preview.src = dataUrl;
                preview.style.display = 'block';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function submitAdminPost() {
    const title   = document.getElementById('admin-post-title').value.trim();
    const content = document.getElementById('admin-post-content').value.trim();
    const image   = document.getElementById('admin-post-image-data').value || null;

    if (!content) {
        showToast('❌ Please write some content first', 'error');
        return;
    }

    const post = {
        id: 'POST-' + Date.now(),
        author: 'Admin',
        title: title || 'SLCRICKPRO Update',
        content,
        image,
        createdAt: Date.now()
    };

    // Disable button to prevent double-submit
    const btn = event && event.target;
    if (btn) btn.disabled = true;

    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(post)
        });

        let result = {};
        try { result = await r.json(); } catch (_) {}

        if (r.ok && result.ok !== false) {
            showToast('✅ Post published! All users will see it now.', 'success');
            closeModal('modal-admin-post');
            renderPostsAdmin();
        } else {
            showToast('❌ Server error: ' + (result.error || r.status), 'error');
        }
    } catch (e) {
        console.error('Post publish error:', e);
        showToast('❌ Could not reach server. Check connection.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function deletePostAdmin(id) {
    if (!confirm('Delete this post?')) return;
    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/posts/' + id, { method: 'DELETE' });
        if (r.ok) {
            showToast('🗑️ Post deleted', 'success');
            renderPostsAdmin();
        }
    } catch (e) {
        showToast('❌ Delete failed', 'error');
    }
}
