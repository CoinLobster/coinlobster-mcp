# CoinLobster MCP · live crypto market data for your AI

Ask your AI what is going on in crypto and get an answer built on what actually traded: whale trades across **18 exchanges** plus **Ethereum, Base and Arbitrum** DEX swaps, Hyperliquid accounts named wallet by wallet, the proven-trader cohort, forced closes, funding and open interest against each coin's own history, and a signal record that shows the misses next to the hits.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/coinlobster-mcp)](https://www.npmjs.com/package/coinlobster-mcp)

## Connect

**Recommended: sign in.** A free account (no card) gives live answers. Add this URL and your app opens a CoinLobster sign-in:

```
https://coinlobster.com/mcp/connector
```

| App | How |
| --- | --- |
| Claude (web, desktop, mobile) | Settings, Customize, Connectors, **Add custom connector**, paste the URL. Desktop also has a [one-click bundle](https://coinlobster.com/connect#claude) |
| ChatGPT | Settings, Security and login, turn on **Developer mode**. Then [chatgpt.com/plugins](https://chatgpt.com/plugins), plus button, paste the URL |
| Claude Code | `claude mcp add --transport http coinlobster https://coinlobster.com/mcp/connector`, then `/mcp`, **Authenticate** |
| Cursor | [One-click install](https://coinlobster.com/connect#cursor), or add `{"mcpServers":{"coinlobster":{"url":"https://coinlobster.com/mcp/connector"}}}` to `~/.cursor/mcp.json` |
| VS Code | `code --add-mcp '{"name":"coinlobster","type":"http","url":"https://coinlobster.com/mcp/connector"}'` |
| Codex | `codex mcp add coinlobster --url https://coinlobster.com/mcp/connector`, then `codex mcp login coinlobster` |
| Gemini CLI | `gemini mcp add -s user --transport http coinlobster https://coinlobster.com/mcp/connector`, then `/mcp auth coinlobster` |
| Gemini, Grok, Perplexity | Step by step: [coinlobster.com/connect](https://coinlobster.com/connect) |

**No account, no sign-in:** use `https://coinlobster.com/mcp` instead. Answers are 30 minutes old.

```bash
claude mcp add --transport http coinlobster https://coinlobster.com/mcp
```

### Local stdio (this package)

For clients that only speak stdio. It relays to the hosted server, including its tools, prompts, resources and instructions, so it never needs an update for new tools.

```json
{
  "mcpServers": {
    "coinlobster": { "command": "npx", "args": ["-y", "coinlobster-mcp"] }
  }
}
```

A paid plan key goes in `env`: `{ "COINLOBSTER_API_KEY": "cl_your_key" }`. Keys: [coinlobster.com/account](https://coinlobster.com/account).

## Try asking

- *"What's going on in crypto right now?"*
- *"Why is BTC moving? Was it forced selling or real buying?"*
- *"What are the proven Hyperliquid traders holding?"*
- *"Which coins have unusual whale activity today?"*
- *"Where did BTC liquidations actually hit in the last few hours?"*
- *"Has this kind of whale spike on SOL led anywhere before?"*

## What it answers

| You ask about | You get |
| --- | --- |
| What is happening now | The situations in play, in stages, with the evidence and the price move since each started |
| One coin | Price, news, whale flow vs that coin's normal, funding and open interest vs its own recorded days, forced closes |
| Whales | Executed trades (not wallet transfers), hour-by-hour flow, which coins are unusual, sector rotation |
| Smart money | The proven Hyperliquid cohort: accounts screened for profit on closed trades, what they hold and just did |
| Wallets | One Hyperliquid account's positions and liquidation prices, or one Ethereum/Base/Arbitrum address's swaps |
| Forced closes | Where liquidations hit, long vs short, market-wide, plus DeFi lending liquidations kept separate |
| Positioning | Funding across exchanges, open interest, the merged order book, options walls for BTC and ETH |
| The record | What price did after each past signal, with every miss shown |
| Alerts | Your AI can arm an alert that posts to your webhook (Starter and up) |

Call `tools/list` for the current set. Data is descriptive: what happened, never a forecast or advice.

## Plans

| | Free | Starter $15/mo | Pro $29/mo | Alpha $99/mo |
| --- | --- | --- | --- | --- |
| Coins | BTC in full, others as a headline | Every coin in full | Every tool at full depth | Pro plus the named wallets behind the cohort |
| Answers | Live signed in, 30 min late without an account | Live | Live | Live |
| Calls | 200 a day signed in, 100 without | Credits | Credits | Credits |
| Credits a month | none needed for AI calls | 20,000 | 100,000 | 500,000 |
| Alerts your AI can arm | none | 3 | 10 | 10 |

New accounts start with 7 days of Pro, no card, in your AI too. On a paid plan a call spends credits by workload from the same balance the website and REST API use: 20 for a light read, 50 for one coin or one wallet, 100 for a whole-market scan. Free calls, discovery and failed or empty answers cost nothing. Ask your AI to run `my_access` to see what your connection can see right now and what lifts each cap. Pricing: [coinlobster.com/pricing](https://coinlobster.com/pricing).

## Privacy Policy

This package runs on your machine and relays your AI's requests to coinlobster.com. It stores nothing locally and sends only the tool name and arguments your AI chooses, plus your API key if you set one. CoinLobster logs requests to run and meter the service and never receives your chat. Full policy, including retention and contact: [coinlobster.com/privacy](https://coinlobster.com/privacy).

## Development

```bash
npm install
npm run test:offline   # no network: error handling and what the relay forwards
npm test               # plus a live call against the hosted server
```

Agent-readable docs: [llms.txt](https://coinlobster.com/llms.txt) · REST API: [coinlobster.com/developers](https://coinlobster.com/developers)

MIT licensed. Issues and PRs welcome.
