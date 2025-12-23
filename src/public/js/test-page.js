/**
 * Atomic Swap Test Page - Client-Side Logic
 * Handles wallet loading, NFT selection, and swap execution
 */

// ========================================
// PASSWORD PROTECTION (Session-based)
// ========================================
(function initPasswordProtection() {
  console.log('Initializing password protection...');

  // Password check function
  function checkPassword() {
    console.log('checkPassword called');
    const input = document.getElementById('passwordInput');
    const error = document.getElementById('passwordError');
    const overlay = document.getElementById('passwordOverlay');
    const correctPassword = '060385';

    if (!input || !error || !overlay) {
      console.error('Password elements not found in checkPassword');
      return;
    }

    console.log('Input value:', input.value);
    console.log('Correct password:', correctPassword);
    console.log('Match:', input.value.trim() === correctPassword);

    if (input.value.trim() === correctPassword) {
      console.log('Password correct! Unlocking...');
      // Store in sessionStorage to persist during session
      sessionStorage.setItem('testPageAuth', 'true');
      overlay.classList.add('hidden');
      error.classList.remove('visible');
    } else {
      console.log('Password incorrect');
      error.classList.add('visible');
      input.value = '';
      input.focus();
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }

  function setup() {
    console.log('Setting up password protection...');
    const passwordInput = document.getElementById('passwordInput');
    const unlockButton = document.getElementById('unlockButton');
    const overlay = document.getElementById('passwordOverlay');

    if (!passwordInput || !unlockButton || !overlay) {
      console.error('Password protection elements not found!');
      return;
    }

    console.log('Elements found successfully');

    // Check session storage
    if (sessionStorage.getItem('testPageAuth') === 'true') {
      console.log('Already authenticated, hiding overlay');
      overlay.classList.add('hidden');
    } else {
      console.log('Not authenticated, showing password prompt');
      passwordInput.focus();
    }

    // Add click listener to unlock button
    unlockButton.addEventListener('click', function () {
      console.log('Unlock button clicked');
      checkPassword();
    });

    // Allow Enter key to submit
    passwordInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        console.log('Enter key pressed');
        checkPassword();
      }
    });

    console.log('Password protection initialized');
  }
})();

// ========================================
// WALLET CONFIGURATION
// ========================================
// Wallet addresses (public addresses only - no private keys)
// Will be loaded from backend configuration
let MAKER_ADDRESS = '';
let TAKER_ADDRESS = '';

// State
let makerData = null;
let takerData = null;
let selectedMakerNFTs = [];
let selectedTakerNFTs = [];
let makerFilter = 'all'; // 'all', 'spl', 'cnft'
let takerFilter = 'all';
let makerSearchTerm = ''; // Search term for maker NFTs
let takerSearchTerm = ''; // Search term for taker NFTs
let solPriceUSD = null; // Cached SOL price in USD

// ========================================
// NFT PLACEHOLDER IMAGE SYSTEM
// ========================================
// Uses DiceBear API for deterministic avatar images based on NFT mint address
// https://www.dicebear.com/ - free API that returns images directly from URL
const AVATAR_STYLES = [
  'adventurer',
  'avataaars',
  'bottts',
  'fun-emoji',
  'lorelei',
  'notionists',
  'pixel-art',
  'thumbs',
];
const NFT_IMAGE_STORAGE_KEY = 'nft_placeholder_images';

// Get or generate a persistent placeholder image for any NFT
function getPlaceholderImage(assetId) {
  if (!assetId) return null;

  // Load existing mappings from localStorage
  let imageMap = {};
  try {
    const stored = localStorage.getItem(NFT_IMAGE_STORAGE_KEY);
    if (stored) {
      imageMap = JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load NFT image map:', e);
  }

  // If this NFT already has an assigned image, return it
  if (imageMap[assetId]) {
    return imageMap[assetId];
  }

  // Pick a consistent avatar style based on asset ID hash
  const hash = assetId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const style = AVATAR_STYLES[hash % AVATAR_STYLES.length];

  // DiceBear returns images directly - use asset ID as seed for consistency
  // This guarantees the same NFT always gets the same image
  const imageUrl = `https://api.dicebear.com/7.x/${style}/svg?seed=${assetId}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

  // Store the mapping
  imageMap[assetId] = imageUrl;
  try {
    localStorage.setItem(NFT_IMAGE_STORAGE_KEY, JSON.stringify(imageMap));
  } catch (e) {
    console.warn('Failed to save NFT image map:', e);
  }

  console.log(`🎨 Generated ${style} avatar for NFT ${assetId.substring(0, 8)}...`);
  return imageUrl;
}

// Get image for any NFT (uses actual image if available, placeholder as fallback)
function getNftImage(nft) {
  // For ALL NFTs (including cNFTs), try to use actual image URL first
  // Helius DAS API provides valid image URLs that should be used
  if (
    nft.image &&
    !nft.image.includes('No Image') &&
    !nft.image.includes('data:image/svg+xml') && // Skip SVG placeholders
    (nft.image.startsWith('http://') ||
      nft.image.startsWith('https://') ||
      nft.image.startsWith('ipfs://'))
  ) {
    return nft.image;
  }

  // Fallback to placeholder for cNFTs or NFTs without valid image URLs
  if (nft.mint) {
    return getPlaceholderImage(nft.mint);
  }

  return null;
}

// Preload placeholder images for cNFTs
async function preloadAnimalImages(nfts) {
  const cnftsNeedingImages = nfts.filter((nft) => nft.isCompressed);

  if (cnftsNeedingImages.length === 0) return;

  // Assign images to all cNFTs (this stores them in localStorage)
  cnftsNeedingImages.forEach((nft) => {
    if (nft.mint) {
      getPlaceholderImage(nft.mint);
    }
  });
}

// Fetch SOL price in USD
async function fetchSOLPrice() {
  try {
    console.log('🔄 Fetching SOL price from CoinGecko...');
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`❌ CoinGecko API error: ${response.status} ${response.statusText}`);
      solPriceUSD = null;
      return;
    }

    const data = await response.json();
    console.log('📦 CoinGecko response:', data);

    if (data && data.solana && typeof data.solana.usd === 'number') {
      solPriceUSD = data.solana.usd;
      console.log(`💰 SOL Price: $${solPriceUSD} USD`);
    } else {
      console.error('❌ Invalid CoinGecko response structure:', data);
      solPriceUSD = null;
    }
  } catch (error) {
    console.error('❌ Failed to fetch SOL price:', error);
    solPriceUSD = null; // Fallback to no USD display
  }
}

// Detect and set environment
function setEnvironmentBadge() {
  const hostname = window.location.hostname;
  const isDevnet =
    hostname.includes('staging') ||
    hostname.includes('dev') ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1';

  const badge = document.getElementById('env-badge');

  if (!badge) {
    console.warn('Environment badge element not found');
    return;
  }

  if (isDevnet) {
    badge.textContent = '🧪 STAGING - DEVNET';
    badge.className = 'env-badge staging';
  } else {
    badge.textContent = '🚀 PRODUCTION - MAINNET';
    badge.className = 'env-badge production';
  }

  console.log('✅ Environment badge set:', isDevnet ? 'STAGING - DEVNET' : 'PRODUCTION - MAINNET');
}

// Load configuration from backend
async function loadConfig() {
  try {
    const response = await fetch('/api/test/config');
    const result = await response.json();

    if (result.success && result.data) {
      MAKER_ADDRESS = result.data.makerAddress;
      TAKER_ADDRESS = result.data.takerAddress;

      // Update displayed addresses with Solscan links
      const isDevnet =
        window.location.hostname.includes('staging') ||
        window.location.hostname.includes('dev') ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
      const solscanCluster = isDevnet ? '?cluster=devnet' : '';

      document.getElementById(
        'maker-address'
      ).innerHTML = `<a href="https://solscan.io/account/${MAKER_ADDRESS}${solscanCluster}" target="_blank" rel="noopener noreferrer">${MAKER_ADDRESS}</a>`;
      document.getElementById(
        'taker-address'
      ).innerHTML = `<a href="https://solscan.io/account/${TAKER_ADDRESS}${solscanCluster}" target="_blank" rel="noopener noreferrer">${TAKER_ADDRESS}</a>`;

      console.log('✅ Config loaded:', { MAKER_ADDRESS, TAKER_ADDRESS });
      return true;
    } else {
      console.error('❌ Failed to load config:', result);
      addActivityLog('❌ Failed to load wallet configuration', 'error');
      return false;
    }
  } catch (error) {
    console.error('❌ Error loading config:', error);
    addActivityLog('❌ Error loading configuration: ' + error.message, 'error');
    return false;
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Atomic Swap Test Page Loaded');

  // Set environment badge first
  setEnvironmentBadge();

  // Fetch SOL price for USD conversions (await to ensure it's loaded)
  await fetchSOLPrice();

  // Load configuration
  const configLoaded = await loadConfig();

  if (!configLoaded) {
    return;
  }

  // Load wallet data
  loadWalletInfo('maker');
  loadWalletInfo('taker');

  // Setup refresh button event listeners
  document.getElementById('maker-refresh-btn').addEventListener('click', () => {
    loadWalletInfo('maker');
  });

  document.getElementById('taker-refresh-btn').addEventListener('click', () => {
    loadWalletInfo('taker');
  });

  // Setup reset button event listeners
  document.getElementById('maker-reset-btn').addEventListener('click', () => {
    resetWallet('maker');
  });

  document.getElementById('taker-reset-btn').addEventListener('click', () => {
    resetWallet('taker');
  });

  // Setup activity clear button
  const clearBtn = document.getElementById('activity-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const logContent = document.getElementById('activity-log-content');
      if (logContent) {
        logContent.innerHTML = '<div class="empty-state">No activity yet. Load wallets and execute a swap to see logs here.</div>';
      }
    });
  }

  // Setup swap button event listener
  document.getElementById('swap-btn').addEventListener('click', showConfirmationModal);

  // Setup modal button event listeners
  document.getElementById('modal-cancel').addEventListener('click', hideConfirmationModal);
  document.getElementById('modal-confirm').addEventListener('click', confirmAndExecuteSwap);

  // Setup filter button event listeners
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', handleFilterClick);
  });

  // Setup search input event listeners
  document.getElementById('maker-search').addEventListener('input', (e) => {
    makerSearchTerm = e.target.value;
    if (makerData) {
      renderNFTs('maker', makerData.nfts);
      updateNFTSelection('maker'); // Restore visual selection state
    }
  });

  document.getElementById('taker-search').addEventListener('input', (e) => {
    takerSearchTerm = e.target.value;
    if (takerData) {
      renderNFTs('taker', takerData.nfts);
      updateNFTSelection('taker'); // Restore visual selection state
    }
  });

  // Setup NFT card click handling with event delegation
  document.getElementById('maker-nfts').addEventListener('click', (e) => {
    const card = e.target.closest('.nft-card');
    if (card) {
      const index = parseInt(card.dataset.index);
      toggleNFT('maker', index);
    }
  });

  document.getElementById('taker-nfts').addEventListener('click', (e) => {
    const card = e.target.closest('.nft-card');
    if (card) {
      const index = parseInt(card.dataset.index);
      toggleNFT('taker', index);
    }
  });
});

// Handle filter button clicks
function handleFilterClick(e) {
  const btn = e.target;
  const wallet = btn.dataset.wallet;
  const filter = btn.dataset.filter;

  // Update active state
  document.querySelectorAll(`.filter-btn[data-wallet="${wallet}"]`).forEach((b) => {
    b.classList.remove('active');
  });
  btn.classList.add('active');

  // Update filter state
  if (wallet === 'maker') {
    makerFilter = filter;
    if (makerData) renderNFTs('maker', makerData.nfts);
  } else {
    takerFilter = filter;
    if (takerData) renderNFTs('taker', takerData.nfts);
  }
}

// Load wallet information
async function loadWalletInfo(wallet) {
  const address = wallet === 'maker' ? MAKER_ADDRESS : TAKER_ADDRESS;
  const nftsContainer = document.getElementById(`${wallet}-nfts`);
  const balanceDisplay = document.getElementById(`${wallet}-balance`);

  addLog(`Loading ${wallet} wallet info...`, 'info');
  nftsContainer.innerHTML = '<div class="loading"><div class="spinner"></div>Loading NFTs...</div>';

  try {
    const response = await fetch(`/api/test/wallet-info?address=${address}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    // Store wallet data
    if (wallet === 'maker') {
      makerData = data.data;
      // Debug: Log NFT types received from backend
      const cNfts = data.data.nfts.filter((n) => n.isCompressed);
      const coreNfts = data.data.nfts.filter((n) => n.isCoreNft);
      const splNfts = data.data.nfts.filter((n) => !n.isCompressed && !n.isCoreNft);
      console.log(`🔍 [Maker] Received NFTs from backend:`, {
        cNfts: cNfts.length,
        coreNfts: coreNfts.length,
        splNfts: splNfts.length,
      });
      [...cNfts, ...coreNfts].forEach((nft) => {
        console.log(`   - ${nft.name}: ${nft.mint} (${nft.isCoreNft ? 'Core' : 'cNFT'})`);
      });
    } else {
      takerData = data.data;
      const cNfts = data.data.nfts.filter((n) => n.isCompressed);
      const coreNfts = data.data.nfts.filter((n) => n.isCoreNft);
      const splNfts = data.data.nfts.filter((n) => !n.isCompressed && !n.isCoreNft);
      console.log(`🔍 [Taker] Received NFTs from backend:`, {
        cNfts: cNfts.length,
        coreNfts: coreNfts.length,
        splNfts: splNfts.length,
      });
      [...cNfts, ...coreNfts].forEach((nft) => {
        console.log(`   - ${nft.name}: ${nft.mint} (${nft.isCoreNft ? 'Core' : 'cNFT'})`);
      });
    }

    // Update balance with USD equivalent
    const solBalance = data.data.solBalance.toFixed(4);
    const usdDisplay = solPriceUSD
      ? `<span class="balance-usd">(~$${(data.data.solBalance * solPriceUSD).toFixed(2)} USD)</span>`
      : '';
    balanceDisplay.innerHTML = `${solBalance} SOL${usdDisplay}`;

    // Render NFTs
    renderNFTs(wallet, data.data.nfts);

    addLog(`✓ Loaded ${wallet} wallet: ${data.data.nftCount} NFTs found`, 'success');

    // Enable swap button if both wallets loaded
    if (makerData && takerData) {
      document.getElementById('swap-btn').disabled = false;
    }
  } catch (error) {
    console.error('Error loading wallet:', error);
    addLog(`✗ Failed to load ${wallet} wallet: ${error.message}`, 'error');
    nftsContainer.innerHTML = `<div class="error-message">Failed to load NFTs: ${error.message}</div>`;
  }
}

// Get NFT type label for display
function getNftTypeLabel(nft) {
  if (nft.isCoreNft) return 'Core NFT';
  if (nft.isCompressed) return 'cNFT';
  return 'SPL NFT';
}

// Check if NFT type is supported for swaps
function isNftSwapSupported(nft) {
  // All NFT types are now supported: SPL NFTs, cNFTs, and Core NFTs
  return true;
}

// Get warning message for unsupported NFT (if any)
function getUnsupportedNftWarning(nft) {
  // All NFT types now supported
  return null;
}

