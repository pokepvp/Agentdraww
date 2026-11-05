// AgentDraw — public site logic.
// Plain static JS, no build step, no libraries. Reads go through a public
// BSC RPC failover pool (sticky last-good endpoint, 9s timeout per call);
// writes go through the visitor's own connected wallet only.
// DRAW_CONFIG.contractAddress holds the AgentDraw deployment. While it is
// empty/invalid the site renders its "not live yet" state and every
// on-chain read is skipped safely.
// UI language: EN (default) / 简体中文 via the topbar toggle; the choice
// persists in localStorage. The agent-prompt bodies stay in English —
// they are machine instructions; only their framing UI is translated.
const DRAW_CONFIG = {
  contractAddress: "0xFCb729e818edbe65e9831e5C49E8D32563E50574", // AgentDraw — LIVE, deployed by the owner 2026-11-05 (BNB Chain mainnet)
  chainId: 56,                  // BNB Smart Chain Mainnet
  chainHex: "0x38",
  agentIdAddress: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F", // Binance .ai Agent ID NFT (SPACE ID)
  xUrl: "https://x.com/AgentDrawBNB" // official X — @AgentDrawBNB (created by the owner 2026-11-05)
};
const CONTRACT = DRAW_CONFIG.contractAddress;
const AGENT_ID = DRAW_CONFIG.agentIdAddress;
// The FREE check-in companion (AgentDrawCheckIn), deployed by the owner
// on 2026-11-05 and wired live the same day; while this address were empty,
// the "Earn your ticket" section would render its pre-launch state and
// every check-in read would be skipped.
const CHECKIN_CONFIG = {
  checkInAddress: "0xFc814Fd5a98C430aACdd78d150D157A5421b761e", // LIVE — AgentDrawCheckIn, deployed 2026-11-05, Sourcify exact match
  pointsPerPayout: 100,
  payoutWei: "500000000000000" // 0.0005 BNB exactly — one ticket's price
};
const CHECKIN = CHECKIN_CONFIG.checkInAddress;
function checkInReady() { return validAddress(CHECKIN); }
const TICKET_PRICE_WEI = "500000000000000"; // 0.0005 BNB exactly, per ticket
const MAX_PER_TX = 20;
const POOL_PER_TICKET_WEI = 325000000000000n; // 65% of one ticket (0.000325 BNB) — the pool grows by exactly this per ticket
// Contract function selectors (first 4 bytes of keccak256), computed from the final ABI.
const SEL = {
  enter: "0xa59f3e0c",              // enter(uint256)
  settleDay: "0xca624b77",          // settleDay()
  poolToday: "0x17f6425b",          // poolToday()
  ticketsToday: "0xcf5ddbee",       // ticketsToday()
  myTicketsToday: "0x374af3b9",     // myTicketsToday(address)
  currentDay: "0x5c9302c9",         // currentDay()
  entriesCountToday: "0x2816461d",  // entriesCountToday()
  entryAt: "0x248e08bc",            // entryAt(uint256,uint256)
  dayWinner: "0x057837d5",          // dayWinner(uint256)
  dayWinningTicket: "0x492090e1",   // dayWinningTicket(uint256)
  dayPool: "0xcf637ac3",            // dayPool(uint256)
  dayTotalTickets: "0xeef69657",    // dayTotalTickets(uint256)
  winsOf: "0x83514ea2",             // winsOf(address)
  paused: "0x5c975abb",             // paused()
  balanceOf: "0x70a08231"           // balanceOf(address) — Agent ID NFT
};
// AgentDrawCheckIn selectors (first 4 bytes of keccak256, from its compiled ABI).
const SEL_CI = {
  checkIn: "0x183ff085",            // checkIn()
  redeem: "0xbe040fb0",             // redeem()
  pointsOf: "0xcf6a4403",           // pointsOf(address)
  canCheckInToday: "0x591ff3e0",    // canCheckInToday(address)
  checkInsToday: "0x393f0297",      // checkInsToday()
  poolBalance: "0x96365d44",        // poolBalance()
  paused: "0x5c975abb"              // paused() — pauses check-ins only; redeem never pauses
};
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BOARD_SCAN_CAP = 400;         // enumerate at most the latest 400 entry chunks for the board

