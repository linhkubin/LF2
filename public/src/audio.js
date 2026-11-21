// Phat am thanh hieu ung theo truong `sound:` cua frame (Web Audio).
export class Sound {
  constructor() {
    this.ctx = null;
    this.cache = new Map();
    this.enabled = true;
    this.volume = 0.6;
  }
  unlock() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  load(path) {
    const url = "assets/sound/" + path.replace(/\\/g, "/");
    if (!this.cache.has(url)) {
      this.cache.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).catch(() => null));
    }
    return this.cache.get(url);
  }
  // pan: -1..1 (lf2.exe: pan = (a-b)*15 theo vi tri tren man hinh; o day dung x tuong doi)
  async play(path, pan = 0) {
    if (!this.enabled || !path || !this.ctx) return;
    const buf = await this.load(path);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = this.volume;
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); src.connect(g).connect(p).connect(this.ctx.destination); }
    else src.connect(g).connect(this.ctx.destination);
    src.start();
  }
}
