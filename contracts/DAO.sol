//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract DAO {
  string public constant name = "Collector DAO";
  uint256 public constant PROPOSAL_MAX_OPERATIONS = 10; // cant have too many function calls
  uint256 public constant QUORUM_DIVISOR = 4; // 25%
  uint256 public constant VOTING_PERIOD_LENGTH = 80640; // two weeks
  uint256 public constant VOTING_DELAY_LENGTH = 1;
  uint256 public constant MEMBERSHIP_FEE = 1 ether;
  bytes32 public constant DOMAIN_TYPEHASH =
    keccak256(
      "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
    );
  bytes32 public constant VOTE_TYPEHASH =
    keccak256("Vote(uint256 proposalId,uint256 nonce)");
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
      return ProposalState.PASSED;
    if (block.number <= proposal.endBlock) {
      return ProposalState.ACTIVE;
    } else {
      return ProposalState.EXPIRED;
    }
  }

  function buyMembership() public payable {
    require(msg.value == MEMBERSHIP_FEE, "Fee must be exactly 1 ETH");
    require(members[msg.sender] != true, "Cannot already be a member");
    members[msg.sender] = true;
    // have state variable for balance?
  }

  function propose(
    address[] memory _targets,
    uint256[] memory _values,
    string[] memory _signatures,
    bytes[] memory _calldatas
  ) public onlyMember returns (uint256) {
    require(
      _targets.length == _values.length &&
        _targets.length == _signatures.length &&
        _targets.length == _calldatas.length,
      "function argument length mismatch"
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
    return newProposal.id;
  }

  // function castVoteBySig(
  //   uint256 _proposalId,
  //   bytes memory _signature,
  //   address _signer,
  //   uint256 _nonce
  // ) public isActive(_proposalId) {
  //   bool verified = verifyVote(_signature, _signer, _proposalId, _nonce);
  //   if (verified) _recordVote(_proposalId, _signer, _nonce);
  // }

  // batch events
  // function castVoteBySigBulk(
  //   bytes[] memory _signatures,
  //   address[] memory _signers,
  //   uint256 _proposalId,
  //   uint256[] memory _nonces
  // ) public isActive(_proposalId) {
  //   for (uint256 i = 0; i < _signatures.length; i++) {
  //     bool verified = verifyVote(
  //       _signatures[i],
  //       _signers[i],
  //       _proposalId,
  //       _nonces[i]
  //     );
  //     if (verified) _recordVote(_proposalId, _signers[i], _nonces[i]);
  //   }
  // }

  function execute(uint256 _proposalId) external onlyMember {
    require(
      state(_proposalId) == ProposalState.PASSED,
      "Proposal must be passed and not already executed"
    );
    Proposal storage proposal = proposals[_proposalId];
    proposal.executed = true;
    for (uint256 i = 0; i < proposal.targets.length; i++) {
      (bool success, ) = proposal.targets[i].call{ value: proposal.values[i] }(
        abi.encodeWithSignature(proposal.signatures[i], proposal.calldatas[i])
      );
      // if (success) do something
    }
  }

  function verifyVote(
    bytes memory _signature,
    address _signer,
    uint256 _proposalId,
    uint256 _nonce
  ) public view returns (bool) {
    if (state(_proposalId) != ProposalState.ACTIVE) return false; // may not need this
    if (!members[_signer]) return false;
    if (!usedNonces[_nonce]) return false;
    bytes32 voteHash = keccak256(abi.encodePacked(_proposalId, _nonce));
    bytes32 ethHash = keccak256(
      abi.encodePacked("\x19Ethereum Signed Message:\n32", voteHash)
    );
    (bytes32 r, bytes32 s, uint8 v) = _splitSignature(_signature);
    address signatory = ecrecover(ethHash, v, r, s);
    bool verified = signatory == _signer;
    return verified;
  }

  function _recordVote(
    uint256 _proposalId,
    address _member,
    uint256 _nonce
  ) internal {
    Proposal storage proposal = proposals[_proposalId];
    if (voteRecord[_proposalId][_member]) return; // already voted
    voteRecord[_proposalId][_member] = true;
    usedNonces[_nonce] = true;
    proposal.voteCount++;
  }

  function _splitSignature(bytes memory sig)
    internal
    pure
    returns (
      bytes32 r,
      bytes32 s,
      uint8 v
    )
  {
    require(sig.length == 65, "invalid signature length");
    assembly {
      r := mload(add(sig, 32))
      s := mload(add(sig, 64))
      v := byte(0, mload(add(sig, 96)))
    }
  }
}
