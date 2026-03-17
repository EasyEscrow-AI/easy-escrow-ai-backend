/**
 * API Routes
 *
 * This directory contains all API route handlers.
 * Export routes here to make them available to the main application.
 */

import expiryCancellationRoutes from './expiry-cancellation.routes';
import webhookRoutes from './webhook.routes';
import receiptRoutes from './receipt.routes';
import transactionLogRoutes from './transaction-log.routes';
import healthRoutes from './health.routes';
import offersRoutes from './offers.routes';
import metricsRoutes from './metrics.routes';
import testRoutes from './test.routes';
import testExecuteRoutes from './test-execute.routes';
import authorizedAppsRoutes from './admin/authorized-apps.routes';
import noncePoolAdminRoutes from './admin/nonce-pool.routes';
import institutionEscrowAdminRoutes from './admin/institution-escrow-admin.routes';
import assetsRoutes from './assets.routes';
import institutionAuthRoutes from './institution-auth.routes';
import institutionSettingsRoutes from './institution-settings.routes';
import institutionFilesRoutes from './institution-files.routes';
import institutionEscrowRoutes from './institution-escrow.routes';
import aiAnalysisRoutes from './ai-analysis.routes';
import institutionClientsRoutes from './institution-clients.routes';
import institutionReceiptRoutes from './institution-receipt.routes';

export {
  expiryCancellationRoutes,
  webhookRoutes,
  receiptRoutes,
  transactionLogRoutes,
  healthRoutes,
  offersRoutes,
  metricsRoutes,
  testRoutes,
  testExecuteRoutes,
  authorizedAppsRoutes,
  noncePoolAdminRoutes,
  institutionEscrowAdminRoutes,
  assetsRoutes,
  institutionAuthRoutes,
  institutionSettingsRoutes,
  institutionFilesRoutes,
  institutionEscrowRoutes,
  aiAnalysisRoutes,
  institutionClientsRoutes,
  institutionReceiptRoutes,
};
