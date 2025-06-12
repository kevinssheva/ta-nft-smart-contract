# Sepolia Deployment Guide

## Prerequisites

1. **Set up environment variables**: Create a `.env` file in the root directory with:

   ```
   SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID
   PRIVATE_KEY=your_private_key_here
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ```

2. **Get Sepolia ETH**: You'll need testnet ETH for deployment. Get it from:

   - [Sepolia Faucet](https://sepoliafaucet.com/)
   - [Alchemy Sepolia Faucet](https://sepoliafaucet.com/)
   - [Infura Sepolia Faucet](https://www.infura.io/faucet)

3. **Get RPC URL**: Sign up for a free account at:
   - [Infura](https://infura.io/)
   - [Alchemy](https://alchemy.com/)
   - [QuickNode](https://quicknode.com/)

## Deployment Steps

1. **Compile contracts**:

   ```
   npm run compile
   ```

2. **Deploy to Sepolia**:

   ```
   npm run deploy:sepolia
   ```

3. **Verify contracts (optional)**:
   After deployment, you can verify your contracts on Etherscan:
   ```
   npx hardhat verify --network sepolia <CONTRACT_ADDRESS>
   ```

## Contract Addresses

After deployment, your contract addresses will be saved in:
`ignition/deployments/chain-11155111/deployed_addresses.json`

## Troubleshooting

- **Insufficient funds**: Make sure you have enough Sepolia ETH
- **Invalid private key**: Ensure your private key is correct (without 0x prefix)
- **RPC errors**: Check your RPC URL is correct and working
- **Gas estimation failed**: Your contract might have errors, run tests first

## Security Notes

- **NEVER** commit your `.env` file
- **NEVER** share your private key
- Use a separate wallet for testing
- Double-check contract addresses before interacting
