"""Chuan bi am thanh LF2 cho trinh duyet.

- data/*.wav (PCM 8/16-bit, mono, nhieu tan so le): trinh duyet giai ma truc tiep
  bang Web Audio -> chep nguyen, kiem tra doc duoc.
- bgm/*.wma: trinh duyet KHONG phat duoc WMA -> doi sang .ogg (Vorbis) bang ffmpeg
  neu co. Khong co ffmpeg thi bo qua va ghi vao bao cao.

Dung: python build_audio.py --game C:\\Users\\ADMIN\\Desktop\\LF2 --out ..\\public\\assets [--ffmpeg duong_dan]
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import wave


def find_ffmpeg(hint):
    if hint and os.path.exists(hint):
        return hint
    return shutil.which("ffmpeg")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ffmpeg")
    a = ap.parse_args()
    rep = {"wav": [], "music": [], "errors": [], "ffmpeg": None}

    for src in sorted(glob.glob(os.path.join(a.game, "data", "*.wav"))):
        rel = "data/" + os.path.basename(src)
        try:
            with wave.open(src) as w:
                info = {"file": rel, "channels": w.getnchannels(), "rate": w.getframerate(),
                        "bits": 8 * w.getsampwidth(), "seconds": round(w.getnframes() / w.getframerate(), 3)}
        except Exception as e:
            rep["errors"].append(f"{rel}: {e}")
            continue
        dst = os.path.join(a.out, "sound", rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        rep["wav"].append(info)

    ff = find_ffmpeg(a.ffmpeg)
    rep["ffmpeg"] = ff
    for src in sorted(glob.glob(os.path.join(a.game, "bgm", "*.wma"))):
        name = os.path.splitext(os.path.basename(src))[0]
        dst = os.path.join(a.out, "music", name + ".ogg")
        if not ff:
            rep["errors"].append(f"bgm/{name}.wma: chua doi (khong co ffmpeg)")
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        r = subprocess.run([ff, "-y", "-loglevel", "error", "-i", src, "-vn", "-c:a", "libvorbis", "-q:a", "4", dst],
                           capture_output=True, text=True)
        if r.returncode:
            rep["errors"].append(f"bgm/{name}.wma: {r.stderr.strip()[:200]}")
        else:
            rep["music"].append({"source": f"bgm/{name}.wma", "file": f"music/{name}.ogg"})

    with open(os.path.join(a.out, "audio_report.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    print({"wav": len(rep["wav"]), "music": len(rep["music"]), "ffmpeg": bool(ff)}, "errors:", len(rep["errors"]))


if __name__ == "__main__":
    main()
