// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/ChainlinkClient.sol";
import "@chainlink/contracts/src/v0.8/shared/access/ConfirmedOwner.sol";

interface IAgriSureEscrow {
    function triggerDisaster(
        uint256 _minLat,
        uint256 _maxLat,
        uint256 _minLon,
        uint256 _maxLon
    ) external returns (uint256);
}

contract AgriSureOracle is ChainlinkClient, ConfirmedOwner {
    using Chainlink for Chainlink.Request;

    uint256 public minLat;
    uint256 public maxLat;
    uint256 public minLon;
    uint256 public maxLon;
    
    bytes32 private jobId;
    uint256 private fee;

    IAgriSureEscrow public escrow;

    event RequestDisasterData(bytes32 indexed requestId);
    event DisasterDataFulfilled(
        bytes32 indexed requestId,
        uint256 minLat,
        uint256 maxLat,
        uint256 minLon,
        uint256 maxLon
    );

    /**
     * @notice Initialize the link token and target oracle
     * @param _escrowAddress the address of the Escrow contract
     * @param _linkToken the address of the LINK token (mock or live)
     * @param _oracleAddress the address of the Oracle contract (mock or live)
     */
    constructor(address _escrowAddress, address _linkToken, address _oracleAddress) ConfirmedOwner(msg.sender) {
        setChainlinkToken(_linkToken);
        setChainlinkOracle(_oracleAddress);
        jobId = "ca98366cc7314957b8c012c72f05aeeb";
        fee = (1 * LINK_DIVISIBILITY) / 10; // 0.1 LINK

        escrow = IAgriSureEscrow(_escrowAddress);
    }

    /**
     * @notice Create a Chainlink request to retrieve latest disaster bounding box
     */
    function requestDisasterData() public returns (bytes32 requestId) {
        Chainlink.Request memory req = buildChainlinkRequest(
            jobId,
            address(this),
            this.fulfillDisasterData.selector
        );

        // Set the URL to perform the GET request on (our local frontend API route deployed on Vercel)
        // Note: For local Hardhat testing, this requires a deployed endpoint.
        req.add("get", "https://our-agrisure-api.vercel.app/api/disaster-zone");

        // Set the path to find the desired data in the API response
        // Using multiple requests or multiple values per request requires a multi-variable job.
        // For simplicity in standard Any API, we'll assume a custom Job that returns 4 integers,
        // or we use string representation. To keep it standard, we'll fetch them individually or use a specialized oracle.
        // Let's assume a Multi-Word job or we just fetch a single aggregated uint256 and decode it, 
        // but for now we write the interface to accept the 4 integers.
        
        // Actually, typical single word job expects 1 value. 
        // We will assume a specialized multi-variable job that calls `fulfillDisasterData` with 4 uint256 arguments.
        
        // Sends the request
        return sendChainlinkRequest(req, fee);
    }

    /**
     * @notice Receive the response in the form of uint256[4]
     */
    function fulfillDisasterData(
        bytes32 _requestId,
        uint256 _minLat,
        uint256 _maxLat,
        uint256 _minLon,
        uint256 _maxLon
    ) public recordChainlinkFulfillment(_requestId) {
        emit DisasterDataFulfilled(_requestId, _minLat, _maxLat, _minLon, _maxLon);
        minLat = _minLat;
        maxLat = _maxLat;
        minLon = _minLon;
        maxLon = _maxLon;

        // Trigger the disaster on the Escrow contract
        uint256 disasterId = escrow.triggerDisaster(_minLat, _maxLat, _minLon, _maxLon);
        // Could emit an event or store disasterId if needed
    }

    /**
     * @notice Allow withdraw of Link tokens from the contract
     */
    function withdrawLink() public onlyOwner {
        LinkTokenInterface link = LinkTokenInterface(chainlinkTokenAddress());
        require(
            link.transfer(msg.sender, link.balanceOf(address(this))),
            "Unable to transfer"
        );
    }
}
