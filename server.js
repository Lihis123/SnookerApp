'use strict';
/**
 * Snooker Tracker – local server
 * Pure Node.js, zero dependencies.
 *
 * Usage:  node server.js
 * Then open  http://localhost:8080  in Chrome (or the network IP shown on iPad).
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PORT         = 8080;
const STATIC_DIR   = __dirname;
const HISTORY_FILE = path.join(__dirname, 'history.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // ── CORS (needed when iPad and PC are on LAN) ──────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── API: GET /api/history ──────────────────────────────────────────────────
  if (req.method === 'GET' && url.pathname === '/api/history') {
    try {
      const data = fs.existsSync(HISTORY_FILE)
        ? fs.readFileSync(HISTORY_FILE, 'utf8')
        : '[]';
      // Quick sanity-check that it's valid JSON
      JSON.parse(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (_) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  // ── API: POST /api/history ─────────────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/api/history') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        JSON.parse(body); // reject non-JSON before writing
        fs.writeFileSync(HISTORY_FILE, body, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"ok":false}');
      }
    });
    return;
  }

  // ── Static files ───────────────────────────────────────────────────────────
  let rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  // Security: reject any path that tries to escape the directory
  const filePath = path.resolve(STATIC_DIR, rel);
  if (!filePath.startsWith(STATIC_DIR + path.sep) && filePath !== STATIC_DIR) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  try {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (_) {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  Snooker Tracker server started\n');
  console.log('  Local:   http://localhost:' + PORT);
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter(i => i.family === 'IPv4' && !i.internal);
  ips.forEach(i =>
    console.log('  Network: http://' + i.address + ':' + PORT + '  \u2190 use this on iPad')
  );
  console.log('\n  History saved to: ' + HISTORY_FILE);
  console.log('  Press Ctrl+C to stop.\n');
});
