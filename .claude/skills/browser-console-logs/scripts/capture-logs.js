#!/usr/bin/env node
/**
 * Capture browser console logs from a webpage using Playwright
 * Usage: node capture-logs.js <url> [wait-time-ms]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function captureLogs(url, waitTime = 5000) {
  const logs = [];
  let browser;

  try {
    console.log(`Launching browser for: ${url}`);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture all console messages
    page.on('console', (msg) => {
      logs.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location(),
        timestamp: new Date().toISOString()
      });
    });

    // Capture page errors
    page.on('pageerror', (error) => {
      logs.push({
        type: 'pageerror',
        text: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    });

    // Capture request failures
    page.on('requestfailed', (request) => {
      logs.push({
        type: 'requestfailed',
        text: `${request.method()} ${request.url()} - ${request.failure()?.errorText}`,
        timestamp: new Date().toISOString()
      });
    });

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    console.log(`Waiting ${waitTime}ms for additional logs...`);
    await page.waitForTimeout(waitTime);

    // Save logs to file
    const outputDir = path.join(process.cwd(), '.claude', 'debug');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = path.join(outputDir, `console-logs-${timestamp}.json`);

    const output = {
      url,
      capturedAt: new Date().toISOString(),
      waitTime,
      totalLogs: logs.length,
      logs
    };

    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));

    console.log(`\n=== Capture Complete ===`);
    console.log(`Total logs captured: ${logs.length}`);
    console.log(`Output saved to: ${outputFile}`);

    // Print summary
    const errorCount = logs.filter(l => l.type === 'error' || l.type === 'pageerror').length;
    const warnCount = logs.filter(l => l.type === 'warning').length;
    const failedRequests = logs.filter(l => l.type === 'requestfailed').length;

    console.log(`\n=== Summary ===`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Warnings: ${warnCount}`);
    console.log(`Failed Requests: ${failedRequests}`);

    if (errorCount > 0) {
      console.log(`\n=== Errors ===`);
      logs.filter(l => l.type === 'error' || l.type === 'pageerror').forEach(l => {
        console.log(`  - ${l.text}`);
      });
    }

    return outputFile;
  } catch (error) {
    console.error(`Error capturing logs: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// CLI
const url = process.argv[2];
const parsedWait = parseInt(process.argv[3]);
const waitTime = Number.isFinite(parsedWait) ? parsedWait : 5000;

if (!url) {
  console.error('Usage: node capture-logs.js <url> [wait-time-ms]');
  console.error('Example: node capture-logs.js http://localhost:3000/test 5000');
  process.exit(1);
}

captureLogs(url, waitTime);
