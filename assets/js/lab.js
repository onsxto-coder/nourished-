// Recipe lab: build a recipe from ingredient values per 100 g, look ingredients up
// in USDA FoodData Central, and save recipes on this device.

import * as store from './store.js';
import { $, h, fmt, num, uid, toast, confirmDialog, debounce } from './ui.js';
import { openAddToPlan } from './planner.js';

// USDA's public demo key: 30 lookups an hour per visitor. A personal key must not be
// committed to a public repository (USDA deactivates keys found online).
const FDC_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const FDC_KEY = 'DEMO_KEY';

let editing = -1;

const draft = () => store.get().labDraft;

// ---------- maths ----------
export function recipeTotals(ingredients, servings) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const i of ingredients) {
    const k = (Number(i.grams) || 0) / 100;
    t.kcal += (Number(i.kcal100) || 0) * k;
    t.p += (Number(i.p100) || 0) * k;
    t.c += (Number(i.c100) || 0) * k;
    t.f += (Number(i.f100) || 0) * k;
  }
  const s = Math.max(1, Math.round(Number(servings) || 1));
  return { total: t, per: { kcal: t.kcal / s, p: t.p / s, c: t.c / s, f: t.f / s }, servings: s };
}

// ---------- USDA lookup ----------
export function fdcNutrients(list = []) {
  const by = (...ids) => {
    for (const id of ids) {
      const n = list.find((x) => x.nutrientId === id && (x.unitName || '').toUpperCase() !== 'KJ');
      if (n && Number.isFinite(n.value)) return n.value;
    }
    return NaN;
  };
  const p = by(1003);
  const c = by(1005, 1050);
  const f = by(1004, 1085);
  let kcal = by(1008, 2048, 2047);
  if (!Number.isFinite(kcal) && [p, c, f].some(Number.isFinite)) kcal = 4 * (p || 0) + 4 * (c || 0) + 9 * (f || 0);
  return { kcal, p, c, f };
}

async function lookup(q) {
  const url = new URL(FDC_URL);
  url.search = new URLSearchParams({ api_key: FDC_KEY, query: q, dataType: 'Foundation,SR Legacy', pageSize: '8' }).toString();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (res.status === 429) { const e = new Error('limit'); e.code = 'limit'; throw e; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return (json.foods || []).map((f) => ({ id: f.fdcId, name: tidyName(f.description), type: f.dataType, ...fdcNutrients(f.foodNutrients) }))
      .filter((f) => Number.isFinite(f.kcal));
  } finally { clearTimeout(timer); }
}

const tidyName = (s = '') => {
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

async function onLookup(e) {
  e.preventDefault();
  const q = $('#lookup-q').value.trim();
  const status = $('#lookup-status');
  const list = $('#lookup-results');
  if (!q) { status.textContent = 'Type an ingredient to look up.'; return; }
  status.textContent = 'Looking it up…';
  list.replaceChildren();
  try {
    const foods = await lookup(q);
    if (!foods.length) { status.textContent = `Nothing found for "${q}". Try a simpler name, like "coconut milk" or "chicken thigh".`; return; }
    status.textContent = 'Values per 100 g. Choose one to fill in the form.';
    list.replaceChildren(...foods.map((f) => h('li', {},
      h('button', { type: 'button', onclick: () => useFood(f) },
        h('span', { class: 'ln', text: f.name }),
        h('span', { class: 'lm', text: `P ${fmt.one(f.p || 0)} g · C ${fmt.one(f.c || 0)} g · F ${fmt.one(f.f || 0)} g` }),
        h('span', { class: 'lk', text: fmt.kcal(f.kcal) })))));
  } catch (err) {
    status.textContent = err.code === 'limit'
      ? 'The free USDA lookup has reached its hourly limit on this connection. Enter values from the pack label for now, or try again later.'
      : 'The USDA lookup didn\'t answer. Enter values from the pack label instead.';
  }
}

function useFood(f) {
  $('#i-name').value = f.name;
  $('#i-kcal').value = round1(f.kcal);
  $('#i-p').value = round1(f.p || 0);
  $('#i-c').value = round1(f.c || 0);
  $('#i-f').value = round1(f.f || 0);
  $('#i-note').value = `USDA FoodData Central #${f.id}`;
  $('#i-grams').focus();
  toast('Values filled in. Now enter how much you used.');
}
const round1 = (v) => Math.round(v * 10) / 10;

// ---------- ingredient form ----------
function readIngredient() {
  const name = $('#i-name').value.trim();
  const grams = num($('#i-grams').value);
  const kcal100 = num($('#i-kcal').value);
  const p100 = num($('#i-p').value);
  const c100 = num($('#i-c').value);
  const f100 = num($('#i-f').value);
  if (!name) return { error: 'Add the ingredient name.' };
  if (!(grams > 0)) return { error: 'Enter how many grams you used.' };
  if (!(kcal100 >= 0)) return { error: 'Enter the energy per 100 g. Use 0 if it has none, like water or salt.' };
  if ([p100, c100, f100].some((v) => Number.isFinite(v) && v < 0)) return { error: 'Values can\'t be negative.' };
  if ([p100, c100, f100].reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0) > 100.5) return { error: 'Protein, carbs and fat add up to more than 100 g per 100 g. Check the label.' };
  return { value: { name, grams, kcal100, p100: p100 || 0, c100: c100 || 0, f100: f100 || 0, note: $('#i-note').value.trim() } };
}

