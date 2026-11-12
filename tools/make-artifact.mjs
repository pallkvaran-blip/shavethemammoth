// Wraps the artifact build into one self-contained page fragment:
// markup + styles from index.html, the game code inline, three.js from a CDN.
//   npm run build:artifact   ->  dist-artifact/shave-the-mammoth.html
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const code = readFileSync(join(root, 'dist-artifact', 'game.js'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const three = pkg.dependencies.three.replace(/^[^\d]*/, '');

const pick = (re) => (html.match(re) || [''])[0];
const title = pick(/<title>[\s\S]*?<\/title>/);
const sides = pick(/<meta name="claude:viewport-fit-sides"[^>]*>/);
const fonts = pick(/<link rel="stylesheet"[^>]*>/);
const style = pick(/<style>[\s\S]*?<\/style>/);
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();

const importmap = {
  imports: {
    three: `https://cdn.jsdelivr.net/npm/three@${three}/build/three.module.js`,
    'three/addons/': `https://cdn.jsdelivr.net/npm/three@${three}/examples/jsm/`,
  },
};

const out = [
  title, sides, fonts, style, body,
  `<script type="importmap">${JSON.stringify(importmap)}</script>`,
  `<script type="module">\n${code.replace(/<\/script/g, '<\\/script')}\n</script>`,
].join('\n');

writeFileSync(join(root, 'dist-artifact', 'shave-the-mammoth.html'), out);
// a full document around the same fragment, for checking it locally
writeFileSync(join(root, 'dist-artifact', 'preview.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n${out}\n</body></html>`);
console.log(`artifact page: ${(out.length / 1024).toFixed(0)} KB, three@${three} from jsDelivr`);
