# Visual Job v1/v2

Visual Job is card-skill's audit contract between source understanding and rendering. It wraps existing mode render contracts; it does not replace them or alter direct `scripts/card.js --input/--stdin` use.

Version 1 remains accepted for compatibility. New natural-language tasks use version 2. V2 adds one Visual Plan per output and a taxonomy-controlled selection source. Because a mixed job can contain different ideas, the plan belongs to `outputs[]`, not to the job as a whole.

## V2 shape

```json
{
  "schema_version": 2,
  "job_id": "single-claim",
  "publish_target": "social-single",
  "source": { "kind": "pasted-text", "language": "zh" },
  "source_units": [{ "id": "claim", "excerpt": "能重建，才算能验证。" }],
  "decision": {
    "mode": "big",
    "tier": "stable",
    "tone": "sharp",
    "selection_source": "taxonomy",
    "reason": "单一主张适合单一大字阅读面。"
  },
  "outputs": [{
    "id": "claim-card",
    "basename": "claim.png",
    "source_unit_ids": ["claim"],
    "transformation": "preserve",
    "visual_plan": {
      "core_message": "能否重建决定结果是否可验证。",
      "content_type": "idea",
      "argument_structure": "single-claim",
      "visual_metaphor": null,
      "layout_strategy": "单一大字焦点",
      "visual_hierarchy": ["核心判断"],
      "avoid_patterns": ["generic AI brain", "secondary explanation"]
    },
    "render_contract": {
      "mode": "big",
      "tone": "sharp",
      "phrase": "能重建<br>才算能验证"
    }
  }]
}
```

`schemas/visual-job.json` documents the public shape. `scripts/lib/visual-job.js` is the runtime authority, and `scripts/lib/mode-selector.js` owns taxonomy. `decision.mode` is the single output mode or `mixed`; it must equal the aggregate of actual contracts. Stable and Studio outputs cannot be mixed in one job.

Use `tone` for `reflective`, `sharp`, `warm`, or `technical`; these are not design names. An exact `design` remains an explicit override from `references/design-index.md`.

For `poster`, one Visual Job output may publish several cards. For `article-diagram` chapter splits, use one output per independent source unit. Visible copy must describe source meaning, never artifact labels such as `BLOG HERO`, `WECHAT COVER`, or mode names unless those words occur in the source.

Visual Job v2 renders only as a candidate:

```bash
node scripts/render-job.mjs --input visual-job.json --output-dir <candidate-dir> --candidate --json
```

After the host Agent inspects every actual PNG and writes matching `*.review.json` files, publish with:

```bash
node scripts/publish-reviewed-job.mjs --candidate-dir <candidate-dir> --output-dir <final-dir> --json
```

Candidate rendering creates a closed-set `candidate-manifest.json` plus one preserved `*.checked.html` per PNG. The publisher rejects missing or extra candidate files, mixed identities, failed reviews, scores below 8.0, blockers, mismatched identities or hashes, duplicate targets, and unreviewed artifacts. It also reruns `check-output` on the preserved HTML and PNG instead of trusting the receipt's checker flag. Only PNG, receipt, and review are published.
