---
name: consolidate-mistakes
description: Consolidate common-mistakes.md when it exceeds 100 lines or has duplicates. Auto-invoked when Stop hook detects file is full.
---

# Consolidate Mistakes

See `.claude/commands/consolidate-mistakes.md` for full procedure.

**Quick steps:**
1. Read `.claude/rules/common-mistakes.md`, count lines
2. Merge duplicates, archive old patterns to `archived-mistakes.md`
3. Use table format: `| Mistake | Wrong | Right |`
4. Target: < 100 lines
5. Update timestamp, report changes
