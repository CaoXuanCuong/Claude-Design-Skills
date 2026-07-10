#!/usr/bin/env node
// Drift detection: has the code changed since the companion bundle was built?
// Reads a build-summary.json (written by build-app-ui.mjs, which records gitCommit +
// the exact repo source files baked into the bundle), diffs it against git HEAD (or
// --against <ref>), and names WHICH exports are stale and WHY:
//   - direct: the component/page's own source changed → rebuild + RE-EXTRACT its state
//     matrix (props/conditionals may have changed) + re-verify its card
//   - shared: a helper/service/reducer used by the bundle changed → rebuild; re-verify
//     affected cards (matrix usually intact)
//   - i18n: locale strings changed → rebuild; visual re-check only
//   - none: bundle is in sync, nothing to do
// Exit code: 0 = in sync, 1 = drift found, 2 = cannot check.
//
// Usage: node check-drift.mjs --summary <path/build-summary.json> [--against <git-ref>] [--json]

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? args[i + 1] : dflt;
};

const summaryPath = resolve(opt('summary', './build-summary.json'));
if (!existsSync(summaryPath)) { console.error(`[MISSING] ${summaryPath}`); process.exit(2); }
const S = JSON.parse(readFileSync(summaryPath, 'utf8'));
if (!S.gitCommit || !S.frontend) {
    console.error('[NO_PROVENANCE] summary has no gitCommit/frontend — rebuild with the current build-app-ui.mjs first');
    process.exit(2);
}

const ref = opt('against', 'HEAD');
const git = (cmd) => execSync(`git ${cmd}`, { cwd: S.frontend, encoding: 'utf8' }).trim();
const head = git(`rev-parse ${ref}`);

// FE dir relative to the git root, to translate git paths → frontend-relative paths
const gitRoot = git('rev-parse --show-toplevel');
const fePrefix = resolve(S.frontend).slice(gitRoot.length).replace(/^\//, '');
const toFeRel = (p) => (fePrefix && p.startsWith(fePrefix + '/') ? p.slice(fePrefix.length + 1) : null);

// committed changes since the recorded build commit + uncommitted working-tree changes
const committed = S.gitCommit === head ? [] : git(`diff --name-only ${S.gitCommit} ${head}`).split('\n').filter(Boolean);
const dirty = git('status --porcelain').split('\n').filter(Boolean).map((l) => l.slice(3).trim());
const changedFeFiles = [...new Set([...committed, ...dirty].map(toFeRel).filter(Boolean))];

const inputSet = new Set(S.repoInputs || []);
const i18nSet = new Set(S.i18nFiles || []);
const touchedInputs = changedFeFiles.filter((f) => inputSet.has(f));
const touchedI18n = changedFeFiles.filter((f) => i18nSet.has(f));

// Map entry paths → export names the same way the build does
const exportName = (rel) => {
    let n = rel.split('/').pop().replace(/\.(jsx?|tsx?)$/, '');
    if (n === 'index') n = dirname(rel).split(sep).pop();
    n = n.replace(/[^A-Za-z0-9_$]/g, '');
    return n[0].toUpperCase() + n.slice(1);
};
const entries = [...(S.components || []), ...(S.pages || [])];
const direct = entries.filter((e) => touchedInputs.includes(e)).map((e) => ({ export: exportName(e), file: e }));
const shared = touchedInputs.filter((f) => !entries.includes(f));

const result = {
    bundle: S.global,
    builtAt: S.builtAt,
    builtCommit: S.gitCommit.slice(0, 8),
    checkedAgainst: head.slice(0, 8) + (dirty.length ? ' + working tree' : ''),
    inSync: touchedInputs.length === 0 && touchedI18n.length === 0,
    staleDirect: direct,            // rebuild + re-extract state matrix + re-verify card
    staleShared: shared,            // rebuild + re-verify cards that consume these
    staleI18n: touchedI18n,         // rebuild + visual re-check
    changedOutsideBundle: changedFeFiles.filter((f) => !inputSet.has(f) && !i18nSet.has(f)).length,
};

if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
} else {
    if (result.inSync) {
        console.log(`✔ ${S.global} in sync (built at ${S.builtCommit ?? result.builtCommit}, checked ${result.checkedAgainst}; ${result.changedOutsideBundle} unrelated FE changes)`);
    } else {
        console.log(`✘ ${S.global} is STALE (built ${result.builtCommit} → ${result.checkedAgainst})`);
        for (const d of direct) console.log(`  [direct] ${d.export} ← ${d.file}  → rebuild + re-extract state matrix + re-verify card`);
        for (const f of shared) console.log(`  [shared] ${f}  → rebuild; re-verify cards that consume it`);
        for (const f of touchedI18n) console.log(`  [i18n]   ${f}  → rebuild; visual re-check`);
    }
}
process.exit(result.inSync ? 0 : 1);
