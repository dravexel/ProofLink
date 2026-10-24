// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./ILightClient.sol";

/**
 * @title CheckpointLightClient
 * @notice Supplies trusted source chain state roots for checkpoints on destination chain.
 */
contract CheckpointLightClient is ILightClient {
    address public owner;
    mapping(uint256 => bytes32) private _stateRoots;

    event StateRootUpdated(uint256 indexed sourceBlock, bytes32 stateRoot);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setStateRoot(uint256 sourceBlock, bytes32 root) external onlyOwner {
        _stateRoots[sourceBlock] = root;
        emit StateRootUpdated(sourceBlock, root);
    }

    function stateRoot(uint256 sourceBlock) external view override returns (bytes32) {
        return _stateRoots[sourceBlock];
    }
}
