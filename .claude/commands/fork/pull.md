---
name: pull
description: Execute git fork synchronization with safety mechanisms for pulling remote changes and upstream updates
argument-hint: "[--source <branch>] [--upstream <remote>] [--conflict-strategy <merge|rebase|stash>] [--auto-commit] [--dry-run] [--force]"
allowed-tools: SlashCommand(*), Bash(*), TodoWrite(*), Read(*), Glob(*), AskUserQuestion(*)
---

# Fork Pull Command (/fork:pull)

## Purpose

Synchronize forked repository with upstream changes and remote updates through a safe, multi-step process with conflict handling and automatic backup mechanisms.

## Core Principles

**Fork Safety First**: Always preserve local changes and provide rollback options
**Conflict-Aware**: Detect and handle merge conflicts with user confirmation
**Transparent Operations**: Show exactly what will happen before execution

## Core Features

### Multi-Step Synchronization Process
1. **Remote Sync**: Pull current branch from your remote (origin)
2. **Upstream Sync**: Pull changes from original repository (upstream)
3. **Conflict Resolution**: Handle merge conflicts with user guidance
4. **Local Push**: Push synchronized changes back to your fork
5. **Summary Report**: Provide detailed operation results

### Safety Mechanisms
- **Pre-flight Checks**: Validate repository state and permissions
- **Automatic Backup**: Create stash or branch backup before operations
- **Conflict Detection**: Early detection and user confirmation for conflicts
- **Rollback Options**: Provide restore commands for each operation step
- **Dry Run Mode**: Preview operations without making changes

## Parameters

### Basic Parameters
- `--source <branch>`: Source branch to pull (default: current branch)
- `--upstream <remote>`: Upstream remote name (default: upstream, fallback to origin)
- `--target <branch>`: Target branch for updates (default: current branch)

### Conflict Strategy
- `--conflict-strategy <merge|rebase|stash>`: How to handle conflicts
  - `merge`: Standard merge with conflict resolution (default)
  - `rebase`: Rebase local changes on top of upstream
  - `stash`: Stash local changes, pull, then reapply

### Execution Control
- `--auto-commit`: Automatically commit synchronization results
- `--dry-run`: Preview operations without executing
- `--force`: Force execution (bypasses some safety checks)
- `--backup-branch <name>`: Create specific backup branch name

## Usage

### Basic Synchronization
```bash
/fork:pull                                    # Sync current branch
/fork:pull --source main                      # Sync specific branch
/fork:pull --upstream original                # Use different upstream remote
```

### Conflict Handling
```bash
/fork:pull --conflict-strategy rebase         # Use rebase strategy
/fork:pull --conflict-strategy stash          # Stash and reapply
```

### Safety Options
```bash
/fork:pull --dry-run                         # Preview operations
/fork:pull --backup-branch backup-$(date +%Y%m%d-%H%M%S)  # Custom backup
/fork:pull --auto-commit                     # Auto-commit results
```

## Execution Flow

### Phase 1: Pre-flight Validation
1. **Repository Check**: Verify git repository and working directory clean
2. **Remote Validation**: Check origin and upstream remotes exist
3. **Branch Status**: Verify current branch and tracking relationships
4. **Backup Creation**: Create automatic backup of current state
5. **Permission Check**: Validate push permissions to target remote

### Phase 2: Remote Synchronization
1. **Fetch Updates**: `git fetch origin && git fetch upstream`
2. **Status Comparison**: Compare local, origin, and upstream states
3. **Local Sync**: Pull changes from origin (your fork)
4. **Conflict Detection**: Check for merge conflicts in advance

### Phase 3: Upstream Integration
1. **Upstream Sync**: Pull changes from upstream (original repo)
2. **Conflict Resolution**: Apply selected conflict strategy
3. **Merge/Rebase**: Execute synchronization based on strategy
4. **Validation**: Verify repository integrity after operations

### Phase 4: Local Update and Push
1. **Commit Changes**: Commit synchronization results (if --auto-commit)
2. **Push to Origin**: Push synchronized changes to your fork
3. **Branch Update**: Update tracking branches if needed

