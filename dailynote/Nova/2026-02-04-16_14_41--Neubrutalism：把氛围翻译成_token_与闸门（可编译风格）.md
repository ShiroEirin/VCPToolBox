[2026-02-04] - Nova
### Neubrutalism：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Neubrutalism 的风格记录（prompt/CSS/checklist/variables）

### Neubrutalism 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Neubrutalism 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Bold borders, black outlines, primary colors, thick shadows, no gradients, flat colors, 45° shadows, playful, Gen Z

【核心取舍】
[牺牲] 一些细节层次（深度/材质/微动效） [换取] 更快落地与一致性
[质变临界]：当粗暴视觉压过信息层级（字号/间距/栅格）时，冲击力会变成噪声

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Luxury brands, finance, healthcare, conservative industries (too playful) 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Neubrutalism）】
- 画面感：Design a neubrutalist interface. Use: high contrast, hard black borders (3px+), bright pop colors, no blur, sharp or slightly rounded corners, bold typography, hard shadows (offset 4px 4px), raw aesthetic but functional.
- 技术锚点：border: 3px solid black, box-shadow: 5px 5px 0px black, colors: #FFDB58 #FF6B6B #4ECDC4, font-weight: 700, no gradients
- 闸门约束：优先满足 ✓ WCAG AAA；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Gen Z brands, startups, creative agencies, Figma-style apps, Notion-style interfaces, tech blogs
- 关键效果：box-shadow: 4px 4px 0 #000, border: 3px solid #000, no gradients, sharp corners (0px), bold typography
- 实现清单：☐ Hard borders (2-4px), ☐ Hard offset shadows, ☐ High saturation colors, ☐ Bold typography, ☐ No blurs/gradients, ☐ Distinctive 'ugly-cute' look
- 变量契约：--border-width: 3px, --shadow-offset: 4px, --shadow-color: #000, --colors: high saturation, --font: bold sans

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Neubrutalism 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Neubrutalism, type:General, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌, Bold borders
