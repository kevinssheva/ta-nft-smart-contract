import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const NFTMarketplaceModule = buildModule('NFTMarketplaceModule', (m) => {
  const nftMarketplace = m.contract('NFTMarketplace', []);
  return { nftMarketplace };
});

export default NFTMarketplaceModule;
