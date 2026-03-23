// ================================================
//  SLCRICKPRO – Central Database (localStorage)
// ================================================

const DB_KEYS = {
    PLAYERS: 'cricpro_players',
    TEAMS: 'cricpro_teams',
    MATCHES: 'cricpro_matches',
    TOURNAMENTS: 'cricpro_tournaments',
    PRODUCTS: 'cricpro_products',
    ORDERS: 'cricpro_orders',
    SETTINGS: 'cricpro_settings',
};

const DB = {

    // ---------- SECURE STORAGE ----------
    _secureSet(key, val) {
        try {
            const str = JSON.stringify(val);
            const enc = btoa(encodeURIComponent(str));
            localStorage.setItem(key, 'SECURE_' + enc);
        } catch(e) { console.error("Storage err", e); }
    },
    _secureGet(key, def) {
        const raw = localStorage.getItem(key);
        if (!raw) return def;
        if (raw.startsWith('SECURE_')) {
            try { return JSON.parse(decodeURIComponent(atob(raw.substring(7)))); } catch(e) { return def; }
        } else {
            try { return JSON.parse(raw); } catch(e) { return def; }
        }
    },

    // ---------- PLAYERS ----------
    getPlayers() {
        return this._secureGet(DB_KEYS.PLAYERS, []);
    },
    savePlayers(arr) {
        this._secureSet(DB_KEYS.PLAYERS, arr);
        // Track the highest ID seen to prevent collisions even if cache is temporarily empty
        if (arr && arr.length > 0) {
            const ids = arr.map(p => {
                const m = (p.playerId || '').match(/CP-?(\d+)/);
                return m ? parseInt(m[1]) || 0 : 0;
            });
            const max = Math.max(...ids);
            const currentLast = parseInt(localStorage.getItem('cricpro_last_pid')) || 0;
            if (max > currentLast) {
                localStorage.setItem('cricpro_last_pid', max.toString());
            }
        }
    },
    _syncAllPlayers(arr) {
        // Bulk push all players to MongoDB
        arr.forEach(p => syncToDB('player', p));
    },
    addPlayer(player) {
        const arr = this.getPlayers();
        const id = this.generatePlayerId(arr);
        player.playerId = id;
        player.createdAt = Date.now();
        player.stats = player.stats || {
            matches: 0, innings: 0,
            runs: 0, balls: 0, fours: 0, sixes: 0, notOuts: 0,
            highScore: 0, hundreds: 0, fifties: 0,
            wickets: 0, overs: 0, bowlingRuns: 0, maidens: 0, bestBowling: "0/0",
            catches: 0, stumpings: 0,
        };
        arr.push(player);
        this.savePlayers(arr);
        // Ensure last ID is tracked immediately
        const m = (player.playerId || '').match(/CP-?(\d+)/);
        if (m) {
            localStorage.setItem('cricpro_last_pid', (parseInt(m[1]) || 0).toString());
        }
        // Sync to MongoDB
        syncToDB('player', player);
        return player;
    },
    generatePlayerId(arr) {
        const lastPid = parseInt(localStorage.getItem('cricpro_last_pid')) || 0;
        let max = lastPid;

        if (arr && arr.length > 0) {
            const nums = arr.map(p => {
                const match = (p.playerId || '').match(/CP-?(\d+)/);
                return match ? parseInt(match[1]) || 0 : 0;
            });
            max = Math.max(max, ...nums);
        }
        
        return 'CP' + String(max + 1).padStart(4, '0');
    },
    getPlayerById(id) {
        return this.getPlayers().find(p => p.playerId === id);
    },
    updatePlayerStats(playerId, stats) {
        const arr = this.getPlayers();
        const idx = arr.findIndex(p => p.playerId === playerId);
        if (idx !== -1) {
            arr[idx].stats = { ...arr[idx].stats, ...stats };
            this.savePlayers(arr);
            // Also sync updated stats to MongoDB
            syncToDB('player', arr[idx]);
        }
    },

    // ---------- TEAMS ----------
    getTeams() {
        return this._secureGet(DB_KEYS.TEAMS, []);
    },
    saveTeams(arr) {
        this._secureSet(DB_KEYS.TEAMS, arr);
    },
    _syncAllTeams(arr) {
        // Bulk push all teams to MongoDB
        arr.forEach(t => syncToDB('team', t));
    },
    updateTeamStats(teamName, stats) {
        const arr = this.getTeams();
        const idx = arr.findIndex(t => t.name === teamName);
        if (idx !== -1) {
            arr[idx].stats = { ...arr[idx].stats, ...stats };
            this.saveTeams(arr);
            syncToDB('team', arr[idx]);
        }
    },
    addTeam(team) {
        const arr = this.getTeams();
        team.id = 'TEAM-' + Date.now();
        team.createdAt = Date.now();
        arr.push(team);
        this.saveTeams(arr);
        // Sync to MongoDB
        syncToDB('team', team);
        return team;
    },

    // ---------- MATCHES ----------
    getMatches() {
        return this._secureGet(DB_KEYS.MATCHES, []);
    },
    saveMatches(arr) {
        this._secureSet(DB_KEYS.MATCHES, arr);
    },
    getMatch(id) {
        return this.getMatches().find(m => m.id === id);
    },
    saveMatch(match) {
        const arr = this.getMatches();
        const idx = arr.findIndex(m => m.id === match.id);
        if (idx !== -1) arr[idx] = match; else arr.push(match);
        this.saveMatches(arr);
        syncToDB('match', match);
    },
    deleteMatch(id) {
        let arr = this.getMatches();
        arr = arr.filter(m => m.id !== id);
        this.saveMatches(arr);
        // Also remove reference from related tournament
        const tourns = this.getTournaments();
        tourns.forEach(t => {
            if (t.matches && t.matches.includes(id)) {
                t.matches = t.matches.filter(mId => mId !== id);
                this.saveTournament(t);
            }
        });
        // Sync deletion to cloud
        this.deleteMatchFromCloud(id);
    },
    deleteMatchFromCloud(id) {
        if (!BACKEND_BASE_URL) return;
        fetch(BACKEND_BASE_URL + '/sync/matches/' + id, { method: 'DELETE' })
            .catch(() => {});
    },
    createMatch(config) {
        const match = {
            id: 'MATCH-' + Date.now(),
            createdAt: Date.now(),
            status: 'setup', // setup | live | paused | completed
            publishLive: config.type === 'tournament' ? true : false,
            type: config.type || 'single', // single | tournament
            tournamentId: config.tournamentId || null,
            tournamentName: config.tournamentName || null,
            password: config.password || null,
            venue: config.venue || '',
            overs: parseInt(config.overs) || 20,
            ballsPerOver: parseInt(config.ballsPerOver) || 6,
            playersPerSide: parseInt(config.playersPerSide) || 11,
            team1: config.team1 || 'Team 1',
            team2: config.team2 || 'Team 2',
            tossWinner: config.tossWinner || config.team1,
            tossDecision: config.tossDecision || 'bat',
            // batting order
            battingFirst: config.battingFirst || config.team1,
            fieldingFirst: config.fieldingFirst || config.team2,
            // innings data
            innings: [null, null],
            currentInnings: 0,
            // history stack for undo/redo
            history: [],
            redoStack: [],
        };
        // init first innings
        match.innings[0] = this.createInnings(match.battingFirst, match.fieldingFirst);
        this.saveMatch(match);
        return match;
    },
    createInnings(battingTeam, bowlingTeam) {
        return {
            battingTeam,
            bowlingTeam,
            runs: 0, wickets: 0,
            balls: 0, // legal balls
            extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
            overHistory: [], // array of overs, each over = array of ball events
            currentOver: [],
            batsmen: [], // list of batsman objects
            bowlers: [], // list of bowling summary objects
            currentBatsmenIdx: [0, 1], // indices into batsmen[]
            strikerIdx: 0,
            currentBowlerIdx: null,
            fallOfWickets: [],
            partnerships: [],
            isDone: false,
            result: null,
        };
    },

    // ---------- REQUESTS ----------
    getRequests() {
        return this._secureGet('cricpro_requests', []);
    },
    saveRequests(arr) {
        this._secureSet('cricpro_requests', arr);
    },
    addRequest(req) {
        const arr = this.getRequests();
        req.id = 'REQ-' + Date.now();
        req.createdAt = Date.now();
        req.status = 'pending';
        arr.push(req);
        this.saveRequests(arr);
        return req;
    },

    // ---------- TOURNAMENTS ----------
    getTournaments() {
        return this._secureGet(DB_KEYS.TOURNAMENTS, []);
    },
    saveTournaments(arr) {
        this._secureSet(DB_KEYS.TOURNAMENTS, arr);
    },
    getTournament(id) {
        return this.getTournaments().find(t => t.id === id);
    },
    saveTournament(t) {
        const arr = this.getTournaments();
        const idx = arr.findIndex(x => x.id === t.id);
        if (idx !== -1) arr[idx] = t; else arr.push(t);
        this.saveTournaments(arr);
        syncToDB('tournament', t);
    },
    deleteTournament(id) {
        // Cascade delete all matches belonging to this tournament
        let mArr = this.getMatches();
        const matchesToDelete = mArr.filter(m => m.tournamentId === id);
        mArr = mArr.filter(m => m.tournamentId !== id);
        this.saveMatches(mArr);
        
        // Sync match deletions to cloud
        matchesToDelete.forEach(m => this.deleteMatchFromCloud(m.id));

        // Delete the tournament record
        let arr = this.getTournaments();
        arr = arr.filter(t => t.id !== id);
        this.saveTournaments(arr);
        this.deleteTournamentFromCloud(id);
    },
    deleteTournamentFromCloud(id) {
        if (!BACKEND_BASE_URL) return;
        fetch(BACKEND_BASE_URL + '/sync/tournaments/' + id, { method: 'DELETE' })
            .catch(() => {});
    },
    createTournament(cfg) {
        const t = {
            id: 'TOURN-' + Date.now(),
            name: cfg.name,
            format: cfg.format || 'league', // league | knockout
            overs: cfg.overs || 20,
            ballsPerOver: cfg.ballsPerOver || 6,
            startDate: cfg.startDate || '',
            teams: cfg.teams || [],
            matches: [],
            standings: {},
            createdAt: Date.now(),
            status: 'active', // active | completed
            isOfficial: cfg.isOfficial || false,
            matchCount: cfg.matchCount || 0,
            prizes: cfg.prizes || { first: '', second: '', third: '' },
        };
        // Pre-schedule matches
        if (cfg.matchCount > 0) {
            for (let i = 1; i <= cfg.matchCount; i++) {
                let mName = `Match ${i}`;
                if (i === cfg.matchCount) mName = "Final 🏆";
                else if (i === cfg.matchCount - 1) mName = "Qualifier 2 🏏";
                else if (i === cfg.matchCount - 2) mName = "Eliminator 💥";
                else if (i === cfg.matchCount - 3 && cfg.matchCount >= 4) mName = "Qualifier 1 🏏";

                const isFinals = (i >= cfg.matchCount - 3);
                let team1 = "TBD";
                let team2 = "TBD";
                if (!isFinals && t.teams.length >= 2) {
                    team1 = t.teams[(i - 1) % t.teams.length];
                    team2 = t.teams[i % t.teams.length];
                    if (team1 === team2) team2 = t.teams[(i + 1) % t.teams.length];
                }

                const match = this.createMatch({
                    type: 'tournament',
                    tournamentId: t.id,
                    tournamentName: t.name,
                    team1: team1,
                    team2: team2,
                    overs: t.overs,
                    ballsPerOver: t.ballsPerOver,
                    password: null // set later via request
                });
                match.status = 'scheduled';
                match.scheduledName = mName;
                this.saveMatch(match);
                t.matches.push(match.id);
            }
        }
        // init standings
        t.teams.forEach(team => {
            t.standings[team] = {
                played: 0, won: 0, lost: 0, tied: 0,
                points: 0, for: 0, against: 0, nrr: 0,
                runsScored: 0, ballsFaced: 0,
                runsConceded: 0, ballsBowled: 0,
            };
        });
        this.saveTournament(t);
        return t;
    },

    // ---------- PRODUCTS ----------
    getProducts() {
        return this._secureGet(DB_KEYS.PRODUCTS, []);
    },
    saveProducts(arr) {
        this._secureSet(DB_KEYS.PRODUCTS, arr);
        // Sync every product to MongoDB so all devices see updates
        arr.forEach(p => syncProductToDB(p));
    },
    deleteProductFromCloud(id) {
        if (!BACKEND_BASE_URL) return;
        fetch(BACKEND_BASE_URL + '/sync/products/' + id, { method: 'DELETE' })
            .catch(() => {});
    },

    deletePlayerFromCloud(id) {
        if (!BACKEND_BASE_URL) return;
        fetch(BACKEND_BASE_URL + '/players/' + id, { method: 'DELETE' })
            .catch(() => {});
    },
    // ---------- ORDERS ----------
    getOrders() {
        return this._secureGet(DB_KEYS.ORDERS, []);
    },
    saveOrders(arr) {
        this._secureSet(DB_KEYS.ORDERS, arr);
    },
    addOrder(order) {
        const arr = this.getOrders();
        order.id = 'ORD-' + Date.now();
        order.date = Date.now();
        order.status = 'pending';
        arr.push(order);
        this.saveOrders(arr);
        // Sync to Google Sheets
        syncToSheets('order', order);
        return order;
    },
    addTeamToSheets(team) {
        syncToDB('team', team);
    },

    // ---------- SETTINGS ----------
    getSettings() {
        return this._secureGet(DB_KEYS.SETTINGS, {});
    },
    saveSetting(key, val) {
        const s = this.getSettings();
        s[key] = val;
        this._secureSet(DB_KEYS.SETTINGS, s);
    },
};

