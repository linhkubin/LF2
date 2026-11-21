// Doi tuong LF2 dung chung cho moi type (0 nhan vat, 1 vu khi nhe, 2 nang, 3 dan, 4 bong chay, 5 khac, 6 do uong).
// Bam theo lf2.exe:
//   controls()     ~ FUN_00413080 (chi type 0)
//   physics()      ~ FUN_0040e490
//   advanceFrame() ~ FUN_0040d960
// Offset/so lieu: analysis/engine_notes 01, 02, 04.
import { KEYS } from "../input.js?v=3";

export const GRAVITY = 1.7;
const KEY_BUFFER = 5;

// Bang am thanh co dinh cua engine (02 muc 8) [V]
export const ENGINE_SOUNDS = ["001", "002", "006", "010", "011", "004", "016", "017", "020", "021",
  "025", "032", "033", "039", "065", "066", "068", "085"].map((n) => `data/${n}.wav`);

const sign0 = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const shrink = (v, d) => (v > 0 ? Math.max(0, v - d) : Math.min(0, v + d));
const NO_KEYS = Object.freeze(Object.fromEntries(KEYS.map((k) => [k, false])));

export class Obj {
  constructor(world, data, slot, o = {}) {
    this.world = world;
    this.data = data;
    this.slot = slot;
    this.active = true;
    this.x = o.x ?? 0; this.y = o.y ?? 0; this.z = o.z ?? 0;
    this.ix = Math.trunc(this.x); this.iy = Math.trunc(this.y); this.iz = Math.trunc(this.z);
    this.vx = o.vx ?? 0; this.vy = o.vy ?? 0; this.vz = o.vz ?? 0;
    this.acc = { x: 0, y: 0, z: 0 }; this.hits = 0;      // +0x28..+0x38 knockback tich luy, +0x20
    this.frame = o.frame ?? 0; this.prevFrame = -1; this.hitFrame = this.frame;
    this.facing = o.facing ?? 0;
    this.team = o.team ?? 0;
    this.waitCnt = 0; this.walkCnt = 0; this.tap = 0;
    this.freeze = 0;          // +0xb4 hitstop (+ = ke danh, - = nan nhan)
    this.blink = o.blink ?? 0;// +0x08
    this.fall = 0;            // +0xb0
    this.defbar = 0;          // +0xb8
    this.arest = 0;           // +0xec
    this.vrest = new Map();   // +0xf0[slot]
    this.superPunch = 0;      // +0xea
    this.hitOnce = false;     // +0xeb
    this.heal = 0; this.heal2 = 0; // +0xe0, +0xe4
    this.fallDmg = 0;         // +0x320 (>0 sat thuong khi cham dat sau khi bi nem; <0 dang bi gio hut)
    this.hold = 0;            // +0x98 (>0 dang cam: 1 nhe,2 nang,4,6,101; <0 chinh no dang bi cam)
    this.weapon = null;       // +0x9c
    this.holder = null;       // +0xa0
    this.catching = null;     // +0x8c
    this.caughtBy = null;     // +0x90
    this.catchTimer = 0;      // +0x94
    this.thrower = null;      // +0x2f8
    this.owner = o.owner ?? null;          // +0x2f4 (phan than/trieu hoi)
    this.scoreOwner = o.scoreOwner ?? this; // +0x354
    this.blocked = { r: 0, l: 0, d: 0, u: 0 };  // +0x3e8..+0x3f4 (itr kind 14)
    this.homingTarget = null;  // +0x3f8
    this.hp = 500; this.cap = 500; this.hpMax = 500; this.mp = 500;
    this.weaponHp = data.header.weapon_hp ?? 0;   // +0x31c
    if (this.type === 6 && data.id === 122) this.hp = 200;
    this.lives = 0; this.join = 0; this.joinReserve = 0;
    this.defPct = 0;          // +0x340 Battle mode Defense
    this.stats = { kills: 0, attack: 0, hpLost: 0, mpUsed: 0, picking: 0 };
    this.cur = NO_KEYS; this.prev = NO_KEYS;
    this.t = { a: 0, j: 0, d: 0, d2: 0, r: 0, l: 0, u: 0, dn: 0 };
    this.combo = null;
    this.ai = null;
    this.picOffset = 0;       // +0x318 (sheet phu cho quai doi phe)
    this.sparks = [];
  }

