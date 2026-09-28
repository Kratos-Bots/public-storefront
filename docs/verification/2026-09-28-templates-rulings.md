# Storefront templates — controller rulings and parked findings

Collected from the subagent-driven-development ledgers on 2026-09-28, in the order made. Each ruling lists what it costs if wrong. Repos: backend, storefront and admin, each on branch feature/storefront-templates.

## Plan 1-backend

- Ruling: implementer commits carry the co-author trailer of the model that wrote them (e.g. Sonnet 5) instead of the plan's literal Opus trailer — attribution should be accurate — cost if wrong: cosmetic trailer text
- Task 3: complete (commits 8870571..5d21fb8, review clean; trailer minor covered by Ruling above)
- Final: parked — unbounded res.arrayBuffer() before 1 MiB check on live fetch (templates.ts) — Ruling: admin-controlled URL, low impact; defer — cost if wrong: backend buffers a large body from a misconfigured host
- Final: parked — cold-cache worst case ~10 s, no in-flight dedupe — Ruling: deployed source short-circuits in prod; defer — cost if wrong: slow first Appearance-tab load
- Final: Ruling: backend catalog caps (name 60, description 500, author 100, version 40, select choices 20, font weights 9) carried into Plan 2 — storefront registry must enforce the same caps + docs/templates.md lists them — cost if wrong: imported template renders but is missing from the admin picker
- Final: parked — registry doc lacks option-key regex/30 cap (description text only); PUT merge read-modify-write race — Ruling: cosmetic / negligible — cost if wrong: minor doc gap

## Plan 2-engine

