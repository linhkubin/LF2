// Khoi dong: nap tai san, menu VS/Stage, thiet lap tran, vong lap 33 ms/tick (FUN_0043cf40), ket qua.
import { loadJSON, loadObject, loadBackground, loadImage } from "./assets.js?v=3";
import { Keyboard, Controller } from "./input.js?v=3";
import { Sound } from "./audio.js?v=3";
import { Game } from "./game.js?v=3";
import { SCREEN_W, SCREEN_H } from "./render.js?v=3";
import { listCombos, seqText } from "./combos.js?v=3";

const TICK_MS = 33;
const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Không tìm thấy #${id}: trình duyệt đang dùng trang cũ trong bộ nhớ đệm. Bấm Ctrl+F5.`);
  return el;
};
const canvas = $("screen");
const g = canvas.getContext("2d");
g.imageSmoothingEnabled = false;

const kb = new Keyboard();
const sound = new Sound();
const env = { dataCache: {}, backgrounds: [], stages: [], controllers: [], sound, ui: {}, makeAI: null, music: null };
const app = { game: null, lastCfg: null, debug: false, step: false, mode: "vs", speed: 1 };
window.__lf2 = app;

// ---------------------------------------------------------------- nhac (chi khi da doi WMA -> OGG)
const music = new Audio();
music.loop = true; music.volume = 0.5;
env.music = (path) => {
  const name = path.replace(/\\/g, "/").split("/").pop().replace(/\.wma$/i, "");
  const url = `assets/music/${name}.ogg`;
  if (!env.musicFiles || !env.musicFiles.has(`music/${name}.ogg`)) return;   // chua doi WMA -> OGG
  if (music.dataset.url === url) return;
  music.dataset.url = url; music.src = url;
  if (sound.enabled) music.play().catch(() => {});
};

function show(id) {
  for (const el of document.querySelectorAll(".overlay")) el.classList.toggle("show", el.id === id);
}

// ---------------------------------------------------------------- nap
async function boot() {
  const [table, stages] = await Promise.all([loadJSON("data/data.json"), loadJSON("data/stages.json")]);
  env.stages = stages;
  const manifest = await loadJSON("manifest.json").catch(() => ({ files: [] }));
  env.musicFiles = new Set(manifest.files.filter((f) => f.startsWith("music/")));
  // Mot nguoi choi: huong = phim mui ten (bo P3 goc), Danh/Nhay/Do = C/X/Z
  env.controllers = [new Controller(kb, [KEY_LAYOUT])];
  env.table = table;
  const uiNames = ["FRAME", "BARS", "SPARK", "PAUSE", "WORDS0", "WORDS1", "WORDS2", "WORDS3", "WORDS4", "WORDS5"];
  const jobs = [
    ...uiNames.map((n) => async () => { env.ui[n] = await loadImage(`assets/ui/keyed/${n}.png`); }),
    ...table.objects.map((o) => async () => {
      const d = await loadObject(o.id);
      d.id = o.id; d.type = o.type;
      if (d.header.small) d.smallImg = await loadImage(d.header.small).catch(() => null);
      if (d.header.head) d.headImg = await loadImage(d.header.head).catch(() => null);
      env.dataCache[o.id] = d;
    }),
    ...table.backgrounds.map((b) => async () => { env.backgrounds[b.index] = await loadBackground(b.index); }),
  ];
  let done = 0;
  const N = jobs.length;
  const pool = async () => { while (jobs.length) { await jobs.shift()(); done++; $("load-bar").style.width = `${100 * done / N}%`; $("load-text").textContent = `Đang nạp ${done}/${N}`; } };
  await Promise.all([pool(), pool(), pool(), pool(), pool(), pool()]);
  try {
    const ai = await import("./sim/ai.js?v=3");
    env.makeAI = ai.makeAI;
  } catch (e) {
    console.warn("Chua co AI:", e.message);
    $("status").textContent = "Chưa có AI máy (sim/ai.js) — nhân vật máy sẽ đứng yên.";
  }
  buildSetupOptions();
  show("ov-menu");
  last = performance.now();
  logicLoop();
  requestAnimationFrame(renderLoop);
}

