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
    it('Should allow users to mint an NFT with royalties', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);
      const tokenURI = 'https://example.com/token/1';
      const salesRoyaltyPercentage = 500;
      const streamingRoyaltyPercentage = 1000;
      const tokenId = 1;

      await expect(
        musicNFT.mintNFT(
          tokenURI,
          salesRoyaltyPercentage,
          streamingRoyaltyPercentage
        )
      )
        .to.emit(musicNFT, 'Transfer')
        .withArgs(ethers.ZeroAddress, owner.address, tokenId);

      expect(await musicNFT.ownerOf(tokenId)).to.equal(owner.address);

      expect(await musicNFT.tokenURI(tokenId)).to.equal(tokenURI);

      const royaltyInfo = await musicNFT.royaltyInfo(tokenId, 10000);
      expect(royaltyInfo[0]).to.equal(owner.address);
      expect(royaltyInfo[1]).to.equal(500);
    });

    it('Should increment token ID correctly', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      await musicNFT.mintNFT('uri1', 500, 1000);
      await musicNFT.mintNFT('uri2', 300, 800);

      expect(await musicNFT.tokenURI(1)).to.equal('uri1');
      expect(await musicNFT.tokenURI(2)).to.equal('uri2');

      expect(await musicNFT.balanceOf(owner.address)).to.equal(2);

      const royaltyInfo = await musicNFT.royaltyInfo(2, 10000);
      expect(royaltyInfo[0]).to.equal(owner.address);
      expect(royaltyInfo[1]).to.equal(300);
    });

    it('Should revert when minting with empty tokenURI', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);

      await expect(
        musicNFT.mintNFT('', 500, 1000)
      ).to.be.revertedWithCustomError(musicNFT, 'EmptyTokenURI');
    });

    it('Should revert when sales royalty exceeds maximum', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);
      const maxRoyalty = await musicNFT.MAX_ROYALTY_PERCENTAGE();
      const excessiveRoyalty = maxRoyalty + 1n;

      await expect(musicNFT.mintNFT('test-uri', excessiveRoyalty, 1000))
        .to.be.revertedWithCustomError(musicNFT, 'MaxRoyaltyExceeded')
        .withArgs(excessiveRoyalty, maxRoyalty);
    });
  });

  describe('Streaming royalties', function () {
    it('Should set streaming royalties correctly when minting', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);

      const streamingRoyaltyPercentage = 1500;
      await musicNFT.mintNFT('streaming-test', 500, streamingRoyaltyPercentage);

      expect(await musicNFT.getStreamingRoyalty(1)).to.equal(
        streamingRoyaltyPercentage
      );
    });

    it('Should store royalties and creator addresses correctly', async function () {
      const { musicNFT, owner, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      await musicNFT.mintNFT('owner-token', 500, 1000);
      await musicNFT.connect(otherAccount).mintNFT('other-token', 500, 1500);

      expect(await musicNFT.getCreator(1)).to.equal(owner.address);
      expect(await musicNFT.getCreator(2)).to.equal(otherAccount.address);

      expect(await musicNFT.getStreamingRoyalty(1)).to.equal(1000);
      expect(await musicNFT.getStreamingRoyalty(2)).to.equal(1500);
    });

    it('Should revert when streaming royalty exceeds maximum', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);
      const maxRoyalty = await musicNFT.MAX_ROYALTY_PERCENTAGE();
      const excessiveRoyalty = maxRoyalty + 1n;

      await expect(musicNFT.mintNFT('test-uri', 1000, excessiveRoyalty))
        .to.be.revertedWithCustomError(musicNFT, 'MaxRoyaltyExceeded')
        .withArgs(excessiveRoyalty, maxRoyalty);
    });

    it('Should revert when querying streaming royalty for non-existent token', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);
      const nonExistentTokenId = 999;

      await expect(musicNFT.getStreamingRoyalty(nonExistentTokenId))
        .to.be.revertedWithCustomError(musicNFT, 'NonexistentToken')
        .withArgs(nonExistentTokenId);
    });

    it('Should revert when querying creator for non-existent token', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);
      const nonExistentTokenId = 999;

      await expect(musicNFT.getCreator(nonExistentTokenId))
        .to.be.revertedWithCustomError(musicNFT, 'NonexistentToken')
        .withArgs(nonExistentTokenId);
    });
  });

  describe('Interface support', function () {
    it('Should support ERC721 and ERC2981 interfaces', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);

      const ERC721InterfaceId = '0x80ac58cd';
      const ERC2981InterfaceId = '0x2a55205a';

      expect(await musicNFT.supportsInterface(ERC721InterfaceId)).to.be.true;
      expect(await musicNFT.supportsInterface(ERC2981InterfaceId)).to.be.true;
    });
  });
});
