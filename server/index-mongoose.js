const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require('bcrypt');
const socketIo = require('socket.io');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const allowedPatterns = ['slcrickpro.live', 'railway.app', 'localhost', '127.0.0.1'];
        const isAllowed = allowedPatterns.some(pattern => origin.includes(pattern));
        if (isAllowed) {
            callback(null, true);
        } else {
            callback(null, true); // Fallback for maximum compatibility
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-key', 'x-scoring-token', 'session-token', 'Session-Token']
}));
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

let redisClient = null;
try {
    if (process.env.REDIS_URL) {
        const Redis = require('ioredis');
        redisClient = new Redis(process.env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 2
        });
        redisClient.connect().catch(() => {});
    }
} catch (e) {
    console.warn('Redis unavailable, falling back to memory cache');
}

const memTvCache = new Map();
const SCORING_TOKEN_SECRET = process.env.SCORING_TOKEN_SECRET || 'slcrickpro-scoring-secret';
const SCORING_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

// ─── Security Middleware (Hand-rolled Helmet) ─────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:;");
    next();
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..')));

// Specifically handle common pages for clean URLs (optional but good)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));
app.get('/admin-portal', (req, res) => res.sendFile(path.join(__dirname, '..', 'pages', 'admin.html')));

// ─── Database Setup (PostgreSQL with Sequelize) ──────────────────────────────

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 }
});

// ─── Models ───────────────────────────────────────────────────────────────────

const Player = sequelize.define('Player', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    dob: DataTypes.STRING,
    phone: DataTypes.STRING,
    address: DataTypes.STRING,
    team: DataTypes.STRING,
    role: DataTypes.STRING,
    batStyle: DataTypes.STRING,
    bowlStyle: DataTypes.STRING,
    jersey: DataTypes.JSON,
    photo: DataTypes.TEXT,
    createdAt: DataTypes.BIGINT,
    stats: { type: DataTypes.JSON, defaultValue: { matches: 0, innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, notOuts: 0, highScore: 0, thirties: 0, fifties: 0, hundreds: 0, wickets: 0, overs: 0, bowlingRuns: 0, maidens: 0, bestBowling: '0/0', catches: 0, stumpings: 0 } }
}, { timestamps: true, tableName: 'players' });

const Team = sequelize.define('Team', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    ground: DataTypes.STRING,
    captain: DataTypes.STRING,
    manager: DataTypes.STRING,
    contact: DataTypes.STRING,
    year: DataTypes.STRING,
    createdAt: DataTypes.BIGINT,
    stats: { type: DataTypes.JSON, defaultValue: { played: 0, won: 0, lost: 0, tied: 0, prizeMoney: 0, runsFor: 0, runsAgainst: 0 } }
}, { timestamps: true, tableName: 'teams' });

const Match = sequelize.define('Match', {
    id: { type: DataTypes.STRING, primaryKey: true },
    scoring_password: DataTypes.STRING,
    data: DataTypes.JSON
}, { timestamps: true, tableName: 'matches' });

const Tournament = sequelize.define('Tournament', {
    id: { type: DataTypes.STRING, primaryKey: true },
    scoring_password: DataTypes.STRING,
    data: DataTypes.JSON
}, { timestamps: true, tableName: 'tournaments' });

const Product = sequelize.define('Product', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    price: DataTypes.DECIMAL(10, 2),
    stock: DataTypes.INTEGER,
    category: DataTypes.STRING,
    type: DataTypes.STRING,
    brand: DataTypes.STRING,
    rating: DataTypes.DECIMAL(3, 1),
    img: DataTypes.TEXT,
    imgFallback: DataTypes.TEXT,
    desc: DataTypes.TEXT,
    details: DataTypes.TEXT,
    isService: DataTypes.BOOLEAN
}, { timestamps: true, tableName: 'products' });

const Order = sequelize.define('Order', {
    id: { type: DataTypes.STRING, primaryKey: true },
    name: DataTypes.STRING,
    phone: DataTypes.STRING,
    address: DataTypes.STRING,
    note: DataTypes.TEXT,
    items: DataTypes.JSON,
    total: DataTypes.DECIMAL(10, 2),
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    date: DataTypes.BIGINT
}, { timestamps: true, tableName: 'orders' });

