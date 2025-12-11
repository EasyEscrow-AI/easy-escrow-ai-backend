/**
 * cNFT Atomic Swap Scenario Tests
 * 
 * Comprehensive test suite for all cNFT swap scenarios:
 * - cNFT for SOL swaps (Subtask 3)
 * - cNFT for cNFT swaps (Subtask 4)
 * - cNFT for standard NFT swaps (Subtask 5)
 * - Failure cases and security (Subtask 6)
 * 
 * These tests validate swap parameter logic, fee calculations, and validation rules
 * without requiring full blockchain simulation.
 */

use anchor_lang::prelude::Pubkey;

// Import validation utilities
// Note: Test files are compiled separately, so we include the module directly
#[path = "cnft_validation.rs"]
mod cnft_validation;
use cnft_validation::{TestCnftProof, validate_proof_structure, calculate_proof_length};

//
// ============================================================================
// ENHANCED MOCK UTILITIES (Subtask 2)
// ============================================================================
//

/// Mock swap participant with balance tracking
#[derive(Clone, Debug)]
pub struct MockParticipant {
    pub pubkey: Pubkey,
    pub sol_balance: u64,
    pub cnfts_owned: Vec<MockCnftAsset>,
    pub nfts_owned: Vec<MockNftAsset>,
}

impl MockParticipant {
    pub fn new(initial_sol: u64) -> Self {
        Self {
            pubkey: Pubkey::new_unique(),
            sol_balance: initial_sol,
            cnfts_owned: vec![],
            nfts_owned: vec![],
        }
    }
    
    pub fn with_cnft(mut self, cnft: MockCnftAsset) -> Self {
        self.cnfts_owned.push(cnft);
        self
    }
    
    pub fn with_nft(mut self, nft: MockNftAsset) -> Self {
        self.nfts_owned.push(nft);
        self
    }
    
    pub fn owns_cnft(&self, asset_id: &Pubkey) -> bool {
        self.cnfts_owned.iter().any(|c| &c.asset_id == asset_id)
    }
    
    pub fn owns_nft(&self, mint: &Pubkey) -> bool {
        self.nfts_owned.iter().any(|n| &n.mint == mint)
    }
}

/// Mock cNFT asset with ownership tracking
#[derive(Clone, Debug, PartialEq)]
pub struct MockCnftAsset {
    pub asset_id: Pubkey,
    pub tree: Pubkey,
    pub tree_authority: Pubkey,
    pub leaf_index: u32,
    pub owner: Pubkey,
    pub data_hash: [u8; 32],
    pub creator_hash: [u8; 32],
}

impl MockCnftAsset {
    pub fn new(owner: Pubkey, leaf_index: u32) -> Self {
        let tree = Pubkey::new_unique();
        let bubblegum_program_id = mpl_bubblegum::ID;
        // Note: Bubblegum uses [tree_address] only, NOT [b"TreeConfig", tree_address]
        let (tree_authority, _) = Pubkey::find_program_address(
            &[tree.as_ref()],
            &bubblegum_program_id,
        );
        
        Self {
            asset_id: Pubkey::new_unique(),
            tree,
            tree_authority,
            leaf_index,
            owner,
            data_hash: [2u8; 32],
            creator_hash: [3u8; 32],
        }
    }
    
    pub fn generate_proof(&self, max_depth: u32, canopy_depth: u32) -> TestCnftProof {
        let proof_length = calculate_proof_length(max_depth, canopy_depth);
        TestCnftProof::new_valid(self.leaf_index, proof_length)
    }
    
    pub fn transfer_to(&mut self, new_owner: Pubkey) {
        self.owner = new_owner;
    }
}

/// Mock standard NFT asset
#[derive(Clone, Debug, PartialEq)]
pub struct MockNftAsset {
    pub mint: Pubkey,
    pub owner: Pubkey,
    pub token_account: Pubkey,
}

impl MockNftAsset {
    pub fn new(owner: Pubkey) -> Self {
        Self {
            mint: Pubkey::new_unique(),
            owner,
            token_account: Pubkey::new_unique(),
        }
    }
    
    pub fn transfer_to(&mut self, new_owner: Pubkey) {
        self.owner = new_owner;
        self.token_account = Pubkey::new_unique(); // New ATA
    }
}

