# Kenny Style 视觉语法（所有 mode 共用）

所有 mode 生成 HTML 前都要经过本准则校验。这不是一个可选 `design`，而是 card-skill 唯一的 house grammar：决定编辑取舍、排版、比例、构图、材质与节奏。

## 0. Kenny Style

Kenny Style 从当前纸面实践中继续生长，不与其他 style 并列，也没有 `kenny` 选择器。Quiet Paper 是它的材质基础；证据编辑、关系优先和删到最小充分，才是它的判断方式。

**编辑语法：**
- 一张图只承担一个判断、关系或证据职责；内容不足时少出图，不重复凑数。
- 引文、命令、数字与来源保持可核对；视觉不能把不确定信息装成事实。
- 先找到内容中的关系、张力或动作，再决定构图；不把摘要换成漂亮版式。
- 标题承担判断，正文给出具体对象、动作和边界；删掉行业背景、产物标签与装饰性解释。

**统一骨架：**
- 页面像完成的纸面：暖纸底、深墨文字、极少装饰。
- 层级靠字号、留白、位置和细线，不靠大阴影、发光、炫彩块。
- 卡片只在内容真的需要分组时出现，默认用留白和 hairline 分隔。
- accent 只作为低面积标记，不能成为背景主色或大面积填充。
- 同一张图内最多一个彩色强调色；暗色图也是深色卡纸，不是发光 UI。

**颜色层边界：**
- `reflective` / `sharp` / `warm` / `technical` 只改变 canvas、ink、muted ink、accent、surface 与 hairline 的颜色。
- 显式 `design` 只作为兼容 palette preset；品牌或旧来源中的字体、圆角、布局、组件、密度和阴影建议一律忽略。
- tone 或 design 不得改变字号、字体、字重、字距、行距、间距、半径、元素尺寸、位置、换行、视觉隐喻或内容结构。
- 去掉颜色后，不同 tone 与显式 palette 的输出仍须看出同一作者性。

## 1. 基线参数

| 维度 | 默认值 | 含义 |
|------|--------|------|
| DESIGN_VARIANCE | 8 | 1=完美对称，10=艺术混沌 |
| VISUAL_DENSITY | 4 | 1=画廊留白，10=驾驶舱信息密度 |

根据 mode 自动调整：
- `-l` 长图：DESIGN_VARIANCE=5, VISUAL_DENSITY=3（阅读舒适优先）。变化通过**色调感知**实现——不同内容气质对应不同背景底色和强调色（见 mode-long.md 步骤 2.5）
- `-i` 信息图：DESIGN_VARIANCE=7, VISUAL_DENSITY=8（数据密度优先）。变化通过**动态 REF 编码**和**内容驱动的自定义布局**实现
- `-p` 多卡海报：DESIGN_VARIANCE=9, VISUAL_DENSITY=2（视觉冲击优先）。与长图共享色调系统，结尾标记仅在末页出现

## 2. 排版工程

### 字体由 mode 固定决定，不受 tone 或 palette 影响

Kenny Style 决定字体、正文尺度、卡片纪律和纸面材质。tone 与显式 palette 不得影响这些属性；字体由 mode 唯一决定。

**中文字体按 mode 分配：**

| Mode | 中文标题 | 中文正文 | 理由 |
|------|---------|---------|------|
| 信息图 infograph | 香萃等粗宋 | 香萃等粗宋 | 结构化数据需要清晰可读 |
| 长文 long | 香萃等粗宋 | 香萃等粗宋 | 长篇阅读需要舒适温润 |
| 白板 whiteboard | 香萃等粗宋 | 香萃等粗宋 | 逻辑推理需要干净线条 |
| 多卡 poster | 香萃等粗宋 | 香萃等粗宋 | 多卡分割需要统一一致 |
| 正文解释图 article-diagram | 香萃等粗宋 | 香萃等粗宋 | 结构解释仍是纸上标注，不是产品 UI |
| 文章配图 editorial-image | 香萃等粗宋 / 香萃打字机体 | 香萃等粗宋 | 封面和正文图必须回到纸面作品感 |
| 大字报 big | 香萃打字机体 | 香萃打字机体 | 大字号下洇墨质感最出彩 |
| 手记 sketchnote | 香萃打字机体 | 香萃打字机体 | 叙事温度 + 机械手感 |
| 漫画 comic | 香萃打字机体 | 香萃打字机体 | 单色戏剧 + 断连 = 分镜感 |

