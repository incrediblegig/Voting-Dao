https://github.com/Hacker-DAO/student.brianwatroba/tree/ec635f1db929e908f572d833fc5cd7739c77e2a7/dao

The following is a micro audit of git commit by ec635f1db929e908f572d833fc5cd7739c77e2a7 Melvillian

# General Comments

- Excellent detailed writeup of your voting mechanism and tradeoffs

- Good job on the tests; they are detailed and comprehensive. I especially like your `deploy` function and how it sets everything up nicely. You might have noticed your tests take forever to run, because they need to call `evm_mine` 80k times. I encourage you to check out [waffle's fixtures](https://ethereum-waffle.readthedocs.io/en/latest/fixtures.html) which use Hardhat's chain snapshotting logic to greatly speed up your tests

- For your next project (the LP one) I think you should setup an "advanced" hardhat project. When you run `npx hardhat` in the lp directory, do not select the "basic" one. This is going to setup a lot of helpful development tools that will give you more power to write and test your contracts. One thing you will definitely like is the `hardhat-gas-report` plugin, as well as the `solidity-coverage` plugin.

- One part of your voting system that is unclear to me is if you want to prevent executing the Proposal until the voting period has ended, or if you're OK with a proposal getting executed before the voting period ends. The way you've worded your variables makes me think you want to prevent voting until the period ends, but the way your `.state` code works, you return the `ProposalState.PASSED` case before the `ProposalState.ACTIVE`, which means a member is able to execute the proposal as soon as quorum is reached. This seems not good, because it unfairly favors DAO members who vote quickly and with the same `support` value. Normally you want the full voting period to elapse before determining the outcome

# Design Exercise


## Non-transitive

Spot on, I appreciate the detailed implementation notes in your response

## Transitive

> Transitive voting allows someone to lose the intention of their original delegation.
At first I was OK with this, but you have made me think about it more. Transitivity allows vote buying to get way out of hand, because it goes from an O(n) problem to an O(log(n)) problem for the "attacker" (the person who is trying to buy votes)

> Keeping a full historical record of delegations would be storage intensive.
Exactly, it would be, as the kids say, a Gascapalypse

- I understand what you're doing in line 43 with the `* 10`, you're using it as a scaling factor in order to make the rounding not as bad. But for an uninitiated reader this is going to be baffling. Do not use magic constants anywhere in your code. Make it a `constant` and add a `@dev` comment explaining why you're multiplying everything by 10

- Your Proposal struct could be optimized to use fewer storage slots. Right now you use `uint256` for 4 values

```solidity
    uint256 startBlock;
    uint256 endBlock;
    uint256 forVotes;
    uint256 againstVotes;
```

Do we really need 256 bits for all these values? Probably not. In fact you could use 1 storage slot instead of 4 by making `startBlock` a `uint48`, getting rid of `endBlock` (because you can always calculate it on the fly by doing `startBlock + VOTING_PERIOD_LENGTH`) and then make the `for/againstVotes` be `uint32`'s, assuming your NFT DAO is going to have fewer than ~4 billion people in it.

- I follow your reasoning for accepting a `bytes _signature` and calling `_splitSignature` inside, but I disagree with the reasoning. Yes, the interface will be more complex with 3 arguments (v, r, and s) instead of 1, but this is a standard interface that any frontend or API web3 dev would be familiar with, so they would know to split the signature offchain and pass in the correct v, r, and s. The increased gas costs are not worth the changed interface.

- this line of code confuses me:
`require((state(proposalId) == ProposalState.PASSED) && (state(proposalId) != ProposalState.EXECUTED), "Proposal must be passed and not executed");`
isn't the right-hand-side of the `&&` impossible if the left-hand-side is true? Why add that RHS?
# Issues
## issue-n

**[Low]** `DAO.state()` returns `EXPIRED` when no proposal exists for the given `_proposalId`

The function behaves unexpectedly when the Proposal doesn't exist; to me "EXPIRED" is not the same as "doesn't exist" and there should be an explicit `ProposalState` for this. Your `propose` functions handles this, but it has a subtle feature (bug?) which is that expired proposals are treated the same as non-existent proposals, and they are allowed to be overwritten. This sort of subtle bug is fine for now, but if later you were to make a change to the contract and forget about this, it might cause horrible vulns to arise. This sort of feature needs to be made more explicit.

**[Extra Features]** `Proposal.startBlock` is never assigned and never used

Smart contracts should have as simple data structures as are needed, and no less. This lack of `startBlock` won't affect security, but it is a waste of gas and it is needlessly extra.

**[Medium]** As soon as a Proposal reaches quorum and have `forVotes > againstVotes` (i.e. enters the `PASSED` state) it's possible for any address to call `.propose` with the same arguments as that Proposal and rewrite `Proposal.proposer` and `Proposal.endBlock`.

In `.propose` you have the following LOC (line of code) on line 68

`require((state(proposalId) != ProposalState.ACTIVE) && (state(proposalId) != ProposalState.EXECUTED), "Proposal already exists");`

this worried me from the start, because it doesn't cover all possible `ProposalState`s. This ends up being a bug, because since it doesn't check for `ProposalState.PASSED`, it means that if the Proposal has reached quorum and has forVotes > againstVotes, the `require` on line 68 will be `true`, and lines 69-73 will execute. AFAIK this only means `Proposal.proposer` and `Proposal.endBlock` can get overwritten, which doesn't affect the executability of the proposal since the `forVotes` and `againstVotes` remain. Still, this feels like a very lucky miss, and this would definitely appear on a security audit.

# Nitpicks

- Your `NftMarketplace.sol` would be better placed in a `contracts/test` directory, so its easy for auditors and readers to recognize that this code is not meant to be production code, but rather it is meant for testing. This is the conventional structure I've seen in the wild, so you should do it too.

- Instead of `80640`, you can do the more readable `2 weeks`.

# Score

| Reason | Score |
|-|-|
| Late                       | - |
| Unfinished features        | - |
| Extra features             | 1 |
| Vulnerability              | 3 |
| Unanswered design exercise | - |
| Insufficient tests         | - |
| Technical mistake          | - |

Total: 4
Nice job!
