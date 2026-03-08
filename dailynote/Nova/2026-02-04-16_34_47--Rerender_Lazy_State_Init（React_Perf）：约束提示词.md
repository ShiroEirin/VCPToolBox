[2026-02-04] - Nova
### Rerender/Lazy State Init（React Perf）：约束提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/react-performance.csv :: React 性能：Rerender/Lazy State Init

### Rerender/Lazy State Init：性能不是优化，是设计——把 React 性能经验编译成约束提示词

**来源**：UI UX Pro Max / react-performance.csv

---

【哲学本质】
性能问题往往不是“缺少优化技巧”，而是边界设计失败：渲染边界不清、依赖不稳定、数据流不收敛。
一句话：**性能=架构的副作用；先设计边界，再谈优化。**

【美学签名】
- 优雅之处：把性能当成默认属性（少渲染、少计算、少传输）
- 避开的陷阱：靠临时 memo/缓存救火，越补越乱
- 美学原则：稳定依赖 + 明确边界 + 可预测数据流

【核心取舍】
[牺牲] 一些“写起来爽”的随意性 [换取] 可规模化的交互流畅与可维护性
[质变临界]：当多个 Medium 叠加时，会形成“慢但说不清哪里慢”的系统性拖垮

【可迁移洞察】
- 灵魂（必须保持）：Do/Don’t/Severity 三元组可注入生成与评审
- 皮相（照搬有害）：具体 hook/库（技术会变，但边界思想不变）
- 迁移边界：当页面极简单时不要过度工程化，但必须为增长留出边界位

【启发一句话】
> “你以为你在做性能优化，其实你在补一个边界设计的洞。”

【思维模型】
【Constraint Macro（React Perf: Rerender/Lazy State Init）】
- 症状/本质：Pass function to useState for expensive initial values
- Do：Use function form for expensive init
- Don’t：Compute expensive value directly
- 严重度：Medium（High=硬闸门）


【邻域联动】
- ux：性能直接决定“是否专业”（滚动/点击/输入延迟）
- web：指标与可访问性同样是底盘
- nextjs：数据获取与渲染策略会决定瓶颈形态

---

**证据来源**：src/ui-ux-pro-max/data/react-performance.csv :: 规则以 Do/Don't/Severity 结构化呈现，可编译为约束提示词与质量闸门
Tag: 前端, React, 性能, 提示词工程, 质量闸门, react:Rerender, issue:Lazy State Init, severity:Medium, 邻域:ux, 邻域:web, 邻域:nextjs, 性能vs可维护, 抽象vs具体, keep:渲染边界, keep:依赖稳定, adapt:数据获取策略, drop:无脑重渲染
