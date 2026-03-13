import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

let bundled = false;
try {
  const esbuild = await import('esbuild');
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'game.js')],
    bundle: true,
    minify: true,
    sourcemap: false,
    outfile: path.join(dist, 'game.js'),
    format: 'esm',
  });
  bundled = true;
} catch {
  await cp(path.join(root, 'src'), path.join(dist, 'src'), { recursive: true });
}

await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });

let html = await readFile(path.join(root, 'index.html'), 'utf8');
if (bundled) {
  html = html.replace('src="src/game.js"', 'src="game.js"');
}
html = html.replace(/\n\s+\n/g, '\n').trim() + '\n';
await writeFile(path.join(dist, 'index.html'), html, 'utf8');
