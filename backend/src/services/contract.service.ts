import {
    CLPublicKey,
    CLValueBuilder,
    RuntimeArgs,
    CLAccountHash,
    DeployUtil,
} from 'casper-js-sdk';
import { config } from '../config';
import { deployService } from './deploy.service';
import { DeployResult } from '../types';

/**
 * RecoveryAction - Maps to the action parameter in the session WASM
 */
export enum RecoveryAction {
    INITIALIZE_GUARDIANS = 1,
    INITIATE_RECOVERY = 2,
    APPROVE_RECOVERY = 3,
    IS_THRESHOLD_MET = 4,
    FINALIZE_RECOVERY = 5,
    GET_GUARDIANS = 6,
    GET_THRESHOLD = 7,
    HAS_GUARDIANS = 8,
}

/**
 * ContractService - Builds session WASM deploys for recovery operations
 * 
 * New Approach: Uses session WASM with action parameter
 * Each call executes the recovery_registry.wasm with:
 *   - action: u8 (which function to run)
 *   - other arguments specific to the action
 */
export class ContractService {
    private wasmPath: string;

    constructor() {
        this.wasmPath = config.wasm.recoveryRegistry;
    }

    /**
     * Helper: Build a recovery action deploy
     */
    private buildRecoveryDeploy(
        callerPublicKey: CLPublicKey,
        action: RecoveryAction,
        args: RuntimeArgs,
        paymentAmount: string = config.deploy.paymentAmount
    ): DeployUtil.Deploy {
        // Add action to args
        const fullArgs = RuntimeArgs.fromMap({
            action: CLValueBuilder.u8(action),
            ...Object.fromEntries(
                Array.from(args.args.entries()).map(([k, v]) => [k, v])
            ),
        });

        return deployService.buildSessionWasmDeploy(
            callerPublicKey,
            this.wasmPath,
            fullArgs,
            paymentAmount
        );
    }

    // ============================================================================
    // ACTION 1: Initialize Guardians
    // ============================================================================

    /**
     * Register account with guardians and threshold
     * Called by: User (before disaster)
     * 
     * @param userPublicKeyHex - User's public key (hex)
     * @param guardians - Array of guardian public key hexes
     * @param threshold - Number of guardians required for recovery
     */
    async initializeGuardians(
        userPublicKeyHex: string,
        guardians: string[],
        threshold: number
    ): Promise<DeployResult> {
        const userPublicKey = CLPublicKey.fromHex(userPublicKeyHex);
        const userAccountHash = userPublicKey.toAccountHash();

        // Build guardian account hashes
        const guardianAccountHashes = guardians.map((g) => {
            const pk = CLPublicKey.fromHex(g);
            return new CLAccountHash(pk.toAccountHash());
        });

        const args = RuntimeArgs.fromMap({
            account: CLValueBuilder.byteArray(userAccountHash),
            guardians: CLValueBuilder.list(guardianAccountHashes),
            threshold: CLValueBuilder.u8(threshold),
        });

        const deploy = this.buildRecoveryDeploy(
            userPublicKey,
            RecoveryAction.INITIALIZE_GUARDIANS,
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // ACTION 2: Initiate Recovery
    // ============================================================================

    /**
     * Initiate recovery request
     * Called by: Anyone (guardian or helper)
     * 
     * @param initiatorPublicKeyHex - Who is initiating (pays gas)
     * @param targetAccountHex - Account to recover
     * @param newPublicKeyHex - New public key to add
     */
    async initiateRecovery(
        initiatorPublicKeyHex: string,
        targetAccountHex: string,
        newPublicKeyHex: string
    ): Promise<DeployResult> {
        const initiatorKey = CLPublicKey.fromHex(initiatorPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);
        const newPublicKey = CLPublicKey.fromHex(newPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            account: CLValueBuilder.byteArray(targetAccount.toAccountHash()),
            new_public_key: newPublicKey,
        });

        const deploy = this.buildRecoveryDeploy(
            initiatorKey,
            RecoveryAction.INITIATE_RECOVERY,
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // ACTION 3: Approve Recovery
    // ============================================================================

    /**
     * Approve recovery request
     * Called by: Guardian (must be in guardian list)
     * 
     * @param guardianPublicKeyHex - Guardian's public key
     * @param recoveryId - Recovery ID (U256 as string)
     */
    async approveRecovery(
        guardianPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const guardianKey = CLPublicKey.fromHex(guardianPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            recovery_id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildRecoveryDeploy(
            guardianKey,
            RecoveryAction.APPROVE_RECOVERY,
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // ACTION 4: Check Threshold Met
    // ============================================================================

    /**
     * Check if threshold is met for recovery
     * Note: This executes on-chain. For off-chain queries, use state queries.
     * 
     * @param signerPublicKeyHex - Who is calling (pays gas)
     * @param recoveryId - Recovery ID
     */
    async buildCheckThresholdDeploy(
        signerPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            recovery_id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildRecoveryDeploy(
            signerKey,
            RecoveryAction.IS_THRESHOLD_MET,
            args,
            config.deploy.paymentAmount // Lower gas for query
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // ACTION 5: Finalize Recovery
    // ============================================================================

    /**
     * Finalize recovery (mark complete after key rotation is done)
     * 
     * @param signerPublicKeyHex - Who is calling
     * @param recoveryId - Recovery ID
     */
    async finalizeRecovery(
        signerPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            recovery_id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildRecoveryDeploy(
            signerKey,
            RecoveryAction.FINALIZE_RECOVERY,
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // ACTION 8: Has Guardians (Query via session)
    // ============================================================================

    /**
     * Build deploy to check if account has guardians
     * 
     * @param signerPublicKeyHex - Who is calling
     * @param targetAccountHex - Account to check
     */
    async buildHasGuardiansDeploy(
        signerPublicKeyHex: string,
        targetAccountHex: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);

        const args = RuntimeArgs.fromMap({
            account: CLValueBuilder.byteArray(targetAccount.toAccountHash()),
        });

        const deploy = this.buildRecoveryDeploy(
            signerKey,
            RecoveryAction.HAS_GUARDIANS,
            args,
            config.deploy.paymentAmount
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    /**
     * Build deploy to get guardians for an account (Action 6)
     * 
     * @param signerPublicKeyHex - Who is calling
     * @param targetAccountHex - Account to get guardians for
     */
    async buildGetGuardiansDeploy(
        signerPublicKeyHex: string,
        targetAccountHex: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);

        const args = RuntimeArgs.fromMap({
            account: CLValueBuilder.byteArray(targetAccount.toAccountHash()),
        });

        const deploy = this.buildRecoveryDeploy(
            signerKey,
            RecoveryAction.GET_GUARDIANS,
            args,
            config.deploy.paymentAmount
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }
}

// Export singleton instance
export const contractService = new ContractService();
