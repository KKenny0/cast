# Mode: editorial-image

This mode creates article images for long-form authors: WeChat cover images, blog hero images, concept metaphors, and quiet in-article mood illustrations.

It is not a summary-card mode. If the image explains the article point by point, it has failed. A good editorial image gives the article a visual stance: a mood, metaphor, tension, or scene that helps the reader decide how to enter the piece.

## Core Belief

An editorial image is the first visual sentence of an article.

It should answer one of these questions:

- What tension does this article care about?
- What mood should the reader enter with?
- What object, scene, or gesture can carry the article's idea without restating it?
- What image would still feel attached to this essay after the title is removed?

## Difference From Content Cards

| Dimension | Content card | Editorial image |
|-----------|--------------|-----------------|
| Job | Compress and explain | Set stance and invitation |
| Information | Direct, structured, skimmable | Indirect, metaphorical, atmospheric |
| Text amount | Medium to high | Low by default |
| Success | The idea is clear | The article feels worth entering |
| Failure | Too shallow or incomplete | Too literal, generic, or detached |

## Tier Commitments by Sub-scenario

editorial-image 不是单一稳定性承诺。它的 3 个子场景按不同 tier 对待：

| Sub-scenario | `use` | Tier | Renderer path |
|--------------|-------|------|---------------|
| 公众号封面 / 博客 hero | `cover` | Stable | CLI scaffold（kicker + title + subtitle + 确定性 `cover_motif`）足够 |
| 正文氛围插图 | `in-article` | Studio | 必须由 AI 写 `content_html` + `custom_css`；scaffold 只用于验证 |
| 概念隐喻图 | `metaphor` | Studio | 必须由 AI 写 `content_html` + `custom_css`；scaffold 不应作为最终产出 |

判断规则：如果 scaffold 拿掉 `content_html` 也能撑住这张图，说明是 Stable 子场景；否则是 Studio 子场景。`use=cover` 默认 Stable，`use=in-article` / `metaphor` 默认 Studio。

## Supported Outputs

### 1. WeChat / Blog Cover

Use when the user asks for:

- `公众号头图`
- `博客封面`
- `文章封面图`
- `cover image for this essay`
- `blog hero image`

Default shape: horizontal cover, low text, generous crop-safe margin.

Goal: the image can sit above the article and survive sharing previews.

For article-specific covers, choose one concrete `cover_motif` for the right-side visual: `drawer`, `window`, `lens`, `path`, `archive`, or `layers`. The renderer keeps this finite vocabulary deterministic so a cover remains reliable while its visible object follows the article tension. `paper-stack` is only the deliberately generic fallback for legacy or title-only covers.

### 2. In-Article Mood Illustration

Use when the user asks for:

- `正文氛围插图`
- `段落视觉换气`
- `quiet section image`
- `in-article mood image`

Default shape: calmer and less title-driven than a cover.

Goal: create a visual pause or transition without competing with the prose.

If the user asks for a relationship, flow, boundary, trust model, nested boxes, connectors, or technical labels, use `article-diagram` instead.

### 3. Concept Metaphor

Use when the article is a reflective, analytical, technical, or opinion essay.

Goal: translate the article's hidden tension into one visual metaphor. Prefer one strong object/scene over a collage of all concepts.

Examples:

- Tooling and memory -> a workbench with one labeled drawer missing.
- Agent architecture -> stacked tracing paper, each sheet showing a different layer.
- Writing under automation -> a hand editing a page while a second shadow-hand waits.

## Field Contract

`use` and `aspect` are separate decisions:

| User request | `use` | Default `aspect` |
|--------------|-------|------------------|
| `公众号头图`, `公众号封面`, article cover | `cover` | `wechat-cover` |
| `博客封面`, `blog hero` | `cover` | `blog-hero` |
| `正文氛围插图`, `段落视觉换气`, quiet section image | `in-article` | `body-3-2` |
| concept metaphor or visual stance image | `metaphor` | `blog-hero` |

Do not put an aspect value such as `body-3-2` or `wechat-cover` into `use`. If the user gives a destination in natural language, map it to both fields before rendering.