**西文和数字不按 mode 变，始终统一：**

| 角色 | 字体 | CSS |
|------|------|-----|
| 西文标题 | DM Serif Display | `font-family: 'DM Serif Display', Georgia, serif` |
| 西文正文 | DM Sans | `font-family: 'DM Sans', -apple-system, sans-serif` |
| 数字/代码 | JetBrains Mono | `font-family: 'JetBrains Mono', monospace` |

Google Fonts CDN 引用：
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**中文 CSS 变量（由 mode 决定）：**
- `--zh-serif`: 阅读类 = `'XiangcuiDengcusong', serif` / 表现类 = `'XiangcuiDazijiti', serif`
- 字体文件本地加载：`assets/fonts/XiangcuiDengcusong.ttf`、`assets/fonts/香萃打字机体 W40.ttf`

### 标题
- 大标题：`letter-spacing: 0`，`line-height: 1.05`
- 墨压感：`text-shadow` 模拟油墨压入纸张（亮底用白上缘，暗底用暗上缘）
- 墨迹扩散：`filter: drop-shadow(0 0 0.5px rgba(ink,0.12))` 模拟油墨渗入纤维
- **禁用 Inter 作为标题字体**（标题用 DM Serif Display），正文用 DM Sans

### 正文
- `line-height: ≥1.6`
- 信息图：正文 ≥36px、标注 ≥24px
- 元素比例达到模式最低标准（见下表）

### 元素比例（按模式分级）

| 模式 | 最低比例 | 理由 |
|------|---------|------|
| big | ≥ 10:1 | 大字号对极端对比是核心卖点 |
| infograph | ≥ 6:1 | 数据密度需要更多中等字号 |
| comic | ≥ 8:1 | 单色戏剧感依赖清晰层次 |
| sketchnote | ≥ 5:1 | 杂志排版允许更大标题但不过分 |
| long | ≥ 4:1 | 阅读舒适优先，极端对比干扰阅读 |
| poster | ≥ 4:1 | 多卡一致性限制了单卡内的极端 |
| whiteboard | ≥ 4:1 | 推理链需要连续可读的字号 |

### accent（弹点色）分级规则

palette accent 的视觉强度决定弹点计数方式。Kenny Style 默认将所有 accent 降噪为低饱和墨色，彩色面积应明显小于内容面积：

| Palette 类型 | accent 特征 | 弹点规则 |
|----------|-----------|---------|
| 标准色（如 #635bff, #d97757） | 彩色，视觉突出 | ≤ 2 个彩色弹点 |
| 弱 accent（与 ink 明度差 < 30%） | 如 Vercel 白、IBM 深蓝 | ≤ 3 个视觉突出点，用 font-weight + size 区分而非颜色 |

判断方法：计算 accent 与 ink 的相对明度差。差值小时按"弱 accent"处理。
- 段落文本颜色避免纯黑纯白

### 数字
- 所有数字用 JetBrains Mono（等宽 = 打字机油墨感）

## 3. 色彩校准

### 硬性规则
- 最多 **1 个强调色**，饱和度 < 80%
- **禁止「AI 紫蓝」**：紫色按钮光晕、霓虹渐变一律禁止
- 同一张图内严格统一冷暖调——不在暖灰和冷灰之间摇摆
- **禁止纯黑** `#000000`：用 Off-Black（`#1a1a1a`）、Zinc-950 或炭灰
- **禁止纯白** `#ffffff` 作为页面底色或大面积卡片底色：用 parchment / ivory / warm sand
- palette 不得把大面积背景改成高饱和色；accent 只允许低面积出现

### 渐变约束
- 不要对大标题使用渐变填充文字
- 背景渐变仅限微妙过渡，避免色彩跳跃

