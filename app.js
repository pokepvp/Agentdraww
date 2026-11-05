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
  contractAddress: "", // AgentDraw — not deployed yet; the owner deploys via deploy.html and this gets wired in
  chainId: 56,                  // BNB Smart Chain Mainnet
  chainHex: "0x38",
  agentIdAddress: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F", // Binance .ai Agent ID NFT (SPACE ID)
  xUrl: "https://x.com/AgentDrawBNB" // official X — @AgentDrawBNB (created by the owner 2026-11-05)
};
const CONTRACT = DRAW_CONFIG.contractAddress;
const AGENT_ID = DRAW_CONFIG.agentIdAddress;
const TICKET_PRICE_WEI = "500000000000000"; // 0.0005 BNB exactly, per ticket
const MAX_PER_TX = 20;
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
  boardEmptyPre: "Loading today's entries from the contract…",
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
  toastSettle: "settleDay() sent — the finished day is being drawn."
},
zh: {
  docTitle: "AgentDraw — 币安 Agent ID 持有者每日链上抽奖",
  statusNotLive: "合约尚未上线",
  statusLive: "● 抽奖进行中",
  statusPaused: "抽奖进行中 — 购票已暂停",
  connectWallet: "连接钱包",
  heroTitle: '每日一抽。<span class="accent">天天开奖。</span>',
  heroSub: '专为 BNB 链上的币安 <b>.ai Agent ID</b> 持有者打造的每日链上抽奖。每张票 <b>0.0005 BNB</b>——<b>每张票的 65%</b>汇入<b>当日奖池</b>——<b>00:00 UTC</b> 之后，一张中奖票独得<b>全部奖池</b>。没有 NFT，只有奖票。',
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
  buyTitle: "购买今日抽奖票",
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
  boardEmptyPre: "正在从合约加载今日购票记录…",
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
  toastEnter: "已成功购买 {n} 张今日抽奖票。",
  toastSettle: "settleDay() 已发送 — 正在为已结束的日期开奖。"
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
  "https://bsc-dataseed1.defibit.io",
  "https://bsc.publicnode.com",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org"
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
async function ethCall(to, data) {
  if (window.ethereum) {
    try { return await window.ethereum.request({ method: "eth_call", params: [{ to, data }, "latest"] }); }
    catch { /* wallet provider failed the read — fall through to the public RPC pool */ }
  }
  let lastError = null;
  for (let attempt = 0; attempt < BSC_RPC_URLS.length; attempt++) {
    const idx = (rpcIndex + attempt) % BSC_RPC_URLS.length;
    try { const out = await fetchRpc(BSC_RPC_URLS[idx], to, data); rpcIndex = idx; return out; }
    catch (e) { lastError = e; }
  }
  throw lastError || new Error("All BSC RPC endpoints failed");
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

// ── Hero stats + status — each paints independently ───────────
async function paintStats() {
  if (!contractsReady()) return;
  const jobs = [
    (async () => { $("statPool").textContent = formatBNB(await readUint(CONTRACT, SEL.poolToday)); })(),
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

// ── Today's entries board ─────────────────────────────────────
// Entry chunks are read via entryAt(day, i): each chunk's tickets are
// (prevCumulative, cumulative]. Aggregated per wallet for the board.
async function refreshBoard() {
  const list = $("boardList");
  const day = BigInt(todayUTC());
  const count = Number(await readUint(CONTRACT, SEL.entriesCountToday));
  const totalTickets = await readUint(CONTRACT, SEL.ticketsToday);
  if (count === 0 || totalTickets === 0n) { list.innerHTML = '<p class="empty">' + t("boardEmptyNone") + "</p>"; return; }
  const start = Math.max(0, count - BOARD_SCAN_CAP);
  let prevCum = 0n;
  if (start > 0) {
    const base = await ethCall(CONTRACT, SEL.entryAt + encUint(day) + encUint(start - 1));
    prevCum = BigInt("0x" + base.slice(-64));
  }
  const idxs = [];
  for (let i = start; i < count; i += 1) idxs.push(i);
  const byWallet = new Map();
  for (let b = 0; b < idxs.length; b += 12) {
    const batch = idxs.slice(b, b + 12);
    const res = await Promise.allSettled(batch.map(i => ethCall(CONTRACT, SEL.entryAt + encUint(day) + encUint(i))));
    res.forEach((r) => {
      if (r.status !== "fulfilled" || !r.value || r.value === "0x") return;
      const wallet = "0x" + r.value.slice(-104, -64);
      const cum = BigInt("0x" + r.value.slice(-64));
      const n = cum - prevCum;
      prevCum = cum;
      if (!validAddress(wallet) || n <= 0n) return;
      const k = wallet.toLowerCase();
      byWallet.set(k, (byWallet.get(k) || 0n) + n);
    });
  }
  const note = $("boardNote");
  if (note && count > BOARD_SCAN_CAP) note.textContent = t("boardNoteCapped", { cap: BOARD_SCAN_CAP });
  const rows = [...byWallet.entries()].map(([addr, n]) => ({ addr, n })).sort((a, b2) => (a.n === b2.n ? 0 : a.n > b2.n ? -1 : 1));
  if (!rows.length) { list.innerHTML = '<p class="empty">' + t("boardEmptyNone") + "</p>"; return; }
  list.innerHTML = rows.slice(0, 10).map((r, i) => {
    const you = youAddress && sameAddr(r.addr, youAddress);
    const pct = totalTickets > 0n ? (Number(r.n) / Number(totalTickets)) * 100 : 0;
    return `<div class="board-row${i === 0 ? " board-first" : ""}${you ? " board-you" : ""}"><span class="board-rank">${i === 0 ? "🎟️" : "#" + (i + 1)}</span><span class="board-addr">${shortenAddress(r.addr)}${you ? ' <b class="you-chip">' + t("youChip") + "</b>" : ""}</span><span class="board-meta">${t("boardMeta", { n: fmtNum(r.n), pct: pct.toFixed(1) })}</span></div>`;
  }).join("");
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
  try { await paintStats(); await refreshBoard(); await refreshHall(); if (youAddress) await paintYou(); }
  catch { /* keep the last good render */ }
  finally { refreshBusy = false; }
}
document.addEventListener("DOMContentLoaded", () => {
  buildPrompts();
  paintQty();
  applyLang();
  paintFooter();
  if (contractsReady()) { refreshAll(); setInterval(refreshAll, 60000); }
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
