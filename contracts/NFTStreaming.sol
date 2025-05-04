// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MusicNFT.sol";

contract NFTStreaming is Ownable, ReentrancyGuard {
    // Mapping for pending payments for each address
    mapping(address => uint256) private _pendingPayments;

    // Mapping to track listen count per token
    mapping(uint256 => uint256) private _listenCount;

    // Mapping to track total listen count per song
    mapping(string => uint256) private _songListenCount;

    // Reference to the MusicNFT contract
    MusicNFT private _musicNFT;

    // Custom errors
    error NonexistentToken(uint256 tokenId);
    error InsufficientPayment();
    error NoPaymentsPending();
    error TransferFailed();
    error InvalidListenCount();
    error EmptySongId();

    // Events
    event BatchListensRecorded(
        uint256 indexed tokenId,
        string songId,
        uint256 count,
        uint256 royaltyAmount
    );

    event PaymentWithdrawn(address indexed recipient, uint256 amount);

    constructor(address musicNFTAddress) Ownable(msg.sender) {
        _musicNFT = MusicNFT(musicNFTAddress);
    }

    /**
     * @dev Records batch listens for a token and distributes streaming royalties
     * Royalties are distributed among all holders of the same song NFTs
     * @param tokenId The token ID that was listened to
     * @param count The number of listens to record
     * @param amount The payment amount for these listens
     */
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

        // Get song ID and edition info for this token
        (string memory songId, , uint256 maxEditions) = _musicNFT
            .getEditionInfo(tokenId);

        if (bytes(songId).length == 0) {
            revert EmptySongId();
        }

        // Update listen counts
        _listenCount[tokenId] += count;
        _songListenCount[songId] += count;

        // Calculate total royalty amount
        uint256 royaltyPercentage = _musicNFT.getStreamingRoyalty(tokenId);
        uint256 totalRoyaltyAmount = (amount * royaltyPercentage) / 10000;
        uint256 remainingAmount = amount - totalRoyaltyAmount;

        // Get creator who will receive the non-royalty portion
        address creator = _musicNFT.getCreator(tokenId);

        // Distribute royalties among all editions of this song
        _distributeRoyaltiesForSong(songId, totalRoyaltyAmount);

        // Creator gets the remaining amount
        _recordPayment(creator, remainingAmount);

        emit BatchListensRecorded(tokenId, songId, count, totalRoyaltyAmount);

        // Return excess payment
        uint256 excessAmount = msg.value - amount;
        if (excessAmount > 0) {
            (bool success, ) = msg.sender.call{value: excessAmount}("");
            if (!success) {
                revert TransferFailed();
            }
        }
    }

    /**
     * @dev Internal function to distribute royalties among all holders of a song's NFTs
     * @param songId The song ID to distribute royalties for
     * @param totalRoyaltyAmount The total royalty amount to distribute
     */
    function _distributeRoyaltiesForSong(
        string memory songId,
        uint256 totalRoyaltyAmount
    ) internal {
        // Get total minted editions for this song
        uint256 totalEditions = _musicNFT.getEditionsMinted(songId);
        if (totalEditions == 0) return;

        // Calculate per-edition royalty
        uint256 royaltyPerEdition = totalRoyaltyAmount / totalEditions;

        // Distribute to each edition owner
        for (uint256 i = 1; i <= totalEditions; i++) {
            // We need to find the token ID for this edition
            // This is a simplified approach - in a production environment,
            // you might want to use a mapping to efficiently locate token IDs by song and edition
            uint256 currentTokenId = _findTokenIdForSongEdition(songId, i);

            if (currentTokenId > 0) {
                address editionOwner = _musicNFT.ownerOf(currentTokenId);
                _recordPayment(editionOwner, royaltyPerEdition);
            }
        }
    }

    /**
     * @dev Helper function to find a token ID for a specific song and edition
     * Note: This is a simplified implementation and might be gas-intensive for contracts with many tokens
     * In production, consider maintaining an index of token IDs by song and edition
     * @param songId The song ID to look for
     * @param editionNumber The edition number to look for
     * @return The token ID if found, 0 otherwise
     */
    function _findTokenIdForSongEdition(
        string memory songId,
        uint256 editionNumber
    ) internal view returns (uint256) {
        // Get the total number of tokens
        uint256 totalTokens = _musicNFT._tokenIds();

        // Iterate through tokens (starting from 1 since token IDs typically start at 1)
        for (uint256 id = 1; id <= totalTokens; id++) {
            try _musicNFT.ownerOf(id) returns (address) {
                // Token exists, check if it matches our criteria
                try _musicNFT.getEditionInfo(id) returns (
                    string memory tokenSongId,
                    uint256 tokenEditionNumber,
                    uint256 tokenMaxEditions
                ) {
                    if (
                        _stringsEqual(tokenSongId, songId) &&
                        tokenEditionNumber == editionNumber
                    ) {
                        return id;
                    }
                } catch {
                    // Skip if getEditionInfo fails
                }
            } catch {
                // Skip if token doesn't exist
            }
        }

        return 0; // Not found
    }

    /**
     * @dev Helper function to compare two strings
     * @param a First string
     * @param b Second string
     * @return True if strings are equal, false otherwise
     */
    function _stringsEqual(
        string memory a,
        string memory b
    ) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    // Get all token IDs for a given song
    function getTokenIdsForSong(
        string memory songId
    ) public view returns (uint256[] memory) {
        uint256 totalEditions = _musicNFT.getEditionsMinted(songId);
        if (totalEditions == 0) return new uint256[](0);

        uint256[] memory tokenIds = new uint256[](totalEditions);
        uint256 foundCount = 0;

        // Get the total number of tokens
        uint256 totalTokens = _musicNFT._tokenIds();

        // Iterate through tokens
        for (
            uint256 id = 1;
            id <= totalTokens && foundCount < totalEditions;
            id++
        ) {
            try _musicNFT.ownerOf(id) returns (address) {
                try _musicNFT.getEditionInfo(id) returns (
                    string memory tokenSongId,
                    uint256 tokenEditionNumber,
                    uint256 tokenMaxEditions
                ) {
                    if (_stringsEqual(tokenSongId, songId)) {
                        tokenIds[foundCount] = id;
                        foundCount++;
                    }
                } catch {
                    // Skip if getEditionInfo fails
                }
            } catch {
                // Skip if token doesn't exist
            }
        }

        return tokenIds;
    }

    /**
     * @dev Get the total listen count for a song across all editions
     * @param songId The song ID to check
     * @return The total number of listens for the song
     */
    function getSongListenCount(
        string memory songId
    ) public view returns (uint256) {
        return _songListenCount[songId];
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
        if (amount > 0 && recipient != address(0)) {
            _pendingPayments[recipient] += amount;
        }
    }

    function _tokenExists(uint256 tokenId) internal view returns (bool) {
        try _musicNFT.ownerOf(tokenId) returns (address) {
            return true;
        } catch {
            return false;
        }
    }
}
