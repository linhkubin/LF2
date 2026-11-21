// Va cham va xu ly trung don, theo lf2.exe:
//   collect()   ~ FUN_00419380 + FUN_00417200 + FUN_00417400 (loc, chon nan nhan)
//   resolve()   ~ FUN_0042e100 (sat thuong, nga, do don, hieu ung, bat, nhat, hoi mau...)
//   applyKnockback() ~ FUN_004196f0
//   catching()  ~ FUN_00418c30 + FUN_004187b0 (giu, danh, nem nguoi bi bat)
// [V] = doc tu code (02_combat_items.md, 04_combat_gaps.md); [I] = suy luan.

const JUNK = -842150451;                      // 0xCDCDCDCD: truong cpoint khong dat
const val = (v) => (v === undefined || v === null || v === JUNK ? 0 : v);
const BALLS_FREEZABLE = new Set([200, 203, 205, 206, 207, 215, 216]);
const WEAPON_TYPES = new Set([1, 2, 4, 6]);
const FRIENDLY_KINDS = new Set([0, 1, 2, 3, 6, 10, 11, 15, 16]);

export function itrBox(o, f, b) {
  const left = o.facing === 0 ? o.ix - f.centerx + b.x : o.ix + f.centerx - b.w - b.x;
  return { x: left, y: o.iy - f.centery + b.y, w: b.w, h: b.h };
}
const overlap = (A, B) => (A.x - B.x < B.w) && (B.x - A.x < A.w) && (A.y - B.y < B.h) && (B.y - A.y < A.h);

function teamOf(o) { return o.hold < 0 && o.holder ? o.holder.team : o.team; }

// ---------------------------------------------------------------- loc (FUN_00417400)
function blocked(world, a, v, itr, af, vf) {
  const k = itr.kind, e = itr.effect || 0;
  const vt = v.type, at = a.type;
  const vState = vf.state;
  if (BALLS_FREEZABLE.has(a.id) && v.id === 209 && k !== 9) return true;
  if (k === 3 && vt !== 0) return true;
  if (k === 0) {
    if (e === 4 && vt === 0) return true;
    if (e === 20 && (vt !== 0 || vState === 18 || vState === 19)) return true;
    if (e === 21 && (vState === 18 || vState === 19)) return true;
    if (e === 30 && v.frame >= 200 && v.frame <= 202) return true;
    if (e === 2 && af.state === 19 && vState === 18) return true;
  }
  if (k === 8 && vt !== 0) return true;
  if (v.blink !== 0 && k !== 8 && k !== 14) return true;
  if (k === 4 && !(a.fallDmg > 0)) return true;
  // dong doi [V]
  const ta = teamOf(a), tv = v.team;
  if ((FRIENDLY_KINDS.has(k) || (k === 9 && vt === 0)) && vState !== 13 && vState !== 10) {
    if (ta === tv && ta !== 0 && k !== 8 && (af.state !== 18 || e === 21 || e === 22) &&
        (at !== 0 || vt !== 3 || a.facing === v.facing) && !WEAPON_TYPES.has(vt)) return true;
  }
  if (k === 5 && ta === tv && ta !== 0 && vState !== 13 && !WEAPON_TYPES.has(vt)) return true;
  if (k === 5) {
    const atk = a.holder && a.holder.fr() && a.holder.fr().wpoint ? a.holder.fr().wpoint.attacking : 0;
    if (!atk) return true;                     // vu khi chi danh khi chu dang o frame co attacking
  }
  // bdy.kind >= 1000 (Stage): chi phe nguoi choi danh trung [V]
  // (kiem tra o tung bdy ben duoi)
  if (vState === 12 && (itr.fall || 0) < 41 && k !== 10 && k !== 11) return true;
  // vat nam yen (1004/2004) chi bi kind 2/7/10 cham khi ke danh la nhan vat
  if ((vState === 1004 || vState === 2004) && !(k === 2 || k === 7 || k === 10) && (at === 0 || a.hold < 0)) return true;
  if (k === 2 || k === 7) {
    if (a.hold !== 0 || !(a.cur.attack && !a.prev.attack)) return true;
    if (k === 7 && !(vState === 1004 && vt !== 2)) return true;
    if (k === 2 && !(vState === 1004 || vState === 2004)) return true;
  }
  if ((vState === 1004 || vState === 2004) && !(k === 2 || k === 7 || k === 10)) return true;
  if (k === 1) {
    if (a.hold !== 0 || vt !== 0 || vState !== 16 || v.caughtBy) return true;
  }
  if (k === 3 && v.caughtBy) return true;
  return false;
}

