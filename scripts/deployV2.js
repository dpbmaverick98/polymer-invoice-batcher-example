/**
 * Deploy InvoiceIDBatcher contracts to all configured chains
 * 
 * Usage:
 * ```bash
 * # Deploy to all configured chains
 * npm run deploy:v2
 * 
 * # Or using node directly:
 * node scripts/deployV2.js
 * ```
 * 
 * This script will:
 * 1. Deploy InvoiceIDBatcher contract to each configured chain
 * 2. Update .env with contract addresses
 * 3. Display deployment progress and results
 * 
 * Requirements:
 * - .env file configured with:
 *   - PRIVATE_KEY
 *   - RPC endpoints for each chain
 *   - Polymer Prover addresses
 */

require("dotenv").config();
const hre = require("hardhat");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const { CHAINS, getEnabledChains } = require("../config/chains");

async function deployToChain(chainConfig, networkName) {
    console.log(chalk.blue(`\n🌐 Deploying to ${chalk.bold(chainConfig.name)}...`));
    
    // Get the Polymer Prover address
    const polymerProverAddress = chainConfig.proverAddress;
    if (!polymerProverAddress) {
        throw new Error(`No Polymer Prover address found for ${chainConfig.name}`);
    }

    console.log(chalk.cyan(`🔗 Using Polymer Prover: ${polymerProverAddress}`));

    // Deploy InvoiceIDBatcher
    console.log(chalk.yellow("📄 Deploying InvoiceIDBatcher..."));
    const InvoiceBatcher = await hre.ethers.getContractFactory("InvoiceIDBatcher");
    
    const deployTx = await InvoiceBatcher.deploy(polymerProverAddress, {
        gasLimit: 3000000
    });

    console.log(chalk.yellow("⏳ Waiting for deployment transaction..."));
    
    // Get the deployment transaction
    const deploymentTx = deployTx.deploymentTransaction();
    if (!deploymentTx) {
        throw new Error("Deployment transaction failed to create");
    }
    
    console.log(chalk.cyan(">  Transaction Hash:"), deploymentTx.hash);

    // Wait for deployment with timeout
    try {
        // First wait for the transaction to be mined
        console.log(chalk.yellow("⏳ Waiting for transaction to be mined..."));
        const provider = deploymentTx.provider;
        
        // Poll for transaction receipt
        let receipt = null;
        for (let i = 0; i < 30; i++) { // Try for 5 minutes (30 * 10 seconds)
            receipt = await provider.getTransactionReceipt(deploymentTx.hash);
            if (receipt) {
                break;
            }
            console.log(chalk.yellow(`>  Attempt ${i + 1}/30: Waiting for receipt...`));
            await new Promise(r => setTimeout(r, 10000)); // Wait 10 seconds between attempts
        }

        if (!receipt) {
            throw new Error("Failed to get transaction receipt after 5 minutes");
        }

        console.log(chalk.cyan(">  Transaction mined in block:"), receipt.blockNumber);
        
        // Additional confirmations
        const currentBlock = await provider.getBlockNumber();
        console.log(chalk.cyan(">  Current block:"), currentBlock);
        
        if (!receipt.status) {
            throw new Error("Transaction failed");
        }

        const invoiceBatcherAddress = await deployTx.getAddress();
        console.log(chalk.green(`✅ Deployed to: ${invoiceBatcherAddress}`));
        console.log(chalk.green("✅ Deployment confirmed in block:", receipt.blockNumber));
        console.log(chalk.cyan(">  Block Hash:"), receipt.blockHash);
        console.log(chalk.cyan(">  Gas Used:"), receipt.gasUsed.toString());

        // Update .env file
        const envKey = `${chainConfig.envPrefix}_INVOICEBATCHER_ADDRESS`;
        updateEnvFile(envKey, invoiceBatcherAddress);

        return { chainConfig, contract: deployTx, address: invoiceBatcherAddress };
    } catch (error) {
        console.error(chalk.red("\nError during deployment:"), error.message);
        console.log(chalk.yellow(">  Transaction Hash:"), deploymentTx.hash);
        console.log(chalk.yellow(">  Please check the transaction on the network explorer"));
        throw error;
    }
}

