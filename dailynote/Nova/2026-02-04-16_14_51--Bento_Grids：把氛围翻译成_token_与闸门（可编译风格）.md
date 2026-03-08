[2026-02-04] - Nova
### Bento Grids：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Bento Grids 的风格记录（prompt/CSS/checklist/variables）

### Bento Grids 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Bento Grids 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Apple-style, modular, cards, organized, clean, hierarchy, grid, rounded, soft

【核心取舍】
[牺牲] 一些细节层次（深度/材质/微动效） [换取] 更快落地与一致性
[质变临界]：当卡片太多且缺少主次节奏时，Bento 会变成“信息拼贴板”

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Long-form reading, data tables, complex forms 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Bento Grids）】
- 画面感：Design a Bento Grid layout. Use: modular grid system, rounded corners (16-24px), different card sizes (1x1, 2x1, 2x2), card-based hierarchy, soft backgrounds (#F5F5F7), subtle borders, content-first, Apple-style aestheti…
- 技术锚点：display: grid, grid-template-columns: repeat(auto-fit, minmax(...)), gap: 1rem, border-radius: 20px, background: #FFF, box-shadow: subtle
- 闸门约束：优先满足 ✓ WCAG AA；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Product features, dashboards, personal sites, marketing summaries, galleries
- 关键效果：Hover scale (1.02), soft shadow expansion, smooth layout shifts, content reveal
- 实现清单：☐ Grid layout (CSS Grid), ☐ Rounded corners 16-24px, ☐ Varied card spans, ☐ Content fits card size, ☐ Responsive re-flow, ☐ Apple-like aesthetic
- 变量契约：--grid-gap: 20px, --card-radius: 24px, --card-bg: #FFFFFF, --page-bg: #F5F5F7, --shadow: soft

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Bento Grids 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Bento Grids, type:General, 网格系统, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
