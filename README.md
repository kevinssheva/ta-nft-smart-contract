# NFT Marketplace Smart Contracts

A decentralized platform for minting and trading music NFTs on Ethereum.

## Project Description

This project enables musicians, artists, or labels to tokenize their songs as NFTs (ERC-721) and list them on a decentralized marketplace. Built with Solidity and Hardhat, it consists of two main smart contracts.

A custom ERC-721 smart contract designed to represent individual songs as unique NFTs. Each NFT includes:

- Metadata URI (e.g., IPFS link to music information)
- Ownership information

Musicians can mint NFTs to represent their songs and assign ownership or royalties.

Also decentralized marketplace contract that supports:

- **Listing**: Owners can list their SongNFTs with a price.
- **Purchasing**: Buyers can acquire listed songs with ETH.
- **Cancellation**: Sellers can cancel their listings at any time

## Pre-requisites

Before running or deploying the project, ensure you have the following installed:

- **Node.js** ≥ 16.x  
  Download from: https://nodejs.org

- **npm** (comes with Node.js)  
  You can verify with:

```bash
node -v
npm -v
```

- **Hardhat**  
  Installed as a dev dependency in the project.
