#!/usr/bin/env node
// Build a "companion bundle" of an app's custom components AND/OR pages (built on a
// design system already synced to Claude Design, e.g. Polaris) into an IIFE at
// window.<GLOBAL>, for use inside the Claude Design DS project NEXT TO the existing
// DS bundle (_ds_bundle.js). App-agnostic: everything repo-specific lives in a JSON
// config (see configs/_template.json for the reference shape).
//
// Accuracy contract: the component/page SOURCE is bundled verbatim from the repo.
// Only these seams are replaced (each one is a documented fidelity risk):
//   react / react-dom            -> window.React / window.ReactDOM (from _vendor/react.js)
//   react/jsx-runtime            -> shim over window.React.createElement
//   config.dsGlobals             -> window globals (default: @shopify/polaris(-icons) -> window.Polaris)
//   @shopify/app-bridge-react    -> shim (idToken/toast -> window.__APP_TOAST__)
//   react-redux                  -> shim reading window.__APP_STATE__ (fixture store state)
//   config.i18n.wrapperHooks + react-i18next -> shim with the REAL strings (merged at build time)
//   process.env                  -> window.__APP_ENV__ (set SERVER_URL etc. in the card)
//   config.shims / --extra-shim  -> app-specific extras (Node-only libs, SDKs)
// Everything else — services, fetch wrappers, helpers, redux reducers, form libs,
// react-router (pages), CSS modules — is the real code. Network bottoms out in global
// fetch(); the card/harness overrides window.fetch with fixtures at runtime.
//
// Usage:
//   node build-app-ui.mjs --config <app.json> \
//     [--components rel1,rel2] [--pages rel1,rel2] [--out dir] [--global Name] \
//     [--reexport <pkg>=<names>] [--extra-shim <module-id>=<file.js>] [--esbuild-dir dir]
// CLI flags override config fields. Component/page paths are relative to config.frontend.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, basename, dirname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── args + config ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name, dflt) => {
    const i = args.indexOf('--' + name);
    return i >= 0 ? args[i + 1] : dflt;
};
const optAll = (name) => {
    const out = [];
    for (let i = 0; i < args.length; i++) if (args[i] === '--' + name) out.push(args[i + 1]);
    return out;
};
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

const cfgPathArg = opt('config', '');
const cfg = cfgPathArg ? JSON.parse(readFileSync(resolve(cfgPathArg), 'utf8')) : {};
const cfgDir = cfgPathArg ? dirname(resolve(cfgPathArg)) : process.cwd();
const rel = (p, base) => (isAbsolute(p) ? p : resolve(base, p));

const FE = rel(opt('frontend', cfg.frontend || ''), cfgDir);
const GLOBAL = opt('global', cfg.globalName || 'AppUI');
const OUT = resolve(opt('out', cfg.out || './' + kebab(GLOBAL) + '-out'));
const COMPONENTS = [...list(opt('components', '')), ...(!opt('components', '') ? cfg.components || [] : [])];
const PAGES = [...list(opt('pages', '')), ...(!opt('pages', '') ? cfg.pages || [] : [])];
const ENV_GLOBAL = cfg.envGlobal || '__APP_ENV__';
function kebab(s) { return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(); }

if (!FE || !existsSync(FE) || COMPONENTS.length + PAGES.length === 0) {
    console.error('Usage: build-app-ui.mjs --config <app.json> [--components rel1,rel2] [--pages rel1,rel2]');
    console.error('  (config needs at least {frontend}; give components/pages via config or flags)');
    process.exit(1);
}

// esbuild: resolve from --esbuild-dir / config.esbuildDir, this script's dir, or CWD
let esbuild;
for (const base of [opt('esbuild-dir', cfg.esbuildDir && rel(cfg.esbuildDir, cfgDir)), HERE, process.cwd()].filter(Boolean)) {
    const p = join(base, 'node_modules', 'esbuild', 'lib', 'main.js');
    if (existsSync(p)) { esbuild = await import(pathToFileURL(p)); break; }
}
if (!esbuild) esbuild = await import('esbuild');

mkdirSync(OUT, { recursive: true });

