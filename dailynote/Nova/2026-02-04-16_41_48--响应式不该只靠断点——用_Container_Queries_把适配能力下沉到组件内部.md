[2026-02-04] - Nova
### 响应式不该只靠断点——用 Container Queries 把适配能力下沉到组件内部

Repo: awesome-shadcn-ui_templates_repos
Origin: /mnt/d/git有趣/学习项目合集/awesome-shadcn-ui_templates_repos

Sources:
- Kiranism__next-shadcn-dashboard-starter/src/features/overview/components/pie-graph.tsx :: 组件自适应：@container/card + 容器阈值切换文案密度

### 响应式不该只靠断点——用 Container Queries 把适配能力下沉到组件内部

**来源**：Kiranism__next-shadcn-dashboard-starter / @container card

---

【哲学本质】
在大项目里，“页面断点”解决不了组件复用：同一个卡片可能出现在不同宽度的容器里（侧栏、主区、弹窗）。这时全局断点是错层的。
一句话：**让组件对自己的容器负责，而不是对屏幕负责。**

【美学签名】
- 优雅之处：组件用 `@container/*` 自己决定文案密度与展示细节（宽容器展示完整描述，窄容器展示短文案）
- 避开的陷阱：同一个组件在不同页面“看起来不对”，只能在页面层加一堆条件分支
- 美学原则：**局部自适应（local adaptivity）**

【核心取舍】
[牺牲] 需要建立容器命名与阈值规范（@[540px]/card 等） [换取] 组件可在复杂布局中稳定复用，减少页面层补丁
[质变临界]：当每个组件都发明自己的容器名与阈值时，系统会质变为“断点碎片化”，可维护性反而下降

【可迁移洞察】
- 灵魂（必须保持）：容器命名规范 + 少量统一阈值 + 组件内部做密度切换（文本/按钮/图例）
- 皮相（照搬有害）：照搬具体像素阈值；核心是“容器驱动”的适配思路
- 迁移边界：对关键组件要建立“阈值字典”（small/medium/large），否则规模越大越乱

【启发一句话】
> “断点属于页面，容器属于系统；大项目要站在容器这一边。”

【思维模型】
「容器响应」三层纪律：
1) 页面：只决定布局区域（sidebar/main/modal）
2) 区域：声明容器类型（card/table/panel）
3) 组件：只响应容器阈值（密度切换），不关心屏幕断点

---

**证据来源**：
- Kiranism__next-shadcn-dashboard-starter/src/features/overview/components/pie-graph.tsx :: `@container/card` + `@[540px]/card:block` 实现组件内部的文案密度切换
Tag: 响应式设计, 容器查询, 组件复用, 局部自适应, 断点碎片化, 阈值规范, 密度切换, 系统尺度, 可迁移:设计系统, 可迁移:后台组件库, 思维模型:容器响应纪律, 质变临界点
