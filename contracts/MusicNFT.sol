// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MusicNFT is ERC721URIStorage, ERC2981, Ownable {
    uint256 private _tokenIds;

    mapping(uint256 => uint256) private _streamingRoyalties;
    mapping(uint256 => address) private _creators;

    constructor() ERC721("MusicNFT", "MUSIC") Ownable(msg.sender) {}

    function mintNFT(
        string memory tokenURI,
        uint256 salesRoyaltyPercentage,
        uint256 streamingRoyaltyPercentage
    ) public returns (uint256) {
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
        return _streamingRoyalties[tokenId];
    }

    function getCreator(uint256 tokenId) public view returns (address) {
        return _creators[tokenId];
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721URIStorage, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
