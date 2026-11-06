const express = require('express'), http = require('http');
const { WebSocketServer } = require('ws'), { Pool } = require('pg');

const app = express(), server = http.createServer(app);
const wss = new WebSocketServer({ server });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL ? { rejectUnauthorized: false } : false
});
const W = 40, H = 30;
const players = new Map();
const rnd = () => ({ x: Math.floor(Math.random() * W), y: Math.floor(Math.random() * H) });
let food = rnd();

pool.query(`CREATE TABLE IF NOT EXISTS scores(
  id SERIAL PRIMARY KEY, name TEXT, score INT, created TIMESTAMPTZ DEFAULT now())`)
  .catch(e => console.error('DB init error', e.message));

app.use(express.static('public'));
app.get('/healthz', (_, r) => r.send('ok'));
app.get('/api/top10', async (_, r) => {
  try {
    const q = await pool.query('SELECT name, score FROM scores ORDER BY score DESC LIMIT 10');
    r.json(q.rows);
  } catch (e) { r.status(500).json([]); }
});

wss.on('connection', ws => {
  const id = Math.random().toString(36).slice(2);
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    if (d.type === 'join') {
      players.set(id, { ws, name: String(d.name).slice(0, 12), body: [rnd()], dx: 1, dy: 0, score: 0 });
    } else if (d.type === 'dir') {
      const p = players.get(id);
      if (p && !(d.dx === -p.dx && d.dy === -p.dy)) { p.dx = d.dx; p.dy = d.dy; }
    }
  });
  ws.on('close', () => players.delete(id));
});

setInterval(() => {
  for (const p of players.values()) {
    const h = { x: (p.body[0].x + p.dx + W) % W, y: (p.body[0].y + p.dy + H) % H };
    p.body.unshift(h);
    if (h.x === food.x && h.y === food.y) { p.score++; food = rnd(); } else p.body.pop();
  }
  for (const [id, p] of [...players]) {
    const h = p.body[0];
    const hit = [...players.values()].some(o =>
      o.body.some((s, i) => (o !== p || i > 0) && s.x === h.x && s.y === h.y));
    if (hit) {
      pool.query('INSERT INTO scores(name, score) VALUES($1,$2)', [p.name, p.score]).catch(console.error);
      p.ws.send(JSON.stringify({ type: 'dead', score: p.score }));
      players.delete(id);
    }
  }
  const state = JSON.stringify({ type: 'state', W, H, food,
    players: [...players.values()].map(p => ({ name: p.name, body: p.body, score: p.score })) });
  wss.clients.forEach(c => c.readyState === 1 && c.send(state));
}, 120);

server.listen(process.env.PORT || 3000);