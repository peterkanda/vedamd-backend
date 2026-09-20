#!/usr/bin/env node
/**
 * VedaMD CDS bridge — HTTP entrypoint.
 *
 * Zero dependencies by design. This process runs inside hospital
 * networks, often on hardware nobody will patch for a year; every
 * dependency is a CVE someone has to chase. Node's built-in http
 * server is enough for a JSON pipe.
 *
 * Routes (deliberately identical to VedaMD's own, so the EMR is
 * configured with the bridge URL and nothing else changes):
 *   GET  /cds-services              CDS Hooks discovery
 *   POST /cds-services/{serviceId}  CDS Hooks invocation
 *   GET  /healthz                   liveness + counters
 */

import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { Bridge } from './bridge.js';

/** Refuse payloads larger than this (bytes) — a CDS prefetch is small. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export function createBridgeServer(config, deps = {}) {
  const bridge = new Bridge(config, deps);
  const log = deps.log ?? console;

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // CORS for in-browser callers (the DHIS2 app). Origins are matched
    // exactly against the allow-list; anything else gets no CORS headers,
    // so the browser refuses to send the JSON request at preflight.
    const origin = req.headers.origin;
    if (origin && (config.allowedOrigins ?? []).includes(origin.replace(/\/+$/, ''))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type, x-bridge-token');
      res.setHeader('access-control-max-age', '600');
    }
    res.setHeader('vary', 'origin');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    if (path === '/healthz') {
      return send(res, 200, { status: 'ok', upstream: config.upstream, stats: bridge.stats });
    }

    const auth = bridge.authorizeCaller(req.socket.remoteAddress, req.headers);
    if (!auth.ok) {
      log.warn?.({ event: 'bridge_caller_rejected', reason: auth.reason });
      return send(res, auth.status, { error: 'forbidden' });
    }

    if (req.method === 'GET' && path === '/cds-services') {
      return send(res, 200, await bridge.discover());
    }

    if (req.method === 'POST' && path.startsWith('/cds-services/')) {
      const serviceId = decodeURIComponent(path.slice('/cds-services/'.length));
      let payload;
      try {
        payload = await readJson(req);
      } catch (err) {
        return send(res, err.statusCode ?? 400, { error: err.message });
      }
      const result = await bridge.invoke(serviceId, payload);
      return send(res, result.status, result.body);
    }

    return send(res, 404, { error: 'not found' });
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        const err = new Error('payload too large');
        err.statusCode = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const err = new Error('invalid JSON body');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

/** True when this file is the process entrypoint rather than an import.
 *  Compared via realpath so symlinks and paths with spaces still match. */
function isEntrypoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Started directly (not imported by a test).
if (isEntrypoint()) {
  const config = loadConfig();
  const server = createBridgeServer(config);
  server.listen(config.port, config.host, () => {
    console.log(
      JSON.stringify({
        event: 'bridge_listening',
        host: config.host,
        port: config.port,
        upstream: config.upstream,
      }),
    );
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
