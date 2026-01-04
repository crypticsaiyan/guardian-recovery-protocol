import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Casper Network
    casper: {
        nodeUrl: process.env.CASPER_NODE_URL || 'http://65.109.83.79:7777/rpc',
        chainName: process.env.CASPER_CHAIN_NAME || 'casper-test',
    },

    // WASM Paths
    wasm: {
        recoveryRegistry: path.resolve(
            process.env.WASM_RECOVERY_REGISTRY_PATH || '../contracts/wasm/recovery_registry.wasm'
        ),
        testContract: path.resolve(
            process.env.WASM_TEST_CONTRACT_PATH || '../contracts/wasm/test_contract.wasm'
        ),
        addKey: path.resolve(
            process.env.WASM_ADD_KEY_PATH || '../contracts/wasm/add_associated_key.wasm'
        ),
        removeKey: path.resolve(
            process.env.WASM_REMOVE_KEY_PATH || '../contracts/wasm/remove_associated_key.wasm'
        ),
        updateThresholds: path.resolve(
            process.env.WASM_UPDATE_THRESHOLDS_PATH || '../contracts/wasm/update_thresholds.wasm'
        ),
    },

    // Deploy settings
    deploy: {
        paymentAmount: '5000000000', // 5 CSPR
        sessionPaymentAmount: '10000000000', // 10 CSPR for session WASMs
        ttl: 1800000, // 30 minutes
    },
};
