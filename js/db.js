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

// SLCRICKPRO – Theme Logic (Global)
(function() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        const apply = () => document.body.classList.add('light-mode');
        if (document.body) apply();
        else document.addEventListener('DOMContentLoaded', apply);
    }
})();

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('img').forEach((img) => {
        if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
    });
});

window.toggleTheme = function() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    if (typeof showToast === 'function') {
        showToast(`🌓 Switched to ${isLight ? 'Light' : 'Dark'} mode`, 'default');
    }
};

function showErrorInsideProgram(msg, url, line) {
    console.error("Critical Error:", msg, "at", url, ":", line);
    showToast("⚠️ Operation Error: " + msg, "error");
}

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
            highScore: 0, hundreds: 0, fifties: 0, thirties: 0,
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
        team.stats = team.stats || {
            played: 0, won: 0, lost: 0, tied: 0,
            runsScored: 0, ballsFaced: 0,
            runsConceded: 0, ballsBowled: 0,
            prizeMoney: 0
        };
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
    saveMatch(match, skipCloud = false) {
        match.lastUpdated = Date.now();
        const arr = this.getMatches();
        const idx = arr.findIndex(m => m.id === match.id);
        if (idx !== -1) arr[idx] = match; else arr.push(match);
        this._secureSet(DB_KEYS.MATCHES, arr);
        if (!skipCloud) syncToDB('match', match);
    },
    // New: specialized save that ensures we get a token back for new tournaments
    async saveTournamentWithAuth(tourn) {
        tourn.lastUpdated = Date.now();
        const arr = this.getTournaments();
        const idx = arr.findIndex(t => t.id === tourn.id);
        if (idx !== -1) arr[idx] = tourn; else arr.push(tourn);
        this._secureSet(DB_KEYS.TOURNAMENTS, arr);

        // Sync and capture token if returned
        if (BACKEND_BASE_URL) {
            try {
                const resp = await fetch(BACKEND_BASE_URL + '/sync/tournament', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(tourn)
                });
                const d = await resp.json();
                if (d.token) {
                    localStorage.setItem('cricpro_token', d.token);
                    localStorage.setItem('cricpro_token_expiry', (Date.now() + d.expiresInMs).toString());
                }
            } catch(e) { console.warn('Cloud save error:', e); }
        }
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
            scoringPassword: config.scoringPassword || null,
            scorerName: config.scorerName || '',
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
    saveTournament(tourn, skipCloud = false) {
        tourn.lastUpdated = Date.now();
        const arr = this.getTournaments();
        const idx = arr.findIndex(t => t.id === tourn.id);
        if (idx !== -1) arr[idx] = tourn; else arr.push(tourn);
        this._secureSet(DB_KEYS.TOURNAMENTS, arr);
        if (!skipCloud) syncToDB('tournament', tourn);
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
    async createTournament(cfg) {
        const t = {
            id: 'TOURN-' + Date.now(),
            name: cfg.name,
            format: cfg.format || 'league',
            overs: cfg.overs || 20,
            ballsPerOver: cfg.ballsPerOver || 6,
            startDate: cfg.startDate || '',
            teams: cfg.teams || [],
            matches: [],
            standings: {},
            createdAt: Date.now(),
            status: 'active',
            isOfficial: cfg.isOfficial || false,
            matchCount: cfg.matchCount || 0,
            totalTeams: cfg.totalTeams || cfg.teams.length,
            prizes: cfg.prizes || { first: '', second: '', third: '' },
            scoringPassword: cfg.scoringPassword || null,
            rosters: {},
        };

        if (t.format === 'knockout') {
            this._generateKnockoutMatches(t);
        } else if (cfg.matchCount > 0) {
            for (let i = 1; i <= cfg.matchCount; i++) {
                const match = this.createMatch({
                    type: 'tournament',
                    tournamentId: t.id,
                    tournamentName: t.name,
                    team1: "TBD", team2: "TBD",
                    overs: t.overs, ballsPerOver: t.ballsPerOver,
                    scoringPassword: t.scoringPassword
                }, true); // skipCloud during initial creation
                match.status = 'scheduled';
                match.scheduledName = `Match ${i}`;
                match.publishLive = true; // Tournament matches should be visible to everyone
                this.saveMatch(match, true);
                t.matches.push(match.id);
            }
        }
        
        this.saveTournament(t); // This syncs the tournament
        
        // SEQUENTIAL SYNC: Sync matches to cloud one by one to avoid overwhelming server
        if (t.matches.length > 0) {
            console.log("🕒 Bulk syncing tournament matches...");
            for (const mId of t.matches) {
                const m = this.getMatch(mId);
                if (m) syncToDB('match', m);
                await new Promise(r => setTimeout(r, 100)); // Small delay
            }
        }
        
        // Force UI refresh if available
        if (typeof renderOngoing === 'function') renderOngoing();
        
        return t;
    },

    _generateKnockoutMatches(t) {
        const N = t.totalTeams;
        const rounds = Math.ceil(Math.log2(N));
        const totalMatches = N - 1;
        
        let matchIndex = 1;
        let currentRoundTeams = [];
        
        // Populate initial teams (fill with 'TBD' if needed)
        for (let i = 0; i < N; i++) {
            currentRoundTeams.push(t.teams[i] || `Team ${i + 1}`);
        }

        let roundNodes = []; // Tracks matches in current round to link to next
        let prevRoundMatches = currentRoundTeams.map(name => ({ type: 'team', name }));

        for (let r = 1; r <= rounds; r++) {
            const nextRoundMatches = [];
            const roundMatchCount = Math.floor(prevRoundMatches.length / 2);
            
            for (let i = 0; i < roundMatchCount; i++) {
                const node1 = prevRoundMatches[i * 2];
                const node2 = prevRoundMatches[i * 2 + 1];
                
                const mName = (r === rounds) ? "Final 🏆" : 
                             (r === rounds - 1) ? `Semi-Final ${i + 1}` : 
                             `Round ${r} - Match ${matchIndex}`;
                
                const match = this.createMatch({
                    type: 'tournament', tournamentId: t.id, tournamentName: t.name,
                    team1: node1.type === 'team' ? node1.name : 'TBD',
                    team2: node2.type === 'team' ? node2.name : 'TBD',
                    overs: t.overs, ballsPerOver: t.ballsPerOver,
                    scoringPassword: t.scoringPassword
                });

                match.status = 'scheduled';
                match.scheduledName = mName;
                match.publishLive = true; // Tournament matches should be visible to everyone
                match.knockout = { round: r, matchNum: matchIndex, nextMatchIndex: null, slot: null };
                
                // Link predecessors to this match
                if (node1.type === 'match') { node1.ref.knockout.nextMatchId = match.id; node1.ref.knockout.slot = 1; this.saveMatch(node1.ref); }
                if (node2.type === 'match') { node2.ref.knockout.nextMatchId = match.id; node2.ref.knockout.slot = 2; this.saveMatch(node2.ref); }

                this.saveMatch(match);
                t.matches.push(match.id);
                nextRoundMatches.push({ type: 'match', id: match.id, ref: match });
                matchIndex++;
            }

            // Handle Byes (if odd numbered nodes)
            if (prevRoundMatches.length % 2 === 1) {
                nextRoundMatches.push(prevRoundMatches[prevRoundMatches.length - 1]);
            }
            prevRoundMatches = nextRoundMatches;
        }
    },

    // ---------- PRODUCTS ----------
    getProducts() {
        return this._secureGet(DB_KEYS.PRODUCTS, []);
    },
    saveProducts(arr, options = {}) {
        this._secureSet(DB_KEYS.PRODUCTS, arr);
        // Skip cloud push when data came from cloud polling to avoid sync loops.
        if (options.skipSync) return;
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
        
        // Sync to MongoDB Cloud
        if (typeof syncToDB === 'function') {
            syncToDB('order', order);
        }
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

// Auto-detected Backend & Socket
// Auto-detected Backend & Socket
const isProd = window.location.hostname === 'slcrickpro.live' || 
               window.location.hostname === 'www.slcrickpro.live' ||
               (window.location.hostname !== 'localhost' && 
                window.location.hostname !== '127.0.0.1' &&
                !window.location.hostname.includes('192.168.') && 
                !window.location.hostname.includes('10.0.0.'));

const isVercel = window.location.hostname.includes('vercel.app');
const isCustomDomain = window.location.hostname === 'slcrickpro.live';

const BACKEND_BASE_URL = localStorage.getItem('cricpro_backend_url') || (
    (isVercel || isCustomDomain) 
        ? window.location.origin + "/api" 
        : (isProd ? "https://slcrickpro-server.onrender.com" : "http://" + window.location.hostname + ":3000")
);

// Expose globally so inline scripts (loginToMatch, etc.) can reference it
window.BACKEND_BASE_URL = BACKEND_BASE_URL;

let socket = null;
if (typeof io !== 'undefined') {
    socket = io(BACKEND_BASE_URL);
    socket.on('connect', () => console.log('📡 Connected to Real-time Sync Server'));
    
    // Immediate refresh on match-specific updates
    socket.on('scoreUpdate', (data) => {
        console.log('⚡ Score Update received:', data);
        if (data && data.id) {
            DB.saveMatch(data, true); 
            if (typeof renderOngoing === 'function') renderOngoing();
            if (typeof window.renderOngoing === 'function') window.renderOngoing();
        } else { pullGlobalData(); }
    });

    // Handle global updates
    socket.on('globalUpdate', (info) => {
        console.log('🌍 Global Update received:', info);
        if (info.type === 'match' && info.data) {
            DB.saveMatch(info.data, true);
        } else if (info.type === 'tournament' && info.data) {
            DB.saveTournament(info.data, true);
        } else {
            pullGlobalData();
            return;
        }
        if (typeof renderOngoing === 'function') renderOngoing();
        if (typeof window.renderOngoing === 'function') window.renderOngoing();
        if (typeof updateTicker === 'function') updateTicker();
    });

    socket.on('broadcastCmd', (data) => {
        console.log('📺 Broadcast Command received:', data);
        if (typeof handleBroadcastEvent === 'function') handleBroadcastEvent(data);
    });
}

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
    else if (type === 'order') endpoint = '/sync/order';

    console.log(`📡 Syncing ${type} to: ${BACKEND_BASE_URL + endpoint}`);
    const token = localStorage.getItem('cricpro_token');
    const headers = { 
        'Content-Type': 'application/json',
        'x-api-key': 'slcrickpro-v1' // Simple API secret for backend consistency
    };
    if (token) headers['x-scoring-token'] = token;

    fetch(BACKEND_BASE_URL + endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data),
    })
    .then(r => r.json())
    .then(d => {
        if (d.error === 'Unauthorized scoring session') {
            console.warn('Scoring token expired or invalid.');
            showToast('🔄 Sync limited: Please re-authorize session', 'default');
        }
    })
    .catch(err => console.error('❌ Sync failed:', err));
}