`cover_motif` is a separate decision from `visual_metaphor`: the metaphor is the semantic sentence; the motif is the renderer-safe object that must become visible. Use `drawer` for durable write-back, `window` for reportable access, `lens` for interpretation, `path` for handoff or execution flow, `archive` for retrieval, and `layers` for stacked system views. Do not use `cover_motif` with `in-article` or `metaphor`.

Optional attribution fields are `brand_name`, `logo`, and `source`. Do not use `author` or `photo` aliases; they are not part of the structured renderer contract.

## Aspect Ratios

Aspect ratio is part of the editorial decision, not an export detail. Pick the ratio before composing the image because it decides where the title can sit, how much negative space is needed, and whether the visual idea can survive cropping.

| Use | `aspect` | Ratio | Default viewport | When to use |
|-----|----------|-------|------------------|-------------|
| WeChat cover | `wechat-cover` | `2.35:1` | `1080x460` | Default for `公众号头图` and share-first article covers |
| Blog hero | `blog-hero` | `16:9` | `1080x608` | Default for blog headers and general article hero images |
| Body mood illustration | `body-3-2` | `3:2` | `1080x720` | Default for quiet in-article mood images with a little narrative space |
| Compact body image | `body-4-3` | `4:3` | `1080x810` | Use when the image needs more vertical breathing room |
| Cinematic concept | `cinematic` | `21:9` | `1080x463` | Use for atmosphere, landscape metaphors, or very wide visual tension |
| Square share | `square` | `1:1` | `1080x1080` | Optional share image, not the default for WeChat/blog longform |

Default selection:

- If the user says `公众号头图`, `公众号封面`, or `WeChat cover`, use `wechat-cover`.
- If the user says `博客封面`, `blog cover`, or `blog hero`, use `blog-hero`.
- If the user says `正文氛围插图`, `段落视觉换气`, `in-article mood image`, or `quiet section image`, use `body-3-2`.
- If the user asks for a body image that explains structure, use `article-diagram` instead of this mode.
- If the user does not specify a destination, use `blog-hero` for covers and choose between `editorial-image` and `article-diagram` by intent for in-article images.

Composition rules:

- Put important subjects inside the central 80% width and 76% height.
- Avoid placing small text or faces near the edges.
- For `wechat-cover`, reserve at least 18% empty space on one side for title overlay or platform crop.
- For in-article mood images, prefer a quieter center of gravity; the image should help the prose breathe, not behave like a banner ad.
- For `body-3-2` and `body-4-3`, avoid cover-like left/right split layouts unless the middle space carries a clear relationship.
- If a concept needs vertical hierarchy, do not force it into `wechat-cover`; use `body-4-3` or `blog-hero`.

## In-Article Density

In-article illustrations should be quiet, but they should not look unfinished.

The default goal is enough visual presence: the main subject should occupy roughly 55-75% of the usable canvas. Lower density is acceptable only when the negative space has a clear job, such as isolating a fragile object, creating directional tension, or leaving room for an editorial crop.

For `body-3-2` and `body-4-3`:

- Prefer centered, stacked, radial, or close-proximity compositions when the subject otherwise feels undersized.
- Keep the main subject large enough to hold the image at thumbnail size.
- Use negative space to frame or pace the subject. The middle of the image may be empty if the surrounding visual weight still feels intentional.
- If there are two groups, they may sit apart, but each group must have enough scale and the whole image must still feel balanced.
- Do not shrink the actual subject in order to preserve a decorative amount of paper.
- Keep readable text and primary visual objects in separate zones by default. They may align, echo, or nearly touch, but should not cross or sit on top of each other unless the brief explicitly asks for collage or overprint.

If the image feels sparse or underdrawn at thumbnail size, increase the subject scale or visual weight before rendering.

## Analysis

Before proposing visuals, extract:

