# Week 3 Project: DAO

#### _Brian Watroba, Block 3_

### NOTES ON PROJECT CODE:

- **Submitting late:** thanks to the instruction team for letting me submit late. I was pretty absent this week--my brother was in the hopsital for a serious COVID case, I couldn't do work most of the week. Thankfully he's now been released and is stable. Appreciate the support and flexibility from the community, means a lot.
- **Yes, I saw the solution:** because I submitted late I did see the solution. I used it to learn and included a few design patterns, but the majority of this code is mine from before.
- **`state()` function:** it may feel superfluous to have this, but I felt it's necessary for members to be able to easily see the state of a proposal without having to lookup a Proposal struct and run logic on it. Also makes it cleaner to read in my opinion.
- **`verifyVote():` signature instead of v, r, and s:** This pattern felt more intuitive to me. If signing votes is happening off-chain, it's simplest to provide that siganture as an input rather than decode it before calling the contract.
- **`_recordVote():` returning bools vs. strings** the string pattern (from solution) does seem cleaner, but I'm honoring my original decision to use bools to keep this as original to my thinking as possible (it's what I did pre solution).
- **Implemented EIP712, but without inheritance**: this was fun, and I learned a lot doing it. Getting hashes to match up in ethers.js and solidity is quite the trip!
- **Votes can only be submitted by signature:** for consistency I didn't include a voting option that is validated by msg.sender.
- **Vote events only emitted once recorded:** vote record is a more significant event than vote casting (which could be an invalid signature/vote). I didn't wany any external confusion on what a recorded vs. casted vote was. It would have been more gas efficient to emit one event on bulk counting, but I wanted to keep things consistent and only require users to listen to a single event to get a proposal's state.

### VOTING SYSTEM:

**How it works:**

- DAO members can submit proposals
- Proposals can have four states: `ACTIVE`, `PASSED`, `EXECUTED`, and `EXPIRED`. Proposals must include function calls to execute once `passed` (max of 10).
- Valid proposals are `ACTIVE` immediately. They can be voted on for ~two weeks (measured by block number), and are `EXPIRED` after this time.
- Members can vote either "for" or "against" on an `ACTIVE` proposal. Votes are accepted via signature, either individually or in bulk.
- Proposal is `PASSED` when 1) 25% of current members have voted AND 2) "for" votes outnumber "against" votes.
- Once a proposal is passed, any member can call `execute()`. The proposal's functions are then called.

**Tradeoffs and rationale:**

- **No "abstain" vote option:** a quorum should represent a minimum acceptable participation level. I believe "for" or "against" opinions are strongest and should drive whether a proposal is passed. A proposal that reaches quorum with almost all "abstain" votes but only a "few" for votes doesn't have high enough conviction to pass.
- **One "member", one vote:** theoretically someone could create a lot of new addresses, become members, and have outweighed influence on voting. This is hard to control for without limiting members to a specified whitelist at deployment. I'm ok with this tradeoff for both simplicity and clarity in the scope of this assignment.
- **No vote ties:** "passing" is a positive state. It means "majority" by definition. For this reason, I didn't honor ties, and considered a tie as NOT passing.
- **Quorum % and proposal voting period are fixed:** I did this to appeal directly to the spec. It called for a single DAO contract, not a factory/contract to inherit from.

### DESIGN EXERCISE 1:

**_Prompt:_** _Per project specs, there is no vote delegation. This means for someone's vote to count, they must manually participate every time. How would you design your contract to allow for non-transitive vote delegation?_

**Answer:**

- Use a similar pattern to Compound Comp contract
- Keep record of delegates and if someone has already delegated. Use two mappings: one to keep track of delegation (address => address), and another to keep track of if an address has already been delegated (address => bool)
- Include a `delegateBySig()` function that verifies a delegation signature via EIP712 and calls an internal function (`_delegate`) to delegate someone's vote and update contract mappings.
- In my `delegateBySig()` function, add a require check to ensure an address hasn't already been delegated

### DESIGN EXERCISE 2:

**_Prompt:_** _What are some problems with implementing transitive vote delegation on-chain? (Transitive means: If A delegates to B, and B delegates to C, then C gains voting power from both A and B, while B has no voting power)._

**Answer:**

- Transitive voting allows someone to lose the intention of their original delegation. If I delegate my vote to someone I support, and they in turn delegate my vote to someone I don't necessarily support, my opinions aren't represented the way I'd hope they are. I would want to implement a way to revoke a delegation, even if it has been passed on transitively.
- Keeping a full historical record of delegations would be storage intensive. For each person (address), you'd need to keep an ordered list of which people (addresses) they had delegated to.
