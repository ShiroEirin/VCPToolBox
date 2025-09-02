# VCP Agent 开发文档（模型可读/生成规范）

本文档为在 VCP（VCPToolBox）平台上由模型自动生成或由开发者手工编写的 Agent 提供一套标准化、可验证的开发规范与示例。目的是保证 Agent 能安全、可靠、可维护地接入并使用 VCP 的插件、异步机制与记忆体系。

适用范围
- Agent 开发者（人工/模型生成）
- 需要与 VCP 插件互操作的系统组件

关键参照（强烈建议阅读）
- 平台总体与协议：[`README.md`](README.md:12)
- 同步/异步插件开发手册：[`同步异步插件开发手册.md`](同步异步插件开发手册.md:1)
- Agent 角色卡指南：[`Agent/VCP专家Agent角色卡指南.txt`](Agent/VCP专家Agent角色卡指南.txt:1)
- Agent 示例：[`Agent/Nova.txt`](Agent/Nova.txt:1)
- Agent 通信插件实现：[`Plugin/AgentAssistant/AgentAssistant.js`](Plugin/AgentAssistant/AgentAssistant.js:1)
- AgentAssistant 配置示例：[`Plugin/AgentAssistant/config.env.example`](Plugin/AgentAssistant/config.env.example:45)
- 插件管理与工具描述：[`Plugin.js`](Plugin.js:438)
- 异步占位符与回调机制：[`README.md`](README.md:780)

一、Agent 类型与职责
1. Expert Agent（专家型）
   - 具有独立人格（角色卡）、长期记忆（日记）、并能以自然语言与用户交互。
   - 主要关注领域能力：研究、写作、编程、项目管理等。
2. Builder Agent（构建/工具型）
   - 无独立人格，被 Expert Agent 或系统调用执行具体功能（例如：代码生成、爬虫、数据分析）。
   - 通过 `AgentAssistant` 插件注册与调用（参照：[`Plugin/AgentAssistant/config.env.example`](Plugin/AgentAssistant/config.env.example:45)）。

二、角色卡（Agent 描述文件）规范
- 存放位置：仓库的 `Agent/` 目录，文件格式为纯文本 `.txt`（例如：`Agent/Nova.txt`）。
- 文件必须为“纯净文本块”，不得包含创作指导或 Markdown 标题（详细模板见：[`Agent/VCP专家Agent角色卡指南.txt`](Agent/VCP专家Agent角色卡指南.txt:1)）。
- 必要模块（按推荐顺序）：
  1) 角色背景（Background）——用第三人称描述；
  2) 风格指令（Style）——输出风格、格式约束；
  3) 核心认知（Core Cognition）——用第二人称“你”描述自我认知与动机；
  4) 功能层链接（Function Layer）——引用 `{{Var...}}` 中定义的职责或工具列表；
  5) 记忆绑定（Diary）——明确写入/读取的日记占位符（必须包含“日记本”字样，例如 `{{Nova日记本}}`），详见：[`Agent/VCP专家Agent角色卡指南.txt`](Agent/VCP专家Agent角色卡指南.txt:31)。
- 语言建议：使用“英文核 + 中文壳”以兼顾模型能力与用户体验（详见模板说明）。

三、系统提示词工程（System Prompt）
- 使用 VCP 的变量体系注入上下文：`{{Tar*}}`, `{{Var*}}`, `{{Sar*}}`，其中 `{{Tar*}}` 优先级最高（参见：[`README.md`](README.md:123)）。
- 将插件能力以占位符注入系统提示（例如 `{{VCPFluxGen}}`），该描述由 `PluginManager.buildVCPDescription()` 生成并维护（实现参考：[`Plugin.js`](Plugin.js:438)）。
- 推荐把角色卡占位放到系统提示内，例如：
  ```
  {{Nova}}
  ```
  这样服务器会把 `Agent/Nova.txt` 的文本注入模型上下文（参见：[`Agent/Nova.txt`](Agent/Nova.txt:1)）。

