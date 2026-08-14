# 模具：多卡（-c）

## 步骤 1：读取模板

Read `assets/poster_template.html`

## 步骤 1.5：色调感知

与长图模具共享同一套色调系统。根据内容气质选择 `{{BG_COLOR}}` 和 `{{ACCENT_COLOR}}`：

| 内容气质 | `{{BG_COLOR}}` | `{{ACCENT_COLOR}}` | 触发信号 |
|----------|---------------|-------------------|----------|
| 思辨/哲学 | `#FAF8F4` | `#7C6853` | 认知、思维、本质、意义、哲学 |
| 技术/工程 | `#F5F7FA` | `#3D5A80` | 架构、模型、算法、系统、代码 |
| 文学/叙事 | `#FBF9F1` | `#6B4E3D` | 故事、人物、写作、文字、诗 |
| 科学/研究 | `#F4F8F6` | `#2D6A4F` | 实验、数据、发现、论文、研究 |
| 默认 | `#FAFAF8` | `#4A4A4A` | 无法归类时 |

## 步骤 2：内容预处理

- 识别标题行（`#`/`##`/`###` 开头，或独立短行）
- 识别引用块（`>` 开头）
- 识别加粗（`**text**`）
- **识别金句**：独立成段的短句（通常 < 25 字），承载核心洞察，用 `.highlight` 渲染
- 按空行分割为段落列表

### `reading-notes` 组合变体

当输入是多条个人划线 / 想法，且没有明确要求长图或结构图时，使用 `mode: "poster"` + `variant: "reading-notes"`。这不是新的 mode，也不改变普通 Poster 的默认行为。

普通 Poster 只使用 contract 顶层 `title`；不要给 `cards[]` 添加 `title`。`cards[].title` 仅由下面的 `reading-notes` 变体支持。

```json
{
  "mode": "poster",
  "variant": "reading-notes",
  "title": "边界练习｜第一章",
  "source": "微信读书 · 《边界练习》",
  "cards": [
    {
      "title": "主题整理｜边界让选择落地",
      "body": [
        {
          "type": "reading_unit",
          "quote": "清楚的边界，让每一次选择都能被看见。",
          "thought": "限制不是目的，能解释自己的选择才是。"
        }
      ]
    }
  ]
}
```

`reading_unit` 只用于这个变体：

- `quote` 必填且非空，必须逐字保留来源划线。
- `thought` 可选；只有来源层已有精确配对时才填写。空值不显示 `我的想法` 区块。
- 渲染顺序固定为 `原文划线` → quote → `我的想法` → thought。
- 没有配对 quote 的章节点评 / 整本书评不用 `reading_unit`，继续用 `items` / `paragraph` 并显式标注类型。
- `cards[].title` 是主题整理标签，不得伪装成书中原有小节。

编排边界：

- 1–8 个内容单元全部保留。
- 超过 8 个且用户未要求全量时，整理成 6–8 张卡，每张约 2–4 个相关内容单元；优先保留个人想法、章节点评和形成转折的划线，交付时报告 `本次使用 X / 可用 Y`。
- 用户明确要求每条都要时，保持原始顺序，分成每批最多 8 张卡，不得静默丢弃，也不得塞进一张超长 Poster。
- 第一张卡必须同时呈现系列标题和实际内容，不允许 title-only 首卡。

### 证据媒体与原生流程

普通 Poster 还支持两个受约束的正文元素。它们解决的是证据和布局，不是开放任意 HTML/CSS：

```json
{
  "mode": "poster",
  "kicker": "COMMAND-LINE WORKFLOW",
  "title": "把仓库压成可审阅的输入",
  "cards": [
    {
      "body": [
        {
          "type": "media",
          "path": "C:/absolute/path/current-output.png",
          "alt": "当前版本输出界面",
          "caption": "由当前官方工作流产生的输出。",
          "fit": "cover",
          "position": "top"
        }
      ]
    },
    {
      "body": [
        {
          "type": "process",
          "steps": [
            { "label": "01", "title": "输入", "text": "选择仓库或目录。" },
            { "label": "02", "title": "控制", "text": "执行原样保留的命令。" },
            { "label": "03", "title": "输出", "text": "检查可交付文件。" }
          ]
        }
      ]
    }
  ]
}
```

- `media.path` 必须是显式给出的、可读的本地 PNG/JPEG/WebP 绝对路径；拒绝 UNC、设备 namespace 与 renderer 联网。运行时在 Chromium 前创建私有快照，限制单文件及整份 poster 合计 32 MiB、单边 8192 px、整份 poster 解码像素合计 4000 万，验证容器后以内嵌 data URL 渲染；原始路径不会进入浏览器 allow-list。
- 通过 Visual Job 编排 `media` 时必须使用 v3，使每张媒体卡绑定 current primary evidence，而且 source unit 的 `digest` 必须匹配私有快照 SHA-256；候选 receipt 和 checked HTML 继续封存该摘要。低级 `card.js` 仍可直接渲染已验证的本地 contract。
- `media` 是主证据场，不是把完整卡片、带标题的 article-diagram 或另一张 poster 再嵌进来。界面与输出必须来自当前版本，`alt` 只用于可访问性，事实说明放在可见 `caption`。
- `media.fit` 默认是 `contain`，保证界面、终端输出和图表边缘不被静默裁掉。只有在裁切不会损失证据且构图确实需要时，才显式选择 `cover`。
- `process` 固定为 2–5 步，只接受 `label`、`title`、`text`；短流程优先使用它，不要先生成一张流程图截图再塞回 poster。仅含一个 `process` 的首卡或续卡会让流程按可用阅读区伸展，避免固定高度留下无意的大空洞。
- 每张普通卡应只选择一个主证据职责；`reading-notes` 变体不接受 `media` 或 `process`。
- `check-output` 会拒绝缩成小块或在正文后留下意外大空洞的 media/process。主体宽度至少占卡片约 78%；证据图根据首卡、续卡和相邻正文在画布约 25%–76% 之间自适应，流程场约占 38%–65%，正文主场需填满可用阅读区。`fit: contain` 按图片实际绘制矩形而非 CSS 容器计量；只能形成细条的极端横图或竖图不能冒充主证据场。
- 多卡系列可用顶层 `kicker` 作为统一的 running label；首卡与续卡都显示同一骨架和 `01 / 03` 式页码。没有 `kicker` 时，首卡 running label 留空以避免与主标题重复，续卡回退到系列标题。

