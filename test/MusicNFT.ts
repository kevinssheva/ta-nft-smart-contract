import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { MusicNFT } from '../typechain-types/contracts';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('MusicNFT', function () {
  // Basic fixture that just deploys the contract
  async function deployMusicNFTFixture() {
    const [owner, otherAccount, randomUser] = await hre.ethers.getSigners();

    const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
    const musicNFT = await MusicNFT.deploy();

    return { musicNFT, owner, otherAccount, randomUser };
  }

  // Helper function to mint an NFT with standard parameters
  async function mintNFT(
    musicNFT: MusicNFT,
    minter: HardhatEthersSigner,
    tokenURI = 'https://example.com/token/1',
    salesRoyaltyPercentage = 500,
    streamingRoyaltyPercentage = 1000
  ) {
    const tx = await musicNFT
      .connect(minter)
      .mintNFT(tokenURI, salesRoyaltyPercentage, streamingRoyaltyPercentage);
    await tx.wait();
    const tokenId = 1; // First token ID is always 1
    return {
      tokenId,
      tokenURI,
      salesRoyaltyPercentage,
      streamingRoyaltyPercentage,
    };
  }

  // Helper function to mint a specific edition
  async function mintEdition(
    musicNFT: MusicNFT,
    minter: HardhatEthersSigner,
    songId: string,
    maxEditions: number,
    tokenURI = 'https://example.com/song/edition',
    salesRoyaltyPercentage = 500,
    streamingRoyaltyPercentage = 1000
  ) {
    const tx = await musicNFT
      .connect(minter)
      .mintEdition(
        tokenURI,
        songId,
        maxEditions,
        salesRoyaltyPercentage,
        streamingRoyaltyPercentage
      );
    const receipt = await tx.wait();

    // Get the token ID from the EditionMinted event
    const event = receipt?.logs.find((log) => {
      try {
        const parsedLog = musicNFT.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsedLog?.name === 'EditionMinted';
      } catch {
        return false;
      }
    });

    const parsedEvent = event
      ? musicNFT.interface.parseLog({
          topics: event.topics as string[],
          data: event.data,
        })
      : null;

    const tokenId = parsedEvent?.args[0] || 0;

    return {
      tokenId,
      songId,
      editionNumber: parsedEvent?.args[2] || 0,
      maxEditions,
    };
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

  describe('Multiple Editions', function () {
    it('Should allow minting multiple editions of the same song', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      const songId = 'song-123';
      const maxEditions = 5;

      // Mint first edition
      const edition1 = await mintEdition(
        musicNFT,
        owner,
        songId,
        maxEditions,
        'https://example.com/song/edition1'
      );

      // Check first edition data
      const editionInfo1 = await musicNFT.getEditionInfo(edition1.tokenId);
      expect(editionInfo1[0]).to.equal(songId); // songId
      expect(editionInfo1[1]).to.equal(1); // editionNumber
      expect(editionInfo1[2]).to.equal(maxEditions); // maxEditions

      // Check editions counter
      expect(await musicNFT.getEditionsMinted(songId)).to.equal(1);

      // Mint second edition
      const edition2 = await mintEdition(
        musicNFT,
        owner,
        songId,
        maxEditions,
        'https://example.com/song/edition2'
      );

      // Check second edition data
      const editionInfo2 = await musicNFT.getEditionInfo(edition2.tokenId);
      expect(editionInfo2[0]).to.equal(songId); // songId
      expect(editionInfo2[1]).to.equal(2); // editionNumber
      expect(editionInfo2[2]).to.equal(maxEditions); // maxEditions

      // Check editions counter
      expect(await musicNFT.getEditionsMinted(songId)).to.equal(2);
    });

    it('Should enforce the edition limit', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      const songId = 'limited-song';
      const maxEditions = 2;

      // Mint first edition
      await mintEdition(musicNFT, owner, songId, maxEditions);

      // Mint second edition
      await mintEdition(musicNFT, owner, songId, maxEditions);

      // Try to mint third edition, which should fail
      await expect(
        musicNFT
          .connect(owner)
          .mintEdition(
            'https://example.com/song/edition3',
            songId,
            maxEditions,
            500,
            1000
          )
      ).to.be.revertedWithCustomError(musicNFT, 'EditionLimitExceeded');
    });

    it('Should allow different creators to mint editions of different songs', async function () {
      const { musicNFT, owner, otherAccount } = await loadFixture(
        deployMusicNFTFixture
      );

      const songId1 = 'song-by-owner';
      const songId2 = 'song-by-other';

      // Owner mints an edition of their song
      const edition1 = await mintEdition(musicNFT, owner, songId1, 10);

      // Other account mints an edition of their song
      const edition2 = await mintEdition(musicNFT, otherAccount, songId2, 5);

      // Check creator mappings
      expect(await musicNFT.getCreator(edition1.tokenId)).to.equal(
        owner.address
      );
      expect(await musicNFT.getCreator(edition2.tokenId)).to.equal(
        otherAccount.address
      );

      // Check edition numbers
      const editionInfo1 = await musicNFT.getEditionInfo(edition1.tokenId);
      const editionInfo2 = await musicNFT.getEditionInfo(edition2.tokenId);

      expect(editionInfo1[0]).to.equal(songId1);
      expect(editionInfo1[1]).to.equal(1); // First edition

      expect(editionInfo2[0]).to.equal(songId2);
      expect(editionInfo2[1]).to.equal(1); // First edition
    });

    it('Should allow the same creator to mint editions of different songs', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      const songId1 = 'first-song';
      const songId2 = 'second-song';

      // Creator mints an edition of first song
      await mintEdition(musicNFT, owner, songId1, 3);

      // Creator mints an edition of second song
      await mintEdition(musicNFT, owner, songId2, 5);

      // Check editions counters
      expect(await musicNFT.getEditionsMinted(songId1)).to.equal(1);
      expect(await musicNFT.getEditionsMinted(songId2)).to.equal(1);

      // Mint more editions of first song
      await mintEdition(musicNFT, owner, songId1, 3);
      expect(await musicNFT.getEditionsMinted(songId1)).to.equal(2);
    });

    it('Should ensure legacy mintNFT function still works', async function () {
      const { musicNFT, owner } = await loadFixture(deployMusicNFTFixture);

      const tokenURI = 'https://example.com/legacy-token';

      // Use the legacy function
      const tx = await musicNFT.connect(owner).mintNFT(tokenURI, 500, 1000);
      const receipt = await tx.wait();

      // Find the EditionMinted event
      const editionMintedEvents = receipt?.logs.filter((log) => {
        try {
          const parsedLog = musicNFT.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          return parsedLog?.name === 'EditionMinted';
        } catch {
          return false;
        }
      });

      expect(editionMintedEvents?.length).to.equal(1);

      const tokenId = 1;

      // Check token data
      expect(await musicNFT.tokenURI(tokenId)).to.equal(tokenURI);
      expect(await musicNFT.ownerOf(tokenId)).to.equal(owner.address);
      expect(await musicNFT.getStreamingRoyalty(tokenId)).to.equal(1000);

      // Check edition data
      const editionInfo = await musicNFT.getEditionInfo(tokenId);
      expect(editionInfo[1]).to.equal(1); // Should be edition #1
      expect(editionInfo[2]).to.equal(1); // Max editions should be 1

      // Should have auto-generated a songId
      expect(editionInfo[0]).to.include('song-');
    });
  });
});
