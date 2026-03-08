[2026-02-04] - Nova
### Hero-Centric Design：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Hero-Centric Design 的风格记录（prompt/CSS/checklist/variables）

### Hero-Centric Design 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Hero-Centric Design 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Large hero section, compelling headline, high-contrast CTA, product showcase, value proposition, hero image/video, drama…

【核心取舍】
[牺牲] 某些极端低对比/透明叠层的自由 [换取] 可访问性与可信感
[质变临界]：当核心信息无法一眼读懂（主标题/CTA/导航）时，风格就失效了

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Complex navigation, multi-page experiences, data-heavy applications 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Hero-Centric Design）】
- 画面感：Design a hero-centric landing page. Use: full-width hero section, compelling headline (60-80 chars), high-contrast CTA button, product screenshot or video, value proposition above fold, gradient or image background, clea…
- 技术锚点：min-height: 100vh, display: flex, align-items: center, background: linear-gradient or image, text-shadow for readability, max-width: 800px for text, button with hover scale (1.05)
- 闸门约束：优先满足 ✓ WCAG AA；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：SaaS landing pages, product launches, service landing pages, B2B platforms, tech companies
- 关键效果：Smooth scroll reveal, fade-in animations on hero, subtle background parallax, CTA glow/pulse effect
- 实现清单：☐ Hero section full viewport height, ☐ Headline visible above fold, ☐ CTA button high contrast, ☐ Background image optimized (WebP), ☐ Text readable on backgrou…
- 变量契约：--hero-min-height: 100vh, --headline-size: clamp(2rem, 5vw, 4rem), --cta-padding: 1rem 2rem, --overlay-opacity: 0.5, --text-shadow: 0 2px 4px rgba(0,0,0,0.3)

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Hero-Centric Design 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Hero-Centric Design, type:Landing Page, 动效设计, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
