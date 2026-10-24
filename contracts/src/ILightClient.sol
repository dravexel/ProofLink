// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ILightClient {
    function stateRoot(uint256 sourceBlock) external view returns (bytes32);
}