## 4. 布局多样化

### DESIGN_VARIANCE > 4 时
- **禁止居中 Hero**：标题不要默认居中。用左对齐、分屏、非对称留白
- **禁止「三等分卡片」**：3 列等宽并排是 AI 生成的头号标志。用 2 列锯齿、非对称网格、或横向滚动替代

### DESIGN_VARIANCE ≥ 8 时
- 使用 CSS Grid 分数单位（如 `grid-template-columns: 2fr 1fr 1fr`）
- 允许大面积留白（`padding-left: 20vw` 级别的空间感）
- 允许 Masonry 式错落布局

### 卡片与容器
- 卡片仅在层级关系（elevation）有功能需求时使用
- 数据指标让它们「呼吸」——用 `border-top`、`divide-y` 或纯留白分组，而非一个个方盒子
- 阴影只允许 whisper shadow 或 ring shadow；能用留白和 hairline 解决时不要用阴影

## 5. AI 生成禁忌清单

生成任何视觉内容前，逐项排查以下 AI 典型痕迹：

### 视觉 & CSS
- **禁止外发光**：不要 `box-shadow` 默认光晕。用内边框或染色阴影
- **禁止过饱和强调色**：强调色必须与中性色优雅融合
- **禁止自定义鼠标指针**（静态图不涉及，但生成 HTML 时也不要加）

### 排版
- **禁止 Inter 作为标题字体**：标题统一使用 DM Serif Display。正文用 DM Sans。中文用香萃字系
- **禁止 H1 尖叫**：标题不要靠单纯放大来建立层级。用字重和颜色控制

### 内容 & 数据（「Jane Doe 效应」）
- **禁止通用人名**：John Doe、Sarah Chan、Jack Su 禁止出现。用有创意的真实名字
- **禁止假数据**：不要 `99.99%`、`50%`、`1234567`。用有机的「脏」数据（`47.2%`、`+1 (312) 847-1928`）
- **禁止创业烂名**：Acme、Nexus、SmartFlow 禁止。发明有品味的品牌名
- **禁止 AI 文案腔**：「赋能」「无缝」「释放」「下一代」禁止。用具体动词
- **禁止 Unsplash 链接**：如需占位图，用 `https://picsum.photos/seed/{随机字符串}/800/600` 或 SVG

### 间距 & 对齐
- padding 和 margin 必须数学精确，不留尴尬间隙
- 相邻元素严格对齐，视觉线条贯通

## 6. 材质与表面

### 纸质印刷感（Paper / Print Aesthetic）

Kenny Style 的 Quiet Paper 材质应该像**印刷品**，不是网页截图。暗色系和亮色系的策略不同：

#### 暗色系：像印在深色卡纸上的印刷品

核心感觉：墨水印在深色纸面上，克制、不发光、像高端画册的深色页。

- **底色用暖调深色**：深棕灰 `#1a1815`、墨色 `#151413`、炭灰 `#1c1a17`。不用纯黑 `#000000`
- **文字色用暖白**：`#e8e2da`（暖白）、`#d4cec4`（米灰），不用冷白 `#ffffff`
- **不加纹理**——深色印刷品表面光滑，没有可见纤维
- **不用发光效果**——no glow、no 内阴影亮边、no 渐变高光。深色卡纸是哑光的
- **层级靠 surface 亮度梯度**，不靠阴影或纹理

#### 亮色系：像印在纸张上的印刷品 + 纸张本身

核心感觉：浅色底就是纸张色，文字是深色墨水。需要让人感受到"纸"。

- **底色就是纸张色**：暖米 `#f5f0e8`、奶油 `#faf8f4`、象牙 `#fefcf7`。不用纯白 `#ffffff`
- **文字色用深墨**：`#2c2418`（深褐墨）、`#3a3530`（棕墨）。不用纯黑 `#000000`
- **微弱的纸张不均匀感**：用极淡渐变 `radial-gradient(ellipse at 30% 25%, rgba(255,245,225,0.4), transparent 60%)` 模拟纸张色差不均匀。不要加可见纹理——纸的纹理你几乎看不到，但你知道它不是纯色
- **噪点纹理 opacity ≤ 0.03**——几乎不可见但消除了数字纯色的"塑料感"

