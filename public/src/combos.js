// Liet ke chieu (combo) cua mot nhan vat tu du lieu: cac truong hit_Fa..hit_ja cua frame.
// Combo trong engine: Do > huong > Danh/Nhay (FUN_00412800..00412f40), "F" = huong dang quay mat.
const FIELDS = [
  ["hit_Fa", ["def", "fwd", "atk"]], ["hit_Ua", ["def", "up", "atk"]], ["hit_Da", ["def", "down", "atk"]],
  ["hit_Fj", ["def", "fwd", "jump"]], ["hit_Uj", ["def", "up", "jump"]], ["hit_Dj", ["def", "down", "jump"]],
  ["hit_ja", ["def", "jump", "atk"]],
];

const pretty = (s) => (s || "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// mp = A*1000 + B => ton 10*A HP va B MP; am = tru moi lan vao frame (giu chieu)
export function costText(mp) {
  if (!mp) return "";
  if (mp < 0) return `${-mp} MP/lần`;
  const A = Math.floor(mp / 1000), B = mp % 1000;
  return [B ? `${B} MP` : "", A ? `${A * 10} HP` : ""].filter(Boolean).join(" + ");
}

export function listCombos(data) {
  const frames = data.frames;
  const out = [];
  const seen = new Set();
  const ids = Object.keys(frames).map(Number).sort((a, b) => a - b);
  // frame 0 (dung) truoc: day la chieu dung duoc binh thuong; sau do cac frame khac (chieu noi tiep / tu the dac biet)
  for (const fid of [0, ...ids.filter((i) => i !== 0)]) {
    const f = frames[fid];
    if (!f) continue;
    for (const [field, seq] of FIELDS) {
      const t = f[field];
      if (!t) continue;
      const target = frames[Math.abs(t)];
      if (!target) continue;
      const key = `${field}:${Math.abs(t)}`;
      const ctxKey = fid === 0 ? "" : pretty(f.name);
      if (fid !== 0 && seen.has(key)) continue;      // da co tu tu the dung
      if (seen.has(`${key}:${ctxKey}`)) continue;
      seen.add(key); seen.add(`${key}:${ctxKey}`);
      out.push({ seq, name: pretty(target.name), cost: costText(target.mp), when: fid === 0 ? "" : ctxKey, frame: Math.abs(t) });
    }
  }
  return out;
}

// Ten phim hien thi theo bo dieu khien hien tai
export function seqText(seq, keyNames) {
  return seq.map((k) => keyNames[k]).join(" ");
}
