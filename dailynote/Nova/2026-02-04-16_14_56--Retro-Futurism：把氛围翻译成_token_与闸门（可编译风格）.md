[2026-02-04] - Nova
### Retro-Futurism：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Retro-Futurism 的风格记录（prompt/CSS/checklist/variables）

### Retro-Futurism 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Retro-Futurism 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Vintage sci-fi, 80s aesthetic, neon glow, geometric patterns, CRT scanlines, pixel art, cyberpunk, synthwave

【核心取舍】
[牺牲] 实现与维护成本 [换取] 可识别的风格张力与品牌记忆点
[质变临界]：当复古元素堆满但缺少现代可用性约束（间距/对比/响应式）时，会像“仿制品”

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Conservative industries, critical accessibility, professional/corporate, elderly, legal/fi… 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Retro-Futurism）】
- 画面感：Build a retro-futuristic (cyberpunk/vaporwave) interface with neon colors (blue, pink, cyan), deep black background, 80s aesthetic, CRT scanlines, glitch effects, neon glow text/borders, monospace fonts, geometric patter…
- 技术锚点：color: neon colors (#0080FF, #FF006E, #00FFFF), text-shadow: 0 0 10px neon, background: #000 or #1A1A2E, font-family: monospace, animation: glitch (skew+offset), filter: hue-rotate
- 闸门约束：优先满足 ⚠ High contrast/strain；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Gaming, entertainment, music platforms, tech brands, artistic projects, nostalgic, cyberpunk
- 关键效果：CRT scanlines (::before overlay), neon glow (text-shadow+box-shadow), glitch effects (skew/offset keyframes)
- 实现清单：☐ Neon colors used, ☐ CRT scanlines effect, ☐ Glitch animations active, ☐ Monospace font, ☐ Deep black background, ☐ Glow effects applied, ☐ 80s patterns presen…
- 变量契约：--neon-colors: #0080FF #FF006E #00FFFF, --background: #000000, --font-family: monospace, --effect: glitch+glow, --scanline-opacity: 0.3, --crt-effect: true

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Retro-Futurism 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Retro-Futurism, type:General, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌, Vintage sci-fi