// ── i18n — EN / 简体中文 ───────────────────────────────────────
const I18N = {
en: {
  docTitle: "AgentDraw — The Daily On-Chain Draw for Binance Agent ID Holders",
  statusNotLive: "CONTRACT NOT LIVE YET",
  statusLive: "● DRAW LIVE",
  statusPaused: "DRAW LIVE — ENTRIES PAUSED",
  connectWallet: "Connect wallet",
  heroTitle: 'One draw. <span class="accent">Every day.</span>',
  heroSub: 'The daily on-chain draw for <b>Binance .ai Agent ID</b> holders on BNB Chain. Buy tickets for <b>0.0005 BNB</b> each — <b>65% of every ticket</b> forms <b>today\'s prize pool</b> — and after <b>00:00 UTC</b> one winning ticket takes <b>the whole pool</b>. No NFT, just tickets.',
  heroKicker: "Daily on-chain draw · BNB Chain · Est. 2026",
  tickerText: "Daily draw · Agent ID holders only · 65% to the winner · Settles 00:00 UTC · No NFT — just tickets · One winning ticket takes the pool ·\u00A0",
  statPool: "Today's prize pool",
  statPoolSub: "winner takes the whole pool at settle",
  statTickets: "Tickets today",
  statTicketsSub: "in today's draw",
  statEntries: "Entries today",
  statEntriesSub: "buy transactions today",
  statSettle: "Draw settles in",
  noteNotDeployed: "The contract is not deployed yet — this page goes live the moment it is.",
  noteLive: "The draw is LIVE — today's tickets are on sale until 00:00 UTC.",
  notePaused: "Entries are currently PAUSED by the owner. Settling of finished days still works.",
  ctaBuy: "Buy tickets",
  ctaHow: "How it works",
  buyTitle: "Buy tickets — today's draw",
  buySub: 'Your wallet must hold a Binance <b>.ai Agent ID</b> (<span class="mono small">0x60B9…022F</span>) — the contract checks it on every entry. One ticket costs exactly <b>0.0005 BNB</b>; you can buy <b>1–20 tickets per transaction</b>, as often as you like. Of every ticket, <b>65% forms the prize pool</b> and <b>35% is the project fee</b>, taken at entry.',
  qtyLabel: "tickets",
  costLabel: "Total cost",
  perTicket: "0.0005 BNB per ticket",
  myTicketsLabel: "Your tickets today",
  enterBtn: "Buy tickets — enter()",
  enterHint: "Connect a wallet holding a .ai Agent ID. The button sends exactly tickets × 0.0005 BNB — the contract rejects any other amount. No approvals are involved.",
  promptEnterTitle: "Agent-first — hand this to your AI agent",
  copyPrompt: "COPY PROMPT",
  boardTitle: "Today's entries",
  boardRefresh: "Live from the contract · refreshes every 60s",
  boardNote: "Wallets in today's draw, ranked by tickets held. More tickets = a bigger share of the winning range.",
  boardNoteCapped: "Wallets in today's draw (latest {cap} entries), ranked by tickets held. More tickets = a bigger share of the winning range.",
  boardEmptyPre: "No entries to show yet — today's entries will appear here.",
  boardEmptyNone: "No tickets sold yet today — the first buyer opens the draw.",
  boardMeta: "<b>{n}</b> tickets · {pct}% win chance",
  youChip: "YOU",
  youTitle: "Your draw card",
  youSub: "Connect a wallet, or paste any address to look up its Agent ID, today's tickets and lifetime wins.",
  youPlaceholder: "0x… wallet address",
  youLookup: "Look up",
  youWallet: "Wallet",
  youAgentId: "Agent ID",
  youTickets: "Tickets today",
  youWins: "Draws won",
  idHeld: "✓ Agent ID held",
  idNone: "No Agent ID",
  settleTitle: "Settle the draw",
  settleSub: "After 00:00 UTC, anyone can settle the finished day — no owner needed. The contract draws the winning ticket from that day's entry ranges and pays the winner the entire prize pool automatically.",
  promptSettleTitle: "Agent prompt — settle the day (anyone can call it)",
  settleBtn: "Call settleDay() from my wallet",
  settleNote: "Permissionless — one call settles the oldest unsettled day; repeat it to catch up across idle days.",
  hallTitle: "Hall of Draws",
  hallRefresh: "Settled days, read from dayWinner",
  hallNote: "Every settled day has exactly one winning ticket. Winners are recorded on-chain, forever.",
  hallEmptyPre: "No day has been settled yet.",
  hallEmptyNone: "No day has been settled yet — the first winner is drawn at the first settle after 00:00 UTC.",
  hallMeta: "Day {day} · {date} · ticket #{ticket} · won {prize}",
  hallWinOne: " · <b>{n}</b> win total",
  hallWinsMany: " · <b>{n}</b> wins total",
  howTitle: "How it works",
  how1: "Hold a Binance .ai Agent ID in your wallet — it is your entry pass, checked by the contract on every buy.",
  how2: "Buy 1–20 tickets per transaction at exactly 0.0005 BNB each. 65% of every ticket lands in today's prize pool; 35% is the project fee.",
  how3: "The day ends at 00:00 UTC. Anyone can then call settleDay() — the contract draws one winning ticket from the day's entry ranges.",
  how4: "The winning ticket's owner receives the entire prize pool — the 65% shares of every ticket sold that day — paid by the contract in the same transaction.",
  rulesTitle: "The rules — exactly as the contract enforces them",
  rule1: '<b>Who can play.</b> Your wallet must hold a Binance .ai Agent ID (the SPACE ID .ai NFT at <span class="mono small">0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F</span>). The contract checks this on every <span class="mono">enter()</span>.',
  rule2: '<b>Tickets.</b> One ticket costs exactly <b>0.0005 BNB</b> — a constant in the contract that nobody can change. Buy <b>1–20 tickets per transaction</b>; repeat buys are allowed and your tickets add up. There is no NFT and nothing to approve.',
  rule3: '<b>The split.</b> Every ticket is split at entry: <b>65%</b> forms that UTC day\'s prize pool and <b>35%</b> is the project fee, credited to the owner instantly inside the same transaction. Tickets belong to the day they were bought on — they do not carry over, and yesterday\'s tickets never enter today\'s draw.',
  rule4: '<b>The draw.</b> After the day ends at <b>00:00 UTC</b>, anyone can call <span class="mono">settleDay()</span>. One ticket index is drawn from the day\'s range; the wallet whose entry range contains it wins <b>the entire prize pool</b> — the accumulated 65% shares of that day\'s tickets — paid automatically. Nothing more is deducted at settle: the fee was already taken at entry.',
  rule5: '<b>How the winner is picked — honestly.</b> The winning index is derived from a hash of the day, the day\'s total tickets and the hash of the block right before the settle transaction. Anyone can recompute it after the settle and verify the winner. It is transparent and tamper-evident, but it is <b>not</b> VRF-grade randomness: a settler chooses when to call, and timing can influence the result. Play with amounts whose loss you can shrug off.',
  rule6: '<b>Empty days.</b> A day with zero entries settles with no winner and no payment. If several days pass unsettled, <span class="mono">settleDay()</span> settles one day per call until it catches up.',
  rule7: '<b>Owner powers are narrow.</b> The owner can pause new entries (settling and prize pools are never affected) and withdraw only the accumulated 35% entry fees. The owner can never touch a prize pool, change the ticket price or the 65/35 split, or pick a winner.',
  rule8: '<b>No promises.</b> Buying a ticket buys a chance, never a guaranteed win. The only payout the contract makes is the winner\'s prize — the day\'s full prize pool — at settle. Odds are exactly your tickets divided by the day\'s total tickets.',
  footerTagline: "AgentDraw · daily on-chain draw · BNB Smart Chain (chainId 56)",
  footerContractLabel: "Contract:",
  notDeployedYet: "not deployed yet",
  bscScanPending: "BscScan — contract (after deployment)",
  bscScanLive: "BscScan — contract",
  xPending: "X — official account (soon)",
  llmsLink: "llms.txt for agents",
  footerDisclaimer: "An independent project for Binance Agent ID holders. Not affiliated with Binance. Rules above are the contract's rules — verify them on BscScan before you play.",
  toastCopied: "Agent prompt copied — paste it to your AI agent.",
  toastCopyFailed: "Copy failed — the prompt text is selected, copy it manually.",
  toastBadAddress: "Paste a valid 0x… wallet address first.",
  toastNoWallet: "No wallet found in this browser. Use the agent prompts above, or open this page in a wallet browser.",
  toastNoAccount: "No account approved in the wallet.",
  toastConnectFail: "Wallet connection failed: ",
  toastNotDeployed: "The contract is not deployed yet — this button goes live with it.",
  toastTxFail: "Transaction not sent: ",
  toastEnter: "{n} ticket(s) bought for today's draw.",
  toastSettle: "settleDay() sent — the finished day is being drawn.",
  sharePool: "Share today's pool",
  sharePoolText: "🎟️ Today's AgentDraw prize pool is {pool} — one winning ticket takes the whole pool at the 00:00 UTC settle. Tickets 0.0005 BNB · Agent ID holders only · https://agentdraw.click/",
  sharePoolTextPre: "🎟️ AgentDraw — the daily on-chain draw for Binance .ai Agent ID holders. Ticket 0.0005 BNB · 65% of every ticket forms the prize pool · winner takes it all at the 00:00 UTC settle · No NFT · https://agentdraw.click/",
  actTitle: "Live activity",
  actRefresh: "Newest first · read from entryAt",
  actNote: "Every entry into today's draw, in purchase order. The contract's entry chunks carry no timestamps, so the stream is ordered by purchase, not by clock.",
  actEmptyPre: "The stream starts at launch — every entry will appear here the moment it lands.",
  actEmptyNone: "No tickets sold yet today — the first entry opens the stream.",
  actMeta: "<b>+{n}</b> tickets · running win chance {pct}%",
  actMetaShare: "<b>+{n}</b> tickets · {pct}% of today's tickets",
  tsPlayers: "Players today",
  tsLargest: "Largest single entry",
  spotTitle: "Winner spotlight",
  spotNote: "The latest settled draw · dayWinner + dayPool",
  spotEmpty: "The first winner appears here after the first settle — 00:00 UTC.",
  spotPrizeLabel: "Prize paid — the whole pool",
  spotWinnerLabel: "Winning wallet",
  spotMeta: "Day {day} · {date} · winning ticket #{ticket}",
  shareWinnerBtn: "Share the win",
  shareWinnerText: "🏆 Yesterday's AgentDraw winner took home {prize} — the whole prize pool, paid by the contract at settle. One ticket 0.0005 BNB · Agent ID holders only · https://agentdraw.click/",
  shareWinnerOldText: "🏆 A recent AgentDraw winner took home {prize} — the whole prize pool. Daily on-chain draw for Agent ID holders · ticket 0.0005 BNB · https://agentdraw.click/",
  statsTitle: "The all-time record",
  statsCaption: "Read from the contract over settled days (last 90 days scanned). Ticket totals are computed from pools — every ticket adds exactly 0.000325 BNB of pool.",
  statsCaptionPre: "Counting starts at launch. These numbers are read from the contract — never typed in by hand.",
  stPaid: "Paid out to winners",
  stDraws: "Draws settled",
  stBiggest: "Biggest single pool",
  stTickets: "Tickets sold (from pools)",
  verifyTitle: "Verify it yourself",
  verifyNote: "Don't take this page's word for anything — the contract is public, and every number on it can be checked with a block explorer or a single eth_call.",
  verifyAddrLabel: "Contract address",
  verifyAddrPre: "Published here at launch — and only ever here and on the official X (@AgentDrawBNB). An address that reaches you from anywhere else is not ours.",
  verifyBsc: "View on BscScan",
  verifySourcify: "Verify the source on Sourcify",
  verifySeedTitle: "How the winning ticket is derived",
  verifySeedNote: "Computed inside settleDay() from public inputs, so anyone can recompute it after the settle transaction and confirm the winner. Transparent and tamper-evident — but not VRF-grade: the settler chooses when to call, and timing can influence the result.",
  verifyReadsTitle: "Public reads — call them yourself",
  verifyColFn: "Function",
  verifyColSel: "Selector",
  verifyColWhat: "Returns",
  retPoolToday: "today's prize pool, in wei",
  retTicketsToday: "tickets sold today",
  retEntriesCount: "entry chunks recorded today",
  retEntryAt: "chunk wallet + its cumulative tickets",
  retDayTotal: "total tickets sold that day",
  retDayPool: "that day's prize pool, in wei",
  retDayWinner: "winner of a settled day (zero until settled)",
  retDayWinningTicket: "the winning ticket number",
  retMyTickets: "a wallet's tickets in today's draw",
  retTicketsOf: "a wallet's tickets on a given day",
  retWinsOf: "lifetime draws won",
  retTicketPrice: "500000000000000 wei — a fixed constant",
  retFeePercent: "35 — a fixed constant",
  retPaused: "whether new entries are paused",
  faqTitle: "Questions, answered straight",
  faqQ1: "Why can only Agent ID holders play?",
  faqA1: "AgentDraw is built for the Binance Agent ID ecosystem: the .ai Agent ID is the entry pass, and the contract checks balanceOf on the registry (0x60B9…022F) on every enter(). One identity standard keeps the draw inside the agent economy it was made for — and the agent prompts, llms.txt and draw.json on this site are written for exactly those holders' agents.",
  faqQ2: "What happens if nobody calls settleDay()?",
  faqA2: "Nothing is lost and nothing is stuck. The finished day's pool simply waits in the contract — settling is permissionless, so anyone (a player, an agent, you) can call settleDay() at any later time. Each call settles the oldest unsettled day, so a backlog clears one day per call until it catches up.",
  faqQ3: "Can the owner touch the prize pool?",
  faqA3: "No. The only balance the owner can withdraw is the accumulated 35% entry fees, which are credited separately at entry. Prize pools sit in their own accounting until settleDay() pays them to the winner — the contract's invariant is balance == owner fees + unsettled prize pools, and it was proven in the test suite, including a withdraw attempt against a live pool.",
  faqQ4: "When exactly does the day roll over?",
  faqA4: "At 00:00 UTC — 07:00 WIB. A day is the UTC day index (timestamp / 86400): tickets bought before the rollover belong to the old day, tickets after it belong to the new one. The countdown in the hero is the time left in the current day.",
  faqQ5: "How is the winner picked — and can it be checked?",
  faqA5: "At settle, the contract derives the winning ticket as keccak256(day, totalTickets, blockhash of the block before the settle transaction) mod totalTickets, +1, then pays the wallet whose entry range contains that ticket. Anyone can recompute it after the fact and verify the winner — but be straight about the limit: this is verifiable-after-the-fact, not VRF-grade randomness, because the settler picks the moment of the call.",
  faqQ6: "When is the 35% fee taken?",
  faqA6: "Instantly, at entry, inside the same transaction: of every 0.0005 BNB ticket, exactly 0.000175 BNB is credited to the owner's fee balance and 0.000325 BNB joins the prize pool. Nothing more is deducted at settle — the winner receives 100% of the accumulated pool. The split is a constant in the contract and cannot be changed.",
  faqQ7: "What happens on a day with zero entries?",
  faqA7: "It settles cleanly: no winner, no payment, and the next settleDay() call moves on to the following day. An empty day costs nobody anything.",
  faqQ8: "How many tickets can I buy?",
  faqA8: "1–20 tickets per enter() transaction, at exactly 0.0005 BNB per ticket — any other amount is rejected by the contract. There is no limit on the number of transactions: buy again as often as you like and your tickets add up in today's ranges.",
  agentsTitle: "Built for agents",
  agentsNote: "AgentDraw is agent-first. The complete machine-readable spec lives on this domain — point your agent at it and it can play, settle and verify without scraping this page.",
  agentsLlms: "the full draw spec — facts, rules, prompts — in plain text",
  agentsJson: "facts, selectors and copy-ready prompts as structured JSON",
  agentsClawhub: "ClawHub skill — play-agent-draw, published on ClawHub",
  agentsEnterLabel: "The whole game, in one line:",
  earnTitle: "Earn your ticket — the free daily check-in",
  earnRefresh: "Free · value 0 · once a day",
  earnSub: 'No BNB payment needed to start: Agent ID holders <b>check in free</b> once a day and earn <b>1 point</b> per check-in. At <b>100 points</b>, <span class="mono">redeem()</span> pays you exactly <b>0.0005 BNB</b> — the price of one ticket — from the check-in pool. The pool is funded by the project and by anyone who wants to support it; it has <b>no owner withdrawal</b>, so funded BNB can only ever leave as redemptions.',
  earnSubPre: 'The free daily check-in is not live yet: Agent ID holders will <b>check in free</b> once a day to earn <b>1 point</b> per check-in, and <b>100 points</b> will pay exactly <b>0.0005 BNB</b> — the price of one ticket — from a pool with <b>no owner withdrawal</b>. It opens the moment the check-in contract is deployed and funded.',
  ciPointsLabel: "Your points",
  ciStatusLabel: "Today",
  ciPoolLabel: "Check-in pool",
  ciTodayLabel: "Check-ins today",
  ciStatusReady: "✓ You can check in today",
  ciStatusDone: "Checked in — back tomorrow",
  ciStatusNoId: "No Agent ID in this wallet",
  ciStatusPaused: "Check-ins paused (redeem still open)",
  ciStatusNoAddr: "Paste or connect an address",
  promptCheckInTitle: "Agent-first — hand this to your AI agent (the FREE action)",
  ciAdvSummary: "Advanced — check in or redeem directly with a connected wallet",
  ciCheckInBtn: "Check in free — checkIn()",
  ciRedeemBtn: "Redeem 100 points — redeem()",
  ciHint: "checkIn() sends value 0 — you only pay gas. redeem() needs 100 points and pays exactly 0.0005 BNB from the pool to your wallet.",
  toastCheckIn: "Checked in — +1 point. See you tomorrow.",
  toastRedeem: "Redeemed — 0.0005 BNB from the check-in pool is on its way to your wallet.",
  toastCheckInNotLive: "The check-in contract is not live yet — this button goes live with it."
},
zh: {
  docTitle: "AgentDraw — 币安 Agent ID 持有者每日链上抽奖",
  statusNotLive: "合约尚未上线",
  statusLive: "● 抽奖进行中",
  statusPaused: "抽奖进行中 — 购票已暂停",
  connectWallet: "连接钱包",
  heroTitle: '每日一抽。<span class="accent">天天开奖。</span>',
  heroSub: '专为 BNB 链上的币安 <b>.ai Agent ID</b> 持有者打造的每日链上抽奖。每张票 <b>0.0005 BNB</b>——<b>每张票的 65%</b>汇入<b>当日奖池</b>——<b>00:00 UTC</b> 之后，一张中奖票独得<b>全部奖池</b>。没有 NFT，只有奖票。',
  heroKicker: "每日链上抽奖 · BNB 链 · 2026 年创立",
  tickerText: "每日抽奖 · 仅限 Agent ID 持有者 · 65% 归赢家 · 00:00 UTC 结算 · 没有 NFT — 只有奖票 · 一张中奖票独得奖池 ·\u00A0",
  statPool: "今日奖池",
  statPoolSub: "结算时赢家独得全部奖池",
  statTickets: "今日票数",
  statTicketsSub: "参与今日抽奖",
  statEntries: "今日购票笔数",
  statEntriesSub: "今日买入交易数",
  statSettle: "距开奖结算",
  noteNotDeployed: "合约尚未部署——部署完成的那一刻，本页面将正式上线。",
  noteLive: "抽奖已开启——今日奖票发售至 00:00 UTC。",
  notePaused: "项目方已暂停购票。已结束日期的结算仍可正常进行。",
  ctaBuy: "购买奖票",
  ctaHow: "玩法说明",
  buyTitle: "购买今日奖票",
  buySub: '你的钱包必须持有币安 <b>.ai Agent ID</b>（<span class="mono small">0x60B9…022F</span>）——合约会在每次购票时进行验证。每张票价格为恰好 <b>0.0005 BNB</b>；每笔交易可买 <b>1–20 张</b>，次数不限。每张票中，<b>65% 汇入奖池</b>，<b>35% 为项目手续费</b>，购票时即时扣除。',
  qtyLabel: "张票",
  costLabel: "总价",
  perTicket: "每张 0.0005 BNB",
  myTicketsLabel: "你今日的票数",
  enterBtn: "购买奖票 — enter()",
  enterHint: "连接一个持有 .ai Agent ID 的钱包。按钮发送的金额恰好为票数 × 0.0005 BNB——任何其他金额都会被合约拒绝。全程不涉及任何授权。",
  promptEnterTitle: "Agent 优先 — 把这段提示词交给你的 AI Agent",
  copyPrompt: "复制提示词",
  boardTitle: "今日购票榜",
  boardRefresh: "数据实时来自合约 · 每 60 秒刷新",
  boardNote: "今日抽奖的钱包按持票数排名。票越多，占据的中奖区间越大。",
  boardNoteCapped: "今日抽奖的钱包（最近 {cap} 笔购票）按持票数排名。票越多，占据的中奖区间越大。",
  boardEmptyPre: "暂无记录——今日购票记录将显示在这里。",
  boardEmptyNone: "今日尚无人购票——第一位买家将开启今日抽奖。",
  boardMeta: "<b>{n}</b> 张 · 中奖率 {pct}%",
  youChip: "你",
  youTitle: "你的抽奖卡",
  youSub: "连接钱包，或粘贴任意地址，即可查询其 Agent ID、今日票数和历史中奖次数。",
  youPlaceholder: "0x… 钱包地址",
  youLookup: "查询",
  youWallet: "钱包",
  youAgentId: "Agent ID",
  youTickets: "今日票数",
  youWins: "中奖次数",
  idHeld: "✓ 已持有 Agent ID",
  idNone: "未持有 Agent ID",
  settleTitle: "结算开奖",
  settleSub: "00:00 UTC 之后，任何人都可以结算已结束的日期——无需项目方参与。合约会从当日的购票区间中抽出一张奖票，并自动把全部奖池支付给赢家。",
  promptSettleTitle: "Agent 提示词 — 每日结算（任何人都可以调用）",
  settleBtn: "用我的钱包调用 settleDay()",
  settleNote: "无需许可——一次调用结算最早一个未结算的日期；重复调用可逐日补结算。",
  hallTitle: "开奖名人堂",
  hallRefresh: "已结算日期，数据来自 dayWinner",
  hallNote: "每个结算日只产生一张中奖票。赢家永久记录在链上。",
  hallEmptyPre: "尚无任何日期完成结算。",
  hallEmptyNone: "尚无日期完成结算——首位赢家将在 00:00 UTC 后的第一次结算时产生。",
  hallMeta: "第 {day} 天 · {date} · 中奖票 #{ticket} · 奖金 {prize}",
  hallWinOne: " · 共中奖 <b>{n}</b> 次",
  hallWinsMany: " · 共中奖 <b>{n}</b> 次",
  howTitle: "玩法说明",
  how1: "钱包里持有一张币安 .ai Agent ID——它是你的入场资格，合约会在每次购票时验证。",
  how2: "每笔交易购买 1–20 张票，每张恰好 0.0005 BNB。每张票的 65% 进入当日奖池，35% 为项目手续费。",
  how3: "每日在 00:00 UTC 结束。之后任何人都可以调用 settleDay()——合约从当日的购票区间中抽出一张中奖票。",
  how4: "中奖票的持有者获得全部奖池——即当日所售每张票 65% 份额的总和——由合约在同一笔交易中支付。",
  rulesTitle: "规则 — 与合约实际执行完全一致",
  rule1: '<b>参赛资格。</b>你的钱包必须持有币安 .ai Agent ID（SPACE ID .ai NFT，地址为 <span class="mono small">0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F</span>）。合约会在每次 <span class="mono">enter()</span> 时进行验证。',
  rule2: '<b>奖票。</b>每张票价格为恰好 <b>0.0005 BNB</b>——这是合约中的常量，任何人都无法更改。每笔交易可买 <b>1–20 张</b>；可重复购买，票数累加。没有 NFT，也不需要任何授权。',
  rule3: '<b>分配方式。</b>每张票在购票时即时分配：<b>65%</b> 汇入该 UTC 日的奖池，<b>35%</b> 为项目手续费，在同一笔交易中即时计入项目方余额。奖票只属于购买当日——不会结转，昨日的票永不参与今日抽奖。',
  rule4: '<b>开奖。</b>某日在 <b>00:00 UTC</b> 结束后，任何人都可以调用 <span class="mono">settleDay()</span>。系统从当日票号区间中抽出一个票号；其所在购票区间的钱包赢得<b>全部奖池</b>——即当日所有奖票 65% 份额的累计——并自动到账。结算时不再扣除任何费用：手续费已在购票时收取。',
  rule5: '<b>中奖票如何产生 — 如实说明。</b>中奖票号由以下数据的哈希推导：日期、当日总票数、以及结算交易前一个区块的哈希。结算后任何人都可以复算并核实赢家。它透明且可验证、防篡改，但<b>不是</b> VRF 级别的随机数：结算者可以自行选择调用时机，时机可能影响结果。请只用输得起的金额参与。',
  rule6: '<b>空日期。</b>某日若无人购票，结算时没有赢家、也没有付款。若多个日期未结算，<span class="mono">settleDay()</span> 每次调用结算一天，直到补齐。',
  rule7: '<b>项目方权限很有限。</b>项目方可以暂停新的购票（结算和奖池永远不受影响），且只能提取已累计的 35% 购票手续费。项目方永远无法动用奖池、更改票价或 65/35 的分配比例，也无法指定赢家。',
  rule8: '<b>不作任何承诺。</b>买票买的是机会，绝不保证中奖。合约支付的唯一奖励是结算时赢家的奖金——当日全部奖池。中奖概率恰好等于你的票数除以当日总票数。',
  footerTagline: "AgentDraw · 每日链上抽奖 · BNB 智能链（chainId 56）",
  footerContractLabel: "合约：",
  notDeployedYet: "尚未部署",
  bscScanPending: "BscScan — 合约（部署后可用）",
  bscScanLive: "BscScan — 合约",
  xPending: "X — 官方账号（即将公布）",
  llmsLink: "llms.txt（Agent 专用）",
  footerDisclaimer: "面向币安 Agent ID 持有者的独立项目，与币安无隶属关系。以上规则即合约规则——参与前请先在 BscScan 上核实。",
  toastCopied: "提示词已复制 — 粘贴给你的 AI Agent 即可。",
  toastCopyFailed: "复制失败 — 提示词文本已选中，请手动复制。",
  toastBadAddress: "请先粘贴一个有效的 0x… 钱包地址。",
  toastNoWallet: "此浏览器未检测到钱包。请使用上方的 Agent 提示词，或在钱包浏览器中打开本页。",
  toastNoAccount: "钱包中没有已授权的账户。",
  toastConnectFail: "钱包连接失败：",
  toastNotDeployed: "合约尚未部署 — 此按钮将在部署后启用。",
  toastTxFail: "交易未发送：",
  toastEnter: "已成功购买 {n} 张今日奖票。",
  toastSettle: "settleDay() 已发送 — 正在为已结束的日期开奖。",
  sharePool: "分享今日奖池",
  sharePoolText: "🎟️ 今日 AgentDraw 奖池已达 {pool}——00:00 UTC 结算时，一张中奖票独得全部奖池。票价 0.0005 BNB · 仅限 Agent ID 持有者 · https://agentdraw.click/",
  sharePoolTextPre: "🎟️ AgentDraw——专为币安 .ai Agent ID 持有者打造的每日链上抽奖。票价 0.0005 BNB · 每张票 65% 汇入奖池 · 00:00 UTC 结算赢家独得全部 · 没有 NFT · https://agentdraw.click/",
  actTitle: "实时动态",
  actRefresh: "最新在前 · 数据来自 entryAt",
  actNote: "今日抽奖的每一笔购票，按购买顺序排列。合约的购票记录不带时间戳，因此本列表按购买顺序而非时钟排序。",
  actEmptyPre: "上线后动态开始流动——每一笔购票落地的瞬间都会出现在这里。",
  actEmptyNone: "今日尚无人购票——第一笔购票将开启动态流。",
  actMeta: "<b>+{n}</b> 张 · 累计中奖率 {pct}%",
  actMetaShare: "<b>+{n}</b> 张 · 占今日票数 {pct}%",
  tsPlayers: "今日玩家数",
  tsLargest: "单笔最大购票",
  spotTitle: "赢家特写",
  spotNote: "最近一次已结算抽奖 · dayWinner + dayPool",
  spotEmpty: "首位赢家将在第一次结算后出现在这里——00:00 UTC。",
  spotPrizeLabel: "已支付奖金 — 全部奖池",
  spotWinnerLabel: "中奖钱包",
  spotMeta: "第 {day} 天 · {date} · 中奖票 #{ticket}",
  shareWinnerBtn: "分享这次中奖",
  shareWinnerText: "🏆 昨日 AgentDraw 赢家带走了 {prize}——全部奖池，由合约在结算时直接支付。每张票 0.0005 BNB · 仅限 Agent ID 持有者 · https://agentdraw.click/",
  shareWinnerOldText: "🏆 近期一位 AgentDraw 赢家带走了 {prize}——全部奖池。面向 Agent ID 持有者的每日链上抽奖 · 每张票 0.0005 BNB · https://agentdraw.click/",
  statsTitle: "历史总记录",
  statsCaption: "数据读取自合约的已结算日期（扫描最近 90 天）。票数由奖池反推——每张票恰好为奖池贡献 0.000325 BNB。",
  statsCaptionPre: "计数从上线开始。这些数字读取自合约——绝非手工填写。",
  stPaid: "已支付给赢家的总额",
  stDraws: "已结算期数",
  stBiggest: "单期最大奖池",
  stTickets: "已售票数（由奖池推算）",
  verifyTitle: "亲自验证",
  verifyNote: "不要轻信本页面的任何说法——合约是公开的，这里每一个数字都可以用区块浏览器或一次 eth_call 核实。",
  verifyAddrLabel: "合约地址",
  verifyAddrPre: "将在上线时在此公布——且只会在此处与官方 X（@AgentDrawBNB）公布。从任何其他渠道获得的地址都不是我们的。",
  verifyBsc: "在 BscScan 查看",
  verifySourcify: "在 Sourcify 验证源码",
  verifySeedTitle: "中奖票如何产生",
  verifySeedNote: "在 settleDay() 内部由公开输入计算得出，因此任何人都能在结算交易后复算并确认赢家。透明且防篡改——但并非 VRF 级别：结算者可以自行选择调用时机，时机可能影响结果。",
  verifyReadsTitle: "公开读取函数 — 可自行调用",
  verifyColFn: "函数",
  verifyColSel: "选择器",
  verifyColWhat: "返回",
  retPoolToday: "今日奖池（单位：wei）",
  retTicketsToday: "今日已售票数",
  retEntriesCount: "今日记录的购票笔数",
  retEntryAt: "该笔钱包地址 + 其累计票数",
  retDayTotal: "该日已售总票数",
  retDayPool: "该日奖池（单位：wei）",
  retDayWinner: "已结算日期的赢家（未结算为零地址）",
  retDayWinningTicket: "中奖票号",
  retMyTickets: "某钱包在今日抽奖中的票数",
  retTicketsOf: "某钱包在指定日期的票数",
  retWinsOf: "历史中奖次数",
  retTicketPrice: "500000000000000 wei — 固定常量",
  retFeePercent: "35 — 固定常量",
  retPaused: "新购票是否处于暂停状态",
  faqTitle: "常见问题，直截了当",
  faqQ1: "为什么只有 Agent ID 持有者能玩？",
  faqA1: "AgentDraw 为币安 Agent ID 生态而建：.ai Agent ID 是入场凭证，合约会在每次 enter() 时检查登记合约（0x60B9…022F）的 balanceOf。统一的身份标准让抽奖留在这个为之打造的 agent 经济体内——本站的 agent 提示词、llms.txt 与 draw.json 正是为这些持有者的 agent 所写。",
  faqQ2: "如果没人调用 settleDay() 会怎样？",
  faqA2: "什么都不会丢失，也不会卡住。已结束日期的奖池只是静静待在合约里——结算无需许可，任何人（玩家、agent、你）都可以随时调用 settleDay()。每次调用结算最早一个未结算日期，积压会逐日补齐。",
  faqQ3: "项目方能动用奖池吗？",
  faqA3: "不能。项目方唯一能提取的余额是购票时单独计入的 35% 手续费累计额。奖池有独立的记账，直到 settleDay() 将其支付给赢家——合约的不变量是：余额 == 项目方手续费 + 未结算奖池之和，这一点已在测试套件中证明，包括在奖池存续期间尝试提款的场景。",
  faqQ4: "日期到底在什么时候切换？",
  faqA4: "在 00:00 UTC——即 WIB 时间 07:00。一天即 UTC 天序号（时间戳 / 86400）：切换前购买的票属于旧日，切换后购买的属于新日。页面顶部的倒计时就是当前这一天的剩余时间。",
  faqQ5: "赢家如何产生——可以核查吗？",
  faqA5: "结算时，合约按 keccak256（日期、当日总票数、结算交易前一个区块的哈希）对总票数取模再 +1，推导出中奖票号，并支付给该票号所在购票区间的钱包。事后任何人都可以复算并核实赢家——但也要如实说明其局限：这是事后可验证，而非 VRF 级别的随机数，因为结算者可以挑选调用的时机。",
  faqQ6: "35% 手续费什么时候收取？",
  faqA6: "即时收取，就在购票的同一笔交易内：每张 0.0005 BNB 的票中，恰好 0.000175 BNB 计入项目方手续费余额，0.000325 BNB 汇入奖池。结算时不再扣除任何费用——赢家获得累计奖池的 100%。该分配比例是合约常量，无法更改。",
  faqQ7: "某天零购票会怎样？",
  faqA7: "会干净地结算：没有赢家、没有付款，下一次 settleDay() 调用直接进入下一天。空日期不会让任何人付出代价。",
  faqQ8: "我能买多少张票？",
  faqA8: "每笔 enter() 交易可买 1–20 张，每张恰好 0.0005 BNB——任何其他金额都会被合约拒绝。交易笔数不限：可任意次重复购买，票数会在今日区间中累加。",
  agentsTitle: "为 Agent 而建",
  agentsNote: "AgentDraw 以 agent 为先。完整的机器可读规范就托管在本域名——让你的 agent 读取它，即可参与、结算与验证，无需抓取本页面。",
  agentsLlms: "完整抽奖规范——事实、规则、提示词——纯文本格式",
  agentsJson: "事实、选择器与可复制提示词，结构化 JSON",
  agentsClawhub: "ClawHub 技能 — play-agent-draw，已在 ClawHub 发布",
  agentsEnterLabel: "整个玩法，一行说清：",
  earnTitle: "赚取你的奖票 — 每日免费签到",
  earnRefresh: "免费 · 金额 0 · 每日一次",
  earnSub: '无需支付 BNB 即可开始：Agent ID 持有者每天可<b>免费签到</b>一次，每次获得 <b>1 分</b>。累计 <b>100 分</b>后，调用 <span class="mono">redeem()</span> 即可从签到奖池中获得恰好 <b>0.0005 BNB</b>——正是一张奖票的价格。奖池由项目方及任何愿意支持的人注资；它<b>没有项目方提款功能</b>，因此注入的 BNB 只能以兑换的形式流出。',
  earnSubPre: '每日免费签到尚未上线：Agent ID 持有者将可每天<b>免费签到</b>一次，每次获得 <b>1 分</b>；累计 <b>100 分</b>可获得恰好 <b>0.0005 BNB</b>——正是一张奖票的价格——资金来自一个<b>没有项目方提款功能</b>的奖池。签到合约部署并注资后即刻开启。',
  ciPointsLabel: "你的分数",
  ciStatusLabel: "今日状态",
  ciPoolLabel: "签到奖池",
  ciTodayLabel: "今日签到数",
  ciStatusReady: "✓ 今天可以签到",
  ciStatusDone: "已签到 — 明天再来",
  ciStatusNoId: "此钱包未持有 Agent ID",
  ciStatusPaused: "签到已暂停（兑换仍可进行）",
  ciStatusNoAddr: "请粘贴或连接一个地址",
  promptCheckInTitle: "Agent 优先 — 把这段提示词交给你的 AI Agent（免费操作）",
  ciAdvSummary: "高级 — 用已连接的钱包直接签到或兑换",
  ciCheckInBtn: "免费签到 — checkIn()",
  ciRedeemBtn: "兑换 100 分 — redeem()",
  ciHint: "checkIn() 发送的金额为 0——你只支付 gas。redeem() 需要 100 分，并从奖池中向你的钱包支付恰好 0.0005 BNB。",
  toastCheckIn: "签到成功 — +1 分。明天见。",
  toastRedeem: "兑换成功 — 签到奖池的 0.0005 BNB 正在发送到你的钱包。",
  toastCheckInNotLive: "签到合约尚未上线 — 上线后此按钮即可使用。"
}
};
let lang = "en";
try { const saved = localStorage.getItem("agentdraw_lang"); if (saved === "zh" || saved === "en") lang = saved; } catch { /* storage unavailable */ }
function t(key, params) {
  let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
  if (params) for (const k of Object.keys(params)) s = s.split("{" + k + "}").join(String(params[k]));
  return s;
}
function fmtNum(v) { return Number(v).toLocaleString(lang === "zh" ? "zh-CN" : "en-US"); }
function applyLang() {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.title = t("docTitle");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.getAttribute("data-i18n")); });
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.getAttribute("data-i18n-html")); });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => { el.setAttribute("placeholder", t(el.getAttribute("data-i18n-ph"))); });
  const bEn = $("langEn"), bZh = $("langZh");
  if (bEn) bEn.classList.toggle("active", lang === "en");
  if (bZh) bZh.classList.toggle("active", lang === "zh");
  if (!walletAddress) $("connectBtn").textContent = t("connectWallet");
  if (!contractsReady()) {
    $("liveStatus").textContent = t("statusNotLive");
    $("drawStateNote").textContent = t("noteNotDeployed");
    $("drawStateNote").classList.remove("ok");
    $("contractAddr").textContent = t("notDeployedYet");
    $("footerBscScan").textContent = t("bscScanPending");
  }
  buildPrompts();
  paintQty();
  paintDynamicTexts();
  if (contractsReady()) { refreshAll(); if (youAddress) paintYou(); }
}
function setLang(l) {
  if (l !== "en" && l !== "zh") return;
  lang = l;
  try { localStorage.setItem("agentdraw_lang", l); } catch { /* storage unavailable */ }
  applyLang();
}

