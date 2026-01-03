# Capture Browser Console Logs

Capture console.logs, errors, and warnings from a webpage for debugging.

## Arguments
- `$ARGUMENTS` - The URL to capture logs from (required)

## Steps

1. Run the capture script:
   ```bash
   node .claude/skills/browser-console-logs/scripts/capture-logs.js $ARGUMENTS
   ```

2. Read the output JSON file from `.claude/debug/console-logs-*.json`

3. Analyze the logs for:
   - JavaScript errors
   - Failed network requests
   - Warnings or unexpected behavior
   - Console.log output from the app

4. Report findings and suggest fixes if errors are found
