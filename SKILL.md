---
name: card-skill
description: "Render text content into a polished, shareable PNG visual. Use this skill whenever the user asks to turn words, notes, articles, quotes, arguments, stories, explicit WeChat Reading highlights/thoughts, or WeChat Reading personal statistics into an 信息图/infographic, 海报/poster, 卡片/card, 大字报, whiteboard, visual summary, comic, sketchnote, social card grid, 公众号头图, 博客封面, 正文配图, 正文解释图, 关系图, 流程图, 边界图, reading report, or non-summary editorial image for an essay. Trigger on phrases like 做成图, 渲染成图, 做张卡片, 卡片组, 做成漫画, 视觉笔记, 给文章配图, 微信读书划线做卡, 微信读书笔记, 微信读书阅读月报, article cover, blog hero, article diagram, concept map, process flow, and editorial image. Supports 9 modes: infographic, big-text poster, long-form reading card, whiteboard reasoning, multi-card poster, comic, sketchnote, editorial-image, and article-diagram. If the user mentions a restrained brand feel such as Apple, Stripe, Linear, Vercel, IBM, Notion, Claude, or similar, apply it as a visual style, not as a full brand redesign. Do not use for websites, UI components, Figma prototypes, logos/VI systems, chart-library plotting, photo editing, or plain file conversion."
user_invocable: true
version: "0.9.0"
---

# card-skill

**Install integrity check.** Before using this skill, confirm this directory contains `scripts/card.js`, `scripts/check-output.mjs`, `assets/`, `schemas/`, and `references/`. If any of them are missing, stop and tell the user this installation is incomplete: bare `npx skills add KKenny0/card-skill ...` installs only `SKILL.md` for this repository shape. Ask them to reinstall the self-contained skill package instead:

Codex plugin:
```bash
codex plugin marketplace add KKenny0/card-skill
codex plugin add card-skill@card-skill
```

Claude Code plugin:
```bash
claude plugin marketplace add KKenny0/card-skill
claude plugin install card-skill@card-skill
```

Generic agent:
```bash
npx skills add KKenny0/card-skill/plugins/card-skill/skills/card-skill -a codex -g -y
cd ~/.agents/skills/card-skill
npm install
npx playwright install chromium
```

For one-off use without installing, run `npx skills use KKenny0/card-skill/plugins/card-skill/skills/card-skill --skill card-skill`.

**Runtime dependency check.** Before the first render, run `node scripts/setup-runtime.mjs --check` from this skill directory. If it reports a missing dependency, run `node scripts/setup-runtime.mjs` once and then repeat the check. This installs the declared npm packages in the skill directory and Playwright Chromium in the user's normal Playwright cache. Relay setup failures instead of bypassing the output checks.

**Update check and automatic upgrade.** Before any card request, including Studio-tier requests and Codex direction preview, run `node scripts/check-update.mjs` once; if it prints a line, relay it to the user, then continue. After the current output is delivered, run `node scripts/check-update.mjs --auto-update`; Codex and generic `skills` installs are upgraded to the exact commit resolved from the latest stable Release, version-read back, and prepared for the next use, while Claude Code marketplace installs remain under Claude Code's native plugin updater. Direct `scripts/card.js` rendering performs the check defensively and launches the supported post-render upgrade in the background. State and locks are isolated per installation, so concurrent renders or a second installation cannot suppress or race the update. The check only reads GitHub's public Release and commit APIs; installation downloads through Codex, a pinned `skills` CLI, or Claude Code's marketplace and sends no card content. Failed Codex or `skills` installation/runtime preparation restores the previous copy. For Claude Code, update with `claude plugin marketplace update card-skill` followed by `claude plugin update card-skill@card-skill`. Set `CARD_SKILL_DISABLE_UPDATE_CHECK=1` to disable both checking and supported automatic upgrading, or `CARD_SKILL_DISABLE_AUTO_UPDATE=1` to keep the check while disabling supported automatic upgrades.

将内容铸成可见的形态。内容进去，PNG 出来。模具决定形状。

另有长文作者配图入口：给公众号/博客文章做头图、封面图、正文氛围插图或正文解释图。封面和氛围图提炼文章的视觉立场、情绪和隐喻；正文解释图用于关系、流程、边界和权限，不把文章再摘要一遍。

## 默认原则

默认直接产出可用 PNG，不要先让用户做选择题。除非用户明确要求“给我几个方向 / 换一批 / 先选风格”，否则自动选择最合适的 mode、四个 tone（`reflective` / `sharp` / `warm` / `technical`）和画面方向，并在验证通过后交付。26 个既有 design 仍是高级显式 override，用户指定时必须完全尊重。

所有 mode 默认共享同一套 Quiet Paper 气质：纸面底色、香萃字系、低饱和墨色、细分隔线、小圆角、极少阴影。`editorial-image` 和 `article-diagram` 可以有不同用途，但不能另起一套封面模板、流程图或 dashboard 视觉语言；品牌 design 只改变气质温度，不改变这套纸面纪律。

优先从用户的发布任务理解需求，再映射到内部 mode；不要要求用户先学习 mode 名称：

| 用户任务 | 默认入口 |
|----------|----------|
| 公众号头图 / 封面 | `editorial-image` + `wechat-cover` |
| 正文氛围插图 / 段落视觉换气 | `editorial-image` + `body-3-2` |
| 正文解释图 / 关系图 / 流程图 / 边界图 | `article-diagram` |
| 长文章 / 深度阅读 / 保留段落节奏 | `long` |
| 小红书 / 社媒卡片 | 单一观点优先 `big`，多观点或系列优先 `poster`，结构化知识优先 `infograph` |
| 微信读书个人划线 / 想法 | 默认 `poster` + `reading-notes`；单句 `big`，长文笔记 `long`，显式结构压缩 `article-diagram` |
| 微信读书阅读月报 / 年报 | `poster`，只渲染官方回包实际提供的统计模块 |
| 推理过程 / 关系梳理 / 白板 | `whiteboard` |
| 有冲突、转折或人物动作的叙事 | `comic` |
| 个人经验、反思、失败到顿悟的弧线 | `sketchnote` |