/**
 * Handle password verification before scoring a remote match.
 */
DB.handshake = async function(id, password) {
    const type = id.startsWith('MATCH') ? 'match' : 'tournament';
    try {
        const r = await fetch(BACKEND_BASE_URL + '/api/handshake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, type, password })
        });
        const d = await r.json();
        if (d.ok) {
            if (d.token) {
                localStorage.setItem('cricpro_token', d.token);
                if (d.expiresInMs) localStorage.setItem('cricpro_token_expiry', (Date.now() + d.expiresInMs).toString());
            }
            const grants = JSON.parse(localStorage.getItem('cricpro_grants') || '{}');
            grants[id] = true;
            localStorage.setItem('cricpro_grants', JSON.stringify(grants));
            return { ok: true };
        }
        return { ok: false, error: d.error || 'Access Denied' };
    } catch (e) {
        return { ok: false, error: 'Connection failed' };
    }
};

/**
 * Fetch ALL matches/tournaments from the cloud and merge them.
 */
window.pullGlobalData = async function(showFeedback = false) {
    if (!BACKEND_BASE_URL) return;
    if (showFeedback) showToast('🔄 Syncing with Cloud...', 'default');
    
    // Add animation to sync button if it exists
    const syncBtn = document.getElementById('sync-toggle');
    if (syncBtn) syncBtn.classList.add('syncing-animate');

    try {
        const r = await fetch(BACKEND_BASE_URL + '/sync/matches');
        if (!r.ok) throw new Error('Cloud unreachable');
        const d = await r.json(); // { matches: [], tournaments: [] }
        
        if (d.matches) {
            const local = DB.getMatches();
            const merged = d.matches.map(cm => {
                const lm = local.find(x => x.id === cm.id);
                return (lm && lm.lastUpdated > (cm.lastUpdated || 0)) ? lm : cm;
            });
            local.forEach(lm => {
                if (!merged.find(x => x.id === lm.id)) merged.push(lm);
            });
            DB._secureSet(DB_KEYS.MATCHES, merged);
        }

        if (d.tournaments) {
            const local = DB.getTournaments();
            const mergedT = d.tournaments.map(ct => {
                const lt = local.find(x => x.id === ct.id);
                return (lt && lt.lastUpdated > (ct.lastUpdated || 0)) ? lt : ct;
            });
            local.forEach(lt => {
                if (!mergedT.find(x => x.id === lt.id)) mergedT.push(lt);
            });
            DB._secureSet(DB_KEYS.TOURNAMENTS, mergedT);
        }
        
        // --- FETCH PRODUCTS ---
        const rp = await fetch(BACKEND_BASE_URL + '/sync/products');
        if (rp.ok) {
            const dp = await rp.json();
            if (Array.isArray(dp)) {
                const local = DB.getProducts();
                const mergedP = dp.map(cp => {
                    const lp = local.find(x => x.id === cp.id);
                    return (lp && lp.lastUpdated > (cp.lastUpdated || 0)) ? lp : cp;
                });
                local.forEach(lp => {
                    if (!mergedP.find(x => x.id === lp.id)) mergedP.push(lp);
                });
                DB._secureSet(DB_KEYS.PRODUCTS, mergedP);
            }
        }

        if (showFeedback) showToast('✅ Sync Complete!', 'success');
        window._isGlobalSyncCompleted = true;

    } catch (e) {
        console.warn('Sync failed:', e.message);
        if (showFeedback) showToast('⚠️ Sync Failed. Server might be sleeping.', 'error');
    } finally {
        if (syncBtn) syncBtn.classList.remove('syncing-animate');

        // Always trigger UI refreshes eventually (throttle avoid socket flood lag)
        clearTimeout(window._syncTimer);
        window._syncTimer = setTimeout(() => {
            if (typeof window.renderAll === 'function') window.renderAll();
            if (typeof renderMatches === 'function') renderMatches();
            if (typeof renderOngoing === 'function') renderOngoing();
            if (typeof renderProducts === 'function') renderProducts();
            if (typeof renderLive === 'function') renderLive();
            if (typeof updateTicker === 'function') updateTicker();
            if (typeof renderResumeMatches === 'function') renderResumeMatches();
        }, 150);
    }
};

