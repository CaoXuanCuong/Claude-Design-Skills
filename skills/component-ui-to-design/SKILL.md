---
name: component-ui-to-design
description: Bóc tách CUSTOM COMPONENT và APP PAGE (xây trên Shopify Polaris hoặc design system khác) từ codebase frontend của MỘT Shopify app BẤT KỲ thành design system trên claude.ai/design — compile SOURCE THẬT thành companion bundle (window.<AppUI>) đứng cạnh bundle DS đã sync, dựng gallery card tương tác phủ đủ mọi state/variant, và bọc page vào khung Shopify admin (assets/admin-frame.template.html) thành "framed screen". App-agnostic hoàn toàn qua file config (configs/<app>.json — bắt đầu từ configs/_template.json). Dùng khi user nói "đưa component/page X lên claude design", "bóc tách component thành design system", "sync custom component/page lên DS", "tạo variant gallery", "compile page lên design" — kể cả khi chỉ nêu tên component/page trong một repo frontend.
argument-hint: "<component/page path(s) trong frontend repo> [--config configs/<app>.json]"
---

# Custom components & pages → Claude Design (compiled companion bundle)

Turn any Shopify app's custom components — and whole pages — into REAL materials inside its Claude
Design DS project. The core move: **never redraw — compile the actual source.** A redrawn
component is only as accurate as one reading of the code and drifts the moment the app
changes; a compiled one is pixel-true *by construction* and updates by re-running one build.

**App-agnostic**: everything repo-specific (paths, aliases, publicDir, i18n layout, DS globals,
extra shims) lives in a JSON config. Copy `configs/_template.json` → `configs/<app>.json` and fill
it by inspecting the target repo — see §Per-app config. Nothing in this skill hardcodes one app.

The Shopify **admin-frame chrome** ships with this skill (`assets/admin-frame.template.html`):
mount a compiled page into its `#app-root` for a framed, interactive screen — no hand-redraw (see
§Framed screens). It renders against the DS bundle (`_ds_bundle.js`) produced by **`/sync-design-system`**,
so that skill must run first; its `.design-sync/NOTES.md` holds the shared DS/render-infra state.

## Accuracy contract

Everything is bundled verbatim from the repo — services, fetch wrappers, helpers, redux
reducers, form libs, react-router (pages), CSS modules, public assets (data-URIs) — EXCEPT
these seams, each a known, bounded fidelity risk:

| Seam | Replaced with | Fidelity risk |
|---|---|---|
| `react`, `react-dom` | `window.React/ReactDOM` (DS `_vendor/react.js`) | none |
| `react/jsx-runtime` | shim over `React.createElement` | none (see Gotchas) |
| config `dsGlobals` (default `@shopify/polaris(-icons)`) | the DS global the sync exposes, e.g. `window.<DSGlobal>` (icons merged onto it) | none — same DS the project renders with |
| `@shopify/app-bridge-react` | shim: `idToken`, `toast`→`window.__APP_TOAST__`; **`Modal` supports BOTH `<Modal open>` AND id-based ui-modal** (`shopify.modal.show('x')` opens `<Modal id="x">` via a registry+subscribers) so "Add …" buttons actually open; `TitleBar` renders a real header; **inert `saveBar`/`modal`/`loading`/`resourcePicker`** — a PARTIAL object makes mount effects like `shopify.saveBar.hide()` throw and blank the card | low |
| `react-redux` | shim: selectors run on `window.__APP_STATE__`. ⚠️ Any lib with its OWN react-redux store (e.g. `react-beautiful-dnd`) collides and gets undefined mapped props — shim that lib too | ⚠️ fixture shape — see Fixtures |
| `react-beautiful-dnd` | shim: `DragDropContext`/`Droppable`/`Draggable` render children statically (no drag). Without it, a non-empty draggable list blanks the page (rbd's connected `Draggable` clashes with the react-redux shim → `reading 'type'`) | none for a static preview |
| app i18n wrapper hook + `react-i18next` | shim serving the REAL strings (merged per config `i18n.resources`). `Trans` must interpolate `values`, render `components` (`<b>…</b>`→mapped node), and honor `parent`+`className` — a naive Trans drops styling (wrong color) and leaves raw `{{vars}}` | low |
| app React contexts consumed by pages (e.g. a `NavigateContext`) | **reexport the context from the bundle + wrap the page mount in its `.Provider`** — pages `useContext(X)` then destructure → crash without a provider | none |
| module singletons hydrated by sagas (e.g. a `setXRegistry`) | sagas DON'T run under the react-redux shim → **reexport the setter and CALL it in the card** with the saga's payload shape (else gated UI never shows) | ⚠️ must call it |
| `import.meta.glob` (Vite-only) in a bundled file (e.g. `i18n/index.js`, `Routes.jsx`) | esbuild leaves it untransformed → `import_meta.glob(...)` throws at init and blanks EVERYTHING. Card shim: `Object.defineProperty(Object.prototype,'glob',{value:()=>({}),enumerable:false})` before the bundle, or shim the offending module | none once neutralized |
| `process.env` | `window.__APP_ENV__` | low — set `SERVER_URL` in the card |
| network | real code down to global `fetch()`; the card overrides `window.fetch` with fixtures | ⚠️ fixture payloads — see Fixtures |

Consequence for verification: **if the render differs from the real app, the bug is in a
seam (fixture/shim), not in the component** — fix the fixture, never patch the source.

## Pipeline

### 0. Inventory & classify (skip when the user names specific targets)
Rank by reuse: `codegraph_callers(<Component>, {projectPath: <app frontend repo root>})` — components
with many call-sites are the design system; single-page ones can wait. Classify:
- **Compileable** (default): imports = DS + form/redux/i18n/services/router + own CSS.
- **Hand-build fallback** (rare): drags in an iframe/3rd-party SDK (TinyMCE, charts) whose
  shim cost exceeds redrawing — hand-author that card's body (read the source, write the React
  tree by hand) instead of compiling, still mount it in the same frame + fixtures, note it in `.prompt.md`.

### 1. Extract the state/variant matrix (code truth)
Read the source IN FULL (`codegraph_explore` returns it verbatim). Build the matrix:
- **Props axis**: every prop + default. **Internal-state axis**: every `useState` + every
  conditional render — error, loading, empty, open/closed, selected, drag-over.
- **Real variants**: sweep call-sites with `codegraph_callers`; the prop combinations
  actually used in production ARE the gallery — theoretical combos are noise.
- **UX flow**: per handler, what it triggers (modal, toast, navigate, append/remove) via
  `codegraph_callees` — these become the interactions the gallery must wire.
- **For pages** additionally: which selectors it reads (`useSelector(selectX)` → trace each
  selector to its state path) and which service calls fire on mount — both feed Fixtures.
Record the matrix in the card's `.prompt.md` — it doubles as the coverage checklist.

### 2. Build the companion bundle
```bash
node <skill-dir>/scripts/build-app-ui.mjs \
  --config <skill-dir>/configs/<app>.json \
  --components "components/<Group>/<Widget>.jsx,..." \
  --pages "pages/<area>/index.jsx" \
  --out <workdir>/app-ui
```
- Output: `<global-kebab>.js` (IIFE → `window.<globalName>`), `.css` (real CSS modules),
  `build-summary.json` (exports, bundled real packages, shimmed seams — the audit trail).
- Defaults re-exported when resolvable: `react-hook-form` essentials (cards need `useForm`
  for `control`-prop components); with `--pages`, also `react-router-dom` (`MemoryRouter`,
  `useNavigate`, …) — bundled REAL, pages get true routing. More: `--reexport <pkg>=<names>`.
- New unbundleable import? `--extra-shim <module-id>=<shim.js>` (or config `shims`); add the
  shim next to the existing ones in `assets/shims/` so future runs inherit it.

### 3. Fixtures — derive, never guess
The card sets, BEFORE the bundle scripts load:
- `window.__APP_ENV__` — `{ SERVER_URL: '/__fx', ... }` (any env the code reads).
- `window.__APP_STATE__` — redux fixture. Shape comes from the SELECTORS used: trace each
  `useSelector(selectX)` to its state path (e.g. `selectFoo` → `state.foo.bar`). The
  error loop is fast and safe: a missing slice throws
  `Cannot read properties of undefined` naming the selector — add the slice, reload.