// ── entry: re-export each component/page verbatim from the repo ───────────
const seen = new Set();
const entryLines = [...COMPONENTS, ...PAGES].map((relPath) => {
    const abs = join(FE, relPath);
    if (!existsSync(abs)) { console.error(`[MISSING] ${abs}`); process.exit(1); }
    const rp = relPath.replace(/\.(jsx?|tsx?)$/, '');
    const pascalSeg = (seg) => seg.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    let name;
    if (rp.startsWith('pages/') || rp.includes('/pages/')) {
        // Pages: unique PascalCase from the FULL path so nested index.jsx and [id].jsx don't
        // collide. pages/customers/[id] → CustomersId, pages/branding/email → BrandingEmail,
        // pages/index → Home.
        const p = rp.replace(/^.*?pages\//, '').replace(/\/index$/, '');
        name = p.split('/').map(pascalSeg).join('') || 'Home';
    } else {
        // Components: keep the simple basename (parent dir for index).
        name = basename(rp);
        if (name === 'index') name = basename(dirname(rp));
        name = pascalSeg(name) || name.replace(/[^A-Za-z0-9_$]/g, '');
    }
    if (seen.has(name)) { console.error(`[DUP] export name ${name} — rename or pick one`); process.exit(1); }
    seen.add(name);
    return `export { default as ${name} } from ${JSON.stringify(abs)};`;
});

// Re-export named symbols from packages that get bundled in — gallery cards need them
// (useForm to drive control-props; MemoryRouter to host compiled pages). Resolved from
// the FE repo. Auto-skipped when not resolvable; extend via config.reexports/--reexport.
const feRequire = createRequire(join(FE, 'noop.js'));
const reexports = [...optAll('reexport'), ...(cfg.reexports || [])];
if (!args.includes('--no-default-reexports')) {
    reexports.unshift('react-hook-form=useForm,FormProvider,Controller,useController,useWatch,useFormContext');
    if (PAGES.length) reexports.unshift('react-router-dom=MemoryRouter,Routes,Route,Link,Navigate,Outlet,useNavigate,useParams,useLocation,useSearchParams');
}
// Re-exported packages must resolve to the SAME module file the app's own components
// import, or the bundle ends up with two copies (the entry uses Node/CJS resolution →
// dist/index.cjs.js, while esbuild resolves the components' bare imports via the
// browser "module" condition → dist/index.esm.mjs). Two instances = two React
// contexts, so e.g. FormProvider (entry copy) and a component's useFormContext (its
// copy) never match → context is null. We record each resolved path and alias the
// package to it below so both the entry AND the components dedupe to one instance.
const reexportResolved = {};
for (const kv of reexports) {
    const eq = kv.indexOf('=');
    const pkg = kv.slice(0, eq);
    const names = kv.slice(eq + 1).split(',').map((s) => s.trim()).filter((n) => !seen.has(n));
    try {
        const abs = feRequire.resolve(pkg);
        entryLines.push(`export { ${names.join(', ')} } from ${JSON.stringify(abs)};`);
        names.forEach((n) => seen.add(n));
        reexportResolved[pkg] = abs;
    } catch {
        console.error(`  [REEXPORT_SKIP] ${pkg} not resolvable from ${FE}`);
    }
}
const entryFile = join(OUT, '.entry.mjs');
writeFileSync(entryFile, entryLines.join('\n') + '\n');

// ── i18n resources: merge the REAL strings at build time ──────────────────
// config.i18n.resources: array of files or dirs (dir ⇒ every .json inside becomes a
// namespace named after the file). Default matches the common layout:
// locales/<lang>.json (default ns) + locales/<lang>/<ns>.json
const lang = cfg.i18n?.lang || 'en';
const resSpecs = cfg.i18n?.resources || [`locales/${lang}.json`, `locales/${lang}`];
const resources = {};
for (const spec of resSpecs) {
    const p = join(FE, spec);
    if (!existsSync(p)) continue;
    if (p.endsWith('.json')) resources[cfg.i18n?.defaultNs || 'translation'] = JSON.parse(readFileSync(p, 'utf8'));
    else for (const f of readdirSync(p).filter((f) => f.endsWith('.json')))
        resources[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(p, f), 'utf8'));
}

