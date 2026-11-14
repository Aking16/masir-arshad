# Repository Guidelines

## Project structure

Masir Arshad is a static, Persian RTL study planner. The Git repository lives in `sites/masir-arshad/` within the desktop workspace. Run the commands below from that directory.

- `dist/index.html` and `dist/app.js` define the interface and browser behavior.
- `dist/source-weeks.js` contains the fixed 18-week plan. `dist/session-calendar.js` handles Jalali dates and automatic study sessions.
- `styles.css` is the Tailwind input. Rebuild the served `dist/site.css` after changing styles or utility classes. Fonts and icons also live in `dist/`.
- `.openai/hosting.json` configures the private Sites deployment.

## Build and development

- `npm ci` installs dependencies from the lockfile.
- `npm run build` compiles and minifies Tailwind CSS.
- `npm start` serves `dist/` at `http://127.0.0.1:5177/` using Python 3.

## Coding conventions

Use two-space indentation and native JavaScript ES modules. Use camelCase for JavaScript names and kebab-case for HTML IDs and CSS classes. Follow the existing Tailwind utilities and component classes. Keep displayed dates in Jalali and stored date keys in ISO format. Use Tehran time for day boundaries and retain compatibility with existing browser storage.

## Testing

Run `node --check dist/app.js` and `git diff --check`. The package has no dedicated test or lint script. Smoke-test the affected view in a browser at desktop and mobile widths. For scheduling changes, check fixed weekly totals, manual-session priority, and persistence after reload. For date changes, check Tehran midnight and the relevant Jalali boundaries. Ad hoc browser checks in the workspace's `tmp/study-1406/` use Playwright and are outside this repository.

## Commits and pull requests

Follow the history's short, imperative subjects, such as “Accept study duration in hours.” In a pull request, describe the user-visible change and the checks performed. Link a related issue when available and include screenshots for layout changes.