// ---------------------------------------------------------------- phim va bang chieu
const KEY_LAYOUT = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight", attack: "KeyC", jump: "KeyX", defend: "KeyZ" };
const KEY_NAMES = { def: "Z", fwd: "→", up: "↑", down: "↓", atk: "C", jump: "X" };
let comboShown = null;
function showCombos(id) {
  const d = env.dataCache[id];
  if (!d || comboShown === id) return;
  comboShown = id;
  const list = listCombos(d);
  $("combo-title").textContent = `Chiêu của ${d.header.name}`;
  $("combo-body").innerHTML = list.length
    ? list.map((c) => `<tr><td class="keys">${seqText(c.seq, KEY_NAMES)}</td><td>${c.name}</td><td>${c.cost || "—"}</td><td class="when">${c.when ? "khi " + c.when : ""}</td></tr>`).join("")
    : `<tr><td colspan="4">Nhân vật này không có chiêu đặc biệt.</td></tr>`;
}

// ---------------------------------------------------------------- thiet lap tran
const PLAYABLE = [11, 10, 9, 8, 7, 6, 5, 4, 2, 1];
const HIDDEN = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 50, 51, 52];
const KIND_OPTS = [["none", "—"], ["com", "Máy"]];

function charOptions(sel) {
  const opt = (id) => `<option value="${id}" ${id === sel ? "selected" : ""}>${env.dataCache[id] ? env.dataCache[id].header.name : id}</option>`;
  return `<optgroup label="Nhân vật">${PLAYABLE.map(opt).join("")}</optgroup><optgroup label="Ẩn / quái">${HIDDEN.filter((i) => env.dataCache[i]).map(opt).join("")}</optgroup>`;
}

function setupRows(defaults) {
  $("setup-rows").innerHTML = defaults.map((d, i) => `
    <tr data-i="${i}">
      <td>${i + 1}</td>
      <td>${i === 0 ? `<b style="color:var(--hi)">Bạn</b>` : `<select class="kind">${KIND_OPTS.map(([v, t]) => `<option value="${v}" ${v === d.kind ? "selected" : ""}>${t}</option>`).join("")}</select>`}</td>
      <td><canvas class="face" width="40" height="45"></canvas></td>
      <td><select class="char">${charOptions(d.charId)}</select></td>
      <td class="vs-only"><select class="team">${["Độc lập", "Đội 1", "Đội 2", "Đội 3", "Đội 4"].map((t, k) => `<option value="${k}" ${k === d.team ? "selected" : ""}>${t}</option>`).join("")}</select></td>
    </tr>`).join("");
  for (const tr of $("setup-rows").children) {
    const upd = () => {
      const id = +tr.querySelector(".char").value;
      const c = tr.querySelector(".face"), gg = c.getContext("2d");
      gg.clearRect(0, 0, 40, 45);
      const img = env.dataCache[id] && env.dataCache[id].smallImg;
      const kind = tr.querySelector(".kind");
      if (img && (!kind || kind.value !== "none")) gg.drawImage(img, 0, 0);
      if (!kind) showCombos(id);
    };
    tr.querySelector(".char").onchange = upd;
    if (tr.querySelector(".kind")) tr.querySelector(".kind").onchange = upd;
    upd();
  }
}

function buildSetupOptions() {
  $("vs-bg").innerHTML = `<option value="rand">Ngẫu nhiên</option>` + env.backgrounds.map((b, i) => b && i < 9 ? `<option value="${i}">${b.name.replace(/_/g, " ")}</option>` : "").join("");
  $("opt-bg").innerHTML = env.backgrounds.map((b, i) => b && i < 9 ? `<option value="${i}" ${i === 1 ? "selected" : ""}>${b.name.replace(/_/g, " ")}</option>` : "").join("");
  $("opt-stage").innerHTML = env.stages.filter((s) => s.id < 50).sort((a, b) => a.id - b.id)
    .map((s) => `<option value="${s.id}">Stage ${Math.floor(s.id / 10) + 1}-${s.id % 10 + 1}</option>`).join("");
}

function openSetup(mode) {
  app.mode = mode;
  $("setup-title").textContent = mode === "vs" ? "VS Mode" : "Stage Mode";
  for (const el of document.querySelectorAll(".vs-only")) el.style.display = mode === "vs" ? "" : "none";
  for (const el of document.querySelectorAll(".stage-only")) el.style.display = mode === "stage" ? "" : "none";
  const prev = app.lastCfg && app.lastCfg.mode === mode ? app.lastCfg : null;
  const defaults = Array.from({ length: 8 }, (_, i) => {
    if (prev && prev.rows[i]) return prev.rows[i];
    if (i === 0) return { kind: "human", charId: 11, team: mode === "vs" ? 1 : 0 };
    if (i === 1 && mode === "vs") return { kind: "com", charId: 9, team: 2 };
    return { kind: "none", charId: PLAYABLE[i % PLAYABLE.length], team: 0 };
  });
  setupRows(defaults);
  for (const el of document.querySelectorAll("#setup-rows .vs-only")) el.style.display = mode === "vs" ? "" : "none";
  show("ov-setup");
  for (const id of ["combo-title", "combo", "combo-note"]) { const el = document.getElementById(id); if (el) el.style.display = ""; }
}

