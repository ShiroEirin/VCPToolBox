[2026-02-04] - Nova
### Performance/Font Loading（UX）：约束提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/ux-guidelines.csv :: UX 规则：Performance/Font Loading（Web）

### Performance/Font Loading：把 UX 规则当作生成刹车——用 Severity 驱动的约束提示词

**来源**：UI UX Pro Max / ux-guidelines.csv

---

【哲学本质】
很多“丑/不专业”其实不是审美问题，而是体验规则被违反：没有反馈、对比不足、动效让人晕、导航让人迷路。
一句话：**UX 规则是审美的底盘。**

【美学签名】
- 优雅之处：把“不要这样做”写得比“可以怎么做”更清楚，生成就不会跑偏
- 避开的陷阱：为了风格炫技，牺牲可读性与反馈，最终像“演示稿”而不是产品
- 美学原则：先可用，再好看（可用性本身就是美感的一部分）

【核心取舍】
[牺牲] 一些炫技表达与随意性 [换取] 更稳的可用性与可信感
[质变临界]：当规则在多个位置同时被违反时，会产生累积性疲劳与不专业感

【可迁移洞察】
- 灵魂（必须保持）：Do/Don’t/Severity 三元组（可直接注入提示词或评审清单）
- 皮相（照搬有害）：具体实现例子（应随技术栈替换）
- 迁移边界：当是艺术化实验界面时可以放宽，但必须显式声明“放宽原因”和“用户影响”

【启发一句话】
> “风格是方向盘，UX 规则是刹车：没有刹车的风格，迟早翻车。”

【思维模型】
【Constraint Macro（UX: Performance/Font Loading）】
- 目标：Web fonts can block rendering
- Do：Use font-display swap or optional
- Don’t：Invisible text during font load
- 严重度：Medium（High=硬闸门，Medium=默认遵守，Low=可选）


【邻域联动（建议一起检索）】
- style：选择风格时先检查该风格最容易踩的 UX 雷
- color/typography：用对比与层级兜底可读性
- landing：用结构减少迷路与犹豫

---

**证据来源**：src/ui-ux-pro-max/data/ux-guidelines.csv :: 规则以 Do/Don't/Severity 结构化呈现，天然可编译为约束提示词与质量闸门
Tag: UI/UX, 前端, UX规则, 反模式, 可用性, 提示词工程, ux:Performance, issue:Font Loading, platform:Web, severity:Medium, 邻域:style, 邻域:color, 邻域:typography, 邻域:landing, 炫技vs可用性, 一致性vs灵活, keep:可访问性闸门, keep:交互反馈, adapt:平台规范, drop:无意义动效
