// Recipe finder: searches sixtocarreon.com, comfortdishes.com and saucesanddips.com
// through their public WordPress REST APIs, and reads nutrition per serving from each recipe.

import * as store from './store.js';
import { $, h, fmt, toast, openDialog, confirmDialog, textFromHtml } from './ui.js';
import { openAddToPlan } from './planner.js';

export const SOURCES = [
  { id: 'sixto', name: 'Sixto Carreon', endpoint: 'https://sixtocarreon.com/wp-json/wp/v2/posts', base: { categories: '2592' } },
  { id: 'comfort', name: 'Comfort Dishes', endpoint: 'https://comfortdishes.com/wp-json/wp/v2/posts', base: {} },
  { id: 'sauces', name: 'Sauces & Dips', endpoint: 'https://saucesanddips.com/wp-json/wp/v2/posts', base: { categories_exclude: '787536348' } },
];

// Recipe categories on sixtocarreon.com
export const TOPICS = [
  { id: 'filipino', label: 'Filipino', cats: '2180,2867' },
  { id: 'protein', label: 'High-protein', cats: '1389' },
  { id: 'lowcarb', label: 'Low-carb', cats: '1388' },
  { id: 'plant', label: 'Plant-based', cats: '1390' },
  { id: 'quick', label: 'Quick and easy', cats: '1386' },
  { id: 'soups', label: 'Soups and stews', cats: '1394' },
  { id: 'bowls', label: 'Noodles, rice and bowls', cats: '1395' },
  { id: 'breakfast', label: 'Breakfast and brunch', cats: '1393' },
  { id: 'prep', label: 'Meal prep', cats: '1387' },
];

const state = { q: '', source: 'all', topic: null, page: {}, more: {}, items: [], seq: 0, loading: false };
const detailCache = new Map();

// ---------- fetching ----------
async function getJson(url, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (res.status === 400) return { data: [], totalPages: 0 }; // past the last page
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { data, totalPages: Number(res.headers.get('X-WP-TotalPages')) || 1 };
  } finally {
    clearTimeout(timer);
  }
}

function listUrl(src, page, perPage) {
  const p = new URLSearchParams({ ...src.base, per_page: String(perPage), page: String(page), context: 'embed' });
  if (state.q) p.set('search', state.q);
  if (state.topic && src.id === 'sixto') p.set('categories', TOPICS.find((t) => t.id === state.topic).cats);
  return `${src.endpoint}?${p}`;
}

export function photon(url, w = 480, hgt = 360) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path = u.hostname.endsWith('.wp.com') && /^i\d\./.test(u.hostname) ? u.pathname.slice(1) : `${u.hostname}${u.pathname}`;
    return `https://i0.wp.com/${path}?resize=${w}%2C${hgt}&ssl=1`;
  } catch { return ''; }
}

const toItem = (src) => (post) => ({
  key: `${src.id}-${post.id}`,
  src: src.id,
  srcName: src.name,
  id: post.id,
  name: textFromHtml(post.title?.rendered) || 'Untitled recipe',
  link: post.link,
  excerpt: textFromHtml(post.excerpt?.rendered),
  image: post.jetpack_featured_media_url || '',
});

function activeSources() {
  if (state.topic) return SOURCES.filter((s) => s.id === 'sixto');
  return state.source === 'all' ? SOURCES : SOURCES.filter((s) => s.id === state.source);
}

