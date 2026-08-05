# CardBench and fresh-context evaluation protocol

`npm test` proves L0 only: fixture definitions, Visual Job validation, and output checks work. It does not call a model.

Before a minor release, run `npm run eval:fresh -- --report evals/fresh-context-results.json`. The runner copies the generated package mirror into a temporary install root, runs `npm ci` there, verifies Playwright resolves inside that isolated root, and prepares the declared runtime. It then starts one ephemeral, read-only Codex process per case from that install, with no prior conversation or user configuration. It validates each produced Visual Job with `evals/check-job-assertions.mjs`, renders it through the installed `scripts/render-job.mjs`, and requires real passing receipts.

`eval:fresh` runs the 16 planning cases at L1 and does not invoke a visual model. `npm run eval:cardbench -- --report evals/cardbench-results.json` runs all 20 cases. It attaches actual checked PNGs to independent ephemeral Critic calls, enforces Visual Review hashes and the 8.0 threshold, and exercises four forced-revision cases. A failed first review may revise only `visual_plan` and `render_contract`, then rerender and review once.

## Host orchestration

Do not run CardBench in the main interactive context. Delegate every `npm run eval:cardbench` invocation to the host's low-cost independent execution facility, such as a subagent, background task, or isolated session, including `--list-cases`, single, tail, and full runs. Choose the lowest-cost configuration that can perform real rendering and image review. The delegated worker must use PowerShell 7, run cases serially, avoid code changes and caches, wait for completion, validate the requested scope/report fields, and return only progress plus the result or first failure. The main context may inspect the finished report and package the mirror, but must not own the CardBench process. Do not parallelize case or Critic model calls. If the host has no independent execution facility, disclose the expected cost and obtain user confirmation before running CardBench interactively.

During development, give the delegated worker one of these commands instead of repeatedly spending the full 20-case gate:

```powershell
# Inspect the ordered case set without installing dependencies or calling a model.
npm run eval:cardbench -- --list-cases

# Rerun only the failed case.
npm run eval:cardbench -- --case revise-flat-hierarchy `
  --report evals/cardbench-revise-flat-hierarchy.json

# Then verify the failed point and every later case.
npm run eval:cardbench -- --from revise-flat-hierarchy `
  --report evals/cardbench-tail.json

# Run this complete gate once before merge or release.
npm run eval:cardbench -- --report evals/cardbench-results.json
```

`--case` and `--from` are mutually exclusive. Revision cases require `--cardbench`. Reports expose `scope.kind`, selected/total counts, completeness, and ordered case IDs. Single and tail runs are development feedback only and cannot overwrite `evals/cardbench-results.json`; only a complete run is release evidence.

Required source terms must survive into renderer-consumed semantic fields, not merely source excerpts, ignored fields, CSS, HTML comments, HTML attributes, or deterministically hidden HTML subtrees (`hidden`, inline `display:none` / `visibility:hidden`, `template`, `noscript`, `head`, `style`, `script`). Split and series cases bind source groups to distinct outputs/cards and may require those groups to remain mutually exclusive rather than repeating the whole source everywhere. This is still a static L1 text-node approximation, not proof of computed CSS visibility or visual meaning. A maintainer must inspect representative PNGs before marking L2 publication judgment true. L3 requires real user publication or reuse evidence; absence of L2/L3 must remain explicit in the report.

CardBench reports Content, Visual, and Agent metrics on a 0–10 scale. Unmeasured metrics such as abstraction and planning quality stay `null`; a category score is `null` while any of its metrics is unmeasured, and Overall remains `null` until all three categories are complete. Agent Critic scores are labeled `L2-agent-critic`; they never set `l2_maintainer_judgment` or L3 evidence.
