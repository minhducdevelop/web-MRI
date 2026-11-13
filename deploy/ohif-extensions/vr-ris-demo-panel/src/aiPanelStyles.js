// CSS cua component .ai-panel*, chep nguyen tu ai-panel.html (chi phan "1. TOKENS" + "2. COMPONENT" -
// KHONG chep phan ".demo-*"/".ohif-*" vi do chi de xem thu trong file demo, khong port).
// Token duoc doi prefix "--" sang "--ai-" de khong dung voi bien CSS cua chinh OHIF (an toan hon doan
// ten bien OHIF dang dung, vi anh ohif/viewer nay khong co doc bien CSS chinh thuc di kem).
export const AI_PANEL_CSS = `
.ai-panel-root {
  --ai-bg-surface: #0b1526;
  --ai-bg-tint-soft: #0f1b2e;
  --ai-bg-success: #113a26;
  --ai-bg-warning: #3a2a0c;
  --ai-bg-danger: #3a1414;
  --ai-border-default: #1f2b3d;
  --ai-text-primary: #f1f5f9;
  --ai-text-body: #cbd5e1;
  --ai-text-muted: #8291a8;
  --ai-text-on-primary: #ffffff;
  --ai-primary-600: #0ea5e9;
  --ai-primary-300: #1e3a5f;
  --ai-success-600: #4ade80;
  --ai-warning-600: #fbbf24;
  --ai-danger-500: #f87171;
  --ai-danger-300: #7f1d1d;
  --ai-radius-sm: 5px;
  --ai-radius-md: 8px;
  --ai-shadow-card: 0 1px 4px rgba(0, 0, 0, .06);
  --ai-shadow-button: 0 1px 2px rgba(29, 78, 216, .2);
  --ai-overlay-coral: #f87171;
  --ai-overlay-amber: #fbbf24;
  --ai-overlay-stage: #141417;
  --ai-font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-family: var(--ai-font);
  color: var(--ai-text-body);
}
.ai-panel-root *, .ai-panel-root *::before, .ai-panel-root *::after { box-sizing: border-box; }
.ai-panel-root button { font: inherit; color: inherit; }

.ai-panel {
  width: 100%; max-width: 360px; display: flex; flex-direction: column; align-items: flex-start;
  gap: 14px; padding: 18px; background: var(--ai-bg-surface); border: 1px solid var(--ai-border-default);
  border-radius: var(--ai-radius-md); box-shadow: var(--ai-shadow-card); overflow: hidden;
}
.ai-panel[data-status="READY"][data-collapsed="false"] { gap: 16px; padding: 20px; }
.ai-panel[data-collapsed="true"] { gap: 10px; max-width: 300px; }
.ai-panel > * { width: 100%; }

.ai-panel__header {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 0; border: 0; background: none; cursor: pointer; text-align: left;
}
.ai-panel__title { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--ai-text-primary); }
.ai-panel__chevron { width: 16px; height: 16px; color: var(--ai-text-muted); flex: none; }
.ai-panel__header:focus-visible,
.ai-btn:focus-visible,
.ai-toggle:focus-visible,
.ai-link:focus-visible { outline: 2px solid var(--ai-primary-600); outline-offset: 2px; }

.ai-badge {
  display: inline-flex; align-items: center; gap: 6px; width: fit-content;
  padding: 5px 10px; border-radius: var(--ai-radius-sm);
  font-size: 12px; line-height: 16px; font-weight: 600; white-space: nowrap; border: 1px solid transparent;
}
.ai-badge__dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex: none; }
.ai-badge[data-status="NOT_TRIGGERED"] { background: var(--ai-bg-surface); border-color: var(--ai-border-default); color: var(--ai-text-muted); }
.ai-badge[data-status="PENDING"]       { background: var(--ai-bg-warning); color: var(--ai-warning-600); }
.ai-badge[data-status="READY"]         { background: var(--ai-bg-success); color: var(--ai-success-600); }
.ai-badge[data-status="FAILED"]        { background: var(--ai-bg-danger);  color: var(--ai-danger-500); }
.ai-badge[data-status="TIMEOUT"]       { background: var(--ai-bg-surface); border-color: var(--ai-danger-300); color: var(--ai-danger-300); }

.ai-text-body  { margin: 0; font-size: 13px; line-height: 18px; color: var(--ai-text-body); }
.ai-text-muted { margin: 0; font-size: 12px; line-height: 16px; color: var(--ai-text-muted); }
.ai-divider    { width: 100%; height: 1px; background: var(--ai-border-default); flex: none; }
.ai-section-title { margin: 0; font-size: 14px; line-height: 20px; font-weight: 600; color: var(--ai-text-primary); }

.ai-pending { display: flex; align-items: center; gap: 10px; }
.ai-spinner { width: 28px; height: 28px; color: var(--ai-warning-600); flex: none; animation: ai-spin 1s linear infinite; }
@keyframes ai-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .ai-spinner { animation-duration: 3s; } }

.ai-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 39px; padding: 0 15px; border-radius: var(--ai-radius-md);
  font-size: 13px; line-height: 18px; font-weight: 600; cursor: pointer;
  background: var(--ai-bg-surface); border: 1px solid var(--ai-border-default); color: var(--ai-text-body);
  transition: filter .12s, background-color .12s;
}
.ai-btn svg { width: 16px; height: 16px; flex: none; }
.ai-btn:hover { background: var(--ai-bg-tint-soft); }
.ai-btn--primary { background: var(--ai-primary-600); border-color: var(--ai-primary-600); color: var(--ai-text-on-primary); box-shadow: var(--ai-shadow-button); width: 100%; }
.ai-btn--primary:hover { background: var(--ai-primary-600); filter: brightness(1.08); }
.ai-btn--outline { border-color: var(--ai-primary-300); color: var(--ai-primary-600); flex: 1 1 0; min-width: 0; }
.ai-btn--ghost { flex: 1 1 0; min-width: 0; }
.ai-btn--sm { height: 28px; padding: 0 10px; gap: 6px; font-size: 12px; line-height: 16px; border-radius: var(--ai-radius-sm); width: fit-content; }
.ai-btn--sm svg { width: 14px; height: 14px; }
.ai-link { background: none; border: 0; padding: 0; width: fit-content; cursor: pointer; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--ai-primary-600); }

.ai-block { display: flex; flex-direction: column; gap: 10px; width: 100%; }

.ai-overlay-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ai-overlay-head__label { display: flex; flex-direction: column; gap: 2px; }
.ai-overlay-head__label strong { font-size: 13px; line-height: 18px; font-weight: 600; color: var(--ai-text-primary); }
.ai-overlay-head__label span { font-size: 12px; line-height: 16px; color: var(--ai-text-muted); }

.ai-toggle {
  position: relative; width: 36px; height: 20px; flex: none; padding: 0; cursor: pointer;
  border: 0; border-radius: 10px; background: var(--ai-border-default); transition: background-color .15s;
}
.ai-toggle::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%;
  background: var(--ai-text-muted); transition: transform .15s, background-color .15s;
}
.ai-toggle[aria-checked="true"] { background: var(--ai-primary-600); }
.ai-toggle[aria-checked="true"]::after { transform: translateX(16px); background: #fff; }

.ai-overlay-preview {
  position: relative; width: 100%; height: 150px; border-radius: 6px; overflow: hidden;
  background: var(--ai-overlay-stage);
}
.ai-overlay-preview__note { position: absolute; left: 8px; top: 8px; right: 8px; margin: 0; font-size: 12px; line-height: 16px; color: #fff; z-index: 1; }
.ai-mask { position: absolute; border-radius: 50%; }
.ai-mask--1 { left: 70px; top: 40px; width: 60px; height: 46px; background: var(--ai-overlay-coral); }
.ai-mask--2 { left: 170px; top: 92px; width: 90px; height: 34px; background: var(--ai-overlay-amber); }

.ai-slider { display: flex; flex-direction: column; gap: 6px; }
.ai-slider__row { display: flex; justify-content: space-between; font-size: 12px; line-height: 16px; font-weight: 600; }
.ai-slider__row span:first-child { color: var(--ai-text-body); }
.ai-slider__row span:last-child { color: var(--ai-primary-600); }
.ai-slider input[type="range"] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 16px; margin: 0; background: transparent; cursor: pointer;
  --fill: 65%;
}
.ai-slider input[type="range"]::-webkit-slider-runnable-track {
  height: 6px; border-radius: 3px;
  background: linear-gradient(to right, var(--ai-primary-600) var(--fill), var(--ai-border-default) var(--fill));
}
.ai-slider input[type="range"]::-moz-range-track { height: 6px; border-radius: 3px; background: var(--ai-border-default); }
.ai-slider input[type="range"]::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--ai-primary-600); }
.ai-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 16px; height: 16px; margin-top: -5px; border-radius: 50%;
  background: var(--ai-bg-surface); border: 2px solid var(--ai-primary-600);
}
.ai-slider input[type="range"]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: var(--ai-bg-surface); border: 2px solid var(--ai-primary-600); }

.ai-legend { display: flex; flex-direction: column; gap: 6px; }
.ai-legend__item { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 16px; color: var(--ai-text-body); }
.ai-legend__dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }

.ai-finding { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ai-finding__label { margin: 0; flex: 1 1 auto; min-width: 0; max-width: 190px; font-size: 13px; line-height: 18px; color: var(--ai-text-body); }
.ai-conf {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 3px 8px; border-radius: var(--ai-radius-sm);
  font-size: 11px; line-height: 14px; font-weight: 600; white-space: nowrap;
}
.ai-conf__bars { display: inline-flex; align-items: flex-end; gap: 2px; height: 10px; }
.ai-conf__bars i { display: block; width: 4px; border-radius: 1px; background: var(--ai-border-default); }
.ai-conf__bars i:nth-child(1) { height: 4px; }
.ai-conf__bars i:nth-child(2) { height: 7px; }
.ai-conf__bars i:nth-child(3) { height: 10px; }
.ai-conf[data-level="high"]   { background: var(--ai-bg-success);   color: var(--ai-success-600); }
.ai-conf[data-level="medium"] { background: var(--ai-bg-warning);   color: var(--ai-warning-600); }
.ai-conf[data-level="low"]    { background: var(--ai-bg-tint-soft); color: var(--ai-text-muted); }
.ai-conf[data-level="high"]   i:nth-child(-n+3) { background: var(--ai-success-600); }
.ai-conf[data-level="medium"] i:nth-child(-n+2) { background: var(--ai-warning-600); }
.ai-conf[data-level="low"]    i:nth-child(1)    { background: var(--ai-text-muted); }

.ai-draft-head { display: flex; flex-direction: column; gap: 2px; }
.ai-draft {
  display: flex; flex-direction: column; gap: 12px; padding: 14px;
  background: var(--ai-bg-tint-soft); border-radius: var(--ai-radius-sm); user-select: text;
}
.ai-draft__item { display: flex; flex-direction: column; gap: 3px; }
.ai-draft__item h4 { margin: 0; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--ai-text-muted); }
.ai-draft__item p { margin: 0; font-size: 13px; line-height: 18px; color: var(--ai-text-body); }

.ai-warning {
  display: flex; align-items: center; gap: 10px; padding: 12px;
  background: var(--ai-bg-warning); border: 1px solid var(--ai-warning-600); border-radius: var(--ai-radius-sm);
}
.ai-warning__icon {
  width: 20px; height: 20px; border-radius: 10px; flex: none;
  display: grid; place-items: center; background: var(--ai-warning-600); color: #fff;
  font-size: 13px; font-weight: 700; line-height: 1;
}
.ai-warning p { margin: 0; font-size: 12px; line-height: 16px; font-weight: 600; color: var(--ai-warning-600); }

.ai-actions { display: flex; flex-direction: column; gap: 8px; }
.ai-actions__row { display: flex; gap: 8px; }

.ai-panel-root [hidden] { display: none !important; }

/* Toast goc tren-phai VIEWPORT - KHONG long trong .ai-panel-root vi phai noi len tren het trang,
   bam sang ca khi panel dang thu gon/an (xem aiPanelToast.js). */
.ai-toast-stack {
  position: fixed; top: 16px; right: 16px; z-index: 2147483000;
  display: flex; flex-direction: column; gap: 8px; max-width: 320px;
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.ai-toast {
  padding: 10px 12px; border-radius: 8px; font-size: 12.5px; line-height: 1.5;
  box-shadow: 0 4px 16px rgba(0, 0, 0, .35); cursor: pointer; white-space: pre-line;
  border: 1px solid transparent; animation: ai-toast-in .18s ease-out;
}
.ai-toast--success { background: #113a26; color: #4ade80; border-color: #4ade80; }
.ai-toast--warning { background: #3a2a0c; color: #fbbf24; border-color: #fbbf24; }
@keyframes ai-toast-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .ai-toast { animation: none; }
}
`;

export function injectAiPanelStylesOnce(doc) {
  const d = doc || document;
  if (d.getElementById('vr-ris-ai-panel-styles')) return;
  const style = d.createElement('style');
  style.id = 'vr-ris-ai-panel-styles';
  style.textContent = AI_PANEL_CSS;
  d.head.appendChild(style);
}