这些只是入口映射；内容结构明显更适合其他现有 mode 时，自动改走更合适的路线。

## Agent Operating Principles

自然语言出图默认使用 Visual Job v2。`scripts/card.js` 只是兼容旧输入和开发者调试的底层 renderer，不代表完整 Agent 流程。

出图前：

1. 理解来源，按独立语义拆成 `source_units`。
2. 为每个输出写 `visual_plan`：核心判断、内容类型、论证结构、具体隐喻或 `null`、布局策略、阅读层级和禁忌。
3. 读取 `references/visual-taxonomy.md`；Agent 自动规划使用 `decision.selection_source: "taxonomy"`，由 taxonomy 决定 mode。只有用户明确点名 mode 才使用 `user-override`。
4. 把计划落成已有 mode 的 `render_contract`，再进入 schema、renderer、截图和 checker。

出图后：

5. 必须实际查看每张候选 PNG，并按 `references/visual-review.md` 输出哈希绑定的 Visual Review。
6. 总分达到 8.0 且没有 blocker 才发布。首次不通过时，只修改 `visual_plan` 与对应 `render_contract`，完整重跑一次；第二次仍不通过则停止，不把失败候选当成成品。
7. 通过 `scripts/publish-reviewed-job.mjs` 原子发布 PNG、receipt 和 review。

`references/design-memory.json` 是只读、版本化经验库。只有维护者批准的 CardBench 模式可以进入；普通任务不得写入用户内容、路径或运行记录。

## 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--design` | 指定设计系统（跳过自动匹配） | 空（自动选择） |
| `editorial_tone` | `editorial-image` 自动设计选择：`reflective` / `sharp` / `warm` / `technical` | 空 |
| `--dpr` | 设备像素比 | 2（2× 像素密度） |
| `brand_name` | 可选署名/品牌文字；只在用户明确提供时渲染 | 空 |
| `logo` | 可选署名头像/品牌 logo 路径；只在用户明确提供时渲染 | 空 |
| `source` | 可选来源文字；`long`、`poster`、`editorial-image` 与 `article-diagram` 支持 | 空 |

## Codex 环境扩展（可选）

在支持对话内交互卡片的 Codex 桌面环境中，可以在渲染前展示少量候选方向，让用户选择视觉隐喻、公式压缩或设计气质。这个入口只是决策面，不是第 10 个 mode，不改变最终 PNG 输出契约，也不替代 schema、renderer、Playwright 截图或 `check-output`。

完整规则见 `references/codex-inline-preview.md`。Codex CLI、IDE、其他 coding agent 或当前宿主不支持交互卡片时，沿用同一份候选契约输出文字列表；预览不可用不得阻塞原有直接出图流程。

## 执行流程

### Step 0: 渲染路由

card-skill 把 9 个 mode 分两层：

- **Stable tier**（CLI-rendered）：`big`、`long`、`whiteboard`、`poster`、`article-diagram`，以及 `editorial-image` 的封面 / hero 子场景（`use=cover`）。走结构化 renderer，schema 校验失败直接报错；输出确定性高，是产品主体。
- **Studio tier**（formal composition）：`infograph`、`comic`、`sketchnote`，以及 `editorial-image` 的正文氛围 / 概念隐喻子场景（`use=in-article` / `metaphor`）。必须保留完整 composition contract 并进入正式 capture/check 链，但仍需要人工视觉验收；Studio 不伪装成 Stable。

判断当前内容能否走 Stable tier 的 CLI 路径：

判断逻辑：
1. 如果 mode 是 infograph / comic / sketchnote → 进入 Studio tier（Step 1），先生成完整 `content_html` + `custom_css` composition contract，再交给正式 CLI renderer
2. 如果 mode 是 article-diagram：
   - 先进入 Step 1.6，把文章片段压成统一三件套：`formula` / `sentence` / `structure`
   - 默认只输出公式卡：`formula` 是主视觉，`sentence` 是低权重解释脚注；暂不默认渲染结构图
   - 如果输入是整篇文章，先逐章筛选；凡是值得压缩的章节都各出一组 compression pack，不要把整篇文章塞成一张节点清单
   - 旧 `concept-map` / `process-flow` / `boundary-model` 输入只作为兼容路径；新产出不要公开暴露 family 选择
   - CLI 路径可直接渲染；schema 失败时先简化结构，不要改走开放自由画布
3. 如果 mode 是 editorial-image：
   - 先进入 Step 1.5 生成或确认视觉方向
   - 先把自然语言用途映射成结构化字段：`use` 只表示编辑任务（`cover` / `in-article` / `metaphor`），`aspect` 只表示画布比例（`wechat-cover` / `blog-hero` / `body-3-2` / `body-4-3` / `cinematic` / `square`）
   - 按 `use` 分流 tier：
     - `use=cover` → Stable 子场景。CLI scaffold 由 kicker、title、subtitle 和确定性的 `cover_motif` 组成；文章型封面必须选择能承载核心张力的具体 motif，只有刻意的通用旧封面才省略它并回退 paper-stack
     - `use=in-article` / `metaphor` → Studio 子场景。必须设置 `composition_required: true` 并由 AI 写 `content_html` + `custom_css`；CLI 会拒绝缺少完整构图的输入，不再渲染 scaffold
   - 如果已有具体画面结构（`content_html` + `custom_css`）→ CLI 路径，作为高质量最终图的首选
   - 如果还没有视觉方向 → 默认自动选择 1 个最强方向并继续渲染；只有用户明确要求候选时，才先产出 2-3 个方向等待选择
