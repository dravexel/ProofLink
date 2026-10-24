// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ILightClient.sol";
import "./GatedNFT.sol";
import "./MerklePatriciaProof.sol";

/**
 * @title Verifier
 * @notice Deployed on destination chain (Polygon Amoy).
 * Verifies account and storage MPT proofs from source chain and mints GatedNFT.
 */
contract Verifier {
    ILightClient public lightClient;
    address public emitter;
    GatedNFT public nft;

    // proofId => bool (replay protection)
    mapping(bytes32 => bool) public used;

    event Verified(
        uint256 indexed sourceBlock,
        address indexed sender,
        bytes32 indexed payloadHash,
        uint256 recordedBlock
    );

    error ZeroAddress();

    constructor(address _lightClient, address _emitter, address _nft) {
        if (_lightClient == address(0) || _emitter == address(0)) revert ZeroAddress();
        lightClient = ILightClient(_lightClient);
        emitter = _emitter;
        if (_nft != address(0)) {
            nft = GatedNFT(_nft);
        }
    }

    /**
     * @notice Verify MPT proof against light client state root.
     * @param accountProof Stack of RLP nodes for Emitter account
     * @param storageProof Stack of RLP nodes for storage slot
     * @param sourceBlock Block number on source chain
     * @param sender Original sender of payload on source chain
     * @param payloadHash Payload hash recorded in Emitter
     */
    function verify(
        bytes[] calldata accountProof,
        bytes[] calldata storageProof,
        uint256 sourceBlock,
        address sender,
        bytes32 payloadHash
    ) external {
        bytes32 proofId = keccak256(abi.encode(sourceBlock, sender, payloadHash));
        if (used[proofId]) {
            revert InvalidProof();
        }

        bytes32 stateRoot = lightClient.stateRoot(sourceBlock);
        if (stateRoot == bytes32(0)) {
            revert InvalidProof();
        }

        // 1. Verify Emitter account proof in state trie
        bytes32 emitterKey = keccak256(abi.encodePacked(emitter));
        bytes memory accountRlp = MerklePatriciaProof.verifyProof(stateRoot, emitterKey, accountProof);
        bytes32 storageRoot = MerklePatriciaProof.extractStorageRoot(accountRlp);

        // 2. Verify storage proof in Emitter's storage trie
        // Storage slot for records[sender][payloadHash] in Emitter:
        bytes32 slot = keccak256(abi.encode(payloadHash, keccak256(abi.encode(sender, uint256(0)))));
        bytes32 slotKey = keccak256(abi.encodePacked(slot));

        bytes memory storageValRlp = MerklePatriciaProof.verifyProof(storageRoot, slotKey, storageProof);
        uint256 recordedBlock = MerklePatriciaProof.decodeStorageValue(storageValRlp);

        if (recordedBlock == 0) {
            revert InvalidProof();
        }

        // Mark as used (replay protection)
        used[proofId] = true;

        emit Verified(sourceBlock, sender, payloadHash, recordedBlock);

        // Run app action: mint NFT
        if (address(nft) != address(0)) {
            // forge-lint: disable-next-line(unused-return)
            nft.mint(sender);
        }
    }
}
