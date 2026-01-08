import { Router, Request, Response } from 'express';
import { contractService, casperService, notifyGuardiansOfRecovery } from '../services';
import { ApiResponse } from '../types';

const router = Router();

/*
 * POST /recovery/deploy-test-contract
 * Deploy a minimal test contract to verify deployment works
 */
/*
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
*/

/**
 * POST /recovery/deploy-contract
 * Deploy the recovery registry contract (one-time setup)
 */
/*
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
*/

/**
 * GET /recovery/contract-status
 * Check if contract is deployed
 */
/*
router.get('/contract-status', async (req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            deployed: contractService.isContractDeployed(),
            contractHash: process.env.RECOVERY_CONTRACT_HASH || null,
        },
    } as ApiResponse);
});
*/

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

        // Log guardian data from contract dictionary for debugging
        const contractHash = process.env.RECOVERY_REGISTRY_HASH;
        console.log('Using Contract Hash for Deploy:', contractHash);

        if (contractHash) {
            console.log('\n=== Checking Contract Registry ===');
            const contractGuardianData = await casperService.getGuardiansFromContract(contractHash, targetAccount);
            console.log('Contract Guardian Data:', JSON.stringify(contractGuardianData, null, 2));
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

/**
 * GET /recovery/details/:recoveryId
 * Get recovery details by ID from contract dictionary (off-chain query)
 */
router.get('/details/:recoveryId', async (req: Request, res: Response) => {
    try {
        const { recoveryId } = req.params;

        const details = await casperService.getRecoveryByIdFromContract(recoveryId);

        if (!details) {
            return res.status(404).json({
                success: false,
                error: 'Recovery not found',
            } as ApiResponse);
        }

        res.json({
            success: true,
            data: details,
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get recovery details: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /recovery/account-status/:publicKey
 * Get guardian configuration for an account (off-chain query)
 */
router.get('/account-status/:publicKey', async (req: Request, res: Response) => {
    try {
        const { publicKey } = req.params;

        // Parallelize queries for performance
        const [isInitialized, guardians, threshold] = await Promise.all([
            casperService.hasGuardians(publicKey),
            casperService.getGuardians(publicKey),
            casperService.getThreshold(publicKey)
        ]);

        res.json({
            success: true,
            data: {
                isInitialized,
                guardians,
                threshold,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get account status: ${error}`,
        } as ApiResponse);
    }
});

/**
 * GET /recovery/for-guardian/:publicKey
 * Get all recoveries where the public key is a guardian (off-chain query)
 */
router.get('/for-guardian/:publicKey', async (req: Request, res: Response) => {
    try {
        const { publicKey } = req.params;

        const recoveries = await casperService.getRecoveriesForGuardian(publicKey);

        res.json({
            success: true,
            data: {
                recoveries,
                count: recoveries.length,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to get recoveries for guardian: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/notify-guardians
 * Send email notifications to guardians about a recovery request
 * Called by frontend after recovery deploy is confirmed successful
 */
router.post('/notify-guardians', async (req: Request, res: Response) => {
    try {
        const { targetAccount, newPublicKey, initiatorPublicKey, recoveryId } = req.body;

        console.log('\n=== Notify Guardians Request ===');
        console.log('Target Account:', targetAccount);
        console.log('Recovery ID:', recoveryId);
        console.log('Initiator Public Key:', initiatorPublicKey);

        if (!targetAccount || !newPublicKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: targetAccount, newPublicKey',
            } as ApiResponse);
        }

        const contractHash = process.env.RECOVERY_REGISTRY_HASH;
        if (!contractHash) {
            return res.status(500).json({
                success: false,
                error: 'Contract hash not configured',
            } as ApiResponse);
        }

        // Get guardian account hashes from the contract
        const { CLPublicKey } = await import('casper-js-sdk');
        const targetPubKey = CLPublicKey.fromHex(targetAccount);
        const targetAccountHash = targetPubKey.toAccountHash();
        const targetAccountHashHex = Buffer.from(targetAccountHash).toString('hex');
        const debugFormat = `AccountHash(${targetAccountHashHex})`;

        console.log('Querying guardians from contract for:', debugFormat);

        const guardiansResult = await casperService.queryContractDictionary(
            contractHash, 'd', `g${debugFormat}`
        );

        // Handle multiple possible response structures for guardians data
        let guardiansData: any[] | undefined;

        if (guardiansResult?.CLValue && Array.isArray(guardiansResult.CLValue)) {
            // Direct CLValue array format
            guardiansData = guardiansResult.CLValue;
        } else if (guardiansResult?.CLValue?.data && Array.isArray(guardiansResult.CLValue.data)) {
            // CLValue with data property
            guardiansData = guardiansResult.CLValue.data;
        } else if (guardiansResult?.stored_value?.CLValue?.data && Array.isArray(guardiansResult.stored_value.CLValue.data)) {
            // Wrapped format
            guardiansData = guardiansResult.stored_value.CLValue.data;
        } else if (Array.isArray(guardiansResult)) {
            // Raw array format
            guardiansData = guardiansResult;
        }

        console.log('Parsed guardians data:', JSON.stringify(guardiansData));

        if (!guardiansData || !Array.isArray(guardiansData)) {
            return res.json({
                success: true,
                data: {
                    emailsSent: 0,
                    emailsFailed: 0,
                    emailsSkipped: 0,
                    message: 'No guardians found for this account',
                },
            } as ApiResponse);
        }

        // Convert guardian data to account hashes (lowercase for consistent matching)
        const guardianAccountHashes: string[] = guardiansData.map((g: any) => {
            let hash: string;
            if (typeof g === 'string') hash = g;
            else if (Array.isArray(g)) hash = Buffer.from(g).toString('hex');
            else if (g?.data) hash = Buffer.from(g.data).toString('hex');
            else hash = Buffer.from(g).toString('hex');
            return hash.toLowerCase(); // Normalize to lowercase
        });

        console.log('Found guardian account hashes:', guardianAccountHashes);
        guardianAccountHashes.forEach((h, i) => console.log(`  Guardian ${i + 1}: ${h}`));

        // Calculate initiator's account hash to exclude them from notifications
        let initiatorAccountHash: string | undefined;
        if (initiatorPublicKey) {
            try {
                const initiatorPubKey = CLPublicKey.fromHex(initiatorPublicKey);
                initiatorAccountHash = Buffer.from(initiatorPubKey.toAccountHash()).toString('hex');
            } catch (e) {
                console.warn('Could not convert initiator public key to account hash:', e);
            }
        }

        // Send notification emails
        const result = await notifyGuardiansOfRecovery({
            targetAccountHex: targetAccount,
            newPublicKeyHex: newPublicKey,
            guardianAccountHashes,
            initiatorAccountHash,
            recoveryId: recoveryId?.toString(),
        });

        res.json({
            success: true,
            data: {
                emailsSent: result.sent,
                emailsFailed: result.failed,
                emailsSkipped: result.skipped,
                message: result.sent > 0
                    ? `Notifications sent to ${result.sent} guardian(s)`
                    : 'No guardians have registered email addresses',
            },
        } as ApiResponse);
    } catch (error) {
        console.error('Error notifying guardians:', error);
        res.status(500).json({
            success: false,
            error: `Failed to notify guardians: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /recovery/notify-simple
 * Simple endpoint to notify guardians with just target account
 * Fetches guardians from contract and sends emails
 */
router.post('/notify-simple', async (req, res) => {
    try {
        const { targetAccount } = req.body;

        if (!targetAccount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: targetAccount',
            } as ApiResponse);
        }

        const contractHash = process.env.RECOVERY_REGISTRY_HASH;
        if (!contractHash) {
            return res.status(500).json({
                success: false,
                error: 'Recovery contract hash not configured',
            } as ApiResponse);
        }

        // 1. Get guardians for this account from contract
        // Format: g{AccountHash}
        const { CLPublicKey } = await import('casper-js-sdk');
        const targetAccountHash = CLPublicKey.fromHex(targetAccount).toAccountHash();
        const targetAccountHashHex = Buffer.from(targetAccountHash).toString('hex');
        const debugFormat = `AccountHash(${targetAccountHashHex})`;

        console.log('Querying guardians from contract for:', debugFormat);

        // Same robust logic as notify-guardians
        const guardiansResult = await casperService.queryContractDictionary(
            contractHash, 'd', `g${debugFormat}`
        );

        // Handle multiple possible response structures for guardians data
        let guardiansData: any[] | undefined;

        if (guardiansResult?.CLValue && Array.isArray(guardiansResult.CLValue)) {
            guardiansData = guardiansResult.CLValue;
        } else if (guardiansResult?.CLValue?.data && Array.isArray(guardiansResult.CLValue.data)) {
            guardiansData = guardiansResult.CLValue.data;
        } else if (guardiansResult?.stored_value?.CLValue?.data && Array.isArray(guardiansResult.stored_value.CLValue.data)) {
            guardiansData = guardiansResult.stored_value.CLValue.data;
        } else if (Array.isArray(guardiansResult)) {
            guardiansData = guardiansResult;
        }

        if (!guardiansData || !Array.isArray(guardiansData)) {
            return res.json({
                success: true,
                data: {
                    emailsSent: 0,
                    message: 'No guardians found for this account',
                },
            } as ApiResponse);
        }

        // Convert guardian data to account hashes
        const guardianAccountHashes: string[] = guardiansData.map((g: any) => {
            let hash: string;
            if (typeof g === 'string') hash = g;
            else if (Array.isArray(g)) hash = Buffer.from(g).toString('hex');
            else if (g?.data) hash = Buffer.from(g.data).toString('hex');
            else hash = Buffer.from(g).toString('hex');
            return hash.toLowerCase();
        });

        console.log('Found guardian account hashes:', guardianAccountHashes);

        // Send notification emails (initiator excluded if provided, but optional here)
        const result = await notifyGuardiansOfRecovery({
            targetAccountHex: targetAccount,
            guardianAccountHashes,
        });

        res.json({
            success: true,
            data: {
                emailsSent: result.sent,
                emailsFailed: result.failed,
                emailsSkipped: result.skipped,
                guardianCount: guardianAccountHashes.length,
            },
        } as ApiResponse);
    } catch (error) {
        console.error('Error in notify-simple:', error);
        res.status(500).json({
            success: false,
            error: `Failed to notify guardians: ${error}`,
        } as ApiResponse);
    }
});

export default router;