  get type() { return this.data.type; }
  get id() { return this.data.id; }
  get h() { return this.data.header; }
  fr(n = this.frame) { return this.data.frames[n]; }
  get state() { const f = this.fr(); return f ? f.state : 0; }
  stateOf(n) { const f = this.fr(n); return f ? f.state : -1; }
  get isChar() { return this.type === 0; }

  sound(path) { this.world.playSound(path, this.ix); }
  engineSound(i) { this.sound(ENGINE_SOUNDS[i]); }

  setData(data) { this.data = data; this.frame = 0; this.prevFrame = -1; }

  // FUN_0040e2d0: dat frame (combo/hit_*), tru mp theo ma A*1000+B. Tra false neu khong du.
  setFrame(n) {
    let f = Math.abs(n);
    if (f === 999) f = 0;
    const target = this.fr(f);
    if (!target) return false;
    if (this.world.mpMode && target.mp > 0) {
      const A = Math.floor(target.mp / 1000), B = target.mp % 1000;
      if (!(B <= this.mp && A * 10 < this.hp)) return false;
      this.hp -= A * 10; this.mp -= B;
      this.stats.hpLost += A * 10; this.stats.mpUsed += B;
    }
    if (n < 0) this.facing ^= 1;
    this.frame = f;
    for (const k in this.t) this.t[k] = 0;
    return true;
  }

  payMp(frameNo, requireEnough) {
    const f = this.fr(frameNo);
    const cost = (f && f.mp > 0) ? f.mp : 0;
    if (!this.world.mpMode || !cost) return true;
    if (requireEnough) { if (cost > this.mp) return false; this.mp -= cost; this.stats.mpUsed += cost; return true; }
    this.mp -= cost; this.stats.mpUsed += cost;
    if (this.mp < 0) this.mp = 0;
    return true;
  }

  setInput(keys) { this.prev = this.cur; this.cur = keys || NO_KEYS; }

