<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Coding guidelines

- Use the simplest implementation that fully solves the problem. Reuse existing code where it fits and add abstractions only when they make the code easier to understand or maintain.
- Verify the change through its normal entry point and cover relevant failure cases.
- Write code that people can read easily. Use descriptive names and straightforward control flow. Use comments to explain decisions that are hard to infer from the code.
- Always remove temporary files you create for a task once they are no longer needed. Clean them up before finishing, even if a command fails.

## User experience

- Make every feature easy to find, understand, and use. Give common tasks a direct path with clear labels, sensible defaults, visible primary actions, and as few clicks or taps as practical.
- Walk through the main workflow before finishing. Remove unnecessary screens and repeated inputs while keeping controls accessible and preserving necessary confirmations.
- Use the Expenses filters as the visual standard for form controls. Reuse the components in `app/components/forms/` for text and search fields, single- and multiple-choice dropdowns, month/date/time pickers, checkboxes, radio buttons, and file pickers. Configure labels, options, values, and behavior in each feature. Place labels above full-width fields, match the 40 px minimum height, rounded borders, and compact padding, and align chevrons and picker icons at the trailing edge. Use consistent 16 px gaps between fields, stack fields on narrow screens, and keep keyboard focus indicators visible.

## Repository structure

- Group related files by feature or purpose. Use short role names within each folder, such as `access.ts`, `mutations.ts`, and `queries.ts`. Give React component files the same descriptive name as their component.
- Keep feature code beside its routes in private folders such as `_components` and `_lib`. Group reusable UI by purpose in `app/components/` and shared helpers by feature in `app/lib/`. Preserve Next.js entry points and public URLs when moving internal files.
- Keep the Prisma client, schema, and migrations under `server/db/`. Preserve existing migration paths and history when reorganizing code.
- Group tests under `tests/` by the feature or responsibility they cover. When moving files, update their imports, affected npm scripts, and the repository map in `README.md`.
