// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/Emitter.sol";
import "../src/ILightClient.sol";
import "../src/CheckpointLightClient.sol";
import "../src/GatedNFT.sol";
import "../src/Verifier.sol";
import "../src/MerklePatriciaProof.sol";
import "../src/RLPReader.sol";

contract ProofLinkTest is Test {
    Emitter public emitter;
    CheckpointLightClient public lightClient;
    GatedNFT public nft;
    Verifier public verifier;

    address public owner = address(0xABCD);
    address public relayer = address(0xABCD);
    address public alice = address(0x1111);
    bytes32 public payloadHash = keccak256("test-payload");

    function setUp() public {
        vm.startPrank(owner);
        emitter = new Emitter();
        lightClient = new CheckpointLightClient(owner);
        nft = new GatedNFT(owner);
        verifier = new Verifier(address(lightClient), address(emitter), address(nft));
        nft.setVerifier(address(verifier));
        vm.stopPrank();
    }

    // --- Helper to build 1-node MPT leaf for testing ---
    function encodeLeafNode(bytes32 keyHash, bytes memory valueBytes) internal pure returns (bytes memory) {
        // Compact HP path for even leaf: 0x20 prefix followed by 32 bytes of keyHash
        bytes memory compact = abi.encodePacked(bytes1(0x20), keyHash); // 33 bytes
        // RLP string prefix for 33 bytes: 0x80 + 33 = 0xa1
        bytes memory rlpPath = abi.encodePacked(bytes1(0xa1), compact); // 34 bytes

        // RLP encode valueBytes
        bytes memory rlpVal;
        if (valueBytes.length == 1 && uint8(valueBytes[0]) < 0x80) {
            rlpVal = valueBytes;
        } else if (valueBytes.length <= 55) {
            rlpVal = abi.encodePacked(bytes1(uint8(0x80 + valueBytes.length)), valueBytes);
        } else {
            // length <= 255
            rlpVal = abi.encodePacked(bytes1(0xb8), bytes1(uint8(valueBytes.length)), valueBytes);
        }

        // Now encode list [rlpPath, rlpVal]
        bytes memory payload = abi.encodePacked(rlpPath, rlpVal);
        bytes memory rlpNode;
        if (payload.length <= 55) {
            rlpNode = abi.encodePacked(bytes1(uint8(0xc0 + payload.length)), payload);
        } else {
            rlpNode = abi.encodePacked(bytes1(0xf8), bytes1(uint8(payload.length)), payload);
        }
        return rlpNode;
    }

    function encodeAccount(uint256 /* nonce */, uint256 /* balance */, bytes32 storageRoot, bytes32 codeHash) internal pure returns (bytes memory) {
        // [nonce, balance, storageRoot, codeHash]
        bytes memory rlpNonce = hex"80";
        bytes memory rlpBalance = hex"80";
        bytes memory rlpStorageRoot = abi.encodePacked(bytes1(0xa0), storageRoot);
        bytes memory rlpCodeHash = abi.encodePacked(bytes1(0xa0), codeHash);

        bytes memory payload = abi.encodePacked(rlpNonce, rlpBalance, rlpStorageRoot, rlpCodeHash);
        // length = 1 + 1 + 33 + 33 = 68 bytes
        return abi.encodePacked(bytes1(0xf8), bytes1(uint8(payload.length)), payload);
    }

    function test_Emitter_Send() public {
        vm.prank(alice);
        emitter.send(payloadHash);
        assertEq(emitter.records(alice, payloadHash), block.number);
    }

    function test_LightClient_SetStateRoot() public {
        bytes32 mockRoot = keccak256("mock-root");
        vm.prank(owner);
        lightClient.setStateRoot(100, mockRoot);
        assertEq(lightClient.stateRoot(100), mockRoot);
    }

    function test_LightClient_SetStateRoot_Unauthorized() public {
        bytes32 mockRoot = keccak256("mock-root");
        vm.prank(alice);
        vm.expectRevert(CheckpointLightClient.Unauthorized.selector);
        lightClient.setStateRoot(100, mockRoot);
    }

    function test_GatedNFT_MintByVerifier() public {
        vm.prank(address(verifier));
        uint256 id = nft.mint(alice);
        assertEq(id, 1);
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.ownerOf(1), alice);
    }

    function test_GatedNFT_Mint_Unauthorized() public {
        vm.prank(alice);
        vm.expectRevert(GatedNFT.Unauthorized.selector);
        nft.mint(alice);
    }

    function test_Verifier_ValidProof_PassesAndMints() public {
        uint256 sourceBlock = 42;
        bytes32 storageRoot = keccak256("storage-root");
        bytes32 codeHash = keccak256("code-hash");

        // 1. Build Account Proof
        bytes32 emitterKey = keccak256(abi.encodePacked(address(emitter)));
        bytes memory accountRlp = encodeAccount(0, 0, storageRoot, codeHash);
        bytes memory accountLeaf = encodeLeafNode(emitterKey, accountRlp);
        bytes32 stateRoot = keccak256(accountLeaf);

        // 2. Build Storage Proof
        bytes32 slot = keccak256(abi.encode(payloadHash, keccak256(abi.encode(alice, uint256(0)))));
        bytes32 slotKey = keccak256(abi.encodePacked(slot));
        // Storage value is sourceBlock (42 = 0x2a)
        bytes memory storageValRlp = hex"2a";
        bytes memory storageLeaf = encodeLeafNode(slotKey, storageValRlp);
        // Ensure storageLeaf hash matches storageRoot
        storageRoot = keccak256(storageLeaf);

        // Re-encode account with updated storageRoot
        accountRlp = encodeAccount(0, 0, storageRoot, codeHash);
        accountLeaf = encodeLeafNode(emitterKey, accountRlp);
        stateRoot = keccak256(accountLeaf);

        // Set state root in light client
        vm.prank(owner);
        lightClient.setStateRoot(sourceBlock, stateRoot);

        bytes[] memory accountProof = new bytes[](1);
        accountProof[0] = accountLeaf;

        bytes[] memory storageProof = new bytes[](1);
        storageProof[0] = storageLeaf;

        // Call verify
        verifier.verify(accountProof, storageProof, sourceBlock, alice, payloadHash);

        // Check NFT was minted to alice
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.ownerOf(1), alice);

        // Check replay protection
        bytes32 proofId = keccak256(abi.encode(sourceBlock, alice, payloadHash));
        assertTrue(verifier.used(proofId));
    }

    function test_Verifier_Replay_Reverts() public {
        test_Verifier_ValidProof_PassesAndMints();

        // Second call with same parameters must revert InvalidProof()
        uint256 sourceBlock = 42;
        bytes32 storageRoot = keccak256("storage-root");
        bytes32 codeHash = keccak256("code-hash");
        bytes32 emitterKey = keccak256(abi.encodePacked(address(emitter)));
        bytes32 slot = keccak256(abi.encode(payloadHash, keccak256(abi.encode(alice, uint256(0)))));
        bytes32 slotKey = keccak256(abi.encodePacked(slot));
        bytes memory storageLeaf = encodeLeafNode(slotKey, hex"2a");
        storageRoot = keccak256(storageLeaf);
        bytes memory accountLeaf = encodeLeafNode(emitterKey, encodeAccount(0, 0, storageRoot, codeHash));

        bytes[] memory accountProof = new bytes[](1);
        accountProof[0] = accountLeaf;
        bytes[] memory storageProof = new bytes[](1);
        storageProof[0] = storageLeaf;

        vm.expectRevert(InvalidProof.selector);
        verifier.verify(accountProof, storageProof, sourceBlock, alice, payloadHash);
    }

    function test_Verifier_TamperedProof_Reverts() public {
        uint256 sourceBlock = 42;
        bytes32 storageRoot = keccak256("storage-root");
        bytes32 codeHash = keccak256("code-hash");
        bytes32 emitterKey = keccak256(abi.encodePacked(address(emitter)));
        bytes32 slot = keccak256(abi.encode(payloadHash, keccak256(abi.encode(alice, uint256(0)))));
        bytes32 slotKey = keccak256(abi.encodePacked(slot));
        bytes memory storageLeaf = encodeLeafNode(slotKey, hex"2a");
        storageRoot = keccak256(storageLeaf);
        bytes memory accountLeaf = encodeLeafNode(emitterKey, encodeAccount(0, 0, storageRoot, codeHash));
        bytes32 stateRoot = keccak256(accountLeaf);

        vm.prank(owner);
        lightClient.setStateRoot(sourceBlock, stateRoot);

        bytes[] memory accountProof = new bytes[](1);
        accountProof[0] = accountLeaf;
        bytes[] memory storageProof = new bytes[](1);
        // Tamper with storage proof: flip last byte
        bytes memory tamperedStorageLeaf = new bytes(storageLeaf.length);
        for (uint i = 0; i < storageLeaf.length; i++) {
            tamperedStorageLeaf[i] = storageLeaf[i];
        }
        tamperedStorageLeaf[tamperedStorageLeaf.length - 1] = bytes1(uint8(tamperedStorageLeaf[tamperedStorageLeaf.length - 1]) ^ 0xFF);
        storageProof[0] = tamperedStorageLeaf;

        vm.expectRevert(InvalidProof.selector);
        verifier.verify(accountProof, storageProof, sourceBlock, alice, payloadHash);
    }

    function test_Verifier_UnknownBlock_Reverts() public {
        bytes[] memory accountProof = new bytes[](0);
        bytes[] memory storageProof = new bytes[](0);

        vm.expectRevert(InvalidProof.selector);
        verifier.verify(accountProof, storageProof, 999999, alice, payloadHash);
    }

    function test_Verifier_RealSepoliaProof() public view {
        string memory root = vm.projectRoot();
        string memory fixturePath = string.concat(root, "/test/fixtures/sepolia_proof.json");
        string memory json = vm.readFile(fixturePath);

        bytes32 stateRoot = vm.parseJsonBytes32(json, ".stateRoot");
        address target = vm.parseJsonAddress(json, ".address");
        bytes32 slot = vm.parseJsonBytes32(json, ".slot");
        bytes32 expectedStorageHash = vm.parseJsonBytes32(json, ".storageHash");

        bytes memory accountProofRaw = vm.parseJson(json, ".accountProof");
        bytes[] memory accountProof = abi.decode(accountProofRaw, (bytes[]));

        bytes memory storageProofRaw = vm.parseJson(json, ".storageProof");
        bytes[] memory storageProof = abi.decode(storageProofRaw, (bytes[]));

        // 1. Verify real Sepolia account proof
        bytes32 targetKey = keccak256(abi.encodePacked(target));
        bytes memory accountRlp = MerklePatriciaProof.verifyProof(stateRoot, targetKey, accountProof);
        bytes32 storageRoot = MerklePatriciaProof.extractStorageRoot(accountRlp);
        assertEq(storageRoot, expectedStorageHash);

        // 2. Verify real Sepolia storage proof
        bytes32 slotKey = keccak256(abi.encodePacked(slot));
        bytes memory storageValRlp = MerklePatriciaProof.verifyProof(storageRoot, slotKey, storageProof);
        assertTrue(storageValRlp.length > 0);
    }
}
