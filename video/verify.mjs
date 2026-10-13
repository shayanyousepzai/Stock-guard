// Checks the rendered file in Chrome: duration, size, seeking (served with HTTP range support), decoded frames and audio level.
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './cdp.mjs';

const FILE = fileURLToPath(new URL('./out/stock-guard-demo.webm', import.meta.url));
const data = readFileSync(FILE);
const srv = createServer((req, res) => {
  if (req.url !== '/v.webm') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<video id=v src=/v.webm muted preload=auto></video>'); }
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (!m) { res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': data.length, 'Accept-Ranges': 'bytes' }); return res.end(data); }
  const a = +m[1], b = m[2] ? +m[2] : data.length - 1;
  res.writeHead(206, { 'Content-Type': 'video/webm', 'Content-Range': `bytes ${a}-${b}/${data.length}`, 'Content-Length': b - a + 1, 'Accept-Ranges': 'bytes' });
  res.end(data.subarray(a, b + 1));
}).listen(8798, '127.0.0.1');
const b = await openBrowser(9335);
try {
  await b.send('Page.navigate', { url: 'http://127.0.0.1:8798/' });
  await b.waitFor(`document.getElementById('v')?.readyState >= 1`, 15000);
  const r = await b.evaluate(`(async () => {
    const v = document.getElementById('v'), out = { duration: v.duration, w: v.videoWidth, h: v.videoHeight, seeks: {} };
    const bright = () => { const c = document.createElement('canvas'); c.width = 96; c.height = 54; const g = c.getContext('2d'); g.drawImage(v, 0, 0, 96, 54);
      const d = g.getImageData(0, 0, 96, 54).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return +(s / (d.length / 4) / 3).toFixed(1); };
    for (const t of [1.3, 13.8, 29.4]) { v.currentTime = t; await new Promise(ok => v.onseeked = ok); await new Promise(ok => setTimeout(ok, 400)); out.seeks[t] = { at: +v.currentTime.toFixed(2), brightness: bright() }; }
    v.currentTime = 13.8; await new Promise(ok => v.onseeked = ok); await new Promise(ok => setTimeout(ok, 400));
    const c = document.createElement('canvas'); c.width = 960; c.height = 540; c.getContext('2d').drawImage(v, 0, 0, 960, 540); out.frame = c.toDataURL('image/jpeg', 0.8);
    const buf = await new AudioContext().decodeAudioData(await (await fetch('/v.webm')).arrayBuffer());
    const d = buf.getChannelData(0); let s = 0; for (let i = 0; i < d.length; i += 10) s += d[i] * d[i];
    out.audio = { duration: +buf.duration.toFixed(2), channels: buf.numberOfChannels, rms: +Math.sqrt(s / (d.length / 10)).toFixed(3) };
    return out; })()`);
  writeFileSync(fileURLToPath(new URL('./out/verify-frame.jpg', import.meta.url)), Buffer.from(r.frame.split(',')[1], 'base64'));
  delete r.frame;
  console.log(JSON.stringify(r));
} finally { b.close(); srv.close(); }
