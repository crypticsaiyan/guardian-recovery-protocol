import { Router, Request, Response } from 'express';
import { contractService } from '../services';
import { ApiResponse } from '../types';

const router = Router();

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
    try {
        const { initiatorPublicKey, targetAccount, newPublicKey } = req.body;

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

export default router;