4. 如果 mode 是 big / long / whiteboard / poster：
   - 评估内容结构能否 fit 进对应 mode 的 schema（见 `schemas/{mode}.json`）
   - 内容结构清晰（有标题、段落分明、推理链线性）→ CLI 路径
   - 内容过于复杂（嵌套引用、多栏对比、特殊排版需求、不确定能 fit）→ 降级到 AI 路径

**自然语言 Agent 路径**：
1. 生成符合 `schemas/visual-job.json` 的 Visual Job v2；每个 output 同时包含 `visual_plan` 与现有 mode 的 `render_contract`
2. 将 Visual Job 写入操作系统临时目录，不要写进 repo
3. 以候选模式调用：
```bash
node scripts/render-job.mjs --input <system_temp>/visual-job.json --output-dir <system_temp>/candidate --candidate --json
```
4. renderer 成功 → 候选已完成预检、DPR 2 截图、脚本复查，并生成 receipt、封存的 checked HTML 与闭合集合 manifest；实际查看每张 PNG，按 receipt 的 `metaphor_required` 写入同 basename 的 `.review.json`
5. Review 通过后调用：
```bash
node scripts/publish-reviewed-job.mjs --candidate-dir <system_temp>/candidate --output-dir ~/Downloads --json
```
6. 无论成功或失败，都清理本次 Visual Job 与候选目录
7. CLI 失败 → 按错误分类处理：`input_contract` 最多修正一次；只有 `content_fit` 可在同一 mode 内简化一次；`runtime`、`safety` 与 `quality_gate` 硬失败。任何修正都必须重新 validation、capture、check 和 PNG inspection，不能无声切换论点或旁路 checker。

直接 `scripts/card.js --input/--stdin` 保留给 v1 兼容和底层 renderer 调试；它不会替 Agent 生成 Visual Plan 或 Visual Review。

**JSON schema 结构**（每个 mode 的完整定义见 `schemas/` 目录）：

big: `{ mode, phrase, design?, accent_words?, ghost_char?, attribution? }`
long: `{ mode, title, body: [{type, text, ...}], design?, kicker?, subtitle?, theme? }`
whiteboard: `{ mode, title, steps: [{type, ...}], design?, subtitle?, accent_words? }`
poster: `{ mode, variant?, title, cards: [{title?, body: [{type, ...}]}], design?, subtitle?, source? }`；个人读书笔记使用 `variant: "reading-notes"`，配对内容单元为 `{ type: "reading_unit", quote, thought? }`
editorial-image: `{ mode, title, use?, aspect?, visual_metaphor?, cover_motif?, art_direction?, content_html?, custom_css?, composition_required?, design?, editorial_tone? }`；文章型 `use=cover` 选择 `cover_motif`，`use=in-article` / `metaphor` 必须带 `composition_required: true`、`content_html` 与 `custom_css`
article-diagram: `{ mode, title, formula, sentence, structure: {nodes: [{id, label, note?}], relations?}, render_plan?, caption?, design? }`；legacy: `{ mode, family, title, nodes, links?, zones? }`

### Step 0.5: 读取基础

按路线读取，不要为了简单 CLI 渲染过度加载参考文件。

**CLI 路径必读**：
1. `schemas/{mode}.json` — 目标 mode 的结构化输入约束
2. `references/design-index.md` — 仅当用户未指定 `--design`、需要自动选择设计系统时读取

**AI / 手工 HTML 路径必读**：
1. `references/taste.md` — 品味底线（反 AI 美学 + 纸质印刷感）
2. `references/design-index.md` — Quiet Paper 下的 18 套品牌气质 + 8 种内容色调索引（26 总计）
3. 对应 mode 文件：
   - `references/mode-infograph.md` — 信息图内容理论（密度/结构/情绪三维分析、90/8/2 色彩规则、布局生成原则）
   - `references/mode-long.md` — 长文内容规则（金句检测、色调感知、段落预处理）
   - `references/mode-big.md` — 大字报排版（字数→字号动态计算、手动断行原则）
   - `references/mode-sketchnote.md` — 叙事结构（反翻译腔六条、问题→失败→顿悟弧线）
   - `references/mode-whiteboard.md` — 白板推理（逻辑链提取、4 种结构路线）
   - `references/mode-poster.md` — 多卡分割（视觉权重计算、贪婪分割算法）
   - `references/mode-comic.md` — 漫画叙事（冲突提取、分镜系统、5 种风格路线）
   - `references/mode-editorial-image.md` — 长文作者配图（视觉立场、概念隐喻、公众号/博客封面、正文氛围插图）
   - `references/mode-article-diagram.md` — 正文解释图（默认公式卡：公式 + 一句话；结构图暂缓，旧图型只作兼容）
   - `references/source-weread.md` — 可选微信读书来源适配（显式授权、个人笔记与阅读报告、来源标注、隐私和失败降级）

### Step 1: 获取 + 分析内容

**获取**：URL → WebFetch / 粘贴文本 → 直接用 / 文件路径 → Read

**微信读书可选来源**：只有用户明确提到微信读书，或明确说明当前划线、想法、统计来自微信读书时，才进入 `references/source-weread.md`。先读取已安装的官方 `Tencent/WeChatReading` Skill 的完整 `SKILL.md` 和当前请求对应的能力文档，由官方 Skill 负责认证、版本、分页、字段含义与 deepLink；card-skill 只接收规范化后的个人内容或统计并负责制图。普通书名、未注明平台的个人阅读统计、通用读书卡或文章请求不得隐式读取个人账号。官方 Skill 未安装、Key 缺失、升级提示、数据不可用和隐私降级规则全部见该 reference。

