// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title InvoiceIDBatcher
 * @notice A contract for batching and cross-chain relaying of invoice IDs using Polymer Protocol
 * @dev This contract allows for efficient batching of invoice IDs and secure cross-chain message passing
 */

interface IPolymerProver {
    /**
     * @notice Validates an event proof from another chain
     * @param proof The proof data from Polymer Protocol
     * @return chainId The source chain ID
     * @return emittingContract The address that emitted the event
     * @return topics The event topics (including event signature)
     * @return data The event data
     */
    function validateEvent(
        bytes calldata proof
    )
        external
        view
        returns (
            uint32 chainId,
            address emittingContract,
            bytes memory topics,
            bytes memory data
        );
}

contract InvoiceIDBatcher {
    // Polymer prover contract for cross-chain message verification
    IPolymerProver public immutable polymerProver;
    
    // Admin role for configuring trusted sources
    address public admin;

    // Array to store pending invoice hashes before batching
    bytes32[] private pendingInvoices;

    // Mapping to prevent replay attacks by tracking used proof hashes
    mapping(bytes32 => bool) private usedProofHashes;

    // Mapping of trusted contracts on other chains (chainId => contract address)
    mapping(uint32 => address) public trustedSourceContracts;

    /**
     * @notice Emitted when a new invoice is added to the pending batch
     * @param sender The address that added the invoice
     * @param invoiceHash The hash of the invoice ID
     */
    event NewInvoice(
        address indexed sender,
        bytes32 indexed invoiceHash
    );

    /**
     * @notice Emitted when pending invoices are batched
     * @param sender The address that triggered the batch
     * @param invoices Array of invoice hashes in the batch
     */
    event InvoiceBatch(
        address indexed sender,
        bytes32[] invoices
    );

    /**
     * @notice Emitted when an invoice is received from another chain
     * @param originalSender The address that sent the invoice on the source chain
     * @param invoiceHash The hash of the received invoice ID
     */
    event InvoiceReceived(
        address indexed originalSender,
        bytes32 indexed invoiceHash
    );

    /**
     * @notice Contract constructor
     * @param _polymerProver Address of the Polymer Prover contract
     */
    constructor(address _polymerProver) {
        polymerProver = IPolymerProver(_polymerProver);
        admin = msg.sender;
    }

    /**
     * @notice Configures a trusted contract on another chain
     * @param chainId The ID of the source chain
     * @param sourceContract The address of the trusted contract on the source chain
     * @dev Only admin can call this function
     */
    function setTrustedSourceContract(uint32 chainId, address sourceContract) external {
        require(msg.sender == admin, "Only admin can set trusted sources");
        require(chainId != block.chainid, "Cannot set source for current chain");
        require(sourceContract != address(0), "Invalid source contract address");
        trustedSourceContracts[chainId] = sourceContract;
    }

    /**
     * @notice Adds a new invoice to the pending batch
     * @param invoiceHash The hash of the invoice ID to add
     * @dev Emits a NewInvoice event
     */
    function newInvoice(bytes32 invoiceHash) external {
        require(invoiceHash != bytes32(0), "Invalid invoice hash");
        pendingInvoices.push(invoiceHash);
        emit NewInvoice(msg.sender, invoiceHash);
    }

    /**
     * @notice Batches all pending invoices and emits them as a single event
     * @dev This function clears the pending invoices array and emits an InvoiceBatch event
     * @dev The batch event is what gets picked up by relayers for cross-chain transmission
     */
    function batchInvoices() external {
        require(pendingInvoices.length > 0, "No pending invoices");
        
        // Create a copy of current pending invoices
        bytes32[] memory currentBatch = new bytes32[](pendingInvoices.length);
        for(uint i = 0; i < pendingInvoices.length; i++) {
            currentBatch[i] = pendingInvoices[i];
        }
        
        // Clear the pending invoices array
        delete pendingInvoices;
        
        // Emit the batch event for relayers to pick up
        emit InvoiceBatch(msg.sender, currentBatch);
    }

    /**
     * @notice Processes a batch of invoices received from another chain
     * @param proof The Polymer proof data containing the cross-chain event
     * @dev Validates the proof using Polymer Prover and emits individual InvoiceReceived events
     * @dev Includes replay protection to prevent double-processing of proofs
     */
    function invoicesFromSource(bytes calldata proof) external {
        // Validate the proof using Polymer Prover
        (
            uint32 sourceChainId,
            address sourceContract,
            bytes memory topics,
            bytes memory data
        ) = polymerProver.validateEvent(proof);

        // Verify the source chain and contract are trusted
        require(sourceChainId != block.chainid, "Cannot process events from same chain");
        require(trustedSourceContracts[sourceChainId] != address(0), "Chain not trusted");
        require(sourceContract == trustedSourceContracts[sourceChainId], "Invalid source contract");

        // Prevent replay attacks
        bytes32 proofHash = keccak256(abi.encodePacked(proof));
        require(!usedProofHashes[proofHash], "Proof already used");
        usedProofHashes[proofHash] = true;

        // Decode the batch of invoice hashes from the event data
        bytes32[] memory invoices = abi.decode(data, (bytes32[]));
        
        // Extract the original sender from the event topics
        bytes32[] memory topicsArray = new bytes32[](2);
        assembly {
            let topicsPtr := add(topics, 32)
            mstore(add(topicsArray, 32), mload(add(topicsPtr, 32))) // Skip event signature, get sender
        }
        address sender = address(uint160(uint256(topicsArray[0])));

        // Emit individual events for each invoice in the batch
        for(uint i = 0; i < invoices.length; i++) {
            emit InvoiceReceived(sender, invoices[i]);
        }
    }

    /**
     * @notice Returns the number of pending invoices
     * @return The current length of the pendingInvoices array
     */
    function getPendingInvoicesCount() external view returns (uint256) {
        return pendingInvoices.length;
    }
}
