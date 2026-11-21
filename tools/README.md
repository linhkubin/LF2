# Công cụ dữ liệu LF2 → web

Đọc thư mục game Little Fighter 2 v2.0a gốc và xuất dữ liệu, ảnh, âm thanh dạng trình duyệt dùng được vào `web/public/assets/`.

## Yêu cầu
- Python 3.10+ và Pillow (`pip install pillow`).
- ffmpeg trong PATH (hoặc truyền `--ffmpeg`) để đổi nhạc WMA sang OGG. Không có ffmpeg thì vẫn chạy được, chỉ bỏ qua nhạc.

## Chạy
```powershell
python tools/build_all.py --game C:\Users\ADMIN\Desktop\LF2
```
Tùy chọn: `--out <thư mục>`, `--mirror` (xuất cả `*_mirror.bmp`), `--ffmpeg <đường dẫn>`. Có thể chạy riêng `build_data.py`, `build_images.py`, `build_audio.py` với `--game` và `--out`. Toàn bộ mất khoảng 1–2 phút.

## Kết quả (`public/assets/`)
| Đường dẫn | Nội dung |
|---|---|
| `data/data.json` | bảng `objects` (id, type, file) và `backgrounds` (index = thứ tự dòng, `declaredId`, file) |
| `data/objects/<id>.json` | `header` (tên, ảnh, `files[]` kèm `firstPic`, hằng số chuyển động, thông số vũ khí), `strength` (weapon_strength_list), `frames` (theo số frame) |
| `data/backgrounds/<index>.json` | `name, width, zboundary, shadow, shadowsize, layers[]` |
| `data/stages.json` | 26 stage, mỗi stage có `phases[]` (bound, music, whenClearGotoPhase, `spawns[]`) |
| `data/control.json` | 4 người chơi: mã VK gốc và `KeyboardEvent.code` tương ứng |
| `data/report.json` | số lượng và cảnh báo khi phân tích |
| `sprite/**.png`, `bg/**.png` | ảnh đã đổi, đen → trong suốt |
| `ui/opaque/*.png`, `ui/keyed/*.png` | 64 ảnh nhúng trong `lf2.exe` (menu, font WORDS, SPARK, FRAME, BARS, SCORE_BOARD…) |
| `sound/data/*.wav` | 107 hiệu ứng âm thanh (giữ nguyên WAV) |
| `music/*.ogg` | nhạc (chỉ khi có ffmpeg) |
| `manifest.json` | danh sách mọi file và quy ước |

### Một frame trong JSON
```json
{"name":"standing","pic":0,"state":0,"wait":5,"next":1,"dvx":0,"dvy":0,"dvz":0,
 "centerx":39,"centery":79,"hit_a":0,"hit_d":0,"hit_j":0,"hit_Fa":240,"hit_Ua":300,
 "bpoint":{"x":39,"y":34},"wpoint":{"kind":1,"x":23,"y":55,"weaponact":23,...},
 "itr":[...],"bdy":[{"kind":0,"x":21,"y":18,"w":43,"h":62}]}
```
Giá trị giữ nguyên như dữ liệu gốc. Không tự đổi nghĩa: ví dụ `dvx: 550` vẫn là 550 (engine hiểu là đặt tuyệt đối `550 − 550`).

## Quy ước và hành vi mô phỏng lf2.exe
- **Giải mã `.dat`**: khóa `SiuHungIsAGoodBearBecauseHeIsVeryGood`, bỏ 123 byte đầu, `byte − key[(i+123) % 37]`.
- **Đọc theo token** như `fscanf`: token không phải từ khóa bị bỏ qua, nên các ghi chú `#...` không ảnh hưởng.
- **stage.dat**: áp mặc định của exe (hp 500, times 1, act 9, y 0, x = bound + 80). `<soldier>` đặt `times = 50`, ghi đè cả `times:` viết trước nó trên cùng dòng.
- **Ảnh**:
  - BMP 8-bit RLE8 được giải bằng bộ giải mã riêng, vì nhiều file có luồng RLE ngắn hơn khai báo và Pillow từ chối. Pixel không được ghi lấy **chỉ số 0 của palette** (giống GDI). 239 file Pillow đọc được cho kết quả giống hệt.
  - Màu đen (0,0,0) thành trong suốt, trừ lớp nền có `transparency: 0`.
- **Ô sprite**: ô i có `left = (i % row)*(w+1)`, `top = floor(i/row)*(h+1)`. `pic` toàn cục = `firstPic` của file chứa nó + i. Phần `a-b` trong `file(a-b)` bị exe bỏ qua.
- **Lớp `rect`** trong nền là màu RGB565 tô đặc (ví dụ `4706` → rgb(16, 76, 16)).

## Cảnh báo đã biết (không phải lỗi)
- `justin`, `bandit`… có bộ sheet phụ (`*_0b.bmp`) khai báo `file(0-69)` trùng. Exe dùng `firstPic` cộng dồn (140+), khớp với offset vẽ `+0x318 = 140`.
- 6 file đạn (`dennis_ball`, `davis_ball`, `henry_arrow2`, `jan_chase`, `jan_chaseh`, `firzen_chasef`) có `pic` vượt số ô của sheet. Khi vẽ nên bỏ qua (không vẽ) các pic này.
- Một số trường `cpoint` có giá trị rác `-842150451` (0xCDCDCDCD), engine coi là "không đặt".

## Bản quyền
Ảnh, âm thanh, nhạc và dữ liệu là tài sản của Marti Wong và Starsky Wong. Thư mục `public/assets/` chỉ dùng trên máy cá nhân, không đưa lên kho mã công khai hay phát hành.
