require("dotenv").config();
const ethers = require("ethers");
const axios = require("axios");
const chalk = require("chalk");
const { CHAINS, getEnabledChains } = require("../config/chains");

const POLYMER_API_URL = "https://proof.testnet.polymer.zone";

// Updated Contract ABI for InvoiceIDBatcher events
const CONTRACT_ABI = [
    "event NewInvoice(address indexed sender, bytes32 indexed invoiceHash)",
    "event InvoiceBatch(address indexed sender, bytes32[] invoices)",
    "event InvoiceReceived(address indexed originalSender, bytes32 indexed invoiceHash)",
    "function newInvoice(bytes32) external",
    "function batchInvoices() external",
    "function invoicesFromSource(bytes calldata proof) external"
];

class ChainListener {
    constructor(chain, eventCallback) {
        this.chain = chain;
        
        // Get RPC from environment variable
        const rpcEnvKey = `${chain.envPrefix}_RPC`;
        const rpc = process.env[rpcEnvKey];
        if (!rpc) {
            throw new Error(`No RPC found in environment for chain ${chain.name} (${rpcEnvKey})`);
        }
        this.provider = new ethers.JsonRpcProvider(rpc);

        // Get contract address from environment variable
        const contractEnvKey = `${chain.envPrefix}_INVOICEBATCHER_ADDRESS`;
        const contractAddress = process.env[contractEnvKey];
        if (!contractAddress) {
            throw new Error(`No invoice batcher address found in environment for chain ${chain.name} (${contractEnvKey})`);
        }
        
        this.contract = new ethers.Contract(
            contractAddress,
            CONTRACT_ABI,
            this.provider
        );
        this.eventCallback = eventCallback;
        this.isListening = false;
        this.processedEvents = new Set();
    }

    async start() {
        if (this.isListening) return;
        
        console.log(chalk.blue(`\n🎧 Starting listener for ${this.chain.name}...`));
        console.log(chalk.cyan(`>  Contract: ${this.contract.target}`));
        console.log(chalk.cyan(`>  Chain ID: ${this.chain.chainId}`));

        // Get latest block
        const latestBlock = await this.provider.getBlockNumber();
        console.log(chalk.yellow(`>  Current block: ${latestBlock}`));
        
        // Listen for InvoiceBatch events
        this.contract.on("InvoiceBatch", async (sender, invoices, event) => {
            try {
                // Create unique event identifier
                const eventId = `${event.log.blockHash}-${event.log.transactionHash}-${event.log.index}`;
                
                // Skip if already processed
                if (this.processedEvents.has(eventId)) return;
                
                const eventData = {
                    chain: this.chain,
                    sender,
                    invoices,
                    blockNumber: event.log.blockNumber,
                    transactionHash: event.log.transactionHash,
                    logIndex: event.log.index
                };

                // Get transaction receipt for position in block
                const receipt = await event.log.getTransactionReceipt();
                eventData.positionInBlock = receipt.index;
                
                await this.eventCallback(eventData);
                this.processedEvents.add(eventId);
            } catch (error) {
                console.error(chalk.red("❌ Error processing event:"), error);
            }
        });

        this.isListening = true;
        console.log(chalk.green(`✅ Listener active for ${this.chain.name}`));
    }

    async stop() {
        if (!this.isListening) return;
        await this.contract.removeAllListeners();
        this.isListening = false;
        console.log(chalk.yellow(`⏹️  Stopped listener for ${this.chain.name}`));
    }
}

class Relayer {
    constructor() {
        this.enabledChains = getEnabledChains();
        // Create a map of chainId to chain config for easy lookup
        this.chains = Object.fromEntries(
            this.enabledChains.map(chain => {
                // Add contract address from environment variables using envPrefix
                const contractEnvKey = `${chain.envPrefix}_INVOICEBATCHER_ADDRESS`;
                chain.invoiceBatcherAddress = process.env[contractEnvKey];
                // Add RPC from environment variables using envPrefix
                const rpcEnvKey = `${chain.envPrefix}_RPC`;
                chain.rpc = process.env[rpcEnvKey];
                return [chain.chainId, chain];
            })
        );
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        this.listeners = new Map();
        this.processingEvents = new Map();
    }

    async init() {
        console.log(chalk.cyan(`👛 Using wallet address: ${this.wallet.address}`));
        
        for (const chain of this.enabledChains) {
            const contractEnvKey = `${chain.envPrefix}_INVOICEBATCHER_ADDRESS`;
            if (!process.env[contractEnvKey]) {
                console.log(chalk.yellow(`⚠️  Skipping ${chain.name} - No invoice batcher address configured (${contractEnvKey})`));
                continue;
            }
            console.log(chalk.cyan(`>  ${chain.name} contract: ${process.env[contractEnvKey]}`));
            const listener = new ChainListener(chain, this.handleEvent.bind(this));
            this.listeners.set(chain.chainId, listener);
        }

        if (this.listeners.size === 0) {
            throw new Error("No chains configured with valid invoice batcher addresses");
        }
    }

    async start() {
        console.log(chalk.blue("\n🚀 Starting relayer..."));
        
        for (const listener of this.listeners.values()) {
            await listener.start();
        }
        
        console.log(chalk.green("\n✅ Relayer active and listening on all chains"));
    }

    async stop() {
        console.log(chalk.yellow("\n⏹️  Stopping relayer..."));
        for (const listener of this.listeners.values()) {
            await listener.stop();
        }
    }

