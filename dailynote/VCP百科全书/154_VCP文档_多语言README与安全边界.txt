[2026-07-22] - 哈雷酱
[VCP百科全书] VCP文档——多语言README与安全边界

一、文档来源
- 根目录 `README.md`（中文主文档）
- 根目录 `README_en.md`（英文版）
- 根目录 `README_ja.md`、`README_ru.md`（多语对照入口）

二、核心共识（跨语言一致）
- VCP定位：AI能力增强中间层，强调“AI-工具-记忆”铁三角协同。
- 核心目标：不受模型类型、模态、前端形态限制的统一协议生态。
- 架构风格：插件驱动 + 分布式 + 记忆系统（RAG/TagMemo V9.1）深度耦合。

三、安全边界（RAG检索高优先级）
- README首屏明确高危警告：系统权限高，非专业用户不要盲目部署。
- 强烈禁止使用非官方/反代API，避免敏感信息外泄。
- 生产部署必须把“凭证隔离、最小权限、来源可信”作为默认策略。
- 插件权限声明体系：fetch_data_from_url、write_to_file_system、read_from_file_system 等 permissions 字段。
- plugin-manifest.json.block 机制：禁用态清单，启用前需确认依赖与安全策略。

四、功能总览关键词
- 插件生态：同步/异步/静态/服务/混合服务/messagePreprocessor 多种协议，另有边缘类型placeholder。
- 记忆系统：DailyNote + TagMemo“浪潮”算法V9.1（生产版）+ 向量检索。
- 分布式：跨节点文件与工具调用、统一追踪与回传。
- 前端协同：VCPChat可对复杂多模态返回进行深度渲染。

五、实务建议（给Agent/开发者）
- 先读中文README建立语义全景，再用英文版核对术语映射。
- 对外说明时优先引用“风险警告 + 架构定位 + 插件契约”三件套。
- 做RAG切片时优先保留：协议名、能力边界、风险词元、入口文件名。
- 插件开发必须提供 plugin-manifest.json，包含 name、version、pluginType、configSchema、capabilities 等完整字段。

六、架构演进（2026-07核验状态）
- TagMemo已从V5演进到V9.1生产版（+ V10 Alpha实验）
- rust-vexus-lite作为Rust向量搜索引擎已集成
- 管理面板从AdminPanel迁移到AdminPanel-Vue
- VCPBridgeServer插件支持独立端口拦截CLI工具请求


- ImageProcessor已升级为SQLite缓存（multimodal_cache.sqlite），支持音频/视频多模态处理

Tag: VCP, README, README_en, 多语言文档, 安全边界, 风险警告, AI中间层, 插件生态, 分布式架构, TagMemo V9.1, DailyNote, RAG知识库, AdminPanel-Vue, rust-vexus-lite, VCPBridgeServer, plugin-manifest.json.block, TagMemo V9.1
