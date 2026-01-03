// SentinelX - API Client
// Communicates with the backend server

import axios, { AxiosInstance } from 'axios';

// API Base URL - defaults to localhost:3000 for development
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000,
});

// Types for API responses
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface DeployResponse {
    deployJson: any;
    message?: string;
    note?: string;
}

export interface AccountInfo {
    accountHash: string;
    balance: string;
    mainPurse: string;
}

export interface AccountKeys {
    associatedKeys: Array<{
        accountHash: string;
        weight: number;
    }>;
    actionThreshold: {
        deployment: number;
        keyManagement: number;
    };
}

export interface DeployStatus {
    deployHash: string;
    status: 'pending' | 'success' | 'failed';
    executionResult?: unknown;
}

export interface SignatureCheckResult {
    signatureCount: number;
    hasEnoughSignatures: boolean;
}

// ==================== RECOVERY ENDPOINTS ====================

/**
 * Register protectors for an account (Phase 1 - Setup)
 * Creates an unsigned deploy that needs to be signed with the user's PRIMARY key
 */
export const registerGuardians = async (
    userPublicKey: string,
    guardians: string[],
    threshold: number
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/recovery/register', {
            userPublicKey,
            guardians,
            threshold,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Initiate recovery request (Phase 2 - Recovery Step 1)
 * Anyone (usually a protector) can initiate a recovery proposal
 */
export const initiateRecovery = async (
    initiatorPublicKey: string,
    targetAccount: string,
    newPublicKey: string
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/recovery/initiate', {
            initiatorPublicKey,
            targetAccount,
            newPublicKey,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Approve recovery request (Phase 2 - Recovery Step 2)
 * Each protector independently approves the recovery
 */
export const approveRecovery = async (
    guardianPublicKey: string,
    recoveryId: string
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/recovery/approve', {
            guardianPublicKey,
            recoveryId,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Check if threshold is met for a recovery request
 */
export const checkThreshold = async (
    signerPublicKey: string,
    recoveryId: string
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/recovery/check-threshold', {
            signerPublicKey,
            recoveryId,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Finalize recovery request
 */
export const finalizeRecovery = async (
    signerPublicKey: string,
    recoveryId: string
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/recovery/finalize', {
            signerPublicKey,
            recoveryId,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Check if account has protectors
 */
export const hasGuardians = async (
    signerPublicKey: string,
    targetAccount: string
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/recovery/has-guardians', {
            signerPublicKey,
            targetAccount,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Get guardians for an account
 */
export const getGuardians = async (
    signerPublicKey: string,
    targetAccount: string
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/recovery/get-guardians', {
            signerPublicKey,
            targetAccount,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// ==================== SESSION ENDPOINTS ====================

/**
 * Build add_associated_key deploy (Recovery Step 4)
 * Protectors jointly execute this to add the new key
 */
export const buildAddKeyDeploy = async (
    signerPublicKey: string,
    newKey: string,
    weight: number = 1
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/session/add-key', {
            signerPublicKey,
            newKey,
            weight,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Build remove_associated_key deploy (Recovery Step 5)
 * Protectors remove the lost key
 */
export const buildRemoveKeyDeploy = async (
    signerPublicKey: string,
    keyToRemove: string
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/session/remove-key', {
            signerPublicKey,
            keyToRemove,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Build update_thresholds deploy (Recovery Step 6)
 * Reset thresholds so user regains full control
 */
export const buildUpdateThresholdsDeploy = async (
    signerPublicKey: string,
    deploymentThreshold: number,
    keyManagementThreshold: number
): Promise<ApiResponse<DeployResponse>> => {
    try {
        const response = await apiClient.post('/session/update-thresholds', {
            signerPublicKey,
            deploymentThreshold,
            keyManagementThreshold,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Submit a signed deploy to the network
 */
export const submitDeploy = async (
    deployJson: string
): Promise<ApiResponse<{ deployHash: string; message: string }>> => {
    try {
        const response = await apiClient.post('/session/submit', {
            deployJson,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Check if deploy has enough signatures
 */
export const checkSignatures = async (
    deployJson: string,
    targetAccount: string
): Promise<ApiResponse<SignatureCheckResult>> => {
    try {
        const response = await apiClient.post('/session/check-signatures', {
            deployJson,
            targetAccount,
        });
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// ==================== ACCOUNT ENDPOINTS ====================

/**
 * Get account information
 */
export const getAccountInfo = async (
    publicKey: string
): Promise<ApiResponse<AccountInfo>> => {
    try {
        const response = await apiClient.get(`/account/${publicKey}`);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Get account's associated keys and thresholds
 */
export const getAccountKeys = async (
    publicKey: string
): Promise<ApiResponse<AccountKeys>> => {
    try {
        const response = await apiClient.get(`/account/${publicKey}/keys`);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

/**
 * Get deploy status
 */
export const getDeployStatus = async (
    deployHash: string
): Promise<ApiResponse<DeployStatus>> => {
    try {
        const response = await apiClient.get(`/account/deploy/${deployHash}`);
        return response.data;
    } catch (error) {
        return handleApiError(error);
    }
};

// ==================== HEALTH CHECK ====================

/**
 * Check API health
 */
export const checkHealth = async (): Promise<boolean> => {
    try {
        const response = await apiClient.get('/health');
        return response.data?.success === true;
    } catch {
        return false;
    }
};

// ==================== ERROR HANDLING ====================

function handleApiError<T>(error: unknown): ApiResponse<T> {
    if (axios.isAxiosError(error)) {
        if (error.response) {
            return {
                success: false,
                error: error.response.data?.error || error.message,
            };
        }
        if (error.request) {
            return {
                success: false,
                error: 'Network error. Please check if the backend server is running.',
            };
        }
    }
    return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
}

export default apiClient;
