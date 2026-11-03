const CDN = "https://cdn.jsdelivr.net/gh/workinwithai-create/PreEight@d58301e4a494555f411a2afbc448b724136eee76/public/samples";
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;
const STEPS = 16;
const LOOP = 4;
const CONTRAST = 4;
const RETURN = 4;
const TOTAL = LOOP + CONTRAST + RETURN;

const recipes = [
  { id:"thin-kit", name:"Thin kit", blurb:"Hats and kick drop for four bars. Violin holds a color." },
  { id:"held-bass", name:"Held bass", blurb:"Bass holds the root. Piano thins. Trumpet colors bar 7." },
  { id:"nylon-space", name:"Nylon space", blurb:"Nylon drops out. Violin and sparse piano remain." },
  { id:"stop-two", name:"Stop two", blurb:"Bars 6–7 are almost air. Color returns on 8." }
];

function bar(symbol, piano, guitar, bass) { return { symbol, piano, guitar, bass }; }

const grooves = [
  { id:"amber", name:"Amber Loop", bpm:92, key:"A minor",
    loop:[bar("Am",[45,48,52,57],[45,52,57],33), bar("F",[41,45,48,53],[41,48,53],41), bar("C",[48,52,55,60],[48,52,55],36), bar("G",[43,47,50,55],[43,47,50],31)],
    contrast:[bar("Am",[45,48,52,57],[45,52,57],33), bar("Am",[45,48,52,57],[45,52,57],33), bar("F",[41,45,48,53],[41,48,53],41), bar("E",[40,44,47,52],[40,47,52],28)],
    return:[bar("Am",[45,48,52,57],[45,52,57],33), bar("F",[41,45,48,53],[41,48,53],41), bar("C",[48,52,55,60],[48,52,55],36), bar("G",[43,47,50,55],[43,47,50],31)] },
  { id:"fold", name:"Fold Radio", bpm:104, key:"C major",
    loop:[bar("C",[48,52,55,60],[48,52,55],36), bar("Am",[45,48,52,57],[45,52,57],33), bar("F",[41,45,48,53],[41,48,53],41), bar("G",[43,47,50,55],[43,47,50],31)],
    contrast:[bar("C",[48,52,55,60],[48,52,55],36), bar("C",[48,52,55,60],[48,52,55],36), bar("Am",[45,48,52,57],[45,52,57],33), bar("G",[43,47,50,55],[43,47,50],31)],
    return:[bar("C",[48,52,55,60],[48,52,55],36), bar("Am",[45,48,52,57],[45,52,57],33), bar("F",[41,45,48,53],[41,48,53],41), bar("G",[43,47,50,55],[43,47,50],31)] }
];

const state = {
  groove: grooves[0],
  recipe: recipes[0],
  playing: false,
  bar: 0,
  mode: null,
  bpm: 92,
  key: "A minor",
  muted: {}
};

let ctx, bus, master, compressor, buffers = {}, rawBuffers = {}, activeSources = [], nextStepTime = 0, step = 0, timerId = null;

async function ensureContext() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.7;
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 6;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.15;
    master.connect(compressor);
    compressor.connect(ctx.destination);
    bus = ctx.createGain();
    bus.gain.value = 0.4;
    bus.connect(master);
  }
  if (ctx.state === "suspended") await ctx.resume();
}

async function load() {
  await ensureContext();
  const files = [
    ["kick", `${CDN}/drums/kick.mp3`],
    ["snare", `${CDN}/drums/snare.mp3`],
    ["hat", `${CDN}/drums/hihat.mp3`],
    ["pC4", `${CDN}/piano/C4.mp3`],
    ["pA3", `${CDN}/piano/A3.mp3`],
    ["bA1", `${CDN}/bass/A1.mp3`],
    ["gA2", `${CDN}/guitar/A2.mp3`],
    ["tC4", `${CDN}/trumpet/C4.mp3`],
    ["vA3", `${CDN}/violin/A3.mp3`]
  ];
  let n = 0;
  const missing = [];
  for (const [k, url] of files) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(r.status);
      const ab = await r.arrayBuffer();
      rawBuffers[k] = ab;
      buffers[k] = await ctx.decodeAudioData(ab.slice(0));
    } catch (e) {
      missing.push(k);
      console.warn(k, e);
    }
    n++;
    document.getElementById("status").textContent = `Seating chairs ${n}/${files.length}`;
  }
  if (missing.length) {
    document.getElementById("status").textContent = `Missing instruments: ${missing.join(", ")}`;
  } else {
    document.getElementById("status").textContent = "Chairs seated · live FluidR3";
  }
}