#### 共用规则

**饱和度压制 — 像 CMYK 印刷**：
- palette 强调色使用时降饱和度 10-20%。屏幕上的高饱和色应降成更像纸墨的低饱和色
- 禁止荧光色。所有颜色想象它在铜版纸上的效果
- 渐变使用印刷式的：从深到浅同一个色调，不要多色渐变

**边框与分隔 — 像印刷对位线**：
- 用极细 1px 线条（light 用 `rgba(0,0,0,0.06-0.08)` / dark 用 `rgba(255,255,255,0.04-0.06)`）
- 不用粗边框、不用阴影。层级靠 surface 梯度和留白
- 卡片圆角偏小：4-8px（印刷品不会有 24px 圆角）

**留白 — 像版面设计**：
- 上下留白大于左右（模拟纸张的天地边距）
- 内容区两侧留出充足边距（像书籍的版心）
- 元素之间用留白而非线条分隔——呼吸感来自空间，不是边界

### 玻璃态（Glassmorphism）
默认不使用。显式 palette 也无权开启玻璃态；Kenny Style 回避数字 UI 隐喻。

### 圆角
- 主容器用小圆角（`border-radius: 4-8px`），像印刷品的轻微倒角
- 极小元素（标签、按钮）可以用 `border-radius: 3-4px`
- 禁止大圆角（>12px），那是 UI 不是印刷

### 字体加载验证（Font Load Verification）

`@font-face` 声明不等于字体已加载。src URL 错误、文件被 `.gitignore` 排除、字体名拼写错误、文件名编码问题（中文字体名！）——浏览器都会**静默 fallback** 到系统字体，渲染不报错，但视觉上字符高度、字重、字形全变。

预检脚本（`scripts/check-output.mjs`）会在每次出图时遍历所有 `@font-face` 声明，调用 `document.fonts.check()` 验证实际加载状态，失败立即报 `font_load_failed` ERROR 阻断交付。

生成 HTML 后自检：
- [ ] 每个 `@font-face` 的 `src` 是否指向真实存在的字体文件？
- [ ] `font-family` 名称是否和 CSS 调用处拼写完全一致（区分大小写、空格、引号）？
- [ ] 字体文件是否 `git tracked`？查 `.gitignore` 别把 `assets/fonts/*` 又排除掉了。
- [ ] 中文字体文件名含中文时，`src: url(...)` 路径是否正确 URL-encoded？

调试 fallback：在浏览器 devtools console 跑一行
```js
document.fonts.check('16px XiangcuiDengcusong')  // true 才算加载成功
```

## 7. 出厂自检

生成 HTML 后、截图前，逐项确认：

- [ ] 是否避免了居中 Hero（DESIGN_VARIANCE > 4 时）？
- [ ] 是否避免了三等分等宽卡片？
- [ ] 标题是否用了非 Inter 字体（DM Serif Display）？
- [ ] 颜色是否统一冷暖调，无纯黑？
- [ ] 强调色是否 ≤ 1 个且饱和度 < 80%？
- [ ] 数据是否真实感（非 99.99% 式假数据）？
- [ ] 文案是否去除了 AI 腔（赋能/无缝/释放）？
- [ ] 间距是否数学精确，无尴尬留白？
- [ ] 卡片、阴影、色块是否足够少？能否继续用留白或 hairline 降噪？
- [ ] SVG 内 `<text>` 是否在所属 `<rect>/<circle>/<ellipse>` 内（按字宽公式留 ≥16px padding）？
- [ ] 每个 `@font-face` 都已真加载（无静默 fallback 到系统字体）？
- [ ] SVG 内每个 `<text>` 是否在它语义标注对象的 bbox 正中央（`text-anchor="middle"` + 对象中心坐标）？标签不"挂在边缘"或"避其他标签"，重叠用背景色对比或垂直分离解决。
