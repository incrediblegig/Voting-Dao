//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract DAO {
  uint256 public constant PROPOSAL_MAX_OPERATIONS = 10; // cant have too many function calls
  uint256 public constant QUORUM_DIVISOR = 4; // 25%
  uint256 public constant VOTING_PERIOD_LENGTH = 80640; // two weeks
  uint256 public constant VOTING_DELAY_LENGTH = 1;
  uint256 public constant MEMBERSHIP_FEE = 1 ether;
  uint256 proposalCount = 1;
  mapping(uint256 => Proposal) public proposals;
  uint256 public memberCount;
  mapping(address => bool) public members;
  mapping(uint256 => mapping(address => bool)) public voteRecord;
  mapping(uint256 => bool) private usedNonces;

  enum ProposalState {
    PENDING,
    ACTIVE,
    CANCELED,
    DEFEATED,
    PASSED,
    QUEUED,
    EXECUTED,
    EXPIRED
  }

  struct Proposal {
    uint256 id;
    address proposer;
    address[] targets;
    uint256[] values;
    string[] signatures;
    bytes[] calldatas;
    uint256 startBlock;
    uint256 endBlock;
    uint256 voteCount;
    bool canceled;
    bool executed;
  }

  modifier onlyMember() {
    require(members[msg.sender] == true, "Not a member");
    _;
  }

  modifier isActive(uint256 proposalId) {
    require(state(proposalId) == ProposalState.ACTIVE, "Proposal not active");
    _;
  }

  function state(uint256 _proposalId) public view returns (ProposalState) {
    Proposal storage proposal = proposals[_proposalId];
    if (proposal.canceled) return ProposalState.CANCELED;
    if (proposal.executed) return ProposalState.EXECUTED;
    if (block.number <= proposal.startBlock) return ProposalState.PENDING;
    if (proposal.voteCount >= memberCount / QUORUM_DIVISOR)
      return ProposalState.PASSED; // issue: can keep increasing ceiling to not pass
    if (block.number <= proposal.endBlock) {
      return ProposalState.ACTIVE;
    } else {
      return ProposalState.EXPIRED;
    }
  }

  function buyMembership() public payable {
    require(msg.value == MEMBERSHIP_FEE, "Fee is exactly 1 ETH");
    require(members[msg.sender] != true, "Cannot already be a member");
    members[msg.sender] = true;
    // have state variable for balance?
    // emit event
  }

  function propose(
    address[] memory _targets,
    uint256[] memory _values,
    string[] memory _signatures,
    bytes[] memory _calldatas
  ) public onlyMember {
    require(
      _targets.length == _values.length &&
        _targets.length == _signatures.length &&
        _targets.length == _calldatas.length,
      "function parameter length mismatch"
    );
    require(_targets.length != 0, "must provide an action");
    require(_targets.length <= PROPOSAL_MAX_OPERATIONS, "too many actions");
    Proposal memory newProposal = Proposal({
      id: proposalCount++,
      proposer: msg.sender,
      targets: _targets,
      values: _values,
      signatures: _signatures,
      calldatas: _calldatas,
      startBlock: block.number + VOTING_DELAY_LENGTH,
      endBlock: block.number + VOTING_PERIOD_LENGTH,
      voteCount: 0,
      canceled: false,
      executed: false
    });
    proposals[newProposal.id] = newProposal;
    // emit event
  }

  function hash() internal pure returns (bytes32) {
    // custom hash logic
  }

  function castVoteBySig(
    uint256 _proposalId,
    bytes32 _signature,
    address _signer,
    uint256 _nonce
  ) public isActive(_proposalId) {
    bool verified; // hash the right things
    if (verified) _recordVote(_proposalId, _signer);
  }

  function castVoteBySigBulk(
    bytes32[] memory _signatures,
    address[] memory _signers,
    uint256 _proposalId,
    uint256[] memory nonces
  ) public isActive(_proposalId) {
    for (uint256 i = 0; i < _signatures.length; i++) {
      bool verified; // hash the right things
      if (verified) _recordVote(_proposalId, _signers[i]);
    }
  }

  function _verifyVote(
    uint256 _proposalId,
    bytes32 _signature,
    address _signer,
    uint256 _nonce
  ) internal view returns (bool) {
    if (state(_proposalId) != ProposalState.ACTIVE) return false; // may not need this
    if (!members[_signer]) return false;
    if (!usedNonces[_nonce]) return false;
    bool verified; // hash the right things
    return verified;
  }

  function _recordVote(uint256 _proposalId, address _member) internal {
    Proposal storage proposal = proposals[_proposalId];
    if (voteRecord[_proposalId][_member]) return; // already voted
    voteRecord[_proposalId][_member] = true;
    proposal.voteCount++;
    // emit event
  }

  function execute(uint256 _proposalId) external onlyMember {
    require(
      state(_proposalId) == ProposalState.PASSED,
      "Proposal must be passed and not already executed"
    );
    Proposal storage proposal = proposals[_proposalId];
    proposal.executed = true;
    for (uint256 i = 0; i < proposal.targets.length; i++) {
      proposal.targets[i].call{ value: proposal.values[i] }(
        abi.encodeWithSignature(proposal.signatures[i], proposal.calldatas[i])
      );
      // revert whole thing if one call is wrong?
    }
    // emit event
  }

  function cancel(uint256 _proposalId) external {
    Proposal storage proposal = proposals[_proposalId];
    require(msg.sender == proposal.proposer, "Must be proposer to cancel");
    proposal.canceled = true;
    // emit event
  }

  // How to not repeat logic here?
  receive() external payable {
    require(msg.value == MEMBERSHIP_FEE, "Fee is exactly 1 ETH");
    require(members[msg.sender] != true, "Cannot already be a member");
    members[msg.sender] = true;
  }
}

// issues with my voting:
// Can buy mutliple addresses.
// Two weeks may not be enough time.
// Someone could keep creating accounts to delay, same as to vote

// hashed way of getting proposalId
// bytes32 proposalId = keccak256(
//   abi.encode(_targets, _values, _signatures, _calldatas)
// );
