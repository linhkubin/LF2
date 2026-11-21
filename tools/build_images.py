"""Doi anh LF2 (BMP 8-bit RLE8) sang PNG cho trinh duyet.

- sprite/**.bmp   -> PNG RGBA, mau den (0,0,0) thanh trong suot (color key cua lf2.exe).
- bg/**.bmp       -> PNG; lop co `transparency: 0` trong bg.dat giu nguyen (khong key),
                     con lai key mau den.
- Tai nguyen nhung trong lf2.exe (RT_BITMAP: menu, font WORDS, SPARK, FRAME, BARS...)
                  -> ui/opaque/NAME.png (RGB) va ui/keyed/NAME.png (den -> trong suot).
- *_mirror.bmp mac dinh bo qua (ban web lat bang canvas); dung --mirror de xuat ca chung.

Dung: python build_images.py --game C:\\Users\\ADMIN\\Desktop\\LF2 --out ..\\public\\assets [--mirror]
"""
import argparse
import glob
import json
import os
import struct
import sys

from io import BytesIO

from PIL import Image, ImageChops

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lf2data as L


def keyed(im):
    """RGBA, pixel den tuyet doi (0,0,0) -> alpha 0."""
    rgb = im.convert("RGB")
    r, g, b = rgb.split()
    alpha = ImageChops.lighter(r, ImageChops.lighter(g, b)).point(lambda v: 255 if v else 0)
    rgb.putalpha(alpha)
    return rgb


def decode_dib(dib):
    """Giai DIB 8-bit (BI_RGB hoac BI_RLE8) chiu loi.

    Nhieu BMP cua LF2 co luong RLE ngan hon khai bao (Pillow tu choi). Pixel khong
    duoc ghi (bo qua bang EOL/delta/het du lieu) lay CHI SO 0 cua palette, giong GDI
    cua Windows ma lf2.exe dung de nap anh (vd bg/sys/lf/land1.bmp: palette[0] la mau
    dat nen nen o khong ghi phai lien mach voi dat).
    Dinh dang khac 8-bit thi tra None de dung Pillow.
    """
    hdr, w, h, _, bpp, comp = struct.unpack_from("<IiiHHI", dib, 0)
    if bpp != 8 or comp not in (0, 1):
        return None
    ncol = struct.unpack_from("<I", dib, 32)[0] or 256
    pal = dib[hdr: hdr + 4 * ncol]
    bits = dib[hdr + 4 * ncol:]
    H = abs(h)
    idx = bytearray(w * H)
    if comp == 0:
        stride = (w + 3) // 4 * 4
        for y in range(H):
            row = bits[y * stride: y * stride + w]
            idx[y * w: y * w + len(row)] = row
    else:
        x = y = i = 0
        n_bits = len(bits)
        while i + 1 < n_bits and y < H:
            n, v = bits[i], bits[i + 1]; i += 2
            if n:
                k = max(0, min(n, w - x))
                if k:
                    o = y * w + x
                    idx[o:o + k] = bytes([v]) * k
                x += n
            elif v == 0:
                x = 0; y += 1
            elif v == 1:
                break
            elif v == 2:
                if i + 1 >= n_bits: break
                x += bits[i]; y += bits[i + 1]; i += 2
            else:
                run = bits[i:i + v]
                k = max(0, min(len(run), w - x))
                if k:
                    o = y * w + x
                    idx[o:o + k] = run[:k]
                x += v
                i += v + (v & 1)
    im = Image.frombytes("P", (w, H), bytes(idx))
    im.putpalette(b"".join(pal[4 * k: 4 * k + 3][::-1] for k in range(ncol)))
    rgb = im.convert("RGB")
    if h > 0:  # DIB luu tu duoi len
        rgb = rgb.transpose(Image.FLIP_TOP_BOTTOM)
    return rgb


def load_bmp(path):
    data = open(path, "rb").read()
    if data[:2] != b"BM":
        raise ValueError("khong phai BMP")
    im = decode_dib(data[14:])
    return im if im is not None else Image.open(path).convert("RGB")


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def opaque_bg_files(game):
    """Cac file nen duoc dung o lop transparency: 0 (ve dac, khong key)."""
    opaque, keyed_ = set(), set()
    for p in glob.glob(os.path.join(game, "bg", "**", "bg.dat"), recursive=True):
        with open(p, "rb") as f:
            bg = L.parse_bg(L.decrypt(f.read()))
        for layer in bg["layers"]:
            if not layer.get("path"):
                continue
            key = layer["path"].lower()
            (opaque if layer.get("transparency", 1) == 0 and "rect" not in layer else keyed_).add(key)
    return opaque - keyed_, opaque & keyed_