// ── Small helpers ─────────────────────────────────────────────
function $(id) { return document.getElementById(id); }
function validAddress(a) { return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a); }
function contractsReady() { return validAddress(CONTRACT); }
function pad32(hexNoPrefix) { return hexNoPrefix.padStart(64, "0"); }
function encAddress(address) { return pad32(String(address).toLowerCase().replace(/^0x/, "")); }
function encUint(value) { return pad32(BigInt(value).toString(16)); }
function shortenAddress(a) { return validAddress(a) ? a.slice(0, 6) + "…" + a.slice(-4) : "—"; }
function todayUTC() { return Math.floor(Date.now() / 86400000); }
function formatBNB(wei) {
  const v = BigInt(wei);
  if (v === 0n) return "0 BNB";
  const whole = v / 1000000000000000000n;
  const frac = (v % 1000000000000000000n).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return (frac ? whole.toString() + "." + frac : whole.toString()) + " BNB";
}
let toastTimer = null;
function showToast(msg) {
  const t2 = $("toast"); if (!t2) return;
  t2.textContent = msg; t2.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t2.classList.remove("show"), 4200);
}

// ── RPC failover pool (pattern proven on the Pokepvp/Crown Race sites) ──
const BSC_RPC_URLS = [
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc.publicnode.com",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed4.binance.org"
];
let rpcIndex = 0;
async function fetchRpc(url, to, data) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }), signal: ctrl.signal });
    if (!res.ok) throw new Error("RPC HTTP " + res.status);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message || "RPC error");
    return json.result;
  } finally { clearTimeout(timer); }
}
// Concurrency cap: a page load fires dozens of reads; bursting them all at
// one endpoint trips its rate limit (HTTP 429) and every painter starves.
// At most 4 reads are in flight at once; the rest queue in order.
let rpcInFlight = 0;
const rpcWaiters = [];
function rpcAcquire() {
  if (rpcInFlight < 4) { rpcInFlight += 1; return Promise.resolve(); }
  return new Promise(res => rpcWaiters.push(res));
}
function rpcRelease() {
  const next = rpcWaiters.shift();
  if (next) next(); else rpcInFlight -= 1;
}
const rpcSleep = ms => new Promise(res => setTimeout(res, ms));
async function ethCall(to, data) {
  await rpcAcquire();
  try {
    if (window.ethereum) {
      try {
        // A locked or wrong-chain wallet provider can hang an eth_call
        // indefinitely; race it against 5s, then fall through to the pool.
        return await Promise.race([
          window.ethereum.request({ method: "eth_call", params: [{ to, data }, "latest"] }),
          rpcSleep(5000).then(() => { throw new Error("wallet provider read timed out"); })
        ]);
      }
      catch { /* wallet provider failed the read — fall through to the public RPC pool */ }
    }
    let lastError = null;
    for (let attempt = 0; attempt < BSC_RPC_URLS.length; attempt++) {
      const idx = (rpcIndex + attempt) % BSC_RPC_URLS.length;
      try { const out = await fetchRpc(BSC_RPC_URLS[idx], to, data); rpcIndex = idx; return out; }
      catch (e) {
        lastError = e;
        // Rate-limited: breathe before hitting the next endpoint instead of
        // carrying the same burst (and the same 429) down the whole pool.
        if (/429|rate/i.test(String((e && e.message) || e))) await rpcSleep(700);
      }
    }
    throw lastError || new Error("All BSC RPC endpoints failed");
  } finally { rpcRelease(); }
}
async function readUint(to, data) { const out = await ethCall(to, data); return (!out || out === "0x") ? 0n : BigInt(out); }
async function readBool(to, data) { return (await readUint(to, data)) !== 0n; }
async function readAddress(to, data) { const out = await ethCall(to, data); return (!out || out === "0x") ? "" : "0x" + out.slice(-40); }
function sameAddr(a, b) { return validAddress(a) && validAddress(b) && a.toLowerCase() === b.toLowerCase(); }

