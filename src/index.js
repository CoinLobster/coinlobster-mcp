#!/usr/bin/env node
/**
 * coinlobster-mcp: stdio MCP server for live crypto market data.
 *
 * A thin stdio <-> streamable-HTTP proxy to CoinLobster's hosted MCP
 * (https://coinlobster.com/mcp). Tools, prompts, resources, completions and
 * the server's own instructions come from the remote verbatim, so anything
 * new upstream appears here with no package update. No API key required.
 *
 * Plans and prices are not restated here on purpose: they live at
 * https://coinlobster.com/pricing, and the `my_access` tool reports what the
 * current connection can see. A copy in this header is a copy that goes stale.
 *
 * Env:
 *   COINLOBSTER_API_KEY   optional cl_... key; a key on a paid plan answers
 *                         every coin in full and spends that plan's credits
 *   COINLOBSTER_MCP_URL   override the remote URL (testing)
 *   COINLOBSTER_TOOLS_TTL_MS  how long a cached tools/list is served before a
 *                         background re-check (default 10 minutes)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListPromptsRequestSchema,
    GetPromptRequestSchema,
    ListResourcesRequestSchema,
    ListResourceTemplatesRequestSchema,
    ReadResourceRequestSchema,
    CompleteRequestSchema,
    ListToolsResultSchema,
    CallToolResultSchema,
    ToolListChangedNotificationSchema,
    PromptListChangedNotificationSchema,
    ResourceListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';

const VERSION = '1.0.1';
const REMOTE_URL = process.env.COINLOBSTER_MCP_URL || 'https://coinlobster.com/mcp';
// A desktop bundle whose optional key field was left empty can hand over the
// unsubstituted template (`${user_config.api_key}`) or whitespace. Either is
// "no key", never a key to send.
const API_KEY = (() => {
    const k = String(process.env.COINLOBSTER_API_KEY || '').trim();
    return k && !k.startsWith('${') ? k : '';
})();
const TOOLS_TTL_MS = (() => {
    const n = Number(process.env.COINLOBSTER_TOOLS_TTL_MS);
    return Number.isFinite(n) && n >= 0 ? n : 10 * 60 * 1000;
})();
// How long startup waits for the remote before serving without its
// instructions. A client times out its own initialize, so this stays short.
const STARTUP_CONNECT_MS = 8000;

function log(msg) {
    // Never write to stdout: stdout is the JSON-RPC channel.
    console.error(`[coinlobster-mcp] ${msg}`);
}

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
    if (err && err.friendly) return err;
    const raw = (err && err.message) || String(err);
    // The STATUS comes off the error object, never out of the message. The
    // transport puts the response body in the message, so a page whose text
    // happens to read "502 Bad Gateway" was being reported as a 502 when the
    // real status was 503: a number scraped from an arbitrary body can say
    // anything, and a wrong number sends someone debugging the wrong thing.
    const code = err && Number(err.code);
    const status = Number.isFinite(code) && code >= 100 && code <= 599 ? code : null;
    const unreachable = isUnreachable(err);

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
    e.friendly = true;
    return e;
}

function isUnreachable(err) {
    const raw = (err && err.message) || String(err);
    return /fetch failed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|socket|other side closed/i.test(raw);
}

/**
 * A JSON-RPC error the remote returned on purpose (unknown tool, bad
 * arguments). Those are answers, not transport failures: pass them through
 * untouched so the model sees what the server actually said.
 */
function isProtocolError(err) {
    const code = err && Number(err.code);
    return Number.isFinite(code) && code < 0;
}

/**
 * ONE remote session, reused for every request.
 *
 * The first version opened a fresh connection (TLS handshake plus an MCP
 * initialize round trip) for EVERY request, which roughly tripled the latency
 * of a tool call and threw away the server's instructions. Now the connection
 * is made once and kept. If it goes bad (laptop sleep, a server deploy, an
 * expired session) the next request drops it and reconnects once, so the
 * robustness the per-request design bought is kept without paying for it on
 * every call.
 */
