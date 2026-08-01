/**
 * Smoke test: spawns the stdio server and runs initialize + tools/list +
 * one tools/call against the live remote (network required).
 * Run: npm test
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js');

function rpc(id, method, params) {
    return JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
}

const child = spawn(process.execPath, [entry], { stdio: ['pipe', 'pipe', 'inherit'] });
const replies = new Map();
let buf = '';
child.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try { const m = JSON.parse(line); if (m.id != null) replies.set(m.id, m); } catch { /* partial */ }
    }
});

function waitFor(id, ms = 20000) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const iv = setInterval(() => {
            if (replies.has(id)) { clearInterval(iv); resolve(replies.get(id)); }
            else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error(`timeout waiting for reply ${id}`)); }
        }, 50);
    });
}

const fail = (msg) => { console.error('FAIL:', msg); child.kill(); process.exit(1); };

child.stdin.write(rpc(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'smoke', version: '1' },
}));
const init = await waitFor(1);
if (!init.result || !init.result.serverInfo) fail('initialize: ' + JSON.stringify(init));
console.log('OK initialize:', init.result.serverInfo.name);

child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

child.stdin.write(rpc(2, 'tools/list', {}));
const list = await waitFor(2);
const tools = (list.result && list.result.tools) || [];
if (tools.length < 5) fail('tools/list returned ' + tools.length + ' tools');
console.log('OK tools/list:', tools.map((t) => t.name).join(', '));

child.stdin.write(rpc(3, 'tools/call', { name: 'whale_radar', arguments: {} }));
const call = await waitFor(3, 30000);
if (!call.result || !call.result.content) fail('tools/call: ' + JSON.stringify(call).slice(0, 300));
console.log('OK tools/call whale_radar:', JSON.stringify(call.result.content[0]).slice(0, 120) + '...');

console.log('\nsmoke: 3/3 passed');
child.kill();
process.exit(0);