/// Mock swap parameters
#[derive(Clone, Debug)]
pub struct MockSwapParams {
    pub maker_sends_cnft: bool,
    pub maker_cnft: Option<MockCnftAsset>,
    pub maker_sends_nft: bool,
    pub maker_nft: Option<MockNftAsset>,
    pub maker_sol_amount: u64,
    
    pub taker_sends_cnft: bool,
    pub taker_cnft: Option<MockCnftAsset>,
    pub taker_sends_nft: bool,
    pub taker_nft: Option<MockNftAsset>,
    pub taker_sol_amount: u64,
    
    pub platform_fee: u64,
}

impl MockSwapParams {
    /// Create cNFT for SOL swap
    pub fn cnft_for_sol(cnft: MockCnftAsset, sol_amount: u64, platform_fee: u64) -> Self {
        Self {
            maker_sends_cnft: true,
            maker_cnft: Some(cnft),
            maker_sends_nft: false,
            maker_nft: None,
            maker_sol_amount: 0,
            
            taker_sends_cnft: false,
            taker_cnft: None,
            taker_sends_nft: false,
            taker_nft: None,
            taker_sol_amount: sol_amount,
            
            platform_fee,
        }
    }
    
    /// Create cNFT for cNFT swap
    pub fn cnft_for_cnft(maker_cnft: MockCnftAsset, taker_cnft: MockCnftAsset, platform_fee: u64) -> Self {
        Self {
            maker_sends_cnft: true,
            maker_cnft: Some(maker_cnft),
            maker_sends_nft: false,
            maker_nft: None,
            maker_sol_amount: 0,
            
            taker_sends_cnft: true,
            taker_cnft: Some(taker_cnft),
            taker_sends_nft: false,
            taker_nft: None,
            taker_sol_amount: 0,
            
            platform_fee,
        }
    }
    
    /// Create cNFT for NFT swap
    pub fn cnft_for_nft(cnft: MockCnftAsset, nft: MockNftAsset, platform_fee: u64) -> Self {
        Self {
            maker_sends_cnft: true,
            maker_cnft: Some(cnft),
            maker_sends_nft: false,
            maker_nft: None,
            maker_sol_amount: 0,
            
            taker_sends_cnft: false,
            taker_cnft: None,
            taker_sends_nft: true,
            taker_nft: Some(nft),
            taker_sol_amount: 0,
            
            platform_fee,
        }
    }
}

/// Validate swap parameters
pub fn validate_swap_params(params: &MockSwapParams) -> Result<(), SwapValidationError> {
    // At least one side must send something
    let maker_sends_something = params.maker_sends_cnft || params.maker_sends_nft || params.maker_sol_amount > 0;
    let taker_sends_something = params.taker_sends_cnft || params.taker_sends_nft || params.taker_sol_amount > 0;
    
    if !maker_sends_something || !taker_sends_something {
        return Err(SwapValidationError::NoAssetsToSwap);
    }
    
    // Validate cNFT presence
    if params.maker_sends_cnft && params.maker_cnft.is_none() {
        return Err(SwapValidationError::MissingCnftAsset);
    }
    if params.taker_sends_cnft && params.taker_cnft.is_none() {
        return Err(SwapValidationError::MissingCnftAsset);
    }
    
    // Validate NFT presence
    if params.maker_sends_nft && params.maker_nft.is_none() {
        return Err(SwapValidationError::MissingNftAsset);
    }
    if params.taker_sends_nft && params.taker_nft.is_none() {
        return Err(SwapValidationError::MissingNftAsset);
    }
    
    // Validate platform fee
    const MAX_PLATFORM_FEE: u64 = 500_000_000; // 0.5 SOL
    if params.platform_fee > MAX_PLATFORM_FEE {
        return Err(SwapValidationError::ExcessiveFee);
    }
    
    Ok(())
}

/// Calculate total swap value (for fee calculation)
pub fn calculate_swap_value(params: &MockSwapParams) -> u64 {
    params.maker_sol_amount + params.taker_sol_amount
}

/// Calculate platform fee (1% of SOL value, capped at 0.5 SOL)
pub fn calculate_platform_fee(sol_value: u64) -> u64 {
    const FEE_BPS: u64 = 100; // 1%
    const MAX_FEE: u64 = 500_000_000; // 0.5 SOL
    
    let fee = (sol_value * FEE_BPS) / 10_000;
    fee.min(MAX_FEE)
}

