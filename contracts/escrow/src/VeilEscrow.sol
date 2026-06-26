// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title VeilEscrow
/// @notice Locks real ETH collateral on Ethereum under a hashlock `H = keccak256(S)`.
///         A borrower proves (in zero-knowledge, off-chain) that a lock with `amount >= T`
///         and hashlock `H` exists, then borrows USDC on Stellar. All enforcement lives here,
///         on Ethereum, where the collateral lives — no Stellar->Ethereum proof is ever needed.
///
///         Three exits, every one checkable on Ethereum alone:
///           1. repay-reveal: anyone who learns `S` (revealed on Stellar at repay) unlocks the
///              collateral back to the original depositor via {claimRepaid}.
///           2. timeout: after `deadline`, anyone may push the collateral to the lender via
///              {liquidateTimeout}. The timeout ALWAYS favors the lender (else a borrower could
///              keep both the loan and the collateral).
///           3. price-default [STRETCH]: an oracle-underwater path to the lender; left as an
///              extension point ({liquidatePrice}) so the core flow stays minimal and honest.
///
/// @dev Storage layout is intentionally simple so the RISC Zero guest can target a lock's
///      `amount` slot via `eth_getProof`. `locks` is the first state variable (mapping at slot 0);
///      for a key `H`, the struct base slot is `keccak256(abi.encode(H, uint256(0)))`, with
///      `amount` at base+1 and `H` at base+2 (see test `test_StorageLayout`).
contract VeilEscrow {
    struct Lock {
        address depositor; // base+0 (packed low 20 bytes)
        uint256 amount;    // base+1 (full slot) — the value the ZK guest proves `>= T`
        bytes32 H;         // base+2 (full slot) — hashlock, binds escrow lock <-> Stellar loan
        uint64 deadline;   // base+3 (packed) — unix seconds; after this, lender may liquidate
        bool closed;       // base+3 (packed) — set on any exit; prevents double-spend / H reuse
    }

    /// @dev MUST remain the first declared state variable (slot 0) for the guest's slot math.
    mapping(bytes32 => Lock) public locks;

    /// @dev Hand-rolled reentrancy guard, declared AFTER `locks` so it does not occupy slot 0.
    uint256 private _entered;

    /// @notice The party that receives collateral on any default (timeout or price).
    address public immutable lender;

    event Locked(bytes32 indexed H, address indexed depositor, uint256 amount, uint64 deadline);
    event Repaid(bytes32 indexed H, address indexed depositor, uint256 amount);
    event LiquidatedTimeout(bytes32 indexed H, address indexed lender, uint256 amount);

    error AlreadyUsed();
    error ZeroAmount();
    error BadDeadline();
    error NotFound();
    error AlreadyClosed();
    error WrongSecret();
    error NotYetDue();
    error TransferFailed();
    error Reentrancy();

    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    constructor(address lender_) {
        require(lender_ != address(0), "lender=0");
        lender = lender_;
    }

    /// @notice Lock `msg.value` of ETH under hashlock `H`, redeemable until `deadline`.
    /// @param H        keccak256(abi.encodePacked(S)) for a borrower-chosen secret `S`.
    /// @param deadline Unix seconds. MUST be after the Stellar loan term so timeout favors the lender.
    function lock(bytes32 H, uint64 deadline) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (deadline <= block.timestamp) revert BadDeadline();
        // A non-zero depositor means this H was used before (open or closed): never reuse.
        if (locks[H].depositor != address(0)) revert AlreadyUsed();

        locks[H] = Lock({
            depositor: msg.sender,
            amount: msg.value,
            H: H,
            deadline: deadline,
            closed: false
        });
        emit Locked(H, msg.sender, msg.value, deadline);
    }

    /// @notice Reveal `S` to return the collateral to its original depositor.
    /// @dev Callable by anyone (typically the secret-reveal relay, after `S` surfaces on Stellar).
    function claimRepaid(bytes32 S) external nonReentrant {
        bytes32 H = keccak256(abi.encodePacked(S));
        Lock storage l = locks[H];
        if (l.depositor == address(0)) revert NotFound();
        if (l.closed) revert AlreadyClosed();
        // keccak(S)==H is implied by the lookup succeeding; guard against the empty-slot collision.
        if (l.H != H) revert WrongSecret();

        l.closed = true; // effects before interaction
        address to = l.depositor;
        uint256 amt = l.amount;
        emit Repaid(H, to, amt);
        _send(to, amt);
    }

    /// @notice After `deadline`, push the collateral to the lender. Permissionless.
    function liquidateTimeout(bytes32 H) external nonReentrant {
        Lock storage l = locks[H];
        if (l.depositor == address(0)) revert NotFound();
        if (l.closed) revert AlreadyClosed();
        if (block.timestamp <= l.deadline) revert NotYetDue();

        l.closed = true;
        uint256 amt = l.amount;
        emit LiquidatedTimeout(H, lender, amt);
        _send(lender, amt);
    }

    /// @notice [STRETCH] Oracle-underwater liquidation to the lender. Extension point only.
    function liquidatePrice(bytes32) external pure {
        revert("price-default: stretch, not wired");
    }

    function _send(address to, uint256 amt) private {
        (bool ok, ) = payable(to).call{value: amt}("");
        if (!ok) revert TransferFailed();
    }
}