// Render NFTs
function renderNFTs(wallet, nfts) {
  const container = document.getElementById(`${wallet}-nfts`);
  const filter = wallet === 'maker' ? makerFilter : takerFilter;
  const searchTerm = wallet === 'maker' ? makerSearchTerm : takerSearchTerm;

  // Apply type filter
  let filteredNfts = nfts;
  if (filter === 'spl') {
    filteredNfts = nfts.filter((nft) => !nft.isCompressed && !nft.isCoreNft);
  } else if (filter === 'cnft') {
    // Only show compressed NFTs (cNFTs)
    filteredNfts = nfts.filter((nft) => nft.isCompressed);
  } else if (filter === 'core') {
    // Only show Metaplex Core NFTs
    filteredNfts = nfts.filter((nft) => nft.isCoreNft);
  }

  // Apply search filter
  if (searchTerm) {
    const searchLower = searchTerm.toLowerCase();
    filteredNfts = filteredNfts.filter((nft) => {
      const name = (nft.name || '').toLowerCase();
      const mint = (nft.mint || '').toLowerCase();
      return name.includes(searchLower) || mint.includes(searchLower);
    });
  }

  if (filteredNfts.length === 0) {
    let message;
    if (searchTerm) {
      message = `No NFTs found matching "${searchTerm}"`;
    } else if (filter === 'all') {
      message = 'No NFTs found in this wallet';
    } else {
      const filterLabels = { spl: 'SPL NFTs', cnft: 'cNFTs', core: 'Core NFTs' };
      message = `No ${filterLabels[filter] || 'NFTs'} found in this wallet`;
    }
    container.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }

  const placeholderSvg =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ddd' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-family='Arial' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E";

  // Preload animal images for cNFTs without images
  preloadAnimalImages(filteredNfts);

  container.innerHTML = filteredNfts
    .map((nft, index) => {
      // Find original index in unfiltered array for toggle functionality
      const originalIndex = nfts.findIndex((n) => n.mint === nft.mint);
      // Get image - tries actual image URL first, falls back to placeholder
      let imageUrl = getNftImage(nft);

      // Use placeholder if no image
      if (!imageUrl) {
        imageUrl = placeholderSvg;
      }

      // Store mint for fallback animal image generation
      // Add loading="lazy" and crossorigin="anonymous" for better image loading
      // Add quick list button for ALL NFTs in maker wallet (SPL, CORE, cNFT)
      const showListButton = wallet === 'maker';

      return `
            <div class="nft-card" data-index="${originalIndex}">
                <img class="nft-image"
                     src="${imageUrl}"
                     alt="${nft.name}"
                     data-mint="${nft.mint}"
                     data-fallback="${placeholderSvg}"
                     loading="lazy"
                     crossorigin="anonymous"
                     referrerpolicy="no-referrer">
                <div class="nft-name">${nft.name || 'Unknown NFT'}</div>
                <div class="nft-type">${getNftTypeLabel(nft)}</div>
                <div class="nft-mint">${nft.mint.substring(0, 8)}...</div>
                ${
                  showListButton
                    ? `
                    <div class="nft-card-actions">
                        <button class="quick-list-btn" data-mint="${nft.mint}">
                            📝 List
                        </button>
                    </div>
                `
                    : ''
                }
            </div>
        `;
    })
    .join('');

  // Add CSP-compliant error handlers - use placeholder image as fallback for ALL NFTs
  // Silently fallback to placeholder without logging CORS errors
  container.querySelectorAll('.nft-image').forEach((img) => {
    img.addEventListener(
      'error',
      function () {
        const mint = this.dataset.mint;
        if (mint) {
          // Silently use placeholder image as fallback
          this.src = getPlaceholderImage(mint);
        } else {
          this.src = this.dataset.fallback;
        }
      },
      { once: true }
    ); // Only fire once to prevent infinite loops
  });

  // Add CSP-compliant click handlers for quick list buttons
  container.querySelectorAll('.quick-list-btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // Prevent NFT card selection
      const mint = this.dataset.mint;
      if (mint && makerData && makerData.nfts) {
        const nft = makerData.nfts.find((n) => n.mint === mint);
        if (nft) {
          showQuickListModal(nft);
        }
      }
    });
  });
}

// Toggle NFT selection
function toggleNFT(wallet, index) {
  const nfts = wallet === 'maker' ? makerData.nfts : takerData.nfts;
  const selectedArray = wallet === 'maker' ? selectedMakerNFTs : selectedTakerNFTs;
  const nft = nfts[index];

  const selectedIndex = selectedArray.findIndex((n) => n.mint === nft.mint);

  if (selectedIndex > -1) {
    // Deselect
    selectedArray.splice(selectedIndex, 1);
  } else {
    // Select
    selectedArray.push(nft);
  }

  // Update UI
  if (wallet === 'maker') {
    selectedMakerNFTs = selectedArray;
  } else {
    selectedTakerNFTs = selectedArray;
  }

  renderNFTs(wallet, nfts);
  updateNFTSelection(wallet);
}

// Update NFT selection visual
function updateNFTSelection(wallet) {
  const selectedArray = wallet === 'maker' ? selectedMakerNFTs : selectedTakerNFTs;
  const nfts = wallet === 'maker' ? makerData.nfts : takerData.nfts;
  const container = document.getElementById(`${wallet}-nfts`);
  const cards = container.querySelectorAll('.nft-card');

  cards.forEach((card) => {
    // Use the original index from data-index attribute (handles filtered lists correctly)
    const originalIndex = parseInt(card.dataset.index);
    const nft = nfts[originalIndex];
    const isSelected = selectedArray.some((n) => n.mint === nft.mint);
    card.classList.toggle('selected', isSelected);
  });
}

