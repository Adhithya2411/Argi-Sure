// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockLinkToken
 * @dev A minimal ERC20 token that implements transferAndCall, which is required
 * by ChainlinkClient.sol for sendChainlinkRequest to work on localhost.
 */
contract MockLinkToken {
    string public constant name = "Chainlink";
    string public constant symbol = "LINK";
    uint8 public constant decimals = 18;
    uint256 public totalSupply = 1000000 * 10**18;

    mapping(address => uint256) public balances;

    constructor() {
        balances[msg.sender] = totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function transfer(address to, uint256 value) external returns (bool) {
        require(balances[msg.sender] >= value, "Insufficient balance");
        balances[msg.sender] -= value;
        balances[to] += value;
        return true;
    }

    // This is the critical function used by ChainlinkClient
    function transferAndCall(
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bool success) {
        require(balances[msg.sender] >= value, "Insufficient balance");
        balances[msg.sender] -= value;
        balances[to] += value;

        // Call the fallback on the target oracle contract
        (bool callSuccess, ) = to.call(data);
        require(callSuccess, "transferAndCall failed");

        return true;
    }
}