async function load(reset) {
  const seq = ++state.seq;
  const sources = activeSources();
  const perPage = sources.length > 1 ? 6 : 12;
  if (reset) {
    state.q = $('#rf-q').value.trim();
    state.items = [];
    state.page = {};
    state.more = {};
    sources.forEach((s) => { state.page[s.id] = 0; state.more[s.id] = true; });
    renderSkeleton();
  }
  state.loading = true;
  setStatus(reset ? 'Finding recipes…' : 'Loading more…');
  $('#rf-more').disabled = true;

  const wanted = sources.filter((s) => state.more[s.id]);
  const results = await Promise.allSettled(wanted.map(async (s) => {
    const page = (state.page[s.id] || 0) + 1;
    const { data, totalPages } = await getJson(listUrl(s, page, perPage));
    state.page[s.id] = page;
    state.more[s.id] = page < totalPages && data.length > 0;
    return data.map(toItem(s));
  }));
  if (seq !== state.seq) return; // a newer search started

  const batches = results.map((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.filter((r) => r.status === 'rejected').length;
  results.forEach((r, i) => { if (r.status === 'rejected') state.more[wanted[i].id] = false; });
  // interleave so every collection shows up near the top
  const merged = [];
  for (let i = 0; i < Math.max(0, ...batches.map((b) => b.length)); i++) batches.forEach((b) => { if (b[i]) merged.push(b[i]); });
  state.items = reset ? merged : [...state.items, ...merged];
  state.loading = false;

  renderResults();
  const anyMore = sources.some((s) => state.more[s.id]);
  $('#rf-more').hidden = !anyMore;
  $('#rf-more').disabled = false;

  if (failed && failed === wanted.length) setStatus('The recipe collections didn\'t answer. Check your connection and try again.');
  else if (!state.items.length) setStatus(state.q ? `No recipes found for "${state.q}". Try a single ingredient, like "chicken" or "coconut".` : 'No recipes found.');
  else if (failed) setStatus(`Showing ${state.items.length} recipes. One collection didn't answer, so some may be missing.`);
  else setStatus(state.q ? `Recipes for "${state.q}"` : state.topic ? `${TOPICS.find((t) => t.id === state.topic).label} recipes from Sixto Carreon` : 'Latest recipes');
}

// ---------- nutrition parsing ----------
/** Reads "approximately 620 kcal, 34 g protein, 39 g fat, 35 g carbohydrate" style text. */
export function parseNutrition(html) {
  const text = textFromHtml(html);
  let zone = text;
  const idx = text.search(/nutrition(al)?\s*(value|information|facts|per serving|\(per)/i);
  if (idx >= 0) zone = text.slice(idx, idx + 700);
  else {
    const j = text.search(/per serving/i);
    if (j >= 0) zone = text.slice(Math.max(0, j - 300), j + 400);
  }
  const kcal = firstNum(zone, [/(\d{1,2},\d{3}|\d{2,4})(?:\.\d+)?\s*(?:kcal|calories|cal\b)/i, /(?:calories|energy)\s*[:\-–]?\s*(\d{1,2},\d{3}|\d{2,4})/i]);
  const p = firstNum(zone, [/(\d+(?:\.\d+)?)\s*g(?:rams)?\s+(?:of\s+)?protein/i, /protein\s*[:\-–]?\s*(\d+(?:\.\d+)?)\s*g/i]);
  const c = firstNum(zone, [/(\d+(?:\.\d+)?)\s*g(?:rams)?\s+(?:of\s+)?(?:total\s+)?carb/i, /carb(?:ohydrate)?s?\s*(?:\(total\))?\s*[:\-–]?\s*(\d+(?:\.\d+)?)\s*g/i]);
  const f = firstNum(zone, [/(\d+(?:\.\d+)?)\s*g(?:rams)?\s+(?:of\s+)?(?:total\s+)?fat/i, /(?:^|[^d]\s)fat\s*[:\-–]?\s*(\d+(?:\.\d+)?)\s*g/i]);
  const servings = firstNum(text, [/(?:servings|serves|yield|makes)\s*:?\s*(?:about\s+)?(\d+)/i, /(\d+)\s+servings/i]);
  const found = Number.isFinite(kcal) && kcal > 0;
  return {
    found,
    perServing: found ? { kcal, p: nz(p), c: nz(c), f: nz(f) } : null,
    servings: Number.isFinite(servings) && servings > 0 && servings < 200 ? servings : null,
  };
}
const firstNum = (text, res) => { for (const re of res) { const m = text.match(re); if (m) return parseFloat(m[1].replace(/,/g, '')); } return NaN; };
const nz = (v) => (Number.isFinite(v) ? v : 0);

async function loadDetail(item) {
  if (detailCache.has(item.key)) return detailCache.get(item.key);
  const src = SOURCES.find((s) => s.id === item.src);
  const { data } = await getJson(`${src.endpoint}/${item.id}`);
  const parsed = parseNutrition(data?.content?.rendered || '');
  detailCache.set(item.key, parsed);
  return parsed;
}

// ---------- rendering ----------
function setStatus(msg) { $('#rf-status').textContent = msg; }

function renderSkeleton() {
  $('#rf-results').replaceChildren(...Array.from({ length: 6 }, () =>
    h('li', { class: 'recipe-card skeleton', 'aria-hidden': 'true' }, h('div', { class: 'thumb' }), h('div', { class: 'bar' }), h('div', { class: 'bar', style: 'width:45%' }))));
}

const PLATE_ICON = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#E5D2BB"/><circle cx="32" cy="32" r="22" fill="#FFFDF8"/></svg>';

function thumb(image, alt = '') {
  const t = h('div', { class: 'thumb' });
  if (image) {
    const img = h('img', { src: photon(image), alt, loading: 'lazy', decoding: 'async', width: 480, height: 360 });
    img.addEventListener('error', () => { img.remove(); t.append(h('span', { class: 'thumb-empty', html: PLATE_ICON })); });
    t.append(img);
  } else t.append(h('span', { class: 'thumb-empty', html: PLATE_ICON }));
  return t;
}

function renderResults() {
  $('#rf-results').replaceChildren(...state.items.map((item) => h('li', {},
    h('button', { type: 'button', class: 'recipe-card', onclick: () => openRecipe(item) },
      thumb(item.image),
      h('span', { class: 'src', text: item.srcName }),
      h('span', { class: 'title', text: item.name })))));
}

function renderChips() {
  $('#rf-sources').replaceChildren(...[{ id: 'all', name: 'All collections' }, ...SOURCES].map((s) =>
    h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(!state.topic && state.source === s.id),
      onclick: () => { state.source = s.id; state.topic = null; renderChips(); load(true); },
    }, s.name)));
  $('#rf-topics').replaceChildren(...TOPICS.map((t) =>
    h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(state.topic === t.id),
      onclick: () => { state.topic = state.topic === t.id ? null : t.id; if (state.topic) state.source = 'sixto'; renderChips(); load(true); },
    }, t.label)));
}