// ── shims ─────────────────────────────────────────────────────────────────
const SHIMS = join(HERE, '..', 'assets', 'shims');
const shimMap = {
    'react/jsx-runtime': join(SHIMS, 'jsx-runtime.js'),
    'react/jsx-dev-runtime': join(SHIMS, 'jsx-runtime.js'),
    '@shopify/app-bridge-react': join(SHIMS, 'app-bridge-react.js'),
    'react-redux': join(SHIMS, 'react-redux.js'),
    'react-i18next': join(SHIMS, 'use-translation.js'),
    dotenv: join(SHIMS, 'dotenv.js'),
};
for (const [id, f] of Object.entries(cfg.shims || {})) shimMap[id] = rel(f, cfgDir);
for (const kv of optAll('extra-shim')) {
    const eq = kv.indexOf('=');
    shimMap[kv.slice(0, eq)] = resolve(kv.slice(eq + 1));
}
// The app's own i18n wrapper hook(s) — replaced by absolute path so `@/hooks/...`,
// relative, and extensionless imports all hit the shim.
const wrapperAbs = (cfg.i18n?.wrapperHooks || ['hooks/useTranslation'])
    .flatMap((w) => ['', '.js', '.jsx', '.ts', '.tsx'].map((ext) => join(FE, w + ext)))
    .filter(existsSync);

const GLOBALS = {
    react: 'window.React',
    'react-dom': 'window.ReactDOM',
    'react-dom/client': 'window.ReactDOM',
    ...(cfg.dsGlobals || { '@shopify/polaris': 'window.Polaris', '@shopify/polaris-icons': 'window.Polaris' }),
};

// alias map (Vite-style). Default '@' → frontend root; override per app.
const alias = {};
for (const [k, v] of Object.entries(cfg.alias || { '@': '.' })) alias[k] = rel(v, FE);
// Dedupe re-exported packages to a single instance (see reexportResolved note above).
// Config alias wins if the app deliberately overrode the package. Only bare specifiers
// need an esbuild alias; a path-form reexport (./x, ../x, /x) already resolves to the
// same file the app imports, so aliasing it is redundant AND esbuild rejects a path as
// an alias key ("Invalid alias name").
for (const [pkg, abs] of Object.entries(reexportResolved))
    if (!(pkg in alias) && !/^(\.\.?\/|\/)/.test(pkg)) alias[pkg] = abs;

// Vite serves root-absolute imports ("/images/x.svg") from its publicDir.
// Mirror that: resolve them against config.publicDir (Vite default: "public").
const PUBLIC_DIR = rel(cfg.publicDir || 'public', FE);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const plugin = {
    name: 'app-ui-seams',
    setup(build) {
        build.onResolve({ filter: /^\// }, (a) => {
            const p = join(PUBLIC_DIR, a.path);
            return existsSync(p) ? { path: p } : null;
        });
        const globalIds = Object.keys(GLOBALS).map(esc).join('|');
        build.onResolve({ filter: new RegExp(`^(${globalIds})$`) }, (a) => ({ path: a.path, namespace: 'app-globals' }));
        build.onLoad({ filter: /.*/, namespace: 'app-globals' }, (a) => ({
            contents: `module.exports = ${GLOBALS[a.path]};`, loader: 'js',
        }));
        const shimIds = Object.keys(shimMap).map(esc).join('|');
        build.onResolve({ filter: new RegExp(`^(${shimIds})$`) }, (a) => ({ path: shimMap[a.path] }));
        if (wrapperAbs.length) {
            const base = basename(wrapperAbs[0]).replace(/\.(jsx?|tsx?)$/, '');
            build.onResolve({ filter: new RegExp(`${esc(base)}(\\.(jsx?|tsx?))?$`) }, (a) => {
                if (a.path.startsWith('.') || Object.keys(alias).some((k) => a.path.startsWith(k + '/'))) {
                    let abs = a.path.startsWith('.') ? resolve(a.resolveDir, a.path) : null;
                    if (!abs) for (const [k, v] of Object.entries(alias)) if (a.path.startsWith(k + '/')) abs = join(v, a.path.slice(k.length + 1));
                    for (const cand of [abs, abs + '.js', abs + '.jsx', abs + '.ts', abs + '.tsx'])
                        if (wrapperAbs.includes(cand)) return { path: join(SHIMS, 'use-translation.js') };
                }
                return null;
            });
        }
        build.onResolve({ filter: /^virtual:app-i18n-resources$/ }, (a) => ({ path: a.path, namespace: 'app-i18n' }));
        build.onLoad({ filter: /.*/, namespace: 'app-i18n' }, () => ({
            contents: `export default ${JSON.stringify(resources)};`, loader: 'js',
        }));
    },
};

