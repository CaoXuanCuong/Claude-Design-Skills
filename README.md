# Design Workflow — Gói tài liệu sharing nội bộ

Gói self-contained cho buổi sharing **Design Workflow Optimization**: dùng **Claude Design**
(claude.ai/design) để nối liền **thiết kế → spec → code**. Gồm slide deck + đúng các skill trong
`.claude/skills/` mà bài sharing nói tới.

> Bản đồ chi tiết của luồng design nằm ở [`DESIGN-SYSTEM-GUIDE.md`](./DESIGN-SYSTEM-GUIDE.md) —
> đọc nó để hiểu sâu; README này chỉ giới thiệu gói và định tuyến.

---

## Nội dung gói

```
design-workflow-sharing/
├── design-workflow-sharing.html   # ★ Slide deck (mở bằng trình duyệt)
├── DESIGN-SYSTEM-GUIDE.md         # Bản đồ luồng design (các skill trong gói)
├── README.md                      # File này
└── skills/                        # 4 skill design, copy từ .claude/skills/
    ├── sync-design-system/        # dựng DS bundle (điều kiện tiên quyết cho component-ui)
    ├── component-ui-to-design/    # code → gallery + framed screen (+ khung admin); app-agnostic
    ├── design-discovery/          # ★ design + Jira → SPEC map vào code
    └── shopify-screenshot/        # verify bằng Playwright (đã loại .auth.json)
```

## Mở bài sharing

Mở [`design-workflow-sharing.html`](./design-workflow-sharing.html) bằng trình duyệt bất kỳ
(double-click, hoặc kéo vào Chrome). Deck 16 slide, điều hướng bằng `↑ ↓`, `space`, scroll, hoặc
chấm bên phải. Không cần cài gì (font tải online; xem offline thì chữ vẫn đọc được).

## Mạch nối mà deck trình bày

Deck kể một dây chuyền từ ý tưởng tới code đã verify. Các skill trong gói lo 3 chặng:

1. **Code → Design** — `sync-design-system` dựng DS bundle, rồi `component-ui-to-design` compile source
   thật thành gallery + *framed screen* trong khung Shopify admin.
2. **Design → Code** — `design-discovery`: map mỗi design-state → route/component + đúng Polaris
   component (ADD/UPDATE/DELETE, event), kèm action Playwright.
3. **Verify** — `shopify-screenshot`: Playwright chụp app trong Shopify admin để so bản dựng với design.

> Bước nghiệp vụ trước đó (design → requirement cho BA/PO, trước là `/design-to-requirements`) **không
> còn trong gói**.

> Deck có nhắc `/bloy:build-feature` (gather-spec → explore-spec → … → design-verify) — đó là một
> **cỗ máy workflow riêng** (`bloy-cook`), **không** nằm trong gói này theo yêu cầu. Gói này chỉ
> gồm các skill trong `.claude/skills/`.

## 4 skill trong gói

| Skill | Vai trò trong bài sharing | Dùng khi |
|-------|---------------------------|----------|
| **sync-design-system** | Nạp design system (Polaris đúng version) lên Claude Design — *điều kiện tiên quyết* để `component-ui-to-design` render đúng "gạch" (slide 3–4). | "sync polaris lên claude design", "DS cho app mới", "re-sync DS". |
| **component-ui-to-design** | Bóc tách custom component & app page thành *companion bundle compile từ source thật* + gallery đủ state/variant, và **bọc page vào khung Shopify admin** thành *framed screen tương tác* (slide 4). **App-agnostic** — dùng cho mọi Shopify app qua `configs/<app>.json`. | "đưa component/page X lên design", "tạo variant gallery", "làm màn hình tương tác". |
| **design-discovery** ★ | *Trái tim của mạch nối* (slide 6, 8): đọc design bundle + Jira + codebase → SPEC map mỗi state → route/Polaris component, ADD/UPDATE/DELETE, event, action Playwright để verify. | Có design + Jira: "map design này vào app", "elements nào add/sửa/xoá". |
| **shopify-screenshot** | *Verify bằng mắt máy* (bậc 3, dòng credit): Playwright login Shopify admin, chụp iframe embedded app để so với design. | UI review / QA / so sánh bản dựng với design. |

Mỗi skill có `SKILL.md` riêng với quy trình đầy đủ (một số kèm `references/`, `assets/`, `scripts/`,
`configs/`). Đọc `SKILL.md` khi thực thi.

## Cách dùng các skill này

Đây là **Claude Code skills**. Để dùng lại ở một máy/repo khác:

1. Copy các thư mục con trong `skills/` vào `.claude/skills/` của repo đích.
2. Trong Claude Code gọi bằng `/<tên-skill>`, ví dụ `/component-ui-to-design`, `/design-discovery`.

**Lưu ý `shopify-screenshot`:** file `.auth.json` (Shopify login state) đã **cố ý loại khỏi gói** vì
là credentials. Ai dùng skill này phải tự tạo `.auth.json` của mình theo hướng dẫn trong `SKILL.md`.

## Đã loại khỏi gói (và vì sao)

- **`bloy-cook/`** — cỗ máy chạy `/bloy:build-feature`; theo yêu cầu chỉ gói skill trong `.claude/skills/`.
- **`codebase-to-design`** — đã bỏ: phần lõi (dựng page tương tác) trùng `component-ui-to-design`; khung
  admin Shopify duy nhất nó giữ đã **gộp vào** `component-ui-to-design` (`assets/admin-frame.template.html`).
- **`design-to-requirements`** (bước BA/PO) — đã gỡ khỏi gói.
- **Skill dev chung** (`writing-plans`, `executing-plans`, `subagent-driven-development`, `code-review`,
  `qa-test-planner`) — không phải skill *design*; phần plan/execute/verify của deck do build-feature lo.
- **Skill không liên quan** (`cse-salary`, `improve-codebase-architecture`, `understand-shopify-app`).
- **`shopify-screenshot/.auth.json`** — credentials, không được share (theo `security.md`).

## Nguồn & cập nhật

Phần lớn file là **bản copy** tại thời điểm đóng gói (nguồn: `.claude/skills/<skill>/` và
`.claude/design-workflow-sharing.html`) — copy lại khi gốc đổi.

> **Ngoại lệ — `component-ui-to-design` đã được generalize riêng cho gói này**: gỡ hết chi tiết BLOY
> (bỏ config BLOY & thêm `configs/_template.json`, ví dụ generic, neutralize brand/store trong khung
> admin) để dùng chung cho **mọi Shopify app** qua `configs/<app>.json`. Bản ở `.claude/skills/` vẫn
> giữ nguyên kiểu BLOY (config + ví dụ thật) để dùng nội bộ. Hai bản **cố ý khác nhau** — đừng copy
> đè bản gốc lên bản trong gói.
