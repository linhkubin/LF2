// AI may (nhan vat type 0 do may dieu khien). Bam theo lf2.exe:
//   AI.think()   ~ FUN_004094b0 (AI chung: chon muc tieu, ne dan, nhat vat, di chuyen, danh, do)
//   special()    ~ FUN_00403a40 (chieu dac biet theo data.id)
//   basicFight() ~ FUN_004034f0 (danh thuong / do / bat ke dang lao toi)
//   holding()    ~ FUN_00408cb0 (khi dang cam vat)
// Nguon: analysis/engine_notes/03d_ai_objects.md muc 5-6, 06_characters_ai.md muc 3, scratch/c_4094b0.c.
// Gia lap phim: moi tick xoa sach phim roi tinh lai. "press" = dat cur=1 (giu); "tap" = cur=1 va prev=0
// (exe ghi thang byte phim tick truoc = 0 de tao canh nhan moi -> chay/double-tap). Chieu dac biet:
// exe dat thang byte combo = 3 -> o day goi o.fireCombo(code).
// lvl: 2 Easy, 1 Normal, 0 Difficult/CRAZY; rand(0) = 0 nen lvl 0 phan ung 100%.
// [I] = suy luan (tai lieu danh dau chua ro / decompiler mat toan hang).

const NONE = { up: false, down: false, left: false, right: false, attack: false, jump: false, defend: false };
const abs = Math.abs;
const ftol = Math.trunc;
const SMART_DEF = new Set([2, 4, 6, 7, 8, 9, 10, 11, 33, 34]);   // nhom "biet do / bat" trong 4034f0
const ARCHERS = new Set([4, 5, 31]);                             // Henry, Rudolf, Hunter
const MELEE_WEAPONS = new Set([100, 101, 120, 121, 124]);

// ---- quan he phe
// team 0 (Independent): exe gan team = 10+slot luc vao tran -> moi nguoi mot phe; phan than/dan theo chu.
function rootOf(o) { return o.owner || o.scoreOwner || o; }
function sideKey(o) { return o.team !== 0 ? o.team : rootOf(o); }
function isEnemy(w, S, o) {
  if (o === S) return false;
  if (w.mode === "stage") return (o.team !== S.team && S.team === 5) || (o.team === 5 && S.team !== 5);
  return sideKey(o) !== sideKey(S);
}
function isAlly(S, o) { return o !== S && o.team !== 0 && o.team === S.team; }
// "hurt" trong 403a40: hp2 (+0x300) = o.cap
function hurt(o, k = 70) { return (o.hp < o.cap - k && o.hp < 140) || (o.hp < (o.cap * 3) / 5 && o.hp > 139); }
// S quay mat ve phia T
function faces(S, T) { return (S.facing === 0 && S.ix < T.ix) || (S.facing === 1 && T.ix < S.ix); }

export class AI {
  constructor(level) {
    this.level = Math.max(0, level | 0);
    this.target = null;          // +0x360 muc tieu dinh (sticky)
    this.dest = null;            // +0x3fc/+0x400 diem den do lenh doi (call)
    this.passive = 0;            // +0x404 che do giu/cho (lenh Def x4)
    this.seenHist = new Map();   // lich su phim cua nguoi choi da xu ly (lenh doi)
  }

  clone() { return new AI(this.level); }

  // ================================================================ FUN_004094b0
  think(w, S) {
    const K = { ...NONE };
    const edges = new Set();
    this.K = K; this.edges = edges; this.w = w; this.S = S;
    try {
      this.run(w, S);
    } finally {
      // canh nhan moi: prev[k]=0 (o.cur se thanh o.prev ngay sau think trong World.step)
      if (edges.size) { const c = { ...(S.cur || NONE) }; for (const k of edges) c[k] = false; S.cur = c; }
    }
    return K;
  }

  press(k) { this.K[k] = true; }
  tap(k) { this.K[k] = true; this.edges.add(k); }
  rand(n) { return this.w.rand(n); }

  combo(code) {
    const S = this.S;
    // [I] combo chi chay khi khong hitstop/bi tom (exe: may trang thai combo nam trong 413080)
    if (S.freeze === 0 && !S.caughtBy) S.fireCombo(code);
    return true;
  }
  dir8(T) { return this.combo(this.S.ix < T.ix ? "RJ" : "LJ"); }
  dir4(T) { return this.combo(this.S.ix < T.ix ? "RA" : "LA"); }

  // lenh doi tu nguoi choi cung team (41bc90 ~2470): 9,0,9,0 goi; 9x4 giu; 9,5,9,5 chu dong
  teamOrders(w, S) {
    if (S.team === 0) return;
    for (const P of w.chars()) {
      if (P === S || P.ai || P.slot >= 10 || P.hp <= 0 || P.team !== S.team || !P.history) continue;
      if (this.seenHist.get(P) === P.history) continue;
      this.seenHist.set(P, P.history);
      const h = P.history.slice(-4).join(",");
      if (h === "9,0,9,0") this.dest = { x: P.ix + this.rand(81) - 40, z: P.iz + this.rand(81) - 40 };   // [I] bien do rand
      else if (h === "9,9,9,9") this.passive = 1;
      else if (h === "9,5,9,5") this.passive = 0;
    }
  }

