// The gioi tran dau: 400 slot doi tuong, thu tu tick theo FUN_0041bc90 (04 muc 0):
//  1. input/AI -> controls (nhan vat), dan duoi (hit_Fa)       2. physics, xoa 9998, chet/hoi sinh
//  3. cam vu khi; va cham (thu thap) -> xu ly (nhan vat truoc) -> bat/giu -> cam vu khi -> kep bien + camera -> knockback
//  4. bien hinh, hoi HP/MP, advanceFrame, frame 1000/11xx, opoint, vu khi vo/nem/uong
//  5. bo hoi +e0/+e4, reset danh sach
import { Obj } from "./obj.js?v=3";
import { collect, resolve, applyKnockback, catching, dropWeapon } from "./combat.js?v=3";
import { LF2Random } from "../rng.js?v=3";

export const SCREEN_W = 794;
const MAX_SLOTS = 400;

export class World {
  constructor({ dataCache, bg, mode = "vs", difficulty = 1, sound = null, rng = null }) {
    this.dataCache = dataCache;      // id -> data (JSON + sheets)
    this.bg = bg;
    this.mode = mode;                // "vs" | "stage"
    this.difficulty = difficulty;    // 2 Easy, 1 Normal, 0 Difficult, -1 CRAZY
    this.soundSys = sound;
    this.rng = rng || new LF2Random();
    this.slots = new Array(MAX_SLOTS).fill(null);
    this.objects = [];
    this.tick = 0;
    this.cam = 0; this.camV = 0;
    this.bound = 0;                  // gioi han phai cua phase (stage)
    this.mpMode = true;              // DAT_0044d034
    this.cheat = false;
    this.sparks = [];
    this.randomDrops = mode === "vs";
    this.listeners = [];
  }

  rand(n) { return this.rng.rand(n); }

  playSound(path, x) {
    if (!this.soundSys || !path) return;
    // pan theo vi tri tren man hinh (02 muc 8): trai/phai quanh 200/600 px
    const sx = x - this.cam;
    const pan = Math.max(-1, Math.min(1, (sx - 397) / 400));
    this.soundSys.play(path, pan);
  }

  freeSlot(from, to = MAX_SLOTS) {
    for (let i = from; i < to; i++) if (!this.slots[i]) return i;
    return -1;
  }

  // Sinh doi tuong (FUN_00406a20 / FUN_004061d0)
  spawn(id, o = {}) {
    const data = this.dataCache[id];
    if (!data) return null;
    const slot = o.slot ?? this.freeSlot(data.type === 0 && o.player ? 0 : 50);
    if (slot < 0) return null;
    const ob = new Obj(this, data, slot, o);
    if (o.hp !== undefined) { ob.hp = ob.cap = ob.hpMax = o.hp; }
    if (o.mp !== undefined) ob.mp = o.mp;
    this.slots[slot] = ob;
    this.objects = this.slots.filter(Boolean);
    return ob;
  }

  remove(o) {
    if (!o) return;
    o.active = false;
    if (o.weapon) { o.weapon.hold = 0; o.weapon.holder = null; o.weapon = null; }
    if (o.holder) { o.holder.hold = 0; o.holder.weapon = null; o.holder = null; }
    if (o.catching) { o.catching.caughtBy = null; o.catching = null; }
    if (o.caughtBy) { o.caughtBy.catching = null; o.caughtBy = null; }
    if (this.slots[o.slot] === o) this.slots[o.slot] = null;
  }

  chars() { return this.objects.filter((o) => o.active && o.type === 0); }

  addSpark(x, sy, z, start) { this.sparks.push({ x, sy, z, c: start }); }