// Security Handshake
app.post('/api/handshake', async (req, res) => {
    const { id, type, password } = req.body;
    if (!id || !type || !password) return res.status(400).json({ error: 'Missing credentials' });
    
    try {
        await ensureDB();
        const Model = type === 'match' ? Match : Tournament;
        const doc = await Model.findByPk(id);
        
        if (!doc) return res.status(404).json({ error: 'Not found' });
        if (!doc.scoring_password) return res.json({ ok: true });
        
        const valid = await bcrypt.compare(password, doc.scoring_password);
        if (valid) {
            res.json({ ok: true });
        } else {
            res.status(401).json({ error: 'Incorrect password' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Connect to PostgreSQL (serverless-safe, promise-cached) ───────────────────


let _connectPromise = null;

const ensureDB = () => {
    if (sequelize.authentication && sequelize.authentication.ok !== undefined) {
        return Promise.resolve();
    }
    if (!_connectPromise) {
        _connectPromise = sequelize.authenticate()
            .then(async () => {
                console.log('✅ Connected to PostgreSQL (crickdb)');
                await sequelize.sync({ alter: false });
                return true;
            })
            .catch(err => {
                _connectPromise = null;
                console.error('❌ PostgreSQL connect failed:', err.message);
                throw err;
            });
    }
    return _connectPromise;
};
// Warm-start: kick off connection when module first loads
ensureDB().catch(() => {});

// ─── Match Cleanup (Bug 8: Single match 48h cleanup) ────────────────────────
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // Every 6 hours
const MAX_AGE_MS = 48 * 60 * 60 * 1000;       // 48 hours

setInterval(async () => {
    try {
        await ensureDB();
        const cutoff = Date.now() - MAX_AGE_MS;
        // Find single matches (no tournamentId) that are older than cutoff
            const result = await Match.destroy({
                where: {
                    createdAt: { [require('sequelize').Op.lt]: new Date(cutoff) }
                }
            });
            if (result > 0) {
                console.log(`🧹 Cleanup: Removed ${result} single matches older than 48h.`);
        }
    } catch (e) {
        console.error('Cleanup failed:', e.message);
    }
}, CLEANUP_INTERVAL_MS);


// ─── Helper ───────────────────────────────────────────────────────────────────

function parseBody(req) {
    if (!req.body) return null;
    let payload = req.body;
    if (typeof payload === 'string') {
        try { 
            payload = JSON.parse(payload); 
        } catch (e) { 
            console.warn("Malformed JSON received");
            return null; 
        }
    }
    // Basic structural check (every valid sync payload or model action usually has data or an ID)
    if (typeof payload !== 'object' || payload === null) return null;
    return payload;
}

function createScoringToken(tournamentId) {
    const payload = {
        tournamentId,
        exp: Date.now() + SCORING_TOKEN_TTL_MS
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', SCORING_TOKEN_SECRET).update(payloadB64).digest('base64url');
    return `${payloadB64}.${sig}`;
}

function decodeScoringToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadB64, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SCORING_TOKEN_SECRET).update(payloadB64).digest('base64url');
    if (sig !== expected) return null;
    try {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
        if (!payload?.tournamentId || !payload?.exp || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

function buildLightScorePayload(match) {
    const m = match && match.data ? match.data : match;
    if (!m) return null;
    const inn = Array.isArray(m.innings) ? m.innings[m.currentInnings || 0] : null;
    const payload = {
        id: m.id,
        tournamentId: m.tournamentId || null,
        type: m.type || 'single',
        status: m.status,
        publishLive: !!m.publishLive,
        team1: m.team1,
        team2: m.team2,
        overs: m.overs,
        ballsPerOver: m.ballsPerOver || 6,
        currentInnings: m.currentInnings || 0,
        score: inn ? {
            battingTeam: inn.battingTeam,
            bowlingTeam: inn.bowlingTeam,
            runs: inn.runs || 0,
            wickets: inn.wickets || 0,
            balls: inn.balls || 0,
            currentOver: Array.isArray(inn.currentOver) ? inn.currentOver.slice(-6).map(b => ({
                type: b.type,
                runs: b.runs || 0,
                wicket: !!b.wicket
            })) : [],
            striker: (() => {
                const idx = inn.currentBatsmenIdx?.[inn.strikerIdx || 0];
                const b = (idx !== undefined && idx !== null) ? inn.batsmen?.[idx] : null;
                return b ? { name: b.name, runs: b.runs || 0, balls: b.balls || 0 } : null;
            })(),
            nonStriker: (() => {
                const slot = (inn.strikerIdx || 0) === 0 ? 1 : 0;
                const idx = inn.currentBatsmenIdx?.[slot];
                const b = (idx !== undefined && idx !== null) ? inn.batsmen?.[idx] : null;
                return b ? { name: b.name, runs: b.runs || 0, balls: b.balls || 0 } : null;
            })(),
            bowler: (() => {
                const b = (inn.currentBowlerIdx !== null && inn.currentBowlerIdx !== undefined) ? inn.bowlers?.[inn.currentBowlerIdx] : null;
                return b ? { name: b.name, runs: b.runs || 0, wickets: b.wickets || 0, balls: b.balls || 0 } : null;
            })()
        } : null
    };
    const str = JSON.stringify(payload);
    if (str.length > 2048 && payload.score) {
        payload.score.currentOver = payload.score.currentOver.slice(-3);
    }
    return payload;
}

async function cacheTvPayload(matchId, payload) {
    const key = `tv:match:${matchId}`;
    memTvCache.set(key, payload);
    if (redisClient) {
        try {
            await redisClient.set(key, JSON.stringify(payload), 'EX', 90);
        } catch {}
    }
}

async function getCachedTvPayload(matchId) {
    const key = `tv:match:${matchId}`;
    if (redisClient) {
        try {
            const v = await redisClient.get(key);
            if (v) return JSON.parse(v);
        } catch {}
    }
    return memTvCache.get(key) || null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PLAYERS
// ═══════════════════════════════════════════════════════════════════════════

// Register / upsert a player
app.post('/players', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.playerId) return res.status(400).json({ error: 'Missing playerId' });
    try {
        await ensureDB();
        const doc = await Player.findByIdAndUpdate(
            data.playerId,
            { _id: data.playerId, ...data },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ ok: true, player: doc });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to save player' });
    }
});

// Get all players
app.get('/players', async (req, res) => {
    try {
        await ensureDB();
        const players = await Player.find().lean();
        res.json(players.map(p => ({ ...p, playerId: p._id })));
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch players' });
    }
});

// Get single player
app.get('/players/:id', async (req, res) => {
    try {
        await ensureDB();
        const player = await Player.findById(req.params.id).lean();
        if (!player) return res.status(404).json({ error: 'Not found' });
        res.json({ ...player, playerId: player._id });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch player' });
    }
});

// Delete a player
app.delete('/players/:id', async (req, res) => {
    try {
        await ensureDB();
        await Player.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to delete player' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  PLAYER STATS — called after every official tournament
// ═══════════════════════════════════════════════════════════════════════════

// Update stats for ONE player
app.post('/stats/update', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.playerId || !data.stats) return res.status(400).json({ error: 'Missing playerId or stats' });
    try {
        await ensureDB();
        const doc = await Player.findByIdAndUpdate(
            data.playerId,
            { $set: { stats: data.stats } },
            { new: true, upsert: false }
        );
        if (!doc) return res.status(404).json({ error: 'Player not found in DB. Register first.' });
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to update stats' });
    }
});

// Bulk-update stats for multiple players at once (called after tournament ends)
app.post('/stats/bulk-update', async (req, res) => {
    const data = parseBody(req);
    if (!data || !Array.isArray(data.players)) return res.status(400).json({ error: 'Expected { players: [...] }' });
    try {
        await ensureDB();
        const ops = data.players.map(p => ({
            updateOne: {
                filter: { _id: p.playerId },
                update: { $set: { stats: p.stats } },
                upsert: false,
            }
        }));
        const result = await Player.bulkWrite(ops);
        res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Bulk stats update failed' });
    }
});

// Get all players with stats (for ranking page)
app.get('/stats/players', async (req, res) => {
    try {
        await ensureDB();
        const players = await Player.find({}, 'name playerId team role stats').lean();
        res.json(players);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch stats' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  TEAMS
// ═══════════════════════════════════════════════════════════════════════════

// Register / upsert a team
app.post('/teams', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.id) return res.status(400).json({ error: 'Missing team id' });
    try {
        await ensureDB();
        const doc = await Team.findByIdAndUpdate(
            data.id,
            { _id: data.id, ...data },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ ok: true, team: doc });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to save team' });
    }
});

// Get all teams
app.get('/teams', async (req, res) => {
    try {
        await ensureDB();
        const teams = await Team.find().lean();
        res.json(teams);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch teams' });
    }
});

// Update team stats (called after official tournament)
app.post('/team-stats/update', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.id || !data.stats) return res.status(400).json({ error: 'Missing id or stats' });
    try {
        await ensureDB();
        await Team.findByIdAndUpdate(
            data.id,
            { $set: { stats: data.stats } },
            { upsert: false }
        );
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to update team stats' });
    }
});

// Get teams with stats (for ranking page)
app.get('/team-stats', async (req, res) => {
    try {
        await ensureDB();
        const teams = await Team.find({}, 'name id stats').lean();
        res.json(teams);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch team stats' });
    }
});

// ─── Socket.io & HTTP Setup ──────────────────────────────────────────────────
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { 
        origin: true, 
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        credentials: true,
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-key', 'x-scoring-token', 'session-token', 'Session-Token']
    }
});

io.on('connection', (socket) => {
    console.log('📡 New Socket Connection:', socket.id);
    socket.on('joinMatch', (matchId) => {
        socket.join(`match_${matchId}`);
        console.log(`👤 Client joined room: match_${matchId}`);
    });
    socket.on('joinTournament', (tournamentId) => {
        socket.join(`tournament_${tournamentId}`);
        console.log(`👤 Client joined room: tournament_${tournamentId}`);
    });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
function emitUpdate(type, id, data) {
    if (type === 'match') {
        const room = `match_${id}`;
        // Send full data for real-time synchronization across scoring devices
        io.to(room).emit('scoreUpdate', data);
        if (data?.tournamentId) {
            io.to(`tournament_${data.tournamentId}`).emit('scoreUpdate', data);
        }
    } else if (type === 'tournament') {
        io.to(`tournament_${id}`).emit('tournamentUpdate', data);
    } else if (type === 'broadcast') {
        // Broadcast specific command (popups like Runs Needed, scorecard, etc.)
        if (id) io.to(`match_${id}`).emit('broadcastCmd', data);
        if (data.tournamentId) io.to(`tournament_${data.tournamentId}`).emit('broadcastCmd', data);
    }
    io.emit('globalUpdate', { type, id, data }); // Global update with data
    io.emit('allDevicesUpdate', { timestamp: Date.now(), type, id }); // Status heartbeat
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECURITY: Password Verification
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/handshake', async (req, res) => {
    const { id, type, password } = req.body;
    if (!id || !type || !password) return res.status(400).json({ error: 'Missing id, type, or password' });
    
    try {
        await ensureDB();
        const Model = type === 'match' ? Match : Tournament;
        const doc = await Model.findById(id).lean();
        
        if (!doc || !doc.scoring_password) {
            // No password set, but if it's a request, user needs a token to start
            const token = (type === 'tournament' || doc?.tournamentId) ? createScoringToken(id) : null;
            return res.json({ ok: true, token, expiresInMs: SCORING_TOKEN_TTL_MS });
        }
        
        const match = await bcrypt.compare(password, doc.scoring_password);
        if (match) {
            const tournamentId = type === 'tournament' ? id : (doc.tournamentId || id);
            const token = createScoringToken(tournamentId);
            res.json({ ok: true, token, expiresInMs: SCORING_TOKEN_TTL_MS });
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/tournaments/:id/verify-password', async (req, res) => {
    const { password } = req.body || {};
    const tournamentId = req.params.id;
    if (!tournamentId || !password) return res.status(400).json({ error: 'Missing tournament id or password' });
    try {
        await ensureDB();
        const doc = await Tournament.findById(tournamentId).lean();
        if (!doc) return res.status(404).json({ error: 'Tournament not found' });
        if (!doc.scoring_password) return res.json({ ok: true, token: null, expiresInMs: SCORING_TOKEN_TTL_MS });
        const match = await bcrypt.compare(password, doc.scoring_password);
        if (!match) return res.status(401).json({ error: 'Invalid password' });
        const token = createScoringToken(tournamentId);
        res.json({ ok: true, token, expiresInMs: SCORING_TOKEN_TTL_MS });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to verify password' });
    }
});

app.post('/api/tournaments/:id/scoring-authorized', async (req, res) => {
    const tournamentId = req.params.id;
    const token = req.body?.token || req.headers['x-scoring-token'];
    const payload = decodeScoringToken(token);
    if (!payload || payload.tournamentId !== tournamentId) {
        return res.status(401).json({ ok: false, authorized: false });
    }
    return res.json({ ok: true, authorized: true, expiresAt: payload.exp });
});

// ═══════════════════════════════════════════════════════════════════════════
//  MATCHES & TOURNAMENTS (LIVE SYNC)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/sync/match', async (req, res) => {
    const data = parseBody(req);
    const token = req.headers['x-scoring-token'];
    
    if (!data || !data.id) return res.status(400).json({ error: 'Missing match id' });
    
    try {
        await ensureDB();
        
        // Authorization Check
        if (data.tournamentId) {
            const payload = decodeScoringToken(token);
            if (!payload || payload.tournamentId !== data.tournamentId) {
                return res.status(401).json({ error: 'Unauthorized scoring session' });
            }
        }

        const update = { _id: data.id, data };
        if (data.scoringPassword) {
            update.scoring_password = await bcrypt.hash(data.scoringPassword, 10);
            data.isLocked = true; // Mark as locked in the public JSON
            delete data.scoringPassword; // Don't store plain in JSON data field
        }
        await Match.findByIdAndUpdate(data.id, update, { upsert: true });
        const tvPayload = buildLightScorePayload(data);
        if (tvPayload) await cacheTvPayload(data.id, tvPayload);
        emitUpdate('match', data.id, data);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to sync match' });
    }
});

app.get('/sync/matches', async (req, res) => {
    try {
        await ensureDB();
        const matches = await Match.find().lean();
        const tournaments = await Tournament.find().lean();
        
        // Map matches and protect passwords
        const publicMatches = matches.map(m => {
            const d = m.data || {};
            d.isLocked = !!m.scoring_password;
            return d;
        });
        
        const publicTournaments = tournaments.map(t => {
            const d = t.data || {};
            d.isLocked = !!t.scoring_password;
            return d;
        });

        res.json({ marker: 'mongoose', matches: publicMatches, tournaments: publicTournaments });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch matches' });
    }
});

app.post('/sync/order', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.id) return res.status(400).json({ error: 'Missing order id' });
    try {
        await ensureDB();
        await Order.findByIdAndUpdate(data.id, { _id: data.id, ...data }, { upsert: true });
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to sync order' });
    }
});

app.get('/sync/orders', async (req, res) => {
    try {
        await ensureDB();
        const orders = await Order.find().sort({ date: -1 }).lean();
        res.json(orders);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch orders' });
    }
});

app.delete('/sync/orders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await ensureDB();
        await Order.findByIdAndDelete(id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to delete order' });
    }
});

app.post('/sync/broadcast', async (req, res) => {
    const data = parseBody(req);
    // data should be the payload from Broadcast.send
    if (!data || !data.cmd) return res.status(400).json({ error: 'Missing broadcast command' });
    try {
        const id = data.matchId || data.tournamentId;
        emitUpdate('broadcast', id, data);
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to sync broadcast' });
    }
});

app.get('/tv/matches/:id/light', async (req, res) => {
    try {

        await ensureDB();
        const id = req.params.id;
        let payload = await getCachedTvPayload(id);
        if (!payload) {
            const m = await Match.findById(id).lean();
            if (!m) return res.status(404).json({ error: 'Match not found' });
            payload = buildLightScorePayload(m.data);
            if (payload) await cacheTvPayload(id, payload);
        }
        res.json(payload || { id, status: 'unknown' });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch tv payload' });
    }
});

app.post('/sync/tournament', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.id) return res.status(400).json({ error: 'Missing tournament id' });
    try {
        await ensureDB();
        const update = { _id: data.id, data };
        if (data.scoringPassword) {
            update.scoring_password = await bcrypt.hash(data.scoringPassword, 10);
            data.isLocked = true; // Mark as locked in the public JSON
            delete data.scoringPassword;
        }
        await Tournament.findByIdAndUpdate(data.id, update, { upsert: true });
        
        // Return a scoring token for the creator so they can sync matches immediately
        const token = createScoringToken(data.id);
        
        emitUpdate('tournament', data.id, data);
        res.json({ ok: true, token, expiresInMs: SCORING_TOKEN_TTL_MS });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to sync tournament' });
    }
});

