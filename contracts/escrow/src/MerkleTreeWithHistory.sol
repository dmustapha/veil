// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @title MerkleTreeWithHistory
/// @notice Append-only incremental Merkle tree over **SHA-256**, with a rolling window
///         of recent roots. Structurally this is the Tornado-Nova `MerkleTreeWithHistory`
///         with Poseidon swapped for SHA-256 — chosen because the RISC Zero zkVM has a
///         SHA-256 accelerator (membership proofs are cheap), whereas Poseidon-in-RISC-V
///         is the cost killer. The zero-subtree scheme is identical to the eth2 deposit
///         contract: zeros[0] = bytes32(0), zeros[i] = sha256(zeros[i-1] ‖ zeros[i-1]).
///
/// @dev Internal nodes hash two big-endian 32-byte words: `sha256(left ‖ right)`. The
///      off-chain note client and the RISC Zero borrow guest MUST use this exact
///      construction (same leaf encoding, same zero leaf, same ordering) or membership
///      proofs will not verify.
contract MerkleTreeWithHistory {
    /// @notice Number of recent roots retained for proof liveness across concurrent inserts.
    uint32 public constant ROOT_HISTORY_SIZE = 30;

    /// @notice Tree depth (capacity = 2**levels leaves).
    uint32 public immutable levels;

    /// @notice zeros[i] = all-zero subtree root at height i (i in [0, levels]).
    bytes32[] public zeros;

    /// @dev Right-most filled node at each height, used to fold in the next leaf.
    mapping(uint256 => bytes32) public filledSubtrees;

    /// @dev Ring buffer of the last ROOT_HISTORY_SIZE roots.
    mapping(uint256 => bytes32) public roots;
    uint32 public currentRootIndex;

    /// @notice Index the next inserted leaf will occupy.
    uint32 public nextIndex;

    error LevelsOutOfRange();
    error TreeFull();

    constructor(uint32 levels_) {
        if (levels_ == 0 || levels_ >= 32) revert LevelsOutOfRange();
        levels = levels_;

        bytes32 currentZero = bytes32(0);
        zeros.push(currentZero);
        for (uint32 i = 0; i < levels_; i++) {
            filledSubtrees[i] = currentZero;
            currentZero = hashLeftRight(currentZero, currentZero);
            zeros.push(currentZero);
        }
        // Root of the empty tree is the all-zero subtree root of height `levels`.
        roots[0] = currentZero;
    }

    /// @notice Hash two 32-byte words as an internal Merkle node. Public so off-chain
    ///         clients can replicate the exact construction.
    function hashLeftRight(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return sha256(abi.encodePacked(left, right));
    }

    /// @dev Append `leaf`, recompute the path to the root, push the new root into history.
    /// @return index The leaf index occupied by `leaf`.
    function _insert(bytes32 leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        if (_nextIndex == uint32(1) << levels) revert TreeFull();

        uint32 currentIndex = _nextIndex;
        bytes32 currentHash = leaf;
        bytes32 left;
        bytes32 right;

        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                // We are the left child; the right sibling is still empty.
                left = currentHash;
                right = zeros[i];
                filledSubtrees[i] = currentHash;
            } else {
                // We are the right child; the left sibling is the last filled node.
                left = filledSubtrees[i];
                right = currentHash;
            }
            currentHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }

        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    /// @notice The most recently computed root.
    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }

    /// @notice True if `root` is within the retained history window (and non-zero).
    function isKnownRoot(bytes32 root) public view returns (bool) {
        if (root == bytes32(0)) return false;
        uint32 _currentRootIndex = currentRootIndex;
        uint32 i = _currentRootIndex;
        do {
            if (root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != _currentRootIndex);
        return false;
    }
}
