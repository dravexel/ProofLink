// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GatedNFT
 * @notice ERC721 NFT unlocked upon valid proof verification on destination chain.
 */
contract GatedNFT {
    string public name = "ProofLink Gated NFT";
    string public symbol = "PLNFT";

    address public owner;
    address public verifier;
    uint256 public nextTokenId = 1;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event VerifierUpdated(address indexed previousVerifier, address indexed newVerifier);

    error Unauthorized();
    error NonexistentToken();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyVerifierOrOwner() {
        if (msg.sender != verifier && msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroAddress();
        owner = _owner;
    }

    function setVerifier(address _verifier) external onlyOwner {
        emit VerifierUpdated(verifier, _verifier);
        verifier = _verifier;
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert NonexistentToken();
        return tokenOwner;
    }

    function mint(address to) external onlyVerifierOrOwner returns (uint256) {
        if (to == address(0)) revert ZeroAddress();
        uint256 tokenId = nextTokenId++;
        _balances[to] += 1;
        _owners[tokenId] = to;

        emit Transfer(address(0), to, tokenId);
        return tokenId;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert NonexistentToken();
        return "https://prooflink.xyz/api/nft/metadata";
    }
}