```
Title:
Article type: [essay / technical essay / opinion / case study / personal reflection / review]
Use: [cover / in-article / metaphor]
Core tension: [A vs B, or problem vs desire]
Reader promise: [why someone should read]
Emotional temperature: [cool / warm / sharp / quiet / uneasy / playful / solemn]
Visual taboo: [symbols, styles, people, or cultural references to avoid]
Required text: [none / title only / short phrase / title + byline]
Aspect: [wechat-cover / blog-hero / body-3-2 / body-4-3 / cinematic / square]
Crop context: [WeChat cover / blog hero / body image / generic horizontal]
Design system: [auto / claude / stripe / linear / apple / ibm / ...]
```

For long articles, do not summarize every section. Find the recurring pressure underneath the sections.

## Design System Use

Editorial image supports the same `design` field as other CLI-rendered modes, plus an `editorial_tone` field for automatic design selection.

Use design systems as taste inflections, not as concept generators:

- `design` controls canvas color, ink color, accent color, paper surface, border tone, and radius.
- `design` is explicit and always wins when provided.
- `editorial_tone` is used only when `design` is omitted. Allowed values: `reflective`, `sharp`, `warm`, `technical`.
- `design` does not decide the visual metaphor, composition, object choice, or article stance.
- If the user specifies a design system or brand feeling, honor it as a mood layer.
- If the user does not specify one, set `editorial_tone` from the article's emotional temperature and topic, then let the CLI choose a real design from that tone pool.

Good defaults:

- Reflective essays: `editorial_tone: "reflective"` → `claude`, `notion`, `apple`, or `ljg_chensi`
- Sharp opinion pieces: `editorial_tone: "sharp"` → `linear`, `raycast`, `stripe`, or `ljg_ruili`
- Warm human essays: `editorial_tone: "warm"` → `claude`, `clay`, `intercom`, `posthog`, or `ljg_wennuan`
- Technical essays: `editorial_tone: "technical"` → `stripe`, `ibm`, `opencode`, `sentry`, `together_ai`, or `ljg_jishu`

Do not use descriptive buckets such as `editorial-warm`, `technical-data`, `quiet-minimal`, `dark-paper`, or `precision-dark` as `design` values. They are not renderer names. The chosen real design may be mentioned in the rendering brief, but it should not become visible text in the artwork.

## Direction Proposal

Default to choosing one strongest visual direction and continue rendering. Propose 2-3 directions only when the user explicitly asks for options, asks to choose first, or says not to render yet.

Each direction must include:

```
Name:
Purpose:
Aspect:
Visual metaphor:
Composition:
Text plan:
Why it fits:
Failure risk:
```

Direction types should be meaningfully different:

- **Metaphor object**: one object carries the idea.
- **Scene atmosphere**: a small scene puts the reader in the right mood.
- **Editorial cover**: title and image form a magazine-like opening.

Do not propose three colorways of the same image. That is styling, not direction.

## Open Composition Layer

The structured fields are guardrails, not the final visual language.

Use fields like `use`, `aspect`, `title`, `visual_metaphor`, `cover_motif`, and `art_direction` to preserve intent, ratio, crop context, and safety constraints. Do not force every editorial image into the default renderer's visible layout.

When a selected direction depends on a concrete object, action, scene, spatial relationship, or concept metaphor that the default scaffold cannot show, set `composition_required: true`. This makes executability part of the render contract: schema validation and the renderer require both non-empty `content_html` and `custom_css`. Keep the flag in the final CLI input. Omit it or set it to `false` only when the default scaffold is deliberately the final composition; `use=cover` alone is not sufficient evidence.

For final rendering, use a custom composition when the brief has a real article tension that cannot be carried by a cover motif, or when it is a concept metaphor or in-article mood illustration job:

- `content_html` for the chosen visual structure
- `custom_css` for the actual composition, spacing, symbolic objects, and atmosphere
- `visual_metaphor` and `art_direction` as hidden guidance, not necessarily visible text

The default CLI renderer is an aspect-safe Quiet Paper scaffold, not a separate cover-template universe. Its Stable cover path pairs the title with one deterministic `cover_motif`; it is useful for simple covers and must still feel like a card-skill paper object: warm canvas, Xiangcui/DM editorial type, low-saturation ink, hairline surfaces, subtle grain, and almost no shadow. High-quality editorial images should use a custom composition when the selected direction exceeds that bounded vocabulary.

