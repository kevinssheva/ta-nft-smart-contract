import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

describe('MusicNFT', function () {
  // Basic fixture that just deploys the contract
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

  describe('Updating Metadata', function () {
    it('Should allow creator to update tokenURI', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);

      const creator = owner;
      const tokenId = 1;

      const newTokenURI = 'https://example.com/updated-metadata';

      await expect(
        musicNFT.connect(creator).updateTokenURI(tokenId, newTokenURI)
      )
        .to.emit(musicNFT, 'MetadataUpdated')
        .withArgs(tokenId, newTokenURI);

      expect(await musicNFT.tokenURI(tokenId)).to.equal(newTokenURI);
    });

    it('Should allow current owner to update tokenURI', async function () {
      const { musicNFT, owner, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);

      const creator = owner;
      const tokenId = 1;

      await musicNFT
        .connect(creator)
        .transferFrom(creator.address, otherAccount.address, tokenId);

      const newTokenURI = 'https://example.com/new-owner-update';

      await expect(
        musicNFT.connect(otherAccount).updateTokenURI(tokenId, newTokenURI)
      )
        .to.emit(musicNFT, 'MetadataUpdated')
        .withArgs(tokenId, newTokenURI);

      expect(await musicNFT.tokenURI(tokenId)).to.equal(newTokenURI);
    });

    it('Should not allow non-creator/non-owner to update tokenURI', async function () {
      const { musicNFT, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);

      const tokenId = 1;

      const newTokenURI = 'https://example.com/unauthorized-update';

      await expect(
        musicNFT.connect(otherAccount).updateTokenURI(tokenId, newTokenURI)
      ).to.be.revertedWithCustomError(musicNFT, 'NotAuthorized');
    });

    it('Should revert when updating with empty URI', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);

      const creator = owner;
      const tokenId = 1;

      const emptyURI = '';

      await expect(
        musicNFT.connect(creator).updateTokenURI(tokenId, emptyURI)
      ).to.be.revertedWithCustomError(musicNFT, 'EmptyTokenURI');
    });

    it('Should revert when updating non-existent token', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      const creator = owner;

      const nonExistentTokenId = 999;
      const newTokenURI = 'https://example.com/new-uri';

      await expect(
        musicNFT
          .connect(creator)
          .updateTokenURI(nonExistentTokenId, newTokenURI)
      ).to.be.revertedWithCustomError(musicNFT, 'NonexistentToken');
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

  describe('Token Tracking', function () {
    it('Should track tokens by owner correctly', async function () {
      const { musicNFT, owner, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);
      await musicNFT.mintNFT('https://example.com/token/2', 500, 1000);
      await musicNFT.mintNFT('https://example.com/token/3', 500, 1000);

      await musicNFT.transferFrom(owner.address, otherAccount.address, 2);

      const ownerTokens = await musicNFT.getTokensOfOwner(owner.address);
      expect(ownerTokens.length).to.equal(2);
      expect(ownerTokens[0]).to.equal(1);
      expect(ownerTokens[1]).to.equal(3);

      const otherAccountTokens = await musicNFT.getTokensOfOwner(
        otherAccount.address
      );
      expect(otherAccountTokens.length).to.equal(1);
      expect(otherAccountTokens[0]).to.equal(2);
    });

    it('Should track tokens by creator correctly', async function () {
      const { musicNFT, owner, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);
      await musicNFT.mintNFT('https://example.com/token/2', 500, 1000);

      await musicNFT
        .connect(otherAccount)
        .mintNFT('https://example.com/token/3', 500, 1000);

      const ownerCreatedTokens = await musicNFT.getTokensCreatedBy(
        owner.address
      );
      expect(ownerCreatedTokens.length).to.equal(2);
      expect(ownerCreatedTokens[0]).to.equal(1);
      expect(ownerCreatedTokens[1]).to.equal(2);

      const otherCreatedTokens = await musicNFT.getTokensCreatedBy(
        otherAccount.address
      );
      expect(otherCreatedTokens.length).to.equal(1);
      expect(otherCreatedTokens[0]).to.equal(3);

      await musicNFT.transferFrom(owner.address, otherAccount.address, 1);

      const createdTokensAfterTransfer = await musicNFT.getTokensCreatedBy(
        owner.address
      );
      expect(createdTokensAfterTransfer.length).to.equal(2);
    });

    it('Should track token details correctly', async function () {
      const { musicNFT, owner, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      const salesRoyaltyPercentage = 500;
      const streamingRoyaltyPercentage = 1500;
      await musicNFT.mintNFT(
        'https://example.com/token/1',
        salesRoyaltyPercentage,
        streamingRoyaltyPercentage
      );
      const tokenId = 1;

      await musicNFT.transferFrom(owner.address, otherAccount.address, tokenId);

      const details = await musicNFT.getTokenDetails(tokenId);

      expect(details.creator).to.equal(owner.address);
      expect(details.currentOwner).to.equal(otherAccount.address);
      expect(details.streamingRoyaltyPercentage).to.equal(
        streamingRoyaltyPercentage
      );
      expect(details.salesRoyaltyReceiver).to.equal(owner.address);
      expect(details.salesRoyaltyPercentage).to.equal(salesRoyaltyPercentage);
    });

    it('Should return empty array for address with no created tokens', async function () {
      const { musicNFT, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      // Create a token with owner but check other account
      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);

      const tokens = await musicNFT.getTokensCreatedBy(otherAccount.address);
      expect(tokens.length).to.equal(0);
    });

    it('Should handle getTokensCreatedBy with no tokens existing', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      const tokens = await musicNFT.getTokensCreatedBy(owner.address);
      expect(tokens.length).to.equal(0);
    });
  });

  describe('Sales Royalty Functions', function () {
    it('Should get sales royalty information correctly', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      const salesRoyaltyPercentage = 750; // 7.5%
      await musicNFT.mintNFT(
        'https://example.com/token/1',
        salesRoyaltyPercentage,
        1000
      );

      const tokenId = 1;
      const [receiver, royaltyAmount] = await musicNFT.getSalesRoyalty(tokenId);

      expect(receiver).to.equal(owner.address);
      expect(royaltyAmount).to.equal(750); // Should match the percentage for 10000 base
    });

    it('Should revert when getting sales royalty for non-existent token', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);
      const nonExistentTokenId = 999;

      await expect(musicNFT.getSalesRoyalty(nonExistentTokenId))
        .to.be.revertedWithCustomError(musicNFT, 'NonexistentToken')
        .withArgs(nonExistentTokenId);
    });
  });

  describe('Additional Utility Functions', function () {
    it('Should check token existence correctly', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);

      expect(await musicNFT.tokenExists(1)).to.be.true;
      expect(await musicNFT.tokenExists(999)).to.be.false;
    });

    it('Should get total supply correctly', async function () {
      const { musicNFT } = await loadFixture(deployMusicNFTFixture);

      expect(await musicNFT.getTotalSupply()).to.equal(0);

      await musicNFT.mintNFT('https://example.com/token/1', 500, 1000);
      expect(await musicNFT.getTotalSupply()).to.equal(1);

      await musicNFT.mintNFT('https://example.com/token/2', 500, 1000);
      expect(await musicNFT.getTotalSupply()).to.equal(2);
    });
  });
});
