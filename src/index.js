#!/usr/bin/env node
/**
 * coinlobster-mcp: stdio MCP server for live crypto whale data.
 *
 * A thin stdio <-> streamable-HTTP proxy to CoinLobster's hosted MCP
 * (https://coinlobster.com/mcp). Tool names, schemas and results come from
 * the remote verbatim, so new upstream tools appear here with no package
 * update. No API key required.
 *
 * Depth: a FREE 1,000-credit key does NOT lift the MCP caps (it unlocks the
 * metered REST endpoints at /api/ai/v1/*). Full MCP depth needs an ACTIVE
 * DEVELOPER PLAN (Builder $29/mo, Growth $99, Scale $249), sent as a cl_ key
 * or held by the account signed in via https://coinlobster.com/mcp/connector.
 * CoinLobster Pro ($9/mo) is the website subscription and grants no MCP depth
 * and no API access. On a plan, a tool call costs 2x the mirrored REST
 * endpoint (40 to 100 credits by tool) from the one shared account balance;
 * keyless calls, discovery, failed calls and no-data answers are free.
 *
 * Env:
 *   COINLOBSTER_API_KEY  optional cl_... key; only an active developer plan
 *                        key changes what this server returns
 *   COINLOBSTER_MCP_URL  override the remote URL (testing)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const REMOTE_URL = process.env.COINLOBSTER_MCP_URL || 'https://coinlobster.com/mcp';
const API_KEY = process.env.COINLOBSTER_API_KEY || '';

function remoteTransport() {
    const headers = {};
    if (API_KEY) headers['X-API-Key'] = API_KEY;
    return new StreamableHTTPClientTransport(new URL(REMOTE_URL), {
        requestInit: { headers },
    });
}

/**
 * One remote call per request, on a fresh connection: the hosted server is
 * stateless per request, so holding a session buys nothing and a fresh
 * connect per tool call survives laptop sleeps, network blips and server
 * deploys without any reconnect logic.
 */
async function withRemote(fn) {
    const client = new Client({ name: 'coinlobster-mcp', version: '1.0.0' });
    await client.connect(remoteTransport());
    try {
        return await fn(client);
    } finally {
        await client.close().catch(() => {});
    }
}

async function main() {
    const server = new Server(
        { name: 'coinlobster', version: '1.0.0' },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () =>
        withRemote(async (client) => await client.listTools())
    );

    server.setRequestHandler(CallToolRequestSchema, async (req) =>
        withRemote(async (client) =>
            await client.callTool({
                name: req.params.name,
                arguments: req.params.arguments || {},
            })
        )
    );

    await server.connect(new StdioServerTransport());
    // Never write to stdout here: stdout is the JSON-RPC channel.
    console.error(`[coinlobster-mcp] ready (remote: ${REMOTE_URL}${API_KEY ? ', keyed' : ', keyless'})`);
}

main().catch((err) => {
    console.error('[coinlobster-mcp] fatal:', err && err.message);
    process.exit(1);
});
