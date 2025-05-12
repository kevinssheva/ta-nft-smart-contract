// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MusicNFT.sol";

contract NFTStreaming is Ownable, ReentrancyGuard {
    mapping(address => uint256) private _pendingPayments;

    // Map NFT contract address -> tokenId -> listen count
    mapping(address => mapping(uint256 => uint256)) private _listenCount;

    error NonexistentToken(address nftContract, uint256 tokenId);
    error InsufficientPayment();
    error NoPaymentsPending();
    error TransferFailed();
    error InvalidListenCount();
    error UnsupportedNFTContract(address nftContract);

    event BatchListensRecorded(
        address indexed nftContract,
        uint256 indexed tokenId,
        uint256 count,
        uint256 royaltyAmount
    );
    event PaymentWithdrawn(address indexed recipient, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function recordBatchListens(
        address nftContract,
        uint256 tokenId,
        uint256 count,
        uint256 amount
    ) external payable {
        if (!_tokenExists(nftContract, tokenId)) {
            revert NonexistentToken(nftContract, tokenId);
        }

        if (count == 0) {
            revert InvalidListenCount();
        }

        if (msg.value < amount) {
            revert InsufficientPayment();
        }

        _listenCount[nftContract][tokenId] += count;

        uint256 remainingAmount = amount;

        // Try to handle as MusicNFT
        try MusicNFT(nftContract).getStreamingRoyalty(tokenId) returns (
            uint256 royaltyPercentage
        ) {
            uint256 royaltyAmount = (amount * royaltyPercentage) / 10000;

            if (royaltyAmount > 0) {
                address tokenOwner = MusicNFT(nftContract).ownerOf(tokenId);
                _recordPayment(tokenOwner, royaltyAmount);
                remainingAmount -= royaltyAmount;
            }

            address creator = MusicNFT(nftContract).getCreator(tokenId);
            _recordPayment(creator, remainingAmount);
        } catch {
            // If it's not a MusicNFT, just send everything to the token owner
            address tokenOwner = MusicNFT(nftContract).ownerOf(tokenId);
            _recordPayment(tokenOwner, remainingAmount);
        }

        emit BatchListensRecorded(nftContract, tokenId, count, amount);

        uint256 excessAmount = msg.value - amount;
        if (excessAmount > 0) {
            (bool success, ) = msg.sender.call{value: excessAmount}("");
            if (!success) {
                revert TransferFailed();
            }
        }
    }

    function withdrawPayments() external nonReentrant returns (uint256) {
        uint256 amount = _pendingPayments[msg.sender];

        if (amount == 0) {
            revert NoPaymentsPending();
        }

        _pendingPayments[msg.sender] = 0;

        (bool success, ) = msg.sender.call{value: amount}("");
        if (!success) {
            revert TransferFailed();
        }

        emit PaymentWithdrawn(msg.sender, amount);
        return amount;
    }

    function getPendingPayment(
        address recipient
    ) external view returns (uint256) {
        return _pendingPayments[recipient];
    }

    function getListenCount(
        address nftContract,
        uint256 tokenId
    ) external view returns (uint256) {
        if (!_tokenExists(nftContract, tokenId)) {
            revert NonexistentToken(nftContract, tokenId);
        }

        return _listenCount[nftContract][tokenId];
    }

    function getTotalListenCount(
        address nftContract
    ) external view returns (uint256) {
        uint256 totalCount = 0;

        try MusicNFT(nftContract).getTotalSupply() returns (
            uint256 totalSupply
        ) {
            for (uint256 i = 1; i <= totalSupply; i++) {
                if (_tokenExists(nftContract, i)) {
                    totalCount += _listenCount[nftContract][i];
                }
            }
        } catch {
            revert UnsupportedNFTContract(nftContract);
        }

        return totalCount;
    }

    function getTopListenedTokens(
        address nftContract,
        uint256 limit
    )
        external
        view
        returns (uint256[] memory tokenIds, uint256[] memory listenCounts)
    {
        uint256 totalSupply;

        try MusicNFT(nftContract).getTotalSupply() returns (uint256 supply) {
            totalSupply = supply;
        } catch {
            revert UnsupportedNFTContract(nftContract);
        }

        uint256[] memory allTokenIds = new uint256[](totalSupply);
        uint256[] memory allListenCounts = new uint256[](totalSupply);

        uint256 validTokenCount = 0;
        for (uint256 i = 1; i <= totalSupply; i++) {
            if (
                _tokenExists(nftContract, i) && _listenCount[nftContract][i] > 0
            ) {
                allTokenIds[validTokenCount] = i;
                allListenCounts[validTokenCount] = _listenCount[nftContract][i];
                validTokenCount++;
            }
        }

        if (limit > validTokenCount) {
            limit = validTokenCount;
        }

        tokenIds = new uint256[](limit);
        listenCounts = new uint256[](limit);

        for (uint256 i = 0; i < limit; i++) {
            uint256 maxIndex = 0;
            uint256 maxValue = 0;

            for (uint256 j = 0; j < validTokenCount; j++) {
                if (allListenCounts[j] > maxValue) {
                    maxValue = allListenCounts[j];
                    maxIndex = j;
                }
            }

            tokenIds[i] = allTokenIds[maxIndex];
            listenCounts[i] = allListenCounts[maxIndex];

            allListenCounts[maxIndex] = 0;
        }

        return (tokenIds, listenCounts);
    }

    function getListenDataByCreator(
        address nftContract,
        address creator
    )
        external
        view
        returns (uint256[] memory tokenIds, uint256[] memory listenCounts)
    {
        try MusicNFT(nftContract).getTokensCreatedBy(creator) returns (
            uint256[] memory creatorTokens
        ) {
            tokenIds = new uint256[](creatorTokens.length);
            listenCounts = new uint256[](creatorTokens.length);

            for (uint256 i = 0; i < creatorTokens.length; i++) {
                tokenIds[i] = creatorTokens[i];
                listenCounts[i] = _listenCount[nftContract][creatorTokens[i]];
            }
        } catch {
            revert UnsupportedNFTContract(nftContract);
        }

        return (tokenIds, listenCounts);
    }

    function _recordPayment(address recipient, uint256 amount) internal {
        _pendingPayments[recipient] += amount;
    }

    function _tokenExists(
        address nftContract,
        uint256 tokenId
    ) internal view returns (bool) {
        try MusicNFT(nftContract).ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
}