// ---------------------------------------------------------------- thu thap (FUN_00419380)
export function collect(world) {
  const objs = world.objects;
  for (const o of objs) {
    o.hitFrame = o.frame;
    o.cands = [];
    o.nearest = 1000;
    const f = o.fr();
    if (!f || !f.itr || f.itr.length === 0) o.arest = 0;
    for (const [k, n] of o.vrest) { if (n > 0) o.vrest.set(k, n - 1); }
  }
  for (const a of objs) {
    const af = a.fr();
    if (!af || !af.itr || !af.itr.length || a.arest >= 1) continue;
    if (a.hold < 0 && !a.holder) continue;
    for (const v of objs) {
      if (v === a || !v.active) continue;
      if (a.hold < 0 && a.holder === v) continue;
      if (v.hold < 0) continue;                      // vu khi dang cam khong bi danh
      if ((v.vrest.get(a.slot) || 0) >= 1) continue;
      const vf = v.fr();
      if (!vf || !vf.bdy || !vf.bdy.length) continue;
      af.itr.forEach((itr, idx) => {
        const zw = itr.zwidth || 15;
        const dz = a.iz - v.iz;
        if (!(-zw < dz && dz < zw)) return;
        if (blocked(world, a, v, itr, af, vf)) return;
        const A = itrBox(a, af, itr);
        let hit = false;
        for (const b of vf.bdy) {
          if (b.kind >= 1000 && world.mode === "stage") {
            const atkChar = a.type === 0 || a.id === 201 || a.id === 202 || (a.hold < 0 && a.holder && a.holder.type === 0);
            if (!atkChar || teamOf(a) === 5) continue;
          }
          if (overlap(itrBox(v, vf, b), A)) { hit = true; break; }
        }
        if (!hit) return;
        const multi = (itr.vrest || 0) !== 0 || itr.kind === 1 || itr.kind === 2 || itr.kind === 7 ||
          (vf.state === 1004 && (a.type < 1 || a.hold < 0));
        if (multi) {
          if (a.cands.length < 20 && !a.cands.some((c) => c.v === v)) a.cands.push({ v, itr: idx });
        } else {
          const ax = a.hold < 0 && a.holder ? a.holder.ix : a.ix;
          const d = Math.abs(ax - v.ix);
          if (d < a.nearest || (d === a.nearest && world.rand(2) === 0)) {
            a.nearest = d;
            a.cands = [{ v, itr: idx }];
            a.singleMode = true;
          }
        }
      });
    }
  }
}