  // ================================================================ tick
  step(inputs) {
    this.tick++;
    const objs = this.objects;
    // 1. dieu khien
    for (const o of objs) {
      if (!o.active) continue;
      if (o.type === 0) {
        const keys = o.ai ? o.ai.think(this, o) : inputs(o);
        o.setInput(keys);
        if (o.freeze === 0 && !(o.caughtBy && o.fr().cpoint && o.fr().cpoint.kind === 2)) o.controls();
        const st = o.state;
        if ((st === 400 || st === 401) && this.tick % 2 === 0) this.teleport(o, st === 400 ? 1 : 2);
        if (st === 500 && (o.transformId === undefined || o.transformedFrom !== undefined)) o.frame = 0;
      } else {
        if (o.hold >= 0 && o.freeze === 0) o.applyFrameVelocity(o.fr() || {}, NO_INPUT);
        const f = o.fr();
        if (f && f.hit_Fa > 0) this.homing(o, f.hit_Fa);
      }
    }
    // 2. vat ly, xoa 9998, chet/hoi sinh
    for (const o of objs) {
      if (!o.active) continue;
      o.physics();
      if (o.state === 9998) { this.remove(o); continue; }
      this.deathCheck(o);
    }
    // 3. va cham va giu
    this.holdWeapons();
    collect(this);
    for (const o of this.objects) if (o.active && o.type === 0) resolve(this, o);
    if (this.randomDrops) this.maybeDropWeapon();
    for (const o of this.objects) if (o.active && o.type !== 0) resolve(this, o);
    for (const o of this.objects) if (o.active && o.catching) catching(this, o);
    this.holdWeapons();
    this.clampAll();
    this.updateCamera();
    for (const o of this.objects) if (o.active) applyKnockback(o);
    // 4. frame
    for (const o of this.objects) {
      if (!o.active) continue;
      const st = o.state;
      if (st === 9995 && this.dataCache[50]) { o.setData(this.dataCache[50]); }
      else if (st >= 8000 && st < 9000 && this.dataCache[st - 8000]) {
        o.setData(this.dataCache[st - 8000]); o.picOffset = 140;
        if (o.type === 0 && !o.ai && !o.isPlayer && this.makeAI) o.ai = this.makeAI(o);   // criminal hien hinh thanh quai
      }
      else if (st === 9996 && o.waitCnt === 1) this.armorPieces(o);
      else if (st === 501 && o.transformId >= 0 && this.dataCache[o.transformId]) {
        o.transformedFrom = o.id; o.setData(this.dataCache[o.transformId]);
      }
      o.regen(this.tick);
      o.advanceFrame();
      if (o.frame === 1000) { this.remove(o); continue; }
      if (o.frame >= 1100 && o.frame < 1300) {
        o.blink = 1100 - o.frame; o.frame = 0;
        for (const c of this.objects) if (c.owner === o) c.blink = o.blink;
      }
      if (o.frame > 399 || !o.fr()) { this.remove(o); continue; }
      this.spawnOpoint(o);
      if ([1, 2, 4, 6].includes(o.type) && o.weaponHp < 0 && o.hold <= 0 && o.type !== 6) this.breakWeapon(o);
      if (o.type === 0) this.weaponActions(o);
    }
    // 5. hoi, reset
    for (const o of this.objects) {
      if (!o.active) continue;
      o.healers();
      o.hitOnce = false;
    }
    // tia lua: bo dem tang 1/tick; het chuoi (5..9, 15..19, 29+, 39+) thi xoa [V 05 muc 2.4]
    this.sparks = this.sparks.filter((s) => { s.c++; return !((s.c >= 5 && s.c < 10) || (s.c >= 15 && s.c < 20) || (s.c >= 29 && s.c < 30) || s.c >= 39); });
    this.objects = this.slots.filter(Boolean);
    this.fusion();
  }

