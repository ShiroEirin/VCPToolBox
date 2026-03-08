[2026-02-04] - Nova
### Soft UI Evolution：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Soft UI Evolution 的风格记录（prompt/CSS/checklist/variables）

### Soft UI Evolution 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Soft UI Evolution 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Evolved soft UI, better contrast, modern aesthetics, subtle depth, accessibility-focused, improved shadows, hybrid

【核心取舍】
[牺牲] 某些极端低对比/透明叠层的自由 [换取] 可访问性与可信感
[质变临界]：当核心信息无法一眼读懂（主标题/CTA/导航）时，风格就失效了

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Extreme minimalism, critical performance, systems without modern OS 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Soft UI Evolution）】
- 画面感：Design evolved neumorphism with improved contrast (WCAG AA+), modern aesthetics, subtle depth, accessibility focus. Use soft shadows (softer than flat but clearer than pure neumorphism), better color hierarchy, improved …
- 技术锚点：box-shadow: softer multi-layer (0 2px 4px), background: improved contrast pastels, border-radius: 8-12px, animation: 200-300ms smooth, outline: 2-3px on focus, contrast: 4.5:1+
- 闸门约束：优先满足 ✓ WCAG AA+；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Modern enterprise apps, SaaS platforms, health/wellness, modern business tools, professional, hybrid
- 关键效果：Improved shadows (softer than flat, clearer than neumorphism), modern (200-300ms), focus visible, WCAG AA/AAA
- 实现清单：☐ Improved contrast AA/AAA, ☐ Soft shadows modern, ☐ Border-radius 8-12px, ☐ Animations 200-300ms, ☐ Focus states visible, ☐ Color hierarchy clear
- 变量契约：--shadow-soft: modern blend, --border-radius: 10px, --animation-duration: 200-300ms, --contrast-ratio: 4.5:1+, --color-hierarchy: improved, --wcag-level: AA+

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Soft UI Evolution 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Soft UI Evolution, type:General, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌, Evolved soft UI
