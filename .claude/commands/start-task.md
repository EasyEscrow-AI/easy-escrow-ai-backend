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
   - `feat/swap-progress-endpoint` → Task 13: Add Swap Progress Websocket/Polling Endpoint
   - `feat/test-page-list-for-sale` → Task 17: Add 'List for Sale' Feature to Test Page
   - `feat/test-page-buy-listed` → Task 18: Add 'Buy Listed Asset' Feature for Taker
   - `feat/confirmation-modals` → Task 19: Add Confirmation Modal for Delegation-Based Actions
   - `feat/listing-api-endpoints` → Task 20: Implement Listing API Endpoints

4. **Check prerequisite tasks and cherry-pick pending PRs**:

   **Task Dependencies**:
   - Task 4 → depends on Task 3
   - Task 5 → depends on Task 4
   - Task 6 → depends on Task 3
   - Task 7 → depends on Tasks 4, 6
   - Task 9 → depends on Task 8
   - Task 10 → depends on Task 9
   - Task 11 → depends on Task 10
   - Task 12 → depends on Tasks 7, 11
   - Task 13 → depends on Task 12
   - Task 17 → depends on Task 4
   - Task 18 → depends on Tasks 5, 17
   - Task 19 → depends on Tasks 17, 18
   - Task 20 → depends on Tasks 4, 5

   **Check for pending dependency PRs**:
   ```bash
   # List open PRs for dependency branches
   gh pr list --state open --json number,title,headRefName
   ```

   **If a dependency PR is open but not merged**:
   1. Identify the PR branch name from the dependency
   2. Fetch and cherry-pick the commits:
      ```bash
      git fetch origin <dependency-branch>
      git cherry-pick origin/<dependency-branch> --no-commit
      # Or for multiple commits:
      git cherry-pick origin/master..origin/<dependency-branch> --no-commit
      ```
   3. Review the cherry-picked changes to ensure they're needed
   4. Commit or reset as appropriate

   **If dependency is already merged to master**:
   ```bash
   git fetch origin master
   git merge origin/master
   ```

5. **Implement the task using TDD approach**:
   - Follow the PRD requirements exactly
   - Use TodoWrite to track progress
   - **Prefer Test-Driven Development (TDD)**:
     1. Write failing tests first that define expected behavior
     2. Implement the minimum code to make tests pass
     3. Refactor while keeping tests green

6. **Write/Update Tests** (required for all features):
   - **Unit tests** (`tests/unit/`): Test individual functions and services in isolation
     - Mock external dependencies (DAS API, RPC, database)
     - Test edge cases and error handling
     - Run with: `cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/YOUR_TEST.test.ts --timeout 10000`
   - **Integration tests** (`tests/integration/`): Test service interactions
     - Test database operations with test database
     - Test API endpoint behavior
   - **E2E tests** (`tests/staging/e2e/` or `tests/production/e2e/`): Test full flows on devnet/mainnet
     - Only for critical user-facing flows
     - Test with real blockchain transactions on staging

   **Test file naming convention**:
   - Service: `tests/unit/<serviceName>.test.ts`
   - API routes: `tests/integration/<routeName>.routes.test.ts`
   - E2E flows: `tests/staging/e2e/XX-<flow-description>.test.ts`

7. **After each meaningful commit**:
   - Stage and commit changes with a descriptive message
   - Create or update the draft PR:
     ```bash
     gh pr create --base master --draft --title "feat: <Task Description>" --body "<PR body>"
     ```
   - If PR already exists, push will update it automatically

8. **When task is complete**:
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

9. **Final verification**:
   - Run all relevant tests and ensure they pass:
     ```bash
     # Unit tests for the feature
     cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/<your-test>.test.ts --timeout 10000
     ```
   - Verify no regressions in existing tests
   - Ensure PR is ready for review
   - Report the PR URL to the user

## Important Rules

- Follow all rules in CLAUDE.md (SOL only, Docker commands, testing rules, etc.)
- **Tests are required** - no feature is complete without tests
- Prefer TDD: write tests before implementation when possible
- Create atomic, focused commits
- Keep PR scope limited to the specific task
- Do not modify unrelated files