  // ---------------------------------------------------------------- vu khi
  holdWeapons() {
    for (const w of this.objects) {
      if (!w.active || w.hold >= 0) continue;
      const c = w.holder;
      if (!c || !c.active) { w.hold = 0; w.holder = null; continue; }
      const cf = c.fr();
      if (!cf) continue;
      const cst = cf.state;
      if (cst === 12 || cst === 10 || cst === 13 || cst === 18 || cst === 14) {   // nga/bi bat: tha vu khi [V]
        dropWeapon(this, c);
        continue;
      }
      const wp = cf.wpoint;
      if (!wp || !wp.weaponact) continue;
      w.frame = wp.weaponact;
      w.facing = c.facing;
      w.freeze = c.freeze;
      const wf = w.fr();
      if (!wf) continue;
      const wp2 = wf.wpoint || { x: wf.centerx, y: wf.centery };
      const hx = c.facing === 0 ? c.x - cf.centerx + wp.x : c.x + cf.centerx - wp.x;
      const hy = c.y - cf.centery + wp.y;
      w.x = c.facing === 0 ? hx + wf.centerx - wp2.x : hx - wf.centerx + wp2.x;
      w.y = hy + wf.centery - wp2.y;
      w.z = c.z;
      if (!wp.cover) { w.z += 1; w.y -= 1; } else { w.z -= 1; w.y += 1; }
      w.ix = Math.trunc(w.x); w.iy = Math.trunc(w.y); w.iz = Math.trunc(w.z);
      w.vx = c.vx; w.vy = c.vy; w.vz = c.vz;
    }
  }

  // nem / tha / uong (wpoint.dvx, wpoint.kind 3, state 17) [V 02 muc 5]
  weaponActions(c) {
    const w = c.weapon;
    if (!w || !w.active) return;
    const f = c.fr();
    const wp = f && f.wpoint;
    if (f && f.state === 17 && w.type === 6) {
      if (w.id === 122) {
        w.hp -= 1;
        if (w.hp % 5 === 0) { c.cap = Math.min(c.hpMax, c.cap + 2); c.hp = Math.min(c.cap, c.hp + 4); }
        if (w.hp % 6 === 0) c.mp = Math.min(500, c.mp + 5);
      } else {
        w.hp -= 2;
        c.mp = Math.min(c.owner ? 150 : 500, c.mp + 3);
      }
      if (w.hp < 1) {
        c.hold = 0; c.weapon = null; w.hold = 0; w.holder = null;
        w.frame = 0; w.vy = -8; w.vx = this.rand(7) - 3; w.y = Math.min(w.y, -1);
      }
      return;
    }
    if (!wp) return;
    if (wp.dvx) {
      c.hold = 0; c.weapon = null; w.hold = 0; w.holder = null;
      w.thrower = c;
      w.vx = (c.facing ? -1 : 1) * wp.dvx;
      w.vy = wp.dvy || 0;
      if (wp.dvz) { if (c.cur.up && !c.cur.down) w.vz = -wp.dvz; else if (c.cur.down && !c.cur.up) w.vz = wp.dvz; }
      w.frame = w.type === 2 ? this.rand(6) : 40;
      w.facing = c.facing;
      w.waitCnt = 0;
    } else if (wp.kind === 3) {
      c.hold = 0; c.weapon = null; w.hold = 0; w.holder = null;
      w.frame = this.rand(6); w.vx = this.rand(7) - 3; w.vy = -this.rand(4); w.vz = (this.rand(5) - 2) / 3;
    }
  }

  breakWeapon(w) {
    const n = { 101: 7, 218: 7, 100: 5, 213: 5, 217: 5, 201: 3, 150: 13, 151: 15, 120: 3, 124: 3, 121: 4, 122: 9, 123: 9 }[w.id] || 4;
    if (w.h.weapon_broken_sound) w.sound(w.h.weapon_broken_sound);
    for (let i = 0; i < n; i++) {
      const p = this.spawn(999, { x: w.x + this.rand(7) - 3, y: Math.min(w.y, -1), z: w.z + this.rand(7) - 3,
        vx: this.rand(11) - 5, vy: -(this.rand(4) / 2) - ([150, 151, 213].includes(w.id) ? 8 : 6), frame: 0, team: 0 });
      if (p) p.frame = this.rand(Math.max(1, Object.keys(p.data.frames).length)) ;
      if (p && !p.fr()) p.frame = 0;
    }
    this.remove(w);
  }

  armorPieces(o) {
    for (let i = 0; i < 5; i++) {
      const p = this.spawn(i < 4 ? 217 : 218, { x: o.x + this.rand(7) - 3, y: o.y - 8, z: o.z + this.rand(16) - 9,
        vx: this.rand(11) - 5, vy: -4 - this.rand(4), vz: this.rand(5) - 2, team: 0 });
      if (p) p.arest = 6;
    }
  }

