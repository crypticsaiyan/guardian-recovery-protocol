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
     * Get the chain name from the node
     */
    async getChainName(): Promise<string> {
        try {
            const status = await this.client.nodeClient.getStatus();
            return status.chainspec_name;
        } catch (error) {
            console.error('Error getting chain name:', error);
            return config.casper.chainName; // Fallback
        }
    }

    /**
     * Check if account exists and has balance
     */
    async checkAccountBalance(publicKeyHex: string): Promise<{ exists: boolean; balance: string }> {
        try {
            // Get account info to find the main purse
            const accountInfo = await this.getAccountInfo(publicKeyHex);

            if (!accountInfo || !accountInfo.Account) {
                return { exists: false, balance: '0' };
            }

            const mainPurse = accountInfo.Account.main_purse;
            const stateRootHash = await this.client.nodeClient.getStateRootHash();

            const balance = await this.client.nodeClient.getAccountBalance(
                stateRootHash,
                mainPurse
            );

            return { exists: true, balance: balance.toString() };
        } catch (error: any) {
            console.error('Error checking account balance:', error);
            // If error contains "ValueNotFound", account doesn't exist
            if (error.toString().includes('ValueNotFound') || error.code === -32003) {
                return { exists: false, balance: '0' };
            }
            // For other errors, assume it might exist but failed to read
            return { exists: true, balance: '0' };
        }
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
     * Query contract dictionary
     * The contract uses dictionary 'd' to store all data
     */
    async queryContractDictionary(contractHash: string, dictionaryName: string, dictionaryKey: string): Promise<any> {
        try {
            const stateRootHash = await this.client.nodeClient.getStateRootHash();

            console.log('\n=== Querying Contract Dictionary ===');
            console.log('Contract Hash:', contractHash);
            console.log('Dictionary Name:', dictionaryName);
            console.log('Dictionary Key:', dictionaryKey);

            const result = await this.client.nodeClient.getDictionaryItemByName(
                stateRootHash,
                `hash-${contractHash}`,
                dictionaryName,
                dictionaryKey
            );

            console.log('Dictionary Result:', JSON.stringify(result, null, 2));
            return result;
        } catch (error) {
            console.error('Error querying contract dictionary:', error);
            return null;
        }
    }

    /**
     * Get guardians registered in the contract for an account
     * Uses the contract's dictionary to look up guardian data
     */
    async getGuardiansFromContract(contractHash: string, publicKeyHex: string): Promise<{
        isInitialized: boolean;
        guardians: string[];
        threshold: number;
    }> {
        try {
            const publicKey = CLPublicKey.fromHex(publicKeyHex);
            const accountHash = publicKey.toAccountHash();
            const accountHashHex = Buffer.from(accountHash).toString('hex');

            // The contract stores data with keys like "i{:?}" where {:?} is the Debug format of AccountHash
            // In Rust, AccountHash Debug format is: AccountHash(hex_bytes)
            const debugFormat = `AccountHash(${accountHashHex})`;

            console.log('\n=== Checking Contract Registry for Account ===');
            console.log('Public Key:', publicKeyHex);
            console.log('Account Hash (hex):', accountHashHex);
            console.log('Debug Format Key: i' + debugFormat);

            // Check if initialized: key is "i{:?}" (e.g., "iAccountHash(abc123...)")
            const initKey = `i${debugFormat}`;
            const initResult = await this.queryContractDictionary(contractHash, 'd', initKey);

            const isInitialized = initResult?.stored_value?.CLValue?.data === true;
            console.log('Is Initialized:', isInitialized);

            if (!isInitialized) {
                console.log('Account NOT registered in contract dictionary');
                console.log('========================================\n');
                return { isInitialized: false, guardians: [], threshold: 0 };
            }

            // Get guardians: key is "g{:?}"
            const guardiansKey = `g${debugFormat}`;
            const guardiansResult = await this.queryContractDictionary(contractHash, 'd', guardiansKey);

            // Get threshold: key is "t{:?}"
            const thresholdKey = `t${debugFormat}`;
            const thresholdResult = await this.queryContractDictionary(contractHash, 'd', thresholdKey);

            const guardians = guardiansResult?.stored_value?.CLValue?.data || [];
            const threshold = thresholdResult?.stored_value?.CLValue?.data || 0;

            console.log('Guardians from contract:', guardians);
            console.log('Threshold:', threshold);
            console.log('========================================\n');

            return {
                isInitialized,
                guardians: Array.isArray(guardians) ? guardians.map((g: any) =>
                    typeof g === 'string' ? g : Buffer.from(g).toString('hex')
                ) : [],
                threshold: Number(threshold),
            };
        } catch (error) {
            console.error('Error getting guardians from contract:', error);
            return { isInitialized: false, guardians: [], threshold: 0 };
        }
    }

    /**
     * Check if account has guardians registered (checks associated keys on account)
     * Note: This checks the ACCOUNT's associated keys, not the contract registry
     */
    async hasGuardians(publicKeyHex: string): Promise<boolean> {
        try {
            const accountInfo = await this.getAccountInfo(publicKeyHex);
            if (!accountInfo || !accountInfo.Account) return false;

            // Handle both snake_case and camelCase
            const associatedKeys = accountInfo.Account.associated_keys || accountInfo.Account.associatedKeys || [];
            // If there's more than 1 key, it implies guardians are added
            console.log('\n=== Account Associated Keys ===');
            console.log('Public Key:', publicKeyHex);
            console.log('Associated Keys Count:', associatedKeys.length);
            console.log('Associated Keys:', JSON.stringify(associatedKeys, null, 2));
            console.log('========================================\n');
            return associatedKeys.length > 1;
        } catch (error) {
            console.error('Error checking has guardians:', error);
            return false;
        }
    }

    /**
     * Get guardians for an account (returns associated keys)
     */
    async getGuardians(publicKeyHex: string): Promise<string[]> {
        try {
            const accountInfo = await this.getAccountInfo(publicKeyHex);
            if (!accountInfo || !accountInfo.Account) return [];

            // Handle both snake_case and camelCase
            const associatedKeys = accountInfo.Account.associated_keys || accountInfo.Account.associatedKeys || [];

            // Return all associated keys (including the primary one)
            // The frontend can filter if needed, or we can return all "guardians"
            return associatedKeys.map((k: any) => k.account_hash || k.accountHash);
        } catch (error) {
            console.error(`Error getting guardians: ${error}`);
            return [];
        }
    }

    /**
     * Get threshold for an account (returns key_management threshold)
     */
    async getThreshold(publicKeyHex: string): Promise<number> {
        try {
            const accountInfo = await this.getAccountInfo(publicKeyHex);
            if (!accountInfo || !accountInfo.Account) return 0;

            // Handle both snake_case and camelCase
            const actionThresholds = accountInfo.Account.action_thresholds || accountInfo.Account.actionThresholds;
            if (!actionThresholds) return 1; // Default threshold

            return actionThresholds.key_management || actionThresholds.keyManagement || 1;
        } catch (error) {
            console.error(`Error getting threshold: ${error}`);
            return 0;
        }
    }

    /**
     * Submit deploy to the network (using SDK)
     */
    async submitDeploy(signedDeploy: DeployUtil.Deploy): Promise<string> {
        const deployHash = await this.client.putDeploy(signedDeploy);
        return deployHash;
    }

    /**
     * Submit deploy JSON directly to node via RPC (bypasses SDK validation)
     * This is useful when the SDK's deployFromJson validation is too strict
     */
    async submitDeployJson(deployJson: any): Promise<{
        deployHash: string;
        success: boolean;
        message: string;
    }> {
        try {
            console.log('Submitting deploy to RPC:', config.casper.nodeUrl);
            console.log('Deploy JSON structure keys:', Object.keys(deployJson));

            // The deployJson should be {deploy: {...}} format
            // Casper RPC expects params: {deploy: {...}}
            // Make sure we're not double-wrapping
            let params = deployJson;
            if (deployJson.deploy && !deployJson.deploy.deploy) {
                // Already in correct format: {deploy: {...}}
                params = deployJson;
            } else if (!deployJson.deploy) {
                // Wrap if needed: deploy -> {deploy: deploy}
                params = { deploy: deployJson };
            }

            console.log('RPC params keys:', Object.keys(params));
            console.log('Deploy hash from body:', params.deploy?.hash);

            // Make direct RPC call to the node
            const response = await fetch(config.casper.nodeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: Date.now(),
                    method: 'account_put_deploy',
                    params: params
                }),
            });

            console.log('RPC response status:', response.status, response.statusText);

            // Check if response is OK
            if (!response.ok) {
                const errorText = await response.text();
                console.error('RPC HTTP error:', errorText);
                return {
                    deployHash: '',
                    success: false,
                    message: `HTTP error ${response.status}: ${response.statusText}.${errorText}`,
                };
            }

            // Get response text first to handle empty responses
            const responseText = await response.text();
            console.log('RPC response text length:', responseText.length);

            if (!responseText || responseText.trim() === '') {
                return {
                    deployHash: '',
                    success: false,
                    message: 'RPC returned empty response',
                };
            }

            // Parse the JSON response
            const result = JSON.parse(responseText) as {
                error?: { message?: string; code?: number; data?: any };
                result?: { deploy_hash?: string };
            };
            console.log('RPC response:', JSON.stringify(result, null, 2));

            if (result.error) {
                return {
                    deployHash: '',
                    success: false,
                    message: `RPC error: ${result.error.message || JSON.stringify(result.error)}`,
                };
            }

            const deployHash = result.result?.deploy_hash || '';
            return {
                deployHash,
                success: true,
                message: 'Deploy submitted successfully via RPC',
            };
        } catch (error) {
            console.error('Error submitting deploy via RPC:', error);
            return {
                deployHash: '',
                success: false,
                message: `Error submitting deploy: ${error}`,
            };
        }
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
        errorMessage?: string;
    } | null> {
        try {
            console.log('\n=== Getting Deploy Status ===');
            console.log('Deploy Hash:', deployHash);

            const [deploy, deployResult] = await this.client.getDeploy(deployHash);

            let status: 'pending' | 'success' | 'failed' = 'pending';
            let executionResult = null;
            let errorMessage: string | undefined;

            // Cast to any to handle different API versions
            const result = deployResult as any;

            // Check for NEW format (Version 2 API): execution_info.execution_result
            if (result.execution_info?.execution_result) {
                const execResult = result.execution_info.execution_result;
                executionResult = execResult;

                console.log('Found execution_info.execution_result');

                // Version2 format
                if (execResult.Version2) {
                    const v2 = execResult.Version2;
                    console.log('Version2 result:', JSON.stringify(v2, null, 2));

                    if (v2.error_message) {
                        // Has error_message = FAILED
                        status = 'failed';
                        errorMessage = v2.error_message;
                        console.log('Deploy status: FAILED -', errorMessage);
                    } else {
                        // No error_message = SUCCESS
                        status = 'success';
                        console.log('Deploy status: SUCCESS');
                    }
                }
                // Version1 format
                else if (execResult.Success || execResult.Failure) {
                    if (execResult.Success) {
                        status = 'success';
                        console.log('Deploy status: SUCCESS (Version1)');
                    } else {
                        status = 'failed';
                        errorMessage = execResult.Failure?.error_message || 'Unknown error';
                        console.log('Deploy status: FAILED (Version1) -', errorMessage);
                    }
                }
            }
            // Check for OLD format: execution_results array
            else if (result.execution_results && result.execution_results.length > 0) {
                const firstResult = result.execution_results[0];
                executionResult = firstResult;

                console.log('Found execution_results array');

                const resultData = firstResult.result || firstResult;

                if (resultData.Success) {
                    status = 'success';
                    console.log('Deploy status: SUCCESS (old format)');
                } else if (resultData.Failure) {
                    status = 'failed';
                    errorMessage = resultData.Failure?.error_message || 'Unknown error';
                    console.log('Deploy status: FAILED (old format) -', errorMessage);
                }
            } else {
                console.log('No execution results yet - deploy is pending');
            }

            console.log('Final status:', status);
            console.log('========================================\n');

            return {
                deployHash,
                status,
                executionResult,
                errorMessage
            };
        } catch (error: any) {
            console.error('Error getting deploy status:', error);

            // If deploy not found, treat as pending
            if (error.message?.includes('deploy not known') || error.code === -32003) {
                console.log('Deploy not found - might still be pending or invalid hash');
                return {
                    deployHash,
                    status: 'pending',
                    errorMessage: 'Deploy not yet indexed by node'
                };
            }

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
                    `account - hash - ${Buffer.from(accountResult.CLValue.data).toString('hex')}` : '',
                newKey: newKeyResult?.CLValue?.data || '',
                approvalCount: Number(countResult?.CLValue?.data) || 0,
                isApproved: approvedResult?.CLValue?.data === true,
            };
        } catch (error) {
            console.error(`Error getting recovery details: ${error}`);
            return null;
        }
    }

    /**
     * Get recovery details by ID from the contract dictionary
     * This queries the contract directly using the recovery ID
     */
    async getRecoveryByIdFromContract(recoveryId: string): Promise<{
        recoveryId: string;
        account: string | null;
        newKey: string | null;
        approvalCount: number;
        isApproved: boolean;
    } | null> {
        try {
            const contractHash = config.contract.recoveryRegistryHash;
            if (!contractHash) {
                console.error('Contract hash not configured');
                return null;
            }

            console.log('\n=== Querying Recovery By ID ===');
            console.log('Recovery ID:', recoveryId);

            // Query the contract dictionary for recovery data
            // Keys are: ra{id}, rk{id}, rc{id}, ro{id}
            const [accountResult, newKeyResult, countResult, approvedResult] = await Promise.all([
                this.queryContractDictionary(contractHash, 'd', `ra${recoveryId}`),
                this.queryContractDictionary(contractHash, 'd', `rk${recoveryId}`),
                this.queryContractDictionary(contractHash, 'd', `rc${recoveryId}`),
                this.queryContractDictionary(contractHash, 'd', `ro${recoveryId}`),
            ]);

            // If no account found, recovery doesn't exist
            if (!accountResult?.stored_value?.CLValue?.data) {
                console.log('Recovery not found');
                return null;
            }

            // Parse account hash from the result
            const accountData = accountResult.stored_value.CLValue.data;
            const accountHex = typeof accountData === 'string'
                ? accountData
                : Buffer.from(accountData).toString('hex');

            // Parse new key from the result
            const newKeyData = newKeyResult?.stored_value?.CLValue?.data;
            const newKeyHex = newKeyData
                ? (typeof newKeyData === 'string' ? newKeyData : Buffer.from(newKeyData).toString('hex'))
                : null;

            const approvalCount = Number(countResult?.stored_value?.CLValue?.data) || 0;
            const isApproved = approvedResult?.stored_value?.CLValue?.data === true;

            console.log('Recovery found:');
            console.log('  Account:', accountHex ? `account-hash-${accountHex}` : 'N/A');
            console.log('  New Key:', newKeyHex || 'N/A');
            console.log('  Approval Count:', approvalCount);
            console.log('  Is Approved:', isApproved);
            console.log('========================================\n');

            return {
                recoveryId,
                account: accountHex ? `account-hash-${accountHex}` : null,
                newKey: newKeyHex,
                approvalCount,
                isApproved,
            };
        } catch (error) {
            console.error(`Error getting recovery by ID from contract: ${error}`);
            return null;
        }
    }

    /**
     * Get all recoveries where the given public key is a guardian
     * Uses the contract's reverse mapping stored at gr{:?} key
     */
    async getRecoveriesForGuardian(guardianPublicKeyHex: string): Promise<{
        recoveryId: string;
        targetAccount: string;
        newKey: string | null;
        approvalCount: number;
        threshold: number;
        isApproved: boolean;
        alreadyApproved: boolean;
    }[]> {
        try {
            const contractHash = config.contract.recoveryRegistryHash;
            if (!contractHash) {
                console.error('Contract hash not configured');
                return [];
            }

            console.log('\n=== Getting Recoveries For Guardian (Using Reverse Mapping) ===');
            console.log('Guardian Public Key:', guardianPublicKeyHex);

            // Get guardian's account hash for the contract key
            const guardianPubKey = CLPublicKey.fromHex(guardianPublicKeyHex);
            const guardianAccountHash = guardianPubKey.toAccountHash();
            const guardianAccountHashHex = Buffer.from(guardianAccountHash).toString('hex');
            const guardianDebugFormat = `AccountHash(${guardianAccountHashHex})`;

            console.log('Guardian Account Hash Hex:', guardianAccountHashHex);
            console.log('Guardian Debug Format:', guardianDebugFormat);

            // Query the reverse mapping: gr{:?} contains the list of recovery IDs for this guardian
            const grKey = `gr${guardianDebugFormat}`;
            console.log('Querying dictionary key:', grKey);

            const recoveryIdsResult = await this.queryContractDictionary(
                contractHash, 'd', grKey
            );
            console.log('Recovery IDs raw result:', JSON.stringify(recoveryIdsResult, null, 2));

            // Debug the object structure
            if (recoveryIdsResult) {
                console.log('Debug - Type:', typeof recoveryIdsResult);
                console.log('Debug - Keys:', Object.keys(recoveryIdsResult));
                // @ts-ignore
                if (recoveryIdsResult.CLValue) {
                    // @ts-ignore
                    console.log('Debug - CLValue Type:', typeof recoveryIdsResult.CLValue);
                    // @ts-ignore
                    console.log('Debug - CLValue IsArray:', Array.isArray(recoveryIdsResult.CLValue));
                }
            }

            // Handle multiple possible response structures:
            // 1. { CLValue: [...] } - direct CLValue
            // 2. { stored_value: { CLValue: { data: [...] } } } - wrapped format
            let recoveryIdsData: any[] | undefined;

            if (recoveryIdsResult?.CLValue && Array.isArray(recoveryIdsResult.CLValue)) {
                // Direct CLValue array format
                recoveryIdsData = recoveryIdsResult.CLValue;
                console.log('Found recovery IDs in direct CLValue format:', recoveryIdsData);
            } else if (recoveryIdsResult?.stored_value?.CLValue?.data) {
                // Wrapped format
                recoveryIdsData = recoveryIdsResult.stored_value.CLValue.data;
                console.log('Found recovery IDs in wrapped format:', recoveryIdsData);
            } else if (Array.isArray(recoveryIdsResult)) {
                // Raw array format
                recoveryIdsData = recoveryIdsResult;
                console.log('Found recovery IDs as raw array:', recoveryIdsData);
            }

            if (!recoveryIdsData || !Array.isArray(recoveryIdsData) || recoveryIdsData.length === 0) {
                console.log('No recoveries found for this guardian - data is:', recoveryIdsData);
                console.log('========================================\n');
                return [];
            }

            // Parse recovery IDs from U256 values
            const recoveryIds: string[] = recoveryIdsData.map((id: any) => {
                if (typeof id === 'object' && id !== null) {
                    // U256 might be stored as an object
                    return id.toString();
                }
                return String(id);
            });

            console.log('Found recovery IDs:', recoveryIds);

            const results: {
                recoveryId: string;
                targetAccount: string;
                newKey: string | null;
                approvalCount: number;
                threshold: number;
                isApproved: boolean;
                alreadyApproved: boolean;
            }[] = [];

            // Fetch details for each recovery ID
            for (const idStr of recoveryIds) {
                console.log(`\n--- Fetching Recovery ${idStr} Details ---`);

                // Check if recovery is finalized (skip if it is)
                const finalizedResult = await this.queryContractDictionary(contractHash, 'd', `rf${idStr}`);
                if (finalizedResult?.stored_value?.CLValue?.data === true) {
                    console.log('Recovery is finalized, skipping');
                    continue;
                }

                // Get target account for this recovery
                const accResult = await this.queryContractDictionary(contractHash, 'd', `ra${idStr}`);
                if (!accResult?.stored_value?.CLValue?.data) {
                    console.log('Recovery account not found, skipping');
                    continue;
                }

                // Parse the AccountHash
                const targetAccountData = accResult.stored_value.CLValue.data;
                let targetAccountHex: string;
                if (typeof targetAccountData === 'string') {
                    targetAccountHex = targetAccountData;
                } else if (Array.isArray(targetAccountData)) {
                    targetAccountHex = Buffer.from(targetAccountData).toString('hex');
                } else if (targetAccountData?.data) {
                    targetAccountHex = Buffer.from(targetAccountData.data).toString('hex');
                } else {
                    targetAccountHex = Buffer.from(targetAccountData).toString('hex');
                }

                const targetDebugFormat = `AccountHash(${targetAccountHex})`;
                console.log('Target Account Hex:', targetAccountHex);

                // Get recovery details in parallel
                const [newKeyResult, approvalCountResult, approvedResult, thresholdResult] = await Promise.all([
                    this.queryContractDictionary(contractHash, 'd', `rk${idStr}`),
                    this.queryContractDictionary(contractHash, 'd', `rc${idStr}`),
                    this.queryContractDictionary(contractHash, 'd', `ro${idStr}`),
                    this.queryContractDictionary(contractHash, 'd', `t${targetDebugFormat}`),
                ]);

                // Check if this guardian already approved
                const approvedByGuardianResult = await this.queryContractDictionary(
                    contractHash, 'd', `rp${idStr}_${guardianDebugFormat}`
                );
                const alreadyApproved = approvedByGuardianResult?.stored_value?.CLValue?.data === true;
                console.log('Already approved by this guardian:', alreadyApproved);

                // Parse new key
                const newKeyData = newKeyResult?.stored_value?.CLValue?.data;
                let newKeyHex: string | null = null;
                if (newKeyData) {
                    if (typeof newKeyData === 'string') {
                        newKeyHex = newKeyData;
                    } else if (Array.isArray(newKeyData)) {
                        newKeyHex = Buffer.from(newKeyData).toString('hex');
                    } else if (newKeyData?.data) {
                        newKeyHex = Buffer.from(newKeyData.data).toString('hex');
                    }
                }

                results.push({
                    recoveryId: idStr,
                    targetAccount: `account-hash-${targetAccountHex}`,
                    newKey: newKeyHex,
                    approvalCount: Number(approvalCountResult?.stored_value?.CLValue?.data) || 0,
                    threshold: Number(thresholdResult?.stored_value?.CLValue?.data) || 2,
                    isApproved: approvedResult?.stored_value?.CLValue?.data === true,
                    alreadyApproved,
                });
            }

            console.log(`\nFound ${results.length} active recoveries for this guardian`);
            console.log('========================================\n');

            return results;
        } catch (error) {
            console.error(`Error getting recoveries for guardian: ${error}`);
            return [];
        }
    }
}

// Export singleton instance
export const casperService = new CasperService();
