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
    POSTS: 'cricpro_posts',
    REPORTS: 'cricpro_reports',
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

// --- GLOBAL UI HELPERS ---
window.showModal = function(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
};
window.closeModal = function(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
};
window.showToast = function(msg, type = 'default') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.innerText = msg;
    t.className = 'toast show ' + type;
    setTimeout(() => { t.className = 'toast'; }, 3000);
};

const DB = {
    getCloudURL() {
        return window.BACKEND_BASE_URL || "https://slcrickpro.onrender.com";
    },

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

        // Persistent photo storage (localStorage vault)
        if (player.photo && String(player.photo).startsWith('data:')) {
            localStorage.setItem('cricpro_photo_' + id, player.photo);
            player.photo = ''; // Keep the player record light
        }

        arr.push(player);
        this.savePlayers(arr);

        // Ensure last ID is tracked immediately
        const m = (player.playerId || '').match(/CP-?(\d+)/);
        if (m) {
            localStorage.setItem('cricpro_last_pid', (parseInt(m[1]) || 0).toString());
        }

        // Sync to MongoDB
        const syncPayload = { ...player, photo: localStorage.getItem('cricpro_photo_' + id) || '' };
        syncToDB('player', syncPayload);
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
        const arr = this.getPlayers();
        const p = arr.find(p => p.playerId === id);
        if (!p) return null;
        
        // Retrieve from persistent photo vault if missing in record
        if (!p.photo || p.photo === '') {
            const cached = localStorage.getItem('cricpro_photo_' + id);
            if (cached) p.photo = cached;
        }
        return p;
    },
    updatePlayer(player) {
        if (!player || !player.playerId) return null;
        const arr = this.getPlayers();
        const idx = arr.findIndex(p => p.playerId === player.playerId);
        
        if (idx === -1) {
            return this.addPlayer(player);
        }

        const id = player.playerId;
        // Handle persistent photo storage
        if (player.photo && String(player.photo).startsWith('data:')) {
            localStorage.setItem('cricpro_photo_' + id, player.photo);
            player.photo = ''; 
        }

        arr[idx] = { ...arr[idx], ...player };
        this.savePlayers(arr);

        const syncPayload = { ...arr[idx], photo: localStorage.getItem('cricpro_photo_' + id) || '' };
        syncToDB('player', syncPayload);

        return arr[idx];
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
            publishLive: true, // Default to true so matches show up on mobile/others by default
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
            matchFormat: config.matchFormat || 'limited',
            totalInnings: config.matchFormat === 'test' ? 4 : 2,
            innings: new Array(config.matchFormat === 'test' ? 4 : 2).fill(null),
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

    // ---------- REPORTS ----------
    getMatchReports(matchId) {
        const all = this._secureGet(DB_KEYS.REPORTS, []);
        return all.filter(r => r.matchId === matchId).sort((a,b) => b.generatedAt - a.generatedAt);
    },

    saveMatchReport(report) {
        const all = this._secureGet(DB_KEYS.REPORTS, []);
        all.push(report);
        this._secureSet(DB_KEYS.REPORTS, all);
        if (typeof syncToDB === 'function') {
            syncToDB('report', report);
        }
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
        
        // Save tournament and preserve scoring token if any
        await this.saveTournamentWithAuth(t);
        
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

    // ---------- POSTS ----------
    getPosts() {
        return this._secureGet(DB_KEYS.POSTS, []);
    },
    savePosts(arr) {
        this._secureSet(DB_KEYS.POSTS, arr);
        // Sync to cloud if needed
        arr.forEach(p => syncToDB('post', p));
    },
    addPost(post) {
        const arr = this.getPosts();
        if (!post.id) post.id = 'POST-' + Date.now();
        if (!post.createdAt) post.createdAt = Date.now();
        arr.unshift(post); // Newest first
        this.savePosts(arr);
        return post;
    },
    clearMatchData(id) {
        if (!id) return;
        localStorage.removeItem('hotkey_match_id');
        localStorage.removeItem('hotkey_mode');
        // Clear local grants for this specific match
        const grants = JSON.parse(localStorage.getItem('cricpro_grants') || '{}');
        delete grants[id];
        localStorage.setItem('cricpro_grants', JSON.stringify(grants));
        console.log(`🧹 Session data cleared for match: ${id}`);
    }
};

// ============================================================
//  BACKEND SYNC → MongoDB Atlas (via Express server)
// ============================================================

// Auto-detected Backend & Socket
// ============================================
// HOW TO DEPLOY TO THE INTERNET (RAILWAY.APP)
// ============================================
// 1. Change `IS_PRODUCTION` to true
// 2. Paste your Railway backend link into `PROD_BACKEND_URL`
const IS_PRODUCTION = true; 
const PROD_BACKEND_URL = "https://slcrickpro.onrender.com"; 

let BACKEND_BASE_URL = IS_PRODUCTION 
    ? PROD_BACKEND_URL 
    : (localStorage.getItem('cricpro_backend_url') || "http://" + window.location.hostname + ":3000");

// Clear old cache if in production
if (IS_PRODUCTION) {
    localStorage.removeItem('cricpro_backend_url');
}

// Expose globally so inline scripts (loginToMatch, etc.) can reference it
window.BACKEND_BASE_URL = BACKEND_BASE_URL;

// Expose globally so inline scripts can reference it
// NOTE: Only one syncToDB defined below (the canonical one at line ~694)

// ============================================================
//  SMART SERVER WAKE-UP (Render free tier cold-start fix)
// ============================================================
let _serverAwake = false;
let _wakePromise = null;

async function wakeUpServer(maxAttempts = 4) {
    if (_serverAwake) return true;
    if (_wakePromise) return _wakePromise;

    _wakePromise = (async () => {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const r = await fetch(`${BACKEND_BASE_URL}/api/ping`, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(8000) });
                if (r.ok) {
                    console.log('🟢 Server is awake and responding.');
                    _serverAwake = true;
                    // Keep-alive: ping every 9 minutes to prevent Render sleep
                    setInterval(() => fetch(`${BACKEND_BASE_URL}/api/ping`, { cache: 'no-store' }).catch(() => {}), 9 * 60 * 1000);
                    return true;
                }
            } catch (e) {
                const delay = (i + 1) * 3000; // 3s, 6s, 9s backoff
                console.warn(`⏳ Server warming up... retry ${i + 1}/${maxAttempts} in ${delay / 1000}s`);
                await new Promise(res => setTimeout(res, delay));
            }
        }
        console.warn('⚠️ Server did not respond after wake-up attempts. Using local cache.');
        _wakePromise = null;
        return false;
    })();

    return _wakePromise;
}