  // ================================================================ FUN_00413080
  controls() {
    const c = this.cur, p = this.prev, t = this.t, H = this.h;
    for (const k in t) if (t[k] > 0) t[k]--;
    const edge = (k) => c[k] && !p[k];
    if (edge("right")) { t.r = KEY_BUFFER; this.comboKey("R"); }
    if (edge("left")) { t.l = KEY_BUFFER; this.comboKey("L"); }
    if (edge("up")) { t.u = KEY_BUFFER; this.comboKey("U"); }
    if (edge("down")) { t.dn = KEY_BUFFER; this.comboKey("D"); }
    if (edge("defend")) { t.d = KEY_BUFFER; this.comboKey("def"); this.pushHistory(9); }
    if (edge("jump")) { t.j = KEY_BUFFER; this.comboKey("J"); this.pushHistory(0); }
    if (edge("attack")) { t.a = KEY_BUFFER; this.comboKey("A"); this.pushHistory(5); }

    let f = this.fr();
    if (f.hit_a && t.a > t.d && t.a > t.j) { this.setFrame(f.hit_a); t.a = 0; }
    else if (f.hit_d && t.d > t.a && t.d > t.j) { this.setFrame(f.hit_d); t.d = 0; }
    else if (f.hit_j && t.j > t.a && t.d < t.j) { this.setFrame(f.hit_j); t.j = 0; }

    if (this.frame === 110) { if (c.right) this.facing = 0; if (c.left) this.facing = 1; }
    let st = this.state;
    if ((st === 301 || st === 19) && this.iy === 0) {
      if (c.up && !c.down) this.vz = -H.running_speedz;
      if (c.down && !c.up) this.vz = H.running_speedz;
    }
    const hold = this.hold;
    const anyDir = c.left || c.right || c.up || c.down;

    // ---- dung / di (state 0,1)
    if ((st === 0 || st === 1)) {
      const heavy = hold === 2;
      this.tap -= sign0(this.tap);
      const rate = H.walking_frame_rate;
      const base = heavy ? 12 : 5, top = heavy ? 18 : 11;
      const walkAnim = () => {
        this.walkCnt = (this.walkCnt + 1) % (rate * 6);
        this.frame = this.walkCnt < rate * 4 ? Math.floor(this.walkCnt / rate) + base : top - Math.floor(this.walkCnt / rate);
      };
      const ws = heavy ? H.heavy_walking_speed : H.walking_speed;
      const wsz = heavy ? H.heavy_walking_speedz : H.walking_speedz;
      const runFrame = heavy ? 16 : 9;
      if (heavy && this.frame < 12) this.frame = 12;
      if (c.right && !c.left && this.iy === 0) {
        if (this.facing === 1) this.tap = 0;
        this.facing = 0; walkAnim(); this.vx = ws;
        if (!p.right) this.tap += 10;
        if (this.tap > 10) { this.frame = runFrame; this.walkCnt = 0; this.tap = 0; }
      }
      if (!c.right && c.left && this.iy === 0) {
        if (this.facing === 0) this.tap = 0;
        this.facing = 1; walkAnim(); this.vx = -ws;
        if (!p.left) this.tap -= 10;
        if (this.tap < -10) { this.frame = runFrame; this.walkCnt = 0; this.tap = 0; }
      }
      const lrNeutral = (!c.left && !c.right) || (c.left && c.right);
      if (c.up && !c.down && this.iy === 0) { if (lrNeutral) walkAnim(); this.vz = -wsz; this.vx /= 1.4; }
      if (c.down && !c.up && this.iy === 0) { if (lrNeutral) walkAnim(); this.vz = wsz; this.vx /= 1.4; }
      if (heavy) {
        if (c.attack && t.a > 0) { this.tap = 0; this.waitCnt = 0; this.frame = 50; }
      } else {
        if (c.attack && t.a > 0) {
          this.tap = 0; this.waitCnt = 0;
          if (hold === 0) {
            if (this.superPunch < 1) { const n = (this.world.rand(2) + 12) * 5; this.frame = n; this.payMp(n, false); }
            else this.frame = 70;
          } else if (hold % 100 === 1) {
            if (hold === 101 && anyDir) this.frame = 45;
            else this.frame = (this.world.rand(2) + 4) * 5;
          } else if (hold === 4) this.frame = 45;
          else if (hold === 6) this.frame = anyDir ? 45 : 55;
        }
        if (c.jump && t.j > 0) { this.waitCnt = 0; this.tap = 0; this.frame = 210; }
        if (c.defend && t.d2 === 0 && t.d > 0) { this.tap = 0; this.waitCnt = 0; this.frame = 110; }
      }
    }

    // ---- tren khong (state 4, y<0)
    st = this.state;
    if (st === 4 && this.iy < 0) {
      if (c.right && !c.left) this.facing = 0;
      if (c.left && !c.right) this.facing = 1;
      if (c.attack) {
        if (hold === 0) { this.waitCnt = 0; this.frame = 80; this.payMp(80, false); }
        else if (hold % 100 === 1) { this.waitCnt = 0; this.frame = anyDir ? 52 : 30; }
        else if (hold === 4 || hold === 6) { this.waitCnt = 0; this.frame = 52; }
      }
    }

    // ---- chay (state 2)
    st = this.state;
    if (st === 2) {
      this.waitCnt = 0;
      const rate = H.running_frame_rate;
      this.walkCnt = (this.walkCnt + 1) % (rate * 4);
      if (hold !== 2) {
        this.frame = this.walkCnt < rate * 3 ? Math.floor(this.walkCnt / rate) + 9 : 10;
        if (this.facing === 0) { this.vx = H.running_speed; if (c.left) this.frame = 218; }
        else { this.vx = -H.running_speed; if (c.right) this.frame = 218; }
        if (c.up && !c.down && this.iy === 0) { this.vz = -H.running_speedz; this.vx /= 1.2; }
        if (!c.up && c.down && this.iy === 0) { this.vz = H.running_speedz; this.vx /= 1.2; }
        if (c.attack && t.a > 0) {
          if (hold === 0) { if (this.payMp(85, true)) this.frame = 85; }
          else if (hold % 100 === 1) this.frame = anyDir ? 45 : 35;
          else if (hold === 4) this.frame = 45;
          else if (hold === 6) this.frame = anyDir ? 45 : 55;
        }
        if (c.defend && t.d > 0) this.frame = 102;
        if (c.jump && t.j > 0) {          // dash
          this.engineSound(7);
          this.tap = 0; this.frame = 213;
          this.vx = (this.facing ? -1 : 1) * H.dash_distance;
          this.vy = H.dash_height;
          if (c.up && !c.down) this.vz = -H.dash_distancez;
          else if (c.down && !c.up) this.vz = H.dash_distancez;
        }
      } else {
        this.frame = this.walkCnt < rate * 3 ? Math.floor(this.walkCnt / rate) + 16 : 17;
        if (this.facing === 0) { this.vx = H.heavy_running_speed; if (c.left) this.frame = 19; }
        else { this.vx = -H.heavy_running_speed; if (c.right) this.frame = 19; }
        if (c.up && !c.down && this.iy === 0) { this.vz = -H.heavy_running_speedz; this.vx /= 1.2; }
        if (!c.up && c.down && this.iy === 0) { this.vz = H.heavy_running_speedz; this.vx /= 1.2; }
        if (c.attack && t.a > 0) this.frame = 50;
      }
    }

    // ---- crouch sau khi nhay (frame 215)
    if (this.frame === 215) {
      if (c.defend && t.d > 0) this.frame = 102;
      if (c.jump && (c.right || this.vx > 0.001) && t.j > 0) {
        this.engineSound(7); this.frame = 213 + this.facing; this.tap = 0;
        this.vx = H.dash_distance; this.vy = H.dash_height;
      }
      if (c.jump && (c.left || this.vx < -0.001) && t.j > 0) {
        this.engineSound(7); this.frame = 214 - this.facing; this.tap = 0;
        this.vx = -H.dash_distance; this.vy = H.dash_height;
      }
      if (c.up && !c.down) this.vz = -H.dash_distancez;
      else if (c.down && !c.up) this.vz = H.dash_distancez;
    }

    // ---- rowing khi dang bi hat bay (frame 182/188) [V]
    if ((this.frame === 182 || this.frame === 188) && this.fallDmg >= 0 && c.jump && t.j > 0 && this.hp > 0) {
      const back = (this.facing === 0 && this.vx <= 0) || (this.facing === 1 && this.vx > 0);
      this.frame = back ? 100 : 108;
      this.waitCnt = 0;
      if (H.rowing_height < this.vy) this.vy = H.rowing_height;
      if (this.vx >= 1 || this.vx <= -1) this.vx = this.vx <= 0 ? -H.rowing_distance : H.rowing_distance;
      else this.vx = this.facing === 1 ? H.rowing_distance : -H.rowing_distance;
    }

    // ---- dash (state 5)
    if (this.state === 5) {
      if (c.right && !c.left) this.facing = 0;
      if (this.facing === 0 && this.frame !== 217 && this.vx < 0) this.frame = 214;
      if (this.facing === 0 && this.frame !== 216 && this.vx > 0) this.frame = 213;
      if (c.left && !c.right) this.facing = 1;
      if (this.facing === 1) {
        if (this.frame !== 217 && this.vx > 0) this.frame = 214;
        if (this.frame !== 216 && this.vx < 0) this.frame = 213;
      }
      const forward = (this.vx > 0 && this.facing === 0) || (this.vx < 0 && this.facing === 1);
      if (forward && c.attack) {
        if (hold === 0) { if (this.payMp(90, true)) this.frame = 90; }
        else if (hold % 100 === 1 || ((hold === 4 || hold === 6) && anyDir)) {
          this.frame = (hold === 4 || hold === 6) ? 52 : 40; this.waitCnt = 0; this.vy -= 1;
        }
      }
    }

    // ---- dvx / dvy / dvz cua frame hien tai (moi tick) [V]
    f = this.fr();
    this.applyFrameVelocity(f, c);
  }