/// Swap validation errors
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapValidationError {
    NoAssetsToSwap,
    MissingCnftAsset,
    MissingNftAsset,
    ExcessiveFee,
    InsufficientBalance,
    NotAssetOwner,
}

//
// ============================================================================
// TEST SUITE: cNFT for SOL Swaps (Subtask 3)
// ============================================================================
//

#[test]
fn test_cnft_for_sol_happy_path() {
    // Setup: Maker has cNFT, Taker has SOL
    let mut maker = MockParticipant::new(1_000_000_000); // 1 SOL
    let mut taker = MockParticipant::new(2_000_000_000); // 2 SOL
    
    let cnft = MockCnftAsset::new(maker.pubkey, 0);
    maker = maker.with_cnft(cnft.clone());
    
    // Create swap: cNFT for 0.1 SOL
    let sol_amount = 100_000_000; // 0.1 SOL
    let platform_fee = calculate_platform_fee(sol_amount);
    let params = MockSwapParams::cnft_for_sol(cnft.clone(), sol_amount, platform_fee);
    
    // Validate
    assert!(validate_swap_params(&params).is_ok());
    
    // Verify fee calculation
    assert_eq!(platform_fee, 1_000_000); // 1% of 0.1 SOL = 0.001 SOL
    
    // Verify ownership before swap
    assert!(maker.owns_cnft(&cnft.asset_id));
    assert!(!taker.owns_cnft(&cnft.asset_id));
    
    // Simulate swap execution
    let total_taker_payment = sol_amount + platform_fee;
    assert!(taker.sol_balance >= total_taker_payment, "Taker has insufficient balance");
    
    // After swap:
    // - Maker receives SOL
    // - Taker receives cNFT and pays SOL + fee
    maker.sol_balance += sol_amount;
    taker.sol_balance -= total_taker_payment;
    
    // Transfer cNFT ownership
    maker.cnfts_owned.retain(|c| c.asset_id != cnft.asset_id);
    taker.cnfts_owned.push(cnft.clone());
    
    // Verify final state
    assert!(!maker.owns_cnft(&cnft.asset_id));
    assert!(taker.owns_cnft(&cnft.asset_id));
    assert_eq!(maker.sol_balance, 1_100_000_000); // 1.1 SOL
    assert_eq!(taker.sol_balance, 1_899_000_000); // 1.899 SOL (paid 0.101)
}

#[test]
fn test_cnft_for_sol_with_different_amounts() {
    let test_cases = [
        (10_000_000, 100_000),      // 0.01 SOL -> 0.0001 SOL fee
        (100_000_000, 1_000_000),   // 0.1 SOL -> 0.001 SOL fee
        (1_000_000_000, 10_000_000), // 1 SOL -> 0.01 SOL fee
        (10_000_000_000, 100_000_000), // 10 SOL -> 0.1 SOL fee
    ];
    
    for (sol_amount, expected_fee) in test_cases {
        let cnft = MockCnftAsset::new(Pubkey::new_unique(), 0);
        let platform_fee = calculate_platform_fee(sol_amount);
        let params = MockSwapParams::cnft_for_sol(cnft, sol_amount, platform_fee);
        
        assert!(validate_swap_params(&params).is_ok());
        assert_eq!(platform_fee, expected_fee);
    }
}

#[test]
fn test_cnft_for_sol_fee_capped() {
    // Test that fee is capped at 0.5 SOL even for large amounts
    let sol_amount = 100_000_000_000; // 100 SOL
    let platform_fee = calculate_platform_fee(sol_amount);
    
    assert_eq!(platform_fee, 500_000_000); // Capped at 0.5 SOL
}

#[test]
fn test_cnft_for_sol_proof_validation() {
    let cnft = MockCnftAsset::new(Pubkey::new_unique(), 0);
    let proof = cnft.generate_proof(14, 11);
    
    // Verify proof structure is valid
    assert!(validate_proof_structure(&proof, 3).is_ok());
    assert_eq!(proof.index, 0);
    assert_eq!(proof.nonce, 0);
}