// ============================================================
//  GLOBAL SOCKET.IO — Single instance, shared across all pages
// ============================================================
let socket = null;
if (typeof io !== 'undefined') {
    // Connect socket ONLY after server wakes up to avoid connection flood
    wakeUpServer().then(awake => {
        if (!awake) return;
        socket = io(BACKEND_BASE_URL, {
            path: '/socket.io',
            transports: ['websocket', 'polling'], // prefer websocket first for speed
            reconnectionAttempts: 15,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 8000,
            timeout: 15000,
        });
        window._cricproSocket = socket;

        socket.on('connect_error', (err) => console.warn('🔴 Socket connect_error:', err && err.message ? err.message : err));
        socket.on('connect_timeout', () => console.warn('🔴 Socket connect_timeout'));
        socket.on('reconnect_error', (err) => console.warn('🔴 Socket reconnect_error:', err && err.message ? err.message : err));
        socket.on('reconnect_failed', () => console.warn('🔴 Socket reconnect_failed'));

        socket.on('connect', () => {
            console.log('📡 Real-time Socket: CONNECTED to', BACKEND_BASE_URL);
            _serverAwake = true;
            // Join the global broadcast room immediately
            socket.emit('join_global', {});
            // Also join any active match room (for both scorer page and TV overlay)
            const urlParams = new URLSearchParams(window.location.search);
            const activeMatchId = urlParams.get('matchId') || urlParams.get('match');
            if (activeMatchId) {
                socket.emit('join_match', activeMatchId);
                console.log('🏏 Joined match room:', activeMatchId);
            }
        });

        socket.on('disconnect', () => console.warn('🔴 Socket disconnected — polling continues'));

        // ── scoreUpdate: server broadcasts full match data → update local cache & render
        socket.on('scoreUpdate', (data) => {
            if (!data || !data.id) return;
            console.log('⚡ scoreUpdate received for', data.id);
            
            const localMatches = DB.getMatches();
            const existingIdx = localMatches.findIndex(m => m.id === data.id);
            const localMatch = existingIdx !== -1 ? localMatches[existingIdx] : null;

            const cloudTime = data.lastUpdated || 0;
            const localTime = localMatch ? (localMatch.lastUpdated || 0) : 0;

            if (!localMatch || cloudTime >= localTime) {
                if (existingIdx !== -1) localMatches[existingIdx] = data;
                else localMatches.push(data);
                DB.saveMatches(localMatches);
                if (typeof renderOngoing === 'function') renderOngoing();
                if (typeof updateTicker === 'function') updateTicker();
                if (typeof renderLive === 'function') renderLive();
                if (typeof renderOverlay === 'function') renderOverlay();
                localStorage.setItem('cricpro_force_update', Date.now().toString());
            }
        });

        // ── globalUpdate: any change to match or tournament
        socket.on('globalUpdate', (info) => {
            console.log('🌍 globalUpdate received:', info?.type);
            if (info && info.type === 'match_deleted' && info.id) {
                const mArr = DB.getMatches().filter(m => m.id !== info.id);
                DB._secureSet(DB_KEYS.MATCHES, mArr);
            }
            if (info && info.type === 'tournament_deleted' && info.id) {
                const tArr = DB.getTournaments().filter(t => t.id !== info.id);
                DB._secureSet(DB_KEYS.TOURNAMENTS, tArr);
                const mArr = DB.getMatches().filter(m => m.tournamentId !== info.id);
                DB._secureSet(DB_KEYS.MATCHES, mArr);
            }
            if (info && info.type === 'tournament_completed' && info.id) {
                const tArr = DB.getTournaments().map(t => {
                    if (t.id === info.id) t.status = 'completed';
                    return t;
                });
                DB._secureSet(DB_KEYS.TOURNAMENTS, tArr);
                if (typeof window.renderOngoing === 'function') window.renderOngoing();
            }
            if (typeof syncCloudData === 'function') syncCloudData({ forceRefresh: true, silent: true });
        });

        // ── broadcast_command (TV overlay hotkey events)
        socket.on('broadcast_command', (data) => {
            console.log('📺 broadcast_command received:', data?.cmd);
            if (typeof handleBroadcastCommand === 'function') handleBroadcastCommand(data?.cmd, data);
            if (typeof handleBroadcastEvent === 'function') handleBroadcastEvent(data);
        });

        socket.on('broadcastCmd', (data) => {
            if (typeof handleBroadcastEvent === 'function') handleBroadcastEvent(data);
        });
    }); // end wakeUpServer().then()
}