- `window.__APP_TOAST__(msg, opts)` — render a visible toast (invisible = fails gate 3).
- `window.fetch` override — match the service paths, return `Response` objects shaped like
  the real API. An empty-but-valid payload is legitimate: it renders the page's real EMPTY
  state (often itself a design deliverable).
**Field shapes come from the code, not intuition.** Typical failures: a field the code appends to
as a `string[]` guessed as `[{value}]` crashes only on interaction; a value read from
`state.a.b` guessed at `state.a.c` renders blank — the selector always tells the truth, so trace it.

### 4. Gallery card — every state on screen, every interaction live
One card per component (or family) in the DS project, group **`<App> components/`**,
co-located with the DS bundle (cross-project isolation means a separate project can't read
`_ds_bundle.js`). Skeleton = `assets/gallery-card.template.html`.
- **Coverage**: every matrix row appears — static cell (variant) or reachable interaction
  (state). Disabled/error/empty count.
- **Golden rule — no dead UI**: every button/tab/row/field/search/filter/pagination wires a real
  handler (open a Modal, navigate an in-card route, narrow the data, mark dirty → SaveBar). A control
  that only "looks right" is a bug — Playwright-click each one before shipping.
- Drive `control`-props with `<AppUI>.useForm({ defaultValues })` — one form per cell.
- **Pages**: wrap in `h(U.MemoryRouter, null, h(U.PageName))`. The page brings its own
  header/actions/tabs/modals — the card supplies chrome only (the admin-frame template in
  `assets/admin-frame.template.html` if wanted — see §Framed screens). App-Bridge modals open as
  overlays via the shim.
- `.prompt.md` per card: what it is, props table, state matrix, fixtures needed, fallback notes.

### 5. Verify — two sources of truth, four gates
Serve the local render bundle over http (`file://` blocked): card + bundle inside
the DS render bundle dir, `python3 -m http.server`, open in Playwright.
1. **Console clean** — after load AND after each interaction. A warning that also exists in
   the real app is fidelity — note it, don't "fix" it. React-Router future-flag warnings are benign.
2. **Coverage** — tick every matrix row against the render. Untranslated raw key on screen
   = missed i18n namespace, visible for free.
3. **Interaction click-test** — every phase-1 handler fires and produces its effect. NOT
   optional: a guessed-shape crash can render green and only fail on click.
4. **Visual diff vs the real app** — screenshot the same states in the running admin
   (`/shopify-screenshot`; hard-to-reach states → TEMP harness route in the app, Vite HMR,
   delete after). Divergence ⇒ a seam is wrong — fix the seam and rebuild.

### 6. Upload to Claude Design
Same DS project as the DS bundle. Upload `<bundle>/` + `components/<group>/<Name>/<Name>.html`
+ `.prompt.md` via `mcp__claude_design__*` (`write_files`, `render_preview` sanity-check).
`node --check` every inline card script first. Update `.design-sync/NOTES.md`.
- **Re-sync gotcha**: full DS re-sync reconciliation deletes hand-authored files including
  the companion bundle and cards. Recovery = rerun the recorded build command + re-upload.

## Many-page / whole-app syncs
Syncing every page (not a hand-picked few) is supported and scales to dozens of pages → framed screens.
- **Unique export names.** The build names pages by path (`customers/[id]`→`CustomersId`,
  `branding/email`→`BrandingEmail`, `pages/index`→`Index`) — basename-only collides across the many
  `index.jsx`/`[id].jsx` and hard-fails `[DUP]`. Skip pages whose only `export default` is commented out.
- **Route the `[id]` editors.** Mount detail pages inside `MemoryRouter`+`Routes`+`Route` with the real
  path and a demo param, e.g. `h(U.MemoryRouter,{initialEntries:['/thing/tier/DEMO']},h(U.Routes,null,h(U.Route,{path:'/thing/tier/:id',element:h(U.ThingTierId)})))`.
  Point the param at a REAL enum value the form maps (a fake id renders blank).