function readSetup() {
  const rows = [...$("setup-rows").children].map((tr, i) => ({
    kind: i === 0 ? "human" : tr.querySelector(".kind").value, charId: +tr.querySelector(".char").value, team: +tr.querySelector(".team").value,
  }));
  const players = rows.map((r) => r.kind === "none" ? null : r.kind === "com"
    ? { kind: "com", charId: r.charId, team: r.team }
    : { kind: "human", layout: 0, charId: r.charId, team: r.team });
  return { mode: app.mode, rows, players, difficulty: +$("opt-diff").value, bg: +$("opt-bg").value, startStage: +$("opt-stage").value };
}

function startGame(cfg) {
  const humans = cfg.players.filter((p) => p && p.kind === "human");
  const total = cfg.players.filter(Boolean).length;
  if (!total) { $("status").textContent = "Chọn ít nhất một người chơi."; return; }
  if (cfg.mode === "vs" && total < 2) { $("status").textContent = "VS cần ít nhất 2 nhân vật."; return; }
  $("status").textContent = "";
  app.lastCfg = cfg;
  sound.unlock();
  app.game = new Game(cfg, env);
  app.game.onFinish = (r) => showResult(r);
  void humans;
  const me = app.game.players.find((p) => p.isPlayer);
  if (me) showCombos(me.id);
  for (const id of ["combo-title", "combo", "combo-note"]) { const el = document.getElementById(id); if (el) el.style.display = me ? "" : "none"; }
  show(null);
  canvas.focus();
}

function showResult(r) {
  $("res-title").textContent = r.title;
  $("res-sub").textContent = `${r.stage ? r.stage + " · " : ""}Thời gian: ${r.seconds} giây`;
  $("res-rows").innerHTML = r.rows.map((x) => `<tr><td>${x.name}</td><td>${x.char}</td><td>${x.kills}</td><td>${x.attack}</td><td>${x.hpLost}</td><td>${x.mpUsed}</td><td>${x.picking}</td>
    <td class="${x.status === "Dead" ? "dead" : "win"}">${x.status}</td></tr>`).join("");
  show("ov-result");
  clearTimeout(app.autoTimer);
  $("btn-next").style.display = app.lastCfg && app.lastCfg.vsSetup ? "" : "none";
  $("res-auto").textContent = "";
  if (app.lastCfg && app.lastCfg.vsSetup && $("vs-auto").checked) {
    let n = 5;
    const tickDown = () => {
      if (!app.game || app.game.result !== r) return;
      if (n <= 0) { nextVs(); return; }
      $("res-auto").textContent = `Trận mới sau ${n} giây… (bấm "Đổi thiết lập" để dừng)`;
      n--; app.autoTimer = setTimeout(tickDown, 1000);
    };
    tickDown();
  }
}

function quitToSetup() {
  clearTimeout(app.autoTimer);
  app.game = null;
  music.pause(); music.dataset.url = "";
  if (app.mode === "vs") openVs(); else openSetup(app.mode);
}


// ---------------------------------------------------------------- VS: thiet lap nhanh de xem may danh nhau
const PRESETS = {
  "1v1": [1, 2], "2v2": [1, 1, 2, 2], "3v3": [1, 1, 1, 2, 2, 2], "4v4": [1, 1, 1, 1, 2, 2, 2, 2],
  ffa4: [0, 0, 0, 0], ffa8: [0, 0, 0, 0, 0, 0, 0, 0],
};
const TEAM_NAMES = ["Tự do", "Đội 1", "Đội 2", "Đội 3", "Đội 4"];
const vs = { fighters: [], preset: "1v1" };

