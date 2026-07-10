---
name: shopify-screenshot
description: Screenshot Shopify embedded app bang Playwright MCP. Tu dong login Shopify admin va chup cac page trong embedded app. Dung cho UI review, QA, so sanh voi Figma.
trigger: explicit
---

# Shopify Screenshot - Playwright MCP

This skill must be reusable across Shopify stores and apps. Do not hard-code a store domain, store handle, app handle, output directory, or local browser profile in the skill body. Read all project-specific values from a local JSON config, the same way credentials are read.

## Step 0 - Load runtime config

Read `./.auth.json` from the current project or skill working directory.

Required format:

```json
{
  "email": "merchant@example.com",
  "password": "secret",
  "shopifyDomain": "example.myshopify.com",
  "storeHandle": "example",
  "appHandle": "bloy"
}
```

Recommended reusable format:

```json
{
  "email": "merchant@example.com",
  "password": "secret",
  "shopifyDomain": "example.myshopify.com",
  "storeHandle": "example",
  "appHandle": "bloy",
  "outputDir": "features/plans/screenshots",
  "chromeProfile": "~/.cache/shopify-screenshot/example-bloy",
  "viewport": {
    "width": 1440,
    "height": 1600
  },
  "routes": [
    { "name": "dashboard", "path": "", "waitForText": ["Metrics", "App status", "Loyalty", "Rewards"] },
    { "name": "analytics", "path": "/analytics", "waitForText": ["Analytics"] },
    { "name": "customers", "path": "/customers", "waitForText": ["Customers"] }
  ]
}
```

Supported keys:

| Key | Required | Meaning |
|-----|----------|---------|
| `email` | yes | Shopify account email. |
| `password` | yes | Shopify account password. Never print it to chat. |
| `shopifyDomain` | yes | The `*.myshopify.com` domain used for login, for example `example.myshopify.com`. |
| `storeHandle` | yes | Admin store handle used in `admin.shopify.com/store/<storeHandle>`. |
| `appHandle` | yes | Embedded app handle used in `/apps/<appHandle>`. |
| `outputDir` | no | Screenshot destination. Default: `features/plans/screenshots`. |
| `chromeProfile` | no | Persistent headed Chrome profile. Default: `~/.cache/shopify-screenshot/<storeHandle>-<appHandle>`. |
| `viewport.width` | no | Browser viewport width. Default: `1440`. |
| `viewport.height` | no | Browser viewport height. Default: `1600`. |
| `routes` | no | Routes to capture. If omitted, use the default Bloy routes below. |

Derived values:

```text
LOGIN_URL    = https://<shopifyDomain>/admin
ADMIN_ORIGIN = https://admin.shopify.com/store/<storeHandle>
APP_BASE_URL = https://admin.shopify.com/store/<storeHandle>/apps/<appHandle>
OUTPUT_DIR   = outputDir || features/plans/screenshots
PROFILE_DIR  = chromeProfile || ~/.cache/shopify-screenshot/<storeHandle>-<appHandle>
```

If `./.auth.json` exists but required fields are missing:
- Ask only for the missing fields.
- Offer to update `./.auth.json`.
- Continue once the required fields are available.

If `./.auth.json` is missing:
- Ask for `email`, `password`, `shopifyDomain`, `storeHandle`, and `appHandle`.
- Offer to save them to `./.auth.json` so the skill can be reused without re-entering values.
- Mention that the file should be gitignored.
- Proceed even if the user chooses not to save.

Never print the password to chat after reading or collecting it.

---

## Step 1 - Check session

Call `browser_snapshot` and check the current URL:

- Contains `ADMIN_ORIGIN` -> skip login and go to Step 3.
- Title is `Just a moment...` or body text contains `Your connection needs to be verified before you can proceed` -> MCP/headless is blocked. Use the headed persistent Chrome fallback below.
- Otherwise -> Step 2.

Login happens at most once per conversation unless the session expires mid-flow.

---

## Step 2 - Login

Shopify uses a two-step flow: email first, then password on the next screen.

```text
1. browser_navigate   -> LOGIN_URL
2. browser_snapshot   -> locate Email textbox ref
3. browser_fill_form  -> Email field only
4. browser_click      -> "Continue with email" button
5. browser_snapshot   -> Password field now appears
6. browser_fill_form  -> Password field
7. browser_click      -> "Log in" button
8. browser_snapshot   -> check result
9. If "Not now" button exists for passkey enrollment -> click it
10. Confirm URL starts with ADMIN_ORIGIN
```

2FA:
- If a verification or OTP field appears at step 8, ask the user for the code, fill it, and submit.