The composition needs one dominant visible subject: an object, scene, gesture, spatial relationship, or concrete diagram metaphor. A stack of paper rectangles, loose lines, decorative frames, or empty negative space is not enough unless it has been transformed into a specific metaphor tied to the article. If hiding the title makes the image feel generic, rebuild the custom composition before capture.

## Controlled Font Stack

Editorial images use a controlled primary font stack so custom compositions stay inside the same visual system.

Allowed primary fonts for visible text:

- `XiangcuiDengcusong` for Chinese body text and restrained Chinese headings
- `XiangcuiDazijiti` for emphatic Chinese display moments
- `DM Sans` for neutral Latin headings and labels
- `DM Serif Display` for editorial Latin titles
- `JetBrains Mono` for code, terminal, and technical labels

Fallback fonts are allowed after the primary font. For example, `font-family: "DM Sans", Arial, sans-serif` is valid because `DM Sans` is the controlled primary choice. `font-family: Inter, Arial, sans-serif` and `font-family: Arial, sans-serif` are invalid because the primary font is outside the editorial-image system.

Do not introduce free-floating font stacks such as `Inter`, `Arial`, `Helvetica`, `system-ui`, or `sans-serif` as the first font for visible text. They may appear only as fallback fonts after an allowed primary font.

## Editorial Visual System

Editorial images may use custom layout, object metaphors, diagrams, and illustrated scenes, but they must still look like part of card-skill's Quiet Paper system.

Use the shared design tokens as the visual source of truth:

- Canvas and surfaces: `--bg`, `--surface-1`, `--surface-2`
- Ink and secondary text: `--ink`, `--ink-light` / `--ink-muted`
- Accent marks: `--accent`
- Borders and dividers: `--hairline`
- Shape rhythm: `--radius`

Visual weight rules:

- Default borders are hairline: `1px`. Use `2px` only for a deliberate focal object. Avoid `3px+` borders because they push the image toward a UI mockup or flowchart.
- Accent color should behave like an ink mark, underline, small signal, or focal stroke. Do not use saturated accent fills as the dominant module surface.
- Large surfaces should use token-derived paper colors, usually `--surface-1`, `--surface-2`, or a low-mix variant of them.
- Avoid heavy drop shadows. Prefer layering, overlap, whitespace, hairline, paper grain, and subtle contrast.
- Diagrams should feel like editorial artwork: paper layers, annotations, measured spacing, and restrained connectors. Avoid dashboard-like cards, button-like modules, and loud process-diagram styling unless the article itself is about UI mockups.
- Default scaffold visuals should read as paper, not UI chrome: no button-like cards, no large generic modules, no decorative paper stack unless it helps express the article.

Custom CSS should not create a separate visual universe. If the composition needs stronger contrast, increase hierarchy through scale, position, or negative space before adding thick borders, bright fills, or heavy shadows.

Every visible custom-composition element must keep its own bounding box inside the capture viewport. `overflow: hidden` does not make negative `inset` / `top` / `left` / `right` / `bottom` positions acceptable to `check-output`; build beams and edge fields from in-bounds boxes. Keep any shadow extent at 8px or less.

## Rendering Rules

