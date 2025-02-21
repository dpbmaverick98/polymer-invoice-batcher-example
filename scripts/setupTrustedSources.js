/**
 * Configure trusted source contracts across all chains
 * 
 * Usage:
 * ```bash
 * # Set up trusted sources across all chains
 * npm run setup:trusted
 * 
 * # Or using node directly:
 * node scripts/setupTrustedSources.js
 * ```
 * 
 * This script will:
 * 1. Read deployed contract addresses from .env
 * 2. Configure each contract to trust other chain contracts
 * 3. Verify trusted source configuration
 * 
 * Requirements:
 * - Contracts must be deployed first (run deploy:v2)
 * - .env must contain contract addresses
 * - Wallet must have enough gas tokens on each chain
 */

require("dotenv").config();
const hre = require("hardhat");
const chalk = require("chalk");
const { CHAINS, getEnabledChains } = require("../config/chains");

// ABI for the functions we need
const CONTRACT_ABI = [
    "function setTrustedSourceContract(uint32,address) external",
    "function trustedSourceContracts(uint32) view returns (address)"
];

async function setupTrustedSources() {
    console.log(chalk.blue("\n🔄 Setting up trusted sources..."));

    // Get all enabled chains and their deployed contracts
    const deployments = getEnabledChains().map(chain => ({
        chainConfig: chain,
        address: process.env[`${chain.envPrefix}_INVOICEBATCHER_ADDRESS`]
    }));

    // Validate all addresses exist
    for (const deployment of deployments) {
        if (!deployment.address) {
            throw new Error(`Missing contract address for ${deployment.chainConfig.name} in .env`);
        }
        console.log(chalk.cyan(`Found contract for ${deployment.chainConfig.name}: ${deployment.address}`));
    }

    // For each chain, set up trusted sources
    for (const source of deployments) {
        console.log(chalk.yellow(`\n📝 Configuring ${source.chainConfig.name}...`));
        
        // Connect to the network
        const provider = new hre.ethers.JsonRpcProvider(source.chainConfig.rpc);
        const wallet = new hre.ethers.Wallet(process.env.PRIVATE_KEY, provider);
        
        // Get contract instance
        const sourceContract = new hre.ethers.Contract(
            source.address,
            CONTRACT_ABI,
            wallet
        );
        
        // For each other chain, set it as trusted source
        for (const target of deployments) {
            if (source.chainConfig.chainId === target.chainConfig.chainId) continue;

            console.log(chalk.cyan(`>  Adding ${target.chainConfig.name} as trusted source...`));
            console.log(chalk.cyan(`   Chain ID: ${target.chainConfig.chainId}`));
            console.log(chalk.cyan(`   Address: ${target.address}`));
            
            try {
                // Check current trusted source
                const currentTrusted = await sourceContract.trustedSourceContracts(target.chainConfig.chainId);
                
                if (currentTrusted.toLowerCase() === target.address.toLowerCase()) {
                    console.log(chalk.green("✅ Already correctly configured"));
                    continue;
                }

                const tx = await sourceContract.setTrustedSourceContract(
                    target.chainConfig.chainId,
                    target.address,
                    { 
                        gasLimit: 200000
                    }
                );
                
                console.log(chalk.yellow("   Transaction Hash:"), tx.hash);
                console.log(chalk.yellow("   Waiting for confirmation..."));
                
                const receipt = await tx.wait(1);
                
                if (!receipt.status) {
                    throw new Error("Transaction failed");
                }
                
                console.log(chalk.green("✅ Added successfully"));
                console.log(chalk.cyan("   Block Number:"), receipt.blockNumber);
                console.log(chalk.cyan("   Gas Used:"), receipt.gasUsed.toString());

                // Verify the change
                const newTrusted = await sourceContract.trustedSourceContracts(target.chainConfig.chainId);
                if (newTrusted.toLowerCase() !== target.address.toLowerCase()) {
                    throw new Error("Verification failed - new value doesn't match expected");
                }
            } catch (error) {
                console.error(chalk.red("❌ Failed to add trusted source:"), error.message);
                if (error.transaction) {
                    console.log(chalk.yellow("   Transaction Hash:"), error.transaction.hash);
                }
                throw error;
            }
        }
    }

    console.log(chalk.green("\n✅ Trusted sources setup completed!"));
}

// Execute
setupTrustedSources()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(chalk.red("\n❌ Error:"), error);
        process.exit(1);
    });