// Reset entire wallet form (selections, inputs, filters, search)
function resetWallet(wallet) {
  // Clear NFT selections
  if (wallet === 'maker') {
    selectedMakerNFTs = [];
    makerSearchTerm = '';
    makerFilter = 'all';
  } else {
    selectedTakerNFTs = [];
    takerSearchTerm = '';
    takerFilter = 'all';
  }

  // Clear SOL input
  document.getElementById(`${wallet}-sol`).value = '';

  // Clear search input
  document.getElementById(`${wallet}-search`).value = '';

  // Reset filter buttons to "All"
  const filterButtons = document.querySelectorAll(`.filter-btn[data-wallet="${wallet}"]`);
  filterButtons.forEach((btn) => {
    if (btn.dataset.filter === 'all') {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Re-render NFTs with reset state (only if wallet data is loaded)
  const walletData = wallet === 'maker' ? makerData : takerData;
  if (walletData && walletData.nfts) {
    renderNFTs(wallet, walletData.nfts);
    updateNFTSelection(wallet);
  }

  addLog(`${wallet === 'maker' ? 'Maker' : 'Taker'} form reset`, 'info');
}

// Reset selections after successful swap (keeps wallet data, just clears selections)
function resetSelectionsAfterSwap() {
  // Clear NFT selections
  selectedMakerNFTs = [];
  selectedTakerNFTs = [];

  // Clear SOL inputs
  document.getElementById('maker-sol').value = '';
  document.getElementById('taker-sol').value = '';

  // Re-render NFTs to clear selection highlights
  if (makerData && makerData.nfts) {
    renderNFTs('maker', makerData.nfts);
    updateNFTSelection('maker');
  }
  if (takerData && takerData.nfts) {
    renderNFTs('taker', takerData.nfts);
    updateNFTSelection('taker');
  }

  // Keep swap button enabled (wallets are still loaded)
  // User can immediately select new NFTs for another swap

  addLog('🔄 Selections reset for next swap', 'info');
}

// Add log entry with support for cNFT/Jito log types
function addLog(message, type = 'info') {
  const logContent = document.getElementById('activity-log-content');
  const timestamp = new Date().toLocaleTimeString();

  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `
        <div class="log-timestamp">${timestamp}</div>
        <div class="log-message">${message}</div>
    `;

  // Remove empty state
  const emptyState = logContent.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  logContent.insertBefore(entry, logContent.firstChild);
}

// Add detailed activity log for cNFT swaps
function addActivityLog(message, type = 'info') {
  addLog(message, type);
}

// Add Jito bundle progress log
function addJitoLog(message) {
  addLog(`🚀 ${message}`, 'jito');
}

// Add cNFT-specific log
function addCnftLog(message) {
  addLog(`🌳 ${message}`, 'cnft');
}

// Add bundle progress log
function addBundleLog(message) {
  addLog(`📦 ${message}`, 'bundle');
}

// HTML escape function to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Stored swap parameters (to prevent stale values)
let confirmedSwapParams = null;

// Check if any selected NFTs are cNFTs
function hasCNFTs(nfts) {
  return nfts.some((nft) => nft.isCompressed);
}

// Count cNFTs in selection
function countCNFTs(nfts) {
  return nfts.filter((nft) => nft.isCompressed).length;
}

// Determine swap type based on selected NFTs
function getSwapType(makerNFTs, takerNFTs) {
  const makerCNFTs = countCNFTs(makerNFTs);
  const takerCNFTs = countCNFTs(takerNFTs);
  const totalCNFTs = makerCNFTs + takerCNFTs;

  if (totalCNFTs === 0) {
    return { type: 'atomic', label: 'Atomic Swap', icon: '⚡' };
  } else if (totalCNFTs <= 2) {
    return { type: 'cnft-single', label: 'cNFT Swap', icon: '🌳' };
  } else {
    return { type: 'cnft-bundle', label: 'cNFT Bulk Swap', icon: '🚀', requiresJito: true };
  }
}

// Show confirmation modal
function showConfirmationModal() {
  const offeredSol = document.getElementById('maker-sol').value;
  const requestedSol = document.getElementById('taker-sol').value;

  // Validate
  if (selectedMakerNFTs.length === 0 && !offeredSol) {
    addLog('❌ Maker must offer at least one NFT or SOL', 'error');
    return;
  }

  if (selectedTakerNFTs.length === 0 && !requestedSol) {
    addLog('❌ Taker must request at least one NFT or SOL', 'error');
    return;
  }

  // Determine swap type
  const swapType = getSwapType(selectedMakerNFTs, selectedTakerNFTs);

  // Store confirmed parameters (prevent stale values bug)
  confirmedSwapParams = {
    offeredSol,
    requestedSol,
    selectedMakerNFTs: [...selectedMakerNFTs], // Clone arrays
    selectedTakerNFTs: [...selectedTakerNFTs],
    swapType, // Include swap type info
  };

  // Update modal title based on swap type
  const modalTitle = document.getElementById('modal-title');
  const modalSubtitle = document.getElementById('modal-subtitle');
  const swapTypeTitle = document.getElementById('modal-swap-type-title');
  const executionType = document.getElementById('modal-execution-type');
  const jitoInfo = document.getElementById('modal-jito-info');
  const jitoStatusRow = document.getElementById('modal-jito-status-row');

  // Set execution title consistently (no swap type badge)
  swapTypeTitle.textContent = '⚙️ Execution';

  if (swapType.type === 'atomic') {
    modalTitle.innerHTML = '⚡ Confirm Atomic Swap';
    modalSubtitle.textContent = 'Review the swap details before executing';
    executionType.textContent = 'Single Transaction';
    jitoInfo.style.display = 'none';
    jitoStatusRow.style.display = 'none';
  } else if (swapType.type === 'cnft-single') {
    modalTitle.innerHTML = '⚡ Confirm Swap';
    modalSubtitle.textContent = 'Review the swap details before executing';
    executionType.textContent = 'Single Transaction';
    jitoInfo.style.display = 'none';
    jitoStatusRow.style.display = 'none';
  } else if (swapType.type === 'cnft-bundle') {
    const totalCNFTs = countCNFTs(selectedMakerNFTs) + countCNFTs(selectedTakerNFTs);
    const estimatedTxCount = Math.ceil(totalCNFTs / 2) + 1; // +1 for payment/cleanup

    modalTitle.innerHTML = '🚀 Confirm Bulk Swap';
    modalSubtitle.textContent = 'This swap requires multiple transactions';
    executionType.textContent = `Bundle (${estimatedTxCount} transactions)`;
    jitoInfo.style.display = 'block';
    jitoStatusRow.style.display = 'none';
    document.getElementById('modal-jito-tx-count').textContent = `${estimatedTxCount} Transactions`;
    document.getElementById('modal-jito-tip').textContent = 'Calculating...';
    document.getElementById('modal-bundle-strategy').textContent =
      'Atomic execution via Jito Block Engine';
  }

  // Populate modal with swap details (XSS-safe)
  const makerOffersEl = document.getElementById('modal-maker-offers');
  const takerOffersEl = document.getElementById('modal-taker-offers');

  // Clear previous content
  makerOffersEl.innerHTML = '';
  takerOffersEl.innerHTML = '';

  // Helper function to format SOL with USD (defined here for early use)
  const formatSOLDisplay = (solAmount) => {
    const solValue = parseFloat(solAmount);
    if (solPriceUSD) {
      const usdValue = (solValue * solPriceUSD).toFixed(2);
      return `💰 ${escapeHtml(solAmount)} SOL (~$${usdValue} USD)`;
    }
    return `💰 ${escapeHtml(solAmount)} SOL`;
  };

  // Build maker offers (XSS-safe)
  if (offeredSol) {
    const item = document.createElement('div');
    item.className = 'swap-item';
    item.innerHTML = `
            <div class="swap-item-label">SOL Amount</div>
            <div class="swap-item-value">${formatSOLDisplay(offeredSol)}</div>
        `;
    makerOffersEl.appendChild(item);
  }

  if (selectedMakerNFTs.length > 0) {
    selectedMakerNFTs.forEach((nft) => {
      const card = document.createElement('div');
      card.className = 'nft-preview-card';

      const img = document.createElement('img');
      img.className = 'nft-preview-image';
      // Use NFT image or placeholder
      img.src = getNftImage(nft) || getPlaceholderImage(nft.mint);
      img.alt = nft.name || 'Unknown NFT';
      img.dataset.mint = nft.mint; // Store mint for fallback
      // Add error handler for fallback
      img.addEventListener(
        'error',
        function () {
          this.src = getPlaceholderImage(this.dataset.mint);
        },
        { once: true }
      );

      const details = document.createElement('div');
      details.className = 'nft-preview-details';

      const name = document.createElement('div');
      name.className = 'nft-preview-name';
      name.textContent = nft.name || 'Unknown NFT';

      const type = document.createElement('div');
      type.className = 'nft-preview-type';
      type.textContent = getNftTypeLabel(nft);

      const mint = document.createElement('div');
      mint.className = 'nft-preview-mint';
      mint.textContent = `${nft.mint.substring(0, 8)}...${nft.mint.substring(nft.mint.length - 6)}`;

      details.appendChild(name);
      details.appendChild(type);
      details.appendChild(mint);

      card.appendChild(img);
      card.appendChild(details);
      makerOffersEl.appendChild(card);
    });
  }

  if (makerOffersEl.children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-swap-item';
    empty.textContent = 'Nothing offered';
    makerOffersEl.appendChild(empty);
  }

  // Build taker offers (XSS-safe)
  if (requestedSol) {
    const item = document.createElement('div');
    item.className = 'swap-item';
    item.innerHTML = `
            <div class="swap-item-label">SOL Amount</div>
            <div class="swap-item-value">${formatSOLDisplay(requestedSol)}</div>
        `;
    takerOffersEl.appendChild(item);
  }

  if (selectedTakerNFTs.length > 0) {
    selectedTakerNFTs.forEach((nft) => {
      const card = document.createElement('div');
      card.className = 'nft-preview-card';

      const img = document.createElement('img');
      img.className = 'nft-preview-image';
      // Use NFT image or placeholder
      img.src = getNftImage(nft) || getPlaceholderImage(nft.mint);
      img.alt = nft.name || 'Unknown NFT';
      img.dataset.mint = nft.mint; // Store mint for fallback
      // Add error handler for fallback
      img.addEventListener(
        'error',
        function () {
          this.src = getPlaceholderImage(this.dataset.mint);
        },
        { once: true }
      );

      const details = document.createElement('div');
      details.className = 'nft-preview-details';

      const name = document.createElement('div');
      name.className = 'nft-preview-name';
      name.textContent = nft.name || 'Unknown NFT';

      const type = document.createElement('div');
      type.className = 'nft-preview-type';
      type.textContent = getNftTypeLabel(nft);

      const mint = document.createElement('div');
      mint.className = 'nft-preview-mint';
      mint.textContent = `${nft.mint.substring(0, 8)}...${nft.mint.substring(nft.mint.length - 6)}`;

      details.appendChild(name);
      details.appendChild(type);
      details.appendChild(mint);

      card.appendChild(img);
      card.appendChild(details);
      takerOffersEl.appendChild(card);
    });
  }

  if (takerOffersEl.children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-swap-item';
    empty.textContent = 'Nothing requested';
    takerOffersEl.appendChild(empty);
  }

  // Show loading state for fees/estimates
  document.getElementById('modal-est-time').textContent = 'Loading...';
  document.getElementById('modal-network-fees').textContent = 'Loading...';
  document.getElementById('modal-platform-fee-label').textContent = 'Platform Fee:';
  document.getElementById('modal-platform-fee').textContent = 'Loading...';

  // Fetch quote from backend (includes all fee calculations and transaction size)
  const apiKeyInput = document.getElementById('api-key-input');
  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

  fetchSwapQuote(selectedMakerNFTs, selectedTakerNFTs, offeredSol, requestedSol, apiKey);

  // Show modal
  document.getElementById('confirm-modal').classList.add('show');
}

// Fetch comprehensive swap quote from backend API
async function fetchSwapQuote(makerNFTs, takerNFTs, offeredSol, requestedSol, apiKey) {
  const txSizeContainer = document.getElementById('modal-tx-size-container');

  try {
    if (txSizeContainer) {
      txSizeContainer.innerHTML = '<span class="loading">Fetching quote...</span>';
    }

    // Build request body for /api/quote
    const requestBody = {
      makerAssets: makerNFTs.map((nft) => ({
        mint: nft.mint,
        isCompressed: nft.isCompressed || false,
        isCoreNft: nft.isCoreNft || false,
        name: nft.name,
        image: nft.image,
      })),
      takerAssets: takerNFTs.map((nft) => ({
        mint: nft.mint,
        isCompressed: nft.isCompressed || false,
        isCoreNft: nft.isCoreNft || false,
        name: nft.name,
        image: nft.image,
      })),
      makerSolLamports: offeredSol ? Math.floor(parseFloat(offeredSol) * 1e9) : 0,
      takerSolLamports: requestedSol ? Math.floor(parseFloat(requestedSol) * 1e9) : 0,
      apiKey: apiKey || '',
    };

    const response = await fetch('/api/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();

    if (result.success && result.data) {
      const quote = result.data;

      // Update estimated time
      document.getElementById('modal-est-time').textContent =
        quote.estimatedTime?.display || '~5 seconds';

      // Update network fees
      document.getElementById('modal-network-fees').textContent =
        quote.networkFee?.display || '~0.00002 SOL';

      // Update platform fee
      const platformFee = quote.platformFee;
      if (platformFee) {
        let platformFeeLabel = 'Platform Fee:';
        if (platformFee.type === 'zero') {
          platformFeeLabel = 'Platform Fee (with API key):';
        } else if (platformFee.type === 'percentage') {
          platformFeeLabel = `Platform Fee (${platformFee.label || '1%'}):`;
        }
        document.getElementById('modal-platform-fee-label').textContent = platformFeeLabel;
        document.getElementById('modal-platform-fee').textContent = platformFee.display || '0 SOL';
      }

      // Update Jito bundle info if applicable
      const jitoInfo = document.getElementById('modal-jito-info');
      const jitoStatusRow = document.getElementById('modal-jito-status-row');
      const jitoStatus = document.getElementById('modal-jito-status');

      // Get JITO enabled status from quote response
      const jitoEnabled = quote.bulkSwap?.jitoEnabled ?? true;

      if (quote.bulkSwap && quote.bulkSwap.isBulkSwap && jitoEnabled) {
        jitoInfo.style.display = 'block';
        jitoStatusRow.style.display = 'none';
        document.getElementById(
          'modal-jito-tx-count'
        ).textContent = `${quote.bulkSwap.transactionCount} Transactions`;

        // Format Jito tip
        if (quote.bulkSwap.estimatedTipLamports) {
          const tipSol = (parseInt(quote.bulkSwap.estimatedTipLamports) / 1e9).toFixed(6);
          document.getElementById('modal-jito-tip').textContent = `~${tipSol} SOL`;
        }

        // Update execution type
        document.getElementById(
          'modal-execution-type'
        ).textContent = `Jito Bundle (${quote.bulkSwap.transactionCount} txs)`;

        // Update bundle strategy based on response
        const strategy = quote.bulkSwap.strategy || 'JITO_BUNDLE';
        document.getElementById('modal-bundle-strategy').textContent =
          strategy === 'JITO_BUNDLE' ? 'Atomic execution via Jito Block Engine' : strategy;
      } else if (quote.bulkSwap && quote.bulkSwap.isBulkSwap && !jitoEnabled) {
        // Bulk swap with JITO disabled
        jitoInfo.style.display = 'none';
        jitoStatusRow.style.display = 'flex';
        jitoStatus.textContent = 'Disabled (Sequential Execution)';
        document.getElementById('modal-execution-type').textContent =
          `Sequential (${quote.bulkSwap.transactionCount} txs)`;
      } else if (quote.isCnftSwap) {
        // Single-transaction cNFT swap - show JITO disabled if applicable
        jitoInfo.style.display = 'none';
        if (!jitoEnabled) {
          jitoStatusRow.style.display = 'flex';
          jitoStatus.textContent = 'Disabled';
        } else {
          jitoStatusRow.style.display = 'none';
        }
        document.getElementById('modal-execution-type').textContent = 'Single Transaction';
      } else {
        // Regular atomic swap - hide JITO status
        jitoInfo.style.display = 'none';
        jitoStatusRow.style.display = 'none';
      }

      // Update transaction size display
      if (txSizeContainer && quote.transactionSize) {
        const txSize = quote.transactionSize;
        const percentage = Math.min((txSize.estimated / txSize.maxSize) * 100, 100);

        // Determine color based on status
        let barColor = '#22c55e'; // green
        let statusText = '✅ OK';
        if (txSize.status === 'too_large') {
          barColor = '#ef4444'; // red
          statusText = '❌ Too Large';
        } else if (txSize.status === 'alt_required') {
          barColor = '#f59e0b'; // amber
          statusText = '🔗 ALT Required';
        } else if (txSize.status === 'near_limit') {
          barColor = '#f59e0b'; // amber
          statusText = '⚠️ Near Limit';
        }

        // Build display HTML
        let html = `
                    <div class="tx-size-info">
                        <div class="tx-size-header">
                            <span class="tx-size-label">Transaction Size:</span>
                            <span class="tx-size-value">${txSize.estimated} / ${txSize.maxSize} bytes</span>
                            <span class="tx-size-status" style="color: ${barColor}">${statusText}</span>
                        </div>
                        <div class="tx-size-bar-container">
                            <div class="tx-size-bar" style="width: ${percentage}%; background-color: ${barColor}"></div>
                        </div>
                `;

        // Add warnings if present
        if (quote.warnings && quote.warnings.length > 0) {
          quote.warnings.forEach((warning) => {
            html += `
                            <div class="tx-warning" style="background: #fef2f2; border: 1px solid #ef4444; padding: 8px; border-radius: 6px; margin-bottom: 10px; color: #991b1b; font-size: 0.8rem;">
                                ⚠️ ${escapeHtml(warning)}
                            </div>
                        `;
          });
        }

        // Add ALT info if needed
        if (txSize.useALT && txSize.estimatedWithALT) {
          const altPercentage = Math.min((txSize.estimatedWithALT / txSize.maxSize) * 100, 100);
          const savings = txSize.altSavings || txSize.estimated - txSize.estimatedWithALT;
          html += `
                        <div class="tx-alt-info" style="margin-top: 12px; padding: 10px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #22c55e; border-radius: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span class="alt-badge" style="background: #22c55e; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">🔗 ALT Applied</span>
                                <span style="color: #166534; font-size: 0.75rem; font-weight: 500;">Saves ${savings} bytes</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-size: 0.8rem; color: #166534;">With ALT:</span>
                                <span style="font-size: 0.85rem; font-weight: 600; color: #166534;">${txSize.estimatedWithALT} / ${txSize.maxSize} bytes ✅</span>
                            </div>
                            <div class="tx-size-bar-container" style="height: 6px; background: #bbf7d0; border-radius: 3px; overflow: hidden;">
                                <div class="tx-size-bar" style="width: ${altPercentage}%; background-color: #22c55e; height: 100%;"></div>
                            </div>
                        </div>
                    `;
        }

        // Add breakdown
        if (txSize.breakdown) {
          const b = txSize.breakdown;
          html += `
                        <div class="tx-size-breakdown">
                            <span>Signatures: ${b.signatures}B</span>
                            <span>Accounts: ${b.accounts}B</span>
                            <span>Instructions: ${b.instructions}B</span>
                            ${b.cnftProofs > 0 ? `<span>cNFT Proofs: ${b.cnftProofs}B</span>` : ''}
                        </div>
                    `;
        }

        // Add NFT count details
        const makerBreakdown = quote.maker?.breakdown;
        const takerBreakdown = quote.taker?.breakdown;
        if (makerBreakdown || takerBreakdown) {
          const makerTotal = quote.maker?.assetCount || 0;
          const takerTotal = quote.taker?.assetCount || 0;

          if (makerTotal > 0 || takerTotal > 0) {
            const makerTypes = [];
            if (makerBreakdown?.splNfts > 0) makerTypes.push(`${makerBreakdown.splNfts} SPL`);
            if (makerBreakdown?.cNfts > 0) makerTypes.push(`${makerBreakdown.cNfts} cNFT`);
            if (makerBreakdown?.coreNfts > 0) makerTypes.push(`${makerBreakdown.coreNfts} CORE`);

            const takerTypes = [];
            if (takerBreakdown?.splNfts > 0) takerTypes.push(`${takerBreakdown.splNfts} SPL`);
            if (takerBreakdown?.cNfts > 0) takerTypes.push(`${takerBreakdown.cNfts} cNFT`);
            if (takerBreakdown?.coreNfts > 0) takerTypes.push(`${takerBreakdown.coreNfts} CORE`);

            const makerStr = makerTypes.length > 0 ? makerTypes.join(', ') : 'none';
            const takerStr = takerTypes.length > 0 ? takerTypes.join(', ') : 'none';

            html += `
                            <div class="tx-nft-counts" style="font-size: 0.75rem; color: #666; margin-top: 8px; padding: 6px 8px; background: #f8fafc; border-radius: 4px;">
                                <span style="margin-right: 12px;">📤 Maker: ${makerTotal} (${makerStr})</span>
                                <span>📥 Taker: ${takerTotal} (${takerStr})</span>
                            </div>
                        `;
          }
        }

        html += '</div>';
        txSizeContainer.innerHTML = html;
      }
    } else {
      // Fallback to simple display if quote fails
      console.warn('Quote API failed:', result.error);
      document.getElementById('modal-est-time').textContent = '~5 seconds';
      document.getElementById('modal-network-fees').textContent = '~0.00002 SOL';
      document.getElementById('modal-platform-fee-label').textContent = 'Platform Fee:';
      document.getElementById('modal-platform-fee').textContent = 'Unable to estimate';

      if (txSizeContainer) {
        txSizeContainer.innerHTML = `<span class="error">Could not fetch quote</span>`;
      }
    }
  } catch (error) {
    console.error('Error fetching swap quote:', error);
    document.getElementById('modal-est-time').textContent = '~5 seconds';
    document.getElementById('modal-network-fees').textContent = '~0.00002 SOL';
    document.getElementById('modal-platform-fee-label').textContent = 'Platform Fee:';
    document.getElementById('modal-platform-fee').textContent = 'Unable to estimate';

    if (txSizeContainer) {
      txSizeContainer.innerHTML = `<span class="error">Error fetching quote</span>`;
    }
  }
}

// Hide confirmation modal
function hideConfirmationModal() {
  document.getElementById('confirm-modal').classList.remove('show');
  confirmedSwapParams = null; // Clear stored params
}

// Confirm and execute swap
async function confirmAndExecuteSwap() {
  if (!confirmedSwapParams) {
    addLog('❌ No confirmed swap parameters', 'error');
    return;
  }

  // Save params locally before hiding modal (which clears confirmedSwapParams)
  const params = confirmedSwapParams;
  hideConfirmationModal();
  await executeAtomicSwap(params);
}

// Helper: Accept offer with retry
async function acceptOfferWithRetry(offerId, attempt = 1) {
  try {
    const response = await fetch(`/api/swaps/offers/${offerId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `test-accept-${Date.now()}`,
      },
      body: JSON.stringify({
        takerWallet: TAKER_ADDRESS,
      }),
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to accept offer');
    }

    addLog('✓ Offer accepted, transaction built', 'success');
    return data;
  } catch (error) {
    // Only retry on network errors, not on stale proof errors (backend handles those)
    const isNetworkError =
      error?.message?.includes('fetch') ||
      error?.message?.includes('network') ||
      error?.message?.includes('timeout');

    if (isNetworkError && attempt < 2) {
      addLog(`⚠️  Network error on attempt ${attempt}, retrying...`, 'warning');
      await new Promise((resolve) => setTimeout(resolve, 200));
      return acceptOfferWithRetry(offerId, attempt + 1);
    }

    // For other errors (including stale proof), let the backend handle retries
    // Don't show "Attempt 1 failed" - backend will retry automatically
    throw error;
  }
}

// Helper: Execute swap with retry for stale proofs
async function executeSwapWithRetry(offerId, acceptData, isBulkSwap = false, bulkSwapInfo = null) {
  // Check if this requires two-phase settlement (cNFT <> cNFT swaps)
  const swapFlow = acceptData?.data?.swapFlow;
  if (swapFlow?.requiresTwoPhase) {
    throw new Error(
      'This swap requires two-phase settlement (cNFT ↔ cNFT or complex bulk swap). ' +
      'Two-phase swaps use a lock/settle flow with delegation. ' +
      'Use the bulk swap endpoints: POST /api/swaps/offers/bulk/:id/lock and /settle'
    );
  }

  // Validate accept data has required transaction structure
  if (!acceptData?.data?.transaction?.serialized) {
    throw new Error(
      'Accept response missing transaction data. ' +
      `Has data: ${!!acceptData?.data}, has transaction: ${!!acceptData?.data?.transaction}`
    );
  }

  // Build request body
  const requestBody = {
    serializedTransaction: acceptData.data.transaction.serialized,
    requireSignatures: [MAKER_ADDRESS, TAKER_ADDRESS],
    offerId: offerId, // Backend uses this for automatic retry with fresh proofs
  };

  // Add bulk swap info if available
  if (isBulkSwap && bulkSwapInfo) {
    // Validate bulk swap transactions array
    if (!bulkSwapInfo.transactions || !Array.isArray(bulkSwapInfo.transactions)) {
      throw new Error(
        `Bulk swap info missing transactions array. ` +
        `Strategy: ${bulkSwapInfo.strategy}, expected ${bulkSwapInfo.transactionCount} transactions`
      );
    }

    // Validate each transaction has required data
    for (let i = 0; i < bulkSwapInfo.transactions.length; i++) {
      const tx = bulkSwapInfo.transactions[i];
      if (!tx) {
        throw new Error(`Bulk swap transaction at index ${i} is undefined`);
      }
      if (!tx.serialized) {
        throw new Error(
          `Bulk swap transaction at index ${i} (${tx.purpose || 'unknown'}) missing serialized data`
        );
      }
    }

    requestBody.isBulkSwap = true;
    requestBody.bulkSwapInfo = {
      transactionCount: bulkSwapInfo.transactionCount,
      strategy: bulkSwapInfo.strategy,
      requiresJitoBundle: bulkSwapInfo.requiresJitoBundle,
      transactions: bulkSwapInfo.transactions.map((tx) => ({
        index: tx.index,
        purpose: tx.purpose,
        serialized: tx.serialized,
        requiredSigners: tx.requiredSigners || [], // Per-transaction signers
      })),
      tipInfo: bulkSwapInfo.tipInfo,
    };
  }

  // Backend now handles all retry logic internally
  // Just call once and let the backend rebuild & retry as needed
  const response = await fetch('/api/test/execute-swap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Test-Execution': 'true',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  return data;
}

// Execute atomic swap (uses confirmed parameters to prevent stale values)
async function executeAtomicSwap(params) {
  const swapBtn = document.getElementById('swap-btn');
  const originalText = swapBtn.innerHTML;

  // Start timer
  const startTime = performance.now();

  // Set loading state
  swapBtn.disabled = true;

  // Determine swap type for button text
  const { swapType } = params;
  if (swapType && swapType.type === 'cnft-bundle') {
    swapBtn.innerHTML = '⏳ Bundle In-Progress...';
  } else {
    swapBtn.innerHTML = '⏳ Swap In-Progress...';
  }
  swapBtn.style.animation = 'pulse 1.5s ease-in-out infinite';

  try {
    // Use confirmed parameters passed from modal
    const {
      offeredSol,
      requestedSol,
      selectedMakerNFTs: confirmedMakerNFTs,
      selectedTakerNFTs: confirmedTakerNFTs,
    } = params;

    // Debug: Log selected NFTs
    console.log('🔍 [Swap] Selected NFTs:');
    console.log('   Maker NFTs:', confirmedMakerNFTs);
    console.log('   Taker NFTs:', confirmedTakerNFTs);

    // Log swap type
    if (swapType && swapType.type === 'cnft-bundle') {
      addJitoLog('Starting cNFT bulk swap with Jito bundle...');
    } else if (swapType && swapType.type.startsWith('cnft')) {
      addCnftLog('Starting cNFT swap...');
    } else {
      addLog('🚀 Starting atomic swap...', 'info');
    }

    // Performance tracking
    const timings = {
      create: 0,
      accept: 0,
      execute: 0,
      total: 0,
    };

    // Step 1: Create offer
    addLog('Step 1: Creating swap offer...', 'info');
    const createStartTime = performance.now();

    // Build request payload
    const requestPayload = {
      makerWallet: MAKER_ADDRESS,
      takerWallet: TAKER_ADDRESS,
      offeredAssets: confirmedMakerNFTs.map((nft) => ({
        mint: nft.mint,
        isCompressed: nft.isCompressed || false,
        isCoreNft: nft.isCoreNft || false,
      })),
      requestedAssets: confirmedTakerNFTs.map((nft) => ({
        mint: nft.mint,
        isCompressed: nft.isCompressed || false,
        isCoreNft: nft.isCoreNft || false,
      })),
      offeredSol: offeredSol ? Math.round(parseFloat(offeredSol) * 1e9).toString() : undefined,
      requestedSol: requestedSol
        ? Math.round(parseFloat(requestedSol) * 1e9).toString()
        : undefined,
    };

    // Debug: Log exact payload being sent to backend
    console.log('📤 [Swap] Sending to backend:', requestPayload);
    console.log('📤 [Swap] Offered assets details:');
    requestPayload.offeredAssets.forEach((asset, i) => {
      const typeLabel = asset.isCoreNft ? 'Core' : asset.isCompressed ? 'cNFT' : 'SPL';
      console.log(`   ${i + 1}. ${typeLabel}: ${asset.mint}`);
    });

    // Get API key if provided
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

    // Build headers with optional API key
    const headers = {
      'Content-Type': 'application/json',
      'idempotency-key': `test-${Date.now()}`,
    };

    if (apiKey) {
      headers['X-Atomic-Swap-API-Key'] = apiKey;
      addLog(`🔑 Using API key for potential zero-fee swap`, 'info');
    }

    const createResponse = await fetch('/api/swaps/offers', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestPayload),
    });

    const createData = await createResponse.json();
    if (!createData.success) {
      throw new Error(createData.message || 'Failed to create offer');
    }

    timings.create = ((performance.now() - createStartTime) / 1000).toFixed(2);
    const offerId = createData.data.offer.id;
    addLog(`✓ Offer created (ID: ${offerId}) [${timings.create}s]`, 'success');

    // Step 2: Accept offer (with retry for stale proofs)
    addLog('Step 2: Accepting offer...', 'info');
    const acceptStartTime = performance.now();

    let acceptData;
    let isBulkSwap = false;
    let bulkSwapInfo = null;

    try {
      acceptData = await acceptOfferWithRetry(offerId);

      // Check if this is a bulk swap
      if (acceptData.data && acceptData.data.bulkSwap) {
        isBulkSwap = acceptData.data.bulkSwap.isBulkSwap;
        bulkSwapInfo = acceptData.data.bulkSwap;

        if (isBulkSwap) {
          addJitoLog(`Bulk swap detected: ${bulkSwapInfo.transactionCount} transactions`);
          addBundleLog(`Strategy: ${bulkSwapInfo.strategy}`);
          if (bulkSwapInfo.requiresJitoBundle) {
            addJitoLog('Jito bundle required for atomic execution');
          }
        }
      }
    } catch (acceptError) {
      timings.accept = ((performance.now() - acceptStartTime) / 1000).toFixed(2);
      addLog(`❌ Accept failed after [${timings.accept}s]`, 'error');
      throw new Error(`Failed during accept: ${acceptError.message}`);
    }

    timings.accept = ((performance.now() - acceptStartTime) / 1000).toFixed(2);
    addLog(`✓ Offer accepted [${timings.accept}s]`, 'success');

    // Step 3: Execute the swap on-chain using test wallets
    if (isBulkSwap && bulkSwapInfo) {
      addBundleLog(`Step 3: Executing ${bulkSwapInfo.transactionCount} transactions...`);
      addLog('🔐 Signing with test wallet private keys...', 'info');

      // Log individual transaction details
      if (bulkSwapInfo.transactions) {
        bulkSwapInfo.transactions.forEach((tx, idx) => {
          const purpose = tx.purpose || `Transaction ${idx + 1}`;
          addLog(`   📝 TX ${idx + 1}: ${purpose}`, 'info');
        });
      }

      if (bulkSwapInfo.requiresJitoBundle) {
        addJitoLog('Submitting bundle to Jito Block Engine...');
      }
    } else {
      addLog('Step 3: Executing swap on-chain...', 'info');
      addLog('🔐 Signing with test wallet private keys...', 'info');
    }

    const executeStartTime = performance.now();
    const executeData = await executeSwapWithRetry(offerId, acceptData, isBulkSwap, bulkSwapInfo);
    timings.execute = ((performance.now() - executeStartTime) / 1000).toFixed(2);

    if (!executeData.success) {
      throw new Error(executeData.error || 'Failed to execute swap on-chain');
    }

    // Log success based on swap type
    if (isBulkSwap) {
      addJitoLog('Bundle confirmed on blockchain!');
      if (executeData.data.bundleId) {
        addBundleLog(`Bundle ID: ${executeData.data.bundleId}`);
      }
      if (executeData.data.signatures && executeData.data.signatures.length > 1) {
        executeData.data.signatures.forEach((sig, idx) => {
          addLog(
            `   🔗 TX ${idx + 1}: <a href="${
              executeData.data.explorerUrl || `https://solscan.io/tx/${sig}?cluster=devnet`
            }" target="_blank" style="color: #22c55e;">${sig.substring(0, 20)}...</a>`,
            'success'
          );
        });
      }
    } else {
      addLog('✅ Transaction confirmed on blockchain!', 'success');
    }

    addLog(
      `🔗 Signature: <a href="${executeData.data.explorerUrl}" target="_blank" rel="noopener noreferrer" style="color: #22c55e; text-decoration: underline;">${executeData.data.signature}</a>`,
      'success'
    );

    // Fetch transaction fee from blockchain
    // For bulk swaps with multiple transactions, sum all fees
    let blockchainFee = null;
    try {
      const signatures =
        executeData.data.signatures && executeData.data.signatures.length > 0
          ? executeData.data.signatures
          : [executeData.data.signature];

      let totalFee = 0;
      for (const sig of signatures) {
        const feeResponse = await fetch(`/api/test/transaction-fee?signature=${sig}`);
        const feeData = await feeResponse.json();
        if (feeData.success && feeData.data.fee) {
          totalFee += feeData.data.fee;
        }
      }

      // Add Jito tip for bulk swaps only when Jito is enabled (0.001 SOL = 1,000,000 lamports)
      const JITO_TIP_LAMPORTS = 1_000_000; // 0.001 SOL
      const jitoEnabled = bulkSwapInfo?.jitoEnabled ?? false;
      if (isBulkSwap && jitoEnabled) {
        totalFee += JITO_TIP_LAMPORTS;
      }

      if (totalFee > 0) {
        blockchainFee = totalFee; // Total fee in lamports (includes Jito tip if enabled)
        const feeSol = (blockchainFee / 1e9).toFixed(6);
        const feeUsd = solPriceUSD
          ? ` (~$${((blockchainFee / 1e9) * solPriceUSD).toFixed(4)} USD)`
          : '';
        const txCount = signatures.length > 1 ? ` (${signatures.length} txns)` : '';
        const jitoTipNote = (isBulkSwap && jitoEnabled) ? ' (includes 0.001 SOL Jito tip)' : '';
        addLog(`💸 Total network fees: ${feeSol} SOL${feeUsd}${txCount}${jitoTipNote}`, 'success');
      }
    } catch (feeError) {
      console.warn('Could not fetch transaction fee:', feeError);
    }

    // Calculate total execution time
    const endTime = performance.now();
    const executionTimeMs = endTime - startTime;
    const executionTimeSec = (executionTimeMs / 1000).toFixed(2);
    timings.total = executionTimeSec;

    addLog(
      `⚡ Total time: ${executionTimeSec}s (Create: ${timings.create}s, Accept: ${timings.accept}s, Execute: ${timings.execute}s)`,
      'success'
    );

    // Show transaction summary (pass confirmed params + execution data + timings + fee + bulk info)
    showTransactionSummary(
      createData.data,
      acceptData.data,
      executeData.data,
      params,
      timings,
      blockchainFee,
      isBulkSwap,
      bulkSwapInfo
    );

    // Network from backend response (mainnet-beta or devnet)
    const network = executeData.data.network || 'devnet';
    const networkDisplay = network === 'mainnet-beta' ? 'MAINNET' : 'devnet';

    // Log completion based on swap type
    if (isBulkSwap) {
      addJitoLog(`cNFT bulk swap completed successfully on ${networkDisplay}!`);
    } else if (swapType && swapType.type.startsWith('cnft')) {
      addCnftLog(`cNFT swap completed successfully on ${networkDisplay}!`);
    } else {
      addLog(`✅ Atomic swap completed successfully on ${networkDisplay}!`, 'success');
    }

    // Reset selections after successful swap
    resetSelectionsAfterSwap();
  } catch (error) {
    console.error('Swap error:', error);
    addLog(`❌ Swap failed: ${error.message}`, 'error');
  } finally {
    // Restore button state
    swapBtn.innerHTML = originalText;
    swapBtn.disabled = false;
    swapBtn.style.animation = '';
  }
}

