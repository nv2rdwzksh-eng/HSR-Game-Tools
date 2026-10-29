# HSR-Game-Tools working rules

## Repository and authorization

- Work on develop by default; if the current task requires develop and another branch is checked out, stop and report without switching. main is Production and changes must reach it through a PR; never commit or push directly to main.
- Modify only this independent repository within the user's current authorized scope. Existing tools and mechanisms do not authorize new character mechanics, cross-wave systems, cloud sync, multi-plan libraries, simulator migrations or deployment.
- HSR-Database, TurnBasedGameData and StarRailRes are read-only investigation sources. Never edit, format, stage, commit, reset, clean, switch branches or run mutating generation commands in them.
- Read HSR-Database/develop at a recorded Commit; use Git object reads if another branch is checked out. Never initialize Git in the shared parent or turn sibling repositories into submodules / subtrees.
- Do not stage, commit, add remotes, push, publish, deploy or configure domains without separate user authorization. Do not automatically enter the next development phase.
- Do not trigger Preview / Production workflows or change GitHub Rulesets without explicit authorization. Never retrieve or print real deployment Secrets; maintain only secret references in workflow files and leave console configuration to the maintainer.

## Networking

- Every network operation uses the user's existing system proxy, currently http://127.0.0.1:12334. Check the current proxy configuration and verify connectivity first; do not assume the recorded port remains valid.
- A sandbox denial is not proof that the proxy is unavailable; use appropriate approved execution permissions when needed. Never bypass a failed proxy with direct networking; report unverifiable results.

## Current documentation

- [docs/README.md](docs/README.md) is the current documentation entry. Maintain implemented rules in the corresponding guide; implementation history and measurements belong in investigations.
- [Architecture](docs/architecture/action-order-simulator.md) owns engine, editing, identity, persistence and template rules. [Design notes](docs/design-notes.md) own UI conventions; read them before extending the UI.
- [Site Messages](docs/site-messages.md) own localization rules; [game data](docs/game-data.md) owns snapshot and updater maintenance. Historical reports cannot override current guides or verified implementation.
- Avoid maintaining duplicate full contracts here. When behavior changes, update its current guide and retain historical evidence, dates, Commit SHAs and measured results.

## Engineering and data boundaries

- Use Node 24 (minimum 24.12), npm and one package-lock.json. Preserve the pinned Vue / TypeScript / Vite / Router / PrimeVue Styled Mode / @primeuix/themes / Tailwind 4 / @lucide/vue stack. Keep exact direct versions; no Pinia, SSR, parent-directory runtime dependency or deprecated @primevue/themes.
- The engine stays pure TypeScript, without Vue, Router, localization, loaders, DOM, Node filesystem APIs or raw game JSON. Preserve AG/SPD/AV mathematics, event ordering, effect phases, lifecycle, atomic commit and Trace semantics; round only in presentation.
- Use normalized tool-owned snapshots in UI. Raw source parsing belongs only to an explicitly authorized updater; normal install / dev / test / build cannot require sibling repositories or silently download / regenerate data.
- Keep necessary snapshots, assets and provenance Manifest trackable; ignore only caches, staging and backup output. Names, IDs and images require checked sources. Presets do not infer mechanics from skill descriptions.
- Retain source notices. Do not equate software / index licenses with game-artwork redistribution rights or decide a project license without authorization.
- The maintainer has selected MIT for project-owned or otherwise MIT-authorizable code and documentation; see [LICENSE](LICENSE). Preserve independent third-party terms. Do not change the project license or relicense third-party content without authorization; license closeout does not authorize publication or deployment changes.

## Stable state and interaction constraints

- Keep one committed PlannerDocument; derived results, previews, diagnostics and queue views are not a second business configuration. Plan edits replay; name-only edits do not. Apply setup as one explicit draft commit.
- Preserve operation IDs, Actor IDs on speed edits and stable Anchors. Character replacement gets a new ID; retain orphan references for repair, never rebind by array index. Operation draft switching / cancel, setup draft retention and queueCursor / Inspector separation follow the current architecture.
- Target eligibility uses engine targeting.ts and previewOperationState at the selected anchor, phase and position. Never substitute the final participant catalog. Preserve failure recovery through existing replay APIs and complete target access.
- Keep initial roster limits separate from dynamic creation. Preserve ordinary preAction / postAction defaults and legacy semantics, beforeEffects current-queue projection, independent cycle boundaries and Aha identity / speed / lifecycle rules in the architecture.
- Version 7 files, local saves and templates share document-file.ts. Retain strict Version 1/2/3/4/5/6 migration, unknown-field checks, collision safety and resource diagnostics. Never persist results, Trace, navigation or drafts, or silently recompute saved Version 3 identity facts.
- Restore storage before the commit watcher. Preserve corrupt / unsupported bytes, pause on external changes, compare storage baselines and require explicit current-token overwrite. Export / teardown never rewrite storage.
- Templates must be user-reviewed ordinary exported JSON. Keep the production catalog empty until reviewed content exists; never generate teams from screenshots or skill descriptions.

## UI and Site Messages

- Centralize theme Token in src/theme/preset.ts. Keep .app-dark on html, shared PrimeVue / Tailwind selectors and layer order. Basic controls use PrimeVue; avoid broad .p-* overrides or full icon registration.
- Natural-language UI, Tooltip, ARIA and validation messages belong in zh-CN.json / en.json. Models return semantic descriptors; never persist automatic names, translate user names or use translated text as identity. Keep stable product names separate from workspace stages.
- Preserve committed action-change markers, actual-time speed Tags, camp identity, target portraits, all four operation toolbar buttons, localized tooltips and real-input error associations. Presentation must not change queue mathematics or imply unavailable tools are links.

## Verification and reporting

- UI visuals and real browser interaction are manually accepted by the user. Codex defaults to no Computer Use, Playwright, Puppeteer, browser screenshots or other real-browser automation; install no browser tooling and do not make ordinary tests launch browsers.
- Only an explicit user request for a particular browser-automation acceptance permits an exception. Provide a short local manual checklist when relevant.
- Use minimal meaningful checks from [development.md](docs/development.md): deterministic mechanism tests, foundation boundaries and 11 migration cases; test message keys / parameters rather than mutable copy. Template changes also run template validation and document tests.
- Baseline generation / isolation probes belong in the system temporary directory; project caches may use .cache. Never execute the old site's Vite plugins or build hooks.
- Documentation-only changes check edited Markdown, links, anchors, content and git diff --check; no unnecessary data updater, benchmarks, full tests, production build or browser acceptance. Format only edited documents, not historical reports or license texts.
- Distinguish code-reviewed conclusions, actually executed checks, user-reported acceptance and pending verification. Do not present a probe or historical measurement as current full application acceptance.
- Finish by comparing the recorded branch, HEAD and worktree status of all three source repositories, inspecting this repository's changed files and Git status, and reporting remaining limitations.
