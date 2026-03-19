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
  institutionReceiptRoutes,
  institutionTokensRoutes,
  aiChatRoutes,
  institutionAccountRoutes,
  institutionNotificationRoutes,
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
  if (process.env.INSTITUTION_ESCROW_ENABLED?.toLowerCase() === 'true') {
    response.endpoints.institutionAuth = '/api/v1/institution/auth';
    response.endpoints.institutionSettings = '/api/v1/institution/settings';
    response.endpoints.institutionFiles = '/api/v1/institution/files';
    response.endpoints.institutionEscrow = '/api/v1/institution-escrow';
    response.endpoints.institutionClients = '/api/v1/institution/clients';
    response.endpoints.aiAnalysis = '/api/v1/ai';
    response.endpoints.aiAnalyzeEscrowDoc = '/api/v1/ai/analyze-escrow-doc/:escrow_id';
    response.endpoints.escrowDocAnalysis = '/api/v1/ai/escrow-doc-analysis/:escrow_id';
    response.endpoints.institutionReceipts = '/api/v1/institution-escrow/:escrowId/receipt';
    response.endpoints.institutionTokens = '/api/v1/institution/tokens';
    response.endpoints.institutionAccounts = '/api/v1/institution/accounts';
    response.endpoints.aiChat = '/api/v1/ai/chat';
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
  <link rel="icon" type="image/x-icon" href="/favicon.ico">
  <link href="https://fonts.googleapis.com/css?family=Inter:300,400,500,600,700&display=swap" rel="stylesheet">
  <style>
    /* Base dark mode */
    body, html { margin: 0; padding: 0; background: #0f172a !important; }
    /* Topbar */
    #topbar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1000;
      height: 56px; background: #1e293b;
      border-bottom: 1px solid #334155;
      display: flex; align-items: center; gap: 20px;
      padding: 0 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    #topbar .brand {
      display: flex; align-items: center; flex-shrink: 0;
      text-decoration: none;
    }
    #topbar .brand img {
      height: 28px;
    }
    #topbar .search-wrapper {
      flex: 0 1 420px; position: relative;
    }
    #topbar .search-wrapper svg.search-icon {
      position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
      width: 16px; height: 16px; color: #64748b; pointer-events: none;
    }
    #topbar-search {
      width: 100%; height: 38px;
      padding: 0 32px 0 40px;
      font-size: 14px; font-family: Inter, sans-serif;
      border-radius: 8px;
      border: 1px solid #475569;
      background: #0f172a; color: #e2e8f0;
      outline: none; box-sizing: border-box;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    #topbar-search::placeholder { color: #64748b; }
    #topbar-search:focus {
      border-color: #818cf8;
      box-shadow: 0 0 0 3px rgba(129,140,248,0.25);
    }
    /* Search results dropdown */
    #search-results {
      display: none; position: absolute; top: 100%; left: 0; right: 0;
      margin-top: 6px; max-height: 400px; overflow-y: auto;
      background: #1e293b; border: 1px solid #475569; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 1001;
    }
    #search-results.active { display: block; }
    #search-results .sr-empty {
      padding: 16px; color: #64748b; text-align: center; font-size: 13px;
    }
    #search-results .sr-item {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px; cursor: pointer; border-bottom: 1px solid #262f3d;
      transition: background 0.15s;
    }
    #search-results .sr-item:last-child { border-bottom: none; }
    #search-results .sr-item:hover, #search-results .sr-item.active {
      background: #334155;
    }
    #search-results .sr-method {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      padding: 2px 6px; border-radius: 4px; color: #fff; flex-shrink: 0;
      min-width: 40px; text-align: center; letter-spacing: 0.5px;
    }
    #search-results .sr-method.get { background: #22c55e; }
    #search-results .sr-method.post { background: #3b82f6; }
    #search-results .sr-method.put { background: #f59e0b; }
    #search-results .sr-method.delete { background: #ef4444; }
    #search-results .sr-method.tag { background: #818cf8; }
    #search-results .sr-text {
      display: flex; flex-direction: column; min-width: 0;
    }
    #search-results .sr-title {
      font-size: 13px; color: #f1f5f9; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    #search-results .sr-path {
      font-size: 11px; color: #64748b; font-family: monospace;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #search-results .sr-title mark {
      background: rgba(129,140,248,0.3); color: #c7d2fe;
      padding: 0 2px; border-radius: 2px;
    }
    #search-clear {
      display: none; position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: #64748b; font-size: 18px; line-height: 1;
      cursor: pointer; padding: 2px 6px; border-radius: 4px;
      transition: color 0.15s, background 0.15s;
    }
    #search-clear:hover { color: #e2e8f0; background: rgba(255,255,255,0.1); }
    #search-clear.visible { display: block; }
    #topbar .spacer { flex: 1; }
    #topbar .version-badge {
      font-size: 12px; color: #94a3b8;
      background: #0f172a; padding: 4px 10px;
      border-radius: 12px; border: 1px solid #334155;
      white-space: nowrap; flex-shrink: 0;
    }
    /* Push content below fixed topbar */
    #redoc-container { padding-top: 56px; }
    /* Force ALL Redoc elements dark */
    .redoc-wrap, .redoc-wrap > div { background: #0f172a !important; }
    /* Sidebar offset for topbar */
    .redoc-wrap > div > div:first-child { padding-top: 0 !important; margin-top: 0 !important; }
    /* Middle panel - comprehensive targeting */
    .redoc-wrap > div > div:nth-child(2) { background: #0f172a !important; }
    [class*="api-content"], [class*="middle-panel"], [data-section-id] { background: #0f172a !important; }
    /* All text white/light */
    .redoc-wrap h1 { color: #f1f5f9 !important; font-size: 40px !important; font-weight: 700 !important; margin-top: 32px !important; margin-bottom: 16px !important; letter-spacing: -0.5px !important; }
    .redoc-wrap h2 { color: #f1f5f9 !important; margin-top: 24px !important; }
    .redoc-wrap h3, .redoc-wrap h4, .redoc-wrap h5, .redoc-wrap h6 { color: #f1f5f9 !important; }
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
    .redoc-wrap [role="search"] [class*="container"] { background: #1e293b !important; }
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
    .redoc-wrap [class*="panel"] { background: #0f172a !important; }
    .redoc-wrap [class*="content"] { background: transparent !important; }
    .redoc-wrap [role="search"] [class*="content"] { background: #1e293b !important; }
    /* Required badge */
    .redoc-wrap [class*="required"] { color: #f87171 !important; }
    /* Hide Redoc's built-in sidebar search (we have the topbar instead) */
    .redoc-wrap [role="search"] { display: none !important; }
    /* Topbar search highlight */
    .topbar-search-highlight {
      outline: 2px solid #818cf8 !important;
      outline-offset: 4px !important;
      border-radius: 4px !important;
      animation: search-pulse 1.5s ease-out !important;
    }
    @keyframes search-pulse {
      0% { outline-color: #818cf8; box-shadow: 0 0 0 0 rgba(129,140,248,0.5); }
      50% { box-shadow: 0 0 12px 4px rgba(129,140,248,0.3); }
      100% { outline-color: #818cf8; box-shadow: none; }
    }
    /* (search-count styles are in topbar block) */
    /* Scrollbars */
    ::-webkit-scrollbar { width: 8px; height: 8px; }
    ::-webkit-scrollbar-track { background: #0f172a; }
    ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: #475569; }
  </style>
</head>
<body>
  <div id="topbar">
    <a class="brand" href="/"><img src="https://portal.easyescrow.ai/assets/easyescrow-logo-invert.svg" alt="EasyEscrow.ai" /></a>
    <div class="search-wrapper">
      <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
      <input id="topbar-search" type="text" placeholder="Search endpoints, schemas, tags...  (Ctrl+K)" autocomplete="off" />
      <button id="search-clear" type="button" aria-label="Clear search">&times;</button>
      <div id="search-results"></div>
    </div>
    <div class="spacer"></div>
    <span class="version-badge">v1.1.0</span>
  </div>
  <div id="redoc-container"></div>
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
        spacing: { sectionVertical: 24 }
      },
      hideDownloadButton: true,
      disableSearch: false,
      expandResponses: '200,201',
      pathInMiddlePanel: true,
      sortPropsAlphabetically: false,
      jsonSampleExpandLevel: 2,
      nativeScrollbars: true,
      hideHostname: true
    }, document.getElementById('redoc-container'));

    // Topbar search — builds searchable index from OpenAPI spec, shows dropdown results
    (function() {
      var input = document.getElementById('topbar-search');
      var dropdown = document.getElementById('search-results');
      var clearBtn = document.getElementById('search-clear');
      if (!input || !dropdown) return;
      var searchIndex = [];
      var activeIdx = -1;

      function updateClearBtn() {
        if (clearBtn) clearBtn.classList.toggle('visible', input.value.length > 0);
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', function() {
          input.value = '';
          dropdown.innerHTML = '';
          dropdown.classList.remove('active');
          updateClearBtn();
          input.focus();
        });
      }

      // Build search index from the OpenAPI spec
      fetch('/openapi.json').then(function(r) { return r.json(); }).then(function(spec) {
        // Add tags (sections)
        (spec.tags || []).forEach(function(tag) {
          searchIndex.push({ type: 'tag', method: 'tag', title: tag.name, path: '', tag: tag.name });
        });
        // Add paths (endpoints)
        Object.keys(spec.paths || {}).forEach(function(path) {
          var methods = spec.paths[path];
          ['get','post','put','delete','patch'].forEach(function(method) {
            if (methods[method]) {
              var op = methods[method];
              searchIndex.push({
                type: 'endpoint',
                method: method,
                title: op.summary || path,
                path: path,
                tag: (op.tags || [''])[0],
                description: op.description || '',
                operationId: op.operationId || ''
              });
            }
          });
        });
        // Add schemas
        Object.keys((spec.components || {}).schemas || {}).forEach(function(name) {
          searchIndex.push({ type: 'schema', method: 'tag', title: name, path: 'Schema', tag: 'Schema' });
        });
      });

      function highlightText(text, query) {
        var idx = text.toLowerCase().indexOf(query);
        if (idx === -1) return text;
        return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
      }

      function renderResults(query) {
        if (!query) { dropdown.innerHTML = ''; dropdown.classList.remove('active'); return; }
        var results = searchIndex.filter(function(item) {
          var haystack = (item.title + ' ' + item.path + ' ' + item.tag + ' ' + item.method).toLowerCase();
          return haystack.indexOf(query) !== -1;
        }).slice(0, 20);

        if (!results.length) {
          dropdown.innerHTML = '<div class="sr-empty">No results for &ldquo;' + query + '&rdquo;</div>';
          dropdown.classList.add('active');
          activeIdx = -1;
          return;
        }

        activeIdx = -1;
        dropdown.innerHTML = results.map(function(r, i) {
          return '<div class="sr-item" data-idx="' + i + '">' +
            '<span class="sr-method ' + r.method + '">' + (r.type === 'schema' ? 'Schema' : r.type === 'tag' ? 'Section' : r.method.toUpperCase()) + '</span>' +
            '<div class="sr-text">' +
              '<span class="sr-title">' + highlightText(r.title, query) + '</span>' +
              (r.path ? '<span class="sr-path">' + highlightText(r.path, query) + '</span>' : '') +
            '</div></div>';
        }).join('');
        dropdown.classList.add('active');

        // Click handlers
        dropdown.querySelectorAll('.sr-item').forEach(function(item, i) {
          item.addEventListener('click', function() { navigateTo(results[i]); });
        });
      }

      function navigateTo(result) {
        dropdown.classList.remove('active');
        input.value = '';
        updateClearBtn();
        // Build Redoc hash anchor based on result type
        var hash = '';
        if (result.type === 'tag') {
          hash = '#tag/' + encodeURIComponent(result.title);
        } else if (result.type === 'schema') {
          hash = '#schema/' + encodeURIComponent(result.title);
        } else if (result.type === 'endpoint' && result.operationId) {
          hash = '#tag/' + encodeURIComponent(result.tag) + '/operation/' + encodeURIComponent(result.operationId);
        } else if (result.type === 'endpoint') {
          // Redoc expects JSON Pointer encoding (RFC 6901): ~ becomes ~0, / becomes ~1
          var pointer = result.path.split('~').join('~0').split('/').join('~1');
          hash = '#tag/' + encodeURIComponent(result.tag) + '/paths/' + encodeURIComponent(pointer) + '/' + result.method;
        }
        if (hash) {
          window.location.hash = hash;
          // Give Redoc time to process hash change, then ensure scroll with topbar offset
          setTimeout(function() {
            var topbarH = 56;
            var hashId = decodeURIComponent(hash.slice(1));
            // Try finding element by ID (Redoc generates anchor IDs matching the hash)
            var el = document.getElementById(hashId);
            // Fallback: find heading matching result title
            if (!el) {
              var headings = document.querySelectorAll('.redoc-wrap h1, .redoc-wrap h2, .redoc-wrap h3, .redoc-wrap h5');
              var target = result.title.toLowerCase();
              for (var i = 0; i < headings.length; i++) {
                if ((headings[i].textContent || '').toLowerCase().indexOf(target) !== -1) {
                  el = headings[i]; break;
                }
              }
            }
            if (el) {
              var y = el.getBoundingClientRect().top + window.scrollY - topbarH - 10;
              window.scrollTo({ top: y, behavior: 'smooth' });
            }
          }, 250);
          return;
        }
        // Last-resort fallback: find heading in content and scroll
        var headings = document.querySelectorAll('.redoc-wrap h1, .redoc-wrap h2, .redoc-wrap h3, .redoc-wrap h5');
        for (var j = 0; j < headings.length; j++) {
          if ((headings[j].textContent || '').toLowerCase().indexOf(result.title.toLowerCase()) !== -1) {
            var topH = 56;
            var yPos = headings[j].getBoundingClientRect().top + window.scrollY - topH - 10;
            window.scrollTo({ top: yPos, behavior: 'smooth' });
            return;
          }
        }
      }

      function setActive(idx) {
        var items = dropdown.querySelectorAll('.sr-item');
        items.forEach(function(el) { el.classList.remove('active'); });
        if (idx >= 0 && idx < items.length) {
          items[idx].classList.add('active');
          items[idx].scrollIntoView({ block: 'nearest' });
        }
        activeIdx = idx;
      }

      var debounceTimer;
      input.addEventListener('input', function() {
        var query = this.value.toLowerCase().trim();
        updateClearBtn();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(function() { renderResults(query); }, 150);
      });

      input.addEventListener('keydown', function(e) {
        var items = dropdown.querySelectorAll('.sr-item');
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive(Math.min(activeIdx + 1, items.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive(Math.max(activeIdx - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (activeIdx >= 0 && items[activeIdx]) {
            items[activeIdx].click();
          } else if (items.length) {
            items[0].click();
          }
        } else if (e.key === 'Escape') {
          this.value = '';
          dropdown.classList.remove('active');
          updateClearBtn();
          this.blur();
        }
      });

      // Close dropdown on outside click
      document.addEventListener('click', function(e) {
        if (!e.target.closest('#topbar .search-wrapper')) {
          dropdown.classList.remove('active');
        }
      });
      // Reopen on focus if there's a query
      input.addEventListener('focus', function() {
        if (this.value.trim()) renderResults(this.value.toLowerCase().trim());
      });

      // Ctrl+K / Cmd+K shortcut
      document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          input.focus();
          input.select();
        }
      });
    })();
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

// Serve static files from media directory (logo, etc.)
app.use(express.static(path.join(__dirname, '../media')));

// API Routes
app.use(offersRoutes);
app.use(assetsRoutes);
app.use(receiptRoutes);
app.use('/v1/transactions', transactionLogRoutes);
app.use('/api/expiry-cancellation', expiryCancellationRoutes);
app.use('/api', webhookRoutes);
app.use('/health', healthRoutes);
app.use('/metrics', metricsRoutes); // Prometheus metrics endpoint
app.use(authorizedAppsRoutes); // Admin endpoints for zero-fee API key management
app.use('/admin/nonce-pool', noncePoolAdminRoutes); // Admin endpoints for nonce pool management
app.use(testRoutes);
app.use(testExecuteRoutes); // ⚠️ TEST ONLY - Real swap execution with private keys

// Institution Escrow Routes (gated by feature flag)
if (process.env.INSTITUTION_ESCROW_ENABLED?.toLowerCase() === 'true') {
  app.use(institutionAuthRoutes);
  app.use(institutionSettingsRoutes);
  app.use(institutionFilesRoutes);
  app.use(institutionEscrowRoutes);
  app.use(aiAnalysisRoutes);
  app.use(institutionClientsRoutes);
  app.use(institutionEscrowAdminRoutes);
  app.use(institutionReceiptRoutes);
  app.use(institutionTokensRoutes);
  app.use(aiChatRoutes);
  app.use(institutionAccountRoutes);
  app.use(institutionNotificationRoutes);
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
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  // Handle malformed JSON body (body-parser SyntaxError)
  if (err.type === 'entity.parse.failed' && err instanceof SyntaxError) {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON. Check for unescaped special characters.',
      timestamp: new Date().toISOString(),
    });
  }

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
