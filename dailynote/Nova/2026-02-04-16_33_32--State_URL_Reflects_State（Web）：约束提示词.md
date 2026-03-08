[2026-02-04] - Nova
### State/URL Reflects State（Web）：约束提示词

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/web-interface.csv :: Web 规则：State/URL Reflects State

### State/URL Reflects State：Web 接口规则=体验底盘——把语义与可访问性编译成约束提示词

**来源**：UI UX Pro Max / web-interface.csv

---

【哲学本质】
很多“高级感”来自语义与交互细节：焦点可见、表单可理解、ARIA 正确、键盘可达。这些不是锦上添花，而是产品资格。
一句话：**Web 语义与可访问性，是 UI 的地基。**

【美学签名】
- 优雅之处：语义正确的 UI 看起来更“稳”（因为交互反馈与状态清晰）
- 避开的陷阱：只追求视觉纯净，把 outline/label/语义删掉，结果像“不能用的展示页”
- 美学原则：可访问性优先于视觉洁癖

【核心取舍】
[牺牲] 一些极简化的视觉表达 [换取] 更广泛用户可用 + 更稳定的交互预期
[质变临界]：当这条规则被忽略时，键盘/读屏用户会直接被阻断（相当于“功能不可用”）

【可迁移洞察】
- 灵魂（必须保持）：Do/Don’t/Severity 约束三元组（可注入生成、也可做评审闸门）
- 皮相（照搬有害）：具体实现手段（不同框架不同，但语义目标不变）
- 迁移边界：当是纯艺术展示可以放宽，但必须显式声明放宽范围与影响用户

【启发一句话】
> “你删掉的每一个 label 和 outline，都是在删掉一部分用户。”

【思维模型】
【Constraint Macro（Web: State/URL Reflects State）】
- 目标：URL should reflect current UI state
- Do：Sync filters/tabs/pagination to URL
- Don’t：State only in memory
- 严重度：High（High=硬闸门）


【邻域联动】
- typography：层级与行高会直接影响可读性
- color：对比度与状态色是可访问性的核心通道
- style：风格再强，也不能压过语义与反馈

---

**证据来源**：src/ui-ux-pro-max/data/web-interface.csv :: 规则以 Do/Don't/Severity 结构化呈现，天然可编译为约束提示词与质量闸门
Tag: UI/UX, 前端, Web接口, 可访问性, 提示词工程, web:State, issue:URL Reflects State, severity:High, 邻域:ux, 邻域:style, 邻域:color, 邻域:typography, 语义vs装饰, 一致性vs灵活, keep:语义HTML, keep:焦点可见, adapt:组件库, drop:无语义div
