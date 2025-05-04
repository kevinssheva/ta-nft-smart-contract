// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MusicNFT.sol";

contract NFTStreaming is Ownable, ReentrancyGuard {
    mapping(address => uint256) private _pendingPayments;

    mapping(uint256 => uint256) private _listenCount;

    MusicNFT private _musicNFT;

    error NonexistentToken(uint256 tokenId);
    error InsufficientPayment();
    error NoPaymentsPending();
    error TransferFailed();
    error InvalidListenCount();

    event BatchListensRecorded(
        uint256 indexed tokenId,
        uint256 count,
        uint256 royaltyAmount
    );
    event PaymentWithdrawn(address indexed recipient, uint256 amount);

    constructor(address musicNFTAddress) Ownable(msg.sender) {
        _musicNFT = MusicNFT(musicNFTAddress);
    }

    function recordBatchListens(
        uint256 tokenId,
        uint256 count,
        uint256 amount
    ) external payable {
        if (!_tokenExists(tokenId)) {
            revert NonexistentToken(tokenId);
        }

        if (count == 0) {
            revert InvalidListenCount();
        }

        if (msg.value < amount) {
            revert InsufficientPayment();
        }

        _listenCount[tokenId] += count;

        uint256 remainingAmount = amount;

        uint256 royaltyPercentage = _musicNFT.getStreamingRoyalty(tokenId);
        uint256 royaltyAmount = (amount * royaltyPercentage) / 10000;

        if (royaltyAmount > 0) {
            address tokenOwner = _musicNFT.ownerOf(tokenId);
            _recordPayment(tokenOwner, royaltyAmount);
            remainingAmount -= royaltyAmount;
        }

        address creator = _musicNFT.getCreator(tokenId);
        _recordPayment(creator, remainingAmount);

        emit BatchListensRecorded(tokenId, count, amount);

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

    function getListenCount(uint256 tokenId) external view returns (uint256) {
        if (!_tokenExists(tokenId)) {
            revert NonexistentToken(tokenId);
        }

        return _listenCount[tokenId];
    }

    function _recordPayment(address recipient, uint256 amount) internal {
        _pendingPayments[recipient] += amount;
    }

    function _tokenExists(uint256 tokenId) internal view returns (bool) {
        try _musicNFT.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
}
