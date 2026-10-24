// Nourished by Sixto Carreon: app start-up, sign-up gate, routing and overview.

import * as store from './store.js';
import { $, $$, h, fmt, toast, confirmDialog, dateKey } from './ui.js';
import { renderPlate, partsFromGrams, healthyPlate } from './plate.js';
import { computeTargets, EXAMPLE_PROFILE } from './calc.js';
import { initCalculator, savedTargets } from './calculator.js';
import { initFinder, showFinder } from './recipes.js';
import { initLab } from './lab.js';
import { initPlanner, showPlanner, dayTotals } from './planner.js';

const BLOG_ID = '252215067'; // sixtocarreon.com on WordPress.com
const VIEWS = {
  overview: 'Overview',
  calculator: 'Your daily targets',
  'recipe-finder': 'Find a recipe',
  'recipe-lab': 'Recipe lab',
  planner: 'Planner',
  guide: "The chef's guide",
  about: 'How Nourished works',
};
const ANCHORS = { method: 'about', sources: 'about', privacy: 'about' };
const ALIASES = { '': 'overview', home: 'overview', targets: 'calculator', bmi: 'calculator', recipes: 'recipe-finder', lab: 'recipe-lab', plan: 'planner' };

let appStarted = false;
let firstRoute = true;

// ---------- gate ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function showGate() {
  $('#app').hidden = true;
  $('#gate').hidden = false;
  $('.skip-link').setAttribute('href', '#gate-content');
  $$('[data-healthy-plate]', $('#gate')).forEach(healthyPlate);
  document.title = 'Nourished — Eat well. Cook with heart.';
}

function initGate() {
  const fromOldLink = /^#access=/.test(location.hash);
  if (fromOldLink) {
    history.replaceState(null, '', location.pathname + location.search);
    $('#gate-return-note').hidden = false;
    $('#returning').open = true;
  }

  $('#subscribe-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#sub-email').value.trim();
    const err = $('#sub-error');
    if (!EMAIL_RE.test(email)) { err.textContent = 'Enter a valid email address, like name@example.com.'; $('#sub-email').focus(); return; }
    err.textContent = '';
    if ($('#sub-website').value) { enter(email, false); return; } // bot filled the honeypot: open quietly, don't subscribe
    enter(email, true);
  });

  $('#return-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#ret-email').value.trim();
    if (!EMAIL_RE.test(email)) { $('#ret-error').textContent = 'Enter the email address you subscribed with.'; $('#ret-email').focus(); return; }
    $('#ret-error').textContent = '';
    enter(email, false);
  });
}

function enter(email, subscribe) {
  store.update((s) => { s.member = { email, since: new Date().toISOString() }; });
  startApp();
  if (subscribe) openSubscription(email);
  else toast('Welcome back to the table.');
}

/** WordPress.com's own subscription window, the same one sixtocarreon.com uses. */
function openSubscription(email) {
  const dlg = $('#sub-dialog');
  const body = dlg.querySelector('.sub-dialog-body');
  body.querySelector('iframe')?.remove();
  const status = $('#sub-dialog-status');
  const fallback = $('#sub-dialog-fallback');
  status.hidden = false;
  fallback.hidden = true;

  const params = new URLSearchParams({
    email, blog: BLOG_ID, plan: 'newsletter', source: 'jetpack_subscribe', app_source: 'nourished',
    post_access_level: 'everybody', display: 'alternate', lang: 'en',
  });
  const iframe = h('iframe', { src: `https://subscribe.wordpress.com/memberships/?${params}`, title: 'Subscribe to the sixtocarreon.com newsletter', allow: 'payment *' });
  const timer = setTimeout(() => { status.hidden = true; fallback.hidden = false; }, 12000);
  iframe.addEventListener('load', () => { clearTimeout(timer); status.hidden = true; });
  body.append(iframe);

  const onMessage = (ev) => {
    if (ev.origin !== 'https://subscribe.wordpress.com') return;
    let data = ev.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return; } }
    if (data && data.action === 'close') dlg.close();
  };
  window.addEventListener('message', onMessage);
  dlg.addEventListener('close', () => {
    window.removeEventListener('message', onMessage);
    clearTimeout(timer);
    toast('Welcome to the table. Check your inbox to confirm your subscription.');
  }, { once: true });
  dlg.querySelector('[data-close]').onclick = () => dlg.close();
  dlg.showModal();
}

// ---------- app ----------
function startApp() {
  $('#gate').hidden = true;
  $('#app').hidden = false;
  $('.skip-link').setAttribute('href', '#content');
  if (!appStarted) {
    appStarted = true;
    $$('[data-healthy-plate]', $('#app')).forEach(healthyPlate);
    initCalculator();
    initFinder();
    initLab();
    initPlanner();
    initAbout();
    store.subscribe(() => { if (!$('#overview').hidden) renderOverview(); renderMember(); });
    window.addEventListener('hashchange', route);
  }
  route();
}

