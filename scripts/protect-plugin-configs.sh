#!/bin/bash
# VCP Plugin Config Protector
# 保护所有 Plugin/*/config.env 文件不被 git 操作覆盖

echo "=== VCP Plugin 配置文件保护脚本 ==="
echo ""

# 方法1: 对已被跟踪的 config.env 使用 skip-worktree
# 方法2: 对被忽略的 config.env，我们需要先强制跟踪，再设置 skip-worktree

cd "$(dirname "$0")/.."

protected_count=0
error_count=0

for config_file in Plugin/*/config.env; do
    if [ -f "$config_file" ]; then
        plugin_name=$(basename "$(dirname "$config_file")")
        
        # 检查文件是否被忽略
        if git check-ignore -q "$config_file"; then
            echo "[$plugin_name] 文件被忽略，强制添加到跟踪..."
            # 强制添加到跟踪（绕过 .gitignore）
            git add -f "$config_file" 2>/dev/null
            if [ $? -eq 0 ]; then
                # 提交空变更（让文件被跟踪但不改变内容）
                git commit -m "chore: track $config_file for skip-worktree protection" --no-verify 2>/dev/null || true
            fi
        fi
        
        # 设置 skip-worktree
        git update-index --skip-worktree "$config_file" 2>/dev/null
        if [ $? -eq 0 ]; then
            echo "✅ [$plugin_name] 已保护"
            ((protected_count++))
        else
            echo "❌ [$plugin_name] 保护失败"
            ((error_count++))
        fi
    fi
done

echo ""
echo "=== 保护完成 ==="
echo "成功: $protected_count 个"
echo "失败: $error_count 个"
echo ""
echo "现在这些配置文件将："
echo "  • 被 git 忽略变更"
echo "  • 合并/重置时保留本地版本"
echo "  • 切换分支时保留本地版本"
echo ""
echo "如需更新配置文件到仓库，请运行:"
echo "  git update-index --no-skip-worktree Plugin/<插件名>/config.env"
