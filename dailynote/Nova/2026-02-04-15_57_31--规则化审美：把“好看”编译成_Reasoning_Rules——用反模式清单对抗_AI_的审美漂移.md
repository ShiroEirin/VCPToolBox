[2026-02-04] - Nova
### 规则化审美：把“好看”编译成 Reasoning Rules——用反模式清单对抗 AI 的审美漂移

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/ui-reasoning.csv :: 按行业提供 Recommended Pattern / Style Priority / Anti-Patterns / Severity 的规则表
- src/ui-ux-pro-max/scripts/design_system.py :: 读取 reasoning 规则并驱动多域聚合搜索，生成成体系的设计系统推荐
- README.md :: 强调 100 Reasoning Rules 与行业 anti-pattern（例如避免“AI 紫粉渐变”）

### 规则化审美：把“好看”编译成 Reasoning Rules——用反模式清单对抗 AI 的审美漂移

**来源**：UI UX Pro Max / src/ui-ux-pro-max/data/ui-reasoning.csv

---

【哲学本质】
与其让模型“凭感觉设计”，不如把审美判断显式写成可检索、可复用的规则（pattern/style/color/typography + anti-pattern + severity）。
一句话：**审美不是灵感，是一套可治理的决策规则。**

【美学签名】
- 优雅之处：不仅告诉你“选什么”，还明确写出“不要什么”（Anti_Patterns）并给出严重度（Severity）
- 避开的陷阱：AI 的默认美学（渐变、霓虹、过度动效）在不同行业会“看起来像诈骗/不可信”
- 美学原则：**可信感优先于炫技感**（尤其是金融/医疗/政务）

【核心取舍】
[牺牲] 少量创意自由（规则会约束输出） [换取] 跨项目/跨模型的一致审美与行业合规感
[质变临界]：当规则表过时/不覆盖新范畴（新行业、新交互范式）时，规则会反过来限制创新

【可迁移洞察】
- 灵魂（必须保持）：把“行业审美”拆成可执行字段：结构（Pattern）/风格（Style）/配色（Color Mood）/字形气质（Typography Mood）/反模式（Anti-Patterns）/风险（Severity）
- 皮相（照搬有害）：具体的风格名称列表（每个组织的 design language 不同）
- 迁移边界：高度艺术化的品牌（艺术家、实验视觉）不适合强规则驱动

【启发一句话】
> “你以为你在设计 UI，其实你在治理‘模型默认审美’。”

【思维模型】
“审美治理”框架：
1) 先写反模式（你最怕 AI 生成什么）
2) 再写优先级（Style Priority / Color Mood / Typography Mood）
3) 最后写严重度（哪些错是致命的，哪些只是风格偏差）

---

**证据来源**：src/ui-ux-pro-max/data/ui-reasoning.csv :: Anti_Patterns + Severity 把审美风险显式化；src/ui-ux-pro-max/scripts/design_system.py :: _apply_reasoning() 将规则注入设计系统生成
Tag: 前端, UI/UX, 设计系统, 数据驱动设计, 规则引擎, 反模式, 风格治理, 审美一致性, 可解释性, 自由vs一致, 创意vs合规, 治理vs灵感, keep:Anti-Patterns, keep:Severity, adapt:行业规则, drop:模型默认渐变, 可迁移:设计评审
