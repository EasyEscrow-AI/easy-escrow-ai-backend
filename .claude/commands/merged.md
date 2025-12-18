# Merged Command

This command is run after a PR has been merged to update task status and clean up the worktree.

## Instructions

1. **Identify the current task**: Check the branch name with `git branch --show-current`

2. **Verify PR is merged**: Check the PR status:
   ```bash
   gh pr status
   ```

3. **Update task status**: Read `.taskmaster/docs/cnft-delegation-settlement-prd.txt` and note which task was completed based on branch:
   - `feat/cnft-delegation-service` → Task 3
   - `feat/cnft-listing-delegation` → Task 4
   - `feat/cnft-buy-delegation` → Task 5
   - `feat/cnft-offer-sol-escrow` → Task 6
   - `feat/cnft-accept-counter-offer` → Task 7
   - `feat/two-phase-swap-state-machine` → Task 8
   - `feat/two-phase-lock-delegation` → Task 9
   - `feat/two-phase-settle-chunks` → Task 10
   - `feat/swap-state-recovery` → Task 11
   - `feat/api-delegation-flow` → Task 12
   - `feat/test-page-list-for-sale` → Task 17
   - `feat/test-page-buy-listed` → Task 18
   - `feat/confirmation-modals` → Task 19
   - `feat/listing-api-endpoints` → Task 20

4. **Report completion status**:
   - Confirm which task was completed
   - Show the merged PR URL
   - List any dependent tasks that are now unblocked

5. **Provide cleanup instructions**: Tell the user how to clean up:
   ```powershell
   # From the main repo directory:
   git worktree remove <worktree-path> --force
   git branch -D <branch-name>
   git worktree prune
   ```

6. **Show remaining worktrees**:
   ```bash
   git worktree list
   ```

7. **Summary**: Provide a brief status update:
   - Task X: COMPLETED ✅
   - PR: <URL>
   - Unblocked tasks: <list>
   - Remaining worktrees: <count>
