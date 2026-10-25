# Nourished by Sixto Carreon

Sixto Carreon's free everyday nutrition toolkit, live at **https://app.sixtocarreon.com**.

- **Targets:** daily energy and macros (Mifflin–St Jeor), BMI with Asian and WHO ranges.
- **Recipes:** live search of sixtocarreon.com, comfortdishes.com and saucesanddips.com through their public WordPress REST APIs, with nutrition per serving read from each recipe's "Nutritional Value" section.
- **Recipe lab:** build a recipe from values per 100 g, with ingredient look-ups from USDA FoodData Central.
- **Planner:** a week of breakfast, lunch, dinner and snacks, totalled against saved targets.
- **Sign-up gate:** subscribing opens WordPress.com's own subscription window for sixtocarreon.com (blog 252215067), the same one the main site uses.

Everything a visitor saves stays in their own browser (localStorage key `nourished.v2`). There is no server, database or tracking.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | All the markup and copy |
| `assets/css/app.css` | Styles and brand tokens (terracotta, cream, Playfair Display + Inter) |
| `assets/js/main.js` | Start-up, sign-up gate, routing, overview, data tools |
| `assets/js/calc.js` | Energy, macro and BMI maths |
| `assets/js/calculator.js` | Targets view |
| `assets/js/recipes.js` | Recipe finder and nutrition parsing |
| `assets/js/lab.js` | Recipe lab and USDA look-up |
| `assets/js/planner.js` | Planner and "add to plan" |
| `assets/js/plate.js` | The plate graphic |
| `assets/fonts/` | Self-hosted Inter and Playfair Display (SIL Open Font License) |

No build step: edit a file, commit, and GitHub Pages publishes it within a minute or two.

## Common edits

- **Recipe topics** (the chips under the search box): `TOPICS` in `assets/js/recipes.js`, using sixtocarreon.com category IDs.
- **Activity levels, goals and plate balances:** `assets/js/calc.js`.
- **Guide copy:** the `#guide` section in `index.html`.
- **USDA key:** the look-up uses USDA's public `DEMO_KEY` (about 30 searches an hour per visitor). Don't commit a personal key to this public repository; USDA deactivates keys it finds online.

## Hosting

GitHub Pages from the `main` branch of `onsxto-coder/nourished-`, custom domain `app.sixtocarreon.com` (`CNAME` file). DNS for sixtocarreon.com is on WordPress.com: `app` is a CNAME to `onsxto-coder.github.io`.
