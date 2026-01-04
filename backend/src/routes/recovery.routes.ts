import { Router, Request, Response } from 'express';
import { contractService, casperService } from '../services';
import { ApiResponse } from '../types';

const router = Router();

/**
 * POST /recovery/deploy-test-contract
 * Deploy a minimal test contract to verify deployment works
 */
router.post('/deploy-test-contract', async (req: Request, res: Response) => {
    try {
        const { installerPublicKey } = req.body;

        if (!installerPublicKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: installerPublicKey',
            } as ApiResponse);
        }

        const result = await contractService.buildTestContractDeploy(installerPublicKey);

        res.json({
            success: true,
            data: {
                deployJson: result.message,
                note: 'This is a minimal test contract to verify deployment works',
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build test contract deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/deploy-contract
 * Deploy the recovery registry contract (one-time setup)
 */
router.post('/deploy-contract', async (req: Request, res: Response) => {
    try {
        const { installerPublicKey } = req.body;

        if (!installerPublicKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: installerPublicKey',
            } as ApiResponse);
        }

        if (contractService.isContractDeployed()) {
            return res.status(400).json({
                success: false,
                error: 'Contract already deployed. Hash: ' + process.env.RECOVERY_CONTRACT_HASH,
            } as ApiResponse);
        }

        const result = await contractService.buildInstallDeploy(installerPublicKey);

        res.json({
            success: true,
            data: {
                deployJson: result.message,
                note: 'After deploy succeeds, find the contract hash in your account named keys and set RECOVERY_CONTRACT_HASH in .env',
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build contract deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /recovery/contract-status
 * Check if contract is deployed
 */
router.get('/contract-status', async (req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            deployed: contractService.isContractDeployed(),
            contractHash: process.env.RECOVERY_CONTRACT_HASH || null,
        },
    } as ApiResponse);
});

/**
 * POST /recovery/register
 * Initialize guardians for an account (Action 1)
 */
router.post('/register', async (req: Request, res: Response) => {
    try {
        const { userPublicKey, guardians, threshold } = req.body;

        if (!userPublicKey || !guardians || !threshold) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userPublicKey, guardians, threshold',
            } as ApiResponse);
        }

        if (!Array.isArray(guardians) || guardians.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'At least 2 guardians are required',
            } as ApiResponse);
        }
        
        // Check that user is not in the guardians list
        const userIsGuardian = guardians.some(
            (g: string) => g.trim().toLowerCase() === userPublicKey.trim().toLowerCase()
        );
        if (userIsGuardian) {
            return res.status(400).json({
                success: false,
                error: 'User account cannot be a guardian. Guardians must be different accounts.',
            } as ApiResponse);
        }
        
        // Check for duplicate guardians
        const uniqueGuardians = new Set(guardians.map((g: string) => g.trim().toLowerCase()));
        if (uniqueGuardians.size !== guardians.length) {
            return res.status(400).json({
                success: false,
                error: 'Duplicate guardian addresses detected. Each guardian must be unique.',
            } as ApiResponse);
        }

        const result = await contractService.initializeGuardians(
            userPublicKey,
            guardians,
            threshold
        );

        res.json({
            success: true,
            data: {
                deployJson: result.message,
                note: 'This is an unsigned deploy. Sign it with Casper Wallet and submit.',
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build register deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/initiate
 * Initiate recovery request (Action 2)
 */
router.post('/initiate', async (req: Request, res: Response) => {
    console.log('\n\n========== INITIATE RECOVERY ==========');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    try {
        const { initiatorPublicKey, targetAccount, newPublicKey } = req.body;

        console.log('Parsed values:');
        console.log('  Initiator:', initiatorPublicKey);
        console.log('  Target Account:', targetAccount);
        console.log('  New Public Key:', newPublicKey);

        if (!initiatorPublicKey || !targetAccount || !newPublicKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: initiatorPublicKey, targetAccount, newPublicKey',
            } as ApiResponse);
        }

        const result = await contractService.initiateRecovery(
            initiatorPublicKey,
            targetAccount,
            newPublicKey
        );
        
        console.log('Deploy built successfully');
        console.log('========================================\n');

        res.json({
            success: true,
            data: {
                deployJson: result.message,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build initiate recovery deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/approve
 * Approve recovery request (Action 3)
 */
router.post('/approve', async (req: Request, res: Response) => {
    try {
        const { guardianPublicKey, recoveryId } = req.body;

        if (!guardianPublicKey || !recoveryId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: guardianPublicKey, recoveryId',
            } as ApiResponse);
        }

        const result = await contractService.approveRecovery(
            guardianPublicKey,
            recoveryId
        );

        res.json({
            success: true,
            data: {
                deployJson: result.message,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build approve recovery deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/finalize
 * Finalize recovery request (Action 5)
 */
router.post('/finalize', async (req: Request, res: Response) => {
    try {
        const { signerPublicKey, recoveryId } = req.body;

        if (!signerPublicKey || !recoveryId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: signerPublicKey, recoveryId',
            } as ApiResponse);
        }

        const result = await contractService.finalizeRecovery(
            signerPublicKey,
            recoveryId
        );

        res.json({
            success: true,
            data: {
                deployJson: result.message,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build finalize recovery deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/check-threshold
 * Build deploy to check if threshold is met (Action 4)
 */
router.post('/check-threshold', async (req: Request, res: Response) => {
    try {
        const { signerPublicKey, recoveryId } = req.body;

        if (!signerPublicKey || !recoveryId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: signerPublicKey, recoveryId',
            } as ApiResponse);
        }

        const result = await contractService.buildCheckThresholdDeploy(
            signerPublicKey,
            recoveryId
        );

        res.json({
            success: true,
            data: {
                deployJson: result.message,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build check threshold deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/has-guardians
 * Build deploy to check if account has guardians (Action 8)
 */
router.post('/has-guardians', async (req: Request, res: Response) => {
    try {
        const { signerPublicKey, targetAccount } = req.body;

        if (!signerPublicKey || !targetAccount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: signerPublicKey, targetAccount',
            } as ApiResponse);
        }

        const result = await contractService.buildHasGuardiansDeploy(
            signerPublicKey,
            targetAccount
        );

        res.json({
            success: true,
            data: {
                deployJson: result.message,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build has-guardians deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/get-guardians
 * Build deploy to get guardians for an account (Action 6)
 */
router.post('/get-guardians', async (req: Request, res: Response) => {
    try {
        const { signerPublicKey, targetAccount } = req.body;

        if (!signerPublicKey || !targetAccount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: signerPublicKey, targetAccount',
            } as ApiResponse);
        }

        const result = await contractService.buildGetGuardiansDeploy(
            signerPublicKey,
            targetAccount
        );

        res.json({
            success: true,
            data: {
                deployJson: result.message,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build get-guardians deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /recovery/status/:recoveryId
 * Get recovery status (off-chain query)
 */
router.get('/status/:recoveryId', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.params;
        const { signerPublicKey } = req.query;

        if (!signerPublicKey || typeof signerPublicKey !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Missing required query parameter: signerPublicKey',
            } as ApiResponse);
        }

        const details = await casperService.getRecoveryDetails(signerPublicKey, recoveryId);

        if (!details) {
            return res.status(404).json({
                success: false,
                error: 'Recovery not found',
            } as ApiResponse);
        }

        res.json({
            success: true,
            data: {
                recoveryId,
                ...details,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get recovery status: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /recovery/active/:publicKey
 * Get active recovery for an account (off-chain query)
 */
router.get('/active/:publicKey', async (req: Request, res: Response) => {
    try {
        const { publicKey } = req.params;

        const activeRecoveryId = await casperService.getActiveRecovery(publicKey);

        res.json({
            success: true,
            data: {
                hasActiveRecovery: activeRecoveryId !== null,
                recoveryId: activeRecoveryId,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get active recovery: ${error}`,
        } as ApiResponse);
    }
});

export default router;
