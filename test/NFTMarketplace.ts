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
    return { listingId: 1, price };
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
});