// ---------------------------------------------------------------- xu ly (FUN_0042e100)
export function resolve(world, a) {
  if (!a.cands || !a.cands.length || !a.active) return;
  const af = a.fr(a.hitFrame);
  if (!af) return;
  for (const { v, itr: idx } of a.cands) {
    if (!v.active || (v.vrest.get(a.slot) || 0) >= 1) continue;
    if (a.hitOnce && v.type === 0) return;
    let itr = { ...af.itr[idx] };
    if (itr.kind === 5 && a.hold < 0 && a.holder) {
      const wp = a.holder.fr() && a.holder.fr().wpoint;
      const s = a.data.strength && wp && a.data.strength[String(wp.attacking)];
      if (!s) continue;
      itr = { ...itr, ...s, kind: 0, x: itr.x, y: itr.y, w: itr.w, h: itr.h };
    }
    if (itr.kind === 4 && a.fallDmg > 0) {
      itr.kind = 0;
      if ((a.vx > 0 && a.facing === 1) || (a.vx < 0 && a.facing === 0)) itr.dvx = -(itr.dvx || 0);
    }
    if (v.type === 2) { itr.dvx = (itr.dvx || 0) / 2; itr.dvy = (itr.dvy || 0) / 2; }
    if (itr.kind === 9) {
      if (v.type === 0 || v.state === 1002 || v.state === 2000) { itr.kind = 0; if (v.type === 0) a.hp = 0; }
      else { hitBallByForcefield(world, a, v); continue; }
    }
    switch (itr.kind) {
      case 0: hitNormal(world, a, v, itr); break;
      case 1: case 3: startCatch(world, a, v, itr); break;
      case 2: case 7: pickUp(world, a, v, itr); break;
      case 6: v.superPunch = 3; break;
      case 8:
        if (v.type === 0) {
          v.heal = (itr.injury || 0) + 1000;
          a.frame = itr.dvx || a.frame; a.x = v.x; a.y = v.y; a.z = v.z + 1;
        }
        break;
      case 10: case 11: windLift(world, a, v, itr); break;
      case 14: wall(a, v); break;
      case 15: pull(a, v); break;
      case 16: freezeHit(world, a, v, itr); break;
      default: break;
    }
  }
}

function hitBallByForcefield(world, a, v) {
  if (a.h.weapon_broken_sound) a.sound(a.h.weapon_broken_sound);
  if (v.state === 3005) { v.frame = 40; v.hitOnce = true; }
  else { v.team = a.team; v.scoreOwner = a.scoreOwner; v.frame = 30; v.vx = v.vy = v.vz = 0; v.facing = a.facing; }
  v.waitCnt = 0;
}

function dropWeapon(world, c) {
  const w = c.weapon;
  if (!w) return;
  c.hold = 0; c.weapon = null;
  w.hold = 0; w.holder = null;
  w.frame = world.rand(16) % 12;
  w.vx = c.vx / 3; w.vy = c.vy / 3 - 2; w.vz = c.vz / 3;
  w.y = Math.min(w.y, -1);
}
export { dropWeapon };

function releaseCatch(c) {
  if (c.catching) { c.catching.caughtBy = null; c.catching = null; }
  if (c.caughtBy) { c.caughtBy.catching = null; c.caughtBy = null; }
}

function hitBall(world, a, v, itr) {
  // a danh trung bong v (type 3) [V 04 muc 4.1]
  const aState = a.fr(a.hitFrame) ? a.fr(a.hitFrame).state : 0;
  const vs = v.state;
  v.hp -= itr.injury || 0;
  if ((vs === 3005 && aState === 3005) || (vs === 3006 && aState === 3006)) {
    v.frame = a.frame = 20; v.vx = v.vy = v.vz = a.vx = a.vy = a.vz = 0; v.waitCnt = a.waitCnt = 0;
    return;
  }
  if (vs !== 3005 && (vs !== 3006 || aState === 3005)) {
    v.team = teamOf(a); v.scoreOwner = a.hold < 0 && a.holder ? a.holder.scoreOwner : a.scoreOwner;
    v.hitOnce = true; v.waitCnt = 0; v.acc = { x: 0, y: 0, z: 0 }; v.hits = 0;
    if (a.id === 209 && BALLS_FREEZABLE.has(v.id)) { v.setData(a.data); v.frame = v.prevFrame = 40; }
    else if ((a.type === 0 || a.hold < 0) && itr.effect !== 2 && itr.effect !== 20) {
      v.frame = 30; v.facing = (a.hold < 0 && a.holder ? a.holder : a).facing; v.vx = 0;
      if (a.id === 8 && BALLS_FREEZABLE.has(v.id) && world.dataCache[209]) v.setData(world.dataCache[209]), (v.frame = 30);
    } else { v.frame = 20; v.vx = v.vy = v.vz = 0; }
  }
}

