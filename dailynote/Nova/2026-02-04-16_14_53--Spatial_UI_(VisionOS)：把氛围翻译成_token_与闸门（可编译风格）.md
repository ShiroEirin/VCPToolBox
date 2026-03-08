[2026-02-04] - Nova
### Spatial UI (VisionOS)：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: Spatial UI (VisionOS) 的风格记录（prompt/CSS/checklist/variables）

### Spatial UI (VisionOS) 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
Spatial UI (VisionOS) 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Glass, depth, immersion, spatial, translucent, gaze, gesture, apple, vision-pro

【核心取舍】
[牺牲] 实现复杂度（组件、动效、变量体系更重） [换取] 更高的可控层级与细节质感
[质变临界]：当核心信息无法一眼读懂（主标题/CTA/导航）时，风格就失效了

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Text-heavy documents, high-contrast requirements, non-3D capable devices 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（Spatial UI (VisionOS)）】
- 画面感：Design a VisionOS-style spatial interface. Use: frosted glass panels, depth layers, translucent backgrounds (15-30% opacity), vibrant colors for active states, gaze-hover effects, floating windows, immersive feel.
- 技术锚点：backdrop-filter: blur(40px) saturate(180%), background: rgba(255,255,255,0.2), border-radius: 24px, box-shadow: 0 8px 32px rgba(0,0,0,0.1), transform: scale on focus, depth via shadows
- 闸门约束：优先满足 ⚠ Contrast risks；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：Spatial computing apps, VR/AR interfaces, immersive media, futuristic dashboards
- 关键效果：Parallax depth, dynamic lighting response, gaze-hover effects, smooth scale on focus
- 实现清单：☐ Glass effect visible, ☐ Depth layers clear, ☐ Hover states defined, ☐ Colors vibrant on active, ☐ Floating feel achieved, ☐ Contrast maintained
- 变量契约：--glass-bg: rgba(255,255,255,0.2), --glass-blur: 40px, --glass-saturate: 180%, --window-radius: 24px, --depth-shadow: 0 8px 32px rgba(0,0,0,0.1), --focus-scale:…

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: Spatial UI (VisionOS) 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:Spatial UI (VisionOS), type:General, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌, Glass
