---
name: browser-screenshot
description: Take screenshots of webpages for UX debugging. Use when debugging UI issues, checking visual state, or documenting frontend behavior.
---

# Browser Screenshot Capture

Takes screenshots of webpages using Playwright for visual debugging.

## Usage

Run the screenshot script with a URL:

```bash
node .claude/skills/browser-screenshot/scripts/take-screenshot.js <url> [options]
```

**Parameters:**
- `url` - The webpage URL to screenshot (required)
- `--full` - Capture full page (not just viewport)
- `--wait <ms>` - Wait time before screenshot (default: 2000)
- `--width <px>` - Viewport width (default: 1280)
- `--height <px>` - Viewport height (default: 720)

**Examples:**
```bash
# Screenshot local test page
node .claude/skills/browser-screenshot/scripts/take-screenshot.js http://localhost:3000/test

# Full page screenshot with wait
node .claude/skills/browser-screenshot/scripts/take-screenshot.js http://localhost:5173 --full --wait 5000

# Mobile viewport
node .claude/skills/browser-screenshot/scripts/take-screenshot.js https://staging.easyescrow.ai --width 375 --height 812
```

## Output

Screenshots are saved to `.claude/debug/screenshot-<timestamp>.png`

## After Capturing

1. Use the Read tool to view the screenshot image
2. Claude can analyze the visual state for debugging
3. Compare with expected UI behavior