    async handleEvent(eventData) {
        const { chain: sourceChain, transactionHash } = eventData;
        const eventId = `${sourceChain.chainId}-${transactionHash}`;
        
        if (this.processingEvents.has(eventId)) return;
        this.processingEvents.set(eventId, true);
        
        try {
            console.log(chalk.blue(`\n📝 New batch event from ${sourceChain.name}:`));
            console.log(chalk.cyan(">  Sender:", eventData.sender));
            console.log(chalk.cyan(">  Invoices:", eventData.invoices.length));
            console.log(chalk.cyan(">  Block:", eventData.blockNumber));
            console.log(chalk.cyan(">  Tx Hash:", eventData.transactionHash));

            // Get proof from Polymer API
            const { proof, proofTime } = await this.getPolymerProof(
                sourceChain.chainId,
                eventData.blockNumber,
                eventData.transactionHash,
                eventData.logIndex
            );
            
            // Process updates to all other chains in parallel
            const targetChains = this.enabledChains.filter(chain => 
                chain.chainId !== sourceChain.chainId
            );
            
            const updatePromises = targetChains.map(targetChain => 
                this.updateChain(targetChain, proof)
            );

            const results = await Promise.allSettled(updatePromises);
            
            console.log(chalk.blue("\n📊 Update Results:"));
            results.forEach((result, index) => {
                const targetChain = targetChains[index];
                if (result.status === 'fulfilled') {
                    console.log(chalk.green(`✅ ${targetChain.name}: Updated successfully`));
                } else {
                    console.log(chalk.red(`❌ ${targetChain.name}: Failed - ${result.reason}`));
                }
            });
            console.log(chalk.cyan("\n>  Polymer API proof time:", proofTime, "seconds"));

        } catch (error) {
            console.error(chalk.red("\n❌ Error processing event:"), error);
        } finally {
            this.processingEvents.delete(eventId);
        }
    }

    async getPolymerProof(sourceChainId, blockNumber, transactionHash, logIndex) {
        console.log(chalk.yellow("\n📤 Getting Polymer Proof..."));

        try {
            // Get the transaction receipt to find local log index
            const provider = new ethers.JsonRpcProvider(this.chains[sourceChainId].rpc);
            const txReceipt = await provider.getTransactionReceipt(transactionHash);
            
            if (!txReceipt) {
                throw new Error("Transaction receipt not found");
            }

            // Find the local log index of our InvoiceBatch event
            const invoiceBatchEventSignature = "InvoiceBatch(address,bytes32[])";
            const invoiceBatchTopic = ethers.id(invoiceBatchEventSignature);
            const localLogIndex = txReceipt.logs.findIndex(
                log => log.topics[0] === invoiceBatchTopic
            );

            if (localLogIndex === -1) {
                throw new Error("InvoiceBatch event not found in transaction logs");
            }

            console.log(chalk.cyan(">  Block Number:", blockNumber));
            console.log(chalk.cyan(">  Transaction Index:", txReceipt.index));
            console.log(chalk.cyan(">  Local Log Index:", localLogIndex));

            const proofStartTime = Date.now();

            // Request proof from Polymer API
            const proofRequest = await axios.post(
                POLYMER_API_URL,
                {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "log_requestProof",
                    params: [
                        sourceChainId,
                        blockNumber,
                        txReceipt.index,
                        localLogIndex
                    ]
                },
                {
                    headers: {
                        Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                    }
                }
            );

            if (proofRequest.status !== 200) {
                throw new Error(`Failed to get proof from Polymer API. Status code: ${proofRequest.status}`);
            }

            const jobId = proofRequest.data.result;
            console.log(chalk.green("✅ Proof requested. Job ID:", jobId));

            // Poll for proof
            let attempts = 0;
            while (attempts < 120) { // 120 attempts * 0.5 seconds = 60 seconds max wait
                const proofResponse = await axios.post(
                    POLYMER_API_URL,
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "log_queryProof",
                        params: [jobId]
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.POLYMER_API_KEY}`,
                        }
                    }
                );

                if (proofResponse.data.result.proof) {
                    const proof = `0x${Buffer.from(proofResponse.data.result.proof, 'base64').toString('hex')}`;
                    const proofTime = ((Date.now() - proofStartTime) / 1000).toFixed(2);
                    console.log(chalk.green("✅ Proof received"));
                    return { proof, proofTime };
                }

                attempts++;
                await new Promise(r => setTimeout(r, 500)); // 500ms delay between polls
            }

            throw new Error("Timeout waiting for proof");
        } catch (error) {
            console.error(chalk.red("Error getting proof:"), error.message);
            throw error;
        }
    }

    async updateChain(targetChain, proof) {
        console.log(chalk.yellow(`\n🔄 Updating ${targetChain.name}...`));
        
        const provider = new ethers.JsonRpcProvider(targetChain.rpc);
        const signer = this.wallet.connect(provider);
        const contract = new ethers.Contract(targetChain.invoiceBatcherAddress, CONTRACT_ABI, signer);

        try {
            const tx = await contract.invoicesFromSource(proof, {
                gasLimit: 500000
            });
            
            console.log(chalk.cyan(`>  Transaction hash: ${tx.hash}`));
            const receipt = await tx.wait();

            return receipt;
        } catch (error) {
            throw new Error(`Failed to update ${targetChain.name}: ${error.message}`);
        }
    }
}

async function main() {
    const relayer = new Relayer();
    
    process.on('SIGINT', async () => {
        console.log(chalk.yellow("\n\n⏹️  Shutting down relayer..."));
        await relayer.stop();
        process.exit();
    });

    try {
        await relayer.init();
        await relayer.start();
        
        console.log(chalk.blue("\n👀 Watching for events... (Press Ctrl+C to stop)"));
    } catch (error) {
        console.error(chalk.red("\n❌ Error:"), error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(chalk.red("\n❌ Fatal Error:"), error);
    process.exit(1);
}); 