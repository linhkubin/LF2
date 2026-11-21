// Ve khung hinh theo lf2.exe (05_render_hud_modes.md):
//  nen   : shift = (layerW-794)*cam/(bgW-794); loop = buoc lat; rect = mau RGB565; cc/c1/c2 = lop theo chu ky
//  object: sap xep tang dan theo z; bong (x-18-cam, z-4) roi sprite (x-centerx-cam, z+y-centery)
//          nhap nhay: hien khi (|t|&3)<2 va t>-25; nan nhan hitstop rung +-3
//  HUD   : panel FRAME 198x54; mat nho (+9,+7); HP (+57,+16), MP (+57,+36); dai = value*31/125
import { picCell } from "./assets.js?v=3";

export const SCREEN_W = 794, SCREEN_H = 550;

const rgb565 = (c) => `rgb(${((c >> 11) & 31) * 255 / 31 | 0},${((c >> 5) & 63) * 255 / 63 | 0},${(c & 31) * 255 / 31 | 0})`;

export function drawBackground(g, bg, cam, tick) {
  bg.layers.forEach((L, i) => {
    if (L.cc && !((tick % L.cc) >= (L.c1 ?? 0) && (tick % L.cc) <= (L.c2 ?? L.cc))) return;
    if ("rect" in L) {
      g.fillStyle = rgb565(L.rect);
      g.fillRect(L.x || 0, L.y || 0, L.width || SCREEN_W, L.height || 0);
      return;
    }
    const img = bg.images[i];
    if (!img) return;
    const lw = L.width || img.width;
    const shift = bg.width > SCREEN_W ? Math.trunc((lw - SCREEN_W) * cam / (bg.width - SCREEN_W)) : 0;
    const step = L.loop || Infinity;
    for (let px = L.x || 0; px < lw; px += step) {
      const sx = px - shift;
      if (sx < SCREEN_W && sx + img.width > 0) g.drawImage(img, sx, L.y || 0);
      if (step === Infinity) break;
    }
  });
}

function drawSprite(g, o, f, cam, shake) {
  const cell = picCell(o.data, f.pic + (o.picOffset || 0)) || (o.picOffset ? picCell(o.data, f.pic) : null);
  if (!cell) return;
  const { sheet, sx, sy, w, h } = cell;
  const dy = o.iz + o.iy - f.centery;
  let dx = o.facing === 0 ? o.ix - f.centerx - cam : o.ix + f.centerx - w - cam;
  if (f.state === 9997) dx = Math.max(0, Math.min(714, o.ix - f.centerx));
  dx += shake;
  if (o.facing === 0) g.drawImage(sheet.img, sx, sy, w, h, dx, dy, w, h);
  else g.drawImage(sheet.mirror, sheet.img.width - sx - w, sy, w, h, dx, dy, w, h);
}

export function drawWorld(g, world, ui, opts = {}) {
  const { bg, cam } = world;
  drawBackground(g, bg, cam, world.tick);
  const list = world.objects.filter((o) => o.active && !o.hidden).sort((a, b) => a.iz - b.iz || a.slot - b.slot);
  const parity = world.tick & 1;
  const sparks = [...world.sparks].sort((a, b) => a.z - b.z);
  let si = 0;
  const drawSparksUpTo = (z) => {
    while (si < sparks.length && sparks[si].z <= z) drawSpark(g, ui.SPARK, sparks[si++], cam);
  };
  for (const o of list) {
    const f = o.fr();
    if (!f) continue;
    drawSparksUpTo(o.iz - 1);
    const t = o.blink;
    const vis = (Math.abs(t) & 3) < 2;
    if (o.hold > -1 && f.state !== 3005 && f.state !== 9997 && o.id !== 223 && o.id !== 224 && t > -70 && vis && bg.shadowImg) {
      const [sw, sh] = bg.shadowsize || [37, 9];
      g.drawImage(bg.shadowImg, o.ix - (sw >> 1) - cam, o.iz - (sh >> 1));
    }
    if (vis && t > -25) drawSprite(g, o, f, cam, o.freeze < 0 ? parity * 6 - 3 : 0);
    if (opts.names && o.name && o.type === 0 && o.hp > 0) {
      drawText(g, ui, o.name, o.ix - cam - o.name.length * 4, o.iz + 4, o.nameColor || 0);
    }
    if (opts.debug && o.type === 0) drawBoxes(g, o, f, cam);
  }
  drawSparksUpTo(Infinity);
}