function route() {
  let hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (hash.startsWith('access=')) { history.replaceState(null, '', location.pathname + location.search); hash = ''; }
  const anchor = ANCHORS[hash] ? hash : null;
  const view = anchor ? ANCHORS[hash] : (VIEWS[hash] ? hash : (ALIASES[hash] || 'overview'));

  $$('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
  $$('[data-nav]').forEach((a) => {
    if (a.dataset.nav === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = view === 'overview' ? 'Nourished — Eat well. Cook with heart.' : `${VIEWS[view]} · Nourished`;

  if (view === 'overview') renderOverview();
  if (view === 'recipe-finder') showFinder();
  if (view === 'planner') showPlanner();
  if (view === 'about') renderMember();

  if (anchor) {
    requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  } else {
    window.scrollTo(0, 0);
  }
  if (!firstRoute) {
    const heading = $(`#${view} h1`);
    heading?.focus({ preventScroll: true });
  }
  firstRoute = false;
}

// ---------- overview ----------
function renderOverview() {
  const mine = savedTargets();
  const t = mine || computeTargets(EXAMPLE_PROFILE);
  renderPlate($('#ov-plate'), {
    parts: partsFromGrams(t),
    big: fmt.int(t.kcal),
    small: 'kcal a day',
    label: `${fmt.int(t.kcal)} kcal a day: ${t.carbs} g carbohydrates, ${t.protein} g protein, ${t.fat} g fat`,
  });
  $('#ov-plate-title').textContent = mine ? 'Your daily targets' : 'Your daily starting point';
  const cap = $('#ov-plate-cap');
  if (mine) {
    cap.replaceChildren(`Protein ${t.protein} g · carbs ${t.carbs} g · fat ${t.fat} g. `, h('a', { href: '#calculator', text: 'Update' }));
  } else {
    cap.textContent = `Illustrative example: age 35, male equation, 70 kg, 170 cm, moderately active. Protein ${t.protein} g · carbs ${t.carbs} g · fat ${t.fat} g.`;
  }
  $('#ov-cta').textContent = mine ? 'Review my targets' : 'Find my daily targets';

  // today
  const today = dateKey();
  const tt = dayTotals(today);
  const box = $('#ov-today');
  const mini = h('div', { class: 'today-mini' });
  if (tt.count) {
    const pct = mine ? Math.min(100, (tt.kcal / mine.kcal) * 100) : 0;
    box.replaceChildren(
      mini,
      h('div', {},
        h('h2', { id: 'today-title', text: 'Today' }),
        h('p', { text: mine ? `${fmt.int(tt.kcal)} of ${fmt.int(mine.kcal)} kcal planned across ${tt.count} item${tt.count === 1 ? '' : 's'}.` : `${fmt.int(tt.kcal)} kcal planned across ${tt.count} item${tt.count === 1 ? '' : 's'}.` }),
        mine ? h('div', { class: 'today-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` })) : null),
      h('a', { class: 'btn btn-secondary', href: '#planner' }, 'Open planner'));
    renderPlate(mini, { parts: partsFromGrams(tt), scale: mine?.kcal, big: '', small: '', label: 'Today so far' });
  } else {
    box.replaceChildren(
      mini,
      h('div', {},
        h('h2', { id: 'today-title', text: 'Today' }),
        h('p', { text: 'Nothing planned for today yet. Add a recipe or a quick meal and watch the plate fill up.' })),
      h('a', { class: 'btn btn-secondary', href: '#planner' }, 'Plan my meals'));
    renderPlate(mini, { parts: [], scale: 1, big: '', small: '', label: 'Nothing planned yet' });
  }
}

// ---------- about: data tools ----------
function renderMember() {
  const m = store.get().member;
  const line = $('#member-line');
  if (!line) return;
  line.replaceChildren(
    m ? `Opened with ${m.email} on this device. ` : '',
    h('button', { type: 'button', class: 'link-btn', style: 'padding-left:0', onclick: forget }, 'Use a different email'));
}

async function forget() {
  const ok = await confirmDialog({ title: 'Use a different email?', body: 'Nourished will ask for an email again on this device. Your saved recipes and plans stay.', ok: 'Continue', cancel: 'Cancel' });
  if (!ok) return;
  store.forgetMember();
  location.hash = '';
  showGate();
}

function initAbout() {
  $('#data-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `nourished-${dateKey()}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Your data file is downloading. Load it on another device to carry on there.');
  });
  $('#data-import').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const got = store.importData(obj);
      toast(`Loaded ${got.recipes.length} recipe${got.recipes.length === 1 ? '' : 's'} and ${Object.keys(got.plan).length} planned day${Object.keys(got.plan).length === 1 ? '' : 's'}.`);
    } catch {
      toast('That file isn\'t a Nourished data file.');
    }
  });
  $('#data-delete').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Delete saved data?', body: 'This removes your saved targets, plan and recipes from this browser. It can\'t be undone.', ok: 'Delete', cancel: 'Keep it' });
    if (!ok) return;
    store.clearSaved();
    toast('Saved data deleted from this browser.');
  });
}

// ---------- boot ----------
function boot() {
  initGate();
  if (store.get().member) startApp();
  else showGate();
  if (store.isMemoryOnly()) toast('This browser isn\'t letting Nourished save, so changes last until you close the tab.');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