  maybeDropWeapon() {
    // 41bc90:1804: < 4 vu khi va rand -> roi vu khi ngau nhien tu troi [V, xac suat [I]]
    if (this.tick % 30 !== 0) return;
    const n = this.objects.filter((o) => o.active && [1, 2, 4, 6].includes(o.type)).length;
    if (n >= 4 || this.rand(20) !== 0) return;
    const ids = [100, 101, 120, 121, 150, 151, 122, 123].filter((id) => this.dataCache[id]);
    const id = ids[this.rand(ids.length)];
    const [zmin, zmax] = this.bg.zboundary;
    const w = this.spawn(id, { x: this.cam + 100 + this.rand(SCREEN_W - 200), y: -300, z: zmin + this.rand(zmax - zmin), team: 0 });
    if (w && id === 122) w.hp = 200;
  }

  // ---------------------------------------------------------------- opoint [V 02 muc 6]
  spawnOpoint(a) {
    const f = a.fr();
    const op = f && f.opoint;
    if (!op || !(op.kind >= 1) || !(op.oid >= 1) || a.waitCnt !== 0 || a.freeze !== 0) return;
    if (a.lastOpoint === a.tickFrameKey()) return;
    a.lastOpoint = a.tickFrameKey();
    const data = this.dataCache[op.oid];
    if (!data) return;
    let N = 1, code = op.facing || 0;
    if (code > 10) { N = Math.floor(code / 10); code = code % 10; }
    const nfacing = code === 0 ? a.facing : code === 1 ? a.facing ^ 1 : 0;
    const x = a.facing === 0 ? a.x - f.centerx + op.x : a.x + f.centerx - op.x;
    const y = a.y - f.centery + op.y;
    const holderKeys = a.cur || NO_INPUT;
    for (let i = 0; i < N; i++) {
      const firstState = data.frames[op.action] ? data.frames[op.action].state : 0;
      let vz = 0;
      if ([3000, 1002, 3006].includes(firstState) && op.oid !== 223 && op.oid !== 224) {
        const k = op.oid === 211 ? 0.25 : 1;
        if (holderKeys.up && !holderKeys.down) vz = -2.5 * k;
        if (holderKeys.down && !holderKeys.up) vz = 2.5 * k;
      }
      if (N > 1) vz += i * 10 / (N - 1) - 5;
      const n = this.spawn(op.oid, {
        x, y, z: a.z + 1, frame: op.action || 0, facing: nfacing, team: a.team,
        vx: (nfacing ? -1 : 1) * (op.dvx || 0), vy: op.dvy || 0, vz,
        owner: data.type === 0 ? (a.owner || a) : null, scoreOwner: a.scoreOwner, blink: data.type === 0 ? a.blink : 0,
      });
      if (!n) continue;
      n.parent = a;
      if (data.type === 0 && (op.oid === 5 || op.oid === 52)) { n.hp = n.cap = n.hpMax = 10; n.mp = 5; }
      if (data.type === 0) { n.ai = a.ai ? a.ai.clone() : this.makeAI ? this.makeAI(n) : null; }
      if (firstState === 3003 || n.state === 3003) { n.vrest.set(a.slot, 10); a.vrest.set(n.slot, 10); }
      if (op.kind === 2 && a.hold === 0) { a.hold = 1; n.hold = -1; a.weapon = n; n.holder = a; }
    }
  }

