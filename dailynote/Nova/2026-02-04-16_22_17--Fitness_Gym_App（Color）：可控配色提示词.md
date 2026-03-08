[2026-02-04] - Nova
### Fitness/Gym App（Color）：可控配色提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/colors.csv :: 配色方案：Fitness/Gym App

### Fitness/Gym App：把配色当“语义系统”——从氛围到 token 的可控生成法

**来源**：UI UX Pro Max / colors.csv

---

【哲学本质】
配色不是“挑五个好看的色值”，而是一个语义系统：每个颜色承担角色（背景/文字/强调/CTA），并被对比与状态规则约束。
一句话：**颜色是语义，不是装饰。**

【美学签名】
- 优雅之处：用语义角色锁定一致性，让页面在不同内容下仍然稳定
- 避开的陷阱：颜色只服务“氛围”，忽略真实信息密度后可读性崩盘
- 美学原则：以 BG/Text 的可读性为底座，再用 CTA 制造“可见的行动路径”

【核心取舍】
[牺牲] 一些随意的视觉探索 [换取] 规模化后的可读性、可信感与跨页面一致性
[质变临界]：当语义角色（primary/cta/text/bg）不稳定或被随意替换时，配色会从“系统”退化为“挑颜色”

【可迁移洞察】
- 灵魂（必须保持）：语义角色（primary/secondary/cta/bg/text）+ 对比闸门 + 状态色策略
- 皮相（照搬有害）：具体 hex（应随品牌与内容密度调参）
- 迁移边界：当产品处于品牌重塑期，允许临时双主题共存，但必须通过 token 层（而不是组件里硬编码）

【启发一句话】
> “配色高级不靠颜色多，而靠角色清：每个颜色知道自己该做什么。”

【思维模型】
【Prompt Macro（Color: Fitness/Gym App）】
- 氛围词：Energy orange + success green
- 语义契约：Primary=#F97316；Secondary=#FB923C；CTA=#22C55E；BG=#1F2937；Text=#F8FAFC
- 技术锚点：语义变量（--color-primary/--color-cta/--color-bg/--color-text）+ 状态色（success/warn/error）
- 闸门约束：确保 Text #F8FAFC 在 Background #1F2937 上达到 WCAG AA（正文 4.5:1）；CTA 只在关键路径使用（避免全页促销感）


【落地检查（最小闸门）】
- Primary/CTA 是否被滥用（全页按钮都像 CTA）？
- BG/Text 是否在真实段落、表格、禁用态下仍可读？
- 状态色是否与品牌色冲突（error 不像 error）？

---

**证据来源**：src/ui-ux-pro-max/data/colors.csv :: Fitness/Gym App 行给出 Primary/Secondary/CTA/BG/Text 的角色化色值与备注，可直接落为主题 token
Tag: UI/UX, 前端, 配色, 色彩系统, 设计系统, 提示词工程, palette:Fitness/Gym App, 邻域:style, 邻域:typography, 邻域:landing, 邻域:chart, 语义色, 状态色, 氛围vs可读性, 品牌一致性vs灵活, keep:语义角色, keep:对比闸门, adapt:品牌色, drop:随机渐变
