// Planner view: a week of days, four meals a day, totals against saved targets.

import * as store from './store.js';
import {
  $, h, fmt, num, uid, toast, openDialog, confirmDialog,
  dateKey, fromKey, addDays, startOfWeek, dayName, longDate,
} from './ui.js';
import { renderPlate, partsFromGrams, MACRO_COLORS } from './plate.js';
import { savedTargets } from './calculator.js';

export const MEALS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

let selected = dateKey();

// ---------- data helpers ----------
const emptyDay = () => ({ breakfast: [], lunch: [], dinner: [], snacks: [] });

export function dayOf(key) {
  const d = store.get().plan[key];
  return d ? { ...emptyDay(), ...d } : emptyDay();
}

export function dayTotals(key) {
  const d = dayOf(key);
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
  for (const m of MEALS) {
    for (const e of d[m.id] || []) {
      const q = Number(e.qty) || 0;
      t.kcal += (e.kcal || 0) * q;
      t.protein += (e.p || 0) * q;
      t.carbs += (e.c || 0) * q;
      t.fat += (e.f || 0) * q;
      t.count += 1;
    }
  }
  return t;
}

function addEntry(key, meal, entry) {
  store.update((s) => {
    const d = s.plan[key] ? { ...emptyDay(), ...s.plan[key] } : emptyDay();
    d[meal] = [...(d[meal] || []), { uid: uid(), qty: 1, ...entry }];
    s.plan[key] = d;
  });
}

function changeQty(key, meal, entryUid, delta) {
  store.update((s) => {
    const d = s.plan[key];
    if (!d) return;
    const e = (d[meal] || []).find((x) => x.uid === entryUid);
    if (!e) return;
    e.qty = Math.max(0.5, Math.round(((Number(e.qty) || 1) + delta) * 2) / 2);
  });
}

function removeEntry(key, meal, entryUid) {
  store.update((s) => {
    const d = s.plan[key];
    if (!d) return;
    d[meal] = (d[meal] || []).filter((x) => x.uid !== entryUid);
    if (MEALS.every((m) => !(d[m.id] || []).length)) delete s.plan[key];
  });
}

const shortDay = (key) => {
  const d = fromKey(key);
  if (key === dateKey()) return 'today';
  if (key === dateKey(addDays(new Date(), 1))) return 'tomorrow';
  return dayName(d);
};

// ---------- view ----------
export function initPlanner() {
  $('#wk-prev').addEventListener('click', () => { selected = dateKey(addDays(fromKey(selected), -7)); render(); });
  $('#wk-next').addEventListener('click', () => { selected = dateKey(addDays(fromKey(selected), 7)); render(); });
  $('#pl-copy').addEventListener('click', copyToNextDay);
  $('#pl-clear').addEventListener('click', clearDay);
  store.subscribe(() => { if (!$('#planner').hidden) render(); });
}

export function showPlanner() { render(); }

function render() {
  const sel = fromKey(selected);
  const start = startOfWeek(sel);
  const today = dateKey();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const key = dateKey(d);
    const t = dayTotals(key);
    days.push(h('button', {
      type: 'button', class: `day-btn${key === today ? ' is-today' : ''}`,
      'aria-pressed': key === selected ? 'true' : 'false',
      'aria-current': key === today ? 'date' : null,
      'aria-label': `${longDate(d)}${t.count ? `, ${fmt.int(t.kcal)} kcal planned` : ''}`,
      onclick: () => { selected = key; render(); },
    },
    h('span', { class: 'dn', text: key === today ? 'Today' : dayName(d, 'short') }),
    h('span', { class: 'dd', text: String(d.getDate()) }),
    h('span', { class: 'dk', text: t.count ? fmt.int(t.kcal) : '' })));
  }
  $('#wk-days').replaceChildren(...days);
  $('#pl-day-title').textContent = longDate(sel);

  const day = dayOf(selected);
  $('#pl-meals').replaceChildren(...MEALS.map((m) => renderMeal(m, day[m.id] || [])));
  renderSummary();
}

