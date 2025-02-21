require("dotenv").config();
const ethers = require("ethers");
const inquirer = require("inquirer");
const chalk = require("chalk");
const { CHAINS, getEnabledChains } = require("../config/chains");

// Contract ABI for InvoiceIDBatcher
const CONTRACT_ABI = [
    "function newInvoice(bytes32) external",
    "function batchInvoices() external",
    "function getPendingInvoicesCount() external view returns (uint256)"
];

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    // Create wallet from private key
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
    console.log(chalk.cyan(`👛 Using wallet address: ${chalk.bold(wallet.address)}`));

    // Get enabled chains
    const enabledChains = getEnabledChains();
    if (enabledChains.length === 0) {
        console.log(chalk.red("❌ No enabled chains found in ACTIVATED_CHAINS"));
        return;
    }

    // Get initial user input
    console.log(chalk.blue("\n📝 Please provide the following information:"));
    const answers = await inquirer.prompt([
        {
            type: "list",
            name: "chain",
            message: "Select a chain to send invoices on:",
            choices: enabledChains.map(chain => ({
                name: chain.name,
                value: chain
            }))
        },
        {
            type: "number",
            name: "invoiceCount",
            message: "How many invoices do you want to send?",
            validate: (input) => {
                if (input <= 0 || !Number.isInteger(input) || input > 10) {
                    return "Please enter a positive integer up to 10";
                }
                return true;
            }
        },
        {
            type: "confirm",
            name: "autoBatch",
            message: "Automatically batch invoices after sending?",
            default: true
        }
    ]);

    // Get invoice IDs
    const invoices = [];
    for (let i = 0; i < answers.invoiceCount; i++) {
        const invoiceAnswer = await inquirer.prompt([
            {
                type: "input",
                name: "invoiceId",
                message: `Enter invoice ID for invoice #${i + 1}:`,
                default: `INVOICE_${Date.now()}_${i}`,
                validate: (input) => input.trim() ? true : "Invoice ID cannot be empty"
            }
        ]);
        // Convert invoice ID to bytes32 hash
        const invoiceHash = ethers.keccak256(ethers.toUtf8Bytes(invoiceAnswer.invoiceId));
        invoices.push({
            id: invoiceAnswer.invoiceId,
            hash: invoiceHash
        });
    }

    // Show transaction details
    console.log(chalk.blue("\n📝 Transaction Details:"));
    console.log(chalk.cyan(`Chain: ${answers.chain.name}`));
    invoices.forEach((invoice, index) => {
        console.log(chalk.cyan(`\nInvoice #${index + 1}:`));
        console.log(chalk.cyan(`   ID: ${invoice.id}`));
        console.log(chalk.cyan(`   Hash: ${invoice.hash}`));
    });

    // Confirm transactions
    const confirmation = await inquirer.prompt([
        {
            type: "confirm",
            name: "proceed",
            message: "Do you want to proceed with these transactions?",
            default: false
        }
    ]);

    if (!confirmation.proceed) {
        console.log(chalk.yellow("Transactions cancelled"));
        return;
    }

    try {
        // Setup provider and contract
        console.log(chalk.yellow(`\n🔄 Connecting to ${answers.chain.name}...`));
        
        // Get RPC from environment variable
        const rpcEnvKey = `${answers.chain.envPrefix}_RPC`;
        const rpc = process.env[rpcEnvKey];
        if (!rpc) {
            throw new Error(`No RPC found in environment for chain ${answers.chain.name} (${rpcEnvKey})`);
        }
        const provider = new ethers.JsonRpcProvider(rpc);
        
        // Get contract address from environment variable
        const contractEnvKey = `${answers.chain.envPrefix}_INVOICEBATCHER_ADDRESS`;
        const contractAddress = process.env[contractEnvKey];
        if (!contractAddress) {
            throw new Error(`No invoice batcher address found in environment for chain ${answers.chain.name} (${contractEnvKey})`);
        }

        const connectedWallet = wallet.connect(provider);
        const contract = new ethers.Contract(
            contractAddress,
            CONTRACT_ABI,
            connectedWallet
        );
        console.log(chalk.green("✅ Connected successfully"));

        // Get initial pending count
        const initialPendingCount = await contract.getPendingInvoicesCount();
        console.log(chalk.cyan(">  Initial pending invoices:", initialPendingCount.toString()));

        // Process each invoice
        for (let i = 0; i < invoices.length; i++) {
            const invoice = invoices[i];
            console.log(chalk.yellow(`\n🚀 Processing invoice #${i + 1}...`));

            // Estimate gas
            const estimatedGas = await contract.newInvoice.estimateGas(invoice.hash);
            console.log(chalk.cyan(">  Estimated gas:", estimatedGas.toString()));

            // Send transaction
            const tx = await contract.newInvoice(invoice.hash, {
                gasLimit: estimatedGas
            });
            console.log(chalk.cyan(">  Transaction hash:", tx.hash));

            // Wait for confirmation
            const receipt = await tx.wait();
            console.log(chalk.green("✅ Invoice added successfully!"));
            console.log(chalk.cyan(">  Gas used:", receipt.gasUsed.toString()));

            if (i < invoices.length - 1) {
                console.log(chalk.yellow("\n⏳ Waiting 1 second before next transaction..."));
                await sleep(1000);
            }
        }

        // Get final pending count
        const finalPendingCount = await contract.getPendingInvoicesCount();
        console.log(chalk.cyan("\n>  Final pending invoices:", finalPendingCount.toString()));

        // Batch invoices if requested
        if (answers.autoBatch && finalPendingCount > 0) {
            console.log(chalk.yellow("\n🔄 Batching invoices..."));
            
            const batchTx = await contract.batchInvoices({
                gasLimit: 500000 // Higher gas limit for batch operation
            });
            console.log(chalk.cyan(">  Batch transaction hash:", batchTx.hash));

            const batchReceipt = await batchTx.wait();
            console.log(chalk.green("✅ Invoices batched successfully!"));
            console.log(chalk.cyan(">  Gas used:", batchReceipt.gasUsed.toString()));

            // Verify pending count is now 0
            const afterBatchCount = await contract.getPendingInvoicesCount();
            console.log(chalk.cyan(">  Remaining pending invoices:", afterBatchCount.toString()));
        }

        console.log(chalk.green("\n🎉 All operations completed successfully!"));

    } catch (error) {
        console.error(chalk.red("\n❌ Error:"), error.message);
        if (error.data) {
            console.error(chalk.red("Error data:"), error.data);
        }
    }
}

main().catch((error) => {
    console.error(chalk.red("\n❌ Error:"), error);
    process.exit(1);
}); 