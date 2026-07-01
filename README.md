# Meta Ads Manager — Dashboard quản lý & tự động hoá Meta Ads

> Công cụ quản lý chiến dịch Meta Ads cho UA (app + web funnel): đo lường theo khung giờ, gợi ý action tự động, cảnh báo, và báo cáo hình ảnh về Discord.

## 🔗 Truy cập tool

**https://meta-ads-deploy-three.vercel.app**

Mở link là dùng ngay — token và ad account đã cắm sẵn ở server (Vercel env), không cần đăng nhập. Tool **chỉ hiển thị các campaign có tag `ptt`/`Ptt`** trong tên (khóa cứng), gom dữ liệu từ 3 ad account.

---

## Tool này làm gì?

Đây là "trạm điều khiển" giúp một UA trả lời nhanh 3 câu hỏi mỗi ngày:

1. **Camp nào đang ngon / đang lỗ?** → bảng Tổng quan + màu ROAS theo thang app.
2. **Nên bơm/giảm/tắt tiền camp nào, vào giờ nào?** → cột **"Gợi ý action"** tính tự động + heatmap giờ vàng/giờ xấu.
3. **Hôm nay có gì bất thường?** → tab Cảnh báo + báo cáo ảnh tự bắn về Discord mỗi giờ.

Không phải tool "xem cho biết" — trọng tâm là **ra quyết định**: mỗi camp đều có một dòng action cụ thể kèm % (Tăng X2 vào giờ vàng / Giảm 50% / TẮT CAMP…).

---

## Tính năng chính

