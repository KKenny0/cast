# Mode: article-diagram

This mode creates in-article compression formula cards. Its default job is not to pick a diagram family; its job is to compress one article section into three stable artifacts:

1. `formula` - the core relation, invariant, or transformation.
2. `sentence` - one human-readable takeaway.
3. `structure` - the small supporting structure behind the formula, kept as semantic input and future structure-view material.

Use it when the image must help the reader carry away the article's logic after reading a section. It is not an editorial cover, not a mood image, and not a whole-article summary card.

## Core Belief

正文解释图的工作不是装饰文章，而是把理解压缩成可带走的结构。

The useful question is no longer "which family fits?" The useful question is:

- What is the section's formula?
- What is the one sentence the reader should remember?
- What structure makes that sentence true?

If the image only sets mood, use `editorial-image`. If it compresses a whole article into many points, use `poster`, `whiteboard`, or a Studio tier mode instead.

## Default Output

Default `render_plan` is `auto`, which renders one formula card:

| Region | Contains | Purpose |
|---|---|---|
| Main field | `formula` | The compressed relation the reader should carry away |
| Footnote line | `sentence` | The human-readable judgment that explains why the formula matters |

The default card does not render title, page number, template label, top-right summary copy, bottom caption, or the supporting `structure`.

Use `render_plan: "summary"` as an explicit alias for the default formula card. Use `render_plan: "structure"` or `render_plan: "split"` only when the user explicitly asks to experiment with a supporting structure view. The structure view is not the default product surface.

## Routing

Use `article-diagram` for:

- `正文解释图`
- `关系图`
- `流程图`
- `边界图`
- `权限边界`
- `安全边界`
- `trust boundary`
- `process diagram`
- `concept map`
- article-section compression

Keep `editorial-image` for:

- `公众号头图`
- `博客封面`
- `文章封面`
- mood illustration
- visual metaphor
- quiet section image that does not need to explain structure

Ambiguous `正文配图` requests should be routed by intent:

- If the user wants mood, rhythm, metaphor, or a visual pause -> `editorial-image`.
- If the user wants concepts, steps, boxes, arrows, nested areas, permissions, labels, or a compressed argument -> `article-diagram`.

## Whole Article Workflow

When the input is a full article, do not compress the whole article into one card. First find the sections that deserve compression, then render one independent compression pack for each qualifying section.

### Step 1: Identify Section Groups

Scan the article for headings and semantic turns:

- `h2` / `h3` headings
- standalone short heading-like lines
- numbered sections
- clear topic shifts even when headings are missing
- opening introduction and closing conclusion as their own groups

Each section group = one section title or inferred topic + its following paragraphs, lists, quotes, examples, or local explanation, until the next peer or higher-level section begins.

### Step 2: Decide Which Sections Are Worth Compressing

A section is worth an `article-diagram` only when compression would lower understanding cost. Draw it when the section contains at least one of these:

- a relationship between 2-6 concepts
- a sequence, loop, review path, handoff, pipeline, or lifecycle
- an inside/outside boundary, trust boundary, permission boundary, or safety boundary
- a cause-and-effect chain
- a system structure with roles, layers, or controlled resources
- a contrast where the distinction is spatial, procedural, or structural
- a thesis that can be expressed as a compact formula plus support structure

Skip the section when it is mainly:

- setup, background, anecdote, or mood
- a thesis statement with no internal structure
- a conclusion that only restates the article
- a list of claims without visible relationships
- a passage better served by `editorial-image`, `poster`, or `whiteboard`

Do not create one compression pack per heading mechanically. A section must earn it by having structure.

### Step 3: Produce One Compression Pack Per Qualifying Section

For every qualifying section:

1. Keep the section boundary intact. Do not mix content from different sections.
2. Extract the smallest useful structure from that section.
3. Write the formula first.
4. Write the one sentence second.
5. Build the supporting structure with 2-6 nodes and up to 6 relations, but treat it as semantic support unless a structure view is explicitly requested.
6. Preserve article order in the output sequence.