  applyFrameVelocity(f, c = this.cur) {
    const t = this.t;
    const dvx = f.dvx || 0, dvy = f.dvy || 0, dvz = f.dvz || 0;
    if (dvx >= 501) this.vx = dvx - 550;
    else if (dvx > 0) { if (this.facing === 0 && this.vx < dvx) this.vx = dvx; if (this.facing === 1 && -this.vx < dvx) this.vx = -dvx; }
    else if (dvx < 0) { if (this.facing === 0 && dvx < this.vx) this.vx = dvx; if (this.facing === 1 && dvx < -this.vx) this.vx = -dvx; }
    if (dvy) this.vy = dvy >= 501 ? dvy - 550 : this.vy + dvy;
    if (dvz) {
      if (dvz > 500) this.vz = dvz - 550;
      else {
        if (c.up && t.dn <= t.u) this.vz = -dvz;
        if (c.down && t.u <= t.dn) this.vz = dvz;
      }
    }
  }

  pushHistory(code) {
    // lich su 5 phim (+0x408..+0x418) cho lenh doi: Def-Jump-Def-Jump, Def x4, Def-Atk-Def-Atk (06)
    this.history = [...(this.history || []).slice(-4), code];
    const h = this.history.slice(-4).join(",");
    if (h === "9,0,9,0") this.teamCmd = "call";
    else if (h === "9,9,9,9") this.teamCmd = "hold";
    else if (h === "9,5,9,5") this.teamCmd = "free";
  }