/**
 * Sync a player or team to MongoDB.
 * type: 'player' | 'team'
 */
function syncToDB(type, data) {
    if (!BACKEND_BASE_URL) return;
    let endpoint = '';
    if (type === 'player') {
        endpoint = '/players';
        // Map playerId to id for backend compatibility
        if (data && !data.id && data.playerId) {
            data.id = data.playerId;
        }
    }
    else if (type === 'team') endpoint = '/teams';
    else if (type === 'match') endpoint = '/sync/match';
    else if (type === 'tournament') endpoint = '/sync/tournament';
    else if (type === 'order') endpoint = '/sync/order';
    else if (type === 'post') endpoint = '/sync/post';
    else if (type === 'report') {
        const id = data.matchId || 'unknown';
        endpoint = `/api/matches/${id}/report`;
    }

    console.log(`📡 Syncing ${type} to: ${BACKEND_BASE_URL + endpoint}`);
    let token = localStorage.getItem('cricpro_token');
    const expiry = parseInt(localStorage.getItem('cricpro_token_expiry') || '0');
    if (expiry && Date.now() > expiry) {
        console.warn('Sync token expired (local expiration). Clearing it.');
        token = null;
        localStorage.removeItem('cricpro_token');
        localStorage.removeItem('cricpro_token_expiry');
    }

    // Only skip cloud sync if the tournament is explicitly locked AND we have no valid token
    if (type === 'match' && data && data.tournamentId && !token) {
        const tournament = (DB && DB.getTournament) ? DB.getTournament(data.tournamentId) : null;
        const locked = tournament && (tournament.scoringPassword || tournament.password || tournament.isLocked);
        // Only skip if LOCKED — unlocked matches MUST always sync to cloud
        if (locked) {
            // Silently skip for background syncs to avoid console spam
            // console.warn('Skipping match sync for locked tournament without valid token.');
            return;
        }
        // If unlocked or no tournament password set, proceed with sync
    }

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
    .then(async (r) => {
        if (r.status === 401) {
            console.warn('Scoring token expired or invalid (401). Clearing local token.');
            localStorage.removeItem('cricpro_token');
            localStorage.removeItem('cricpro_token_expiry');
            showToast('🔐 Scoring token expired, please re-open tournament and unlock again', 'error');
            return null;
        }
        if (!r.ok) {
            const text = await r.text();
            console.warn('Sync failed with status', r.status, text);
            return null;
        }
        return r.json();
    })
    .then(d => {
        if (!d || !d.ok) return;
        
        // Mark as synced locally to help distinguish between "unsynced new data" and "deleted from cloud"
        if (type === 'match') {
            const arr = DB.getMatches();
            const idx = arr.findIndex(m => m.id === data.id);
            if (idx !== -1) {
                arr[idx]._isCloudSynced = true; // Flag used by syncCloudData to detect cloud-deleted matches
                arr[idx].synced = true;
                arr[idx].lastUpdated = Date.now();
                DB._secureSet(DB_KEYS.MATCHES, arr);
            }
        }
        if (type === 'tournament') {
            const arr = DB.getTournaments();
            const idx = arr.findIndex(t => t.id === data.id);
            if (idx !== -1) {
                arr[idx]._isCloudSynced = true;
                arr[idx].synced = true;
                arr[idx].lastUpdated = Date.now();
                DB._secureSet(DB_KEYS.TOURNAMENTS, arr);
            }
        }

        if (d.error === 'Unauthorized scoring session') {
            console.warn('Scoring token expired or invalid.');
            localStorage.removeItem('cricpro_token');
            localStorage.removeItem('cricpro_token_expiry');
            showToast('🔄 Sync limited: Please re-authorize session', 'default');
        }
    })
    .catch(err => {
        console.error(`❌ Sync failed to ${BACKEND_BASE_URL + endpoint}:`, err);
        // Only show toast if user is actively doing something (e.g. manual save)
        if (typeof showToast === 'function' && !data._isBackgroundSync) {
            showToast('⚠️ Sync limited: Network connection issue.', 'error');
        }
    });
}
window.syncToDB = syncToDB; // Expose globally for other files