  run(w, S) {
    const K = this.K;
    const stage = w.mode === "stage";
    const fr = S.fr();
    if (!fr) return;
    this.teamOrders(w, S);

    // ---- Pha A: stage da clear ("GO!") -> chay sang phai
    const sd = w.stageDirector || w.stage;
    if (stage && (w.stageGo || (sd && sd.cleared && sd.goTimer > 0))) {
      this.tap("right");
      if (S.blocked.u) this.tap("attack");
      return;
    }
    // ---- Pha A: di toi diem den (lenh goi dong doi)
    if (this.dest) {
      const d = this.dest, iS0 = S.state;
      if (d.x + 6 < S.ix) {
        this.press("left");
        if (d.x + 250 < S.ix && this.rand(3 * this.lvlOf(w, S) + 3) === 0) this.tap("left");
        if (S.ix < d.x + 100 && iS0 === 2 && S.facing === 1) this.press("right");
      } else if (S.ix < d.x - 6) {
        this.press("right");
        if (S.ix < d.x - 250 && this.rand(3 * this.lvlOf(w, S) + 3) === 0) this.tap("right");
        if (d.x - 100 < S.ix && iS0 === 2 && S.facing === 0) this.press("left");
      }
      if (S.iz < d.z - 3) this.press("down");
      else if (d.z + 3 < S.iz) this.press("up");
      if (S.blocked.u || S.blocked.d) this.tap("attack");
      if (abs(d.z - S.iz) <= 90 && abs(d.x - S.ix) <= 90) this.dest = null;
      return;
    }

    const lvl = this.lvlOf(w, S);
    const L3 = 3 * lvl, L5 = 5 * lvl, L20 = 20 * lvl;
    const bound = w.bound >= 1 ? w.bound : w.bg.width;      // DAT_0044f604
    const [zmin] = w.bg.zboundary;
    const chars = w.chars();

    // ---- Pha B: co ban than / dong doi (chi Stage, team != 5)
    let needHeal = false, noMilk = false, noBeer;
    let f608 = 0;
    if (stage && S.team !== 5) {
      needHeal = !((S.hpMax * 4) / 5 < S.hp || S.hpMax - 130 < S.hp);
      let mates = 0;
      noMilk = S.hp > 430 || S.hpMax - 130 < S.hp;
      for (const c of chars) {
        if (c === S || c.hp <= 0 || c.team !== S.team) continue;
        if (c.hp < S.hp) needHeal = false;
        if (c.hp < S.hp - 200) noMilk = true;
        mates++;
      }
      if (mates === 0) needHeal = false;
      // DAT_0044f608: khong chay qua xa len truoc nguoi choi dan dau
      let front = -1, frontZ = 0;
      for (const c of chars) if (c !== S && c.slot < 10 && c.hp > 0 && front < c.ix) { front = c.ix; frontZ = c.iz; }
      if (front >= 0) {
        // [I] toan hang x87 bi mat: lay |dz|/2 + (S.x - front) > 200
        if (front < S.ix && abs(S.iz - frontZ) / 2 + S.ix - front > 200) f608 = 1;
        if (front + 400 < S.ix) f608 = 2;
      }
    }
    if (S.owner) noMilk = true;
    noBeer = !!S.owner || S.mp > 250 || (stage && S.team === 1);
    this.f608 = f608;

    // ---- Pha C1: dich gan nhat theo |dx|+|dz| (nhan vat, hoac vat state 3000 dang bay toi S)
    let T = null, best = 10000;
    for (const o of w.objects) {
      if (!o.active || o === S) continue;
      if (o.type !== 0) {
        if (o.state !== 3000) continue;
        if (!((S.ix < o.ix && o.vx < 0) || (o.ix < S.ix && o.vx > 0))) continue;
      }
      if (!isEnemy(w, S, o) || o.hp <= 0 || o.state === 14 || abs(o.blink) >= 3) continue;
      const d = abs(o.iz - S.iz) + abs(o.ix - S.ix);
      if (d < best) { best = d; T = o; }
    }
    const dist = best;                                           // local_28
    const zNear = T && abs(T.iz - S.iz) < 15 ? 1 : 0;            // local_2c
    // ---- C2: dich dang nam / bat tu gan (|dx|<250,|dz|<40) uu tien (de tranh xa)
    if (S.state !== 9) {
      let b2 = 10000;
      for (const o of w.objects) {
        if (!o.active || o === S || !isEnemy(w, S, o) || o.hp <= 0) continue;
        if (!(o.state === 14 || abs(o.blink) > 2)) continue;
        const dx = abs(o.ix - S.ix), dz = abs(o.iz - S.iz);
        if (dx + dz < b2 && dz < 40 && dx < 250) { b2 = dx + dz; T = o; }
      }
    }
    // ---- C3: muc tieu dinh, giu voi xac suat 29/30
    const old = this.target;
    if (!old) this.target = T;
    else if (old.active && old.hp > 0 && this.rand(30) > 0 && old.type === 0) T = old;
    else this.target = T;

    if (!T) { this.noTarget(S); return; }
    const enemy = T;

    // ---- C4/C5: quet vat (slot >= 20): ne dan 200/211/212, nhat vu khi/sua/bia, bong hoi
    let threat = 0, ballZ = 0, upSide = 0, downSide = 0, right = 0, left = 0, picked = 0, bestItem = 10000;
    for (const o of w.objects) {
      if (!o.active || o.slot < 20 || o === S) continue;
      const id = o.id;
      if (id === 200) {
        const g = Math.trunc(o.frame / 10);
        let danger = g === 6 && o.team !== S.team;
        if (g === 5 && (S.id === 2 || S.id === 34) && (S.hpMax - 70 <= S.hp || S.hpMax - 200 <= S.hp) &&
            ((S.hpMax * 3) / 5 <= S.hp || S.hp < S.hpMax - 200) && o.team === S.team) danger = true;   // bong hoi cua minh khi con khoe
        if (danger) {
          threat = 1;                                           // local_18
          if (abs(o.iz - S.iz) < 25 && abs(o.ix - S.ix) < 150) {
            ballZ = 1;                                          // local_30
            if (S.iz < o.iz) downSide = 1; else upSide = 1;    // local_24 / local_20
            if (S.ix < o.ix) right = 1; else left = 1;          // local_40 / local_4c
          }
        }
      }
      if ((id === 211 && o.state === 18) || (id === 212 && o.frame > 149 && o.frame < 171)) {
        if (abs(o.ix - S.ix) < 80) {
          if (S.iz + 20 < o.iz) downSide = 1;
          else if (o.iz < S.iz - 20) upSide = 1;
        }
        if (abs(o.iz - S.iz) < 20) {
          if (S.ix + 100 < o.ix) right = 1;
          else if (o.ix < S.ix - 100) left = 1;
        }
      }
      if (picked === 0) {
        if (zNear === 0 && threat === 0) {
          const d = abs(o.iz - S.iz) + abs(o.ix - S.ix);
          const st = o.state;
          if (S.hold === 0 && d < dist * 2 && d < bestItem && (Math.trunc(id / 100) === 1 || id === 213) &&
              o.hold === 0 && (st === 1004 || st === 2004) && !(noMilk && id === 122) && !(noBeer && id === 123) &&
              (this.passive !== 1 || id === 122)) {
            T = o; bestItem = d;
          }
        }
      }
      if (id === 200 && Math.trunc(o.frame / 10) === 5 && abs(o.ix - S.ix) < 300 && abs(o.iz - S.iz) < 90 && o.team === S.team) {
        if ((S.hp < S.cap - 70 && S.hp < 140) || (S.hp < (S.cap * 3) / 5 && S.hp > 139)) T = o;   // di vao bong hoi
        picked = 1;
      }
      if (needHeal && id === 122 && o.state === 1004 && S.hold === 0) { T = o; picked = 1; }
    }
    if (threat === 1) T = enemy;

    const iT = T.state, iS = S.state;
    const dxT = abs(T.ix - S.ix), dzT = abs(T.iz - S.iz);
    const inRange = dzT < 151 && dxT < 241;                     // vung phan ung khi passive
    const active = this.passive === 0 || inRange;

    // bi chan boi vat can (itr kind 14) -> danh
    if (this.rand(L5 + 8) === 0 && (S.blocked.r || S.blocked.l || S.blocked.d || S.blocked.u)) this.tap("attack");

    // ---- D1: muc tieu la dan dang bay toi: do + quay mat
    if (iT === 3000) {
      if (iS !== 7 && this.rand(L3) === 0) {
        if ((S.ix < T.ix && T.ix < S.ix + 200 && T.vx < 0) || (T.ix < S.ix && S.ix - 200 < T.ix && T.vx > 0)) this.tap("defend");
      }
      if (S.ix < T.ix && S.facing === 1) this.press("right");
      if (S.ix > T.ix && S.facing === 0) this.press("left");
      return;
    }
    // ---- che do giu (passive): uong ngay neu dang cam sua/bia, dung tai cho va quay mat
    if (this.passive === 1) {
      if (S.hold > 0 && S.weapon && (S.weapon.id === 122 || S.weapon.id === 123)) { this.tap("attack"); return; }
      if (S.ix < T.ix && S.facing === 1) this.press("right");
      if (T.ix < S.ix && S.facing === 0) this.press("left");
      if (iS === 2) { if (S.facing === 1) this.press("right"); else this.press("left"); }
    }
    // ---- D2: muc tieu la vat nam dat -> di toi va nhat
    if (iT === 1004 || iT === 2004) {
      let walk = true;
      if (this.passive !== 0 && !inRange && T.id !== 122 && T.id !== 123) walk = false;
      if (walk) {
        if (T.ix + 6 < S.ix) {
          this.press("left");
          if (T.ix + 250 < S.ix && this.rand(L3 + 3) === 0) this.tap("left");
          if (S.ix < T.ix + 100 && iS === 2 && S.facing === 1) this.press("right");
        } else if (S.ix < T.ix - 6) {
          if (f608 === 0) this.press("right");
          if (S.ix < T.ix - 250 && this.rand(L3 + 3) === 0 && f608 === 0) this.tap("right");
          if (T.ix - 100 < S.ix && iS === 2 && S.facing === 0) this.press("left");
        }
        if (S.iz < T.iz - 3) this.press("down");
        else if (T.iz + 3 < S.iz) this.press("up");
      }
      if (dzT <= 3 && dxT <= 6) this.tap("attack");
      return;
    }
    // ---- D3: dich dang nam / bat tu -> tranh xa, khong danh
    if (active && (iT === 14 || abs(T.blink) >= 3)) {
      if (bound - 30 < T.ix) { this.tap("left"); return; }
      if (T.ix < 30) { this.tap("right"); return; }
      if (dzT > 45 && dxT > 350) return;
      if (S.ix < T.ix) { this.press("left"); if (this.rand(L20 + 35) === 0) this.tap("left"); }
      else { this.press("right"); if (this.rand(L20 + 35) === 0) this.tap("right"); }
      if (T.iz < S.iz || T.iz < zmin + 10) this.press("down"); else this.press("up");
      return;
    }
    // ---- D4: muc tieu la bong hoi (id 200) -> di vao
    if (T.id === 200) {
      if (S.ix + 7 < T.ix) this.press("right");
      else if (T.ix < S.ix - 7) this.press("left");
      if (S.iz + 2 < T.iz) this.press("down");
      else if (T.iz < S.iz - 2) this.press("up");
      return;
    }
    // ---- D5: chieu dac biet theo id
    if (this.special(w, T, S, iS, iT, ballZ, dist, zNear)) return;

    // ---- D6: di chuyen
    if (active) {
      if ((right === 1 || f608 === 1) && iS === 2 && S.facing === 0) this.press("left");   // phanh khi chay vao dan
      if (left === 1 && iS === 2 && S.facing === 1) this.press("right");
      const weak = (S.hp * 2 < T.hp || (S.hp < 101 && S.hpMax > 100)) && stage && T.type === 0 && S.slot > 19 && S.team !== 5;
      if (ARCHERS.has(S.id) || weak) {
        // giu khoang cach 150..170
        if ((S.ix + 170 < T.ix || ((S.ix + 150 < T.ix || (iS === 7 && S.ix < T.ix)) && S.facing === 1)) && right === 0 && f608 === 0) {
          this.press("right"); if (this.rand(L20 + 35) === 0) this.tap("right");
        }
        if ((T.ix < S.ix - 170 || ((T.ix < S.ix - 150 || (iS === 7 && T.ix < S.ix)) && S.facing === 0)) && left === 0) {
          this.press("left"); if (this.rand(L20 + 35) === 0) this.tap("left");
        }
      } else if (iS !== 19) {
        // tien toi khoang 60 px
        if ((S.ix + 60 < T.ix || (S.ix < T.ix && S.facing === 1)) && right === 0 && (f608 === 0 || S.facing === 1)) {
          this.press("right"); if (this.rand(L20 + 35) === 0) this.tap("right");
        }
        if ((T.ix < S.ix - 60 || (T.ix < S.ix && S.facing === 0)) && left === 0) {
          this.press("left"); if (this.rand(L20 + 35) === 0) this.tap("left");
        }
      }
      const dodging = right === 1 || left === 1;
      if (((S.iz + 3 < T.iz && ballZ === 0) || (dodging && upSide === 1)) && downSide === 0 && iS !== 19) this.press("down");
      if (((T.iz < S.iz - 3 && ballZ === 0) || (dodging && downSide === 1)) && upSide === 0 && iS !== 19) this.press("up");
    }

    // ---- D7: dang cam vat
    if (S.hold > 0 && !this.holding(w, T, S, iS, iT, zNear, ballZ, bound)) return;

    // ---- D8: do khi dich dang ra don truoc mat
    if (this.rand(7 * lvl + 10) === 0 && (iT === 3 || Math.trunc(iT / 100) === 3) && dzT < 9 && faces(S, T)) this.press("defend");
    // nhay ngau nhien
    if (active && this.rand((L5 + 10) * 2) < 3 && this.rand(20) < 3 && iT !== 14) this.press("jump");
    // danh thuong (cung thu chi khi dich state 16)
    if (!ARCHERS.has(S.id) || iT === 16) {
      if (abs(T.ix - 2 * ftol(S.vx) - S.ix) < 80 && dzT < 5 && this.rand(L3 + 3) === 0 && iT !== 14) this.press("attack");   // [I] ftol(vx) = vx cua S
    }
    const shootIfFacing = () => { if ((S.ix < T.ix && S.facing === 0) || (S.ix >= T.ix && S.facing === 1)) this.press("attack"); };
    const flee = () => {
      if (active) {
        if ((T.ix < 250 || T.ix < S.ix) && T.ix <= bound - 250) this.tap("right");
        else if (bound - 250 < T.ix || S.ix < T.ix) this.tap("left");
      }
      if (this.passive !== 0 && !inRange) return;
      if (this.rand(17) === 0) this.press("jump");
    };
    const weakStage = (S.hp * 2 < T.hp || (S.hp < 101 && S.hpMax > 100)) && stage && T.type === 0 && S.slot > 19 && S.team !== 5;
    if (S.hold === 0 && iT === 16 && ARCHERS.has(S.id)) {
      // dich bi thuong: ban
      if (abs(T.ix - 2 * ftol(S.vx) - S.ix) <= 349 && dzT <= 4 && this.rand(L3 + 3) === 0) shootIfFacing();
    } else if (S.hold === 0 && iT !== 16 && (ARCHERS.has(S.id) || S.id === 36)) {
      // cung thu / Jan: tha dieu khi dich ap sat, nguoc lai ban tu xa
      // [I] pseudo-code ghi "T.x - S.x < 100" (khong abs); dung abs cho doi xung
      const near = abs(T.ix - S.ix) < 100 && dzT < 80 && this.rand(L3 + 2) === 0;
      if (!near || iS === 7) {
        if (abs(T.ix - 2 * ftol(S.vx) - S.ix) < 300 && dzT < 5 && this.rand(L3 + 3) === 0 && iT !== 14) shootIfFacing();
      } else flee();
    } else if (weakStage) {
      const near = abs(T.ix - S.ix) < 100 && dzT < 80 && this.rand(L3 + 2) === 0;
      if (near && iS !== 7) flee();
    }
    this.basicFight(T, S, iT, zNear, right, left);
  }

