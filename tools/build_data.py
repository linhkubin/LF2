"""Doc thu muc game LF2 goc va xuat du lieu JSON cho ban web.

Dung:  python build_data.py --game C:\\Users\\ADMIN\\Desktop\\LF2 --out ..\\public\\assets
Ket qua: <out>/data/objects/<id>.json, stages.json, backgrounds/<index>.json,
         data.json (bang id), control.json, va <out>/data/report.json (canh bao).
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lf2data as L


def read_dat(path):
    with open(path, "rb") as f:
        return L.decrypt(f.read())


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    game, out = a.game, os.path.join(a.out, "data")
    report = {"warnings": {}, "counts": {}}

    def warner(name):
        lst = report["warnings"].setdefault(name, [])
        return lst.append

    with open(os.path.join(game, "data", "data.txt"), encoding="latin-1") as f:
        table = L.parse_datatxt(f.read())
    dump(os.path.join(out, "data.json"), table)

    n_frames = 0
    for o in table["objects"]:
        src = os.path.join(game, o["file"])
        if not os.path.exists(src):
            warner("missing")(o["file"]); continue
        obj = L.parse_object(read_dat(src), warner(o["file"]))
        obj.update(id=o["id"], type=o["type"], file=o["file"])
        n_frames += len(obj["frames"])
        dump(os.path.join(out, "objects", f"{o['id']}.json"), obj)

    for b in table["backgrounds"]:
        src = os.path.join(game, b["file"])
        if not os.path.exists(src):
            warner("missing")(b["file"]); continue
        bg = L.parse_bg(read_dat(src))
        bg.update(index=b["index"], declaredId=b["declaredId"], file=b["file"])
        dump(os.path.join(out, "backgrounds", f"{b['index']}.json"), bg)

    stages = L.parse_stage(read_dat(os.path.join(game, "data", "stage.dat")))
    dump(os.path.join(out, "stages.json"), stages)

    with open(os.path.join(game, "data", "control.txt"), encoding="latin-1") as f:
        dump(os.path.join(out, "control.json"), L.parse_control(f.read()))

    report["warnings"] = {k: v for k, v in report["warnings"].items() if v}
    report["counts"] = {"objects": len(table["objects"]), "frames": n_frames,
                        "backgrounds": len(table["backgrounds"]), "stages": len(stages),
                        "phases": sum(len(s["phases"]) for s in stages)}
    dump(os.path.join(out, "report.json"), report)
    print(json.dumps(report["counts"]), "| warnings in", sum(len(v) for v in report["warnings"].values()), "items")


if __name__ == "__main__":
    main()