// ============================================================
//  BACKEND SYNC → MongoDB Atlas (via Express server)
// ============================================================

// Default: local server for dev, current domain /api for production (Vercel)
const BACKEND_BASE_URL = localStorage.getItem('cricpro_backend_url') || 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? 'http://localhost:3000' 
        : window.location.origin + '/api');

/**
 * Sync a player or team to MongoDB.
 * type: 'player' | 'team'
 */
function syncToDB(type, data) {
    if (!BACKEND_BASE_URL) return;
    let endpoint = '';
    if (type === 'player') endpoint = '/players';
    else if (type === 'team') endpoint = '/teams';
    else if (type === 'match') endpoint = '/sync/match';
    else if (type === 'tournament') endpoint = '/sync/tournament';

    console.log(`📡 Syncing ${type} to: ${BACKEND_BASE_URL + endpoint}`);
    fetch(BACKEND_BASE_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    })
    .then(r => r.json())
    .then(d => console.log('✅ Sync response:', d))
    .catch(err => console.error('❌ Sync failed:', err));
}

/**
 * Sync a single product to MongoDB.
 */
function syncProductToDB(product) {
    if (!BACKEND_BASE_URL || !product || !product.id) return;
    fetch(BACKEND_BASE_URL + '/sync/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product),
    }).catch(() => {});
}