// Show transaction summary
function showTransactionSummary(
  createData,
  acceptData,
  executeData,
  params,
  timings,
  blockchainFee = null,
  isBulkSwap = false,
  bulkSwapInfo = null
) {
  const summary = document.getElementById('transaction-summary');
  const content = document.getElementById('summary-content');

  // Use confirmed parameters (not re-reading from inputs)
  const {
    offeredSol,
    requestedSol,
    selectedMakerNFTs: confirmedMakerNFTs,
    selectedTakerNFTs: confirmedTakerNFTs,
    swapType,
  } = params;

  // Format blockchain fee (includes Jito tip only when Jito is enabled)
  const jitoEnabled = bulkSwapInfo?.jitoEnabled ?? false;
  let feeDisplay = 'Fetching...';
  if (blockchainFee !== null) {
    const feeSol = (blockchainFee / 1e9).toFixed(6);
    const feeUsd = solPriceUSD
      ? ` (~$${((blockchainFee / 1e9) * solPriceUSD).toFixed(4)} USD)`
      : '';
    const jitoTipNote = (isBulkSwap && jitoEnabled) ? ' (includes 0.001 SOL Jito tip)' : '';
    feeDisplay = `💸 ${feeSol} SOL${feeUsd}${jitoTipNote}`;
  }

  // Determine swap type badge
  let swapTypeBadge = '⚡ Swap';
  if (isBulkSwap) {
    swapTypeBadge = jitoEnabled
      ? '🚀 Bulk Swap (Jito Bundle)'
      : '🚀 Bulk Swap (Sequential)';
  }

  // Build summary HTML safely (XSS-protected)
  content.innerHTML = `
        <div class="summary-section">
            <h4>✅ ${swapTypeBadge} Confirmed</h4>
            <div class="summary-item">
                <span class="summary-label">Signature:</span>
                <span class="summary-value"><a href="${
                  executeData.explorerUrl
                }" target="_blank" rel="noopener noreferrer">${escapeHtml(
    executeData.signature.substring(0, 20)
  )}...</a></span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Total Time:</span>
                <span class="summary-value highlight">⚡ ${timings.total}s</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Total Network Fees:</span>
                <span class="summary-value">${feeDisplay}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Breakdown:</span>
                <span class="summary-value">Create: ${timings.create}s | Accept: ${
    timings.accept
  }s | Execute: ${timings.execute}s</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Offer ID:</span>
                <span class="summary-value">${escapeHtml(createData.offer.id)}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Status:</span>
                <span class="summary-value badge-success">EXECUTED ✅</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Nonce Account:</span>
                <span class="summary-value">${escapeHtml(
                  acceptData.transaction.nonceAccount
                )}</span>
            </div>
            ${
              isBulkSwap && bulkSwapInfo
                ? `
            <div class="summary-item" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                <span class="summary-label" style="color: #f59e0b; font-weight: 600;">🚀 Jito Bundle Info:</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Transactions:</span>
                <span class="summary-value">${bulkSwapInfo.transactionCount || 'N/A'}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Strategy:</span>
                <span class="summary-value">${bulkSwapInfo.strategy || 'JITO_BUNDLE'}</span>
            </div>
            ${
              executeData.bundleId
                ? `
            <div class="summary-item">
                <span class="summary-label">Bundle ID:</span>
                <span class="summary-value" style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(
                  executeData.bundleId
                )}</span>
            </div>
            `
                : ''
            }
            `
                : ''
            }
        </div>

        <div class="summary-section">
            <h4>Maker Offered</h4>
            ${
              confirmedMakerNFTs.length > 0
                ? `
                <div class="summary-item">
                    <span class="summary-label">NFTs:</span>
                    <span class="summary-value">${confirmedMakerNFTs.length} NFT(s)</span>
                </div>
            `
                : ''
            }
            ${
              offeredSol
                ? `
                <div class="summary-item">
                    <span class="summary-label">SOL:</span>
                    <span class="summary-value">${escapeHtml(offeredSol)} SOL</span>
                </div>
            `
                : ''
            }
        </div>

        <div class="summary-section">
            <h4>Taker Offered</h4>
            ${
              confirmedTakerNFTs.length > 0
                ? `
                <div class="summary-item">
                    <span class="summary-label">NFTs:</span>
                    <span class="summary-value">${confirmedTakerNFTs.length} NFT(s)</span>
                </div>
            `
                : ''
            }
            ${
              requestedSol
                ? `
                <div class="summary-item">
                    <span class="summary-label">SOL:</span>
                    <span class="summary-value">${escapeHtml(requestedSol)} SOL</span>
                </div>
            `
                : ''
            }
        </div>

        <div class="summary-section">
            <h4>🔗 View Transaction</h4>
            <div class="summary-item">
                <a href="${
                  executeData.explorerUrl
                }" target="_blank" rel="noopener noreferrer" class="explorer-link">
                    View on Solscan (Devnet) →
                </a>
            </div>
        </div>
    `;

  summary.classList.add('show');
}

// Set environment badge immediately on script load (before DOMContentLoaded)
// This ensures the badge updates as quickly as possible
if (document.getElementById('env-badge')) {
  setEnvironmentBadge();
}

// ========================================
// LISTING FUNCTIONALITY
// ========================================

// Listing state
let selectedListingDuration = 604800; // 7 days default
let selectedListingAsset = null;
let activeListings = [];
let quickListAsset = null;
let quickListDuration = 604800;

// Initialize listing functionality after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait a bit to ensure main init is complete
  setTimeout(initializeListingFeatures, 100);
});

function initializeListingFeatures() {
  console.log('📋 Initializing listing features...');

  // Refresh listings button
  const refreshListingsBtn = document.getElementById('refresh-listings-btn');
  if (refreshListingsBtn) {
    refreshListingsBtn.addEventListener('click', loadActiveListings);
  }

  // Quick list modal handlers
  const quickListCancel = document.getElementById('quick-list-cancel');
  if (quickListCancel) {
    quickListCancel.addEventListener('click', hideQuickListModal);
  }

  const quickListConfirm = document.getElementById('quick-list-confirm');
  if (quickListConfirm) {
    quickListConfirm.addEventListener('click', handleQuickListConfirm);
  }

  // Quick list duration buttons
  const quickListDurationBtns = document.querySelectorAll(
    '#quick-list-duration-buttons .listing-duration-btn'
  );
  quickListDurationBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      quickListDurationBtns.forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      quickListDuration = parseInt(e.target.dataset.duration);
    });
  });

  // Quick list price input handler
  const quickListPrice = document.getElementById('quick-list-price');
  if (quickListPrice) {
    quickListPrice.addEventListener('input', updateQuickListPriceDisplay);
  }

  console.log('✅ Listing features initialized');
}

