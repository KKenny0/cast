# Open-source tool routing

Use this adapter when the user provides an open-source repository, release page, README, documentation, screenshots, commands, benchmarks, or asks for 开源工具介绍配图、工具推荐卡片、系列海报、小红书式技术内容、GitHub 项目介绍插画、安装/工作流卡片、overview 或 carousel planning.

Read `references/source-material.md` first. This adapter selects evidence responsibilities and narrative shape; it does not add a renderer mode or let the renderer access GitHub.

## 1. Evidence profile

Classify the source as one archetype:

- `launch`: a release with several different kinds of strong evidence;
- `cli`: input, exact command/control, and inspectable output;
- `ui-product`: scenario, current interface proof, workflow, and result;
- `library-api`: public contract, minimal example, and integration boundary;
- `research-benchmark`: claim, primary data, and caveat;
- `infra-system`: system boundary, components, and operational consequence.

Choose `copy_register: editorial` only for evidence-rich launch material. CLI, library/API, and infrastructure default to `documentary`: answer what goes in, what executes, what comes out, and where it fits. Do not replace missing evidence with abstract value slogans.

## 2. Adaptive artifact count

Count independent current primary evidence responsibilities, not files or screenshots:

- one responsibility → one focused card;
- two → two cards;
- three → three cards;
- four or more → at most four cards.

Do not automatically generate a focused card, overview, and series together. Do not repeat a hero, diagram, screenshot, command, or conclusion to reach a target count. If the user fixes the count, honor it only while evidence remains distinct; otherwise deliver the maximum non-repeating set and state the gap.

## 3. Story patterns

| Archetype | Default artifact roles |
|---|---|
| `launch` | judgment → evidence → capability → case |
| `cli` | problem/input → command/control → output/use |
| `ui-product` | scenario → interface-proof → workflow → result |
| `library-api` | contract → minimal-example → integration-boundary |
| `research-benchmark` | claim → data → caveat |
| `infra-system` | boundary → components → operational-consequence |

Use the four-part launch pattern only when at least three different evidence kinds are strong and current. A project landing-page hero is not proof of a capability. Stars, downloads, compatibility, performance, and version claims require current primary evidence.

## 4. Freshness and exactness

Before assigning evidence to an artifact, confirm:

- the visible product name matches the current project;
- current official docs still support the UI, command, or output format;
- the item is not deprecated branding or an unexplained historical version;
- unknown freshness is never primary evidence.

Put rejected items in the evidence inventory with a reason. Preserve install and invocation commands verbatim, including package names, flags, and version qualifiers.

## 5. Visual planning

Use one Visual Job v3 artifact plan per card and bind it to its unique source unit IDs. A multi-card poster should normally be one poster output with multiple cards so page numbering, title scale, source placement, and series rhythm share one renderer contract.

In poster cards, write headings as compact editorial labels rather than complete clauses. Prefer one balanced line; if a heading could leave a one- or two-word orphan, shorten it and move the full claim into paragraph, highlight, or data content.

Plan content geometry from the evidence role:

- interface or output evidence may occupy a poster `media` field with an explicit absolute local PNG/JPEG/WebP path, accessible `alt`, and optional visible `caption`;
- a command needs a typographic command surface, not a decorative terminal screenshot; in `poster`, use supported body elements such as `data_row`, `heading`, or `paragraph` and never invent a `code` element;
- a short process should use poster `process` with two to five bounded steps, not a complete diagram card embedded inside another card;
- benchmark evidence needs legible data plus its scope or caveat;
- generated illustration supports a claim but cannot become evidence for one.

Keep Quiet Paper as the house style, then borrow only a restrained current source cue—accent, geometry, or content rhythm. `design_match_basis` may be `source-brand`, `content-tone`, or `neutral`; never clone another skill's templates, recipe names, assets, or CSS. The result should remain recognizably card-skill: evidence-first, editorial, paper-like, and locally reproducible.

## 6. Final checks

Alongside normal schema, capture, `check-output`, and Visual Review:

- every artifact has a different evidence responsibility;
- no stale/unknown/unusable source is referenced as primary;
- exact commands are unchanged;
- visual media has known rights and current product identity;
- the series skeleton is consistent without forcing identical composition;
- whitespace is intentional and content weight is balanced at thumbnail scale.
