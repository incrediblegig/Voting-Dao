//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract DAO {
  uint256 public constant PROPOSAL_MAX_OPERATIONS = 10; // cant have too many function calls
  uint256 public constant QUORUM_DIVISOR = 4; // 25%
  uint256 public constant VOTING_PERIOD_LENGTH = 80640; // two weeks
  uint256 public constant VOTING_DELAY_LENGTH = 1;
  uint256 public constant MEMBERSHIP_FEE = 1 ether;
  uint256 public proposalCount;
  mapping(uint256 => Proposal) public proposals;
  uint256 public memberCount;
  mapping(address => bool) public members;
  mapping(uint256 => bool) private usedNonces;
  enum ProposalState {
    PENDING,
    ACTIVE,
    CANCELED,
    DEFEATED,
    SUCCEEDED,
    QUEUED,
    EXPIRED,
    EXECUTED
  }

  struct Proposal {
    uint256 id;
    address proposer;
    address[] targets;
    uint256[] values;
    string[] signatures;
    bytes32[] calldatas;
    uint256 startBlock;
    uint256 endBlock;
    uint256 totalVotes;
    mapping(address => bool) alreadyVoted;
    bool canceled;
    bool executed;
  }

  modifier onlyMember() {
    require(members[msg.sender] == true, "Not a member");
    _;
  }

  modifier isActive(uint256 proposalId) {
    // require check state returns active;
    _;
  }

  function state(uint256 proposalId) public view returns (ProposalState) {
    Proposal storage proposal = proposals[proposalId];
    if (proposal.canceled) {
      return ProposalState.Canceled;
    } else if (block.number <= proposal.startBlock) {
      return ProposalState.Pending;
    } else if (block.number <= proposal.endBlock) {
      return ProposalState.Active;
    } else if (
      proposal.forVotes <= proposal.againstVotes ||
      proposal.forVotes < quorumVotes
    ) {
      return ProposalState.Defeated;
    } else if (proposal.eta == 0) {
      return ProposalState.Succeeded;
    } else if (proposal.executed) {
      return ProposalState.Executed;
    } else if (
      block.timestamp >= add256(proposal.eta, timelock.GRACE_PERIOD())
    ) {
      return ProposalState.Expired;
    } else {
      return ProposalState.Queued;
    }
  }

  function buyMembership() external payable {
    require(msg.value == MEMBERSHIP_FEE, "Fee is exactly 1 ETH");
    require(members[msg.sender] != true, "Cannot already be a member");
    members[msg.sender] = true;
    // have state variable for balance?
  }
}