/**
 * Handle password verification before scoring a remote match.
 */

DB.handshake = async function(id, password) {
    const type = id.startsWith('MATCH') ? 'match' : 'tournament';
    try {
        if (!BACKEND_BASE_URL) return { ok: false, error: 'No backend URL configured' };

        const r = await fetch(BACKEND_BASE_URL + '/api/handshake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, type, password })
        });

        const d = await r.json();
        if (r.ok && d.ok) {
            if (d.token) {
                localStorage.setItem('cricpro_token', d.token);
                if (d.expiresInMs) localStorage.setItem('cricpro_token_expiry', (Date.now() + d.expiresInMs).toString());
            }
            const grants = JSON.parse(localStorage.getItem('cricpro_grants') || '{}');
            grants[id] = true;
            localStorage.setItem('cricpro_grants', JSON.stringify(grants));
            return { ok: true };
        }

        return { ok: false, error: (d && d.error) ? d.error : 'Access Denied' };
    } catch (e) {
        console.error('DB.handshake error', e);
        return { ok: false, error: 'Connection failed' };
    }
};

/**
 * Unified Cloud sync wrapper (Legacy pullGlobalData)
 */
window.pullGlobalData = async function(showFeedback = false) {
    if (showFeedback) showToast('🔄 Syncing with Cloud...', 'default');
    const res = await syncCloudData({ forceRefresh: true, silent: !showFeedback });
    window._isGlobalSyncCompleted = true;
    if (typeof window.renderResumeMatches === 'function') window.renderResumeMatches();
    return res;
};

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

