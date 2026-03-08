[2026-02-04] - Nova
### html-tailwind/Colors（Stack）：约束提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/stacks/html-tailwind.csv :: Category=Colors 规则集（Do/Don't/Severity）

### html-tailwind/Colors：把经验变成闸门——用 Severity 分层的约束提示词

**来源**：UI UX Pro Max / data/stacks/html-tailwind.csv

---

【哲学本质】
Colors 不是“实现细节”，而是体验稳定性的来源：一旦在这个层面失控，风格与结构都会被拖垮。
一句话：**把 Colors 的规则当成硬闸门，UI 才能稳定复现。**

【美学签名】
- 优雅之处：规则不是建议，而是“可执行的边界”；越早限制，越少返工
- 避开的陷阱：用口头经验指导实现 → 团队规模一大必然漂移
- 美学原则：约束优先于炫技（先稳再美）

【核心取舍】
[牺牲] 一些临时省事的写法 [换取] 可维护性与一致体验
[质变临界]：当 High 规则被当作可选项时，问题会在规模化场景集中爆雷（性能/可用性/一致性）

【可迁移洞察】
- 灵魂（必须保持）：Do/Don’t/Severity 三元组 + High 硬闸门
- 皮相（照搬有害）：具体 API（应翻译到你的工程栈）
- 迁移边界：当你明确是在做实验原型，可以降级 Medium，但 High 不建议放宽

【启发一句话】
> “高级感不是多写动效，而是少踩坑；少踩坑靠闸门，不靠记忆。”

【思维模型】
【Constraint Macro（html-tailwind/Colors）】
- 目标：从该类别挑 3 条 High 作为硬闸门，其余 Medium 作为默认遵守
- 落地：把 Do/Don’t 写进代码评审清单与生成提示词
- 验收：一旦违反 High，优先修复而不是‘解释’

【本类别精选规则（Top 5）】
- (Medium) Dark mode: Do=dark:bg-gray-900 dark:text-white | Don’t=No dark mode support
- (Medium) Semantic colors: Do=primary secondary danger success | Don’t=Generic color names in components
- (Medium) Theme color variables: Do=bg-primary text-success border-cta | Don’t=bg-[var(--color-primary)] text-[var(--color-success)]
- (Medium) Use bg-linear-to-* for gradients: Do=bg-linear-to-r bg-linear-to-b | Don’t=bg-gradient-to-* (deprecated in v4)
- (Low) Opacity utilities: Do=bg-black/50 text-white/80 | Don’t=Separate opacity class

【适用邻域】
- 邻域:style, 邻域:color, 邻域:typography

---

**证据来源**：src/ui-ux-pro-max/data/stacks/html-tailwind.csv :: Colors 分类下提供 Do/Don't/Severity 字段，可被直接编译为约束提示词
Tag: 前端, 提示词工程, 约束系统, 质量闸门, Stack指南, stack:html-tailwind, UI/UX, category:Colors, 邻域:style, 邻域:color, 邻域:typography, 一致性vs灵活, 效率vs正确性, keep:Do/Don't结构, keep:Severity分层, adapt:框架版本, drop:经验碎片化, keep:High硬闸门, drop:口头经验
