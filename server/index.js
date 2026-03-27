const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const socketIo = require('socket.io');
const http = require('http');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

// ─── Security Middleware (Hand-rolled Helmet) ─────────────────
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:;");
    next();
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

const playerSchema = new mongoose.Schema({
    _id:        { type: String },   // playerId e.g. CP0001
    name:       { type: String },
    dob:        { type: String },
    phone:      { type: String },
    address:    { type: String },
    team:       { type: String },
    role:       { type: String },
    batStyle:   { type: String },
    bowlStyle:  { type: String },
    jersey:     { type: mongoose.Schema.Types.Mixed },
    createdAt:  { type: Number },
    stats: {
        matches:      { type: Number, default: 0 },
        innings:      { type: Number, default: 0 },
        runs:         { type: Number, default: 0 },
        balls:        { type: Number, default: 0 },
        fours:        { type: Number, default: 0 },
        sixes:        { type: Number, default: 0 },
        notOuts:      { type: Number, default: 0 },
        highScore:    { type: Number, default: 0 },
        thirties:     { type: Number, default: 0 },
        fifties:      { type: Number, default: 0 },
        hundreds:     { type: Number, default: 0 },
        wickets:      { type: Number, default: 0 },
        overs:        { type: Number, default: 0 },
        bowlingRuns:  { type: Number, default: 0 },
        maidens:      { type: Number, default: 0 },
        bestBowling:  { type: String, default: '0/0' },
        catches:      { type: Number, default: 0 },
        stumpings:    { type: Number, default: 0 },
    },
}, { _id: false, timestamps: true });

const teamSchema = new mongoose.Schema({
    _id:       { type: String },  // TEAM-<timestamp>
    name:      { type: String },
    ground:    { type: String },
    captain:   { type: String },
    manager:   { type: String },
    contact:   { type: String },
    year:      { type: String },
    createdAt: { type: Number },
    stats: {
        played:   { type: Number, default: 0 },
        won:      { type: Number, default: 0 },
        lost:     { type: Number, default: 0 },
        tied:     { type: Number, default: 0 },
        prizeMoney: { type: Number, default: 0 },
        runsFor:     { type: Number, default: 0 },
        runsAgainst: { type: Number, default: 0 },
    },
}, { _id: false, timestamps: true });

const Player = mongoose.model('Player', playerSchema);
const Team   = mongoose.model('Team',   teamSchema);

const matchSchema = new mongoose.Schema({
    _id:  { type: String }, // MATCH-<timestamp>
    scoring_password: { type: String }, // Hashed
    data: { type: mongoose.Schema.Types.Mixed }
}, { _id: false, timestamps: true });

const tournamentSchema = new mongoose.Schema({
    _id:  { type: String }, // TOURN-<timestamp>
    scoring_password: { type: String }, // Hashed
    data: { type: mongoose.Schema.Types.Mixed }
}, { _id: false, timestamps: true });

const Match      = mongoose.model('Match', matchSchema);
const Tournament = mongoose.model('Tournament', tournamentSchema);

const productSchema = new mongoose.Schema({
    _id:         { type: String }, // PROD-<id>
    name:        { type: String },
    price:       { type: Number },
    stock:       { type: Number },
    category:    { type: String },
    type:        { type: String },
    brand:       { type: String },
    rating:      { type: Number },
    img:         { type: String },
    imgFallback: { type: String },
    desc:        { type: String },
    details:     { type: String },
    isService:   { type: Boolean },
}, { _id: false, timestamps: true });

const Product = mongoose.model('Product', productSchema);

// ─── Connect to MongoDB (serverless-safe, promise-cached) ────────────────────

let _connectPromise = null;

const ensureDB = () => {
    if (mongoose.connection.readyState === 1) return Promise.resolve(); // already connected
    if (!process.env.MONGO_URI) {
        return Promise.reject(new Error('MONGO_URI is not set in environment variables.'));
    }
    // Cache the connection promise so concurrent cold-start requests share one attempt
    if (!_connectPromise) {
        _connectPromise = mongoose.connect(process.env.MONGO_URI, {
            dbName: 'crickdb',
            serverSelectionTimeoutMS: 8000,
        }).then(() => {
            console.log('✅ Connected to MongoDB (crickdb)');
        }).catch(err => {
            _connectPromise = null; // allow retry on next request
            console.error('❌ MongoDB connect failed:', err.message);
            throw err;
        });
    }
    return _connectPromise;
};

// Warm-start: kick off connection when module first loads
ensureDB().catch(() => {});


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
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
    console.log('📡 New Socket Connection:', socket.id);
    socket.on('joinMatch', (matchId) => {
        socket.join(`match_${matchId}`);
        console.log(`👤 Client joined room: match_${matchId}`);
    });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
function emitUpdate(type, id, data) {
    const room = type === 'match' ? `match_${id}` : `tournament_${id}`;
    // Send lightweight data to TV
    const lightData = { ...data };
    if (lightData.data && lightData.data.history) delete lightData.data.history;
    if (lightData.data && lightData.data.redoStack) delete lightData.data.redoStack;
    
    io.to(room).emit('scoreUpdate', lightData);
    io.emit('globalUpdate', { type, id }); // For ticker/ongoing pages
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECURITY: Password Verification
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/verify-scoring-password', async (req, res) => {
    const { id, type, password } = req.body;
    if (!id || !type || !password) return res.status(400).json({ error: 'Missing id, type, or password' });
    
    try {
        await ensureDB();
        const Model = type === 'match' ? Match : Tournament;
        const doc = await Model.findById(id).lean();
        
        if (!doc || !doc.scoring_password) {
            return res.json({ ok: true, message: 'No password required' });
        }
        
        const match = await bcrypt.compare(password, doc.scoring_password);
        if (match) {
            res.json({ ok: true, token: 'TEMP_SCORING_TOKEN_' + Date.now() }); // Simple mock token
        } else {
            res.status(401).json({ error: 'Invalid password' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  MATCHES & TOURNAMENTS (LIVE SYNC)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/sync/match', async (req, res) => {
    const data = parseBody(req);
    if (!data || !data.id) return res.status(400).json({ error: 'Missing match id' });
    try {
        await ensureDB();
        const update = { _id: data.id, data };
        if (data.scoringPassword) {
            update.scoring_password = await bcrypt.hash(data.scoringPassword, 10);
            delete data.scoringPassword; // Don't store plain in JSON data field
        }
        await Match.findByIdAndUpdate(data.id, update, { upsert: true });
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
        res.json(matches.map(m => m.data));
    } catch (e) {
        res.status(500).json({ error: e.message || 'Failed to fetch matches' });
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
            delete data.scoringPassword;
        }
        await Tournament.findByIdAndUpdate(data.id, update, { upsert: true });
        emitUpdate('tournament', data.id, data);
        res.json({ ok: true });
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
    server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = app;
