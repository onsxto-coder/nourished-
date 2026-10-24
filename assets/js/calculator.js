// Targets view: inputs, live estimate, BMI and saving.

import * as store from './store.js';
import { $, $$, h, fmt, num, toast } from './ui.js';
import {
  ACTIVITY, GOALS, BALANCES, EXAMPLE_PROFILE, validate, computeTargets,
  kgToLb, lbToKg, cmToFtIn, ftInToCm,
} from './calc.js';
import { renderPlate, partsFromGrams } from './plate.js';

const form = () => $('#calc-form');

export function initCalculator() {
  // Build the choice lists
  $('#c-activity').replaceChildren(...ACTIVITY.map((a) =>
    h('label', { class: 'choice' },
      h('input', { type: 'radio', name: 'activity', value: a.id }),
      h('span', { class: 'choice-body' }, h('strong', { text: a.label }), h('small', { text: a.desc })))));
  $('#c-goal').replaceChildren(...GOALS.map((g) =>
    h('label', {}, h('input', { type: 'radio', name: 'goal', value: g.id }), h('span', { text: g.label }))));
  $('#c-balance').replaceChildren(...BALANCES.map((b) =>
    h('label', { class: 'choice' },
      h('input', { type: 'radio', name: 'balance', value: b.id }),
      h('span', { class: 'choice-body' }, h('strong', { text: b.label }),
        h('small', { text: `Carbs ${b.carbs}% · protein ${b.protein}% · fat ${b.fat}%` })))));

  fillForm(store.get().profile || EXAMPLE_PROFILE);

  form().addEventListener('input', onInput);
  form().addEventListener('change', (e) => {
    if (e.target.name === 'units') switchUnits(e.target.value);
    onInput();
  });
  $('#save-targets').addEventListener('click', saveTargets);
  update();
}

function fillForm(p) {
  const f = form();
  f.elements.units.value = p.units || 'metric';
  f.elements.sex.value = p.sex || 'male';
  f.elements.activity.value = p.activity || 'moderate';
  f.elements.goal.value = p.goal || 'maintain';
  f.elements.balance.value = p.balance || 'balanced';
  $('#c-age').value = p.age ?? '';
  setBody(p.heightCm, p.weightKg);
  showUnits(f.elements.units.value);
}

function setBody(cm, kg) {
  $('#c-cm').value = Number.isFinite(cm) ? round(cm, 1) : '';
  $('#c-kg').value = Number.isFinite(kg) ? round(kg, 1) : '';
  if (Number.isFinite(cm)) { const { ft, inch } = cmToFtIn(cm); $('#c-ft').value = ft; $('#c-in').value = inch; } else { $('#c-ft').value = ''; $('#c-in').value = ''; }
  $('#c-lb').value = Number.isFinite(kg) ? round(kgToLb(kg), 0.5) : '';
}
const round = (v, step) => Math.round(v / step) * step;

function showUnits(units) {
  $$('[data-units]', form()).forEach((el) => { el.hidden = el.dataset.units !== units; });
}

function switchUnits(units) {
  // keep the same body measurements when flipping units
  const p = readForm(units === 'metric' ? 'imperial' : 'metric');
  showUnits(units);
  setBody(p.heightCm, p.weightKg);
}

export function readForm(unitsOverride) {
  const f = form();
  const units = unitsOverride || f.elements.units.value;
  const heightCm = units === 'metric' ? num($('#c-cm').value) : ftInToCm(num($('#c-ft').value), num($('#c-in').value) || 0);
  const weightKg = units === 'metric' ? num($('#c-kg').value) : lbToKg(num($('#c-lb').value));
  return {
    units: f.elements.units.value,
    sex: f.elements.sex.value,
    age: num($('#c-age').value),
    heightCm,
    weightKg,
    activity: f.elements.activity.value,
    goal: f.elements.goal.value,
    balance: f.elements.balance.value,
  };
}

let lastValid = null;
function onInput() { update(); }

function update() {
  const p = readForm();
  const errors = validate(p);
  const out = $('#calc-results');
  const errEl = $('#calc-error');
  if (errors.length) {
    errEl.textContent = errors[0];
    $('#save-targets').disabled = true;
    out.classList.add('is-stale');
    return;
  }
  errEl.textContent = '';
  $('#save-targets').disabled = false;
  out.classList.remove('is-stale');
  const t = computeTargets(p);
  lastValid = { p, t };
  renderResults(t, p);
  markSaved();
}

