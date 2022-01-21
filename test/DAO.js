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
  let messageHash;
  let messageBinary;
  let ethHash;
  let voteSig;

  let value = {
    proposalId: 0,
    nonce: 0,
    previousNonce: 0,
  };

  const etherToWei = (num) => {
    return ethers.utils.parseUnits(num.toString(), "ether");
  };

  const deploy = async ({
    withMembers,
    withProposal,
    withSignedVote,
    proposalActive,
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
    // domain.verifyingContract = contract.address;
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
    if (withProposal) {
      await contract
        .connect(member)
        .propose(
          [addr1.address],
          [20],
          [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
          [ethers.utils.randomBytes(32)]
        );
      value = {
        proposalId: 1,
        nonce: await member.getTransactionCount(),
      };
    }
    if (withSignedVote) {
      messageHash = ethers.utils.solidityKeccak256(
        ["uint", "uint"],
        [value.proposalId, value.nonce]
      );
      messageBinary = ethers.utils.arrayify(messageHash);
      voteSig = await member.signMessage(messageBinary);
    }
    if (proposalActive) {
      const beforeBlock = await ethers.provider.getBlock();
      const beforeStatus = await contract.state(1);
      await network.provider.send("evm_increaseTime", [3600]);
      await network.provider.send("evm_mine");
      await network.provider.send("evm_increaseTime", [3600]);
      await network.provider.send("evm_mine");
      const afterBlock = await ethers.provider.getBlock();
      const afterStatus = await contract.state(1);
    }
  };

  describe("buyMembership()", () => {
    before(async () => await deploy({}));
    describe("Success:", async () => {
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
    before(async () => await deploy({ withMembers: true }));
    describe("Fails if:", async () => {
      it("Tries to buy more than once per address", async () => {
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
    beforeEach(async () => await deploy({ withMembers: true }));
    describe("Success:", async () => {
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

  describe("_verifyVote()", () => {
    describe("Success:", async () => {
      before(
        async () =>
          await deploy({
            withMembers: true,
            withProposal: true,
            withSignedVote: true,
            proposalActive: true,
          })
      );
      it("Given same inputs, outputs match", async () => {
        expect(
          await contract
            .connect(member)
            .verifyVote(voteSig, member.address, value.proposalId, value.nonce)
        ).to.be.true;
      });
      it("Given different inputs, outputs differ", async () => {
        expect(
          await contract
            .connect(member)
            .verifyVote(
              voteSig,
              member.address,
              value.proposalId,
              value.nonce + 1
            )
        ).to.be.false;
      });
    });

    // describe("Returns false if:", async () => {
    //   before(
    //     async () =>
    //       await deploy({
    //         withMembers: true,
    //         withProposal: true,
    //         withSignedVote: true,
    //       })
    //   );
    //   it("Proposal not active", async () => {
    //     expect(
    //       await contract
    //         .connect(member)
    //         .verifyVote(voteSig, member.address, value.proposalId, value.nonce)
    //     ).to.be.false;
    //   });
    //   it("Proposal not active", async () => {
    //     expect(
    //       await contract
    //         .connect(member)
    //         .verifyVote(voteSig, member.address, value.proposalId, value.nonce)
    //     ).to.be.false;
    //   });
    // before(
    //   async () =>
    //     await deploy({
    //       withMembers: true,
    //       withProposal: true,
    //       withSignedVote: true,
    //       proposalActive: true,
    //     })
    //);
    // it("Nonce already used", async () => {
    //   expect(
    //     await contract
    //       .connect(member)
    //       .verifyVote(voteSig, member.address, value.proposalId, value.nonce)
    //   ).to.be.true;
    //   expect(
    //     await contract
    //       .connect(member)
    //       .verifyVote(voteSig, member.address, value.proposalId, value.nonce)
    //   ).to.be.false;
    // });
    // });
  });
});