// SPARK.bmp: 0..4 (102x80) y=0; 5..9 (61x48) y=80; 10..14 (102x80) y=128; 15..19 (61x48) y=208
function drawSpark(g, img, s, cam) {
  if (!img) return;
  const c = s.c;
  let fr;
  if (c < 5) fr = c; else if (c >= 10 && c < 15) fr = c - 5; else if (c >= 20 && c < 29) fr = 10 + ((c - 20) >> 1);
  else if (c >= 30 && c < 39) fr = 15 + ((c - 30) >> 1); else return;
  const big = fr < 5 || (fr >= 10 && fr < 15);
  const w = big ? 102 : 61, h = big ? 80 : 48;
  const i = fr % 5;
  const y = fr < 5 ? 0 : fr < 10 ? 80 : fr < 15 ? 128 : 208;
  g.drawImage(img, i * w, y, w, h, s.x - cam - (big ? 51 : 30), s.sy - (big ? 40 : 24), w, h);
}

function drawBoxes(g, o, f, cam) {
  const box = (b, color) => {
    const left = o.facing === 0 ? o.ix - f.centerx + b.x : o.ix + f.centerx - b.w - b.x;
    g.strokeStyle = color;
    g.strokeRect(left - cam + 0.5, o.iz + o.iy - f.centery + b.y + 0.5, b.w, b.h);
  };
  (f.bdy || []).forEach((b) => box(b, "#3cf"));
  (f.itr || []).forEach((b) => box(b, "#f33"));
}

// Font bitmap WORDS0..5 (CP437): glyph c tai ((c&15)*16, (c>>4)*16+1), rong 8 cao 16 [V 05]
export function drawText(g, ui, text, x, y, color = 0) {
  const img = ui[`WORDS${color}`] || ui.WORDS0;
  if (!img) { g.fillStyle = "#fff"; g.font = "12px monospace"; g.fillText(text, x, y + 12); return; }
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i) & 255;
    g.drawImage(img, (c & 15) * 16, (c >> 4) * 16 + 1, 8, 16, x + i * 8, y, 8, 16);
  }
}

export function drawHud(g, ui, players, tick) {
  players.slice(0, 8).forEach((o, k) => {
    const px = (k % 4) * 198, py = Math.floor(k / 4) * 54;
    if (ui.FRAME) g.drawImage(ui.FRAME, px, py);
    if (!o) return;
    if (o.smallImg) g.drawImage(o.smallImg, px + 9, py + 7);
    const bar = (row, value, x, y) => {
      const len = Math.max(0, Math.floor(value * 31 / 125));
      if (len > 0 && ui.BARS) g.drawImage(ui.BARS, 0, row * 10, Math.min(len, 150), 10, x, y, Math.min(len, 150), 10);
    };
    bar(3, o.cap, px + 57, py + 16);
    bar(2, Math.max(0, o.hp), px + 57, py + 16);
    if (o.heal >= 1000 && tick % 12 < 6) bar(4, Math.max(0, o.hp), px + 57, py + 16);
    bar(1, 500, px + 57, py + 36);
    bar(0, Math.max(0, o.mp), px + 57, py + 36);
  });
}

export function drawDebug(g, o, cam, extra = []) {
  const f = o.fr();
  const lines = [
    `frame ${o.frame} ${f ? f.name : "?"}  state ${f ? f.state : "?"}  wait ${o.waitCnt}/${f ? f.wait : "?"}  next ${f ? f.next : "?"}`,
    `x ${o.x.toFixed(1)} y ${o.y.toFixed(1)} z ${o.z.toFixed(1)}  v ${o.vx.toFixed(1)},${o.vy.toFixed(1)},${o.vz.toFixed(1)}  hp ${o.hp} mp ${o.mp} fall ${o.fall} def ${o.defbar}`,
    ...extra,
  ];
  g.font = "12px monospace";
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(4, SCREEN_H - 8 - lines.length * 15, 560, lines.length * 15 + 4);
  g.fillStyle = "#fff";
  lines.forEach((s, i) => g.fillText(s, 8, SCREEN_H - 10 - (lines.length - 1 - i) * 15));
}