function renderMeal(meal, entries) {
  const mk = entries.reduce((a, e) => a + (e.kcal || 0) * (Number(e.qty) || 0), 0);
  const list = entries.length
    ? h('ul', { class: 'entries' }, ...entries.map((e) => {
      const q = Number(e.qty) || 1;
      const name = e.link ? h('a', { href: e.link, target: '_blank', rel: 'noopener', text: e.name }) : e.name;
      return h('li', {},
        h('span', { class: 'en' }, name),
        h('span', { class: 'em', text: `${fmt.kcal((e.kcal || 0) * q)} · P ${fmt.int((e.p || 0) * q)} g · C ${fmt.int((e.c || 0) * q)} g · F ${fmt.int((e.f || 0) * q)} g` }),
        h('span', { class: 'qty', role: 'group', 'aria-label': `Servings of ${e.name}` },
          h('button', { type: 'button', 'aria-label': 'Half a serving less', onclick: () => changeQty(selected, meal.id, e.uid, -0.5) }, '−'),
          h('span', { text: `×${fmt.one(q)}` }),
          h('button', { type: 'button', 'aria-label': 'Half a serving more', onclick: () => changeQty(selected, meal.id, e.uid, 0.5) }, '+')),
        h('button', { type: 'button', class: 'link-btn remove', 'aria-label': `Remove ${e.name}`, onclick: () => removeEntry(selected, meal.id, e.uid) }, 'Remove'));
    }))
    : h('p', { class: 'meal-empty', text: 'Nothing planned yet.' });

  return h('section', { class: 'meal', 'aria-label': meal.label },
    h('div', { class: 'meal-head' },
      h('h3', {}, meal.label, mk ? h('span', { class: 'mk', text: fmt.kcal(mk) }) : null),
      h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => openPicker(selected, meal.id) }, `Add to ${meal.label.toLowerCase()}`)),
    list);
}

function renderSummary() {
  const t = dayTotals(selected);
  const target = savedTargets();
  renderPlate($('#pl-plate'), {
    parts: partsFromGrams(t),
    scale: target ? target.kcal : undefined,
    big: fmt.int(t.kcal),
    small: target ? `of ${fmt.int(target.kcal)} kcal` : 'kcal planned',
    label: `${fmt.int(t.kcal)} kcal planned${target ? ` of ${fmt.int(target.kcal)}` : ''}`,
  });
  const rows = [
    ['Energy', t.kcal, target?.kcal, 'kcal', '#B85C3F'],
    ['Carbohydrates', t.carbs, target?.carbs, 'g', MACRO_COLORS.carbs],
    ['Protein', t.protein, target?.protein, 'g', MACRO_COLORS.protein],
    ['Fat', t.fat, target?.fat, 'g', MACRO_COLORS.fat],
  ].map(([label, v, goal, unit, color]) => {
    const pct = goal ? Math.min(100, (v / goal) * 100) : 0;
    const over = goal && v > goal * 1.05;
    return h('div', { class: 'total-row' },
      h('span', { class: 'tl' }, label),
      h('span', { class: 'tv' }, h('b', { text: fmt.int(v) }), goal ? ` / ${fmt.int(goal)} ${unit}` : ` ${unit}`),
      goal ? h('span', { class: 'total-bar', 'aria-hidden': 'true' }, h('span', { class: over ? 'over' : '', style: `width:${pct}%;background:${color}` })) : null);
  });
  const hint = target
    ? null
    : h('p', { class: 'fine' }, 'Save your daily targets to see how the day compares. ', h('a', { href: '#calculator', text: 'Find my targets' }));
  $('#pl-totals').replaceChildren(h('div', { class: 'totals' }, ...rows), ...(hint ? [hint] : []));
  $('#pl-copy').disabled = !t.count;
  $('#pl-clear').disabled = !t.count;
}

function copyToNextDay() {
  const from = dayOf(selected);
  const nextKey = dateKey(addDays(fromKey(selected), 1));
  store.update((s) => {
    const to = s.plan[nextKey] ? { ...emptyDay(), ...s.plan[nextKey] } : emptyDay();
    for (const m of MEALS) to[m.id] = [...(to[m.id] || []), ...(from[m.id] || []).map((e) => ({ ...e, uid: uid() }))];
    s.plan[nextKey] = to;
  });
  toast(`Copied to ${longDate(fromKey(nextKey))}.`);
}

async function clearDay() {
  const ok = await confirmDialog({ title: 'Clear this day?', body: `Everything planned for ${longDate(fromKey(selected))} will be removed.`, ok: 'Clear day', cancel: 'Keep it' });
  if (!ok) return;
  store.update((s) => { delete s.plan[selected]; });
}