// ---------- recipe dialog ----------
export function openRecipe(item) {
  const dlg = $('#recipe-dialog');
  const body = $('#rd-body');
  const savedId = `site-${item.key}`;
  const nutriBox = h('div', { 'aria-live': 'polite' }, h('p', { class: 'status', text: 'Reading the nutrition per serving…' }));
  let detail = null;

  const saveBtn = h('button', { type: 'button', class: 'btn btn-secondary' });
  const paintSave = () => {
    const isSaved = store.get().recipes.some((r) => r.id === savedId);
    saveBtn.textContent = isSaved ? 'Saved ✓' : 'Save recipe';
    saveBtn.setAttribute('aria-pressed', String(isSaved));
  };
  paintSave();
  saveBtn.addEventListener('click', () => {
    const isSaved = store.get().recipes.some((r) => r.id === savedId);
    store.update((s) => {
      if (isSaved) s.recipes = s.recipes.filter((r) => r.id !== savedId);
      else s.recipes.push(siteRecipe(item, detail));
    });
    paintSave();
    toast(isSaved ? 'Removed from your saved recipes.' : 'Saved to your recipes.');
  });

  const addBtn = h('button', {
    type: 'button', class: 'btn btn-primary',
    onclick: () => { dlg.close(); openAddToPlan({ name: item.name, perServing: detail?.perServing || null, link: item.link, recipeId: savedId }); },
  }, 'Add to my plan');

  body.replaceChildren(
    h('div', { class: 'rd-hero' }, item.image ? h('img', { src: photon(item.image, 1024, 512), alt: '', loading: 'eager' }) : null),
    h('p', { class: 'src', text: item.srcName }),
    h('h2', { id: 'rd-title', text: item.name }),
    item.excerpt ? h('p', { class: 'excerpt', text: item.excerpt }) : null,
    nutriBox,
    h('div', { class: 'actions' }, addBtn, saveBtn,
      h('a', { class: 'btn btn-ghost', href: item.link, target: '_blank', rel: 'noopener' }, 'Open full recipe ↗')));
  openDialog(dlg);
  addBtn.focus();

  loadDetail(item).then((d) => {
    detail = d;
    // keep a saved copy's nutrition in sync
    if (d.perServing) store.update((s) => { const r = s.recipes.find((x) => x.id === savedId); if (r && !r.perServing) { r.perServing = d.perServing; r.servings = d.servings; } });
    nutriBox.replaceChildren(...nutritionBlock(d));
  }).catch(() => {
    nutriBox.replaceChildren(h('p', { class: 'fine', text: 'Couldn\'t read the nutrition for this recipe just now. You can still add it to your plan with your own estimate.' }));
  });
}

