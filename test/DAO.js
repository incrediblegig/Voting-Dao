const { expect } = require("chai");
const { network } = require("hardhat");

describe("DAO Contract", () => {
  let contract;
  let marketplace;
  let member;
  let member2;
  let member3;
  let member4;
  let member5;
  let member6;
  let nonMember;
  let arbitraryAddr = "0xd115bffabbdd893a6f7cea402e7338643ced44a6";
  let proposalId;
  let proposalArgs;
  let proposalArgs2;
  let signature;
  let signature2;
  let signature3;
  let signature4;
  let signature5;
  let signature6;
  let signatureNonMember;
  let domain = {
    name: "CollectorDAO",
    chainId: network.config.chainId,
    verifyingContract: "",
  };
  let types = {
    Vote: [
      { name: "proposalId", type: "uint256" },
      { name: "support", type: "uint8" },
    ],
  };
  let value = { proposalId: 0, support: 1 };

  const etherToWei = (num) => {
    return ethers.utils.parseUnits(num.toString(), "ether");
  };

  const deploy = async ({
    withMembers,
    withProposal,
    withSignedVote,
    proposalInactive,
  }) => {
    contract = await (await ethers.getContractFactory("DAO")).deploy();
    await contract.deployed();
    marketplace = await (
      await ethers.getContractFactory("NftMarketplace")
    ).deploy();
    await marketplace.deployed();

    domain.verifyingContract = contract.address;

    proposalArgs = [
      [marketplace.address],
      [1],
      [
        marketplace.interface.encodeFunctionData("buy", [
          "0xd115bffabbdd893a6f7cea402e7338643ced44a6",
          12345,
        ]),
      ],
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Buying NFT")),
    ];
    proposalArgs2 = [
      [marketplace.address],
      [0],
      [
        marketplace.interface.encodeFunctionData("getPrice", [
          "0xd115bffabbdd893a6f7cea402e7338643ced44a6",
          12345,
        ]),
      ],
      ethers.utils.keccak256(ethers.utils.toUtf8Bytes("Checking NFT price")),
    ];
    [member, member2, member3, member4, member5, member6, nonMember] =
      await ethers.getSigners();
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
      await contract.connect(member6).buyMembership({
        value: etherToWei(1),
      });
    }
    if (withProposal) {
      await contract.connect(member).propose(...proposalArgs);
      proposalId = await contract.hashProposal(...proposalArgs);
      value.proposalId = proposalId;
    }
    if (withSignedVote) {
      signature = await member._signTypedData(domain, types, value);
      signature2 = await member2._signTypedData(domain, types, value);
      signature3 = await member3._signTypedData(domain, types, value);
      signature4 = await member4._signTypedData(domain, types, value);
      signature5 = await member5._signTypedData(domain, types, value);
      signature6 = await member6._signTypedData(domain, types, value);
      signatureNonMember = await nonMember._signTypedData(domain, types, value);
    }
    if (proposalInactive) {
      for (i = 0; i < 80642; i++) {
        await network.provider.send("evm_mine");
      }
    }
  };

  describe("buyMembership()", () => {
    describe("Success:", () => {
      beforeEach(async () => {
        await deploy({});
      });
      it("Sends ETH correctly, marks sender as member", async () => {
        const isMemberBefore = await contract.isMember(nonMember.address);
        expect(isMemberBefore).to.be.false;
        await expect(() =>
          contract.connect(nonMember).buyMembership({
            value: etherToWei(1),
          })
        ).to.changeEtherBalances(
          [nonMember, contract],
          [etherToWei(-1), etherToWei(1)]
        );
        const isMemberAfter = await contract.isMember(nonMember.address);
        expect(isMemberAfter).to.be.true;
      });
    });
    describe("Fails if:", () => {
      beforeEach(async () => {
        await deploy({ withMembers: true });
      });
      it("Tries to buy more than once per address", async () => {
        await expect(
          contract.connect(member).buyMembership({
            value: etherToWei(1),
          })
        ).to.be.revertedWith("Cannot already be a member");
      });
      it("Fee isn't exactly 1 ETH", async () => {
        await expect(
          contract.connect(nonMember).buyMembership({
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
        proposalId = await contract
          .connect(member)
          .hashProposal(...proposalArgs);
        const proposalExistsBefore = await contract.proposals(proposalId);
        expect(proposalExistsBefore.id).to.deep.equal(0);
        const res = await contract.connect(member).propose(...proposalArgs);
        const proposalExistsAfter = await contract.proposals(proposalId);
        expect(proposalExistsAfter.id).to.equal(proposalId);
      });
    });
    describe("Fails if:", async () => {
      beforeEach(async () => await deploy({ withMembers: true }));
      it("Called by a nonmember", async () => {
        await expect(
          contract.connect(nonMember).propose(...proposalArgs)
        ).to.be.revertedWith("Not a member");
      });

      it("All arguments are not same length", async () => {
        proposalArgs = [
          [marketplace.address, nonMember.address],
          [0],
          [
            marketplace.interface.encodeFunctionData("getPrice", [
              "0xd115bffabbdd893a6f7cea402e7338643ced44a6",
              12345,
            ]),
          ],
          ethers.utils.keccak256(
            ethers.utils.toUtf8Bytes("Checking NFT price")
          ),
        ];
        await expect(
          contract.connect(member).propose(...proposalArgs)
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
            withProposal: true,
            withSignedVote: true,
          })
      );
      it("Given same inputs, outputs match", async () => {
        expect(
          await contract
            .connect(member)
            .verifyVote(signature, member.address, proposalId, 1)
        ).to.be.true;
      });
    });
    describe("Returns false:", async () => {
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withProposal: true,
            withSignedVote: true,
          })
      );
      it("If given different inputs, outputs differ", async () => {
        expect(
          await contract
            .connect(member)
            .verifyVote(signature, nonMember.address, proposalId, 1)
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
            withProposal: true,
            withSignedVote: true,
          })
      );
      it("Records vote for verified signature", async () => {
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          0
        );
        await contract
          .connect(member)
          .castVoteBySig(signature, member.address, proposalId, 1);
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          1
        );
      });
    });

    describe("Does not record vote if:", async () => {
      it.skip("Proposal not active", async () => {
        await deploy({
          withMembers: true,
          withProposal: true,
          withSignedVote: true,
          proposalInactive: true,
        });
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          0
        );

        await contract
          .connect(member)
          .castVoteBySig(signature, member.address, proposalId, 1);
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          0
        );
      });
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withSignedVote: true,
            withProposal: true,
          })
      );
      it("Not a member", async () => {
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          0
        );
        await contract
          .connect(nonMember)
          .castVoteBySig(signatureNonMember, nonMember.address, proposalId, 1);
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          0
        );
      });
      it("Already voted", async () => {
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          0
        );
        await contract
          .connect(member)
          .castVoteBySig(signature, member.address, proposalId, 1);
        await contract
          .connect(member)
          .castVoteBySig(signature, member.address, proposalId, 1);
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          1
        );
      });
    });
  });
  describe("castVoteBySigBulk()", () => {
    describe("Success:", async () => {
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withProposal: true,
            withSignedVote: true,
          })
      );
      it("Records multiple votes for correct hashes, skips incorrect", async () => {
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          0
        );
        // first = correct, second = not member, third = wrong signature, fourth = correct
        await contract.castVoteBySigBulk(
          [signature, signatureNonMember, signature3, signature4],
          [member.address, nonMember.address, member2.address, member4.address],
          proposalId,
          [1, 1, 1, 1]
        );
        expect((await contract.proposals(proposalId)).forVotes).to.deep.equal(
          2
        );
      });
    });
  });
  describe("execute()", () => {
    describe("Success:", async () => {
      beforeEach(
        async () =>
          await deploy({
            withMembers: true,
            withProposal: true,
            withSignedVote: true,
          })
      );
      it("Makes arbitrary external calls, can buy NFT", async () => {
        await contract.castVoteBySigBulk(
          [signature, signatureNonMember, signature3, signature4],
          [member.address, nonMember.address, member2.address, member4.address],
          proposalId,
          [1, 1, 1, 1]
        );
        await expect(
          await contract.connect(member).execute(...proposalArgs)
        ).to.changeEtherBalance(contract, -1);
      });
    });
  });
});