  // Combo D > huong > A/J (FUN_00412800..00412f40). Khong timeout; phim khac lam hong. [V]
  comboKey(k) {
    const cb = this.combo;
    if (k === "def") { this.combo = { step: 1, dir: null }; return; }
    if (!cb) return;
    if (cb.step === 1 && "RLUD".includes(k)) { cb.step = 2; cb.dir = k; return; }
    if (cb.step === 1 && k === "J") { cb.step = 3; return; }
    if (cb.step === 2 && (k === "A" || k === "J")) { this.fireCombo(cb.dir + k); this.combo = null; return; }
    if (cb.step === 3 && k === "A") { this.fireCombo("JA"); this.combo = null; return; }
    this.combo = null;
  }

  fireCombo(code) {
    const f = this.fr();
    const map = { RA: ["hit_Fa", 0], LA: ["hit_Fa", 1], UA: ["hit_Ua"], DA: ["hit_Da"],
                  RJ: ["hit_Fj", 0], LJ: ["hit_Fj", 1], UJ: ["hit_Uj"], DJ: ["hit_Dj"], JA: ["hit_ja"] };
    const [field, face] = map[code] || [];
    if (!field || !f[field] || this.hold === 2) return;
    if (field === "hit_ja" && this.id === 6 && f[field] === 300 && this.hp >= 178 && !this.world.cheat) return;
    if (field === "hit_ja" && this.id === 51 && this.fusion) { this.fusion.split = true; return; }
    if (this.setFrame(f[field]) && face !== undefined) this.facing = face;
  }

  // ================================================================ FUN_0040e490
  physics() {
    if (this.freeze !== 0) { this.freeze -= sign0(this.freeze); return; }
    if (this.hold < 0) return;                       // vu khi dang bi cam
    const f = this.fr();
    if (f && f.cpoint && f.cpoint.kind === 2 && this.caughtBy) return;   // dang bi tom
    const T = this.type, id = this.id;
    if (!((this.vx > 0 && this.blocked.r) || (this.vx < 0 && this.blocked.l))) this.x += this.vx;
    if (T === 4 || id === 120) this.x += this.vx * 0.2;
    if (id === 101) this.x -= this.vx * 0.2;
    if (!((this.vz > 0 && this.blocked.d) || (this.vz < 0 && this.blocked.u))) this.z += this.vz;
    this.blocked.r = this.blocked.l = this.blocked.d = this.blocked.u = 0;
    if (this.iy >= 0) { this.vx = shrink(this.vx, 1); this.vz = shrink(this.vz, 1); }
    this.y += this.vy;
    const st = this.state;
    if (this.y < -0.0001) {
      let g;
      if (T === 3) g = 0;
      else if (T === 6) g = 1.1333333333333333;
      else if (T === 4) g = 0.85;
      else if (st === 1002) g = id === 124 ? 0.17 : id === 120 ? 0.425 : id === 101 ? 1.1333333333333333 : 0.5666666666666667;
      else g = GRAVITY;
      this.vy += g;
      if (T === 0 && st === 12) {
        const vy = this.vy;
        if (this.frame < 185) this.frame = vy < -8 ? 180 : vy < 1 ? 181 : vy < 8 ? 182 : 183;
        else if (this.frame >= 186 && this.frame <= 190) this.frame = vy < -8 ? 186 : vy < 1 ? 187 : vy < 8 ? 188 : 189;
      }
      if (T === 0 && st === 18 && this.frame < 205 && this.vy > 1) this.frame = 205;
    } else if (this.y > 0 || (this.y > -0.0001 && this.vy > 0)) {
      this.land(st);
    }
    this.ix = Math.trunc(this.x); this.iy = Math.trunc(this.y); this.iz = Math.trunc(this.z);
    if (st !== 12 && this.fallDmg > 0) this.fallDmg = 0;
  }

