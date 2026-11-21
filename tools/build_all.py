"""Chay toan bo cong cu du lieu va ghi manifest.json.

Dung: python build_all.py --game C:\\Users\\ADMIN\\Desktop\\LF2 [--out ..\\public\\assets] [--mirror] [--ffmpeg path]
"""
import argparse
import glob
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def run(script, *args):
    print(f"== {script}")
    subprocess.run([sys.executable, os.path.join(HERE, script), *args], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--out", default=os.path.join(HERE, "..", "public", "assets"))
    ap.add_argument("--mirror", action="store_true")
    ap.add_argument("--ffmpeg")
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    base = ["--game", a.game, "--out", out]
    run("build_data.py", *base)
    run("build_images.py", *base, *(["--mirror"] if a.mirror else []))
    run("build_audio.py", *base, *(["--ffmpeg", a.ffmpeg] if a.ffmpeg else []))

    files = sorted(os.path.relpath(p, out).replace("\\", "/")
                   for p in glob.glob(os.path.join(out, "**", "*"), recursive=True) if os.path.isfile(p))
    manifest = {
        "version": 1,
        "source": "Little Fighter 2 v2.0a",
        "data": {"table": "data/data.json", "stages": "data/stages.json", "control": "data/control.json",
                 "objects": "data/objects/{id}.json", "backgrounds": "data/backgrounds/{index}.json"},
        "conventions": {
            "colorKey": "den (0,0,0) da doi thanh alpha 0 trong sprite/ va bg/ (tru lop transparency: 0)",
            "spriteCell": "o i cua file: left=(i%row)*(w+1), top=floor(i/row)*(h+1); pic dau = firstPic",
            "mirror": "khong xuat *_mirror; lat o canvas",
            "bgRect": "layer co rect: mau RGB565 (vd 4706 -> rgb(16,76,16))",
            "paths": "duong dan trong JSON giu nguyen ten goc nhung '/' va duoi .bmp; doi .bmp -> .png khi nap",
        },
        "files": files,
    }
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    print(f"manifest: {len(files)} file")


if __name__ == "__main__":
    main()