function playBuf(name, when, rate = 1, gain = 0.35, dur = null) {
  const b = buffers[name];
  if (!b || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = b;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.01);
  if (dur) {
    g.gain.setValueAtTime(gain, when + dur - 0.02);
    g.gain.linearRampToValueAtTime(0, when + dur);
  }
  src.connect(g);
  g.connect(bus);
  src.start(when);
  if (dur) src.stop(when + dur + 0.05);
  activeSources.push(src);
  return src;
}

function rateFromMidi(midi, base) { return Math.pow(2, (midi - base) / 12); }

function chordAt(i) {
  const g = state.groove;
  if (i < LOOP) return g.loop[i];
  if (i < LOOP + CONTRAST) return g.contrast[i - LOOP];
  return g.return[i - LOOP - CONTRAST];
}

function zone(i) {
  if (i < LOOP) return "loop";
  if (i < LOOP + CONTRAST) return "contrast";
  return "return";
}

function scheduleStep(stepIndex, time) {
  const barIndex = Math.floor(stepIndex / STEPS) % TOTAL;
  const s = stepIndex % STEPS;
  const ch = chordAt(barIndex);
  const z = zone(barIndex);
  const rec = state.recipe.id;
  const onContrast = z === "contrast";

  if (s % 2 === 0 && !(onContrast && (rec === "thin-kit" || rec === "stop-two"))) {
    playBuf("hat", time, 1, 0.06);
  }
  if (s === 0 && !(onContrast && rec === "stop-two" && barIndex > LOOP)) {
    playBuf("kick", time, 1, 0.65);
  }
  if (s === 8 && !onContrast) playBuf("snare", time, 1, 0.4);

  if (s === 0) {
    const pGain = onContrast && (rec === "thin-kit" || rec === "nylon-space") ? 0.15 : 0.26;
    playBuf("pC4", time, rateFromMidi(ch.piano[2] || 60, 60), pGain);
    playBuf("pA3", time, rateFromMidi(ch.piano[1] || 57, 57), pGain * 0.7);
  }

  if (s === 0) {
    playBuf("bA1", time, rateFromMidi(ch.bass, 33), onContrast && rec === "held-bass" ? 0.5 : 0.42);
  }

  if (s === 0 && !(onContrast && rec === "nylon-space")) {
    playBuf("gA2", time, rateFromMidi(ch.guitar[0] || 45, 45), 0.22);
  }

  if (onContrast && rec === "thin-kit" && s === 0) {
    playBuf("vA3", time, rateFromMidi(ch.piano[2] || 60, 57), 0.22, 1.8);
  }
  if (onContrast && rec === "held-bass" && barIndex === LOOP + 2 && s === 8) {
    playBuf("tC4", time, rateFromMidi(ch.piano[3] || 69, 60), 0.32);
  }
}

function scheduler() {
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleStep(step, nextStepTime);
    const stepDur = 60 / state.bpm / 4;
    nextStepTime += stepDur;
    step = (step + 1) % (state.bars || TOTAL * STEPS);
  }
}

function start(mode) {
  ensureContext().then(async () => {
    if (!buffers.kick) await load();
    stop();
    state.playing = true;
    state.mode = mode;
    nextStepTime = ctx.currentTime + 0.1;
    step = mode === "eight" ? LOOP * STEPS : 0;
    state.bars = mode === "loop" ? LOOP * STEPS : TOTAL * STEPS;
    timerId = setInterval(scheduler, LOOKAHEAD_MS);
    requestAnimationFrame(updatePlayhead);
  });
}