/**
 * Push career stats for one player to MongoDB.
 * Called after every official tournament completes.
 */
function pushPlayerStats(playerId, stats) {
    if (!BACKEND_BASE_URL) return;
    fetch(BACKEND_BASE_URL + '/stats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, stats }),
    }).catch(() => {});
}

/**
 * Bulk-push stats for ALL players who played in a tournament.
 * Call this when an official tournament completes.
 */
function pushAllStatsAfterTournament(tournamentId) {
    if (!BACKEND_BASE_URL) return;
    const tournament = DB.getTournament(tournamentId);
    if (!tournament || !tournament.isOfficial) return;

    const allPlayers = DB.getPlayers();
    // Only push players who have played at least one match
    const toSync = allPlayers
        .filter(p => p.stats && (p.stats.matches > 0 || p.stats.runs > 0 || p.stats.wickets > 0))
        .map(p => ({ playerId: p.playerId, stats: p.stats }));

    if (!toSync.length) return;

    fetch(BACKEND_BASE_URL + '/stats/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ players: toSync }),
    }).then(r => r.json()).then(d => {
        console.log('✅ Player stats synced to MongoDB:', d);
    }).catch(() => {});

    // Also sync team stats (cumulative career stats)
    const allTeams = DB.getTeams();
    allTeams.forEach(team => {
        // Sync the entire cumulative stats object for this team
        if (team.stats && team.stats.played > 0) {
            fetch(BACKEND_BASE_URL + '/team-stats/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: team.id, stats: team.stats }),
            }).catch(() => {});
        }
    });
}

