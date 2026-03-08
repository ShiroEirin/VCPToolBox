[2026-02-04] - Nova
### Neumorphism：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Neumorphism 的风格记录（prompt/CSS/checklist/variables）

### Neumorphism 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Neumorphism 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Soft UI, embossed, debossed, convex, concave, light source, subtle depth, rounded (12-16px), monochromatic

【核心取舍】
[牺牲] 部分可访问性（需要额外修补） [换取] 更强的材质感/氛围感
[质变临界]：当对比不足导致可点击边界不清、层次全靠阴影时，可用性会塌陷

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Complex apps, critical accessibility, data-heavy dashboards, high-contrast required 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Neumorphism）】
- 画面感：Create a neumorphic UI with soft 3D effects. Use light pastels, rounded corners (12-16px), subtle soft shadows (multiple layers), no hard lines, monochromatic color scheme with light/dark variations. Embossed/debossed ef…
- 技术锚点：border-radius: 12-16px, box-shadow: -5px -5px 15px rgba(0,0,0,0.1), 5px 5px 15px rgba(255,255,255,0.8), background: linear-gradient(145deg, color1, color2), transform: scale on press
- 闸门约束：优先满足 ⚠ Low contrast；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Health/wellness apps, meditation platforms, fitness trackers, minimal interaction UIs
- 关键效果：Soft box-shadow (multiple: -5px -5px 15px, 5px 5px 15px), smooth press (150ms), inner subtle shadow
- 实现清单：☐ Rounded corners 12-16px consistent, ☐ Multiple shadow layers (2-3), ☐ Pastel color verified, ☐ Monochromatic palette checked, ☐ Press animation smooth 150ms
- 变量契约：--border-radius: 14px, --shadow-soft-1: -5px -5px 15px, --shadow-soft-2: 5px 5px 15px, --color-light: #F5F5F5, --color-primary: single pastel

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Neumorphism 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Neumorphism, type:General, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌, Soft UI
