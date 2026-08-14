# Visual taxonomy

The Agent identifies source evidence and intended meaning; the runtime maps each artifact plan to a mode. Visual Job v3 records meaning in `outputs[].artifacts[].visual_plan`, while v2 keeps it in `outputs[].visual_plan`. `scripts/lib/mode-selector.js` is the executable mode authority.

Source routing happens before mode routing. A source archetype chooses the evidence responsibilities and artifact count; it does not create a new renderer mode. For example, a CLI source can yield three artifact plans—input, command, output—inside one poster contract. Read `references/source-material.md` and the applicable source adapter before this taxonomy.

## Precedence

1. A publishing target with a fixed delivery contract wins.
2. Otherwise content type and argument structure select the mode.
3. An explicit user mode request may use `decision.selection_source: "user-override"`. Automatic Agent routing must use `taxonomy`.

| Publishing target | Mode |
|---|---|
| `wechat-cover`, `blog-hero` | `editorial-image` |
| `social-series`, `reading-notes` | `poster` |
| `long-read` | `long` |
| `whiteboard` | `whiteboard` |

| Meaning | Mode |
|---|---|
| Single idea or claim | `big` |
| Mechanism, system, causal chain, or sequence | `article-diagram` |
| Comparison, data summary, or timeline | `infograph` |
| Story with conflict and turn | `comic` |
| Personal story with a reflective arc | `sketchnote` |
| Article-body idea with a concrete metaphor | composition-required `editorial-image` |
| Other article-body argument | `article-diagram` |

All artifact plans inside one renderer output must resolve to its contract mode. If adjacent artifacts need different modes, use separate outputs. `recommended_mode` is deliberately absent: the selected mode already exists in `render_contract.mode`; storing both would create contradictory sources of truth.
