"""Giai ma va phan tich du lieu Little Fighter 2 v2.0a thanh dict/JSON.

Cach doc mo phong lf2.exe: doc theo token (fscanf "%s"), token la tu khoa thi
xu ly, token la la thi bo qua (vi vay cac ghi chu '#...' khong anh huong, tru khi
chua tu khoa). Xem analysis/00_TONG_HOP_PHAN_TICH.md muc 3.
"""
import re

KEY = b"SiuHungIsAGoodBearBecauseHeIsVeryGood"
HEADER = 123  # lf2.exe FUN_004148a0 bo qua 123 byte dau

POINT_BLOCKS = ("bpoint", "wpoint", "opoint", "cpoint")  # moi frame chi 1 (ghi de)
LIST_BLOCKS = ("itr", "bdy")                              # moi frame toi da 5
MAX_ITR = MAX_BDY = 5

_num = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)$")


def decrypt(raw: bytes) -> str:
    n = len(KEY)
    out = bytearray()
    for i, b in enumerate(raw[HEADER:]):
        out.append((b - KEY[(i + HEADER) % n]) & 0xFF)
    return out.decode("latin-1")


def num(tok):
    """Chuyen token sang int/float neu la so; nguoc lai giu chuoi."""
    if _num.match(tok):
        f = float(tok)
        return int(f) if f.is_integer() and "." not in tok else f
    return tok


def norm_path(p):
    return p.replace("\\", "/")


def _is_key(t):
    return t.endswith(":") and not t.startswith("<")


def _collect(tokens, i, stop=("layer_end",)):
    """Lay cac gia tri sau mot key cho toi key/the ke tiep."""
    vals = []
    while i < len(tokens):
        t = tokens[i]
        if _is_key(t) or t.startswith("<") or t in stop:
            break
        vals.append(num(t))
        i += 1
    return vals, i


# --------------------------------------------------------------------------
# File doi tuong (nhan vat, vu khi, dan...)
# --------------------------------------------------------------------------
def _parse_bmp_block(lines, warn):
    hdr = {"files": []}
    pic = 0
    for line in lines:
        line = line.strip()
        if not line:
            continue
        m = re.match(r"file\((\d+)-(\d+)\):\s*(\S+)(.*)", line)
        if m:
            rest = m.group(4).split()
            ent = {"path": norm_path(m.group(3)), "declared": [int(m.group(1)), int(m.group(2))]}
            for j in range(0, len(rest) - 1, 2):
                ent[rest[j].rstrip(":")] = num(rest[j + 1])
            # lf2.exe bo qua a-b; pic dau tien = tong row*col cac file truoc (bao cao 05)
            ent["firstPic"] = pic
            pic += int(ent.get("row", 0)) * int(ent.get("col", 0))
            if ent["declared"][0] != ent["firstPic"]:
                warn(f"info: file({ent['declared'][0]}-..) khai bao khac firstPic {ent['firstPic']} (exe dung firstPic; bo sheet phu, +0x318=140): {ent['path']}")
            hdr["files"].append(ent)
            continue
        toks = line.split()
        key = toks[0].rstrip(":")
        vals = [num(t) for t in toks[1:]]
        if key in ("head", "small") or key.endswith("_sound"):
            vals = [norm_path(str(v)) for v in vals]
        hdr[key] = vals[0] if len(vals) == 1 else vals
    return hdr


def parse_object(text, warn=lambda m: None):
    obj = {"header": {}, "strength": {}, "frames": {}}
    # 1. Khoi <bmp_begin> doc theo dong
    m = re.search(r"<bmp_begin>(.*?)<bmp_end>", text, re.S)
    if m:
        obj["header"] = _parse_bmp_block(m.group(1).splitlines(), warn)
        text = text[: m.start()] + text[m.end():]

    tokens = text.split()
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t == "<weapon_strength_list>":
            i = _parse_strength(tokens, i + 1, obj["strength"])
        elif t == "<frame>":
            i = _parse_frame(tokens, i + 1, obj["frames"], warn)
        else:
            i += 1
    return obj


