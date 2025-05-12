# Smart Contract Function Documentation

This document provides a summary of functions available in the provided smart contracts, including their usage, parameters, return values, and descriptions.

## `MusicNFT.sol`

### `mintNFT`

**Usage Example:** `mintNFT(tokenURI, salesRoyaltyPercentage, streamingRoyaltyPercentage)`

**Visibility:** `unspecified`

**Parameters:**

```
        string memory tokenURI,
        uint256 salesRoyaltyPercentage,
        uint256 streamingRoyaltyPercentage
```

**Returns:** `uint256`

**Description:** Mints a new Music NFT with a given token URI and royalty settings.

### `updateTokenURI`

**Usage Example:** `updateTokenURI(tokenId, newTokenURI)`

**Visibility:** `unspecified`

**Parameters:**

```
        uint256 tokenId,
        string memory newTokenURI
```

**Returns:** `None`

**Description:** Updates the metadata URI of an existing NFT token.

### `getStreamingRoyalty`

**Usage Example:** `getStreamingRoyalty(tokenId)`

**Visibility:** `view`

**Parameters:**

```
        uint256 tokenId
```

**Returns:** `uint256`

**Description:** Returns the streaming royalty percentage for a given NFT.

### `getSalesRoyalty`

**Usage Example:** `getSalesRoyalty(tokenId)`

**Visibility:** `view`

**Parameters:**

```
        uint256 tokenId
```

**Returns:** `address receiver, uint256 royaltyAmount`

**Description:** Returns the receiver and percentage of the royalty for NFT sales.

### `getCreator`

**Usage Example:** `getCreator(tokenId)`

**Visibility:** `view`

**Parameters:**

```
        uint256 tokenId
```

**Returns:** `address`

**Description:** Returns the original creator's address of a given NFT.

### `getTokensOfOwner`

**Usage Example:** `getTokensOfOwner(owner)`

**Visibility:** `view`

**Parameters:**

```
        address owner
```

**Returns:** `uint256[] memory`

**Description:** Returns an array of token IDs owned by the specified address.

### `getTokensCreatedBy`

**Usage Example:** `getTokensCreatedBy(creator)`

**Visibility:** `view`

**Parameters:**

```
        address creator
```

**Returns:** `uint256[] memory`

**Description:** Returns an array of token IDs created by the specified address.

### `getTokenDetails`

**Usage Example:** `getTokenDetails(tokenId)`

**Visibility:** `view`

**Parameters:**

```
        uint256 tokenId
```

**Returns:** `      address creator,
            address currentOwner,
            uint256 streamingRoyaltyPercentage,
            address salesRoyaltyReceiver,
            uint256 salesRoyaltyPercentage
 `

**Description:** Returns comprehensive details of an NFT, including its creator, current owner, and royalty settings.

### `getTotalSupply`

**Usage Example:** `getTotalSupply()`

**Visibility:** `view`

**Returns:** `uint256`

**Description:** Returns the total number of minted NFT tokens.

### `tokenExists`

**Usage Example:** `tokenExists(tokenId)`

**Visibility:** `view`

**Parameters:**

```
        uint256 tokenId
```

**Returns:** `bool`

**Description:** Checks whether an NFT with the given token ID exists.

### `_update`

**Usage Example:** `_update(to, tokenId, auth)`

**Visibility:** `unspecified`

**Parameters:**

```
        address to,
        uint256 tokenId,
        address auth
```

**Returns:** `None`

**Description:** Internal function to update token ownership, applied in every transfers.

### `_exists`

**Usage Example:** `_exists(tokenId)`

**Visibility:** `view`

**Parameters:**

```
        uint256 tokenId
```

**Returns:** `bool`

**Description:** Internal check for whether a token ID exists in the system.

### `supportsInterface`

**Usage Example:** `supportsInterface(interfaceId)`

**Visibility:** `view`

**Parameters:**

```
        bytes4 interfaceId
```

**Returns:** `None`

**Description:** Checks if a certain interface is supported (e.g., for ERC standards).

## `NFTMarketplace.sol`

### `createListing`

**Usage Example:** `createListing(nftContract, tokenId, price)`

**Visibility:** `unspecified`

**Parameters:**

```
        address nftContract,
        uint256 tokenId,
        uint256 price
```

**Returns:** `uint256`

**Description:** Creates a marketplace listing for an NFT with a specified price.

### `buyNFT`

**Usage Example:** `buyNFT(listingId)`

**Visibility:** `payable`

**Parameters:**

```
        uint256 listingId
```

**Returns:** `None`

**Description:** Enables a user to purchase an NFT listed in the marketplace.

### `cancelListing`

**Usage Example:** `cancelListing(listingId)`

**Visibility:** `unspecified`

**Parameters:**

```
        uint256 listingId
```

**Returns:** `None`

**Description:** Cancels an active NFT listing, making it unavailable for purchase.

### `withdrawPayments`

**Usage Example:** `withdrawPayments()`

**Visibility:** `unspecified`

**Returns:** `None`

**Description:** Withdraws accumulated payments to the message sender.

### `getPendingPayment`

**Usage Example:** `getPendingPayment(recipient)`

