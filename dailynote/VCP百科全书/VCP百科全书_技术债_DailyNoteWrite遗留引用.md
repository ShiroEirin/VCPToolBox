# VCP 技术债：DailyNoteWrite 遗留引用

状态：SOURCE_CONFIRMED_RISK
最后核验：2026-07-17
适用范围：VCPToolBox main 分支名称级引用审计
证据等级：SOURCE_BODY + DIRECTORY_PRESENCE

## 已确认
当前 Plugin 目录、Manifest 与入口中没有独立 DailyNoteWrite 实体；写入职能已并入 DailyNote create（dailynote.js:1602-1621）。但仍存在名称级引用：

- server.js:1359，executePlugin("DailyNoteWrite")。
- routes/admin/dream.js:72、:126，executePlugin('DailyNoteWrite')。
- scripts/diary-tag-batch-processor.js:29，默认指向 Plugin/DailyNoteWrite/TagMaster.txt。
- plugin-manifest-inventory.json:191-198，仍列 DailyNoteWrite 清单。

## 风险边界
这些证据只能确认遗留引用存在，不能确认每条调用在当前生产路径可达，也不能直接证明已经造成运行时故障。

## 待验证与建议动作
用启动日志、插件注册表检查、单元测试和受控调用验证可达性、失败表现及替代 DailyNote create 的迁移点，再决定移除或兼容适配。

历史来源：139_VCP记忆_日记系统与记忆四模式.txt、VCP百科全书_P0-RAG核验结果_证据复核R3.md AST-027。
未写入内容清单：未宣称生产必故障；未直接删除引用；未把 DailyNoteWrite 写成现行插件。
关联节点：DailyNote、DailyNoteManager、plugin registry、AgentDream。
Tag: 技术债, DailyNoteWrite, 遗留引用, SOURCE_CONFIRMED_RISK, 兼容性, 插件注册