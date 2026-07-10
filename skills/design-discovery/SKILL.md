---
name: design-discovery
description: >-
  Bắc cầu giữa thiết kế và code cho BLOY Loyalty: đọc một design handoff (bundle) export từ
  claude.ai/design + spec từ Jira + codebase CMS (qua codegraph để xác định app router) → xuất ra
  một SPEC khám phá (JSON + tóm tắt markdown) liệt kê: mỗi design-state map vào route/component nào
  của app, mỗi element design map sang ĐÚNG component Shopify Polaris nào, cần ADD/UPDATE/DELETE
  element gì, cần wire event/handler gì, và chuỗi action Playwright để tới state đó + để verify. Đây
  là bước PHÂN TÍCH (không code, không tự verify) — output đủ chi tiết để một agent khác triển khai
  code và verify frontend trên Playwright. Dùng skill này khi user đưa một bản design (claude design
  / handoff / bundle) kèm một ticket Jira và hỏi "chỗ nào cần sửa giao diện", "map design này vào
  app", "elements nào cần thêm/sửa/xoá", "design này dùng Polaris component nào", "discovery cho
  design này", "tạo spec từ design + Jira" — kể cả khi không nói thẳng chữ "discovery". Chỉ phân
  tích CMS admin SPA (`shopify-app-loyalty-cms/web/frontend`).
argument-hint: "<đường dẫn design export> <Jira key, vd BLOY-1234> [feature name]"
---

# Design Discovery — bắc cầu Design ↔ Polaris ↔ App

Mục tiêu: biến **một bản thiết kế + một spec Jira** thành **một bản đồ thi công** chính xác trên
codebase thật, để agent triển khai không phải đoán "sửa ở đâu, dùng component Polaris nào, sửa cái
gì" và agent verify biết "bấm gì để tới đúng màn rồi assert gì". Skill này **chỉ phân tích** — không
sửa code, không tự chạy Playwright. Sản phẩm là **một file JSON máy-đọc + một tóm tắt markdown
người-đọc**.

## Vì sao skill này tồn tại (đọc trước khi làm)

Ba nguồn thông tin nằm ở ba thế giới khác nhau và **không tự nối với nhau**:

1. **Design** (export từ claude.ai/design) nói *cái gì nên thấy* — layout, element, state, tương tác.
2. **Jira** nói *ý định & ràng buộc* — feature này thêm/đổi gì, edge case, acceptance criteria.
3. **Codebase** nói *sự thật hiện tại* — route nào, component nào, handler nào đang render cái đó.

Giá trị của skill = **khớp ba cái lại, và neo vào đúng Polaris**: lấy từng design-state, map mỗi
element sang đúng component Shopify Polaris, tìm đúng route/component đang (hoặc sẽ) render nó, rồi
diff với spec Jira để ra danh sách element cần ADD/UPDATE/DELETE + event cần wire.

Hai sai lầm chí mạng cần tránh:
- **Đoán route theo tên** thay vì truy từ code: màn "Rewards" có route `/rewards_program` (không phải
  `/reward_program`). Route phải **suy ra từ file thật qua codegraph**, không bịa.
- **Map sai/chung chung Polaris component**: "một cái bảng" → phải biết là `IndexTable` hay
  `DataTable`; "ô ngày" → `DatePicker`/`Popover` chứ không phải `<input type=date>`; "khối có tiêu đề
  bên trái" → `Layout.AnnotatedSection` chứ không phải `Card` trần. Sai primitive = sai giao diện =
  agent thi công ra UI lệch.

## Cấu hình dự án (không hỏi user)

| Key | Value |
|-----|-------|
| App phân tích | `bloy_loyalty/shopify-app-loyalty-cms/web/frontend` (CMS admin SPA) |
| Polaris version | **`@shopify/polaris` 13.9.x** — mọi mapping phải đúng API/prop của version này |
| codegraph `projectPath` | `bloy_loyalty/shopify-app-loyalty-cms` (mặc định là repo polaris — phải set, nếu không query nhầm graph) |
| Routing | File-based ([Routes.jsx](../../../bloy_loyalty/shopify-app-loyalty-cms/web/frontend/Routes.jsx)): `pages/x/index.jsx`→`/x`; `pages/x.jsx`→`/x`; `[id]`→`:id`; chữ cái đầu lowercase |
| Viewport mặc định | `[1440, 900]` (đổi nếu design export khai báo khác) |
| App base URL (cho `app.reach`) | `https://admin.shopify.com/store/caocuongxuan/apps/bloy<route>` (xem [/shopify-screenshot](../shopify-screenshot/SKILL.md) để login/navigate) |
| Jira | đọc qua Atlassian MCP `getJiraIssue(<key>)` |
| Output | `bloy_loyalty/shopify-app-loyalty-cms/features/plans/design-discovery/<feature>.json` + `<feature>.md` |

## Quy trình

### A. Đọc design export (bundle từ claude.ai/design)

