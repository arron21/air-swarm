import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { World } from './World.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const PORT = process.env.PORT || 4176;
const hasClientBuild = existsSync(CLIENT_DIST);

async function serveStatic(req, res) {
  const urlPath = req.url.split('?')[0];
  let filePath = path.resolve(CLIENT_DIST, '.' + (urlPath === '/' ? '/index.html' : urlPath));
  if (!filePath.startsWith(CLIENT_DIST + path.sep) && filePath !== CLIENT_DIST) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  let data;
  try {
    data = await readFile(filePath);
  } catch {
    try {
      filePath = path.join(CLIENT_DIST, 'index.html');
      data = await readFile(filePath);
    } catch {
      res.writeHead(404);
      res.end('not found');
      return;
    }
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { 'content-type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(data);
}

const httpServer = createServer((req, res) => {
  if (!hasClientBuild) {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('air-swarm server ok (no client build present)');
    return;
  }
  serveStatic(req, res).catch(() => {
    res.writeHead(500);
    res.end('server error');
  });
});

const wss = new WebSocketServer({ server: httpServer });

// The whole game is one shared match: whoever's 'join' message creates the world picks
// the level for everyone, and it stays live until every connection drops (so the next
// visitor gets a fresh level choice). Team wipes reset the run in place via World —
// they don't tear this down, since players stay connected and just rejoin.
let currentWorld = null;

function disconnect(player) {
  if (!player || !currentWorld) return;
  currentWorld.removePlayer(player);
  if (currentWorld.players.size === 0) {
    currentWorld.stop();
    currentWorld = null;
  }
}

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (!player) {
      if (msg.t !== 'join') return;
      if (!currentWorld) {
        const levelId = Number(msg.levelId) || 1;
        currentWorld = new World(levelId);
        currentWorld.start();
      }
      player = currentWorld.addPlayer(ws);
      if (!player) return; // server full
    }

    currentWorld.onMessage(player, msg);
  });

  ws.on('close', () => disconnect(player));
  ws.on('error', () => disconnect(player));
});

httpServer.listen(PORT, () => {
  console.log(`air-swarm server listening on :${PORT}${hasClientBuild ? ' (serving client build)' : ''}`);
});