// Global Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Force sync on match load
    window.pullGlobalData(false);

    // Live Clock Ticker
    setInterval(() => {
        const el = document.getElementById('live-clock');
        if (el) {
            const now = new Date();
            el.innerText = now.toLocaleTimeString('en-US', { hour12: false });
        }
    }, 1000);
});

// Start background discovery
setInterval(pullGlobalData, 10000);
setTimeout(pullGlobalData, 1000);

// ... (remove old redundant socket declaration section)

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

// Sheets sync logic handled in background.



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

// Global Image Error Handler (for SVG fallbacks)
window.addEventListener('error', function(e) {
    if (e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
        const img = e.target;
        // Hide the broken image
        img.style.display = 'none';
        // If there's a professional SVG fallback next to it, show it
        const fallback = img.nextElementSibling;
        if (fallback && (fallback.classList.contains('product-svg-wrap') || fallback.classList.contains('svg-fallback-wrap'))) {
            fallback.style.display = 'flex';
        }
    }
}, true); // Use capture phase to catch all errors

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
//  UNIFIED CLOUD SYNC & REAL-TIME LOGIC
// ============================================================

/**
 * Consolidated function to pull all matches and tournaments from the cloud.
 * @param {Object} options - { forceRefresh: boolean, silent: boolean }
 */
