[2026-02-04] - Nova
### Liquid Glass：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Liquid Glass 的风格记录（prompt/CSS/checklist/variables）

### Liquid Glass 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Liquid Glass 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Flowing glass, morphing, smooth transitions, fluid effects, translucent, animated blur, iridescent, chromatic aberration

【核心取舍】
[牺牲] 实现复杂度（组件、动效、变量体系更重） [换取] 更高的可控层级与细节质感
[质变临界]：当透明度过低+背景过花导致文字对比不足（尤其浅色模式）时，玻璃感会变成“看不清”

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Performance-limited, critical accessibility, complex data, budget projects 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Liquid Glass）】
- 画面感：Create a premium liquid glass effect with morphing shapes, flowing animations, chromatic aberration, iridescent gradients, smooth 400-600ms transitions. Use SVG morphing for shape changes, dynamic blur, smooth color tran…
- 技术锚点：animation: morphing SVG paths (400-600ms), backdrop-filter: blur + saturate, filter: hue-rotate + brightness, blend-mode: screen, background: iridescent gradient
- 闸门约束：优先满足 ⚠ Text contrast；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Premium SaaS, high-end e-commerce, creative platforms, branding experiences, luxury portfolios
- 关键效果：Morphing elements (SVG/CSS), fluid animations (400-600ms curves), dynamic blur (backdrop-filter), color transitions
- 实现清单：☐ Morphing animations 400-600ms, ☐ Chromatic aberration applied, ☐ Dynamic blur active, ☐ Iridescent gradients, ☐ Smooth color transitions, ☐ Premium feel achie…
- 变量契约：--morph-duration: 400-600ms, --blur-amount: 15px, --chromatic-aberration: true, --iridescent: true, --blend-mode: screen, --smooth-transitions: true

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Liquid Glass 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Liquid Glass, type:General, 动效设计, 材质模拟, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
