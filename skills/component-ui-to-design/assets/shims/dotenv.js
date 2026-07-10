// dotenv is Node-only; some service files import it by mistake (Vite tolerates it).
// In the browser bundle it must be inert — env comes from window.__APP_ENV__ (or the config's envGlobal).
export const config = () => ({ parsed: {} });
export default { config };