  // ---------------------------------------------------------------- dan duoi (FUN_00406ba0) [V 03d muc 7]
  homing(o, N) {
    if (N === 7 && o.fr().hit_Fa === 7 && o.state !== 3000) return;
    if ([8, 13].includes(N) && !o.spawnedSwarm) {
      o.spawnedSwarm = true;
      const id = N === 8 ? 225 : 228;
      const count = N === 8 ? 5 : 4;
      for (let i = 0; i < count; i++) {
        const t = this.pickEnemy(o, true);
        const s = this.spawn(id, { x: o.x, y: o.y, z: o.z, vx: this.rand(23) - 11, vy: 3 - 0.25 * this.rand(12), vz: 3 - 0.25 * this.rand(24),
          team: o.team, scoreOwner: o.scoreOwner, facing: o.facing });
        if (s) s.homingTarget = t;
      }
      return;
    }
    if (N === 11) {
      // firzen_chasef: sinh 14 doi tuong roi tu xoa [V 03d muc 7; vi tri chi tiet [I]]
      const base = { team: o.team, scoreOwner: o.scoreOwner, facing: o.facing };
      this.spawn(211, { ...base, x: o.x, y: o.y, z: o.z, frame: 109 });
      this.spawn(221, { ...base, x: o.x, y: o.y - 100, z: o.z, frame: 81 });
      for (let i = 0; i < 6; i++) {
        const dx = (i % 2 ? 1 : -1) * (i < 2 ? 80 : 100 + 20 * (i >> 1));
        this.spawn(212, { ...base, x: o.x + dx, y: 0, z: o.z + (i < 3 ? -7 : 7) * (i % 3), frame: 100 });
        this.spawn(211, { ...base, x: o.x + (i % 2 ? 30 : -30) * (1 + (i >> 1)), y: o.y, z: o.z, frame: 50 });
      }
      this.remove(o);
      return;
    }
    if (N === 5 || N === 6 || N === 9) {
      if (!o.spawnedSwarm) {
        o.spawnedSwarm = true;
        if (N === 5) {
          for (const c of this.chars()) if (c.team === o.team && c !== o.parent && c.hp > 0) {
            const s = this.spawn(219, { x: o.x, y: o.y, z: o.z, vx: (c.x - o.x) / 50, team: o.team, scoreOwner: o.scoreOwner });
            if (s) s.homingTarget = c;
          }
        } else {
          const id = N === 6 ? 220 : 221;
          const max = N === 6 ? 7 : 10;
          for (let i = 0; i < max; i++) {
            const t = this.pickEnemy(o, true);
            if (!t) break;
            const s = this.spawn(id + (N === 9 ? this.rand(2) : 0), { x: o.x + this.rand(41) - 20, y: o.y, z: o.z, vx: this.rand(9) - 4, vy: -2 - this.rand(4),
              team: o.team, scoreOwner: o.scoreOwner, facing: o.facing });
            if (s) s.homingTarget = t;
          }
        }
      }
      return;
    }
    let T = o.homingTarget;
    if (N === 4 && T) { /* jan_chaseh: muc tieu la dong doi */ }
    else if (!T || !T.active || T.hp <= 0 || T.state === 14) { T = this.pickEnemy(o, false); o.homingTarget = T; }
    if (!T) { if (N !== 3 && N !== 10) o.hp = 0; return; }
    const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
    const dx = T.x - o.x, dz = T.z - o.z;
    if (N === 1) {
      o.vx += 0.85 * sgn(dx); if (Math.abs(dz) > 7) o.vz += 0.3 * sgn(dz); o.vy /= 1.4;
      const ty = T.y - 10;
      o.y += o.y < ty ? 1.2 : -1.2;
      o.vx = Math.max(-13, Math.min(13, o.vx)); o.vz = Math.max(-2, Math.min(2, o.vz)); if (o.y > 1) o.y = 1;
      o.facing = o.vx > 0 ? 0 : 1;
    } else if (N === 3) {
      o.vx += 0.7 * sgn(dx); if (Math.abs(dz) > 10) o.vz += 0.17 * sgn(dz);
      o.vx = Math.max(-16, Math.min(16, o.vx)); o.vz = Math.max(-2.4, Math.min(2.4, o.vz));
    } else if (N === 10) {
      o.vx += 1.1 * sgn(o.vx || (o.facing ? -1 : 1)); o.vx = Math.max(-30, Math.min(30, o.vx)); if (o.y > 3) o.y = 3;
    } else {
      o.vx += 0.7 * sgn(dx); if (Math.abs(dz) > 5) o.vz += 0.4 * sgn(dz); o.vy /= 1.4;
      const ty = T.y - 40;
      o.y += o.y < ty ? 1 : -1;
      const vzMax = N === 14 ? 1.5 : 2.2;
      o.vx = Math.max(-14, Math.min(14, o.vx)); o.vz = Math.max(-vzMax, Math.min(vzMax, o.vz)); if (o.y > 1.4) o.y = 1.4;
      o.facing = o.vx > 0 ? 0 : 1;
      if (N === 2) {
        const ax = Math.abs(o.vx), alt = this.tick % 2;
        o.frame = ax > 14 ? 5 + alt : ax > 7 ? 3 + alt : 1 + alt;
      }
      if (N === 4 && Math.abs(dx) < 30 && o.y > T.y - 80 && o.y < T.y && Math.abs(dz) < 10) {
        o.vx = o.vy = o.vz = 0; o.frame = 60; T.heal2 = 100;
      }
      if (N === 7) {
        o.vy = Math.min(4, o.vy + 0.4); o.y += o.vy;
        if (o.y > -25) { o.frame = 60; o.vx = o.vy = o.vz = 0; }
      }
    }
  }

