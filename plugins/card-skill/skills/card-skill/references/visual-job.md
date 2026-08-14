# Visual Job v1/v2/v3

Visual Job is card-skill's audit contract between source understanding and rendering. It wraps existing mode render contracts; it does not replace them or alter direct `scripts/card.js --input/--stdin` use.

Versions 1 and 2 remain accepted for compatibility. New natural-language tasks use version 3. V3 separates a renderer invocation (`outputs[]`) from every PNG it produces (`outputs[].artifacts[]`). This matters for poster series and split diagrams: evidence, transformation, Visual Plan, filename, and editorial role now belong to the individual artifact instead of being ambiguously attached to the whole renderer call.

## V3 shape

```json
{
  "schema_version": 3,
  "job_id": "tool-cli-route",
  "publish_target": "social-series",
  "source": { "kind": "normalized-adapter", "language": "en" },
  "source_units": [
    {
      "id": "input",
      "excerpt": "Repository files are the input.",
      "evidence": { "kind": "claim", "strength": "primary", "freshness": "current" }
    },
    {
      "id": "command",
      "excerpt": "npx example-tool@latest",
      "evidence": { "kind": "command", "strength": "primary", "freshness": "current" }
    },
    {
      "id": "output",
      "excerpt": "One inspectable artifact is produced.",
      "evidence": { "kind": "output", "strength": "primary", "freshness": "current" }
    }
  ],
  "decision": {
    "mode": "poster",
    "tier": "stable",
    "tone": "technical",
    "selection_source": "taxonomy",
    "reason": "Three independent evidence units form one CLI task-flow series."
  },
  "outputs": [{
    "id": "cli-series",
    "artifacts": [
      {
        "artifact_index": 1,
        "id": "input-card",
        "basename": "tool-1.png",
        "role": "problem",
        "source_unit_ids": ["input"],
        "transformation": "compress",
        "visual_plan": {
          "core_message": "Start with repository files.",
          "content_type": "mechanism",
          "argument_structure": "sequence",
          "visual_metaphor": null,
          "layout_strategy": "input-led documentary card",
          "visual_hierarchy": ["input proof", "scope"],
          "avoid_patterns": ["generic hero", "invented metric"]
        }
      },
      {
        "artifact_index": 2,
        "id": "command-card",
        "basename": "tool-2.png",
        "role": "command",
        "source_unit_ids": ["command"],
        "transformation": "preserve",
        "visual_plan": {
          "core_message": "Run the documented command.",
          "content_type": "mechanism",
          "argument_structure": "sequence",
          "visual_metaphor": null,
          "layout_strategy": "command-led documentary card",
          "visual_hierarchy": ["exact command", "control"],
          "avoid_patterns": ["rewritten command", "terminal decoration"]
        }
      },
      {
        "artifact_index": 3,
        "id": "output-card",
        "basename": "tool-3.png",
        "role": "output",
        "source_unit_ids": ["output"],
        "transformation": "compress",
        "visual_plan": {
          "core_message": "Inspect the generated artifact.",
          "content_type": "mechanism",
          "argument_structure": "sequence",
          "visual_metaphor": null,
          "layout_strategy": "output-led documentary card",
          "visual_hierarchy": ["output proof", "use"],
          "avoid_patterns": ["stale screenshot", "testimonial"]
        }
      }
    ],
    "render_contract": {
      "mode": "poster",
      "tone": "technical",
      "title": "From repository to artifact",
      "cards": [
        { "body": [{ "type": "heading", "text": "Known input" }] },
        { "body": [
          { "type": "heading", "text": "Exact command" },
          { "type": "paragraph", "text": "npx example-tool@latest" }
        ] },
        { "body": [{ "type": "heading", "text": "Inspectable output" }] }
      ]
    }
  }]
}
```

`artifact_index` is one-based and follows renderer order. Its count must equal the contract's deterministic artifact count: poster cards, split article diagrams, or one for other contracts. Every V3 artifact must reference at least one source unit whose evidence is both `primary` and `current`. `stale`, `unknown`, or `unusable` evidence may remain in the inventory for an auditable rejection, but cannot carry an artifact.

