---
name: consolidate-mistakes
description: Consolidate and clean up the common-mistakes.md file when it gets too long. Use when mistakes file exceeds 100 lines or has duplicate/similar patterns.
---

# Consolidate Mistakes File

Review and optimize `.claude/rules/common-mistakes.md`:

## Tasks

1. **Read current file** - Check line count and content

2. **Identify consolidation opportunities:**
   - Duplicate or near-duplicate patterns
   - Similar mistakes that can be grouped under one heading
   - Patterns that are now covered in CLAUDE.md (remove from mistakes)
   - Overly verbose entries that can be shortened

3. **Archive if needed** - Move old/resolved patterns to `.claude/rules/archived-mistakes.md`

4. **Consolidate format:**
   ```markdown
   ### Category Name
   | Wrong | Right |
   |-------|-------|
   | `bad command` | `good command` |
   | `another bad` | `another good` |
   ```

5. **Target:** Keep under 100 lines while preserving all unique patterns

6. **Update timestamp** at top of file

## Output
Report what was consolidated, archived, or removed.
