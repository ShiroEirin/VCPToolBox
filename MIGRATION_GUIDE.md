# VCP ToolBox 配置迁移指南

## 📋 概述

本指南帮助您从旧版配置安全迁移到新版知识库 V2 系统配置。

### 迁移内容

- ✅ 知识库系统从旧版 RAG 升级到 V2 (Powered by Vexus-Lite)
- ✅ 保留所有真实 API 密钥和个人信息
- ✅ 添加新版配置项
- ✅ 删除废弃的旧配置
- ✅ 生成详细迁移报告

## 🚀 快速开始

### 1. 执行迁移

```bash
# 进入项目目录
cd D:\github\VCP\VCPToolBox-fork

# 执行迁移脚本（已自动备份）
node migrate-config.js
```

### 2. 查看迁移结果

迁移完成后会生成以下文件：

```
config-backups/
  └── config.env.backup_20251203_181944   # 原始配置备份

config.env.new                            # 新配置文件（待应用）
migration-report.txt                      # 详细迁移报告
```

### 3. 检查迁移报告

```bash
# Windows 记事本
notepad migration-report.txt

# 或使用其他编辑器
code migration-report.txt
```

### 4. 应用新配置

⚠️ **在应用前请务必检查 `migration-report.txt` 中的"需要手动检查的配置项"！**

```bash
# 方式一：保留旧配置作为备份
cp config.env config.env.old
mv config.env.new config.env

# 方式二：如果已有备份，直接替换
mv config.env.new config.env
```

### 5. 重启服务

```bash
# 如果使用 PM2
npm run restart:pm2

# 或者直接启动
node server.js
```

## ⚠️ 重要！手动检查项

根据 `migration-report.txt`，以下配置需要手动确认：

### 1. 向量维度配置 (CRITICAL)

**问题**: `VECTORDB_DIMENSION` 必须与你使用的 embedding 模型匹配！

**当前状态**:
- 本地使用: `Qwen/Qwen3-Embedding-8B`
- 新配置默认: `3072` (适配 gemini-embedding-exp-03-07)

**解决方案**:

```bash
# 选项 A: 继续使用 Qwen 模型
# 1. 查找 Qwen3-Embedding-8B 的向量维度（通常是 4096 或其他值）
# 2. 修改 config.env.new 中的 VECTORDB_DIMENSION

# 选项 B: 升级到 Gemini Embedding 模型
# 1. 保持 VECTORDB_DIMENSION=3072
# 2. 修改 WhitelistEmbeddingModel=gemini-embedding-exp-03-07
# 3. 修改 WhitelistEmbeddingModelMaxToken=8000
# 4. 修改 WhitelistEmbeddingModelList=5
```

**⚠️ 错误配置会导致知识库功能异常！**

### 2. VarDivRender 配置

**问题**: 本地使用内联 HTML，示例使用文件引用

**当前状态**:
- 本地: 完整的 HTML 内联内容 (约 50 行)
- 示例: `DIVRendering.txt` 文件引用

**建议**: 保持本地配置（内联方式），或按以下步骤迁移到文件引用：

```bash
# 1. 从 config.env 提取 VarDivRender 的内容
# 2. 创建文件
echo "..." > DIVRendering.txt

# 3. 修改 config.env.new
VarDivRender=DIVRendering.txt
```

### 3. SarModel3 模型列表

**问题**: 本地包含 `glm-4.6` 模型，示例未包含

**当前状态**:
- 本地: `...,gemini-2.5-flash，glm-4.6`
- 示例: `...,gemini-2.5-flash`

**建议**: 如果需要继续使用 glm-4.6，手动添加到 `config.env.new`:

```env
SarModel3=gemini-2.5-pro-preview-06-05,gemini-2.5-pro,gemini-2.5-flash-preview-05-20,gemini-2.5-flash,glm-4.6
```

## 📊 迁移统计

根据最新的迁移报告：

| 类型 | 数量 | 说明 |
|------|------|------|
| ✓ 保留配置 | 19 项 | 真实密钥和个人信息 |
| + 新增配置 | 11 项 | 知识库 V2 新功能 |
| - 删除配置 | 10 项 | 旧版 RAG 数据库配置 |
| ⚠️ 需检查 | 3 项 | 向量维度、模型配置等 |

