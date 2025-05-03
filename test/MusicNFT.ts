import { expect } from 'chai';
import hre from 'hardhat';

describe('MusicNFT', function () {
  async function deployMusicNFTFixture() {
    const [owner, otherAccount] = await hre.ethers.getSigners();

    const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
    const musicNFT = await MusicNFT.deploy();

    return { musicNFT, owner, otherAccount };
  }

  describe('Deployment', function () {
    it('Should set the correct name and symbol', async function () {
      const { musicNFT } = await deployMusicNFTFixture();

      expect(await musicNFT.name()).to.equal('MusicNFT');
      expect(await musicNFT.symbol()).to.equal('MUSIC');
    });

    it('Should set the correct owner', async function () {
      const { musicNFT, owner } = await deployMusicNFTFixture();

      expect(await musicNFT.owner()).to.equal(owner.address);
    });
  });
});
