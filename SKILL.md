---
name: meta-ads-dashboard
description: >-
  Vận hành & cập nhật tool "Meta Ads Manager" của PhuongTT (repo
  phuongtt-eng/meta-ads-dashboard, deploy https://meta-ads-deploy-three.vercel.app,
  local ~/meta-ads-deploy). BẮT BUỘC dùng skill này bất cứ khi nào người dùng nói tới:
  dashboard Meta Ads / quản lý camp Meta / heatmap-khung giờ-cảnh báo-target ROAS,
  đổi rule action camp (tăng/giảm/tắt budget), báo cáo/thông báo Discord (webhook, ảnh,
  cron mỗi giờ), sửa & deploy tool này, hoặc đụng tới thư mục ~/meta-ads-deploy / các
  file api/*.js. Kể cả khi họ không nói "skill", chỉ cần liên quan tới tool Meta Ads
  này thì đọc skill trước để nắm kiến trúc, cách deploy, env vars và các "gotcha".
---

# Meta Ads Dashboard — vận hành & cập nhật (bản gộp tự chứa)

> Đây là bản SKILL.md **tự chứa** (đã gộp cả architecture / gotchas / deploy-discord vào 1 file
> để backup an toàn). Bản cài đặt dùng cho Claude nằm ở `~/.claude/skills/meta-ads-dashboard/`
> (tách references riêng). Hai bản nội dung tương đương.

Tool quản lý Meta Ads của **PhuongTT** (UA chạy app + web funnel): 1 file frontend + serverless proxy trên Vercel, gọi Meta Graph API thật, có heatmap/khung giờ/cảnh báo/target ROAS, và báo cáo tự động về Discord.

- **Local:** `~/meta-ads-deploy/`
- **Repo:** https://github.com/phuongtt-eng/meta-ads-dashboard (branch `main`)
- **Prod:** https://meta-ads-deploy-three.vercel.app
- Tài khoản: Vercel scope `phuongto`, GitHub `phuongtt-eng`, email `Phuongtt@apero.vn`

## Kiến trúc (tóm tắt)
- `index.html` — toàn bộ SPA (state + render + gọi `/api/meta`). Tab: Tổng quan / Heatmap (pivot thời gian) / Khung giờ / Cảnh báo / Lịch sử / Cấu hình / Chi tiết.
- `api/meta.js` — universal proxy Graph API (GET đọc auto-paging, POST ghi budget/status). Token ẩn server-side.
- `api/config.js` — trả `{accounts, hasToken}` (KHÔNG trả token).
- `api/discord.js` — gửi text/ẢNH về Discord (webhook hoặc bot; ảnh qua multipart).
- `api/cron-report.js` — báo cáo BẢNG CHỮ (ANSI màu) theo use case, daily (Vercel cron).
- `api/cron-image.js` — báo cáo ẢNH PNG (@vercel/og) theo **campaign + cột Gợi ý action**, hourly. **Rule action nằm ở hàm `suggest()` + object `R` (ngưỡng) đầu file.**
- `api/discord-interactions.js` — nhận nút/slash command từ Discord (verify Ed25519) → thao tác Meta. Cần bot (đang chờ user tạo App).
- `api/discord-register.js` — đăng ký slash command `/pause /resume /budget`.
- `.github/workflows/hourly-report.yml` — GitHub Actions gọi `/api/cron-image` mỗi giờ.
- `vercel.json` — Vercel cron (daily) · `package.json` — deps `@vercel/og` + `react`.

## Quy trình DEPLOY (luôn theo đúng thứ tự)
Sửa file → **deploy Vercel** (bằng CLI, KHÔNG dựa vào GitHub auto-deploy — repo không nối auto-deploy) → **push GitHub**.

```bash
source ~/.config/envman/PATH.env          # nạp PATH cho node/gh/vercel
cd ~/meta-ads-deploy
# 1) Nếu vercel chưa login (whoami trống): device-flow
vercel login <email>                       # in ra "Visit https://vercel.com/oauth/device?user_code=XXXX"
                                            #   -> ĐƯA URL ĐÓ CHO USER bấm Confirm; login xong credential lưu máy
# 2) Deploy
vercel --prod --yes                         # ~30s, tự alias về meta-ads-deploy-three.vercel.app
# 3) Push code
git add -A && git commit -m "..." && git push origin main
```
- Commit message kết thúc bằng: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Set env: `printf "%s" "<value>" | vercel env add <NAME> production` rồi `vercel --prod --yes` lại (env chỉ áp ở deploy mới). Output lệnh env add hơi lạ nhưng vẫn set được — kiểm bằng `vercel env ls production`.

## Env vars trên Vercel (production)
| Env | Vai trò | Trạng thái |
|---|---|---|
| `META_ACCESS_TOKEN` | token Graph API (proxy dùng server-side) | ĐÃ SET |
| `META_AD_ACCOUNT_ID` | 3 account, cách nhau dấu phẩy: `act_2043462802854970,act_639095358227746,act_1288436283422593` | ĐÃ SET |
| `DISCORD_WEBHOOK_URL` | webhook nhận báo cáo/ảnh | ĐÃ SET |
| `CRON_SECRET` | bảo vệ endpoint cron (`?key=` hoặc Bearer) = `887831eefad561ccfd5539ef7daedae7` | ĐÃ SET |
| `DISCORD_BOT_TOKEN` / `DISCORD_CHANNEL_ID` / `DISCORD_PUBLIC_KEY` / `DISCORD_APP_ID` | cho nút bấm + slash command (action 2 chiều) | **CHƯA** (chờ user tạo Discord App) |
| `GRAPH_VERSION` | đổi version Graph API (mặc định v21.0) | optional |

## Verify sau khi sửa
- Frontend (`index.html`): dùng Claude_Preview MCP + launch.json (python http.server :8800, serve `~/meta-ads-deploy`). `/api/*` KHÔNG chạy trên server tĩnh → verify UI bằng **nút "Dùng dữ liệu demo"** (`loadDemo`).
- Endpoint (`api/*`): test trên PROD bằng `curl`. Riêng `/api/cron-image?...&preview=1` trả PNG — **thêm `&cb=$(date +%s)` để né CDN cache** rồi `Read` file PNG để xem.

## Rule action camp (trong `api/cron-image.js`)
Chỉnh ngưỡng ở **object `R`** đầu file; logic ở hàm `suggest(c)` (ưu tiên trên→xuống, gặp đầu tiên là dùng).

| Ưu tiên | Điều kiện | Action |
|---|---|---|
| 1 | 0 đơn & spend ≥ 2M & CPM ≥ 1tr | TẮT CAMP |
| 2 | 0 đơn & spend ≥ 2M | TẮT — tiêu 2M+, 0 đơn |
| 3 | 0 đơn & CPM ≥ 1tr | TẮT — CPM cao, 0 đơn |
| 4 | 0 đơn & CPI > 200k (camp app) | TẮT — CPI quá cao |
| 5 | ROAS > 0.6 & CPI ≤ 150k & CTR > 1% | Tăng X2 budget vào giờ vàng |
| 6 | ROAS < 0.3 & CPI > 200k | Giảm 50% (sàn 1tr) |
| 7 | ra đơn & spend ≥ 1M & ROAS ≤ 0.1 | Giảm 30% / cân nhắc tắt |
| 8 | ROAS ≥ 0.4 | Tăng budget 20% |
| 9 | CPI > 200k (camp app) | Giảm 20% |
| 10 | ra đơn & ROAS ≤ 0.2 | Giảm 20% |
| 11 | CVR < 20% | Soát creative/landing |
| 12 | chưa ra đơn | Theo dõi |
| — | còn lại | Giữ budget, theo dõi |

Ngưỡng hiện tại (`const R`): `KILL_SPEND 2_000_000` · `KILL_CPM 1_000_000` · `CPI_MAX 200_000` · `CVR_MIN 20` · `ROAS_GOOD 0.4` · `ROAS_STRONG 0.6` · `UP1/UP2 20/30%` · `DOWN1/DOWN2 20/30%`. CPI chỉ áp camp **app** (có install); camp **web** (install=0) bỏ qua CPI. `attachGolden()` fetch hourly 3 ngày để tìm giờ vàng cho camp mạnh.

## Báo cáo Discord
- **Ảnh hourly** (`cron-image`): bảng theo campaign + cột Gợi ý action, màu theo ngưỡng. Chỉ camp tag **ptt**, gom 3 account, `date_preset=today`.
- **Bảng chữ daily** (`cron-report`): ANSI code block màu, group use case.
- **Trigger tin cậy = cron-job.org** (free) trỏ `https://…/api/cron-image?key=<CRON_SECRET>` mỗi giờ. **GitHub Actions cron KHÔNG đáng tin** (hay bỏ giờ) — chỉ dùng backup.

## Nghiệp vụ (business logic quan trọng)
- **ROAS net = (conv_value/spend) × 0.7**, thang **app**: **≥0.4 = tốt** (xanh), <0.3 = kém. (KHÔNG phải thang e-commerce ≥1.5.)
- Công thức: CTR=click/impr×100 · CVR=conv/click×100 (conv=install, không có install thì dùng **registration**) · CPM=spend/impr×1000 · CPI=spend/install · Payrate=purchase/conv×100 · CPP=spend/purchase.
- **Khóa cứng camp tag "ptt"**: chỉ load/hiện camp có `ptt` như 1 token trong tên (case-insensitive, đầu/giữa/cuối) — `lockMatch()`. Đổi tag ở Cấu hình.
- Tên camp: `IIP555_Reelme_<usecase>_<GEO>_<objective>_<date>_<tag>`. Use case = token từ index 2 tới khi gặp GEO/OBJ.
- Timezone: dữ liệu giờ của Meta theo **timezone account** — dùng `acctNow()`/`acctDateStr()`, KHÔNG dùng giờ máy (account US, user ở VN lệch ~14h).

---

# Chi tiết kiến trúc (từ references/architecture.md)

## Cây file
```
index.html                       # toàn bộ SPA (HTML+CSS+JS 1 file)
api/meta.js                      # proxy Graph API (GET đọc, POST ghi)
api/config.js                    # trả {accounts, hasToken} — KHÔNG lộ token
api/discord.js                   # gửi text / ảnh về Discord
api/cron-report.js               # báo cáo BẢNG CHỮ ANSI, daily (Vercel cron)
api/cron-image.js                # báo cáo ẢNH PNG theo camp + gợi ý action, hourly  ← rule engine
api/discord-interactions.js      # nhận nút/slash Discord (Ed25519) → thao tác Meta
api/discord-register.js          # PUT đăng ký slash /pause /resume /budget
.github/workflows/hourly-report.yml   # GitHub Actions gọi cron-image mỗi giờ (backup)
vercel.json                      # Vercel cron daily cho cron-report
package.json                     # deps: @vercel/og, react
```

## `index.html` — hàm chính
- `callMeta(path, params)` — fetch qua `/api/meta`, xử lý lỗi + paging.
- `normalize(row)` — parse insights: actions/action_values ưu tiên PURCHASE → INSTALL → REGISTRATION; tính ROAS/CTR/CVR/CPI/CPM/payrate/CPP.
- `loadAccount()` — load campaigns + insights level=campaign; áp `lockMatch`.
- `loadHourly()` / `hourlyStats()` — insights breakdown `hourly_stats_aggregated_by_advertiser_time_zone`, so today vs 3 ngày.
- `loadPivot()` / `renderHeatmap()` — pivot giờ × ngày, tô màu.
- `buildAlerts()` — sinh cảnh báo.
- `renderOverview()` — bảng tổng quan; cột: Status/Budget/Spend/ROAS/Purchase/CPP/Payrate/Install/CPI/CTR/CVR/CPC/Impression; ACTIVE lên đầu; tên camp sticky + full.
- `renderPlaybook()` / `hourlySuggestion()` / `campGoldenBad()` — gợi ý giờ vàng/giờ xấu (heatmap + chi tiết).
- `renderDetailBudget()` / `detailSetBudget()` — chỉnh budget & bật/tắt inline (POST `/api/meta`).
- `lockMatch(name)` — regex `(^|[^a-z0-9])<tag>([^a-z0-9]|$)`, case-insensitive.
- `postDiscord()` / `sendReportToDiscord()` / `buildReportImageDataURL()` — gửi báo cáo tay.
- `acctNow()` / `acctDateStr()` — giờ/ngày theo tz account. `loadDemo()` — dữ liệu giả.
- State: `CONFIG`/`DEFAULT_CONFIG` (`roasGood:0.4, roasMin:0.3, upRoas:0.5, downRoas:0.2`, flag `roasCalibApp`), `defaultFilter='ptt'`, localStorage prefix `mam_`.

## `api/meta.js`
GET auto-paging `MAX_PAGES=50` (cờ `truncated`); POST ghi `status`/`daily_budget` tới `/{campaign_id}`; token header `x-meta-token` hoặc env; CORS khóa origin; `GRAPH_VERSION` mặc định v21.0.

## `api/cron-image.js`
Runtime **edge**; render PNG bằng `@vercel/og` `ImageResponse` + `React.createElement` (KHÔNG JSX). Cột `Chiến dịch|Spend|CPM|ROAS|Pur|CPP|CPI|CTR|CVR|Pay|Gợi ý action`. `R`=ngưỡng, `suggest(c)`=rule, `attachGolden(rows)`=giờ vàng. `conv=install>0?install:reg`. `?preview=1` xem ảnh; gate `CRON_SECRET`.

## `api/discord*.js`
`discord.js`: 3 chế độ `content`/`components`(cần bot)/`imageBase64`(multipart). `discord-interactions.js`: verify Ed25519 (prefix SPKI `302a300506032b6570032100`), xử lý PING/nút/slash → thao tác Meta. `discord-register.js`: PUT slash. Cần env `DISCORD_PUBLIC_KEY/BOT_TOKEN/APP_ID/CHANNEL_ID`.

---

# Gotchas — đọc TRƯỚC KHI sửa (từ references/gotchas.md)

## Automation / cron
1. **`ImageResponse` (@vercel/og) bị CDN cache** → luôn thêm cache-buster `&cb=$(date +%s)` khi test/trigger.
2. **GitHub Actions `schedule` bỏ giờ** (đã kiểm: có ngày chỉ 2 lần, gap 5h) → dùng **cron-job.org** làm trigger chính; GitHub chỉ backup/chạy tay.
3. **Vercel cron Hobby = tối đa 1 lần/ngày** → không dùng cho hourly.

## Meta Graph API
4. **`/{campaign_id}/activities` rỗng trên v21** → lịch sử theo camp lấy từ account-level activity log rồi lọc.
5. **Currency offset**: VND offset 0, USD offset 2. Không fabricate offset khi lỗi (từng sai 100×) — retry 3 lần rồi throw; `setCampaignBudget` phải guard.
6. **Timezone**: insights giờ theo tz account (account US, VN lệch ~14h). Dùng `acctNow()`/`acctDateStr()`, không `new Date()` giờ máy.
7. **Parse actions** theo `action_type`: ưu tiên purchase/omni_purchase → mobile_app_install/app_install → complete_registration.

## @vercel/og
8. **`≥`/`≤` bị tofu** → dùng `>=`/`<=`. Tiếng Việt có dấu render OK.
9. Dùng `React.createElement`, không JSX. Edge runtime không có `fs`, chỉ `fetch`.

## Vercel CLI / env
11. `printf | vercel env add` in dòng lạ nhưng vẫn set — kiểm `vercel env ls production`.
12. Env chỉ áp deploy mới → sau khi sửa phải `vercel --prod --yes` lại.
13. Repo **không** nối auto-deploy GitHub→Vercel. Push KHÔNG tự deploy.
14. Cần `source ~/.config/envman/PATH.env` để có node/gh/vercel trong PATH.

## Frontend / Discord / Nghiệp vụ
15. `/api/*` không chạy trên server tĩnh → verify UI bằng nút "Dùng dữ liệu demo".
16. Nút bấm cần BOT; webhook chỉ gửi text/embed/ảnh.
17. Upload ảnh Discord: multipart `files[0]` + `payload_json`, không base64-in-JSON.
18. ROAS thang app (net = gross×0.7, ≥0.4 tốt), đừng sửa về thang e-commerce.
19. Chỉ camp tag ptt — mọi query/hiển thị qua `lockMatch`.

---

# Deploy / Env / Discord / Cron — thao tác (từ references/deploy-discord.md)

## Deploy đầy đủ
```bash
source ~/.config/envman/PATH.env
cd ~/meta-ads-deploy
vercel whoami                      # kiểm login
vercel login Phuongtt@apero.vn     # nếu chưa: device-flow, đưa URL user bấm Confirm
vercel --prod --yes                # deploy prod (~30s)
git add -A && git commit -m "mô tả

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" && git push origin main
```

## Set/xem env
```bash
vercel env ls production
printf "%s" "GIÁ_TRỊ" | vercel env add TÊN_ENV production
vercel env rm TÊN_ENV production -y     # sửa: rm rồi add lại
vercel --prod --yes                     # BẮT BUỘC deploy lại
```
`CRON_SECRET` hiện = `887831eefad561ccfd5539ef7daedae7`.

## Test endpoint
```bash
curl -s "https://meta-ads-deploy-three.vercel.app/api/cron-image?preview=1&key=887831eefad561ccfd5539ef7daedae7&cb=$(date +%s)" -o /tmp/rep.png   # xem ảnh
curl -s "https://meta-ads-deploy-three.vercel.app/api/cron-image?key=887831eefad561ccfd5539ef7daedae7&cb=$(date +%s)"                        # gửi thật về Discord
```

## Cron mỗi giờ tin cậy — cron-job.org (KHUYẾN NGHỊ)
1. https://cron-job.org → đăng ký/đăng nhập.
2. Create cronjob: URL = `https://meta-ads-deploy-three.vercel.app/api/cron-image?key=887831eefad561ccfd5539ef7daedae7`; schedule Every hour (phút 0); GET; Enable.
3. Save. Nó tự gọi mỗi giờ → render ảnh → upload Discord.
Backup: `.github/workflows/hourly-report.yml` (có `workflow_dispatch` bấm tay), cần secret `CRON_SECRET` trong repo.

## Tạo Discord App + bot (action 2 chiều — CHƯA làm, vướng verify email)
1. https://discord.com/developers/applications → New Application (nếu bắt verify email: verify xanh + thêm số ĐT + thử trình duyệt ẩn danh).
2. Application ID → `DISCORD_APP_ID`; Public Key → `DISCORD_PUBLIC_KEY`.
3. Bot → Reset Token → `DISCORD_BOT_TOKEN`.
4. Mời bot vào server (OAuth2 scope `bot`+`applications.commands`), lấy channel ID → `DISCORD_CHANNEL_ID`.
5. Set 4 env → `vercel --prod --yes`.
6. Đăng ký slash: `curl -s "https://…/api/discord-register?key=887831eefad561ccfd5539ef7daedae7"`.
7. Portal → Interactions Endpoint URL = `https://meta-ads-deploy-three.vercel.app/api/discord-interactions`.
8. Xong: nút Tắt/Bật/Tăng/Giảm + `/pause /resume /budget` hoạt động.

## Webhook
Env `DISCORD_WEBHOOK_URL` đã set — là **secret**, không in ra chat/không commit; chỉ để ở Vercel env.
