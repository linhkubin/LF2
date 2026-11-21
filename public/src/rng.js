// RNG kieu lf2.exe (FUN_00417170): rand(n) = (T[idx] + ctr) % n
// T = 3000 byte `rand()%255+1` sinh luc khoi dong; idx tang mod 3000, ctr tang mod 1234.
// Thu tu theo 02_combat_items.md muc 8: tang ctr, idx truoc roi moi doc.
export class LF2Random {
  constructor(table) {
    this.table = table || LF2Random.makeTable();
    this.idx = 0;
    this.ctr = 0;
  }
  static makeTable() {
    const t = new Uint8Array(3000);
    for (let i = 0; i < t.length; i++) t[i] = (Math.random() * 255 | 0) + 1;
    return t;
  }
  rand(n) {
    if (n <= 0) return 0;
    this.ctr = (this.ctr + 1) % 1234;
    this.idx = (this.idx + 1) % 3000;
    return (this.table[this.idx] + this.ctr) % n;
  }
}
