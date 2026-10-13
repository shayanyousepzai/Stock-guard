// Tiny WebM (Matroska) muxer for WebCodecs output: one VP8 video track, optional Opus audio, cues for seeking.
const WebM = (() => {
  const te = new TextEncoder();
  const cat = parts => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let i = 0; for (const p of parts) { o.set(p, i); i += p.length; } return o; };
  const idBytes = id => { const b = []; while (id > 0) { b.unshift(id % 256); id = Math.floor(id / 256); } return new Uint8Array(b); };
  const vint = n => {
    for (let len = 1; len <= 8; len++) {
      if (n < 2 ** (7 * len) - 1) {
        const b = new Uint8Array(len); let v = n;
        for (let i = len - 1; i >= 0; i--) { b[i] = v % 256; v = Math.floor(v / 256); }
        b[0] |= 0x80 >> (len - 1);
        return b;
      }
    }
    throw new Error('element too large');
  };
  const uint = (n, fixed = 0) => { const b = []; do { b.unshift(n % 256); n = Math.floor(n / 256); } while (n > 0); while (b.length < fixed) b.unshift(0); return new Uint8Array(b); };
  const f64 = x => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; };
  const el = (id, payload) => cat([idBytes(id), vint(payload.length), payload]);
  const elU = (id, n, fixed) => el(id, uint(n, fixed));
  const elS = (id, s) => el(id, te.encode(s));
  const elF = (id, x) => el(id, f64(x));
  const elC = (id, ...kids) => el(id, cat(kids));

  function mux({ width, height, vcodec, video, audio, opusHead, durationMs }) {
    const header = elC(0x1A45DFA3, elU(0x4286, 1), elU(0x42F7, 1), elU(0x42F2, 4), elU(0x42F3, 8), elS(0x4282, 'webm'), elU(0x4287, 4), elU(0x4285, 2));
    const info = elC(0x1549A966, elU(0x2AD7B1, 1000000), elS(0x4D80, 'stockguard'), elS(0x5741, 'stockguard'), elF(0x4489, durationMs));
    const tv = elC(0xAE, elU(0xD7, 1), elU(0x73C5, 1), elU(0x83, 1), elS(0x86, vcodec), elC(0xE0, elU(0xB0, width), elU(0xBA, height)));
    const ta = audio ? elC(0xAE, elU(0xD7, 2), elU(0x73C5, 2), elU(0x83, 2), elS(0x86, 'A_OPUS'), el(0x63A2, opusHead),
      elU(0x56AA, 6500000), elU(0x56BB, 80000000), elC(0xE1, elF(0xB5, 48000), elU(0x9F, 2))) : new Uint8Array();
    const tracks = elC(0x1654AE6B, tv, ta);
    const blocks = [...video.map(v => ({ ...v, track: 1 })), ...(audio || []).map(a => ({ ...a, track: 2, key: true }))]
      .sort((a, b) => a.ts - b.ts || a.track - b.track);
    const clusters = [];
    let cur = null;
    for (const bk of blocks) {
      const ms = Math.max(0, Math.round(bk.ts / 1000));
      if (!cur || (bk.track === 1 && bk.key && ms > cur.t) || ms - cur.t > 30000) { cur = { t: ms, parts: [], cue: bk.track === 1 && bk.key }; clusters.push(cur); }
      const hdr = new Uint8Array(4);
      hdr[0] = 0x80 | bk.track;
      new DataView(hdr.buffer).setInt16(1, ms - cur.t);
      hdr[3] = bk.key ? 0x80 : 0;
      cur.parts.push(el(0xA3, cat([hdr, bk.data])));
    }
    const clusterBytes = clusters.map(c => elC(0x1F43B675, elU(0xE7, c.t), ...c.parts));
    const seekLen = elC(0x114D9B74, elC(0x4DBB, el(0x53AB, idBytes(0x1C53BB6B)), elU(0x53AC, 0, 8))).length;
    let pos = seekLen + info.length + tracks.length;
    const points = [];
    clusters.forEach((c, i) => { if (c.cue) points.push(elC(0xBB, elU(0xB3, c.t), elC(0xB7, elU(0xF7, 1), elU(0xF1, pos, 8)))); pos += clusterBytes[i].length; });
    const cues = elC(0x1C53BB6B, ...points);
    const seekHead = elC(0x114D9B74, elC(0x4DBB, el(0x53AB, idBytes(0x1C53BB6B)), elU(0x53AC, pos, 8)));
    const segment = el(0x18538067, cat([seekHead, info, tracks, ...clusterBytes, cues]));
    return new Blob([header, segment], { type: 'video/webm' });
  }
  return { mux };
})();
