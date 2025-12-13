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
        unlockButton.addEventListener('click', function() {
            console.log('Unlock button clicked');
            checkPassword();
        });

        // Allow Enter key to submit
        passwordInput.addEventListener('keypress', function(e) {
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
const AVATAR_STYLES = ['adventurer', 'avataaars', 'bottts', 'fun-emoji', 'lorelei', 'notionists', 'pixel-art', 'thumbs'];
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


// Get image for any NFT (uses placeholder for cNFTs, metadata for others)
function getNftImage(nft) {
    // For cNFTs, ALWAYS use placeholder images (metadata URIs are often fake/broken in test env)
    if (nft.isCompressed && nft.mint) {
        return getPlaceholderImage(nft.mint);
    }
    
    // For regular NFTs, use their metadata image if available
    if (nft.image && !nft.image.includes('No Image')) {
        return nft.image;
    }
    
    // Fallback to placeholder based on mint
    if (nft.mint) {
        return getPlaceholderImage(nft.mint);
    }
    
    return null;
}

// Preload placeholder images for cNFTs
async function preloadAnimalImages(nfts) {
    const cnftsNeedingImages = nfts.filter(nft => nft.isCompressed);
    
    if (cnftsNeedingImages.length === 0) return;
    
    console.log(`🎨 Preloading ${cnftsNeedingImages.length} placeholder images for cNFTs...`);
    
    // Assign images to all cNFTs (this stores them in localStorage)
    cnftsNeedingImages.forEach(nft => {
        if (nft.mint) {
            getPlaceholderImage(nft.mint);
        }
    });
}

// Fetch SOL price in USD
async function fetchSOLPrice() {
    try {
        console.log('🔄 Fetching SOL price from CoinGecko...');
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
        
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
    const isDevnet = hostname.includes('staging') || 
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
            const isDevnet = window.location.hostname.includes('staging') || 
                           window.location.hostname.includes('dev') ||
                           window.location.hostname === 'localhost' ||
                           window.location.hostname === '127.0.0.1';
            const solscanCluster = isDevnet ? '?cluster=devnet' : '';
            
            document.getElementById('maker-address').innerHTML = 
                `<a href="https://solscan.io/account/${MAKER_ADDRESS}${solscanCluster}" target="_blank" rel="noopener noreferrer">${MAKER_ADDRESS}</a>`;
            document.getElementById('taker-address').innerHTML = 
                `<a href="https://solscan.io/account/${TAKER_ADDRESS}${solscanCluster}" target="_blank" rel="noopener noreferrer">${TAKER_ADDRESS}</a>`;
            
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
    
    // Setup swap button event listener
    document.getElementById('swap-btn').addEventListener('click', showConfirmationModal);
    
    // Setup modal button event listeners
    document.getElementById('modal-cancel').addEventListener('click', hideConfirmationModal);
    document.getElementById('modal-confirm').addEventListener('click', confirmAndExecuteSwap);
    
    // Setup filter button event listeners
    document.querySelectorAll('.filter-btn').forEach(btn => {
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
    document.querySelectorAll(`.filter-btn[data-wallet="${wallet}"]`).forEach(b => {
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
            const cNfts = data.data.nfts.filter(n => n.isCompressed);
            const coreNfts = data.data.nfts.filter(n => n.isCoreNft);
            const splNfts = data.data.nfts.filter(n => !n.isCompressed && !n.isCoreNft);
            console.log(`🔍 [Maker] Received NFTs from backend:`, {
                cNfts: cNfts.length,
                coreNfts: coreNfts.length,
                splNfts: splNfts.length,
            });
            [...cNfts, ...coreNfts].forEach(nft => {
                console.log(`   - ${nft.name}: ${nft.mint} (${nft.isCoreNft ? 'Core' : 'cNFT'})`);
            });
        } else {
            takerData = data.data;
            const cNfts = data.data.nfts.filter(n => n.isCompressed);
            const coreNfts = data.data.nfts.filter(n => n.isCoreNft);
            const splNfts = data.data.nfts.filter(n => !n.isCompressed && !n.isCoreNft);
            console.log(`🔍 [Taker] Received NFTs from backend:`, {
                cNfts: cNfts.length,
                coreNfts: coreNfts.length,
                splNfts: splNfts.length,
            });
            [...cNfts, ...coreNfts].forEach(nft => {
                console.log(`   - ${nft.name}: ${nft.mint} (${nft.isCoreNft ? 'Core' : 'cNFT'})`);
            });
        }

        // Update balance
        balanceDisplay.textContent = `${data.data.solBalance.toFixed(4)} SOL`;

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
        filteredNfts = nfts.filter(nft => !nft.isCompressed && !nft.isCoreNft);
    } else if (filter === 'cnft') {
        // Only show compressed NFTs (cNFTs)
        filteredNfts = nfts.filter(nft => nft.isCompressed);
    } else if (filter === 'core') {
        // Only show Metaplex Core NFTs
        filteredNfts = nfts.filter(nft => nft.isCoreNft);
    }
    
    // Apply search filter
    if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        filteredNfts = filteredNfts.filter(nft => {
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

    const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect fill=\'%23ddd\' width=\'100\' height=\'100\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-family=\'Arial\' font-size=\'14\'%3ENo Image%3C/text%3E%3C/svg%3E';
    
    // Preload animal images for cNFTs without images
    preloadAnimalImages(filteredNfts);
    
    container.innerHTML = filteredNfts.map((nft, index) => {
        // Find original index in unfiltered array for toggle functionality
        const originalIndex = nfts.findIndex(n => n.mint === nft.mint);
        // Get image - uses animal API for cNFTs
        let imageUrl = getNftImage(nft);
        
        // Debug: log what image URL we're using for cNFTs
        if (nft.isCompressed) {
            console.log(`📷 cNFT ${nft.mint.substring(0, 8)}: isCompressed=${nft.isCompressed}, imageUrl=${imageUrl?.substring(0, 50)}...`);
        }
        
        // Use placeholder if no image
        if (!imageUrl) {
            imageUrl = placeholderSvg;
        }
        
        // Store mint for fallback animal image generation
        return `
            <div class="nft-card" data-index="${originalIndex}">
                <img class="nft-image" 
                     src="${imageUrl}" 
                     alt="${nft.name}"
                     data-mint="${nft.mint}"
                     data-fallback="${placeholderSvg}">
                <div class="nft-name">${nft.name || 'Unknown NFT'}</div>
                <div class="nft-type">${getNftTypeLabel(nft)}</div>
                <div class="nft-mint">${nft.mint.substring(0, 8)}...</div>
            </div>
        `;
    }).join('');
    
    // Add CSP-compliant error handlers - use placeholder image as fallback for ALL NFTs
    container.querySelectorAll('.nft-image').forEach(img => {
        img.addEventListener('error', function() {
            const mint = this.dataset.mint;
            if (mint) {
                // Use placeholder image as fallback
                const placeholderUrl = getPlaceholderImage(mint);
                console.log(`🎨 Image failed, using placeholder for ${mint.substring(0, 8)}...`);
                this.src = placeholderUrl;
            } else {
                this.src = this.dataset.fallback;
            }
        }, { once: true }); // Only fire once to prevent infinite loops
    });
}

// Toggle NFT selection
function toggleNFT(wallet, index) {
    const nfts = wallet === 'maker' ? makerData.nfts : takerData.nfts;
    const selectedArray = wallet === 'maker' ? selectedMakerNFTs : selectedTakerNFTs;
    const nft = nfts[index];

    const selectedIndex = selectedArray.findIndex(n => n.mint === nft.mint);
    
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
        const isSelected = selectedArray.some(n => n.mint === nft.mint);
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
    filterButtons.forEach(btn => {
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
    return nfts.some(nft => nft.isCompressed);
}

// Count cNFTs in selection
function countCNFTs(nfts) {
    return nfts.filter(nft => nft.isCompressed).length;
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
    
    if (swapType.type === 'atomic') {
        modalTitle.innerHTML = '⚡ Confirm Atomic Swap';
        modalSubtitle.textContent = 'Review the swap details before executing';
        swapTypeTitle.innerHTML = '<span class="atomic-swap-badge">⚡ Atomic Swap</span>';
        executionType.textContent = 'Single Transaction';
        jitoInfo.style.display = 'none';
    } else if (swapType.type === 'cnft-single') {
        modalTitle.innerHTML = '🌳 Confirm cNFT Swap';
        modalSubtitle.textContent = 'This swap involves compressed NFTs';
        swapTypeTitle.innerHTML = '<span class="cnft-swap-badge">🌳 cNFT Swap</span>';
        executionType.textContent = 'Single Transaction (with Merkle proofs)';
        jitoInfo.style.display = 'none';
    } else if (swapType.type === 'cnft-bundle') {
        const totalCNFTs = countCNFTs(selectedMakerNFTs) + countCNFTs(selectedTakerNFTs);
        const estimatedTxCount = Math.ceil(totalCNFTs / 2) + 1; // +1 for payment/cleanup
        
        modalTitle.innerHTML = '🚀 Confirm cNFT Bulk Swap';
        modalSubtitle.textContent = 'This swap requires multiple transactions via Jito bundle';
        swapTypeTitle.innerHTML = '<span class="cnft-swap-badge">🚀 cNFT Bulk Swap</span>';
        executionType.textContent = `Jito Bundle (${estimatedTxCount} transactions)`;
        jitoInfo.style.display = 'block';
        document.getElementById('modal-jito-tx-count').textContent = `${estimatedTxCount} Transactions`;
        document.getElementById('modal-jito-tip').textContent = 'Calculating...';
        document.getElementById('modal-bundle-strategy').textContent = 'Atomic execution via Jito Block Engine';
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
        selectedMakerNFTs.forEach(nft => {
            const card = document.createElement('div');
            card.className = 'nft-preview-card';
            
            const img = document.createElement('img');
            img.className = 'nft-preview-image';
            // Use NFT image or placeholder
            img.src = getNftImage(nft) || getPlaceholderImage(nft.mint);
            img.alt = nft.name || 'Unknown NFT';
            img.dataset.mint = nft.mint; // Store mint for fallback
            // Add error handler for fallback
            img.addEventListener('error', function() {
                this.src = getPlaceholderImage(this.dataset.mint);
            }, { once: true });
            
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
        selectedTakerNFTs.forEach(nft => {
            const card = document.createElement('div');
            card.className = 'nft-preview-card';
            
            const img = document.createElement('img');
            img.className = 'nft-preview-image';
            // Use NFT image or placeholder
            img.src = getNftImage(nft) || getPlaceholderImage(nft.mint);
            img.alt = nft.name || 'Unknown NFT';
            img.dataset.mint = nft.mint; // Store mint for fallback
            // Add error handler for fallback
            img.addEventListener('error', function() {
                this.src = getPlaceholderImage(this.dataset.mint);
            }, { once: true });
            
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
            makerAssets: makerNFTs.map(nft => ({
                mint: nft.mint,
                isCompressed: nft.isCompressed || false,
                isCoreNft: nft.isCoreNft || false,
                name: nft.name,
                image: nft.image,
            })),
            takerAssets: takerNFTs.map(nft => ({
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
            document.getElementById('modal-est-time').textContent = quote.estimatedTime?.display || '~5 seconds';
            
            // Update network fees
            document.getElementById('modal-network-fees').textContent = quote.networkFee?.display || '~0.00002 SOL';
            
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
            if (quote.bulkSwap && quote.bulkSwap.isBulkSwap) {
                jitoInfo.style.display = 'block';
                document.getElementById('modal-jito-tx-count').textContent = `${quote.bulkSwap.transactionCount} Transactions`;
                
                // Format Jito tip
                if (quote.bulkSwap.estimatedTipLamports) {
                    const tipSol = (parseInt(quote.bulkSwap.estimatedTipLamports) / 1e9).toFixed(6);
                    document.getElementById('modal-jito-tip').textContent = `~${tipSol} SOL`;
                }
                
                // Update execution type
                document.getElementById('modal-execution-type').textContent = 
                    `Jito Bundle (${quote.bulkSwap.transactionCount} txs)`;
                
                // Update bundle strategy based on response
                const strategy = quote.bulkSwap.strategy || 'JITO_BUNDLE';
                document.getElementById('modal-bundle-strategy').textContent = 
                    strategy === 'JITO_BUNDLE' ? 'Atomic execution via Jito Block Engine' : strategy;
            } else if (quote.isCnftSwap) {
                // Single-transaction cNFT swap
                document.getElementById('modal-execution-type').textContent = 'Single Transaction (with Merkle proofs)';
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
                    quote.warnings.forEach(warning => {
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
                    const savings = txSize.altSavings || (txSize.estimated - txSize.estimatedWithALT);
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
                
                // Add cNFT proof details if available
                if (txSize.cnftProofDetails && txSize.cnftProofDetails.length > 0) {
                    const proofDetails = txSize.cnftProofDetails;
                    const allFetched = proofDetails.every(d => d.fetched);
                    const statusIcon = allFetched ? '✅' : '⚠️';
                    const statusLabel = allFetched ? 'Verified' : 'Estimated';
                    
                    html += `
                        <div class="cnft-proof-details" style="font-size: 0.75rem; color: #666; margin-top: 8px; padding: 8px; background: ${allFetched ? '#f0fdf4' : '#fefce8'}; border: 1px solid ${allFetched ? '#86efac' : '#fde047'}; border-radius: 6px;">
                            <div style="font-weight: 600; margin-bottom: 4px; color: ${allFetched ? '#166534' : '#854d0e'};">
                                ${statusIcon} cNFT Proof Data (${statusLabel})
                            </div>
                    `;
                    
                    for (const detail of proofDetails) {
                        const side = detail.side === 'maker' ? '📤' : '📥';
                        const shortId = detail.assetId.slice(0, 8) + '...' + detail.assetId.slice(-4);
                        const canopyInfo = detail.canopyDepth !== null ? ` (canopy: ${detail.canopyDepth})` : '';
                        const fetchIcon = detail.fetched ? '✓' : '?';
                        
                        html += `
                            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                <span>${side} ${shortId}</span>
                                <span style="font-weight: 500;">${fetchIcon} ${detail.proofNodes} proof nodes${canopyInfo}</span>
                            </div>
                        `;
                    }
                    
                    // Add explanation about proof nodes
                    const totalNodes = proofDetails.reduce((sum, d) => sum + d.proofNodes, 0);
                    if (totalNodes > 7) {
                        html += `
                            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid ${allFetched ? '#86efac' : '#fde047'}; color: #991b1b; font-size: 0.7rem;">
                                ⚠️ ${totalNodes} total proof nodes exceeds the ~7 node limit for atomic swaps
                            </div>
                        `;
                    } else if (totalNodes > 5) {
                        html += `
                            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid ${allFetched ? '#86efac' : '#fde047'}; color: #b45309; font-size: 0.7rem;">
                                ⚠️ ${totalNodes} proof nodes is near the limit (~7 max for atomic swaps)
                            </div>
                        `;
                    }
                    
                    html += '</div>';
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
        const response = await fetch(`/api/offers/${offerId}/accept`, {
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
        if (attempt < 2) {
            addLog(`⚠️  Attempt ${attempt} failed, retrying...`, 'warning');
            await new Promise(resolve => setTimeout(resolve, 200));
            return acceptOfferWithRetry(offerId, attempt + 1);
        }
        throw error;
    }
}

// Helper: Execute swap with retry for stale proofs
async function executeSwapWithRetry(offerId, acceptData, isBulkSwap = false, bulkSwapInfo = null) {
    // Build request body
    const requestBody = {
        serializedTransaction: acceptData.data.transaction.serialized,
        requireSignatures: [MAKER_ADDRESS, TAKER_ADDRESS],
        offerId: offerId, // Backend uses this for automatic retry with fresh proofs
    };
    
    // Add bulk swap info if available
    if (isBulkSwap && bulkSwapInfo) {
        requestBody.isBulkSwap = true;
        requestBody.bulkSwapInfo = {
            transactionCount: bulkSwapInfo.transactionCount,
            strategy: bulkSwapInfo.strategy,
            requiresJitoBundle: bulkSwapInfo.requiresJitoBundle,
            transactions: bulkSwapInfo.transactions?.map(tx => ({
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
        swapBtn.innerHTML = '⏳ Jito Bundle In-Progress...';
    } else if (swapType && swapType.type.startsWith('cnft')) {
        swapBtn.innerHTML = '⏳ cNFT Swap In-Progress...';
    } else {
        swapBtn.innerHTML = '⏳ Swap In-Progress...';
    }
    swapBtn.style.animation = 'pulse 1.5s ease-in-out infinite';

    try {
        // Use confirmed parameters passed from modal
        const { offeredSol, requestedSol, selectedMakerNFTs: confirmedMakerNFTs, selectedTakerNFTs: confirmedTakerNFTs } = params;

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
            total: 0
        };

        // Step 1: Create offer
        addLog('Step 1: Creating swap offer...', 'info');
        const createStartTime = performance.now();
        
        // Build request payload
        const requestPayload = {
            makerWallet: MAKER_ADDRESS,
            takerWallet: TAKER_ADDRESS,
            offeredAssets: confirmedMakerNFTs.map(nft => ({
                mint: nft.mint,
                isCompressed: nft.isCompressed || false,
                isCoreNft: nft.isCoreNft || false,
            })),
            requestedAssets: confirmedTakerNFTs.map(nft => ({
                mint: nft.mint,
                isCompressed: nft.isCompressed || false,
                isCoreNft: nft.isCoreNft || false,
            })),
            offeredSol: offeredSol ? Math.round(parseFloat(offeredSol) * 1e9).toString() : undefined,
            requestedSol: requestedSol ? Math.round(parseFloat(requestedSol) * 1e9).toString() : undefined,
        };
        
        // Debug: Log exact payload being sent to backend
        console.log('📤 [Swap] Sending to backend:', requestPayload);
        console.log('📤 [Swap] Offered assets details:');
        requestPayload.offeredAssets.forEach((asset, i) => {
            const typeLabel = asset.isCoreNft ? 'Core' : (asset.isCompressed ? 'cNFT' : 'SPL');
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
        
        const createResponse = await fetch('/api/offers', {
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
                    addLog(`   🔗 TX ${idx + 1}: <a href="${executeData.data.explorerUrl || `https://solscan.io/tx/${sig}?cluster=devnet`}" target="_blank" style="color: #22c55e;">${sig.substring(0, 20)}...</a>`, 'success');
                });
            }
        } else {
            addLog('✅ Transaction confirmed on blockchain!', 'success');
        }
        
        addLog(`🔗 Signature: <a href="${executeData.data.explorerUrl}" target="_blank" rel="noopener noreferrer" style="color: #22c55e; text-decoration: underline;">${executeData.data.signature}</a>`, 'success');

        // Fetch transaction fee from blockchain
        let blockchainFee = null;
        try {
            const feeResponse = await fetch(`/api/test/transaction-fee?signature=${executeData.data.signature}`);
            const feeData = await feeResponse.json();
            if (feeData.success && feeData.data.fee) {
                blockchainFee = feeData.data.fee; // Fee in lamports
                const feeSol = (blockchainFee / 1e9).toFixed(6);
                const feeUsd = solPriceUSD ? ` (~$${(blockchainFee / 1e9 * solPriceUSD).toFixed(4)} USD)` : '';
                addLog(`💸 Blockchain fee: ${feeSol} SOL${feeUsd}`, 'info');
            }
        } catch (feeError) {
            console.warn('Could not fetch transaction fee:', feeError);
        }

        // Calculate total execution time
        const endTime = performance.now();
        const executionTimeMs = endTime - startTime;
        const executionTimeSec = (executionTimeMs / 1000).toFixed(2);
        timings.total = executionTimeSec;

        addLog(`⚡ Total time: ${executionTimeSec}s (Create: ${timings.create}s, Accept: ${timings.accept}s, Execute: ${timings.execute}s)`, 'success');

        // Show transaction summary (pass confirmed params + execution data + timings + fee + bulk info)
        showTransactionSummary(createData.data, acceptData.data, executeData.data, params, timings, blockchainFee, isBulkSwap, bulkSwapInfo);

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
function showTransactionSummary(createData, acceptData, executeData, params, timings, blockchainFee = null, isBulkSwap = false, bulkSwapInfo = null) {
    const summary = document.getElementById('transaction-summary');
    const content = document.getElementById('summary-content');

    // Use confirmed parameters (not re-reading from inputs)
    const { offeredSol, requestedSol, selectedMakerNFTs: confirmedMakerNFTs, selectedTakerNFTs: confirmedTakerNFTs, swapType } = params;

    // Format blockchain fee
    let feeDisplay = 'Fetching...';
    if (blockchainFee !== null) {
        const feeSol = (blockchainFee / 1e9).toFixed(6);
        const feeUsd = solPriceUSD ? ` (~$${(blockchainFee / 1e9 * solPriceUSD).toFixed(4)} USD)` : '';
        feeDisplay = `💸 ${feeSol} SOL${feeUsd}`;
    }

    // Determine swap type badge
    let swapTypeBadge = '⚡ Atomic Swap';
    if (isBulkSwap) {
        swapTypeBadge = '🚀 cNFT Bulk Swap (Jito Bundle)';
    } else if (swapType && swapType.type.startsWith('cnft')) {
        swapTypeBadge = '🌳 cNFT Swap';
    }

    // Build summary HTML safely (XSS-protected)
    content.innerHTML = `
        <div class="summary-section">
            <h4>✅ ${swapTypeBadge} Confirmed</h4>
            <div class="summary-item">
                <span class="summary-label">Signature:</span>
                <span class="summary-value"><a href="${executeData.explorerUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(executeData.signature.substring(0, 20))}...</a></span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Total Time:</span>
                <span class="summary-value highlight">⚡ ${timings.total}s</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Blockchain Fee:</span>
                <span class="summary-value">${feeDisplay}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Breakdown:</span>
                <span class="summary-value">Create: ${timings.create}s | Accept: ${timings.accept}s | Execute: ${timings.execute}s</span>
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
                <span class="summary-value">${escapeHtml(acceptData.transaction.nonceAccount)}</span>
            </div>
            ${isBulkSwap && bulkSwapInfo ? `
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
            ${executeData.bundleId ? `
            <div class="summary-item">
                <span class="summary-label">Bundle ID:</span>
                <span class="summary-value" style="font-family: monospace; font-size: 0.8rem;">${escapeHtml(executeData.bundleId)}</span>
            </div>
            ` : ''}
            ` : ''}
        </div>

        <div class="summary-section">
            <h4>Maker Offered</h4>
            ${confirmedMakerNFTs.length > 0 ? `
                <div class="summary-item">
                    <span class="summary-label">NFTs:</span>
                    <span class="summary-value">${confirmedMakerNFTs.length} NFT(s)</span>
                </div>
            ` : ''}
            ${offeredSol ? `
                <div class="summary-item">
                    <span class="summary-label">SOL:</span>
                    <span class="summary-value">${escapeHtml(offeredSol)} SOL</span>
                </div>
            ` : ''}
        </div>

        <div class="summary-section">
            <h4>Taker Offered</h4>
            ${confirmedTakerNFTs.length > 0 ? `
                <div class="summary-item">
                    <span class="summary-label">NFTs:</span>
                    <span class="summary-value">${confirmedTakerNFTs.length} NFT(s)</span>
                </div>
            ` : ''}
            ${requestedSol ? `
                <div class="summary-item">
                    <span class="summary-label">SOL:</span>
                    <span class="summary-value">${escapeHtml(requestedSol)} SOL</span>
                </div>
            ` : ''}
        </div>

        <div class="summary-section">
            <h4>🔗 View Transaction</h4>
            <div class="summary-item">
                <a href="${executeData.explorerUrl}" target="_blank" rel="noopener noreferrer" class="explorer-link">
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