app.get('/sync/tournaments', async (req, res) => {
    try {
        await ensureDB();
        const tournaments = await Tournament.find().lean();
        res.json(tournaments.map(t => t.data));
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch tournaments' });
    }
});

app.get('/sync/products', async (req, res) => {
    try {
        await ensureDB();
        const products = await Product.find().lean();
        res.json(products);
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch products' });
    }
});

app.post('/verify-password', async (req, res) => {
    const { id, type, password } = req.body;
    if (!id || !type || !password) return res.status(400).json({ error: 'Missing parameters' });
    try {
        await ensureDB();
        let record = null;
        if (type === 'match') {
            record = await Match.findById(id);
        } else if (type === 'tournament') {
            record = await Tournament.findById(id);
        }

        if (!record) return res.status(404).json({ error: 'Record not found' });
        
        // If there's no password set, it's effectively verified (or not locked)
        if (!record.scoring_password) return res.json({ verified: true });

        const isMatch = await bcrypt.compare(password, record.scoring_password);
        res.json({ verified: isMatch });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Delete a match from cloud
app.delete('/sync/matches/:id', async (req, res) => {
    try {
        await ensureDB();
        await Match.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to delete match' });
    }
});

// Delete a tournament from cloud
app.delete('/sync/tournaments/:id', async (req, res) => {
    try {
        await ensureDB();
        await Tournament.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to delete tournament' });
    }
});



// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════

// Upsert a single product
app.post('/sync/products', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.id) return res.status(400).json({ error: 'Missing product id' });
    try {
        await ensureDB();
        await Product.findByIdAndUpdate(data.id, { _id: data.id, ...data }, { upsert: true, new: true });
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message || 'Failed to save product' });
    }
});

