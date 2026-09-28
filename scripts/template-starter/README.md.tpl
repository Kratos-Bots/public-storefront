# __NAME__ (`__ID__`)

A storefront template. Contract: `docs/templates.md` in the storefront repo.

- Built-in: lives at `web/src/templates/__ID__/`.
- Imported: this folder is the repo root; add it to the storefront's `templates.lock.json`
  pinned to a full commit SHA.

Check it: `npm run typecheck && npm run test:web && npm run test:e2e -- templates.spec.ts`
(add a `TEMPLATE_CASES` entry for it in `e2e/templates.spec.ts` first).
