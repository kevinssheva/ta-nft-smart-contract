// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./MusicNFT.sol";

contract NFTMarketplace is ERC721Holder, Ownable, ReentrancyGuard {
    using Address for address payable;

    uint256 public constant marketFeePercentage = 250; // 2.5%

    struct Listing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        bool isActive;
    }

    mapping(uint256 => Listing) public listings;
    uint256 private _listingIds;

    mapping(address => uint256) private _pendingPayments;

    constructor() Ownable(msg.sender) {}

    error InsufficientFunds();
    error ListingNotActive();
    error TransferFailed();
    error NoPaymentsPending();
    error ListingNotFound();
    error NotListingOwner();

    event NFTListed(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId,
        uint256 price
    );

    event NFTSold(
        uint256 indexed listingId,
        address indexed seller,
        address indexed buyer,
        address nftContract,
        uint256 tokenId,
        uint256 price
    );

    event NFTListingCancelled(
        uint256 indexed listingId,
        address indexed seller,
        address indexed nftContract,
        uint256 tokenId
    );

    event PaymentWithdrawn(address indexed recipient, uint256 amount);

    function createListing(
        address nftContract,
        uint256 tokenId,
        uint256 price
    ) external nonReentrant returns (uint256) {
        // Update state before external call
        _listingIds++;
        uint256 listingId = _listingIds;

        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            isActive: true
        });

        // External call should be last
        IERC721(nftContract).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        emit NFTListed(listingId, msg.sender, nftContract, tokenId, price);
        return listingId;
    }

    function buyNFT(uint256 listingId) external payable nonReentrant {
        Listing storage listing = listings[listingId];

        if (listing.seller == address(0)) {
            revert ListingNotFound();
        }

        address seller = listing.seller;
        address nftContract = listing.nftContract;
        uint256 tokenId = listing.tokenId;
        uint256 price = listing.price;

        if (msg.value < price) {
            revert InsufficientFunds();
        }

        if (!listing.isActive) {
            revert ListingNotActive();
        }

        listing.isActive = false;

        uint256 remainingAmount = price;

        if (_isERC2981(nftContract)) {
            (address royaltyReceiver, uint256 royaltyAmount) = IERC2981(
                nftContract
            ).royaltyInfo(tokenId, price);

            if (royaltyAmount > 0) {
                _recordPayment(royaltyReceiver, royaltyAmount);
                remainingAmount -= royaltyAmount;
            }
        }

        uint256 marketFee = (price * marketFeePercentage) / 10000;
        if (marketFee > 0) {
            _recordPayment(owner(), marketFee);
            remainingAmount -= marketFee;
        }

        _recordPayment(seller, remainingAmount);

        IERC721(nftContract).safeTransferFrom(
            address(this),
            msg.sender,
            tokenId
        );

        emit NFTSold(
            listingId,
            seller,
            msg.sender,
            nftContract,
            tokenId,
            price
        );

        uint256 excessAmount = msg.value - price;
        if (excessAmount > 0) {
            payable(msg.sender).sendValue(excessAmount);
        }
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];

        if (listing.seller == address(0)) {
            revert ListingNotFound();
        }

        if (listing.seller != msg.sender) {
            revert NotListingOwner();
        }

        if (!listing.isActive) {
            revert ListingNotActive();
        }

        listing.isActive = false;

        IERC721(listing.nftContract).safeTransferFrom(
            address(this),
            listing.seller,
            listing.tokenId
        );

        emit NFTListingCancelled(
            listingId,
            listing.seller,
            listing.nftContract,
            listing.tokenId
        );
    }

    function withdrawPayments() external nonReentrant returns (uint256) {
        uint256 amount = _pendingPayments[msg.sender];

        if (amount == 0) {
            revert NoPaymentsPending();
        }

        _pendingPayments[msg.sender] = 0;

        payable(msg.sender).sendValue(amount);

        emit PaymentWithdrawn(msg.sender, amount);
        return amount;
    }

    function getPendingPayment(
        address recipient
    ) external view returns (uint256) {
        return _pendingPayments[recipient];
    }

    function _recordPayment(address recipient, uint256 amount) internal {
        _pendingPayments[recipient] += amount;
    }

    function _isERC2981(address contractAddress) internal view returns (bool) {
        try
            IERC2981(contractAddress).supportsInterface(
                type(IERC2981).interfaceId
            )
        returns (bool supported) {
            return supported;
        } catch {
            return false;
        }
    }

    // Get listing details by tokenId and NFT contract
    function getListingByToken(
        address nftContract,
        uint256 tokenId
    )
        public
        view
        returns (
            uint256 listingId,
            address seller,
            uint256 price,
            bool isActive
        )
    {
        for (uint256 i = 1; i <= _listingIds; i++) {
            if (
                listings[i].nftContract == nftContract &&
                listings[i].tokenId == tokenId &&
                listings[i].isActive
            ) {
                return (
                    i,
                    listings[i].seller,
                    listings[i].price,
                    listings[i].isActive
                );
            }
        }
        return (0, address(0), 0, false);
    }

    // Get total number of listings ever created
    function getTotalListings() public view returns (uint256) {
        return _listingIds;
    }

    // Get total number of active listings
    function getActiveListingsCount() public view returns (uint256) {
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= _listingIds; i++) {
            if (listings[i].isActive) {
                activeCount++;
            }
        }
        return activeCount;
    }

    // Get all active listings with pagination
    function getActiveListings(
        uint256 start,
        uint256 limit
    )
        public
        view
        returns (
            uint256[] memory listingIds,
            address[] memory sellers,
            address[] memory nftContracts,
            uint256[] memory tokenIds,
            uint256[] memory prices
        )
    {
        // First, count active listings to determine array size
        uint256 activeCount = 0;
        for (uint256 i = 1; i <= _listingIds; i++) {
            if (listings[i].isActive) {
                activeCount++;
            }
        }

        // Handle pagination bounds
        if (start >= activeCount) {
            return (
                new uint256[](0),
                new address[](0),
                new address[](0),
                new uint256[](0),
                new uint256[](0)
            );
        }

        uint256 end = start + limit;
        if (end > activeCount) {
            end = activeCount;
        }
        uint256 resultSize = end - start;

        // Initialize return arrays
        listingIds = new uint256[](resultSize);
        sellers = new address[](resultSize);
        nftContracts = new address[](resultSize);
        tokenIds = new uint256[](resultSize);
        prices = new uint256[](resultSize);

        // Fill arrays with listing data
        uint256 currentIndex = 0;
        uint256 resultIndex = 0;

        for (uint256 i = 1; i <= _listingIds && resultIndex < resultSize; i++) {
            if (listings[i].isActive) {
                if (currentIndex >= start) {
                    listingIds[resultIndex] = i;
                    sellers[resultIndex] = listings[i].seller;
                    nftContracts[resultIndex] = listings[i].nftContract;
                    tokenIds[resultIndex] = listings[i].tokenId;
                    prices[resultIndex] = listings[i].price;
                    resultIndex++;
                }
                currentIndex++;
            }
        }

        return (listingIds, sellers, nftContracts, tokenIds, prices);
    }

    // Get all listings by seller with pagination
    function getListingsBySeller(
        address seller,
        uint256 start,
        uint256 limit
    )
        public
        view
        returns (
            uint256[] memory listingIds,
            address[] memory nftContracts,
            uint256[] memory tokenIds,
            uint256[] memory prices,
            bool[] memory isActive
        )
    {
        // First, count listings by seller
        uint256 sellerCount = 0;
        for (uint256 i = 1; i <= _listingIds; i++) {
            if (listings[i].seller == seller) {
                sellerCount++;
            }
        }

        // Handle pagination bounds
        if (start >= sellerCount) {
            return (
                new uint256[](0),
                new address[](0),
                new uint256[](0),
                new uint256[](0),
                new bool[](0)
            );
        }

        uint256 end = start + limit;
        if (end > sellerCount) {
            end = sellerCount;
        }
        uint256 resultSize = end - start;

        // Initialize return arrays
        listingIds = new uint256[](resultSize);
        nftContracts = new address[](resultSize);
        tokenIds = new uint256[](resultSize);
        prices = new uint256[](resultSize);
        isActive = new bool[](resultSize);

        // Fill arrays with listing data
        uint256 currentIndex = 0;
        uint256 resultIndex = 0;

        for (uint256 i = 1; i <= _listingIds && resultIndex < resultSize; i++) {
            if (listings[i].seller == seller) {
                if (currentIndex >= start) {
                    listingIds[resultIndex] = i;
                    nftContracts[resultIndex] = listings[i].nftContract;
                    tokenIds[resultIndex] = listings[i].tokenId;
                    prices[resultIndex] = listings[i].price;
                    isActive[resultIndex] = listings[i].isActive;
                    resultIndex++;
                }
                currentIndex++;
            }
        }

        return (listingIds, nftContracts, tokenIds, prices, isActive);
    }

    // Check if a token is currently listed
    function isTokenListed(
        address nftContract,
        uint256 tokenId
    ) public view returns (bool) {
        for (uint256 i = 1; i <= _listingIds; i++) {
            if (
                listings[i].nftContract == nftContract &&
                listings[i].tokenId == tokenId &&
                listings[i].isActive
            ) {
                return true;
            }
        }
        return false;
    }
}
