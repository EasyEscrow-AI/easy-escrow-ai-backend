/**
 * Atomic Swap Test Page - Client-Side Logic
 * Handles wallet loading, NFT selection, and swap execution
 */

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
    
    // Setup swap button event listener
    document.getElementById('swap-btn').addEventListener('click', showConfirmationModal);
    
    // Setup modal button event listeners
    document.getElementById('modal-cancel').addEventListener('click', hideConfirmationModal);
    document.getElementById('modal-confirm').addEventListener('click', confirmAndExecuteSwap);
    
    // Setup filter button event listeners
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', handleFilterClick);
    });
    
    // Setup clear button event listeners
    document.getElementById('maker-clear-btn').addEventListener('click', () => {
        clearNFTSelection('maker');
    });
    
    document.getElementById('taker-clear-btn').addEventListener('click', () => {
        clearNFTSelection('taker');
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
            // Debug: Log cNFT mint addresses received from backend
            const cNfts = data.data.nfts.filter(n => n.isCompressed);
            console.log(`🔍 [Maker] Received ${cNfts.length} cNFTs from backend:`);
            cNfts.forEach(nft => {
                console.log(`   - ${nft.name}: ${nft.mint}`);
            });
        } else {
            takerData = data.data;
            const cNfts = data.data.nfts.filter(n => n.isCompressed);
            console.log(`🔍 [Taker] Received ${cNfts.length} cNFTs from backend:`);
            cNfts.forEach(nft => {
                console.log(`   - ${nft.name}: ${nft.mint}`);
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

// Render NFTs
function renderNFTs(wallet, nfts) {
    const container = document.getElementById(`${wallet}-nfts`);
    const filter = wallet === 'maker' ? makerFilter : takerFilter;
    const searchTerm = wallet === 'maker' ? makerSearchTerm : takerSearchTerm;
    
    // Apply type filter
    let filteredNfts = nfts;
    if (filter === 'spl') {
        filteredNfts = nfts.filter(nft => !nft.isCompressed);
    } else if (filter === 'cnft') {
        filteredNfts = nfts.filter(nft => nft.isCompressed);
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
            message = `No ${filter === 'spl' ? 'SPL NFTs' : 'cNFTs'} found in this wallet`;
        }
        container.innerHTML = `<div class="empty-state">${message}</div>`;
        return;
    }

    const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect fill=\'%23ddd\' width=\'100\' height=\'100\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-family=\'Arial\' font-size=\'14\'%3ENo Image%3C/text%3E%3C/svg%3E';
    
    container.innerHTML = filteredNfts.map((nft, index) => {
        // Find original index in unfiltered array for toggle functionality
        const originalIndex = nfts.findIndex(n => n.mint === nft.mint);
        return `
            <div class="nft-card" data-index="${originalIndex}">
                <img class="nft-image" 
                     src="${nft.image || placeholderSvg}" 
                     alt="${nft.name}"
                     data-fallback="${placeholderSvg}">
                <div class="nft-name">${nft.name || 'Unknown NFT'}</div>
                <div class="nft-type">${nft.isCompressed ? 'cNFT' : 'SPL NFT'}</div>
                <div class="nft-mint">${nft.mint.substring(0, 8)}...</div>
            </div>
        `;
    }).join('');
    
    // Add CSP-compliant error handlers after rendering
    container.querySelectorAll('.nft-image').forEach(img => {
        img.addEventListener('error', function() {
            this.src = this.dataset.fallback;
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
    
    // Update clear button visibility
    const clearBtn = document.getElementById(`${wallet}-clear-btn`);
    if (selectedArray.length === 0) {
        clearBtn.classList.add('hidden');
    } else {
        clearBtn.classList.remove('hidden');
    }
}

// Clear NFT selection
function clearNFTSelection(wallet) {
    if (wallet === 'maker') {
        selectedMakerNFTs = [];
    } else {
        selectedTakerNFTs = [];
    }
    
    const nfts = wallet === 'maker' ? makerData.nfts : takerData.nfts;
    renderNFTs(wallet, nfts);
    updateNFTSelection(wallet);
    // No log message - silent clear for better UX
}

// Add log entry
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

// HTML escape function to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Stored swap parameters (to prevent stale values)
let confirmedSwapParams = null;

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
    
    // Store confirmed parameters (prevent stale values bug)
    confirmedSwapParams = {
        offeredSol,
        requestedSol,
        selectedMakerNFTs: [...selectedMakerNFTs], // Clone arrays
        selectedTakerNFTs: [...selectedTakerNFTs],
    };
    
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
            img.src = nft.image || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\'%3E%3Crect fill=\'%23ddd\' width=\'50\' height=\'50\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-family=\'Arial\' font-size=\'10\'%3ENone%3C/text%3E%3C/svg%3E';
            img.alt = nft.name || 'Unknown NFT';
            
            const details = document.createElement('div');
            details.className = 'nft-preview-details';
            
            const name = document.createElement('div');
            name.className = 'nft-preview-name';
            name.textContent = nft.name || 'Unknown NFT';
            
            const type = document.createElement('div');
            type.className = 'nft-preview-type';
            type.textContent = nft.isCompressed ? 'cNFT' : 'SPL NFT';
            
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
            img.src = nft.image || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\'%3E%3Crect fill=\'%23ddd\' width=\'50\' height=\'50\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-family=\'Arial\' font-size=\'10\'%3ENone%3C/text%3E%3C/svg%3E';
            img.alt = nft.name || 'Unknown NFT';
            
            const details = document.createElement('div');
            details.className = 'nft-preview-details';
            
            const name = document.createElement('div');
            name.className = 'nft-preview-name';
            name.textContent = nft.name || 'Unknown NFT';
            
            const type = document.createElement('div');
            type.className = 'nft-preview-type';
            type.textContent = nft.isCompressed ? 'cNFT' : 'SPL NFT';
            
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
    
    // Calculate and display estimated fees and time
    const totalNFTs = selectedMakerNFTs.length + selectedTakerNFTs.length;
    const totalSOL = (parseFloat(offeredSol) || 0) + (parseFloat(requestedSol) || 0);
    
    // Estimate time based on number of NFTs (check larger thresholds first)
    let estimatedTime = '~5 seconds';
    if (totalNFTs > 10) {
        estimatedTime = '~20 seconds';
    } else if (totalNFTs > 5) {
        estimatedTime = '~10 seconds';
    }
    
    // Calculate network fees (realistic estimate)
    // Atomic swaps involve multiple instructions and signatures
    const baseFee = 0.005; // Base transaction + compute (SOL)
    const perNFTFee = 0.002; // Per NFT transfer (includes potential ATA creation)
    const networkFee = baseFee + (totalNFTs * perNFTFee);
    
    // Calculate platform fee (matches backend FeeCalculator logic)
    // - If SOL is transferred: 1% of total SOL (minimum 0.001 SOL)
    // - If only NFTs (no SOL): Flat fee of 0.005 SOL
    let platformFee;
    if (totalSOL > 0) {
        // Percentage-based fee with minimum floor
        platformFee = Math.max(totalSOL * 0.01, 0.001);
    } else {
        // Flat fee for NFT-only swaps
        platformFee = 0.005;
    }
    
    // Helper function to format SOL with USD
    const formatSOLWithUSD = (solAmount) => {
        const solStr = solAmount.toFixed(4);
        if (solPriceUSD) {
            const usdValue = (solAmount * solPriceUSD).toFixed(2);
            return `${solStr} SOL (~$${usdValue} USD)`;
        }
        return `${solStr} SOL`;
    };
    
    // Format platform fee display
    // Show flat fee for NFT-only swaps, percentage fee for SOL swaps
    const platformFeeDisplay = totalSOL > 0 
        ? formatSOLWithUSD(platformFee)
        : `${formatSOLWithUSD(platformFee)} (flat fee)`;
    
    // Update modal values
    document.getElementById('modal-est-time').textContent = estimatedTime;
    document.getElementById('modal-network-fees').textContent = solPriceUSD 
        ? `~${formatSOLWithUSD(networkFee)}`
        : `~${networkFee.toFixed(6)} SOL`;
    document.getElementById('modal-platform-fee').textContent = platformFeeDisplay;
    
    // Show modal
    document.getElementById('confirm-modal').classList.add('show');
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

// Execute atomic swap (uses confirmed parameters to prevent stale values)
async function executeAtomicSwap(params) {
    const swapBtn = document.getElementById('swap-btn');
    const originalText = swapBtn.innerHTML;
    
    // Start timer
    const startTime = performance.now();
    
    // Set loading state
    swapBtn.disabled = true;
    swapBtn.innerHTML = '⏳ Swap In-Progress...';
    swapBtn.style.animation = 'pulse 1.5s ease-in-out infinite';

    try {
        // Use confirmed parameters passed from modal
        const { offeredSol, requestedSol, selectedMakerNFTs: confirmedMakerNFTs, selectedTakerNFTs: confirmedTakerNFTs } = params;

        // Debug: Log selected NFTs
        console.log('🔍 [Swap] Selected NFTs:');
        console.log('   Maker NFTs:', confirmedMakerNFTs);
        console.log('   Taker NFTs:', confirmedTakerNFTs);

        addLog('🚀 Starting atomic swap...', 'info');

        // Step 1: Create offer
        addLog('Step 1: Creating swap offer...', 'info');
        
        // Build request payload
        const requestPayload = {
            makerWallet: MAKER_ADDRESS,
            takerWallet: TAKER_ADDRESS,
            offeredAssets: confirmedMakerNFTs.map(nft => ({
                mint: nft.mint,
                isCompressed: nft.isCompressed || false,
            })),
            requestedAssets: confirmedTakerNFTs.map(nft => ({
                mint: nft.mint,
                isCompressed: nft.isCompressed || false,
            })),
            offeredSol: offeredSol ? Math.round(parseFloat(offeredSol) * 1e9).toString() : undefined,
            requestedSol: requestedSol ? Math.round(parseFloat(requestedSol) * 1e9).toString() : undefined,
        };
        
        // Debug: Log exact payload being sent to backend
        console.log('📤 [Swap] Sending to backend:', requestPayload);
        console.log('📤 [Swap] Offered assets details:');
        requestPayload.offeredAssets.forEach((asset, i) => {
            console.log(`   ${i + 1}. ${asset.isCompressed ? 'cNFT' : 'SPL'}: ${asset.mint}`);
        });
        
        const createResponse = await fetch('/api/offers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'idempotency-key': `test-${Date.now()}`,
            },
            body: JSON.stringify(requestPayload),
        });

        const createData = await createResponse.json();
        if (!createData.success) {
            throw new Error(createData.message || 'Failed to create offer');
        }

        const offerId = createData.data.offer.id;
        addLog(`✓ Offer created (ID: ${offerId})`, 'success');

        // Step 2: Accept offer
        addLog('Step 2: Accepting offer...', 'info');
        const acceptResponse = await fetch(`/api/offers/${offerId}/accept`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'idempotency-key': `test-accept-${Date.now()}`,
            },
            body: JSON.stringify({
                takerWallet: TAKER_ADDRESS,
            }),
        });

        const acceptData = await acceptResponse.json();
        if (!acceptData.success) {
            throw new Error(acceptData.message || 'Failed to accept offer');
        }

        addLog('✓ Offer accepted, transaction built', 'success');

        // Step 3: Execute the swap on-chain using test wallets
        addLog('Step 3: Executing swap on-chain...', 'info');
        addLog('🔐 Signing with test wallet private keys...', 'info');
        
        const executeResponse = await fetch('/api/test/execute-swap', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Test-Execution': 'true', // Required security header
            },
            body: JSON.stringify({
                serializedTransaction: acceptData.data.transaction.serialized,
                requireSignatures: [MAKER_ADDRESS, TAKER_ADDRESS],
            }),
        });

        const executeData = await executeResponse.json();
        if (!executeData.success) {
            throw new Error(executeData.error || 'Failed to execute swap on-chain');
        }

        addLog('✅ Transaction confirmed on blockchain!', 'success');
        addLog(`🔗 Signature: ${executeData.data.signature}`, 'success');

        // Calculate execution time
        const endTime = performance.now();
        const executionTimeMs = endTime - startTime;
        const executionTimeSec = (executionTimeMs / 1000).toFixed(2);

        addLog(`⚡ Execution time: ${executionTimeSec}s`, 'success');

        // Show transaction summary (pass confirmed params + execution data + timing)
        showTransactionSummary(createData.data, acceptData.data, executeData.data, params, executionTimeSec);

        addLog('✅ Atomic swap completed successfully on devnet!', 'success');

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
function showTransactionSummary(createData, acceptData, executeData, params, executionTimeSec) {
    const summary = document.getElementById('transaction-summary');
    const content = document.getElementById('summary-content');

    // Use confirmed parameters (not re-reading from inputs)
    const { offeredSol, requestedSol, selectedMakerNFTs: confirmedMakerNFTs, selectedTakerNFTs: confirmedTakerNFTs } = params;

    // Build summary HTML safely (XSS-protected)
    content.innerHTML = `
        <div class="summary-section">
            <h4>✅ Transaction Confirmed On-Chain</h4>
            <div class="summary-item">
                <span class="summary-label">Signature:</span>
                <span class="summary-value"><a href="${executeData.explorerUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(executeData.signature.substring(0, 20))}...</a></span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Execution Time:</span>
                <span class="summary-value highlight">⚡ ${executionTimeSec}s</span>
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
