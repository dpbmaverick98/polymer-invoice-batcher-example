require("dotenv").config();

// Chain configurations
const activatedChains = process.env.ACTIVATED_CHAINS
  ? process.env.ACTIVATED_CHAINS.split(",")
  : [];

if (activatedChains.length === 0) {
  console.error(
    "No chains are activated. Please set the ACTIVATED_CHAINS environment variable."
  );
  process.exit(1);
}

const CHAINS = {
  "optimism-sepolia": {
    name: "Optimism Sepolia",
    chainId: 11155420,
    envPrefix: "OPTIMISM_SEPOLIA",
    invoiceBatcherAddress: process.env.OPTIMISM_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    rpc: process.env.OPTIMISM_SEPOLIA_RPC,
    proverAddress: process.env.POLYMER_PROVER_OPTIMISM_TESTNET_CONTRACT_ADDRESS
  },
  "arbitrum-sepolia": {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    envPrefix: "ARBITRUM_SEPOLIA",
    invoiceBatcherAddress: process.env.ARBITRUM_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    rpc: process.env.ARBITRUM_SEPOLIA_RPC,
    proverAddress: process.env.POLYMER_PROVER_ARBITRUM_TESTNET_CONTRACT_ADDRESS
  },
  "base-sepolia": {
    name: "Base Sepolia",
    chainId: 84532,
    envPrefix: "BASE_SEPOLIA",
    invoiceBatcherAddress: process.env.BASE_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    rpc: process.env.BASE_SEPOLIA_RPC,
    proverAddress: process.env.POLYMER_PROVER_BASE_TESTNET_CONTRACT_ADDRESS
  },
  "mode-sepolia": {
    name: "Mode Sepolia",
    rpcUrl: process.env.MODE_SEPOLIA_RPC,
    invoiceBatcherAddress: process.env.MODE_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    chainId: 919,
  },
  "bob-sepolia": {
    name: "Bob Sepolia",
    rpcUrl: process.env.BOB_SEPOLIA_RPC,
    invoiceBatcherAddress: process.env.BOB_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    chainId: 808813,
  },
  "ink-sepolia": {
    name: "Ink Sepolia",
    rpcUrl: process.env.INK_SEPOLIA_RPC,
    invoiceBatcherAddress: process.env.INK_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    chainId: 763373,
  },
  "unichain-sepolia": {
    name: "UniChain Sepolia",
    rpcUrl: process.env.UNICHAIN_SEPOLIA_RPC,
    invoiceBatcherAddress: process.env.UNICHAIN_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    chainId: 1301,
  },
  "mantle-sepolia": {
    name: "Mantle Sepolia",
    rpcUrl: process.env.MANTLE_SEPOLIA_RPC,
    invoiceBatcherAddress: process.env.MANTLE_SEPOLIA_INVOICE_BATCHER_ADDRESS,
    chainId: 5003,
  },
};

// Helper function to get enabled chains from .env
function getEnabledChains() {
  const activatedChains = process.env.ACTIVATED_CHAINS?.split(',') || [];
  return activatedChains
    .map(chainKey => CHAINS[chainKey])
    .filter(chain => chain && chain.rpc && chain.proverAddress);
}

module.exports = {
  CHAINS,
  getEnabledChains
};
