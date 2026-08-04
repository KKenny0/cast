# Repository instructions

## Working principles

- Use PowerShell 7 (`pwsh`) for PowerShell commands.
- Start from the actual input, contract, renderer, and output artifact before changing behavior.
- Preserve user-owned untracked work. Do not stage, rewrite, or delete `HANDOFF.md` or `prototypes/` unless the user explicitly asks.

## Source of truth and packaged mirror

- The repository root is the source of truth for `SKILL.md`, `README.md`, `README.zh-CN.md`, `VERSION`, `package.json`, `assets/`, `evals/`, `references/`, `schemas/`, and `scripts/`.
- `README.md` is the primary English product README. Keep `README.zh-CN.md` aligned when product docs change.
- `plugins/card-skill/skills/card-skill/` is a generated installable mirror. Do not edit it independently.
- After changing any packaged source, run `npm run package-skill`, then inspect the resulting mirror diff.
- Keep `VERSION`, the root and packaged `package.json`, the root and packaged `SKILL.md` frontmatter, `plugins/card-skill/.codex-plugin/plugin.json`, and the version in `.claude-plugin/marketplace.json` synchronized.

## Contract boundaries

- Codex inline preview is a decision surface. It may select a render contract, but it must not bypass the normal schema, renderer, screenshot, `check-output`, and PNG inspection chain.
- `editorial-image.composition_required: true` means the selected direction cannot be delivered by the default scaffold. Before rendering, provide both `content_html` and `custom_css`; validation and the renderer must reject an incomplete contract.
- `scripts/lib/schema.js` owns runtime input validation. Files in `schemas/` document the public structured contract and must stay aligned with runtime validation.
- Renderers own deterministic HTML generation. `scripts/check-output.mjs` owns machine-checkable output defects; subjective composition quality remains a visual inspection responsibility.
- Keep provider authentication and upstream semantics out of card renderers. Source adapters normalize external content before it reaches a render contract.

## Hotspots

- `scripts/renderers/article-diagram.js` owns article-diagram layout and should be changed together with its fixtures in `scripts/validate.mjs`.
- `scripts/check-output.mjs` is a shared output gate. Changes require its self-tests plus the full suite.
- Root and packaged copies of these files must remain byte-identical after packaging.

## Verification

For a behavior, contract, renderer, schema, or skill-instruction change, run:

```powershell
npm run package-skill
npm test
npm run smoke
git diff --check
```

Before committing, verify that the staged set contains only the intended root sources, generated package mirror, metadata, and project instructions.
