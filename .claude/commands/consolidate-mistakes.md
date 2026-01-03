# Consolidate Mistakes

Consolidate and clean up the `.claude/rules/common-mistakes.md` file.

## Steps

1. Read `.claude/rules/common-mistakes.md` and count lines
2. Identify:
   - Duplicate or similar patterns to merge
   - Verbose entries to shorten
   - Patterns already in CLAUDE.md (can remove)
3. If over 100 lines, archive old patterns to `.claude/rules/archived-mistakes.md`
4. Rewrite using compact table format where possible:
   ```markdown
   ### Category
   | Wrong | Right |
   |-------|-------|
   | `x` | `y` |
   ```
5. Update the "Last updated" timestamp
6. Report: lines before, lines after, what was consolidated/archived