function charPool() {
  return [...PLAYABLE, ...($("vs-hidden").checked ? HIDDEN : [])].filter((id) => env.dataCache[id]);
}
function randomChars(n) {
  const pool = charPool();
  const bag = [];
  while (bag.length < n) {
    const left = pool.filter((id) => !bag.includes(id));
    const from = left.length ? left : pool;
    bag.push(from[Math.floor(Math.random() * from.length)]);
  }
  return bag;
}
function applyPreset(name) {
  vs.preset = name;
  const teams = PRESETS[name];
  const chars = randomChars(teams.length);
  vs.fighters = teams.map((team, i) => ({ team, charId: chars[i] }));
  renderVs();
}
function rerollChars() {
  const chars = randomChars(vs.fighters.length);
  vs.fighters.forEach((f, i) => { f.charId = chars[i]; });
  renderVs();
}
function drawFace(cv, id) {
  const gg = cv.getContext("2d");
  gg.clearRect(0, 0, cv.width, cv.height);
  const img = env.dataCache[id] && env.dataCache[id].smallImg;
  if (img) gg.drawImage(img, 0, 0);
}
function renderVs() {
  for (const b of document.querySelectorAll("#ov-vs [data-preset]")) b.classList.toggle("on", b.dataset.preset === vs.preset);
  const join = $("vs-join").checked;
  // nhom theo doi: doi 1..4 thanh cot, "Tu do" moi nguoi mot cot
  const groups = [];
  for (const t of [1, 2, 3, 4]) {
    const idx = vs.fighters.map((f, i) => (f.team === t ? i : -1)).filter((i) => i >= 0);
    if (idx.length) groups.push({ title: TEAM_NAMES[t], idx });
  }
  vs.fighters.forEach((f, i) => { if (f.team === 0) groups.push({ title: "Tự do", idx: [i] }); });
  $("vs-teams").innerHTML = groups.map((gr) => `<div class="team"><h4>${gr.title}</h4>${gr.idx.map((i) => `
    <div class="card" data-i="${i}">
      <canvas width="40" height="45"></canvas>
      <div class="col">
        ${join && i === 0 ? `<span class="me">BẠN</span>` : ""}
        <select class="c">${charOptions(vs.fighters[i].charId)}</select>
        <select class="t">${TEAM_NAMES.map((n, k) => `<option value="${k}" ${k === vs.fighters[i].team ? "selected" : ""}>${n}</option>`).join("")}</select>
      </div>
      <button class="x" title="Bỏ">✕</button>
    </div>`).join("")}</div>`).join("");
  for (const card of document.querySelectorAll("#vs-teams .card")) {
    const i = +card.dataset.i;
    drawFace(card.querySelector("canvas"), vs.fighters[i].charId);
    card.querySelector(".c").onchange = (e) => { vs.fighters[i].charId = +e.target.value; vs.preset = ""; renderVs(); };
    card.querySelector(".t").onchange = (e) => { vs.fighters[i].team = +e.target.value; vs.preset = ""; renderVs(); };
    card.querySelector(".x").onclick = () => { if (vs.fighters.length > 2) { vs.fighters.splice(i, 1); vs.preset = ""; renderVs(); } };
  }
  $("vs-add").disabled = vs.fighters.length >= 8;
  $("vs-count").textContent = `${vs.fighters.length}/8 nhân vật`;
  if (join && vs.fighters[0]) showCombos(vs.fighters[0].charId);
  for (const id of ["combo-title", "combo", "combo-note"]) { const el = document.getElementById(id); if (el) el.style.display = join ? "" : "none"; }
}
function openVs() {
  app.mode = "vs";
  if (!vs.fighters.length) applyPreset("1v1"); else renderVs();
  show("ov-vs");
}
function vsConfig() {
  const join = $("vs-join").checked;
  const bgSel = $("vs-bg").value;
  const bg = bgSel === "rand" ? Math.floor(Math.random() * 9) : +bgSel;
  return {
    mode: "vs", vsSetup: true,
    players: vs.fighters.map((f, i) => (join && i === 0
      ? { kind: "human", layout: 0, charId: f.charId, team: f.team }
      : { kind: "com", charId: f.charId, team: f.team })),
    difficulty: +$("vs-diff").value, bg, startStage: 0,
  };
}
function startVs() {
  const teams = new Set(vs.fighters.map((f, i) => (f.team === 0 ? `free${i}` : f.team)));
  if (teams.size < 2) { $("status").textContent = "Cần ít nhất 2 phe (đổi đội hoặc chọn Tự do)."; return; }
  app.speed = +$("vs-speed").value;
  startGame(vsConfig());
}
function nextVs() {
  if ($("vs-reroll").checked) rerollChars();
  startVs();
}
$("vs-back").onclick = () => show("ov-menu");
$("vs-start").onclick = startVs;
$("vs-random").onclick = rerollChars;
$("vs-add").onclick = () => {
  if (vs.fighters.length >= 8) return;
  const used = vs.fighters.map((f) => f.charId);
  const left = charPool().filter((id) => !used.includes(id));
  const pool = left.length ? left : charPool();
  vs.fighters.push({ team: 0, charId: pool[Math.floor(Math.random() * pool.length)] });
  vs.preset = ""; renderVs();
};
$("vs-join").onchange = renderVs;
for (const b of document.querySelectorAll("#ov-vs [data-preset]")) b.onclick = () => applyPreset(b.dataset.preset);