function nutritionBlock(d) {
  if (!d.found) {
    return [h('p', { class: 'fine', text: `${d.servings ? `Serves ${d.servings}. ` : ''}No nutrition is listed for this recipe yet. You can add your own estimate when you add it to your plan.` })];
  }
  const ps = d.perServing;
  return [
    h('p', { class: 'fine', text: `Estimated per serving${d.servings ? `, serves ${d.servings}` : ''}` }),
    h('dl', { class: 'nutri' },
      h('div', { class: 'k' }, h('dt', { text: 'Energy' }), h('dd', { text: fmt.kcal(ps.kcal) })),
      h('div', {}, h('dt', { text: 'Protein' }), h('dd', { text: fmt.g(ps.p) })),
      h('div', {}, h('dt', { text: 'Carbs' }), h('dd', { text: fmt.g(ps.c) })),
      h('div', {}, h('dt', { text: 'Fat' }), h('dd', { text: fmt.g(ps.f) }))),
  ];
}

function siteRecipe(item, detail) {
  return {
    id: `site-${item.key}`,
    kind: 'site',
    name: item.name,
    link: item.link,
    image: item.image,
    source: item.srcName,
    src: item.src,
    postId: item.id,
    excerpt: item.excerpt,
    servings: detail?.servings || null,
    perServing: detail?.perServing || null,
    updated: new Date().toISOString(),
  };
}

function renderSaved() {
  const saved = store.get().recipes.filter((r) => r.kind === 'site');
  const list = $('#rf-saved');
  if (!saved.length) {
    list.replaceChildren(h('li', { class: 'empty', text: 'Recipes you save from my kitchens appear here, ready to add to your plan.' }));
    return;
  }
  list.replaceChildren(...saved.map((r) => h('li', {},
    h('div', {},
      h('div', { class: 'name', text: r.name }),
      h('div', { class: 'meta', text: `${r.source}${r.perServing ? ` · ${fmt.kcal(r.perServing.kcal)} per serving` : ''}` })),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => openRecipe({ key: `${r.src}-${r.postId}`, src: r.src, srcName: r.source, id: r.postId, name: r.name, link: r.link, image: r.image, excerpt: r.excerpt }) }, 'Open'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => openAddToPlan({ name: r.name, perServing: r.perServing, link: r.link, recipeId: r.id }) }, 'Add to plan'),
      h('button', {
        type: 'button', class: 'link-btn',
        onclick: async () => {
          const ok = await confirmDialog({ title: 'Remove this recipe?', body: `${r.name} will be removed from your saved recipes. Meals already in your plan stay.`, ok: 'Remove', cancel: 'Keep it' });
          if (ok) store.update((s) => { s.recipes = s.recipes.filter((x) => x.id !== r.id); });
        },
      }, 'Remove')))));
}

// ---------- init ----------
let started = false;
export function initFinder() {
  renderChips();
  renderSaved();
  store.subscribe(renderSaved);
  $('#rf-form').addEventListener('submit', (e) => {
    e.preventDefault();
    load(true);
  });
  $('#rf-q').addEventListener('search', () => { if (!$('#rf-q').value && state.q) load(true); });
  $('#rf-more').addEventListener('click', () => load(false));
}

/** First visit to the view loads the latest recipes. */
export function showFinder() {
  if (!started) { started = true; load(true); }
}
