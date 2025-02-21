# Polymer Invoice ID Batcher Example 

A cross-chain state synchronization system built on [Polymer](https://polymerlabs.org), enabling seamless state sharing across multiple EVM chains.

## Overview

This system consists of two main contracts:
- `InvoiceIDBatcher.sol`: Handles batching and synchronization of invoice IDs across chains
- Trusted sources management for secure cross-chain communication

## Prerequisites

- Node.js (v18 or higher)
- `npm` or `yarn`
- A wallet with some testnet ETH on supported chains:
  - Optimism Sepolia
  - Base Sepolia
  - Mode Sepolia
- [Polymer API Key](https://docs.polymerlabs.org/docs/build/contact) for requesting cross-chain proofs

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/stevenlei/polymer-invoice-id-batcher.git
   cd polymer-invoice-id-batcher
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your private key
   - Add RPC URLs for each chain
   - Add Polymer Prover addresses for each chain (defined in `.env.example`)

## Deployment and Configuration

1. Deploy the contracts:
   ```bash
   npm run deploy:v2
   ```
   This will deploy the InvoiceIDBatcher contract to all configured chains and update the `.env` file with contract addresses.

2. Set up trusted sources:
   ```bash
   npm run setup:trusted
   ```
   This script configures the trusted sources across all chains to enable secure cross-chain communication.

## Running the System

1. Start the relayer:
   ```bash
   npm run relayer:v2
   ```
   The relayer monitors events across chains and handles cross-chain message propagation.

## Testing End-to-End

To test the system:

1. Ensure the relayer is running (`npm run relayer:v2`)
2. Use the contract functions to:
   - Add invoice IDs to a batch
   - Submit batches for cross-chain synchronization
   - Verify invoice IDs are synchronized across chains

## Architecture

1. **InvoiceIDBatcher Contract**
   - Batches invoice IDs
   - Manages trusted sources
   - Handles cross-chain synchronization
   - Validates Polymer proofs

2. **RelayerV2**
   - Monitors chain events
   - Generates and submits cross-chain proofs
   - Handles message propagation

3. **Scripts**
   - `deployV2.js`: Deploys contracts
   - `setupTrustedSources.js`: Configures trusted sources
   - `relayerV2.js`: Handles cross-chain communication
   - `sendInvoices.js`: Submits test invoice IDs to the system

## Supported Networks

Currently supported networks (Sepolia testnet):
- Optimism
- Base
- Mode

## Security

- Trusted source validation
- Proof verification using Polymer Protocol
- Batch integrity checks

## Disclaimer

This is a proof of concept and is not intended for production use. Use at your own risk.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
# polymer-invoice-batcher-example