个人划线与想法进入默认 Poster 路线时，必须显式使用 `variant: "reading-notes"`：

- 一条原文划线及其精确配对的个人想法组成一个 `reading_unit`；`quote` 逐字保留，`thought` 只有在来源层已经精确配对时才写入。
- 没有配对 quote 的章节点评与整本书评继续使用 `items` / `paragraph`，并分别标明 `章节点评`、`整本书评`；不能伪装成 `我的想法`。
- 1–8 个内容单元全部保留；超过 8 个且用户未要求全量时，按章节与主题整理为 6–8 张卡，每张约 2–4 个相关单元，并在交付中说明 `本次使用 X / 可用 Y`。
- 主题标题只是整理标签，不得冒充书中小节；必要时写明 `主题整理`。
- 用户明确要求每条都要时，不做隐式精选；保持原始顺序，分成每批最多 8 张卡。
- 第一张卡必须同时包含系列标题和实际内容，不能生成 title-only 首卡。

**分析**：提取内容的三维特征（详见 `references/mode-infograph.md`）

```
标题：[≤ 15 字]
副标题：[一句话 ≤ 30 字]
来源：[可选]
密度：[稀 ≤50字 / 中 50-200 / 密 200+]
结构：[单点 / 对比 / 层级 / 流程 / 辐射 / 并列]
情绪：[沉思 / 锐利 / 温暖 / 技术]
主题标签：[2-5 个关键词]
```

**内容预处理**（遵循 ljg-card 规范）：
- 金句检测：独立段落 <25 字含核心洞察的，标记为 highlight
- 段落切分：按语义完整性分割，不以固定字数机械切
- 数据清洗：确保数字真实感（`47.2%` 而非 `50%`，`+1 (312) 847-1928` 而非 `1234567`）
- 文案去 AI 腔：禁用"赋能/无缝/释放/下一代/深度赋能"等 AI 典型用词（完整清单见 `references/taste.md` 第 5 节）
- 反翻译腔：禁用"是…的"/"在…的过程中"/"进行+名词"（完整规则见 `references/mode-sketchnote.md` 六条公理）

### Step 1.5: 文章封面 / 氛围配图入口（editorial-image）

当用户要求 `给文章配图` / `公众号头图` / `博客封面` / `article cover` / `blog hero` / `editorial image`，且目标是封面、氛围、隐喻或视觉立场时，进入 `editorial-image` 流程。

**子场景 tier 提示**：封面 / hero 请求（`use=cover`）走 Stable CLI scaffold：标题区配一个确定性的 `cover_motif`，让右侧主视觉随文章张力变化且仍可重复渲染；正文氛围 / 概念隐喻请求（`use=in-article` / `metaphor`）走 Studio 流程，必须设置 `composition_required: true` 并提供 `content_html` + `custom_css`。详细区别见 `references/mode-editorial-image.md` 的 Tier Commitments 章节。

如果用户要求的是 `正文解释图` / `关系图` / `流程图` / `边界图` / `权限边界` / `安全边界` / `article diagram` / `concept map` / `process flow`，或正文配图里明显出现节点、连线、嵌套框、步骤、区域、权限、信任边界，改走 Step 1.6 的 `article-diagram`，不要默认塞进 `editorial-image + body-3-2`。

**核心区别**：文章配图不是摘要卡。不要把文章观点改写成 bullet points；要提炼文章的视觉立场、情绪、核心张力和隐喻。

先读取 `references/mode-editorial-image.md`。默认选择最贴合文章张力的 1 个视觉方向并继续渲染；只有用户明确要求“给几个方向 / 先别出图 / 我来选”，才输出 2-3 个视觉方向并等待选择。

字段映射必须清楚，避免把比例名填进用途字段：

| 自然语言请求 | `use` | 默认 `aspect` |
|--------------|-------|----------------|
| 公众号头图 / 公众号封面 / 文章封面 | `cover` | `wechat-cover` |
| 博客封面 / blog hero | `cover` | `blog-hero` |
| 正文氛围插图 / 段落视觉换气 / quiet section image | `in-article` | `body-3-2` |
| 概念隐喻图 / visual metaphor | `metaphor` | `blog-hero` |

结构化字段负责约束：用途、比例、标题、视觉隐喻、`cover_motif`、裁切上下文。`cover_motif` 是可见的、受控的右侧对象；`visual_metaphor` 仍是选图语义，不能只停留在隐藏字段里。高质量配图在方向超出这个对象词表时使用 `content_html` + `custom_css` 做开放构图；默认 CLI renderer 适合稳定文章封面，不应当作为复杂文章配图的默认终点。

`use=in-article` / `metaphor` 子场景（Studio）的正式配图必须设置 `composition_required: true`，并有一个具体主视觉对象或场景，例如桌面、抽屉、纸页、窗口、手势、路径、容器、仪表、地图、阴影关系等。不要只用纸片、线条、抽象框和留白来替代视觉隐喻；如果拿掉标题后画面与文章关系消失，就需要重做 `content_html` + `custom_css`。`use=cover` 子场景（Stable）必须为文章型封面选择 `cover_motif`：`drawer`、`window`、`lens`、`path`、`archive` 或 `layers`；`paper-stack` 只保留给刻意的通用旧封面。

`editorial-image` 支持 `design` 和 `editorial_tone` 字段。`design` 是显式设计系统，优先级最高；`editorial_tone` 是自动选择入口，只能是 `reflective` / `sharp` / `warm` / `technical`。设计系统只控制气质层：纸面颜色、墨色、accent、边框和整体温度；不决定视觉隐喻、构图对象或文章立场。用户未指定 `design` 时，必须根据文章情绪给出 `editorial_tone`，让 CLI 落到真实存在的 Quiet Paper design。

