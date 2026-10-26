import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, 'dist');
// The sole deletion target is the fixed build directory in this checkout.
if (path.dirname(target) !== path.resolve(root) || path.basename(target) !== 'dist') throw new Error('Invalid build target');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(root, 'index.html'), path.join(target, 'index.html'));
await cp(path.join(root, 'src'), path.join(target, 'src'), { recursive: true });
await cp(path.join(root, 'public'), target, { recursive: true });
const bytes = (await stat(path.join(target, 'src/main.js'))).size;
console.log(`Built static activity in dist/ (${bytes.toLocaleString()} byte entry module). No runtime dependencies.`);
