// Nap du lieu JSON va anh da duoc tools/ chuyen doi.
const BASE = "assets/";

export const png = (path) => BASE + path.replace(/\\/g, "/").replace(/\.bmp$/i, ".png");

const imgCache = new Map();
export function loadImage(path) {
  const url = path.startsWith(BASE) ? path : png(path);
  if (!imgCache.has(url)) {
    imgCache.set(url, new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error("khong nap duoc " + url));
      im.src = url;
    }));
  }
  return imgCache.get(url);
}

export const loadJSON = (p) => fetch(BASE + p).then((r) => {
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
});

// Ban lat ngang cua mot sheet (lf2.exe nap san *_mirror.bmp = lat ca tam).
function mirrorOf(img) {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d");
  g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0);
  return c;
}

// Doi tuong (nhan vat/vu khi/dan) kem anh cac sheet.
export async function loadObject(id) {
  const data = await loadJSON(`data/objects/${id}.json`);
  const sheets = await Promise.all((data.header.files || []).map(async (f) => {
    const img = await loadImage(f.path);
    return { ...f, img, mirror: mirrorOf(img), count: f.row * f.col };
  }));
  data.sheets = sheets;
  return data;
}

// Tim o sprite cho mot pic (o i: left=(i%row)*(w+1), top=floor(i/row)*(h+1)).
export function picCell(obj, pic) {
  for (const s of obj.sheets) {
    if (pic >= s.firstPic && pic < s.firstPic + s.count) {
      const i = pic - s.firstPic;
      return { sheet: s, sx: (i % s.row) * (s.w + 1), sy: Math.floor(i / s.row) * (s.h + 1), w: s.w, h: s.h };
    }
  }
  return null; // pic ngoai sheet: khong ve (vd mot so frame dan)
}

export async function loadBackground(index) {
  const bg = await loadJSON(`data/backgrounds/${index}.json`);
  bg.images = await Promise.all(bg.layers.map((l) => (l.path && !("rect" in l) ? loadImage(l.path) : null)));
  bg.shadowImg = bg.shadow ? await loadImage(bg.shadow) : null;
  return bg;
}
