import express from 'express';
import cors from 'cors';
import { config } from './config';
import routes from './routes';

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging in development
if (config.nodeEnv === 'development') {
    app.use((req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
        next();
    });
}

// Mount API routes
app.use('/api', routes);

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err.message);
    res.status(500).json({
        success: false,
        error: config.nodeEnv === 'development' ? err.message : 'Internal server error',
    });
});

// Start server
const PORT = config.port;
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     Guardian Recovery Protocol - Backend Server               ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on http://localhost:${PORT}                   ║
║  Environment: ${config.nodeEnv.padEnd(46)}                    ║
║  Casper Node: ${config.casper.nodeUrl.substring(0, 44).padEnd(46)}║
║  Chain: ${config.casper.chainName.padEnd(52)}                 ║
╚═══════════════════════════════════════════════════════════════╝

API Endpoints:
  GET  /api/health                  - Health check
  
  Recovery (Contract):
  POST /api/recovery/register       - Register guardians
  POST /api/recovery/initiate       - Start recovery
  POST /api/recovery/approve        - Approve recovery
  GET  /api/recovery/status/:hash   - Check status
  
  Session WASM:
  POST /api/session/add-key         - Build add key deploy
  POST /api/session/remove-key      - Build remove key deploy
  POST /api/session/update-thresholds - Build threshold deploy
  POST /api/session/submit          - Submit signed deploy
  POST /api/session/check-signatures - Check signature count
  
  Account:
  GET  /api/account/:pubkey         - Get account info
  GET  /api/account/:pubkey/keys    - Get associated keys
  GET  /api/account/deploy/:hash    - Get deploy status
`);
});

export default app;
