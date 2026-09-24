# Armários App Instructions

## Stack

- Frontend: React 19 with TypeScript and Vite.
- Backend: Fastify 5 with TypeScript.
- Validation: Zod.
- Database: PostgreSQL accessed through the native `pg` driver.
- Persistence: raw SQL queries and the repository transaction helpers.
- Icons: use the existing `lucide-react` dependency when an icon is needed.
- Language: user-facing interface text must remain in Brazilian Portuguese.

## Non-negotiable styling rules

- Use only Vanilla CSS.
- Do not suggest or add Tailwind CSS, CSS-in-JS, styled-components, Sass, or other CSS frameworks.
- Do not suggest or add ORMs, query builders, or database abstraction layers.
- Do not suggest or add ready-made component libraries such as MUI, Chakra UI, Ant Design, Bootstrap, Mantine, or similar.
- Prefer the existing `design-system.css`, `theme.css`, and local component styles.
- Reuse semantic design tokens and existing class conventions before introducing new styles.
- Keep light and dark themes based on CSS custom properties.
- Respect `prefers-reduced-motion` for animations and transitions.
- Preserve accessible focus states, keyboard navigation, labels, and ARIA attributes.

## Backend rules

- Keep database mutations inside the existing transaction helper.
- Use PostgreSQL transactions for operations that mutate multiple records.
- Use optimistic concurrency through existing version fields.
- Use `operationId` and the existing idempotency helper for write operations.
- Prefer explicit raw SQL with parameterized values.
- Never interpolate user-controlled values into SQL.
- Preserve rollback behavior on transactional failures.
- When partial success is explicitly required, use savepoints or an equivalent PostgreSQL mechanism and return per-item results.
- Validate request bodies with Zod.
- Keep OpenAPI metadata synchronized with write endpoints.

## Frontend rules

- Preserve the existing React 19 patterns and public component APIs.
- Reuse existing API helpers instead of creating parallel fetch wrappers.
- Keep loading, empty, error, offline, and disabled states explicit.
- Prefer skeleton loaders over spinners for content loading.
- Keep bulk actions visible only when the selected records support the same safe operation.
- Do not duplicate business rules in the frontend when they belong to the API.
- Keep responsive behavior functional on desktop and mobile.
- Use existing Lucide icons instead of manually drawn SVG icons.

## Validation

After code changes:

1. Run `npm run build`.
2. Run focused tests for the changed area when available.
3. Run `npm run lint` when lint-related files or patterns are changed.
4. Integration and browser tests require isolated PostgreSQL test databases.
5. Do not claim tests passed unless the commands actually completed successfully.

## Editing and repository hygiene

- Keep changes focused on the requested behavior.
- Do not revert unrelated user changes.
- Do not modify generated build output.
- Use `apply_patch` for manual file edits.
- Do not create commits unless the user explicitly requests one.
- Before committing, inspect `git status` and stage only files belonging to the requested change.
