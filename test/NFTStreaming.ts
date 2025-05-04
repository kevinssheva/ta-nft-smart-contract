import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

describe('NFTStreaming', function () {
  async function deployStreamingFixture() {
    const [owner, creator, listener, newOwner] = await hre.ethers.getSigners();

    const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
    const musicNFT = await MusicNFT.deploy();

    const NFTStreaming = await hre.ethers.getContractFactory('NFTStreaming');
    const streaming = await NFTStreaming.deploy(musicNFT.target);

    const tokenURI = 'https://example.com/token/1';
    const salesRoyaltyPercentage = 500;
    const streamingRoyaltyPercentage = 3000;

    await musicNFT
      .connect(creator)
      .mintNFT(tokenURI, salesRoyaltyPercentage, streamingRoyaltyPercentage);

    const tokenId = 1;

    return {
      streaming,
      musicNFT,
      owner,
      creator,
      listener,
      newOwner,
      tokenId,
      streamingRoyaltyPercentage,
    };
  }

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      const { streaming, owner } = await loadFixture(deployStreamingFixture);
      expect(await streaming.owner()).to.equal(owner.address);
    });
  });

  describe('Recording Listens', function () {
    it('Should record batch listens correctly', async function () {
      const {
        streaming,
        creator,
        listener,
        tokenId,
        streamingRoyaltyPercentage,
      } = await loadFixture(deployStreamingFixture);

      const listenCount = 100;
      const paymentAmount = ethers.parseEther('1.0');

      const royaltyAmount =
        (paymentAmount * BigInt(streamingRoyaltyPercentage)) / 10000n;
      const remainingAmount = paymentAmount - royaltyAmount;

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(tokenId, listenCount, paymentAmount, {
            value: paymentAmount,
          })
      )
        .to.emit(streaming, 'BatchListensRecorded')
        .withArgs(tokenId, listenCount, paymentAmount);

      expect(await streaming.getListenCount(tokenId)).to.equal(listenCount);

      const expectedCreatorPayment = royaltyAmount + remainingAmount;
      expect(await streaming.getPendingPayment(creator.address)).to.equal(
        expectedCreatorPayment
      );
    });

    it('Should handle excess payment correctly', async function () {
      const { streaming, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      const listenCount = 50;
      const paymentAmount = ethers.parseEther('1.0');
      const excessAmount = ethers.parseEther('0.5');
      const totalSent = paymentAmount + excessAmount;

      const initialBalance = await ethers.provider.getBalance(listener.address);

      const tx = await streaming
        .connect(listener)
        .recordBatchListens(tokenId, listenCount, paymentAmount, {
          value: totalSent,
        });
      const receipt = await tx.wait();

      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? 0n;
      const gasCost = gasUsed * gasPrice;

      const finalBalance = await ethers.provider.getBalance(listener.address);
      const expectedBalance = initialBalance - paymentAmount - gasCost;

      const difference = expectedBalance - finalBalance;
      expect(difference).to.be.lessThan(1000000n);
    });

    it('Should revert when token does not exist', async function () {
      const { streaming, listener } = await loadFixture(deployStreamingFixture);

      const nonExistentTokenId = 999;
      const listenCount = 10;
      const paymentAmount = ethers.parseEther('0.1');

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(nonExistentTokenId, listenCount, paymentAmount, {
            value: paymentAmount,
          })
      ).to.be.revertedWithCustomError(streaming, 'NonexistentToken');
    });

    it('Should revert with insufficient payment', async function () {
      const { streaming, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      const listenCount = 10;
      const paymentAmount = ethers.parseEther('1.0');
      const insufficientPayment = ethers.parseEther('0.5');

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(tokenId, listenCount, paymentAmount, {
            value: insufficientPayment,
          })
      ).to.be.revertedWithCustomError(streaming, 'InsufficientPayment');
    });

    it('Should revert with invalid listen count', async function () {
      const { streaming, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      const invalidListenCount = 0;
      const paymentAmount = ethers.parseEther('1.0');

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(tokenId, invalidListenCount, paymentAmount, {
            value: paymentAmount,
          })
      ).to.be.revertedWithCustomError(streaming, 'InvalidListenCount');
    });
  });

  describe('Royalty Distribution', function () {
    it('Should distribute royalties to token owner and creator correctly', async function () {
      const {
        streaming,
        musicNFT,
        creator,
        listener,
        newOwner,
        tokenId,
        streamingRoyaltyPercentage,
      } = await loadFixture(deployStreamingFixture);

      await musicNFT
        .connect(creator)
        .transferFrom(creator.address, newOwner.address, tokenId);

      const listenCount = 50;
      const paymentAmount = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(tokenId, listenCount, paymentAmount, {
          value: paymentAmount,
        });

      const royaltyAmount =
        (paymentAmount * BigInt(streamingRoyaltyPercentage)) / 10000n;
      const remainingAmount = paymentAmount - royaltyAmount;

      expect(await streaming.getPendingPayment(newOwner.address)).to.equal(
        royaltyAmount
      );
      expect(await streaming.getPendingPayment(creator.address)).to.equal(
        remainingAmount
      );
    });

    it('Should allow withdrawal of streaming royalties', async function () {
      const { streaming, creator, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      const listenCount = 100;
      const paymentAmount = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(tokenId, listenCount, paymentAmount, {
          value: paymentAmount,
        });

      const pendingRoyalties = await streaming.getPendingPayment(
        creator.address
      );
      expect(pendingRoyalties).to.be.gt(0);

      const initialBalance = await ethers.provider.getBalance(creator.address);

      const withdrawTx = await streaming.connect(creator).withdrawPayments();
      const receipt = await withdrawTx.wait();

      const gasUsed = receipt?.gasUsed ?? 0n;
      const gasPrice = receipt?.gasPrice ?? 0n;
      const gasCost = gasUsed * gasPrice;

      const finalBalance = await ethers.provider.getBalance(creator.address);
      expect(finalBalance).to.equal(
        initialBalance + pendingRoyalties - gasCost
      );

      expect(await streaming.getPendingPayment(creator.address)).to.equal(0);
    });

    it('Should revert withdrawal when no payments are pending', async function () {
      const { streaming, listener } = await loadFixture(deployStreamingFixture);

      await expect(
        streaming.connect(listener).withdrawPayments()
      ).to.be.revertedWithCustomError(streaming, 'NoPaymentsPending');
    });
  });
});
