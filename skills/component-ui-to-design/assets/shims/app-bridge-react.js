// @shopify/app-bridge-react shim. In a design card there is no Shopify host, so App
// Bridge can't exist. Toasts surface through window.__APP_TOAST__; modals render as overlays.
const R = window.React;

const toast = {
    show(message, opts = {}) {
        if (typeof window.__APP_TOAST__ === 'function') window.__APP_TOAST__(message, opts);
        else console.log('[app-bridge toast]', message, opts);
    },
};

// id-based ui-modal registry: modern App Bridge opens modals with `shopify.modal.show(id)`
// against an inline `<Modal id="…">` (NOT an `open` prop). Track open ids + notify mounted
// <Modal> instances so show/hide actually toggle them.
const openModals = new Set();
const modalSubs = new Set();
const notifyModals = () => modalSubs.forEach((fn) => fn());

const app = {
    toast,
    idToken: async () => 'design-preview-token',
    config: { shop: 'design-preview.myshopify.com' },
    environment: { embedded: true, mobile: false, pos: false },
    // Full App Bridge surface — a partial object makes mount effects like shopify.saveBar.hide()
    // throw and unmount the whole root (blank card). Stub every surface inertly.
    saveBar: { show() {}, hide() {}, leaveConfirmation: async () => true },
    modal: {
        show(id) { if (id) { openModals.add(id); notifyModals(); } },
        hide(id) { if (id) { openModals.delete(id); notifyModals(); } },
    },
    loading() {},
    resourcePicker: async () => ({ selection: [] }),
    intents: {},
};
export function useAppBridge() {
    return app;
}

function useModalOpen(id, openProp) {
    const [, force] = R.useState(0);
    R.useEffect(() => {
        if (!id) return undefined;
        const fn = () => force((x) => x + 1);
        modalSubs.add(fn);
        return () => modalSubs.delete(fn);
    }, [id]);
    return id ? openModals.has(id) : !!openProp;
}

// Supports BOTH APIs: legacy `<Modal open>` and modern `<Modal id>` + shopify.modal.show(id).
// Renders as a centered overlay; backdrop click closes an id-modal.
export const Modal = ({ open, id, children }) => {
    const isOpen = useModalOpen(id, open);
    if (!isOpen) return null;
    const close = () => { if (id) { openModals.delete(id); notifyModals(); } };
    return R.createElement(
        'div',
        { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }, onClick: close },
        R.createElement(
            'div',
            { style: { background: '#fff', borderRadius: 12, maxWidth: 720, width: '90%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,.2)' }, onClick: (e) => e.stopPropagation() },
            children
        )
    );
};

// TitleBar renders the modal/page title + its action buttons (was a no-op → modal had no header).
export const TitleBar = ({ title, children }) =>
    R.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #e3e3e3', fontWeight: 600, fontSize: 15, position: 'sticky', top: 0, background: '#fff', zIndex: 1 } },
        R.createElement('span', { style: { flex: 1 } }, title || ''),
        children
    );

export const NavMenu = () => null;
export const SaveBar = () => null;
export default { useAppBridge };
