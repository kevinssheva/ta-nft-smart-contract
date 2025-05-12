import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import MusicNFTModule from './MusicNFT';
import NFTMarketplaceModule from './NFTMarketplace';
import NFTStreamingModule from './NFTStreaming';

const NFTEcosystemModule = buildModule('NFTEcosystemModule', (m) => {
  const { musicNFT } = m.useModule(MusicNFTModule);
  const { nftMarketplace } = m.useModule(NFTMarketplaceModule);
  const { nftStreaming } = m.useModule(NFTStreamingModule);

  return {
    musicNFT,
    nftMarketplace,
    nftStreaming,
  };
});

export default NFTEcosystemModule;
