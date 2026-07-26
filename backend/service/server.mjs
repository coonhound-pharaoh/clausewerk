// The HTTP wrapper. Deliberately thin, and deliberately separate from app.mjs.
//
// Everything that decides anything lives in App. This file turns a socket into
// a method, a path and a body, and turns a result back into a response. That
// split is not tidiness: it is why the whole service test suite can exercise
// sign-in, sessions, revocation, expiry and the pool bleed without opening a
// port, and a test that needs a listening socket is a test that gets skipped.
//
//   node service/server.mjs [--port 8787] [--data ./cw-data]
//
// The bearer token is read from the Authorization header. That is the ONLY
// thing this file takes from the request that influences identity, and it names
// a session — not a person and not a role. Everything else the browser sends is
// data.

import { createServer } from 'node:http';
import { Db } from './db.mjs';
import { App } from './app.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    out[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? process.env.PORT ?? 8787);

const db  = await Db.open({ dataDir: args.data });
const app = new App(db);

const readBody = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy(); });
  req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); } });
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const auth = req.headers.authorization ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  let result;
  try {
    result = await app.handle(req.method, url.pathname, {
      token,
      body: ['POST','PUT','PATCH'].includes(req.method) ? await readBody(req) : null,
    });
  } catch (e) {
    // An unexpected error is a 500 that says so. It must never be reported as a
    // refusal: "you may not do that" and "we broke" are different facts, and
    // conflating them sends somebody to argue with their administrator about a
    // bug.
    result = { status: 500, body: { error: 'the service failed', reason: String(e?.message ?? e) } };
  }

  res.writeHead(result.status, {
    'content-type': 'application/json',
    // The shell is served from elsewhere during development. No credentials
    // flag: the session is a bearer token the client holds, not a cookie the
    // browser attaches on its own, so there is no cross-site request forgery
    // surface to open here by accident.
    'access-control-allow-origin': process.env.CW_ORIGIN ?? '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(result.body));
});

server.listen(port, () => {
  console.log(`clausewerk service listening on http://localhost:${port}`);
  console.log(args.data
    ? `data directory: ${args.data}`
    : 'in-memory database — nothing is persisted. Pass --data <dir> for a real one.');
});
