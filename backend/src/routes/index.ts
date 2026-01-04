import { Router } from 'express';
import recoveryRoutes from './recovery.routes';
import sessionRoutes from './session.routes';
import accountRoutes from './account.routes';

const router = Router();

// Mount routes
router.use('/recovery', recoveryRoutes);
router.use('/session', sessionRoutes);
router.use('/account', accountRoutes);

// Health check
router.get('/health', (req, res) => {
    res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint to check account hash calculation
router.get('/debug/account-hash/:publicKey', (req, res) => {
    try {
        const { CLPublicKey } = require('casper-js-sdk');
        const publicKey = CLPublicKey.fromHex(req.params.publicKey);
        const accountHash = publicKey.toAccountHash();
        const accountHashHex = Buffer.from(accountHash).toString('hex');
        const accountHashStr = publicKey.toAccountHashStr();
        
        res.json({
            success: true,
            data: {
                publicKey: req.params.publicKey,
                accountHashHex: accountHashHex,
                accountHashStr: accountHashStr,
                expectedStorageKey: `grp_init_${accountHashHex}`,
            }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            error: `Invalid public key: ${error}`
        });
    }
});

export default router;