Lấy design theo thứ tự ưu tiên (đừng đoán nguồn — hỏi/kiểm tra):
1. **Bundle handoff đã tải về đĩa** (cách thường gặp & chắc nhất): một thư mục `*-handoff/<project>/`
   chứa `README.md` ("CODING AGENTS: READ THIS FIRST") + `project/*.html` (các card Polaris thật) +
   `_vendor`/`_ds`/`bloy-icons`/`uploads`. `find ~/ /home/pc/project -iname "*handoff*"` để tìm.
2. **MCP `claude_design` của project** (server trong `.mcp.json`, tool `mcp__claude_design__*`:
   `list_projects` → `list_files` → `read_file`). **KHÔNG dùng tool built-in `DesignSync`** — đó là
   thứ khác, dễ bị từ chối. `read_file` **cap 256 KiB**.

**Inspect cấu trúc thật trước** (`find`/`ls`), đừng giả định.

**Card lớn (≈0.5–1 MB) — KHÔNG `Read` cả file** (vượt token; line 1 thường là blob CSS/base64 vài
trăm KB). Thay vào đó đọc từ **bản trên đĩa** và bóc tách bằng shell:
- Bundle vendor/CSS là file ngoài (`<script src="_vendor/…">`) → body design nằm trong `<script>`
  cuối file, viết dạng **`h(P.Component, props, children)`** (`P` = Polaris, `h` = createElement).
- Inventory component: `grep -oE "P\.[A-Za-z]+" card.html | sort | uniq -c | sort -rn`.
- Card thường là **MỘT app hợp nhất nhiều màn**: tìm `function App(`, các `var TABS=`, `data-page=`,
  `setPage('x')`, và **sub-view theo feature** (`SUB`/`customize(type)` — vd `widgetCustomize`,
  `themeCustomize`). Tìm đúng function khớp feature Jira rồi `awk 'NR>=L1&&NR<=L2{print NR": "substr($0,1,1400)}'`
  để in từng dòng (cắt bớt) + theo các helper nó gọi (`colorField`, `iconRow`, `preview`…).

Từ đó liệt kê các **design-state** rời rạc (một màn nhìn-thấy-được, tới bằng một chuỗi tương tác:
`data-page`/`setPage`, `Tabs`, modal/drawer, detail row, mode search/filter). Mỗi state ghi:
- `screen`: tên function/màn trong card (vd `widgetCustomize`).
- `reach`: chuỗi action tới state (xem **DSL action**) — bám **text/role/`data-page`**, không class hash.
- `elements`: element đáng kể + nhãn; vì là Polaris thật, `h(P.X,{props})` cho thẳng component + prop
  → input mạnh nhất cho bước map Polaris (C).

### B. Đọc spec Jira

`getJiraIssue(<key>)` → lấy **mô tả, acceptance criteria, ảnh đính kèm, comment**. Rút ra *ý định*:
feature thêm/sửa/bỏ gì so với hiện trạng, ràng buộc (validation, quyền, edge case), và **hành vi**
(bấm nút này thì gọi API nào / hiện gì). Đây là nguồn quyết định `op` (add/update/delete) và `events`.
Nếu spec mâu thuẫn hoặc thiếu so với design → ghi vào `open_questions`, **không tự bịa**.

### C. Map mỗi element → ĐÚNG Polaris component (mấu chốt)

Đây là phần dễ sai nhất và là lý do skill tồn tại. Với **mỗi element** trong từng state, xác định
**đúng component Polaris 13.9.x** + props/variant + cách lồng (composition), bằng cách đối chiếu **hai
nguồn sự thật**:

1. **Card export** — đọc class `Polaris-…` / cấu trúc DOM của element để nhận diện component gốc.
2. **Cách codebase đang dùng Polaris** — `codegraph_explore`/Read component thật trong `web/frontend`
   để xem cùng loại element ở chỗ khác đang import primitive nào. **Dùng lại đúng primitive đó, không
   thay thế.** Đây là "fidelity pass": match cả *component* lẫn *composition* (cây
   `Page`/`Layout`/`Layout.Section`(`oneThird`)/`Layout.AnnotatedSection`/`Card`/`FormLayout`/
   `FormLayout.Group` + props `variant`/`tone`/`gap`/`helpText` + thứ tự), không chỉ "nhìn giống".

Bẫy thay-thế hay gặp (ghi rõ component đúng, không gom chung "table"/"input"):

| Design nhìn như | Polaris đúng (13.9.x) | KHÔNG phải |
|---|---|---|
| Bảng có chọn dòng / bulk action / sort | `IndexTable` (+ `useIndexResourceState`, `useSetIndexFiltersMode`) | `DataTable` |
| Bảng số liệu tĩnh, không chọn dòng | `DataTable` | `IndexTable` |
| Search + filter trên đầu bảng | `IndexFilters` | tự ghép `TextField`+`Button` |
| Ô chọn ngày | `DatePicker` trong `Popover` | `<input type=date>` |
| Khối có tiêu đề + mô tả bên trái, form bên phải | `Layout.AnnotatedSection` | `Card` trần |
| Nhóm field trong form | `FormLayout` / `FormLayout.Group` | `<div>` + `TextField` rời |
| Chọn 1-trong-nhiều / nhiều-trong-nhiều | `ChoiceList` / `RadioButton` / `Checkbox` | `<select>` |
| Trạng thái (active/draft…) | `Badge` (`tone`) | `<span>` màu |
| Tải file | `DropZone` | `<input type=file>` |
| Hành động lưu form embedded | App-Bridge **SaveBar** (dirty state) | `Button` "Save" rời |

