# Repository Guidelines

## Project Structure & Module Organization

MenuSplit is a dependency-free, Spanish-language bill-splitting app. Source files live in the repository root:

- `index.html`: page structure, accessible labels, and local asset references.
- `styles.css`: responsive layout, colors, focus states, and reduced-motion rules.
- `app.js`: receipt seed data, calculation helpers, validation, persistence, rendering, and event handlers. Pure helpers are exposed through `globalThis.MenuSplit` for tests.
- `app.test.cjs`: calculation and simulated-interaction tests.
- `photo_2026-10-26_11-29-24.jpg`: original receipt; preserve it as the source of truth.
- `README.md`: usage and development instructions.
- `AGENTS.md`: repository instructions for contributors and coding agents.
- `bak/`: account JSON backups included in version control at the repository owner's request.
- `.gitignore`: excludes browser automation output, environment files, and logs.
- `.gitattributes`: keeps text files in LF and preserves the receipt as binary.

## Build, Test, and Development Commands

Open `index.html` directly in a browser to run locally. No build, package installation, server, or network connection is required.

Run automated checks with Node.js:

```sh
node --test app.test.cjs
```

There is no package manifest, formatter, or linter configured. Do not introduce dependencies or a build pipeline without an explicit requirement.

## Coding Style & Naming Conventions

Use two-space indentation for new JavaScript and HTML blocks. Follow nearby formatting; avoid reformatting unrelated compact code. Use strict-mode JavaScript, single-quoted strings, semicolons, `const` by default, and `let` for reassignment. Use camelCase for functions and variables, UPPER_SNAKE_CASE for constants, and kebab-case for CSS classes and HTML IDs. Keep user-facing text in Spanish.

## Testing Guidelines

Tests use Node's built-in `node:test`, strict assertions, and `node:vm`. Add descriptive behavior-focused tests to `app.test.cjs`; current test descriptions are Spanish. No numerical coverage threshold is configured. Cover changed calculation, payment, validation, and storage behavior. Simulated DOM tests do not replace browser checks: verify mobile layout, keyboard focus, assignment, payments, and reload persistence.

## Calculation & Storage Invariants

Store money as integer cents and percentages as integer hundredths. Split IVA and tip proportionally to consumption before charges, allocating leftover cents by largest remainder with ties in participant order. Participants without consumption pay no charges. Validate version 1 accounts before migrating to version 2 and clear legacy payment flags; preserve version 2 payments. Preserve the original total of C$10,230.59. Require all units to be assigned before payment and block account edits while payments exist. Validate saved data, preserve damaged storage until explicit reset, and escape user input before HTML interpolation.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects, such as `Fix payment rounding`. PRs should describe behavior changes, reference relevant issues, report test results and limitations, and include desktop/mobile screenshots for UI changes.

## Git Repository & Publication

The canonical repository is https://github.com/davidevanks/menuSplit.git. Use `origin` for this remote and `main` as the primary branch. Check `git status`, the current branch, and the remote before committing or pushing. Fetch existing remote history before integrating changes; never overwrite it with a force push unless explicitly requested.

Run `node --test app.test.cjs` and `git diff --check` before committing. Keep the simulated DOM aligned with browser APIs used by the app; a missing mock API must not be worked around by weakening production code. Report any browser checks that were not performed.

Include the account backups in `bak/` in version control as explicitly requested by the repository owner. Keep them as data snapshots; do not turn personal account backups into test fixtures. Do not commit `.playwright-cli/`, browser profiles, credentials, environment secrets, or local logs. Preserve the original receipt image in version control. Review staged files before committing, especially before publishing to the public repository. Source changes that add or change transfer details must be intentional.

## Feature & Persistence Notes

Keep the participant grand total and the difference from the bill consistent with the calculation helpers. Amounts remain provisional until every unit is assigned, including free units. WhatsApp sharing requires complete assignments and an explicit participant selection; opening the prepared message must not change payments or the account, and the user confirms delivery in WhatsApp.

The account schema is version 2 while the existing storage key remains `menusplit.account.v1`. JSON import replaces the account only after validation and confirmation; preserve the current account on cancellation, invalid input, read/write failures, or cross-tab conflicts. Do not overwrite damaged storage until an explicit reset. JSON export must use the visible in-memory account even when local saving fails.
