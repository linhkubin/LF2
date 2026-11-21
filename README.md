# LF2 web (bản dựng lại Little Fighter 2 v2.0a)

Repo không kèm tài sản game gốc (exe, dữ liệu, hình, âm thanh — bản quyền Marti Wong & Starsky Wong). Cần có bản LF2 v2.0a của riêng bạn để tạo tài sản; yêu cầu Python 3.10+ với Pillow, ffmpeg tùy chọn (nhạc).

## Chạy
1. Tạo tài sản từ thư mục game gốc (một lần, xem `tools/README.md`):
   ```powershell
   python tools/build_all.py --game <thư mục game LF2>
   ```
2. Nháy đúp `start.bat`: nó chạy máy chủ (tắt cache) ở cổng 8780 và mở trình duyệt tại http://127.0.0.1:8780. Giữ cửa sổ đen đó mở trong lúc chơi.
   Hoặc tự chạy `python tools/serve.py [cổng]` rồi mở địa chỉ tương ứng.
   Không mở thẳng `index.html` bằng `file://` (trình duyệt chặn ES module và `fetch`).

## Chơi
- Một người chơi. Menu chính: **VS Mode** hoặc **Stage Mode**.
- **VS** (dành cho xem máy đánh nhau): bấm một đội hình nhanh (1 đấu 1 … 4 đấu 4, Hỗn chiến 4/8), 🎲 để xáo nhân vật, hoặc sửa từng ô (nhân vật, đội, ✕ bỏ, + Thêm máy). Mặc định tất cả là máy; bật "Tôi cùng chơi" để điều khiển ô đầu tiên. Tùy chọn: độ khó, nền (có Ngẫu nhiên), tốc độ x1/x2/x4 (trong trận đổi bằng phím 1/2/3), tự động sang trận mới sau 5 giây, đổi nhân vật mỗi trận.
- **Stage**: dòng 1 là bạn, dòng 2–8 là máy đồng đội; chọn nhân vật, độ khó, màn bắt đầu (1-1 … 5-5).
- Bảng **Chiêu** dưới khung game liệt kê combo của nhân vật đang chọn hoặc đang chơi (lấy từ dữ liệu `hit_*`), kèm MP/HP tốn.

| Hành động | Phím |
|---|---|
| Di chuyển | ← ↑ ↓ → |
| Đánh / Nhảy / Đỡ | C / X / Z |
| Chạy | bấm hướng 2 lần; đang chạy: X dash, Z lăn |
| Chiêu | Z → hướng → C/X, hoặc Z → X → C (xem bảng Chiêu) |
| Hệ thống | F1 tạm dừng, F2 từng tick, F3 gỡ lỗi, F4 thoát trận, F7 hồi đầy |

## Cấu trúc
| File | Nội dung (hàm gốc trong lf2.exe) |
|---|---|
| `src/sim/obj.js` | Một đối tượng (mọi type): điều khiển `FUN_00413080`, vật lý `FUN_0040e490`, chuyển frame `FUN_0040d960`, hồi HP/MP |
| `src/sim/combat.js` | Va chạm `itr/bdy`, sát thương, ngã, đỡ, lửa/băng, đạn chạm đạn, nhặt, bắt/ném, đánh bật (`FUN_00419380`, `FUN_0042e100`, `FUN_004196f0`, `FUN_00418c30`) |
| `src/sim/world.js` | Thứ tự tick `FUN_0041bc90`, cầm/ném/uống vũ khí, `opoint`, đạn đuổi `FUN_00406ba0`, Woody dịch chuyển, Firzen hợp thể, chết/hồi sinh, kẹp biên, camera |
| `src/sim/stage.js` | Stage mode `FUN_00437860` + sinh quái `FUN_00437400` |
| `src/sim/ai.js` | AI máy `FUN_004094b0` + chiêu riêng từng nhân vật |
| `src/game.js` | Một trận VS/Stage, luật thắng thua, HUD |
| `src/render.js` | Nền parallax, sprite, bóng, tia lửa, HUD, font WORDS |
| `src/main.js` | Nạp tài sản, menu, thiết lập, vòng lặp 33 ms/tick, kết quả, bảng chiêu |
| `src/combos.js` | Liệt kê combo từ các trường `hit_Fa..hit_ja` của frame |

Các module trong `src/sim/` là JS thuần, chạy được dưới Node để test (nạp JSON trong `public/assets/data`).

## Giới hạn hiện tại
- Nhạc nền cần đổi WMA sang OGG bằng ffmpeg. Cài ffmpeg rồi chạy lại `python tools/build_all.py --game ...` (để `manifest.json` liệt kê file nhạc). Chưa có ffmpeg thì game chạy không nhạc.
- Một số chi tiết engine còn suy luận [I] (giáp Louis/Knight/Julian, một vài đàn đạn của Firzen/Jan, vật bị đánh bay), xem các comment [I] trong code.
- Không có Battle, Championship, Survival, mạng, replay (theo phạm vi: chỉ VS và Stage).

Tài sản trong `public/assets/` là của Marti Wong và Starsky Wong, chỉ dùng trên máy cá nhân.
