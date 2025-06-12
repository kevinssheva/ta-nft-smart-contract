import { ethers } from 'hardhat';

async function main() {
  console.log('🚀 Starting deployment preparation...');

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log('📝 Deploying contracts with account:', deployer.address);

  // Check balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('💰 Account balance:', ethers.formatEther(balance), 'ETH');

  // Get network info
  const network = await ethers.provider.getNetwork();
  console.log(
    '🌐 Network:',
    network.name,
    'Chain ID:',
    network.chainId.toString()
  );

  console.log('\n✅ Ready for deployment!');
  console.log('🎯 To deploy to Sepolia, run: npm run deploy:sepolia');
  console.log('📚 See DEPLOYMENT.md for detailed instructions');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
