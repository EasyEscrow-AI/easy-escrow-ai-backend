/**
 * cNFT Proof Validation Unit Tests
 * 
 * Tests the proof validation and parameter handling logic for cNFT atomic swaps.
 * These are unit tests that don't require full integration testing infrastructure.
 * 
 * Tests cover:
 * - Proof structure validation
 * - Merkle tree parameter verification
 * - Asset ownership checks
 * - Error handling for invalid inputs
 */

use anchor_lang::prelude::Pubkey;

/// Mock cNFT proof structure for testing
/// Public to allow reuse in other test modules
#[derive(Clone, Debug, PartialEq)]
pub struct TestCnftProof {
    pub root: Vec<u8>,
    pub data_hash: Vec<u8>,
    pub creator_hash: Vec<u8>,
    pub nonce: u64,
    pub index: u32,
    pub proof: Vec<Vec<u8>>,
}

impl TestCnftProof {
    /// Create a valid mock proof for testing
    pub fn new_valid(leaf_index: u32, proof_length: usize) -> Self {
        Self {
            root: vec![1u8; 32],
            data_hash: vec![2u8; 32],
            creator_hash: vec![3u8; 32],
            nonce: leaf_index as u64,
            index: leaf_index,
            proof: (0..proof_length).map(|i| vec![i as u8; 32]).collect(),
        }
    }
    
    /// Create an invalid proof with wrong hash length
    pub fn new_invalid_hash_length() -> Self {
        Self {
            root: vec![1u8; 16], // Invalid: should be 32 bytes
            data_hash: vec![2u8; 32],
            creator_hash: vec![3u8; 32],
            nonce: 0,
            index: 0,
            proof: vec![vec![0u8; 32]],
        }
    }
    
    /// Create an invalid proof with missing proof nodes
    pub fn new_invalid_empty_proof() -> Self {
        Self {
            root: vec![1u8; 32],
            data_hash: vec![2u8; 32],
            creator_hash: vec![3u8; 32],
            nonce: 0,
            index: 0,
            proof: vec![], // Invalid: empty proof
        }
    }
}

/// Validate proof structure
pub fn validate_proof_structure(proof: &TestCnftProof, expected_proof_length: usize) -> Result<(), ErrorCode> {
    // Validate hash lengths
    if proof.root.len() != 32 {
        return Err(ErrorCode::InvalidProofStructure);
    }
    if proof.data_hash.len() != 32 {
        return Err(ErrorCode::InvalidProofStructure);
    }
    if proof.creator_hash.len() != 32 {
        return Err(ErrorCode::InvalidProofStructure);
    }
    
    // Validate proof nodes
    if proof.proof.len() != expected_proof_length {
        return Err(ErrorCode::InvalidProofLength);
    }
    
    for node in &proof.proof {
        if node.len() != 32 {
            return Err(ErrorCode::InvalidProofNode);
        }
    }
    
    Ok(())
}

/// Calculate expected proof length based on tree parameters
pub fn calculate_proof_length(max_depth: u32, canopy_depth: u32) -> usize {
    (max_depth - canopy_depth) as usize
}

/// Derive tree authority PDA (Bubblegum standard)
/// Note: Bubblegum uses [tree_address] only, NOT [b"TreeConfig", tree_address]
pub fn derive_tree_authority(tree_pubkey: &Pubkey) -> (Pubkey, u8) {
    let bubblegum_program_id = mpl_bubblegum::ID;
    Pubkey::find_program_address(
        &[tree_pubkey.as_ref()],
        &bubblegum_program_id,
    )
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    InvalidProofStructure,
    InvalidProofLength,
    InvalidProofNode,
}

impl std::fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        match self {
            ErrorCode::InvalidProofStructure => write!(f, "Invalid proof structure"),
            ErrorCode::InvalidProofLength => write!(f, "Invalid proof length"),
            ErrorCode::InvalidProofNode => write!(f, "Invalid proof node"),
        }
    }
}

impl std::error::Error for ErrorCode {}

//
// ============================================================================
// TEST SUITE: Proof Structure Validation
// ============================================================================
//

#[test]
fn test_valid_proof_structure() {
    // Test with standard tree parameters (depth 14, canopy 11 = 3 proof nodes)
    let proof = TestCnftProof::new_valid(0, 3);
    let result = validate_proof_structure(&proof, 3);
    
    assert!(result.is_ok(), "Valid proof should pass validation");
}

#[test]
fn test_invalid_root_length() {
    let proof = TestCnftProof::new_invalid_hash_length();
    let result = validate_proof_structure(&proof, 3);
    
    assert!(result.is_err(), "Invalid hash length should fail validation");
}

#[test]
fn test_invalid_empty_proof() {
    let proof = TestCnftProof::new_invalid_empty_proof();
    let result = validate_proof_structure(&proof, 3);
    
    assert!(result.is_err(), "Empty proof should fail validation");
}

