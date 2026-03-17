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
| Not updating tests | Change logic without updating tests | Update related unit tests, ensure 100% green |

## Docker

| Mistake | Wrong | Right |
|---------|-------|-------|
| Killing processes | `taskkill /F /IM node.exe` | `docker compose restart backend` |

## Git

| Mistake | Wrong | Right |
|---------|-------|-------|
| Draft PRs | `gh pr create --draft --title "..."` | `gh pr create --title "..."` |
| Push without rebase | Push with conflicts | `git fetch origin master && git rebase origin/master` |
| PR merge conflicts | Create PR with conflicts | Rebase and resolve before creating PR |

## TypeScript

| Mistake | Wrong | Right |
|---------|-------|-------|
| Guessing interface props | `analysis.makerSplNfts` (doesn't exist) | Check interface definition first |

## Code Style

| Mistake | Wrong | Right |
|---------|-------|-------|
| Unnecessary docs | Adding JSDoc to every function | Only comment non-obvious logic |
| Over-engineering | Abstractions for one-time ops | Keep it simple, minimal changes |

---

**To add new mistake:** Append a row to the relevant table above.
