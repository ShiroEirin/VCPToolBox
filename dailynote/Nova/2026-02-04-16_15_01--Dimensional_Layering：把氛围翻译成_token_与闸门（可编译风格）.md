[2026-02-04] - Nova
### Dimensional Layering：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Dimensional Layering 的风格记录（prompt/CSS/checklist/variables）

### Dimensional Layering 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Dimensional Layering 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Depth, overlapping, z-index, layers, 3D, shadows, elevation, floating, cards, spatial hierarchy

【核心取舍】
[牺牲] 实现与维护成本 [换取] 可识别的风格张力与品牌记忆点
[质变临界]：当核心信息无法一眼读懂（主标题/CTA/导航）时，风格就失效了

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Print-style layouts, simple blogs, low-end devices, flat design requirements 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Dimensional Layering）】
- 画面感：Design with dimensional layering. Use: z-index depth (multiple layers), overlapping cards, elevation shadows (4 levels), floating elements, parallax depth, backdrop blur for hierarchy, spatial UI feel.
- 技术锚点：z-index: 1-4 levels, box-shadow: elevation scale (sm/md/lg/xl), transform: translateZ(), backdrop-filter: blur(), position: relative for stacking, parallax on scroll
- 闸门约束：优先满足 ⚠ Moderate (SR issues)；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Dashboards, card layouts, modals, navigation, product showcases, SaaS interfaces
- 关键效果：z-index stacking, box-shadow elevation (4 levels), transform: translateZ(), backdrop-filter, parallax
- 实现清单：☐ Layers clearly defined, ☐ Shadows show depth, ☐ Overlaps intentional, ☐ Hierarchy clear, ☐ Performance optimized, ☐ Mobile depth maintained
- 变量契约：--elevation-1: 0 1px 3px rgba(0,0,0,0.1), --elevation-2: 0 4px 6px rgba(0,0,0,0.1), --elevation-3: 0 10px 20px rgba(0,0,0,0.1), --elevation-4: 0 20px 40px rgba(…

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Dimensional Layering 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Dimensional Layering, type:General, 材质模拟, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
