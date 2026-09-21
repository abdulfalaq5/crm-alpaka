const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { config } = require('./config');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const auth = require('./routes/auth');
const member = require('./routes/member');
const admin = require('./routes/admin');

function createApp() {
  const app = express();

  if (config.forceHttps) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // HTTPS wajib di production (NFR-01): redirect bila permintaan tiba lewat HTTP.
  if (config.forceHttps) {
    app.use((req, res, next) => (req.secure ? next() : res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)));
  }

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ['X-Refresh-Token'] }));
  app.use(express.json({ limit: '100kb' }));

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Terlalu banyak permintaan. Coba lagi sebentar lagi.' } },
    })
  );

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/api/auth', auth.router);
  app.use('/api/admin', admin.router);
  app.use('/api', member.router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
