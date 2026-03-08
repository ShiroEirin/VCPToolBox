[2026-02-04] - Nova
### Nature Distilled：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Nature Distilled 的风格记录（prompt/CSS/checklist/variables）

### Nature Distilled 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Nature Distilled 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Muted earthy, skin tones, wood, soil, sand, terracotta, warmth, organic materials, handmade warmth

【核心取舍】
[牺牲] 一些细节层次（深度/材质/微动效） [换取] 更快落地与一致性
[质变临界]：当核心信息无法一眼读懂（主标题/CTA/导航）时，风格就失效了

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Tech startups, gaming, nightlife, corporate finance, high-energy brands 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Nature Distilled）】
- 画面感：Design with nature distilled aesthetic. Use: muted earthy colors (terracotta, sand, olive), organic materials feel, warm tones, handmade warmth, natural textures, artisan quality, sustainable vibe, soft gradients.
- 技术锚点：background: warm earth tones, color: #C67B5C #D4C4A8 #6B7B3C, border-radius: organic (varied), box-shadow: soft natural, texture overlays (grain), font: humanist sans-serif
- 闸门约束：优先满足 ✓ WCAG AA；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Wellness brands, sustainable products, artisan goods, organic food, spa/beauty, home decor
- 关键效果：Subtle parallax, natural easing (ease-out), texture overlays, grain effects, soft shadows
- 实现清单：☐ Earth tones dominant, ☐ Warm feel achieved, ☐ Textures subtle, ☐ Handmade quality, ☐ Sustainable messaging, ☐ Calming aesthetic
- 变量契约：--terracotta: #C67B5C, --sand-beige: #D4C4A8, --warm-clay: #B5651D, --soft-cream: #F5F0E1, --olive-green: #6B7B3C, --grain-opacity: 0.1

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Nature Distilled 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Nature Distilled, type:General, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌, Muted earthy
