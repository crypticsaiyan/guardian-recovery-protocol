import { Router, Request, Response } from 'express';
import { sessionService } from '../services';
import { ApiResponse } from '../types';

const router = Router();

/**
 * POST /session/add-key
 * Build add_associated_key deploy (Step 4)
 */
router.post('/add-key', async (req: Request, res: Response) => {
    try {
        const { signerPublicKey, newKey, weight } = req.body;

        if (!signerPublicKey || !newKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: signerPublicKey, newKey',
            } as ApiResponse);
        }

        const deployJson = sessionService.buildAddKeyDeploy(
            signerPublicKey,
            newKey,
            weight || 1
        );

        res.json({
            success: true,
            data: {
                deployJson,
                message: 'Deploy built. Collect guardian signatures and submit.',
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build add key deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /session/remove-key
 * Build remove_associated_key deploy (Step 5)
 */
router.post('/remove-key', async (req: Request, res: Response) => {
    try {
        const { signerPublicKey, keyToRemove } = req.body;

        if (!signerPublicKey || !keyToRemove) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: signerPublicKey, keyToRemove',
            } as ApiResponse);
        }

        const deployJson = sessionService.buildRemoveKeyDeploy(
            signerPublicKey,
            keyToRemove
        );

        res.json({
            success: true,
            data: {
                deployJson,
                message: 'Deploy built. Collect guardian signatures and submit.',
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build remove key deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /session/update-thresholds
 * Build update_thresholds deploy (Step 6)
 */
router.post('/update-thresholds', async (req: Request, res: Response) => {
    try {
        const { signerPublicKey, deploymentThreshold, keyManagementThreshold } = req.body;

        if (!signerPublicKey || deploymentThreshold === undefined || keyManagementThreshold === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: signerPublicKey, deploymentThreshold, keyManagementThreshold',
            } as ApiResponse);
        }

        const deployJson = sessionService.buildUpdateThresholdsDeploy(
            signerPublicKey,
            deploymentThreshold,
            keyManagementThreshold
        );

        res.json({
            success: true,
            data: {
                deployJson,
                message: 'Deploy built. Sign and submit.',
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to build update thresholds deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /session/submit
 * Submit a signed deploy to the network
 */
router.post('/submit', async (req: Request, res: Response) => {
    try {
        const { deployJson } = req.body;

        if (!deployJson) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field: deployJson',
            } as ApiResponse);
        }

        console.log('=== Submit Deploy Request ===');
        console.log('Deploy JSON type:', typeof deployJson);
        console.log('Deploy JSON length:', deployJson.length);

        const result = await sessionService.submitSignedDeploy(deployJson);
        console.log('Submit result:', result);

        res.json({
            success: result.success,
            data: {
                deployHash: result.deployHash,
                message: result.message,
            },
            error: result.success ? undefined : result.message,
        } as ApiResponse);
    } catch (error) {
        console.error('Submit deploy error:', error);
        res.status(500).json({
            success: false,
            error: `Failed to submit deploy: ${error}`,
        } as ApiResponse);
    }
});

/**
 * POST /session/check-signatures
 * Check if deploy has enough signatures
 */
router.post('/check-signatures', async (req: Request, res: Response) => {
    try {
        const { deployJson, targetAccount } = req.body;

        if (!deployJson || !targetAccount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: deployJson, targetAccount',
            } as ApiResponse);
        }

        const signatureCount = sessionService.getSignatureCount(deployJson);
        const hasEnough = await sessionService.hasEnoughSignatures(deployJson, targetAccount);

        res.json({
            success: true,
            data: {
                signatureCount,
                hasEnoughSignatures: hasEnough,
            },
        } as ApiResponse);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: `Failed to check signatures: ${error}`,
        } as ApiResponse);
    }
});

export default router;
