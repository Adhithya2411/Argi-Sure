// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MockOracle
 * @dev A minimal Chainlink Oracle mock that can receive requests via transferAndCall
 * and allows manual fulfillment back to the client contract.
 */
contract MockOracle {
    event OracleRequest(
        bytes32 indexed specId,
        address requester,
        bytes32 requestId,
        uint256 payment,
        address callbackAddr,
        bytes4 callbackFunctionId,
        uint256 cancelExpiration,
        uint256 dataVersion,
        bytes data
    );

    function oracleRequest(
        address sender,
        uint256 payment,
        bytes32 specId,
        address callbackAddress,
        bytes4 callbackFunctionId,
        uint256 nonce,
        uint256 dataVersion,
        bytes calldata data
    ) external {
        bytes32 requestId = keccak256(abi.encodePacked(sender, nonce));
        emit OracleRequest(
            specId,
            sender,
            requestId,
            payment,
            callbackAddress,
            callbackFunctionId,
            nonce,
            dataVersion,
            data
        );
    }

    /**
     * @dev Allows the test script to manually trigger the callback on the client.
     */
    function fulfillOracleRequest(
        address callbackAddress,
        bytes4 callbackFunctionId,
        bytes32 requestId,
        uint256 minLat,
        uint256 maxLat,
        uint256 minLon,
        uint256 maxLon
    ) external returns (bool) {
        (bool success, bytes memory returnData) = callbackAddress.call(
            abi.encodeWithSelector(callbackFunctionId, requestId, minLat, maxLat, minLon, maxLon)
        );
        if (!success) {
            if (returnData.length > 0) {
                // bubble up the revert reason
                assembly {
                    let returnData_size := mload(returnData)
                    revert(add(32, returnData), returnData_size)
                }
            } else {
                revert("MockOracle: callback failed");
            }
        }
        return success;
    }
}