If one section contains multiple possible structures, choose the one that best helps the reader understand that section in context. Only create multiple packs for the same section when the user explicitly asks for a fuller set.

### Step 4: Batch Output Rules

When multiple sections qualify:

- render all qualifying sections, not only the strongest one
- use filenames that preserve article order and section identity, such as `01-{section-slug}.png`; add `-structure` suffixes only for explicit structure/split output
- keep each formula card readable as a standalone in-article image
- report how many compression packs were produced and which section each one belongs to

If no section qualifies, do not force a weak diagram. Tell the user the article has no section that clearly benefits from structural compression, then recommend the closest better mode.

## Field Contract

Default shape:

```json
{
  "mode": "article-diagram",
  "title": "Short relationship title",
  "subtitle": "Optional section context",
  "formula": "Core relation = force A + force B - constraint C",
  "sentence": "One hard sentence the reader should remember.",
  "structure": {
    "nodes": [
      { "id": "a", "label": "Visible label", "note": "Optional short note" },
      { "id": "b", "label": "Visible label" }
    ],
    "relations": [
      { "from": "a", "to": "b", "label": "Optional relation" }
    ]
  },
  "render_plan": "auto",
  "caption": "Optional one-sentence interpretation",
  "design": "stripe"
}
```

Rules:

- `formula` is visible. It should express a relationship, not repeat the title.
- `sentence` is visible. It should make a judgment, not summarize mechanically.
- `structure.nodes[].id` is an internal anchor; it should not be visible.
- `structure.nodes[].label` is visible. Keep it short.
- `structure.nodes[].note` is optional and must be shorter than the label in visual weight.
- `structure.relations[]` must point to known structure node ids.
- `structure.relations[].label` is optional annotation. Use it only when the relation word changes the reader's understanding.
- `render_plan` may be `auto`, `split`, `summary`, or `structure`. `auto` and `summary` render the formula card.
- `aspect` defaults to `body-2-1` for formula cards, expands to `body-3-2` when formula or sentence text is dense, and keeps `body-4-3` for legacy/tall diagram cases.

Language contract:

- Visible text follows the source article and the user's request by default.
- For a Chinese article, write `title`, `subtitle`, `formula`, `sentence`, `structure.nodes[].label`, `structure.nodes[].note`, `structure.relations[].label`, and `caption` in Chinese unless the user explicitly asks for English, bilingual output, or translation.
- For an English article, keep visible text in English unless the user asks otherwise.
- Internal ids may be English slugs, but visible labels should not be translated away from the source language.
- Preserve proper nouns, product names, API names, and technical terms in the language or spelling used by the source.

## Compression Quality

### Formula

Good formulas:

- express a relation, transformation, boundary, or constraint
- make the structure visible before the reader sees the diagram
- can be read aloud without sounding like decorative math
- may use `+` and `=>` for a clean terms-to-conclusion layout; the renderer treats the left side as input terms and the right side as the compressed result

Avoid:

- vague slogans
- copied titles
- decorative symbols that add no logic
- long clauses that should be the sentence instead

### One Sentence

Good sentences:

- state the section's hard conclusion
- explain why the formula matters
- can stand alone under the article paragraph

Avoid:

- neutral summaries
- "this section discusses..."
- repeating every node in prose

### Structure

Good structures:

- contain 2-6 visible nodes
- only include relations needed to explain the formula
- prefer fewer nodes over smaller text
- can express relationship, sequence, boundary, or causal chain through the same node/relation grammar
- support formula writing first; they are not automatically rendered in the default card

Avoid:

- a full article outline disguised as a diagram
- many boxes with no visible reading path
- relation labels on every edge when the shared relation belongs in the formula

## Legacy Compatibility

The renderer still accepts legacy `family` inputs:

| Family | Use when | Hard limit |
|---|---|---|
| `concept-map` | Existing fixtures or explicit user request for concept-map | 5 nodes, 6 links |
| `process-flow` | Existing fixtures or explicit user request for process-flow | 6 steps |
| `boundary-model` | Existing fixtures or explicit user request for boundary-model | 4 zones, 6 nodes |