function setSheetsUrl(url) {
    localStorage.setItem('cricpro_backend_url', url);
    location.reload();
}


// ================================================
// UTILITY FUNCTIONS (used across all pages)
// ================================================

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

// Global Security: Sanitize all innerHTML assignments against common XSS
// This securely intercepts and sanitizes payload without breaking legitimate app functionalities.
const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
if (originalInnerHTML) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
        set: function(value) {
            let clean = typeof value === 'string' ? value : String(value);
            // 1. Remove script tags
            clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            // 2. Remove dangerous objects
            clean = clean.replace(/<(object|embed|iframe|applet|meta|base)\b[^>]*>/gi, '');
            // 3. Neutralize javascript: protocols
            clean = clean.replace(/href\s*=\s*(['"]?)javascript:[^'"]*\1/gi, 'href="javascript:void(0);"');
            // 4. Strip dangerous on* handlers (like onerror, onmouseover) but preserve legitimate ones: onclick, onchange, oninput
            clean = clean.replace(/\bon(?!(click|change|input)\b)\w+\s*=\s*(['"])(.*?)\2/gi, '');
            return originalInnerHTML.set.call(this, clean);
        },
        get: function() {
            return originalInnerHTML.get.call(this);
        }
    });
}


function showToast(msg, type = 'default') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function formatCRR(runs, balls) {
    if (!balls) return '0.00';
    return ((runs / balls) * 6).toFixed(2);
}

function formatOvers(balls, bpo = 6) {
    const ov = Math.floor(balls / bpo);
    const b = balls % bpo;
    return `${ov}.${b}`;
}

function formatSR(runs, balls) {
    if (!balls) return '0.0';
    return ((runs / balls) * 100).toFixed(1);
}

function formatEcon(runs, balls, bpo = 6) {
    if (!balls) return '0.0';
    return ((runs / balls) * bpo).toFixed(1);
}

function timeSince(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return Math.round(d) + 's ago';
    if (d < 3600) return Math.round(d / 60) + 'm ago';
    if (d < 86400) return Math.round(d / 3600) + 'h ago';
    return Math.round(d / 86400) + 'd ago';
}

// High Security Global Error Catcher
window.onerror = function (msg, url, lineNo, columnNo, error) {
    showErrorInsideProgram(msg, url, lineNo);
    return false;
};

window.addEventListener('unhandledrejection', function(event) {
    showErrorInsideProgram("Promise Rejection: " + (event.reason ? event.reason.message || event.reason : ""), "", "");
});

function showErrorInsideProgram(msg, url, lineNo) {
    let errBox = document.getElementById('cricpro-global-error');
    if (!errBox) {
        errBox = document.createElement('div');
        errBox.id = 'cricpro-global-error';
        errBox.style = 'position:fixed;top:20px;right:20px;z-index:2147483647;background:#d32f2f;color:#fff;padding:15px;border-radius:6px;width:300px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-family:sans-serif;font-size:14px;border-left:5px solid #ff9800';
        errBox.innerHTML = `
            <div style="font-weight:900;margin-bottom:5px;display:flex;justify-content:space-between">
                <span>SYSTEM ERROR</span>
                <span style="cursor:pointer" onclick="this.parentElement.parentElement.remove()">✖</span>
            </div>
            <div id="cricpro-error-text" style="word-wrap:break-word;font-family:monospace;font-size:12px;"></div>
        `;
        if (document.body) {
            document.body.appendChild(errBox);
        } else {
            window.addEventListener('DOMContentLoaded', () => document.body.appendChild(errBox));
        }
    }
    const txt = document.getElementById('cricpro-error-text');
    if(txt) txt.innerHTML += `<div style="margin-top:5px;border-top:1px solid rgba(255,255,255,0.2);padding-top:5px">↳ ${msg} at line ${lineNo||'?'}</div>`;
}

// Service Worker Registration for PWA / Offline capability
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Register sw.js relative to the domain root
        navigator.serviceWorker.register('/sw.js').then(reg => {
            console.log('SW registered! Scope:', reg.scope);
        }).catch(err => {
            console.log('SW registration failed:', err);
        });
    });
}

