# Consolidate Mistakes

Consolidate and clean up `.claude/rules/common-mistakes.md` when it exceeds 100 lines.

## Steps

1. **Read and count:** Read `.claude/rules/common-mistakes.md`, note line count

2. **Identify consolidation opportunities:**
   - Duplicate or near-duplicate patterns to merge
   - Verbose entries to shorten
   - Patterns already covered in CLAUDE.md (remove)
   - Old/resolved patterns to archive

3. **Archive if needed:** Move old patterns to `.claude/rules/archived-mistakes.md`

4. **Apply table format:**

   ```markdown
   ## Category

   | Mistake | Wrong | Right |
   |---------|-------|-------|
   | Description | `bad` | `good` |
   ```

5. **Update timestamp:** Change "Last updated" at top of file

6. **Target:** Keep file under 100 lines while preserving unique patterns

## Output

Report: lines before, lines after, what was merged/archived/removed.
