# Design System Guide — BLOY × claude.ai/design

Hướng dẫn tổng cho các **skill design trong gói này** — `sync-design-system` (dựng DS bundle),
`component-ui-to-design` (code → gallery/framed screen), `design-discovery` (design → spec code),
`shopify-screenshot` (verify Playwright): cách chúng nối với nhau, khi nào dùng cái nào, khái niệm
cốt lõi, và những cái bẫy đã trả giá. Đây là **bản đồ**; quy trình chi tiết nằm trong từng `SKILL.md`
(nguồn sự thật — đọc trước khi làm).

> **Thứ tự**: `/component-ui-to-design` cần **`/sync-design-system`** chạy trước (tạo DS bundle để
> render lên). Nhánh phía sau `design-discovery` (`/writing-plans` → thực thi → review) và bước BA/PO
> Ground truth luôn là mỗi `SKILL.md` + (với DS) `.design-sync/config.json` & `NOTES.md`. Guide này
> KHÔNG thay thế chúng, chỉ định tuyến.

---

## 1. Mental model (30 giây)

**claude.ai/design ("Claude Design")** là một web host chạy các "card" HTML tĩnh, mỗi card render
UI thật bằng React + design system thật. Ta đẩy code lên đó qua **tool `DesignSync`** (đọc/ghi
project qua login claude.ai). Có 2 chiều làm việc:

```
        CODE  ──────────────────────────────────►  DESIGN            (dựng gallery UI thật)
   (/sync-design-system → /component-ui-to-design → framed screen)

        DESIGN ─────────────────────────────────►  CODE / SPEC       (từ thiết kế ra yêu cầu)
   (/design-discovery → /writing-plans → … [phần sau ngoài gói])
```

Một **project design** chứa: 1 *DS bundle* (Polaris thật, `window.ShopifyPolaris`), tuỳ chọn 1
*companion bundle* (component/page thật của app, `window.BloyUI`), và nhiều *card* HTML lắp 2
bundle đó lại thành màn hình.

---

## 2. Hai luồng

### 2A. Code → Design (đưa UI thật lên gallery)
```
/sync-design-system        1 lần / mỗi DS / version     →  _ds_bundle.js (window.ShopifyPolaris) + _vendor/react.js
        │                                                        (+ local render bundle để verify)
        ▼
/component-ui-to-design    mỗi batch component/page,       →  bloy-ui/bloy-ui.js (window.BloyUI) compile từ SOURCE THẬT
                           chạy lại khi git drift              + card gallery + framed screen (khung admin, §Framed screens)
```
- **Điều kiện tiên quyết**: `/component-ui-to-design` render dựa vào `_ds_bundle.js` mà
  `/sync-design-system` tạo ra → **phải sync DS trước**.
- Dựng màn hình tương tác trong khung Shopify admin (trước đây là `/codebase-to-design`) nay đã **gộp
  vào `/component-ui-to-design`** — xem `assets/admin-frame.template.html` + mục §Framed screens của skill.
- **Nguyên tắc vàng**: *never redraw — compile the actual source*. Component vẽ tay lệch ngay khi
  app đổi; component compile từ source đúng pixel *by construction*, update bằng cách chạy lại 1 build.