# --- tai nguyen nhung trong exe (thu muc tai nguyen PE, RT_BITMAP = 2) ------------
def exe_bitmaps(exe_path):
    d = open(exe_path, "rb").read()
    u16 = lambda o: struct.unpack_from("<H", d, o)[0]
    u32 = lambda o: struct.unpack_from("<I", d, o)[0]
    pe = u32(0x3C)
    nsec, optsz = u16(pe + 6), u16(pe + 20)
    rsrc_rva = u32(pe + 24 + 96 + 2 * 8)          # data directory 2 = resource
    sec = pe + 24 + optsz
    for k in range(nsec):
        s = sec + 40 * k
        va, raw = u32(s + 12), u32(s + 20)
        if va <= rsrc_rva < va + u32(s + 8):
            base = raw + (rsrc_rva - va)
            rva2off = lambda rva: rva - va + raw
            break
    else:
        raise RuntimeError("khong tim thay .rsrc")

    def entries(o):
        n = u16(o + 12) + u16(o + 14)
        return [struct.unpack_from("<II", d, o + 16 + 8 * i) for i in range(n)]

    def name(nm):
        if nm & 0x80000000:
            p = base + (nm & 0x7FFFFFFF)
            return d[p + 2: p + 2 + 2 * u16(p)].decode("utf-16le")
        return nm

    for nm, off in entries(base):
        if name(nm) != 2:
            continue
        for nm2, off2 in entries(base + (off & 0x7FFFFFFF)):
            for _, off3 in entries(base + (off2 & 0x7FFFFFFF)):
                de = base + off3
                fo, sz = rva2off(u32(de)), u32(de + 4)
                dib = d[fo: fo + sz]
                hdr = struct.unpack_from("<I", dib, 0)[0]
                bpp = struct.unpack_from("<H", dib, 14)[0]
                ncol = struct.unpack_from("<I", dib, 32)[0] or (1 << bpp if bpp <= 8 else 0)
                # Them BITMAPFILEHEADER de Pillow doc DIB (ca RLE8)
                bfh = b"BM" + struct.pack("<IHHI", 14 + len(dib), 0, 0, 14 + hdr + 4 * ncol)
                im = decode_dib(dib)
                yield name(nm2), (im if im is not None else Image.open(BytesIO(bfh + dib)).convert("RGB"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mirror", action="store_true")
    a = ap.parse_args()
    game, out = a.game, a.out
    report = {"sprite": 0, "bg_keyed": 0, "bg_opaque": 0, "ui": 0, "skipped_mirror": 0, "errors": []}
    opaque, conflict = opaque_bg_files(game)
    if conflict:
        report["errors"].append(f"file vua dac vua trong suot (da key): {sorted(conflict)}")

    for src in sorted(glob.glob(os.path.join(game, "sprite", "**", "*.bmp"), recursive=True)):
        rel = os.path.relpath(src, game).replace("\\", "/")
        if rel.lower().endswith("_mirror.bmp") and not a.mirror:
            report["skipped_mirror"] += 1
            continue
        try:
            save(keyed(load_bmp(src)), os.path.join(out, rel[:-4] + ".png"))
            report["sprite"] += 1
        except Exception as e:
            report["errors"].append(f"{rel}: {e}")

    for src in sorted(glob.glob(os.path.join(game, "bg", "**", "*.bmp"), recursive=True)):
        rel = os.path.relpath(src, game).replace("\\", "/")
        try:
            im = load_bmp(src)
            if rel.lower() in opaque:
                save(im.convert("RGB"), os.path.join(out, rel[:-4] + ".png")); report["bg_opaque"] += 1
            else:
                save(keyed(im), os.path.join(out, rel[:-4] + ".png")); report["bg_keyed"] += 1
        except Exception as e:
            report["errors"].append(f"{rel}: {e}")

    for nm, im in exe_bitmaps(os.path.join(game, "lf2.exe")):
        save(im.convert("RGB"), os.path.join(out, "ui", "opaque", f"{nm}.png"))
        save(keyed(im), os.path.join(out, "ui", "keyed", f"{nm}.png"))
        report["ui"] += 1

    with open(os.path.join(out, "images_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print({k: v for k, v in report.items() if k != "errors"}, "errors:", len(report["errors"]))


if __name__ == "__main__":
    main()
