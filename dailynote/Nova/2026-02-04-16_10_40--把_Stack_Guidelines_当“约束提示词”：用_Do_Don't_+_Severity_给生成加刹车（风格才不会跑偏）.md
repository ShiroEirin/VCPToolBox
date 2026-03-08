[2026-02-04] - Nova
### 把 Stack Guidelines 当“约束提示词”：用 Do/Don't + Severity 给生成加刹车（风格才不会跑偏）

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- src/ui-ux-pro-max/data/stacks/html-tailwind.csv :: 每条指南包含 Do/Don't 与 Severity，可直接转成约束提示
- src/ui-ux-pro-max/scripts/core.py :: STACK_CONFIG + _STACK_COLS 定义了“指南字段结构”，使其可被统一检索/组合
- src/ui-ux-pro-max/templates/base/skill-content.md :: 流程要求补充 stack 搜索，把实现最佳实践注入最终生成

### 把 Stack Guidelines 当“约束提示词”：用 Do/Don't + Severity 给生成加刹车（风格才不会跑偏）

**来源**：UI UX Pro Max / stacks/*.csv

---

【哲学本质】
风格提示词解决“往哪儿走”，stack 指南解决“怎么走不翻车”：它们是同一条生成链路的方向盘与刹车。
一句话：**风格决定方向，指南决定边界。**

【美学签名】
- 优雅之处：每条指南天然就是“约束提示”三元组：Do / Don't / Severity
- 避开的陷阱：只盯风格会产生“漂亮但不可用”的 UI（例如过长动效、眩晕动画、交互反馈不稳定）
- 美学原则：**可用性是审美的一部分**（好的动效首先是“让人舒服”）

【核心取舍】
[牺牲] 一些夸张的视觉表达 [换取] 更稳定的交互体验与性能底线
[质变临界]：当约束缺失或 Severity 被忽略时，生成会在动效/布局上失控，最终让“风格”变成噪声

【可迁移洞察】
- 灵魂（必须保持）：把 stack 指南作为“负面提示 + 约束强度”注入生成
- 皮相（照搬有害）：具体的 Tailwind 类名（其他栈要翻译成等价约束）
- 迁移边界：当产品目标是实验性视觉艺术时，可以降低 Severity 的权重，但必须显式声明

【启发一句话】
> “你不是在给模型加规则，你是在给风格加刹车。”

【思维模型】
“约束提示词”拼装法：
1) 先选风格（给方向）
2) 再选 stack（给约束集）
3) 按 Severity 分层：High = 必须遵守；Medium = 默认遵守；Low = 可选

---

**证据来源**：src/ui-ux-pro-max/data/stacks/html-tailwind.csv :: Do/Don't/Severity 结构；src/ui-ux-pro-max/scripts/core.py :: _STACK_COLS 统一字段，使指南可被检索与组合进最终提示
Tag: UI/UX, 提示词工程, 约束系统, Stack指南, TailwindCSS, Do/Don't, Severity分层, 动效治理, 可用性, 风格vs可用性, 动效vs性能, 自由vs边界, keep:Do/Don't结构, keep:Severity权重, adapt:跨栈翻译, drop:只谈风格不谈实现