| Nhóm | Chi tiết |
|---|---|
| **Dữ liệu thật** | Gọi trực tiếp Meta Graph API v21.0 qua serverless proxy. Token ẩn hoàn toàn ở server. |
| **Đo theo khung giờ** | So sánh hôm nay vs 3 ngày trước theo từng giờ (heatmap), tìm "giờ vàng" ra đơn của từng camp. |
| **Gợi ý action tự động** | Rule engine tính sẵn nên làm gì với từng camp + % cụ thể (xem [Rule engine](#-rule-engine--gợi-ý-action)). |
| **Cảnh báo** | Tự phát hiện camp ROAS thấp, CPI cao, hết đơn, tiêu nhiều mà không hiệu quả. |
| **Điều chỉnh inline** | Tăng/giảm budget & bật/tắt camp ngay trong trang chi tiết (ghi thẳng lên Meta). |
| **Lịch sử action** | Đọc Activity Log của Meta: tăng/giảm ngân sách, bật/tắt camp, đổi creative… |
| **Báo cáo Discord** | Bảng ảnh PNG theo campaign + cột gợi ý action, tự bắn mỗi giờ. |
| **Khóa tag `ptt`** | Mọi dữ liệu chỉ giới hạn ở camp có tag `ptt` — không lẫn camp của người khác. |

---

## Các tab trong tool

- **Tổng quan** — bảng tất cả camp. Thứ tự cột: `Status · Budget · Spend · ROAS · Purchase · Cost/Purchase · Payrate · Install · CPI · CTR · CVR · CPC · Impression`. Camp ACTIVE đẩy lên đầu; cột tên camp cố định (sticky) và hiện đầy đủ tên.
- **Heatmap** — pivot giờ × ngày, tô màu theo hiệu suất; kèm gợi ý giờ vàng/giờ xấu từng camp.
- **Khung giờ** — phân tích sâu theo giờ, so sánh hôm nay với trung bình 3 ngày.
- **Cảnh báo** — danh sách camp cần chú ý (auto-generate).
- **Lịch sử** — nhật ký thay đổi lấy từ Meta Activity Log.
- **Cấu hình** — đổi tag lọc, ngưỡng ROAS/KPI, thông số cảnh báo.
- **Chi tiết** (click vào 1 camp) — số liệu đầy đủ + nút tăng/giảm budget, bật/tắt camp.

---

## 🎯 Rule engine — "Gợi ý action"

Mỗi camp được chấm và gán **một** action theo thứ tự ưu tiên (gặp điều kiện đầu tiên là dùng). Logic nằm ở `api/cron-image.js` (hàm `suggest()` + object `R` chứa ngưỡng).

| Ưu tiên | Điều kiện | Action |
|---|---|---|
| 1 | 0 đơn **&** spend ≥ 2M **&** CPM ≥ 1tr | 🔴 **TẮT CAMP** |
| 2 | 0 đơn **&** spend ≥ 2M | 🔴 TẮT — tiêu 2M+, 0 đơn |
| 3 | 0 đơn **&** CPM ≥ 1tr | 🔴 TẮT — CPM cao, 0 đơn |
| 4 | 0 đơn **&** CPI > 200k (camp app) | 🔴 TẮT — CPI quá cao |
| 5 | ROAS > 0.6 **&** CPI ≤ 150k **&** CTR > 1% | 🟢 **Tăng X2 budget vào giờ vàng** (giờ ra đơn của camp) |
| 6 | ROAS < 0.3 **&** CPI > 200k | 🔴 Giảm 50% (sàn 1tr) |
| 7 | ra đơn nhưng spend ≥ 1M **&** ROAS ≤ 0.1 | 🔴 Giảm 30% / cân nhắc tắt |
| 8 | ROAS ≥ 0.4 | 🟢 Tăng budget 20% |
| 9 | CPI > 200k (camp app) | 🔴 Giảm 20% |
| 10 | ra đơn nhưng ROAS ≤ 0.2 | 🔴 Giảm 20% |
| 11 | CVR < 20% | 🟡 Soát lại creative/landing |
| 12 | chưa ra đơn | 🟡 Theo dõi |
| — | còn lại | ⚪ Giữ budget, theo dõi |

**Ngưỡng hiện tại** (`const R` trong `api/cron-image.js` — sửa ở đây để đổi rule):

```js
KILL_SPEND: 2_000_000   // tiêu ≥ 2M mà 0 đơn → tắt
KILL_CPM:   1_000_000   // CPM ≥ 1tr mà 0 đơn → tắt
CPI_MAX:    200_000     // CPI > 200k = xấu
CVR_MIN:    20          // CVR < 20% = xấu
ROAS_GOOD:  0.4         // ≥ 0.4 = tốt (thang app)
ROAS_STRONG:0.6         // ≥ 0.6 = mạnh → tăng X2
UP1/UP2:    20/30 %     DOWN1/DOWN2: 20/30 %
```

> **Lưu ý CPI**: chỉ áp cho camp **app** (có install). Camp **web** (install = 0) bỏ qua điều kiện CPI, dùng registration để tính CVR/payrate.

---

## 📊 Chỉ số & công thức

- **ROAS net = (doanh thu / chi tiêu) × 0.7**, theo **thang app**: **≥ 0.4 = tốt** (xanh), < 0.3 = kém. Đây không phải thang e-commerce (1.5–2.0).
- CTR = click / impression × 100
- CVR = conversion / click × 100 (conversion = install; camp web không có install thì dùng **registration**)
- CPM = chi tiêu / impression × 1000
- CPI = chi tiêu / install
- Payrate = purchase / conversion × 100
- CPP (Cost per Purchase) = chi tiêu / purchase

---

## 🤖 Báo cáo tự động về Discord

- **Ảnh mỗi giờ** (`api/cron-image.js`): bảng PNG theo campaign, có cột "Gợi ý action", màu theo ngưỡng. Chỉ camp `ptt`, gom 3 account, dữ liệu `date_preset=today`.
- **Bảng chữ hằng ngày** (`api/cron-report.js`): code block ANSI màu, nhóm theo use case.
- **Trigger tin cậy = [cron-job.org](https://cron-job.org)** (miễn phí) trỏ tới endpoint cron-image mỗi giờ. ⚠️ *GitHub Actions cron không đáng tin (hay bỏ giờ); Vercel Hobby cron chỉ chạy 1 lần/ngày.*

Xem thử báo cáo ảnh (preview):
`https://meta-ads-deploy-three.vercel.app/api/cron-image?preview=1&key=<CRON_SECRET>`

---

## 🏗 Kiến trúc

Frontend 1 file + serverless proxy, deploy trên Vercel. Không có build step.

```
index.html                    # Toàn bộ SPA (HTML + CSS + JS)
api/
├── meta.js                   # Proxy Graph API: GET đọc (auto-paging), POST ghi budget/status
├── config.js                 # Trả {accounts, hasToken} — KHÔNG lộ token
├── discord.js                # Gửi text / ảnh về Discord
├── cron-image.js             # Báo cáo ẢNH PNG theo camp + gợi ý action  ← rule engine
├── cron-report.js            # Báo cáo BẢNG CHỮ ANSI (daily)
├── discord-interactions.js   # Nhận nút/slash Discord (verify Ed25519) → thao tác Meta
└── discord-register.js       # Đăng ký slash command /pause /resume /budget
.github/workflows/hourly-report.yml   # GitHub Actions gọi cron-image mỗi giờ (backup)
vercel.json                   # Vercel cron (cron-report daily)
package.json                  # deps: @vercel/og, react (render ảnh)
```

**Luồng dữ liệu:** `index.html` → `fetch('/api/meta?path=...')` → proxy gắn token (server-side) → Meta Graph API → chuẩn hoá số liệu (`normalize`) → render. Ghi (đổi budget/bật tắt) đi qua `POST /api/meta`.

---

## 🚀 Deploy & cấu hình

Repo **không** nối auto-deploy — phải deploy bằng Vercel CLI, sau đó push GitHub.

```bash
cd ~/meta-ads-deploy
vercel --prod --yes                          # deploy production (~30s)
git add -A && git commit -m "..." && git push origin main
```

**Env vars (Vercel · production):**

| Env | Vai trò |
|---|---|
| `META_ACCESS_TOKEN` | Token Graph API (proxy dùng server-side) |
| `META_AD_ACCOUNT_ID` | 3 account, ngăn bằng dấu phẩy (`act_...,act_...,act_...`) |
| `DISCORD_WEBHOOK_URL` | Webhook nhận báo cáo/ảnh |
| `CRON_SECRET` | Bảo vệ endpoint cron (`?key=` hoặc Bearer) |
| `GRAPH_VERSION` | (tuỳ chọn) đổi version Graph API, mặc định v21.0 |
| `DISCORD_BOT_TOKEN` / `DISCORD_CHANNEL_ID` / `DISCORD_PUBLIC_KEY` / `DISCORD_APP_ID` | (tuỳ chọn) bật nút bấm & slash command action 2 chiều |

```bash
# thêm/sửa env rồi PHẢI deploy lại để có hiệu lực
printf "%s" "<value>" | vercel env add <NAME> production
vercel --prod --yes
```

---

## ⚠️ Lưu ý kỹ thuật (gotchas)

- **Ảnh @vercel/og bị CDN cache** → khi test/trigger thêm cache-buster `&cb=$(date +%s)`.
- **Timezone**: số liệu theo giờ lấy theo **timezone của ad account** (không phải giờ máy) — tránh lệch ~14h khi account US.
- **Đơn vị budget** theo currency offset (VND = 0, USD = 2); không được bịa offset khi API lỗi.
- **`/{campaign_id}/activities` trả rỗng** trên v21 → lịch sử theo camp phải lọc từ account-level Activity Log.
- Font render ảnh có tiếng Việt OK nhưng không có ký tự `≥`/`≤` → dùng `>=`/`<=`.

---

## 🗺 Đang làm dở / hướng phát triển

- [ ] Bật cron-job.org để đảm bảo **24 báo cáo ảnh/ngày** ổn định.
- [ ] Discord bot cho **action 2 chiều** (bấm nút Tắt/Bật/Tăng/Giảm ngay trong Discord) — chờ tạo Discord App.

---

*Tool nội bộ của PhuongTT (Apero). Repo: [phuongtt-eng/meta-ads-dashboard](https://github.com/phuongtt-eng/meta-ads-dashboard).*
