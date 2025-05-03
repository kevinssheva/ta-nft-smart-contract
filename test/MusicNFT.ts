import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

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

  describe('Minting NFTs', function () {
    it('Should allow the owner to mint an NFT', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);
      const tokenURI = 'https://example.com/token/1';
      const tokenId = 1;

      await expect(musicNFT.mintNFT(owner.address, tokenURI))
        .to.emit(musicNFT, 'Transfer')
        .withArgs(ethers.ZeroAddress, owner.address, tokenId);

      expect(await musicNFT.ownerOf(tokenId)).to.equal(owner.address);

      expect(await musicNFT.tokenURI(tokenId)).to.equal(tokenURI);
    });

    it('Should increment token ID correctly', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);
      await musicNFT.mintNFT(owner.address, 'uri1');
      await musicNFT.mintNFT(owner.address, 'uri2');

      expect(await musicNFT.tokenURI(1)).to.equal('uri1');
      expect(await musicNFT.tokenURI(2)).to.equal('uri2');

      expect(await musicNFT.balanceOf(owner.address)).to.equal(2);
    });
  });
});