四、工具调用协议（Agent 输出必须遵守）
- VCP 的唯一工具调用语法（严格格式化，Agent 必须使用）：
  ```
  <<<[TOOL_REQUEST]>>>
  tool_name:「始」<工具名>「末」,
  key1:「始」value1「末」,
  key2:「始」value2「末」
  <<<[END_TOOL_REQUEST]>>>
  ```
  说明：所有参数必须使用 `「始」` / `「末」` 包裹以保证解析鲁棒性（见：[`README.md`](README.md:35)）。
- Agent 在构造参数时应优先参照对应插件的 `plugin-manifest.json` 中 `capabilities.invocationCommands.description` 的字段名与示例（示例见：[`Plugin/FluxGen/plugin-manifest.json`](Plugin/FluxGen/plugin-manifest.json:1)）。
- 批量/串行调用（Chained Syntax）：
  - 当需要一次性执行多步操作，使用 `command1` / `filePath1` / `command2` / ... 的数字后缀约定（详见：[`README.md`](README.md:159)）。

五、同步与异步插件交互（Agent 侧行为）
- 同步插件（synchronous）
  - Agent 发出调用后，会在同一次交互中收到插件返回的 JSON（`status` / `result` / `error`）。
  - Agent 需解析并以自然语言向用户汇报结果与下一步建议。
- 异步插件（asynchronous）
  - 插件在初始阶段应立即返回包含任务ID与引导文本的 JSON，且引导文本必须指示 Agent 在其回复中原文包含占位符 `{{VCP_ASYNC_RESULT::PluginName::RequestId}}`（见：[`同步异步插件开发手册.md`](同步异步插件开发手册.md:704)）。
  - Agent 责任：
    1) 把占位符原文呈现给用户（不可改写）；
    2) 告知用户任务预计耗时与如何获取结果（如等待替换或前端 WebSocket 通知）。
  - 当后端回调完成并写入 `VCPAsyncResults/` 中的结果文件，服务器会在后续上下文替换占位符（参见：[`README.md`](README.md:78)）。
- 错误处理：
  - 若插件返回 `status: "error"`，Agent 必须向用户说明错误原因、是否可重试并建议后续操作。
  - 对于 `FILE_NOT_FOUND_LOCALLY` 情形，Agent 可提示提供可访问路径或等待服务器通过 `FileFetcherServer` 远程获取（参见：[`同步异步插件开发手册.md`](同步异步插件开发手册.md:313)）。

六、AgentAssistant 中的 Agent 注册与调用
- 在 [`Plugin/AgentAssistant/config.env.example`](Plugin/AgentAssistant/config.env.example:45) 模板中，为每个 Agent 配置一组环境变量：
  - `AGENT_{BASENAME}_MODEL_ID`（必需）
  - `AGENT_{BASENAME}_CHINESE_NAME`（必需，作为调用名）
  - `AGENT_{BASENAME}_SYSTEM_PROMPT`（推荐）
  - `AGENT_{BASENAME}_MAX_OUTPUT_TOKENS`、`AGENT_{BASENAME}_TEMPERATURE` 等可选项
- AgentAssistant 的加载逻辑参考实现：[`Plugin/AgentAssistant/AgentAssistant.js`](Plugin/AgentAssistant/AgentAssistant.js:56)
- Agent 调用示例（由某 Agent 向 Builder Agent 发送即时消息）：
  ```
  <<<[TOOL_REQUEST]>>>
  tool_name:「始」AgentAssistant「末」,
  agent_name:「始」ResearchBot「末」,
  prompt:「始」请检索关于X主题的最新资料并总结要点。「末」
  <<<[END_TOOL_REQUEST]>>>
  ```

七、测试用例（必须包含到 CI 或开发流程）
- 单元测试（文本级）
  - 验证 Agent 能根据 `plugin-manifest` 生成符合 `<<<[TOOL_REQUEST]>>>` 语法的调用文本。
