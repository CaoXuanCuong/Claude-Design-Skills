---
name: sync-design-system
description: Sync một DESIGN SYSTEM (Polaris đúng version của app, polaris-viz, hoặc một React DS bất kỳ — có hoặc không có Storybook) lên một project claude.ai/design, và/hoặc build LOCAL RENDER BUNDLE để verify. Đây là ĐIỀU KIỆN TIÊN QUYẾT cho /component-ui-to-design và /codebase-to-design — 2 skill đó render dựa vào _ds_bundle.js (window.<Global>) mà skill này tạo ra. Dùng khi user nói "sync design system", "sync polaris lên claude design", "tạo DS project cho app mới", "re-sync DS", "cập nhật Polaris version mới lên design", "dựng render bundle local" — kể cả khi chỉ nói "app XYZ chưa có DS trên claude design, chuẩn bị đi". Bao gồm cả re-sync một DS đã sync (driver một lệnh).
argument-hint: "<DS repo path hoặc package name> [--project <tên/id project>] [--local-only]"
---

# Sync a design system → claude.ai/design (+ local render bundle)

This is the **base/router skill**. The deep per-shape procedure lives ON DISK in the staged
toolkit and MUST be followed in full once routed:
- `polaris-13.9.0/.ds-sync/storybook/SKILL.md` — repo HAS Storybook (storybook = fidelity
  oracle; compare-loop verification; ~340 lines).
- `polaris-13.9.0/.ds-sync/non-storybook/SKILL.md` — package shape (floor cards + authored
  previews; ~290 lines).
The toolkit (`package-build.mjs`, `package-validate.mjs`, `resync.mjs`, `package-capture.mjs`,
`lib/`, both shape docs) is canonical at `polaris-13.9.0/.ds-sync/` (identical copy in
`polaris-viz/.ds-sync/`); deps (`esbuild`, `ts-morph`, `playwright`) are already installed there.

**Scope note (memory guard):** the `DesignSync` TOOL is the right channel for THIS skill —
syncing a local DS repo → a design-system project (incremental, `localPath` uploads that never
enter context). Reading *design content* (handoffs, screens) stays on `mcp__claude_design__*` /
handoff bundles as recorded in memory — different job, different channel.

## Workspace state (already synced — don't redo)

| DS | Project | projectId | Shape | State |
|---|---|---|---|---|
| `@shopify/polaris` 13.9.0 (`polaris-13.9.0/`) | BLOY - Polaris React 13 | `f3d329ef-6637-466e-8d52-0f2a3506f265` | storybook | 74 components graded; app-pages card; BloyUI companion planned |
| `@shopify/polaris-viz` 16.16.0 (`polaris-viz/`) | BLOY - Polaris Viz 16.16.0 | `7cadcf6f-a534-4b6d-9b73-bdc5495e1c7c` | storybook (SB6) | 20/20 match |

Per-repo ground truth: `<repo>/.design-sync/config.json` (accumulated fixes — NEVER replace
`titleMap`/`overrides`/`provider`, only add) and `<repo>/.design-sync/NOTES.md` (decisions,
known warns, **Re-sync risks** = the prior run's watch-list). Read BOTH before touching a repo.
Local render bundle for verify harnesses: `polaris-13.9.0/ds-bundle-polaris/`.

## Route the request

**A. Re-sync an already-synced repo** (config has both `pkg` and `projectId`):
Read NOTES.md "Re-sync risks" first, then one driver run does the mechanical whole:
```bash
cd <repo> && node .ds-sync/resync.mjs --config .design-sync/config.json \
  --node-modules <nm> --out ./ds-bundle --remote .design-sync/.cache/remote-sync.json
```
(fetch the anchor first: `DesignSync(get_file, "_ds_sync.json")` → save to that path; never
download `_ds_bundle.js`). The verdict (`.resync-verdict.json`) lists `pendingGrade` (you grade
those via the shape doc's compare loop), validate warns (check against NOTES.md's known list —
a warn not recorded there is NEW, look at it), and `upload.any` (→ §Upload). Unchanged
components cost nothing. Grades follow source hashes — carried grades are normal.

**B. First sync of a new DS / new app** (the /component-ui-to-design prerequisite):
1. Get the DS source at the APP'S version (clone the repo at that tag — e.g. an app on
   Polaris 12.x syncs `polaris@12.x`, NOT latest). Version mismatch = wrong look, defeats
   the whole fidelity chain.
