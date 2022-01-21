const { expect } = require("chai");
const { network } = require("hardhat");
// const hre = require("hardhat");

describe("DAO Contract", () => {
  let contractFactory;
  let contract;
  let proposer;
  let member;
  let member2;
  let member3;
  let member4;
  let member5;
  let nonMember;
  let addr1;
  let addr2;
  let addr3;
  let proposalId;
  let voteSigs = {
    member: {
      signature: "",
      proposalId: 0,
      nonce: 0,
    },
    nonMember: {
      signature: "",
      proposalId: 0,
      nonce: 0,
    },
  };

  const etherToWei = (num) => {
    return ethers.utils.parseUnits(num.toString(), "ether");
  };

  const deploy = async ({
    withMembers,
    withProposalInactive,
    withProposalActive,
    withSignedVote,
  }) => {
    contractFactory = await ethers.getContractFactory("DAO");
    contract = await contractFactory.deploy();
    await contract.deployed();
    [
      proposer,
      member,
      member2,
      member3,
      member4,
      member5,
      nonMember,
      addr1,
      addr2,
      addr3,
    ] = await ethers.getSigners();
    if (withMembers) {
      await contract.connect(member).buyMembership({
        value: etherToWei(1),
      });
      await contract.connect(member2).buyMembership({
        value: etherToWei(1),
      });
      await contract.connect(member3).buyMembership({
        value: etherToWei(1),
      });
      await contract.connect(member4).buyMembership({
        value: etherToWei(1),
      });
      await contract.connect(member5).buyMembership({
        value: etherToWei(1),
      });
    }
    if (withProposalInactive) {
      await contract
        .connect(member)
        .propose(
          [addr1.address],
          [20],
          [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
          [ethers.utils.randomBytes(32)]
        );
      proposalId = 1;
      const block = await ethers.provider.getBlock();
    }
    if (withProposalActive) {
      await contract
        .connect(member)
        .propose(
          [addr1.address],
          [20],
          [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
          [ethers.utils.randomBytes(32)]
        );
      proposalId = 1;
      const beforeBlock = await ethers.provider.getBlock();
      const beforeStatus = await contract.state(1);
      await network.provider.send("evm_mine");
      await network.provider.send("evm_mine");
      await network.provider.send("evm_mine");
      const afterBlock = await ethers.provider.getBlock();
      const afterStatus = await contract.state(1);
    }
    if (withSignedVote) {
      const sign = async (proposalId, signer) => {
        const nonce = await signer.getTransactionCount();
        const messageHash = ethers.utils.solidityKeccak256(
          ["uint", "uint"],
          [proposalId, nonce]
        );
        const binaryHash = ethers.utils.arrayify(messageHash);
        return await signer.signMessage(binaryHash);
      };
      voteSigs = {
        member: {
          signature: await sign(proposalId, member),
          proposalId,
          nonce: await member.getTransactionCount(),
        },
        nonMember: {
          signature: await sign(proposalId, member),
          proposalId: 1,
          nonce: await nonMember.getTransactionCount(),
        },
      };
    }
  };

  describe("buyMembership()", () => {
    describe("Success:", async () => {
      beforeEach(async () => {
        await deploy({});
      });
      it("Sends ETH correctly, marks sender as member", async () => {
        const isMemberBefore = await contract.members(proposer.address);
        expect(isMemberBefore).to.be.false;
        await expect(() =>
          contract.connect(addr1).buyMembership({
            value: etherToWei(1),
          })
        ).to.changeEtherBalances(
          [addr1, contract],
          [etherToWei(-1), etherToWei(1)]
        );
        const isMemberAfter = await contract.members(addr1.address);
        expect(isMemberAfter).to.be.true;
      });
    });
    describe("Fails if:", async () => {
      await deploy({ withMembers: true });
      it("Tries to buy more than once per address", async () => {
        await deploy({});
        await expect(
          contract.connect(member).buyMembership({
            value: etherToWei(1),
          })
        ).to.be.revertedWith("Cannot already be a member");
      });
      it("Fee isn't exactly 1 ETH", async () => {
        await expect(
          contract.connect(addr1).buyMembership({
            value: etherToWei(2),
          })
        ).to.be.revertedWith("Fee must be exactly 1 ETH");
      });
    });
  });

  describe("propose()", () => {
    describe("Success:", async () => {
      beforeEach(async () => await deploy({ withMembers: true }));
      it("Saves new proposal to storage", async () => {
        const proposalExistsBefore = await contract.proposals(1);
        expect(proposalExistsBefore).to.not.false;
        await contract
          .connect(member)
          .propose(
            [addr1.address],
            [20],
            [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
            [ethers.utils.randomBytes(32)]
          );
        const proposalExistsAfter = await contract.proposals(1);
        expect(proposalExistsAfter).to.be.not.false;
      });
    });
    describe("Fails if:", async () => {
      beforeEach(async () => await deploy({ withMembers: true }));
      it("Called by a nonmember", async () => {
        await expect(
          contract
            .connect(nonMember)
            .propose(
              [nonMember.address],
              [20],
              [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
              [ethers.utils.randomBytes(32)]
            )
        ).to.be.revertedWith("Not a member");
      });
      it("All arguments are not same length", async () => {
        await expect(
          contract
            .connect(member)
            .propose(
              [addr1.address],
              [20, 22],
              [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
              [ethers.utils.randomBytes(32)]
            )
        ).to.be.revertedWith("function argument length mismatch");
      });
    });
  });

  describe("verifyVote()", () => {
    describe("Success:", async () => {
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withProposalActive: true,
            withSignedVote: true,
          })
      );
      it("Given same inputs, outputs match", async () => {
        const { signature, proposalId, nonce } = voteSigs.member;
        expect(
          await contract
            .connect(member)
            .verifyVote(signature, member.address, proposalId, nonce)
        ).to.be.true;
      });
    });
    describe("Returns false::", async () => {
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withProposalActive: true,
            withSignedVote: true,
          })
      );
      it("If given different inputs, outputs differ", async () => {
        const { signature, proposalId, nonce } = voteSigs.member;
        expect(
          await contract
            .connect(member)
            .verifyVote(signature, member.address, proposalId, nonce + 1)
        ).to.be.false;
      });
    });
  });
  describe("castVoteBySig()", () => {
    describe("Success:", async () => {
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withProposalActive: true,
            withSignedVote: true,
          })
      );
      it("Records vote for verified signature", async () => {
        const { signature, proposalId, nonce } = voteSigs.member;
        let proposal = await contract.proposals(1);

        const before = {
          proposal: proposal,
          voteCount: proposal.voteCount,
          inVoteRecord: await contract.voteRecord(1, member.address),
        };
        await contract
          .connect(member)
          .castVoteBySig(signature, member.address, proposalId, nonce);

        proposal = await contract.proposals(1);

        const after = {
          proposal: proposal,
          voteCount: proposal.voteCount,
          inVoteRecord: await contract.voteRecord(1, member.address),
        };
        expect(before.inVoteRecord).to.be.false;
        expect(before.voteCount).to.deep.equal(0);
        expect(after.voteCount).to.deep.equal(1);
        expect(after.inVoteRecord).to.be.true;
      });
    });

    describe("Does not record vote if:", async () => {
      it("Proposal not active", async () => {
        await deploy({
          withMembers: true,
          withProposalInactive: true,
          withSignedVote: true,
        });
        const { signature, proposalId, nonce } = voteSigs.member;
        let proposal = await contract.proposals(1);

        const before = {
          voteCount: proposal.voteCount,
          inVoteRecord: await contract.voteRecord(1, member.address),
        };

        await contract
          .connect(member)
          .castVoteBySig(signature, member.address, proposalId, nonce);

        proposal = await contract.proposals(1);

        const after = {
          voteCount: proposal.voteCount,
          inVoteRecord: await contract.voteRecord(1, member.address),
        };

        expect(before.inVoteRecord).to.be.false;
        expect(before.voteCount).to.deep.equal(0);
        expect(after.voteCount).to.deep.equal(0);
        expect(after.inVoteRecord).to.be.false;
      });
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withSignedVote: true,
            withProposalActive: true,
          })
      );
      it("Not a member", async () => {
        const { signature, proposalId, nonce } = voteSigs.nonMember;
        let proposal = await contract.proposals(1);

        const before = {
          voteCount: proposal.voteCount,
          inVoteRecord: await contract.voteRecord(1, nonMember.address),
        };

        await contract
          .connect(nonMember)
          .castVoteBySig(signature, nonMember.address, proposalId, nonce);

        proposal = await contract.proposals(1);

        const after = {
          voteCount: proposal.voteCount,
          inVoteRecord: await contract.voteRecord(1, nonMember.address),
        };

        expect(before.inVoteRecord).to.be.false;
        expect(before.voteCount).to.deep.equal(0);
        expect(after.voteCount).to.deep.equal(0);
        expect(after.inVoteRecord).to.be.false;
      });
    });
  });
});
