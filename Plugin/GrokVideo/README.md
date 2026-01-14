# GrokVideoGen 插件 (同步版)

这是一个 VCP 同步插件，用于通过 Grok API 进行图像到视频 (Image-to-Video, i2v) 的生成。

## 功能

*   **图生视频 (i2v)**: 根据用户提供的图片 URL 和指导性提示词生成视频。
*   **同步处理**: 插件会同步等待 API 响应，完成后直接返回结果。
*   **超栈追踪**: 完美支持分布式设备图片解析。如果图片位于分布式节点的本地路径（`file://`），插件会抛出标准错误引导主服务进行分布式解析并重试。
*   **委托下载**: 采用与 Suno 插件类似的委托进程下载技术。在插件返回结果并退出后，由独立的后台进程负责将视频持久化到 VCP 的 `file/video` 目录，确保下载任务的可靠性。

## 配置

在插件目录下创建一个名为 `config.env` 的文件，并包含以下内容（参考 [`config.env.example`](Plugin/GrokVideo/config.env.example)）：

```env
GROK_API_KEY="你的_GROK_API_KEY"
GROK_API_BASE="https://api.x.ai"
GrokVideoModelName="grok-imagine-0.9"
# DebugMode=True # 可选
```

## 依赖

*   **Python**: 版本 >= 3.7
*   **Python 库**: `requests`, `python-dotenv`, `Pillow` (见 [`requirements.txt`](Plugin/GrokVideo/requirements.txt))

## 使用说明 (供 AI 参考)

AI 助手必须按照 [`plugin-manifest.json`](Plugin/GrokVideo/plugin-manifest.json) 中定义的极简格式调用。

**调用示例**:
<<<[TOOL_REQUEST]>>>
tool_name:「始」GrokVideoGen「末」,
image_url:「始」http://example.com/cat.jpg「末」,
prompt:「始」让这只猫跑起来「末」
<<<[END_TOOL_REQUEST]>>>
