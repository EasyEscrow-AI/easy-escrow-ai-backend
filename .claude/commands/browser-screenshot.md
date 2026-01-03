# Take Browser Screenshot

Take a screenshot of a webpage for UX debugging.

## Arguments
- `$ARGUMENTS` - The URL and options (e.g., "http://localhost:3000 --full")

## Steps

1. Run the screenshot script:
   ```bash
   node .claude/skills/browser-screenshot/scripts/take-screenshot.js $ARGUMENTS
   ```

2. Read the screenshot image from `.claude/debug/screenshot-*.png`

3. Analyze the visual state:
   - Check layout and element positioning
   - Look for rendering issues
   - Verify expected UI state
   - Check for visual errors or missing elements

4. Report findings and suggest UX improvements if issues are found