function spark(world, a, v, itr) {
  const f = a.fr(a.hitFrame);
  if (!f) return;
  // [V 05 muc 2.4] vi tri: mep itr phia truoc, kep ve phia nan nhan; y man hinh da cong z
  const A = itrBox(a, f, itr);
  const x = a.facing === 0 ? Math.min(A.x + A.w, v.ix) : Math.max(A.x, v.ix);
  const sy = A.y + Math.trunc(A.h / 2) + a.iz - 4 + world.rand(9);
  const start = (itr.effect === 1 ? 20 : 0) + ((itr.fall || 20) < 61 ? 10 : 0);
  world.addSpark(x + world.rand(9) - 4, sy, Math.max(a.iz, v.iz) + 1, start);
}

function hitNormal(world, a, v, itr) {
  const aF = a.fr(a.hitFrame);
  const aState = aF ? aF.state : 0;
  const attackerFacing = (a.hold < 0 && a.holder ? a.holder : a).facing;
  const scorer = (a.hold < 0 && a.holder ? a.holder : a).scoreOwner;

  // bong bay (3000) trung muc tieu => no (frame 10) [V]
  if (aState === 3000 && !(a.id === 209 && v.type === 3 && (BALLS_FREEZABLE.has(v.id) || (v.id === 209 && v.frame === 40)))) {
    a.frame = 10; a.waitCnt = 0; a.vx = 0;
    const f10 = a.fr(10); a.vz = f10 ? (f10.dvy || 0) : 0;
  }
  if (a.id === 201 && v.type === 0) world.remove(a);
  if (a.id === 214 && v.type === 0) a.hp = 0;

  if (v.type === 3) { hitBall(world, a, v, itr); finishHit(world, a, v, itr, false); return; }

  // ---- phong thu [V]
  const vPrevState = v.stateOf(v.prevFrame >= 0 ? v.prevFrame : v.frame);
  const defended = v.type === 0 && vPrevState === 7 && (itr.bdefend || 0) < 61 &&
    (v.facing !== attackerFacing || (itr.dvx || 0) < 0 || [124, 220, 221, 222].includes(a.id)) && v.hp > 0;
  const armored = v.type === 0 && !defended && armorAbsorbs(v, itr);

  let dmg = itr.injury || 0;
  if (v.defPct > 0) dmg = Math.floor(dmg * 100 / v.defPct);

  if (defended || armored) {
    const d = defended ? Math.trunc(dmg / 10) : dmg;
    v.hp -= d; v.cap -= Math.trunc(d / 3); v.stats.hpLost += d; scorer.stats.attack += d;
    v.waitCnt = 0;
    v.defbar += itr.bdefend || 0;
    v.hits++;
    if (v.iy === 0) {
      let kx = (itr.dvx || 0) / 2;
      if (aState === 2000) kx = a.ix < v.ix ? Math.abs(kx || 6) : -Math.abs(kx || 6);
      else { if (!kx) kx = 3; kx = attackerFacing === 0 ? kx : -kx; }
      v.acc.x += kx;
    }
    if (defended) {
      if (v.defbar >= 31 && v.state === 7) v.frame = 112;
      else if (v.frame === 110) v.frame = 111;
      v.engineSound(v.id === 37 || v.id === 6 ? 17 : 1);
    } else v.engineSound(17);
    if (a.freeze >= 0) a.freeze = 3;
    v.freeze = -5;
    setRest(a, v, itr, true);
    if (v.hp < 1) knockDown(world, v, attackerFacing);
    return;
  }

  // ---- trung hoan toan [V 02 muc 4.1]
  if (v.type === 0) v.defbar = 45;
  if (v.type !== 6) {
    if (v.hp > 0 && v.hp <= dmg && v.type === 0 && !v.owner) { scorer.stats.kills++; }
    v.hp -= dmg; v.cap -= Math.trunc(dmg / 3);
    v.stats.hpLost += dmg;
    if (v.type === 0 && !v.owner) scorer.stats.attack += dmg;
  }
  if (WEAPON_TYPES.has(v.type)) {
    v.weaponHp -= itr.injury || 0;
    if (itr.bdefend === 100) v.weaponHp = -1;
    if (v.h.weapon_hit_sound) v.sound(v.h.weapon_hit_sound);
    weaponKnock(world, a, v, itr, attackerFacing);
    finishHit(world, a, v, itr, false);
    return;
  }
  if (v.caughtBy && v.fr().cpoint && v.fr().cpoint.kind === 2 && v.fr().cpoint.hurtable) {
    const cp = v.fr().cpoint;
    const fr = v.facing === attackerFacing ? val(cp.backhurtact) : val(cp.fronthurtact);
    if (fr) { v.frame = fr; v.waitCnt = 0; }
    finishHit(world, a, v, itr, true);
    return;
  }
  if (v.hp < 1 || itr.effect === 4) v.fall = 80;
  if (v.type !== 2 || (itr.fall || 0) > 40) v.hits++;
  v.fall += itr.fall ? itr.fall : 20;
  const vs = v.state;
  if (vPrevState === 13 || vs === 12) v.fall = 80;
  if (v.fall >= 61) v.fall = 80;
  else if (v.fall >= 41) { v.frame = 226; v.fall = 60; if (v.iy < 0) v.fall = 80; }
  else if (v.fall >= 21) { v.frame = 222 + (v.facing === attackerFacing ? 2 : 0); v.fall = 40; if (v.iy < 0) v.fall = 80; }
  else if (v.fall >= 1) { v.frame = 220; v.fall = 20; if (v.iy < 0) { v.frame = 222 + (v.facing === attackerFacing ? 2 : 0); } }
  v.waitCnt = 0;

  // knockback x [V 42e100:381-480]
  const dvx = itr.dvx || 0;
  if (v.fall !== 80 || Math.abs(v.vx) >= 5 || dvx !== 0) {
    if (aState === 2000 || itr.effect === 22 || itr.effect === 23) v.acc.x += a.ix < v.ix ? dvx : -dvx;
    else v.acc.x += attackerFacing === 0 ? dvx : -dvx;
  } else {
    v.acc.x += aState === 2000 ? 5 : (attackerFacing === 0 ? 5 : -5);
  }
  if (v.fall === 80) {
    if (!itr.dvy) v.acc.y -= 7;
    else { v.acc.y += itr.dvy; if (v.acc.y > 0) v.acc.y = 12; }
    v.frame = ((v.facing === 0 && v.acc.x <= 0) || (v.facing === 1 && v.acc.x > 0)) ? 180 : 186;
    v.fall = 0;
    if (v.weapon) dropWeapon(world, v);
    releaseCatch(v);
  }
  // hieu ung [V]
  const e = itr.effect || 0;
  if (e === 2 || e === 20 || e === 21 || e === 22) {
    v.frame = 203; v.waitCnt = 0; v.facing = v.acc.x > 0 ? 1 : 0; v.engineSound(16);
    if (v.weapon) dropWeapon(world, v);
  } else if (e === 23) v.engineSound(16);
  else if (e === 3 || e === 30) { v.frame = 200; v.waitCnt = 0; v.engineSound(14); if (v.weapon) dropWeapon(world, v); }
  else if (e === 1) v.engineSound(v.fall === 0 && (v.frame === 180 || v.frame === 186) ? 12 : 11);
  else v.engineSound((v.frame === 180 || v.frame === 186) ? 2 : 0);

  if (v.hp < 1) knockDown(world, v, attackerFacing);
  finishHit(world, a, v, itr, true);
}