  lvlOf(w, S) {
    // stage: phe nguoi choi (khong phai quai) luon lvl 0
    if (w.mode === "stage" && S.team !== 5 && (S.slot < 20 || S.id < 30)) return 0;
    return this.level;
  }

  // khong co muc tieu: huy chieu chay (Firen burn_run, Dennis c_foot, Mark run)
  noTarget(S) {
    if (this.f608 === 1 && (this.passive === 0)) this.press("left");
    const f = S.frame, id = S.id;
    if ((id === 7 && f >= 255 && f <= 261) || (id === 9 && f >= 280 && f <= 290) || (id === 32 && f >= 240 && f <= 245)) this.press("defend");
  }

  // ================================================================ FUN_004034f0
  basicFight(T, S, iT, p5, p6, p7) {
    const lvl = this.lvlOf(this.w, S), L3 = 3 * lvl;
    const dz = abs(T.iz - S.iz);
    if (abs(T.ix - 2 * ftol(S.vx) - S.ix) < 80 && dz < 5 && this.rand(L3 + 3) === 0 && iT !== 14) this.press("attack");
    if (p6 && S.ix < T.ix) return;
    if (p7 && T.ix < S.ix) return;
    void p5;
    if (this.rand(L3 + 1) !== 0) return;
    const dIn = abs(T.ix + 2 * ftol(T.vx) - S.ix);      // vi tri T du doan (T dang toi)
    const charging = () => {
      const tf = T.frame;
      return faces(T, S) && (tf === 110 || tf >= 235);
    };
    const grab = () => {
      // huy chay, huong ve T, danh/nhay
      if (S.ix < T.ix) this.tap("right"); else this.tap("left");
      if (S.id === 34 && this.rand(2) === 0) this.press("jump");
      else this.tap("attack");
    };
    if (SMART_DEF.has(S.id)) {
      if (dIn > 100 && dIn < 900 && dz < 5 && this.rand(L3 + 10) === 0 && iT !== 14) this.press("defend");
      if (dIn > 90 && charging() && dz < 13 && iT !== 14) grab();
    } else if (S.id === 1) {
      const L5 = 5 * lvl;
      if (dIn > 100 && dIn < 300 && dz < 5 && this.rand(L5 + 10) === 0 && iT !== 14) this.press("defend");
      if (dIn > 90 && charging() && dz < 7 && iT !== 14 && this.rand(L5 + 10) === 0) grab();   // [I] rand cua nhanh bat
    }
  }

