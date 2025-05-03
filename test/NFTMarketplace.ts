import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

describe('NFTMarketplace', function () {
  async function deployMarketplaceFixture() {
    const [owner, seller, buyer] = await hre.ethers.getSigners();

    // Deploy MusicNFT contract first
    const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
    const musicNFT = await MusicNFT.deploy();

    // Deploy NFTMarketplace contract
    const NFTMarketplace = await hre.ethers.getContractFactory(
      'NFTMarketplace'
    );
    const marketplace = await NFTMarketplace.deploy();

    const tokenURI = 'https://example.com/token/1';
    const salesRoyaltyPercentage = 500; // 5%
    const streamingRoyaltyPercentage = 1000; // 10%
    await musicNFT
      .connect(seller)
      .mintNFT(tokenURI, salesRoyaltyPercentage, streamingRoyaltyPercentage);

    const tokenId = 1;

    return { marketplace, musicNFT, owner, seller, buyer, tokenId };
  }

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      const { marketplace, owner } = await loadFixture(
        deployMarketplaceFixture
      );
      expect(await marketplace.owner()).to.equal(owner.address);
    });
  });

  describe('Creating Listings', function () {
    it('Should allow users to create a listing', async function () {
      const { marketplace, musicNFT, seller, tokenId } = await loadFixture(
        deployMarketplaceFixture
      );

      await musicNFT.connect(seller).approve(marketplace.target, tokenId);

      const listingPrice = ethers.parseEther('1.0');

      await expect(
        marketplace
          .connect(seller)
          .createListing(musicNFT.target, tokenId, listingPrice)
      )
        .to.emit(marketplace, 'NFTListed')
        .withArgs(1, seller.address, musicNFT.target, tokenId, listingPrice);

      const listing = await marketplace.listings(1);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.nftContract).to.equal(musicNFT.target);
      expect(listing.tokenId).to.equal(tokenId);
      expect(listing.price).to.equal(listingPrice);
      expect(listing.isActive).to.be.true;

      expect(await musicNFT.ownerOf(tokenId)).to.equal(marketplace.target);
    });

    it('Should increment listing ID correctly', async function () {
      const { marketplace, musicNFT, seller } = await loadFixture(
        deployMarketplaceFixture
      );

      await musicNFT.connect(seller).mintNFT('uri2', 300, 800);
      const tokenId1 = 1;
      const tokenId2 = 2;

      await musicNFT.connect(seller).approve(marketplace.target, tokenId1);
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId1, ethers.parseEther('1.0'));

      await musicNFT.connect(seller).approve(marketplace.target, tokenId2);
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId2, ethers.parseEther('2.0'));

      const listing1 = await marketplace.listings(1);
      const listing2 = await marketplace.listings(2);

      expect(listing1.tokenId).to.equal(tokenId1);
      expect(listing2.tokenId).to.equal(tokenId2);
      expect(listing2.price).to.equal(ethers.parseEther('2.0'));
    });

    it('Should revert when trying to list an NFT without approval', async function () {
      const { marketplace, musicNFT, seller, tokenId } = await loadFixture(
        deployMarketplaceFixture
      );

      await expect(
        marketplace
          .connect(seller)
          .createListing(musicNFT.target, tokenId, ethers.parseEther('1.0'))
      ).to.be.reverted;
    });

    it('Should revert when trying to list an NFT the user does not own', async function () {
      const { marketplace, musicNFT, buyer, tokenId } = await loadFixture(
        deployMarketplaceFixture
      );

      await expect(
        marketplace
          .connect(buyer)
          .createListing(musicNFT.target, tokenId, ethers.parseEther('1.0'))
      ).to.be.reverted;
    });
  });
});