function armorAbsorbs(v, itr) {
  // Louis (6), Knight (37), Julian (52): giap nuot don nhe khi bo dem the thu thap [I tu 04 muc 4.5]
  if (![6, 37, 52].includes(v.id) || v.hp <= 0) return false;
  const st = v.state;
  if (st === 12 || st === 14 || st === 13 || st === 18 || st === 16 || st === 8 || v.iy < 0) return false;
  if ((itr.fall || 20) >= 61) return false;
  const limit = v.id === 52 ? 15 : 16;
  return v.defbar < limit;
}

function knockDown(world, v, facing) {
  // chet ma dang dung: ep nga (41bc90:2207) [V]
  if (v.type !== 0) return;
  const st = v.state;
  if (st < 12 || v.frame === 110 || v.frame === 111) {
    v.frame = 186; v.vy = -3; v.y = -1; v.iy = -1;
    if (v.weapon) dropWeapon(world, v);
    releaseCatch(v);
  }
  void facing;
}

function weaponKnock(world, a, v, itr, facing) {
  // [I] vu khi bi danh: bay theo huong don
  const dvx = itr.dvx || 0;
  v.acc.x += (facing === 0 ? 1 : -1) * (Math.abs(dvx) || 5);
  v.acc.y += itr.dvy ? itr.dvy : -7;
  v.hits++;
  v.frame = 0; v.waitCnt = 0;
  if (v.type === 4 || v.type === 6) {
    v.acc.x = v.vx * 0.55 + (facing === 0 ? Math.abs(dvx) : -Math.abs(dvx));
    if (a.id === 100 && a.hold < 0) {               // gay bong chay: x2.5 [V]
      v.acc.x *= 2.5; v.engineSound(13);
      if (v.acc.x > 0 && v.acc.x < 10) v.acc.x = 10;
      if (v.acc.x < 0 && v.acc.x > -10) v.acc.x = -10;
    }
  }
}

