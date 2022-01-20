const { expect } = require("chai");
const hre = require("hardhat");

describe("DAO Contract", () => {
  let contractFactory;
  let contract;
  let proposer;
  let member;
  let nonMember;
  let addr1;
  let addr2;
  let addr3;
  let voteSig;
  let domain = {
    name: "Collector DAO",
    chainId: hre.network.config.chainId,
    verifyingContract: "", // set on deploy function
  };
  let types = {
    Vote: [
      { name: "proposalId", type: "uint256" },
      { name: "nonce", type: "uint256" },
    ],
  };
  let value = {
    proposalId: 0,
    nonce: 0,
  };

  const etherToWei = (num) => {
    return ethers.utils.parseUnits(num.toString(), "ether");
  };

  const deploy = async ({ withMember, withProposal, withSignedVote }) => {
    contractFactory = await ethers.getContractFactory("DAO");
    contract = await contractFactory.deploy();
    await contract.deployed();
    [proposer, member, nonMember, addr1, addr2, addr3] =
      await ethers.getSigners();
    domain.verifyingContract = contract.address;
    if (withMember) {
      await contract.connect(member).buyMembership({
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
      voteSig = await member._signTypedData(domain, types, value);
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
    before(async () => await deploy({ withMember: true }));
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
    beforeEach(async () => await deploy({ withMember: true }));
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
    beforeEach(
      async () =>
        await deploy({
          withMember: true,
          withProposal: true,
          withSignedVote: true,
        })
    );
    describe("Success:", async () => {
      it("Given inputs, hashes/decodes to output", async () => {
        const res = await contract
          .connect(member)
          .verifyVote(voteSig, member.address, value.proposalId, value.nonce);
        console.log(res);
        console.log(voteSig);
      });
    });
    describe("Returns false if:", async () => {
      it("Proposal not active", async () => {
        // await expect().to.be.false;
        // contract
        //   .connect(addr1)
        //   .propose(
        //     [addr1.address],
        //     [20],
        //     [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
        //     [ethers.utils.randomBytes(32)]
        //   )
      });
      it("Nonce already used", async () => {
        // await expect().to.be.false;
        // contract
        //   .connect(member)
        //   .propose(
        //     [addr1.address],
        //     [20, 22],
        //     [ethers.utils.formatBytes32String("contribute(uint256 _amount)")],
        //     [ethers.utils.randomBytes(32)]
        //   )
      });
    });
  });
});
