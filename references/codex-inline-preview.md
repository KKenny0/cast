# Codex 对话预览

## 定位

Codex 对话预览是渲染前的决策面，不是第 10 个 mode，也不是 PNG renderer 的替代品。它只负责把几个高价值的视觉决策变成可选择的候选卡；用户选定后，仍回到 card-skill 现有的 schema、renderer、Playwright 截图、`check-output` 和 PNG 交付链。

这个入口只在支持对话内交互卡片的 Codex 桌面环境中启用。Codex CLI、IDE、其他 coding agent 或当前宿主不支持该能力时，沿用同一份候选契约输出文字列表，不得让预览能力阻塞出图。

## 触发条件

只有满足以下任一条件时才启用预览：

- 用户明确说“给几个方向”“先选风格”“换一批”或“先别出图”；
- `editorial-image` 存在多个同样合理的视觉隐喻、用途或画布比例；
- `article-diagram` 存在多个同样合理的公式压缩方式，且选择会明显改变阅读轴。

普通出图请求仍然自动选择最强方向并直接渲染。不要为了展示交互而增加候选、控制器或确认步骤。

## 决策契约

在生成候选卡前，先形成一份只包含当前任务必要信息的 `Card Decision Brief`：

- `content_anchor`：一句话说明画面要让读者看见什么，不写整篇文章摘要；
- `publish_task`：封面、正文配图、正文解释图、社媒卡片或阅读报告；
- `route`：最终要走的 mode、tier 和必要的结构字段；
- `candidates`：默认 2-3 个候选；用户明确指定 2-5 个时服从指定数量。每个候选都必须有唯一 `id`。

每个候选至少包含：

- 面向用户的 `label`；
- 真实可渲染的 `mode`、`design`、`use`、`aspect` 或对应结构字段；
- 一句 `why`，说明它为什么适合当前内容；
- 一句 `risk`，说明它可能牺牲什么；
- 选中后可直接交给正常渲染流程的 `render_contract`；契约必须明确默认 scaffold 是否足以兑现方向，不能把这项判断留到出图后。

候选的 visible label 可以是自然语言，不要求用户学习内部 mode 名称。`article-diagram` 不公开 `family` 选择；候选应围绕公式、句子和结构骨架表达差异。

## 展示结构

Codex 预览使用“轻量选择器 + 单一主预览 + 选中详情 + 单一确认动作”，不要把每个候选做成并排的多行文字卡。

1. 第一屏默认选中第一个候选，让主预览立即可读，但不得自动确认或生成 PNG。
2. 候选选择器只显示短 `label`，使用宿主提供的 content-sized button、radio 或同等原生控件；允许换行，不使用横向滚动。
3. 中间只保留一个占主要宽度的主题感知 SVG 主预览，切换候选时更新同一画面。`editorial-image` 根据视觉隐喻、用途和比例画方向草图；`article-diagram` 根据公式、句子和结构骨架画压缩草图。草图用于比较方向，不冒充最终 PNG。
4. 主预览下只展示当前候选的 `why`、`risk` 和必要渲染字段；未选中的候选不重复展开详情。
5. 最后只保留一个明确的确认按钮，确认后回传当前候选的规范化 `render_contract`。

不要把多行说明、风险、字段列表或嵌套块放进 `.btn` / `.btn-block`；不要并排放置 3 个富文本按钮；不要给宿主按钮写固定高度。按钮只承担选择，视觉表达交给单一主预览。

主预览和所有自定义 SVG 颜色必须来自宿主 theme variables，并提供 `title` / `desc` 或等价的可访问说明。320px 下选择器可自然换行、主预览保持全宽；736px 下仍只显示一个主预览，不拆成多张并排卡。

## 两个首版完整入口

### editorial-image

候选应围绕以下真实决策展开：

- 视觉隐喻：物、场景或动作；
- 编辑用途：`cover`、`in-article` 或 `metaphor`；
- 画布比例：`wechat-cover`、`blog-hero`、`body-3-2` 等；
- 配色气质：合法的 `editorial_tone`，或用户显式要求的兼容 `design` 调色板；两者都不能改变 Kenny Style 的构图与几何。

候选不能只是换一组品牌名，也不能把文章重新摘要成 bullet points。每个方向都要能说明画面与文章张力的关系。