def _parse_strength(tokens, i, out):
    cur = None
    while i < len(tokens) and tokens[i] != "<weapon_strength_list_end>":
        t = tokens[i]
        if _is_key(t):
            vals, i = _collect(tokens, i + 1)
            k = t[:-1]
            if k == "entry":
                cur = {"name": vals[1] if len(vals) > 1 else ""}
                out[str(vals[0])] = cur
            elif cur is not None:
                cur[k] = vals[0] if len(vals) == 1 else vals
        else:
            i += 1
    return i + 1


def _parse_frame(tokens, i, frames, warn):
    fid = int(tokens[i])
    fr = {"name": tokens[i + 1] if not tokens[i + 1].startswith("<") else "", "itr": [], "bdy": []}
    i += 2
    block, bname = None, None
    while i < len(tokens) and tokens[i] != "<frame_end>":
        t = tokens[i]
        if not _is_key(t):
            i += 1
            continue
        k = t[:-1]
        if bname is None and k in POINT_BLOCKS + LIST_BLOCKS:
            block, bname = {}, k
            i += 1
            continue
        if bname is not None and k == bname + "_end":
            if bname in LIST_BLOCKS:
                fr[bname].append(block)
            else:
                if bname in fr:
                    warn(f"frame {fid}: {bname} lap lai, giu ban sau")
                fr[bname] = block
            block, bname = None, None
            i += 1
            continue
        vals, i = _collect(tokens, i + 1)
        if k == "sound":
            vals = [norm_path(str(v)) for v in vals]
        (block if block is not None else fr)[k] = vals[0] if len(vals) == 1 else (vals or None)
    if len(fr["itr"]) > MAX_ITR or len(fr["bdy"]) > MAX_BDY:
        warn(f"frame {fid}: {len(fr['itr'])} itr / {len(fr['bdy'])} bdy vuot gioi han 5")
    if str(fid) in frames:
        warn(f"frame {fid} lap lai, giu ban sau")
    frames[str(fid)] = fr
    return i + 1


# --------------------------------------------------------------------------
# stage.dat (tu khoa va mac dinh theo FUN_0040c910, bao cao 03c)
# --------------------------------------------------------------------------
def parse_stage(text):
    tokens = text.split()
    stages, stage, phase, ent = [], None, None, None
    expect_stage_id = False
    INT_KEYS = {"x:": "x", "hp:": "hp", "times:": "times", "reserve:": "reserve",
                "join:": "join", "join_reserve:": "joinReserve", "act:": "act", "y:": "y"}
    i = 0
    while i < len(tokens):
        t = tokens[i]
        nxt = tokens[i + 1] if i + 1 < len(tokens) else None
        if t == "<stage>":
            stage = {"id": None, "phases": []}
            stages.append(stage)
            expect_stage_id = True
        elif t == "<phase>" and stage is not None:
            phase = {"bound": -1, "music": "", "whenClearGotoPhase": -1, "spawns": []}
            stage["phases"].append(phase)
            ent = None
        elif t == "id:" and expect_stage_id:
            stage["id"] = int(nxt); i += 1; expect_stage_id = False
        elif t == "bound:" and phase is not None:
            phase["bound"] = int(nxt); i += 1
            for e in phase["spawns"]:       # exe dat lai x mac dinh cho moi entry
                e["x"] = phase["bound"] + 80
        elif t == "music:" and phase is not None:
            phase["music"] = norm_path(nxt); i += 1
        elif t == "when_clear_goto_phase:" and phase is not None:
            phase["whenClearGotoPhase"] = int(nxt); i += 1
        elif t == "id:" and phase is not None:
            ent = {"id": int(nxt), "x": phase["bound"] + 80 if phase["bound"] >= 0 else 500,
                   "hp": 500, "times": 1, "reserve": 0, "join": 0, "joinReserve": 0,
                   "act": 9, "y": 0, "ratio": 0.0, "kind": "normal"}
            phase["spawns"].append(ent); i += 1
        elif t in INT_KEYS and ent is not None:
            ent[INT_KEYS[t]] = int(float(nxt)); i += 1
        elif t == "ratio:" and ent is not None:
            ent["ratio"] = float(nxt); i += 1
        elif t == "<boss>" and ent is not None:
            ent["kind"] = "boss"
        elif t == "<soldier>" and ent is not None:
            ent["kind"] = "soldier"; ent["times"] = 50   # exe: <soldier> dat times = 50
        elif t == "<phase_end>":
            phase, ent = None, None
        elif t == "<stage_end>":
            stage, phase, ent = None, None, None
        i += 1
    return stages


