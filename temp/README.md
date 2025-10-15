# Temporary Files Directory

This directory is used for temporary test files, test results, and other ephemeral outputs that should not be committed to the repository.

## Purpose

- **Test Results**: JSON output files from test runs
- **Debug Logs**: Temporary logging and debugging information
- **Test Artifacts**: Screenshots, data dumps, and other test artifacts
- **Temporary Scripts**: Ad-hoc scripts for testing and debugging
- **Mock Data**: Temporary data files used during development

## Git Behavior

This directory is **gitignored** (except for `.gitkeep` and this README), meaning:
- ✅ The directory structure is tracked in git
- ❌ Files you create here will NOT be committed
- 🧹 Safe to delete contents without affecting git history

## Usage

When writing test results or temporary files:

```typescript
// ✅ DO: Write to temp directory
const resultsPath = path.join(__dirname, "../temp/test-results.json");

// ❌ DON'T: Write to project root
const resultsPath = path.join(__dirname, "../test-results.json");
```

## Cleanup

Feel free to delete old files from this directory. The directory itself (and this README) will remain tracked by git.

```bash
# Clean all temporary files (safe operation)
rm -rf temp/*
git checkout temp/README.md temp/.gitkeep
```

---

**Note**: This keeps your project root clean and organized!

