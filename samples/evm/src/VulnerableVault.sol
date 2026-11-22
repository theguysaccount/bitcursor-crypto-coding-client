// SPDX-License-Identifier: MIT
// Deliberately vulnerable sample for Chain Preflight's tests. Never deploy it.
pragma solidity ^0.8.20;

contract VulnerableVault {
    mapping(address => uint256) public balances;
    address public owner;
    bool private initialized;

    // Anyone can call this, and call it again.
    function initialize(address _owner) external {
        owner = _owner;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    // Reentrancy: sends ETH before zeroing the balance.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        balances[msg.sender] = 0;
    }

    // tx.origin authorization.
    function sweep(address payable to) external {
        require(tx.origin == owner, "not owner");
        to.transfer(address(this).balance);
    }

    // Anyone can take ownership.
    function setOwner(address newOwner) external {
        owner = newOwner;
    }

    // The call's result is dropped.
    function ping(address target) external {
        target.call(abi.encodeWithSignature("ping()"));
    }

    // delegatecall to an address the caller chooses.
    function execute(address impl, bytes calldata data) external {
        (bool ok, ) = impl.delegatecall(data);
        require(ok, "failed");
    }

    // Predictable "randomness".
    function lottery() external view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender))) % 10;
    }
}
