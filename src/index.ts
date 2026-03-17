import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import YAML from 'yamljs';
import { connectDatabase, checkDatabaseHealth } from './config/database';
import { connectRedis, checkRedisHealth, disconnectRedis } from './config/redis';
// DISABLED: Agreement routes - migrated to atomic swap architecture
// import { agreementRoutes } from './routes';
import {
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
  adminAuthRoutes,
  institutionReceiptRoutes,
} from './routes';
import { noncePoolManager, healthCheckService, assetValidator } from './routes/offers.routes';
import { transactionGroupBuilder } from './routes/test-execute.routes';
import { StaleOfferCleanupScheduler } from './services/stale-offer-cleanup.service';
import { corsOptions, helmetConfig, sanitizeInput, securityHeaders } from './middleware';
import {
  getMonitoringOrchestrator,
  getExpiryCancellationOrchestrator,
  getIdempotencyService,
} from './services';
import {
  getStuckAgreementMonitor,
  AlertSeverity,
} from './services/stuck-agreement-monitor.service';
import {
  getNonceCleanupScheduler,
  getNonceReplenishmentScheduler,
} from './services/nonce-schedulers.service';
import { OfferExpiryScheduler } from './services/offer-expiry-scheduler.service';
// import { backupScheduler } from './services/backup-scheduler.service'; // DISABLED for BETA launch

// Load environment variables
dotenv.config();

// Validate configuration before starting server
import { validateConfig } from './config';
try {
  validateConfig();
} catch (error: any) {
  console.error('❌ Configuration validation failed. Server will not start.');
  console.error('   Error:', error.message);
  process.exit(1);
}

// Initialize Express app
const app: Application = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - Required for DigitalOcean App Platform (and other reverse proxies)
// This allows Express to read X-Forwarded-* headers to get real client IP
// Essential for rate limiting to work correctly
// DigitalOcean App Platform has exactly 1 load balancer - trust 1 hop
app.set('trust proxy', 1);

// Initialize idempotency service for atomic swaps
const idempotencyService = getIdempotencyService({
  expirationHours: 24, // Keep idempotency keys for 24 hours
  cleanupIntervalMinutes: 60, // Clean up expired keys every hour
});

const stuckAgreementMonitor = getStuckAgreementMonitor({
  warningThresholdMinutes: 10, // Warn if stuck for 10 minutes
  criticalThresholdMinutes: 30, // Critical if stuck for 30 minutes
  checkIntervalMs: 60000, // Check every minute
  autoRefundEnabled: true, // ✅ NEW: Automatically refund stuck agreements
  autoRefundThresholdMinutes: 15, // ✅ NEW: Auto-refund after 15 minutes
  maxAgeHours: 24, // ✅ NEW: Only check agreements updated within last 24 hours (prevents accumulation)
});

// Initialize nonce pool schedulers
const nonceCleanupScheduler = getNonceCleanupScheduler(noncePoolManager, {
  cleanupSchedule: '0 * * * *', // Every hour
  timezone: process.env.TZ || 'America/Los_Angeles',
});

const nonceReplenishmentScheduler = getNonceReplenishmentScheduler(noncePoolManager, {
  replenishmentSchedule: '*/30 * * * *', // Every 30 minutes
  timezone: process.env.TZ || 'America/Los_Angeles',
  minPoolSize: 10,
  replenishmentAmount: 5,
});

// Initialize offer expiry scheduler
import { PrismaClient } from './generated/prisma';
const prisma = new PrismaClient();
const offerExpiryScheduler = OfferExpiryScheduler.getInstance(prisma, {
  schedule: '*/15 * * * *', // Every 15 minutes
  batchSize: 200,
  timezone: process.env.TZ || 'America/Los_Angeles',
});

