# Kenny Style Palette Index

Kenny Style is card-skill's only visual grammar. It owns typography, scale, spacing, layout, radius, paper material, line work, shadow limits, and composition. It is the default system, not a selectable `design` value.

`tone` changes color only. The four house tones below may alter canvas, ink, muted ink, accent, surface, and hairline colors; they must not alter geometry, type, spacing, density, metaphor, or content structure.

## House tones

These are automatic defaults. They are selected through `tone` or `editorial_tone`, not written into `design`.

| Tone | Canvas | Accent | Ink | Use |
|---|---|---|---|---|
| `reflective` | `#f4f1eb` | `#746452` | `#2b2925` | essays, reading, reflection |
| `sharp` | `#f1efe9` | `#87463f` | `#292724` | critique, contrast, decisive claims |
| `warm` | `#f7f1e6` | `#9a6846` | `#2d271f` | stories, people, growth |
| `technical` | `#f2f3ee` | `#365d71` | `#1f2a2f` | systems, code, research, data |

All four tones use the same Kenny Style geometry. If two renders of one contract differ in font, radius, spacing, line breaking, element size, or position, the tone boundary has been violated.

## Explicit palette overrides

The 26 existing `design` names remain accepted for compatibility and explicit user requests. They are palette presets, not design systems. A preset may change only the same color roles as a tone. Ignore typography, layout, component, radius, density, shadow, and interaction conventions associated with the referenced brand or legacy source.

Automatic routing must not select these names. Use them only when the user explicitly supplies `design` / `--design`.

| Name | Surface | Accent | Canvas | Ink |
|---|---|---|---|---|
| `linear` | dark | `#7b84b8` | `#151413` | `#e8e2da` |
| `vercel` | dark | `#d8d2c8` | `#141413` | `#e8e2da` |
| `spotify` | dark | `#4f7a5f` | `#171613` | `#e8e2da` |
| `apple` | light | `#356b96` | `#f6f4ee` | `#1f1d19` |
| `expo` | light | `#30302e` | `#f7f5ef` | `#1f1d19` |
| `notion` | light | `#6f6095` | `#f6f3ec` | `#211e19` |
| `claude` | light | `#9b6048` | `#f5f0e8` | `#2c2418` |
| `cursor` | light | `#a55332` | `#f6f3ec` | `#26251e` |
| `intercom` | light | `#3a332d` | `#f5f1ec` | `#201c17` |
| `replicate` | light | `#a04735` | `#f7f4ed` | `#24201b` |
| `posthog` | light | `#9a6d28` | `#f2f0e7` | `#23251d` |
| `clay` | light | `#5a4f40` | `#f8f3e7` | `#211d18` |
| `stripe` | light | `#314d73` | `#f6f4ee` | `#172434` |
| `ibm` | light | `#315f8f` | `#f5f3ed` | `#1f1d19` |
| `opencode` | light | `#34302c` | `#f7f4ee` | `#24201c` |
| `sentry` | dark | `#5d526d` | `#151413` | `#e8e2da` |
| `raycast` | dark | `#a15a52` | `#161514` | `#e8e2da` |
| `together_ai` | dark | `#3f638f` | `#151413` | `#e8e2da` |
| `ljg_chensi` | light | `#7a5b43` | `#f5f2ed` | `#2d2926` |
| `ljg_ruili` | light | `#9b4a3e` | `#f0eeea` | `#2d2926` |
| `ljg_wennuan` | light | `#9d6d4d` | `#f7f4ef` | `#2d2926` |
| `ljg_jishu` | light | `#4f7b68` | `#f1f3ef` | `#2d2926` |
| `ljg_keyan` | light | `#9a7148` | `#f3f4ee` | `#2d2926` |
| `ljg_chuangyi` | light | `#8f5144` | `#f6f3ef` | `#2d2926` |
| `ljg_shangye` | light | `#4e6b58` | `#f4f3ee` | `#2d2926` |
| `ljg_moren` | light | `#8b5b68` | `#f3f1ec` | `#2d2926` |

Aliases remain accepted: `linear.app` / `linear_app` resolve to `linear`; `opencode.ai` / `opencode_ai` resolve to `opencode`.

## Contract boundary

- `tone` / `editorial_tone`: automatic house palette selection.
- `design`: explicit compatibility palette override; it wins over tone.
- mode: semantic output structure.
- Kenny Style: invariant visual grammar across every mode and palette.

The grayscale test is the quickest audit: after removing color, outputs across tones and explicit presets must still read as the same system.
