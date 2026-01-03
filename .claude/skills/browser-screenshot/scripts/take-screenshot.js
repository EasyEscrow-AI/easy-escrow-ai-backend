#!/usr/bin/env node
/**
 * Take screenshots of webpages using Playwright
 * Usage: node take-screenshot.js <url> [--full] [--wait <ms>] [--width <px>] [--height <px>]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function parseArgs(args) {
  const options = {
    url: null,
    fullPage: false,
    wait: 2000,
    width: 1280,
    height: 720
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--full') {
      options.fullPage = true;
    } else if (arg === '--wait' && args[i + 1]) {
      options.wait = parseInt(args[++i]);
    } else if (arg === '--width' && args[i + 1]) {
      options.width = parseInt(args[++i]);
    } else if (arg === '--height' && args[i + 1]) {
      options.height = parseInt(args[++i]);
    } else if (!arg.startsWith('--') && !options.url) {
      options.url = arg;
    }
  }

  return options;
}

async function takeScreenshot(options) {
  let browser;

  try {
    console.log(`Launching browser for: ${options.url}`);
    console.log(`Viewport: ${options.width}x${options.height}`);
    console.log(`Full page: ${options.fullPage}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height }
    });
    const page = await context.newPage();

    console.log(`Navigating to ${options.url}...`);
    await page.goto(options.url, { waitUntil: 'networkidle', timeout: 30000 });

    console.log(`Waiting ${options.wait}ms for page to settle...`);
    await page.waitForTimeout(options.wait);

    // Ensure output directory exists
    const outputDir = path.join(process.cwd(), '.claude', 'debug');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `screenshot-${timestamp}.png`);

    // Take screenshot
    await page.screenshot({
      path: outputFile,
      fullPage: options.fullPage
    });

    console.log(`\n=== Screenshot Complete ===`);
    console.log(`Saved to: ${outputFile}`);

    // Get page info
    const title = await page.title();
    const url = page.url();

    console.log(`\n=== Page Info ===`);
    console.log(`Title: ${title}`);
    console.log(`URL: ${url}`);

    // Save metadata
    const metaFile = outputFile.replace('.png', '-meta.json');
    fs.writeFileSync(metaFile, JSON.stringify({
      url: options.url,
      finalUrl: url,
      title,
      capturedAt: new Date().toISOString(),
      viewport: { width: options.width, height: options.height },
      fullPage: options.fullPage,
      screenshotPath: outputFile
    }, null, 2));

    return outputFile;
  } catch (error) {
    console.error(`Error taking screenshot: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// CLI
const args = process.argv.slice(2);
const options = parseArgs(args);

if (!options.url) {
  console.error('Usage: node take-screenshot.js <url> [--full] [--wait <ms>] [--width <px>] [--height <px>]');
  console.error('');
  console.error('Options:');
  console.error('  --full          Capture full page (not just viewport)');
  console.error('  --wait <ms>     Wait time before screenshot (default: 2000)');
  console.error('  --width <px>    Viewport width (default: 1280)');
  console.error('  --height <px>   Viewport height (default: 720)');
  console.error('');
  console.error('Examples:');
  console.error('  node take-screenshot.js http://localhost:3000/test');
  console.error('  node take-screenshot.js http://localhost:5173 --full --wait 5000');
  process.exit(1);
}

takeScreenshot(options);