  // ================================================================ FUN_00408cb0
  // tra true = de 4094b0 tiep tuc; false = dung tai day
  holding(w, T, S, iS, iT, p5, p6, bound) {
    const lvl = this.lvlOf(w, S), L3 = 3 * lvl;
    if (this.rand(L3 + 1) > 0) return false;
    const held = S.weapon ? S.weapon.id : -1;
    const dz = abs(T.iz - S.iz), dx = abs(T.ix - S.ix);
    const lo = Math.min(S.ix, T.ix), hi = Math.max(S.ix, T.ix);
    let allyNear = false;   // dong doi dung giua S va T (chan duong nem)
    for (const c of w.chars()) {
      if (isAlly(S, c) && c.hp > 0 && c.state !== 14 && abs(c.blink) < 3 && abs(c.iz - S.iz) < 15 && c.ix > lo && c.ix < hi) { allyNear = true; break; }
    }
    if (iS === 2 && this.rand(L3 + 5) === 0) { if (allyNear) this.press("jump"); else this.press("attack"); }
    const near = abs(T.ix - 2 * ftol(S.vx) - S.ix);
    if (MELEE_WEAPONS.has(held)) {
      if (near < 115 && dz < 6 && this.rand(L3 + 3) === 0 && iT !== 14) this.press("attack");
      if (held === 124 && this.rand(15 * lvl + 30) === 0) this.press("attack");
      if (this.rand(L3 + 5) === 0) {
        const ok = this.passive === 0 || (dz < 150 && dx < 240);
        if (ok && dx < 600 && dz < 20) {
          // giu huong ve T (A + huong = nem vu khi nhe)
          if (S.ix < T.ix) { if (this.f608 === 0) this.press("right"); } else this.press("left");
        }
      }
    }
    if ((held === 150 || held === 151) && !allyNear) {
      if (near < 300 && dz < 6 && this.rand(5 * lvl + 7) === 0 && iT !== 14) this.press("attack");
    }
    if (held === 122 || held === 123) {
      for (const k in this.K) this.K[k] = false;
      this.edges.clear();
      if (iS === 17 && p5 === 1 && p6 === 0 && S.blink !== 0) { this.press("defend"); return false; }
      if (this.passive !== 0 && dz < 150 && dx < 240) return false;
      // [I] tranh xa T theo z, trong bien san +-30
      const [zmin, zmax] = w.bg.zboundary;
      if (dz < 70) {
        if (T.iz <= S.iz && S.iz < zmax - 30) this.press("down");
        else if (S.iz > zmin + 30) this.press("up");
      }
      if (T.ix < 400 && S.ix < 200) {
        this.press("right"); if (this.rand(7 * lvl + 7) === 0) this.tap("right");
      } else if (T.ix > bound - 400 && S.ix > bound - 200) {
        this.press("left"); if (this.rand(7 * lvl + 7) === 0) this.tap("left");
      } else if (dx < 350 && dz < 70) {
        if (S.ix < T.ix) this.press("left"); else this.press("right");
      } else if (iS === 2) {
        if (S.facing === 0) this.press("left"); else this.press("right");
      } else if (this.rand(5) === 0 && p6 === 0 && (S.id === 2 || S.id === 34) && S.mp > 150 && this.rand(L3 + 3) > 0) {
        this.combo(S.ix <= T.ix ? "LJ" : "RJ");                 // John/Sorcerer: Fj nguoc huong thay vi uong [I y nghia]
      } else this.tap("attack");                                // uong
      return false;
    }
    return true;
  }

