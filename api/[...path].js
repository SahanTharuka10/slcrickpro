const app = require('../server/index.js');

module.exports = (req, res) => {
  // Strip the /api prefix so Express routes work correctly.
  // With Vercel rewrites, req.url will be like /api/players or /api/sync/matches
  if (typeof req.url === 'string' && req.url.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  return app(req, res);
};