2. Stage the toolkit: `mkdir -p <repo>/.ds-sync && cp -r polaris-13.9.0/.ds-sync/{package-build.mjs,package-validate.mjs,resync.mjs,package-capture.mjs,lib,storybook,non-storybook,package.json} <repo>/.ds-sync/ && (cd <repo>/.ds-sync && npm i)`.
3. Detect shape: does the repo have a working `.storybook/`? → follow
   `.ds-sync/storybook/SKILL.md` end-to-end (build pkg → reference storybook → config →
   converter → self-heal → compare-match → upload). No storybook → `.ds-sync/non-storybook/SKILL.md`
   (converter → floor cards → author previews for the scoped core set → absolute-rubric grade).
4. Both shape docs assume this base handles **target selection** and **upload** — see below.
5. After upload: record `projectId` in config.json, write NOTES.md (toolchain quirks, config
   decisions, known warns, re-sync risks — mirror the two existing NOTES as templates), add
   the gitignore set (shape doc §2), and if this is for a new app: point that app's
   `component-ui-to-design` config `dsGlobals` at `window.<Global>` and build its local
   render bundle (route C).

**C. Local render bundle only** (`--local-only` — the verify harness for
/component-ui-to-design; no project, no upload, ~1 minute):
```bash
node <repo>/.ds-sync/package-build.mjs --config '<minimal {pkg,globalName,shape:"package",tokensPkg}>' \
  --entry <built-esm-entry> --node-modules <repo-nm> --out ds-bundle-<name> --skip-dts
```
Key property (proven on polaris): `_vendor/react.js` is a MERGED bundle setting BOTH
`window.React` and `window.ReactDOM` — the output renders as-is over plain http.

## Target selection + Upload (the sequence the shape docs delegate here)

1. `DesignSync(list_projects)` → pick with the user, or `create_project` (name it
   `<Team> - <DS> <version>`, e.g. "BLOY - Polaris React 13"). `get_project` to confirm
   `type: PROJECT_TYPE_DESIGN_SYSTEM` — that type is immutable; pushing to a regular project
   never converts it.
2. Existing files? `list_files` for the structural diff; fetch only `_ds_sync.json` as the
   verification anchor. Never scope uploads by the verification partition — upload scope
   comes from the driver's `upload.*` (sourceHashes-based).
3. `finalize_plan` — writes/deletes as GLOBS covering the whole bundle
   (`components/**`, `_vendor/**`, `guidelines/**`, `_ds_bundle.*`, `_ds_sync.json`,
   `_ds_needs_recompile`, `README.md`, …), `localDir` = the built `ds-bundle/` dir. The user
   sees and approves this plan — it's the attended gate.
4. Write the `_ds_needs_recompile` sentinel FIRST, then `write_files` batches (≤256/call,
   always `localPath` — contents never enter context), then RE-write the sentinel LAST (tells
   the app a recompile is due after all bytes landed).
5. Verify: `list_files` matches the bundle tree; spot-check one card via
   `mcp__claude_design__render_preview` if available. Incremental always — never wholesale
   delete-and-replace a project.

## Gotchas from the two real syncs (details in each repo's NOTES.md)
- **Toolchain pins bite first**: corepack vs yarn-1 lockfiles (`npx yarn@1.22` to bypass),
  node version pins (`.nvmrc`), `NODE_OPTIONS=--openssl-legacy-provider` for old webpack,
  monorepo builds need the deps too (`pnpm -F "<pkg>..." build` — the `...` matters).
- SB6 has no static `index.json` — extract at runtime (`sb-index.mjs`, viz NOTES).
- `provider` distillation replaces decorators as the preview wrapper — re-verify a themed
  component after setting it.
- Host-rendered components (App Bridge chrome) render NOTHING in a sandbox — sync them as a
  written guideline (`guidelinesGlob`), never as blank cards (polaris NOTES "App Bridge").
- Hand-authored files in the project (app-pages cards, `bloy-ui/` companion bundle) are
  DELETED by a full re-sync reconciliation — re-upload them after (companion bundle recovery
  = one build command, recorded in `/component-ui-to-design`'s references).
- Long storybook builds: background via the shell tool's background mode only (no bare `&`).

## Chain
`/sync-design-system` (this, once per DS/version) → `/component-ui-to-design` (components &
pages, per batch + on drift) → `/codebase-to-design` (assemble screens from real materials).