// Load active listings - now uses offers API
async function loadActiveListings() {
  const container = document.getElementById('active-listings-container');
  if (!container || !MAKER_ADDRESS) {
    return;
  }

  container.innerHTML = '<div class="loading"><div class="spinner"></div>Loading listings...</div>';

  try {
    // Fetch offers where the maker is the current user and status is PENDING (active offers)
    const response = await fetch(`/api/swaps/offers?makerWallet=${MAKER_ADDRESS}&status=PENDING`);
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to load listings');
    }

    // Filter to show:
    // 1. NFT-for-SOL offers (listings you created - you offer NFT, request SOL)
    // 2. SOL-for-NFT offers (counter offers/bids you made - you offer SOL, request NFT)
    activeListings = (result.data.offers || []).filter((offer) => {
      const hasOfferedAssets = offer.offeredAssets && offer.offeredAssets.length > 0;
      const hasOfferedSol = offer.offeredSol && BigInt(offer.offeredSol) > 0;
      const requestsSol = offer.requestedSol && BigInt(offer.requestedSol) > 0;
      const requestsAssets = offer.requestedAssets && offer.requestedAssets.length > 0;
      const noRequestedAssets = !offer.requestedAssets || offer.requestedAssets.length === 0;

      // Listing: offers NFT, requests SOL
      const isListing = hasOfferedAssets && requestsSol && noRequestedAssets;

      // Bid/Counter offer: offers SOL, requests NFT
      const isBid = hasOfferedSol && requestsAssets && !hasOfferedAssets;

      return isListing || isBid;
    });
    renderActiveListings();
  } catch (error) {
    console.error('Load listings error:', error);
    // Show user-friendly message for database errors (table doesn't exist, etc.)
    const errorMsg = error.message?.toLowerCase() || '';
    if (
      errorMsg.includes('prisma') ||
      errorMsg.includes('database') ||
      errorMsg.includes('table') ||
      errorMsg.includes('does not exist')
    ) {
      container.innerHTML =
        '<div class="empty-state">No active listings. List an asset to see it here.</div>';
    } else {
      container.innerHTML =
        '<div class="error-message">Unable to load listings. Please try again.</div>';
    }
  }
}

// Render active listings - updated for offers API format
// Supports both listings (NFT-for-SOL) and bids (SOL-for-NFT counter offers)
function renderActiveListings() {
  const container = document.getElementById('active-listings-container');
  if (!container) return;

  if (activeListings.length === 0) {
    container.innerHTML =
      '<div class="empty-state">No active listings or bids. List an asset or make a counter offer to see it here.</div>';
    return;
  }

  container.innerHTML = activeListings
    .map((offer) => {
      // Determine if this is a listing (NFT-for-SOL) or a bid (SOL-for-NFT)
      const hasOfferedAssets = offer.offeredAssets && offer.offeredAssets.length > 0;
      const hasOfferedSol = offer.offeredSol && BigInt(offer.offeredSol) > 0;
      const isBid = hasOfferedSol && !hasOfferedAssets;

      // For listings: get the offered NFT
      // For bids: get the requested NFT
      let assetId, assetMetadata, name, nftType, priceSol, offerTypeLabel, cardStyle;

      if (isBid) {
        // This is a bid/counter offer - user offered SOL for an NFT
        const requestedAsset = offer.requestedAssets && offer.requestedAssets[0];
        assetId = requestedAsset ? requestedAsset.identifier : 'unknown';
        assetMetadata = requestedAsset?.metadata || {};
        name = assetMetadata.name || requestedAsset?.name || 'Unknown NFT';
        priceSol = (parseInt(offer.offeredSol || '0') / 1e9).toFixed(4);
        offerTypeLabel = '💰 Your Bid';
        cardStyle = 'border-left: 4px solid #f59e0b;'; // Orange border for bids

        // Determine NFT type
        const assetType = requestedAsset?.type;
        if (assetType === 'CNFT' || assetType === 'cNFT') {
          nftType = 'cNFT';
        } else if (assetType === 'CORE_NFT' || assetType === 'Core') {
          nftType = 'Core NFT';
        } else {
          nftType = 'SPL NFT';
        }
      } else {
        // This is a listing - user offered NFT for SOL
        const offeredAsset = offer.offeredAssets && offer.offeredAssets[0];
        assetId = offeredAsset ? offeredAsset.identifier : 'unknown';
        assetMetadata = offeredAsset?.metadata || {};
        name = assetMetadata.name || offeredAsset?.name || 'Unknown NFT';
        priceSol = (parseInt(offer.requestedSol || '0') / 1e9).toFixed(4);
        cardStyle = '';

        // Determine NFT type
        const assetType = offeredAsset?.type;
        if (assetType === 'CNFT' || assetType === 'cNFT') {
          nftType = 'cNFT';
        } else if (assetType === 'CORE_NFT' || assetType === 'Core') {
          nftType = 'Core NFT';
        } else {
          nftType = 'SPL NFT';
        }

        // Determine listing type (open or private)
        const isPrivate = !!offer.takerWallet;
        offerTypeLabel = isPrivate ? '🔒 Private' : '🌐 Open';
      }

      const imageUrl = assetMetadata.image || getPlaceholderImage(assetId);
      const createdAt = new Date(offer.createdAt);

      // Determine status class
      let statusClass = offer.status.toLowerCase();
      const isPrivate = !isBid && !!offer.takerWallet;

      // Truncate asset ID for display
      const shortAssetId = assetId.length > 16 ? `${assetId.substring(0, 8)}...${assetId.substring(assetId.length - 4)}` : assetId;

      return `
            <div class="listing-card" data-offer-id="${offer.id}" style="${cardStyle}">
                <div class="listing-card-header">
                    <div class="listing-card-image-container">
                        <img class="listing-card-image" src="${imageUrl}" alt="${escapeHtml(name)}"
                             data-asset-id="${assetId}">
                        <button class="listing-image-cancel-btn" data-action="cancel" data-offer-id="${offer.id}" title="Cancel Listing">
                            ✕
                        </button>
                    </div>
                    <div class="listing-card-info">
                        <div class="listing-card-name">${escapeHtml(name)}</div>
                        <div class="listing-card-type">${nftType} ${offerTypeLabel}</div>
                    </div>
                </div>

                <div class="listing-card-details">
                    <div class="listing-card-row">
                        <span class="listing-card-label">${isBid ? 'Your Offer:' : 'Price:'}</span>
                        <span class="listing-card-value price">${priceSol} SOL</span>
                    </div>
                    <div class="listing-card-row">
                        <span class="listing-card-label">Status:</span>
                        <span class="listing-status-badge ${statusClass}">${offer.status}</span>
                    </div>
                    <div class="listing-card-row">
                        <span class="listing-card-label">Asset ID:</span>
                        <span class="listing-card-value asset-id" title="${assetId}">${shortAssetId}</span>
                    </div>
                    ${isPrivate ? `
                    <div class="listing-card-row">
                        <span class="listing-card-label">Buyer:</span>
                        <span class="listing-card-value">${offer.takerWallet.substring(0, 8)}...</span>
                    </div>
                    ` : ''}
                    <div class="listing-card-row">
                        <span class="listing-card-label">Created:</span>
                        <span class="listing-card-value">${createdAt.toLocaleDateString()}</span>
                    </div>
                </div>

                <div class="listing-card-actions">
                    <button class="listing-action-btn cancel" data-action="cancel" data-offer-id="${offer.id}">
                        Cancel Listing
                    </button>
                </div>
            </div>
        `;
    })
    .join('');

  // Add CSP-compliant event handlers for cancel buttons on NFT images
  container.querySelectorAll('.listing-image-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // Prevent card click events
      const offerId = this.dataset.offerId;
      handleCancelOffer(offerId);
    });
  });

  // Add CSP-compliant event handlers for action cancel buttons
  container.querySelectorAll('.listing-action-btn.cancel').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      e.stopPropagation(); // Prevent card click events
      const offerId = this.dataset.offerId;
      handleCancelOffer(offerId);
    });
  });

  // Add CSP-compliant error handlers for listing card images
  container.querySelectorAll('.listing-card-image').forEach((img) => {
    img.addEventListener(
      'error',
      function () {
        const assetId = this.dataset.assetId;
        if (assetId) {
          this.src = getPlaceholderImage(assetId);
        }
      },
      { once: true }
    );
  });
}

// Handle cancel listing (uses swap offers cancel endpoint)
async function handleCancelListing(listingId) {
  if (!confirm('Are you sure you want to cancel this listing?')) {
    return;
  }

  const card = document.querySelector(`[data-listing-id="${listingId}"]`);
  const cancelBtn = card ? card.querySelector('.listing-action-btn.cancel') : null;

  try {
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
    }

    addLog(`🔄 Cancelling listing ${listingId}...`, 'info');

    // Call cancel offer API (swap offers endpoint)
    const response = await fetch(`/api/swaps/offers/${listingId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `cancel-${listingId}-${Date.now()}`,
      },
      body: JSON.stringify({
        walletAddress: MAKER_ADDRESS,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to cancel listing');
    }

    addLog(`✅ Listing cancelled successfully!`, 'success');

    // Refresh listings and marketplace
    await loadActiveListings();
    await loadMarketplaceListings();

    // Refresh maker wallet
    await loadWalletInfo('maker');
  } catch (error) {
    console.error('Cancel listing error:', error);
    addLog(`❌ Failed to cancel listing: ${error.message}`, 'error');

    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
    }
  }
}

// View listing details
function viewListingDetails(listingId) {
  const listing = activeListings.find((l) => l.listingId === listingId);
  if (!listing) {
    addLog('❌ Listing not found', 'error');
    return;
  }

  const priceSol = (parseInt(listing.priceLamports) / 1e9).toFixed(4);
  const priceUsd = solPriceUSD
    ? ` (~$${((parseInt(listing.priceLamports) / 1e9) * solPriceUSD).toFixed(2)})`
    : '';

  addLog(`📋 Listing Details:`, 'info');
  addLog(`   ID: ${listing.listingId}`, 'info');
  addLog(`   Asset: ${listing.assetId}`, 'info');
  addLog(`   Price: ${priceSol} SOL${priceUsd}`, 'info');
  addLog(`   Status: ${listing.status}`, 'info');
  addLog(`   Delegation: ${listing.delegationStatus}`, 'info');
}

// Cancel an offer (listing) - uses offers API
async function handleCancelOffer(offerId) {
  if (!confirm('Are you sure you want to cancel this listing?')) {
    return;
  }

  const card = document.querySelector(`[data-offer-id="${offerId}"]`);
  const cancelBtn = card ? card.querySelector('.listing-action-btn.cancel') : null;

  try {
    if (cancelBtn) {
      cancelBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
    }

    addLog(`🔄 Cancelling offer ${offerId}...`, 'info');

    // Call cancel offer API
    const response = await fetch(`/api/swaps/offers/${offerId}/cancel`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `cancel-offer-${offerId}-${Date.now()}`,
      },
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to cancel offer');
    }

    addLog(`✅ Listing cancelled successfully!`, 'success');

    // Refresh listings
    await loadActiveListings();

    // Refresh maker wallet
    await loadWalletInfo('maker');
  } catch (error) {
    console.error('Cancel offer error:', error);
    addLog(`❌ Failed to cancel listing: ${error.message}`, 'error');

    if (cancelBtn) {
      cancelBtn.disabled = false;
      cancelBtn.textContent = 'Cancel';
    }
  }
}

// View offer details
function viewOfferDetails(offerId) {
  const offer = activeListings.find((o) => o.id === parseInt(offerId) || o.id === offerId);
  if (!offer) {
    addLog('❌ Offer not found', 'error');
    return;
  }

  const priceSol = (parseInt(offer.requestedSol || '0') / 1e9).toFixed(4);
  const priceUsd = solPriceUSD
    ? ` (~$${((parseInt(offer.requestedSol || '0') / 1e9) * solPriceUSD).toFixed(2)})`
    : '';

  const offeredAsset = offer.offeredAssets && offer.offeredAssets[0];
  const assetId = offeredAsset ? offeredAsset.identifier : 'unknown';
  const assetName = offeredAsset?.metadata?.name || 'Unknown NFT';

  addLog(`📋 Offer Details:`, 'info');
  addLog(`   Offer ID: ${offer.id}`, 'info');
  addLog(`   Asset: ${assetName}`, 'info');
  addLog(`   Asset ID: ${assetId}`, 'info');
  addLog(`   Price: ${priceSol} SOL${priceUsd}`, 'info');
  addLog(`   Status: ${offer.status}`, 'info');
  addLog(`   Type: ${offer.takerWallet ? 'Private' : 'Open'}`, 'info');
  if (offer.takerWallet) {
    addLog(`   Buyer: ${offer.takerWallet}`, 'info');
  }
}

// Counter offer state
let counterOfferData = null;

// Show counter offer modal
function showCounterOfferModal(offerId, offerData) {
  const modal = document.getElementById('counter-offer-modal');
  if (!modal) return;

  counterOfferData = { offerId, ...offerData };

  // Update modal content
  const imageEl = document.getElementById('counter-offer-image');
  const nameEl = document.getElementById('counter-offer-name');
  const priceEl = document.getElementById('counter-offer-original-price');
  const priceInput = document.getElementById('counter-offer-price');

  if (imageEl) imageEl.src = offerData.image || getPlaceholderImage(offerData.assetId);
  if (nameEl) nameEl.textContent = offerData.name || 'Unknown NFT';
  if (priceEl) priceEl.textContent = `Listed: ${offerData.priceSol} SOL`;
  if (priceInput) priceInput.value = '';

  modal.classList.add('show');
}

// Hide counter offer modal
function hideCounterOfferModal() {
  const modal = document.getElementById('counter-offer-modal');
  if (modal) modal.classList.remove('show');
  counterOfferData = null;
}

// Submit counter offer - creates a new offer with the desired price
// The taker offers SOL in exchange for the NFT they want to buy
async function handleSubmitCounterOffer() {
  if (!counterOfferData) {
    addLog('❌ No offer selected', 'error');
    return;
  }

  if (!TAKER_ADDRESS) {
    addLog('❌ Please load the Taker wallet first to make counter offers', 'error');
    return;
  }

  const priceInput = document.getElementById('counter-offer-price');
  const price = parseFloat(priceInput?.value || '0');

  if (!price || price <= 0) {
    addLog('❌ Please enter a valid price', 'error');
    return;
  }

  const submitBtn = document.getElementById('counter-offer-submit');
  const originalText = submitBtn ? submitBtn.innerHTML : '';

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '⏳ Submitting...';
    }

    addLog(`💰 Creating counter offer of ${price} SOL for ${counterOfferData.name}...`, 'info');

    // Convert SOL to lamports
    const priceLamports = Math.floor(price * 1e9);

    // Create a new offer where taker offers SOL for the NFT
    // This is a "bid" - taker offers SOL, requests the NFT
    const offerRequest = {
      makerWallet: TAKER_ADDRESS, // Taker becomes the maker of this counter offer
      offeredAssets: [], // Taker offers SOL, not assets
      offeredSol: priceLamports.toString(),
      requestedAssets: [
        {
          identifier: counterOfferData.assetId,
          type: 'NFT', // Will be validated by the backend
        },
      ],
      requestedSol: '0',
    };

    // Call create offer API to make a new bid
    const response = await fetch('/api/swaps/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `counter-${counterOfferData.offerId}-${Date.now()}`,
      },
      body: JSON.stringify(offerRequest),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || result.error || 'Failed to submit counter offer');
    }

    const newOfferId = result.data.offerId || result.data.offer?.id;
    addLog(`✅ Counter offer created! Offer ID: ${newOfferId}`, 'success');
    addLog(`   You offered ${price} SOL for "${counterOfferData.name}"`, 'info');
    addLog(`   The seller can now accept your offer`, 'info');
    hideCounterOfferModal();

    // Refresh marketplace
    await loadMarketplaceListings();
  } catch (error) {
    console.error('Counter offer error:', error);
    addLog(`❌ Failed to submit counter offer: ${error.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }
}

// Initialize counter offer modal handlers
function initCounterOfferModal() {
  const cancelBtn = document.getElementById('counter-offer-cancel');
  const submitBtn = document.getElementById('counter-offer-submit');
  const priceInput = document.getElementById('counter-offer-price');
  const priceUsdDisplay = document.getElementById('counter-offer-price-usd');

  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideCounterOfferModal);
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', handleSubmitCounterOffer);
  }

  // Update USD display when price changes
  if (priceInput && priceUsdDisplay) {
    priceInput.addEventListener('input', function () {
      const solValue = parseFloat(this.value);
      if (solValue > 0 && solPriceUSD) {
        const usdValue = (solValue * solPriceUSD).toFixed(2);
        priceUsdDisplay.textContent = `≈ $${usdValue} USD`;
      } else {
        priceUsdDisplay.textContent = '';
      }
    });
  }
}

// Export for global access
window.handleCancelOffer = handleCancelOffer;
window.viewOfferDetails = viewOfferDetails;
window.showCounterOfferModal = showCounterOfferModal;
window.hideCounterOfferModal = hideCounterOfferModal;
window.handleSubmitCounterOffer = handleSubmitCounterOffer;