  land(st) {
    const T = this.type, H = this.h;
    if (T === 0) {
      if (st === 13) {
        if (this.vy > 17 || Math.abs(this.vx) > 9) {
          this.hp -= this.defPct > 0 ? Math.floor(1000 / this.defPct) : 10;
          this.y = 0; this.vy = -3.5; this.vx = Math.max(-7, Math.min(7, this.vx)); this.frame = 185;
        } else { this.y = 0; this.vy = 0; this.vx /= 3; }
        return;
      }
      if (this.vy > 0 && st !== 12 && st !== 18) {
        this.y = 0; this.vy = 0; this.vx /= 3;
        this.frame = st === 100 ? 94 : (this.frame === 212 || st === 6) ? 215 : 219;
        this.waitCnt = 0;
        return;
      }
      if (this.vy > 0 && (st === 12 || st === 18)) {
        if (this.fallDmg > 0) {
          const d = this.defPct > 0 ? Math.floor(this.fallDmg * 100 / this.defPct) : this.fallDmg;
          this.hp -= d; this.cap -= Math.trunc(d / 3); this.stats.hpLost += d;
          if (this.thrower) this.thrower.scoreOwner.stats.attack += d;
          this.fallDmg = 0;
        }
        this.engineSound(6);
        if (this.vy > 11 || Math.abs(this.vx) > 9 || st === 18) {
          this.y = 0; this.vy = -3.5;
          this.vx = Math.max(-7, Math.min(7, this.vx));
          this.frame = (this.frame < 186 || st === 18) ? 185 : 191;
        } else {
          this.y = 0; this.vy = 0; this.waitCnt = 0; this.vx /= 3;
          this.frame = 230 + (this.frame > 185 ? 1 : 0);
        }
        return;
      }
      this.y = 0; if (this.vy > 0) this.vy = 0;
      return;
    }
    // ---- vu khi / do vat
    const vy = this.vy;
    if (T === 1) {
      if (vy > 0) {
        this.weaponHp -= H.weapon_drop_hurt || 0;
        if (vy <= 9.9) { this.frame = st === 1002 ? 70 : 60; this.vx *= 0.5; this.vy = 0; this.y = 0; }
        else if (st === 1002) { this.frame = 7; this.vy = -8.5; this.facing ^= 1; this.vx *= 0.5; this.y = 0; this.dropSound(); }
        else { this.frame = 60; this.vx *= 0.5; this.vy = 0; this.y = 0; }
        if (vy > 9.9 && st !== 1002) this.dropSound();
      } else this.y = 0;
    } else if (T === 2) {
      if (vy > 9) { this.vy = -5; this.facing ^= 1; this.vx *= 0.5; this.y = 0; this.weaponHp -= 1; this.dropSound(); }
      else if (vy > 0) { this.frame = 20; this.vy = 0; this.vx *= 0.5; this.y = 0; this.weaponHp -= H.weapon_drop_hurt || 0; }
      else this.y = 0;
    } else if (T === 4 || T === 6) {
      if (vy > 0) {
        this.weaponHp -= H.weapon_drop_hurt || 0;
        if ((vy <= 8.5 && Math.abs(this.vx) <= 10) || (st !== 1002 && st !== 1000)) {
          this.vy = 0; this.vx *= 0.7; this.frame = st === 1002 ? 70 : 60; this.y = 0;
        } else {
          this.frame = 0; this.vy = Math.max(-10, -0.7 * vy); this.vx *= 0.7; this.y = 0; this.dropSound();
        }
      } else this.y = 0;
    } else {
      if (this.id === 999) { this.frame = 101; this.vx = this.vy = 0; }
      this.y = 0; if (this.vy > 0) this.vy = 0;
    }
  }

  dropSound() { if (this.h.weapon_drop_sound) this.sound(this.h.weapon_drop_sound); }

