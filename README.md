# AgentDraw — the daily on-chain draw for Binance Agent ID holders

**One draw. Every day.** AgentDraw is a daily on-chain draw (lottery) on BNB
Chain for wallets holding a Binance **.ai Agent ID** (the SPACE ID .ai NFT,
registry `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`). There is **no NFT** in
this project: players buy tickets with BNB, and one winning ticket per UTC
day takes the day's whole prize pool.

## Economics — 65/35, fee taken at entry

- **Ticket price:** exactly **0.0005 BNB** per ticket — a contract constant,
  unchangeable after deployment. Buy **1–20 tickets per transaction**;
  repeat buys allowed, tickets accumulate per day.
- **Split, applied inside every `enter()` call:** **65%** of the payment
  forms that UTC day's **prize pool**; **35%** is the project fee, credited
  **instantly** to the owner's withdrawable balance.
  Rounding rule: owner cut per entry call = `msg.value * 35 / 100` (floor),
  remainder to the pool, so the shares always sum exactly to `msg.value`.
  At the constant price the split is always exact — **0.000175 BNB fee +
  0.000325 BNB pool per ticket**, zero rounding remainder at any quantity.
- **Settle:** after the day ends (00:00 UTC), anyone can call the
  permissionless `settleDay()`. It draws one winning ticket from the day's
  entry ranges and pays its owner **100% of the accumulated prize pool** —
  no further deduction. Zero-entry days settle with no winner; unsettled
  days are settled one per call, oldest first.
- **Entry gate:** the contract checks `balanceOf(caller) > 0` on the Agent
  ID registry on **every** entry. Non-holders cannot enter.
- **Owner powers are narrow:** pause/unpause entries, withdraw the fee
  balance. The owner can never touch a prize pool (invariant: contract
  balance = fee balance + unsettled prize pools), change the price or the
  split, or pick a winner.
- **Randomness, honestly:** the winning ticket derives from
  `keccak256(day, totalTickets, blockhash(block.number - 1))` at settle
  time. Publicly verifiable after the settle tx is mined — but **not**
  VRF-grade: the settler chooses when to call, and timing can influence the
  result. This is disclosed on the site, in `llms.txt`, and in the contract
  comments. Small stakes by design.

## Repository layout

```
contracts/AgentDraw.sol     the draw contract (solc 0.8.26, paris + viaIR, optimizer 200)
contracts/MockAgentId.sol   test stand-in for the Agent ID registry
build/                      compiled artifacts (ABI, creation + runtime bytecode)
compile.js                  compile with the shared acs-solc toolchain
tests/agent-draw-test.cjs   ganache end-to-end suite (58 checks)
tests/check-deploy-html.cjs ganache verification of deploy.html artifacts (11 checks)
gen-deploy.cjs              regenerates site/deploy.html from the template + build artifacts
site/index.html             public site (EN + 简体中文, editorial paper-and-ink design)
site/app.js                 site logic: 5-RPC failover reads, entry board, live activity, winner spotlight, all-time stats, hall of draws, agent prompts
site/styles.css             site styles
site/deploy.html            OWNER tool: deploy + pause + settle + withdraw + summary box
site/llms.txt               agent-facing facts + paste-ready prompts
site/draw.json              machine-readable facts (the mint.json equivalent)
site/icon.svg, logo.svg     ink ticket-stub brand mark
```

## Build & test (local toolchain)

```bash
node compile.js AgentDraw MockAgentId
NODE_PATH=/home/hatch/workspace/tmp-check/evm/node_modules node tests/agent-draw-test.cjs
node gen-deploy.cjs   # after every compile — keeps deploy.html byte-identical to build/
NODE_PATH=/home/hatch/workspace/tmp-check/evm/node_modules node tests/check-deploy-html.cjs
```

## Deployment (owner only — Muse never signs)

1. Open `site/deploy.html` in a wallet browser, connect the owner wallet
   (auto-switches to chain 56).
2. Deploy with the registry prefilled to
   `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F` (the field warns loudly if
   edited — the argument is immutable).
3. Copy the auto-filled summary box and send it to Muse.
4. Wiring after deploy: set `DRAW_CONFIG.contractAddress` in `site/app.js`
   (`xUrl` is already wired to the official X, @AgentDrawBNB),
   `contractAddress` / `liveStatus` in `site/draw.json`, and the STATUS line
   in `site/llms.txt`.

Status: **built and fully tested locally; site published and live at
https://agentdraw.click/ — contract LIVE: 0xFCb729e818edbe65e9831e5C49E8D32563E50574 (deployed by the owner 2026-11-05).**