- Ruling (carried from Plan 1 final review): storefront registry validateManifest must enforce the backend catalog caps — name ≤60, description ≤500, author ≤100, version ≤40, select choices ≤20, FontSpec weights ≤9 — and docs/templates.md must list them; otherwise an imported template renders but is dropped from the admin catalog — cost if wrong: tighter limits on template authors
- Ruling F1: contract.ts must re-export CutoffInfo from lib/server-clock.ts (fix Contract reference + Task 6 + Task 14 + Plan 3 copies) — breaks typecheck otherwise — cost if wrong: none
- Ruling F2: checkout `.next`/`.back` plain buttons join the custom-button list: data-sf-part="button", data-variant="filled" (next) / "default" (back), data-sf-cta="main" on Place order/Continue; included in the button-radius rule — spec §4.2 main-CTA pulse + brutalism button styles must reach them — cost if wrong: one more restyled element
- Ruling F3: Task 7 enumerates all 11 card roots explicitly by file:element (no grep heuristic) and the parts test checks each — cost if wrong: none
- Ruling F4: useServerAnchor anchors to the settings query's dataUpdatedAt (serverTime at fetch), shared with CutoffBar (remove its copy) — correctness of late-mounted brutalism clock — cost if wrong: small refactor of CutoffBar
- Ruling F5: heading tokens apply where modern already matches; other titles keep literals; templates style titles via data-sf-part page-title/group-title; document in docs/templates.md — keeps modern pixel-identical — cost if wrong: templates must target parts for titles
- Ruling F6: drop the E2E_REAL_FONTS step — dead code — cost if wrong: none
- Ruling F7: use `2 as unknown as 1` in Task 9 negative check — cost if wrong: none
- Ruling F8: ratify the nine spec deviations via an "Implementation amendments (2026-09-28)" section appended to the spec listing each; ADD a dev-mode console.error for invalid manifests (build still fails in CI/build); extend the menu-layout e2e through cart→checkout at 390 and 1280 — cost if wrong: longer e2e
- Ruling F9: every git add lists explicit file paths — shared-worktree safety — cost if wrong: none
- Ruling F10: remove chassis.test.ts from Task 7 files unless a step changes it — cost if wrong: none
- Ruling F11: Task 4's old bootstrap test update is an unconditional step with the exact new assertions — cost if wrong: none
- Ruling F12: fix Review Focus #5 pointer to Task 5 and add a ThemedApp wiring test (preview theme overrides stored theme, no localStorage write) in the task that wires it — cost if wrong: one extra test
- Ruling F13: define.ts block in the Contract reference must be complete compilable code (no declaration-only fragments) — cost if wrong: none
- Ruling F14: 'bad id' test asserts the full expected error message — cost if wrong: none
- Ruling F15: one shared scripts/template-rules.mjs (reserved names, id regex, import allowlist) imported by fetch-templates, template:new and their tests; theme-schema.ts imports regexes from define.ts — DRY — cost if wrong: one more small module
- Ruling F16: registry globs exclude ./defaults/** — cost if wrong: none
- Ruling F17: tag the checkout Mantine Stepper with data-sf-part="stepper" too (in addition to tracking ProgressStepper) — cost if wrong: none
- Ruling F18: move the template:new package.json script addition into Task 11 — cost if wrong: none
- Ruling F19: Task 12 validation = a node --test that parses release.yml with the `yaml` package if already installed (else jsonc-free regex) and asserts the fetch-templates step precedes the build/test steps and the ssh-agent step is conditional on TEMPLATES_DEPLOY_KEY — cost if wrong: small test
- Ruling F20: fix Plan 3 wording: icons come from contract ArrowUpRightIcon — cost if wrong: none
- Ruling (Plan 1 carry-over): validateManifest enforces name ≤60, description ≤500, author ≤100, version ≤40, select choices ≤20, FontSpec weights ≤9; docs/templates.md lists them
- Ruling: Plan 3 T8 restores E2E_REAL_FONTS as a working pass-through for Google Fonts in installMocks (F6 had dropped the dead version) — previews/visual review need real Tektur/Share Tech Mono/JetBrains Mono — cost if wrong: e2e depends on network when flag set
- Ruling: CutoffInfo.next gains `day` (additive, needed by CutoffBar) — cost if wrong: none
- Ruling: accept Task 1 fixture edit (catalog.json products get self imageProductId) — 5 storefront.spec.ts tests were already failing on main since 69a8291 (image-less catalogues render as list); fixture-only fix; baseline therefore covers the image-led grid, not the image-less list path — cost if wrong: image-less list layout has no pixel baseline
- Ruling: accept 3 type-annotation-only fixes in define.ts (plan block failed strict tsc); code, not the plan text, is now the contract source of truth — Task 14 docs and Plan 3 must read web/src/templates/define.ts — cost if wrong: plan text drifts from code
- Ruling: Task 5 plan-mandated findings 1+2 (attr-name allowlist; fontsHref must start https://fonts.googleapis.com/) are fixed despite the plan's verbatim code — spec §1.8 requires corrupt/foreign storage be harmless; also fix 3 (corrupt v2 falls through to v1), 4 (object-shape checks) and restrict replayed var names to ^--sf-[a-z0-9-]+$ — cost if wrong: slightly larger bootstrap string
- Ruling: Task 6 plan-mandated Important (TemplateProvider shows skeleton on every template switch, remounting the router) is fixed — skeleton only before the first module ever loads; on switch keep children with default slots until the new chunk lands/times out — spec §1.6 never break storefront; also fix minors: useTemplate theme?.scheme fallback, additive optional ButtonAdornmentProps.busy passed by CheckoutPage, runtime edge tests, server-clock test isolation — cost if wrong: brief flash of modern-default slots on switch
- Ruling: Task 7 minor 1 promoted into fix round — tag the 7 untagged primary CTAs (Account .cta, WhatsappLogin .cta, OrderStatus .cta, Tracking .submit, VerifyPage .submit, PaymentRedirect .cta, WholesaleBar .cta) as data-sf-part="button" data-variant="filled" using --sf-btn-radius — otherwise luxury shows accent-filled CTAs on login/order pages (spec §4.2 "never an accent fill") — cost if wrong: 7 more tagged elements
- Task 7: parked — AuthCard .dim dashed border reappears at medium width under card.border none — Ruling: template edge case, defer — cost if wrong: odd dashed card under a borderless template
- Ruling: Task 9 negative check — a broken modern manifest fails the build via registry's own 'modern missing or invalid' invariant rather than 'Invalid templates:'; plugin message verified for non-modern templates; accepted — cost if wrong: none (build fails either way)
- Ruling: Task 10 plan-mandated Critical (git option injection via lock repo, reproduced RCE) + Important scanner bypasses + symlink escape are all fixed despite the plan's verbatim code — build-time import must not turn a lock-file PR into code execution; scanner switches to the typescript compiler API (already a devDependency) and scans every compiled file type + CSS; symlinks rejected; minors 4–7 fixed too. Note: the scanner remains a guardrail, not a sandbox — imported templates are first-party code (spec §5.2 trust note) — cost if wrong: stricter rules may reject some legitimate template patterns
- Task 10: parked — @property initial-value string + image-set(var(--a)) remote fetch (Chromium-verified) — Ruling: real, not load-bearing (scanner is a guardrail; imported templates are reviewed first-party code per spec §5.2); FIX IN FINAL-REVIEW WAVE: treat every string inside an @property block (initial-value) as a candidate — cost if wrong: a reviewed template could reference a remote image
- Task 10: parked — query-suffixed relative import of a non-asset/no-extension file (import './evil.foo?.css') routes it through Vite's CSS pipeline, pulling @/ and ../ files into dist (build-verified) — Ruling: real, not load-bearing; FIX IN FINAL-REVIEW WAVE: isAllowedSpecifier rejects relative specifiers carrying a query except ?inline/?url/?raw on paths ending .css; validateTemplateDir .css check case-insensitive — cost if wrong: a reviewed template could bundle out-of-folder files
- Task 10: complete (commits 56762a8..d5a0ac1, 2 parked — breaker tripped at round 5)
- Ruling: Task 13 plan-mandated Important (expectSlotTapTargets offsetParent filter skips position:fixed slot content) fixed; also promote minor: tap-target checks require BOTH width and height ≥44px — spec §4.4 + Plan 3 relies on it — cost if wrong: Plan 3 slots must size icon controls 44×44
- Final: Ruling: fix I1–I4 and M1–M5, M7–M11 in one wave (final-fixes.md) — cost if wrong: small extra churn
- Final: Ruling: M6 waived (theoretical; broadening scheme rule risks false positives) with a docs note — cost if wrong: a reviewed template could reference a same-origin/blob resource via a non-URL function
- Final: parked — recommendations: sync-seed modern module for first paint; cross-repo templates.json → backend parser fixture test — Ruling: improvements, not defects — cost if wrong: extra chunk round-trip on first visit; parity drift caught later
- Final: parked — ButtonAdornment renders only on AddToCart + checkout CTAs (not all primary buttons), so brutalism ↗ is partial — Ruling: plan scope; acceptable — cost if wrong: arrow missing on some CTAs
- Final: parked — docs/templates.md:382 still says slots wrap in <div>; ButtonAdornment now uses <span> — Ruling: carried into Plan 3 Task 1 — cost if wrong: one stale doc sentence
- Final: parked — FONT_FAMILY_RE accepts all-space family "   " while backend rejects it (whole template dropped from catalog) — Ruling: carried into Plan 3 Task 1 (fontErrors trim().length>0 + test) — cost if wrong: an admin-invisible template

## Plan 3-luxury-brutalism

- Ruling F1: css-rules.ts resolves paths via fileURLToPath/path, not new URL — cost if wrong: none
- Ruling F2: brutalist footer crosshairs must not create horizontal overflow — place inside the box (or clip .cb-footer with overflow:clip) + a test — cost if wrong: none
- Ruling F3: luxury filled/disabled rules keep only glow/transition (+ box-shadow:none disabled); shared outline-glow rules own fill/text/border — cost if wrong: none
- Ruling F4: brutalism filled/disabled rules drop background/color/border (native solid fill) and must not override AddToCart's "Added" state — cost if wrong: none
- Ruling F5: both templates apply --sf-btn-font/-transform/-weight/-tracking-md to [data-sf-part="button"] so custom CTAs follow the locked button style (§4.2/§4.3) — cost if wrong: extra CSS
- Ruling F6: both templates style page-title/group-title parts with the heading variables (brutalism uppercase 700; luxury 700/-0.03em) — cost if wrong: extra CSS
- Ruling F7: templates give product-card (and card) parts their radius (luxury 16) and inner padding so content isn't flush — cost if wrong: extra CSS
- Ruling F8: "options off" e2e checks first assert the template is live (data-sf-template + a visible template-owned element) before asserting absence; reduced-motion orb check runs at 1280 — cost if wrong: none
- Ruling F9: templates.spec.ts reuses presetTheme (no duplicated preset→theme logic) — cost if wrong: none
- Ruling F10: luxury footer links min-width 44px too — cost if wrong: none
- Ruling F11: conform hero clamp to spec min 2.5rem and add the "·" between NODE and SKU; record as spec amendments: [Catalogue]/[NN] labels, luxury heading/body fonts null (self-hosted Inter), crosshair placement, white CTA text on Purple Light (contrast) — cost if wrong: minor visual deviation
- Ruling F12: each template's TEMPLATE_CASES entry lands in the task that adds its manifest (guard test never red between tasks) — cost if wrong: none
- Ruling F13: luxury hover lift disabled under prefers-reduced-motion — cost if wrong: none
- Ruling F14: brutalist cart-bar status line must not exceed the page's bottom clearance (adjust padding / clearance var) and disabled checkout keeps a disabled look — cost if wrong: none
- Ruling F15: housekeeping (matrix count 26, await document.fonts.ready inside evaluate, docs section numbering, stale "five custom buttons" wording, duplicate rules) — cost if wrong: none
- Ruling: Task 2 e2e tap-target failures (dark-luxury storefront footer .lux-footer__link ×2 + ContactLinks chip <44px) accepted as plan sequencing — Task 3 template.css MUST give those ≥44×44 tap targets; Task 3 cannot complete until templates.spec.ts is green — cost if wrong: none
- Ruling: Task 5 e2e tap-target failures (cyber-brutalism storefront .cb-footer__link ×2 + ContactLinks chip, 8 cases) accepted as plan sequencing — Task 6 template.css MUST size them ≥44×44 and templates.spec.ts must be fully green — cost if wrong: none
- Task 9: visual review found N1–N6 (recorded in docs/verification/2026-09-28-templates-visual-review.md) — Ruling: all six go to the FINAL WAVE (N1 price overlap at 360 Important; N2 luxury menu group-title font; N3 brutalism AddToCart ↗ lost <768 (cta=false); N4 ProductDetailSheet h2 missing data-sf-part; N5 menu page label flush against dispatch bar; N6 brutalism menu /01 duplicated) — cost if wrong: small extra churn
- Final: Ruling: fix items 1–16 in one wave (final-fixes.md), incl. Crimson primary #d9486a with spec amendment, --lux-dim contrast, SR alt-text for generated content, pluralisation, press feedback, wholesale smoke e2e — cost if wrong: small churn; Crimson hue shifts slightly
- Final: parked — luxury main-CTA pulse animates box-shadow (repaint on phones) — Ruling: perf nicety — cost if wrong: minor battery/repaint cost
- Final: parked — system bar above header ignores safe-area-inset-top in standalone/cover display — Ruling: low reach — cost if wrong: bar under notch in PWA standalone
- Final: parked — test-regex hardening minors (Task 3/6), CyberButtonAdornment busy, define.ts:117 message — Ruling: not merge-blocking
- Final: parked (RESIDUAL, surface to user) — luxury menu ProductDetailSheet title shrinks 24px→14px because sheet-title shares the group-title rule's font-size:0.875rem (dark-luxury/template.css:888-892) — Ruling: one-line fix (split font-size/font-family into a group-title-only rule); no second fix wave per process, offered at finishing — cost if wrong: luxury menu sheet product name at body size
- Final: parked — :root:not([data-sf-template="modern"]) wrap also matches before the template attribute is applied — Ruling: never observed; baselines pass
- Final: parked — K1 frame top may overlap the header (brief only required clearing the sysbar) — Ruling: cosmetic

## Plan 4-admin

- Ruling F1: when catalog source === 'fallback' (or the catalog call failed), an unknown stored template shows distinct wording ("Template catalog unavailable — can't show this template's options; saving keeps it") instead of claiming the storefront shows Modern — cost if wrong: none
- Ruling F2: ratify read-only LockedField instead of disabled inputs as a spec amendment (react-hook-form drops disabled values) — cost if wrong: none
- Ruling F3: over-long text option → match storefront (fall back to manifest default), update the check-script assertion — cost if wrong: none
- Ruling F4: fix Task 3 line refs; retype RADIUS_PX so it doesn't use the removed FormData type — cost if wrong: none
- Ruling F5: Task 3's smoke check must not depend on Task 6's Playwright script — replace with build + check-script + a manual dev-server note, or move the check to Task 6 — cost if wrong: none
- Ruling F6: Task 6 scenario 6 uses force:true on the disabled radio (asserting it stays unselected); scenario 7 scopes the radio query to the template radiogroup — cost if wrong: none
- Ruling F7: LivePreview iframe mounts only once the preview container is first measured wider than 0 (and the Appearance tab is visible) — cost if wrong: none
- Ruling F8: any Task 6 UI fixes are made by a frontend-design subagent (implementers load the frontend-design skill) — cost if wrong: none
- Ruling F9: storefront-side — preview mode must be captured once at page load so in-frame SPA navigation keeps preview mode (no persistence of drafts) — routed to the Plan 3 final fix wave (storefront repo) — cost if wrong: an admin's own browser may briefly first-paint an unsaved draft
- Ruling F10: locked null font displays "Template default (Inter)" rather than "System font" — cost if wrong: none
- Ruling: F1 alert interpolates the real template id (brief's version) — more informative than the paraphrase — cost if wrong: none
- Task 4: Ruling: plan-mandated Important (template + preset radiogroups lack roving tabindex / arrow keys) → FINAL WAVE with the Task 3 a11y items (not load-bearing for Tasks 5–6) — cost if wrong: keyboard users Tab through each option meanwhile
- Final: Ruling: fix items 1–13 in one wave (final-fixes.md) via a frontend-design fixer — cost if wrong: small churn
- Final: parked (SURFACE TO USER) — restricted role granted the storefront module gets 403 + endless spinner on all storefront-settings cards (backend authorize('admin')) — pre-existing, affects every storefront card — Ruling: out of scope; follow-up to align backend authorize with module permission or add an error state
- Final: parked — draft double-post on first ready; invalid mid-typing font silently freezes preview; numeric option keys as RHF array paths — Ruling: harmless/latent
