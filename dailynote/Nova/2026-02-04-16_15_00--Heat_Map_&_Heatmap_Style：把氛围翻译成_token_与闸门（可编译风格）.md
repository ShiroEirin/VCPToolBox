[2026-02-04] - Nova
### Heat Map & Heatmap Style：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Heat Map & Heatmap Style 的风格记录（prompt/CSS/checklist/variables）

### Heat Map & Heatmap Style 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Heat Map & Heatmap Style 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Color-coded grid/matrix, data intensity visualization, geographical heat maps, correlation matrices, cell-based represen…

【核心取舍】
[牺牲] 视觉张力的“炫技空间” [换取] 更稳的性能与加载体验
[质变临界]：当核心信息无法一眼读懂（主标题/CTA/导航）时，风格就失效了

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Linear data representation, categorical comparisons (use bar charts), small datasets 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Heat Map & Heatmap Style）】
- 画面感：Design a heatmap visualization. Use: color gradient scale (cool to hot), cell-based grid, intensity legend, hover tooltips, geographic or matrix layout, divergent color scheme for +/- values, accessible color alternative…
- 技术锚点：display: grid, background: linear-gradient for legend, cell hover states, tooltip positioning, color scale (blue→white→red), SVG for geographic, canvas for large datasets
- 闸门约束：优先满足 ⚠ Colorblind considerations；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Geographical analysis, performance matrices, correlation analysis, user behavior heatmaps, temperature/intensity data
- 关键效果：Color gradient transitions on data change, cell highlighting on hover, tooltip reveal on click, smooth color animation
- 实现清单：☐ Color scale clear, ☐ Legend visible, ☐ Tooltips informative, ☐ Colorblind alternatives, ☐ Zoom/pan for geo, ☐ Performance for large data
- 变量契约：--heatmap-cool: #0080FF, --heatmap-neutral: #FFFFFF, --heatmap-hot: #FF0000, --cell-size: 24px, --legend-width: 200px, --tooltip-bg: rgba(0,0,0,0.9)

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Heat Map & Heatmap Style 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Heat Map & Heatmap Style, type:BI/Analytics, 网格系统, 动效设计, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