- 集成测试（端到端）
  - 使用一个简单同步插件（例如 Echo）来验证：Agent 发起调用 → 插件执行 → Agent 解析结果 → 返回用户。
- 异步流程测试
  - 模拟异步插件返回占位符，确认 Agent 在回复中保留占位符；再模拟回调并确认上下文替换。
- 特殊场景测试
  - 测试 FILE_NOT_FOUND_LOCALLY、网络超时、插件 stderr 输出的处理与用户反馈。

八、安全与合规
- 严禁在未经用户明确授权的情况下执行写磁盘、执行远程命令或渲染未信任的 raw HTML（参见：[`Agent/Nova.txt`](Agent/Nova.txt:61)）。
- 不要通过非官方代理或中转 API 使用平台（强烈警告见：[`README.md`](README.md:22)）。
- Agent 在需要使用或暴露敏感信息（API key、账号等）前必须请求用户确认并记录操作日志。

九、交付清单（交付给运维/测试团队）
- [ ] 提交 `Agent/<Name>.txt` 角色卡文件（已清理注释）；
- [ ] 在 `Plugin/AgentAssistant/config.env` 中注册 Agent 配置并重启服务或触发热加载；
- [ ] 创建至少 3 个自动化测试用例（同步、异步、远程文件场景）；
- [ ] 完成安全审查（文件写入、raw HTML、外部API调用）并记录同意流程；
- [ ] 在系统提示中加入必要的工具占位（`{{VCP...}}`）。

十、样例：最小合格 Agent（模板）
- 角色卡最小示例（请保存为 `Agent/ExampleAgent.txt`）：
  ```
  # ExampleAgent
  ExampleAgent日记本:{{ExampleAgent日记本}}
  你是 ExampleAgent，一个专注于文献检索与总结的助手。你的回答需包含结构化摘要（要点+详细），并在发现不确定信息时主动列出检索方法和可复现步骤。
  System tool list: {{VCPAllTools}}
  ```
- Agent 发起工具调用（同步示例）：
  ```
  <<<[TOOL_REQUEST]>>>
  tool_name:「始」TavilySearch「末」,
  query:「始」最新的量子计算综述 2024 年「末」
  <<<[END_TOOL_REQUEST]>>>
  ```
- 异步示例（提交任务并保留占位符）：
  ```
  <<<[TOOL_REQUEST]>>>
  tool_name:「始」Wan2.1VideoGen「末」,
  prompt:「始」生成一段30秒的抽象视觉动画，风格为梦幻低多边形「末」
  <<<[END_TOOL_REQUEST]>>>
  ```

十一、常见问题（FAQ）
Q1：Agent 文件修改后是否实时生效？  
A1：Agent 的加载与生效依赖 `AgentAssistant` 插件的配置读取逻辑，通常修改 `Plugin/AgentAssistant/config.env` 或角色卡后需要重启服务或触发插件热加载（详见：[`Plugin/AgentAssistant/AgentAssistant.js`](Plugin/AgentAssistant/AgentAssistant.js:56)）。

Q2：如何让 Agent 使用特定工具的最新说明？  
A2：工具说明由 `PluginManager.buildVCPDescription()` 自动生成并通过 `{{VCP<PluginName>}}` 占位注入系统提示。确保插件 manifest 中的 `capabilities.invocationCommands.description` 完整且示例清晰（参见：[`Plugin.js`](Plugin.js:438)）。

参考与延伸阅读
- 平台总体：[`README.md`](README.md:12)
- 插件开发手册：[`同步异步插件开发手册.md`](同步异步插件开发手册.md:1)
- Agent 角色卡模板：[`Agent/VCP专家Agent角色卡指南.txt`](Agent/VCP专家Agent角色卡指南.txt:1)
- AgentAssistant 实现：[`Plugin/AgentAssistant/AgentAssistant.js`](Plugin/AgentAssistant/AgentAssistant.js:1)

—— End of Document ——