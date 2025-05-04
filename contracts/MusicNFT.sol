// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MusicNFT is ERC721URIStorage, ERC2981, Ownable {
    uint256 private _tokenIds;

    mapping(uint256 => uint256) private _streamingRoyalties;
    mapping(uint256 => address) private _creators;

    error NonexistentToken(uint256 tokenId);
    error EmptyTokenURI();
    error MaxRoyaltyExceeded(uint256 percentage, uint256 maxAllowed);
    error NotAuthorized();

    uint256 public constant MAX_ROYALTY_PERCENTAGE = 5000;

    event MetadataUpdated(uint256 indexed tokenId, string newTokenURI);

    constructor() ERC721("MusicNFT", "MUSIC") Ownable(msg.sender) {}

    function mintNFT(
        string memory tokenURI,
        uint256 salesRoyaltyPercentage,
        uint256 streamingRoyaltyPercentage
    ) public returns (uint256) {
        if (bytes(tokenURI).length == 0) {
            revert EmptyTokenURI();
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

        _tokenIds++;
        uint256 newItemId = _tokenIds;

        _mint(msg.sender, newItemId);
        _setTokenURI(newItemId, tokenURI);

        _streamingRoyalties[newItemId] = streamingRoyaltyPercentage;
        _creators[newItemId] = msg.sender;

        _setTokenRoyalty(newItemId, msg.sender, uint96(salesRoyaltyPercentage));

        return newItemId;
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
