/**
 * Local preview: serves /public and runs the /api functions the way Vercel does.
 *   npm run dev            (test mode, no API key needed)
 *   ANTHROPIC_API_KEY=… npm run dev   (live AI)
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import ai from '../api/ai.js';
import exporter from '../api/export.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const port = Number(process.env.PORT || 8790);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/ai') return ai(req, res);
  if (url.pathname === '/api/export') return exporter(req, res);
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.setHeader('content-type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch {
    res.statusCode = 404; res.end('Not found');
  }
}).listen(port, () => console.log(`Preview: http://localhost:${port}  (AI: ${process.env.AI_MODE === 'mock' || !process.env.ANTHROPIC_API_KEY ? 'test mode' : 'live'})`));
