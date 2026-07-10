// react-redux shim. Real reducers/selectors from the repo are BUNDLED (they're pure);
// only the store binding is replaced: selectors run against window.__APP_STATE__,
// which the gallery card fills with a fixture shaped like the real store
// (e.g. { general: { shop: {...}, configs: {...} } }). Dispatches are logged and
// forwarded to window.__APP_DISPATCH__ so cards can react to them if needed.
const R = window.React;
const getState = () => window.__APP_STATE__ || {};

// Minimal subscription so useSelector re-renders when the card replaces the state
// via <GLOBAL>.__setState (imperfect vs real redux, but enough for galleries).
const listeners = new Set();
export function __setState(next) {
    window.__APP_STATE__ = typeof next === 'function' ? next(getState()) : next;
    listeners.forEach((l) => l());
}

export function useSelector(selector) {
    const [, force] = R.useReducer((c) => c + 1, 0);
    R.useEffect(() => {
        listeners.add(force);
        return () => listeners.delete(force);
    }, []);
    return selector(getState());
}
export function useDispatch() {
    return (action) => {
        console.log('[redux dispatch]', action);
        if (typeof window.__APP_DISPATCH__ === 'function') window.__APP_DISPATCH__(action, { setState: __setState, getState });
        return action;
    };
}
export const useStore = () => ({ getState, dispatch: useDispatch(), subscribe: (l) => (listeners.add(l), () => listeners.delete(l)) });
export const shallowEqual = Object.is;
export const Provider = ({ children }) => children;
export const connect = () => (C) => C;
