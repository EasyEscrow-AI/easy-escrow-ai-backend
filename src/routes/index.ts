/**
 * API Routes
 * 
 * This directory contains all API route handlers.
 * Export routes here to make them available to the main application.
 * 
 * MIGRATION NOTE (2025-12-02):
 * Agreement routes have been disabled after migrating to atomic swap architecture.
 * The agreement.routes.ts file is preserved for reference but no longer active.
 * Use offers routes (/api/offers) for all new escrow operations.
 */

// DISABLED: Agreement routes - migrated to atomic swap architecture
// import agreementRoutes from './agreement.routes';
import expiryCancellationRoutes from './expiry-cancellation.routes';
import webhookRoutes from './webhook.routes';
import receiptRoutes from './receipt.routes';
import transactionLogRoutes from './transaction-log.routes';
import healthRoutes from './health.routes';
import offersRoutes from './offers.routes';
import listingsRoutes from './listings.routes';
import swapsRoutes from './swaps.routes';
import metricsRoutes from './metrics.routes';
// cNFT offer escrow routes are now integrated into offers.routes.ts as /api/offers/cnft/*
import testRoutes from './test.routes';
import testExecuteRoutes from './test-execute.routes';
import authorizedAppsRoutes from './admin/authorized-apps.routes';
import noncePoolAdminRoutes from './admin/nonce-pool.routes';

export {
  // agreementRoutes, // DISABLED: Migrated to atomic swap
  expiryCancellationRoutes,
  webhookRoutes,
  receiptRoutes,
  transactionLogRoutes,
  healthRoutes,
  offersRoutes,
  listingsRoutes,
  swapsRoutes, // NEW: Unified /api/swaps/* endpoints (Tasks 9-12)
  metricsRoutes,
  // cnftOffersRoutes - INTEGRATED: Now part of offersRoutes at /api/offers/cnft/*
  // Two-phase swap routes are also integrated into offersRoutes at /api/offers/two-phase/*
  testRoutes,
  testExecuteRoutes,
  authorizedAppsRoutes,
  noncePoolAdminRoutes,
};

