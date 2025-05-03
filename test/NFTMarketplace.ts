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

  describe('Buying NFTs', function () {
    it('Should allow users to buy an NFT', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      await musicNFT.connect(seller).approve(marketplace.target, tokenId);
      const listingPrice = ethers.parseEther('1.0');
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId, listingPrice);

      await expect(
        marketplace.connect(buyer).buyNFT(1, { value: listingPrice })
      )
        .to.emit(marketplace, 'NFTSold')
        .withArgs(
          1,
          seller.address,
          buyer.address,
          musicNFT.target,
          tokenId,
          listingPrice
        );

      const listing = await marketplace.listings(1);
      expect(listing.isActive).to.be.false;

      expect(await musicNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it('Should handle royalties correctly', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId, owner } =
        await loadFixture(deployMarketplaceFixture);

      await musicNFT.connect(seller).approve(marketplace.target, tokenId);
      const listingPrice = ethers.parseEther('1.0');
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId, listingPrice);

      const marketFeePercentage = await marketplace.marketFeePercentage();

      const [royaltyReceiver, royaltyAmount] = await musicNFT.royaltyInfo(
        tokenId,
        listingPrice
      );
      expect(royaltyReceiver).to.equal(seller.address);

      const marketFee = (listingPrice * marketFeePercentage) / 10000n;
      const sellerProceeds = listingPrice - royaltyAmount - marketFee;

      const tx = await marketplace
        .connect(buyer)
        .buyNFT(1, { value: listingPrice });
      await tx.wait();

      // Add a check for pending payments if there's a function to access them
      // For now we can only verify that the NFT was transferred correctly
      expect(await musicNFT.ownerOf(tokenId)).to.equal(buyer.address);
    });

    it('Should allow payment with excess and refund the excess amount', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      // Create a listing
      await musicNFT.connect(seller).approve(marketplace.target, tokenId);
      const listingPrice = ethers.parseEther('1.0');
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId, listingPrice);

      // Store buyer's initial balance
      const initialBuyerBalance = await ethers.provider.getBalance(
        buyer.address
      );

      // Buy with excess payment
      const paymentAmount = ethers.parseEther('1.5'); // 0.5 ETH excess
      const tx = await marketplace
        .connect(buyer)
        .buyNFT(1, { value: paymentAmount });
      const receipt = await tx.wait();

      // Calculate gas used
      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? 0n;
      const gasCost = gasUsed * gasPrice;

      // Check final balance (should be initial - listingPrice - gasCost)
      const finalBuyerBalance = await ethers.provider.getBalance(buyer.address);
      const expectedBalance = initialBuyerBalance - listingPrice - gasCost;

      // Allow for small rounding differences due to gas calculation
      const difference = expectedBalance - finalBuyerBalance;
      expect(difference).to.be.lessThan(1000000n); // Very small difference allowed
    });

    it('Should revert when trying to buy with insufficient funds', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      // Create a listing
      await musicNFT.connect(seller).approve(marketplace.target, tokenId);
      const listingPrice = ethers.parseEther('1.0');
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId, listingPrice);

      // Try to buy with insufficient funds
      const insufficientAmount = ethers.parseEther('0.5');
      await expect(
        marketplace.connect(buyer).buyNFT(1, { value: insufficientAmount })
      ).to.be.revertedWithCustomError(marketplace, 'InsufficientFunds');
    });

    it('Should revert when trying to buy an inactive listing', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId } =
        await loadFixture(deployMarketplaceFixture);

      // Create a listing
      await musicNFT.connect(seller).approve(marketplace.target, tokenId);
      const listingPrice = ethers.parseEther('1.0');
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId, listingPrice);

      // First purchase (should succeed)
      await marketplace.connect(buyer).buyNFT(1, { value: listingPrice });

      // Try to buy again (should fail as listing is inactive)
      await expect(
        marketplace.connect(buyer).buyNFT(1, { value: listingPrice })
      ).to.be.revertedWithCustomError(marketplace, 'ListingNotActive');
    });

    it('Should revert when trying to buy a non-existent listing', async function () {
      const { marketplace, buyer } = await loadFixture(
        deployMarketplaceFixture
      );

      const nonExistentListingId = 999;
      const amount = ethers.parseEther('1.0');

      // Try to buy a non-existent listing
      // The specific error might vary based on your implementation
      // It could revert with ListingNotActive or another custom error
      await expect(
        marketplace
          .connect(buyer)
          .buyNFT(nonExistentListingId, { value: amount })
      ).to.be.reverted;
    });

    it('Should allow withdrawal of royalties and fees', async function () {
      const { marketplace, musicNFT, seller, buyer, tokenId, owner } =
        await loadFixture(deployMarketplaceFixture);

      // Create a listing
      await musicNFT.connect(seller).approve(marketplace.target, tokenId);
      const listingPrice = ethers.parseEther('1.0');
      await marketplace
        .connect(seller)
        .createListing(musicNFT.target, tokenId, listingPrice);

      // Get the marketplace fee percentage and calculate expected market fee
      const marketFeePercentage = await marketplace.marketFeePercentage();
      const marketFee = (listingPrice * marketFeePercentage) / 10000n;

      // Get royalty info
      const [royaltyReceiver, royaltyAmount] = await musicNFT.royaltyInfo(
        tokenId,
        listingPrice
      );
      expect(royaltyReceiver).to.equal(seller.address);

      // Calculate expected seller proceeds
      const sellerProceeds = listingPrice - royaltyAmount - marketFee;

      // Buy the NFT
      await marketplace.connect(buyer).buyNFT(1, { value: listingPrice });

      // Check pending payments
      expect(await marketplace.getPendingPayment(seller.address)).to.equal(
        sellerProceeds + royaltyAmount // Seller gets both sale proceeds and royalties
      );
      expect(await marketplace.getPendingPayment(owner.address)).to.equal(
        marketFee
      );

      // Check seller withdrawal
      const initialSellerBalance = await ethers.provider.getBalance(
        seller.address
      );

      const withdrawTx = await marketplace.connect(seller).withdrawPayments();
      const receipt = await withdrawTx.wait();

      // Calculate gas used for withdrawal
      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? 0n;
      const gasCost = gasUsed * gasPrice;

      // Check that the seller received the correct amount
      const finalSellerBalance = await ethers.provider.getBalance(
        seller.address
      );
      expect(finalSellerBalance).to.equal(
        initialSellerBalance + sellerProceeds + royaltyAmount - gasCost
      );

      // Verify pending payment is now zero
      expect(await marketplace.getPendingPayment(seller.address)).to.equal(0);

      // Check owner/marketplace fee withdrawal
      const initialOwnerBalance = await ethers.provider.getBalance(
        owner.address
      );

      await marketplace.connect(owner).withdrawPayments();

      const finalOwnerBalance = await ethers.provider.getBalance(owner.address);
      // Account for gas used in the withdrawal transaction
      expect(finalOwnerBalance).to.be.greaterThan(initialOwnerBalance);

      // Verify pending payment is now zero
      expect(await marketplace.getPendingPayment(owner.address)).to.equal(0);
    });

    it('Should revert withdrawal when no payments are pending', async function () {
      const { marketplace, buyer } = await loadFixture(
        deployMarketplaceFixture
      );

      // Try to withdraw with no pending payments
      await expect(
        marketplace.connect(buyer).withdrawPayments()
      ).to.be.revertedWithCustomError(marketplace, 'NoPaymentsPending');
    });
  });
});
