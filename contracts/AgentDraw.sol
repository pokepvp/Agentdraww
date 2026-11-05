// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title AgentDraw — daily on-chain draw for Binance Agent ID holders
/// @notice NO NFT is minted anywhere in this contract. Wallets holding a
///         Binance .ai Agent ID (SPACE ID NFT on BSC) buy tickets for the
///         CURRENT UTC day's draw: enter(n) costs exactly n * 0.0005 BNB
///         for 1..20 tickets per transaction.
///
///         ECONOMICS (65/35, fee taken at entry): of every ticket payment,
///         65% forms that day's PRIZE POOL and 35% is a project fee that is
///         credited to the owner balance INSTANTLY, inside the same
///         enter() call — the owner can withdraw collected fees at any
///         time without waiting for any settle. After the day ends
///         (00:00 UTC), the permissionless settleDay() draws one winning
///         ticket and pays its owner 100% of the day's accumulated prize
///         pool; there is NO further owner cut at settle time.
///
/// @dev The Agent ID registry address is a constructor argument: on BNB
///      Chain mainnet deploy with 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F
///      (the SPACE ID .ai NFT). Tests substitute a mock registry.
///
///      ROUNDING RULE for the entry-time split: the owner's cut of one
///      enter() call is computed as `msg.value * 35 / 100` (integer
///      division, floor) and the prize pool receives the remainder
///      (`msg.value - ownerCut`), so the two shares always sum exactly to
///      msg.value and no wei is ever created or lost. Because the ticket
///      price is a constant 0.0005 BNB = 500000000000000 wei, the cut is
///      in fact always exact: 175000000000000 wei (0.000175 BNB) per
///      ticket to the owner and 325000000000000 wei (0.000325 BNB) per
///      ticket to the pool, with zero rounding remainder at any allowed
///      quantity 1..20.
///
///      ABOUT THE DRAW SEED (read this honestly): the winning ticket is
///      derived from keccak256(day, totalTickets, blockhash(block.number-1))
///      evaluated inside the settle transaction. That means the seed uses
///      the most recent blockhash available at settle time — NOT stored
///      data from the draw day itself (blockhash() only reaches back 256
///      blocks, and pre-committing a future blockhash is impossible
///      without an oracle or VRF). Consequences, stated plainly:
///        * The result is deterministic and publicly reproducible once
///          the settle transaction is mined: anyone can recompute the
///          seed from that block and verify the winner was picked fairly
///          from the day's entry ranges.
///        * Before the settle transaction is mined the outcome is not
///          knowable from the day's data alone.
///        * A settler chooses WHEN to call settleDay(), and each block
///          changes the seed — so a patient caller could in principle
///          wait for a favourable block. For a small-stakes daily draw
///          this is an accepted, disclosed trade-off; it is NOT
///          VRF-grade randomness and this contract does not claim to be.
contract AgentDraw {
    // ---------- Ownership ----------
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ---------- Constants / config ----------
    /// @notice Exact price of one ticket: 0.0005 BNB. A constant — the
    ///         price can never change after deployment.
    uint256 public constant TICKET_PRICE = 0.0005 ether;
    uint256 public constant MAX_TICKETS_PER_TX = 20;
    /// @notice Project fee: 35% of every entry, credited to the owner
    ///         balance instantly at entry time. The remaining 65% of
    ///         every entry forms the day's prize pool and is paid out in
    ///         full to the winner at settle.
    uint256 public constant OWNER_FEE_PERCENT = 35;

    /// @notice The Agent ID registry (.ai NFT) checked on every entry.
    address public immutable agentId;

    /// @notice Emergency brake for entries only. Settling and withdrawing
    ///         keep working while paused.
    bool public paused = false;

    // ---------- Draw state ----------
    /// @notice One entry chunk: `cumulative` is the total number of
    ///         tickets sold that day up to and including this chunk, so
    ///         the chunk owns ticket indices (prevCumulative, cumulative]
    ///         in 1-based ticket numbering. A wallet may appear in many
    ///         chunks (one per enter() call).
    struct Entry {
        address wallet;
        uint256 cumulative;
    }

    mapping(uint256 => Entry[]) private _entries; // day => chunks
    mapping(uint256 => mapping(address => uint256)) public ticketsOf; // ticketsOf[day][wallet]
    mapping(uint256 => uint256) public dayTotalTickets; // day => tickets sold
    /// @notice day => PRIZE POOL in wei: the accumulated 65% shares of the
    ///         day's entries. Paid out in full to the winner at settle.
    mapping(uint256 => uint256) public dayPool;
    mapping(uint256 => address) public dayWinner; // settled winner of a day (0 = none)
    mapping(uint256 => uint256) public dayWinningTicket; // 1-based winning ticket index of a settled day
    mapping(address => uint256) public winsOf; // lifetime wins per wallet

    uint256 public totalTicketsAllTime;

    /// @notice The most recent day that has been settled. Days are
    ///         block.timestamp / 86400 (UTC). Initialised to the day before
    ///         deployment so the deployment day itself is settleable once
    ///         it ends, and nothing before deployment can be settled.
    uint256 public lastSettledDay;

    /// @notice Owner's withdrawable balance: the 35% entry fees, credited
    ///         instantly on every enter(). Prize pools are NEVER part of
    ///         this balance — they sit in dayPool until settle pays them
    ///         to the winner — so withdraw() cannot touch an unsettled
    ///         prize pool. Invariant, at all times:
    ///         contract balance == ownerBalance + sum of unsettled dayPools.
    uint256 public ownerBalance;

    event Entered(address indexed wallet, uint256 indexed day, uint256 tickets, uint256 walletTicketsToday, uint256 prizePoolToday);
    event DaySettled(uint256 indexed day, address indexed winner, uint256 winningTicket, uint256 prize);
    event PausedSet(bool paused);
    event Withdrawn(address indexed to, uint256 amount);

    constructor(address agentId_) {
        require(agentId_ != address(0), "Zero address");
        owner = msg.sender;
        agentId = agentId_;
        lastSettledDay = _today() - 1;
    }

    function _today() internal view returns (uint256) {
        return block.timestamp / 86400;
    }

    function _hasAgentId(address wallet) internal view returns (bool) {
        return IAgentId(agentId).balanceOf(wallet) > 0;
    }

    // ---------- Entering the draw ----------
    /// @notice Buy n tickets (1..20) for TODAY's draw at exactly
    ///         n * 0.0005 BNB. The caller must hold a Binance .ai Agent
    ///         ID; the check runs on every entry. The payment is split
    ///         inside this call: 35% is credited to the owner balance as
    ///         the project fee (see the rounding rule at the top), and
    ///         the remaining 65% enters today's prize pool.
    function enter(uint256 n) external payable {
        require(!paused, "Entries paused");
        require(n >= 1 && n <= MAX_TICKETS_PER_TX, "Buy 1-20 tickets per tx");
        require(msg.value == n * TICKET_PRICE, "Exact ticket price required");
        require(_hasAgentId(msg.sender), "Agent ID required");
        uint256 ownerCut = (msg.value * OWNER_FEE_PERCENT) / 100;
        uint256 poolShare = msg.value - ownerCut;
        ownerBalance += ownerCut;
        uint256 day = _today();
        uint256 newTotal = dayTotalTickets[day] + n;
        dayTotalTickets[day] = newTotal;
        dayPool[day] += poolShare;
        ticketsOf[day][msg.sender] += n;
        totalTicketsAllTime += n;
        _entries[day].push(Entry({wallet: msg.sender, cumulative: newTotal}));
        emit Entered(msg.sender, day, n, ticketsOf[day][msg.sender], dayPool[day]);
    }

    // ---------- Settling ----------
    /// @notice Settle the oldest unsettled day once it has fully ended.
    ///         Permissionless — anyone can call it, the draw never stalls.
    ///         One winning ticket is drawn from the day's entry ranges and
    ///         its owner receives 100% of the day's accumulated prize pool
    ///         (the 65% shares; the owner's 35% fee was already credited
    ///         at entry time, so nothing is deducted here). A day with
    ///         zero entries settles cleanly (no winner, no payment) and
    ///         the next call moves on to the following day, so catching
    ///         up across idle days takes one call per day.
    /// @dev See the seed note at the top of this contract: the seed mixes
    ///      the day index, the day's total tickets and the blockhash of
    ///      the block right before the settle transaction's block.
    function settleDay() external {
        uint256 day = lastSettledDay + 1;
        require(day < _today(), "Day not ended");
        lastSettledDay = day;
        uint256 pool = dayPool[day];
        uint256 total = dayTotalTickets[day];
        if (total == 0 || pool == 0) {
            emit DaySettled(day, address(0), 0, 0);
            return;
        }
        uint256 seed = uint256(keccak256(abi.encodePacked(day, total, blockhash(block.number - 1))));
        uint256 winningTicket = (seed % total) + 1; // 1-based ticket index
        address winner = _ticketOwner(day, winningTicket);
        dayWinner[day] = winner;
        dayWinningTicket[day] = winningTicket;
        winsOf[winner] += 1;
        emit DaySettled(day, winner, winningTicket, pool);
        (bool ok, ) = payable(winner).call{value: pool}("");
        require(ok, "Prize payment failed");
    }

    /// @notice Find which wallet owns a 1-based ticket index of a day, by
    ///         binary search over the day's cumulative entry chunks.
    function _ticketOwner(uint256 day, uint256 ticketIndex) internal view returns (address) {
        Entry[] storage list = _entries[day];
        uint256 lo = 0;
        uint256 hi = list.length - 1;
        while (lo < hi) {
            uint256 mid = (lo + hi) / 2;
            if (list[mid].cumulative >= ticketIndex) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }
        return list[lo].wallet;
    }

    // ---------- Views for the site ----------
    /// @notice The current UTC day index (block.timestamp / 86400).
    function currentDay() external view returns (uint256) {
        return _today();
    }

    /// @notice Today's accumulated PRIZE POOL in wei (the 65% shares of
    ///         today's entries; paid in full to today's winner at settle).
    function poolToday() external view returns (uint256) {
        return dayPool[_today()];
    }

    /// @notice Tickets sold for today's draw so far.
    function ticketsToday() external view returns (uint256) {
        return dayTotalTickets[_today()];
    }

    /// @notice Tickets a wallet holds in today's draw.
    function myTicketsToday(address wallet) external view returns (uint256) {
        return ticketsOf[_today()][wallet];
    }

    /// @notice Number of entry chunks recorded today (one per enter() call).
    function entriesCountToday() external view returns (uint256) {
        return _entries[_today()].length;
    }

    /// @notice Number of entry chunks recorded on any day.
    function dayEntriesCount(uint256 day) external view returns (uint256) {
        return _entries[day].length;
    }

    /// @notice One entry chunk of a day: the buyer and the cumulative
    ///         ticket count after their purchase (their tickets are the
    ///         range (previous chunk's cumulative, this cumulative]).
    function entryAt(uint256 day, uint256 index) external view returns (address wallet, uint256 cumulative) {
        Entry storage e = _entries[day][index];
        return (e.wallet, e.cumulative);
    }

    // ---------- Owner controls ----------
    /// @notice Pause or unpause new entries. Settling always keeps working.
    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// @notice Withdraw the owner balance only (the accumulated 35% entry
    ///         fees). Unsettled prize pools are untouchable here — they
    ///         are not part of ownerBalance by construction.
    function withdraw() external onlyOwner {
        uint256 amount = ownerBalance;
        require(amount > 0, "Nothing to withdraw");
        ownerBalance = 0;
        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok, "Withdraw failed");
        emit Withdrawn(owner, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}

interface IAgentId {
    function balanceOf(address account) external view returns (uint256);
}
