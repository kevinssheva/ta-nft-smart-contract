// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MusicNFT is ERC721URIStorage, ERC2981, Ownable {
    uint256 public _tokenIds;

    struct SongEdition {
        string songId; // Unique identifier for the song
        uint256 editionNumber; // Edition number within the song series
        uint256 maxEditions; // Maximum number of editions for this song
    }

    // Mapping from token ID to streaming royalty percentage
    mapping(uint256 => uint256) private _streamingRoyalties;

    // Mapping from token ID to creator address
    mapping(uint256 => address) private _creators;

    // Mapping from token ID to song edition information
    mapping(uint256 => SongEdition) private _songEditions;

    // Mapping from song ID to the number of editions minted
    mapping(string => uint256) private _editionsMinted;

    // Mapping from song ID to the maximum number of editions
    mapping(string => uint256) private _maxEditions;

    error NonexistentToken(uint256 tokenId);
    error EmptyTokenURI();
    error EmptySongId();
    error MaxRoyaltyExceeded(uint256 percentage, uint256 maxAllowed);
    error NotAuthorized();
    error EditionLimitExceeded(
        string songId,
        uint256 minted,
        uint256 maxEditions
    );
    error InvalidEditionNumber();

    uint256 public constant MAX_ROYALTY_PERCENTAGE = 5000;

    event MetadataUpdated(uint256 indexed tokenId, string newTokenURI);
    event EditionMinted(
        uint256 indexed tokenId,
        string songId,
        uint256 editionNumber,
        uint256 maxEditions
    );

    constructor() ERC721("MusicNFT", "MUSIC") Ownable(msg.sender) {}

    /**
     * @dev Creates a new music NFT edition with specified royalty percentages
     * @param tokenURI URI for the token metadata
     * @param songId Unique identifier for the song
     * @param maxEditions Maximum number of editions to allow for this song
     * @param salesRoyaltyPercentage Percentage for sales royalties (in basis points, e.g. 500 = 5%)
     * @param streamingRoyaltyPercentage Percentage for streaming royalties (in basis points)
     * @return The ID of the newly minted token
     */
    function mintEdition(
        string memory tokenURI,
        string memory songId,
        uint256 maxEditions,
        uint256 salesRoyaltyPercentage,
        uint256 streamingRoyaltyPercentage
    ) public returns (uint256) {
        if (bytes(tokenURI).length == 0) {
            revert EmptyTokenURI();
        }

        if (bytes(songId).length == 0) {
            revert EmptySongId();
        }

        if (salesRoyaltyPercentage > MAX_ROYALTY_PERCENTAGE) {
            revert MaxRoyaltyExceeded(
                salesRoyaltyPercentage,
                MAX_ROYALTY_PERCENTAGE
            );
        }

        if (streamingRoyaltyPercentage > MAX_ROYALTY_PERCENTAGE) {
            revert MaxRoyaltyExceeded(
                streamingRoyaltyPercentage,
                MAX_ROYALTY_PERCENTAGE
            );
        }

        // If this is a new song, set the max editions
        if (_maxEditions[songId] == 0) {
            _maxEditions[songId] = maxEditions;
        } else {
            // For existing songs, use the already set max editions
            maxEditions = _maxEditions[songId];
        }

        // Check if we've reached the edition limit
        uint256 currentEdition = _editionsMinted[songId] + 1;
        if (currentEdition > maxEditions) {
            revert EditionLimitExceeded(
                songId,
                _editionsMinted[songId],
                maxEditions
            );
        }

        // Increment the token ID counter
        _tokenIds++;
        uint256 newItemId = _tokenIds;

        // Mint the token
        _mint(msg.sender, newItemId);
        _setTokenURI(newItemId, tokenURI);

        // Update the mappings
        _streamingRoyalties[newItemId] = streamingRoyaltyPercentage;
        _creators[newItemId] = msg.sender;
        _songEditions[newItemId] = SongEdition({
            songId: songId,
            editionNumber: currentEdition,
            maxEditions: maxEditions
        });

        // Update the editions counter
        _editionsMinted[songId] = currentEdition;

        // Set the royalty information
        _setTokenRoyalty(newItemId, msg.sender, uint96(salesRoyaltyPercentage));

        emit EditionMinted(newItemId, songId, currentEdition, maxEditions);

        return newItemId;
    }

    /**
     * @dev Legacy function for backward compatibility, creates a single edition
     */
    function mintNFT(
        string memory tokenURI,
        uint256 salesRoyaltyPercentage,
        uint256 streamingRoyaltyPercentage
    ) public returns (uint256) {
        // Generate a unique song ID based on sender and time
        string memory songId = string(
            abi.encodePacked(
                "song-",
                toString(uint160(msg.sender)),
                "-",
                toString(block.timestamp)
            )
        );

        // Mint as a single edition
        return
            mintEdition(
                tokenURI,
                songId,
                1, // Only one edition
                salesRoyaltyPercentage,
                streamingRoyaltyPercentage
            );
    }

    /**
     * @dev Get the song edition information for a token
     * @param tokenId The ID of the token
     * @return songId The unique identifier for the song
     * @return editionNumber The edition number within the song series
     * @return maxEditions The maximum number of editions for this song
     */
    function getEditionInfo(
        uint256 tokenId
    )
        public
        view
        returns (
            string memory songId,
            uint256 editionNumber,
            uint256 maxEditions
        )
    {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }

        SongEdition memory edition = _songEditions[tokenId];
        return (edition.songId, edition.editionNumber, edition.maxEditions);
    }

    /**
     * @dev Get the number of editions minted for a song
     * @param songId The unique identifier for the song
     * @return The number of editions minted
     */
    function getEditionsMinted(
        string memory songId
    ) public view returns (uint256) {
        return _editionsMinted[songId];
    }

    /**
     * @dev Get the maximum number of editions for a song
     * @param songId The unique identifier for the song
     * @return The maximum number of editions
     */
    function getMaxEditions(
        string memory songId
    ) public view returns (uint256) {
        return _maxEditions[songId];
    }

    // Helper function to convert address to string
    function toString(uint256 value) internal pure returns (string memory) {
        // This is a simplified version, for a more complete version see OpenZeppelin's implementation
        if (value == 0) {
            return "0";
        }

        uint256 temp = value;
        uint256 digits;

        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);

        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }

        return string(buffer);
    }

    function getStreamingRoyalty(
        uint256 tokenId
    ) public view returns (uint256) {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }
        return _streamingRoyalties[tokenId];
    }

    function getCreator(uint256 tokenId) public view returns (address) {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }
        return _creators[tokenId];
    }

    function updateTokenURI(
        uint256 tokenId,
        string memory newTokenURI
    ) external {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }

        if (
            _creators[tokenId] != msg.sender && ownerOf(tokenId) != msg.sender
        ) {
            revert NotAuthorized();
        }

        if (bytes(newTokenURI).length == 0) {
            revert EmptyTokenURI();
        }

        _setTokenURI(tokenId, newTokenURI);

        emit MetadataUpdated(tokenId, newTokenURI);
    }

    function _exists(uint256 tokenId) internal view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
