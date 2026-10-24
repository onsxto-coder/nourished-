// Everything Nourished saves lives in this browser's localStorage under one key.

const KEY = 'nourished.v2';
const VERSION = 2;

const blank = () => ({
  version: VERSION,
  member: null,            // { email, since }
  profile: null,           // saved calculator inputs
  recipes: [],             // lab recipes and saved site recipes
  plan: {},                // { 'YYYY-MM-DD': { breakfast:[], lunch:[], dinner:[], snacks:[] } }
  labDraft: { name: '', servings: 1, ingredients: [] },
});

let state = load();
const listeners = new Set();
let memoryOnly = false;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    return normalise(JSON.parse(raw));
  } catch {
    return blank();
  }
}

function normalise(obj) {
  const b = blank();
  if (!obj || typeof obj !== 'object') return b;
  return {
    version: VERSION,
    member: obj.member && typeof obj.member.email === 'string' ? obj.member : null,
    profile: obj.profile && typeof obj.profile === 'object' ? obj.profile : null,
    recipes: Array.isArray(obj.recipes) ? obj.recipes.filter((r) => r && r.id && r.name) : [],
    plan: obj.plan && typeof obj.plan === 'object' ? obj.plan : {},
    labDraft: obj.labDraft && Array.isArray(obj.labDraft.ingredients) ? obj.labDraft : b.labDraft,
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    memoryOnly = false;
  } catch {
    memoryOnly = true; // private mode or storage full: keep working in memory
  }
}

export const get = () => state;
export const isMemoryOnly = () => memoryOnly;

export function update(fn) {
  fn(state);
  save();
  listeners.forEach((cb) => { try { cb(state); } catch (e) { console.error(e); } });
}

export function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function exportData() {
  const { member, ...rest } = state;
  return { app: 'Nourished by Sixto Carreon', exported: new Date().toISOString(), ...rest };
}

export function importData(obj) {
  const incoming = normalise(obj);
  update((s) => {
    s.profile = incoming.profile || s.profile;
    const byId = new Map(s.recipes.map((r) => [r.id, r]));
    incoming.recipes.forEach((r) => byId.set(r.id, r));
    s.recipes = [...byId.values()];
    for (const [day, meals] of Object.entries(incoming.plan)) s.plan[day] = meals;
  });
  return incoming;
}

export function clearSaved() {
  update((s) => {
    const member = s.member;
    Object.assign(s, blank());
    s.member = member;
  });
}

export function forgetMember() {
  update((s) => { s.member = null; });
}