async function syncCloudData(options = {}) {
    if (!BACKEND_BASE_URL) return;
    if (document.hidden && !options.forceRefresh) return; // Save resources if tab inactive
    
    // Scorer status detection
    const isScorer = window.location.pathname.includes('score-match.html') || window.location.pathname.includes('admin.html');
    const isPublicPage = window.location.pathname.includes('ongoing-matches.html');
    const isOverlay = window.location.pathname.includes('overlay.html');

    try {
        // Fetch Matches, Tournaments, Players, and Teams
        const [mReq, tReq, pReq, tmReq] = await Promise.all([
            fetch(`${BACKEND_BASE_URL}/sync/matches`).catch(e => ({ json: () => [] })),
            fetch(`${BACKEND_BASE_URL}/sync/tournaments`).catch(e => ({ json: () => [] })),
            fetch(`${BACKEND_BASE_URL}/players`).catch(e => ({ json: () => [] })),
            fetch(`${BACKEND_BASE_URL}/teams`).catch(e => ({ json: () => [] }))
        ]);

        const matchData = await mReq.json();
        const tournData = await tReq.json();
        const playerData = await pReq.json();
        const teamData = await tmReq.json();

        // Sync Players
        if (playerData && Array.isArray(playerData)) {
            DB.savePlayers(playerData.map(p => ({ ...p, playerId: p.playerId || p._id })));
        }
        // Sync Teams
        if (teamData && Array.isArray(teamData)) {
            DB.saveTeams(teamData);
        }

        // Sync Matches — scorer page: use smart merge (don't clobber active matches)
        if (matchData) {
            const remoteMatches = Array.isArray(matchData) ? matchData : (matchData.matches || []);
            const localMatches = DB.getMatches();
            let anyUpdated = false;

            if (isScorer) {
                // Smart merge: cloud wins UNLESS local match was updated more recently
                // (meaning THIS device is actively scoring it)
                const merged = remoteMatches.map(cm => {
                    const lm = localMatches.find(x => x.id === cm.id);
                    // Keep local version if it's newer (active scoring in progress)
                    if (lm && (lm.lastUpdated || 0) > (cm.lastUpdated || 0)) return lm;
                    if (!lm || JSON.stringify(lm) !== JSON.stringify(cm)) anyUpdated = true;
                    return cm;
                });
                // Also include local-only matches (offline-created ones)
                localMatches.forEach(lm => {
                    if (!merged.find(x => x.id === lm.id)) { merged.push(lm); anyUpdated = true; }
                });
                if (anyUpdated) DB.saveMatches(merged);
            } else {
                // For viewers, cloud is the source of truth
                const merged = remoteMatches.map(cm => {
                    const lm = localMatches.find(x => x.id === cm.id);
                    if (!options.forceRefresh && lm && (lm.lastUpdated || 0) > (cm.lastUpdated || 0)) {
                        return lm;
                    }
                    if (!lm || JSON.stringify(lm) !== JSON.stringify(cm)) anyUpdated = true;
                    return cm;
                });
                
                if (anyUpdated || options.forceRefresh || remoteMatches.length !== localMatches.length) {
                    DB.saveMatches(remoteMatches);
                    anyUpdated = true;
                }
            }

            if (anyUpdated) {
                if (typeof renderMatches === 'function') renderMatches();
                if (typeof renderOngoing === 'function') renderOngoing();
                if (typeof updateTicker === 'function') updateTicker();
                if (typeof renderLive === 'function') renderLive();
                // Refresh Open Match list on scorer setup screen
                if (typeof window.renderResumeMatches === 'function') window.renderResumeMatches();
                localStorage.setItem('cricpro_force_update', Date.now().toString());
            }
        }

        // Sync Tournaments
        if (tournData) {
            const remoteTournaments = Array.isArray(tournData) ? tournData : (tournData.tournaments || []);
            const localTournaments = DB.getTournaments();
            
            // Both scorer and viewer: merge tournaments from cloud
            const tournChanged = JSON.stringify(localTournaments) !== JSON.stringify(remoteTournaments) || options.forceRefresh;
            if (tournChanged) {
                DB.saveTournaments(remoteTournaments);
                if (typeof renderTournamentSelector === 'function') renderTournamentSelector();
                // Refresh Open Match list
                if (typeof window.renderResumeMatches === 'function') window.renderResumeMatches();
            }
        }

    } catch (err) {
        if (!options.silent) console.warn('📡 Sync Fallback Active:', err.message);
    }
}

