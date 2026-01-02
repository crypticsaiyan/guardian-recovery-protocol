import { CLPublicKey } from 'casper-js-sdk';

// ============================================================================
// Account Types
// ============================================================================

export interface Guardian {
    publicKey: string;
    weight: number;
}

export interface AccountSetup {
    accountHash: string;
    guardians: Guardian[];
    threshold: number;
}

// ============================================================================
// Recovery Types
// ============================================================================

export enum RecoveryStatus {
    PENDING = 'pending',
    THRESHOLD_MET = 'threshold_met',
    EXECUTED = 'executed',
    CANCELLED = 'cancelled',
}

export interface RecoveryRequest {
    recoveryId: string;
    targetAccount: string;
    newPublicKey: string;
    initiatedBy: string;
    createdAt: number;
    approvals: string[];
    status: RecoveryStatus;
}

export interface InitiateRecoveryParams {
    targetAccount: string;
    newPublicKey: string;
}

export interface ApproveRecoveryParams {
    recoveryId: string;
    guardianPublicKey: string;
}

// ============================================================================
// Session WASM Types
// ============================================================================

export interface AddKeyParams {
    newKey: string;
    weight: number;
}

export interface RemoveKeyParams {
    keyToRemove: string;
}

export interface UpdateThresholdsParams {
    deploymentThreshold: number;
    keyManagementThreshold: number;
}

// ============================================================================
// Deploy Types
// ============================================================================

export interface DeployResult {
    deployHash: string;
    success: boolean;
    message?: any;
}

export interface MultiSigDeploy {
    deployJson: string;
    requiredSignatures: number;
    signatures: string[];
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}