function setRest(a, v, itr, defended) {
  let ar = (itr.arest || 0) < 4 && !(itr.vrest) ? 4 : (itr.arest || 0);
  if (defended) ar = Math.min(ar, 12);
  if (a.hold < 0 && a.holder) a.arest = ar; else a.arest = ar;
  if ((itr.vrest || 0) > 0) {
    let vr = itr.vrest;
    if (defended) vr = Math.min(Math.max(vr, 4), 12);
    v.vrest.set(a.slot, vr);
  }
}

function finishHit(world, a, v, itr, withSpark) {
  if (a.freeze >= 0) a.freeze = 3;
  if (a.hold < 0 && a.holder && a.holder.freeze >= 0) a.holder.freeze = 3;
  v.freeze = -3;
  setRest(a, v, itr, false);
  if (withSpark) spark(world, a, v, itr);
}

function startCatch(world, a, v, itr) {
  v.vx = v.vy = v.vz = 0; a.vx = a.vy = a.vz = 0;
  a.facing = v.ix < a.ix ? 1 : 0;
  v.facing = a.facing ^ 1;
  const ca = Array.isArray(itr.catchingact) ? itr.catchingact[0] : itr.catchingact;
  const cc = Array.isArray(itr.caughtact) ? itr.caughtact[0] : itr.caughtact;
  if (!ca || !cc) return;
  a.frame = ca; v.frame = cc; a.waitCnt = v.waitCnt = 0;
  a.catching = v; v.caughtBy = a; a.catchTimer = 300; v.fall = 0;
  if (v.weapon) dropWeapon(world, v);
}

function pickUp(world, a, v, itr) {
  if (a.hold !== 0 || v.hold !== 0) return;
  const t = v.type;
  const link = (h) => { a.hold = h; v.hold = -Math.abs(h % 100 === 1 ? 1 : h); a.weapon = v; v.holder = a; v.team = a.team; v.scoreOwner = a.scoreOwner; a.stats.picking++; };
  if (itr.kind === 7) { link(v.id === 120 || v.id === 124 ? 101 : 1); a.waitCnt = 0; return; }
  if (t === 1) { a.frame = 115; link(v.id === 120 || v.id === 124 ? 101 : 1); }
  else if (t === 4) { a.frame = 115; link(4); }
  else if (t === 6) { a.frame = 115; link(v.hp < 1 ? 4 : 6); }
  else if (t === 2) { a.frame = 116; link(2); v.hold = -2; }
  a.waitCnt = 0;
}