// Quick list modal functions
function showQuickListModal(nft) {
  if (!nft) {
    addLog('❌ No NFT selected', 'error');
    return;
  }

  quickListAsset = nft;
  quickListDuration = 604800; // Reset to 7 days

  // Update modal content
  document.getElementById('quick-list-image').src =
    getNftImage(nft) || getPlaceholderImage(nft.mint);
  document.getElementById('quick-list-name').textContent = nft.name || 'Unknown NFT';
  document.getElementById('quick-list-type').textContent = getNftTypeLabel(nft);
  document.getElementById('quick-list-mint').textContent = nft.mint;
  document.getElementById('quick-list-price').value = '';
  document.getElementById('quick-list-price-usd').textContent = '';

  // Clear private wallet input
  const privateWalletInput = document.getElementById('quick-list-private-wallet');
  if (privateWalletInput) {
    privateWalletInput.value = '';
  }

  // Reset duration buttons
  const durationBtns = document.querySelectorAll(
    '#quick-list-duration-buttons .listing-duration-btn'
  );
  durationBtns.forEach((btn) => {
    btn.classList.remove('active');
    if (parseInt(btn.dataset.duration) === 604800) {
      btn.classList.add('active');
    }
  });

  document.getElementById('quick-list-modal').classList.add('show');
}

function hideQuickListModal() {
  document.getElementById('quick-list-modal').classList.remove('show');
  quickListAsset = null;
}

function updateQuickListPriceDisplay() {
  const priceInput = document.getElementById('quick-list-price');
  const usdDisplay = document.getElementById('quick-list-price-usd');

  if (!priceInput || !usdDisplay) return;

  const solValue = parseFloat(priceInput.value);
  if (solValue > 0 && solPriceUSD) {
    const usdValue = (solValue * solPriceUSD).toFixed(2);
    usdDisplay.textContent = `≈ $${usdValue} USD`;
  } else {
    usdDisplay.textContent = '';
  }
}

async function handleQuickListConfirm() {
  if (!quickListAsset) {
    addLog('❌ No asset selected', 'error');
    return;
  }

  const priceInput = document.getElementById('quick-list-price');
  const price = parseFloat(priceInput.value);

  if (!price || price <= 0) {
    addLog('❌ Please enter a valid price', 'error');
    return;
  }

  const confirmBtn = document.getElementById('quick-list-confirm');
  const originalText = confirmBtn.innerHTML;

  try {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = 'Creating...';

    // Get optional private wallet for private sale
    const privateWalletInput = document.getElementById('quick-list-private-wallet');
    const privateWallet = privateWalletInput ? privateWalletInput.value.trim() : '';

    const listingType = privateWallet ? 'private' : 'open';
    addLog(`📝 Creating ${listingType} listing for ${quickListAsset.name}...`, 'info');

    // Convert SOL to lamports
    const priceLamports = Math.floor(price * 1e9);

    // Determine asset type
    let assetType = 'NFT';
    if (quickListAsset.isCompressed) {
      assetType = 'CNFT';
    } else if (quickListAsset.isCoreNft) {
      assetType = 'CORE_NFT';
    }

    // Build offer request - NFT for SOL (open swap offer)
    const offerRequest = {
      makerWallet: MAKER_ADDRESS,
      offeredAssets: [
        {
          identifier: quickListAsset.mint,
          type: assetType,
        },
      ],
      requestedAssets: [],
      requestedSol: priceLamports.toString(),
      durationSeconds: quickListDuration,
    };

    // Add taker wallet if private sale
    if (privateWallet) {
      offerRequest.takerWallet = privateWallet;
    }

    // Call create offer API (open swap offer)
    const response = await fetch('/api/swaps/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `quick-listing-${Date.now()}-${quickListAsset.mint.substring(0, 8)}`,
      },
      body: JSON.stringify(offerRequest),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || result.error || 'Failed to create listing');
    }

    const offerId = result.data.offerId || result.data.offer?.id;
    addLog(`✓ Listing created! Offer ID: ${offerId}`, 'success');

    if (privateWallet) {
      addLog(`🔒 Private sale - only ${privateWallet.substring(0, 8)}... can buy`, 'info');
    } else {
      addLog(`🌐 Open listing - anyone can buy or make counter offers`, 'info');
    }

    addLog(`✅ NFT is now listed for sale!`, 'success');

    hideQuickListModal();

    // Refresh listings, marketplace, and wallet
    await loadActiveListings();
    await loadMarketplaceListings();
    await loadWalletInfo('maker');
  } catch (error) {
    console.error('Quick list error:', error);
    addLog(`❌ Failed to create listing: ${error.message}`, 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
  }
}

// Override loadWalletInfo to also populate asset selector and load listings
const originalLoadWalletInfo = loadWalletInfo;
loadWalletInfo = async function (wallet) {
  await originalLoadWalletInfo.call(this, wallet);

  // After maker wallet loads, refresh active listings
  if (wallet === 'maker' && makerData) {
    loadActiveListings();
  }
};

// Make functions available globally
window.handleCancelListing = handleCancelListing;
window.viewListingDetails = viewListingDetails;
window.showQuickListModal = showQuickListModal;

// ========================================
// MARKETPLACE FUNCTIONALITY (Task 18)
// ========================================

// Marketplace state
let marketplaceListings = [];
let marketplaceSearchTerm = '';
let marketplacePriceFilter = 'all';
let marketplaceVisibilityFilter = 'all';
let selectedBuyListing = null;

// Initialize marketplace functionality after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Wait for main init to complete
  setTimeout(initializeMarketplaceFeatures, 150);
});

function initializeMarketplaceFeatures() {
  console.log('🛒 Initializing marketplace features...');

  // Search input handler
  const searchInput = document.getElementById('marketplace-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      marketplaceSearchTerm = e.target.value.toLowerCase();
      renderMarketplaceListings();
    });
  }

  // Visibility filter handler (Public/Private/All)
  const visibilityFilter = document.getElementById('marketplace-visibility-filter');
  if (visibilityFilter) {
    visibilityFilter.addEventListener('change', (e) => {
      marketplaceVisibilityFilter = e.target.value;
      renderMarketplaceListings();
    });
  }

  // Price filter handler
  const priceFilter = document.getElementById('marketplace-price-filter');
  if (priceFilter) {
    priceFilter.addEventListener('change', (e) => {
      marketplacePriceFilter = e.target.value;
      renderMarketplaceListings();
    });
  }

  // Refresh button handler
  const refreshBtn = document.getElementById('refresh-marketplace-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadMarketplaceListings);
  }

  // Buy modal handlers
  const buyModalCancel = document.getElementById('buy-modal-cancel');
  if (buyModalCancel) {
    buyModalCancel.addEventListener('click', hideBuyModal);
  }

  const buyModalConfirm = document.getElementById('buy-modal-confirm');
  if (buyModalConfirm) {
    buyModalConfirm.addEventListener('click', handleConfirmPurchase);
  }

  // Success modal close button
  const successCloseBtn = document.getElementById('success-close-btn');
  if (successCloseBtn) {
    successCloseBtn.addEventListener('click', hidePurchaseSuccessModal);
  }

  // Initialize counter offer modal
  initCounterOfferModal();

  // Load marketplace listings on init
  loadMarketplaceListings();

  console.log('✅ Marketplace features initialized');
}

// Load marketplace listings (all active listings from all sellers)
async function loadMarketplaceListings() {
  const container = document.getElementById('marketplace-grid');
  if (!container) {
    return;
  }

  container.innerHTML =
    '<div class="loading"><div class="spinner"></div>Loading marketplace...</div>';

  try {
    // Fetch all pending offers (these are open listings)
    const response = await fetch('/api/swaps/offers?status=PENDING');
    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to load marketplace');
    }

    // Filter to only show NFT-for-SOL offers (listings)
    // Include both public (no takerWallet) and private (has takerWallet) listings
    // Also exclude offers from the current user (maker)
    marketplaceListings = (result.data.offers || []).filter((offer) => {
      const hasOfferedAssets = offer.offeredAssets && offer.offeredAssets.length > 0;
      const requestsSol = offer.requestedSol && BigInt(offer.requestedSol) > 0;
      const noRequestedAssets = !offer.requestedAssets || offer.requestedAssets.length === 0;
      const notOwnListing = offer.makerWallet !== MAKER_ADDRESS; // Exclude own listings
      return hasOfferedAssets && requestsSol && noRequestedAssets && notOwnListing;
    });
    console.log(`🛒 Loaded ${marketplaceListings.length} marketplace listings`);
    renderMarketplaceListings();
  } catch (error) {
    console.error('Load marketplace error:', error);
    // Show user-friendly message for database errors (table doesn't exist, etc.)
    const errorMsg = error.message?.toLowerCase() || '';
    if (
      errorMsg.includes('prisma') ||
      errorMsg.includes('database') ||
      errorMsg.includes('table') ||
      errorMsg.includes('does not exist')
    ) {
      container.innerHTML =
        '<div class="empty-state">No listings available. Check back later!</div>';
    } else {
      container.innerHTML =
        '<div class="error-message">Unable to load marketplace. Please try again.</div>';
    }
  }
}

// Render marketplace listings - updated for offers API format
function renderMarketplaceListings() {
  const container = document.getElementById('marketplace-grid');
  if (!container) return;

  // Apply filters
  let filteredListings = marketplaceListings.filter((offer) => {
    // Get asset info for filtering
    const offeredAsset = offer.offeredAssets && offer.offeredAssets[0];
    const assetMetadata = offeredAsset?.metadata || {};
    const name = (assetMetadata.name || offeredAsset?.name || '').toLowerCase();
    const assetId = (offeredAsset?.identifier || '').toLowerCase();

    // Search filter
    if (marketplaceSearchTerm) {
      if (!name.includes(marketplaceSearchTerm) && !assetId.includes(marketplaceSearchTerm)) {
        return false;
      }
    }

    // Price filter
    const priceSol = parseInt(offer.requestedSol || '0') / 1e9;
    if (marketplacePriceFilter === 'low' && priceSol >= 0.1) return false;
    if (marketplacePriceFilter === 'mid' && (priceSol < 0.1 || priceSol > 1)) return false;
    if (marketplacePriceFilter === 'high' && priceSol <= 1) return false;

    // Visibility filter (public/private/all)
    const isPublicListing = !offer.takerWallet;
    if (marketplaceVisibilityFilter === 'public' && !isPublicListing) return false;
    if (marketplaceVisibilityFilter === 'private' && isPublicListing) return false;

    return true;
  });

  if (filteredListings.length === 0) {
    container.innerHTML = '<div class="empty-state">No listings available. Check back later!</div>';
    return;
  }

  container.innerHTML = filteredListings
    .map((offer) => {
      // Get first offered asset (the NFT being listed)
      const offeredAsset = offer.offeredAssets && offer.offeredAssets[0];
      const assetId = offeredAsset ? offeredAsset.identifier : 'unknown';
      const assetMetadata = offeredAsset?.metadata || {};

      const imageUrl = assetMetadata.image || getPlaceholderImage(assetId);
      const name = assetMetadata.name || offeredAsset?.name || 'Unknown NFT';
      const priceSol = (parseInt(offer.requestedSol || '0') / 1e9).toFixed(4);
      const priceUsd = solPriceUSD
        ? ((parseInt(offer.requestedSol || '0') / 1e9) * solPriceUSD).toFixed(2)
        : null;
      const seller = offer.makerWallet;

      // Determine NFT type from asset
      let nftType = 'SPL NFT';
      const assetType = offeredAsset?.type;
      if (assetType === 'CNFT' || assetType === 'cNFT') {
        nftType = 'cNFT';
      } else if (assetType === 'CORE_NFT' || assetType === 'Core') {
        nftType = 'Core NFT';
      }

      // Truncate seller address
      const sellerDisplay = seller ? `${seller.substring(0, 4)}...${seller.substring(seller.length - 4)}` : 'Unknown';

      return `
            <div class="marketplace-card" data-offer-id="${offer.id}">
                <div class="marketplace-card-header">
                    <img class="marketplace-card-image" src="${imageUrl}" alt="${escapeHtml(name)}"
                         data-asset-id="${assetId}">
                    <div class="marketplace-card-info">
                        <div class="marketplace-card-name">${escapeHtml(name)}</div>
                        <div class="marketplace-card-type">${nftType}</div>
                        <div class="marketplace-card-seller">Seller: ${sellerDisplay}</div>
                    </div>
                </div>

                <div class="marketplace-card-details">
                    <div class="marketplace-card-row">
                        <span class="marketplace-card-label">Price:</span>
                        <span class="marketplace-card-value price">${priceSol} SOL</span>
                    </div>
                    ${
                      priceUsd
                        ? `
                    <div class="marketplace-card-row">
                        <span class="marketplace-card-label"></span>
                        <span class="marketplace-card-value price-usd">≈ $${priceUsd} USD</span>
                    </div>
                    `
                        : ''
                    }
                </div>

                <div class="marketplace-card-actions" style="display: flex; gap: 8px;">
                    <button class="buy-now-btn" data-action="accept" data-offer-id="${offer.id}" style="flex: 1;">
                        🛒 Accept Offer
                    </button>
                    <button class="buy-now-btn counter-offer-btn" data-action="counter" data-offer-id="${offer.id}"
                            data-name="${escapeHtml(name)}" data-image="${imageUrl}" data-asset-id="${assetId}"
                            data-price="${priceSol}" style="flex: 1; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
                        💰 Counter
                    </button>
                </div>
            </div>
        `;
    })
    .join('');

  // Add CSP-compliant event handlers for accept buttons
  container.querySelectorAll('.buy-now-btn[data-action="accept"]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const offerId = this.dataset.offerId;
      showAcceptOfferModal(offerId);
    });
  });

  // Add CSP-compliant event handlers for counter offer buttons
  container.querySelectorAll('.counter-offer-btn[data-action="counter"]').forEach((btn) => {
    btn.addEventListener('click', function () {
      const offerId = this.dataset.offerId;
      const offerData = {
        name: this.dataset.name,
        image: this.dataset.image,
        assetId: this.dataset.assetId,
        priceSol: this.dataset.price,
      };
      showCounterOfferModal(offerId, offerData);
    });
  });

  // Add CSP-compliant error handlers for marketplace card images
  container.querySelectorAll('.marketplace-card-image').forEach((img) => {
    img.addEventListener(
      'error',
      function () {
        const assetId = this.dataset.assetId;
        if (assetId) {
          this.src = getPlaceholderImage(assetId);
        }
      },
      { once: true }
    );
  });
}

// Accept offer state
let selectedAcceptOffer = null;

// Show accept offer modal and handle the accept flow
async function showAcceptOfferModal(offerId) {
  const offer = marketplaceListings.find((o) => o.id === parseInt(offerId) || o.id === offerId);
  if (!offer) {
    addLog('❌ Offer not found', 'error');
    return;
  }

  // Check if taker wallet is loaded
  if (!takerData) {
    addLog('❌ Please load the Taker wallet first to accept offers', 'error');
    return;
  }

  selectedAcceptOffer = offer;

  const offeredAsset = offer.offeredAssets && offer.offeredAssets[0];
  const assetId = offeredAsset ? offeredAsset.identifier : 'unknown';
  const assetMetadata = offeredAsset?.metadata || {};
  const name = assetMetadata.name || offeredAsset?.name || 'Unknown NFT';
  const priceSol = (parseInt(offer.requestedSol || '0') / 1e9).toFixed(4);
  const priceUsd = solPriceUSD ? ((parseInt(offer.requestedSol || '0') / 1e9) * solPriceUSD).toFixed(2) : null;

  // Check if taker has enough SOL
  const requiredLamports = parseInt(offer.requestedSol || '0');
  const takerBalanceLamports = takerData.balance * 1e9;

  if (takerBalanceLamports < requiredLamports) {
    addLog(`❌ Insufficient SOL balance. Need ${priceSol} SOL, have ${takerData.balance.toFixed(4)} SOL`, 'error');
    return;
  }

  // Confirm purchase
  const confirmMessage = `Accept offer to buy "${name}" for ${priceSol} SOL${priceUsd ? ` (~$${priceUsd})` : ''}?`;
  if (!confirm(confirmMessage)) {
    return;
  }

  await handleAcceptOffer(offer);
}

