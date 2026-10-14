/**
 * Local preview: serves /public and runs the /api functions the way Vercel does.
 *   npm run dev                       test mode: no keys needed, in-memory storage, sample AI replies
 *   open http://localhost:8790/?demo=1   to start a demo session
 * With ANTHROPIC_API_KEY / SUPABASE_* / GHL_* set, the same services are used as in production.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const port = Number(process.env.PORT || 8790);
const routes = {};
for (const name of ['ai', 'me', 'purchase', 'share', 'resend', 'cleanup', 'check']) {
  routes[`/api/${name}`] = (await import(`../api/${name}.js`)).default;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (routes[url.pathname]) return routes[url.pathname](req, res);
  let path = normalize(join(root, decodeURIComponent(url.pathname)));
  if (!path.startsWith(root)) { res.statusCode = 403; return res.end(); }
  try {
    if ((await stat(path)).isDirectory()) path = join(path, 'index.html');
    res.setHeader('content-type', types[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch {
    res.statusCode = 404; res.end('Not found');
  }
}).listen(port, () => console.log(`Preview: http://localhost:${port}/?demo=1`));
