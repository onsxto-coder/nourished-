// Small DOM and formatting helpers shared across nourished.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Create an element. attrs: class, text, html (trusted only), on* handlers, dataset, other attributes. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only ever used with our own static markup
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const nf0 = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 1 });
export const fmt = {
  int: (n) => nf0.format(Math.round(Number(n) || 0)),
  one: (n) => nf1.format(Math.round((Number(n) || 0) * 10) / 10),
  kcal: (n) => `${nf0.format(Math.round(Number(n) || 0))} kcal`,
  g: (n) => `${nf0.format(Math.round(Number(n) || 0))} g`,
};

export const num = (v) => {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/** Plain text from untrusted HTML, without executing or loading anything. */
export function textFromHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

// ---------- Dates ----------
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function startOfWeek(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); }
export const dayName = (d, style = 'long') => d.toLocaleDateString('en-SG', { weekday: style });
export const longDate = (d) => d.toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' });

// ---------- Toast ----------
let toastTimer;
const canPop = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
function hideToast(el) {
  el.hidden = true;
  if (canPop && el.matches(':popover-open')) el.hidePopover();
}
export function toast(message, link) {
  const el = $('#toast');
  el.replaceChildren(h('span', { text: message }));
  if (link) el.append(h('a', { href: link.href, text: link.label, onclick: () => hideToast(el) }));
  el.hidden = false;
  // as a popover the toast sits above open dialogs too
  if (canPop) {
    if (el.matches(':popover-open')) el.hidePopover();
    el.showPopover();
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => hideToast(el), link ? 5200 : 3200);
}

// ---------- Dialogs ----------
export function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
  dlg.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => dlg.close(); });
  // close on backdrop click
  dlg.onclick = (e) => { if (e.target === dlg) dlg.close(); };
}

export function confirmDialog({ title, body, ok = 'Delete', cancel = 'Keep it' }) {
  const dlg = $('#confirm-dialog');
  $('#confirm-title').textContent = title;
  $('#confirm-body').textContent = body;
  $('#confirm-ok').textContent = ok;
  $('#confirm-cancel').textContent = cancel;
  dlg.returnValue = '';
  openDialog(dlg);
  $('#confirm-cancel').focus();
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

export function setError(el, msg) { if (el) el.textContent = msg || ''; }

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
