// Renders the demo with headless Chrome + WebCodecs. No ffmpeg, no npm packages.
//   node video/render.mjs                 -> video/out/stock-guard-demo.webm
//   node video/render.mjs --stills 1,12   -> video/out/still-1.jpg, still-12.jpg
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, sleep } from './cdp.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const OUT = join(ROOT, 'out');
mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const srv = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/save') {
    const parts = []; req.on('data', d => parts.push(d));
    req.on('end', () => { writeFileSync(join(OUT, url.searchParams.get('name').replace(/[^\w.-]/g, '')), Buffer.concat(parts)); res.end('ok'); });
    return;
  }
  const p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { const body = readFileSync(p); res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(8799, '127.0.0.1');

const b = await openBrowser(9334);
try {
  await b.send('Page.navigate', { url: 'http://127.0.0.1:8799/composer.html' });
  await b.waitFor('window.ready === true', 30000);
  const i = process.argv.indexOf('--stills'), sh = process.argv.indexOf('--sheet');
  if (sh > 0) { // 4x4 contact sheet of the given times
    const url = await b.evaluate(`(() => { const ts = ${JSON.stringify(process.argv[sh + 1].split(',').map(Number))};
      const s = document.createElement('canvas'); s.width = 1920; s.height = 270 * Math.ceil(ts.length / 4); const g = s.getContext('2d');
      ts.forEach((t, k) => { stillAt(t); g.drawImage(document.getElementById('c'), (k % 4) * 480, Math.floor(k / 4) * 270, 480, 270);
        g.fillStyle = '#000'; g.fillRect((k % 4) * 480, Math.floor(k / 4) * 270, 60, 22); g.fillStyle = '#fff'; g.font = '16px sans-serif'; g.fillText(t, (k % 4) * 480 + 6, Math.floor(k / 4) * 270 + 16); });
      return s.toDataURL('image/jpeg', 0.85); })()`);
    writeFileSync(join(OUT, 'sheet.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    console.log('sheet saved');
  } else if (i > 0) {
    for (const t of process.argv[i + 1].split(',').map(Number)) {
      const url = await b.evaluate(`stillAt(${t})`);
      writeFileSync(join(OUT, `still-${t}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      console.log('still', t);
    }
  } else {
    const t0 = Date.now();
    await b.evaluate('window.job = renderVideo().then(r => window.result = r, e => window.failed = String(e)); true');
    for (;;) {
      await sleep(3000);
      const s = await b.evaluate('JSON.stringify({p: window.progress || 0, r: window.result, f: window.failed})');
      const { p, r, f } = JSON.parse(s);
      if (f) throw new Error(f);
      if (r) { console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s`, r); break; }
      console.log(`rendering ${(p * 100).toFixed(0)}%`);
    }
  }
} finally {
  b.close(); srv.close();
}