- Text should usually take less than 20% of the image.
- Visible text must belong to the artwork. It may be the article title, a section title, a real term, a short excerpt, a byline, or a label attached to a visual object.
- For `use=in-article` and `metaphor` sub-scenarios (Studio), the final image must set `composition_required: true` and have one concrete dominant subject; the renderer rejects a scaffold fallback. For `use=cover` (Stable), the CLI scaffold pairs kicker, title, subtitle, and an article-specific `cover_motif`; use a custom composition only when that bounded object vocabulary cannot carry the selected direction.
- Do not print generation notes, usage notes, or internal rationale into the artwork. Avoid sentences like `给这一节使用`, `用作正文配图`, `安静、低干扰`, `像文章中间的一次停顿`, or `visual pause`.
- For in-article mood images, do not let readable text collide with cards, objects, diagrams, or illustration layers. Text-object overlap is a hard failure unless the requested style is explicitly collage/overprint and readability remains clean.
- Headline line breaks are a hard quality standard, not a cosmetic preference. Fix bad wrapping before delivery.
- Prefer manual `<br>` breaks for cover titles and short hero phrases when automatic wrapping creates an awkward rhythm.
- Never leave a single CJK character, a two-character orphan, or a very short final line as the last headline line.
- Do not split attached technical names or phrases such as `AI Agent`, `Hermes Agent`, `run_agent.py`, `context compression`, or a product name across lines unless the split is visually intentional.
- Do not remove spaces inside technical or product terms. `AI Agent` must not become `AIAgent`, `Hermes Agent` must not become `HermesAgent`, and multi-word terms must keep their word boundaries unless the source itself uses a closed-up spelling.
- Prefer one primary visual idea. Avoid icon soup.
- The image may be ambiguous, but not unrelated.
- Do not print mode or destination labels into the artwork. Avoid labels such as `IN-ARTICLE IMAGE`, `EDITORIAL IMAGE`, `BLOG HERO`, `WECHAT COVER`, or `COVER IMAGE` unless they are part of the article's actual title or source material.
- Preserve Quiet Paper: warm paper or deep card stock, restrained ink, small radius, little shadow, low-saturation accent.
- Avoid stock-photo language: no smiling generic office people, floating dashboards, neon AI brains, glowing networks, or decorative abstract blobs.
- If the article mentions real people, institutions, places, or events, do not invent factual visuals that imply unverified details.
- For in-article mood illustrations, reduce contrast and text weight compared with cover images.
- Leave crop-safe space around important visual elements.
- Do not add a default colophon or footnote. Editorial images should feel like article artwork, not branded cards.
- When this mode changes design-selection behavior, render and inspect at least five PNGs before delivery: one each for `reflective`, `sharp`, `warm`, `technical`, and one explicit `design` override.

## Diagram And Connector Discipline

Editorial images may use diagrams, maps, or structural metaphors, but they must still feel like composed artwork rather than a broken UI sketch.

Use these rules whenever lines, arrows, wires, rails, or flow paths appear:

- Lines must express a relationship: connection, direction, sequence, dependency, grouping, layer, or measurement. If a line has no clear source, target, or structural job, delete it or demote it into a low-contrast background texture.
- Connect from boundary to boundary: edge of card to edge of node, object to object, or anchor point to anchor point.
- Do not let connector lines run through the interior of labeled boxes, cards, circles, or text blocks.
- If a line must cross an object, treat it as a deliberate overprint layer: lower contrast, no accidental overlap with readable text, and visually subordinate to the main idea.
- Prefer short connector segments, subtle anchor dots, or orthogonal routes over long diagonal lines that slice through the composition.
- Avoid fake precision. If the relationship is metaphorical rather than literal, use spacing, alignment, grouping, or repeated forms before adding lines.

## SVG ViewBox Design Principle

The `viewBox` attribute is **not** the content area. It is the rendered canvas, including padding. Treating `viewBox` as the content area is the most common cause of text "touching the edge" — the text never literally overflows the viewBox, but it sits flush against it with no visual breathing room.

**Rule: viewBox = content bbox + four-sided padding.** When authoring an SVG:

1. First, determine the content bounding box — the tightest rectangle that contains every shape, line, and the intended text position. Example: content spans `x = 30..430`, `y = 50..540`.
2. Then choose a padding value (`PAD`, typically 20–40 viewBox units for an editorial illustration).
3. Set `viewBox = (content.min_x − PAD) (content.min_y − PAD) (content.width + 2·PAD) (content.height + 2·PAD)`. Example above with `PAD = 20`: `viewBox="10 30 440 530"`.
4. Place every `<text>` inside the content bbox. Text never relies on the viewBox padding zone for its position.

### Common anti-patterns

