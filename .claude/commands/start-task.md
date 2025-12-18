# Start Task Command

You are working in a git worktree for a specific task from the cNFT delegation feature PRD.

## Instructions

1. **Identify the task**: Check the current branch name with `git branch --show-current` to determine which task you're working on. The branch name follows the pattern `feat/task-description`.

2. **Read the PRD**: Read `.taskmaster/docs/cnft-delegation-settlement-prd.txt` to understand the full task requirements.

3. **Match branch to task**:
   - `feat/cnft-delegation-service` → Task 3: Implement cNFT Delegation Service
   - `feat/cnft-listing-delegation` → Task 4: Implement cNFT Listing with Delegation
   - `feat/cnft-buy-delegation` → Task 5: Implement cNFT Buy with Delegate Authority
   - `feat/cnft-offer-sol-escrow` → Task 6: Implement cNFT Offer System with SOL Escrow
   - `feat/cnft-accept-counter-offer` → Task 7: Implement Accept/Counter-Offer with Delegation
   - `feat/two-phase-swap-state-machine` → Task 8: Design Two-Phase Swap State Machine
   - `feat/two-phase-lock-delegation` → Task 9: Implement Lock Phase (Delegation)
   - `feat/two-phase-settle-chunks` → Task 10: Implement Settle Phase (Chunked Transfers)
   - `feat/swap-state-recovery` → Task 11: Implement Swap State Recovery and Monitoring
   - `feat/api-delegation-flow` → Task 12: Update Existing API Endpoints for Delegation Flow
   - `feat/test-page-list-for-sale` → Task 17: Add 'List for Sale' Feature to Test Page
   - `feat/test-page-buy-listed` → Task 18: Add 'Buy Listed Asset' Feature for Taker
   - `feat/confirmation-modals` → Task 19: Add Confirmation Modal for Delegation-Based Actions
   - `feat/listing-api-endpoints` → Task 20: Implement Listing API Endpoints

4. **Implement the task**: Follow the PRD requirements exactly. Use TodoWrite to track progress.

5. **After each meaningful commit**:
   - Stage and commit changes with a descriptive message
   - Create or update the draft PR:
     ```bash
     gh pr create --base master --draft --title "feat: <Task Description>" --body "<PR body>"
     ```
   - If PR already exists, push will update it automatically

6. **When task is complete**:
   - Ensure all changes are committed and pushed
   - Check for merge conflicts with master:
     ```bash
     git fetch origin master
     git merge origin/master --no-commit --no-ff
     ```
   - If conflicts exist:
     - Resolve them carefully
     - Test that the code still works
     - Commit the merge resolution
     - Push to update the PR
   - If no conflicts, abort the merge check:
     ```bash
     git merge --abort
     ```

7. **Final verification**:
   - Run relevant tests if applicable
   - Ensure PR is ready for review
   - Report the PR URL to the user

## Important Rules

- Follow all rules in CLAUDE.md (SOL only, Docker commands, testing rules, etc.)
- Create atomic, focused commits
- Keep PR scope limited to the specific task
- Do not modify unrelated files