class Remote {
    constructor() {
        this.client = null;
        this.connecting = null;
        this.onToolsChanged = null;
        this.onPromptsChanged = null;
        this.onResourcesChanged = null;
        this.connects = 0;
    }

    async get() {
        if (this.client) return this.client;
        if (!this.connecting) {
            this.connecting = (async () => {
                const client = new Client({ name: 'coinlobster-mcp', version: VERSION });
                client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
                    if (this.onToolsChanged) this.onToolsChanged();
                });
                client.setNotificationHandler(PromptListChangedNotificationSchema, () => {
                    if (this.onPromptsChanged) this.onPromptsChanged();
                });
                client.setNotificationHandler(ResourceListChangedNotificationSchema, () => {
                    if (this.onResourcesChanged) this.onResourcesChanged();
                });
                client.onclose = () => { if (this.client === client) this.client = null; };
                await client.connect(remoteTransport());
                this.connects++;
                this.client = client;
                return client;
            })().catch((err) => { throw friendlyRemoteError(err); })
                .finally(() => { this.connecting = null; });
        }
        return this.connecting;
    }

    drop() {
        const c = this.client;
        this.client = null;
        if (c) c.close().catch(() => {});
    }

    /**
     * Run fn against the live session. A failure on a REUSED session gets one
     * retry on a fresh one; a failure on a brand-new session is reported as is
     * (retrying a connection that just failed only doubles the wait).
     */
    async call(fn) {
        const reused = !!this.client;
        const client = await this.get();
        try {
            return await fn(client);
        } catch (err) {
            if (isProtocolError(err) && !isSessionGone(err)) throw err;
            if (reused && (isUnreachable(err) || isSessionGone(err))) {
                this.drop();
                try {
                    return await fn(await this.get());
                } catch (err2) {
                    if (isProtocolError(err2) && !isSessionGone(err2)) throw err2;
                    this.drop();
                    throw friendlyRemoteError(err2);
                }
            }
            if (!isProtocolError(err)) this.drop();
            throw friendlyRemoteError(err);
        }
    }
}

function isSessionGone(err) {
    const code = err && Number(err.code);
    return code === 404 || /session not found|session.*expired|no valid session/i.test((err && err.message) || '');
}

/**
 * Raw requests, not client.listTools()/callTool(): those cache each tool's
 * output schema and then REJECT a result whose structured content does not
 * match it. A proxy must be transparent. The hosted server's answer is what
 * the user's client should judge, not something this relay quietly refuses.
 */
function listTools(client, params) {
    return client.request({ method: 'tools/list', ...(params ? { params } : {}) }, ListToolsResultSchema);
}

/**
 * tools/list is asked on every client start and often before every turn, and
 * the list changes a few times a year. Serve it from memory, re-check it in
 * the background once the copy is older than the TTL, and tell the client when
 * the set actually changed. The remote's own list_changed notification (when
 * it can send one) clears the copy immediately.
 */
class ToolCache {
    constructor(remote, ttlMs) {
        this.remote = remote;
        this.ttlMs = ttlMs;
        this.value = null;
        this.at = 0;
        this.inflight = null;
        this.onChanged = null;
    }

    fingerprint(v) {
        return JSON.stringify(((v && v.tools) || []).map((t) => [t.name, t.description, t.inputSchema]));
    }

    async fetch() {
        if (!this.inflight) {
            this.inflight = this.remote.call(listTools)
                .then((v) => {
                    const changed = this.value && this.fingerprint(v) !== this.fingerprint(this.value);
                    this.value = v;
                    this.at = Date.now();
                    if (changed && this.onChanged) this.onChanged();
                    return v;
                })
                .finally(() => { this.inflight = null; });
        }
        return this.inflight;
    }

