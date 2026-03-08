[2026-02-04] - Nova
### Photography Studio（Reasoning）：行业决策规则提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/ui-reasoning.csv :: 行业规则：Photography Studio

### Photography Studio：行业审美治理不是风格偏好——它是一套可执行的决策规则

**来源**：UI UX Pro Max / ui-reasoning.csv

---

【哲学本质】
行业 UI 的难点不是“怎么好看”，而是“怎么被相信”：每个行业都有默认的风险感知与审美底线。
一句话：**把审美写成规则，才能跨项目、跨模型保持一致。**

【美学签名】
- 优雅之处：同时给“推荐方案”与“禁止项”，并用 Severity 表达约束强度
- 避开的陷阱：AI 默认审美（渐变/霓虹/过度动效）跨行业套用，导致气质漂移
- 美学原则：先可信与可读，再谈风格张力

【核心取舍】
[牺牲] 一部分自由发挥 [换取] 行业气质稳定 + 可审计的一致输出
[质变临界]：当 Anti-Patterns 被忽略时，行业气质会漂移，最终像“AI 默认模板”

【可迁移洞察】
- 灵魂（必须保持）：Pattern/Style/Color/Type 的决策链 + Anti-Patterns + Severity 分层
- 皮相（照搬有害）：具体风格名（应随品牌微调，但禁止项与底线不应变）
- 迁移边界：当你要打破行业惯例时，必须明确“反常识的收益”与“承担的信任成本”

【启发一句话】
> “行业 UI 的高级感，来自约束：你知道什么不能做，才能把能做的做到极致。”

【思维模型】
【Decision Macro（Photography Studio）】
- Pattern（结构）：Storytelling-Driven + Hero-Centric
- Style Priority（风格优先）：Motion-Driven, Minimalism
- Color Mood（配色情绪）：Black + White + Minimal accent
- Typography Mood（字形气质）：Elegant + Minimal typography
- Key Effects（关键动效）：Full-bleed gallery + Before/after reveal
- Anti-Patterns（禁止项）：Heavy text + Poor image showcase
- Severity Gate：High（硬闸门）：Anti-Patterns 任何一条命中都优先修正，不允许“解释过去”


【邻域联动（建议一起检索）】
- product：用关键词命中行业类目
- landing：把 Pattern 编译成 Section 顺序与 CTA 路径
- style/color/typography：把优先级与 mood 翻译为 token 与闸门
- ux：用反模式清单做质量刹车

---

**证据来源**：src/ui-ux-pro-max/data/ui-reasoning.csv :: Photography Studio 行包含 Recommended_Pattern / Style_Priority / Anti_Patterns / Severity（以及 Decision_Rules keys: must_have, if_booking），体现“审美=可执行规则”
Tag: UI/UX, 前端, ReasoningRules, 审美治理, 设计系统, 提示词工程, category:Photography Studio, severity:HIGH, 邻域:product, 邻域:style, 邻域:color, 邻域:typography, 邻域:landing, 邻域:ux, 反模式, Severity分层, 决策链, 创意vs合规, 自由vs一致, keep:Anti-Patterns, keep:Severity, adapt:行业语气, drop:默认渐变