function clearIngredientForm() {
  ['#i-name', '#i-grams', '#i-kcal', '#i-p', '#i-c', '#i-f', '#i-note'].forEach((id) => { $(id).value = ''; });
  editing = -1;
  $('#ing-submit').textContent = 'Add to my recipe';
  $('#ing-cancel').hidden = true;
}

function onIngredientSubmit(e) {
  e.preventDefault();
  const { value, error } = readIngredient();
  $('#ing-error').textContent = error || '';
  if (error) return;
  store.update((s) => {
    const list = [...s.labDraft.ingredients];
    if (editing >= 0) list[editing] = value; else list.push(value);
    s.labDraft.ingredients = list;
  });
  toast(editing >= 0 ? 'Ingredient updated.' : `${value.name} added.`);
  clearIngredientForm();
  $('#i-name').focus();
}

function editIngredient(i) {
  const ing = draft().ingredients[i];
  if (!ing) return;
  editing = i;
  $('#i-name').value = ing.name;
  $('#i-grams').value = ing.grams;
  $('#i-kcal').value = ing.kcal100;
  $('#i-p').value = ing.p100;
  $('#i-c').value = ing.c100;
  $('#i-f').value = ing.f100;
  $('#i-note').value = ing.note || '';
  $('#ing-submit').textContent = 'Update ingredient';
  $('#ing-cancel').hidden = false;
  $('#i-grams').focus();
}

// ---------- draft ----------
function renderDraft() {
  const d = draft();
  if (document.activeElement !== $('#d-name')) $('#d-name').value = d.name || '';
  if (document.activeElement !== $('#d-servings')) $('#d-servings').value = d.servings || 1;
  const n = d.ingredients.length;
  $('#draft-count').textContent = `${n} ingredient${n === 1 ? '' : 's'}`;
  const list = $('#draft-list');
  if (!n) {
    list.replaceChildren(h('li', { class: 'empty' }, 'Your ingredients will appear here. Start by adding an ingredient.'));
  } else {
    list.replaceChildren(...d.ingredients.map((i, idx) => h('li', {},
      h('span', { class: 'in', text: i.name }),
      h('span', { class: 'im', text: `${fmt.int(i.grams)} g · ${fmt.int(i.kcal100)} kcal per 100 g${i.note ? ` · ${i.note}` : ''}` }),
      h('span', { class: 'ik', text: fmt.kcal((i.kcal100 * i.grams) / 100) }),
      h('span', { class: 'ia' },
        h('button', { type: 'button', class: 'link-btn', 'aria-label': `Edit ${i.name}`, onclick: () => editIngredient(idx) }, 'Edit'),
        h('button', { type: 'button', class: 'link-btn', 'aria-label': `Remove ${i.name}`, onclick: () => removeIngredient(idx) }, 'Remove')))));
  }
  const { per, servings } = recipeTotals(d.ingredients, d.servings);
  $('#draft-totals').replaceChildren(
    h('div', { class: 'ps-head', text: servings > 1 ? `Estimate per serving (1 of ${servings})` : 'Estimate per serving' }),
    h('dl', { class: 'nutri' },
      h('div', { class: 'k' }, h('dt', { text: 'Energy' }), h('dd', { text: fmt.kcal(per.kcal) })),
      h('div', {}, h('dt', { text: 'Protein' }), h('dd', { text: fmt.g(per.p) })),
      h('div', {}, h('dt', { text: 'Carbs' }), h('dd', { text: fmt.g(per.c) })),
      h('div', {}, h('dt', { text: 'Fat' }), h('dd', { text: fmt.g(per.f) }))));
  $('#draft-save').textContent = d.id && store.get().recipes.some((r) => r.id === d.id) ? 'Update saved recipe' : 'Save recipe on this device';
}

function removeIngredient(i) {
  const removed = draft().ingredients[i];
  store.update((s) => { s.labDraft.ingredients = s.labDraft.ingredients.filter((_, idx) => idx !== i); });
  if (editing === i) clearIngredientForm();
  toast(`${removed.name} removed.`);
}