### 2B. Design → Code (từ thiết kế đi ngược)
```
/design-discovery         (kỹ thuật, cần Jira)      →  SPEC: mỗi design-state → route/component, mỗi element → Polaris nào,
        ▼                                               ADD/UPDATE/DELETE gì, event gì, action Playwright để verify
/writing-plans → thực thi → review     [NGOÀI GÓI]
```
- `/design-discovery` = bước **kỹ thuật** (map sang Polaris component + app router qua codegraph).
- Bước **nghiệp vụ** phía trước (design → requirement/user story/AC cho BA/PO, trước đây là

---

## 3. Skill trong gói

| Skill | Dùng khi | Input | Output | Tiên quyết |
|-------|----------|-------|--------|-----------|
| **/sync-design-system** | "sync polaris lên claude design", "DS cho app mới", "re-sync DS", "dựng render bundle local" | DS repo path / package name (đúng version của app) | DS bundle trên project + `_ds_bundle.js` (`window.<Global>`); local render bundle để verify | — |
| **/component-ui-to-design** | "đưa component/page X lên design", "compile page lên DS", "tạo variant gallery", "làm màn hình tương tác" | path component/page trong frontend repo + `configs/<app>.json` | companion bundle `window.<AppUI>` compile từ source + card đủ state/variant + framed screen (khung admin) | DS đã sync (`/sync-design-system`) |
| **/design-discovery** | có design handoff + ticket Jira: "map design này vào app", "element nào add/sửa/xoá", "dùng Polaris nào" | design bundle export + Jira key + codebase | SPEC (JSON + markdown): state→route, element→Polaris, ops, events, action Playwright | design bundle + Jira |
| **/shopify-screenshot** | "verify UI", "chụp app trong Shopify admin", "so bản dựng với design" | `./.auth.json`: creds + `storeHandle`/`appHandle`/`routes`/viewport — **config-driven, tái dùng cho mọi store/app** | auto login (2 bước + 2FA + fallback headed Chrome) → screenshot từng route (chờ `waitForText`, xử lý grant page) → PNG trong `outputDir` | `.auth.json` (gitignore — **KHÔNG share**) |

Mỗi skill có `SKILL.md` riêng với quy trình đầy đủ — **đọc nó khi thực thi**, guide này chỉ chọn skill.

---

## 4. Cấu hình BLOY hiện tại (live anchors)

> Xác minh lại với `polaris-react/.design-sync/config.json` + `NOTES.md` trước khi dựa vào — dưới đây
> là trạng thái đã verify trong các phiên gần nhất.

- **Project code→design đang dùng**: `Shopify Polaris 13.10.1` — projectId `6e617322-31b5-4f5d-b9b5-6ed2526ced18`.
- **Version DS**: `@shopify/polaris` 13.10.1 · `@shopify/polaris-icons` 9.3.1 · `@shopify/polaris-tokens` 9.4.2.
  `@shopify/polaris-viz` **chưa sync** vào project này (deferred).
- **Bundle dir (nguồn upload)**: `polaris-react/ds-bundle/`
  - `_ds_bundle.js` / `.css` → `window.ShopifyPolaris` (Polaris thật + `previewI18n`)
  - `_vendor/react.js` → set CẢ `window.React` và `window.ReactDOM` (1 file gộp)
  - `bloy-ui/bloy-ui.js` → `window.BloyUI` (compile từ ~38 page BLOY thật; ~12MB minified)
  - `bloy-ui/fixtures.js` → fixture DÙNG CHUNG cho form card (xem §6)
  - `components/bloy-screens/<Name>/<Name>.html` → ~57 card màn hình (khung admin + nav BLOY)
  - `components/bloy-components/…` → card component lẻ
  - `images/**` → branding, flags, integration, plan, common, **onboarding, program**
- **App source (READ-ONLY khi sync)**: `bloy_loyalty/shopify-app-loyalty-cms/web/frontend/`.
  Không sửa source lúc dựng design — sửa **seam/fixture**, không sửa component.

---

## 5. Khái niệm cốt lõi

- **DS bundle** (`_ds_bundle.js`): Polaris thật, expose `window.ShopifyPolaris.*`. Do
  `/sync-design-system` tạo. Global name auto-derive từ tên package.
- **Companion bundle** (`bloy-ui.js`): component/page thật của app, expose `window.BloyUI.*`, đứng
  CẠNH DS bundle. Do `/component-ui-to-design` build bằng esbuild (IIFE). Page export theo path
  (`pages/index.jsx`→`Index`, `customers/[id]`→`CustomersId`). Minify-in-place OK (esbuild rename
  var nhất quán, giữ patch).
- **Card** = 1 file HTML lắp `_vendor` + `_ds_bundle` + `bloy-ui` + mount 1 export vào `#app-root`.
  Card phải **co-locate** cùng project với `_ds_bundle.js` (cross-project isolation: card ở project
  khác sẽ không thấy bundle).
- **`@dsCard group="..."`** (dòng đầu mỗi card HTML): app tự build `_ds_manifest.json` để nhóm card
  trong gallery. Tiền tố số (`0 ·`, `1 ·`…) để ép thứ tự + đẩy nhóm BLOY lên đầu.
- **Sentinel `_ds_needs_recompile`**: ghi file này (nội dung "1") để báo app recompile manifest sau
  khi upload. **Ghi ĐẦU (trước batch) và ghi LẠI CUỐI (sau khi mọi byte đã lên).**
- **Seam shim** (trong companion bundle): react/react-dom→window globals, `dsGlobals`→
  `window.ShopifyPolaris`, `react-redux` (selector chạy trên `window.__APP_STATE__`), `app-bridge`,
  `react-i18next`, `react-beautiful-dnd`, `process.env`, network→`window.fetch`. Sửa lỗi ở SHIM, không
  ở component.

---

## 6. Fixtures — làm form/hiển thị có dữ liệu thật (không blank)

Card render KHÔNG có store/backend → form trống nếu không mớm dữ liệu. Cơ chế: **`bloy-ui/fixtures.js`**
(1 module dùng chung, load trước bundle).

- Cung cấp `window.__APP_STATE__` = **canonical store superset** (general/loyalty/VIP/multipleLanguage)
  dựng từ `initialState` của reducer + giá trị BLOY thật (shop bloy-demo, configs đầy đủ, Point/Points,
  VIP tiers, `translations.en` = `BACKUP_TRANSLATION`). react-redux shim chạy selector thật trên nó.
- Cung cấp **fetch router** `/__fx/*` trả `{message,payload}`. Card override qua (đặt TRƯỚC thẻ
  `<script src=fixtures.js>`):
  - `window.__APP_STATE_OVERRIDE__` — deep-merge lên canonical (chỉ delta của card).
  - `window.__FX__ = [{match, method?, payload|envelope}]` — record theo endpoint (editor theo id,
    integration đã connect, record của 1 way to earn/redeem…).
- **Quy tắc "giữ constant seed"**: endpoint nào component tự seed từ constant rồi chỉ ghi đè khi
  `message==='OK'` → router phải trả **NON-OK** (vd `/emails/`, `/widgets`), nếu trả `{OK,payload:[]}`
  sẽ XOÁ seed → blank.
- `__APP_STATE__` là **tĩnh**; muốn toggle redux flip live thì implement `window.__APP_DISPATCH__`
  map các setter (`setConfigs`, `setStatus`…) qua `setState(deepMerge(...))`.
- Mock data vs empty: mặc định trả empty-hợp-lệ; khi cần "trông có data" thì trả record thật theo đúng
  shape (trace từ source). Editor theo id: trả 1 entity đầy đủ từ fetch `:id`.

---

## 7. Tool `DesignSync` — cheat-sheet

Đọc: `list_projects` / `get_project` / `list_files` / `get_file` (không tốn prompt sau khi có scope).
Ghi (cần `finalize_plan` trước):
1. `finalize_plan(projectId, writes:[globs], deletes:[], localDir)` → `planId`. User duyệt plan (cổng attended).
2. `write_files(planId, files:[{path, localPath}])` — `localPath` đọc từ đĩa, nội dung KHÔNG vào context;
   ≤256 file/call, chia nhiều call nếu cần. (Dùng `data` chỉ cho nội dung nhỏ động như sentinel.)
3. **Sentinel**: ghi `_ds_needs_recompile` (data "1"). Với re-sync toàn bộ: ghi sentinel ĐẦU rồi batch
   rồi ghi sentinel LẠI cuối. Với upload lẻ vài card: ghi card xong rồi ghi sentinel là đủ.
- **Incremental luôn** — không xoá sạch rồi thay. Upload chỉ những gì đổi.
- **Chỉ đổi dòng `@dsCard group`?** vẫn phải re-upload card đó + re-arm sentinel (manifest build từ card).

---

## 8. Verify (bắt buộc trước khi tin là xong)

Headless Playwright từ `polaris-react/.ds-sync/node_modules/playwright` (CommonJS — `require`, không
`import`), load card qua `file://`, kiểm: **0 `PAGEERR`**, `#app-root` có render (childCount>0, textLen
hợp lý), input đã điền (đếm text input; toggle off là hợp lệ), và **đọc screenshot** xác nhận bằng mắt.

- **Ép state để test**: card dùng `MemoryRouter` → set `initialEntries: ['/route/…']` hoặc
  `['/?step=N']` (page đọc `useSearchParams`) trong 1 file tạm cùng thư mục card (giữ path tương đối
  `../../../` còn resolve được), test xong xoá.
- **Drive interaction**: `page.evaluate` click button theo text để kiểm luồng (vd Onboarding step4→5).
- Với nhiều card: fan-out subagent (mỗi agent 1 batch, tự verify + screenshot + report; escalate cái
  gì thuộc canonical/router về orchestrator, không để agent tự sửa `fixtures.js`).
- **Gate-4 (đối chiếu app THẬT)**: dùng **`/shopify-screenshot`** để chụp app chạy thật trong Shopify
  admin rồi so với card/design. Skill này **config-driven** — đọc `./.auth.json` (creds +
  `storeHandle`/`appHandle`/`routes`/viewport), **tái dùng cho mọi store/app** (không hard-code store/app
  trong skill); tự login (2 bước, 2FA, fallback headed Chrome khi bị chặn verification).

---

## 9. Gotchas (đã trả giá)

**Auth / setup**
- Cần login design scope: chạy `/design-login` trong CLI tương tác (khác `/design-consent`). Phiên
  headless/cron có thể thiếu MCP claude.ai.
- `finalize_plan.localDir` phải là **đường tuyệt đối**; cwd của Bash không bền → tránh `./ds-bundle` nhân đôi.

**Sync DS**
- Sync **đúng version của app**, không "latest" — lệch version = lệch giao diện, hỏng cả chuỗi fidelity.
- `cfg.provider` phải set tường minh (AppProvider) — decorator storybook kéo code manager-side làm vỡ render.
- `extraEntries` resolve theo **PKG_DIR** (thư mục package trong cùng, không phải repo root) → i18n
  `previewI18n` sai path là mọi label i18n trống.
- Component host-rendered (App Bridge chrome) render TRẮNG trong sandbox → sync dạng guideline, không phải card.

**Companion bundle / card**
- Page export **trùng tên** → build fail; dùng tên theo path (đã patch `build-app-ui.mjs`).
- `import.meta.glob` (Vite-only) crash init → shim `Object.prototype.glob`→`{}` (đã gộp trong fixtures.js).
- Ảnh `src="/images/..."` (root-absolute) 404 trên host design → script rewrite `<img src>` sang
  `../../../images/...`; **CSS `url('/images/...')` KHÔNG được rewrite** (cần patch bundle nếu quan trọng).
- **Thiếu thư mục ảnh**: nhớ copy đủ `assets/images/<...>` vào `ds-bundle/images/` (vụ `onboarding` +
  `program` từng thiếu → 404 loạt). Ảnh không do build sinh — mất bundle thì copy lại tay.
- `react-beautiful-dnd` có store react-redux riêng → đụng shim → blank list; đã có shim rbd render tĩnh.
- Reexport `polaris-viz` làm vỡ subpath CSS → đừng reexport; chart render empty-state nếu thiếu provider.

**Fixtures / preview**
- `__APP_STATE__` tĩnh: dispatch chạy side-effect (toast) nhưng UI selector không re-render trừ khi wire
  `__APP_DISPATCH__`.
- App-Bridge `<Modal id=... open={...}>`: shim `useModalOpen` **bỏ qua `open` khi có `id`** → modal
  không mở (chỉ mở qua `shopify.modal.show(id)`). Fix triệt để = sửa shim + **rebuild bundle 12MB**; né
  bằng cách đổi state cho luồng đi tiếp (vd cho `checkEmbed` trả `status:true`).
- Đọc unguarded state hay crash: seed đủ shape trong `__APP_STATE_OVERRIDE__` (vd `onboardingData.stepN`).

**Re-sync**
- Full re-sync **xoá** file hand-authored (card app-page, `bloy-ui/`, `fixtures.js`) khi reconcile →
  **re-upload lại sau** (companion = 1 lệnh build; fixtures.js phải tạo lại tay).
- Đổi `@dsCard group` = phải re-upload card + re-arm sentinel.

---

## 10. Recovery / nơi có sự thật

- **Re-sync 1 lệnh**: `node <repo>/.ds-sync/resync.mjs --config … --out ./ds-bundle` (đọc "Re-sync risks"
  trong NOTES trước). Fetch anchor `_ds_sync.json` trước; đừng tải `_ds_bundle.js`.
- **Rebuild companion**: chạy lại `build-app-ui.mjs` (xem references trong `/component-ui-to-design`).
- **Sự thật ở đâu**:
  - Trạng thái + fix tích luỹ: `polaris-react/.design-sync/config.json` (chỉ THÊM, không thay
    `titleMap`/`overrides`/`provider`) và `.design-sync/NOTES.md`.
  - Quy trình từng skill: `.claude/skills/<skill>/SKILL.md`.
  - Toolkit build/validate/resync: `<repo>/.ds-sync/`.

---

## Quick reference — chọn skill theo tình huống

| Tình huống | Skill |
|---|---|
| Đưa 1 component/page code lên gallery | `/component-ui-to-design` |
| Dựng màn hình tương tác từ 1 page (khung admin) | `/component-ui-to-design` (§Framed screens) |
| Có design + Jira, cần biết sửa gì trong app | `/design-discovery` |
| Verify UI / chụp app THẬT trong Shopify admin | `/shopify-screenshot` (config-driven, mọi store/app) |
| Form/màn trống dữ liệu | thêm/patch `fixtures.js` (§6) |
| Card lỗi trắng / ảnh 404 | §8 verify + §9 gotchas |
| App mới chưa có DS trên claude design | `/sync-design-system` (first sync) |
| Polaris lên version mới / DS đổi | `/sync-design-system` (re-sync) |
