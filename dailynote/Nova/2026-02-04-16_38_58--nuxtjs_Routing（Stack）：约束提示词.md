[2026-02-04] - Nova
### nuxtjs/Routing（Stack）：约束提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/stacks/nuxtjs.csv :: Category=Routing 规则集（Do/Don't/Severity）

### nuxtjs/Routing：把经验变成闸门——用 Severity 分层的约束提示词

**来源**：UI UX Pro Max / data/stacks/nuxtjs.csv

---

【哲学本质】
Routing 不是“实现细节”，而是体验稳定性的来源：一旦在这个层面失控，风格与结构都会被拖垮。
一句话：**把 Routing 的规则当成硬闸门，UI 才能稳定复现。**

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
【Constraint Macro（nuxtjs/Routing）】
- 目标：从该类别挑 3 条 High 作为硬闸门，其余 Medium 作为默认遵守
- 落地：把 Do/Don’t 写进代码评审清单与生成提示词
- 验收：一旦违反 High，优先修复而不是‘解释’

【本类别精选规则（Top 5）】
- (High) Define page metadata with definePageMeta: Do=definePageMeta for layout middleware title | Don’t=Manual route meta configuration
- (Medium) Use dynamic route parameters: Do=[id].vue for dynamic params | Don’t=Hardcoded routes for dynamic content
- (Medium) Use file-based routing: Do=pages/ directory with index.vue | Don’t=Manual route configuration
- (Medium) Use validate for route params: Do=validate function in definePageMeta | Don’t=Manual validation in setup
- (Low) Use catch-all routes: Do=[...slug].vue for catch-all | Don’t=Multiple nested dynamic routes

【适用邻域】
- 邻域:ux, 邻域:landing

---

**证据来源**：src/ui-ux-pro-max/data/stacks/nuxtjs.csv :: Routing 分类下提供 Do/Don't/Severity 字段，可被直接编译为约束提示词
Tag: 前端, 提示词工程, 约束系统, 质量闸门, Stack指南, stack:nuxtjs, UI/UX, category:Routing, 邻域:ux, 邻域:landing, 清晰度vs灵活, 一致性vs个性化, keep:Do/Don't结构, keep:Severity分层, adapt:框架版本, drop:经验碎片化, keep:High硬闸门, drop:口头经验
