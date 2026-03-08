[2026-02-04] - Nova
### Funnel/Flow（Chart）：编码选择提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/charts.csv :: 图表决策：Funnel/Flow

### Funnel/Flow：图表不是样式，是编码选择——把数据语义编译成图表决策

**来源**：UI UX Pro Max / charts.csv

---

【哲学本质】
图表的核心是“编码选择”：你用什么视觉通道（位置/长度/角度/颜色）承载哪类信息，决定了用户会不会误读。
一句话：**图表是认知接口，不是装饰模块。**

【美学签名】
- 优雅之处：用最少的视觉通道讲清楚数据语义，并把对比基准显式化
- 避开的陷阱：为了好看加太多动效/渐变/阴影，反而遮住结论
- 美学原则：清晰优先（可读）+ 稳定映射（可学）+ 可访问性兜底（可用）

【核心取舍】
[牺牲] 一些炫技表现 [换取] 更少误读与更强解释力
[质变临界]：当交互层级过深（hover 才能看懂）时，图表会从“解释”变成“谜题”

【可迁移洞察】
- 灵魂（必须保持）：数据语义 → 编码通道 → 基准/刻度 → 颜色映射 → 交互层级
- 皮相（照搬有害）：具体库选择（应随技术栈与性能约束变化）
- 迁移边界：当用户只需要“结论”而不是“探索”，应降低交互层级，强化标注与对比

【启发一句话】
> “一张好图表的美，不在渐变，而在‘不会被误读’。”

【思维模型】
【Prompt Macro（Chart: Funnel/Flow）】
- 数据语义：Funnel/Flow（关键词：funnel/flow)
- 首选图表：Funnel Chart, Sankey（备选：Waterfall (for flows)）
- 颜色策略：Stages: gradient (starting color → ending color). Show conversion %
- 可访问性：✓ Clear stage labels + percentages. Good for accessibility if labeled.
- 交互层级：Hover + Drill（不要把理解成本藏在 hover 里）
- 推荐库：D3.js, Recharts, Custom SVG


---

**证据来源**：src/ui-ux-pro-max/data/charts.csv :: Funnel/Flow 行给出首选/备选、颜色与可访问性建议、交互层级与库推荐，可直接编译成决策提示词
Tag: UI/UX, 前端, 数据可视化, 图表, 提示词工程, chart:Funnel/Flow, 邻域:color, 邻域:ux, 邻域:style, 编码选择, 可访问性, 信息密度vs可读性, 精确vs直观, keep:数据语义, keep:颜色映射, adapt:交互层级, drop:炫技动效