需要候选时，方向输出格式：

```
配图方向：
1. 名称 — 视觉隐喻 / 用途 / 为什么适合 / 风险
2. 名称 — 视觉隐喻 / 用途 / 为什么适合 / 风险
3. 名称 — 视觉隐喻 / 用途 / 为什么适合 / 风险
```

可用产物：
- **公众号/博客封面图**：横版，少字，能撑住标题和分享预览
- **正文氛围插图**：安静、低干扰，用作段落之间的视觉换气
- **概念隐喻图**：用一个物、场景或动作承载文章的核心张力

比例规则：
- `公众号头图` / `公众号封面` 默认 `aspect: wechat-cover`（2.35:1，1080x460）
- `博客封面` / `blog hero` 默认 `aspect: blog-hero`（16:9，1080x608）
- `正文氛围插图` / `段落视觉换气` 默认 `aspect: body-3-2`（3:2，1080x720）
- 其他可选：`body-4-3`（4:3）、`cinematic`（21:9）、`square`（1:1）

出图前自检：完整 Acceptance Check 见 `references/mode-editorial-image.md`。其中机器可查项（标题断行、技术词空格、用途标签、brief 泄露）已由 `scripts/check-output.mjs` 自动拦截；下列剩余项需要人工审美判断。

- 如果画面在解释文章讲了什么，而不是让读者感到文章在处理什么问题，失败
- 如果换一篇文章也能用，失败
- 如果文字占比过高、像摘要卡，失败
- 如果是通用 AI 图、库存图、发光科技图，失败
- 如果使用连线、箭头、路径或结构图，线条必须连接元素边界；如果线条穿过卡片、节点、文字内部，失败
- 如果是正文氛围插图，主体视觉必须有足够占比和重量；缩略图看起来主体偏小、画面没画完，失败。中间留白本身不是问题，问题是主体尺度太小或视觉重量撑不住画布
- 正文氛围插图默认不允许可读文字和主要视觉元素交叉、压叠或互相穿插；除非用户明确要 collage/overprint 效果，否则这属于失败
- 扫描每个可见文字（包括 kicker、subtitle、页脚）：有没有任何词在描述"这张图是什么"（封面 / 头图 / 插图 / cover / hero / 配图 / 章节标签），而不是"这张图在说什么"（文章内容、真实术语、视觉对象标签）？有则改写或删掉。`check-output.mjs` 只能拦截已登记的标签，新型措辞、其他语言变体、创意改写都靠这步自检兜底

### Step 1.6: 正文解释图入口（article-diagram）

当用户要求 `正文解释图` / `关系图` / `流程图` / `边界图` / `权限边界` / `安全边界` / `trust boundary` / `article diagram` / `concept map` / `process flow` 时，进入 `article-diagram` 流程。

先读取 `references/mode-article-diagram.md`。默认采用统一 compression pack，不再先问“选哪种图型”，而是问“这段内容能被压成什么公式、什么一句话、什么结构骨架”。

压缩三件套：

| 字段 | 作用 | 要求 |
|------|------|------|
| `formula` | 核心关系 / 不变量 / 转换式 | 像公式，但不必是数学；必须能解释文章里的关系 |
| `sentence` | 人能带走的一句话 | 不复述标题，给出判断 |
| `structure` | 支撑公式的结构板 | 2-6 个节点，最多 6 条关系 |

约束：
- `structure.nodes` 最少 2 个、最多 6 个；节点标签短于 36 个字符
- `structure.relations` 最多 6 条；关系标签短于 24 个字符
- 关系标签是可选注释，不是必填结构；共同关系优先写进 `formula` 或 `sentence`
- 输入是整篇文章时，先按章节分组；有关系、流程、边界、权限、信任层、因果链或系统结构的章节都要各自生成一组 compression pack
- 纯铺垫、纯情绪、纯结论、没有结构关系的章节跳过；不要为了覆盖所有标题机械出图
- 每组 compression pack 只服务一个章节，不混合多个章节；输出顺序跟随文章顺序
- 可见文字默认跟随原文和用户请求：中文文章用中文标题、公式、句子、节点、关系和说明；英文文章用英文；只有用户明确要求英文、双语或翻译时才改变语言
- 标题描述关系，不写 `article diagram`、`正文解释图`、`concept map`、`process flow` 这类产物类型
- 如果用户给了很多材料，按章节抽出最小压缩单元；不要把文章所有观点都塞进同一张图里
- 旧 `family` 输入仍可渲染，但只用于兼容历史素材或用户明确要求的技术图
- 渲染时默认使用公式卡：只展示 `formula` 和 `sentence`，不展示标题、图序号、模板标签、顶部概括语或底部 caption
- 公式卡统一使用 Editorial Equation：主结论、短分隔线、1-3 行语义完整的关系式、1-2 行旁注；不得切换成 ledger、双栏证明页或底部大段文字
- renderer 必须先测量真实字体，再从固定字号档和 `body-2-1` / `body-3-2` 中选择可读候选；term 只能在关系符边界换行，不得拆词或靠连续缩字救场
- `structure` 仍然作为语义输入保留，用来帮助生成公式和未来结构图；除非显式要求 `render_plan: "structure"` 或 `render_plan: "split"`，否则不要默认可视化它

出图前自检：
- 公式是否真的表达关系，而不是漂亮标题？
- 一句话是否给出判断，而不是摘要句？
- 结构字段是否支撑公式，而不是强行生成一张开放形态结构图？
- 整篇文章输入时，是否已经压缩所有值得压缩的章节，并跳过不适合的章节？
- 每组图是否只对应一个章节？
- 每个可见标签都在命名内容，不是在描述图片用途？
- 节点、关系条、标题、caption 有没有互相压住？
- 主体结构是否占据画面主要面积，而不是被公式、标签或模板装饰抢走注意力？
- 缩略图里是否还看得出主结构？

