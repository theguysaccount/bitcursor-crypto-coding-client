// SPDX-License-Identifier: MIT
// The vault from ../evm written safely: checks-effects-interactions, a reentrancy guard, owner-only admin.
pragma solidity 0.8.28;

contract SafeVault {
    mapping(address => uint256) public balances;
    address public immutable owner;
    bool private locked;

    error Unauthorized();
    error Reentrant();
    error TransferFailed();

    modifier nonReentrant() {
        if (locked) revert Reentrant();
        locked = true;
        _;
        locked = false;
    }

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external nonReentrant {
        uint256 amount = balances[msg.sender];
        balances[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
