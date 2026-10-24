// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./RLPReader.sol";

/**
 * @title MerklePatriciaProof
 * @dev MPT verification library adapted from:
 * 1. proveth (https://github.com/lorenzb/proveth) by Lorenz Breidenbach et al.
 * 2. Solidity-RLP (https://github.com/hamdiallam/Solidity-RLP) by Hamdi Allam
 */
library MerklePatriciaProof {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for bytes;

    function toNibbles(bytes32 key) internal pure returns (bytes memory) {
        bytes memory nibbles = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            nibbles[2 * i] = bytes1(uint8(key[i]) >> 4);
            nibbles[2 * i + 1] = bytes1(uint8(key[i]) & 0x0F);
        }
        return nibbles;
    }

    function decodeNibbles(bytes memory compact, uint256 skipNibbles) internal pure returns (bytes memory nibbles) {
        if (compact.length == 0) revert InvalidProof();
        uint256 length = compact.length * 2;
        if (skipNibbles > length) revert InvalidProof();
        length -= skipNibbles;
        nibbles = new bytes(length);
        uint256 nibblesLength = 0;
        for (uint256 i = skipNibbles; i < skipNibbles + length; i++) {
            if (i % 2 == 0) {
                nibbles[nibblesLength] = bytes1((uint8(compact[i / 2]) >> 4) & 0xF);
            } else {
                nibbles[nibblesLength] = bytes1(uint8(compact[i / 2]) & 0xF);
            }
            nibblesLength++;
        }
    }

    function merklePatriciaCompactDecode(bytes memory compact) internal pure returns (bool isLeaf, bytes memory nibbles) {
        if (compact.length == 0) revert InvalidProof();
        uint8 first_nibble = uint8(compact[0]) >> 4 & 0xF;
        uint256 skipNibbles;
        if (first_nibble == 0) {
            skipNibbles = 2;
            isLeaf = false;
        } else if (first_nibble == 1) {
            skipNibbles = 1;
            isLeaf = false;
        } else if (first_nibble == 2) {
            skipNibbles = 2;
            isLeaf = true;
        } else if (first_nibble == 3) {
            skipNibbles = 1;
            isLeaf = true;
        } else {
            revert InvalidProof();
        }
        return (isLeaf, decodeNibbles(compact, skipNibbles));
    }

    function sharedPrefixLength(uint256 xsOffset, bytes memory xs, bytes memory ys) internal pure returns (uint256) {
        uint256 i = 0;
        while (i + xsOffset < xs.length && i < ys.length) {
            if (xs[i + xsOffset] != ys[i]) {
                return i;
            }
            i++;
        }
        return i;
    }

    function mptHashHash(bytes memory input) internal pure returns (bytes32) {
        if (input.length < 32) {
            return keccak256(input);
        } else {
            return keccak256(abi.encodePacked(keccak256(abi.encodePacked(input))));
        }
    }

    function isEmptyItem(RLPReader.RLPItem memory item) internal pure returns (bool) {
        if (item.len == 0) return true;
        if (item.len == 1) {
            uint8 b;
            uint256 ptr = item.memPtr;
            assembly {
                b := byte(0, mload(ptr))
            }
            return b == 0x80;
        }
        return false;
    }

    /**
     * @dev Validates a Merkle-Patricia-Trie inclusion proof.
     * @param rootHash The state/storage root.
     * @param keyHash The 32-byte key (keccak256 of address or slot).
     * @param proof The stack of RLP-encoded nodes from root to leaf.
     * @return The leaf value bytes.
     */
    function verifyProof(
        bytes32 rootHash,
        bytes32 keyHash,
        bytes[] memory proof
    ) internal pure returns (bytes memory) {
        if (proof.length == 0) revert InvalidProof();

        bytes memory mptKey = toNibbles(keyHash);
        uint256 mptKeyOffset = 0;
        bytes32 nodeHashHash = bytes32(0);

        for (uint256 i = 0; i < proof.length; i++) {
            bytes memory rlpNode = proof[i];
            if (i == 0) {
                if (keccak256(rlpNode) != rootHash) {
                    revert InvalidProof();
                }
            } else {
                if (mptHashHash(rlpNode) != nodeHashHash) {
                    revert InvalidProof();
                }
            }

            RLPReader.RLPItem memory item = rlpNode.toRlpItem();
            RLPReader.RLPItem[] memory node = item.toList();

            if (node.length == 2) {
                (bool isLeaf, bytes memory nodeKey) = merklePatriciaCompactDecode(node[0].toBytes());
                uint256 prefixLength = sharedPrefixLength(mptKeyOffset, mptKey, nodeKey);
                mptKeyOffset += prefixLength;

                if (prefixLength < nodeKey.length) {
                    revert InvalidProof();
                }

                if (isLeaf) {
                    if (i != proof.length - 1) revert InvalidProof();
                    if (mptKeyOffset != mptKey.length) revert InvalidProof();
                    return node[1].toBytes();
                } else {
                    if (i == proof.length - 1) revert InvalidProof();
                    if (!node[1].isList()) {
                        nodeHashHash = keccak256(node[1].toBytes());
                    } else {
                        nodeHashHash = keccak256(node[1].toRlpBytes());
                    }
                }
            } else if (node.length == 17) {
                if (mptKeyOffset != mptKey.length) {
                    uint8 nibble = uint8(mptKey[mptKeyOffset]);
                    mptKeyOffset += 1;
                    if (nibble >= 16) revert InvalidProof();

                    RLPReader.RLPItem memory child = node[nibble];
                    if (isEmptyItem(child)) {
                        revert InvalidProof();
                    }

                    if (!child.isList()) {
                        nodeHashHash = keccak256(child.toBytes());
                    } else {
                        nodeHashHash = keccak256(child.toRlpBytes());
                    }
                } else {
                    if (i != proof.length - 1) revert InvalidProof();
                    return node[16].toBytes();
                }
            } else {
                revert InvalidProof();
            }
        }
        revert InvalidProof();
    }

    /**
     * @dev Extracts the storage root from an account leaf value.
     */
    function extractStorageRoot(bytes memory accountRlp) internal pure returns (bytes32) {
        RLPReader.RLPItem[] memory fields = accountRlp.toRlpItem().toList();
        if (fields.length < 4) revert InvalidProof();
        bytes memory storageRootBytes = fields[2].toBytes();
        if (storageRootBytes.length != 32) revert InvalidProof();
        bytes32 storageRoot;
        assembly {
            storageRoot := mload(add(storageRootBytes, 32))
        }
        return storageRoot;
    }

    /**
     * @dev Decodes a storage value from storage trie leaf value bytes.
     */
    function decodeStorageValue(bytes memory valBytes) internal pure returns (uint256) {
        if (valBytes.length == 0) revert InvalidProof();
        if (valBytes.length <= 32) {
            uint8 b0 = uint8(valBytes[0]);
            if (b0 < 0x80 && valBytes.length == 1) {
                return uint256(b0);
            }
            if (b0 >= 0x80 && b0 <= 0xb7) {
                return valBytes.toRlpItem().toUint();
            }
            uint256 res;
            assembly {
                res := mload(add(valBytes, 32))
            }
            return res;
        }
        return valBytes.toRlpItem().toUint();
    }
}
