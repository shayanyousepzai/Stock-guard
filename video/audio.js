// Synthesised soundtrack (no samples, no licences): 120 BPM kick, hats, bass, whooshes on cuts, impacts on slams.
async function synthAudio(dur, cue) {
  const sr = 48000, ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const master = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.12;
  master.gain.setValueAtTime(0.85, 0);
  master.gain.setValueAtTime(0.85, dur - 1.2);
  master.gain.linearRampToValueAtTime(0.0001, dur - 0.05);
  master.connect(comp).connect(ctx.destination);
  const nb = ctx.createBuffer(1, sr * 2, sr), nd = nb.getChannelData(0);
  let s = 7; for (let i = 0; i < nd.length; i++) { s = (s * 16807) % 2147483647; nd[i] = (s / 2147483647) * 2 - 1; }
  const env = (g, t, peak, attack, len) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len); };
  const tone = (t, f0, f1, len, peak, type = 'sine') => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.35);
    env(g, t, peak, 0.004, len); o.connect(g).connect(master); o.start(t); o.stop(t + len + 0.02);
  };
  const noise = (t, len, { type = 'highpass', f = 8000, f2 = 0, q = 0.7, peak = 0.2, attack = 0.002, pan = 0 } = {}) => {
    if (t < 0) return;
    const n = ctx.createBufferSource(); n.buffer = nb;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + len);
    const g = ctx.createGain(); env(g, t, peak, attack, len);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    n.connect(fl).connect(g).connect(p).connect(master); n.start(t, (t * 0.731) % 1.4); n.stop(t + len + 0.05);
  };
  const kick = t => tone(t, 160, 42, 0.42, 0.95);
  const hat = (t, pan) => noise(t, 0.045, { f: 9000, peak: 0.09, pan });
  const whoosh = t => { noise(t - 0.3, 0.42, { type: 'bandpass', f: 300, f2: 7000, q: 1.4, peak: 0.55, attack: 0.28, pan: -0.3 }); noise(t - 0.28, 0.42, { type: 'bandpass', f: 350, f2: 6000, q: 1.4, peak: 0.45, attack: 0.28, pan: 0.3 }); };
  const impact = (t, big = 1) => { tone(t, 120, 28, 0.9 * big, 1.0 * big); noise(t, 0.35 * big, { type: 'lowpass', f: 2500, f2: 200, peak: 0.6 * big }); };
  const riser = (t, len) => { const n = ctx.createBufferSource(); n.buffer = nb; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 2;
    fl.frequency.setValueAtTime(200, t); fl.frequency.exponentialRampToValueAtTime(9000, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + len); g.gain.setValueAtTime(0.0001, t + len + 0.01);
    n.connect(fl).connect(g).connect(master); n.start(t); n.stop(t + len + 0.05); };
  const tick = t => noise(t, 0.012, { f: 4000, peak: 0.07, pan: (Math.sin(t * 31) * 0.4) });
  const bassNote = (t, f) => { const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(160, t + 0.2);
    env(g, t, 0.22, 0.005, 0.22); o.connect(fl).connect(g).connect(master); o.start(t); o.stop(t + 0.25); };

  const beat = 0.5, roots = [55, 43.65, 65.41, 49];
  for (let t = 0; t < dur - 0.6; t += beat) {
    if (cue.silent.some(([a, b]) => t >= a && t < b)) continue;
    kick(t); hat(t + beat / 2, (t % 1) ? 0.25 : -0.25);
    const root = roots[Math.floor(t / 2) % 4];
    bassNote(t + beat / 2, root); bassNote(t + beat * 0.75, root * 2);
  }
  cue.whooshes.forEach(whoosh);
  cue.impacts.forEach(([t, big]) => impact(t, big));
  cue.risers.forEach(([t, len]) => riser(t, len));
  cue.typing.forEach(([a, b]) => { for (let t = a; t < b; t += 0.055) tick(t); });
  return ctx.startRendering();
}

async function encodeAudio(buf) {
  const packets = [];
  let head = null, err = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const d = new Uint8Array(chunk.byteLength); chunk.copyTo(d); packets.push({ data: d, ts: chunk.timestamp });
      if (!head && meta?.decoderConfig?.description) head = new Uint8Array(meta.decoderConfig.description);
    },
    error: e => { err = e; },
  });
  enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 160000 });
  const L = buf.getChannelData(0), R = buf.getChannelData(1), step = 4800;
  for (let i = 0; i < buf.length; i += step) {
    const n = Math.min(step, buf.length - i), planar = new Float32Array(n * 2);
    planar.set(L.subarray(i, i + n), 0); planar.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data: planar });
    enc.encode(ad); ad.close();
  }
  await enc.flush(); enc.close();
  if (err) throw err;
  if (!head || head.length < 19) {
    head = new Uint8Array(19); const dv = new DataView(head.buffer);
    head.set(new TextEncoder().encode('OpusHead')); head[8] = 1; head[9] = 2; dv.setUint16(10, 312, true); dv.setUint32(12, 48000, true);
  }
  return { packets, head };
}
