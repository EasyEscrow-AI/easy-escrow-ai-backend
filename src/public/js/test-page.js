/**
 * Atomic Swap Test Page - Client-Side Logic
 * Handles wallet loading, NFT selection, and swap execution
 */

// Wallet addresses (public addresses only - no private keys)
const MAKER_ADDRESS = 'FBU4EL1vWLL6gGAMuqbvkMiRX5gA1aZTZdYyesGwGC71';
const TAKER_ADDRESS = 'Cb7RmJfejiPQ1WSGQnzLiBEiEZGQBPByAqSpkhGg93vk';

// State
let makerData = null;
let takerData = null;
let selectedMakerNFTs = [];
let selectedTakerNFTs = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadWalletInfo('maker');
    loadWalletInfo('taker');
});

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
        } else {
            takerData = data.data;
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
    
    if (nfts.length === 0) {
        container.innerHTML = '<div class="empty-state">No NFTs found in this wallet</div>';
        return;
    }

    container.innerHTML = nfts.map((nft, index) => `
        <div class="nft-card" onclick="toggleNFT('${wallet}', ${index})">
            <img class="nft-image" 
                 src="${nft.image || 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect fill=\'%23ddd\' width=\'100\' height=\'100\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-family=\'Arial\' font-size=\'14\'%3ENo Image%3C/text%3E%3C/svg%3E'}" 
                 alt="${nft.name}"
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'%3E%3Crect fill=\'%23ddd\' width=\'100\' height=\'100\'/%3E%3Ctext x=\'50%25\' y=\'50%25\' text-anchor=\'middle\' dy=\'.3em\' fill=\'%23999\' font-family=\'Arial\' font-size=\'14\'%3ENo Image%3C/text%3E%3C/svg%3E'">
            <div class="nft-name">${nft.name || 'Unknown NFT'}</div>
            <div class="nft-type">${nft.isCompressed ? 'cNFT' : 'SPL NFT'}</div>
            <div class="nft-mint">${nft.mint.substring(0, 8)}...</div>
        </div>
    `).join('');
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

    cards.forEach((card, index) => {
        const nft = nfts[index];
        const isSelected = selectedArray.some(n => n.mint === nft.mint);
        card.classList.toggle('selected', isSelected);
    });
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

// Execute atomic swap
async function executeAtomicSwap() {
    const swapBtn = document.getElementById('swap-btn');
    swapBtn.disabled = true;

    try {
        // Collect swap parameters
        const offeredSol = document.getElementById('maker-sol').value;
        const requestedSol = document.getElementById('taker-sol').value;

        // Validate
        if (selectedMakerNFTs.length === 0 && !offeredSol) {
            throw new Error('Maker must offer at least one NFT or SOL');
        }

        if (selectedTakerNFTs.length === 0 && !requestedSol) {
            throw new Error('Taker must offer at least one NFT or SOL');
        }

        addLog('🚀 Starting atomic swap...', 'info');

        // Step 1: Create offer
        addLog('Step 1: Creating swap offer...', 'info');
        const createResponse = await fetch('/api/offers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': `test-${Date.now()}`,
            },
            body: JSON.stringify({
                makerWallet: MAKER_ADDRESS,
                takerWallet: TAKER_ADDRESS,
                offeredAssets: selectedMakerNFTs.map(nft => ({
                    mint: nft.mint,
                    isCompressed: nft.isCompressed || false,
                })),
                requestedAssets: selectedTakerNFTs.map(nft => ({
                    mint: nft.mint,
                    isCompressed: nft.isCompressed || false,
                })),
                offeredSol: offeredSol ? Math.round(parseFloat(offeredSol) * 1e9).toString() : undefined,
                requestedSol: requestedSol ? Math.round(parseFloat(requestedSol) * 1e9).toString() : undefined,
            }),
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
                'X-Idempotency-Key': `test-accept-${Date.now()}`,
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

        // Note about wallet signing
        addLog('⚠️ Note: Transaction signing requires wallet integration', 'info');
        addLog('Transaction would be signed by both parties and submitted on-chain', 'info');

        // Show transaction summary
        showTransactionSummary(createData.data, acceptData.data);

        addLog('✅ Atomic swap flow completed successfully!', 'success');

    } catch (error) {
        console.error('Swap error:', error);
        addLog(`❌ Swap failed: ${error.message}`, 'error');
    } finally {
        swapBtn.disabled = false;
    }
}

// Show transaction summary
function showTransactionSummary(createData, acceptData) {
    const summary = document.getElementById('transaction-summary');
    const content = document.getElementById('summary-content');

    const offeredSol = document.getElementById('maker-sol').value;
    const requestedSol = document.getElementById('taker-sol').value;

    content.innerHTML = `
        <div class="summary-section">
            <h4>Offer Details</h4>
            <div class="summary-item">
                <span class="summary-label">Offer ID:</span>
                <span class="summary-value">${createData.offer.id}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Status:</span>
                <span class="summary-value">${acceptData.offer.status}</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Nonce Account:</span>
                <span class="summary-value">${acceptData.transaction.nonceAccount}</span>
            </div>
        </div>

        <div class="summary-section">
            <h4>Maker Offers</h4>
            ${selectedMakerNFTs.length > 0 ? `
                <div class="summary-item">
                    <span class="summary-label">NFTs:</span>
                    <span class="summary-value">${selectedMakerNFTs.length} NFT(s)</span>
                </div>
            ` : ''}
            ${offeredSol ? `
                <div class="summary-item">
                    <span class="summary-label">SOL:</span>
                    <span class="summary-value">${offeredSol} SOL</span>
                </div>
            ` : ''}
        </div>

        <div class="summary-section">
            <h4>Taker Requests</h4>
            ${selectedTakerNFTs.length > 0 ? `
                <div class="summary-item">
                    <span class="summary-label">NFTs:</span>
                    <span class="summary-value">${selectedTakerNFTs.length} NFT(s)</span>
                </div>
            ` : ''}
            ${requestedSol ? `
                <div class="summary-item">
                    <span class="summary-label">SOL:</span>
                    <span class="summary-value">${requestedSol} SOL</span>
                </div>
            ` : ''}
        </div>

        <div class="summary-section">
            <h4>Next Steps</h4>
            <div class="summary-item">
                <span class="summary-label">Transaction:</span>
                <span class="summary-value">Ready for wallet signatures</span>
            </div>
            <div class="summary-item">
                <span class="summary-label">Implementation:</span>
                <span class="summary-value">Requires Phantom/Solflare wallet integration</span>
            </div>
        </div>
    `;

    summary.classList.add('show');
}

// Expose functions to global scope for onclick handlers
window.loadWalletInfo = loadWalletInfo;
window.toggleNFT = toggleNFT;
window.executeAtomicSwap = executeAtomicSwap;