    async list() {
        if (!this.value) return this.fetch();
        if (Date.now() - this.at > this.ttlMs) this.fetch().catch(() => {});   // stale-while-revalidate
        return this.value;
    }

    invalidate() {
        this.at = 0;
    }
}

async function main() {
    const remote = new Remote();

    // Connect BEFORE answering initialize, because the server's instructions
    // and capabilities ride on the initialize reply and cannot be added later.
    // The instructions are the routing guide the model reads first; dropping
    // them meant a stdio user got a noticeably worse assistant than someone on
    // the hosted URL. If the remote is unreachable at startup the proxy still
    // starts (tools only) and every request retries the connection, so a user
    // who is briefly offline gets a readable error instead of a dead server.
    let remoteCaps = null;
    let instructions;
    try {
        const client = await Promise.race([
            remote.get(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('startup connect timed out')), STARTUP_CONNECT_MS)),
        ]);
        remoteCaps = client.getServerCapabilities() || {};
        instructions = client.getInstructions() || undefined;
    } catch (err) {
        log(`remote not reachable at startup, serving tools only until it is: ${err && err.message}`);
    }

    const caps = { tools: { listChanged: true } };
    if (remoteCaps && remoteCaps.prompts) caps.prompts = { listChanged: true };
    if (remoteCaps && remoteCaps.resources) caps.resources = { listChanged: true };
    if (remoteCaps && remoteCaps.completions) caps.completions = {};

    const server = new Server(
        { name: 'coinlobster', version: VERSION },
        { capabilities: caps, ...(instructions ? { instructions } : {}) }
    );

    const tools = new ToolCache(remote, TOOLS_TTL_MS);
    const notify = (fn) => { fn().catch(() => {}); };
    tools.onChanged = () => notify(() => server.sendToolListChanged());
    remote.onToolsChanged = () => { tools.invalidate(); tools.fetch().catch(() => {}); };

    server.setRequestHandler(ListToolsRequestSchema, async (req) => {
        // A paged request goes straight through; only the first page is cached.
        if (req.params && req.params.cursor) return remote.call((c) => listTools(c, req.params));
        return tools.list();
    });

    server.setRequestHandler(CallToolRequestSchema, async (req) =>
        remote.call((c) => c.request({
            method: 'tools/call',
            params: {
                name: req.params.name,
                arguments: req.params.arguments || {},
                ...(req.params._meta ? { _meta: req.params._meta } : {}),
            },
        }, CallToolResultSchema))
    );

    if (caps.prompts) {
        remote.onPromptsChanged = () => notify(() => server.sendPromptListChanged());
        server.setRequestHandler(ListPromptsRequestSchema, async (req) => remote.call((c) => c.listPrompts(req.params)));
        server.setRequestHandler(GetPromptRequestSchema, async (req) => remote.call((c) => c.getPrompt(req.params)));
    }
    if (caps.resources) {
        remote.onResourcesChanged = () => notify(() => server.sendResourceListChanged());
        server.setRequestHandler(ListResourcesRequestSchema, async (req) => remote.call((c) => c.listResources(req.params)));
        server.setRequestHandler(ListResourceTemplatesRequestSchema, async (req) => remote.call((c) => c.listResourceTemplates(req.params)));
        server.setRequestHandler(ReadResourceRequestSchema, async (req) => remote.call((c) => c.readResource(req.params)));
    }
    if (caps.completions) {
        server.setRequestHandler(CompleteRequestSchema, async (req) => remote.call((c) => c.complete(req.params)));
    }

    await server.connect(new StdioServerTransport());
    log(`ready (remote: ${REMOTE_URL}${API_KEY ? ', keyed' : ', keyless'}${instructions ? ', instructions forwarded' : ''})`);

    const shutdown = () => { remote.drop(); process.exit(0); };
    process.stdin.on('end', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    log(`fatal: ${err && err.message}`);
    process.exit(1);
});
