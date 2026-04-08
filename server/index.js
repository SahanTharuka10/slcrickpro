const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const bcrypt = require('bcrypt');
const socketIo = require('socket.io');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);

// Accept any origin and reflect it back to fully bypass strict CORS limitations
const io = socketIo(server, {
  cors: {
    origin: true, // Echoes the origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  }
});

// Using standard cors to apply CORS universally
app.use(cors({
  origin: true, // Dynamically set the Access-Control-Allow-Origin to the requested origin
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-api-key', 'x-scoring-token']
}));

// A fallback middleware strictly for cases where `cors()` might be skipped
app.use((req, res, next) => {
  if (!res.headersSent && req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'text/plain', limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req,res) => res.sendFile(path.join(__dirname,'..','index.html')));
app.get('/admin_2003', (req,res) => res.sendFile(path.join(__dirname,'..','pages','admin.html')));
app.get('/admin-portal', (req,res) => res.sendFile(path.join(__dirname,'..','pages','admin.html')));

// Simple Admin Login API
app.post('/api/admin/login', express.json(), (req, res) => {
    const { username, password } = req.body;
    if (username === 'STgamage' && password === 'ST26gamage@') {
        res.json({ success: true, token: 'admin-secret-token-2026' });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});
app.get('/admin/match-entry', (req,res) => res.sendFile(path.join(__dirname,'..','pages','admin.html')));

const LOCAL_SQLITE_PATH = process.env.LOCAL_DB_PATH || path.join(__dirname, '..', 'slcrickpro.sqlite');
let DATABASE_URL = process.env.DATABASE_URL || process.env.MONGO_URI || 'sqlite::memory:';

const sequelizeConfig = {
  dialect: DATABASE_URL.startsWith('postgres') ? 'postgres' : 'sqlite',
  logging: false,
  pool: {
    max: 10, 
    min: 2,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: DATABASE_URL.startsWith('postgres') ? {
    ssl: { require: true, rejectUnauthorized: false },
    keepAlive: true,
  } : {
    storage: LOCAL_SQLITE_PATH
  }
};

let sequelize = new Sequelize(DATABASE_URL, sequelizeConfig);

async function trySqliteFallback() {
  const sqliteUrl = `sqlite:${LOCAL_SQLITE_PATH}`;
  console.warn('Falling back to local SQLite:', sqliteUrl);
  DATABASE_URL = sqliteUrl;
  sequelize = new Sequelize(sqliteUrl, {
    dialect: 'sqlite',
    storage: LOCAL_SQLITE_PATH,
    logging: false
  });
  await sequelize.authenticate();
}


const SCORING_TOKEN_SECRET = process.env.SCORING_TOKEN_SECRET || 'slcrickpro-scoring-secret';
const SCORING_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

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
  stats: { type: DataTypes.JSON, defaultValue: {} },
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
  stats: { type: DataTypes.JSON, defaultValue: {} },
}, { timestamps: true, tableName: 'teams' });

const Match = sequelize.define('Match', {
  id: { type: DataTypes.STRING, primaryKey: true },
  scoring_password: DataTypes.STRING,
  data: DataTypes.JSON,
}, { timestamps: true, tableName: 'matches' });

const Tournament = sequelize.define('Tournament', {
  id: { type: DataTypes.STRING, primaryKey: true },
  scoring_password: DataTypes.STRING,
  data: DataTypes.JSON,
}, { timestamps: true, tableName: 'tournaments' });

const Product = sequelize.define('Product', {
  id: { type: DataTypes.STRING, primaryKey: true },
  name: DataTypes.STRING,
  price: DataTypes.DECIMAL(10,2),
  stock: DataTypes.INTEGER,
  category: DataTypes.STRING,
  type: DataTypes.STRING,
  brand: DataTypes.STRING,
  rating: DataTypes.DECIMAL(3,1),
  img: DataTypes.TEXT,
  imgFallback: DataTypes.TEXT,
  desc: DataTypes.TEXT,
  details: DataTypes.TEXT,
  isService: DataTypes.BOOLEAN,
}, { timestamps: true, tableName: 'products' });

const Order = sequelize.define('Order', {
  id: { type: DataTypes.STRING, primaryKey: true },
  name: DataTypes.STRING,
  phone: DataTypes.STRING,
  address: DataTypes.STRING,
  note: DataTypes.TEXT,
  items: DataTypes.JSON,
  total: DataTypes.DECIMAL(10,2),
  status: { type: DataTypes.STRING, defaultValue: 'pending' },
  date: DataTypes.BIGINT,
}, { timestamps: true, tableName: 'orders' });

async function ensureDB() {
  try {
    await sequelize.authenticate();
    // console.log('DB Authenticated');
    await sequelize.sync();
    return true;
  } catch (e) {
    console.warn('DB connection error detected:', e.message || e);
    // try fallback
    try {
      if (DATABASE_URL.includes('postgres') || DATABASE_URL.includes('mysql')) {
        await trySqliteFallback();
        await sequelize.sync();
        return true;
      }
    } catch (fallbackErr) {
      console.error('Fallback DB error', fallbackErr);
      throw fallbackErr;
    }
    throw e;
  }
}

function parseBody(req) {
  if (!req.body) return null;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  return req.body;
}

function generateScoringToken(tournamentId) {
  const payload = { tournamentId, iat: Date.now(), exp: Date.now() + SCORING_TOKEN_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const hmac = crypto.createHmac('sha256', SCORING_TOKEN_SECRET).update(encoded).digest('base64');
  return `${encoded}.${hmac}`;
}

function decodeScoringToken(token) {
  if (!token) return null;
  try {
    const [encoded, hmac] = token.split('.');
    const expected = crypto.createHmac('sha256', SCORING_TOKEN_SECRET).update(encoded).digest('base64');
    if (hmac !== expected) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function emitUpdate(type, id, data) {
  // Broadcast globally to ALL connected clients (this ensures cross-device updates)
  io.emit('globalUpdate', { type, id, data });
  if (type === 'match') {
    // scoreUpdate carries the full match object so viewers can update immediately
    io.emit('scoreUpdate', { id, ...data });
    // Also emit to anyone watching this match's specific room
    io.to(id).emit('scoreUpdate', { id, ...data });
  }
  if (type === 'tournament') {
    io.emit('tournamentUpdate', { id, ...data });
  }
}

app.get('/sync/matches', async (req, res) => {
  try {
    await ensureDB();
    const rows = await Match.findAll();
    let matches = rows.map(m => {
      let d = m.data || m.dataValues?.data || {};
      if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (e) { d = {}; }
      }
      d.isLocked = !!m.scoring_password;
      return d;
    });
    res.json({ matches });
  } catch (e) {
    console.error('/sync/matches error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch matches' });
  }
});

app.get('/sync/tournaments', async (req, res) => {
  try {
    await ensureDB();
    const rows = await Tournament.findAll();
    const tournaments = rows.map(t => {
      let d = t.data || t.dataValues?.data || {};
      if (typeof d === 'string') {
        try { d = JSON.parse(d); } catch (e) { d = {}; }
      }
      d.isLocked = !!t.scoring_password;
      return d;
    });
    res.json({ tournaments });
  } catch (e) {
    console.error('/sync/tournaments error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch tournaments' });
  }
});

// TV Overlay Specific Endpoint (Lightweight for frequent polling)
app.get('/tv/matches/:matchId/light', async (req, res) => {
  const { matchId } = req.params;
  try {
    await ensureDB();
    // Try direct PK lookup first
    let row = await Match.findByPk(matchId);
    
    // Fallback: search within JSON data if PK fails (handles sync edge cases)
    if (!row) {
      row = await Match.findOne({ where: { id: matchId } });
    }

    if (!row) return res.status(404).json({ error: 'Match not found' });
    
    let m = row.data || row.dataValues?.data || {};
    if (typeof m === 'string') {
      try { m = JSON.parse(m); } catch (e) { m = {}; }
    }
    const inn = m.innings ? m.innings[m.currentInnings || 0] : null;
    
    res.json({
      id: matchId,
      status: m.status,
      score: inn ? {
        runs: inn.runs || 0,
        wickets: inn.wickets || 0,
        balls: inn.balls || 0,
        battingTeam: inn.battingTeam,
        bowlingTeam: inn.bowlingTeam
      } : null,
      fullMatch: m 
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch light score' });
  }
});

app.get('/players', async (req, res) => {
  try {
    await ensureDB();
    const players = await Player.findAll();
    res.json(players.map(p => p.dataValues || p));
  } catch (e) {
    console.error('/players error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch players' });
  }
});

app.post('/players', async (req, res) => {
  const data = parseBody(req);
  if (data && !data.id && data.playerId) data.id = data.playerId;
  if (!data || !data.id) return res.status(400).json({ error: 'Missing player id' });
  try {
    await ensureDB();
    await Player.upsert(data);
    emitUpdate('player', data.id, data);
    res.json({ ok: true });
  } catch (e) {
    console.error('/players POST error', e);
    res.status(500).json({ error: e.message || 'Failed to sync player' });
  }
});

app.get('/teams', async (req, res) => {
  try {
    await ensureDB();
    const teams = await Team.findAll();
    res.json(teams.map(t => t.dataValues || t));
  } catch (e) {
    console.error('/teams error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch teams' });
  }
});

app.post('/teams', async (req, res) => {
  const data = parseBody(req);
  if (!data || !data.id) return res.status(400).json({ error: 'Missing team id' });
  try {
    await ensureDB();
    await Team.upsert(data);
    emitUpdate('team', data.id, data);
    res.json({ ok: true });
  } catch (e) {
    console.error('/teams POST error', e);
    res.status(500).json({ error: e.message || 'Failed to sync team' });
  }
});

app.get('/sync/products', async (req, res) => {
  try {
    await ensureDB();
    const products = await Product.findAll();
    res.json(products.map(p => p.dataValues || p));
  } catch (e) {
    console.error('/sync/products error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch products' });
  }
});

app.get('/test', (req, res) => res.json({ test: 'ok' }));

app.delete('/sync/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureDB();
    const m = await Match.findByPk(id);
    if (m) {
        let matchData = m.data || m.dataValues?.data || {};
        if (typeof matchData === 'string') try { matchData = JSON.parse(matchData); } catch(e) { matchData = {}; }
        matchData.deleted = true;
        matchData.status = 'deleted';
        matchData.lastUpdated = Date.now();
        await Match.upsert({ id, data: matchData, scoring_password: m.scoring_password });
    }
    io.emit('globalUpdate', { type: 'match_deleted', id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/sync/tournaments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await ensureDB();
    const t = await Tournament.findByPk(id);
    if (t) {
        let tData = t.data || t.dataValues?.data || {};
        if (typeof tData === 'string') try { tData = JSON.parse(tData); } catch(e) { tData = {}; }
        tData.deleted = true;
        tData.status = 'deleted';
        tData.lastUpdated = Date.now();
        await Tournament.upsert({ id, data: tData, scoring_password: t.scoring_password });
    }
    io.emit('globalUpdate', { type: 'tournament_deleted', id });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

console.log('routes defined');

app.post('/sync/match', async (req, res) => {
  const data = parseBody(req);
  const token = req.headers['x-scoring-token'];
  if (!data || !data.id) return res.status(400).json({ error: 'Missing match id' });
  try {
    await ensureDB();
    // SECURITY BYPASSED - Proceed with sync without token
    /*
    if (data.tournamentId) {
      const tour = await Tournament.findByPk(data.tournamentId);
      const locked = tour && tour.scoring_password;
      if (locked) {
        const payload = decodeScoringToken(token);
        if (!payload || payload.tournamentId !== data.tournamentId) return res.status(401).json({ error: 'Unauthorized scoring session' });
      }
    }
    */

    const dataCopy = { ...data };
    if (dataCopy.scoringPassword) {
      dataCopy.scoring_password = await bcrypt.hash(dataCopy.scoringPassword, 10);
      dataCopy.isLocked = true;
      delete dataCopy.scoringPassword;
    }

    await Match.upsert({ id: data.id, data: dataCopy, scoring_password: dataCopy.scoring_password });
    emitUpdate('match', data.id, dataCopy);
    res.json({ ok: true });
  } catch (e) {
    console.error('/sync/match error', e);
    res.status(500).json({ error: e.message || 'Failed to sync match' });
  }
});

app.post('/sync/tournament', async (req, res) => {
  const data = parseBody(req);
  if (!data || !data.id) return res.status(400).json({ error: 'Missing tournament id' });
  try {
    await ensureDB();
    const saved = { ...data };
    let token;
    if (saved.scoringPassword) {
      saved.scoring_password = await bcrypt.hash(saved.scoringPassword, 10);
      saved.isLocked = true;
      token = generateScoringToken(data.id);
      delete saved.scoringPassword;
    }

    await Tournament.upsert({ id: data.id, data: saved, scoring_password: saved.scoring_password });
    emitUpdate('tournament', data.id, saved);
    const resObj = { ok: true };
    if (token) { resObj.token = token; resObj.expiresInMs = SCORING_TOKEN_TTL_MS; }
    res.json(resObj);
  } catch (e) {
    console.error('/sync/tournament error', e);
    res.status(500).json({ error: e.message || 'Failed to sync tournament' });
  }
});

app.post('/verify-password', async (req, res) => {
  const data = parseBody(req);
  const id = data?.id;
  const type = data?.type;
  const password = data?.password;

  console.log('Verify password request:', { id, type, password: password ? '[REDACTED]' : null });

  if (!id || !type || !password) return res.status(400).json({ verified: false, error: 'Missing id/type/password' });

  try {
    await ensureDB();
    const Model = type === 'tournament' ? Tournament : Match;
    const record = await Model.findByPk(id);
    console.log('Record found:', record ? { id: record.id, hasPassword: !!record.scoring_password } : 'null');

    if (!record) return res.status(404).json({ verified: false, error: 'Record not found in cloud database. Please wait for sync or try again.' });

    // if no scoring password then allow access
    if (!record.scoring_password) {
      console.log('No password set, allowing access');
      return res.json({ verified: true });
    }

    // For development, allow 'password' as backdoor
    if (password === 'password') {
      console.log('Development backdoor used');
      return res.json({ verified: true });
    }

    const match = await bcrypt.compare(password, record.scoring_password);
    console.log('Password match result:', match);

    if (!match) return res.status(401).json({ verified: false, error: 'Invalid password' });

    res.json({ verified: true });
  } catch (e) {
    console.error('/verify-password error', e);
    res.status(500).json({ verified: false, error: e.message || 'Failed to verify password' });
  }
});

app.post('/api/handshake', async (req, res) => {
  const data = parseBody(req);
  const id = data?.id;
  const type = data?.type;
  const password = data?.password;

  if (!id || !type || !password) {
    return res.status(400).json({ ok: false, error: 'Missing id/type/password' });
  }

  try {
    await ensureDB();
    const Model = type === 'tournament' ? Tournament : Match;
    const record = await Model.findByPk(id);

    if (!record) {
      return res.status(404).json({ ok: false, error: 'Record not found' });
    }

    if (!record.scoring_password) {
      // Unlocked content; grant immediately
      return res.json({ ok: true, token: null, expiresInMs: 0 });
    }

    // Development backdoor
    if (password === 'password') {
      const token = generateScoringToken(id);
      return res.json({ ok: true, token, expiresInMs: SCORING_TOKEN_TTL_MS });
    }

    const match = await bcrypt.compare(password, record.scoring_password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid password' });
    }

    const token = generateScoringToken(id);
    return res.json({ ok: true, token, expiresInMs: SCORING_TOKEN_TTL_MS });
  } catch (e) {
    console.error('/api/handshake error', e);
    res.status(500).json({ ok: false, error: e.message || 'Handshake failed' });
  }
});

app.post('/match/initialize', async (req, res) => {
  const data = parseBody(req);
  if (!data || !data.matchId) return res.status(400).json({ ok: false, error: 'Missing matchId' });

  try {
    await ensureDB();
    let matchRecord = await Match.findByPk(data.matchId);

    if (!matchRecord) {
      // Creation fallback for resumes of local-only matches
      const now = Date.now();
      const matchData = {
        id: data.matchId,
        scoring_password: '',
        data: {
          id: data.matchId,
          tournamentId: data.tournamentId || null,
          status: 'live',
          createdAt: now,
          updatedAt: now,
          team1: 'Team 1',
          team2: 'Team 2',
          overs: 20,
          ballsPerOver: 6,
          innings: [{ runs:0, wickets:0, balls:0, batsmen:[] }, { runs:0, wickets:0, balls:0, batsmen:[] }],
          currentInnings: 0
        }
      };
      matchRecord = await Match.create(matchData);
    }

    if (!matchRecord) return res.status(404).json({ ok: false, error: 'Match not found' });

    const token = generateScoringToken(data.matchId);

    let matchData = matchRecord.data || matchRecord.dataValues?.data || {};
    if (typeof matchData === 'string') {
      try { matchData = JSON.parse(matchData); } catch (e) { matchData = {}; }
    }
    return res.json({ ok: true, match: matchData, sessionToken: token });
  } catch (e) {
    console.error('/match/initialize error', e);
    return res.status(500).json({ ok: false, error: e.message || 'Failed to initialize match' });
  }
});

app.post('/match/update', async (req, res) => {
  const payload = parseBody(req);
  if (!payload || !payload.matchId) return res.status(400).json({ ok: false, error: 'Missing matchId' });

  try {
    await ensureDB();
    const matchRecord = await Match.findByPk(payload.matchId);
    if (!matchRecord) return res.status(404).json({ ok: false, error: 'Match not found' });

    let matchData = matchRecord.data || matchRecord.dataValues?.data || {};
    if (typeof matchData === 'string') {
      try { matchData = JSON.parse(matchData); } catch (e) { matchData = {}; }
    }
    matchData.lastUpdatedAt = Date.now();
    matchData.lastModifiedByDevice = payload.actor || 'hotkey';

    // Quick in-memory scoring update (keyboard-driven)
    if (!matchData.innings || matchData.innings.length < 1) matchData.innings = [{ runs:0, wickets:0, balls:0 }, { runs:0, wickets:0, balls:0 }];
    const inn = matchData.innings[matchData.currentInnings || 0];

    if (payload.eventType === 'RUN' && typeof payload.runs === 'number') {
      inn.runs += payload.runs;
      inn.balls += 1;
    } else if (payload.eventType === 'WICKET') {
      inn.wickets += 1;
      inn.balls += 1;
    } else if (payload.eventType === 'OVER_END') {
      matchData.currentInnings = Math.min(1, (matchData.currentInnings || 0));
    }

    await Match.upsert({ id: payload.matchId, scoring_password: matchRecord.scoring_password || '', data: matchData });
    emitUpdate('match', payload.matchId, { id: payload.matchId, ...matchData });

    res.json({ ok: true, ...matchData });
  } catch (e) {
    console.error('/match/update error', e);
    res.status(500).json({ ok: false, error: e.message || 'Update failed' });
  }
});

app.get('/stats/players', async (req, res) => {
  try {
    await ensureDB();
    const players = await Player.findAll();
    res.json(players.map(p => (p.dataValues ? p.dataValues : p)));
  } catch (e) {
    console.error('/stats/players error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch player stats' });
  }
});

app.get('/team-stats', async (req, res) => {
  try {
    await ensureDB();
    const teams = await Team.findAll();
    res.json(teams.map(t => (t.dataValues ? t.dataValues : t)));
  } catch (e) {
    console.error('/team-stats error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch team stats' });
  }
});

app.post('/sync/broadcast', (req, res) => {
    const data = parseBody(req);
    if (data && data.matchId) {
        console.log(`[HTTP Broadcast] Command '${data.cmd}' for ${data.matchId}`);
        // Relay to all matching sockets
        io.to(data.matchId).emit('broadcast_command', data);
        return res.json({ ok: true });
    }
    res.status(400).json({ error: 'Missing matchId or data' });
});

app.get('/health', async (req, res) => {
  try { await ensureDB(); res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

// --- REAL-TIME ENGINE (Socket.io) ---
io.on('connection', (socket) => {
    console.log('User connected to Sync Engine:', socket.id);

    // Join the global room — all clients share this for board-level updates
    socket.join('global');

    socket.on('join_global', () => {
        socket.join('global');
        console.log(`Socket ${socket.id} joined global room`);
    });

    socket.on('join_match', (matchId) => {
        if (matchId) {
            socket.join(matchId);
            console.log(`Socket ${socket.id} joined match room: ${matchId}`);
            // Send immediate sync signal to newly joined viewer
            socket.emit('globalUpdate', { type: 'joined', id: matchId });
        }
    });

    // BROADCAST COMMAND: Forward TV Overlay triggers (e.g. show Team Card)
    socket.on('broadcast_command', (data) => {
        if (data && data.matchId) {
            console.log(`[Broadcast] Command '${data.cmd}' for ${data.matchId}`);
            // Forward to the specific match room AND globally
            io.to(data.matchId).emit('broadcast_command', data);
            io.emit('broadcast_command', data); // also global
        }
    });

    socket.on('request_sync', (data) => {
        if (data && (data.matchId || data.tournId)) {
            const id = data.matchId || data.tournId;
            console.log(`[SyncRequest] TV overlay requested sync for ${id}`);
            io.to(id).emit('request_sync', data);
        }
    });

    socket.on('force_refresh', (data) => {
        if (data && data.matchId) {
            io.to(data.matchId).emit('force_refresh', data);
            io.emit('globalUpdate', { type: 'match', id: data.matchId, data });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected from Sync Engine:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Rocket backend: http://localhost:${PORT}`);
});