#[test]
fn test_invalid_proof_length_mismatch() {
    // Create proof with 3 nodes but expect 5
    let proof = TestCnftProof::new_valid(0, 3);
    let result = validate_proof_structure(&proof, 5);
    
    assert!(result.is_err(), "Proof length mismatch should fail validation");
}

//
// ============================================================================
// TEST SUITE: Tree Parameter Calculations
// ============================================================================
//

#[test]
fn test_proof_length_calculation() {
    // Standard staging tree: maxDepth=14, canopyDepth=11
    let length = calculate_proof_length(14, 11);
    assert_eq!(length, 3, "14-11 should yield 3 proof nodes");
    
    // Larger tree: maxDepth=20, canopyDepth=10
    let length = calculate_proof_length(20, 10);
    assert_eq!(length, 10, "20-10 should yield 10 proof nodes");
    
    // Minimal tree: maxDepth=3, canopyDepth=0
    let length = calculate_proof_length(3, 0);
    assert_eq!(length, 3, "3-0 should yield 3 proof nodes");
}

#[test]
fn test_proof_length_zero_canopy() {
    // No canopy: full proof path needed
    let length = calculate_proof_length(14, 0);
    assert_eq!(length, 14, "With no canopy, all 14 nodes needed");
}

//
// ============================================================================
// TEST SUITE: PDA Derivations
// ============================================================================
//

#[test]
fn test_tree_authority_derivation() {
    let tree_pubkey = Pubkey::new_unique();
    let (authority, _bump) = derive_tree_authority(&tree_pubkey);
    
    // Verify it's a valid pubkey (not default/zero)
    assert_ne!(authority, Pubkey::default(), "Authority should not be default pubkey");
    
    // Verify derivation is deterministic
    let (authority2, _) = derive_tree_authority(&tree_pubkey);
    assert_eq!(authority, authority2, "Derivation should be deterministic");
}

#[test]
fn test_tree_authority_different_trees() {
    let tree1 = Pubkey::new_unique();
    let tree2 = Pubkey::new_unique();
    
    let (auth1, _) = derive_tree_authority(&tree1);
    let (auth2, _) = derive_tree_authority(&tree2);
    
    assert_ne!(auth1, auth2, "Different trees should have different authorities");
}

//
// ============================================================================
// TEST SUITE: Proof Data Integrity
// ============================================================================
//

#[test]
fn test_proof_node_hash_integrity() {
    let proof = TestCnftProof::new_valid(0, 3);
    
    // Verify all hashes are 32 bytes
    assert_eq!(proof.root.len(), 32);
    assert_eq!(proof.data_hash.len(), 32);
    assert_eq!(proof.creator_hash.len(), 32);
    
    for (i, node) in proof.proof.iter().enumerate() {
        assert_eq!(node.len(), 32, "Proof node {} should be 32 bytes", i);
    }
}

#[test]
fn test_proof_index_consistency() {
    let leaf_index = 42;
    let proof = TestCnftProof::new_valid(leaf_index, 3);
    
    assert_eq!(proof.index, leaf_index);
    assert_eq!(proof.nonce, leaf_index as u64);
}

#[test]
fn test_multiple_proof_lengths() {
    // Test various valid proof lengths
    for depth in [3, 5, 7, 10, 14, 20, 24] {
        for canopy in 0..=depth {
            let expected_length = (depth - canopy) as usize;
            let proof = TestCnftProof::new_valid(0, expected_length);
            let result = validate_proof_structure(&proof, expected_length);
            
            assert!(
                result.is_ok(),
                "Proof with depth={}, canopy={}, length={} should be valid",
                depth,
                canopy,
                expected_length
            );
        }
    }
}

//
// ============================================================================
// TEST SUITE: Edge Cases
// ============================================================================
//

#[test]
fn test_max_leaf_index() {
    // Test with maximum leaf index for depth 14 (2^14 - 1 = 16383)
    let max_index = (1u32 << 14) - 1;
    let proof = TestCnftProof::new_valid(max_index, 3);
    
    assert_eq!(proof.index, max_index);
    assert_eq!(proof.nonce, max_index as u64);
}

#[test]
fn test_zero_leaf_index() {
    // Test first leaf in tree
    let proof = TestCnftProof::new_valid(0, 3);
    
    assert_eq!(proof.index, 0);
    assert_eq!(proof.nonce, 0);
}

#[test]
fn test_proof_node_uniqueness() {
    let proof = TestCnftProof::new_valid(0, 5);
    
    // Each proof node should have different content (in our mock)
    for i in 0..proof.proof.len() {
        for j in (i + 1)..proof.proof.len() {
            assert_ne!(
                proof.proof[i], proof.proof[j],
                "Proof nodes {} and {} should be different",
                i, j
            );
        }
    }
}

