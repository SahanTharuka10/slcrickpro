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

// Allowed origins for production frontends
const ALLOWED_ORIGINS = [
  'https://www.slcrickpro.live',
  'https://slcrickpro.live',
  'https://slcrickpro.vercel.app',
  'https://slcrickpro-server.onrender.com'
];

const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET','POST'],
    credentials: true
  }
});

// Explicit CORS headers to ensure even error/404 responses include them
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, x-api-key, x-scoring-token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));
app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req,res) => res.sendFile(path.join(__dirname,'..','index.html')));
app.get('/admin-portal', (req,res) => res.sendFile(path.join(__dirname,'..','pages','admin.html')));

const DATABASE_URL = process.env.DATABASE_URL || process.env.MONGO_URI || 'sqlite::memory:';
const sequelize = new Sequelize(DATABASE_URL, {
  dialect: DATABASE_URL.startsWith('postgres') ? 'postgres' : 'sqlite',
  logging: false,
  dialectOptions: DATABASE_URL.startsWith('postgres') ? { ssl: { require: true, rejectUnauthorized: false }} : {},
});

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
    await sequelize.sync();
    return true;
  } catch (e) {
    console.error('DB connection error', e);
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
  io.emit(`${type}:${id}`, data);
}

app.get('/sync/matches', async (req, res) => {
  try {
    await ensureDB();
    res.json({ marker:'updated' });
  } catch (e) {
    console.error('/sync/matches error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch matches' });
  }
});

app.get('/sync/tournaments', async (req, res) => {
  try {
    await ensureDB();
    const tournaments = await Tournament.findAll();
    const publicTournaments = tournaments.map(t => { const d = t.data || {}; d.isLocked = !!t.scoring_password; return d; });
    res.json(publicTournaments);
  } catch (e) {
    console.error('/sync/tournaments error', e);
    res.status(500).json({ error: e.message || 'Failed to fetch tournaments' });
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

console.log('routes defined');

app.post('/sync/match', async (req, res) => {
  const data = parseBody(req);
  const token = req.headers['x-scoring-token'];
  if (!data || !data.id) return res.status(400).json({ error: 'Missing match id' });
  try {
    await ensureDB();
    if (data.tournamentId) {
      const tour = await Tournament.findByPk(data.tournamentId);
      const locked = tour && tour.scoring_password;
      if (locked) {
        const payload = decodeScoringToken(token);
        if (!payload || payload.tournamentId !== data.tournamentId) return res.status(401).json({ error: 'Unauthorized scoring session' });
      }
    }

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

  if (!id || !type || !password) return res.status(400).json({ verified: false, error: 'Missing id/type/password' });

  try {
    await ensureDB();
    const Model = type === 'tournament' ? Tournament : Match;
    const record = await Model.findByPk(id);
    if (!record) return res.status(404).json({ verified: false, error: 'Record not found' });

    // if no scoring password then allow access
    if (!record.scoring_password) return res.json({ verified: true });

    const match = await bcrypt.compare(password, record.scoring_password);
    if (!match) return res.status(401).json({ verified: false, error: 'Invalid password' });

    res.json({ verified: true });
  } catch (e) {
    console.error('/verify-password error', e);
    res.status(500).json({ verified: false, error: e.message || 'Failed to verify password' });
  }
});

app.get('/health', async (req, res) => {
  try { await ensureDB(); res.json({ ok: true }); } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Rocket backend: http://localhost:${PORT}`);
});
