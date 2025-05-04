// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MusicNFT.sol";

contract NFTMarketplace is ERC721Holder, Ownable, ReentrancyGuard {
    uint256 public marketFeePercentage = 250;

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
    ) external returns (uint256) {
        IERC721(nftContract).safeTransferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        _listingIds++;
        uint256 listingId = _listingIds;

        listings[listingId] = Listing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            isActive: true
        });

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
            (bool success, ) = msg.sender.call{value: excessAmount}("");
            if (!success) {
                revert TransferFailed();
            }
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
}
