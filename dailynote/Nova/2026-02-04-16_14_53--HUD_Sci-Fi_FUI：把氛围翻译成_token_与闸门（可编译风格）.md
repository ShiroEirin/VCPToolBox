[2026-02-04] - Nova
### HUD / Sci-Fi FUI：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: HUD / Sci-Fi FUI 的风格记录（prompt/CSS/checklist/variables）

### HUD / Sci-Fi FUI 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
HUD / Sci-Fi FUI 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Futuristic, technical, wireframe, neon, data, transparency, iron man, sci-fi, interface

【核心取舍】
[牺牲] 实现复杂度（组件、动效、变量体系更重） [换取] 更高的可控层级与细节质感
[质变临界]：当信息密度过高且缺少可读性底线时，HUD 会从“专业感”变成“看不懂”

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Standard corporate, reading heavy content, accessible public services 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（HUD / Sci-Fi FUI）】
- 画面感：Design a futuristic HUD (Heads Up Display) or FUI. Use: thin lines (1px), neon cyan/blue on black, technical markers, decorative brackets, data visualization, monospaced tech fonts, glowing elements, transparency.
- 技术锚点：border: 1px solid rgba(0,255,255,0.5), color: #00FFFF, background: transparent or rgba(0,0,0,0.8), font-family: monospace, text-shadow: 0 0 5px cyan
- 闸门约束：优先满足 ⚠ Poor (thin lines)；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Sci-fi games, space tech, cybersecurity, movie props, immersive dashboards
- 关键效果：Glow effects, scanning animations, ticker text, blinking markers, fine line drawing
- 实现清单：☐ Fine lines 1px, ☐ Neon glow text/borders, ☐ Monospaced font, ☐ Dark/Transparent BG, ☐ Decorative tech markers, ☐ Holographic feel
- 变量契约：--hud-color: #00FFFF, --bg-color: rgba(0,10,20,0.9), --line-width: 1px, --glow: 0 0 5px, --font: monospace

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: HUD / Sci-Fi FUI 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:HUD / Sci-Fi FUI, type:General, 动效设计, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