- `viewBox="0 0 460 560"` with `<text x="440" text-anchor="end">` — the text right edge lands 20 units from the viewBox right edge, which is the padding zone, not a comfortable margin. Either move the text inward (`x = content.right − 4`) or shrink the viewBox to match the content (`viewBox="20 20 420 520"` if content is `[20..440] × [20..540]`).
- `viewBox="0 0 200 100"` with `<text x="200">` — text right edge touches viewBox right edge. Always leave content room inside the viewBox.
- Inlining a long label without measuring — assume ASCII mono = 0.55 × font-size per char, then budget the rect/viewBox accordingly before writing the SVG.

### What the preflight catches

`scripts/check-output.mjs` enforces a **hard constraint** (`svg_text_outside_viewbox`): any `<text>` whose rendered bounding box exceeds the viewBox rectangle on any side is an ERROR. This is a boolean check, zero threshold — the text either fits inside the viewBox or it does not.

The preflight does **not** enforce a visual-edge-padding threshold. Tight-but-inside layout is allowed by the runtime check. Avoiding tightness is the designer's (and the AI author's) job, using the principle above: design the viewBox with padding, then keep text inside the content area.

## SVG Text Inside Containers

When an SVG `<text>` element sits inside a `<rect>`, `<circle>`, or `<ellipse>` (the pill / badge / label / button / tag pattern), the shape must be wide enough to contain the text plus padding. The preflight (`scripts/check-output.mjs`) automatically measures rendered text bounding box against the shape and fails with `svg_text_overflow` ERROR if text spills past the shape by more than 2px.

To avoid the failure, budget the rect width before writing the SVG:

| Token type | Width estimate |
|---|---|
| CJK character | `1.0 × font-size` |
| ASCII character (mono) | `0.55 × font-size` |
| ASCII character (proportional) | `0.50 × font-size` |
| `letter-spacing` | add `spacing × (chars − 1)` |
| Dot / icon prefix | `cx + r + 8px` of clearance before text starts |

Formula: `rect.width ≥ (text_start_x − rect.x) + text_width + 16px padding`.

When unsure, prefer the wider rect. The preflight catches underestimates; overestimates are visually harmless.

Example: a pill containing `dot(cx=11, r=3) + text("curl raw.github", font-size=10, letter-spacing=1.2)` needs at least `22 (start) + 14 × (0.55 × 10)px + 13 × 1.2px + 16 (pad) ≈ 130px`. The instinct to write `width="116"` will fail.

## SVG Label Positioning Principle

Every SVG `<text>` label must sit at the visual center of the element it **semantically annotates** — not at the edge of the SVG, not at the edge of a sibling container, not where it merely "avoids overlap" with another label.

### Rule

For each `<text>` in an SVG:

1. Identify the element the label is naming or annotating (a line, a rect, a circle, a region, a path, a group). The label describes a property of that element ("GPU HBM ceiling", "overflow zone", "FLOPs", "shared foundation").
2. Compute that element's bounding-box center: `(bbox.x + bbox.width/2, bbox.y + bbox.height/2)`.
3. Place the label's anchor at that center with `text-anchor="middle"`. If the label sits *above* the element, subtract ~1em from y (one line height); if *below*, add ~1em.

### Why this principle exists

Labels positioned at "the edge of their target" (`text-anchor="end" x="line.right"`) carry two failure modes at once:

- They hug the viewBox edge → visual tightness against the SVG boundary.
- They look "attached to the side" of the element rather than "naming" it → semantic ambiguity (does the label describe the line, the adjacent container, or the SVG edge?).

Centering on the annotated object removes both failures and makes the label-to-target relationship unambiguous.

### When centered labels visually overlap

Two labels can land near each other when their annotated objects share a band (e.g., a global ceiling line at y=100 and a local overflow region at y=70..100). Resolution, in order of preference:

1. **Background contrast** — give each label a `fill` that contrasts with what's directly behind it (white text on a dark overflow block, dark text on the paper background). The labels read as belonging to different visual layers even when horizontally close.
2. **Vertical offset above vs. below** — if the annotated objects allow it, place one label above its object and the other below, doubling the vertical separation.
3. **Drop one label** — if the element is self-evident from its rendering (e.g., a dark overflow block already shows overflow), the label is decoration, not information. Cut it.

