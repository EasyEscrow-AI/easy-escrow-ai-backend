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
   - If >= 100 lines: respond with `{"decision": "allow", "note": "Mistakes file at limit - run /consolidate-mistakes"}`
   - If < 100 lines: proceed to step 2

2. **Check for new patterns:**
   - Compare detected mistakes against existing entries in the file
   - Only proceed if the mistake is genuinely NEW (not already documented)

3. **Append new mistake (if found and file < 100 lines):**
   - Identify the appropriate category table (Windows/PowerShell, Testing, Docker, Git, Code Style)
   - Use Edit tool to append a new row to that table
   - Format: `| Short description | \`wrong example\` | \`right example\` |`

4. **Response:**
   - Always respond with: `{"decision": "allow"}`
   - If error occurs (file missing, Edit fails): `{"decision": "allow", "error": "description"}`

## Error Handling

- **File missing:** Create it with header and empty tables
- **Edit tool fails:** Log error, continue with `{"decision": "allow"}`
- **File >= 100 lines:** Do not append, suggest consolidation
- **No new mistakes found:** Do nothing, return allow