## 🆕 新增配置说明

### 1. 时区配置

```env
DEFAULT_TIMEZONE=Asia/Shanghai
```

用于时间相关的操作和日志记录。

### 2. 知识库 V2 核心配置

```env
# 向量维度（必须与 embedding 模型匹配！）
VECTORDB_DIMENSION=3072

# 启动时全量扫描
KNOWLEDGEBASE_FULL_SCAN_ON_STARTUP=true
```

### 3. 内容过滤规则

```env
# 忽略的文件夹
IGNORE_FOLDERS=VCP论坛

# 忽略的文件名前缀
IGNORE_PREFIXES=已整理

# 忽略的文件名后缀
IGNORE_SUFFIXES=夜伽
```

### 4. Tag 增强系统

```env
# Tag 黑名单
TAG_BLACKLIST=莱恩,莱恩主人,主人,小克,Nova,nova,NOVA,小吉,小闫,小雨,小娜,小冰,小绝,小芸

# Tag 扩展最大数量
TAG_EXPAND_MAX_COUNT=30
```

### 5. 新模型支持

```env
SarModel4=v-gemini-3-pro-preview,gemini-3-pro-preview
SarPrompt4="上下文中的"【VCP元思考】"模块是你已经完成的预研简报..."
```

## 🔧 故障排除

### 问题 1: 迁移脚本执行失败

**错误**: `找不到 config.env 或 config.env.example`

**解决**:
```bash
# 确认文件存在
ls -la config.env*

# 如果缺少 config.env.example，从仓库拉取
git checkout config.env.example
```

### 问题 2: 向量维度不匹配

**症状**: 启动后知识库功能报错

**解决**:
1. 确认你的 embedding 模型
2. 查找对应的向量维度
3. 修改 `VECTORDB_DIMENSION` 配置

常见模型维度：
- `gemini-embedding-exp-03-07`: 3072
- `text-embedding-3-small`: 1536
- `text-embedding-3-large`: 3072
- `Qwen/Qwen3-Embedding-8B`: 需要查阅 Qwen 文档

### 问题 3: 迁移后服务无法启动

**解决步骤**:
1. 检查日志: `node server.js`
2. 对比配置: `diff config.env.old config.env`
3. 恢复备份: `cp config.env.old config.env`
4. 重新检查 `migration-report.txt` 中的警告项

## 📝 迁移脚本工作原理

### 智能保留策略

脚本会自动保留以下配置的本地值：
- API 密钥 (API_Key, TavilyKey, etc.)
- 访问密码 (Key, Image_Key, etc.)
- 个人信息 (VarCity, VarUser, etc.)
- 自定义路径 (VarVchatPath, VarHttpUrl, etc.)

### 配置来源优先级

1. **最高优先级**: 本地真实密钥和个人信息
2. **中优先级**: 本地的自定义配置值
3. **默认值**: 示例配置的默认值

### 废弃配置清理

自动删除以下旧版 RAG 配置：
- `VECTORDB_CHANGE_THRESHOLD`
- `VECTORDB_MAX_MEMORY_MB`
- `VECTORDB_CACHE_SIZE`
- `VECTORDB_CACHE_TTL_MS`
- `VECTORDB_RETRY_ATTEMPTS`
- `VECTORDB_RETRY_BASE_DELAY_MS`
- `VECTORDB_RETRY_MAX_DELAY_MS`
- `VECTORDB_PREWARM_COUNT`
- `VECTORDB_EF_SEARCH`
- `VECTORDB_BATCH_SIZE`

## 📚 参考资料

- 知识库 V2 文档: [待补充]
- Embedding 模型对比: [待补充]
- VCP ToolBox 主文档: `CLAUDE.md`

## 🆘 需要帮助？

如果遇到问题，请：
1. 查看 `migration-report.txt` 详细报告
2. 检查备份文件 `config-backups/config.env.backup_*`
3. 提交 Issue 到项目仓库

---

**生成时间**: 2025-12-03
**脚本版本**: v1.0.0
**作者**: VCP ToolBox Team