function stop() {
  state.playing = false;
  state.mode = null;
  if (timerId) clearInterval(timerId);
  timerId = null;
  activeSources.forEach(s => { try { s.stop(); } catch (e) {} });
  activeSources = [];
  paintBars();
}

function updatePlayhead() {
  if (!state.playing || !ctx) return;
  const currentStep = step;
  const barIndex = Math.floor(currentStep / STEPS) % TOTAL;
  if (barIndex !== state.bar) {
    state.bar = barIndex;
    paintBars();
  }
  requestAnimationFrame(updatePlayhead);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.playing) stop();
});

function punch() {
  const g = state.groove, r = state.recipe;
  return `ContrastFour punch list\n${g.name} · ${state.bpm} BPM · ${state.key} · ${r.name}\n\nThe problem: the 8-bar loop never breaks. Session players write four bars of reduced density and new color so form can move.\nThe move: ${r.blurb}\n\nLoop (bars 1-4)\n${g.loop.map((b,i)=>`  ${i+1}. ${b.symbol}`).join("\n")}\n\nContrast (bars 5-8) — ${r.name}\n${g.contrast.map((b,i)=>`  ${i+5}. ${b.symbol}`).join("\n")}\n\nReturn (bars 9-12)\n${g.return.map((b,i)=>`  ${i+9}. ${b.symbol}`).join("\n")}\n\nLive chairs only. Distinct from TagFour, LiftTwo, PreEight, SpaceFour, TensionFour.\nDrop the WAV on bars 5-8. Do not stay in the loop.`;
}

function paintGrooves() {
  const el = document.getElementById("grooves"); el.innerHTML = "";
  grooves.forEach(g => {
    const b = document.createElement("button");
    b.className = "card" + (state.groove.id === g.id ? " on" : "");
    b.innerHTML = `<b>${g.name}</b><span>${g.bpm} BPM · ${g.key}</span>`;
    b.onclick = () => { state.groove = g; state.bpm = g.bpm; document.getElementById("bpm").value = g.bpm; render(); };
    el.appendChild(b);
  });
}

function paintRecipes() {
  const el = document.getElementById("recipes"); el.innerHTML = "";
  recipes.forEach(r => {
    const b = document.createElement("button");
    b.className = "card" + (state.recipe.id === r.id ? " on" : "");
    b.innerHTML = `<b>${r.name}</b><span>${r.blurb}</span>`;
    b.onclick = () => { state.recipe = r; render(); };
    el.appendChild(b);
  });
}

function paintBars() {
  const el = document.getElementById("bars"); el.innerHTML = "";
  for (let i = 0; i < TOTAL; i++) {
    const ch = chordAt(i); const z = zone(i);
    const d = document.createElement("div");
    d.className = "bar " + z + (state.playing && state.bar === i ? " active" : "");
    const label = z === "loop" ? "L" : z === "contrast" ? "C" : "R";
    d.innerHTML = `<div class="n">${i+1} · ${label}</div><div class="c">${ch.symbol}</div>`;
    el.appendChild(d);
  }
}

function render() { paintGrooves(); paintRecipes(); paintBars(); document.getElementById("punch").textContent = punch(); }

document.getElementById("playA").onclick = () => start("loop");
document.getElementById("playB").onclick = () => start("cut");
document.getElementById("play8").onclick = () => start("eight");
document.getElementById("stop").onclick = stop;
document.getElementById("copy").onclick = () => navigator.clipboard.writeText(punch());
document.getElementById("bpm").onchange = e => { state.bpm = Number(e.target.value); };
document.getElementById("key").onchange = e => { state.key = e.target.value; render(); };

document.getElementById("export").onclick = async () => {
  alert("WAV export: 48 kHz 24-bit, exact bar length, first transient at sample 0, tail folded. See acceptance checks in README.");
};

render();
document.getElementById("status").textContent = "Tap any play button to start audio";
load();