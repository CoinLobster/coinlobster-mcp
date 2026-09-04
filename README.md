# CoinLobster MCP · Live Crypto Whale Trades for AI Agents

**No API key required.** Real executed whale trades (not wallet transfers) merged live across **15 exchanges** (Binance, Coinbase, Bybit, OKX, Kraken and more) plus on-chain DEX swaps on **Ethereum, Base and Arbitrum**, with a Smart Money Radar for unusual flow, liquidations from the venues that publish them, Hyperliquid whale accounts named wallet by wallet, market snapshots and outcome-scored signals.

The only MCP server with live cross-exchange whale trades. Price data is everywhere, *what whales just did* is not.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/coinlobster-mcp)](https://www.npmjs.com/package/coinlobster-mcp)

## See it work

One line to connect, no key and no signup, then ask a question no price API can answer:

```bash
claude mcp add --transport http coinlobster https://coinlobster.com/mcp
```

> **Who sold BTC in the last hour?**

A real response, captured 2026-08-05 03:53 UTC:

```
BTC whale flow, last 1h
  bought   $6.58M
  sold    $19.57M
  net    -$12.99M   across 17 prints

Four accounts did most of the selling:
  0x1ee7a73c...  sold $12.86M
  0x854b9d63...  sold  $1.54M
  0x9e0a3ad8...  sold  $1.29M
  0x4fbf2adf...  sold  $1.03M
```

Those are the wallets on the other side of the fills, not a guess from a transfer. The
number is the whole point: an agent can go from "BTC is down" to "here is who sold, how
much, and when" in one call. Run it now and you get that hour, not this one.

## Try asking

- *"What are whales doing with BTC right now?"*
- *"Which coins have unusual whale activity in the last 4 hours?"*
- *"Are longs or shorts getting liquidated on BTC today?"*
- *"Show the last 10 whale signals that fired and what price did after each."*
- *"Compare whale buying vs selling on SOL over the past 24 hours."*

## Install

**Recommended: the hosted server.** Nothing to install, and it is always current.
Point any streamable-HTTP MCP client at it:

```json
{
  "mcpServers": {
    "coinlobster": { "url": "https://coinlobster.com/mcp" }
  }
}
```

**Claude Code**

```bash
claude mcp add --transport http coinlobster https://coinlobster.com/mcp
```

**VS Code**

```bash
code --add-mcp '{"name":"coinlobster","url":"https://coinlobster.com/mcp"}'
```

**Cursor** — add to `~/.cursor/mcp.json`, then reload:

```json
{
  "mcpServers": {
    "coinlobster": { "url": "https://coinlobster.com/mcp" }
  }
}
```

**Codex**

```bash
codex mcp add coinlobster --url https://coinlobster.com/mcp
```

**Gemini CLI**

```bash
gemini mcp add -s user --transport http coinlobster https://coinlobster.com/mcp
```

### Chat apps

These sign in to your CoinLobster account instead of using the keyless URL, so
use `https://coinlobster.com/mcp/connector` in all of them. A free account works.

| App | Where |
| --- | --- |
| Claude (web, desktop, mobile) | Settings, Customize, Connectors, "Add custom connector" |
| ChatGPT (web) | Turn on Developer mode in Settings, Security and login. Then [chatgpt.com/plugins](https://chatgpt.com/plugins), plus button |
| Gemini | Settings & help, Connected Apps, "Add a custom app" |
| Grok | [grok.com/connectors](https://grok.com/connectors), New Connector, Custom |
| Perplexity | Settings, Connectors, "+ Custom connector", Remote |

Full per-app setup: [coinlobster.com/connect](https://coinlobster.com/connect)

**Any shell, no MCP client:** the hosted server answers plain JSON-RPC over curl (see [How it works](#how-it-works)).

### Local stdio, via npm

If you prefer a local process (or your client only speaks stdio), this package is a
thin proxy to the same hosted server:

```bash
claude mcp add coinlobster -- npx -y coinlobster-mcp
```

```json
{
  "mcpServers": {
    "coinlobster": {
      "command": "npx",
      "args": ["-y", "coinlobster-mcp"]
    }
  }
}
```

```bash
code --add-mcp '{"name":"coinlobster","command":"npx","args":["-y","coinlobster-mcp"]}'
```

Either path serves the same data and the same tool schemas.

## Tools

Many names come back from `tools/list` on production. Several tools carry a second, plainer name that does the same thing at the same price: `market_brief` (`trade_context`), `whale_activity` (`whale_profile`), `signal_outcomes` (`flag_outcomes`), `coin_liquidations` (`liquidations`), and `market_changes` (the on-demand form of `market_digest`). `whale_tape` is a deprecated alias of `whale_trades`; prefer `whale_trades`. Call `tools/list` before relying on any tool, the set grows and this table is not the source of truth (`npm test` only checks that `tools/list` is non-trivial and that `whale_radar` answers, so it stays green across additions).

| Tool | What it returns |
| --- | --- |
| `whale_trades` | Live whale trades across 15 CEX venues + ETH/Base/Arbitrum DEX swaps, newest first. Filter by coin, source, min USD. |
| `whale_radar` | Coins with **unusual** whale flow right now, across 1h / 4h / 24h windows. The best first call. |
| `flag_outcomes` | Signals that fired, with fire-time price and what price did next. Hits and misses. |
| `whale_flow` | Hourly whale buy vs sell USD volume for one coin, CEX and DEX split. |
| `liquidations` | Recent liquidations for a pair with the long / short breakdown. |
| `market_snapshot` | Price, 24h stats, average funding, open interest and liquidation totals in one call. |
| `crypto_news` | Recent headlines + a sentiment score (-100 to +100) for a coin, plus the macro picture. |
| `whale_tape` | Deprecated alias of `whale_trades`. Same tool, same arguments. |
| `market_history` | Daily funding, open interest, price and whale-flow history, months deep (30d keyless, full archive on any paid plan). |
| `market_extremes` | Pairs at records or their own top/bottom 5% for funding, OI or liquidations, with next-day outcome stats for past occurrences. |
| `whale_context` | Whale flow vs the coin's own logged history: multiple of its average, N-day highs, buy share (USD magnitudes need depth). |
| `whale_profile` | One coin whole, in a single call: net flow over 1h, 4h, 24h and 7d, the CEX / on-chain / Hyperliquid split, which of the 15 streamed exchanges the flow actually sits on, and flow measured against price (absorption, distribution or confirming). |
| `market_overview` | One-call market scan: totals, 24h whale net flow, BTC risk regime, top rows by volume. |
| `market_movers` | The biggest 24h gainers and losers across the streamed board, each with price, 24h change and volume, so a move on thin volume shows. The plain "what is pumping right now" read. |
| `market_screener` | Screen coins by funding band, OI band, whale multiple or unusual-only. |
| `funding_matrix` | Per-venue funding rates with predicted next rate where the venue provides it. |
| `squeeze_score` | Fused 0-100 crowding read with the overexposed side (needs any paid plan). |
| `liq_zones` | Projected liquidation level book, always labeled a projection, never recorded trades (keyless: free pairs, no cascade chains). |
| `trade_context` | The one-call pre-trade blob: price, funding and OI with percentile judgment vs the pair's own recorded days, whale flow vs baseline, visible liquidations, carry-cost arithmetic. |
| `market_liquidations` | The whole market's forced closes in one call rather than per pair (from the venues that publish a liquidation feed, plus a sampled Hyperliquid lane, so the totals are a floor): 24h dollars and counts split long vs short, hour by hour so a cascade is locatable, top coins, and the Hyperliquid wallets that were closed out. Lending liquidations ride on a separate lane and are never summed with the perp numbers. |
| `hl_whales` | Hyperliquid whale fills with the **wallet address on every print**. The one large perp venue whose public tape names both sides. |
| `hl_board` | Tracked Hyperliquid whale accounts: equity, leverage, net bias, and which coins they are crowded into. |
| `hl_traders` | Every Hyperliquid wallet that has closed a trade, ranked by net-of-fees realized profit from primary fills, so a profitable trader outside the ranked leaderboard is still found. A stage-1 claim: no equity or ROI check, so it is a weaker and different number than `smart_money`. |
| `hl_wallet` | One Hyperliquid account: live book, open positions, liquidation price, recent fills. |
| `smart_money` | What the proven trader cohort holds and trades, coin by coin. The cohort is Hyperliquid leaderboard accounts screened for provable profit, not a guess at who is smart. Positions held and dollars traded are separate units and are never summed. |
| `onchain_whales` | Large DEX swaps on Ethereum, Base and Arbitrum with the wallet on each swap. |
| `dex_wallet` | One Ethereum, Base or Arbitrum address: its DEX swaps, net flow per token, activity pattern. For a Hyperliquid account use `hl_wallet` instead. The swap feed sees roughly 7% of a wallet's total activity, so quiet here is not proof of inactive. |
| `defi_summary` | Per-chain DEX volume and TVL, highest-volume tokens, and the whale swap layer over them. |
| `defi_liquidations` | Aave V3 lending liquidations on Ethereum, Arbitrum and Base. Both wallets named: who was liquidated, and who took the collateral. |
| `my_access` | What your connection can and cannot see: whether you are on the free plan, how many credits are left and roughly how many calls that buys, the row cap and time window in force right now, what is locked, and what lifts each one. Free, and it never spends credits. Ask it when a result comes back capped. |
| `watch_create` | Arm an alert on one coin that fires to your webhook: whale flow turns unusual versus the coin's own normal, a signal fires, or funding enters a recorded-days band. "Tell me when", "alert me if". Pro and up; below that the answer names the plan. |
| `watch_list` | The alerts this connection has armed. Free. |
| `watch_delete` | Remove one armed alert by id. Free. |

Every data tool is read-only and returns descriptive market data only, never financial advice. The three watch tools arm, list and remove your own alerts.

## Free tier, and what actually lifts the caps

The free tier needs nothing: BTC/USD in full (its whale floor is $500K) plus every $1M+ trade on any pair, both live. Other pairs arrive 30 minutes delayed, DEX swaps from $250K. On the radar only BTC is shown in full; any other coin appears only once it turns unusual, and then as name and direction with the dollar amounts stripped.

**A free API key does not lift the MCP caps.** The free key is a 250-credit monthly grant ([coinlobster.com/developers](https://coinlobster.com/developers), no card) that unlocks the metered REST endpoints at `/api/ai/v1/*`, roughly 20 to 100 calls in total. On MCP it changes nothing.

What lifts the caps is the plan on the account, and the steps are real: **Starter** ($9/mo, 20k credits) opens every streamed pair, live, at core depth (100 trades, 14-day flow windows, 90 days of archive, 15 board rows); **Pro** ($29/mo, 100k) is every tool at full depth (500 trades, 30-day windows, the full archive, the crowding read, cascade chains, whale_flow venue and wallet detail, and the watch tools); **Alpha** ($99/mo, 500k) adds the named wallets behind every smart_money position. One subscription and one shared credit balance cover the website, your AI (MCP) and the REST API together. Present it either as a `cl_` key in `X-API-Key` on the MCP request, or by signing in over the OAuth connector at `https://coinlobster.com/mcp/connector` with an account that owns a plan. Every capped or refused answer carries `upgrade`: the cheapest plan that lifts that wall, its price and a link.

Not sure which of these you are on? Ask your AI to call `my_access`. It reports whether you are on the free plan, how many credits are left, the caps applying to that connection right now and what lifts each one, so you do not have to work it out by hitting them.

When an ask exceeds what your connection allows, the answer says so rather than quietly returning less: the payload carries `capped` with what you requested, what you got, the ceiling and why. `by: keyless` or `by: plan_max` means a plan lifts it (the `upgrade` field names which). `by: tool_max` is a hard ceiling that no plan raises, so there is nothing to buy and no point retrying.

Keyless calls cost nothing. On a paid plan, an MCP tool call is priced by workload, **20 to 100 credits, by tool**: light reads 20, a substantive one-market or one-wallet read 50, a composite or whole-market scan 100 (20 for `coin_liquidations`, `funding_matrix`, `liq_zones`, `liquidations`, `market_snapshot`, `watch_create`, `whale_context`; 50 for `crypto_news`, `defi_liquidations`, `defi_summary`, `dex_wallet`, `hl_board`, `hl_traders`, `hl_wallet`, `hl_whales`, `market_extremes`, `market_history`, `market_movers`, `market_overview`, `onchain_whales`, `options`, `price_candles`, `smart_money`, `squeeze_score`, `whale_activity`, `whale_flow`, `whale_profile`, `whale_radar`, `whale_tape`, `whale_trades`; 100 for `flag_outcomes`, `market_brief`, `market_changes`, `market_digest`, `market_liquidations`, `market_screener`, `signal_outcomes`, `trade_context`). MCP and REST draw on one shared account balance: one plan, one balance, either surface. `my_access` is always free. Discovery (`initialize`, `tools/list`, `ping`) is free, and failed calls and no-data answers are refunded, whether the answer says so with `available`, `covered`, `tracked`, an `error` or simply an empty page. One-off credit packs top up that same shared balance: $10 = 5,000, $49 = 50,000, $199 = 250,000.

A paid plan key travels in the stdio config:

```json
{
  "mcpServers": {
    "coinlobster": {
      "command": "npx",
      "args": ["-y", "coinlobster-mcp"],
      "env": { "COINLOBSTER_API_KEY": "cl_your_key" }
    }
  }
}
```

## How it works

This package is a thin stdio proxy to CoinLobster's hosted MCP server (`https://coinlobster.com/mcp`, streamable HTTP). Tool schemas and results come from the hosted server verbatim, so new tools appear without a package update. The heavy lifting (exchange streaming, on-chain indexing, signal scoring) runs on CoinLobster's pipeline; your machine just relays JSON-RPC.

Raw call, no client needed:

```bash
curl -s -X POST https://coinlobster.com/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whale_radar","arguments":{}}}'
```

- Live data pages: [whale feed](https://coinlobster.com/crypto-whales) · [radar](https://coinlobster.com/radar) · [whale statistics](https://coinlobster.com/whale-statistics)
- Agent-readable docs: [llms.txt](https://coinlobster.com/llms.txt) · [crypto-whales.md](https://coinlobster.com/crypto-whales.md) · [radar.md](https://coinlobster.com/radar.md)
- REST API: [coinlobster.com/developers](https://coinlobster.com/developers) · OpenAPI: [openapi.json](https://coinlobster.com/openapi.json)

## Development

From a local checkout:

```bash
npm install
npm test   # live smoke: initialize + tools/list + a whale_radar call
```

MIT licensed. Issues and PRs welcome.