Nếu design có element **không có sẵn** primitive Polaris tương ứng (icon riêng, layout đặc thù) → ghi
rõ là custom + cần asset/SVG, đừng ép vào một component sai.

### D. Xác định app router & component bằng codegraph (BẮT BUỘC)

Luôn set `projectPath` = CMS root. Một call `codegraph_explore` thường đủ:

- `codegraph_explore({projectPath, query:"pages router <khu vực> page component nào render <nhãn từ design> và gọi handler/service gì"})`
  → trả về composition graph + source thật. Đây là cách nối design-state ↔ route/component và là input
  cho bước map Polaris (C).
- `codegraph_callers(<Component>, {projectPath})` — ai render/import nó (chuỗi page→component→modal).
- `codegraph_callees(<Component>, {projectPath})` — handler/hook/service nó gọi → ra `events` thật
  (onClick→service `web/frontend/services/*`→route `admin/*` ở API).

Với mỗi design-state, chốt: `route` (suy từ file `pages/**` theo luật routing ở bảng trên — **không
đoán**), `file`, `component`, và `reach` để tới đúng state đó **trong app thật**. Nếu design-state
**chưa có** trong app → `route`/`component` = nơi nó *sẽ* thuộc về (page cha gần nhất), element
`op:"add"`.

### E. Diff → ra element-ops & events

Với mỗi state, so **design (A) + Polaris đúng (C) + spec (B)** với **app hiện tại (D)**:
- Element có trong design/spec mà app **chưa có** → `op:"add"`.
- Có ở cả hai nhưng **khác** (nhãn, vị trí, **Polaris component/prop**, validation, data) → `op:"update"`,
  ghi rõ *khác chỗ nào* (gồm cả "đang dùng primitive sai → đổi sang X").
- App **có** mà design/spec bỏ → `op:"delete"`.
- Mỗi affordance (button/field/row/tab/toggle…) phải có `events` nếu nó *làm gì đó*: trigger → action
  (mở modal / navigate / gọi API + SaveBar / mutate state) → cách verify. "No dead UI": control
  chỉ-nhìn-đúng mà không wire event là thiếu sót cần liệt kê.

### F. Xuất output

Ghi **JSON** đúng schema (xem [references/output-schema.md](references/output-schema.md), ví dụ đầy
đủ ở [assets/example-output.json](assets/example-output.json)) vào
`features/plans/design-discovery/<feature>.json`, kèm **tóm tắt markdown** `<feature>.md` (bảng: state
→ route → #add/#update/#delete → Polaris component chính → events nổi bật + `open_questions`). Tạo
thư mục nếu chưa có. Cuối in tóm tắt ngắn ra chat (mỗi state 1 dòng + tổng số op + số câu hỏi mở).

## DSL action (dùng cho `reach` và `verify`)

Một mini-DSL gọn, map thẳng sang Playwright MCP để agent verify chạy lại được. `selector` ưu tiên
**text / role / data-page / testid** (ổn định), tránh class hash.

| Verb | Cú pháp | Ý nghĩa |
|------|---------|---------|
| goto | `goto::<route>` | điều hướng tới route app (vd `goto::/rewards_program`) |
| click | `click::text='Info'` · `click::role=button[name='Save']` · `click::data-page='rewards'` | bấm element |
| fill | `fill::label='Points'=100` | điền field theo label |
| select | `select::label='Type'='Fixed'` | chọn option |
| hover | `hover::text='…'` | hover |
| wait | `wait::text='Earn points'` | chờ tới khi thấy |
| assert | `assert::text='Earn points' visible` · `assert::role=dialog visible` | kiểm chứng (chỉ trong `verify`) |

`reach` = chuỗi để **tới** state. `verify` = chuỗi `assert::*` để **xác nhận** state/element đúng sau
khi triển khai. Viết `verify` đủ để Playwright phân biệt "đã làm đúng" vs "chưa".

## Nguyên tắc

- **Suy ra, đừng đoán.** Route/component/handler từ codegraph + file thật; nhãn/element từ design
  export thật; Polaris component đối chiếu cả export lẫn cách codebase đang dùng; ý định từ Jira thật.
  Thiếu nguồn → `open_questions`.
- **Polaris phải đúng tới prop.** Mỗi element-op nêu rõ component 13.9.x + props/variant + composition,
  không gom chung. Sai primitive là lỗi, không phải tiểu tiết.
- **Đủ chi tiết để thi công & verify.** Mỗi element-op tự đứng được: ở đâu (route+component+file), cái
  gì (Polaris component + nhãn + data), tại sao (trích spec), wire event gì, verify thế nào.
- **Không over-reach.** Chỉ CMS `web/frontend`. Không đụng extensions/storefront trừ khi user yêu cầu.
- **Bám API version đúng lớp** (CMS web = 2026-01) khi cần tra Shopify docs cho field/mutation.
```
