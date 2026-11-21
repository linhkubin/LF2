// Mot tran dau (VS hoac Stage): tao World, nguoi choi/may, luat ket thuc, ve.
import { World, SCREEN_W } from "./sim/world.js?v=3";
import { StageDirector } from "./sim/stage.js?v=3";
import { drawWorld, drawHud, drawText, drawDebug, SCREEN_H } from "./render.js?v=3";
import { picCell } from "./assets.js?v=3";

const NAME_COLORS = [1, 2, 3, 4, 5, 1, 2, 3];

export class Game {
  // cfg: { mode, players:[{kind:'human'|'com', layout, charId, team}], bg, difficulty, startStage }
  constructor(cfg, env) {
    this.cfg = cfg;
    this.env = env;           // { dataCache, backgrounds(index->bg), stages, controllers, sound, ui, makeAI, music }
    const bgIndex = cfg.mode === "stage" ? Math.floor(cfg.startStage / 10) + 1 : cfg.bg;
    this.world = new World({ dataCache: env.dataCache, bg: env.backgrounds[bgIndex], mode: cfg.mode, difficulty: cfg.difficulty, sound: env.sound });
    this.world.makeAI = (o) => env.makeAI ? env.makeAI(this.world, o) : null;
    this.world.onMusic = (m) => env.music && env.music(m);
    this.players = [];
    this.endTimer = 0;
    this.result = null;
    this.paused = false;
    this.spawnPlayers();
    if (cfg.mode === "stage") {
      this.stage = new StageDirector(this.world, env.stages, cfg.startStage, this.players.length);
    } else if (env.music) env.music("bgm\\main.wma");
  }

  spawnPlayers() {
    const w = this.world;
    const W = w.bg.width;
    const [zmin, zmax] = w.bg.zboundary;
    let human = 0, com = 0;
    this.cfg.players.forEach((p, i) => {
      if (!p || p.kind === "none") return;
      const slot = p.kind === "human" ? human++ : 10 + com++;
      const x = this.cfg.mode === "stage" ? 50 + w.rand(30) : w.rand(Math.trunc(W / 2)) + Math.trunc(W / 4);
      let team = this.cfg.mode === "stage" ? 1 : (p.team || 0);
      if (team === 0) team = 10 + slot;
      const o = w.spawn(p.charId, { slot, x, z: zmin + w.rand(zmax - zmin), team, blink: this.cfg.mode === "vs" ? 75 : 20 });
      if (!o) return;
      o.mp = this.cfg.mode === "vs" ? 200 : 500;
      o.isPlayer = p.kind === "human";
      o.controller = p.kind === "human" ? this.env.controllers[p.layout] : null;
      if (p.kind === "com") o.ai = w.makeAI(o);
      o.name = p.kind === "human" ? "P1" : o.h.name;
      o.nameColor = NAME_COLORS[i % NAME_COLORS.length];
      o.smallImg = o.data.smallImg;
      o.cfgIndex = i;
      this.players.push(o);
    });
  }

  step() {
    if (this.paused || this.result) return;
    const w = this.world;
    w.step((o) => (o.controller ? o.controller.read() : null));
    // nguoi choi bi xoa (vd Firzen hop the) van giu tren HUD qua this.players
    if (this.stage) {
      const r = this.stage.tick();
      if (r === "stage") { /* sang man moi: doi nen */
        const bgIndex = Math.floor(this.stage.stageId / 10) + 1;
        if (this.env.backgrounds[bgIndex] && w.bg !== this.env.backgrounds[bgIndex]) w.bg = this.env.backgrounds[bgIndex];
      }
      if (r === "win" || r === "lose") this.finish(r === "win" ? "Stage clear!" : "Game over");
      return;
    }
    // VS: con < 2 doi co nguoi song => ket thuc sau 80 tick (+ cho them de xem)
    const teams = new Set(w.chars().filter((c) => c.hp > 0 && c.slot < 20 && c.team > 0 && c.team < 40 && c.team !== 5).map((c) => c.team));
    if (teams.size < 2) {
      this.endTimer++;
      if (this.endTimer === 1) this.winnerTeam = teams.size ? [...teams][0] : -1;
      if (this.endTimer > 120) this.finish(this.winnerTeam > 0 ? "Thắng" : "Hòa");
    } else this.endTimer = 0;
  }

  finish(title) {
    const rows = this.players.map((o) => ({
      name: o.name, char: o.h.name, team: o.team, kills: o.stats.kills, attack: o.stats.attack,
      hpLost: o.stats.hpLost, mpUsed: o.stats.mpUsed, picking: o.stats.picking,
      status: o.hp > 0 ? (this.winnerTeam === undefined || this.winnerTeam === o.team || this.cfg.mode === "stage" ? "Win" : "Alive") : "Dead",
    }));
    this.result = { title, rows, seconds: Math.trunc((this.world.tick + 15) / 30), stage: this.stage ? this.stage.label : null };
    if (this.onFinish) this.onFinish(this.result);
  }

  draw(g, opts) {
    const w = this.world, ui = this.env.ui;
    g.fillStyle = "#000"; g.fillRect(0, 0, SCREEN_W, SCREEN_H);
    drawWorld(g, w, ui, { names: true, debug: opts.debug });
    drawHud(g, ui, this.players, w.tick);
    if (this.stage) this.stage.draw(g, ui, drawText, (gg, x, y) => this.drawGo(gg, x, y));
    else drawText(g, ui, `${Math.trunc((w.tick + 15) / 30)}`, 380, 112, 0);
    if (this.endTimer > 0 && !this.stage) drawText(g, ui, this.winnerTeam > 0 ? "WIN!" : "DRAW", 380, 260, 1);
    if (this.paused && ui.PAUSE) g.drawImage(ui.PAUSE, 360, 288);
    if (opts.debug && this.players[0]) drawDebug(g, this.players[0], w.cam, [`tick ${w.tick} cam ${w.cam} objs ${w.objects.length} bound ${w.bound}`]);
  }

  drawGo(g, x, y) {
    const etc = this.env.dataCache[998];
    const f = etc && etc.frames["24"];
    const cell = f && picCell(etc, f.pic);
    if (!cell) { drawText(g, this.env.ui, "GO ->", x, y, 1); return; }
    g.drawImage(cell.sheet.img, cell.sx, cell.sy, cell.w, cell.h, x, y, cell.w, cell.h);
  }
}