### Step 2: 匹配设计系统

**Comic mode 跳过此步**：comic mode 使用固定 Quiet Paper 单色调色板，设计系统的色彩 token 不生效。直接进入 Step 4，漫画风格由 `references/mode-comic.md` 的 5 种路线（大友克洋/井上雄彦/三浦建太郎/松本大洋/谷口治郎）决定，在 Step 4 渲染时根据内容气质选择。

**editorial-image 跳过常规候选匹配**：先按 `references/mode-editorial-image.md` 确定视觉方向，再根据气质选择 Quiet Paper token。

**article-diagram 跳过常规视觉模板匹配**：先按 `references/mode-article-diagram.md` 生成 compression pack，再由 Editorial Equation 测量布局器选择语义分行、字号档和画布比例。设计系统只改变纸面气质，不改变压缩逻辑或阅读轴。

默认从 design-index.md 中直接选择 1 个最合适的品牌气质，不等待用户确认。先使用 Quiet Paper 审美骨架，再根据内容选择轻微偏向。

**匹配逻辑**：

1. **情绪→真实 design**：
   - 沉思 / reflective → `claude` / `notion` / `apple` / `ljg_chensi`
   - 锐利 / sharp → `linear` / `raycast` / `stripe` / `ljg_ruili`
   - 温暖 / warm → `claude` / `clay` / `intercom` / `posthog` / `ljg_wennuan`
   - 技术 / technical → `stripe` / `ibm` / `opencode` / `sentry` / `together_ai` / `ljg_jishu`
   - 不要把 `editorial-warm` / `technical-data` / `quiet-minimal` 等分组词写入 `design`；它们不是可渲染 design 名。
2. **主题关联**：内容领域与品牌领域有交集时加分（如 AI 内容→AI 品牌，金融→fintech）
3. **密度适配**：稀→留白风格（apple, notion），密→data-dense 风格（stripe, ibm）
4. **多样性边界**：候选之间应气质不同，但都必须保持 Quiet Paper：暖纸或深卡纸、低饱和 accent、小圆角、少阴影

如果用户明确要求候选、换一批或选择风格，默认给 2-3 个候选，每个附一句话匹配理由；用户明确指定 2-5 个候选时服从指定数量。支持 Codex 对话预览时进入 Step 3.5；其他环境只进入 Step 3 的文字候选流程，两条路径不要重复执行。

### Step 3: 候选确认（仅按需）

只有用户要求先看候选，且当前宿主不支持 Codex 对话预览时，才在终端展示文字候选。候选必须直接来自当前任务的 `Card Decision Brief.candidates`，不得预置 design 名称、固定品牌组合或与当前内容无关的示例。

```
候选方向：
1. {label} — {why} / 风险：{risk}
2. {label} — {why} / 风险：{risk}
3. {label} — {why} / 风险：{risk}
```

默认输出 2-3 个；用户明确指定 2-5 个时按指定数量输出。告知用户：选择编号（如“用 2”），或说“换一批”重新生成当前内容的方向。用户确认后进入 Step 4。

普通出图请求不要停在这里；自动选择设计系统后直接进入 Step 4。

### Step 3.5: Codex 预览决策面（仅按需）

只有当前宿主支持 Codex 对话预览，且满足以下任一条件时，才读取 `references/codex-inline-preview.md` 并生成预览：用户明确要求候选；或 `editorial-image` / `article-diagram` 存在会明显改变最终画面的多解决策。进入本步骤后不要再执行 Step 3 的文字候选流程。

1. 先形成 `Card Decision Brief`，只保留当前任务必要的内容锚点、发布任务、路由和默认 2-3 个候选；用户明确指定 2-5 个候选时服从指定数量。
2. 每个候选必须带真实可渲染的 `render_contract`，不能只展示抽象风格名或一组装饰色。
3. `editorial-image` 候选围绕视觉隐喻、用途、比例和合法 design / tone；凡方向依赖默认 scaffold 中不存在的具体物体、动作、场景或空间关系，`render_contract` 必须带 `composition_required: true`。`article-diagram` 候选围绕 `formula`、`sentence`、`structure` 和显式的 `render_plan`。
4. 用户确认后，使用宿主的 follow-up 能力把选中的规范化契约送回同一对话，再进入 Step 4；不要从预览中直接调用 CLI，也不要把候选 HTML 当成最终 PNG。
5. 如果宿主不支持预览、选择回传失败或预览无法渲染，退回文字候选列表或默认自动选择。预览失败不得跳过 schema、截图、`check-output` 或人工看图。

普通请求不经过本步骤，直接按现有流程自动选择并渲染。

### Step 4: 渲染

根据 Step 1 确定的模式，选择对应模板：

| 模式 | 模板文件 |
|------|---------|
| infograph | `assets/infograph_template.html` |
| big | `assets/big_template.html` |
| long | `assets/long_template.html` |
| whiteboard | `assets/whiteboard_template.html` |
| poster | `assets/poster_template.html` |
| comic | `assets/comic_template.html` |
| sketchnote | `assets/sketchnote_template.html` |
| editorial-image | CLI 使用 `scripts/renderers/editorial-image.js` 生成固定比例画布；AI 流程可基于视觉方向扩展定制 HTML |
| article-diagram | CLI 使用 `scripts/renderers/article-diagram.js` 生成固定槽位正文解释图 |

用户选定后：

