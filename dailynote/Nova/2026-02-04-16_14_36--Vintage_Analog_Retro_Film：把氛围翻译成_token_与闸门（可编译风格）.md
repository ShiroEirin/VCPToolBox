[2026-02-04] - Nova
### Vintage Analog / Retro Film：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Vintage Analog / Retro Film 的风格记录（prompt/CSS/checklist/variables）

### Vintage Analog / Retro Film 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Vintage Analog / Retro Film 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Film grain, VHS, cassette tape, polaroid, analog warmth, faded colors, light leaks, vintage photography

【核心取舍】
[牺牲] 某些极端低对比/透明叠层的自由 [换取] 可访问性与可信感
[质变临界]：当复古元素堆满但缺少现代可用性约束（间距/对比/响应式）时，会像“仿制品”

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Modern tech, SaaS, healthcare, children's apps, corporate enterprise 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Vintage Analog / Retro Film）】
- 画面感：Design with vintage analog film aesthetic. Use: film grain overlay, faded/desaturated colors, warm sepia tones, light leaks, VHS tracking effect, polaroid frame, analog warmth, nostalgic photography feel.
- 技术锚点：filter: sepia() contrast() saturate(0.8), background: noise texture overlay, animation: VHS tracking (transform skew), light leak gradient overlay, border for polaroid frame, grain via SVG filter
- 闸门约束：优先满足 ✓ WCAG AA；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Photography portfolios, music/vinyl brands, vintage fashion, nostalgia marketing, film industry, cafes
- 关键效果：Film grain overlay, VHS tracking effect, polaroid shake, fade-in transitions, light leak animations
- 实现清单：☐ Film grain visible, ☐ Colors faded/warm, ☐ Light leaks present, ☐ Nostalgic feel achieved, ☐ Performance with filters, ☐ Images look vintage
- 变量契约：--sepia-amount: 20%, --contrast: 1.1, --saturation: 0.8, --grain-opacity: 0.15, --light-leak-color: rgba(255,200,100,0.2), --warm-tint: #F5E6C8

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Vintage Analog / Retro Film 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Vintage Analog / Retro Film, type:General, 动效设计, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