// ---------- adding ----------
function dayOptions(defaultKey) {
  const opts = [];
  const base = new Date();
  for (let i = 0; i < 14; i++) {
    const d = addDays(base, i);
    const key = dateKey(d);
    const label = i === 0 ? `Today, ${d.toLocaleDateString('en-SG', { day: 'numeric', month: 'short' })}` : d.toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' });
    opts.push(h('option', { value: key, selected: key === defaultKey }, label));
  }
  if (!opts.some((o) => o.value === defaultKey)) {
    opts.unshift(h('option', { value: defaultKey, selected: true }, fromKey(defaultKey).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'short' })));
  }
  return opts;
}

function nutritionFields(per = {}, prefix = 'pd') {
  const field = (id, label, unit, value) => h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    h('div', { class: 'unit-input' }, h('input', { id, type: 'number', inputmode: 'decimal', min: '0', step: 'any', value: Number.isFinite(value) ? String(Math.round(value)) : '' }), h('span', { text: unit })));
  return h('div', { class: 'row-4' },
    field(`${prefix}-kcal`, 'Energy', 'kcal', per.kcal),
    field(`${prefix}-p`, 'Protein', 'g', per.p),
    field(`${prefix}-c`, 'Carbs', 'g', per.c),
    field(`${prefix}-f`, 'Fat', 'g', per.f));
}

/**
 * Add something to a day. item: { name, perServing:{kcal,p,c,f}|null, link, recipeId }.
 * The person picks the day, meal and servings, and can adjust nutrition per serving.
 */
export function openAddToPlan(item, { date, meal } = {}) {
  const dlg = $('#plan-dialog');
  const per = item.perServing || {};
  const hour = new Date().getHours();
  const guessMeal = meal || (hour < 10 ? 'breakfast' : hour < 15 ? 'lunch' : hour < 21 ? 'dinner' : 'snacks');
  const err = h('p', { class: 'field-error', role: 'alert' });
  const form = h('form', { class: 'stack', novalidate: true },
    h('h2', { id: 'pd-title', text: 'Add to my plan' }),
    h('div', { class: 'field' }, h('label', { for: 'pd-name', text: 'Name' }), h('input', { id: 'pd-name', type: 'text', value: item.name || '', required: true })),
    h('div', { class: 'pd-grid' },
      h('div', { class: 'field' }, h('label', { for: 'pd-day', text: 'Day' }), h('select', { id: 'pd-day' }, ...dayOptions(date || dateKey()))),
      h('div', { class: 'field' }, h('label', { for: 'pd-meal', text: 'Meal' }), h('select', { id: 'pd-meal' }, ...MEALS.map((m) => h('option', { value: m.id, selected: m.id === guessMeal }, m.label))))),
    h('div', { class: 'field', style: 'max-width:180px' }, h('label', { for: 'pd-qty', text: 'Servings' }), h('input', { id: 'pd-qty', type: 'number', inputmode: 'decimal', min: '0.5', step: '0.5', value: '1' })),
    h('p', { class: 'fine', text: item.perServing ? 'Nutrition per serving. Adjust it if your portion differs.' : 'No nutrition listed for this one. Add your best estimate per serving, or leave it at zero.' }),
    nutritionFields(per),
    err,
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Add to plan'), h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => dlg.close() }, 'Cancel')));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.querySelector('#pd-name').value.trim();
    const qty = num(form.querySelector('#pd-qty').value);
    if (!name) { err.textContent = 'Give it a name.'; return; }
    if (!(qty > 0)) { err.textContent = 'Servings must be more than zero.'; return; }
    const v = (id) => Math.max(0, num(form.querySelector(id).value) || 0);
    const key = form.querySelector('#pd-day').value;
    const mealId = form.querySelector('#pd-meal').value;
    addEntry(key, mealId, { name, qty, kcal: v('#pd-kcal'), p: v('#pd-p'), c: v('#pd-c'), f: v('#pd-f'), link: item.link || null, recipeId: item.recipeId || null });
    dlg.close();
    selected = key;
    const mealLabel = MEALS.find((m) => m.id === mealId).label.toLowerCase();
    toast(`Added to ${shortDay(key)}'s ${mealLabel}.`, { href: '#planner', label: 'Open planner' });
  });

  $('#pd-body').replaceChildren(form);
  openDialog(dlg);
  form.querySelector('#pd-day').focus();
}