// Global Security: Sanitize all innerHTML assignments
const originalInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
if (originalInnerHTML) {
    Object.defineProperty(Element.prototype, 'innerHTML', {
        set: function(value) {
            let clean = typeof value === 'string' ? value : String(value);
            clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            clean = clean.replace(/<(object|embed|iframe|applet|meta|base)\b[^>]*>/gi, '');
            clean = clean.replace(/href\s*=\s*(['"]?)javascript:[^'"]*\1/gi, 'href="javascript:void(0);"');
            clean = clean.replace(/\bon(?!(click|change|input)\b)\w+\s*=\s*(['"])(.*?)\2/gi, '');
            return originalInnerHTML.set.call(this, clean);
        },
        get: function() { return originalInnerHTML.get.call(this); }
    });
}

function showToast(msg, type = 'default') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show ' + type; // Using space for simpler class handling
    if (type === 'error') t.classList.add('toast-error');
    if (type === 'success') t.classList.add('toast-success');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function formatCRR(runs, balls) { 
    const r = parseFloat(runs) || 0;
    const b = parseFloat(balls) || 0;
    if (!b) return '0.00'; 
    return ((r / b) * 6).toFixed(2); 
}
function formatOvers(balls, bpo = 6) { 
    const bls = parseInt(balls) || 0;
    const ov = Math.floor(bls/bpo); 
    const b = bls%bpo; 
    return `${ov}.${b}`; 
}
function formatSR(runs, balls) { 
    const r = parseFloat(runs) || 0;
    const b = parseFloat(balls) || 0;
    if (!b) return '0.0'; 
    return ((r / b) * 100).toFixed(1); 
}
function formatEcon(runs, balls, bpo = 6) { 
    const r = parseFloat(runs) || 0;
    const b = parseFloat(balls) || 0;
    if (!b) return '0.0'; 
    return ((r / b) * bpo).toFixed(1); 
}

function formatRRR(target, currentRuns, ballsLeft, bpo = 6) {
    const need = target - currentRuns;
    if (need <= 0) return '0.00';
    if (ballsLeft <= 0) return '∞';
    return ((need / ballsLeft) * bpo).toFixed(2);
}

// Global Image Error Handler
window.addEventListener('error', function(e) {
    if (e.target.tagName && e.target.tagName.toLowerCase() === 'img') {
        const img = e.target;
        img.style.display = 'none';
        const fallback = img.nextElementSibling;
        if (fallback && (fallback.classList.contains('product-svg-wrap') || fallback.classList.contains('svg-fallback-wrap'))) {
            fallback.style.display = 'flex';
        }
    }
}, true);

function timeSince(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return Math.round(d) + 's ago';
    if (d < 3600) return Math.round(d / 60) + 'm ago';
    if (d < 86400) return Math.round(d / 3600) + 'h ago';
    return Math.round(d / 86400) + 'd ago';
}

function showErrorInsideProgram(msg, url, lineNo) {
    let errBox = document.getElementById('cricpro-global-error');
    if (!errBox && document.body) {
        errBox = document.createElement('div');
        errBox.id = 'cricpro-global-error';
        errBox.style = 'position:fixed;top:20px;right:20px;z-index:99999;background:#d32f2f;color:#fff;padding:15px;border-radius:6px;width:300px;box-shadow:0 10px 30px rgba(0,0,0,0.5);font-size:12px;';
        errBox.innerHTML = `<div style="font-weight:900;mb:5px;display:flex;justify-content:space-between"><span>SYSTEM ERROR</span><span style="cursor:pointer" onclick="this.parentElement.parentElement.remove()">✖</span></div><div id="cricpro-error-text"></div>`;
        document.body.appendChild(errBox);
        setTimeout(() => errBox.remove(), 10000);
    }
    const txt = document.getElementById('cricpro-error-text');
    if (txt) txt.innerHTML += `<div>↳ ${msg} @ ${lineNo||'?'}</div>`;
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW failed:', err));
    });
}

// ============================================================
//  UNIFIED CLOUD SYNC & REAL-TIME LOGIC
// ============================================================
let _isSyncingCloud = false;
async function syncCloudData(options = {}) {
    if (!BACKEND_BASE_URL || _isSyncingCloud) return;
    if (document.hidden && !options.forceRefresh) return;
    if (window._isEditingRoster && !options.forceRefresh) return;

    // Don't hammer a sleeping server — wait for it to wake first
    if (!_serverAwake && !options.forceRefresh) return;

    _isSyncingCloud = true;
    const NOW = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    try {
        const [mReq, tReq, pReq, tmReq] = await Promise.all([
            fetch(`${BACKEND_BASE_URL}/sync/matches`, { signal: AbortSignal.timeout(10000) }).catch(() => ({ ok: false })),
            fetch(`${BACKEND_BASE_URL}/sync/tournaments`, { signal: AbortSignal.timeout(10000) }).catch(() => ({ ok: false })),
            fetch(`${BACKEND_BASE_URL}/players`, { signal: AbortSignal.timeout(10000) }).catch(() => ({ ok: false })),
            fetch(`${BACKEND_BASE_URL}/teams`, { signal: AbortSignal.timeout(10000) }).catch(() => ({ ok: false }))
        ]);

        // Validate responses before parsing
        if (!mReq.ok || !tReq.ok) {
            if (!options.silent) console.warn('📡 Sync: Cloud requests failed. Preserving local cache.');
            _isSyncingCloud = false;
            return;
        }

        const matchData = await mReq.json();
        const tournData = await tReq.json();
        const playerData = await pReq.json();
        const teamData = await tmReq.json();

        // 1. Sync Players (Preserve local if remote is empty or error)
        if (playerData && Array.isArray(playerData) && playerData.length > 0) {
            const localPlayers = DB.getPlayers();
            // Create a map of existing players for faster merging
            const playerMap = new Map();
            playerData.forEach(p => {
                const id = p.id || p.playerId || p._id;
                if (id) playerMap.set(id, { ...p, playerId: id });
            });
            
            // Re-add local players that might not be on cloud yet
            localPlayers.forEach(lp => {
                if (!playerMap.has(lp.playerId)) {
                    playerMap.set(lp.playerId, lp);
                    try { syncToDB('player', lp); } catch(e) {}
                }
            });
            DB.savePlayers(Array.from(playerMap.values()));
        }
        
        // 2. Sync Teams
        if (teamData && Array.isArray(teamData) && teamData.length > 0) {
            const localTeams = DB.getTeams();
            const teamMap = new Map();
            teamData.forEach(t => teamMap.set(t.id, t));
            
            localTeams.forEach(lt => {
                if (!teamMap.has(lt.id)) {
                    teamMap.set(lt.id, lt);
                    try { syncToDB('team', lt); } catch(e) {}
                }
            });
            DB.saveTeams(Array.from(teamMap.values()));
        }

        // 3. Sync Matches
        const remoteMatches = matchData && Array.isArray(matchData.matches) ? matchData.matches : (Array.isArray(matchData) ? matchData : []);
        if (remoteMatches.length > 0 || options.forceRefresh) {
            const localMatches = DB.getMatches();
            let anyUpdated = false;
            
            // Create a merged set
            const matchMap = new Map();
            
            // Add remote matches (filter out deleted ones)
            remoteMatches.filter(cm => !cm.deleted).forEach(cm => {
                const lm = localMatches.find(x => x.id === cm.id);
                // Rule: If local version is newer (higher timestamp), keep local
                if (lm && (lm.lastUpdated || 0) > (cm.lastUpdated || 0)) {
                    matchMap.set(lm.id, lm);
                } else {
                    if (!lm || JSON.stringify(lm) !== JSON.stringify(cm)) anyUpdated = true;
                    matchMap.set(cm.id, cm);
                }
            });

            // Sync local matches back to remote OR delete them locally if they were removed from the cloud.
            localMatches.forEach(lm => {
                if (!matchMap.has(lm.id)) {
                    if (lm._isCloudSynced || lm.synced) {
                        // It was on the cloud before, but missing now. Cloud deleted it.
                        console.log(`🗑️ Sync: Local match ${lm.id} was deleted from cloud. Removing locally.`);
                        anyUpdated = true;
                    } else {
                        // Never synced before, so keep local and push to cloud.
                        matchMap.set(lm.id, lm);
                        anyUpdated = true;
                        console.log(`🔄 Sync: Pushing new match ${lm.id} to cloud (was missing from remote)`);
                        try { syncToDB('match', lm); } catch(e) {}
                    }
                }
            });

            if (anyUpdated || options.forceRefresh) {
                DB.saveMatches(Array.from(matchMap.values()));
                if (typeof renderOngoing === 'function') renderOngoing();
                if (typeof updateTicker === 'function') updateTicker();
                if (typeof renderLive === 'function') renderLive();
                if (typeof renderSystemMatches === 'function') renderSystemMatches();
                localStorage.setItem('cricpro_force_update', Date.now().toString());
            }
        }

        // 4. Sync Tournaments
        const remoteTournaments = tournData && Array.isArray(tournData.tournaments) ? tournData.tournaments : (Array.isArray(tournData) ? tournData : []);
        if (remoteTournaments.length > 0 || options.forceRefresh) {
            const localTournaments = DB.getTournaments();
            let anyTUpdated = false;
            const tournMap = new Map();

            remoteTournaments.forEach(ct => {
                const lt = localTournaments.find(x => x.id === ct.id);
                if (lt && (lt.lastUpdated || 0) > (ct.lastUpdated || 0)) {
                    tournMap.set(lt.id, lt);
                } else {
                    if (!lt || JSON.stringify(lt) !== JSON.stringify(ct)) anyTUpdated = true;
                    tournMap.set(ct.id, ct);
                }
            });

            localTournaments.forEach(lt => {
                if (!tournMap.has(lt.id)) {
                    if (lt._isCloudSynced) {
                        console.log(`🗑️ Sync: Local tournament ${lt.id} was deleted from cloud. Removing locally.`);
                        anyTUpdated = true;
                        
                        // Cascade delete matches for this tournament
                        const matches = DB.getMatches().filter(m => m.tournamentId !== lt.id);
                        DB.saveMatches(matches);
                    } else {
                        tournMap.set(lt.id, lt);
                        anyTUpdated = true;
                        console.log(`🔄 Sync: Pushing new tournament ${lt.id} to cloud (was missing from remote)`);
                        try { syncToDB('tournament', lt); } catch(e) {}
                    }
                }
            });

            if (anyTUpdated || options.forceRefresh) {
                DB.saveTournaments(Array.from(tournMap.values()));
                if (typeof renderTournamentSelector === 'function') renderTournamentSelector();
                if (typeof renderOngoing === 'function') renderOngoing();
                if (typeof window.renderResumeMatches === 'function') window.renderResumeMatches();
                if (typeof renderTournamentsAdmin === 'function') renderTournamentsAdmin();
                if (typeof renderRequests === 'function') renderRequests();
            }
        }

    } catch (err) {
        console.warn('📡 Sync Error:', err.message);
    } finally {
        _isSyncingCloud = false;
    }
}

// Wait for server to wake, then pull data immediately
wakeUpServer().then(awake => {
    if (awake) {
        syncCloudData({ forceRefresh: true });
        console.log('🔄 Initial cloud sync triggered after server wake-up.');
    }
});

// Polled background sync (only when server is confirmed awake)
const _isOverlayTab  = window.location.pathname.includes('overlay.html');
const _isPublicTab   = window.location.pathname.includes('ongoing-matches.html');
const _isContributor = window.location.pathname.includes('score-match.html') || window.location.pathname.includes('admin.html');
const _pollIntervalMs = _isOverlayTab ? 3000 : (_isPublicTab ? 4000 : (_isContributor ? 3000 : 12000));
setInterval(() => { if (_serverAwake) syncCloudData({ silent: true }); }, _pollIntervalMs);
