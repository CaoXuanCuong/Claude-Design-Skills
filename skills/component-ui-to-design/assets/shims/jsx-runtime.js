// react/jsx-runtime → window.React. The automatic JSX runtime keeps children in
// props; React.createElement accepts props.children, so a thin wrapper suffices.
const R = window.React;
export const Fragment = R.Fragment;
export function jsx(type, props, key) {
    return R.createElement(type, key !== undefined ? { ...props, key } : props);
}
// jsxs receives STATIC children arrays — those must be spread as varargs, or React's
// dev build warns "missing key" on every static list (keys only apply to dynamic lists).
export function jsxs(type, props, key) {
    const { children, ...rest } = props || {};
    if (key !== undefined) rest.key = key;
    return Array.isArray(children) ? R.createElement(type, rest, ...children) : R.createElement(type, rest, children);
}
export function jsxDEV(type, props, key) {
    const p = props || {};
    return Array.isArray(p.children) ? jsxs(type, p, key) : jsx(type, p, key);
}
