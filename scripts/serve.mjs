import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const production = process.argv.includes('--dist');
const directory = path.join(root, production ? 'dist' : '');
const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT || 4173);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
  try {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = route === '/' ? 'index.html' : route.replace(/^\/+/, '');
    let filename = path.resolve(directory, relative);
    if (!filename.startsWith(path.resolve(directory) + path.sep)) throw new Error('Outside root');
    if (!production && !relative.startsWith('src/') && relative !== 'index.html') filename = path.resolve(root, 'public', relative);
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    res.writeHead(200, { 'Content-Type': `${mime[path.extname(filename)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(await readFile(filename));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Rogue Refract: http://127.0.0.1:${port}`));
