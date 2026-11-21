// Stage mode theo FUN_00437860 (03c muc 4) va FUN_00437400 (spawn quai).
// stage index = (chapter-1)*10 + (man-1); nen = floor(stage/10)+1 (bao cao 05).
const HEROES = [1, 2, 4, 5, 6, 11, 9, 10, 8, 7];

export class StageDirector {
  constructor(world, stages, startStage, nPlayers) {
    this.world = world;
    world.stageDirector = this;   // AI doc .cleared / .goTimer
    this.stages = new Map(stages.map((s) => [s.id, s]));
    this.n = Math.max(1, nPlayers);
    this.heroBag = []; this.heroIdx = -1;
    this.loadStage(startStage, true);
  }

  loadStage(id, first) {
    this.stageId = id;
    this.S = this.stages.get(id);
    this.phase = -1;
    this.cleared = false;
    this.lastPhase = false;
    this.lastBound = 0;
    this.goTimer = 0;
    this.titleTimer = 70;
    this.endState = 0;       // 0 dang choi, 1 thang, 2 thua, 3 dang chuyen man
    this.endTimer = 0;
    this.curtain = 0;
    this.entries = [];
    if (id % 10 === 0) this.heroIdx = -1;
    if (!first) {
      const w = this.world;
      const [zmin, zmax] = w.bg.zboundary;
      for (const p of w.chars().filter((c) => c.isPlayer || (c.team !== 5 && c.slot < 20))) {
        if (p.hp > 0) {
          p.cap = Math.min(p.hpMax, p.cap + (w.difficulty + 2) * 50);
          p.hp = p.cap; p.mp = 500;
        }
        p.x = 50 + w.rand(30); p.z = zmin + w.rand(zmax - zmin); p.y = 0; p.vx = p.vy = p.vz = 0;
        if (p.frame >= 9 && p.frame <= 11) p.frame = 0;
        if (p.frame >= 16 && p.frame <= 18) p.frame = 12;
      }
      // xoa quai/vat con lai
      for (const o of [...w.objects]) if (!(o.type === 0 && (o.isPlayer || (o.team !== 5 && o.slot < 20))) && !(o.hold < 0 && o.holder && o.holder.isPlayer)) w.remove(o);
      w.objects = w.slots.filter(Boolean);
      w.cam = 0; w.camV = 0;
    }
    this.world.bound = 0;
  }

  get label() { return this.stageId >= 50 ? "SURVIVAL" : `STAGE ${Math.floor(this.stageId / 10) + 1}-${this.stageId % 10 + 1}`; }

  nextHero() {
    const w = this.world;
    if (this.heroIdx === -1 || this.heroIdx >= 10) {
      this.heroBag = [...HEROES];
      for (let i = 0; i < 50; i++) { const a = w.rand(10), b = w.rand(10); [this.heroBag[a], this.heroBag[b]] = [this.heroBag[b], this.heroBag[a]]; }
      this.heroIdx = 0;
    }
    return this.heroBag[this.heroIdx++];
  }

  // FUN_00437400 [V 03c muc 3]
  spawnEntry(e, k) {
    const w = this.world;
    let id = e.id;
    let hp = e.hp;
    if (w.difficulty === -1 && id !== 300) hp = Math.trunc(hp * 1.5);
    else if (w.difficulty === 2 && id !== 300) hp = Math.trunc(hp * 0.75);
    if (id === 1000) id = this.nextHero();
    else if (id === 3000) id = 30 + w.rand(2);
    else if (id === 3001) { if (w.rand(7) === 0) { id = 32; hp *= 4; } else id = 30 + w.rand(2); }
    const data = w.dataCache[id];
    if (!data) { e.slotObj[k] = null; return; }
    const [zmin, zmax] = w.bg.zboundary;
    const bound = this.phaseBound;
    let x = e.x === -1000 ? (w.rand(2) === 0 ? bound + 150 + w.rand(300) : -150 - w.rand(300)) : e.x + w.rand(300);
    const isChar = data.type === 0 || data.type === 5;
    const slot = w.freeSlot(20);
    if (slot < 0) { e.slotObj[k] = null; return; }
    const o = w.spawn(id, {
      slot, x, z: zmin + w.rand(Math.max(1, zmax - zmin)),
      y: isChar ? e.y : -300, team: isChar ? 5 : 0, frame: isChar ? e.act : 0, blink: isChar ? 20 : 0,
    });
    if (!o) { e.slotObj[k] = null; return; }
    o.hp = o.cap = o.hpMax = hp; o.mp = 500;
    if (id === 122) o.hp = 200;
    if (isChar) {
      o.facing = bound - 794 < x ? 1 : 0;
      o.lives = e.reserve; o.joinReserve = e.joinReserve; o.join = e.join;
      if (data.type === 0 && w.makeAI) o.ai = w.makeAI(o);
      o.name = "";
    }
    e.slotObj[k] = o;
    e.spawned++;
  }

  get phaseBound() { return this.phase >= 0 ? this.S.phases[this.phase].bound : 0; }

  players() { return this.world.chars().filter((c) => c.team !== 5 && c.team > 0 && c.team < 40 && c.slot < 20); }

