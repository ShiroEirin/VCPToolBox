[2026-02-04] - Nova
### 字体细节决定“精致感”——把 ligature/kerning/letter-spacing 做成可调 Token

Repo: awesome-shadcn-ui_templates_repos
Origin: /mnt/d/git有趣/学习项目合集/awesome-shadcn-ui_templates_repos

Sources:
- shadcn__taxonomy/styles/globals.css :: 全局微排版：font-feature-settings 作为 body 级规则
- Kiranism__next-shadcn-dashboard-starter/docs/themes.md :: 主题可调参数：--tracking-normal 将字距纳入 tokens

### 字体细节决定“精致感”——把 ligature/kerning/letter-spacing 做成可调 Token

**来源**：shadcn__taxonomy / Kiranism__next-shadcn-dashboard-starter

---

【哲学本质】
大项目的“质感”往往不是颜色，而是排版微观：字形连字、字距、数字等宽、标题紧凑度。把这些当成“局部调 class”的技巧，会导致全局风格断裂。
一句话：**微排版要像颜色一样被治理：它是品牌的物理学。**

【美学签名】
- 优雅之处：在全局层定义字体特性（如 `font-feature-settings`）与 tracking token，让文本在任何页面都有一致的“呼吸”
- 避开的陷阱：局部页面用 `tracking-tight` 修补标题，再用另一个页面修正文案，最终形成不可预测的排版拼贴
- 美学原则：**一致的微观规则塑造一致的宏观气质**

【核心取舍】
[牺牲] 需要在主题/全局样式层建立排版规则 [换取] 更稳定的精致感与更少“这页怪怪的”反馈
[质变临界]：当团队开始为“某个组件”单独覆盖 font-feature/tracking 时，风格会质变为碎片化口味

【可迁移洞察】
- 灵魂（必须保持）：全局微排版规则（features）+ 主题可调参数（tracking）+ 组件禁止直改底层特性
- 皮相（照搬有害）：照搬具体 features 名称；核心是“微排版有统一入口”
- 迁移边界：展示型站点与数据密集后台的 tracking 最优点不同，必须允许主题级调参而不是硬编码

【启发一句话】
> “你以为大家在看颜色，其实他们在感受字距。”

【思维模型】
「微排版三旋钮」：
1) features：连字/字距校正（全局）
2) tracking：字间距（主题可调）
3) nums：数字等宽（在需要对齐的地方局部开启，但遵守统一约定）

---

**证据来源**：
- shadcn__taxonomy/styles/globals.css :: body 设置 `font-feature-settings: \"rlig\" 1, \"calt\" 1;`，把微排版作为全局规则
- Kiranism__next-shadcn-dashboard-starter/docs/themes.md :: 提供 `--tracking-normal` token（可选），将字距纳入主题可调参数
Tag: 微排版, 字体特性, 精致感, 全局规则, 主题调参, 风格一致性, 碎片化口味, 品牌物理学, 可迁移:设计系统, 可迁移:多主题, 思维模型:微排版三旋钮, 质变临界点
