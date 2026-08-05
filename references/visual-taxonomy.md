# Visual taxonomy

The Agent identifies meaning; the runtime maps it to a mode. Visual Job v2 records the meaning in each `outputs[].visual_plan`, and `scripts/lib/mode-selector.js` is the executable authority.

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

`recommended_mode` is deliberately absent from the contract. The selected mode already exists in `render_contract.mode`; storing both would create contradictory sources of truth.