每个 `editorial-image.render_contract` 都要完成一次“可执行性分类”：

- 如果方向依赖具体物体、动作、场景、空间关系或概念隐喻，写入 `composition_required: true`。候选阶段不需要提前塞入大段 HTML/CSS，但 Step 4 必须先生成 `content_html` 与 `custom_css`，再把完整契约交给 CLI。
- 只有当默认标题区加纸张 scaffold 本身就是有意的最终构图时，才省略该字段或设为 `false`。`use=cover` 不能自动推导为 scaffold 足够。
- 主预览如果已经画出了默认 scaffold 中不存在的对象或关系，这个候选就必须标记 `composition_required: true`。预览不能承诺一套画面、最终却静默退回通用纸堆。

`composition_required` 是执行门，不是新的视觉模式。它不会替代 `visual_metaphor`、`art_direction` 或定制构图，只负责阻止不完整契约进入最终渲染。

### article-diagram

候选应围绕 compression pack 展开：

- `formula`：核心关系、不变量或转换式；
- `sentence`：读者带得走的一句话判断；
- `structure`：支撑公式的最小节点和关系骨架；
- `render_plan`：只有用户明确要结构图时才改变默认公式卡路径。

输入整篇文章时，候选仍按章节独立生成，不把多个章节混进一张选择卡。最终渲染默认仍是 Editorial Equation 公式卡。

其他 mode 可以复用同一决策契约做设计选择，但首版不为它们增加专属预览模板，也不改变原有直接渲染路径。

## 选择回传

预览中的选择只改变本地选中状态。Codex 会话中按当前对话可视化工具的 fragment contract 生成线程级预览文件，并在回复中放置对应的 `::codex-inline-vis{file="<title>.html"}` 指令；预览文件不写入 `card-skill` 仓库。

用户确认后，在宿主接口可用时使用 `await window.openai.sendFollowUpMessage({ prompt, title })`，把 `content_anchor`、候选 `id` 和 `render_contract` 回传给同一对话，再继续 Step 4 渲染；不要从预览中直接调用 `scripts/card.js`，也不要把候选 HTML 当成最终 PNG。

若选中的 `render_contract.composition_required` 为 `true`，follow-up 必须保留这个字段。主流程生成 `content_html` 与 `custom_css` 后再执行 CLI；不得通过删除或改成 `false` 来绕过契约。

回传内容只带规范化后的必要字段，不重复发送完整文章、账号凭证、原始 API 回包或未选中的候选。若 follow-up 能力不可用，保留清晰的文字 fallback，例如“回复：用 2”，然后由主流程读取同一份契约继续渲染。

预览不得使用 `fetch`、XHR、WebSocket 或新的外部服务。它只消费当前对话已经得到的内容和候选。

## 隐私与跨 agent 降级

- 微信读书任务只消费官方来源 Skill 已规范化的个人内容或统计；预览不负责认证、分页、账号查询或 deepLink；
- 候选卡不显示 API Key、书籍 ID、原始回包或不必要的个人数据；
- 不支持预览的宿主直接输出文字候选列表，保持原有 agent 兼容性；
- 预览失败、空白或选择回传失败时，回到文字候选或默认自动选择，不改变 PNG 质量检查。

## 交互验收

- 普通请求不出现预览；
- 明确要求候选时，默认候选数量为 2-3 个；用户明确指定 2-5 个时数量一致，且未确认前不生成 PNG；
- 第一屏已有可读的主预览，选择器只包含短标签；页面中不存在并排的多行富文本按钮；
- 切换候选时只更新同一个主预览和一组当前详情，不复制完整候选说明；
- 选中后，`mode`、`design`、`use`、`aspect` 和结构字段准确进入正常渲染流程；
- 预览出现默认 scaffold 不具备的具体对象或关系时，回传契约包含 `composition_required: true`，最终 CLI 输入同时包含非空 `content_html` 与 `custom_css`；
- 320px 到 736px 宽度下不溢出，按钮可用键盘操作，选中状态不只依赖颜色；
- 预览不绕过 schema、截图、`check-output` 和人工看图；
- Codex CLI、IDE、其他 agent 和无预览宿主仍能完成原有文字候选或直接出图流程。