// ── build ─────────────────────────────────────────────────────────────────
const outBase = kebab(GLOBAL);
const result = await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    format: 'iife',
    globalName: GLOBAL,
    outfile: join(OUT, `${outBase}.js`),
    alias,
    resolveExtensions: ['.jsx', '.js', '.ts', '.tsx', '.json'],
    loader: { '.png': 'dataurl', '.svg': 'dataurl', '.gif': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' },
    jsx: 'automatic', // routed to the jsx-runtime shim above
    define: { 'process.env': `window.${ENV_GLOBAL}` },
    banner: { js: `window.${ENV_GLOBAL} = window.${ENV_GLOBAL} || {};` },
    minify: false,
    sourcemap: false,
    logLevel: 'warning',
    metafile: true,
    plugins: [plugin],
});

const meta = result.metafile;
const inputs = Object.keys(meta.inputs);
const fromNodeModules = [...new Set(inputs.filter((i) => i.includes('node_modules'))
    .map((i) => { const ms = [...i.matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)/g)]; const last = ms.length && ms[ms.length - 1][1]; return last === '.pnpm' ? null : last; }).filter(Boolean))];

// Git provenance + the exact repo source files baked into this bundle — this is what
// makes drift detection possible (scripts/check-drift.mjs diffs HEAD against gitCommit
// and intersects with repoInputs/i18nFiles to name the stale exports).
const { execSync } = await import('node:child_process');
let gitCommit = null, gitRoot = null;
try {
    gitRoot = execSync('git rev-parse --show-toplevel', { cwd: FE, encoding: 'utf8' }).trim();
    gitCommit = execSync('git rev-parse HEAD', { cwd: FE, encoding: 'utf8' }).trim();
} catch { console.error('  [GIT] frontend is not in a git repo — drift detection unavailable'); }
const feAbs = resolve(FE);
const repoInputs = [...new Set(inputs
    .filter((i) => !i.includes('node_modules') && !i.includes(':'))
    .map((i) => resolve(i))
    .filter((i) => i.startsWith(feAbs + '/'))
    .map((i) => i.slice(feAbs.length + 1)))].sort();
const i18nFiles = resSpecs.flatMap((spec) => {
    const p = join(FE, spec);
    if (!existsSync(p)) return [];
    return p.endsWith('.json') ? [spec] : readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => join(spec, f));
});

const summary = {
    global: GLOBAL,
    envGlobal: ENV_GLOBAL,
    exports: [...seen],
    components: COMPONENTS,
    pages: PAGES,
    bundledRealPackages: fromNodeModules,
    shimmedSeams: [...Object.keys(GLOBALS), ...Object.keys(shimMap), ...(wrapperAbs.length ? ['<i18n wrapper hook>'] : [])],
    i18nNamespaces: Object.keys(resources),
    files: readdirSync(OUT).filter((f) => f.startsWith(outBase + '.')),
    builtAt: new Date().toISOString(),
    gitCommit,
    gitRoot,
    frontend: feAbs,
    repoInputs,
    i18nFiles,
};
writeFileSync(join(OUT, 'build-summary.json'), JSON.stringify(summary, null, 2));
console.error(`✔ window.${GLOBAL} ← ${[...seen].join(', ')}`);
console.error(`  bundled real packages: ${fromNodeModules.join(', ') || '(none)'}`);
console.error(`  out: ${OUT}/${outBase}.js${existsSync(join(OUT, `${outBase}.css`)) ? ` + ${outBase}.css` : ''}`);
