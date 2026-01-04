import {
    CLPublicKey,
    CLValueBuilder,
    RuntimeArgs,
    CLAccountHash,
    DeployUtil,
    Contracts,
    CasperClient,
} from 'casper-js-sdk';
import { config } from '../config';
import { deployService } from './deploy.service';
import { DeployResult } from '../types';

/**
 * ContractService - Builds deploys for the recovery_registry stored contract
 * 
 * The contract must be deployed first, then its hash is used for all calls.
 * Set CONTRACT_HASH in .env after deploying.
 */
export class ContractService {
    private contractClient: Contracts.Contract;
    private contractHash: string | null;
    private wasmPath: string;

    constructor() {
        this.wasmPath = config.wasm.recoveryRegistry;
        this.contractHash = process.env.RECOVERY_CONTRACT_HASH || null;
        
        const casperClient = new CasperClient(config.casper.nodeUrl);
        this.contractClient = new Contracts.Contract(casperClient);
        
        if (this.contractHash) {
            this.contractClient.setContractHash(`hash-${this.contractHash}`);
            console.log(`Contract service initialized with hash: ${this.contractHash}`);
        } else {
            console.log('Contract hash not set. Deploy the contract first.');
        }
    }

    /**
     * Check if contract is deployed
     */
    isContractDeployed(): boolean {
        return this.contractHash !== null;
    }

    /**
     * Set contract hash after deployment
     */
    setContractHash(hash: string) {
        this.contractHash = hash;
        this.contractClient.setContractHash(`hash-${hash}`);
        console.log(`Contract hash set to: ${hash}`);
    }

    /**
     * Build deploy to install the contract (one-time)
     */
    async buildInstallDeploy(installerPublicKeyHex: string): Promise<DeployResult> {
        const installerKey = CLPublicKey.fromHex(installerPublicKeyHex);
        
        const deploy = deployService.buildSessionWasmDeploy(
            installerKey,
            this.wasmPath,
            RuntimeArgs.fromMap({}),
            '400000000000' // 400 CSPR for contract installation
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    /**
     * Build deploy to install the minimal test contract
     */
    async buildTestContractDeploy(installerPublicKeyHex: string): Promise<DeployResult> {
        const installerKey = CLPublicKey.fromHex(installerPublicKeyHex);
        
        const deploy = deployService.buildSessionWasmDeploy(
            installerKey,
            config.wasm.testContract,
            RuntimeArgs.fromMap({}),
            '100000000000' // 100 CSPR for minimal test contract
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    /**
     * Build contract call deploy helper
     */
    private buildContractCallDeploy(
        callerPublicKey: CLPublicKey,
        entryPoint: string,
        args: RuntimeArgs,
        paymentAmount: string = config.deploy.paymentAmount
    ): DeployUtil.Deploy {
        if (!this.contractHash) {
            throw new Error('Contract not deployed. Set RECOVERY_CONTRACT_HASH in .env');
        }

        return deployService.buildContractCallDeploy(
            callerPublicKey,
            this.contractHash,
            entryPoint,
            args,
            paymentAmount
        );
    }

    // ============================================================================
    // Initialize Guardians
    // ============================================================================
    async initializeGuardians(
        userPublicKeyHex: string,
        guardians: string[],
        threshold: number
    ): Promise<DeployResult> {
        const userPublicKey = CLPublicKey.fromHex(userPublicKeyHex);
        const userAccountHash = new CLAccountHash(userPublicKey.toAccountHash());

        const guardianAccountHashes = guardians.map((g) => {
            const pk = CLPublicKey.fromHex(g);
            return new CLAccountHash(pk.toAccountHash());
        });

        const args = RuntimeArgs.fromMap({
            account: userAccountHash,
            guardians: CLValueBuilder.list(guardianAccountHashes),
            threshold: CLValueBuilder.u8(threshold),
        });

        const deploy = this.buildContractCallDeploy(
            userPublicKey,
            'initialize_guardians',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Initiate Recovery
    // ============================================================================
    async initiateRecovery(
        initiatorPublicKeyHex: string,
        targetAccountHex: string,
        newPublicKeyHex: string
    ): Promise<DeployResult> {
        const initiatorKey = CLPublicKey.fromHex(initiatorPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);
        const newPublicKey = CLPublicKey.fromHex(newPublicKeyHex);

        const targetAccountHash = new CLAccountHash(targetAccount.toAccountHash());

        console.log('Initiate Recovery Debug:');
        console.log('  Target Public Key:', targetAccountHex);
        console.log('  Target Account Hash:', Buffer.from(targetAccount.toAccountHash()).toString('hex'));
        console.log('  Contract Hash:', this.contractHash);

        const args = RuntimeArgs.fromMap({
            account: targetAccountHash,
            new_public_key: newPublicKey,
        });

        const deploy = this.buildContractCallDeploy(
            initiatorKey,
            'initiate_recovery',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Approve Recovery
    // ============================================================================
    async approveRecovery(
        guardianPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const guardianKey = CLPublicKey.fromHex(guardianPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            recovery_id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildContractCallDeploy(
            guardianKey,
            'approve_recovery',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Check Threshold Met
    // ============================================================================
    async buildCheckThresholdDeploy(
        signerPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            recovery_id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildContractCallDeploy(
            signerKey,
            'is_threshold_met',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Finalize Recovery
    // ============================================================================
    async finalizeRecovery(
        signerPublicKeyHex: string,
        recoveryId: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);

        const args = RuntimeArgs.fromMap({
            recovery_id: CLValueBuilder.u256(recoveryId),
        });

        const deploy = this.buildContractCallDeploy(
            signerKey,
            'finalize_recovery',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Has Guardians
    // ============================================================================
    async buildHasGuardiansDeploy(
        signerPublicKeyHex: string,
        targetAccountHex: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);
        const targetAccountHash = new CLAccountHash(targetAccount.toAccountHash());

        const args = RuntimeArgs.fromMap({
            account: targetAccountHash,
        });

        const deploy = this.buildContractCallDeploy(
            signerKey,
            'has_guardians',
            args
        );

        return {
            deployHash: '',
            success: true,
            message: deployService.deployToJson(deploy),
        };
    }

    // ============================================================================
    // Get Guardians
    // ============================================================================
    async buildGetGuardiansDeploy(
        signerPublicKeyHex: string,
        targetAccountHex: string
    ): Promise<DeployResult> {
        const signerKey = CLPublicKey.fromHex(signerPublicKeyHex);
        const targetAccount = CLPublicKey.fromHex(targetAccountHex);
        const targetAccountHash = new CLAccountHash(targetAccount.toAccountHash());

        const args = RuntimeArgs.fromMap({
            account: targetAccountHash,
        });

        const deploy = this.buildContractCallDeploy(
            signerKey,
            'get_guardians',
            args
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