### Phase 5: Summary and Cleanup (Critical Implementation Step)
**Execute the following commands to generate comprehensive summary:**

#### Data Collection Commands (MUST EXECUTE):
```bash
# Get recent commit history
git log --oneline --graph -15

# Get file change statistics
git diff --stat HEAD~5..HEAD 2>/dev/null || git diff --stat HEAD~1..HEAD

# Check current repository status
git status

# Get branch information
git branch -vv

# Count commits from different sources (run after sync)
git log --oneline --decorate --graph | grep -E "(origin|upstream)" | wc -l
```

#### Summary Report Generation (MUST INCLUDE):
- **Commit Analysis**: Total commits synced, broken down by source (origin vs upstream)
- **File Statistics**: Number of files modified, insertions, deletions
- **Conflict Resolution**: List of conflicted files and how they were resolved
- **Backup Verification**: Confirm backup branch/stash was created successfully
- **Repository State**: Current branch status and tracking information
- **Rollback Commands**: Specific commands based on actual backup method used

#### Output Format Requirements:
```
🎯 **SYNCHRONIZATION SUMMARY REPORT**
📅 Execution Time: [Current timestamp]
🔄 Operation: Fork sync from [source] to [target]

📊 **SYNC STATISTICS**:
├── Origin commits: [X] commits pulled
├── Upstream commits: [Y] commits pulled
├── Total files changed: [Z] files
├── Lines added: [+A] lines
├── Lines deleted: [-D] lines
└── Conflicts resolved: [N] files

🔧 **CONFLICT RESOLUTION**:
[Detailed list of conflicted files and resolution methods]

💾 **BACKUP INFORMATION**:
├── Backup type: [stash/branch]
├── Backup identifier: [backup-name]
└── Rollback command: [specific command]

📋 **REPOSITORY STATUS**:
[Current git status and branch information]

🚀 **NEXT STEPS**:
[Specific recommendations based on sync results]
```

## Safety Mechanisms

### Risk Assessment
```
🟡 Medium Risk Operation: Git synchronization with conflict handling
Impact: Local branch modification, potential merge conflicts
Backup: Automatic stashing/branch backup created
Recovery: Rollback commands provided in summary
```

### Pre-operation Warnings
- **Uncommitted Changes**: Prompt to commit or stash before proceeding
- **Divergent Branches**: Warn when branches have significantly diverged
- **Force Push Risk**: Alert when force operations might be required
- **Conflict Probability**: Estimate conflict likelihood based on commit history

### Rollback Procedures
```bash
# Restore from automatic backup
git checkout backup-YYYYMMDD-HHMMSS
git merge main  # Re-apply your changes

# Restore from stash
git stash pop  # If --conflict-strategy stash was used

# Reset to before operation
git reset --hard HEAD~1  # If auto-commit was used
```

## Error Handling

### Common Scenarios
| Error | Cause | Resolution | Recovery |
|-------|-------|------------|----------|
| No upstream remote | Fork not configured | Add upstream remote | `git remote add upstream <original-repo-url>` |
| Push denied | No write permissions | Check fork settings | Verify fork ownership and permissions |
| Merge conflicts | Divergent histories | Manual resolution | Use conflict resolution tools |
| Network timeout | Connection issues | Retry operation | Check internet connection |

### Recovery Strategies
1. **Automatic Retry**: Retry failed network operations once
2. **Partial Recovery**: Continue with completed steps if possible
3. **Manual Intervention**: Provide manual commands for complex situations
4. **Rollback**: Restore to pre-operation state when needed

## Output Format

### Successful Operation
```
🔄 Fork synchronization completed successfully!

📊 Operation Summary:
├── Remote sync: ✅ 3 commits pulled from origin
├── Upstream sync: ✅ 7 commits pulled from upstream
├── Conflicts: ✅ 2 files resolved automatically
├── Local push: ✅ Changes pushed to origin/main
└── Backup: 📁 Created backup branch 'backup-20231110-143022'

📝 Commits Applied:
├── upstream/abc1234 - Fix authentication bug
├── upstream/def5678 - Update API documentation
└── upstream/ghi9012 - Improve performance metrics

🔧 Rollback Commands:
├── Restore backup: git checkout backup-20231110-143022
├── Reset changes: git reset --hard HEAD~1
└── View changes: git log --oneline -10

📋 Next Steps:
├── Review changes: git diff main~5 main
├── Test functionality: npm test
└── Create PR: Open pull request if ready
```