Login failed:
- If credentials came from `./.auth.json`, ask the user to re-enter the invalid field and offer to update the file.
- If credentials were entered manually, ask the user to re-enter the password.

### Headed Persistent Chrome Fallback

Use this fallback immediately when MCP is blocked by Shopify verification or repeatedly returns to the login method screen.

Use `PROFILE_DIR` from config. Launch headed Chrome through Playwright:

```js
chromium.launchPersistentContext(PROFILE_DIR, {
  channel: 'chrome',
  headless: false,
  viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  args: ['--disable-blink-features=AutomationControlled'],
});
```

If manual login is required:
- Keep Chrome open.
- Let the user complete Shopify login or verification in that browser.
- Do not close the browser until the app URL is reached.

Once login succeeds, the session persists in `PROFILE_DIR` and future screenshots should be faster.

---

## Step 3 - Screenshot each route

Shopify App Bridge often stretches the iframe to fill the viewport height. Set a tall viewport before navigating so the app renders all content without internal scrolling.

For each route:

```text
1. browser_resize    -> width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT
2. browser_navigate  -> APP_BASE_URL + route.path
3. handle redirects  -> wait through /exitiframe; if /app/grant appears, click Update
4. browser_wait_for  -> wait until actual app content is visible
5. browser_take_screenshot
                       filename: OUTPUT_DIR/<route.name>.png
                       fullPage: true
```

No need to locate the iframe. Screenshot the full page. Shopify admin chrome in the frame is acceptable for UI review.

Do not screenshot until all are true:

- URL starts with `APP_BASE_URL`.
- URL does not contain `/exitiframe`.
- URL does not contain `/app/grant`.
- Title is not `Log in`.
- Title is not `Just a moment...`.
- Body text contains route-specific app content.

Route-specific content check:
- If `route.waitForText` is configured, wait for any of those strings.
- If `route.waitForText` is not configured, wait for visible app content and avoid blank Shopify shell screenshots.

Timeout:
- Wait up to 30 seconds for normal routes.
- If the URL is still `/exitiframe` or `/app/grant`, handle those states instead of taking a blank screenshot.

### Grant Page Handling

If body text contains:

```text
needs access to:
```

Then click the `Update` button. This is expected after app permission changes.

After clicking:

```text
1. Wait 8-12 seconds for redirect.
2. If still on /app/grant, click Update again only if the button is visible.
3. Wait until URL returns to APP_BASE_URL.
4. Only then screenshot.
```

### Known Console Noise

These messages can appear during successful renders and should not block screenshots:

- CORS errors from app API domains.
- React warnings about SVG attributes such as `fill-rule` or `clip-rule`.
- React Router future flag warnings.
- Polaris accessibility warnings.

---

## Default routes

Use these routes only when `routes` is omitted from `./.auth.json`.

| Name | Route suffix | Wait text |
|------|--------------|-----------|
| `dashboard` | *(none)* | `Metrics`, `App status`, `Support channels`, `Loyalty`, `Rewards` |
| `analytics` | `/analytics` | `Analytics` |
| `customers` | `/customers` | `Customers` |
| `rewards_program` | `/rewards_program` | `Rewards` |
| `branding` | `/branding` | `Branding` |
| `settings` | `/settings` | `Settings` |
| `pricing_plans` | `/pricing_plans` | `Pricing`, `Plan` |
| `onboarding` | `/onboarding` | `Onboarding` |

---

## Output

Create `OUTPUT_DIR` if missing.

```text
Screenshots done: N/M pages
  - OUTPUT_DIR/dashboard.png
  - OUTPUT_DIR/analytics.png
Failed:
  - route-name: reason
```

When reporting to the user:
- Use the actual filenames.
- Mention any failed route and the reason.
- Do not reveal credentials.

---

## Error handling

| Situation | Action |
|-----------|--------|
| `./.auth.json` missing | Ask once for required fields, offer to save. |
| Required config key missing | Ask only for missing keys, offer to update JSON. |
| Wrong password from file | Ask user to re-enter, offer to update JSON. |
| 2FA prompt | Ask user for code, fill and submit. |
| Session expired mid-flow | Re-run login once, then continue. |
| Page load timeout | Retry once after 6 seconds; skip if still failing. |
| Route 404 in app | Skip and note in report. |
| `Just a moment...` or connection verification | Stop MCP retries; use headed persistent Chrome fallback. |
| URL contains `/exitiframe` | Wait for redirect; do not screenshot. |
| URL contains `/app/grant` or text `needs access to:` | Click `Update`, wait for `APP_BASE_URL`, then screenshot. |
| Screenshot is Shopify shell blank or white | Captured too early; wait for configured `waitForText` or real app content. |
