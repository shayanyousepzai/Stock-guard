// Captures the real running app (python -m stockguard) as HD stills plus element positions for the video.
import { writeFileSync, mkdirSync } from 'node:fs';
import { openBrowser, sleep } from './cdp.mjs';

const OUT = new URL('./shots/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const DPR = 1.2; // 1600x900 css -> 1920x1080 px
const b = await openBrowser(9333);
const { send, evaluate, waitFor } = b;
const metrics = (width, height, scale, mobile = false) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
const scheme = v => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: v }] });
const rects = sels => evaluate(`(()=>{const o={};for(const s of ${JSON.stringify(sels)}){[...document.querySelectorAll(s)].forEach((e,i)=>{const r=e.getBoundingClientRect();o[i?s+'#'+i:s]={x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height}})}return o})()`);

async function shot(name, { full = false, width = 1600 } = {}) {
  let params = { format: 'png' };
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    params = { ...params, captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: Math.ceil(m.cssContentSize.height), scale: 1 } };
  }
  const { data } = await send('Page.captureScreenshot', params);
  writeFileSync(new URL(name + '.png', OUT), Buffer.from(data, 'base64'));
  console.log('saved', name);
}
const click = sel => evaluate(`document.querySelector(${JSON.stringify(sel)}).click(); true`);

try {
  await metrics(1600, 900, DPR);
  await scheme('light');
  await send('Page.navigate', { url: 'http://localhost:8765/' });
  await waitFor(`document.readyState==='complete' && !document.getElementById('aiState').textContent.includes('checking')`, 15000);
  await sleep(400);
  const meta = { scale: DPR, rects: {} };
  await shot('empty');
  meta.rects.empty = await rects(['#drop', '#recalls', '.empty h2', 'aside']);

  console.log('running the sample with the local model (can take a few minutes)...');
  await evaluate(`document.getElementById('ai').checked = true; document.getElementById('sample').click(); true`);
  await waitFor(`!!document.querySelector('.hero')`, 900000);
  await sleep(600);
  await shot('results');
  meta.rects.results = await rects(['.hero h2', '.hero', '.note', '.stamps', '.stamp', '.tabs', '.panel table']);
  meta.data = JSON.parse(await evaluate('JSON.stringify(data)'));
  await scheme('dark'); await sleep(300); await shot('results-dark'); await scheme('light');

  await click('[data-t=returns]');
  await evaluate(`document.querySelector('.panel details').open = true; true`);
  await sleep(300);
  await shot('returns-full', { full: true });
  meta.rects.returns = await rects(['.panel .card', '.panel pre']);

  await click('[data-t=reorder]'); await scheme('dark'); await sleep(300);
  await shot('reorder-dark');
  meta.rects.reorder = await rects(['.panel table', '.tabs']);
  await scheme('light');

  await click('[data-t=attention]');
  await metrics(390, 844, 2, true); await sleep(400);
  await shot('mobile-full', { full: true, width: 390 });
  meta.rects.mobile = await rects(['main']);
  writeFileSync(new URL('meta.json', OUT), JSON.stringify(meta, null, 1));
  console.log('AI summary:', meta.data.ai.summary);
} finally {
  b.close();
}