## 步骤 3：计算视觉重量

模板在 1080x1440 全分辨率渲染，正文 36px，行高 1.7。

- 普通段落：字符数 × 1.4
- 标题行（h1 首卡 84px）：字符数 × 6.0
- 金句（`.highlight` 40px + 左边框 + 上下留白）：字符数 × 3.0
- `.item` 条目组（label + 正文）：字符数 × 1.8
- 引用块：字符数 × 1.7
- 分割线（divider）：固定 60 权重
- 代码块：字符数 × 2.2
- Running title（续页头部）：固定 70 权重

## 步骤 4：语义切分

### 核心原则：一卡一题

每张卡片只讲一个话题。不同章节的内容绝不出现在同一张卡上——读者扫一眼页码标题就该知道这张卡讲什么。宁可多一张卡，也不要把两个主题的内容挤在一起。

### 第一步：识别章节边界

扫描所有 h2/h3 标题，将内容分成**章节组**。每个章节组 = 一个标题 + 其后续所有内容元素（段落、条目、引用等），直到下一个同级或更高级标题，或文末。

没有标题的内容（开头的摘要/引言、文末的总结）各自独立成组。

### 第二步：按章节分配卡片

每个章节组**独立**分配卡片，不同章节组的内容绝不合并：

1. 计算章节组的视觉重量总和
2. **≤ 380**：整组放入一张卡（即使这卡只有 100 权重——留白就是呼吸）
3. **> 380**：在组内段落/条目边界切分，每张卡 ≤ 380（见第三步）
4. **绝不将不同章节组的内容合并在同一张卡上**，即使两张卡都很空

### 第三步：组内切分规则

当单个章节组超过 380 权重需要在组内切分时：

- 绝不在句子中间切
- 优先在段落/条目边界切
- 标题不落单（必须跟至少一个内容元素在同一卡）
- 超长单段在句号处强制切
- 切出的每张卡开头复述章节标题作为小标题（`<p class="subtitle-tag">原章节标题</p>`），让读者知道上下文

### 特殊情况

- 只有一张卡：不显示页码
- 多张卡：首卡与续卡都显示 `01 / 0N` 格式页码；`kicker` 存在时统一显示为 running label；没有 `kicker` 时首卡留空、续卡回退到系列标题

## 步骤 5：格式化为 HTML

**基础元素：**
- 普通段落 → `<p>文本</p>`
- 章节标题（##/### 级别） → `<h2>标题</h2>`
- 引用 → `<blockquote><p>引用</p></blockquote>`
- 加粗 → `<strong>文本</strong>`
- 列表 → `<ul><li>...</li></ul>`

**金句（独立成段的核心洞察短句，视觉突出）：**
```html
<p class="highlight">金句文本</p>
```
判断标准：独立成段、< 25 字、承载关键洞察。用 `.highlight` 而非 `<p><strong>`。

**条目组（有标题+正文的并列条目）：**
```html
<div class="item">
  <p class="label">条目标题</p>
  <p>条目正文</p>
</div>
```

**副标题标签：**
```html
<p class="subtitle">标签文字</p>
```

**分割线（章节之间）：**
```html
<div class="divider"></div>
```

## 步骤 6：渲染模板

对每张卡片，替换模板变量：

| 变量 | 规则 |
|------|------|
| `{{BG_COLOR}}` | 步骤 1.5 确定的背景底色 |
| `{{ACCENT_COLOR}}` | 步骤 1.5 确定的强调色 |
| `{{HEADER_BLOCK}}` | 多卡的每一张：`<div class="header"><span class="running-title">kicker；无 kicker 时首卡为空、续卡为系列标题</span><span class="page-indicator">01 / 03</span></div>`；单卡为空 |
| `{{TITLE_BLOCK}}` | 首卡有标题时：`<div class="title-area"><h1>标题</h1></div>`；续页卡或无标题时：空字符串 |
| `{{BODY_HTML}}` | 步骤 5 生成的 HTML |
| `{{SOURCE_LINE}}` | 内容来源（可选）：`<span class="info-source">来源文字</span>`，无来源时空字符串 |
| `{{PAGE_INFO}}` | 多卡时 `1 / 3`，单卡时空字符串 |

**结尾标记**：仅在最后一张卡的 `{{BODY_HTML}}` 末尾追加 `<p style="text-align:right;font-size:16px;color:#ACACB0;margin-top:40px;">∎</p>`。非末页不加。

写入操作系统临时目录：`<system_temp>/card_poster_{name}_{N}.html`

## 步骤 7：截图

```bash
node assets/capture4k.js <system_temp>/card_poster_{name}_{N}.html ~/Downloads/{name}_{N}.png 1080 1440 2
```

多张卡片可并行截图。

交付时报告卡片数量 + 每张摘要（前 30 字）。
