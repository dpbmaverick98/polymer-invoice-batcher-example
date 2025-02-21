require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.19",
  paths: {
    sources: "./contracts",
    artifacts: "./artifacts",
  },
  // Include the InvoiceIDBatcher contract
  includeFiles: [
    "contracts/invoiceIDBatcher.sol"
  ],
  networks: {
    "optimism-sepolia": {
      url: process.env.OPTIMISM_SEPOLIA_RPC,
      accounts: [process.env.PRIVATE_KEY],
    },
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC,
      accounts: [process.env.PRIVATE_KEY],
    },
    "arbitrum-sepolia": {
      url: process.env.ARBITRUM_SEPOLIA_RPC,
      accounts: [process.env.PRIVATE_KEY],
    },
    modeSepolia: {
      url: process.env.MODE_SEPOLIA_RPC,
      accounts: [process.env.PRIVATE_KEY],
      chainId: 919
    },
    bobSepolia: {
      url: process.env.BOB_SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
      chainId: 808813,
    },
    inkSepolia: {
      url: process.env.INK_SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
      chainId: 763373,
    },
    unichainSepolia: {
      url: process.env.UNICHAIN_SEPOLIA_RPC,
      accounts: [PRIVATE_KEY],
      chainId: 1301,
    },
  },
  etherscan: {
    apiKey: {
      "optimism-sepolia": process.env.OPTIMISM_API_KEY,
      "base-sepolia": process.env.BASE_API_KEY,
      "arbitrum-sepolia": process.env.ARBITRUM_API_KEY
    },
    customChains: [
      {
        network: "optimism-sepolia",
        chainId: 11155420,
        urls: {
          apiURL: "https://api-sepolia-optimistic.etherscan.io/api",
          browserURL: "https://sepolia-optimism.etherscan.io/"
        }
      },
      {
        network: "base-sepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org/"
        }
      },
      {
        network: "arbitrum-sepolia",
        chainId: 421614,
        urls: {
          apiURL: "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io/"
        }
      }
    ]
  },
};