0. 先兑现候选的可执行性契约：`use=cover` 的文章型方向必须把 `visual_metaphor` 落成一个 `cover_motif`；如果方向超出受控对象词表，或 `use=in-article` / `metaphor`，必须设置 `editorial-image.composition_required: true`，根据已选 `visual_metaphor` / `art_direction` 生成非空 `content_html` 与 `custom_css`，并保留该字段再交给 CLI。不要删除或改成 `false` 来绕过校验。只有刻意的通用旧封面才省略 `cover_motif` 并使用 paper-stack。

1. 读取紧凑设计文件：`references/designs/{name}.md`
   - `ljg-*` 色调无需读取文件，直接使用 design-index.md 中的 CSS 变量
2. Read `references/taste.md`（纸质印刷感底线）
3. Read 对应模板文件
4. 将设计 token 映射为模板 CSS 变量：

| 模板变量 | 设计系统来源 |
|----------|-------------|
| `--bg` | Quiet Paper canvas（暖纸 / 深卡纸，叠加极轻纸感） |
| `--green`（结构色） | hairline / surface-2 色，低对比结构分隔 |
| `--pink`（弹点色） | muted accent，低面积使用 |
| `--ink` | ink 主文字色（降饱和度 10-20% 模拟印刷） |
| `--ink-light` | ink-muted 色 |

字体不在此表——由 mode 固定决定，见 `references/taste.md` 第 2 节。

**字号和排版遵循 Quiet Paper 全局纪律，不遵循单个品牌系统。** 品牌系统只提供低饱和 accent、surface 温度和轻微节奏偏向。字号规则保留移动端优先标准：正文 ≥36px，标注 ≥24px。元素比例按模式分级：big≥10:1, infograph≥6:1, comic≥8:1, sketchnote≥5:1, long/poster/whiteboard≥4:1（详见 `references/taste.md`）。

**Quiet Paper 纸质印刷感**：所有输出应遵循 `references/taste.md` 第 0 节和第 6 节的纸质美学要求——暖色纸张或深色卡纸、墨感文字、降饱和度强调色、极细 hairline 边框、少卡片、少阴影，像完成的纸面而非网页截图。

5. 根据内容分析设计画面（密度/结构/锚点），原则同 ljg-card 信息图模式
6. 替换模板中的占位符（每个模板的占位符见模板文件顶部注释）
7. 写入操作系统临时目录中的 `card_{name}.html`

**Studio tier / 完整 composition 交付约定**：
- infograph / comic / sketchnote（Studio tier）统一通过结构化 contract 调用 `scripts/card.js`；renderer 负责把 HTML 写到操作系统临时目录，不要在 repo 内创建 `tmp/`
- PNG 输出到 `~/Downloads/`，文件名用内容主题或 mode 命名，避免只叫 `output.png`
- 生成 HTML 后必须走 Step 5-7；不能只保存 HTML 或只报告“已完成”
- 最终交付前必须实际查看 PNG，确认不是空白、裁切、文字重叠、主体太小或视觉关系不清
- 交付完成后删除本次生成的临时 HTML/JSON；不要删除其他进程或用户已有的临时文件

**poster 模式特殊**：每个卡片独立写入，文件名带序号 `card_{name}_{N}.html`。

**多卡批次一致性**：当内容需要拆分为多张图（信息图系列、poster 多卡、用户要求「多图」）时，必须遵守以下批次规则：

1. **Token 锁定**：在渲染第一张卡之前，先输出一套共享 CSS 变量表，所有卡片共用。变量表包含：
   - 色彩：`--bg`, `--green`, `--pink`, `--ink`, `--ink-light`（来自 Step 4 的设计 token 映射）
   - 字号梯度：标题字号 / 段落标题字号 / 正文字号 / 标注字号（来自 `taste.md` 第 2 节的 mode 规则）
   - 间距节奏：内容边距、区块间距、colophon 高度
   - 字体栈：由 mode 决定，全批次统一

2. **Token 锁定输出格式**（写在所有卡片的 HTML 之前）：
   ```
   批次 Token：
   --bg: #f5f0e8; --green: #e9e1d4; --pink: #9b6048; --ink: #2c2418; --ink-light: #6b6050
   标题: 140px serif | 段落标题: 48px zh-serif | 正文: 36px zh-serif | 标注: 24px mono
   边距: 60px | 区块间距: 40px | 圆角: 6px
   ```

3. **每张卡的 `{{CUSTOM_CSS}}` 开头必须先复制 Token 锁定表中的 CSS 变量声明**（`:root { ... }`），然后才写该卡独有的布局 CSS。这确保即使单独打开某张卡的 HTML，视觉效果也完整。

4. **禁止跨卡漂移**：不同卡之间，相同语义层级的元素必须使用相同字号。例如，如果卡 1 的正文是 36px，卡 2 的正文也必须是 36px。只有布局结构（grid、flex、positioning）允许因内容不同而变化。

**署名/来源字段**：`brand_name`、`logo`、`source` 都是可选字段，不是命令行 flag。只有用户明确提供时才把署名、头像/logo 或来源写进 footer；未提供时全部留空并隐藏对应元素。不要使用 `author` / `photo` 这类别名，也不要把维护者身份或仓库素材作为用户产物的默认值。尤其要在 Step 5 前清空未使用的 `{{LOGO}}` / `{{AVATAR}}` / `{{PHOTO}}` 占位符。

### Step 5: 出厂检查

本步骤只适用于 AI / 手工 HTML 路径。CLI 路径由 `scripts/card.js` 内部自动执行预检、`capture4k.js` 截图和脚本复查，但仍需人工看图。

生成 HTML 后先运行低风险修复 + 预检：

```bash
node scripts/check-output.mjs --html <html_path> --width 1080 --height 800 --dpr 2 --fullpage --fix --skip-png
```

固定画布模式（big / poster）不要加 `--fullpage`，并使用该模式的截图高度（通常 1440）。

