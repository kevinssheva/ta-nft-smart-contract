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
      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 1, 100, ethers.parseEther('1.0'), {
          value: ethers.parseEther('1.0'),
        });

      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 2, 200, ethers.parseEther('2.0'), {
          value: ethers.parseEther('2.0'),
        });

      // Request more tokens than available
      const [tokenIds, counts] = await streaming.getTopListenedTokens(
        musicNFT.target,
        10
      );

      // Should return only the available tokens
      expect(tokenIds.length).to.equal(2);
      expect(counts.length).to.equal(2);
    });

    it('Should get listen data by creator correctly', async function () {
      const { streaming, musicNFT, creator, listener } = await loadFixture(
        deployStreamingFixture
      );

      const [, , , secondCreator] = await ethers.getSigners();

      // Create tokens by different creators
      await musicNFT
        .connect(creator)
        .mintNFT('https://example.com/token/2', 500, 3000);

      await musicNFT
        .connect(secondCreator)
        .mintNFT('https://example.com/token/3', 500, 3000);

      // Record listens for tokens
      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 1, 100, ethers.parseEther('1.0'), {
          value: ethers.parseEther('1.0'),
        });

      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 2, 150, ethers.parseEther('1.5'), {
          value: ethers.parseEther('1.5'),
        });

      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 3, 200, ethers.parseEther('2.0'), {
          value: ethers.parseEther('2.0'),
        });

      // Get listen data for first creator
      const [creatorTokens, creatorListens] =
        await streaming.getListenDataByCreator(
          musicNFT.target,
          creator.address
        );

      expect(creatorTokens.length).to.equal(2);
      expect(creatorTokens[0]).to.equal(1);
      expect(creatorTokens[1]).to.equal(2);
      expect(creatorListens[0]).to.equal(100);
      expect(creatorListens[1]).to.equal(150);

      // Get listen data for second creator
      const [secondCreatorTokens, secondCreatorListens] =
        await streaming.getListenDataByCreator(
          musicNFT.target,
          secondCreator.address
        );

      expect(secondCreatorTokens.length).to.equal(1);
      expect(secondCreatorTokens[0]).to.equal(3);
      expect(secondCreatorListens[0]).to.equal(200);
    });

    it('Should get total pending payments correctly', async function () {
      const { streaming, musicNFT, creator, listener, newOwner } =
        await loadFixture(deployStreamingFixture);

      // Transfer token to new owner
      await musicNFT
        .connect(creator)
        .transferFrom(creator.address, newOwner.address, 1);

      // Record listens which will create pending payments
      const paymentAmount = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 1, 100, paymentAmount, {
          value: paymentAmount,
        });

      // Calculate expected payments
      const streamingRoyaltyPercentage = 3000;
      const royaltyAmount =
        (paymentAmount * BigInt(streamingRoyaltyPercentage)) / 10000n;
      const remainingAmount = paymentAmount - royaltyAmount;

      // Check individual pending payments
      expect(await streaming.getPendingPayment(newOwner.address)).to.equal(
        royaltyAmount
      );
      expect(await streaming.getPendingPayment(creator.address)).to.equal(
        remainingAmount
      );
    });

    it('Should handle edge case with zero listen count in recordBatchListens', async function () {
      const { streaming, musicNFT, listener } = await loadFixture(
        deployStreamingFixture
      );

      await expect(
        streaming
          .connect(listener)
          .recordBatchListens(musicNFT.target, 1, 0, ethers.parseEther('1.0'), {
            value: ethers.parseEther('1.0'),
          })
      ).to.be.revertedWithCustomError(streaming, 'InvalidListenCount');
    });

    it('Should handle token that is transferred after recording listens', async function () {
      const { streaming, musicNFT, creator, listener, newOwner } =
        await loadFixture(deployStreamingFixture);

      // Record listens while creator owns token
      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 1, 100, ethers.parseEther('1.0'), {
          value: ethers.parseEther('1.0'),
        });

      // Transfer token to new owner
      await musicNFT
        .connect(creator)
        .transferFrom(creator.address, newOwner.address, 1);

      // Record more listens with new owner
      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 1, 50, ethers.parseEther('0.5'), {
          value: ethers.parseEther('0.5'),
        });

      // Total listen count should be cumulative
      expect(await streaming.getListenCount(musicNFT.target, 1)).to.equal(150);
    });

    it('Should handle getListenDataByCreator with no tokens for creator', async function () {
      const { streaming, musicNFT, listener } = await loadFixture(
        deployStreamingFixture
      );

      const [, , , randomCreator] = await ethers.getSigners();

      // Get listen data for creator who has no tokens
      const [tokens, listens] = await streaming.getListenDataByCreator(
        musicNFT.target,
        randomCreator.address
      );

      expect(tokens.length).to.equal(0);
      expect(listens.length).to.equal(0);
    });

    it('Should handle getTopListenedTokens with no tokens', async function () {
      const { streaming } = await loadFixture(deployStreamingFixture);

      // Deploy a new NFT contract with no tokens
      const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
      const emptyNFT = await MusicNFT.deploy();

      const [tokenIds, counts] = await streaming.getTopListenedTokens(
        emptyNFT.target,
        5
      );

      expect(tokenIds.length).to.equal(0);
      expect(counts.length).to.equal(0);
    });

    it('Should handle getTotalListenCount with contract that has no listens', async function () {
      const { streaming } = await loadFixture(deployStreamingFixture);

      // Deploy a new NFT contract
      const MusicNFT = await hre.ethers.getContractFactory('MusicNFT');
      const newNFT = await MusicNFT.deploy();

      expect(await streaming.getTotalListenCount(newNFT.target)).to.equal(0);
    });

    it('Should handle same owner and creator royalty distribution', async function () {
      const {
        streaming,
        musicNFT,
        creator,
        listener,
        streamingRoyaltyPercentage,
      } = await loadFixture(deployStreamingFixture);

      // Creator is also the owner, so should get all payments
      const paymentAmount = ethers.parseEther('1.0');
      await streaming
        .connect(listener)
        .recordBatchListens(musicNFT.target, 1, 100, paymentAmount, {
          value: paymentAmount,
        });

      // Creator should get the full payment amount
      expect(await streaming.getPendingPayment(creator.address)).to.equal(
        paymentAmount
      );
    });
  });
});
