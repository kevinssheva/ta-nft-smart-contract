import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';

const NFTStreamingModule = buildModule('NFTStreamingModule', (m) => {
  const nftStreaming = m.contract('NFTStreaming', []);
  return { nftStreaming };
});

export default NFTStreamingModule;