// ============================================================
// FULL DATA POLLING SYNC (Players, Teams, Matches, Tournaments)
// ============================================================
function pullLiveUpdates() {
    if (!BACKEND_BASE_URL) return;
    const isScorer = window.location.pathname.includes('score-match.html') || window.location.pathname.includes('admin.html');

    // ── Players ──────────────────────────────────────────────
    fetch(BACKEND_BASE_URL + '/players')
        .then(r => r.json())
        .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                const mapped = data.map(p => ({ ...p, playerId: p.playerId || p._id }));
                DB.savePlayers(mapped);
            }
        }).catch(() => {});

    // ── Teams ────────────────────────────────────────────────
    fetch(BACKEND_BASE_URL + '/teams')
        .then(r => r.json())
        .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                DB.saveTeams(data);
            }
        }).catch(() => {});

    // ── Matches ──────────────────────────────────────────────
    fetch(BACKEND_BASE_URL + '/sync/matches')
        .then(r => r.json())
        .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                if (!isScorer) DB.saveMatches(data);
                if (isScorer && !window.hasFetchedCloudOnce) DB.saveMatches(data);
            }
        }).catch(() => {});

    // ── Tournaments ──────────────────────────────────────────
    fetch(BACKEND_BASE_URL + '/sync/tournaments')
        .then(r => r.json())
        .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                if (!isScorer) DB.saveTournaments(data);
                if (isScorer && !window.hasFetchedCloudOnce) DB.saveTournaments(data);
            }
        }).catch(() => {});

    // ── Products ────────────────────────────────────────────────────────
    fetch(BACKEND_BASE_URL + '/sync/products')
        .then(r => r.json())
        .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                const mapped = data.map(p => ({ ...p, id: p.id || p._id }));
                DB.saveProducts(mapped);
                // If the store page is open, re-render
                if (typeof renderProducts === 'function') renderProducts();
            }
        }).catch(() => {});

    if (isScorer) window.hasFetchedCloudOnce = true;
}

// All pages poll every 5s to stay in sync
setInterval(pullLiveUpdates, 5000);
// Everyone grabs an initial clone on page boot
setTimeout(pullLiveUpdates, 500);