**Visibility:** `view`

**Parameters:**

```
        address recipient
```

**Returns:** `uint256`

**Description:** Returns the pending balance a recipient can withdraw.

### `_recordPayment`

**Usage Example:** `_recordPayment(recipient, amount)`

**Visibility:** `unspecified`

**Parameters:**

```
        address recipient,
        uint256 amount
```

**Returns:** `None`

**Description:** Internal function to store payment information for a recipient.

### `_isERC2981`

**Usage Example:** `_isERC2981(contractAddress)`

**Visibility:** `view`

**Parameters:**

```
        address contractAddress
```

**Returns:** `bool`

**Description:** Checks if a contract supports the ERC-2981 royalty standard.

### `getListingByToken`

**Usage Example:** `getListingByToken(nftContract, tokenId)`

**Visibility:** `view`

**Parameters:**

```
        address nftContract,
        uint256 tokenId
```

**Returns:** `      uint256 listingId,
            address seller,
            uint256 price,
            bool isActive
 `

**Description:** Returns the listing details for a specific NFT.

### `getTotalListings`

**Usage Example:** `getTotalListings()`

**Visibility:** `view`

**Returns:** `uint256`

**Description:** Returns the total number of listings created on the marketplace.

### `getActiveListingsCount`

**Usage Example:** `getActiveListingsCount()`

**Visibility:** `view`

**Returns:** `uint256`

**Description:** Returns the count of currently active NFT listings.

### `getActiveListings`

**Usage Example:** `getActiveListings(start, limit)`

**Visibility:** `view`

**Parameters:**

```
        uint256 start,
        uint256 limit
```

**Returns:** `      uint256[] memory listingIds,
            address[] memory sellers,
            address[] memory nftContracts,
            uint256[] memory tokenIds,
            uint256[] memory prices
 `

**Description:** Fetches a paginated list of currently active listings.

### `getListingsBySeller`

**Usage Example:** `getListingsBySeller(seller, start, limit)`

**Visibility:** `view`

**Parameters:**

```
        address seller,
        uint256 start,
        uint256 limit
```

**Returns:** `      uint256[] memory listingIds,
            address[] memory nftContracts,
            uint256[] memory tokenIds,
            uint256[] memory prices,
            bool[] memory isActive
 `

**Description:** Fetches a paginated list of NFTs listed by a specific seller.

### `isTokenListed`

**Usage Example:** `isTokenListed(nftContract, tokenId)`

**Visibility:** `view`

**Parameters:**

```
        address nftContract,
        uint256 tokenId
```

**Returns:** `bool`

**Description:** Checks if a given token is currently listed in the marketplace.

## `NFTStreaming.sol`

### `recordBatchListens`

**Usage Example:** `recordBatchListens(nftContract, tokenId, count, amount)`

**Visibility:** `payable`

**Parameters:**

```
        address nftContract,
        uint256 tokenId,
        uint256 count,
        uint256 amount
```

**Returns:** `None`

**Description:** Records a batch of listens for a specific token and tracks payment.

### `withdrawPayments`

**Usage Example:** `withdrawPayments()`

**Visibility:** `unspecified`

**Returns:** `None`

**Description:** Withdraws accumulated payments to the message sender.

### `getPendingPayment`

**Usage Example:** `getPendingPayment(recipient)`

**Visibility:** `view`

**Parameters:**

```
        address recipient
```

**Returns:** `uint256`

**Description:** Returns the pending balance a recipient can withdraw.

### `getListenCount`

**Usage Example:** `getListenCount(nftContract, tokenId)`

**Visibility:** `view`

**Parameters:**

```
        address nftContract,
        uint256 tokenId
```

**Returns:** `uint256`

**Description:** Returns a listen count for specified NFT.

### `getTotalListenCount`

**Usage Example:** `getTotalListenCount(nftContract)`

**Visibility:** `view`

**Parameters:**

```
        address nftContract
```

**Returns:** `uint256`

**Description:** Returns total listen count.

### `getTopListenedTokens`

**Usage Example:** `getTopListenedTokens(nftContract, limit)`

**Visibility:** `view`

**Parameters:**

```
        address nftContract,
        uint256 limit
```

**Returns:** `uint256[] memory tokenIds, uint256[] memory listenCounts`

**Description:** Returns a list of most listened-to NFTs with their listen counts.

### `getListenDataByCreator`

**Usage Example:** `getListenDataByCreator(nftContract, creator)`

**Visibility:** `view`

**Parameters:**

```
        address nftContract,
        address creator
```

**Returns:** `uint256[] memory tokenIds, uint256[] memory listenCounts`

**Description:** Returns total count for all NFT created by specified address.

### `_recordPayment`

**Usage Example:** `_recordPayment(recipient, amount)`

**Visibility:** `unspecified`

**Parameters:**

```
        address recipient, uint256 amount
```

**Returns:** `None`

**Description:** Describes an internal or utility function.

### `_tokenExists`

**Usage Example:** `_tokenExists(nftContract, tokenId)`

**Visibility:** `view`

**Parameters:**

```
        address nftContract,
        uint256 tokenId
```

**Returns:** `bool`

**Description:** Describes an internal or utility function.
