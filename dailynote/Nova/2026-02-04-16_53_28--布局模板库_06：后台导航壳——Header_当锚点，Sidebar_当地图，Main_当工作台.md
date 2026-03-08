[2026-02-04] - Nova
### 布局模板库 06：后台导航壳——Header 当锚点，Sidebar 当地图，Main 当工作台

Repo: awesome-shadcn-ui_templates_repos
Origin: /mnt/d/git有趣/学习项目合集/awesome-shadcn-ui_templates_repos

Sources:
- shadcn__taxonomy/app/(dashboard)/dashboard/layout.tsx :: 后台壳：sticky header + sidebar 列 + main 工作区

### 布局模板库 06：后台导航壳——Header 当锚点，Sidebar 当地图，Main 当工作台

**来源**：shadcn__taxonomy / Dashboard Layout

---

【哲学本质】
后台不是“页面集合”，是“工作场景”：用户需要稳定锚点（账号/全局入口）、稳定地图（模块树）、以及可滚动的工作台（内容）。
一句话：**后台壳的目标是减少定位成本，而不是占满屏幕。**

【美学签名】
- 优雅之处：header sticky 固定锚点；sidebar 固定宽度提供地图；main 独占滚动承载工作
- 避开的陷阱：全页面滚动把导航卷走，用户每次都要重新定位
- 美学原则：**锚点 + 地图 + 工作台**

【核心取舍】
[牺牲] 一部分“沉浸式全屏” [换取] 多模块下的稳定空间记忆
[质变临界]：当你在 main 内再嵌套多个滚动区（表格滚/卡片滚/页面滚），用户会进入“滚动迷失”

【可迁移洞察】
- 灵魂（必须保持）：header/aside 固定 + main 单一滚动 + 侧栏只展示结构，不塞业务内容
- 皮相（照搬有害）：照搬 sidebar 200px；核心是“职责”
- 迁移边界：移动端要改为抽屉式导航，但仍应保持单一滚动区纪律

【启发一句话】
> “后台越大，导航越应该像地铁图，而不是像海报。”

【思维模型】
「后台壳三件套」：
1) 锚点（header）
2) 地图（sidebar）
3) 工作台（main）

---

**证据来源**：
- shadcn__taxonomy/app/(dashboard)/dashboard/layout.tsx :: sticky header + grid sidebar + main 容器结构
Tag: 布局模板库, 后台壳, 锚点地图工作台, 导航成本, 空间记忆, 滚动治理, 多模块系统, 结构定位, 可迁移:管理后台, 可迁移:SaaS, 思维模型:后台壳三件套, 质变临界点