预检会自动修复：
- `{{LOGO}}` / `{{FONT_BASE}}` 等基础路径占位符；`{{AVATAR}}` / `{{PHOTO}}` 只允许在用户明确提供头像时保留，未提供时必须在预检前清空
- 横向溢出保护
- 图片基础缩放保护

预检失败必须先修 HTML/CSS，不能继续截图。

预检通过后，保留人工审美自检：

- [ ] 视觉形式从内容生长出来？换内容这布局还说得出吗？
- [ ] 品牌气质可感知，但没有破坏 Quiet Paper 的统一骨架？
- [ ] 元素比例达到模式最低标准？（big≥10:1, infograph≥6:1, comic≥8:1, sketchnote≥5:1, 其他≥4:1）
- [ ] 弹点色符合品牌类型规则？（标准色 ≤2 处，弱 accent ≤3 处视觉突出点）
- [ ] 正文 ≥36px，标注 ≥24px？
- [ ] 多卡模式：每张卡只覆盖一个章节/话题？不同主题的内容没有被混在同一张卡上？
- [ ] **批次一致性（多卡时）**：所有卡片的色彩变量、字号梯度、间距节奏是否严格匹配 Token 锁定表？相同语义层级（正文、标题、标注）的字号是否完全一致？
- [ ] 卡片、阴影、色块是否足够少？告诉别人"AI 做的"会被一眼看穿？

### Step 6: 截图（4K）

模板 CSS 宽度为 1080px。capture4k.js 的 width 参数是 viewport 宽度（不是输出宽度）。DPR 参数控制输出分辨率。

```bash
node assets/capture4k.js <html_path> <png_path> 1080 800 2 fullpage
```

参数说明：`1080` = viewport 宽度（匹配模板），`800` = 初始高度（fullpage 模式下自动扩展），`2` = DPR（输出 2160px 宽），`fullpage` = 截取完整内容高度。

**多卡批次**：同一批次的所有卡片必须使用完全相同的 capture 命令参数，确保输出宽度和 DPR 一致。

### Step 7: 截图后复查

截图后必须运行：

```bash
node scripts/check-output.mjs --html <html_path> --png <png_path> --width 1080 --height 800 --dpr 2 --fullpage --fix
```

如果脚本应用了安全修复，重新截图，再用不带 `--fix` 的命令复查一次。

复查会拦截：
- PNG 未生成、为空、宽高不符合截图参数
- HTML 仍有未替换占位符
- 页面横向溢出
- 固定画布内容被裁切
- 可见元素跑出截图范围
- 图片加载失败
- 正文字号低于 36px

复查通过后，实际打开或查看 PNG，确认画面完整、清晰、主体有足够重量，文字没有重叠、裁切、孤字或明显坏行。只有脚本复查和看图复查都通过才能交付。

### Step 8: 交付

只有 Visual Review 通过并由 reviewed publisher 发布后，报告 PNG 路径；receipt 与 review 同目录保留审计证据。

## Refinement

- "换个设计系统" → 回到 Step 3
- "调整配色" → 微调 CSS 变量，保持同一设计系统
- "改布局" → 重新设计，同一设计系统

## 快捷模式（--design 指定）

用户通过 `--design` 指定设计系统时，跳过自动匹配和按需候选，直接进入 Step 4。

可用名称见 `references/design-index.md` 的目录名列。

`editorial-image` 的自动路径使用 `editorial_tone`，不要把抽象分组名写进 `design`。如果用户没有指定 `--design`，根据文章情绪填入 `editorial_tone`，由 CLI 稳定选择真实 design。

## 维护测试

改动技能或模板后，至少运行：

```bash
npm run check-output
npm test
```

CardBench 是耗时、耗 token 的发布评测。任何 `npm run eval:cardbench`（包括 `--list-cases`、single、tail 与 full）都应交给宿主提供的低成本独立执行单元，例如子代理、后台任务或隔离会话；选择具备真实渲染和图像审核能力的最低成本配置，并保持串行执行。主交互上下文只接收进度与最终报告，不直接持有评测进程。若宿主不支持独立执行，先说明预计成本并取得用户确认。开发期先跑 single/tail，合并或发布前才跑一次 full；完整命令与报告边界见 `references/eval-protocol.md`。

CLI 路径 smoke test 可用最小 big-mode 输入跑一次：

```powershell
$output = Join-Path $env:TEMP 'smoke_big.png'
[pscustomobject]@{ mode='big'; phrase='Clarity beats noise'; design='apple' } | ConvertTo-Json -Compress | node scripts/card.js --stdin --output $output
```

生成后实际查看 PNG，确认画面不是只满足文件存在；检查完成后删除该 smoke PNG。

涉及 `editorial-image` 设计选择时，还必须实际渲染并检查一组 PNG：`reflective`、`sharp`、`warm`、`technical`、显式 `design` 各 1 张。确认视觉气质确实不同、仍保持 Quiet Paper、无明显裁切/溢出/坏换行/主体过小。

涉及 `article-diagram` 时，至少实际渲染并检查一组 compression pack（默认公式卡），并回归 `concept-map`、`process-flow`、`boundary-model` 各 1 张 legacy fixture，确认缩略图里主关系清楚、节点和关系没有互相压住。

Visual Reasoning 发布前另运行 `npm run eval:cardbench -- --report evals/cardbench-results.json`。普通 `npm test` 不调用模型；CardBench 使用隔离安装、真实 PNG 和独立 Critic。

## 开发者工具（非 AI 流程使用）

| 脚本 | 用途 |
|------|------|
| `scripts/gallery-jobs.mjs` | 通过正式 Visual Job 生产链重建并字节核验 README gallery |
| `scripts/batch_render_covers.js` | 批量生成亮色封面截图 |
| `scripts/batch_render_covers_dark.js` | 批量生成暗色封面截图 |