$("btn-vs").onclick = openVs;
$("btn-stage").onclick = () => openSetup("stage");
$("btn-back").onclick = () => show("ov-menu");
$("btn-start").onclick = () => startGame(readSetup());
$("btn-again").onclick = () => { clearTimeout(app.autoTimer); startGame(app.lastCfg); };
$("btn-next").onclick = () => { clearTimeout(app.autoTimer); nextVs(); };
$("btn-setup").onclick = () => quitToSetup();
$("btn-menu").onclick = () => { clearTimeout(app.autoTimer); app.game = null; music.pause(); music.dataset.url = ""; show("ov-menu"); };

window.addEventListener("keydown", (e) => {
  const G = app.game;
  if (e.code === "F1") { e.preventDefault(); if (G) G.paused = !G.paused; }
  if (e.code === "F2") { e.preventDefault(); if (G) { G.paused = true; app.step = true; } }
  if (e.code === "F3") { e.preventDefault(); app.debug = !app.debug; }
  if (e.code === "F4") { e.preventDefault(); if (G && !G.result) quitToSetup(); }
  if (e.code === "KeyM" && !G) { sound.enabled = !sound.enabled; }
  if (G && !G.players.some((p) => p.isPlayer) && ["Digit1", "Digit2", "Digit3"].includes(e.code)) app.speed = { Digit1: 1, Digit2: 2, Digit3: 4 }[e.code];
  if (e.code === "F7" && G) { e.preventDefault(); for (const p of G.players) { p.hp = p.cap = p.hpMax; p.mp = 500; } }
});
window.addEventListener("pointerdown", () => sound.unlock());

// ---------------------------------------------------------------- vong lap
let last = performance.now();
let dirty = true;
function tick() {
  const G = app.game;
  if (!G) return;
  if (G.paused && !app.step) return;
  const wasPaused = G.paused;
  if (app.step) { G.paused = false; }
  G.step();
  if (app.step) { G.paused = wasPaused; app.step = false; }
  dirty = true;
}
function logicLoop() {
  const now = performance.now();
  if (now - last > 100) last = now - 100;
  while (now - last >= TICK_MS) {
    last += TICK_MS;
    const human = app.game && app.game.players.some((p) => p.isPlayer);
    const n = human ? 1 : app.speed;
    for (let i = 0; i < n && !(app.game && app.game.result); i++) tick();
  }
  setTimeout(logicLoop, Math.max(0, Math.min(5, last + TICK_MS - now)));
}
function renderLoop() {
  kb.active = !!(app.game && !app.game.result);
  if (app.game) { const me = app.game.players.find((p) => p.isPlayer); if (me && me.active) showCombos(me.id); }
  if (app.game && (dirty || app.game.paused)) {
    app.game.draw(g, { debug: app.debug });
    if (!app.game.players.some((p) => p.isPlayer)) {
      g.font = "bold 13px system-ui"; g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(600, 112, 190, 20);
      g.fillStyle = "#ffd34d"; g.fillText(`Đang xem · x${app.speed} (phím 1/2/3)`, 606, 127);
    }
    dirty = false;
  }
  else if (!app.game) { g.fillStyle = "#000"; g.fillRect(0, 0, SCREEN_W, SCREEN_H); }
  requestAnimationFrame(renderLoop);
}
// cho test tu dong
app.runTicks = (n) => { for (let i = 0; i < n; i++) { if (app.game) app.game.step(); } if (app.game) app.game.draw(g, { debug: app.debug }); };
app.start = startGame;
app.env = env;

boot().catch((e) => { $("load-text").textContent = "Lỗi: " + e.message; console.error(e); });