// ── Quantity picker ───────────────────────────────────────────
let qty = 5;
function paintQty() {
  $("qtyValue").textContent = qty;
  $("costTotal").textContent = formatBNB(BigInt(qty) * BigInt(TICKET_PRICE_WEI));
  document.querySelectorAll("[data-qty]").forEach(chip => chip.classList.toggle("active", Number(chip.getAttribute("data-qty")) === qty));
  buildPrompts();
}
function setQty(n) {
  qty = Math.max(1, Math.min(MAX_PER_TX, Math.floor(Number(n) || 1)));
  paintQty();
}
$("qtyMinus").addEventListener("click", () => setQty(qty - 1));
$("qtyPlus").addEventListener("click", () => setQty(qty + 1));
document.querySelectorAll("[data-qty]").forEach(chip => chip.addEventListener("click", () => setQty(Number(chip.getAttribute("data-qty")))));

// ── Agent prompts (kept in sync with the contract constants) ──
function contractLine() {
  return contractsReady() ? CONTRACT : "(not deployed yet — take the address from the official site / draw.json once it is published)";
}
function buildPrompts() {
  const addr = contractLine();
  const totalWei = (BigInt(qty) * BigInt(TICKET_PRICE_WEI)).toString();
  const totalBNB = formatBNB(BigInt(qty) * BigInt(TICKET_PRICE_WEI)).replace(" BNB", "");
  $("promptEnter").value =
`Enter today's AgentDraw — BNB Chain (56).
Contract: ${addr}
Call enter(${qty}) · selector 0xa59f3e0c · value ${totalWei} wei (${qty} × 0.0005 BNB = ${totalBNB} BNB) · gasLimit 300000.
Price rule: exactly 500000000000000 wei per ticket, 1–20 tickets per call. 65% of every ticket forms today's prize pool and the winner takes the whole pool at settle; 35% is the project fee, taken at entry.
Check first (stop and name any failure): my wallet holds a Binance Agent ID (balanceOf on ${AGENT_ID} > 0) · paused()=false.
No approvals. Reply with the tx link only.`;
  $("promptSettle").value =
`Settle the oldest unsettled AgentDraw day — BNB Chain (56). Only after 00:00 UTC.
Contract: ${addr}
Call settleDay() · selector 0xca624b77 · value 0 · gasLimit 300000. Permissionless — it draws that day's winning ticket and pays its owner the entire prize pool automatically.
No approvals. Reply: tx link + the winner from dayWinner for the settled day.`;
  const ciEl = $("promptCheckIn");
  if (ciEl) {
    const ciAddr = checkInReady() ? CHECKIN : "(check-in contract not deployed yet — take the address from the official site / draw.json once it is published)";
    ciEl.value =
`Do your FREE daily AgentDraw check-in — BNB Chain (56). This action costs no BNB: value 0, no approval (you only pay your own gas).
Check-in contract: ${ciAddr}
Call checkIn() · selector 0x183ff085 · value 0 · gasLimit 200000. Awards 1 point. One check-in per wallet per UTC day.
Points rule: points are not a token and are never called cash. 100 points = exactly 0.0005 BNB (one AgentDraw ticket's price), paid from the check-in pool by redeem() · selector 0xbe040fb0 · value 0. The pool has no owner withdrawal — funded BNB can only leave as redemptions.
Check first (stop and name any failure): my wallet holds a Binance Agent ID (balanceOf on ${AGENT_ID} > 0) · canCheckInToday(my wallet) = true on the check-in contract.
No approvals. Reply with the tx link only.`;
  }
}
document.querySelectorAll("[data-copy]").forEach(btn => {
  btn.addEventListener("click", async () => {
    const el = $(btn.getAttribute("data-copy"));
    if (!el) return;
    try { await navigator.clipboard.writeText(el.value); showToast(t("toastCopied")); }
    catch { el.select(); showToast(t("toastCopyFailed")); }
  });
});

