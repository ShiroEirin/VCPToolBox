[2026-02-04] - Nova
### Master + Overrides：把设计系统当“层级配置”——跨页面一致性与局部差异同时成立

Repo: ui-ux-pro-max-skill
Origin: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill.git

Sources:
- README.md :: 提出 Persist Design System（MASTER + pages overrides）并给出检索优先级说明
- src/ui-ux-pro-max/scripts/search.py :: 描述 --persist / --page 输出结构，并提示“page 覆盖 master”
- src/ui-ux-pro-max/scripts/design_system.py :: generate_design_system(...) 支持 persist/page/output_dir 以落地层级结构

### Master + Overrides：把设计系统当“层级配置”——跨页面一致性与局部差异同时成立

**来源**：UI UX Pro Max / README.md

---

【哲学本质】
设计系统不是一份静态文档，而是一套“可检索的配置层级”：全局 MASTER 负责不变量，页面 overrides 只写偏离点。
一句话：**一致性来自不变量，差异性来自覆写。**

【美学签名】
- 优雅之处：把“设计一致性”从“靠人记住”变成“靠检索顺序保证”（先 pages/xx，再 MASTER）
- 避开的陷阱：设计系统写得很全，但落地时每个页面又各搞一套，最终变成“讲义”而不是“约束”
- 美学原则：**最小差异原则**（override 只包含 deviation，降低漂移熵）

【核心取舍】
[牺牲] 需要维护文件结构与命名规范（pages/slug） [换取] 大型产品里“局部特例”不会吞噬全局风格
[质变临界]：当 overrides 过多且开始互相矛盾时，MASTER 失去权威，系统退化为碎片化规则堆

【可迁移洞察】
- 灵魂（必须保持）：
  - MASTER = 不变量（colors/typography/spacing/components）
  - Override = 只写差异（仅 deviations）
  - 检索顺序 = pages > master
- 皮相（照搬有害）：具体目录名（design-system/MASTER.md）
- 迁移边界：单页站或小工具（页面数量极少）不必引入层级

【启发一句话】
> “让一致性靠结构，而不是靠自觉。”

【思维模型】
“层级配置”三问：
1) 什么必须全局一致？（写进 MASTER）
2) 什么允许局部例外？（写进 Override）
3) 例外是否可被删除？（若不能删，说明它其实应升级为 MASTER）

---

**证据来源**：README.md :: 明确 pages 覆盖 MASTER 的检索规则；src/ui-ux-pro-max/scripts/search.py :: --persist/--page 的落地结构与提示文案
Tag: UI/UX, 设计系统, 知识管理, 层级配置, 可检索规则, 一致性, 差异控制, 熵减, 约束系统, 灵活vs可控, 一致性vs个性化, 文档vs约束, keep:MASTER不变量, keep:override只写差异, adapt:命名规范, drop:页面随意发挥, 可迁移:配置管理
