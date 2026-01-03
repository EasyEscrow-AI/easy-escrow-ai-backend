# Common Mistakes Claude Makes

This is a living document. When Claude makes a mistake, tell it: **"add that to the mistakes file"**

Last updated: 2026-01-03

---

## Windows/PowerShell Mistakes

### 1. Wrong path separators
- **Wrong:** Using backslashes in cross-platform contexts
- **Right:** Use forward slashes `/` in JSON, YAML, and most paths

### 2. Forgetting HOME environment variable
- **Wrong:** Running cargo/anchor without setting HOME
- **Right:** Always run `$env:HOME = $env:USERPROFILE` before cargo commands

### 3. Using Unix commands on Windows
- **Wrong:** `rm -rf`, `cp -r`, `cat file | grep`
- **Right:** `Remove-Item -Recurse -Force`, `Copy-Item -Recurse`, `Get-Content file | Select-String`

---

## Testing Mistakes

### 1. Running single test without --no-config
- **Wrong:** `npm test -- tests/unit/foo.test.ts`
- **Right:** `cross-env NODE_ENV=test mocha --require ts-node/register --no-config tests/unit/foo.test.ts --timeout 10000`

### 2. Forgetting cross-env for unit tests
- **Wrong:** `mocha --no-config tests/unit/foo.test.ts`
- **Right:** `cross-env NODE_ENV=test mocha ...`

---

## Docker Mistakes

### 1. Killing processes instead of using compose
- **Wrong:** `taskkill /F /IM node.exe`, `pkill node`
- **Right:** `docker compose restart backend`

---

## Git Mistakes

### 1. Creating non-draft PRs
- **Wrong:** `gh pr create --title "..."`
- **Right:** `gh pr create --draft --title "..."`

### 2. Pushing without rebasing
- **Wrong:** Push directly when PR has conflicts
- **Right:** `git fetch origin master && git rebase origin/master` first

---

## Code Style Mistakes

### 1. Adding unnecessary comments/docstrings
- **Wrong:** Adding JSDoc to every function touched
- **Right:** Only add comments where logic isn't self-evident

### 2. Over-engineering simple fixes
- **Wrong:** Creating abstractions for one-time operations
- **Right:** Keep it simple, minimal changes only

---

## How to Update This File

When you catch Claude making a mistake:
1. Say: "add that to the mistakes file"
2. Claude will append the new mistake pattern here
3. Future sessions will load this automatically
