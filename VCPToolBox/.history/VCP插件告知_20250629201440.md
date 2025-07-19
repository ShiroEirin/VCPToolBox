# VCPToolBox 插件配置指南 (最终完整版)

此文档根据项目插件的 `plugin-manifest.json` 文件和官方 `README.md` 整理，旨在提供一份完整、准确的插件功能及配置说明。

---

## 核心能力分类

### 一、 API 密钥依赖插件

这类插件连接到外部付费或需要账户的服务。不提供正确的密钥，它们将无法工作。

1.  **`TavilySearch`** (网络搜索)
    *   **功能**: 赋予 AI 强大的网络搜索能力。
    *   **配置**: 在**根目录 `config.env`** 中找到 `TavilyKey` 并填入您的 Tavily API 密钥。

2.  **`BilibiliFetch`** (B站内容获取)
    *   **功能**: 让 AI 能够“看”B站视频，理解其内容。
    *   **配置**: 在**根目录 `config.env`** 中找到 `BILIBILI_COOKIE` 并填入您登录B站后的 Cookie 值。

3.  **`FluxGen`** (文生图)
    *   **功能**: 使用 SiliconFlow API 的 FLUX 模型生成高质量图片。
    *   **配置**: 在 `Plugin/FluxGen/` 目录下创建 `config.env` 文件，并填入 `SILICONFLOW_API_KEY`。

4.  **`DoubaoGen`** (豆包文生图)
    *   **功能**: 使用火山方舟的豆包模型生成图片。
    *   **配置**: 在 `Plugin/DoubaoGen/` 目录下创建 `config.env` 文件，并填入 `VOLCENGINE_API_KEY`。

5.  **`NovelAIGen`** (动漫风格文生图)
    *   **功能**: 使用 NovelAI API 生成动漫风格的图片。
    *   **配置**: 在 `Plugin/NovelAIGen/` 目录下创建 `config.env` 文件，并填入 `NOVELAI_API_KEY`。

6.  **`SunoGen`** (AI音乐生成)
    *   **功能**: 使用 Suno API 生成原创歌曲。
    *   **配置**: 在 `Plugin/SunoGen/` 目录下创建 `config.env` 文件，并填入您的 `SunoKey` 和对应的 `SunoApiBaseUrl`。

7.  **`VideoGenerator`** (文生/图生视频)
    *   **功能**: 使用 Wan2.1 API 生成视频。这是一个**异步插件**，任务在后台执行。
    *   **配置**: 在 `Plugin/VideoGenerator/` 目录下创建 `config.env` 文件，并填入您的 `SILICONFLOW_API_KEY`。

8.  **`WeatherReporter`** (天气预报)
    *   **功能**: 提供实时天气信息，包括预警、小时详情和多日预报。
    *   **配置**: 需要在**根目录 `config.env`** 中提供和风天气等服务商的 `WeatherKey` 和 `WeatherUrl`。

---

### 二、 连接自建服务插件

这些插件需要知道如何连接到您自己部署的其他服务。

1.  **`1PanelInfoProvider`** (1Panel 面板信息)
    *   **功能**: 让 AI 能够获取您 1Panel 服务器管理面板的信息。
    *   **配置**: 在 `Plugin/1PanelInfoProvider/` 目录下创建 `config.env` 文件，并填入您的 1Panel 服务地址 (`PanelBaseUrl`) 和 API 密钥 (`PanelApiKey`)。

2.  **`FRPSInfoProvider`** (内网穿透信息)
    *   **功能**: 让 AI 了解您 FRPS 服务器上的设备连接状态。
    *   **配置**: 在 `Plugin/FRPSInfoProvider/` 目录下创建 `config.env` 文件，并填入您的 FRPS 服务器地址、用户名和密码。

3.  **`SynapsePusher`** (Synapse/Matrix 日志推送)
    *   **功能**: 将 VCP 日志实时推送到指定的 Synapse (Matrix) 房间。
    *   **配置**: 在 `Plugin/SynapsePusher/` 目录下创建 `config.env` 文件，并填入您的 Synapse 服务器地址、房间ID和访问令牌等信息。

4.  **`VCPLog`** (Gotify 日志推送)
    *   **功能**: 可以将 VCP 的日志通过 Gotify 推送到您的手机等设备上。
    *   **配置 (可选)**: 在 `Plugin/VCPLog/` 目录下创建 `config.env` 文件，配置您的 Gotify 服务地址和应用 Token。

---

### 三、 可选配置与功能性插件

这些插件大部分开箱即用，但部分可通过配置来微调它们的功能。

1.  **`ArxivDailyPapers`** (学术论文获取)
    *   **功能**: 定期从 Arxiv.org 拉取您感兴趣领域的最新论文。
    *   **配置 (可选)**: 可在 `Plugin/ArxivDailyPapers/` 目录下创建 `config.env` 文件，通过 `ARXIV_SEARCH_TERMS` 自定义搜索的关键词。

2.  **`CrossRefDailyPapers`** (已发表论文获取)
    *   **功能**: 从 CrossRef 拉取已发表的学术论文元数据。
    *   **配置 (可选)**: 可在 `Plugin/CrossRefDailyPapers/` 目录下创建 `config.env` 文件，通过 `CROSSREF_QUERY_BIBLIOGRAPHIC` 自定义搜索的关键词。

3.  **`AgentAssistant`** (多 Agent 协同)
    *   **功能**: 核心插件，允许 AI 之间进行即时或**定时**的通讯、任务分发和协作。
    *   **配置 (可选)**: 可在 `Plugin/AgentAssistant/` 目录下创建 `config.env` 文件，详细定义每个 Agent 的模型、角色和能力。

---

### 四、 无需配置的核心功能插件

这些插件是 VCPToolBox 的核心组成部分，开箱即用，无需任何额外配置。

*   **`AgentMessage`**: 允许 AI 主动向用户前端发送消息。
*   **`DailyNoteGet`**: 读取日记，为 AI 提供长期记忆。
*   **`DailyNoteWrite`**: 让 AI 可以主动写日记。
*   **`DailyNoteManager`**: 让 AI 可以管理自己的日记/知识库。
*   **`DailyNoteEditor`**: 让 AI 可以编辑修正自己的知识。
*   **`EmojiListGenerator`**: 自动生成表情包列表供 AI 使用。
*   **`ImageProcessor`**: 自动识别和理解用户发送的图片。
*   **`ImageServer`**: 提供图床服务，需要您在**根目录 `config.env`** 中配置 `Image_Key`。
*   **`SciCalculator`**: 提供强大的科学计算能力。
*   **`UrlFetch`**: 提供基础的网页抓取能力。