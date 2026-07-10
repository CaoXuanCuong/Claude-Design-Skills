// i18n shim serving the REAL English strings, merged at build time from
// the app's locale files (config.i18n.resources) into virtual:app-i18n-resources.
// Replaces both `react-i18next` and the app's `@/hooks/useTranslation` wrapper.
// Lookup mirrors the app's flat-key style (keys like "pp_way_to_earn" live flat
// inside a namespace file); {{var}} interpolation is applied from options.
import resources from 'virtual:app-i18n-resources';

function interpolate(str, options) {
    if (!options) return str;
    return str.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (options[k] !== undefined ? String(options[k]) : m));
}

function lookup(key, options = {}) {
    const nss = options.ns ? [options.ns] : Object.keys(resources);
    for (const ns of nss) {
        const v = resources[ns] && resources[ns][key];
        if (typeof v === 'string') return interpolate(v, options);
    }
    if (options.defaultValue !== undefined) return options.defaultValue;
    return key; // untranslated keys stay visible → easy to spot in the verify pass
}

const i18n = {
    language: 'en',
    changeLanguage: async () => {},
    t: lookup,
    exists: (key) => lookup(key) !== key,
};

// react-i18next surface
export function useTranslation() {
    return { t: lookup, i18n };
}
// Faithful-enough <Trans>: interpolate `values`, render `components` for <tag>…</tag>
// (named like <b> or indexed like <0>), and wrap in `parent` carrying `className` +
// other DOM props — so styled Trans strings (e.g. a white banner_desc class) render right.
export const Trans = (props) => {
    const { i18nKey, values, components, parent, className, style, ns, defaults, children } = props || {};
    const R = typeof window !== 'undefined' ? window.React : null;
    const str = lookup(i18nKey, { ns, defaultValue: defaults, ...(values || {}) });
    if (!R) return str ?? children ?? null;
    const comps = components || {};
    const out = [];
    if (typeof str === 'string' && /<\w+>/.test(str)) {
        const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
        let last = 0, m;
        while ((m = re.exec(str))) {
            if (m.index > last) out.push(str.slice(last, m.index));
            const c = comps[m[1]] ?? comps[String(out.length)];
            out.push(c && R.isValidElement(c) ? R.cloneElement(c, { key: out.length }, m[2]) : m[2]);
            last = re.lastIndex;
        }
        if (last < str.length) out.push(str.slice(last));
    } else {
        out.push(str);
    }
    const Parent = parent || R.Fragment;
    const pProps = {};
    if (className) pProps.className = className;
    if (style) pProps.style = style;
    return R.createElement(Parent, pProps, ...out);
};
export const initReactI18next = { type: '3rdParty', init: () => {} };

// app wrapper surface (@/hooks/useTranslation)
export function useTranslate() {
    return { t: lookup, i18n };
}
export default i18n;