/** Choose something to add to one meal: saved recipes or a quick entry. */
function openPicker(key, mealId) {
  const dlg = $('#pick-dialog');
  const meal = MEALS.find((m) => m.id === mealId);
  let tab = 'recipes';

  const body = h('div');
  const draw = () => {
    const recipes = [...store.get().recipes].sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    const tabs = h('div', { class: 'pick-tabs', role: 'group', 'aria-label': 'Add from' },
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(tab === 'recipes'), onclick: () => { tab = 'recipes'; draw(); } }, 'My recipes'),
      h('button', { type: 'button', class: 'chip', 'aria-pressed': String(tab === 'quick'), onclick: () => { tab = 'quick'; draw(); } }, 'Quick add'));

    let panel;
    if (tab === 'recipes') {
      const search = h('input', { type: 'search', placeholder: 'Find a saved recipe', 'aria-label': 'Find a saved recipe', autocomplete: 'off' });
      const list = h('ul', { class: 'pick-list' });
      const fill = () => {
        const q = search.value.trim().toLowerCase();
        const rows = recipes.filter((r) => !q || r.name.toLowerCase().includes(q));
        if (!recipes.length) {
          list.replaceChildren(h('li', {}, h('span', { class: 'meta' }, 'No saved recipes yet. Save one from ', h('a', { href: '#recipe-finder', onclick: () => dlg.close() }, 'Recipes'), ' or build one in the ', h('a', { href: '#recipe-lab', onclick: () => dlg.close() }, 'recipe lab'), '.')));
          return;
        }
        if (!rows.length) { list.replaceChildren(h('li', {}, h('span', { class: 'meta', text: 'No saved recipe matches that.' }))); return; }
        list.replaceChildren(...rows.map((r) => h('li', {},
          h('div', {}, h('div', { style: 'font-weight:600', text: r.name }),
            h('div', { class: 'meta', text: `${r.perServing ? fmt.kcal(r.perServing.kcal) + ' per serving' : 'No nutrition yet'} · ${r.kind === 'lab' ? 'Recipe lab' : r.source || 'Saved recipe'}` })),
          h('button', { type: 'button', class: 'btn btn-secondary btn-sm', onclick: () => pick(r) }, 'Add'))));
      };
      search.addEventListener('input', fill);
      fill();
      panel = h('div', {}, search, list);
      setTimeout(() => search.focus(), 30);
    } else {
      const err = h('p', { class: 'field-error', role: 'alert' });
      const f = h('form', { class: 'stack', novalidate: true },
        h('div', { class: 'field' }, h('label', { for: 'qa-name', text: 'What did you have?' }), h('input', { id: 'qa-name', type: 'text', placeholder: 'e.g. Kopi C and kaya toast', required: true })),
        h('p', { class: 'fine', text: 'Nutrition per serving. Use a label or your best estimate.' }),
        nutritionFields({}, 'qa'),
        err,
        h('button', { type: 'submit', class: 'btn btn-primary' }, `Add to ${meal.label.toLowerCase()}`));
      f.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = f.querySelector('#qa-name').value.trim();
        if (!name) { err.textContent = 'Give it a name.'; return; }
        const v = (id) => Math.max(0, num(f.querySelector(id).value) || 0);
        addEntry(key, mealId, { name, kcal: v('#qa-kcal'), p: v('#qa-p'), c: v('#qa-c'), f: v('#qa-f') });
        dlg.close();
        toast(`Added to ${meal.label.toLowerCase()}.`);
      });
      panel = f;
      setTimeout(() => f.querySelector('#qa-name').focus(), 30);
    }
    body.replaceChildren(
      h('h2', { id: 'pk-title', text: `Add to ${meal.label.toLowerCase()}` }),
      h('p', { class: 'fine', text: longDate(fromKey(key)) }),
      tabs, panel);
  };

  const pick = (r) => {
    if (!r.perServing) { dlg.close(); openAddToPlan({ name: r.name, perServing: null, link: r.link, recipeId: r.id }, { date: key, meal: mealId }); return; }
    const { kcal, p, c, f } = r.perServing;
    addEntry(key, mealId, { name: r.name, kcal, p, c, f, link: r.link || null, recipeId: r.id });
    dlg.close();
    toast(`Added ${r.name} to ${meal.label.toLowerCase()}.`);
  };

  draw();
  $('#pk-body').replaceChildren(body);
  openDialog(dlg);
}