  // ================================================================ FUN_00403a40
  special(w, T, S, iS, iT, p5, dist, p7) {
    const lvl = this.lvlOf(w, S);
    if (this.rand(5 * lvl + 1) > 0) return false;
    if (T.type !== 0) return false;
    const id = S.id, MP = S.mp, f = S.frame;
    const dx = abs(T.ix - S.ix), dz = abs(T.iz - S.iz);
    const fc = faces(S, T);
    const pos = (k = -2) => abs(T.ix + k * ftol(S.vx) - S.ix);   // [I] ftol(vx cua S)
    const r = (n) => this.rand(n);
    const in1 = (v, ...a) => a.includes(v);

    switch (id) {
      case 2: case 34: {                                         // John / Sorcerer
        if (r(10) === 0 && MP > 350 && hurt(S)) return this.combo("DJ");     // heal_self
        if (id === 2) {
          if (dist < 10000 && r(30) === 0 && MP > 250) return this.combo("UA");   // biscuit
          if (in1(T.id, 2, 9, 10, 11, 33, 34)) {
            if (r(15) === 0 && dx > 100 && dx < 500 && dz < 30 && MP > 100 && T.mp > 220 && p5 === 0) return this.dir8(T);
          } else if (r(15) === 0 && dx >= 100 && dx <= 249 && dz < 30 && MP > 100 && T.mp > 170 && p5 === 0) return this.dir8(T);
        }
        // hoi dong doi (Uj)
        if (!(S.hold > 0 && f >= 9) && !hurt(S) && p7 === 0) {
          for (const A of w.chars()) {
            if (A.slot > 19 || !isAlly(S, A)) continue;
            const ax = abs(A.ix - S.ix), az = abs(A.iz - S.iz);
            if (ax < 250 && az < 60 && MP > 350 && A.hp > 0 && hurt(A, 90) && az + ax < dist / 3) {
              if (S.ix < A.ix) this.press("right"); else this.press("left");
              if (faces(S, A) || ax < 5) this.combo("UJ");
              return true;
            }
          }
        }
        return false;
      }
      case 1: {                                                  // Deep
        if (f >= 260 && f <= 288 && dx < 100 && dz < 7) {
          if ((T.iy !== 0 || S.iy !== 0 || r(3) !== 0) && (T.iy >= 0 || S.iy >= 0 || r(7) !== 0)) {
            if ((T.iy < 0 && r(5) === 0) || r(30) === 0) { if (fc) this.tap("jump"); }
            return true;
          }
          this.tap("attack"); return true;
        }
        if (dx <= 149 && dz <= 7 && MP > 150 && ((r(10) === 0 && iT !== 3) || (r(3) > 0 && in1(iT, 8, 11, 16)))) return this.dir8(T);
        if (r(7) === 0 && dx < 100 && dz < 7 && MP > 75) {
          if (MP > 150 && ((r(10) === 0 && iT !== 3) || (r(3) > 0 && iT === 16))) return this.dir8(T);
          return this.combo("DA");
        }
        return false;
      }
      case 4: {                                                  // Henry
        if (MP > 360 && dx < 100 && dz < 70 && r(Math.trunc(S.hp / 5) + 10) === 0) return this.combo("UJ");   // flute
        if (r(45) === 0 && dx > 100 && dx < 550 && dz < 20 && MP > 170) return this.dir8(T);                   // super_arrow
        if (r(30) === 0 && MP > 200 && dx > 100 && dx < 160 && dz < 55 && fc) return this.combo("JA");          // 5_arrow
        return false;
      }
      case 5: {                                                  // Rudolf
        if (MP > 450 && dx > 100 && dz > 50 && r(3) === 0) return this.combo(r(2) === 0 ? "UJ" : "DJ");
        if (MP > 70 && dx > 100 && dx < 160 && dz < 8 && r(10) === 0) return this.dir8(T);
        if (r(30) === 0 && MP > 200 && dx > 100 && dx < 160 && dz < 55 && fc) return this.dir4(T);
        return false;
      }
      case 6: {                                                  // Louis
        if (MP > 100 && dx > 80 && dx < 130 && dz < 30 && r(10) === 0) return this.dir8(T);
        if (MP > 100 && dx <= 44 && dz <= 4 && r(3) === 0) return this.combo("UJ");     // r-catch
        if (iS === 9 && r(8) === 0) { this.tap("jump"); return true; }                 // nem ke bi bat
        return false;
      }
      case 7: {                                                  // Firen
        if (f >= 268 && f <= 282) {
          // huy flame (dung nguyen van code: ke ca khi dang quay mat ve T) [?]
          if (in1(iT, 11, 12) || dx > 150 || dz > 25 || fc) { this.tap("defend"); return true; }
        }
        if (iT !== 18 && iT !== 14) {
          if (iT !== 12 && S.hp > 70 && MP > 320 && !(dx < 51 && dz < 11)) {
            if (dx < 85 && T.hp < S.hp && dz < 35 && r(5) === 0) return this.combo("UJ");   // explosion [I so sanh hp]
          }
          if (iT !== 12 && MP > 200 && dx > 100 && dx < 370 && dz < 60 && r(20) === 0) return this.dir8(T);   // burn_run
        }
        if (r(100) === 0 && dx > 240 && dx < 400) return this.dir8(T);
        if (!in1(iT, 18, 14, 12) && MP > 200 && dx > 60 && dx < 280 && dz < 60 && r(15) === 0 && fc) return this.combo("DJ");   // flame
        if (f >= 255 && f <= 261) {                               // dang burn_run: lai theo z hoac huy
          const bad = S.facing === 0 ? (T.ix + 120 < S.ix || S.ix > this.boundOf(w) - 30) : (S.ix < T.ix - 120 || S.ix < 30);
          if (bad || dz > 70 || this.f608 === 1) { this.tap("defend"); return true; }
          const ahead = S.facing === 0 ? S.ix < T.ix : T.ix < S.ix;
          if (ahead ? T.iz <= S.iz : S.iz <= T.iz) this.press("up"); else this.press("down");
        }
        return false;
      }
      case 8: {                                                  // Freeze
        if (iT !== 13) {
          if (MP > 200 && dx < 400 && dz < 170 && r(250) === 0) return this.dir8(T);
          if (iT !== 14 && MP > 200 && dx > 60 && dx < 280 && dz < 65 && r(15) === 0) return this.dir8(T);
        }
        if (iT !== 14 && MP > 320 && !(dx < 51 && dz < 8 && iT !== 13)) {
          if (dx < 125 && dz < 25 && r(3) === 0 && fc) return this.combo("UJ");   // whirlwind
        }
        if (r(50) === 0 && S.hold === 0 && MP > 200 && dx > 200 && dz > 50) return this.combo("DJ");   // kiem bang
        return false;
      }
      case 9: {                                                  // Dennis
        if ((r(10) === 0 || in1(iT, 16, 8)) && pos() < 120 && dz < 7 && fc) return this.combo("DA");
        if (!in1(iT, 18, 14, 12) && MP > 200 && dx > 75 && dx < 370 && dz < 60 && r(13) === 0) return this.dir8(T);
        if (r(Math.trunc(T.hp / 4) + 40) === 0 && dx > 150 && dx < 400) return this.dir8(T);
        if (dist < 10000 && r(30) === 0 && MP > 150) return this.combo("UA");
        return false;
      }
      case 10: {                                                 // Woody
        if (MP > 100 && dx < 280 && dz < 25 && r(10) === 0 && fc) return this.combo("DA");
        if (f === 271 && T.iy < 0 && iT === 12) return this.combo("UA");
        if ((r(10) === 0 || in1(iT, 16, 8)) && pos() < 80 && dz < 7 && fc) return this.combo("UA");
        if (MP > 200 && dx >= 60 && dx <= 279 && dz <= 64 && (r(15) === 0 || (r(4) === 0 && (in1(iT, 16, 8) || (iT === 12 && T.iy <= -41))))) return this.dir8(T);
        if (S.hp < 250 && S.hp < T.hp + 50 && r(20) === 0 && MP > 75) {
          let far = null, fd = -1;
          for (const A of w.chars()) {
            if (!isAlly(S, A) || A.hp <= T.hp) continue;
            const d = abs(A.ix - S.ix) + abs(A.iz - S.iz);
            if (d > fd) { fd = d; far = A; }
          }
          if (far && fd > 300 && S.hold === 0) return this.combo("DJ");   // teleport toi dong doi
        }
        if (T.hp < S.hp && r(70) === 0 && MP > 500) return this.combo("UJ");   // khong bao gio (MP toi da 500)
        return false;
      }
      case 11: {                                                 // Davis
        if (MP > 150 && dx < 280 && dz < 30 && r(10) === 0 && fc) return this.combo("DA");
        if (f === 290 && T.iy < 0) { this.tap("jump"); return true; }   // [I] return 1
        if ((r(5) === 0 || in1(iT, 16, 8)) && pos() < 100 && dz < 7 && MP > 200 && fc) return this.combo("UA");
        return false;
      }
      case 32: {                                                 // Mark
        if (!in1(iT, 18, 14, 12) && MP > 200) {
          if ((dx < 270 && dz < 60 && r(60) === 0) || (dx > 150 && dx < 400 && r(Math.trunc(T.hp / 4) + 40) === 0)) return this.dir8(T);
          if (dx < 150 && dz < 40 && r(15) === 0) return this.dir4(T);   // [I] nam trong dieu kien MP
        }
        return false;
      }
      case 33:                                                   // Jack
        if ((r(5) === 0 || in1(iT, 16, 8)) && pos() < 60 && dz < 7 && MP > 150 && fc) return this.combo("UA");
        return false;
      case 35:                                                   // Monk
        if (r(7) === 0 && dx > 40 && dx < 650 && dz < 4 && MP > 120) return this.dir4(T);
        return false;
      case 36: {                                                 // Jan
        if (MP > 200 && r(5) === 0) {
          for (const A of w.chars()) {
            if (A.slot > 99 || A.team !== S.team) continue;
            if (A.hp < A.hpMax - 200 || (A.hp < 200 && A.hp < A.hpMax - 100)) return this.combo("UJ");   // thien than hoi
          }
          return true;                                           // khong thay ai van return 1 [V]
        }
        if (MP > 260 && r(10) === 0 && dx < 650 && dz < 240) return this.combo("UA");   // quy tan cong
        return false;
      }
      case 38: {                                                 // Bat
        if (MP > 150 && r(5) === 0 && dx > 130 && dx < 250 && dz < 10) return this.dir8(T);
        if (MP > 200 && r(10) === 0 && dz < 10) return this.dir4(T);
        if (MP > 200 && r(10) === 0 && (dx > 200 || dz < 250)) return this.combo("UJ");
        return false;
      }
      case 39: {                                                 // Justin
        if (MP > 100 && r(3) === 0 && dx < 120 && fc && dz < 10) return this.combo("DA");
        if (MP > 100 && r(7) === 0 && dx < 250 && dz < 10) return this.dir4(T);
        return false;
      }
      case 50: {                                                 // LouisEX
        if (r(7) === 0 && dx >= 91 && dx < 500 && dz <= 3 && MP > 150) {
          if (f === 263 || f === 264) { this.tap("attack"); return true; }   // [I] noi chuoi air_push
          return this.dir4(T);
        }
        if (r(7) === 0 && dx < 100 && dz < 7 && MP > 75) return this.combo("DA");
        return false;
      }
      case 51: {                                                 // Firzen
        if (f >= 266 && f <= 279 && (dz > 13 || T.type !== 0)) { this.tap("defend"); return true; }
        if (MP > 300 && r(10) === 0 && dx < 300 && dz < 200) return this.combo("UJ");
        if (MP >= 301 && r(10) === 0 && dx <= 949) return this.combo("UA");
        if (r(5) === 0 && MP > 250 && dx > 40 && dx < 1200 && dz < 13) return this.dir8(T);
        return false;
      }
      case 52: {                                                 // Julian
        if (iT === 3 && MP > 125 && r(10) === 0 && dx < 120 && dz < 10) return this.combo("JA");
        if (MP > 125 && r(5) === 0 && dx < 100 && dz < 30) { if (T.ix <= S.ix) return true; return this.combo("UJ"); }
        if (MP > 125 && r(14) === 0 && dx < 700 && dz < 150) return this.dir4(T);
        if (MP > 125 && r(5) === 0 && dz < 20) return this.dir8(T);
        if ((r(5) === 0 || in1(iT, 16, 8)) && pos() < 100 && dz < 7 && MP < 100 && fc) return this.combo("UA");
        return false;
      }
      default:                                                   // Bandit 30, Hunter 31, Knight 37, Criminal 300: khong co nhanh
        return false;
    }
  }

  boundOf(w) { return w.bound >= 1 ? w.bound : w.bg.width; }
}

export function makeAI(world, o) {
  void o;
  return new AI(Math.max(world.difficulty ?? 1, 0));
}
