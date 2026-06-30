// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title MockWstETH
/// @notice Minimal wstETH stand-in for Veil's testnet: a standard ERC-20 (the methods VeilPool
///         needs) plus `mint` for seeding and a settable `stEthPerToken` rate so the demo can show
///         yield. wstETH is non-rebasing — balances are fixed; the rate appreciates. Lido's Sepolia
///         token is deprecated, so the demo deploys this instead. Real mainnet wstETH is a drop-in.
///
/// @dev   The Veil pool denominates everything in wstETH BASE-UNITS (1e18, same scale as wei), so
///        the proof is over the pool's own bookkeeping and never sees `stEthPerToken`. Bumping the
///        rate raises the ETH/USD value of the same units → collateral health only improves, and
///        the same wstETH-unit proof stays valid (the great demo beat).
contract MockWstETH {
    string public constant name = "Wrapped liquid staked Ether 2.0 (mock)";
    string public constant symbol = "wstETH";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice wstETH→stETH exchange rate, 1e18-scaled (1e18 == 1.0). Appreciates over time.
    uint256 public stEthPerToken = 1e18;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();

    /// @notice Mint tokens (test/demo seeding only — no access control on the mock).
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @notice Set the wstETH→stETH rate to demonstrate yield. 1e18-scaled.
    function setStEthPerToken(uint256 rate) external {
        stEthPerToken = rate;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed < amount) revert InsufficientAllowance();
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        uint256 bal = balanceOf[from];
        if (bal < amount) revert InsufficientBalance();
        balanceOf[from] = bal - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
