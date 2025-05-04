import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';
import { NFTMarketplace, MusicNFT } from '../typechain-types/contracts';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('NFTMarketplace', function () {
  async function deployMarketplaceFixture() {
    const [owner, seller, buyer] = await hre.ethers.getSigners();

    const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
    const musicNFT = await MusicNFT.deploy();

    const NFTMarketplace = await hre.ethers.getContractFactory(
      'NFTMarketplace'
    );
    const marketplace = await NFTMarketplace.deploy();

    const tokenURI = 'https://example.com/token/1';
    const salesRoyaltyPercentage = 500;
    const streamingRoyaltyPercentage = 1000;
    await musicNFT
      .connect(seller)
      .mintNFT(tokenURI, salesRoyaltyPercentage, streamingRoyaltyPercentage);

    const tokenId = 1;

    return { marketplace, musicNFT, owner, seller, buyer, tokenId };
  }

  async function createListing(
    marketplace: NFTMarketplace,
    musicNFT: MusicNFT,
    seller: HardhatEthersSigner,
    tokenId: number,
    price = ethers.parseEther('1.0')
  ) {
    await musicNFT.connect(seller).approve(marketplace.target, tokenId);
    const listingTx = await marketplace
      .connect(seller)
      .createListing(musicNFT.target, tokenId, price);
    await listingTx.wait();
    return { listingId: tokenId, price };
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

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      const listing = await marketplace.listings(listingId);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.nftContract).to.equal(musicNFT.target);
      expect(listing.tokenId).to.equal(tokenId);
      expect(listing.price).to.equal(price);
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

      await createListing(marketplace, musicNFT, seller, tokenId1);
      await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId2,
        ethers.parseEther('2.0')
      );

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

  describe('Buying NFTs', function () {
    it('Should allow users to buy an NFT', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      await expect(
        marketplace.connect(buyer).buyNFT(listingId, { value: price })
      )
        .to.emit(marketplace, 'NFTSold')
        .withArgs(
          listingId,
          seller.address,
          buyer.address,
          musicNFT.target,
          tokenId,
          price
        );

      const listing = await marketplace.listings(listingId);
      expect(listing.isActive).to.be.false;

      expect(await musicNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it('Should handle royalties correctly', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId, owner } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      const marketFeePercentage = await marketplace.marketFeePercentage();

      const [royaltyReceiver, royaltyAmount] = await musicNFT.royaltyInfo(
        tokenId,
        price
      );
      expect(royaltyReceiver).to.equal(seller.address);

      const marketFee = (price * marketFeePercentage) / 10000n;
      const sellerProceeds = price - royaltyAmount - marketFee;

      const tx = await marketplace
        .connect(buyer)
        .buyNFT(listingId, { value: price });
      await tx.wait();

      const pendingPaymentSeller = await marketplace.getPendingPayment(
        seller.address
      );
      const pendingPaymentOwner = await marketplace.getPendingPayment(
        owner.address
      );
      expect(pendingPaymentSeller).to.equal(sellerProceeds + royaltyAmount);
      expect(pendingPaymentOwner).to.equal(marketFee);
      expect(await musicNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it('Should allow payment with excess and refund the excess amount', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      const initialBuyerBalance = await ethers.provider.getBalance(
        buyer.address
      );

      const paymentAmount = ethers.parseEther('1.5');
      const tx = await marketplace
        .connect(buyer)
        .buyNFT(listingId, { value: paymentAmount });
      const receipt = await tx.wait();

      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? 0n;
      const gasCost = gasUsed * gasPrice;

      const finalBuyerBalance = await ethers.provider.getBalance(buyer.address);
      const expectedBalance = initialBuyerBalance - price - gasCost;

      const difference = expectedBalance - finalBuyerBalance;
      expect(difference).to.be.lessThan(1000000n);
    });

    it('Should revert when trying to buy with insufficient funds', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      const insufficientAmount = ethers.parseEther('0.5');
      await expect(
        marketplace
          .connect(buyer)
          .buyNFT(listingId, { value: insufficientAmount })
      ).to.be.revertedWithCustomError(marketplace, 'InsufficientFunds');
    });

    it('Should revert when trying to buy an inactive listing', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      await marketplace.connect(buyer).buyNFT(listingId, { value: price });

      await expect(
        marketplace.connect(buyer).buyNFT(listingId, { value: price })
      ).to.be.revertedWithCustomError(marketplace, 'ListingNotActive');
    });

    it('Should revert when trying to buy a non-existent listing', async function () {
      const { marketplace, buyer } = await loadFixture(
        deployMarketplaceFixture
      );

      const nonExistentListingId = 999;
      const amount = ethers.parseEther('1.0');

      await expect(
        marketplace
          .connect(buyer)
          .buyNFT(nonExistentListingId, { value: amount })
      ).to.be.revertedWithCustomError(marketplace, 'ListingNotFound');
    });

    it('Should handle multiple sales with different royalties', async function () {
      const { marketplace, musicNFT, seller, buyer, owner } = await loadFixture(
        deployMarketplaceFixture
      );

      const [, , , secondSeller] = await ethers.getSigners();

      await musicNFT
        .connect(secondSeller)
        .mintNFT('https://example.com/token/2', 1000, 1500);
      const secondTokenId = 2;

      const { listingId: firstListingId, price: firstPrice } =
        await createListing(marketplace, musicNFT, seller, 1);

      await createListing(
        marketplace,
        musicNFT,
        secondSeller,
        secondTokenId,
        ethers.parseEther('2.0')
      );

      await marketplace
        .connect(buyer)
        .buyNFT(firstListingId, { value: firstPrice });
      await marketplace
        .connect(buyer)
        .buyNFT(2, { value: ethers.parseEther('2.0') });

      const [, firstRoyaltyAmount] = await musicNFT.royaltyInfo(1, firstPrice);
      const [, secondRoyaltyAmount] = await musicNFT.royaltyInfo(
        secondTokenId,
        ethers.parseEther('2.0')
      );

      const marketFeePercentage = await marketplace.marketFeePercentage();
      const firstMarketFee = (firstPrice * marketFeePercentage) / 10000n;
      const secondMarketFee =
        (ethers.parseEther('2.0') * marketFeePercentage) / 10000n;

      expect(secondRoyaltyAmount).to.be.gt(firstRoyaltyAmount);

      const firstSellerProceeds =
        firstPrice - firstRoyaltyAmount - firstMarketFee;
      expect(await marketplace.getPendingPayment(seller.address)).to.equal(
        firstSellerProceeds + firstRoyaltyAmount
      );

      const secondSellerProceeds =
        ethers.parseEther('2.0') - secondRoyaltyAmount - secondMarketFee;
      expect(
        await marketplace.getPendingPayment(secondSeller.address)
      ).to.equal(secondSellerProceeds + secondRoyaltyAmount);

      expect(await marketplace.getPendingPayment(owner.address)).to.equal(
        firstMarketFee + secondMarketFee
      );
    });
  });

  describe('Cancelling Listings', function () {
    it('Should allow seller to cancel their listing', async function () {
      const { marketplace, musicNFT, seller, tokenId } = await loadFixture(
        deployMarketplaceFixture
      );

      const { listingId } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      expect(await musicNFT.ownerOf(tokenId)).to.equal(marketplace.target);

      await expect(marketplace.connect(seller).cancelListing(listingId))
        .to.emit(marketplace, 'NFTListingCancelled')
        .withArgs(listingId, seller.address, musicNFT.target, tokenId);

      const listing = await marketplace.listings(listingId);
      expect(listing.isActive).to.be.false;

      expect(await musicNFT.ownerOf(tokenId)).to.equal(seller.address);
    });

    it('Should revert when non-seller tries to cancel a listing', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      await expect(
        marketplace.connect(buyer).cancelListing(listingId)
      ).to.be.revertedWithCustomError(marketplace, 'NotListingOwner');
    });

    it('Should revert when trying to cancel a non-existent listing', async function () {
      const { marketplace, seller } = await loadFixture(
        deployMarketplaceFixture
      );

      const nonExistentListingId = 999;

      await expect(
        marketplace.connect(seller).cancelListing(nonExistentListingId)
      ).to.be.revertedWithCustomError(marketplace, 'ListingNotFound');
    });

    it('Should revert when trying to cancel an inactive listing', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      await marketplace.connect(buyer).buyNFT(listingId, { value: price });

      await expect(
        marketplace.connect(seller).cancelListing(listingId)
      ).to.be.revertedWithCustomError(marketplace, 'ListingNotActive');
    });

    it('Should not allow buying a cancelled listing', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      await marketplace.connect(seller).cancelListing(listingId);

      await expect(
        marketplace.connect(buyer).buyNFT(listingId, { value: price })
      ).to.be.revertedWithCustomError(marketplace, 'ListingNotActive');
    });
  });

  describe('Withdrawing Payments', function () {
    it('Should allow withdrawal of royalties and fees', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId, owner } =
        await loadFixture(deployMarketplaceFixture);

      const { listingId, price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId
      );

      const marketFeePercentage = await marketplace.marketFeePercentage();
      const marketFee = (price * marketFeePercentage) / 10000n;

      const [royaltyReceiver, royaltyAmount] = await musicNFT.royaltyInfo(
        tokenId,
        price
      );
      expect(royaltyReceiver).to.equal(seller.address);

      const sellerProceeds = price - royaltyAmount - marketFee;

      await marketplace.connect(buyer).buyNFT(listingId, { value: price });

      expect(await marketplace.getPendingPayment(seller.address)).to.equal(
        sellerProceeds + royaltyAmount
      );
      expect(await marketplace.getPendingPayment(owner.address)).to.equal(
        marketFee
      );

      const initialSellerBalance = await ethers.provider.getBalance(
        seller.address
      );

      const withdrawTx = await marketplace.connect(seller).withdrawPayments();
      const receipt = await withdrawTx.wait();

      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? 0n;
      const gasCost = gasUsed * gasPrice;

      const finalSellerBalance = await ethers.provider.getBalance(
        seller.address
      );
      expect(finalSellerBalance).to.equal(
        initialSellerBalance + sellerProceeds + royaltyAmount - gasCost
      );

      expect(await marketplace.getPendingPayment(seller.address)).to.equal(0);

      const initialOwnerBalance = await ethers.provider.getBalance(
        owner.address
      );

      await marketplace.connect(owner).withdrawPayments();

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
      expect(finalOwnerBalance).to.be.greaterThan(initialOwnerBalance);

      expect(await marketplace.getPendingPayment(owner.address)).to.equal(0);
    });

    it('Should revert withdrawal when no payments are pending', async function () {
      const { marketplace, buyer } = await loadFixture(
        deployMarketplaceFixture
      );

      await expect(
        marketplace.connect(buyer).withdrawPayments()
      ).to.be.revertedWithCustomError(marketplace, 'NoPaymentsPending');
    });
  });

  describe('Query Operations', function () {
    it('Should get listing details by token', async function () {
      const { marketplace, musicNFT, seller, tokenId } = await loadFixture(
        deployMarketplaceFixture
      );

      const price = ethers.parseEther('1.0');
      await createListing(marketplace, musicNFT, seller, tokenId, price);

      const [listingId, retrievedSeller, retrievedPrice, isActive] =
        await marketplace.getListingByToken(musicNFT.target, tokenId);

      expect(listingId).to.equal(1);
      expect(retrievedSeller).to.equal(seller.address);
      expect(retrievedPrice).to.equal(price);
      expect(isActive).to.be.true;
    });

    it('Should return zeros for non-existent token listings', async function () {
      const { marketplace, musicNFT } = await loadFixture(
        deployMarketplaceFixture
      );

      const nonExistentTokenId = 999;
      const [listingId, seller, price, isActive] =
        await marketplace.getListingByToken(
          musicNFT.target,
          nonExistentTokenId
        );

      expect(listingId).to.equal(0);
      expect(seller).to.equal(ethers.ZeroAddress);
      expect(price).to.equal(0);
      expect(isActive).to.be.false;
    });

    it('Should count active listings correctly', async function () {
      const { marketplace, musicNFT, seller } = await loadFixture(
        deployMarketplaceFixture
      );

      expect(await marketplace.getActiveListingsCount()).to.equal(0);

      // Create first token
      await musicNFT.connect(seller).mintNFT('uri1', 500, 1000);
      const tokenId1 = 1;
      await createListing(marketplace, musicNFT, seller, tokenId1);

      expect(await marketplace.getActiveListingsCount()).to.equal(1);

      // Create second token
      await musicNFT.connect(seller).mintNFT('uri2', 500, 1000);
      const tokenId2 = 2;
      await createListing(marketplace, musicNFT, seller, tokenId2);

      expect(await marketplace.getActiveListingsCount()).to.equal(2);

      // Cancel one listing
      await marketplace.connect(seller).cancelListing(1);

      expect(await marketplace.getActiveListingsCount()).to.equal(1);
    });

    it('Should get total listings count correctly', async function () {
      const { marketplace, musicNFT, seller, buyer } = await loadFixture(
        deployMarketplaceFixture
      );

      expect(await marketplace.getTotalListings()).to.equal(0);

      // Create and buy first token
      await musicNFT.connect(seller).mintNFT('uri1', 500, 1000);
      const tokenId1 = 1;
      const { price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId1
      );
      await marketplace.connect(buyer).buyNFT(1, { value: price });

      expect(await marketplace.getTotalListings()).to.equal(1);

      // Create and cancel second token
      await musicNFT.connect(seller).mintNFT('uri2', 500, 1000);
      const tokenId2 = 2;
      await createListing(marketplace, musicNFT, seller, tokenId2);
      await marketplace.connect(seller).cancelListing(2);

      expect(await marketplace.getTotalListings()).to.equal(2);
    });

    it('Should get active listings with pagination', async function () {
      const { marketplace, musicNFT, seller } = await loadFixture(
        deployMarketplaceFixture
      );

      // Create 5 listings
      for (let i = 0; i < 5; i++) {
        await musicNFT.connect(seller).mintNFT(`uri${i}`, 500, 1000);
        const tokenId = i + 1;
        const price = ethers.parseEther(`${i + 1}.0`);
        await createListing(marketplace, musicNFT, seller, tokenId, price);
      }

      // Get first 2 listings
      const [listingIds1, sellers1, nftContracts1, tokenIds1, prices1] =
        await marketplace.getActiveListings(0, 2);

      expect(listingIds1.length).to.equal(2);
      expect(listingIds1[0]).to.equal(1);
      expect(listingIds1[1]).to.equal(2);
      expect(sellers1[0]).to.equal(seller.address);
      expect(tokenIds1[0]).to.equal(1);
      expect(tokenIds1[1]).to.equal(2);
      expect(prices1[0]).to.equal(ethers.parseEther('1.0'));
      expect(prices1[1]).to.equal(ethers.parseEther('2.0'));

      // Get next 2 listings
      const [listingIds2, sellers2, nftContracts2, tokenIds2, prices2] =
        await marketplace.getActiveListings(2, 2);

      expect(listingIds2.length).to.equal(2);
      expect(listingIds2[0]).to.equal(3);
      expect(listingIds2[1]).to.equal(4);
      expect(tokenIds2[0]).to.equal(3);
      expect(prices2[1]).to.equal(ethers.parseEther('4.0'));

      // Get listings with out-of-bounds start
      const [listingIds3, sellers3, nftContracts3, tokenIds3, prices3] =
        await marketplace.getActiveListings(10, 2);

      expect(listingIds3.length).to.equal(0);
    });

    it('Should get listings by seller with pagination', async function () {
      const { marketplace, musicNFT, buyer } = await loadFixture(
        deployMarketplaceFixture
      );

      // Create 3 listings from seller
      for (let i = 0; i < 3; i++) {
        await musicNFT.connect(buyer).mintNFT(`uri${i}`, 500, 1000);
        const tokenId = i + 2;
        await createListing(marketplace, musicNFT, buyer, tokenId);
      }

      // Get seller's listings
      const [listingIds, nftContracts, tokenIds, prices, isActive] =
        await marketplace.getListingsBySeller(buyer.address, 0, 5);

      expect(listingIds.length).to.equal(3);
      expect(tokenIds[0]).to.equal(2);
      expect(tokenIds[1]).to.equal(3);
      expect(tokenIds[2]).to.equal(4);
      expect(isActive[0]).to.be.true;

      // Cancel one listing and check isActive status
      await marketplace.connect(buyer).cancelListing(2);

      const [
        listingIdsAfter,
        nftContractsAfter,
        tokenIdsAfter,
        pricesAfter,
        isActiveAfter,
      ] = await marketplace.getListingsBySeller(buyer.address, 0, 5);

      expect(isActiveAfter[0]).to.be.true;
      expect(isActiveAfter[1]).to.be.false;
      expect(isActiveAfter[2]).to.be.true;
    });

    it('Should check if a token is listed correctly', async function () {
      const { marketplace, musicNFT, seller, buyer } = await loadFixture(
        deployMarketplaceFixture
      );

      await musicNFT.connect(seller).mintNFT('uri1', 500, 1000);
      const tokenId1 = 1;
      const { price } = await createListing(
        marketplace,
        musicNFT,
        seller,
        tokenId1
      );

      expect(await marketplace.isTokenListed(musicNFT.target, tokenId1)).to.be
        .true;

      // Buy the token and verify it's no longer listed
      await marketplace.connect(buyer).buyNFT(1, { value: price });
      expect(await marketplace.isTokenListed(musicNFT.target, tokenId1)).to.be
        .false;

      // Check non-existent token
      expect(await marketplace.isTokenListed(musicNFT.target, 999)).to.be.false;
    });
  });
});