// Initialize stale offer cleanup scheduler
const staleOfferCleanupScheduler = StaleOfferCleanupScheduler.getInstance(
  prisma,
  assetValidator,
  noncePoolManager,
  {
    schedule: '*/30 * * * *', // Every 30 minutes
    batchSize: 50, // Smaller batches due to DAS rate limits
    timezone: process.env.TZ || 'America/Los_Angeles',
  }
);

// Security Middleware (apply first)
app.use(helmetConfig);
app.use(securityHeaders);

// CORS Configuration
app.use(cors(corsOptions));

// Request parsing middleware with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Input sanitization
app.use(sanitizeInput);

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Enhanced health check endpoint with treasury PDA, RPC monitoring, and caching
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const healthResult = await healthCheckService.check();
    const statusCode = healthCheckService.getStatusCode(healthResult);

    res.status(statusCode).json(healthResult);
  } catch (error) {
    console.error('[Health Check] Unexpected error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'easy-escrow-ai-backend',
      mode: 'atomic-swap',
      error: error instanceof Error ? error.message : 'Health check failed',
      cached: false,
    });
  }
});

// API Documentation Configuration (Redoc)
const docsPath = process.env.SWAGGER_PATH || '/docs';
let openApiDocument: any = null;

try {
  const openApiFilePath = path.join(__dirname, '../docs/api/openapi.yaml');
  openApiDocument = YAML.load(openApiFilePath);

  // 🔧 Environment-aware server configuration
  const isProd = process.env.NODE_ENV === 'production';
  const isStaging = process.env.NODE_ENV === 'staging';

  if (isProd) {
    openApiDocument.servers = [
      {
        url: 'https://api.easyescrow.ai',
        description: 'Production server',
      },
    ];
  } else if (isStaging) {
    openApiDocument.servers = [
      {
        url: 'https://staging-api.easyescrow.ai',
        description: 'Staging server',
      },
    ];
  } else {
    openApiDocument.servers = [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ];
  }

  console.log(`✅ API documentation loaded successfully from ${openApiFilePath}`);
  console.log(
    `🌐 API servers configured for environment: ${process.env.NODE_ENV || 'development'}`
  );
} catch (error: any) {
  console.warn('⚠️  Warning: Failed to load API documentation');
  console.warn(`   Error: ${error.message}`);
  console.warn(`   Redoc will not be available at ${docsPath}`);
  console.warn('   The API will continue to function normally.');
}

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  const response: any = {
    message: 'EasyEscrow.ai Backend API',
    version: '1.1.0',
    endpoints: {
      health: '/health',
      assets: '/api/assets',
      offers: '/api/swaps/offers',
      offersCnft: '/api/swaps/offers/cnft',
      offersBulk: '/api/swaps/offers/bulk',
      receipts: '/v1/receipts',
      transactions: '/v1/transactions',
      expiryCancellation: '/api/expiry-cancellation',
      webhooks: '/api/webhooks',
    },
  };

  // Add institution escrow endpoints if enabled
  if (process.env.INSTITUTION_ESCROW_ENABLED === 'true') {
    response.endpoints.institutionAuth = '/api/v1/institution/auth';
    response.endpoints.institutionSettings = '/api/v1/institution/settings';
    response.endpoints.institutionFiles = '/api/v1/institution/files';
    response.endpoints.institutionEscrow = '/api/v1/institution-escrow';
    response.endpoints.institutionClients = '/api/v1/institution/clients';
    response.endpoints.aiAnalysis = '/api/v1/ai';
    response.endpoints.aiAnalyzeEscrowDoc = '/api/v1/ai/analyze-escrow-doc/:escrow_id';
    response.endpoints.escrowDocAnalysis = '/api/v1/ai/escrow-doc-analysis/:escrow_id';
  }

  // Only include documentation field if OpenAPI spec loaded successfully
  if (openApiDocument) {
    response.documentation = docsPath;
  }

  res.status(200).json(response);
});

