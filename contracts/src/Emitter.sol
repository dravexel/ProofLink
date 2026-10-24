// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Emitter
 * @notice Deployed on source chain (Ethereum Sepolia).
 * Records messages in storage and emits Sent event.
 */
contract Emitter {
    // Slot 0: records[sender][payloadHash] = block.number
    mapping(address => mapping(bytes32 => uint256)) public records;

    event Sent(address indexed sender, bytes32 payloadHash);

    function send(bytes32 payloadHash) external {
        records[msg.sender][payloadHash] = block.number;
        emit Sent(msg.sender, payloadHash);
    }
}
