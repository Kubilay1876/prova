// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PROVA report registry (narrow, custom; NOT an ERC-8004 Validation Registry)
/// @notice Anchors the sha256 of a frozen PROVA report together with the candidate version and
///         test-suite hashes. Only the fixed recorder (the deployer) can write. A record proves which
///         file was registered and by whom; it does not prove the exam ran correctly.
contract ProvaReportRegistry {
    address public immutable recorder;

    /// @dev Field names match what the web verifier decodes.
    event ReportRecorded(
        bytes32 indexed reportHash,
        bytes32 candidateVersionHash,
        bytes32 suiteHash,
        address indexed recorder
    );

    /// @notice Block number at which a report hash was recorded (0 = never).
    mapping(bytes32 => uint256) public recordedAt;

    constructor() {
        recorder = msg.sender;
    }

    function record(bytes32 reportHash, bytes32 candidateVersionHash, bytes32 suiteHash) external {
        require(msg.sender == recorder, "not recorder");
        require(reportHash != bytes32(0), "empty hash");
        require(recordedAt[reportHash] == 0, "already recorded");
        recordedAt[reportHash] = block.number;
        emit ReportRecorded(reportHash, candidateVersionHash, suiteHash, msg.sender);
    }
}
