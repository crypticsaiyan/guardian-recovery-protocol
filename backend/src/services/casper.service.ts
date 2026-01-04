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
        
        // Handle different response structures from Casper SDK
        const account = accountInfo?.Account || accountInfo?.stored_value?.Account || accountInfo;
        
        if (!account) {
            console.error('Account info structure:', JSON.stringify(accountInfo, null, 2));
            throw new Error('Could not parse account info');
        }

        // associatedKeys can be either snake_case or camelCase
        const associatedKeys = account.associatedKeys || account.associated_keys || [];
        const actionThresholds = account.actionThresholds || account.action_thresholds || {};

        return {
            associatedKeys: associatedKeys.map((key: any) => ({
                accountHash: key.accountHash || key.account_hash,
                weight: key.weight,
            })),
            actionThresholds: {
                deployment: actionThresholds.deployment || 1,
                keyManagement: actionThresholds.keyManagement || actionThresholds.key_management || 1,
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
     * Query an account's named key value
     */
    async queryAccountNamedKey(publicKeyHex: string, keyName: string): Promise<any> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            const accountHash = publicKey.toAccountHashStr();
            const stateRootHash = await this.client.nodeClient.getStateRootHash();

            // Query the account state with the named key path
            const result = await this.client.nodeClient.getBlockState(
                stateRootHash,
                accountHash,
                [keyName]
            );
            return result;
        } catch (error) {
            console.error(`Error querying account named key ${keyName}: ${error}`);
            return null;
        }
    }

    /**
     * Check if account has guardians registered (reads from named keys)
     */
    async hasGuardians(publicKeyHex: string): Promise<boolean> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            // AccountHash Display format is "account-hash-{hex}"
            const accountHashStr = publicKey.toAccountHashStr();

            // The contract stores: grp_init_{account_hash_display}
            const keyName = `grp_init_${accountHashStr}`;
            const result = await this.queryAccountNamedKey(publicKeyHex, keyName);

            if (result && result.CLValue) {
                return result.CLValue.data === true;
            }
            return false;
        } catch (error) {
            console.error(`Error checking has guardians: ${error}`);
            return false;
        }
    }

    /**
     * Get guardians for an account (reads from named keys)
     */
    async getGuardians(publicKeyHex: string): Promise<string[]> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            // AccountHash Display format is "account-hash-{hex}"
            const accountHashStr = publicKey.toAccountHashStr();

            // The contract stores: grp_guardians_{account_hash_display}
            const keyName = `grp_guardians_${accountHashStr}`;
            const result = await this.queryAccountNamedKey(publicKeyHex, keyName);

            if (result && result.CLValue && Array.isArray(result.CLValue.data)) {
                // Convert account hashes back to hex strings
                return result.CLValue.data.map((hash: any) => {
                    if (typeof hash === 'string') return hash;
                    if (hash.data) return `account-hash-${Buffer.from(hash.data).toString('hex')}`;
                    return String(hash);
                });
            }
            return [];
        } catch (error) {
            console.error(`Error getting guardians: ${error}`);
            return [];
        }
    }

    /**
     * Get threshold for an account (reads from named keys)
     */
    async getThreshold(publicKeyHex: string): Promise<number> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            // AccountHash Display format is "account-hash-{hex}"
            const accountHashStr = publicKey.toAccountHashStr();

            // The contract stores: grp_threshold_{account_hash_display}
            const keyName = `grp_threshold_${accountHashStr}`;
            const result = await this.queryAccountNamedKey(publicKeyHex, keyName);

            if (result && result.CLValue) {
                return Number(result.CLValue.data) || 0;
            }
            return 0;
        } catch (error) {
            console.error(`Error getting threshold: ${error}`);
            return 0;
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

    /**
     * Get active recovery ID for an account
     */
    async getActiveRecovery(publicKeyHex: string): Promise<string | null> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            // AccountHash Display format is "account-hash-{hex}"
            const accountHashStr = publicKey.toAccountHashStr();

            const keyName = `grp_active_${accountHashStr}`;
            const result = await this.queryAccountNamedKey(publicKeyHex, keyName);

            if (result && result.CLValue) {
                return String(result.CLValue.data);
            }
            return null;
        } catch (error) {
            console.error(`Error getting active recovery: ${error}`);
            return null;
        }
    }

    /**
     * Get recovery details by ID
     */
    async getRecoveryDetails(signerPublicKeyHex: string, recoveryId: string): Promise<{
        account: string;
        newKey: string;
        approvalCount: number;
        isApproved: boolean;
    } | null> {
        try {
            // Recovery data is stored in the signer's account named keys
            const accountKey = `grp_rec_${recoveryId}_account`;
            const newKeyKey = `grp_rec_${recoveryId}_new_key`;
            const approvalCountKey = `grp_rec_${recoveryId}_approval_count`;
            const approvedKey = `grp_rec_${recoveryId}_approved`;

            const [accountResult, newKeyResult, countResult, approvedResult] = await Promise.all([
                this.queryAccountNamedKey(signerPublicKeyHex, accountKey),
                this.queryAccountNamedKey(signerPublicKeyHex, newKeyKey),
                this.queryAccountNamedKey(signerPublicKeyHex, approvalCountKey),
                this.queryAccountNamedKey(signerPublicKeyHex, approvedKey),
            ]);

            if (!accountResult?.CLValue) {
                return null;
            }

            return {
                account: accountResult.CLValue.data ? 
                    `account-hash-${Buffer.from(accountResult.CLValue.data).toString('hex')}` : '',
                newKey: newKeyResult?.CLValue?.data || '',
                approvalCount: Number(countResult?.CLValue?.data) || 0,
                isApproved: approvedResult?.CLValue?.data === true,
            };
        } catch (error) {
            console.error(`Error getting recovery details: ${error}`);
            return null;
        }
    }
}

// Export singleton instance
export const casperService = new CasperService();
