import {
    CasperClient,
    CLPublicKey,
    DeployUtil,
} from 'casper-js-sdk';
import { config } from '../config';

/**
 * CasperService - Handles connection to Casper node and basic operations
 */
export class CasperService {
    private client: CasperClient;

    constructor() {
        this.client = new CasperClient(config.casper.nodeUrl);
    }

    /**
     * Get the Casper client instance
     */
    getClient(): CasperClient {
        return this.client;
    }

    /**
     * Get account info from the network
     */
    async getAccountInfo(publicKeyHex: string): Promise<any> {
        const publicKey = CLPublicKey.fromHex(publicKeyHex);
        const accountHash = publicKey.toAccountHashStr();

        const stateRootHash = await this.client.nodeClient.getStateRootHash();
        const accountInfo = await this.client.nodeClient.getBlockState(
            stateRootHash,
            accountHash,
            []
        );

        return accountInfo;
    }

    /**
     * Get account's associated keys and thresholds
     */
    async getAccountKeys(publicKeyHex: string): Promise<{
        associatedKeys: Array<{ accountHash: string; weight: number }>;
        actionThresholds: { deployment: number; keyManagement: number };
    }> {
        const accountInfo = await this.getAccountInfo(publicKeyHex);
        const account = accountInfo.Account;

        return {
            associatedKeys: account.associated_keys.map((key: any) => ({
                accountHash: key.account_hash,
                weight: key.weight,
            })),
            actionThresholds: {
                deployment: account.action_thresholds.deployment,
                keyManagement: account.action_thresholds.key_management,
            },
        };
    }

    /**
     * Query contract state
     */
    async queryContract(contractHash: string, key: string): Promise<any> {
        const stateRootHash = await this.client.nodeClient.getStateRootHash();

        try {
            const result = await this.client.nodeClient.getBlockState(
                stateRootHash,
                `hash-${contractHash}`,
                [key]
            );
            return result;
        } catch (error) {
            console.error(`Error querying contract: ${error}`);
            return null;
        }
    }

    /**
     * Submit deploy to the network
     */
    async submitDeploy(signedDeploy: DeployUtil.Deploy): Promise<string> {
        const deployHash = await this.client.putDeploy(signedDeploy);
        return deployHash;
    }

    /**
     * Wait for deploy execution using polling
     */
    async waitForDeploy(
        deployHash: string,
        timeout: number = 60000
    ): Promise<{ success: boolean; message: string }> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const [, deployResult] = await this.client.getDeploy(deployHash);

                if (deployResult.execution_results && deployResult.execution_results.length > 0) {
                    const executionResult = deployResult.execution_results[0];
                    if (executionResult.result.Success) {
                        return { success: true, message: 'Deploy executed successfully' };
                    } else {
                        return {
                            success: false,
                            message: executionResult.result.Failure?.error_message || 'Unknown error',
                        };
                    }
                }
            } catch {
                // Deploy not yet processed, continue waiting
            }

            // Wait 2 seconds before polling again
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        return { success: false, message: 'Timeout waiting for deploy' };
    }

    /**
     * Get deploy status
     */
    async getDeployStatus(deployHash: string): Promise<{
        deployHash: string;
        status: 'pending' | 'success' | 'failed';
        executionResult?: any;
    } | null> {
        try {
            const [deploy, deployResult] = await this.client.getDeploy(deployHash);

            let status: 'pending' | 'success' | 'failed' = 'pending';
            let executionResult = null;

            if (deployResult.execution_results && deployResult.execution_results.length > 0) {
                const result = deployResult.execution_results[0];
                executionResult = result;
                if (result.result.Success) {
                    status = 'success';
                } else {
                    status = 'failed';
                }
            }

            return {
                deployHash,
                status,
                executionResult
            };
        } catch (error) {
            console.error(`Error getting deploy status: ${error}`);
            return null;
        }
    }
}

// Export singleton instance
export const casperService = new CasperService();
