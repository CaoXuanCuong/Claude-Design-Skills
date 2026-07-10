# Output schema — design-discovery

File JSON ghi tại `features/plans/design-discovery/<feature>.json`. Đây là hợp đồng giữa skill này
(producer) và agent triển khai/verify (consumer). Giữ ổn định các tên field dưới đây.

## Top level

```jsonc
{
  "feature": "BLOY-1234 — Reward program: thêm tab Info",   // tên ngắn gọn của feature
  "generatedAt": "2026-06-24",
  "source": {
    "designExport": "<path tới bản export đã đọc>",
    "jira": "BLOY-1234",
    "appRepo": "shopify-app-loyalty-cms",
    "appPath": "web/frontend"
  },
  "viewport": [1440, 900],          // [w, h]; lấy từ export nếu khai báo khác
  "pages": [ /* PageEntry[] — xem dưới */ ],
  "open_questions": [               // mọi mâu thuẫn/thiếu thông tin; KHÔNG bịa để lấp
    "Spec không nói validation cho field Points — chặn <0 hay cho phép?"
  ]
}
```

## PageEntry

Mỗi entry = **một design-state** (một màn nhìn-thấy-được), không phải một file.

```jsonc
{
  "name": "editor-info-tab",                 // slug định danh state
  "design": {
    "screen": "RewardsProgram",              // tên/id card trong export
    "reach": ["goto::/rewards_program", "click::text='Info'"]
  },
  "app": {
    "route": "/rewards_program",             // SUY từ pages/** qua codegraph — không đoán
    "file": "web/frontend/pages/rewards_program/index.jsx",
    "component": "RewardsProgram",
    "exists": true,                          // false nếu state/route hoàn toàn mới
    "reach": ["goto::/rewards_program", "click::text='Info'"]
  },
  "elements": [ /* ElementOp[] */ ],
  "verify": [                                // assert::* để xác nhận state đúng sau khi code
    "assert::text='Info' visible",
    "assert::text='Earn points' visible"
  ]
}
```

## ElementOp

```jsonc
{
  "op": "add",                               // "add" | "update" | "delete"
  "name": "Earn points card",
  "selector": "text='Earn points'",          // cách định vị (text/role/data-page/testid)
  "polaris": {                               // map Polaris đúng tới prop (version 13.9.x)
    "component": "Card",                      // primitive Polaris CHÍNH (không gom chung)
    "composition": "Layout.AnnotatedSection > Card > FormLayout > TextField",  // cây lồng đúng
    "props": { "TextField": { "type": "number", "min": 0, "label": "Points" } },
    "matchesCodebase": "Giống cách RewardProgramForm.jsx dùng FormLayout — tái dùng primitive đó",
    "custom": false                          // true nếu không có primitive Polaris tương ứng (cần asset/SVG)
  },
  "anchor": "Sau card 'Program status', trong Layout.Section oneHalf",  // vị trí trong cây
  "spec": "Jira AC#2: merchant nhập điểm thưởng mỗi đơn, default 1",     // trích nguồn
  "diff": "App đang dùng <input> thường → đổi sang Polaris TextField type=number, min=0", // chỉ cho update/delete
  "events": [
    {
      "trigger": "onChange TextField 'Points'",
      "action": "set state + mark dirty → hiện App-Bridge SaveBar",
      "verify": "assert::text='Unsaved changes' visible"
    },
    {
      "trigger": "onClick SaveBar 'Save'",
      "action": "PUT /admin/reward-program (web/frontend/services/rewardProgram) → toast",
      "verify": "assert::text='Saved' visible"
    }
  ]
}
```

### Quy ước

- `op` quyết định bởi diff giữa (design + Jira) và app hiện tại (codegraph). `add`=app chưa có;
  `update`=có nhưng khác (bắt buộc điền `diff`); `delete`=app có mà design/spec bỏ.
- `events` rỗng `[]` chỉ khi element thuần hiển thị (text, badge tĩnh). Mọi control tương tác phải có
  ít nhất 1 event — "no dead UI".
- `selector`/`reach`/`verify` dùng DSL action ở SKILL.md để Playwright chạy lại được.
- Mọi `route`/`file`/`component` phải đến từ codegraph + file thật. Không nguồn → để trống và thêm
  câu hỏi vào `open_questions` top-level.