  pickEnemy(o, random) {
    const teamOwner = o.scoreOwner ? o.scoreOwner.team : o.team;
    const list = this.chars().filter((c) => c.team !== o.team && c.team !== teamOwner && c.hp > 0 && c.state !== 14 && Math.abs(c.blink) < 3);
    if (!list.length) return null;
    if (random) return list[this.rand(list.length)];
    let best = null, bd = Infinity;
    for (const c of list) { const d = Math.abs(c.x - o.x) + Math.abs(c.z - o.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  // ---------------------------------------------------------------- Woody dich chuyen (FUN_00403270) [V]
  teleport(o, mode) {
    let target = null;
    const list = this.chars().filter((c) => c !== o && c.hp > 0);
    if (mode === 1) {
      let bd = Infinity;
      for (const c of list) if (c.team !== o.team || o.team === 0) { const d = Math.abs(c.x - o.x) + Math.abs(c.z - o.z); if (d < bd) { bd = d; target = c; } }
      if (target) { o.z = target.z + 1; o.x = target.x + (o.facing === 0 ? -120 : 120); }
    } else {
      let bd = -1;
      for (const c of list) if (c.team === o.team && o.team !== 0) { const d = Math.abs(c.x - o.x) + Math.abs(c.z - o.z); if (d > bd) { bd = d; target = c; } }
      if (target) { o.z = target.z + 1; o.x = target.x + (o.facing === 0 ? -60 : 60); }
    }
    o.y = 0; o.vx = o.vy = o.vz = 0;
  }

  // ---------------------------------------------------------------- Firzen hop the (FUN_004064d0) [V 06]
  fusion() {
    const firens = this.chars().filter((c) => c.id === 7 && c.hp > 0 && c.hp < 177 && c.slot < 10 && c.state === 2);
    for (const f of firens) {
      const z = this.chars().find((c) => c.id === 8 && c.team === f.team && c.hp > 0 && c.hp < 177 && c.slot < 10 && c.state === 2 &&
        Math.abs(c.x - f.x) < 50 && Math.abs(c.z - f.z) < 8);
      if (!z || !this.dataCache[51]) continue;
      const hp = Math.max(f.hp, z.hp);
      f.fusion = { partner: z, partnerData: z.data, selfData: f.data, timer: 4500 };
      z.hidden = true; this.remove(z); z.active = false;
      f.setData(this.dataCache[51]); f.hp = f.cap = hp + 100; f.mp = 500;
    }
    for (const f of this.chars()) {
      if (!f.fusion) continue;
      f.fusion.timer--;
      if (f.fusion.timer <= 0 || f.fusion.split) {
        const z = f.fusion.partner;
        f.setData(f.fusion.selfData);
        const slot = this.freeSlot(0, 10);
        if (slot >= 0) {
          z.active = true; z.slot = slot; z.x = f.x + 30; z.z = f.z; z.y = 0; z.frame = 0; z.hp = Math.max(1, Math.floor(f.hp / 2));
          this.slots[slot] = z; this.objects = this.slots.filter(Boolean);
        }
        f.hp = Math.max(1, Math.floor(f.hp / 2));
        f.fusion = null;
      }
    }
  }

  // ---------------------------------------------------------------- chet / hoi sinh [V 04 muc 2.3]
  deathCheck(o) {
    if (o.type !== 0 || o.hp >= 1) return;
    if (o.state !== 14) return;
    const npc = o.owner || o.team === 5 || o.slot > 19;
    if (!npc || !(o.blink > 0 && o.blink < 5)) return;
    if (o.join < 1) {
      if (o.lives < 2) { this.remove(o); return; }
      o.lives--;
      const mates = this.chars().filter((c) => c !== o && c.team === o.team);
      if (mates.length) {
        o.x = mates.reduce((s, c) => s + c.x, 0) / mates.length + this.rand(52) - 26;
        o.z = mates.reduce((s, c) => s + c.z, 0) / mates.length + this.rand(32) - 16;
      }
      o.mp = 500; o.cap = o.hpMax; o.hp = o.cap; o.blink = 20; o.frame = 212; o.y = -300; o.vy = 0;
    } else {
      o.lives = o.joinReserve; o.mp = 0; o.hpMax = o.cap = o.hp = o.join; o.join = 0; o.joinReserve = 0;
      o.team = 1; if (o.id >= 30 && o.id <= 36) o.picOffset = 140;
      o.frame = 219; o.waitCnt = 0; o.freeze = 10;
      this.spawn(998, { x: o.x, y: o.y, z: o.z + 1, frame: 6, team: 1 });
      if (this.onJoin) this.onJoin(o);
    }
  }

  // ---------------------------------------------------------------- kep bien (FUN_0041b5d0) [V 04 muc 3]
  clampAll() {
    const W = this.bg.width;
    const [zmin, zmax] = this.bg.zboundary;
    for (const o of this.objects) {
      if (!o.active || o.hold < 0) continue;
      if (o.type === 0) o.z = Math.max(zmin, Math.min(zmax, o.z));
      else o.z = Math.max(zmin - 1, Math.min(zmax + 1, o.z));
      o.iz = Math.trunc(o.z);
      if (o.type === 3) { if (o.x < -300 || o.x > W + 300) { this.remove(o); continue; } }
      else if (o.type === 0) {
        if (o.slot < 20) { o.x = Math.max(o.x, o.team === 5 ? -300 : 0); o.x = Math.min(o.x, W); }
        else { o.x = Math.max(o.x, -100); o.x = Math.min(o.x, W + 100); }
        if (this.bound > 0 && o.x > this.bound && o.team !== 5 && o.blink === 0) o.x = this.bound;
      } else {
        if ((o.id === 122 || o.id === 123) && this.mode === "stage") o.x = Math.max(10, Math.min(W - 10, o.x));
        else if ((o.x < 0 || o.x > W) && o.iy === 0) { this.remove(o); continue; }
      }
      o.ix = Math.trunc(o.x);
    }
  }

  updateCamera() {
    const W = this.bg.width;
    const players = this.chars().filter((c) => c.isPlayer && c.hp > 0);
    const list = players.length ? players : this.chars().filter((c) => c.hp > 0);
    if (!list.length) return;
    const avg = list.reduce((s, o) => s + (o.state === 14 ? o.ix : o.ix + 130 - 260 * o.facing), 0) / list.length;
    let target = Math.max(0, Math.trunc(avg) - 397);
    target = Math.min(target, Math.max(0, W - SCREEN_W));
    if (this.bound > 0) target = Math.min(target, Math.max(0, this.bound - SCREEN_W));
    let v = Math.trunc((Math.trunc((target - this.cam) / 14) + 6 * this.camV) / 7);
    if (v === 0 && target !== this.cam) v = Math.sign(target - this.cam);
    this.camV = v;
    this.cam = Math.max(0, Math.min(Math.max(0, W - SCREEN_W), this.cam + v));
  }
}

const NO_INPUT = Object.freeze({ up: false, down: false, left: false, right: false, attack: false, jump: false, defend: false });

// khoa nhan dien "lan vao frame" cho opoint (tranh sinh lap trong cung tick)
Obj.prototype.tickFrameKey = function () { return `${this.world.tick}:${this.frame}`; };