Do not use these families for new article compression unless the user explicitly asks for that old shape. New article-diagram work should use `formula`, `sentence`, and `structure`.

## Visual Rules

- The renderer uses a formula card by default: `formula` is the main visual field, `sentence` is the quiet explanatory footnote.
- Do not show page numbers, plate numbers, top-right summary copy, bottom caption strips, or template labels like `formula`, `one sentence`, or `structure` unless the user explicitly asks for a labeled teaching slide.
- The formula must feel like an article annotation, not a poster headline and not a dashboard tile.
- The formula card must use the same Quiet Paper grammar: warm paper, restrained ink, hairline borders, low-saturation accent, little shadow.
- Formula cards use one Editorial Equation grammar: a dominant result, a short accent rule, 1-3 semantic equation rows on one left axis, and a 1-2 line annotation.
- Layout variation comes only from measured line grouping, one of three approved type scales, and `body-2-1` / `body-3-2` aspect selection. Do not introduce ledger, proof-strip, or detached annotation variants.
- A term is indivisible. Line breaks may occur only at `=`, `+`, or `→` relationship boundaries.
- Text must not overlap borders, sentence line, caption, or footer.
- The title should describe the relationship, not say `article diagram`, `正文解释图`, `concept map`, `process flow`, or `compression pack`.
- Title and captions are semantic input but not visible in the default compression-pack render. Put essential explanatory text in `formula` and `sentence`.
- Keep text readable at thumbnail size.
- Do not add page chrome, toolbar headers, fake UI panels, or decorative frames.
- Treat the card as a paper annotation inside an article, not a SaaS dashboard.

## Auto Rescue

Compression formula cards use a real-font measure pass before final rendering. The planner enumerates readable semantic line groups, rejects candidates outside the approved density and whitespace range, then selects the lowest-scoring candidate. If no candidate fits, simplify the input first:

- shorten `formula`
- shorten `sentence`
- let the planner use `body-3-2` when three formula rows or a two-line annotation need the taller ratio
- do not lower formula terms below the approved small scale or annotations below 27px

Legacy family inputs still use the existing bounded rescue retries for label collisions, tight boundary bands, and narrow process captions.

## Known Limitations

- Very long formulas can still overpower the card. Rewrite the formula into short terms plus a short result instead of shrinking text.
- The default renderer intentionally does not solve open-ended structure diagrams. If the user needs a precise topology, use the legacy family path explicitly, a future structure-view design, or a custom Studio tier render.

## Anti-Patterns

- **Mode label leakage**: visible text like `ARTICLE DIAGRAM`, `正文解释图`, `concept map`, `process flow`, or `compression pack`.
- **Formula as slogan**: the formula is a decorative title, not a relation.
- **Sentence as summary**: the sentence restates the paragraph without a judgment.
- **Whole-article compression**: one pack tries to summarize every section of a long article.
- **Mechanical section coverage**: every heading gets a pack even when the section has no structural relationship to explain.
- **Section mixing**: one pack combines concepts from separate sections just because they all seem important.
- **Box soup**: forcing structure boxes into the default formula card.
- **Arrow soup**: forcing relations into a card that should only carry formula and sentence.
- **Old diagram drift**: the output looks like the legacy concept-map/process-flow/boundary-model renderer instead of a compression plate.
- **Fake precision**: detailed labels that imply structure the article did not establish.

## Acceptance Check

Before delivery:

- Can the formula be understood in 3 seconds?
- Does the sentence state a real judgment?
- Does the formula card avoid title, labels, captions, and diagram chrome?
- Does the supporting `structure` help write the formula without forcing a visual topology?
- For full-article input, were all worth-compressing sections rendered, and weak sections skipped?
- Does each compression pack serve exactly one section?
- Does every label name article content rather than the image format?
- Does visible text stay in the source or requested language?
- Do formula text, sentence, and optional colophon avoid accidental overlap?
- Does each image still read at thumbnail size?
- Does it stay inside Quiet Paper rather than looking like a dashboard or slide?

If any answer is no, simplify the structure before rendering.