// Map the old function names for compatibility
const pullGlobalData = () => syncCloudData({ silent: true });
const pullLiveUpdates = () => syncCloudData({ silent: true });

// Initial grab on page boot
setTimeout(() => syncCloudData({ forceRefresh: true }), 500);

// Dynamic Polling Interval (Fallback for Socket)
const _isOverlayTab = window.location.pathname.includes('overlay.html');
const _isPublicTab = window.location.pathname.includes('ongoing-matches.html');
const _pollIntervalMs = _isOverlayTab ? 5000 : (_isPublicTab ? 8000 : 20000);

setInterval(() => syncCloudData({ silent: true }), _pollIntervalMs);

// WebSocket Integration
if (typeof io !== 'undefined') {
    const socket = io(BACKEND_BASE_URL);
    socket.on('connect', () => console.log('📡 Real-time WebSocket: ACTIVE'));
    
    socket.on('scoreUpdate', (data) => {
        console.log('⚡ Instant Match Update');
        syncCloudData({ forceRefresh: true }); 
    });
    
    socket.on('tournamentUpdate', () => {
        console.log('🏆 Instant Tournament Update');
        syncCloudData({ forceRefresh: true });
    });
    
    socket.on('globalUpdate', () => {
        console.log('🌍 Global Discover Update');
        syncCloudData({ forceRefresh: true });
    });
    
    socket.on('broadcastCmd', (data) => {
        console.log('📺 Broadcast Command received');
        if (typeof handleBroadcastCmd === 'function') handleBroadcastCmd(data);
    });
}