// Handle accepting an offer
async function handleAcceptOffer(offer) {
  const offeredAsset = offer.offeredAssets && offer.offeredAssets[0];
  const name = offeredAsset?.metadata?.name || offeredAsset?.name || 'Unknown NFT';
  const priceSol = (parseInt(offer.requestedSol || '0') / 1e9).toFixed(4);

  try {
    addLog(`🛒 Accepting offer for ${name}...`, 'info');
    addLog(`   Price: ${priceSol} SOL`, 'info');

    // Step 1: Call accept offer API to get serialized transaction
    addLog('📝 Building swap transaction...', 'info');

    const acceptResponse = await fetch(`/api/swaps/offers/${offer.id}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `accept-${offer.id}-${Date.now()}`,
      },
      body: JSON.stringify({
        takerWallet: TAKER_ADDRESS,
      }),
    });

    const acceptResult = await acceptResponse.json();

    if (!acceptResult.success) {
      throw new Error(acceptResult.message || acceptResult.error || 'Failed to accept offer');
    }

    addLog('✓ Transaction built successfully', 'success');

    // Step 2: Execute the transaction via test endpoint
    addLog('🔐 Signing and executing swap transaction...', 'info');

    const execResponse = await fetch('/api/test/execute-swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Execution': 'true',
      },
      body: JSON.stringify({
        offerId: offer.id,
        serializedTransaction: acceptResult.data.transaction.serialized,
      }),
    });

    const execResult = await execResponse.json();

    if (!execResult.success) {
      throw new Error(execResult.error || 'Failed to execute swap transaction');
    }

    addLog(`✅ Swap completed successfully!`, 'success');
    addLog(`   TX: ${execResult.data.signature}`, 'success');

    // Refresh marketplace and wallets
    await loadMarketplaceListings();
    await loadWalletInfo('taker');
    await loadActiveListings();

  } catch (error) {
    console.error('Accept offer error:', error);
    addLog(`❌ Failed to accept offer: ${error.message}`, 'error');
  }
}

// Show buy confirmation modal
function showBuyModal(listingId) {
  const listing = marketplaceListings.find((l) => l.listingId === listingId);
  if (!listing) {
    addLog('❌ Listing not found', 'error');
    return;
  }

  selectedBuyListing = listing;

  // Check if taker wallet is loaded
  if (!takerData) {
    addLog('❌ Please load the Taker wallet first to buy listings', 'error');
    return;
  }

  // Populate modal
  const metadata = listing.metadata || {};
  const imageUrl = metadata.image || getPlaceholderImage(listing.assetId);
  const name = metadata.name || 'Unknown NFT';
  const priceLamports = parseInt(listing.priceLamports);
  const priceSol = priceLamports / 1e9;
  const feeBps = listing.feeBps || 100; // Default 1%
  const feeLamports = Math.floor((priceLamports * feeBps) / 10000);
  const feeSol = feeLamports / 1e9;
  const totalLamports = priceLamports; // Fee is included in price, not added
  const totalSol = totalLamports / 1e9;
  const sellerDisplay = `${listing.seller.substring(0, 8)}...${listing.seller.substring(
    listing.seller.length - 6
  )}`;

  // Update modal elements
  document.getElementById('buy-modal-image').src = imageUrl;
  document.getElementById('buy-modal-name').textContent = name;
  document.getElementById('buy-modal-seller').textContent = `Seller: ${sellerDisplay}`;
  document.getElementById('buy-listing-price').textContent = `${priceSol.toFixed(4)} SOL`;
  document.getElementById('buy-platform-fee').textContent = `${feeSol.toFixed(4)} SOL (included)`;
  document.getElementById('buy-total-cost').textContent = `${totalSol.toFixed(4)} SOL`;

  // Check balance
  const takerBalance = takerData.solBalance || 0;
  document.getElementById('buy-your-balance').textContent = `${takerBalance.toFixed(4)} SOL`;

  // Check if sufficient balance (add small buffer for network fees)
  const networkFeeBuffer = 0.001; // ~0.001 SOL for network fees
  const hasInsufficientBalance = takerBalance < totalSol + networkFeeBuffer;

  const balanceWarning = document.getElementById('buy-balance-warning');
  const confirmBtn = document.getElementById('buy-modal-confirm');

  if (hasInsufficientBalance) {
    balanceWarning.classList.remove('hidden');
    confirmBtn.disabled = true;
  } else {
    balanceWarning.classList.add('hidden');
    confirmBtn.disabled = false;
  }

  // Show modal
  document.getElementById('buy-modal').classList.add('show');
}

// Hide buy modal
function hideBuyModal() {
  document.getElementById('buy-modal').classList.remove('show');
  selectedBuyListing = null;
}

// Handle confirm purchase (uses swap offers accept endpoint)
async function handleConfirmPurchase() {
  if (!selectedBuyListing) {
    addLog('❌ No listing selected', 'error');
    return;
  }

  if (!TAKER_ADDRESS) {
    addLog('❌ Taker wallet not loaded', 'error');
    return;
  }

  const confirmBtn = document.getElementById('buy-modal-confirm');
  const originalText = confirmBtn.innerHTML;

  try {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '⏳ Processing...';

    const listingId = selectedBuyListing.listingId;
    const metadata = selectedBuyListing.metadata || {};
    const name = metadata.name || 'Unknown NFT';
    const priceSol = (parseInt(selectedBuyListing.priceLamports) / 1e9).toFixed(4);

    addLog(`🛒 Initiating purchase of ${name}...`, 'info');

    // Step 1: Accept the offer to get transaction
    addLog('Step 1: Accepting offer and building transaction...', 'info');
    const acceptResponse = await fetch(`/api/swaps/offers/${listingId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `accept-${listingId}-${Date.now()}`,
      },
      body: JSON.stringify({
        takerWallet: TAKER_ADDRESS,
      }),
    });

    const acceptResult = await acceptResponse.json();

    if (!acceptResult.success) {
      throw new Error(acceptResult.message || acceptResult.error || 'Failed to accept offer');
    }

    addLog('✓ Offer accepted, transaction built', 'success');

    // Step 2: Execute the transaction via test endpoint
    addLog('Step 2: Signing and executing transaction...', 'info');
    confirmBtn.innerHTML = '⏳ Signing...';

    // Get serialized transaction (handle both formats)
    const serializedTx = acceptResult.data.transaction?.serialized ||
                         acceptResult.data.transaction?.serializedTransaction;

    if (!serializedTx) {
      throw new Error('No transaction returned from accept endpoint');
    }

    const execResponse = await fetch('/api/test/execute-swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Execution': 'true',
      },
      body: JSON.stringify({
        offerId: listingId,
        serializedTransaction: serializedTx,
        requireSignatures: [MAKER_ADDRESS, TAKER_ADDRESS],
      }),
    });

    const execResult = await execResponse.json();

    if (!execResult.success) {
      throw new Error(execResult.error || 'Failed to execute swap transaction');
    }

    addLog(
      `✓ Transaction confirmed! TX: ${execResult.data.signature.substring(0, 20)}...`,
      'success'
    );

    // Step 3: Confirm the swap
    addLog('Step 3: Confirming swap...', 'info');
    confirmBtn.innerHTML = '⏳ Confirming...';

    const confirmResponse = await fetch(`/api/swaps/offers/${listingId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `confirm-swap-${listingId}-${Date.now()}`,
      },
      body: JSON.stringify({
        signature: execResult.data.signature,
        takerWallet: TAKER_ADDRESS,
      }),
    });

    const confirmResult = await confirmResponse.json();

    if (!confirmResult.success) {
      // Purchase may have succeeded even if confirmation fails
      addLog(
        `⚠️ Purchase executed but confirmation pending: ${confirmResult.message || 'Unknown'}`,
        'warning'
      );
    } else {
      addLog(`✅ Purchase confirmed! Asset is now in your wallet!`, 'success');
    }

    // Hide buy modal and show success modal
    hideBuyModal();
    showPurchaseSuccessModal(
      name,
      priceSol,
      execResult.data.signature,
      execResult.data.explorerUrl
    );

    // Refresh marketplace and taker wallet
    await loadMarketplaceListings();
    await loadWalletInfo('taker');
    await loadActiveListings();
  } catch (error) {
    console.error('Purchase error:', error);
    addLog(`❌ Purchase failed: ${error.message}`, 'error');

    // Check for specific error types
    if (error.message.includes('expected ACTIVE') || error.message.includes('no longer')) {
      addLog('💡 This listing may have already been sold or cancelled', 'info');
      await loadMarketplaceListings();
    }
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
  }
}

// Show purchase success modal
function showPurchaseSuccessModal(assetName, amountPaid, signature, explorerUrl) {
  document.getElementById('success-asset-name').textContent = assetName;
  document.getElementById('success-amount-paid').textContent = `${amountPaid} SOL`;

  const txLink = document.getElementById('success-transaction-link');
  const shortSig = `${signature.substring(0, 12)}...`;
  txLink.innerHTML = `<a href="${
    explorerUrl || `https://solscan.io/tx/${signature}?cluster=devnet`
  }" target="_blank" rel="noopener noreferrer">${shortSig}</a>`;

  document.getElementById('purchase-success-modal').classList.add('show');
}

// Hide purchase success modal
function hidePurchaseSuccessModal() {
  document.getElementById('purchase-success-modal').classList.remove('show');
}

// Override loadWalletInfo to also load marketplace
const originalLoadWalletInfoForMarketplace = loadWalletInfo;
loadWalletInfo = async function (wallet) {
  await originalLoadWalletInfoForMarketplace.call(this, wallet);

  // After any wallet loads, load marketplace (only once)
  if (wallet === 'taker' && marketplaceListings.length === 0) {
    loadMarketplaceListings();
  }
};

// Make marketplace functions available globally
window.showBuyModal = showBuyModal;
window.hideBuyModal = hideBuyModal;
window.loadMarketplaceListings = loadMarketplaceListings;

// ========================================
// CONFIRMATION MODAL ENHANCEMENTS (Task 19)
// ========================================

// Cancel Listing Modal State
let cancelListingData = null;

// Initialize enhanced modal features
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initializeEnhancedModals, 200);
});

function initializeEnhancedModals() {
  console.log('🔧 Initializing enhanced confirmation modals (Task 19)...');

  // Cancel Listing Modal handlers
  const cancelListingKeep = document.getElementById('cancel-listing-keep');
  if (cancelListingKeep) {
    cancelListingKeep.addEventListener('click', hideCancelListingModal);
  }

  const cancelListingConfirm = document.getElementById('cancel-listing-confirm');
  if (cancelListingConfirm) {
    cancelListingConfirm.addEventListener('click', handleConfirmCancelListing);
  }

  // Quick List price input handler for fee breakdown
  const quickListPrice = document.getElementById('quick-list-price');
  if (quickListPrice) {
    quickListPrice.addEventListener('input', updateQuickListFeeBreakdown);
  }

  // Add keyboard navigation (Escape to close modals)
  document.addEventListener('keydown', handleModalKeyboard);

  console.log('✅ Enhanced confirmation modals initialized');
}

// Keyboard navigation for modals
function handleModalKeyboard(e) {
  if (e.key === 'Escape') {
    // Close modals in order of z-index priority
    if (document.getElementById('cancel-listing-modal').classList.contains('show')) {
      hideCancelListingModal();
    } else if (document.getElementById('purchase-success-modal').classList.contains('show')) {
      hidePurchaseSuccessModal();
    } else if (document.getElementById('buy-modal').classList.contains('show')) {
      hideBuyModal();
    } else if (document.getElementById('quick-list-modal').classList.contains('show')) {
      hideQuickListModal();
    } else if (document.getElementById('confirm-modal').classList.contains('show')) {
      hideConfirmationModal();
    }
  }
}

// ========================================
// CANCEL LISTING MODAL FUNCTIONS
// ========================================

function showCancelListingModal(listingId) {
  const listing = activeListings.find((l) => l.listingId === listingId);
  if (!listing) {
    addLog('❌ Listing not found', 'error');
    return;
  }

  cancelListingData = listing;

  // Populate modal
  const metadata = listing.metadata || {};
  const imageUrl = metadata.image || getPlaceholderImage(listing.assetId);
  const name = metadata.name || 'Unknown NFT';
  const priceSol = (parseInt(listing.priceLamports) / 1e9).toFixed(4);

  document.getElementById('cancel-listing-image').src = imageUrl;
  document.getElementById('cancel-listing-name').textContent = name;
  document.getElementById('cancel-listing-price').textContent = `${priceSol} SOL`;

  // Reset modal state
  resetCancelListingModalState();

  // Show modal
  document.getElementById('cancel-listing-modal').classList.add('show');
}

function hideCancelListingModal() {
  document.getElementById('cancel-listing-modal').classList.remove('show');
  cancelListingData = null;
  resetCancelListingModalState();
}

function resetCancelListingModalState() {
  // Hide transaction status
  const txStatus = document.getElementById('cancel-listing-tx-status');
  if (txStatus) {
    txStatus.style.display = 'none';
  }

  // Show action buttons
  const actions = document.getElementById('cancel-listing-actions');
  if (actions) {
    actions.style.display = 'flex';
  }

  // Reset button states
  const confirmBtn = document.getElementById('cancel-listing-confirm');
  if (confirmBtn) {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Cancel Listing';
  }
}

function updateCancelListingTxStatus(status, title, message, link = null) {
  const txStatusEl = document.getElementById('cancel-listing-tx-status');
  const titleEl = document.getElementById('cancel-listing-status-title');
  const messageEl = document.getElementById('cancel-listing-status-message');
  const linkEl = document.getElementById('cancel-listing-status-link');

  if (!txStatusEl) return;

  // Remove all status classes
  txStatusEl.classList.remove('waiting', 'processing', 'confirming', 'success', 'error');
  txStatusEl.classList.add(status);

  // Update icon based on status
  const iconEl = txStatusEl.querySelector('.modal-tx-status-spinner, .modal-tx-status-icon');
  if (iconEl) {
    if (status === 'success') {
      iconEl.className = 'modal-tx-status-icon';
      iconEl.textContent = '✓';
    } else if (status === 'error') {
      iconEl.className = 'modal-tx-status-icon';
      iconEl.textContent = '✗';
    } else {
      iconEl.className = 'modal-tx-status-spinner';
      iconEl.textContent = '';
    }
  }

  titleEl.textContent = title;
  messageEl.textContent = message;

  if (link) {
    linkEl.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer">View Transaction</a>`;
  } else {
    linkEl.innerHTML = '';
  }

  txStatusEl.style.display = 'flex';
}