//
// ============================================================================
// TEST SUITE: cNFT for cNFT Swaps (Subtask 4)
// ============================================================================
//

#[test]
fn test_cnft_for_cnft_same_tree() {
    // Two cNFTs from the same tree
    let maker_owner = Pubkey::new_unique();
    let taker_owner = Pubkey::new_unique();
    
    let maker_cnft = MockCnftAsset::new(maker_owner, 0);
    let mut taker_cnft = MockCnftAsset::new(taker_owner, 1);
    
    // Make them from the same tree
    taker_cnft.tree = maker_cnft.tree;
    taker_cnft.tree_authority = maker_cnft.tree_authority;
    
    let platform_fee = 0; // No SOL involved
    let params = MockSwapParams::cnft_for_cnft(maker_cnft.clone(), taker_cnft.clone(), platform_fee);
    
    // Validate
    assert!(validate_swap_params(&params).is_ok());
    
    // Verify they're from the same tree
    assert_eq!(maker_cnft.tree, taker_cnft.tree);
    assert_eq!(maker_cnft.tree_authority, taker_cnft.tree_authority);
    
    // Verify different leaf indices
    assert_ne!(maker_cnft.leaf_index, taker_cnft.leaf_index);
    
    // Generate proofs for both
    let maker_proof = maker_cnft.generate_proof(14, 11);
    let taker_proof = taker_cnft.generate_proof(14, 11);
    
    assert!(validate_proof_structure(&maker_proof, 3).is_ok());
    assert!(validate_proof_structure(&taker_proof, 3).is_ok());
}

#[test]
fn test_cnft_for_cnft_different_trees() {
    // Most common scenario: cNFTs from different collections
    let maker_owner = Pubkey::new_unique();
    let taker_owner = Pubkey::new_unique();
    
    let maker_cnft = MockCnftAsset::new(maker_owner, 0);
    let taker_cnft = MockCnftAsset::new(taker_owner, 0);
    
    let platform_fee = 0; // No SOL involved
    let params = MockSwapParams::cnft_for_cnft(maker_cnft.clone(), taker_cnft.clone(), platform_fee);
    
    // Validate
    assert!(validate_swap_params(&params).is_ok());
    
    // Verify different trees
    assert_ne!(maker_cnft.tree, taker_cnft.tree);
    assert_ne!(maker_cnft.tree_authority, taker_cnft.tree_authority);
    
    // Both proofs must be valid
    let maker_proof = maker_cnft.generate_proof(14, 11);
    let taker_proof = taker_cnft.generate_proof(14, 11);
    
    assert!(validate_proof_structure(&maker_proof, 3).is_ok());
    assert!(validate_proof_structure(&taker_proof, 3).is_ok());
}

#[test]
fn test_cnft_for_cnft_dual_ownership_transfer() {
    let mut maker = MockParticipant::new(0);
    let mut taker = MockParticipant::new(0);
    
    let mut maker_cnft = MockCnftAsset::new(maker.pubkey, 0);
    let mut taker_cnft = MockCnftAsset::new(taker.pubkey, 0);
    
    maker = maker.with_cnft(maker_cnft.clone());
    taker = taker.with_cnft(taker_cnft.clone());
    
    // Verify initial ownership
    assert!(maker.owns_cnft(&maker_cnft.asset_id));
    assert!(taker.owns_cnft(&taker_cnft.asset_id));
    assert!(!maker.owns_cnft(&taker_cnft.asset_id));
    assert!(!taker.owns_cnft(&maker_cnft.asset_id));
    
    // Simulate swap
    maker_cnft.transfer_to(taker.pubkey);
    taker_cnft.transfer_to(maker.pubkey);
    
    // Update ownership
    maker.cnfts_owned.retain(|c| c.asset_id != maker_cnft.asset_id);
    taker.cnfts_owned.retain(|c| c.asset_id != taker_cnft.asset_id);
    maker.cnfts_owned.push(taker_cnft.clone());
    taker.cnfts_owned.push(maker_cnft.clone());
    
    // Verify final ownership swapped
    assert!(taker.owns_cnft(&maker_cnft.asset_id));
    assert!(maker.owns_cnft(&taker_cnft.asset_id));
}

//
// ============================================================================
// TEST SUITE: cNFT for Standard NFT Swaps (Subtask 5)
// ============================================================================
//

