[2026-02-04] - Nova
### AI-Native UI：把氛围翻译成 token 与闸门（可编译风格）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/styles.csv :: AI-Native UI 的风格记录（prompt/CSS/checklist/variables）

### AI-Native UI 的“可编译风格”方法论——把氛围翻译成 token 与闸门

**来源**：UI UX Pro Max / styles.csv

---

【哲学本质】
AI-Native UI 不是一组装饰，而是一套“可复现的约束集合”：你要让它在不同页面、不同人、不同模型下仍然长得像同一个产品。
一句话：**把风格当成可编译的规格，而不是灵感。**

【美学签名】
- 优雅之处：用“可测变量 + 一致 token”承载质感，而不是靠随机渐变/随手阴影
- 避开的陷阱：只写氛围词（漂亮但不可落地），或只写技术词（可落地但没风格张力）
- 美学原则：Chatbot, conversational, voice, assistant, agentic, ambient, minimal chrome, streaming text, AI interactions

【核心取舍】
[牺牲] 一些细节层次（深度/材质/微动效） [换取] 更快落地与一致性
[质变临界]：当核心信息无法一眼读懂（主标题/CTA/导航）时，风格就失效了

【可迁移洞察】
- 灵魂（必须保持）：Variables 契约（可测） + Checklist 闸门（可验）
- 皮相（照搬有害）：具体颜色/阴影数值（应随品牌与场景调参）
- 迁移边界：当 Traditional forms, data-heavy dashboards, print-first content 时，需降级风格强度或改用更稳妥的视觉语言

【启发一句话】
> “风格的高级感，不在于效果多，而在于约束严：你能证明它可读、可用、可复现。”

【思维模型】
【Prompt Macro（AI-Native UI）】
- 画面感：Design an AI-native interface. Use: minimal chrome, conversational layout, streaming text area, typing indicators (3-dot pulse), context cards, subtle AI accent color (#6366F1), clean input field, response bubbles.
- 技术锚点：chat bubble layout (flex-direction: column), typing animation (3 dots pulse), streaming text (overflow: hidden + animation), input: sticky bottom, context cards (border-left accent), minimal borders
- 闸门约束：优先满足 ✓ WCAG AA；避免“为了风格牺牲信息层级”。


【落地检查（最小闸门）】
- 适用场景：AI products, chatbots, voice assistants, copilots, AI-powered tools, conversational interfaces
- 关键效果：Typing indicators (3-dot pulse), streaming text animations, pulse animations, context cards, smooth reveals
- 实现清单：☐ Chat layout responsive, ☐ Typing indicator smooth, ☐ Input always visible, ☐ Context cards styled, ☐ AI responses distinct, ☐ User messages aligned right
- 变量契约：--ai-accent: #6366F1, --user-bubble-bg: #E0E7FF, --ai-bubble-bg: #F9FAFB, --input-height: 48px, --typing-dot-size: 8px, --message-gap: 16px

---

**证据来源**：src/ui-ux-pro-max/data/styles.csv :: AI-Native UI 行提供 AI Prompt Keywords / CSS/Technical Keywords / Implementation Checklist / Design System Variables（风格=语义+实现+闸门+契约）
Tag: UI/UX, 前端, 风格系统, 提示词工程, 设计系统, UI_styles, style:AI-Native UI, type:General, 动效设计, 一致性vs个性化, 动效vs性能, 审美vs可访问性, keep:变量契约, keep:Token锚点, adapt:品牌色, drop:形容词堆砌