**Never resolve overlap by moving a label off-center.** Off-center labels are the bug; overlap is the symptom that exposes the underlying object-layout problem. Fix the layout (or apply the list above), don't drift the label.

### Anti-patterns

- `text-anchor="end" x="line.right.x"` on a full-width reference line — the label lands at the viewBox's right padding zone, not at the line's semantic center. Use `text-anchor="middle" x="line.center.x"` instead.
- `text-anchor="end" x="container.right + small offset"` — the label "hangs off" the container edge. Use `text-anchor="middle" x="container.center.x"` instead.
- Two labels at the same y-coordinate using `text-anchor="end"` and `text-anchor="start"` to "avoid each other" — this is the symptom of off-center placement. Either center each on its own annotated object, or drop the redundant label.

### Worked example

Diagram with a horizontal ceiling line spanning `x = 40..420` and a vertical overflow block centered at `x = 330, y = 70..100`:

✗ `ceiling-label x=420 text-anchor="end"` (hugs viewBox edge) + `overflow-label x=244 text-anchor="end"` (hangs off container left) — two off-center labels collide visually and read ambiguously.

✓ `ceiling-label x=230 text-anchor="middle"` (center of line bbox 40..420) + `overflow-label x=330 text-anchor="middle" fill="#f6f4ee"` (center of overflow block, white text on dark fill) — both labels centered on their annotated object, separated by background contrast instead of position hacking.

## Anti-Patterns

- **Title rebus**: drawing every noun in the title.
- **Summary poster**: turning the essay into bullet points.
- **Generic atmosphere**: beautiful but interchangeable image.
- **Style-first prompt**: strong style, weak idea.
- **Overpacked collage**: too many concepts competing.
- **False specificity**: realistic details that the article did not establish.
- **AI-default symbolism**: glowing circuitry, purple gradients, faceless people, infinite grids.
- **Mode label leakage**: visible labels like `IN-ARTICLE IMAGE`, `BLOG HERO`, or `EDITORIAL IMAGE` that describe the output format instead of the article.
- **Brief leakage**: visible explanatory text that describes how the image should be used instead of becoming part of the image.
- **Broken connector diagram**: lines pass through boxes, labels, or nodes instead of connecting cleanly between their boundaries.
- **Underdrawn body image**: an in-article mood image where the subject is too small or visually weak for the canvas, making the image feel unfinished.
- **Text-object collision**: readable text crosses into or sits on top of the main illustration, card stack, node, or diagram shape in a way that looks accidental.

## Acceptance Check

Before delivery, ask:

- Would this still feel tied to the article if the title were hidden?
- Does it show the article's tension rather than repeat the article's summary?
- Is there one dominant visual idea?
- Can it survive being cropped for a WeChat/blog preview?
- Does it avoid generic AI or stock-image signals?
- Is the amount of text appropriate for a cover or in-article mood image?
- Does every visible sentence belong in the artwork, rather than describe how the image should be used?
- Are headline and short text line breaks intentional, with no orphaned last line or awkward split?
- Are technical and product terms preserving their real spacing and casing?
- If there are connectors, do they connect cleanly at element boundaries without crossing text or box interiors?
- Does the image avoid visible mode/destination labels such as `IN-ARTICLE IMAGE` or `BLOG HERO`?
- For in-article mood images, does the subject have enough visual presence for the canvas, with purposeful negative space?
- For in-article mood images, are readable text and the main visual object separated cleanly, with no accidental collision?

If the answer to any of these is no, revise the concept before rendering.

## Reference Basis

- The Washington Post Design team: useful for treating illustration as an assigned editorial job with multiple first-round directions.
- The New Yorker cover practice: useful for images that stand as a visual point of view rather than decoration.
- GOV.UK image guidance: useful for deciding when images help readers and when they should not carry essential-only information.
- Design Guidelines for Prompt Engineering Text-to-Image Generative Models: useful for converting a vague text intention into concrete subjects, relationships, and visual constraints.
