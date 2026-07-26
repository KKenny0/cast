# Visual Job v1

Visual Job is Card Skill's internal audit contract between routing and rendering. It does not replace an existing render contract or alter `scripts/card.js --input/--stdin`.

The job retains a bounded source inventory, the routing decision, and one to twenty outputs. Each output names its source units, transformation, PNG basename, and an existing validated render contract. The runner stages every render in the OS temp directory and publishes no PNG or receipt until every output has passed `check-output`.

Use only `stable` for existing CLI-reconstructible contracts. Use `studio` for a formal composition requiring `content_html` and `custom_css`; Studio still enters capture and checking but requires human visual review.

Receipts contain hashes, resolved rendering metadata, dimensions, and checker result codes. They intentionally exclude original source text, absolute paths, credentials, and provider/account identifiers.

## Canonical shape

Do not rename or wrap these fields. `schemas/visual-job.json` is the public structured contract and `scripts/lib/visual-job.js` is the runtime authority.

```json
{
  "schema_version": 1,
  "job_id": "single-claim",
  "publish_target": "social-single",
  "source": {
    "kind": "pasted-text",
    "language": "zh",
    "label": "用户提供的一句话"
  },
  "source_units": [
    {
      "id": "claim",
      "excerpt": "能重建，才算能验证。"
    }
  ],
  "decision": {
    "mode": "big",
    "tier": "stable",
    "tone": "sharp",
    "reason": "单一主张适合单一大字阅读面。"
  },
  "outputs": [
    {
      "id": "claim-card",
      "basename": "claim.png",
      "source_unit_ids": ["claim"],
      "transformation": "preserve",
      "render_contract": {
        "mode": "big",
        "tone": "sharp",
        "phrase": "能重建<br>才算能验证"
      }
    }
  ]
}
```

For `big`, make short Chinese line breaks explicit with `<br>` and keep lines semantically balanced. Remove display punctuation at the break and at the final line; do not produce forms such as `，<br>` or a trailing `。`.

For a `poster` series, one Visual Job output may contain multiple `cards`; the renderer publishes one PNG and receipt per card. Ordinary poster cards do not accept a top-level `card.title`; put each card heading in its `body` as `{ "type": "heading", "text": "..." }`. A top-level `card.title` is reserved for `variant: "reading-notes"`.

For `article-diagram` chapter splits, use one Visual Job output per independent source unit rather than collapsing unrelated sections. A compression-pack `formula` is not a natural-language sentence: use short 2-6 CJK-character terms and an explicit relation such as `输入契约 = 允许边界` or `事实 + 选择 = 动作`. Put the complete claim in `sentence`; never use verbose formula terms such as “系统实际做了什么”.

Use `tone` for `reflective`, `sharp`, `warm`, or `technical`; those are not design names. Omit `design` unless choosing an exact name from `references/design-index.md`. For compression-pack `article-diagram`, omit `render_plan` unless it is exactly `auto`, `summary`, `structure`, or `split`; `formula` is content, not a render-plan value.

Visible copy must describe the source, not the output format or destination. Never put labels such as `BLOG HERO`, `WECHAT COVER`, `EDITORIAL IMAGE`, `SOCIAL CARD`, or mode names into `kicker`, titles, panels, or captions unless those words are present in the source itself.

Studio custom CSS is checked mechanically, not merely interpreted as art direction:

- compose inside the provided host with `width: 100%` and `height: 100%`; do not hard-code the full PNG dimensions;
- keep every visible element inside the host—no negative `top/left`, oversized beams, or transforms that cross an edge;
- use an allowed primary font from the mode reference;
- visible body text is at least 36px; label/meta text must use a label-like class and be at least 24px;
- use hairlines, flat layering, and contrast instead of drop shadows; omit `box-shadow` unless it is extremely subtle and has already been checked.
