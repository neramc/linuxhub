/**
 * Render-blocking theme bootstrap, inlined in <head> so a stored light/dark
 * choice applies before first paint (no flash). Its SHA-256 is registered with
 * the page CSP at build time (see Base.astro).
 */
export const THEME_INIT = `try{var t=localStorage.getItem("lh-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
