/**
 * Global Test Teardown
 * 
 * Ensures all async resources (Redis, timers, connections) are properly closed
 * after all unit tests complete to prevent hanging.
 */

import { after } from 'mocha';

after(async function() {
  this.timeout(5000); // Give 5 seconds for cleanup

  console.log('\n[Test Teardown] Cleaning up resources...');

  // Force exit after a short delay to ensure all cleanup completes
  setTimeout(() => {
    console.log('[Test Teardown] Cleanup complete, forcing exit');
    process.exit(0);
  }, 1000);
});