// ── Countdown to the next 00:00 UTC settle ────────────────────
function paintCountdown() {
  const now = Date.now();
  const next = (todayUTC() + 1) * 86400000;
  let s = Math.max(0, Math.floor((next - now) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  $("statCountdown").textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}
setInterval(paintCountdown, 1000); paintCountdown();

// ── Share links (X intents) ───────────────────────────────────
// The pool share text carries a figure ONLY when the contract is live
// and today's pool is actually > 0 — never a fabricated number. The
// winner share link is built by paintSpotlight from real settled data.
let lastPoolWei = null;
function xIntent(text) { return "https://x.com/intent/tweet?text=" + encodeURIComponent(text); }
function buildShareLinks() {
  const btn = $("sharePoolBtn");
  if (!btn) return;
  const live = contractsReady() && lastPoolWei !== null && lastPoolWei > 0n;
  btn.href = xIntent(live ? t("sharePoolText", { pool: formatBNB(lastPoolWei) }) : t("sharePoolTextPre"));
}
// JS-owned texts that applyLang's data-i18n pass cannot paint.
function paintDynamicTexts() {
  buildShareLinks();
  const earnSub = document.querySelector("#earn .panel-sub");
  if (earnSub && !checkInReady()) earnSub.innerHTML = t("earnSubPre");
  const cap = $("statsCaption");
  if (cap && !statsAgg) cap.textContent = t("statsCaptionPre");
  if (cap && statsAgg) paintStatsBand();
}

// ── Hero stats + status — each paints independently ───────────
async function paintStats() {
  if (!contractsReady()) return;
  const jobs = [
    (async () => { const p = await readUint(CONTRACT, SEL.poolToday); lastPoolWei = p; $("statPool").textContent = formatBNB(p); buildShareLinks(); })(),
    (async () => { $("statTickets").textContent = fmtNum(await readUint(CONTRACT, SEL.ticketsToday)); })(),
    (async () => { $("statEntries").textContent = fmtNum(await readUint(CONTRACT, SEL.entriesCountToday)); })(),
    (async () => {
      const isPaused = await readBool(CONTRACT, SEL.paused);
      const pill = $("liveStatus");
      pill.textContent = isPaused ? t("statusPaused") : t("statusLive");
      pill.className = "status-pill " + (isPaused ? "status-closed" : "status-live");
      const note = $("drawStateNote");
      note.textContent = isPaused ? t("notePaused") : t("noteLive");
      note.classList.toggle("ok", !isPaused);
    })()
  ];
  await Promise.allSettled(jobs);
}

// ── Earn: the free check-in companion ───────────────────────
// Pool + today's count paint for every visitor; points + status paint
// for the looked-up / connected address (youAddress), like the draw
// card. All reads go through the same v8 RPC pool as everything else.
async function refreshCheckIn() {
  if (!$("ciPool") || !checkInReady()) return;
  const jobs = [
    (async () => { $("ciPool").textContent = formatBNB(await readUint(CHECKIN, SEL_CI.poolBalance)); })(),
    (async () => { $("ciToday").textContent = fmtNum(await readUint(CHECKIN, SEL_CI.checkInsToday)); })()
  ];
  if (youAddress) {
    jobs.push((async () => { $("ciPoints").textContent = fmtNum(await readUint(CHECKIN, SEL_CI.pointsOf + encAddress(youAddress))); })());
    jobs.push((async () => {
      const el = $("ciStatus");
      const idBal = await readUint(AGENT_ID, SEL.balanceOf + encAddress(youAddress)).catch(() => 0n);
      if (idBal === 0n) { el.textContent = t("ciStatusNoId"); return; }
      const isPaused = await readBool(CHECKIN, SEL_CI.paused).catch(() => false);
      if (isPaused) { el.textContent = t("ciStatusPaused"); return; }
      const can = await readBool(CHECKIN, SEL_CI.canCheckInToday + encAddress(youAddress)).catch(() => false);
      el.textContent = can ? t("ciStatusReady") : t("ciStatusDone");
    })());
  } else {
    jobs.push((async () => { $("ciStatus").textContent = t("ciStatusNoAddr"); })());
  }
  await Promise.allSettled(jobs);
}

// ── Today's chunks — one read pass feeds board, activity, stats ──
// Entry chunks are read via entryAt(day, i): each chunk's tickets are
// (prevCumulative, cumulative]. The loader returns the raw chunks (in
// purchase order), the per-wallet aggregation, and the day's totals.
async function loadTodayChunks() {
  const day = BigInt(todayUTC());
  const count = Number(await readUint(CONTRACT, SEL.entriesCountToday));
  const totalTickets = await readUint(CONTRACT, SEL.ticketsToday);
  const chunks = [];
  const byWallet = new Map();
  if (count > 0 && totalTickets > 0n) {
    const start = Math.max(0, count - BOARD_SCAN_CAP);
    let prevCum = 0n;
    if (start > 0) {
      const base = await ethCall(CONTRACT, SEL.entryAt + encUint(day) + encUint(start - 1));
      prevCum = BigInt("0x" + base.slice(-64));
    }
    for (let i = start; i < count; i += 12) {
      const idxs = [];
      for (let j = i; j < Math.min(i + 12, count); j += 1) idxs.push(j);
      const res = await Promise.allSettled(idxs.map(k => ethCall(CONTRACT, SEL.entryAt + encUint(day) + encUint(k))));
      for (const r of res) {
        if (r.status !== "fulfilled" || !r.value || r.value === "0x") continue;
        const wallet = "0x" + r.value.slice(-104, -64);
        const cum = BigInt("0x" + r.value.slice(-64));
        const n = cum - prevCum;
        prevCum = cum;
        if (!validAddress(wallet) || n <= 0n) continue;
        chunks.push({ wallet, n });
        const key = wallet.toLowerCase();
        byWallet.set(key, (byWallet.get(key) || 0n) + n);
      }
    }
  }
  return { count, totalTickets, chunks, byWallet, capped: count > BOARD_SCAN_CAP };
}

function paintBoard(data) {
  const list = $("boardList");
  if (!data.chunks.length) { list.innerHTML = '<p class="empty">' + t("boardEmptyNone") + "</p>"; return; }
  const note = $("boardNote");
  if (note && data.capped) note.textContent = t("boardNoteCapped", { cap: BOARD_SCAN_CAP });
  const totalTickets = data.totalTickets;
  const rows = [...data.byWallet.entries()].map(([addr, n]) => ({ addr, n })).sort((a, b2) => (a.n === b2.n ? 0 : a.n > b2.n ? -1 : 1));
  if (!rows.length) { list.innerHTML = '<p class="empty">' + t("boardEmptyNone") + "</p>"; return; }
  list.innerHTML = rows.slice(0, 10).map((r, i) => {
    const you = youAddress && sameAddr(r.addr, youAddress);
    const pct = totalTickets > 0n ? (Number(r.n) / Number(totalTickets)) * 100 : 0;
    return `<div class="board-row${i === 0 ? " board-first" : ""}${you ? " board-you" : ""}"><span class="board-rank">${i === 0 ? "🎟️" : "#" + (i + 1)}</span><span class="board-addr">${shortenAddress(r.addr)}${you ? ' <b class="you-chip">' + t("youChip") + "</b>" : ""}</span><span class="board-meta">${t("boardMeta", { n: fmtNum(r.n), pct: pct.toFixed(1) })}</span></div>`;
  }).join("");
}

// Live activity stream: today's chunks, newest first. The views expose
// no timestamps, so rows are ordered by purchase only. Each row shows
// the buyer's running win chance right after that entry — unless the
// scan was capped, in which case the chunk's plain share is shown.
function paintActivity(data) {
  const list = $("actList");
  if (!list) return;
  if (!data.chunks.length) { list.innerHTML = '<p class="empty">' + t("actEmptyNone") + "</p>"; return; }
  const total = data.totalTickets;
  const run = new Map();
  const rows = data.chunks.map(c => {
    const key = c.wallet.toLowerCase();
    const cumRun = (run.get(key) || 0n) + c.n;
    run.set(key, cumRun);
    return {
      wallet: c.wallet,
      n: c.n,
      pctRun: total > 0n ? (Number(cumRun) / Number(total)) * 100 : 0,
      pctShare: total > 0n ? (Number(c.n) / Number(total)) * 100 : 0
    };
  });
  list.innerHTML = rows.slice(-12).reverse().map(r => {
    const you = youAddress && sameAddr(r.wallet, youAddress);
    const meta = data.capped
      ? t("actMetaShare", { n: fmtNum(r.n), pct: r.pctShare.toFixed(1) })
      : t("actMeta", { n: fmtNum(r.n), pct: r.pctRun.toFixed(1) });
    return `<div class="board-row${you ? " board-you" : ""}"><span class="board-rank">🎟️</span><span class="board-addr">${shortenAddress(r.wallet)}${you ? ' <b class="you-chip">' + t("youChip") + "</b>" : ""}</span><span class="board-meta">${meta}</span></div>`;
  }).join("");
}

function paintTodayStats(data) {
  $("tsTickets").textContent = fmtNum(data.totalTickets);
  $("tsPlayers").textContent = fmtNum(data.byWallet.size);
  $("tsEntries").textContent = fmtNum(data.count);
  let largest = 0n;
  for (const c of data.chunks) if (c.n > largest) largest = c.n;
  $("tsLargest").textContent = data.chunks.length ? fmtNum(largest) : "—";
}

async function refreshToday() {
  const data = await loadTodayChunks();
  paintBoard(data);
  paintActivity(data);
  paintTodayStats(data);
}

// ── Hall of Draws ─────────────────────────────────────────────
async function refreshHall() {
  const list = $("hallList");
  const today = todayUTC();
  const days = [];
  for (let d = today - 1; d >= Math.max(0, today - 14); d -= 1) days.push(d);
  const winners = [];
  for (let i = 0; i < days.length; i += 7) {
    const batch = days.slice(i, i + 7);
    const res = await Promise.allSettled(batch.map(d => readAddress(CONTRACT, SEL.dayWinner + encUint(d))));
    res.forEach((r, j) => { if (r.status === "fulfilled" && validAddress(r.value) && !sameAddr(r.value, ZERO_ADDRESS)) winners.push({ day: batch[j], addr: r.value }); });
  }
  if (!winners.length) { list.innerHTML = '<p class="empty">' + t("hallEmptyNone") + "</p>"; return; }
  const rows = await Promise.allSettled(winners.map(async w => {
    const [ticket, pool, wins] = await Promise.all([
      readUint(CONTRACT, SEL.dayWinningTicket + encUint(w.day)).catch(() => 0n),
      readUint(CONTRACT, SEL.dayPool + encUint(w.day)).catch(() => 0n),
      readUint(CONTRACT, SEL.winsOf + encAddress(w.addr)).catch(() => 0n)
    ]);
    return { ...w, ticket, pool, wins };
  }));
  list.innerHTML = rows.filter(r => r.status === "fulfilled").map(r => {
    const w = r.value;
    const you = youAddress && sameAddr(w.addr, youAddress);
    const date = new Date(w.day * 86400000).toISOString().slice(0, 10);
    const winsSuffix = w.wins ? t(w.wins === 1n ? "hallWinOne" : "hallWinsMany", { n: fmtNum(w.wins) }) : "";
    return `<div class="board-row${you ? " board-you" : ""}"><span class="board-rank">🏆</span><span class="board-addr">${shortenAddress(w.addr)}${you ? ' <b class="you-chip">' + t("youChip") + "</b>" : ""}</span><span class="board-meta">${t("hallMeta", { day: w.day, date, ticket: w.ticket.toString(), prize: formatBNB(w.pool) })}${winsSuffix}</span></div>`;
  }).join("");
}

// ── Winner spotlight ──────────────────────────────────────────
// The most recent settled day: scan back from yesterday, at most 14
// days, for the first day with a recorded winner and a pool > 0. The
// prize shown is that day's dayPool — settleDay paid 100% of it.
let spotData = null;
async function refreshSpotlight() {
  if (!$("spotCard")) return;
  const today = todayUTC();
  let found = null;
  for (let d = today - 1; d >= Math.max(0, today - 14) && !found; d -= 1) {
    const winner = await readAddress(CONTRACT, SEL.dayWinner + encUint(d)).catch(() => "");
    if (!validAddress(winner) || sameAddr(winner, ZERO_ADDRESS)) continue;
    const pool = await readUint(CONTRACT, SEL.dayPool + encUint(d)).catch(() => 0n);
    if (pool <= 0n) continue;
    const ticket = await readUint(CONTRACT, SEL.dayWinningTicket + encUint(d)).catch(() => 0n);
    found = { day: d, addr: winner, pool, ticket };
  }
  spotData = found;
  paintSpotlight();
}
function paintSpotlight() {
  const card = $("spotCard");
  if (!card) return;
  if (!spotData) { card.innerHTML = '<p class="empty">' + t("spotEmpty") + "</p>"; return; }
  const w = spotData;
  const date = new Date(w.day * 86400000).toISOString().slice(0, 10);
  const you = youAddress && sameAddr(w.addr, youAddress);
  const shareText = t(w.day === todayUTC() - 1 ? "shareWinnerText" : "shareWinnerOldText", { prize: formatBNB(w.pool) });
  card.innerHTML = `<div class="spot-grid">
    <div class="spot-main">
      <span class="stat-label">${t("spotPrizeLabel")}</span>
      <span class="pool-figure mono spot-figure">${formatBNB(w.pool)}</span>
      <span class="stat-sub">${t("spotMeta", { day: w.day, date, ticket: w.ticket.toString() })}</span>
    </div>
    <div class="spot-side">
      <span class="stat-label">${t("spotWinnerLabel")}</span>
      <span class="spot-addr-row"><a class="spot-addr mono" href="https://bscscan.com/address/${w.addr}" target="_blank" rel="noopener">${shortenAddress(w.addr)}</a>${you ? ' <b class="you-chip">' + t("youChip") + "</b>" : ""}</span>
      <a class="btn spot-share" href="${xIntent(shareText)}" target="_blank" rel="noopener">${t("shareWinnerBtn")}</a>
    </div>
  </div>`;
}

// ── All-time stats band ───────────────────────────────────────
// One pass per page load (not part of the 60s loop): scan back up to
// 90 days from yesterday in batches, aggregating settled days (a day
// counts when it has a recorded winner and a pool > 0 — dayPool is
// never cleared at settle, so it is exactly what the winner was paid).
// Implied tickets = totalPaid / 0.000325 BNB, exact by construction.
let statsAgg = null;
let statsDone = false;
let statsRunning = false;
async function refreshStats() {
  if (statsDone || statsRunning) return;
  statsRunning = true;
  try {
    const today = todayUTC();
    const days = [];
    for (let d = today - 1; d >= Math.max(0, today - 90); d -= 1) days.push(d);
    let totalPaid = 0n, draws = 0, biggest = 0n;
    for (let i = 0; i < days.length; i += 15) {
      const batch = days.slice(i, i + 15);
      const calls = [];
      for (const d of batch) {
        calls.push(readAddress(CONTRACT, SEL.dayWinner + encUint(d)));
        calls.push(readUint(CONTRACT, SEL.dayPool + encUint(d)));
      }
      const res = await Promise.allSettled(calls);
      batch.forEach((d, j) => {
        const w = res[j * 2], p = res[j * 2 + 1];
        if (w.status === "fulfilled" && p.status === "fulfilled" && validAddress(w.value) && !sameAddr(w.value, ZERO_ADDRESS) && p.value > 0n) {
          draws += 1;
          totalPaid += p.value;
          if (p.value > biggest) biggest = p.value;
        }
      });
    }
    statsAgg = { totalPaid, draws, biggest };
    statsDone = true;
    paintStatsBand();
  } catch { /* leave the band in its empty state; a later load can retry */ }
  finally { statsRunning = false; }
}
function paintStatsBand() {
  const cap = $("statsCaption");
  if (!statsAgg || statsAgg.draws === 0) {
    $("stPaid").textContent = "—";
    $("stDraws").textContent = "—";
    $("stBiggest").textContent = "—";
    $("stTickets").textContent = "—";
    if (cap) cap.textContent = t("statsCaptionPre");
    return;
  }
  $("stPaid").textContent = formatBNB(statsAgg.totalPaid);
  $("stDraws").textContent = fmtNum(statsAgg.draws);
  $("stBiggest").textContent = formatBNB(statsAgg.biggest);
  $("stTickets").textContent = fmtNum(statsAgg.totalPaid / POOL_PER_TICKET_WEI);
  if (cap) cap.textContent = t("statsCaption");
}

// ── YOU card ──────────────────────────────────────────────────
let youAddress = "";
async function paintYou() {
  if (!youAddress) return;
  $("youAddr").textContent = shortenAddress(youAddress);
  if (!contractsReady()) return;
  const jobs = [
    (async () => {
      const bal = await readUint(AGENT_ID, SEL.balanceOf + encAddress(youAddress));
      $("youAgentId").textContent = bal > 0n ? t("idHeld") : t("idNone");
    })(),
    (async () => {
      const n = await readUint(CONTRACT, SEL.myTicketsToday + encAddress(youAddress));
      $("youTickets").textContent = fmtNum(n);
      if (walletAddress && sameAddr(youAddress, walletAddress)) $("myTicketsNow").textContent = fmtNum(n);
    })(),
    (async () => { $("youWins").textContent = "🏆 " + fmtNum(await readUint(CONTRACT, SEL.winsOf + encAddress(youAddress))); })()
  ];
  await Promise.allSettled(jobs);
  if (spotData) paintSpotlight();
  refreshCheckIn();
}
$("youCheckBtn").addEventListener("click", () => {
  const v = $("youInput").value.trim();
  if (!validAddress(v)) { showToast(t("toastBadAddress")); return; }
  youAddress = v; paintYou();
});
$("youInput").addEventListener("keydown", e => { if (e.key === "Enter") $("youCheckBtn").click(); });

// ── Wallet connect + direct writes ────────────────────────────
let walletAddress = null;
async function ensureWallet() {
  if (!window.ethereum) { showToast(t("toastNoWallet")); return null; }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  if (!accounts || !accounts.length) { showToast(t("toastNoAccount")); return null; }
  walletAddress = accounts[0];
  try {
    const chain = await window.ethereum.request({ method: "eth_chainId" });
    if (chain !== DRAW_CONFIG.chainHex) {
      try { await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: DRAW_CONFIG.chainHex }] }); }
      catch {
        await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: DRAW_CONFIG.chainHex, chainName: "BNB Smart Chain Mainnet", nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 }, rpcUrls: ["https://bsc-dataseed.binance.org/"], blockExplorerUrls: ["https://bscscan.com"] }] });
      }
    }
  } catch { /* chain check is best-effort; the wallet will still refuse a wrong-chain tx */ }
  $("connectBtn").textContent = shortenAddress(walletAddress);
  youAddress = walletAddress; $("youInput").value = walletAddress; paintYou();
  return walletAddress;
}
$("connectBtn").addEventListener("click", () => { ensureWallet().catch(e => showToast(t("toastConnectFail") + (e.message || e))); });
async function sendTx(data, weiValue, okMsg) {
  if (!contractsReady()) { showToast(t("toastNotDeployed")); return; }
  const from = walletAddress || await ensureWallet();
  if (!from) return;
  try {
    const txHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: CONTRACT, data, value: "0x" + BigInt(weiValue).toString(16) }] });
    showToast(okMsg + " Tx: " + txHash);
    setTimeout(refreshAll, 4000);
  } catch (e) { showToast(t("toastTxFail") + (e.message || e)); }
}
$("enterBtn").addEventListener("click", () => sendTx(SEL.enter + encUint(qty), (BigInt(qty) * BigInt(TICKET_PRICE_WEI)).toString(), t("toastEnter", { n: qty })));
$("settleBtn").addEventListener("click", () => sendTx(SEL.settleDay, "0", t("toastSettle")));
// Check-in writes go to the COMPANION contract, always with value 0 —
// checkIn() is non-payable by design and redeem() pays out, never in.
async function sendCheckInTx(data, okMsg) {
  if (!checkInReady()) { showToast(t("toastCheckInNotLive")); return; }
  const from = walletAddress || await ensureWallet();
  if (!from) return;
  try {
    const txHash = await window.ethereum.request({ method: "eth_sendTransaction", params: [{ from, to: CHECKIN, data, value: "0x0" }] });
    showToast(okMsg + " Tx: " + txHash);
    setTimeout(refreshAll, 4000);
  } catch (e) { showToast(t("toastTxFail") + (e.message || e)); }
}
const ciInBtn = $("ciCheckInBtn");
if (ciInBtn) ciInBtn.addEventListener("click", () => sendCheckInTx(SEL_CI.checkIn, t("toastCheckIn")));
const ciOutBtn = $("ciRedeemBtn");
if (ciOutBtn) ciOutBtn.addEventListener("click", () => sendCheckInTx(SEL_CI.redeem, t("toastRedeem")));

