const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const fs = require('fs');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');
const { getPool } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const apiRoutes = require('./routes');
const { initializeChatSocket } = require('./realtime/chat.socket');
const { initializeNotificationSocket } = require('./realtime/notification.socket');

const app = express();
const PORT = process.env.PORT || 5000;

// Omitting allowedHeaders makes the cors package reflect whatever headers a preflight
// actually requests (Authorization included), so a new custom header never needs a
// matching code change here — this is what silently broke before.
app.use(
  cors({
    origin: "*",
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use(express.json());

// API docs are public (no requireAuth) so the spec can be browsed before logging in.
const openapiDocument = yaml.load(fs.readFileSync(path.join(__dirname, 'openapi.yaml'), 'utf8'));
app.get('/api-docs.json', (req, res) => res.json(openapiDocument));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.use('/api', apiRoutes);

// Serves the built Angular app (ng build output) at "/". Registered after
// /api so an API request never falls through to here. Static assets (JS/CSS/
// fonts) are served directly; any other GET (e.g. a deep link like
// /register/d5) falls back to index.html so Angular's client-side router
// can take over.
const clientDist = path.join(__dirname, 'dist');

app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next(err);
  });
});

app.use(errorHandler);

async function startServer() {
  try {
    await getPool();
    console.log('Database connection established');
  } catch (error) {
    console.error('Database initialization failed:', error.message);
  }

  const server = http.createServer(app);
  initializeNotificationSocket(initializeChatSocket(server));
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use — another node server.js is likely still running. Find it with "netstat -ano | findstr :${PORT}" and stop it, then try again.`);
    } else {
      console.error('Server failed to start:', err);
    }
    process.exit(1);
  });
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

if (require.main === module) {
  startServer();
} else {
  module.exports = { app, startServer };
}
