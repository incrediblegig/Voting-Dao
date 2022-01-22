//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract DAO {
  string public constant name = "CollectorDAO";
  uint256 public constant PROPOSAL_MAX_OPERATIONS = 10; // cant have too many function calls
  uint256 public constant QUORUM_DIVISOR = 4; // 25%
  uint256 public constant VOTING_PERIOD_LENGTH = 80640; // two weeks
  uint256 public constant MEMBERSHIP_FEE = 1 ether;
  bytes32 public constant DOMAIN_TYPEHASH =
    keccak256(
      "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
    );
  bytes32 public constant VOTE_TYPEHASH =
    keccak256("Vote(uint256 proposalId,uint8 support)");
  mapping(uint256 => Proposal) public proposals;
  address[] public members;
  mapping(address => bool) public isMember;

  enum ProposalState {
    ACTIVE,
    PASSED,
    EXECUTED,
    EXPIRED
  }

  struct Proposal {
    uint256 id;
    address proposer;
    uint256 startBlock;
    uint256 endBlock;
    uint256 forVotes;
    uint256 againstVotes;
    bool executed;
    mapping(address => bool) hasVoted;
  }

  modifier onlyMember() {
    require(isMember[msg.sender] == true, "Not a member");
    _;
  }

  function state(uint256 _proposalId) public view returns (ProposalState) {
    Proposal storage proposal = proposals[_proposalId];
    if (proposal.executed) return ProposalState.EXECUTED;
    if (
      ((proposal.forVotes + proposal.againstVotes) * 10 >=
        (members.length * 10) / QUORUM_DIVISOR) &&
      proposal.forVotes > proposal.againstVotes
    )
      // multiplying by 10 to guard against solditiy rounding down
      return ProposalState.PASSED;
    if (block.number <= proposal.endBlock) {
      return ProposalState.ACTIVE;
    } else {
      return ProposalState.EXPIRED;
    }
  }

  function buyMembership() public payable {
    require(msg.value == MEMBERSHIP_FEE, "Fee must be exactly 1 ETH");
    require(isMember[msg.sender] != true, "Cannot already be a member");
    isMember[msg.sender] = true;
    members.push(msg.sender);
  }

  function propose(
    address[] memory _targets,
    uint256[] memory _values,
    bytes[] memory _calldatas,
    bytes32 _descriptionHash
  ) public onlyMember {
    require(
      _targets.length == _values.length && _targets.length == _calldatas.length,
      "function argument length mismatch"
    );
    require(_targets.length != 0, "must provide an action");
    require(_targets.length <= PROPOSAL_MAX_OPERATIONS, "too many actions");
    uint256 proposalId = hashProposal(
      _targets,
      _values,
      _calldatas,
      _descriptionHash
    );
    require(
      (state(proposalId) != ProposalState.ACTIVE) &&
        (state(proposalId) != ProposalState.EXECUTED),
      "Proposal already exists"
    );
    Proposal storage newProposal = proposals[proposalId];
    newProposal.id = proposalId;
    newProposal.proposer = msg.sender;
    newProposal.endBlock = block.number + VOTING_PERIOD_LENGTH;
  }

  function castVoteBySig(
    bytes memory _signature,
    address _signer,
    uint256 _proposalId,
    uint8 _support
  ) public returns (bool) {
    bool verified = verifyVote(_signature, _signer, _proposalId, _support);
    if (verified) return _recordVote(_proposalId, _signer, _support);
    return false;
  }

  // batch events
  function castVoteBySigBulk(
    bytes[] calldata _signatures,
    address[] calldata _signers,
    uint256 _proposalId,
    uint8[] calldata _supports
  ) public {
    for (uint256 i = 0; i < _signatures.length; i++) {
      castVoteBySig(_signatures[i], _signers[i], _proposalId, _supports[i]);
    }
  }

  function execute(
    address[] memory _targets,
    uint256[] memory _values,
    bytes[] memory _calldatas,
    bytes32 _descriptionHash
  ) external onlyMember {
    for (uint256 i = 0; i < _targets.length; i++) {
      uint256 proposalId = hashProposal(
        _targets,
        _values,
        _calldatas,
        _descriptionHash
      );

      require( // remove this require, add to error string
        (state(proposalId) == ProposalState.PASSED) &&
          (state(proposalId) != ProposalState.EXECUTED),
        "Proposal must be passed and not executed"
      );
      string memory errorMsg = "Call reverted without message";
      Proposal storage proposal = proposals[proposalId];
      proposal.executed = true;
      (bool success, bytes memory response) = _targets[i].call{
        value: _values[i]
      }(_calldatas[i]);
      if (success) {
        // We good
      } else if (response.length > 0) {
        assembly {
          let response_size := mload(response)
          revert(add(32, response), response_size)
        }
      } else {
        revert(errorMsg);
      }
    }
  }

  function verifyVote(
    bytes memory _signature,
    address _signer,
    uint256 _proposalId,
    uint8 _support
  ) public view returns (bool) {
    bytes32 domainSeparator = keccak256(
      abi.encode(
        DOMAIN_TYPEHASH,
        keccak256(bytes(name)),
        _getChainId(),
        address(this)
      )
    );
    bytes32 structHash = keccak256(
      abi.encode(VOTE_TYPEHASH, _proposalId, _support)
    );
    bytes32 digest = keccak256(
      abi.encodePacked("\x19\x01", domainSeparator, structHash)
    );
    (bytes32 r, bytes32 s, uint8 v) = _splitSignature(_signature);
    address signatory = ecrecover(digest, v, r, s);
    bool verified = signatory == _signer;
    return verified;
  }

  function _recordVote(
    uint256 _proposalId,
    address _voter,
    uint8 _support
  ) internal returns (bool) {
    Proposal storage proposal = proposals[_proposalId];
    if (state(_proposalId) != ProposalState.ACTIVE) return false; // not active
    if (!isMember[_voter]) return false; // not a member
    if (proposal.hasVoted[_voter]) return false; // already voted
    proposal.hasVoted[_voter] = true;
    if (_support == 1) {
      proposal.forVotes++;
    } else {
      proposal.againstVotes++;
    }
    return true;
  }

  function hashProposal(
    address[] memory _targets,
    uint256[] memory _values,
    bytes[] memory _calldatas,
    bytes32 _descriptionHash
  ) public pure virtual returns (uint256) {
    return
      uint256(
        keccak256(abi.encode(_targets, _values, _calldatas, _descriptionHash))
      );
  }

  function _getChainId() internal view returns (uint256) {
    uint256 chainId;
    assembly {
      chainId := chainid()
    }
    return chainId;
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
