# Current architecture

card-skill is a local, source-aware visual production pipeline for AI agents. The agent owns evidence and semantic judgment; the Node.js runtime owns contracts, deterministic rendering, checks, hashes, and publication.

```text
content / normalized adapter
        |
        v
SourceBrief (host-only)
  evidence inventory + freshness + rights
        |
        v
Visual Job v3
  source_units[].evidence
  decision
  outputs[].artifacts[].visual_plan
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
host Agent inspects every real PNG -> Visual Review
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
| Source brief | host-only evidence inventory, freshness, rights, archetype | source adapter / host Agent |
| Evidence | `source_units[].evidence` in Visual Job v3 | host Agent, runtime-validated |
| Artifact plan | `outputs[].artifacts[]` in Visual Job v3 | host Agent, constrained by evidence and taxonomy |
| CardSpec | `outputs[].render_contract` | mode schema and renderer |
| Color layer | `decision.tone`, contract `tone` / `editorial_tone`, optional exact `design`; colors only | Kenny Style palette resolver |
| Layout | artifact `visual_plan.layout_strategy`, then selected renderer | Agent intent + renderer implementation |
| Renderer | `scripts/renderers/*` selected by `card.js` | deterministic Node runtime |
| Validator | `scripts/lib/schema.js`, `scripts/lib/visual-job.js`, `scripts/lib/visual-review.js` | runtime contract boundary |
| EvalCase | `evals/agent-cases.json` plus assertion and isolated render runners | CardBench |

V3 separates a renderer output from its produced artifacts. One poster output can own three cards, while each PNG has its own evidence references, role, filename, transformation, and Visual Plan. The runtime requires one current primary evidence unit per artifact and exact artifact-count parity with the render contract. V1/V2 remain accepted for compatibility.

## Routing and modes

Source routing precedes mode selection. A source adapter such as `source-open-source-tool.md` chooses evidence responsibilities and an adaptive artifact count; it never adds a renderer or bypasses taxonomy. `scripts/lib/mode-selector.js` then maps publish target, content type, and argument structure to one of the existing nine modes. A user may explicitly override a mode; an Agent may not silently do so.

Stable modes are `big`, `long`, `whiteboard`, `poster`, `article-diagram`, and cover-form `editorial-image`. Studio modes are `infograph`, `comic`, `sketchnote`, and composition-required `editorial-image`. Studio contracts still use the same schema, capture, checker, receipt, review, and publication chain.

## Rendering, validation, and publication

`scripts/card.js` remains the low-level renderer and accepts an existing mode contract. `scripts/render-job.mjs` validates a Visual Job, renders every output in an OS temporary directory, and produces one receipt per PNG. Visual Job v2 and v3 candidates preserve the sealed Visual Job, exact checked HTML, per-artifact contract hashes, and a manifest that closes the expected output/artifact set. Both must use `--candidate`; once the candidate-directory digest has been approved outside that directory, their artifacts cannot be mistaken for reviewed final output or downgraded to a legacy partial candidate without invalidating that approval. Legacy v1 candidates remain an explicit compatibility path, but publication additionally requires `--allow-legacy-v1` so a stripped v2/v3 candidate cannot silently enter that path before approval.

`scripts/check-output.mjs` rejects machine-detectable defects such as overflow, clipping, missing images, unsafe resources, unresolved placeholders, and undersized text. It does not score composition. The host Agent inspects each checked PNG, writes a hash-bound Visual Review, and records the reviewed candidate-directory digest outside that directory. `scripts/publish-reviewed-job.mjs` requires that external approval digest, copies the bounded regular-file candidate set into a private stable snapshot, then re-runs `check-output` and a trusted screenshot under a response-header CSP that blocks scripts and frames before candidate markup is parsed, with hard timeouts and capture/PNG byte and pixel budgets. Publication requires the recaptured PNG to match the reviewed candidate bytes, then publishes only passing PNG/receipt/review triples as one transaction. Checked HTML and the candidate manifest remain internal and are not final artifacts.

Poster evidence media remains offline and bounded. Its structured contract names an explicit local PNG/JPEG/WebP source; before Chromium starts, `card.js` copies the bytes through a private snapshot capped both per file and across the poster, validates the container, dimensions, decoded-pixel budget, and SHA-256, then embeds that sealed snapshot in the checked HTML. Optional logos use the same private-snapshot pattern with a smaller budget. Original media and logo paths are never browser allow-list entries. Short process evidence is renderer-owned structured HTML with two to five steps, not caller-supplied markup or a diagram screenshot embedded inside another card.

Renderers never fetch repository pages or provider content. Source adapters normalize upstream material before the Visual Job, and unclear rights or freshness keep media out of public outputs.

## Evaluation

`npm test` runs deterministic L0 contract and regression checks without a model. `npm run eval:fresh` evaluates fresh planning cases, including evidence-first open-source routing. `npm run eval:cardbench` adds forced-revision cases, real PNG Critic calls, one-revision enforcement, and Content/Visual/Agent scores. Reports keep unmeasured levels as `null`; Agent critique is not presented as maintainer or real-user evidence.
