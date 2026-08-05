# Current architecture

card-skill is a local, source-aware visual production pipeline for AI agents. The agent owns semantic judgment; the Node.js runtime owns contracts, deterministic rendering, checks, hashes, and publication.

```text
content / normalized adapter
        |
        v
Visual Job v2
  source_units[]
  decision
  outputs[].visual_plan
  outputs[].render_contract
        |
        v
runtime validation + visual taxonomy
        |
        v
render-job --candidate
        |
        v
card.js -> mode renderer -> temporary HTML -> Playwright PNG -> check-output
        |
        v
candidate PNG + receipt + checked HTML + closed-set manifest
        |
        v
host Agent inspects the real PNG -> Visual Review
        | pass                         | revise once
        v                              +----> new plan + contract -> full render/check/review
publish-reviewed-job
        |
        v
PNG + receipt + review
```

## Inputs and core objects

| Concept | Runtime representation | Owner |
|---|---|---|
| Content | `source` and bounded `source_units[]` | source adapter / host Agent |
| Visual Plan | `outputs[].visual_plan` in Visual Job v2 | host Agent, constrained by taxonomy |
| CardSpec | existing `outputs[].render_contract` | mode schema and renderer |
| Theme | `decision.tone`, contract `tone` / `editorial_tone`, optional exact `design` | design resolver |
| Layout | `visual_plan.layout_strategy`, then the selected mode renderer | Agent intent + renderer implementation |
| Renderer | `scripts/renderers/*` selected by `card.js` | deterministic Node runtime |
| Validator | `scripts/lib/schema.js`, `scripts/lib/visual-job.js`, `scripts/lib/visual-review.js` | runtime contract boundary |
| EvalCase | `evals/agent-cases.json` plus assertion and isolated render runners | CardBench |

## Routing and modes

The public publishing task is resolved before mode selection. `scripts/lib/mode-selector.js` maps publish target, content type, and argument structure to one of the existing nine modes. A user may explicitly override a mode; an Agent may not silently do so.

Stable modes are `big`, `long`, `whiteboard`, `poster`, `article-diagram`, and cover-form `editorial-image`. Studio modes are `infograph`, `comic`, `sketchnote`, and composition-required `editorial-image`. Studio contracts still use the same schema, capture, checker, receipt, review, and publication chain.

## Rendering, validation, and publication

`scripts/card.js` remains the low-level renderer and accepts an existing mode contract. `scripts/render-job.mjs` validates a Visual Job, renders every output in an OS temporary directory, and produces PNG receipts. Candidate renders also preserve the exact checked HTML and a manifest that closes the expected output/artifact set. Visual Job v2 must use `--candidate`, so its artifacts cannot be mistaken for reviewed final output.

`scripts/check-output.mjs` rejects machine-detectable defects such as overflow, clipping, missing images, unsafe resources, unresolved placeholders, and undersized text. It does not score composition. The host Agent inspects each checked PNG and writes a hash-bound Visual Review. `scripts/publish-reviewed-job.mjs` requires the complete manifest set, re-runs `check-output` against the preserved HTML and PNG, then publishes only passing, matching PNG/receipt/review triples as one transaction. Checked HTML and the candidate manifest remain internal and are not final artifacts.

## Evaluation

`npm test` runs deterministic L0 contract and regression checks without a model. `npm run eval:fresh` evaluates 16 fresh planning cases at L1. `npm run eval:cardbench` adds four forced-revision cases, real PNG Critic calls, one-revision enforcement, and Content/Visual/Agent scores. Reports keep unmeasured levels as `null`; Agent critique is not presented as maintainer or real-user evidence.
