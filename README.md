# Collector DAO ⚖️

DAO to propose, vote on, and purchase NFTs for community ownership. Deployed to Ethereum testnet (Rinkeby).

## Features

- **Proposal submission:** DAO members can submit proposals. proposals have four states - ACTIVE, PASSED, EXECUTED, and EXPIRED. Proposals must include function calls to execute once passed (max of 10).
- **Two week voting period:** proposals can be voted on for ~two weeks (measured by block number), and are EXPIRED after this time.
- **Members can vote either "for" or "against":** Votes are accepted via signature (EIP712), either individually or in bulk.
- **Passing proposals:** occurs when 1) 25% of current members have voted AND 2) "for" votes outnumber "against" votes.
- **Executing proposals:** once a proposal is passed, any member can call execute(). The proposal's functions are then called.

## Contract adddresses (Rinkeby test)

- _DAO.sol:_ `0x4D5Cf0c3FA910B99A6fF740e0F2aec2590882772`

## Local setup

1. Clone repository: `git clone https://github.com/brianwatroba/collector-dao.git`
2. Install base project dependencies: cd into root, run `npm install`
3. Add local .env file to project root. Include below env variables (replace keys with your own):

```bash
/.env

ALCHEMY_API_KEY=XXX
RINKEBY_PRIVATE_KEY=xxx
```

## Usage

1. Front end (on localhost): currently does not have a web front end. Contract interaction must happen directly.
2. Local testing: tests written in Chai/Mocha using Hardhat/Ethers.js. Run `npx hardhat test` for test suite.
3. Deployment to Rinkeby: ensure your .env file includes your Rinkeby private key. Then run `npx hardhat run scripts/deploy.js --network rinkeby`. Deploy script only deploys the ProjectFactory.sol contract.
4. Deployment to other test nets: add your desired network to the `networks` object in `hardhat-config.js` using the following format:

```javascript
/hardhat.config.js

rinkeby: {
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      accounts: [`${process.env.RINKEBY_PRIVATE_KEY}`],
    },
```

## Contributing

Pull requests are welcome. Feel free to use this project as reference or for learning! It helped me a lot to better understand how to implement a basic DAO and the tradeoffs of different voting mechanisms. Thanks!

## License

[MIT](https://choosealicense.com/licenses/mit/)
