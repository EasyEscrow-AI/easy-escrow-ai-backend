---
name: browser-console-logs
description: Capture browser console.logs from a webpage for debugging. Use when debugging frontend issues, checking for JavaScript errors, or analyzing client-side behavior.
---

# Browser Console Logs Capture

Captures all console output (logs, errors, warnings) from a webpage using Playwright.

## Usage

Run the capture script with a URL:

```bash
node .claude/skills/browser-console-logs/scripts/capture-logs.js <url> [wait-time-ms]
```

**Parameters:**
- `url` - The webpage URL to capture logs from (required)
- `wait-time-ms` - How long to wait for logs in milliseconds (default: 5000)

**Examples:**
```bash
# Capture logs from local test page
node .claude/skills/browser-console-logs/scripts/capture-logs.js http://localhost:3000/test

# Capture logs from frontend app with longer wait
node .claude/skills/browser-console-logs/scripts/capture-logs.js http://localhost:5173 10000

# Capture logs from staging
node .claude/skills/browser-console-logs/scripts/capture-logs.js https://staging.easyescrow.ai/test
```

## Output

Logs are saved to `.claude/debug/console-logs-<timestamp>.json` with format:
```json
{
  "url": "http://localhost:3000/test",
  "capturedAt": "2024-01-03T12:00:00Z",
  "logs": [
    { "type": "log", "text": "App initialized", "timestamp": "..." },
    { "type": "error", "text": "Failed to fetch...", "timestamp": "..." }
  ]
}
```

## After Capturing

1. Read the output file to analyze logs
2. Look for errors, warnings, or unexpected behavior
3. Correlate with backend logs if needed
