// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MusicNFT is ERC721URIStorage, ERC2981, Ownable {
    uint256 private _tokenIds;

    mapping(uint256 => uint256) private _streamingRoyalties;
    mapping(uint256 => address) private _creators;
    mapping(address => uint256[]) private _ownedTokens;
    mapping(uint256 => uint256) private _ownedTokensIndex;

    uint256 public constant MAX_ROYALTY_PERCENTAGE = 5000;

    error NonexistentToken(uint256 tokenId);
    error EmptyTokenURI();
    error MaxRoyaltyExceeded(uint256 percentage, uint256 maxAllowed);
    error NotAuthorized();

    event NFTMinted(
        uint256 indexed tokenId,
        address indexed creator,
        string tokenURI,
        uint256 salesRoyaltyPercentage,
        uint256 streamingRoyaltyPercentage
    );

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

        emit NFTMinted(
            newItemId,
            msg.sender,
            tokenURI,
            salesRoyaltyPercentage,
            streamingRoyaltyPercentage
        );

        return newItemId;
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

    function getStreamingRoyalty(
        uint256 tokenId
    ) public view returns (uint256) {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }
        return _streamingRoyalties[tokenId];
    }

    function getSalesRoyalty(
        uint256 tokenId
    ) public view returns (address receiver, uint256 royaltyAmount) {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }
        return royaltyInfo(tokenId, 10000);
    }

    function getCreator(uint256 tokenId) public view returns (address) {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }
        return _creators[tokenId];
    }

    function getTokensOfOwner(
        address owner
    ) public view returns (uint256[] memory) {
        return _ownedTokens[owner];
    }

    function getTokensCreatedBy(
        address creator
    ) public view returns (uint256[] memory) {
        uint256[] memory result = new uint256[](getTotalSupply());
        uint256 count = 0;

        for (uint256 i = 1; i <= _tokenIds; i++) {
            if (_exists(i) && _creators[i] == creator) {
                result[count] = i;
                count++;
            }
        }

        // Resize array to the actual count
        uint256[] memory tokensCreated = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            tokensCreated[i] = result[i];
        }

        return tokensCreated;
    }

    function getTokenDetails(
        uint256 tokenId
    )
        public
        view
        returns (
            address creator,
            address currentOwner,
            uint256 streamingRoyaltyPercentage,
            address salesRoyaltyReceiver,
            uint256 salesRoyaltyPercentage
        )
    {
        if (!_exists(tokenId)) {
            revert NonexistentToken(tokenId);
        }

        creator = _creators[tokenId];
        currentOwner = ownerOf(tokenId);
        streamingRoyaltyPercentage = _streamingRoyalties[tokenId];

        (salesRoyaltyReceiver, salesRoyaltyPercentage) = royaltyInfo(
            tokenId,
            10000
        );
        salesRoyaltyPercentage = (salesRoyaltyPercentage * 10000) / 10000; // Normalize to percentage

        return (
            creator,
            currentOwner,
            streamingRoyaltyPercentage,
            salesRoyaltyReceiver,
            salesRoyaltyPercentage
        );
    }

    function getTotalSupply() public view returns (uint256) {
        return _tokenIds;
    }

    function tokenExists(uint256 tokenId) public view returns (bool) {
        return _exists(tokenId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = super._update(to, tokenId, auth);

        if (from != address(0)) {
            uint256 fromIndex = _ownedTokensIndex[tokenId];
            uint256 lastTokenIndex = _ownedTokens[from].length - 1;

            if (fromIndex != lastTokenIndex) {
                uint256 lastTokenId = _ownedTokens[from][lastTokenIndex];
                _ownedTokens[from][fromIndex] = lastTokenId;
                _ownedTokensIndex[lastTokenId] = fromIndex;
            }

            _ownedTokens[from].pop();
        }

        if (to != address(0)) {
            _ownedTokens[to].push(tokenId);
            _ownedTokensIndex[tokenId] = _ownedTokens[to].length - 1;
        }

        return from;
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
