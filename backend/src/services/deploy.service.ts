import fs from 'fs';
import path from 'path';
import {
    CLPublicKey,
    DeployUtil,
    RuntimeArgs,
    CLValueBuilder,
    CLKey,
    CLAccountHash,
    Keys,
} from 'casper-js-sdk';
import { config } from '../config';
import { casperService } from './casper.service';

/**
 * DeployService - Handles building and managing deploys
 */
export class DeployService {
    /**
     * Load WASM file as bytes
     */
    loadWasm(wasmPath: string): Uint8Array {
        const absolutePath = path.resolve(wasmPath);
        const wasmBuffer = fs.readFileSync(absolutePath);
        return new Uint8Array(wasmBuffer);
    }

    /**
     * Create deploy parameters
     */
    createDeployParams(publicKey: CLPublicKey): DeployUtil.DeployParams {
        return new DeployUtil.DeployParams(
            publicKey,
            config.casper.chainName,
            1, // gasPrice
            config.deploy.ttl
        );
    }

    /**
     * Build a contract call deploy
     */
    buildContractCallDeploy(
        callerPublicKey: CLPublicKey,
        contractHash: string,
        entryPoint: string,
        args: RuntimeArgs,
        paymentAmount: string = config.deploy.paymentAmount
    ): DeployUtil.Deploy {
        const deployParams = this.createDeployParams(callerPublicKey);

        const session = DeployUtil.ExecutableDeployItem.newStoredContractByHash(
            Uint8Array.from(Buffer.from(contractHash, 'hex')),
            entryPoint,
            args
        );

        const payment = DeployUtil.standardPayment(paymentAmount);

        return DeployUtil.makeDeploy(deployParams, session, payment);
    }

    /**
     * Build a session WASM deploy
     */
    buildSessionWasmDeploy(
        callerPublicKey: CLPublicKey,
        wasmPath: string,
        args: RuntimeArgs,
        paymentAmount: string = config.deploy.sessionPaymentAmount
    ): DeployUtil.Deploy {
        const deployParams = this.createDeployParams(callerPublicKey);
        const wasmBytes = this.loadWasm(wasmPath);

        const session = DeployUtil.ExecutableDeployItem.newModuleBytes(
            wasmBytes,
            args
        );

        const payment = DeployUtil.standardPayment(paymentAmount);

        return DeployUtil.makeDeploy(deployParams, session, payment);
    }

    /**
     * Build add_associated_key session deploy
     */
    buildAddKeyDeploy(
        callerPublicKey: CLPublicKey,
        newKeyHex: string,
        weight: number
    ): DeployUtil.Deploy {
        const newKey = CLPublicKey.fromHex(newKeyHex);
        const newKeyAccountHash = new CLAccountHash(newKey.toAccountHash());

        const args = RuntimeArgs.fromMap({
            new_key: CLValueBuilder.key(newKeyAccountHash),
            weight: CLValueBuilder.u8(weight),
        });

        return this.buildSessionWasmDeploy(
            callerPublicKey,
            config.wasm.addKey,
            args
        );
    }

    /**
     * Build remove_associated_key session deploy
     */
    buildRemoveKeyDeploy(
        callerPublicKey: CLPublicKey,
        keyToRemoveHex: string
    ): DeployUtil.Deploy {
        const keyToRemove = CLPublicKey.fromHex(keyToRemoveHex);
        const keyAccountHash = new CLAccountHash(keyToRemove.toAccountHash());

        const args = RuntimeArgs.fromMap({
            remove_key: CLValueBuilder.key(keyAccountHash),
        });

        return this.buildSessionWasmDeploy(
            callerPublicKey,
            config.wasm.removeKey,
            args
        );
    }

    /**
     * Build update_thresholds session deploy
     */
    buildUpdateThresholdsDeploy(
        callerPublicKey: CLPublicKey,
        deploymentThreshold: number,
        keyManagementThreshold: number
    ): DeployUtil.Deploy {
        const args = RuntimeArgs.fromMap({
            deployment_threshold: CLValueBuilder.u8(deploymentThreshold),
            key_management_threshold: CLValueBuilder.u8(keyManagementThreshold),
        });

        return this.buildSessionWasmDeploy(
            callerPublicKey,
            config.wasm.updateThresholds,
            args
        );
    }

    /**
     * Sign a deploy with a key
     */
    signDeploy(deploy: DeployUtil.Deploy, keys: Keys.AsymmetricKey): DeployUtil.Deploy {
        return DeployUtil.signDeploy(deploy, keys);
    }

    /**
     * Add signature to existing deploy (for multi-sig)
     */
    addSignature(deploy: DeployUtil.Deploy, keys: Keys.AsymmetricKey): DeployUtil.Deploy {
        return DeployUtil.signDeploy(deploy, keys);
    }

    /**
     * Convert deploy to JSON for transport
     */
    deployToJson(deploy: DeployUtil.Deploy): any {
        return DeployUtil.deployToJson(deploy);
    }

    /**
     * Convert JSON back to deploy
     */
    jsonToDeploy(json: string): DeployUtil.Deploy {
        const parsed = JSON.parse(json);
        console.log('Parsing deploy JSON, keys:', Object.keys(parsed));

        const result = DeployUtil.deployFromJson(parsed);
        if (result.err) {
            console.error('Deploy parsing error:', result.val);
            throw new Error(`Failed to parse deploy: ${result.val}`);
        }
        return result.unwrap();
    }

    /**
     * Submit deploy without waiting
     */
    async submit(deploy: DeployUtil.Deploy): Promise<{
        deployHash: string;
        success: boolean;
        message: string;
    }> {
        const deployHash = await casperService.submitDeploy(deploy);
        return {
            deployHash,
            success: true,
            message: 'Deploy submitted successfully',
        };
    }

    /**
     * Submit deploy and wait for result
     */
    async submitAndWait(deploy: DeployUtil.Deploy): Promise<{
        deployHash: string;
        success: boolean;
        message: string;
    }> {
        const deployHash = await casperService.submitDeploy(deploy);
        const result = await casperService.waitForDeploy(deployHash);

        return {
            deployHash,
            ...result,
        };
    }
}

// Export singleton instance
export const deployService = new DeployService();