const saveMeta = debounce(() => {
  store.update((s) => {
    s.labDraft.name = $('#d-name').value;
    const sv = Math.round(num($('#d-servings').value));
    s.labDraft.servings = sv > 0 ? Math.min(100, sv) : 1;
  });
}, 200);

function saveRecipe() {
  const d = draft();
  const name = (d.name || '').trim();
  const err = $('#draft-error');
  if (!d.ingredients.length) { err.textContent = 'Add at least one ingredient first.'; return; }
  if (!name) { err.textContent = 'Give your recipe a name.'; $('#d-name').focus(); return; }
  err.textContent = '';
  const { per, servings } = recipeTotals(d.ingredients, d.servings);
  const id = d.id && store.get().recipes.some((r) => r.id === d.id) ? d.id : `lab-${uid()}`;
  const recipe = { id, kind: 'lab', name, servings, ingredients: d.ingredients, perServing: { kcal: per.kcal, p: per.p, c: per.c, f: per.f }, updated: new Date().toISOString() };
  store.update((s) => {
    const i = s.recipes.findIndex((r) => r.id === id);
    if (i >= 0) s.recipes[i] = recipe; else s.recipes.push(recipe);
    s.labDraft.id = id;
  });
  toast(`${name} saved on this device.`, { href: '#planner', label: 'Plan it' });
}

async function clearDraft() {
  const d = draft();
  if (d.ingredients.length) {
    const ok = await confirmDialog({ title: 'Clear the current recipe?', body: 'The ingredients in the lab will be cleared. Saved recipes are not affected.', ok: 'Clear', cancel: 'Keep it' });
    if (!ok) return;
  }
  store.update((s) => { s.labDraft = { name: '', servings: 1, ingredients: [] }; });
  clearIngredientForm();
}

// ---------- saved list ----------
function renderSaved() {
  const q = $('#saved-q').value.trim().toLowerCase();
  const all = store.get().recipes.filter((r) => r.kind === 'lab').sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  const rows = all.filter((r) => !q || r.name.toLowerCase().includes(q));
  const list = $('#lab-saved');
  if (!all.length) { list.replaceChildren(h('li', { class: 'empty', text: 'No saved recipes yet. Your next kitchen favourite starts above.' })); return; }
  if (!rows.length) { list.replaceChildren(h('li', { class: 'empty', text: 'No saved recipe matches that.' })); return; }
  list.replaceChildren(...rows.map((r) => h('li', {},
    h('div', {},
      h('div', { class: 'name', text: r.name }),
      h('div', { class: 'meta', text: `${fmt.kcal(r.perServing.kcal)} per serving · P ${fmt.int(r.perServing.p)} g · C ${fmt.int(r.perServing.c)} g · F ${fmt.int(r.perServing.f)} g · ${r.servings} serving${r.servings === 1 ? '' : 's'}` })),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => openSaved(r) }, 'Open'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => openAddToPlan({ name: r.name, perServing: r.perServing, recipeId: r.id }) }, 'Add to plan'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => deleteSaved(r) }, 'Delete')))));
}

async function openSaved(r) {
  const d = draft();
  if (d.ingredients.length && d.id !== r.id) {
    const ok = await confirmDialog({ title: 'Replace the current recipe?', body: `The lab will show ${r.name} instead. Save the current recipe first if you want to keep it.`, ok: 'Open it', cancel: 'Keep current' });
    if (!ok) return;
  }
  store.update((s) => { s.labDraft = { id: r.id, name: r.name, servings: r.servings, ingredients: r.ingredients.map((i) => ({ ...i })) }; });
  clearIngredientForm();
  $('#draft-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteSaved(r) {
  const ok = await confirmDialog({ title: 'Delete this recipe?', body: `${r.name} will be deleted from this browser. Meals already in your plan stay.`, ok: 'Delete', cancel: 'Keep it' });
  if (!ok) return;
  store.update((s) => {
    s.recipes = s.recipes.filter((x) => x.id !== r.id);
    if (s.labDraft.id === r.id) delete s.labDraft.id;
  });
  toast(`${r.name} deleted.`);
}

// ---------- init ----------
export function initLab() {
  $('#lookup-form').addEventListener('submit', onLookup);
  $('#ing-form').addEventListener('submit', onIngredientSubmit);
  $('#ing-cancel').addEventListener('click', clearIngredientForm);
  $('#d-name').addEventListener('input', saveMeta);
  $('#d-servings').addEventListener('input', saveMeta);
  $('#draft-save').addEventListener('click', saveRecipe);
  $('#draft-clear').addEventListener('click', clearDraft);
  $('#saved-q').addEventListener('input', renderSaved);
  store.subscribe(() => { renderDraft(); renderSaved(); });
  renderDraft();
  renderSaved();
}