async function handleConfirmCancelListing() {
  if (!cancelListingData) {
    addLog('❌ No listing selected', 'error');
    return;
  }

  const listingId = cancelListingData.listingId;
  const confirmBtn = document.getElementById('cancel-listing-confirm');
  const actions = document.getElementById('cancel-listing-actions');

  try {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Processing...';

    // Show waiting status
    updateCancelListingTxStatus(
      'waiting',
      'Cancelling Listing',
      'Processing cancellation...'
    );

    addLog(`🔄 Cancelling listing ${listingId}...`, 'info');

    // Call cancel offer API (swap offers endpoint)
    const response = await fetch(`/api/swaps/offers/${listingId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `cancel-${listingId}-${Date.now()}`,
      },
      body: JSON.stringify({
        walletAddress: MAKER_ADDRESS,
      }),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || 'Failed to cancel listing');
    }

    // Show success
    updateCancelListingTxStatus(
      'success',
      'Listing Cancelled!',
      'Your listing has been removed.'
    );

    addLog(`✅ Listing cancelled successfully!`, 'success');

    // Hide action buttons on success
    actions.style.display = 'none';

    // Auto-close and refresh after delay
    setTimeout(async () => {
      hideCancelListingModal();
      await loadActiveListings();
      await loadMarketplaceListings();
      await loadWalletInfo('maker');
    }, 2000);
  } catch (error) {
    console.error('Cancel listing error:', error);
    addLog(`❌ Failed to cancel listing: ${error.message}`, 'error');

    updateCancelListingTxStatus('error', 'Cancellation Failed', error.message);

    // Add retry button
    const linkEl = document.getElementById('cancel-listing-status-link');
    if (linkEl) {
      linkEl.innerHTML = `<button class="modal-retry-btn" onclick="handleConfirmCancelListing()">Retry</button>`;
    }

    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Cancel Listing';
  }
}

// Override the old handleCancelListing to use the modal
const originalHandleCancelListing = handleCancelListing;
handleCancelListing = function (listingId) {
  showCancelListingModal(listingId);
};

// ========================================
// ENHANCED QUICK LIST MODAL FUNCTIONS
// ========================================

function updateQuickListFeeBreakdown() {
  const priceInput = document.getElementById('quick-list-price');
  const displayPrice = document.getElementById('quick-list-display-price');
  const feeDisplay = document.getElementById('quick-list-fee');
  const receiveDisplay = document.getElementById('quick-list-receive');

  if (!priceInput || !displayPrice) return;

  const price = parseFloat(priceInput.value) || 0;
  const fee = price * 0.01; // 1% fee
  const receive = price - fee;

  displayPrice.textContent = price > 0 ? `${price.toFixed(4)} SOL` : '-- SOL';
  feeDisplay.textContent = price > 0 ? `${fee.toFixed(4)} SOL` : '-- SOL';
  receiveDisplay.textContent = price > 0 ? `${receive.toFixed(4)} SOL` : '-- SOL';

  // Also update USD if available
  updateQuickListPriceDisplay();
}

function updateQuickListTxStatus(status, title, message, link = null) {
  const txStatusEl = document.getElementById('quick-list-tx-status');
  const titleEl = document.getElementById('quick-list-status-title');
  const messageEl = document.getElementById('quick-list-status-message');
  const linkEl = document.getElementById('quick-list-status-link');

  if (!txStatusEl) return;

  // Remove all status classes
  txStatusEl.classList.remove('waiting', 'processing', 'confirming', 'success', 'error');
  txStatusEl.classList.add(status);

  // Update icon based on status
  const iconEl = txStatusEl.querySelector('.modal-tx-status-spinner, .modal-tx-status-icon');
  if (iconEl) {
    if (status === 'success') {
      iconEl.className = 'modal-tx-status-icon';
      iconEl.textContent = '✓';
    } else if (status === 'error') {
      iconEl.className = 'modal-tx-status-icon';
      iconEl.textContent = '✗';
    } else {
      iconEl.className = 'modal-tx-status-spinner';
      iconEl.textContent = '';
    }
  }

  titleEl.textContent = title;
  messageEl.textContent = message;

  if (link) {
    linkEl.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer">View Transaction</a>`;
  } else {
    linkEl.innerHTML = '';
  }

  txStatusEl.style.display = 'flex';
}

// Override handleQuickListConfirm with enhanced version using swap offers API
const originalHandleQuickListConfirm = handleQuickListConfirm;
handleQuickListConfirm = async function () {
  if (!quickListAsset) {
    addLog('❌ No asset selected', 'error');
    return;
  }

  const priceInput = document.getElementById('quick-list-price');
  const price = parseFloat(priceInput.value);

  if (!price || price <= 0) {
    addLog('❌ Please enter a valid price', 'error');
    return;
  }

  const confirmBtn = document.getElementById('quick-list-confirm');
  const actions = document.getElementById('quick-list-actions');
  const originalText = confirmBtn.innerHTML;

  try {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = 'Processing...';

    // Show waiting status
    updateQuickListTxStatus('waiting', 'Creating Listing', 'Creating swap offer...');

    // Get optional private wallet for private sale
    const privateWalletInput = document.getElementById('quick-list-private-wallet');
    const privateWallet = privateWalletInput ? privateWalletInput.value.trim() : '';

    const listingType = privateWallet ? 'private' : 'open';
    addLog(`📝 Creating ${listingType} listing for ${quickListAsset.name}...`, 'info');

    // Convert SOL to lamports
    const priceLamports = Math.floor(price * 1e9);

    // Determine asset type
    let assetType = 'NFT';
    if (quickListAsset.isCompressed) {
      assetType = 'CNFT';
    } else if (quickListAsset.isCoreNft) {
      assetType = 'CORE_NFT';
    }

    // Build offer request - NFT for SOL (open swap offer)
    const offerRequest = {
      makerWallet: MAKER_ADDRESS,
      offeredAssets: [
        {
          identifier: quickListAsset.mint,
          type: assetType,
        },
      ],
      requestedAssets: [],
      requestedSol: priceLamports.toString(),
      durationSeconds: quickListDuration,
    };

    // Add taker wallet if private sale
    if (privateWallet) {
      offerRequest.takerWallet = privateWallet;
    }

    // Call create offer API (swap offers endpoint)
    const response = await fetch('/api/swaps/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `quick-listing-${Date.now()}-${quickListAsset.mint.substring(0, 8)}`,
      },
      body: JSON.stringify(offerRequest),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.message || result.error || 'Failed to create listing');
    }

    const offerId = result.data.offer?.id || result.data.offerId;
    addLog(`✓ Listing created! Offer ID: ${offerId}`, 'success');

    if (privateWallet) {
      addLog(`🔒 Private sale - only ${privateWallet.substring(0, 8)}... can buy`, 'info');
    } else {
      addLog(`🌐 Open listing - anyone can buy or make counter offers`, 'info');
    }

    // Show success status
    updateQuickListTxStatus(
      'success',
      'Listing Active!',
      'Your asset is now listed for sale.'
    );
    addLog(`✅ Listing is now ACTIVE!`, 'success');

    // Hide action buttons on success
    actions.style.display = 'none';

    // Auto-close and refresh after delay
    setTimeout(async () => {
      hideQuickListModal();
      await loadActiveListings();
      await loadMarketplaceListings();
      await loadWalletInfo('maker');
    }, 2000);
  } catch (error) {
    console.error('Quick list error:', error);
    addLog(`❌ Failed to create listing: ${error.message}`, 'error');

    updateQuickListTxStatus('error', 'Listing Failed', error.message);

    // Add retry button
    const linkEl = document.getElementById('quick-list-status-link');
    if (linkEl) {
      linkEl.innerHTML = `<button class="modal-retry-btn" onclick="handleQuickListConfirm()">Retry</button>`;
    }

    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
  }
};

// Reset quick list modal state when showing
const originalShowQuickListModal = showQuickListModal;
showQuickListModal = function (nft) {
  originalShowQuickListModal.call(this, nft);

  // Reset transaction status
  const txStatus = document.getElementById('quick-list-tx-status');
  if (txStatus) {
    txStatus.style.display = 'none';
  }

  // Show action buttons
  const actions = document.getElementById('quick-list-actions');
  if (actions) {
    actions.style.display = 'flex';
  }

  // Update fee breakdown
  updateQuickListFeeBreakdown();
};

// ========================================
// ENHANCED BUY MODAL FUNCTIONS
// ========================================

function updateBuyTxStatus(status, title, message, link = null) {
  const txStatusEl = document.getElementById('buy-tx-status');
  const titleEl = document.getElementById('buy-status-title');
  const messageEl = document.getElementById('buy-status-message');
  const linkEl = document.getElementById('buy-status-link');

  if (!txStatusEl) return;

  // Remove all status classes
  txStatusEl.classList.remove('waiting', 'processing', 'confirming', 'success', 'error');
  txStatusEl.classList.add(status);

  // Update icon based on status
  const iconEl = txStatusEl.querySelector('.modal-tx-status-spinner, .modal-tx-status-icon');
  if (iconEl) {
    if (status === 'success') {
      iconEl.className = 'modal-tx-status-icon';
      iconEl.textContent = '✓';
    } else if (status === 'error') {
      iconEl.className = 'modal-tx-status-icon';
      iconEl.textContent = '✗';
    } else {
      iconEl.className = 'modal-tx-status-spinner';
      iconEl.textContent = '';
    }
  }

  titleEl.textContent = title;
  messageEl.textContent = message;

  if (link) {
    linkEl.innerHTML = `<a href="${link}" target="_blank" rel="noopener noreferrer">View Transaction</a>`;
  } else {
    linkEl.innerHTML = '';
  }

  txStatusEl.style.display = 'flex';
}

// Override showBuyModal to add balance after purchase
const originalShowBuyModal = showBuyModal;
showBuyModal = function (listingId) {
  const listing = marketplaceListings.find((l) => l.listingId === listingId);
  if (!listing) {
    addLog('❌ Listing not found', 'error');
    return;
  }

  selectedBuyListing = listing;

  // Check if taker wallet is loaded
  if (!takerData) {
    addLog('❌ Please load the Taker wallet first to buy listings', 'error');
    return;
  }

  // Populate modal
  const metadata = listing.metadata || {};
  const imageUrl = metadata.image || getPlaceholderImage(listing.assetId);
  const name = metadata.name || 'Unknown NFT';
  const priceLamports = parseInt(listing.priceLamports);
  const priceSol = priceLamports / 1e9;
  const feeBps = listing.feeBps || 100; // Default 1%
  const feeLamports = Math.floor((priceLamports * feeBps) / 10000);
  const feeSol = feeLamports / 1e9;
  const totalLamports = priceLamports; // Fee is included in price, not added
  const totalSol = totalLamports / 1e9;
  const sellerDisplay = `${listing.seller.substring(0, 8)}...${listing.seller.substring(
    listing.seller.length - 6
  )}`;

  // Update modal elements
  document.getElementById('buy-modal-image').src = imageUrl;
  document.getElementById('buy-modal-name').textContent = name;
  document.getElementById('buy-modal-seller').textContent = `Seller: ${sellerDisplay}`;
  document.getElementById('buy-listing-price').textContent = `${priceSol.toFixed(4)} SOL`;
  document.getElementById('buy-platform-fee').textContent = `${feeSol.toFixed(4)} SOL (included)`;
  document.getElementById('buy-total-cost').textContent = `${totalSol.toFixed(4)} SOL`;

  // Check balance
  const takerBalance = takerData.solBalance || 0;
  document.getElementById('buy-your-balance').textContent = `${takerBalance.toFixed(4)} SOL`;

  // Calculate and show balance after purchase
  const networkFeeBuffer = 0.001; // ~0.001 SOL for network fees
  const balanceAfter = takerBalance - totalSol - networkFeeBuffer;
  const balanceAfterEl = document.getElementById('buy-balance-after');
  const balanceAfterValue = document.getElementById('buy-balance-after-value');

  if (balanceAfterValue) {
    balanceAfterValue.textContent = `${Math.max(0, balanceAfter).toFixed(4)} SOL`;
  }

  // Style balance after based on remaining amount
  if (balanceAfterEl) {
    balanceAfterEl.classList.remove('warning', 'danger');
    if (balanceAfter < 0) {
      balanceAfterEl.classList.add('danger');
    } else if (balanceAfter < 0.01) {
      balanceAfterEl.classList.add('warning');
    }
  }

  // Check if sufficient balance
  const hasInsufficientBalance = takerBalance < totalSol + networkFeeBuffer;

  const balanceWarning = document.getElementById('buy-balance-warning');
  const confirmBtn = document.getElementById('buy-modal-confirm');

  if (hasInsufficientBalance) {
    balanceWarning.classList.remove('hidden');
    confirmBtn.disabled = true;
  } else {
    balanceWarning.classList.add('hidden');
    confirmBtn.disabled = false;
  }

  // Reset transaction status
  const txStatus = document.getElementById('buy-tx-status');
  if (txStatus) {
    txStatus.style.display = 'none';
  }

  // Show action buttons
  const actions = document.getElementById('buy-modal-actions');
  if (actions) {
    actions.style.display = 'flex';
  }

  // Show modal
  document.getElementById('buy-modal').classList.add('show');
};

// Override handleConfirmPurchase with enhanced version using swap offers API
const originalHandleConfirmPurchase = handleConfirmPurchase;
handleConfirmPurchase = async function () {
  if (!selectedBuyListing) {
    addLog('❌ No listing selected', 'error');
    return;
  }

  if (!TAKER_ADDRESS) {
    addLog('❌ Taker wallet not loaded', 'error');
    return;
  }

  const confirmBtn = document.getElementById('buy-modal-confirm');
  const actions = document.getElementById('buy-modal-actions');
  const originalText = confirmBtn.innerHTML;

  try {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = 'Processing...';

    const listingId = selectedBuyListing.listingId;
    const metadata = selectedBuyListing.metadata || {};
    const name = metadata.name || 'Unknown NFT';
    const priceSol = (parseInt(selectedBuyListing.priceLamports) / 1e9).toFixed(4);

    // Show waiting status
    updateBuyTxStatus('waiting', 'Accepting Offer', 'Building purchase transaction...');

    addLog(`🛒 Initiating purchase of ${name}...`, 'info');

    // Step 1: Accept the offer to get transaction
    addLog('Step 1: Accepting offer and building transaction...', 'info');
    const acceptResponse = await fetch(`/api/swaps/offers/${listingId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `accept-${listingId}-${Date.now()}`,
      },
      body: JSON.stringify({
        takerWallet: TAKER_ADDRESS,
      }),
    });

    const acceptResult = await acceptResponse.json();

    if (!acceptResult.success) {
      throw new Error(acceptResult.message || acceptResult.error || 'Failed to accept offer');
    }

    addLog('✓ Offer accepted, transaction built', 'success');

    // Step 2: Execute the transaction via test endpoint
    updateBuyTxStatus('processing', 'Signing Transaction', 'Please confirm in your wallet...');

    addLog('Step 2: Signing and executing transaction...', 'info');

    // Get serialized transaction (handle both formats)
    const serializedTx = acceptResult.data.transaction?.serialized ||
                         acceptResult.data.transaction?.serializedTransaction;

    if (!serializedTx) {
      throw new Error('No transaction returned from accept endpoint');
    }

    const execResponse = await fetch('/api/test/execute-swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Test-Execution': 'true',
      },
      body: JSON.stringify({
        offerId: listingId,
        serializedTransaction: serializedTx,
        requireSignatures: [MAKER_ADDRESS, TAKER_ADDRESS],
      }),
    });

    const execResult = await execResponse.json();

    if (!execResult.success) {
      throw new Error(execResult.error || 'Failed to execute swap transaction');
    }

    addLog(
      `✓ Transaction confirmed! TX: ${execResult.data.signature.substring(0, 20)}...`,
      'success'
    );

    // Step 3: Confirm the swap
    updateBuyTxStatus('confirming', 'Confirming Swap', 'Verifying asset transfer...');

    addLog('Step 3: Confirming swap...', 'info');

    const confirmResponse = await fetch(`/api/swaps/offers/${listingId}/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'idempotency-key': `confirm-swap-${listingId}-${Date.now()}`,
      },
      body: JSON.stringify({
        signature: execResult.data.signature,
        takerWallet: TAKER_ADDRESS,
      }),
    });

    const confirmResult = await confirmResponse.json();

    if (!confirmResult.success) {
      addLog(
        `⚠️ Purchase executed but confirmation pending: ${confirmResult.message || 'Unknown'}`,
        'warning'
      );
    } else {
      addLog(`✅ Purchase confirmed! Asset is now in your wallet!`, 'success');
    }

    // Build explorer URL
    const isDevnet =
      window.location.hostname.includes('staging') ||
      window.location.hostname.includes('dev') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';
    const explorerUrl =
      execResult.data.explorerUrl ||
      `https://solscan.io/tx/${execResult.data.signature}${isDevnet ? '?cluster=devnet' : ''}`;

    updateBuyTxStatus(
      'success',
      'Purchase Complete!',
      'The NFT is now in your wallet.',
      explorerUrl
    );

    // Hide action buttons on success
    actions.style.display = 'none';

    // Auto-close and show success modal after delay
    setTimeout(async () => {
      hideBuyModal();
      showPurchaseSuccessModal(name, priceSol, execResult.data.signature, explorerUrl);
      await loadMarketplaceListings();
      await loadWalletInfo('taker');
      await loadActiveListings();
    }, 1500);
  } catch (error) {
    console.error('Purchase error:', error);
    addLog(`❌ Purchase failed: ${error.message}`, 'error');

    updateBuyTxStatus('error', 'Purchase Failed', error.message);

    // Add retry button
    const linkEl = document.getElementById('buy-status-link');
    if (linkEl) {
      linkEl.innerHTML = `<button class="modal-retry-btn" onclick="handleConfirmPurchase()">Retry</button>`;
    }

    // Check for specific error types
    if (error.message.includes('expected ACTIVE') || error.message.includes('no longer')) {
      addLog('💡 This listing may have already been sold or cancelled', 'info');
      setTimeout(() => loadMarketplaceListings(), 2000);
    }

    confirmBtn.disabled = false;
    confirmBtn.innerHTML = originalText;
  }
};

// Make enhanced modal functions available globally
window.showCancelListingModal = showCancelListingModal;
window.hideCancelListingModal = hideCancelListingModal;
window.handleConfirmCancelListing = handleConfirmCancelListing;
window.handleQuickListConfirm = handleQuickListConfirm;
