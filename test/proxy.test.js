/**
 * Proxy test: what the stdio relay forwards, against a fake remote on
 * localhost. No network needed.
 *
 * Pins the four things a stdio user was missing next to someone on the hosted
 * URL: the server's instructions (the routing guide a model reads first), the
 * prompts, resources and completions the remote declares, one reused session
 * instead of a fresh connect per request, and a cached tools/list that tells
 * the client when the set changed.
 *
 * Run: node test/proxy.test.js
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    ListToolsRequestSchema, CallToolRequestSchema, ListPromptsRequestSchema, GetPromptRequestSchema,
    ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema, CompleteRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js');
const INSTRUCTIONS = 'FAKE-REMOTE-INSTRUCTIONS: one question, one tool.';

// ── the fake remote: stateless per POST, like production ──────────────────
const seen = { initialize: 0, toolsList: 0, toolsCall: 0 };
let toolNames = ['alpha'];
let withPrompts = true;

function buildRemote() {
    const caps = { tools: {} };
    if (withPrompts) Object.assign(caps, { prompts: {}, resources: {}, completions: {} });
    const s = new Server({ name: 'fake-coinlobster', version: '9.9.9' }, { capabilities: caps, instructions: INSTRUCTIONS });
    s.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: toolNames.map((n) => ({
            name: n, description: `tool ${n}`, inputSchema: { type: 'object', properties: {} },
            // An output schema the result below deliberately does NOT match:
            // the proxy must relay the answer, not judge it.
            outputSchema: { type: 'object', properties: { must: { type: 'string' } }, required: ['must'] },
        })),
    }));
    s.setRequestHandler(CallToolRequestSchema, async (req) => ({
        content: [{ type: 'text', text: `called ${req.params.name} with ${JSON.stringify(req.params.arguments)}` }],
        structuredContent: { something: 'else' },
    }));
    if (withPrompts) {
        s.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [{ name: 'whats_going_on', description: 'p' }] }));
        s.setRequestHandler(GetPromptRequestSchema, async (req) => ({
            messages: [{ role: 'user', content: { type: 'text', text: `prompt ${req.params.name} ${JSON.stringify(req.params.arguments || {})}` } }],
        }));
        s.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [{ uri: 'ui://coinlobster/card', name: 'card' }] }));
        s.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
        s.setRequestHandler(ReadResourceRequestSchema, async (req) => ({
            contents: [{ uri: req.params.uri, mimeType: 'text/html', text: '<p>widget</p>' }],
        }));
        s.setRequestHandler(CompleteRequestSchema, async () => ({ completion: { values: ['BTC', 'BCH'], hasMore: false } }));
    }
    return s;
}

const fake = http.createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }
    let body = '';
    for await (const c of req) body += c;
    const msg = JSON.parse(body);
    for (const m of Array.isArray(msg) ? msg : [msg]) {
        if (m.method === 'initialize') seen.initialize++;
        if (m.method === 'tools/list') seen.toolsList++;
        if (m.method === 'tools/call') seen.toolsCall++;
    }
    const s = buildRemote();
    const t = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await s.connect(t);
    await t.handleRequest(req, res, msg);
});

// ── a tiny stdio JSON-RPC driver for the spawned proxy ────────────────────
function startProxy(url, extraEnv = {}) {
    const child = spawn(process.execPath, [entry], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, COINLOBSTER_MCP_URL: url, ...extraEnv },
    });
    const replies = new Map();
    const notes = [];
    let buf = '';
    child.stdout.on('data', (d) => {
        buf += d.toString();
        let nl;
        while ((nl = buf.indexOf('\n')) !== -1) {
            const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
            if (!line.trim()) continue;
            const m = JSON.parse(line);
            if (m.id != null) replies.set(m.id, m); else notes.push(m);
        }
    });
    child.stderr.on('data', () => {});
    let id = 0;
    const rpc = (method, params = {}) => new Promise((resolve, reject) => {
        const my = ++id;
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: my, method, params }) + '\n');
        const t0 = Date.now();
        const iv = setInterval(() => {
            if (replies.has(my)) { clearInterval(iv); resolve(replies.get(my)); }
            else if (Date.now() - t0 > 10000) { clearInterval(iv); reject(new Error(`timeout on ${method}`)); }
        }, 20);
    });
    return { child, rpc, notes, notify: (method) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
async function check(name, fn) {
    try { await fn(); console.log(`  ok ${name}`); passed++; }
    catch (e) { console.log(`  FAIL ${name}\n     ${e.message}`); failed++; }
}

fake.listen(0, '127.0.0.1', async () => {
    const url = `http://127.0.0.1:${fake.address().port}/mcp`;
    console.log('\nProxy forwarding (fake remote, no network):\n');

    const p = startProxy(url, { COINLOBSTER_TOOLS_TTL_MS: '300' });
    const init = await p.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    p.notify('notifications/initialized');

    await check('the remote instructions reach the client on initialize', () => {
        assert.strictEqual(init.result.instructions, INSTRUCTIONS);
    });
    await check('prompts, resources and completions are declared because the remote declares them', () => {
        const c = init.result.capabilities;
        assert.ok(c.tools && c.prompts && c.resources && c.completions, JSON.stringify(c));
        assert.strictEqual(c.tools.listChanged, true, 'tools must declare listChanged so the refresh can be announced');
    });
    await check('prompts/list and prompts/get are relayed', async () => {
        const l = await p.rpc('prompts/list');
        assert.deepStrictEqual(l.result.prompts.map((x) => x.name), ['whats_going_on']);
        const g = await p.rpc('prompts/get', { name: 'whats_going_on', arguments: { coin: 'BTC' } });
        assert.ok(/prompt whats_going_on \{"coin":"BTC"\}/.test(g.result.messages[0].content.text), JSON.stringify(g));
    });
    await check('resources/list and resources/read are relayed (widgets live here)', async () => {
        const l = await p.rpc('resources/list');
        assert.strictEqual(l.result.resources[0].uri, 'ui://coinlobster/card');
        const r = await p.rpc('resources/read', { uri: 'ui://coinlobster/card' });
        assert.strictEqual(r.result.contents[0].text, '<p>widget</p>');
    });
    await check('completion/complete is relayed', async () => {
        const c = await p.rpc('completion/complete', { ref: { type: 'ref/prompt', name: 'whats_going_on' }, argument: { name: 'coin', value: 'B' } });
        assert.deepStrictEqual(c.result.completion.values, ['BTC', 'BCH']);
    });
    await check('tools/call relays the answer as sent, even when it does not match its own output schema', async () => {
        await p.rpc('tools/list');
        const r = await p.rpc('tools/call', { name: 'alpha', arguments: { coin: 'BTC' } });
        assert.ok(r.result, `the relay judged the answer instead of passing it on: ${JSON.stringify(r.error)}`);
        assert.ok(/called alpha with \{"coin":"BTC"\}/.test(r.result.content[0].text));
    });
    await check('one session: many requests, ONE initialize against the remote', () => {
        assert.strictEqual(seen.initialize, 1, `the remote saw ${seen.initialize} initialize calls`);
    });
    await check('tools/list is served from memory inside the TTL', async () => {
        const before = seen.toolsList;
        await p.rpc('tools/list'); await p.rpc('tools/list'); await p.rpc('tools/list');
        assert.ok(seen.toolsList - before <= 1, `the remote was asked ${seen.toolsList - before} times for 3 lists`);
    });
    await check('a changed tool set is picked up after the TTL and announced with list_changed', async () => {
        toolNames = ['alpha', 'beta'];
        await sleep(400);
        await p.rpc('tools/list');          // stale: served, and a re-check starts
        await sleep(300);
        const l = await p.rpc('tools/list');
        assert.deepStrictEqual(l.result.tools.map((t) => t.name), ['alpha', 'beta']);
        assert.ok(p.notes.some((n) => n.method === 'notifications/tools/list_changed'),
            `no list_changed was sent: ${JSON.stringify(p.notes)}`);
    });
    p.child.kill();

    // A remote that declares only tools must not have prompts invented for it.
    withPrompts = false;
    const q = startProxy(url);
    const init2 = await q.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    await check('capabilities the remote does not declare are not advertised', () => {
        const c = init2.result.capabilities;
        assert.ok(c.tools && !c.prompts && !c.resources && !c.completions, JSON.stringify(c));
    });
    q.child.kill();

    fake.close();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
});