Evidence kinds are `claim`, `quote`, `command`, `interface`, `output`, `benchmark`, `architecture`, `case`, and `hero`. `strength` is `primary`, `supporting`, or `unusable`; `freshness` is `current`, `stale`, or `unknown`. A reason is mandatory for unusable or non-current evidence.

Each artifact must claim an independent current primary unit. Runtime identity prefers a media SHA-256 digest and also deduplicates normalized textual evidence by evidence kind plus NFC-normalized excerpt with invisible format characters removed. Renaming an ID, splitting one screenshot into multiple source units, or attaching different arbitrary digests to identical text does not create new evidence.

`command` and `quote` units require a non-empty `excerpt`, `transformation: "preserve"`, and an exact match in text that the specific artifact deterministically renders. Non-visible IDs, relation metadata, hidden HTML, series text shown on another card, and suppressed diagram labels do not count. Exact evidence is limited to `long` and `poster`; Studio CSS, diagram layout, Big accent markup, and Whiteboard inline markup may interpret, hide, normalize, or truncate source characters.

`schemas/visual-job.json` documents the public shape. `scripts/lib/visual-job.js` is the runtime authority, and `scripts/lib/mode-selector.js` owns taxonomy. `decision.mode` is the single output mode or `mixed`; it must equal the aggregate of actual contracts. Stable and Studio outputs cannot be mixed in one job.

Use `tone` for `reflective`, `sharp`, `warm`, or `technical`; these are not design names. An exact `design` remains an explicit override from `references/design-index.md`.

For source-aware tasks, first read `references/source-material.md`. For open-source tools, also read `references/source-open-source-tool.md`. Visible copy must describe source meaning, never artifact labels such as `BLOG HERO`, mode names, or planning taxonomy unless those words occur in the source.

Visual Job v2 and v3 render only as candidates:

```bash
node scripts/render-job.mjs --input visual-job.json --output-dir <candidate-dir> --candidate --json
```

After the host Agent inspects every actual PNG and writes matching `*.review.json` files, publish the sealed Visual Job v2/v3 candidate with:

```bash
approved_sha=$(node scripts/hash-reviewed-candidate.mjs --candidate-dir <candidate-dir>)
node scripts/publish-reviewed-job.mjs --candidate-dir <candidate-dir> --output-dir <final-dir> --expected-candidate-sha256 "$approved_sha" --json
```

Candidate rendering creates a closed-set `candidate-manifest.json` plus one preserved `*.checked.html` per PNG. The digest is recorded after visual review and kept outside the candidate directory, so internally consistent replacement after approval is rejected. The publisher also rejects missing or extra candidate files, mixed identities, failed reviews, scores below 8.0, blockers, mismatched identities or hashes, duplicate targets, and unreviewed artifacts. It snapshots the bounded candidate file set into a private directory, reruns `check-output`, and performs a trusted recapture of the preserved HTML under a response-header CSP that blocks scripts, frames, objects, connections, and unsealed resources before markup is parsed; the recaptured PNG must byte-match the reviewed candidate. Capture dimensions, DPR, full-page height, PNG bytes, and decoded pixels are bounded. Only PNG, receipt, and review are published.

Legacy Visual Job v1 candidates remain publishable only with the additional `--allow-legacy-v1` flag. Treat that flag as an explicit approval of the legacy provenance; never add it to a v2/v3 workflow or use it to rescue a candidate whose sealed Visual Job snapshot disappeared.

A Visual Job may contain at most 20 rendered artifacts in aggregate, including poster pages and split diagram views. Unique poster media across every output also shares one 32 MiB job-wide budget; reusing the same canonical file does not spend the budget twice. Reviewed publication has a ten-minute job deadline. These bounds keep embedded checked HTML inside the closed candidate budget and prevent a large legacy batch from amplifying browser launches while leaving ordinary v1/v2 jobs and the adaptive 1–4 artifact route intact.

For v3, the candidate set also seals a temporary Visual Job snapshot. Publication derives the complete expected artifact set from that snapshot and requires matching job/artifact-plan hashes in every receipt and review. The snapshot is verification input only and is not published, so source excerpts do not become delivery artifacts.