function renderResults(t, p) {
  renderPlate($('#calc-plate'), {
    parts: partsFromGrams(t),
    big: fmt.int(t.kcal),
    small: 'kcal a day',
    label: `${fmt.int(t.kcal)} kcal a day: ${t.carbs} g carbohydrates, ${t.protein} g protein, ${t.fat} g fat`,
  });

  const b = t.balance;
  const legend = h('ul', { class: 'legend' },
    legendRow('carbs', 'Carbohydrates', t.carbs, b.carbs),
    legendRow('protein', 'Protein', t.protein, b.protein),
    legendRow('fat', 'Fat', t.fat, b.fat));

  const energy = h('dl', { class: 'energy-lines' },
    h('dt', { text: 'Resting energy' }), h('dd', { text: fmt.kcal(t.bmr) }),
    h('dt', { text: 'Maintenance' }), h('dd', { text: fmt.kcal(t.maintenance) }),
    h('dt', { text: 'Protein per kg' }), h('dd', { text: `${fmt.one(t.proteinPerKg)} g` }));

  const note = t.flooredAtBmr
    ? h('p', { class: 'fine', style: 'margin-top:10px', text: 'Your target is held at your resting energy, the lowest it should go without professional advice.' })
    : null;

  const bmiV = t.bmi.value;
  const pos = Math.min(100, Math.max(0, ((bmiV - 15) / (35 - 15)) * 100));
  const [lo, hi] = t.bmi.healthyKg;
  const imperial = p.units === 'imperial';
  const range = imperial
    ? `${fmt.int(kgToLb(lo))}–${fmt.int(kgToLb(hi))} lb`
    : `${fmt.one(lo)}–${fmt.one(hi)} kg`;

  const bmiBlock = h('div', { class: 'bmi' },
    h('div', { class: 'bmi-head' },
      h('div', {}, h('div', { class: 'fine', text: 'BMI' }), h('div', { class: 'bmi-value num', text: fmt.one(bmiV) })),
      h('div', { style: 'text-align:right' }, h('strong', { text: t.bmi.asian.label }), h('div', { class: 'fine', text: t.bmi.asian.note }))),
    h('div', { class: 'bmi-scale', 'aria-hidden': 'true' }, h('span', { class: 'bmi-marker', style: `left:${pos}%` })),
    h('div', { class: 'bmi-ticks', 'aria-hidden': 'true' },
      ...[15, 18.5, 23, 27.5, 35].map((v) => h('span', { style: `left:${((v - 15) / 20) * 100}%`, text: String(v) }))),
    h('dl', {},
      h('dt', { text: 'Asian guideline (Singapore)' }), h('dd', { text: t.bmi.asian.label }),
      h('dt', { text: 'WHO international' }), h('dd', { text: t.bmi.who }),
      h('dt', { text: 'Healthy range for your height' }), h('dd', { text: range })));

  $('#calc-results').replaceChildren(legend, energy, ...(note ? [note] : []), bmiBlock);
}

function legendRow(key, label, grams, pct) {
  return h('li', {},
    h('span', { class: `dot dot-${key}` }),
    h('span', { text: label }),
    h('span', { class: 'val' }, `${fmt.int(grams)} g`, h('span', { class: 'pct', text: `${pct}%` })));
}

function saveTargets() {
  if (!lastValid) return;
  const { p, t } = lastValid;
  store.update((s) => {
    s.profile = { ...p, savedAt: new Date().toISOString() };
  });
  markSaved();
  toast(`Saved: ${fmt.int(t.kcal)} kcal a day.`, { href: '#planner', label: 'Plan my meals' });
}

function markSaved() {
  const saved = store.get().profile;
  const btn = $('#save-targets');
  if (!saved || !lastValid) { btn.textContent = 'Save as my targets'; return; }
  const same = ['sex', 'age', 'activity', 'goal', 'balance'].every((k) => saved[k] === lastValid.p[k])
    && Math.abs(saved.heightCm - lastValid.p.heightCm) < 0.3 && Math.abs(saved.weightKg - lastValid.p.weightKg) < 0.1;
  btn.textContent = same ? 'Saved as my targets' : 'Update my targets';
}

/** Saved targets, or null. */
export function savedTargets() {
  const p = store.get().profile;
  if (!p || validate(p).length) return null;
  return computeTargets(p);
}