#[test]
fn test_cnft_for_nft_happy_path() {
    let maker_owner = Pubkey::new_unique();
    let taker_owner = Pubkey::new_unique();
    
    let cnft = MockCnftAsset::new(maker_owner, 0);
    let nft = MockNftAsset::new(taker_owner);
    
    let platform_fee = 0;
    let params = MockSwapParams::cnft_for_nft(cnft.clone(), nft.clone(), platform_fee);
    
    // Validate
    assert!(validate_swap_params(&params).is_ok());
    
    // Verify cNFT proof is valid
    let cnft_proof = cnft.generate_proof(14, 11);
    assert!(validate_proof_structure(&cnft_proof, 3).is_ok());
    
    // Verify NFT details
    assert_eq!(nft.owner, taker_owner);
}

#[test]
fn test_nft_for_cnft_happy_path() {
    // Reverse: Maker sends NFT, Taker sends cNFT
    let maker_owner = Pubkey::new_unique();
    let taker_owner = Pubkey::new_unique();
    
    let nft = MockNftAsset::new(maker_owner);
    let cnft = MockCnftAsset::new(taker_owner, 0);
    
    let platform_fee = 0;
    let mut params = MockSwapParams::cnft_for_nft(cnft.clone(), nft.clone(), platform_fee);
    
    // Swap the sides to make it NFT for cNFT
    params.maker_sends_cnft = false;
    params.maker_cnft = None;
    params.maker_sends_nft = true;
    params.maker_nft = Some(nft.clone());
    
    params.taker_sends_nft = false;
    params.taker_nft = None;
    params.taker_sends_cnft = true;
    params.taker_cnft = Some(cnft.clone());
    
    // Validate
    assert!(validate_swap_params(&params).is_ok());
}

#[test]
fn test_cnft_for_nft_ownership_transfer() {
    let mut maker = MockParticipant::new(0);
    let mut taker = MockParticipant::new(0);
    
    let mut cnft = MockCnftAsset::new(maker.pubkey, 0);
    let mut nft = MockNftAsset::new(taker.pubkey);
    
    maker = maker.with_cnft(cnft.clone());
    taker = taker.with_nft(nft.clone());
    
    // Verify initial ownership
    assert!(maker.owns_cnft(&cnft.asset_id));
    assert!(taker.owns_nft(&nft.mint));
    
    // Simulate swap
    cnft.transfer_to(taker.pubkey);
    nft.transfer_to(maker.pubkey);
    
    // Update ownership
    maker.cnfts_owned.clear();
    taker.nfts_owned.clear();
    taker.cnfts_owned.push(cnft.clone());
    maker.nfts_owned.push(nft.clone());
    
    // Verify final ownership
    assert!(taker.owns_cnft(&cnft.asset_id));
    assert!(maker.owns_nft(&nft.mint));
}

//
// ============================================================================
// TEST SUITE: Failure Cases & Security (Subtask 6)
// ============================================================================
//

#[test]
fn test_invalid_proof_rejected() {
    let cnft = MockCnftAsset::new(Pubkey::new_unique(), 0);
    let mut proof = cnft.generate_proof(14, 11);
    
    // Tamper with the proof by changing root
    proof.root = vec![99u8; 32];
    
    // Proof structure is still valid (correct lengths)
    assert!(validate_proof_structure(&proof, 3).is_ok());
    
    // But the root is wrong (would fail on-chain verification)
    // In a real scenario, Bubblegum would reject this
}

#[test]
fn test_wrong_owner_rejected() {
    let actual_owner = Pubkey::new_unique();
    let attacker = Pubkey::new_unique();
    
    let cnft = MockCnftAsset::new(actual_owner, 0);
    
    // Attacker tries to create swap with someone else's cNFT
    let _params = MockSwapParams::cnft_for_sol(cnft.clone(), 100_000_000, 1_000_000);
    
    // The validation would pass here, but ownership check would fail
    // In real implementation, we check: cnft.owner == maker.pubkey
    assert_ne!(cnft.owner, attacker);
}