- **In-app navigation.** The app's `<NavMenu>` (App Bridge) lists the sections — reconstruct it as a
  sidebar sub-nav under the app item in the admin frame, current page highlighted (see §Framed screens /
  `assets/admin-frame.template.html`). Read the real `<Link to=…>` list from the nav provider.
- **Fix seams in the SHIM/CONFIG, not per-card.** Recurring blanks usually trace to ONE shared cause each
  (app-bridge partial object, a missing context provider, rbd, import.meta.glob). Fix the shim/reexport once and
  ALL consumers unblock — don't patch 20 cards. Reexport repo modules with a **path-form** `--reexport`
  (`./helpers/x.js=…`); the build skips the esbuild alias for path-form (bare-name aliasing a
  file breaks the package's subpath imports — that's why you can't reexport a package like `@shopify/polaris-viz`).
- **Bundle size.** A whole-app bundle can reach many MB. `esbuild app-ui.js --minify --outfile=…` on the
  BUILT file (not a source rebuild) trims ~25% and **preserves any direct bundle patches** (their vars
  just get renamed consistently). One shared bundle loads on every card, so minify it.
- **Genuine app bugs surface here** (e.g. a page passing the wrong prop name to a child). Patch
  the BUILT bundle minimally + note it — it's lost on rebuild, so record the exact hunk to re-apply.

## Framed screens (Shopify admin chrome)
A gallery card shows a component/page bare; a **framed screen** wraps a compiled page in a mock of the
Shopify Admin so it reads like the real embedded app. The chrome is `assets/admin-frame.template.html` —
a generic admin shell (dark top bar, left global nav, an app entry + the app's in-app `<NavMenu>`, a
`#tb-savebar`/`#tb-search` bridge, and an `#app-root` body slot at top:56/left:240). It is a slotted
template: `{{TITLE}}`, `{{HEAD_EXTRA}}`, `{{FIXTURES}}` (override hooks + a `fixtures.js` include),
`{{MOUNT}}` (the `ReactDOM.createRoot(#app-root)` call), and `{{BODY_EXPR}}` (the compiled-page
expression). Co-locate at `components/<group>/<Name>/<Name>.html` (the `../../../` depth the slots assume).

- **Transform, not redraw.** A framed screen mounts the SAME compiled page (`window.<AppUI>` export) into
  `#app-root`, reusing the SAME verified fixtures as its per-component card — no new bundle, no hand-drawing.
  Fill `{{BODY_EXPR}}` with the page's mount expression (route `[id]` editors with a real demo param) and
  set the nav's active item.
- **Group** framed screens separately (`<App> screens`, `components/<app>-screens/<ExportName>/`) so they
  don't clutter the per-component gallery.
- **Reconstruct the in-app nav** from the app's real nav provider (`<NavMenu>` / `<Link to=…>`), current page
  highlighted — don't invent sections.
- **Per app.** The shipped frame is a neutral placeholder (generic app name/store). Reconstruct the target
  app's real admin chrome once — headed Playwright against its live admin captures colors/nav/season — and
  keep it as that app's frame; nothing else in this skill changes.
- **Verify** framed screens like any card (the 4 gates). The frame is static chrome; the deliverable is the
  real Polaris page in `#app-root`.
- **Re-sync gotcha.** A full DS re-sync deletes `components/**` → framed screens are wiped with the cards;
  re-run the build + re-upload (same recipe as the companion bundle).

## Mock data vs empty state
Default fixtures return empty-but-valid payloads (real EMPTY state). When the user wants pages to look
populated, fill the fetch/redux fixtures with REALISTIC rows instead:
- Trace the exact shape the table/list/chart reads (keys, nesting, enum values) from source — don't guess.
  Return `{message:'OK', payload:{ …rows, pageInfo, counts }}` matching the server.
- Keep it internally consistent and plausible (real-looking names/emails/numbers/dates; a 7–12 point time
  series for charts). Populate the redux slices sagas would hydrate — traced from selectors.
- Detail editors: return one fully-populated entity from the `:id` fetch so the form + preview are filled.

### Shared fixtures module (whole-app form seeding)
For MANY form cards, don't hand-write per-card `__APP_STATE__`/fetch stubs — build ONE shared, hand-authored
(NOT bundled) `<bundle>/fixtures.js` that every form card loads, with per-card override hooks. Blank inputs
almost always mean: thin inline `__APP_STATE__` (empty `configs` etc.) + a fetch stub returning
`{OK,payload:[]}` → selectors and mount fetches give the form nothing to seed from.
- **Canonical superset store**: build `window.__APP_STATE__` from each reducer's real `initialState`
  (all slices), filled with realistic app-wide values (shop, full `configs`, currency, and the app's
  real translations constant if content forms read `translations[lang]`). The react-redux shim runs
  real selectors against it. A superset is safe — extra slices are ignored by any one screen.
- **Fetch router** on the app's API base (e.g. `/__fx/*`), keyed by resource segment, returning the app's
  `{message,payload}` envelope. Card override hooks (set BEFORE the `fixtures.js` `<script>`):
  `window.__APP_STATE_OVERRIDE__` (deep-merged over canonical) and `window.__FX__` =
  `[{match: substr|RegExp, method?, payload|envelope}]` (checked before router defaults). Record-by-id
  editors + connected integrations declare their one record in `__FX__`.
- **"Keep the constant seed" rule (critical)**: if a component pre-seeds state from a constant and only
  overwrites on `message==='OK'`, the router MUST return a **non-OK** envelope for that endpoint — an
  `{OK,payload:[]}` wipes the seed and blanks the field/list.
- **Card wiring**: replace the inline `__APP_STATE__`/fetch + glob-shim scripts with
  `<script>…overrides…</script>` then `<script src="…/fixtures.js">`; KEEP the image-path-fix, the
  `window.shopify` stub, and the mount script. Order: overrides → fixtures.js → vendor → DS bundle → app-ui → mount.
- **Fan out with subagents**: one shared RECIPE + one agent per batch of cards (read page+form → find
  selectors/endpoints/constants → add override → verify headless + read screenshot). Escalate anything MANY
  cards need to the shared canonical/router; keep per-record data card-local. `fixtures.js` is a plain asset
  (no rebuild). It lives only in the bundle dir — recreate it if the bundle is wiped.

## Drift sync — keeping the DS in step with git
Because the bundle compiles real source, **re-running the build IS the sync** — no redraw.
What needs intelligence is knowing WHEN and WHAT: `build-summary.json` records the git
commit + the exact repo files baked into the bundle, and `check-drift` names the stale parts:
```bash
node <skill-dir>/scripts/check-drift.mjs \
  --summary <ds-location>/app-ui/build-summary.json [--json]
```
Compares the recorded commit against HEAD **plus uncommitted working-tree changes** and
classifies (exit 0 = in sync, 1 = drift, 2 = can't check):
- `[direct]` — the component/page's OWN source changed → rebuild + **re-extract its state
  matrix** (props/conditionals may have changed → gallery cells may be missing states) +
  re-verify its card.
- `[shared]` — a bundled helper/service/reducer changed → rebuild; re-verify consuming cards
  (matrix usually intact).
- `[i18n]` — locale strings changed → rebuild; visual re-check only.
Workflow when asked to "update/sync the design system": run check-drift FIRST, rebuild once,
then spend the expensive effort (matrix re-extraction, card edits, 4-gate verify) ONLY on the
`[direct]` list. Upload the refreshed bundle + touched cards; the untouched cards keep working
because they render from the same rebuilt bundle. Store `build-summary.json` alongside the
uploaded bundle in the DS project so ANY session can drift-check without local state.

## Per-app config (the reuse path)
Copy `configs/_template.json` → `configs/<app>.json` and fill it by INSPECTING the repo, not by
assuming another app's answers:
1. **Prerequisite**: that app's design system must already be synced to its Claude Design
   project (its `_ds_bundle.js` + `_vendor/react.js`) — this skill renders AGAINST it. If the
   app uses a different Polaris major or a different DS entirely, run **`/sync-design-system`**
   first (it also builds the local render bundle) and point `dsGlobals` at its global.
2. `frontend` — the SPA root. `alias` — read the app's `vite.config`/`tsconfig` (e.g. `@`→`.`).
   `publicDir` — Vite's `publicDir` (Vite default: `public`) for root-absolute
   imports. `globalName` — pick per app (e.g. `AppUI`, `XyzUI`).
3. `i18n` — locale file layout (`resources`: files and/or dirs-of-namespaces) + the app's
   wrapper hook path(s) (`wrapperHooks`). Check the app's i18next config for key style.
4. Run a 2-3 component smoke build; every new unresolvable import → decide bundle-real
   (default) vs shim (`shims` in config). State-management differences (zustand, jotai,
   react-query) need their own small shims — same pattern as `react-redux.js`: real
   selectors/hooks against a `window.__APP_STATE__` fixture.
5. Only trust the config after the four verify gates pass on that app's own components.

## Gotchas (paid for once already)
- `dotenv` imported by app services (Node-only; Vite tolerates it) — shimmed by default.
- **jsxs and keys**: static children arrays must be SPREAD into `createElement`, or React dev
  warns "missing key" on every static list. `assets/shims/jsx-runtime.js` handles it.
- `esbuild define` values must be entity names/literals — `window.__APP_ENV__` + init banner.
- Root-absolute imports (`/images/x.svg`) are Vite-publicDir-relative — config `publicDir`.
- App-Bridge `Modal` must honor `open`, else every modal's content renders inline permanently.
- pnpm hoists into `node_modules/.pnpm` — package-name reporting takes the LAST
  `node_modules/<pkg>` segment.
- Local Polaris render bundle comes from `/sync-design-system` (its `.design-sync` output).
- **`useAppBridge()` returns the shim's closure `app` object — NOT `window.shopify`.** A `window.shopify`
  stub in a card is dead code; fix the surface in `app-bridge-react.js`'s `app` object.
- **polaris-viz** charts render as empty-state axes without `PolarisVizProvider` (it can't be reexported —
  aliasing the package breaks its `build/esm/styles.css` subpath import). Page + stat tiles render fine;
  give the chart series real data via fixtures and accept default (provider-less) theming.
- **`pages/index.jsx` → export `Index`** under path-naming (not `Home`); wire the dashboard mount to `U.Index`.
- Contexts/singletons the app hydrates via **redux sagas don't hydrate in preview** (the react-redux shim
  has no store/saga middleware) — provide their state in `__APP_STATE__` and call any saga-set module
  singleton yourself.
- **`__APP_STATE__` is STATIC**: the react-redux shim serves selectors from a fixed object with no real
  store, so a `dispatch` runs its side effects (e.g. a toast fires) but selector-bound UI does NOT
  re-render — a toggle's action succeeds yet its badge won't flip. Set the fixture to the state you want SHOWN.
  Partial fix WITHOUT touching the shim: the react-redux shim exposes `__setState` and forwards dispatches to
  `window.__APP_DISPATCH__(action, {setState, getState})`; a `fixtures.js` can implement it to map known setters
  onto `setState(deepMerge(...))`, so those specific redux-backed toggles/fields DO flip live. Anything the
  handler doesn't map stays static (most local-`useState` forms are unaffected — they seed once and self-manage).

## Reference
- `scripts/build-app-ui.mjs` — the build (header comment = full seam list).
- `scripts/check-drift.mjs` — git drift detection against a build-summary.json.
- `configs/_template.json` — annotated config template; copy per app (§Per-app config).
- `assets/shims/` — jsx-runtime, app-bridge-react (full App Bridge surface), react-redux,
  use-translation (full `Trans`), react-beautiful-dnd (static rows), dotenv. Add new shims here.
- `assets/gallery-card.template.html` — verified harness/card skeleton with fixture slots.
- `assets/admin-frame.template.html` — Shopify admin chrome with an `#app-root` slot +
  `{{TITLE}}/{{HEAD_EXTRA}}/{{FIXTURES}}/{{MOUNT}}/{{BODY_EXPR}}`; wrap a compiled page for a
  framed screen (§Framed screens). Reconstruct per app from its live admin.