// API Documentation with Redoc (only if successfully loaded)
if (openApiDocument) {
  // Serve the OpenAPI spec as JSON for Redoc to consume
  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  // Serve Redoc documentation with custom dark theme
  app.get(docsPath, (_req: Request, res: Response) => {
    const redocHtml = `<!DOCTYPE html>
<html>
<head>
  <title>EasyEscrow.ai API Documentation</title>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css?family=Inter:300,400,500,600,700&display=swap" rel="stylesheet">
  <style>
    /* Base */
    body, html { margin: 0; padding: 0; background: #0f172a !important; font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; }
    /* Topbar */
    #docs-topbar { position: fixed; top: 0; left: 0; right: 0; height: 56px; background: #0f172a; border-bottom: 1px solid #1e293b; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; z-index: 1000; box-sizing: border-box; }
    .topbar-title { color: #f1f5f9; font-size: 18px; font-weight: 600; white-space: nowrap; }
    #topbar-search { position: relative; width: 320px; flex-shrink: 0; }
    #redoc-container { padding-top: 56px; }
    /* Footer */
    #docs-footer { background: #0f172a; border-top: 1px solid #1e293b; padding: 20px 24px; text-align: center; font-size: 13px; color: #94a3b8; }
    #docs-footer a { color: #818cf8 !important; text-decoration: none; }
    #docs-footer a:hover { color: #a5b4fc !important; text-decoration: underline; }
    /* Force ALL Redoc elements dark */
    .redoc-wrap, .redoc-wrap > div { background: #0f172a !important; }
    /* Middle panel - comprehensive targeting */
    .redoc-wrap > div > div:nth-child(2) { background: #0f172a !important; }
    [class*="api-content"], [class*="middle-panel"], [data-section-id] { background: #0f172a !important; }
    /* All text white/light */
    .redoc-wrap h1 { color: #f1f5f9 !important; font-size: 40px !important; }
    .redoc-wrap h2, .redoc-wrap h3, .redoc-wrap h4, .redoc-wrap h5, .redoc-wrap h6 { color: #f1f5f9 !important; }
    .redoc-wrap p, .redoc-wrap span, .redoc-wrap li, .redoc-wrap td, .redoc-wrap th, .redoc-wrap label { color: #e2e8f0 !important; }
    .redoc-wrap div { color: #e2e8f0; }
    .redoc-wrap a { color: #818cf8 !important; }
    .redoc-wrap a:hover { color: #a5b4fc !important; }
    /* HTTP method badges */
    .redoc-wrap [class*="http-verb"] { color: white !important; }
    /* Code blocks */
    .redoc-wrap code, .redoc-wrap pre { background: #1e293b !important; color: #e2e8f0 !important; }
    /* Tables */
    .redoc-wrap table { background: #0f172a !important; }
    .redoc-wrap tr { background: #0f172a !important; border-color: #334155 !important; }
    .redoc-wrap td, .redoc-wrap th { border-color: #334155 !important; background: transparent !important; }
    .redoc-wrap tr:nth-child(even) { background: rgba(30,41,59,0.5) !important; }
    /* Property tables and schema */
    .redoc-wrap [class*="property"] { background: transparent !important; }
    .redoc-wrap [class*="schema"], .redoc-wrap [class*="field-table"] { background: #0f172a !important; }
    .redoc-wrap [class*="type-"] { color: #22d3ee !important; }
    /* Response panels */
    .redoc-wrap [class*="response"], .redoc-wrap [class*="tab"] { background: #1e293b !important; }
    /* Markdown content */
    .redoc-wrap [class*="markdown"], .redoc-wrap [class*="markdown"] * { color: #e2e8f0 !important; background: transparent !important; }
    .redoc-wrap [class*="markdown"] h1, .redoc-wrap [class*="markdown"] h2, .redoc-wrap [class*="markdown"] h3 { color: #f1f5f9 !important; }
    .redoc-wrap [class*="markdown"] code { background: #1e293b !important; color: #f472b6 !important; }
    .redoc-wrap [class*="markdown"] a { color: #818cf8 !important; }
    /* Request/Parameters sections */
    .redoc-wrap [class*="request-body"], .redoc-wrap [class*="parameters"] { background: #0f172a !important; }
    /* Buttons and inputs */
    .redoc-wrap input, .redoc-wrap button, .redoc-wrap select { background: #1e293b !important; color: #e2e8f0 !important; border-color: #334155 !important; }
    /* Expand/collapse and dropdown sections */
    .redoc-wrap [class*="expand"], .redoc-wrap [class*="collapse"] { background: transparent !important; color: #94a3b8 !important; }
    /* Operation details / expanded dropdowns - the key fix for white-on-white */
    .redoc-wrap [class*="operation"], .redoc-wrap [class*="Operation"] { background: #0f172a !important; }
    .redoc-wrap [class*="callback"], .redoc-wrap [class*="Callback"] { background: #0f172a !important; }
    .redoc-wrap [class*="container"] { background: transparent !important; }
    .redoc-wrap [class*="react-tabs__tab-panel"] { background: #0f172a !important; }
    .redoc-wrap [class*="tab-panel"], .redoc-wrap [role="tabpanel"] { background: #0f172a !important; }
    .redoc-wrap [class*="security"] { background: #0f172a !important; }
    /* Dropdown/select menus */
    .redoc-wrap select, .redoc-wrap option { background: #1e293b !important; color: #e2e8f0 !important; }
    .redoc-wrap [class*="dropdown"], .redoc-wrap [class*="Dropdown"] { background: #1e293b !important; color: #e2e8f0 !important; }
    .redoc-wrap [class*="menu-content"], .redoc-wrap [class*="MenuContent"] { background: #1e293b !important; }
    /* Enum values and oneOf selectors */
    .redoc-wrap [class*="enum"], .redoc-wrap [class*="oneOf"] { background: #1e293b !important; color: #e2e8f0 !important; }
    /* Any remaining white backgrounds in the middle panel */
    .redoc-wrap div[class] { background-color: inherit; }
    .redoc-wrap [class*="panel"] { background: #0f172a !important; }
    .redoc-wrap [class*="content"] { background: transparent !important; }
    /* Required badge */
    .redoc-wrap [class*="required"] { color: #f87171 !important; }
    /* Search (relocated to topbar via JS) */
    #topbar-search [role="search"] { margin: 0 !important; padding: 0 !important; }
    #topbar-search [role="search"] label { display: none !important; }
    #topbar-search [role="search"] input[type="text"],
    #topbar-search [role="search"] input[type="search"],
    #topbar-search [role="search"] input:not([type]) {
      width: 100% !important;
      height: 36px !important;
      min-height: 36px !important;
      padding: 8px 14px !important;
      font-size: 14px !important;
      border-radius: 8px !important;
      border: 1px solid #475569 !important;
      background: #1e293b !important;
      color: #e2e8f0 !important;
      box-sizing: border-box !important;
      outline: none !important;
      transition: border-color 0.2s, box-shadow 0.2s !important;
    }
    #topbar-search [role="search"] input::placeholder { color: #64748b !important; }
    #topbar-search [role="search"] input:focus {
      border-color: #818cf8 !important;
      box-shadow: 0 0 0 3px rgba(129,140,248,0.25) !important;
    }
    /* Search results dropdown (topbar) */
    #topbar-search [role="search"] > div:not(:first-child),
    #topbar-search [role="search"] ul,
    #topbar-search [role="search"] [class*="results"],
    #topbar-search [role="search"] [class*="menu"] {
      background: #1e293b !important;
      border: 1px solid #475569 !important;
      border-radius: 8px !important;
      margin-top: 4px !important;
      color: #e2e8f0 !important;
      z-index: 1001 !important;
      max-height: 400px !important;
      overflow-y: auto !important;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
    }
    #topbar-search [role="search"] li,
    #topbar-search [role="search"] [class*="result"] {
      padding: 10px 14px !important;
      color: #e2e8f0 !important;
      background: transparent !important;
      cursor: pointer !important;
      border-bottom: 1px solid rgba(51,65,85,0.5) !important;
    }
    #topbar-search [role="search"] li:last-child { border-bottom: none !important; }
    #topbar-search [role="search"] li:hover,
    #topbar-search [role="search"] li[class*="active"],
    #topbar-search [role="search"] [class*="result"]:hover { background: #334155 !important; }
    #topbar-search [role="search"] mark,
    #topbar-search [role="search"] [class*="highlight"],
    #topbar-search [role="search"] em,
    #topbar-search mark {
      background: rgba(129,140,248,0.3) !important;
      color: #c7d2fe !important;
      padding: 1px 3px !important;
      border-radius: 2px !important;
      font-style: normal !important;
    }
    #topbar-search [class*="container"] { background: #1e293b !important; }
    #topbar-search [class*="content"] { background: #1e293b !important; }
    /* Scrollbars */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  </style>
</head>
<body>
  <div id="docs-topbar">
    <span class="topbar-title">EasyEscrow.ai API</span>
    <div id="topbar-search"></div>
  </div>
  <div id="redoc-container"></div>
  <div id="docs-footer">
    EasyEscrow.ai Support: <a href="mailto:support@easyescrow.ai">support@easyescrow.ai</a>
  </div>
  <script src="https://unpkg.com/redoc@2.1.3/bundles/redoc.standalone.js"></script>
  <script>
    Redoc.init('/openapi.json', {
      theme: {
        colors: {
          primary: { main: '#818cf8' },
          text: { primary: '#e2e8f0', secondary: '#94a3b8' },
          http: { get: '#22c55e', post: '#3b82f6', put: '#f59e0b', delete: '#ef4444' },
          border: { dark: '#334155', light: '#475569' }
        },
        typography: {
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: '15px',
          headings: { fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' },
          code: { backgroundColor: '#1e293b' }
        },
        sidebar: {
          width: '280px',
          backgroundColor: '#0f172a',
          textColor: '#e2e8f0',
          activeTextColor: '#818cf8'
        },
        rightPanel: {
          backgroundColor: '#1e293b',
          textColor: '#e2e8f0'
        },
        schema: { nestedBackground: '#1e293b' },
        spacing: { sectionVertical: 16 }
      },
      hideDownloadButton: true,
      disableSearch: false,
      expandResponses: '200,201',
      pathInMiddlePanel: true,
      sortPropsAlphabetically: false,
      jsonSampleExpandLevel: 2,
      nativeScrollbars: true,
      hideHostname: true
    }, document.getElementById('redoc-container'), function() {
      // Move Redoc search from sidebar into topbar
      var doMove = function() {
        var search = document.querySelector('.redoc-wrap [role="search"]');
        var target = document.getElementById('topbar-search');
        if (search && target) {
          target.appendChild(search);
          search.style.display = 'block';
          return true;
        }
        return false;
      };
      if (!doMove()) {
        var n = 0;
        var t = setInterval(function() { if (doMove() || ++n > 30) clearInterval(t); }, 100);
      }
      // Adjust sticky elements to account for topbar height
      setTimeout(function() {
        document.querySelectorAll('.redoc-wrap *').forEach(function(el) {
          var cs = window.getComputedStyle(el);
          if (cs.position === 'sticky') {
            el.style.setProperty('top', '56px', 'important');
            el.style.setProperty('height', 'calc(100vh - 56px)', 'important');
          }
        });
      }, 300);
    });
  </script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(redocHtml);
  });
  console.log(`📚 Redoc documentation available at ${docsPath}`);
} else {
  // Provide a helpful error page if someone tries to access the docs
  app.get(docsPath, (_req: Request, res: Response) => {
    res.status(503).json({
      error: 'Documentation Unavailable',
      message: 'API documentation could not be loaded. Please check server logs for details.',
      timestamp: new Date().toISOString(),
    });
  });
}

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use(offersRoutes);
app.use(assetsRoutes);
app.use(receiptRoutes);
app.use('/v1/transactions', transactionLogRoutes);
app.use('/api/expiry-cancellation', expiryCancellationRoutes);
app.use('/api', webhookRoutes);
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes); // Prometheus metrics endpoint
app.use(adminAuthRoutes); // Admin login/auth endpoints
app.use(authorizedAppsRoutes); // Admin endpoints for zero-fee API key management
app.use('/admin/nonce-pool', noncePoolAdminRoutes); // Admin endpoints for nonce pool management
app.use(testRoutes);
app.use(testExecuteRoutes); // ⚠️ TEST ONLY - Real swap execution with private keys

// Institution Escrow Routes (gated by feature flag)
if (process.env.INSTITUTION_ESCROW_ENABLED === 'true') {
  app.use(institutionAuthRoutes);
  app.use(institutionSettingsRoutes);
  app.use(institutionFilesRoutes);
  app.use(institutionEscrowRoutes);
  app.use(aiAnalysisRoutes);
  app.use(institutionClientsRoutes);
  app.use(institutionEscrowAdminRoutes);
  app.use(institutionReceiptRoutes);
  console.log('✅ Institution escrow routes enabled');
} else {
  // Return 503 for institution endpoints when disabled
  app.use('/api/v1/institution', (_req, res) => {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Institution escrow is not enabled on this server',
      timestamp: new Date().toISOString(),
    });
  });
  app.use('/api/v1/institution-escrow', (_req, res) => {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Institution escrow is not enabled on this server',
      timestamp: new Date().toISOString(),
    });
  });
  app.use('/api/v1/ai', (_req, res) => {
    res.status(503).json({
      error: 'Service Unavailable',
      message: 'Institution escrow is not enabled on this server',
      timestamp: new Date().toISOString(),
    });
  });
}

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // Stop idempotency service
    console.log('Stopping idempotency service...');
    await idempotencyService.stop();

    // Dispose TransactionGroupBuilder (clears cache and intervals)
    console.log('Disposing TransactionGroupBuilder...');
    transactionGroupBuilder.dispose();

    // Disconnect Redis
    console.log('Disconnecting Redis...');
    await disconnectRedis();

    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server with database connection and orchestrators
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Database connected');

    // Connect to Redis
    await connectRedis();
    console.log('✅ Redis connected');

    // Start Express server FIRST to respond to health checks
    app.listen(PORT, () => {
      console.log(`\n🚀 Server is running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`💾 Redis caching: ACTIVE\n`);

      // Start background services after server is listening
      (async () => {
        try {
          console.log('Starting background services...');

          // Start idempotency service
          console.log('Starting idempotency service...');
          await idempotencyService.start();
          console.log('✅ Idempotency service started');

          // Start offer expiry scheduler
          console.log('Starting offer expiry scheduler...');
          offerExpiryScheduler.start();
          console.log('✅ Offer expiry scheduler started (runs every 15 minutes)');

          // Start stale offer cleanup scheduler
          console.log('Starting stale offer cleanup scheduler...');
          staleOfferCleanupScheduler.start();
          console.log('✅ Stale offer cleanup scheduler started (runs every 30 minutes)');

          // DISABLED for BETA launch - Backup scheduler
          // Manual backups via CLI tools are sufficient for BETA phase
          console.log('⏭️  Backup scheduler disabled (BETA launch - using manual backups)');

          console.log('✅ All background services started');
        } catch (error) {
          console.error('⚠️  Error starting background services:', error);
          console.log('Server will continue running without background services');
        }
      })();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