function windLift(world, a, v, itr) {
  if (itr.kind === 11 && !(v.fallDmg < 0)) return;
  if (v.type === 0) {
    v.fallDmg = -20;
    a.scoreOwner.stats.attack += 11;
    v.acc.x = v.vx / 1.07; v.acc.z = v.vz / 1.07; v.hits = Math.max(v.hits, 1);
    v.frame = 182; v.waitCnt = 0;
    if (v.y > -3) { v.y = -2; v.vy = -6; }
    if (v.vy > -6) v.vy -= 3;
    v.acc.y = v.vy;
    if (v.weapon) dropWeapon(world, v);
  } else if ((v.type === 1 || v.type === 4 || v.type === 6) && v.id !== 201 && v.id !== 202) {
    v.frame = 0; v.vx /= 1.07; v.vz /= 1.07; if (v.y > -3) v.y = -2; v.vy -= 3;
  } else if (v.type === 2) { v.vy -= 2.3; }
}

function wall(a, v) {
  if (a.ix > v.ix + 5 && (v.vx > 0 || v.acc.x > 0)) v.blocked.r = 1;
  if (a.ix < v.ix - 5 && (v.vx < 0 || v.acc.x < 0)) v.blocked.l = 1;
  if (a.iz > v.iz + 2 && (v.vz > 0 || v.acc.z > 0)) v.blocked.d = 1;
  if (a.iz < v.iz - 2 && (v.vz < 0 || v.acc.z < 0)) v.blocked.u = 1;
}

function pull(a, v) {
  v.vx += a.ix < v.ix ? -1 : 1;
  v.vz += a.iz < v.iz ? -0.5 : 0.5;
}

function freezeHit(world, a, v, itr) {
  if (v.type !== 0) { pull(a, v); return; }
  let dmg = itr.injury || 0;
  if (v.defPct > 0) dmg = Math.floor(dmg * 100 / v.defPct);
  v.hp -= dmg; v.cap -= Math.trunc(dmg / 3); v.stats.hpLost += dmg; a.scoreOwner.stats.attack += dmg;
  v.frame = 200; v.waitCnt = 0; v.engineSound(14);
  v.facing = a.facing ^ 1;
  if ((itr.vrest || 0) > 0) v.vrest.set(a.slot, itr.vrest);
  if (v.weapon) dropWeapon(world, v);
}

// ---------------------------------------------------------------- FUN_004196f0
export function applyKnockback(o) {
  if (o.freeze !== 0 || o.hits <= 0) return;
  const n = o.hits;
  o.vx = o.acc.x * 2 / (n + 1);
  o.vy = o.acc.y * 2 / (n + 1);
  o.vz = o.acc.z * 2 / (n + 1);
  o.hits = 0; o.acc.x = o.acc.y = o.acc.z = 0;
}

// ---------------------------------------------------------------- bat / giu / nem
function placeCaught(a, v) {
  const af = a.fr(), vf = v.fr();
  if (!af || !vf || !af.cpoint || !vf.cpoint) return;
  const ax = a.facing === 0 ? a.x - af.centerx + af.cpoint.x : a.x + af.centerx - af.cpoint.x;
  const ay = a.y - af.centery + af.cpoint.y;
  v.x = v.facing === 0 ? ax + vf.centerx - vf.cpoint.x : ax - vf.centerx + vf.cpoint.x;
  v.y = ay + vf.centery - vf.cpoint.y;
  v.z = a.z;
  const cover = val(af.cpoint.cover);
  if (cover % 10 === 0) { v.z -= 1; v.y += 1; } else { v.z += 1; v.y -= 1; }
  if (Math.floor(cover / 10) === 1) v.facing = a.facing;
  else if (Math.floor(cover / 10) === 2) v.facing = a.facing ^ 1;
  v.ix = Math.trunc(v.x); v.iy = Math.trunc(v.y); v.iz = Math.trunc(v.z);
}

