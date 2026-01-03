# Common Mistakes Claude Makes

When Claude makes a mistake, say: **"add that to the mistakes file"**

Last updated: 2026-01-03

## Windows/PowerShell

| Mistake | Wrong | Right |
|---------|-------|-------|
| Path separators | Backslashes in JSON/YAML | Forward slashes `/` |
| Missing HOME | `cargo build` without HOME | `$env:HOME = $env:USERPROFILE` first |
| Unix commands | `rm -rf`, `cp -r` | `Remove-Item -Recurse`, `Copy-Item -Recurse` |

## Testing

| Mistake | Wrong | Right |
|---------|-------|-------|
| Missing --no-config | `npm test -- tests/unit/foo.ts` | `mocha --no-config tests/unit/foo.ts` |
| Missing cross-env | `mocha --no-config ...` | `cross-env NODE_ENV=test mocha --no-config ...` |

## Docker

| Mistake | Wrong | Right |
|---------|-------|-------|
| Killing processes | `taskkill /F /IM node.exe` | `docker compose restart backend` |

## Git

| Mistake | Wrong | Right |
|---------|-------|-------|
| Non-draft PRs | `gh pr create --title "..."` | `gh pr create --draft --title "..."` |
| Push without rebase | Push with conflicts | `git fetch origin master && git rebase origin/master` |

## Code Style

| Mistake | Wrong | Right |
|---------|-------|-------|
| Unnecessary docs | Adding JSDoc to every function | Only comment non-obvious logic |
| Over-engineering | Abstractions for one-time ops | Keep it simple, minimal changes |

---

**To add new mistake:** Append a row to the relevant table above.
