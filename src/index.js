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
 * Turn a transport failure into something a person can act on.
 *
 * Measured against a broken remote before this existed: a refused connection
 * surfaced as the single word "fetch failed", and a bad gateway pasted the raw
 * `<html>502 Bad Gateway</html>` body straight into the model's context. The
 * first tells the user nothing at all, and the second is the most common real
 * failure for a locally installed proxy (offline, DNS, a firewall or a
 * corporate HTTP proxy). Neither says whether the fault is theirs or ours, and
 * neither says whether it cost them anything.
 */
function friendlyRemoteError(err) {
    const raw = (err && err.message) || String(err);
    // The STATUS comes off the error object, never out of the message. The
    // transport puts the response body in the message, so a page whose text
    // happens to read "502 Bad Gateway" was being reported as a 502 when the
    // real status was 503: a number scraped from an arbitrary body can say
    // anything, and a wrong number sends someone debugging the wrong thing.
    const code = err && Number(err.code);
    const status = Number.isFinite(code) && code >= 100 && code <= 599 ? code : null;
    const unreachable = /fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|socket/i.test(raw);

    let what;
    if (unreachable) {
        what = `Could not reach the CoinLobster data server at ${REMOTE_URL}. `
            + 'This machine could not open the connection, so the usual causes are being offline, DNS, '
            + 'a firewall or a company HTTP proxy rather than anything wrong with the request.';
    } else if (status) {
        what = `The CoinLobster data server answered ${status} at ${REMOTE_URL}. `
            + 'That is our side, not the request.';
    } else {
        what = `The call to the CoinLobster data server at ${REMOTE_URL} did not complete.`;
    }
    // The reassurance that matters, and it is always true here: the meter only
    // charges a delivered answer, and nothing was delivered.
    const e = new Error(`${what} Nothing was charged. Open ${REMOTE_URL} in a browser to check, then retry.`);
    e.cause = err;
    return e;
}

/**
 * One remote call per request, on a fresh connection: the hosted server is
 * stateless per request, so holding a session buys nothing and a fresh
 * connect per tool call survives laptop sleeps, network blips and server
 * deploys without any reconnect logic.
 */
async function withRemote(fn) {
    const client = new Client({ name: 'coinlobster-mcp', version: '1.0.0' });
    try {
        await client.connect(remoteTransport());
    } catch (err) {
        throw friendlyRemoteError(err);
    }
    try {
        return await fn(client);
    } catch (err) {
        throw friendlyRemoteError(err);
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
