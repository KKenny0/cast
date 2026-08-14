# Visual Review v1

Visual Review is the subjective gate after a candidate has passed `check-output`. The host Agent must inspect the actual PNG. Renderers do not call a model, hold provider credentials, or assign aesthetic scores.

Each review binds to the Visual Job/output identity, artifact index, render-contract SHA-256, and PNG SHA-256. Visual Job v2 and v3 candidates also copy `visual_job_sha256`, `artifact_plan_sha256`, and `artifact_contract_sha256` from the receipt so the sealed job and the specific rendered card survive publication; v3 additionally gives those hashes evidence responsibility semantics. Scores are integers from 0 to 5:

- `message_clarity`
- `visual_hierarchy`
- `cognitive_load` (5 means easy to process)
- `style_consistency`
- `metaphor_quality`, required when `metaphor_required` is `true`; otherwise `null`

`overall_score` is the applicable arithmetic mean multiplied by two, rounded to one decimal. A review passes only at 8.0 or above with no blocker. Attempt 0 may return `revise`; attempt 1 must return `pass` or `fail`.

Issues use a safe type slug, `blocker` / `major` / `minor` severity, and a concrete suggestion. Mechanical defects remain the responsibility of `check-output`; the review focuses on meaning, focal hierarchy, load, visual weight, metaphor specificity, and Quiet Paper consistency.

Review one receipt artifact at a time. Copy `metaphor_required` from the renderer receipt; this prevents a planned metaphor from being silently excluded from the score. When one render contract emits multiple PNGs, `artifact_index` identifies the attached card; sibling cards are reviewed separately and must not be treated as missing from the current PNG.

Workflow:

```text
render-job --candidate -> inspect PNG -> review
  pass   -> hash-reviewed-candidate -> approve hash -> publish-reviewed-job --expected-candidate-sha256
  revise -> edit only visual_plan + render_contract -> rerender/review once
  fail   -> do not publish a success artifact
```
