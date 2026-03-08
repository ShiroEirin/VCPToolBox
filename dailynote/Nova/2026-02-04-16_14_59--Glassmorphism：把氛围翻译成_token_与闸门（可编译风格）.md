[2026-02-04] - Nova
### Glassmorphism：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Glassmorphism 的风格记录（prompt/CSS/checklist/variables）

### Glassmorphism 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Glassmorphism 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Frosted glass, transparent, blurred background, layered, vibrant background, light source, depth, multi-layer

【核心取舍】
[牺牲] 实现与维护成本 [换取] 可识别的风格张力与品牌记忆点
[质变临界]：当透明度过低+背景过花导致文字对比不足（尤其浅色模式）时，玻璃感会变成“看不清”

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Low-contrast backgrounds, critical accessibility, performance-limited, dark text on dark 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Glassmorphism）】
- 画面感：Design a glassmorphic interface with frosted glass effect. Use backdrop blur (10-20px), translucent overlays (rgba 10-30% opacity), vibrant background colors, subtle borders, light source reflection, layered depth. Perfe…
- 技术锚点：backdrop-filter: blur(15px), background: rgba(255, 255, 255, 0.15), border: 1px solid rgba(255,255,255,0.2), -webkit-backdrop-filter: blur(15px), z-index layering for depth
- 闸门约束：优先满足 ⚠ Ensure 4.5:1；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Modern SaaS, financial dashboards, high-end corporate, lifestyle apps, modal overlays, navigation
- 关键效果：Backdrop blur (10-20px), subtle border (1px solid rgba white 0.2), light reflection, Z-depth
- 实现清单：☐ Backdrop-filter blur 10-20px, ☐ Translucent white 15-30% opacity, ☐ Subtle border 1px light, ☐ Vibrant background verified, ☐ Text contrast 4.5:1 checked
- 变量契约：--blur-amount: 15px, --glass-opacity: 0.15, --border-color: rgba(255,255,255,0.2), --background: vibrant color, --text-color: light/dark based on BG

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Glassmorphism 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Glassmorphism, type:General, 材质模拟, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
