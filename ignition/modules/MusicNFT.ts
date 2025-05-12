import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const MusicNFTModule = buildModule('MusicNFTModule', (m) => {
  const musicNFT = m.contract('MusicNFT', []);
  return { musicNFT };
});

export default MusicNFTModule;
