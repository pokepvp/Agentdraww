// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MockAgentId — TEST-ONLY stand-in for the Binance .ai Agent ID NFT
/// @notice Minimal balanceOf registry used by the local ganache tests in
///         place of the real SPACE ID .ai contract
///         (0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F). Anyone can claim one
///         mock ID for testing. NEVER deploy this to a live network.
contract MockAgentId {
    mapping(address => uint256) private _balances;

    function claim() external {
        require(_balances[msg.sender] == 0, "Already claimed");
        _balances[msg.sender] = 1;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
}
