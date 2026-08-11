/**
 * Offline test: what a user sees when the remote is broken or unreachable.
 * No network needed, so this runs anywhere the smoke test cannot.
 *
 * Measured before this existed: a refused connection surfaced as the single
 * word "fetch failed", and a bad gateway pasted the raw HTML error page into
 * the model's context. Neither told the user whether the fault was theirs or
 * ours, what to try, or whether it had cost them anything. A locally installed
 * proxy fails this way far more often than the hosted server does (offline,
 * DNS, a firewall, a company HTTP proxy), so this is the error path most users
 * actually meet.
 *
 * Run: node test/offline.test.js
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';

const entry = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js');

/** Send one request to a fresh proxy pointed at `url`, return its error message. */
function askProxy(url, timeoutMs = 8000) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [entry], {
            stdio: ['pipe', 'pipe', 'ignore'],
            env: { ...process.env, COINLOBSTER_MCP_URL: url },
        });
        let buf = '';
        child.stdout.on('data', (d) => { buf += d.toString(); });
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) + '\n');
        setTimeout(() => {
            child.kill();
            let msg = null;
            for (const line of buf.split('\n')) {
                if (!line.trim().startsWith('{')) continue;
                try {
                    const j = JSON.parse(line);
                    if (j.error && j.error.message) msg = j.error.message;
                } catch { /* partial line */ }
            }
            resolve({ message: msg, raw: buf });
        }, timeoutMs);
    });
}

let passed = 0, failed = 0;
const check = (name, fn) => {
    try { fn(); console.log(`  ok ${name}`); passed++; }
    catch (e) { console.log(`  FAIL ${name}\n     ${e.message}`); failed++; }
};

const server = http.createServer((req, res) => {
    // Real status 503, body that CLAIMS 502: the two must not be confused.
    res.writeHead(503, { 'Content-Type': 'text/html' });
    res.end('<html><body><h1>502 Bad Gateway</h1></body></html>');
});

server.listen(0, async () => {
    const brokenUrl = `http://127.0.0.1:${server.address().port}`;
    console.log('\nOffline behaviour (no network needed):\n');

    const broken = await askProxy(brokenUrl);
    check('a failing remote answers a JSON-RPC error, never a crash', () => {
        assert.ok(broken.message, `no error message came back. raw: ${broken.raw.slice(0, 200)}`);
    });
    check('it never relays the response body (an HTML page is not an error message)', () => {
        assert.ok(!/<html|<body|<h1/i.test(broken.message), `HTML leaked into the message: ${broken.message}`);
    });
    check('it reports the REAL status, not a number scraped from the body', () => {
        // The body says 502, the status is 503. Reading the body would send
        // someone debugging the wrong thing.
        assert.ok(/\b503\b/.test(broken.message), `expected the true 503: ${broken.message}`);
        assert.ok(!/\b502\b/.test(broken.message), `reported the body's 502 instead: ${broken.message}`);
    });
    check('it says whose fault it is and that nothing was charged', () => {
        assert.ok(/our side/i.test(broken.message), broken.message);
        assert.ok(/Nothing was charged/i.test(broken.message), broken.message);
    });

    // A port nothing is listening on: the offline / firewall / proxy case.
    const dead = await askProxy('http://127.0.0.1:9');
    check('an unreachable remote explains itself instead of saying "fetch failed"', () => {
        assert.ok(dead.message, 'no error message came back');
        assert.ok(!/^fetch failed$/i.test(dead.message.trim()), 'the opaque default survived');
        assert.ok(/offline|DNS|firewall|proxy/i.test(dead.message), `no actionable cause named: ${dead.message}`);
        assert.ok(/Nothing was charged/i.test(dead.message), dead.message);
    });

    server.close();
    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed ? 1 : 0);
});