async function setupTrustedSources(deployments) {
    console.log(chalk.blue("\n🔄 Setting up trusted sources..."));

    for (const source of deployments) {
        console.log(chalk.yellow(`\n📝 Configuring ${source.chainConfig.name}...`));
        
        // Get contract instance
        const InvoiceBatcher = await hre.ethers.getContractFactory("InvoiceIDBatcher");
        const sourceContract = InvoiceBatcher.attach(source.address);
        
        // For each other chain, set it as trusted source
        for (const target of deployments) {
            if (source.chainConfig.chainId === target.chainConfig.chainId) continue;

            console.log(chalk.cyan(`>  Adding ${target.chainConfig.name} as trusted source...`));
            console.log(chalk.cyan(`   Chain ID: ${target.chainConfig.chainId}`));
            console.log(chalk.cyan(`   Address: ${target.address}`));
            
            try {
                const tx = await sourceContract.setTrustedSourceContract(
                    target.chainConfig.chainId,
                    target.address,
                    { 
                        gasLimit: 200000,
                        maxFeePerGas: hre.ethers.parseUnits("2", "gwei"),
                        maxPriorityFeePerGas: hre.ethers.parseUnits("1", "gwei")
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
            } catch (error) {
                console.error(chalk.red("❌ Failed to add trusted source:"), error.message);
                if (error.transaction) {
                    console.log(chalk.yellow("   Transaction Hash:"), error.transaction.hash);
                }
                throw error; // Halt the process if setting trusted source fails
            }
        }
    }
}

async function verifySetup(deployments) {
    console.log(chalk.blue("\n🔍 Verifying setup..."));

    for (const source of deployments) {
        console.log(chalk.yellow(`\nChecking ${source.chainConfig.name}:`));
        
        for (const target of deployments) {
            if (source.chainConfig.chainId === target.chainConfig.chainId) continue;

            try {
                const trustedAddress = await source.contract.trustedSourceContracts(target.chainConfig.chainId);
                const isCorrect = trustedAddress.toLowerCase() === target.address.toLowerCase();
                
                console.log(
                    isCorrect 
                        ? chalk.green(`✅ ${target.chainConfig.name}: Correctly configured`)
                        : chalk.red(`❌ ${target.chainConfig.name}: Mismatch - Expected ${target.address}, got ${trustedAddress}`)
                );
            } catch (error) {
                console.error(chalk.red(`❌ Error checking ${target.chainConfig.name}:`), error.message);
            }
        }
    }
}

function updateEnvFile(key, value) {
    const envPath = path.join(__dirname, "../.env");
    let envContent = fs.readFileSync(envPath, "utf8");
    
    const envRegex = new RegExp(`${key}=.*`, "g");
    if (envContent.match(envRegex)) {
        envContent = envContent.replace(envRegex, `${key}=${value}`);
    } else {
        envContent += `\n${key}=${value}`;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log(chalk.cyan(`📝 Updated ${key} in .env`));
}

async function main() {
    // Get network argument from Hardhat's runtime environment
    const networkName = hre.network.name;
    console.log(chalk.blue(`\n🔍 Network detected: ${networkName}`));

    // Find matching chain configuration
    const chain = Object.values(CHAINS).find(c => 
        c.name.toLowerCase().replace(' ', '-') === networkName ||
        networkName === c.envPrefix.toLowerCase()
    );
    
    if (!chain) {
        console.error(chalk.red("Available networks:"));
        Object.values(CHAINS).forEach(c => {
            console.log(chalk.yellow(`- ${c.name.toLowerCase().replace(' ', '-')}`));
        });
        throw new Error(`Network ${networkName} not found in chain configurations`);
    }

    console.log(chalk.blue("🚀 Starting deployment process"));
    console.log(chalk.cyan("Target chain:"));
    console.log(chalk.cyan(`- ${chain.name} (${chain.chainId})`));

    const deployments = [];

    try {
        const deployment = await deployToChain(chain, networkName);
        deployments.push(deployment);

        if (deployments.length > 1) {
            // Setup trusted sources
            await setupTrustedSources(deployments);

            // Verify setup
            await verifySetup(deployments);
        }

        console.log(chalk.green("\n✅ Deployment process completed!"));
    } catch (error) {
        console.error(chalk.red(`\n❌ Failed to deploy to ${chain.name}:`), error);
        process.exit(1);
    }
}

// Handle errors
process.on("unhandledRejection", (error) => {
    console.error(chalk.red("❌ Unhandled promise rejection:"), error);
});

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(chalk.red("\n❌ Error:"), error);
        process.exit(1);
    });
