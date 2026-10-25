// Pure calculations for daily targets and BMI. See "How it works" in the app.

export const ACTIVITY = [
  { id: 'sedentary', label: 'Mostly sitting', desc: 'Desk work and little planned exercise', factor: 1.2 },
  { id: 'light', label: 'Lightly active', desc: 'Light exercise or walking 1–3 days a week', factor: 1.375 },
  { id: 'moderate', label: 'Moderately active', desc: 'Exercise 3–5 days a week', factor: 1.55 },
  { id: 'very', label: 'Very active', desc: 'Hard exercise 6–7 days a week', factor: 1.725 },
  { id: 'extra', label: 'Extra active', desc: 'Physical work plus regular training', factor: 1.9 },
];

export const GOALS = [
  { id: 'lose', label: 'Lose gently', factor: 0.9 },
  { id: 'maintain', label: 'Maintain', factor: 1 },
  { id: 'gain', label: 'Gain gently', factor: 1.1 },
];

export const BALANCES = [
  { id: 'balanced', label: 'Balanced', carbs: 50, protein: 20, fat: 30 },
  { id: 'protein', label: 'Higher protein', carbs: 45, protein: 25, fat: 30 },
  { id: 'lighter', label: 'Lighter on carbs', carbs: 45, protein: 20, fat: 35 },
];

export const MODES = [
  { id: 'everyday', label: 'Everyday' },
  { id: 'fitness', label: 'Fitness' },
];

// Fitness mode sets protein per kilogram of body weight.
export const FITNESS_GOALS = [
  { id: 'cut', label: 'Lose fat', factor: 0.85, proteinPerKg: 2.0 },
  { id: 'maintain', label: 'Maintain', factor: 1, proteinPerKg: 1.6 },
  { id: 'build', label: 'Build muscle', factor: 1.1, proteinPerKg: 1.8 },
];

export const FITNESS_PLATES = [
  { id: 'balanced', label: 'Balanced', desc: 'Fat at 25% of energy, the rest from carbohydrates', fat: 25 },
  { id: 'lowcarb', label: 'Low carb', desc: 'Carbohydrates at 25% of energy, the rest from fat', carbs: 25 },
];

/** The illustrative profile shown before someone saves their own targets. */
export const EXAMPLE_PROFILE = {
  units: 'metric', sex: 'male', age: 35, heightCm: 170, weightKg: 70,
  activity: 'moderate', goal: 'maintain', balance: 'balanced',
};

export const LIMITS = { age: [18, 100], heightCm: [120, 230], weightKg: [30, 250] };

export function validate(p) {
  const errors = [];
  const inRange = (v, [a, b]) => Number.isFinite(v) && v >= a && v <= b;
  if (!inRange(p.age, LIMITS.age)) errors.push(p.age < 18 ? 'These estimates are for adults aged 18 and over.' : 'Enter an age between 18 and 100.');
  if (!inRange(p.heightCm, LIMITS.heightCm)) errors.push('Enter a height between 120 and 230 cm (3 ft 11 in to 7 ft 6 in).');
  if (!inRange(p.weightKg, LIMITS.weightKg)) errors.push('Enter a weight between 30 and 250 kg (66 to 550 lb).');
  return errors;
}

export function bmrMifflin({ sex, age, heightCm, weightKg }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'female' ? -161 : 5);
}

export function computeTargets(p) {
  const fitness = p.mode === 'fitness';
  const activity = ACTIVITY.find((a) => a.id === p.activity) || ACTIVITY[2];
  const goal = fitness
    ? FITNESS_GOALS.find((g) => g.id === p.fitGoal) || FITNESS_GOALS[1]
    : GOALS.find((g) => g.id === p.goal) || GOALS[1];

  const bmr = bmrMifflin(p);
  const maintenance = bmr * activity.factor;
  let kcal = maintenance * goal.factor;
  const flooredAtBmr = kcal < bmr;
  if (flooredAtBmr) kcal = bmr;
  kcal = Math.round(kcal / 10) * 10;

  let protein; let carbs; let fat; let balance; let lowCarb = false;
  if (fitness) {
    const plate = FITNESS_PLATES.find((x) => x.id === p.fitPlate) || FITNESS_PLATES[0];
    // protein per kg, never more than 40% of the day's energy
    protein = Math.min(Math.round(goal.proteinPerKg * p.weightKg), Math.round((kcal * 0.4) / 4));
    if (plate.id === 'lowcarb') {
      lowCarb = true;
      carbs = Math.round((kcal * plate.carbs) / 100 / 4);
      fat = Math.max(0, Math.round((kcal - protein * 4 - carbs * 4) / 9));
    } else {
      fat = Math.round((kcal * plate.fat) / 100 / 9);
      carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
    }
    const pct = (e) => Math.round((e / kcal) * 100);
    balance = { id: plate.id, label: plate.label, carbs: pct(carbs * 4), protein: pct(protein * 4), fat: pct(fat * 9) };
  } else {
    balance = BALANCES.find((b) => b.id === p.balance) || BALANCES[0];
    protein = Math.round((kcal * balance.protein) / 100 / 4);
    carbs = Math.round((kcal * balance.carbs) / 100 / 4);
    fat = Math.round((kcal * balance.fat) / 100 / 9);
  }

  return {
    kcal, protein, carbs, fat,
    bmr: Math.round(bmr / 10) * 10,
    maintenance: Math.round(maintenance / 10) * 10,
    flooredAtBmr, activity, goal, balance,
    mode: fitness ? 'fitness' : 'everyday',
    lowCarb,
    proteinPerKg: protein / p.weightKg,
    bmi: bmi(p.weightKg, p.heightCm),
  };
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  const value = Math.round((weightKg / (m * m)) * 10) / 10;
  return {
    value,
    asian: asianBand(value),
    who: whoBand(value),
    healthyKg: [18.5 * m * m, 22.9 * m * m],
  };
}

export function asianBand(v) {
  if (v < 18.5) return { label: 'Below the healthy range', note: 'Risk of nutritional deficiency and osteoporosis' };
  if (v < 23) return { label: 'Healthy range', note: 'Low risk' };
  if (v < 27.5) return { label: 'Moderate risk', note: 'Above the healthy range for Asian adults' };
  return { label: 'High risk', note: 'Well above the healthy range for Asian adults' };
}

export function whoBand(v) {
  if (v < 18.5) return 'Underweight';
  if (v < 25) return 'Healthy weight';
  if (v < 30) return 'Overweight';
  return 'Obesity';
}

// Unit conversion
export const kgToLb = (kg) => kg * 2.2046226218;
export const lbToKg = (lb) => lb / 2.2046226218;
export const cmToFtIn = (cm) => {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round((totalIn - ft * 12) * 2) / 2;
  if (inch >= 12) { ft += 1; inch -= 12; }
  return { ft, inch };
};
export const ftInToCm = (ft, inch) => ((ft || 0) * 12 + (inch || 0)) * 2.54;