# --------------------------------------------------------------------------
# bg.dat
# --------------------------------------------------------------------------
def parse_bg(text):
    tokens = text.split()
    bg = {"layers": []}
    layer = None
    i = 0
    while i < len(tokens):
        t = tokens[i]
        if t == "layer:":
            layer = {"path": None}
            i += 1
            if i < len(tokens) and not _is_key(tokens[i]):
                layer["path"] = norm_path(tokens[i]); i += 1
            continue
        if t == "layer_end":
            bg["layers"].append(layer); layer = None; i += 1
            continue
        if _is_key(t):
            vals, i = _collect(tokens, i + 1)
            k = t[:-1]
            target = layer if layer is not None else bg
            if k == "shadow":
                vals = [norm_path(str(v)) for v in vals]
            target[k] = vals[0] if len(vals) == 1 else vals
        else:
            i += 1
    return bg


# --------------------------------------------------------------------------
# data.txt va control.txt (van ban thuong)
# --------------------------------------------------------------------------
def parse_datatxt(text):
    objects, backgrounds = [], []
    sec = None
    for line in text.splitlines():
        s = line.split("#")[0].strip()
        if s in ("<object>", "<background>", "<file_editing>"):
            sec = s; continue
        if s.endswith("_end>"):
            sec = None; continue
        toks = s.split()
        d = {toks[j].rstrip(":"): toks[j + 1] for j in range(0, len(toks) - 1, 2) if toks[j].endswith(":")}
        if sec == "<object>" and "id" in d:
            objects.append({"id": int(d["id"]), "type": int(d["type"]), "file": norm_path(d["file"])})
        elif sec == "<background>" and "id" in d:
            # chi so bg trong game = THU TU dong, khong phai id (bao cao 05)
            backgrounds.append({"index": len(backgrounds), "declaredId": int(d["id"]), "file": norm_path(d["file"])})
    return {"objects": objects, "backgrounds": backgrounds}


VK_NAMES = {8: "Backspace", 9: "Tab", 13: "Enter", 16: "Shift", 17: "Ctrl", 18: "Alt", 32: "Space",
            37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 107: "NumpadAdd",
            109: "NumpadSubtract", 186: "Semicolon", 187: "Equal", 188: "Comma", 189: "Minus",
            190: "Period", 191: "Slash", 192: "Backquote", 219: "BracketLeft", 220: "Backslash",
            221: "BracketRight", 222: "Quote"}


def vk_to_code(vk):
    """Ma phim Windows VK -> KeyboardEvent.code."""
    if 65 <= vk <= 90:
        return "Key" + chr(vk)
    if 48 <= vk <= 57:
        return "Digit" + chr(vk)
    if 96 <= vk <= 105:
        return "Numpad" + str(vk - 96)
    return VK_NAMES.get(vk, f"VK{vk}")


def parse_control(text):
    lines = [l for l in text.splitlines()]
    players = []
    for l in lines[:4]:
        v = [int(x) for x in l.split()]
        if len(v) < 8:
            continue
        keys = dict(zip(["up", "down", "left", "right", "attack", "jump", "defend"], v[1:8]))
        players.append({"device": v[0], "vk": keys, "code": {k: vk_to_code(x) for k, x in keys.items()},
                        "joystick": dict(zip(["attack", "jump", "defend"], v[8:11]))})
    return {"players": players, "extra": lines[4:]}