### Dry Run Output
```
🔍 Dry Run Mode - No changes will be made

📋 Planned Operations:
├── Fetch from origin: 3 new commits available
├── Fetch from upstream: 7 new commits available
├── Conflict strategy: merge
├── Estimated conflicts: 2 files likely to conflict
└── Backup target: backup-$(date +%Y%m%d-%H%M%S)

⚠️  Potential Issues:
├── src/auth.js: High conflict probability
└── README.md: Minor merge expected

Continue with actual execution? Use /fork:pull without --dry-run
```

## Examples

### Standard Fork Sync
```bash
/fork:pull

# Output:
🔄 Synchronizing current branch 'feature/new-api'
✅ Pulled 2 commits from origin
✅ Pulled 5 commits from upstream
✅ No conflicts detected
✅ Pushed to origin/feature/new-api
```

### Conflict Handling Example
```bash
/fork:pull --conflict-strategy rebase --auto-commit

# Output:
🔄 Synchronizing with rebase strategy
⚠️  Conflicts detected in 2 files:
├── src/components/UserProfile.js
└── tests/user.test.js

🔧 Resolving conflicts automatically...
✅ Conflicts resolved successfully
✅ Changes committed automatically
✅ Pushed to origin
```

### Advanced Configuration
```bash
/fork:pull --source main --upstream original --backup-branch sync-backup-$(date +%Y%m%d) --auto-commit

# Output:
🔄 Advanced synchronization configured
├── Source branch: main
├── Upstream remote: original
├── Backup branch: sync-backup-20231110
└── Auto-commit: enabled

✅ All operations completed successfully
```

## Best Practices

### Before Using /fork:pull
1. **Commit Local Changes**: Ensure working directory is clean
2. **Check Branch**: Verify you're on the correct branch
3. **Backup Important Work**: Create manual backup for critical changes
4. **Review Upstream**: Check upstream repository for major changes

### During Operations
1. **Read Outputs Carefully**: Pay attention to warnings and prompts
2. **Confirm Conflicts**: Review automatic conflict resolutions
3. **Monitor Progress**: Watch for error messages or failures

### After Synchronization
1. **Test Changes**: Run tests to verify functionality
2. **Review Code**: Inspect merged changes for issues
3. **Update Documentation**: Update docs if needed
4. **Communicate**: Inform team of major upstream changes

## Troubleshooting

### Frequently Asked Questions
**Q: What if I don't have an upstream remote configured?**
A: The command will guide you to add it: `git remote add upstream <original-repo-url>`

**Q: Can I sync multiple branches at once?**
A: Run the command separately for each branch, or use shell scripts for automation

**Q: What happens to my local commits during sync?**
A: Your commits are preserved through the selected conflict strategy and backup

**Q: How do I undo a synchronization?**
A: Use the rollback commands provided in the operation summary

### Advanced Scenarios
**Large Divergence**: For branches with many divergent commits, consider `--conflict-strategy rebase`
**Frequent Syncing**: Set up cron jobs or GitHub Actions for automated synchronization
**Multiple Forks**: Use different remote names and specify with `--upstream` parameter

## Integration with Other Commands

### Workflow Integration
- **Planning**: Use with `/workflow:plan` for coordinated updates
- **Testing**: Follow with `/task:execute test-*` for validation
- **Documentation**: Use `/memory:update-related` to update docs after sync

### Related Commands
- `/cli:analyze` - Analyze changes before sync
- `/workflow:execute` - Coordinate multi-repository updates
- `/task:create` - Create tasks for conflict resolution

---

**⚠️ Important**: Always review the operation summary and have a rollback plan before proceeding with synchronization operations.