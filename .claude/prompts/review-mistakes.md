# Review Conversation for Mistakes

Review the conversation transcript for mistakes Claude made.

## Detection Criteria

Look for:
1. Commands that failed (non-zero exit codes, error messages)
2. User corrections ("that's wrong", "no", "don't do that", "why did you...")
3. Windows/PowerShell errors (wrong path separators, missing $env:HOME, Unix commands)
4. Testing errors (missing --no-config, wrong test commands)
5. Docker mistakes (killing processes instead of compose commands)
6. Code style issues the user pointed out

## Process

1. **Check file size first:**
   - Read `.claude/rules/common-mistakes.md`
   - Count the lines
   - If >= 100 lines: respond with `{"ok": true}`
   - If < 100 lines: proceed to step 2

2. **Check for new patterns:**
   - Compare detected mistakes against existing entries in the file
   - Only proceed if the mistake is genuinely NEW (not already documented)

3. **Append new mistake (if found and file < 100 lines):**
   - Identify the appropriate category table (Windows/PowerShell, Testing, Docker, Git, Code Style)
   - Use Edit tool to append a new row to that table
   - Format: `| Short description | \`wrong example\` | \`right example\` |`

4. **Response (single line output):**
   - No new mistakes found: `No new mistakes`
   - Added a mistake: `Added: [short description of mistake]`
   - File too large: `Skipped: file >= 100 lines`
   - Error occurred: `No new mistakes`

## Error Handling

- **File missing:** Output `No new mistakes`
- **Edit tool fails:** Output `No new mistakes`
- **File >= 100 lines:** Output `Skipped: file >= 100 lines`
- **No new mistakes found:** Output `No new mistakes`
