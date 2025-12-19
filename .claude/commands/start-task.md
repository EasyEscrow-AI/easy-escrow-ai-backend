# Start Task Command

You are starting work on a task in a git worktree.

## Instructions

1. **Set terminal title** (do this first!):
   - For Git Bash / Windows Terminal:
   ```bash
   branch=$(git branch --show-current) && echo -ne "\033]0;Task: ${branch#feat/}\007" && echo "Terminal title set to: Task: ${branch#feat/}"
   ```
   - For PowerShell (run in separate PowerShell window):
   ```powershell
   $Host.UI.RawUI.WindowTitle = "Task: " + (git branch --show-current).Replace("feat/", "")
   ```

2. **Identify the task**: Check the current branch name:
   ```bash
   git branch --show-current
   ```

3. **Get task details from Task Master**: Fetch the task(s) associated with this branch:
   ```bash
   # Map branch to task IDs based on naming convention
   # feat/task-6-cnft-swap-fix → Task 6
   # feat/tasks-1-2-api-consolidation → Tasks 1 and 2
   ```

4. **Use Task Master MCP** to get task details:
   - Call `mcp__taskmaster-ai__get_task` with the task ID
   - Or call `mcp__taskmaster-ai__get_tasks` to see all tasks
   - Set task status to `in-progress` when starting work

5. **Branch to Task Mapping** (19-dec-updates tag):
   - `feat/task-6-cnft-swap-fix` → Task 6: Fix cNFT swap transaction too large error
   - `feat/tasks-1-2-api-consolidation` → Tasks 1-2: Consolidate API endpoints
   - `feat/tasks-3-4-5-docs-cleanup` → Tasks 3-5: Documentation cleanup
   - `feat/task-7-test-page-ui` → Task 7: Test page UI improvements

6. **Check for dependency updates**:
   ```bash
   git fetch origin master
   git log --oneline HEAD..origin/master | head -10
   ```

   If master has new commits, consider merging:
   ```bash
   git merge origin/master
   ```

7. **Implement the task**:
   - Follow task description from Task Master
   - Use TodoWrite to track sub-steps
   - Prefer TDD when applicable
   - Follow all rules in CLAUDE.md

8. **Testing** (required for code changes):
   - Unit tests: `tests/unit/`
   - Integration tests: `tests/integration/`
   - Run single test: `cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/YOUR_TEST.test.ts --timeout 10000`

9. **After implementation**:
   - Stage and commit with descriptive message
   - Update Task Master status to `done`
   - Create/update PR:
     ```bash
     gh pr create --base master --draft --title "feat: <Description>" --body "<Body>"
     ```

10. **When complete**:
    - Ensure all tests pass
    - Check for merge conflicts with master
    - Mark task as `done` in Task Master
    - Report PR URL

## Quick Start Checklist

```
[ ] Terminal title set
[ ] Branch identified
[ ] Task details fetched from Task Master
[ ] Task status set to in-progress
[ ] Dependencies checked
[ ] Implementation started
[ ] Tests written/updated
[ ] PR created/updated
[ ] Task marked as done
```

## Important Rules

- Follow all rules in CLAUDE.md (SOL only, Docker commands, testing rules, etc.)
- Tests are required for code changes
- Create atomic, focused commits
- Keep PR scope limited to the specific task
- Do not modify unrelated files