  tick() {
    const w = this.world;
    if (this.titleTimer > 0) this.titleTimer--;
    if (this.endState === 3) {                              // man dong: chuyen stage
      this.curtain++;
      if (this.curtain >= 21) { this.loadStage(this.nextStageId, false); return "stage"; }
      return null;
    }
    if (this.endState === 1 || this.endState === 2) { this.endTimer++; return this.endTimer > 120 ? (this.endState === 1 ? "win" : "lose") : null; }
    const S = this.S;
    const count = S.phases.length;
    if ((this.phase < count - 1 || (this.phase >= 0 && S.phases[this.phase].whenClearGotoPhase !== -1)) && (this.phase === -1 || this.cleared) && !this.lastPhase) {
      this.cleared = false;
      const cur = this.phase >= 0 ? S.phases[this.phase] : null;
      this.phase = !cur || cur.whenClearGotoPhase === -1 ? this.phase + 1 : cur.whenClearGotoPhase;
      const P = S.phases[this.phase];
      if (P.music && w.onMusic) w.onMusic(P.music);
      w.bound = P.bound;
      this.entries = P.spawns.map((e) => {
        const ent = { ...e, spawned: 0, total: 0, slotsN: 0, slotObj: [] };
        if (e.ratio <= 0) { ent.total = e.times; ent.slotsN = 1; }
        else { ent.total = Math.trunc(e.times * this.n * e.ratio); ent.slotsN = Math.min(40, Math.trunc(this.n * e.ratio)); }
        for (let k = 0; k < ent.slotsN; k++) this.spawnEntry(ent, k);
        return ent;
      });
    }
    // duy tri quota
    let cleared = true, hasBoss = false;
    for (const e of this.entries) {
      if (e.kind === "boss") for (const o of e.slotObj) if (o && o.active && o.team === 5 && o.type === 0 && o.hp > 0) hasBoss = true;
    }
    // slotObj[k]: Obj (dang song hoac da chet), null (sinh that bai), "done" (da thu hoi)
    for (let pass = 0; pass < 2; pass++) {
      for (const e of this.entries) {
        for (let k = 0; k < e.slotsN; k++) {
          const o = e.slotObj[k];
          if (o === "done" || (o && o.active)) continue;
          if (pass === 0) {
            if ((e.kind === "soldier" && !hasBoss) || e.total <= e.spawned) { e.slotObj[k] = "done"; e.spawned = e.total; }
          } else if (e.spawned < e.total) { this.spawnEntry(e, k); cleared = false; }
        }
      }
    }
    for (const o of w.objects) if (o.active && o.slot >= 20 && o.type === 0 && o.team === 5) { cleared = false; break; }
    this.cleared = cleared;
    if (cleared && this.goTimer === 0 && !this.lastPhase) {
      this.goTimer = 169;
      if (this.phase === count - 1) { this.lastPhase = true; this.lastBound = w.bound; w.bound = 0; }
    }
    if (this.goTimer > 0) this.goTimer--;
    // het phase cuoi: moi nguoi choi con song toi bound => sang stage ke / thang
    const alive = this.players().filter((c) => c.hp > 0);
    if (this.lastPhase && alive.length) {
      const nextId = this.stages.has(this.stageId + 1) ? this.stageId + 1
        : (Math.floor(this.stageId / 10) < 4 && this.stageId < 50 && this.stages.has((Math.floor(this.stageId / 10) + 1) * 10)) ? (Math.floor(this.stageId / 10) + 1) * 10 : -1;
      if (nextId < 0) { this.endState = 1; this.endTimer = 0; return null; }
      if (alive.every((c) => c.x >= this.lastBound - 5)) { this.nextStageId = nextId; this.endState = 3; this.curtain = 0; }
    }
    if (!alive.length) {
      this.loseTimer = (this.loseTimer || 0) + 1;
      if (this.loseTimer >= 80) { this.endState = 2; this.endTimer = 0; }
    } else this.loseTimer = 0;
    return null;
  }

  // HUD Stage: "Man/HP" hai phe, "STAGE n-m", mui ten GO, man den
  draw(g, ui, drawText, goImg) {
    const w = this.world;
    const ply = this.players().filter((c) => c.hp > 0);
    const foe = w.chars().filter((c) => c.team === 5 && c.hp > 0);
    const reserve = this.players().reduce((s, c) => s + Math.max(0, c.lives - 1), 0);
    drawText(g, ui, `Man: ${String(ply.length).padStart(3)}   HP: ${String(ply.reduce((s, c) => s + c.hp, 0)).padStart(4)}` + (reserve > 0 ? `   Reserve: ${reserve}` : ""), 10, 110, 3);
    drawText(g, ui, `Man: ${String(foe.length).padStart(3)}   HP: ${String(foe.reduce((s, c) => s + c.hp, 0)).padStart(4)}`, 520, 110, 4);
    if (this.titleTimer > 0) drawText(g, ui, this.label, 360, 140, 0);
    if (this.goTimer > 0 && Math.floor(this.goTimer / 10) % 2 === 0 && goImg) goImg(g, 660, 299);
    if (this.endState === 3) {
      g.fillStyle = "#000";
      const n = Math.min(10, this.curtain);
      for (let i = 0; i < 10; i++) g.fillRect(0, 135 + i * 43, 794, Math.ceil(n * 43 / 10));
    }
  }
}