export function catching(world, a) {
  const v = a.catching;
  if (!v) return;
  const af = a.fr();
  const vf = v.fr();
  const cp = af && af.cpoint;
  if (!v.active || !cp || cp.kind !== 1 || !vf || !vf.cpoint || vf.cpoint.kind !== 2 || v.caughtBy !== a) {
    // mat lien ket: tha nan nhan
    if (v.caughtBy === a) {
      v.caughtBy = null;
      if (v.active && v.hp > 0 && !(vf && vf.cpoint && vf.cpoint.kind === 2 && false)) {
        if (vf && vf.cpoint && vf.cpoint.kind === 2) { v.frame = 212; v.vy = -3; v.y = Math.min(v.y, -2); }
      }
    }
    a.catching = null;
    return;
  }
  if (a.freeze < 0) return;
  const c = a.cur, t = a.t;
  // dong ho giu [V]
  const dec = val(cp.decrease);
  if (dec > 0) a.catchTimer -= dec; else if (dec < 0) a.catchTimer += dec;
  if (a.catchTimer < 0) {
    a.frame = 0; v.frame = 181; v.vx = a.facing === 0 ? 4 : -4; v.vy = -3; v.y = Math.min(v.y, -1);
    a.catching = null; v.caughtBy = null; v.hits = 1; return;
  }
  // phim trong luc giu [V]
  let nf = 0;
  if (c.attack && t.a > 0) {
    const aa = val(cp.aaction), ta = val(cp.taction);
    const dir = c.left || c.right || c.up || c.down;
    if (aa && (!(c.left || c.right) || !ta)) nf = aa;
    if (ta && dir) nf = ta;
    t.a = 0;
  } else if (c.jump && t.j > 0 && val(cp.jaction)) { nf = val(cp.jaction); t.j = 0; }
  if (nf) {
    if (nf < 0) { a.facing ^= 1; nf = -nf; }
    a.frame = nf; a.waitCnt = 0; v.waitCnt = 0;
    const nfr = a.fr();
    if (nfr && nfr.cpoint && val(nfr.cpoint.vaction)) {
      let va = val(nfr.cpoint.vaction);
      if (va < 0) { v.facing ^= 1; va = -va; }
      v.frame = va;
    }
  }
  if (val(cp.dircontrol) === 1 && a.waitCnt === 2) {
    if (c.right && !c.left) a.facing = 0;
    if (c.left && !c.right) a.facing = 1;
  }
  const cur = a.fr();
  const ccp = cur.cpoint;
  if (!ccp || ccp.kind !== 1) return;
  // nem [V]
  if (val(ccp.throwvx) !== 0) {
    const ti = val(ccp.throwinjury);
    if (ti >= 1) { v.fallDmg = ti; v.thrower = a; }
    placeCaught(a, v);
    v.vx = (a.facing ? -1 : 1) * val(ccp.throwvx);
    v.vy = val(ccp.throwvy);
    const tz = val(ccp.throwvz);
    if (tz) { if (c.up && !c.down) v.vz = -tz; else if (c.down && !c.up) v.vz = tz; }
    let va = val(ccp.vaction);
    if (va < 0) { v.facing ^= 1; va = -va; }
    if (va) v.frame = va;
    v.waitCnt = 0;
    a.catching = null; v.caughtBy = null;
    if (cur.next) { a.frame = Math.abs(cur.next) === 999 ? 0 : Math.abs(cur.next); a.waitCnt = 0; }
    return;
  }
  // giu nan nhan (FUN_004187b0) [V]
  const hurt = val(ccp.hurtable);
  let va = val(ccp.vaction);
  if (va && ((v.freeze === 0 && hurt === 1) || hurt === 0)) {
    if (va < 0) { va = -va; if (v.frame !== va) v.facing ^= 1; }
    v.frame = va;
  }
  const inj = val(ccp.injury);
  if (inj !== 0 && a.waitCnt === 0 && !a.catchHitDone) {
    if (inj < 0) { v.hp += inj; v.cap += Math.trunc(inj / 3); }
    else {
      const d = v.defPct > 0 ? Math.floor(inj * 100 / v.defPct) : inj;
      if (v.hp > 0 && v.hp <= d) a.scoreOwner.stats.kills++;
      v.hp -= d; v.cap -= Math.trunc(d / 3); v.stats.hpLost += d; a.scoreOwner.stats.attack += d;
    }
    a.freeze = 2; v.freeze = -3; a.catchHitDone = true;
    v.engineSound(0);
  }
  if (a.waitCnt !== 0) a.catchHitDone = false;
  placeCaught(a, v);
}
