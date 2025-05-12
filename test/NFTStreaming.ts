import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import hre, { ethers } from 'hardhat';

describe('NFTStreaming', function () {
  async function deployStreamingFixture() {
    const [owner, creator, listener, newOwner] = await hre.ethers.getSigners();

    const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
    const musicNFT = await MusicNFT.deploy();

    const NFTStreaming = await hre.ethers.getContractFactory('NFTStreaming');
    const streaming = await NFTStreaming.deploy();

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
        musicNFT,
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
          .recordBatchListens(
            musicNFT.target,
            tokenId,
            listenCount,
            paymentAmount,
            {
              value: paymentAmount,
            }
          )
      )
        .to.emit(streaming, 'BatchListensRecorded')
        .withArgs(musicNFT.target, tokenId, listenCount, paymentAmount);

      expect(await streaming.getListenCount(musicNFT.target, tokenId)).to.equal(
        listenCount
      );

      const expectedCreatorPayment = royaltyAmount + remainingAmount;
      expect(await streaming.getPendingPayment(creator.address)).to.equal(
        expectedCreatorPayment
      );
    });

    it('Should handle excess payment correctly', async function () {
      const { streaming, musicNFT, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      const listenCount = 50;
      const paymentAmount = ethers.parseEther('1.0');
      const excessAmount = ethers.parseEther('0.5');
      const totalSent = paymentAmount + excessAmount;

      const initialBalance = await ethers.provider.getBalance(listener.address);

      const tx = await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          tokenId,
          listenCount,
          paymentAmount,
          {
            value: totalSent,
          }
        );
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
      const { streaming, musicNFT, listener } = await loadFixture(
        deployStreamingFixture
      );

      const nonExistentTokenId = 999;
      const listenCount = 10;
      const paymentAmount = ethers.parseEther('0.1');

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(
            musicNFT.target,
            nonExistentTokenId,
            listenCount,
            paymentAmount,
            {
              value: paymentAmount,
            }
          )
      ).to.be.revertedWithCustomError(streaming, 'NonexistentToken');
    });

    it('Should revert with insufficient payment', async function () {
      const { streaming, musicNFT, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      const listenCount = 10;
      const paymentAmount = ethers.parseEther('1.0');
      const insufficientPayment = ethers.parseEther('0.5');

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(
            musicNFT.target,
            tokenId,
            listenCount,
            paymentAmount,
            {
              value: insufficientPayment,
            }
          )
      ).to.be.revertedWithCustomError(streaming, 'InsufficientPayment');
    });

    it('Should revert with invalid listen count', async function () {
      const { streaming, musicNFT, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      const invalidListenCount = 0;
      const paymentAmount = ethers.parseEther('1.0');

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(
            musicNFT.target,
            tokenId,
            invalidListenCount,
            paymentAmount,
            {
              value: paymentAmount,
            }
          )
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
        .recordBatchListens(
          musicNFT.target,
          tokenId,
          listenCount,
          paymentAmount,
          {
            value: paymentAmount,
          }
        );

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
      const { streaming, musicNFT, creator, listener, tokenId } =
        await loadFixture(deployStreamingFixture);

      const listenCount = 100;
      const paymentAmount = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          tokenId,
          listenCount,
          paymentAmount,
          {
            value: paymentAmount,
          }
        );

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

  describe('Query Operations', function () {
    it('Should get total listen count correctly', async function () {
      const { streaming, musicNFT, listener, tokenId } = await loadFixture(
        deployStreamingFixture
      );

      // Initial count should be 0
      expect(await streaming.getTotalListenCount(musicNFT.target)).to.equal(0);

      // Record batch listens for the token
      const listenCount1 = 100;
      const paymentAmount1 = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          tokenId,
          listenCount1,
          paymentAmount1,
          {
            value: paymentAmount1,
          }
        );

      // Total count should equal the first batch
      expect(await streaming.getTotalListenCount(musicNFT.target)).to.equal(
        listenCount1
      );

      // Add more listens
      const listenCount2 = 50;
      const paymentAmount2 = ethers.parseEther('0.5');
      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          tokenId,
          listenCount2,
          paymentAmount2,
          {
            value: paymentAmount2,
          }
        );

      // Total count should accumulate
      expect(await streaming.getTotalListenCount(musicNFT.target)).to.equal(
        listenCount1 + listenCount2
      );
    });

    it('Should handle total listen count with multiple tokens', async function () {
      const { streaming, musicNFT, creator, listener } = await loadFixture(
        deployStreamingFixture
      );

      // Create a second token
      const tokenURI2 = 'https://example.com/token/2';
      const salesRoyaltyPercentage = 500;
      const streamingRoyaltyPercentage = 3000;
      await musicNFT
        .connect(creator)
        .mintNFT(tokenURI2, salesRoyaltyPercentage, streamingRoyaltyPercentage);
      const tokenId1 = 1;
      const tokenId2 = 2;

      // Record listens for first token
      const listenCount1 = 100;
      const paymentAmount1 = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          tokenId1,
          listenCount1,
          paymentAmount1,
          {
            value: paymentAmount1,
          }
        );

      // Record listens for second token
      const listenCount2 = 200;
      const paymentAmount2 = ethers.parseEther('2.0');
      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          tokenId2,
          listenCount2,
          paymentAmount2,
          {
            value: paymentAmount2,
          }
        );

      // Total count should include both tokens
      expect(await streaming.getTotalListenCount(musicNFT.target)).to.equal(
        listenCount1 + listenCount2
      );

      // Individual token counts should be correct
      expect(
        await streaming.getListenCount(musicNFT.target, tokenId1)
      ).to.equal(listenCount1);
      expect(
        await streaming.getListenCount(musicNFT.target, tokenId2)
      ).to.equal(listenCount2);
    });

    it('Should get top listened tokens correctly', async function () {
      const { streaming, musicNFT, creator, listener } = await loadFixture(
        deployStreamingFixture
      );

      // Create additional tokens
      for (let i = 0; i < 4; i++) {
        await musicNFT
          .connect(creator)
          .mintNFT(`https://example.com/token/${i + 2}`, 500, 3000);
      }

      // Record different listen counts for each token (5 tokens total)
      const listenCounts = [150, 300, 100, 500, 200];

      for (let i = 0; i < 5; i++) {
        const tokenId = i + 1;
        const listens = listenCounts[i];
        const payment = ethers.parseEther(`${listens / 100}`);

        await streaming
          .connect(listener)
          .recordBatchListens(musicNFT.target, tokenId, listens, payment, {
            value: payment,
          });
      }

      // Get top 3 tokens
      const [tokenIds, counts] = await streaming.getTopListenedTokens(
        musicNFT.target,
        3
      );

      // Should return 3 tokens
      expect(tokenIds.length).to.equal(3);
      expect(counts.length).to.equal(3);

      // First should be token 4 with 500 listens
      expect(tokenIds[0]).to.equal(4);
      expect(counts[0]).to.equal(500);

      // Second should be token 2 with 300 listens
      expect(tokenIds[1]).to.equal(2);
      expect(counts[1]).to.equal(300);

      // Third should be token 5 with 200 listens
      expect(tokenIds[2]).to.equal(5);
      expect(counts[2]).to.equal(200);
    });

    it('Should handle limit larger than number of tokens in getTopListenedTokens', async function () {
      const { streaming, musicNFT, creator, listener } = await loadFixture(
        deployStreamingFixture
      );

      // Create one additional token
      await musicNFT
        .connect(creator)
        .mintNFT('https://example.com/token/2', 500, 3000);

      // Record listens for both tokens
      const listenCount1 = 100;
      const listenCount2 = 200;

      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          1,
          listenCount1,
          ethers.parseEther('1.0'),
          {
            value: ethers.parseEther('1.0'),
          }
        );

      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          2,
          listenCount2,
          ethers.parseEther('2.0'),
          {
            value: ethers.parseEther('2.0'),
          }
        );

      // Request top 10 tokens when only 2 exist
      const [tokenIds, counts] = await streaming.getTopListenedTokens(
        musicNFT.target,
        10
      );

      // Should return only 2 tokens
      expect(tokenIds.length).to.equal(2);

      // First should be token 2 with more listens
      expect(tokenIds[0]).to.equal(2);
      expect(counts[0]).to.equal(listenCount2);

      // Second should be token 1 with fewer listens
      expect(tokenIds[1]).to.equal(1);
      expect(counts[1]).to.equal(listenCount1);
    });

    it('Should get listen data by creator correctly', async function () {
      const { streaming, musicNFT, creator, listener, newOwner } =
        await loadFixture(deployStreamingFixture);

      // Create a second token with a different creator
      const tokenURI2 = 'https://example.com/token/2';
      await musicNFT.connect(newOwner).mintNFT(tokenURI2, 500, 3000);

      // Record listens for both tokens
      const listenCount1 = 100;
      const listenCount2 = 200;

      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          1,
          listenCount1,
          ethers.parseEther('1.0'),
          {
            value: ethers.parseEther('1.0'),
          }
        );

      await streaming
        .connect(listener)
        .recordBatchListens(
          musicNFT.target,
          2,
          listenCount2,
          ethers.parseEther('2.0'),
          {
            value: ethers.parseEther('2.0'),
          }
        );

      // Get creator data for first creator
      const [creatorTokenIds, creatorListenCounts] =
        await streaming.getListenDataByCreator(
          musicNFT.target,
          creator.address
        );

      // Should only return the token created by this creator
      expect(creatorTokenIds.length).to.equal(1);
      expect(creatorTokenIds[0]).to.equal(1);
      expect(creatorListenCounts[0]).to.equal(listenCount1);

      // Get creator data for second creator
      const [creator2TokenIds, creator2ListenCounts] =
        await streaming.getListenDataByCreator(
          musicNFT.target,
          newOwner.address
        );

      // Should only return the token created by the second creator
      expect(creator2TokenIds.length).to.equal(1);
      expect(creator2TokenIds[0]).to.equal(2);
      expect(creator2ListenCounts[0]).to.equal(listenCount2);
    });

    it('Should get total pending payments correctly', async function () {
      const { streaming, musicNFT, creator, listener, newOwner } =
        await loadFixture(deployStreamingFixture);

      // Transfer token to new owner to test royalty split
      await musicNFT
        .connect(creator)
        .transferFrom(creator.address, newOwner.address, 1);

      // Record batch listens
      const listenCount = 100;
      const paymentAmount = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 1, listenCount, paymentAmount, {
          value: paymentAmount,
        });

      // Check creator payments
      const creatorPayment = await streaming.getPendingPayment(creator.address);
      expect(creatorPayment).to.be.gt(0);

      // Check owner payments
      const ownerPayment = await streaming.getPendingPayment(newOwner.address);
      expect(ownerPayment).to.be.gt(0);

      // After one party withdraws, their payment should be zero
      await streaming.connect(creator).withdrawPayments();
      expect(await streaming.getPendingPayment(creator.address)).to.equal(0);
      expect(await streaming.getPendingPayment(newOwner.address)).to.equal(
        ownerPayment
      );

      // After all withdrawals, all payments should be zero
      await streaming.connect(newOwner).withdrawPayments();
      expect(await streaming.getPendingPayment(newOwner.address)).to.equal(0);
    });
  });
});
