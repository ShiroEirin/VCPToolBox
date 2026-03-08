[2026-02-04] - Nova
### html-tailwind/Layout（Stack）：约束提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/stacks/html-tailwind.csv :: Category=Layout 规则集（Do/Don't/Severity）

### html-tailwind/Layout：把经验变成闸门——用 Severity 分层的约束提示词

**来源**：UI UX Pro Max / data/stacks/html-tailwind.csv

---

【哲学本质】
Layout 不是“实现细节”，而是体验稳定性的来源：一旦在这个层面失控，风格与结构都会被拖垮。
一句话：**把 Layout 的规则当成硬闸门，UI 才能稳定复现。**

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
【Constraint Macro（html-tailwind/Layout）】
- 目标：从该类别挑 3 条 High 作为硬闸门，其余 Medium 作为默认遵守
- 落地：把 Do/Don’t 写进代码评审清单与生成提示词
- 验收：一旦违反 High，优先修复而不是‘解释’

【本类别精选规则（Top 5）】
- (Medium) Container max-width: Do=max-w-7xl mx-auto for main content | Don’t=Full-width content on large screens
- (Medium) Container Queries: Do=Use @container and @lg: etc. | Don’t=Media queries for component internals
- (Medium) Grid gaps: Do=gap-4 gap-6 gap-8 | Don’t=Margins on individual items
- (Medium) Responsive padding: Do=px-4 md:px-6 lg:px-8 | Don’t=Same padding all sizes
- (Low) Flexbox alignment: Do=items-center justify-between | Don’t=Multiple nested wrappers

【适用邻域】
- 邻域:ux, 邻域:landing

---

**证据来源**：src/ui-ux-pro-max/data/stacks/html-tailwind.csv :: Layout 分类下提供 Do/Don't/Severity 字段，可被直接编译为约束提示词
Tag: 前端, 提示词工程, 约束系统, 质量闸门, Stack指南, stack:html-tailwind, UI/UX, category:Layout, 邻域:ux, 邻域:landing, 一致性vs灵活, 效率vs正确性, keep:Do/Don't结构, keep:Severity分层, adapt:框架版本, drop:经验碎片化, keep:High硬闸门, drop:口头经验
