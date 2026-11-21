// Ban phim -> 7 phim cua LF2 (up, down, left, right, attack, jump, defend).
// Ban phim mac dinh lay tu data/control.json (ma VK goc doi sang KeyboardEvent.code).
export const KEYS = ["up", "down", "left", "right", "attack", "jump", "defend"];

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.pressedOnce = new Set();
    target.addEventListener("keydown", (e) => {
      if (this.active && this.captured.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedOnce.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener("keyup", (e) => this.down.delete(e.code));
    target.addEventListener("blur", () => this.down.clear());
    this.captured = new Set();
    this.active = false;   // chi chan phim mac dinh cua trinh duyet khi dang trong tran
  }
  capture(codes) { codes.forEach((c) => this.captured.add(c)); }
  takePressed(code) { const had = this.pressedOnce.has(code); this.pressedOnce.delete(code); return had; }
}

// Mot "bo dieu khien" doc trang thai 7 phim tu nhieu bang phim (vd P1 numpad + P3 mui ten).
export class Controller {
  constructor(keyboard, layouts) {
    this.kb = keyboard;
    this.layouts = layouts; // [{up:'Numpad8',...}, ...]
    layouts.forEach((l) => keyboard.capture(Object.values(l)));
  }
  read() {
    const s = {};
    for (const k of KEYS) s[k] = this.layouts.some((l) => this.kb.down.has(l[k]));
    return s;
  }
}