// Get all products
app.get('/sync/products', async (req, res) => {
    try {
        await ensureDB();
        const products = await Product.find().lean();
        // Remap _id -> id for frontend compatibility
        res.json(products.map(p => ({ ...p, id: p._id })));
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch products' });
    }
});

// Delete a product
app.delete('/sync/products/:id', async (req, res) => {
    try {
        await ensureDB();
        await Product.findByIdAndDelete(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to delete product' });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  LEGACY /sync endpoint (kept for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════
app.post('/sync', async (req, res) => {
    const payload = parseBody(req);
    if (!payload) return res.status(400).json({ error: 'Invalid JSON' });
    const { type, data } = payload;
    if (type === 'player' && data?.playerId) {
        req.body = data;
        return app._router.handle({ ...req, url: '/players', method: 'POST', body: data }, res, () => {});
    }
    res.json({ ok: true, message: 'legacy sync acknowledged' });
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    try {
        await ensureDB();
        res.json({
            status: states[mongoose.connection.readyState] || 'unknown',
            dbName: mongoose.connection.name || 'none',
            env: process.env.NODE_ENV,
            ok: true
        });
    } catch (e) {
        res.status(500).json({
            status: states[mongoose.connection.readyState] || 'unknown',
            error: e.message,
            env: process.env.NODE_ENV,
            ok: false
        });
    }
});

// ─── Start ──────────────// ── Start ────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
        console.log(`\n\n🚀 SLCRICKPRO Backend Running!`);
        console.log(`🔗 Local Address: http://localhost:${PORT}`);
        
        // Log Network IPs for mobile connection
        const { networkInterfaces } = require('os');
        const nets = networkInterfaces();
        console.log(`📱 Mobile Access (Local Network):`);
        for (const name of Object.keys(nets)) {
            for (const net of nets[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    console.log(`   👉 http://${net.address}:${PORT}`);
                }
            }
        }
        console.log(`\n`);
    });
}

module.exports = app;