// ── Language toggle ───────────────────────────────────────────
$("langEn").addEventListener("click", () => setLang("en"));
$("langZh").addEventListener("click", () => setLang("zh"));

// ── Footer wiring + refresh loop ──────────────────────────────
function paintFooter() {
  if (contractsReady()) {
    $("contractAddr").textContent = CONTRACT;
    const scan = $("footerBscScan");
    scan.href = "https://bscscan.com/address/" + CONTRACT; scan.textContent = t("bscScanLive");
    scan.removeAttribute("aria-disabled");
    // Verify section: swap the pre-launch note for the live address block.
    const vAddr = $("verifyAddr");
    if (vAddr) vAddr.textContent = CONTRACT;
    const vBsc = $("verifyBsc");
    if (vBsc) vBsc.href = "https://bscscan.com/address/" + CONTRACT;
    const vSrc = $("verifySourcify");
    if (vSrc) vSrc.href = "https://sourcify.dev/#/lookup/" + CONTRACT;
    const vLive = $("verifyAddrLive");
    if (vLive) vLive.hidden = false;
    const vPre = $("verifyAddrPre");
    if (vPre) vPre.hidden = true;
  }
  if (DRAW_CONFIG.xUrl) {
    const x = $("footerX");
    x.href = DRAW_CONFIG.xUrl; x.textContent = "X — @AgentDrawBNB"; x.removeAttribute("aria-disabled");
  }
}
let refreshBusy = false;
async function refreshAll() {
  if (!contractsReady() || refreshBusy) return;
  refreshBusy = true;
  try { await paintStats(); await refreshCheckIn(); await refreshToday(); await refreshSpotlight(); await refreshHall(); refreshStats(); if (youAddress) await paintYou(); }
  catch { /* keep the last good render */ }
  finally { refreshBusy = false; }
}
document.addEventListener("DOMContentLoaded", () => {
  buildPrompts();
  paintQty();
  applyLang();
  paintFooter();
  if (contractsReady()) { refreshAll(); setTimeout(refreshAll, 12000); setInterval(refreshAll, 60000); }
});

// ── Reveal on scroll (presentation only — no logic hooks) ─────
(function () {
  const els = document.querySelectorAll(".reveal");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in")); return; }
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.08 });
  els.forEach(e => io.observe(e));
})();
