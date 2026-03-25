# API Docs Must Stay in Sync

When adding, modifying, or removing API endpoints, **always update both locations**:

1. **Route file** — `src/routes/*.routes.ts` (the actual Express handler)
2. **OpenAPI spec** — `docs/api/openapi.yaml` (the API documentation served at `/docs`)

## What to update in `openapi.yaml`

- Add/remove the path under the `paths:` section
- Include: HTTP method, tag, summary, description, security, parameters, request body, response schema
- If adding a new category of endpoints, add a tag in the `tags:` section at the top
- If adding new response shapes, add schemas under `components: schemas:`
- If the change is significant, add a changelog entry under the Changelog tag

## Quick reference

| What changed | Update in openapi.yaml |
|---|---|
| New endpoint | Add path + method + schema |
| New query param | Add to `parameters:` on existing path |
| Changed response shape | Update response schema or `$ref` |
| Removed endpoint | Remove the path entry |
| New endpoint category | Add a `tag` + path entries |

## Validation

After editing, verify the YAML parses:
```bash
node -e "require('js-yaml').load(require('fs').readFileSync('docs/api/openapi.yaml','utf8')); console.log('valid')"
```

The spec is served at runtime as JSON at `/openapi.json` and `/openapi-redoc.json` — no separate JSON file to maintain.
