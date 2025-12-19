# Start Task Command

Start working on a task by parsing the task ID from the branch name.

## Steps

1. **Get branch and set terminal title:**
```bash
branch=$(git branch --show-current) && echo -ne "\033]0;${branch}\007" && echo "Branch: $branch"
```

2. **Parse task ID(s) from branch name:**
   - Format: `feat/<date>-task<N>-<desc>` → Task N
   - Format: `feat/<date>-tasks<N>-<M>-<desc>` → Tasks N, M
   - Example: `feat/19dec-task6-cnft-fix` → Task 6
   - Example: `feat/19dec-tasks1-2-api` → Tasks 1, 2

3. **Fetch task from Task Master:** `mcp__taskmaster-ai__get_task` with task ID

4. **Set status to in-progress:** `mcp__taskmaster-ai__set_task_status` with `status: "in-progress"`

5. **Check for master updates:**
```bash
git fetch origin master && git log --oneline HEAD..origin/master | head -5
```

6. **Begin implementation** following task description

## On Completion

1. Commit changes
2. Set task status to `done`
3. Create **DRAFT** PR: `gh pr create --base master --draft --title "feat: <Description>"`
4. Report PR URL (user will mark ready for review when appropriate)

## Rules

- Follow CLAUDE.md
- Tests required for code changes
- Keep PR focused on assigned task(s)