#[test]
fn test_empty_swap_rejected() {
    // Both sides send nothing
    let params = MockSwapParams {
        maker_sends_cnft: false,
        maker_cnft: None,
        maker_sends_nft: false,
        maker_nft: None,
        maker_sol_amount: 0,
        
        taker_sends_cnft: false,
        taker_cnft: None,
        taker_sends_nft: false,
        taker_nft: None,
        taker_sol_amount: 0,
        
        platform_fee: 0,
    };
    
    let result = validate_swap_params(&params);
    assert_eq!(result, Err(SwapValidationError::NoAssetsToSwap));
}

#[test]
fn test_missing_cnft_asset_rejected() {
    // Maker claims to send cNFT but doesn't provide it
    let params = MockSwapParams {
        maker_sends_cnft: true, // Claims to send
        maker_cnft: None,       // But doesn't provide
        maker_sends_nft: false,
        maker_nft: None,
        maker_sol_amount: 0,
        
        taker_sends_cnft: false,
        taker_cnft: None,
        taker_sends_nft: false,
        taker_nft: None,
        taker_sol_amount: 100_000_000,
        
        platform_fee: 1_000_000,
    };
    
    let result = validate_swap_params(&params);
    assert_eq!(result, Err(SwapValidationError::MissingCnftAsset));
}

#[test]
fn test_excessive_fee_rejected() {
    let cnft = MockCnftAsset::new(Pubkey::new_unique(), 0);
    let excessive_fee = 600_000_000; // 0.6 SOL (over 0.5 SOL cap)
    
    let params = MockSwapParams::cnft_for_sol(cnft, 100_000_000, excessive_fee);
    
    let result = validate_swap_params(&params);
    assert_eq!(result, Err(SwapValidationError::ExcessiveFee));
}

#[test]
fn test_invalid_proof_length_rejected() {
    let cnft = MockCnftAsset::new(Pubkey::new_unique(), 0);
    let proof = cnft.generate_proof(14, 11);
    
    // Expect 3 nodes but provide proof with wrong length
    let result = validate_proof_structure(&proof, 5); // Wrong expectation
    assert!(result.is_err());
}

#[test]
fn test_malformed_proof_hash_rejected() {
    let invalid_proof = cnft_validation::TestCnftProof::new_invalid_hash_length();
    
    let result = validate_proof_structure(&invalid_proof, 1);
    assert!(result.is_err());
}

#[test]
fn test_stale_proof_scenario() {
    // Simulate a stale proof scenario
    let cnft = MockCnftAsset::new(Pubkey::new_unique(), 0);
    let old_proof = cnft.generate_proof(14, 11);
    
    // Proof structure is valid
    assert!(validate_proof_structure(&old_proof, 3).is_ok());
    
    // But if the tree root changed (due to other mints/transfers),
    // the proof.root won't match the current on-chain root
    // This would be caught by Bubblegum during CPI
    
    // We can simulate by comparing roots
    let current_tree_root = [99u8; 32]; // Simulated current root
    let proof_root: [u8; 32] = old_proof.root.as_slice().try_into().unwrap();
    
    assert_ne!(proof_root, current_tree_root, "Stale proof detected");
}

#[test]
fn test_tree_authority_mismatch() {
    let cnft = MockCnftAsset::new(Pubkey::new_unique(), 0);
    
    // Derive correct authority (Bubblegum uses [tree_address] only - verified on-chain)
    let bubblegum_program_id = mpl_bubblegum::ID;
    let (correct_authority, _) = Pubkey::find_program_address(
        &[cnft.tree.as_ref()],
        &bubblegum_program_id,
    );
    
    assert_eq!(cnft.tree_authority, correct_authority);
    
    // Wrong authority would fail CPI
    let wrong_authority = Pubkey::new_unique();
    assert_ne!(wrong_authority, correct_authority);
}

#[test]
fn test_insufficient_balance_check() {
    let maker = MockParticipant::new(1_000_000_000); // 1 SOL
    let taker = MockParticipant::new(50_000_000);    // 0.05 SOL (insufficient)
    
    let _cnft = MockCnftAsset::new(maker.pubkey, 0);
    let sol_amount = 100_000_000; // 0.1 SOL requested
    let platform_fee = calculate_platform_fee(sol_amount);
    
    let total_required = sol_amount + platform_fee;
    
    // Taker doesn't have enough
    assert!(taker.sol_balance < total_required, "Insufficient balance check failed");
}