  // ================================================================ FUN_0040d960
  advanceFrame() {
    if (this.freeze !== 0 && this.type !== 3) return;
    if (this.arest > 0) this.arest--;
    if (this.hold < 0) return;
    let f = this.fr();
    if (!f) { this.frame = 0; f = this.fr(); if (!f) return; }
    if (f.cpoint && f.cpoint.kind === 2 && this.caughtBy) return;
    if (this.type === 3 && f.hit_a > 0) {
      this.hp -= f.hit_a;
      if (this.hp < 1) { this.hp = 0; this.frame = f.hit_d; f = this.fr() || f; }
    }
    if (this.blink > 0) this.blink--; else if (this.blink < 0) this.blink++;
    if (this.fall > 0) this.fall--;
    if (this.defbar > 0) this.defbar--;
    if (this.superPunch > 0) this.superPunch--;
    if (this.frame !== this.prevFrame) { this.playFrameSound(); this.waitCnt = 0; }
    this.waitCnt++;
    f = this.fr();
    if (!f) return;
    if (f.state === 0 && this.iy < 0) { this.frame = 212; f = this.fr(); }
    if (this.type === 2 && f.state === 2000 && this.iy === 0 && Math.abs(this.vx) < 0.1) { this.frame = 20; f = this.fr(); }
    if (f.state === 14 && this.hp < 1) {
      if ((this.owner || this.team === 5 || this.slot > 19) && this.blink < 1) this.blink = 30;
      this.waitCnt = 0;
    }
    if (f.state === 2000) this.facing = this.vx <= 0 ? 1 : 0;
    if (this.waitCnt > f.wait) {
      this.waitCnt = 0;
      const next = f.next;
      if (next !== 0) {
        const prevState = f.state;
        this.frame = Math.abs(next);
        if (next < 0) this.facing ^= 1;
        let from999 = false;
        if (this.frame === 999) { from999 = true; this.frame = (this.iy === 0 || this.type !== 0) ? 0 : 212; }
        if (this.frame < 0 || this.frame > 399) return;   // 1000 = xoa, 11xx/12xx = an; World xu ly
        const nf = this.fr();
        if (!nf) { this.frame = 0; }
        else {
          if (prevState === 14 && nf.state !== 13 && this.type === 0) {
            const npc = this.team === 5 || this.owner;
            if (!(npc && this.world.difficulty === 2)) this.blink = 15;
          }
          if (this.frame === 212 && !from999) {
            const c = this.cur, H = this.h;
            this.vy = H.jump_height;
            if (c.right && !c.left) this.vx = H.jump_distance;
            else if (c.left && !c.right) this.vx = -H.jump_distance;
            if (c.up && !c.down) this.vz = -H.jump_distancez;
            else if (c.down && !c.up) this.vz = H.jump_distancez;
          }
          this.playFrameSound();
          if (nf.mp < 0 && this.world.mpMode) {
            if (this.mp < -nf.mp) { if (nf.hit_d) this.frame = nf.hit_d; }
            else { this.mp += nf.mp; this.stats.mpUsed -= nf.mp; }
            const c = this.cur;
            if (nf.hit_d > 0 && this.iy === 0 && ((c.left && !c.right && this.facing === 0) || (c.right && !c.left && this.facing === 1))) this.frame = nf.hit_d;
          }
        }
      }
    }
    if (this.frame === 110 || this.frame === 114) this.t.d2 = 3;
    if (this.frame === 202) this.blink = 20;
    this.prevFrame = this.frame;
  }

  playFrameSound() {
    const f = this.fr();
    if (f && f.sound) this.sound(f.sound);
  }

  // Hoi HP/MP (41bc90 2123-2162) [V]; tick = so tick cua tran
  regen(tick) {
    if (this.type !== 0) return;
    const bd0 = tick % 12 === 0, bd4 = tick % 3 === 0;
    if (this.hp > 0 && this.hp < this.cap && bd0) this.hp++;
    if (this.fallDmg < 0 && bd0) {
      const d = this.defPct > 0 ? Math.floor(900 / this.defPct) : 9;
      this.hp = Math.max(0, this.hp - d); this.cap = Math.max(0, this.cap - 3); this.stats.hpLost += 9;
    }
    if ((!this.owner || this.mp < 150) && this.mp < 500 && bd4 && this.blink >= 0) {
      let h = Math.min(this.hp, 500);
      if (this.id === 51 || this.id === 52) h = Math.floor(h / 2);
      this.mp += Math.floor((500 - h) / 100) + 1;
    }
  }

  // Bo hoi +0xe0 / +0xe4 (41bc90 3209-3256) [V]
  healers() {
    if (Math.floor(this.heal / 1000) === 1 && this.hp > 0) {
      this.heal--;
      if ((this.heal & 7) === 0) { if (this.hp < this.cap) this.hp = this.hp < this.cap - 8 ? this.hp + 8 : this.cap; else this.heal = 0; }
      if (this.heal % 1000 === 0) this.heal = 0;
    }
    if (this.heal2 > 0) {
      this.heal2--;
      if ((this.heal2 & 7) === 0 && this.hp < this.cap) { this.hp += 8; if (this.hp > this.cap) { this.hp = this.cap; this.heal2 = 0; } }
    }
    if (this.state === 1700) this.heal = 1100;
  }
}
