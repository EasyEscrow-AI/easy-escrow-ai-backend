/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/escrow.json`.
 */
export type Escrow = {
  "address": "2GFDPMZawisx4AMadZEjbcNJPUsLKMzcG4rLEbKtTQUx",
  "metadata": {
    "name": "escrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana Escrow Program for NFT and USDC transactions"
  },
  "instructions": [
    {
      "name": "adminCancelV2",
      "docs": [
        "Admin emergency cancel with full refunds"
      ],
      "discriminator": [
        50,
        66,
        222,
        94,
        77,
        231,
        101,
        221
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow_state.escrow_id",
                "account": "escrowStateV2"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "writable": true
        },
        {
          "name": "sellerNftAccount",
          "writable": true
        },
        {
          "name": "escrowNftAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "cancelIfExpiredV2",
      "docs": [
        "Cancel expired escrow and return assets to original owners"
      ],
      "discriminator": [
        14,
        247,
        35,
        15,
        173,
        214,
        125,
        177
      ],
      "accounts": [
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow_state.escrow_id",
                "account": "escrowStateV2"
              }
            ]
          }
        },
        {
          "name": "buyer",
          "writable": true
        },
        {
          "name": "sellerNftAccount",
          "writable": true
        },
        {
          "name": "escrowNftAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositBuyerNft",
      "docs": [
        "Buyer deposits NFT B into the escrow (for NFT<>NFT swaps)",
        "Used for NftForNftWithFee and NftForNftPlusSol swap types"
      ],
      "discriminator": [
        161,
        161,
        104,
        18,
        248,
        136,
        161,
        167
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow_state.escrow_id",
                "account": "escrowStateV2"
              }
            ]
          }
        },
        {
          "name": "buyerNftAccount",
          "writable": true
        },
        {
          "name": "escrowNftBAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrowState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "nftMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositNft",
      "docs": [
        "Deposit NFT into escrow"
      ],
      "discriminator": [
        93,
        226,
        132,
        166,
        141,
        9,
        48,
        101
      ],
      "accounts": [
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow_state.escrow_id",
                "account": "escrowState"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "sellerNftAccount",
          "writable": true
        },
        {
          "name": "escrowNftAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrowState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "nftMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositSellerNft",
      "docs": [
        "Seller deposits NFT A into the escrow",
        "Used for all swap types (seller always deposits NFT A)"
      ],
      "discriminator": [
        81,
        93,
        134,
        77,
        106,
        127,
        106,
        95
      ],
      "accounts": [
        {
          "name": "seller",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow_state.escrow_id",
                "account": "escrowStateV2"
              }
            ]
          }
        },
        {
          "name": "sellerNftAccount",
          "writable": true
        },
        {
          "name": "escrowNftAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "escrowState"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "nftMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "depositSol",
      "docs": [
        "Buyer deposits SOL into the escrow PDA",
        "For NftForSol and NftForNftPlusSol swap types"
      ],
      "discriminator": [
        108,
        81,
        78,
        117,
        125,
        155,
        56,
        200
      ],
      "accounts": [
        {
          "name": "buyer",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow_state.escrow_id",
                "account": "escrowStateV2"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initAgreementV2",
      "docs": [
        "Initialize a new SOL-based escrow agreement",
        "Admin-only operation to ensure all escrows are tracked in the database"
      ],
      "discriminator": [
        178,
        222,
        141,
        235,
        92,
        160,
        89,
        112
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "buyer"
        },
        {
          "name": "seller"
        },
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "escrowId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "escrowId",
          "type": "u64"
        },
        {
          "name": "swapType",
          "type": {
            "defined": {
              "name": "swapType"
            }
          }
        },
        {
          "name": "solAmount",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "nftAMint",
          "type": "pubkey"
        },
        {
          "name": "nftBMint",
          "type": {
            "option": "pubkey"
          }
        },
        {
          "name": "expiryTimestamp",
          "type": "i64"
        },
        {
          "name": "platformFeeBps",
          "type": "u16"
        },
        {
          "name": "feePayer",
          "type": {
            "defined": {
              "name": "feePayer"
            }
          }
        }
      ]
    },
    {
      "name": "settleV2",
      "docs": [
        "Settle the escrow and distribute assets",
        "Handles both NFT<>SOL and NFT<>NFT with SOL fee swap types"
      ],
      "discriminator": [
        5,
        41,
        238,
        141,
        219,
        81,
        39,
        145
      ],
      "accounts": [
        {
          "name": "caller",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrowState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "escrow_state.escrow_id",
                "account": "escrowStateV2"
              }
            ]
          }
        },
        {
          "name": "seller",
          "writable": true
        },
        {
          "name": "platformFeeCollector",
          "writable": true
        },
        {
          "name": "escrowNftAccount",
          "writable": true
        },
        {
          "name": "buyerNftAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "buyer"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "nftMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "buyer"
        },
        {
          "name": "nftMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "escrowState",
      "discriminator": [
        19,
        90,
        148,
        111,
        55,
        130,
        229,
        108
      ]
    },
    {
      "name": "escrowStateV2",
      "discriminator": [
        66,
        39,
        129,
        171,
        36,
        97,
        174,
        182
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Invalid amount provided"
    },
    {
      "code": 6001,
      "name": "amountTooLow",
      "msg": "Amount below minimum: $1.00 (BETA limit)"
    },
    {
      "code": 6002,
      "name": "amountTooHigh",
      "msg": "Amount exceeds maximum: $3,000.00 (BETA limit)"
    },
    {
      "code": 6003,
      "name": "invalidExpiry",
      "msg": "Invalid expiry timestamp"
    },
    {
      "code": 6004,
      "name": "invalidStatus",
      "msg": "Invalid escrow status for this operation"
    },
    {
      "code": 6005,
      "name": "alreadyDeposited",
      "msg": "Assets already deposited"
    },
    {
      "code": 6006,
      "name": "unauthorized",
      "msg": "Unauthorized to perform this action"
    },
    {
      "code": 6007,
      "name": "unauthorizedAdmin",
      "msg": "Only authorized admin can initialize escrows"
    },
    {
      "code": 6008,
      "name": "invalidNftMint",
      "msg": "Invalid NFT mint address"
    },
    {
      "code": 6009,
      "name": "depositNotComplete",
      "msg": "Deposits not complete"
    },
    {
      "code": 6010,
      "name": "expired",
      "msg": "Escrow has expired"
    },
    {
      "code": 6011,
      "name": "notExpired",
      "msg": "Escrow has not expired yet"
    },
    {
      "code": 6012,
      "name": "invalidFeeBps",
      "msg": "Invalid fee basis points (must be <= 10000)"
    },
    {
      "code": 6013,
      "name": "calculationOverflow",
      "msg": "Calculation overflow"
    },
    {
      "code": 6014,
      "name": "invalidSwapType",
      "msg": "Invalid swap type for this operation"
    },
    {
      "code": 6015,
      "name": "solAmountTooLow",
      "msg": "SOL amount below minimum: 0.01 SOL (BETA limit)"
    },
    {
      "code": 6016,
      "name": "solAmountTooHigh",
      "msg": "SOL amount exceeds maximum: 15 SOL (BETA limit)"
    },
    {
      "code": 6017,
      "name": "invalidSwapParameters",
      "msg": "Invalid parameter combination for swap type"
    }
  ],
  "types": [
    {
      "name": "escrowState",
      "docs": [
        "Escrow state account storing agreement details"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "usdcAmount",
            "type": "u64"
          },
          {
            "name": "nftMint",
            "docs": [
              "The NFT's mint address (unique identifier).",
              "",
              "Important: This is NOT \"minting\" (creating) an NFT.",
              "The NFT must ALREADY EXIST in the seller's wallet.",
              "This field stores the mint address to identify WHICH specific NFT",
              "is being traded in this escrow agreement."
            ],
            "type": "pubkey"
          },
          {
            "name": "platformFeeBps",
            "docs": [
              "Platform fee in basis points (1 bps = 0.01%)",
              "Set during initialization by authorized admin",
              "Range: 0-10000 (0% to 100%)",
              "This fee is enforced during settlement and cannot be bypassed"
            ],
            "type": "u16"
          },
          {
            "name": "buyerUsdcDeposited",
            "type": "bool"
          },
          {
            "name": "sellerNftDeposited",
            "type": "bool"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "expiryTimestamp",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "escrowStateV2",
      "docs": [
        "Updated escrow state for SOL-based swaps"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "escrowId",
            "type": "u64"
          },
          {
            "name": "buyer",
            "type": "pubkey"
          },
          {
            "name": "seller",
            "type": "pubkey"
          },
          {
            "name": "swapType",
            "docs": [
              "Swap type determines which fields are used"
            ],
            "type": {
              "defined": {
                "name": "swapType"
              }
            }
          },
          {
            "name": "solAmount",
            "docs": [
              "SOL amount (if applicable to swap type)"
            ],
            "type": "u64"
          },
          {
            "name": "nftAMint",
            "docs": [
              "NFT mints (one or two depending on swap type)"
            ],
            "type": "pubkey"
          },
          {
            "name": "nftBMint",
            "type": {
              "option": "pubkey"
            }
          },
          {
            "name": "platformFeeBps",
            "docs": [
              "Platform fee configuration"
            ],
            "type": "u16"
          },
          {
            "name": "feePayer",
            "type": {
              "defined": {
                "name": "feePayer"
              }
            }
          },
          {
            "name": "buyerSolDeposited",
            "docs": [
              "Deposit tracking"
            ],
            "type": "bool"
          },
          {
            "name": "buyerNftDeposited",
            "type": "bool"
          },
          {
            "name": "sellerNftDeposited",
            "type": "bool"
          },
          {
            "name": "status",
            "docs": [
              "Status and metadata"
            ],
            "type": {
              "defined": {
                "name": "escrowStatus"
              }
            }
          },
          {
            "name": "expiryTimestamp",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "escrowStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "pending"
          },
          {
            "name": "completed"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "feePayer",
      "docs": [
        "Who pays the platform fee"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "buyer"
          },
          {
            "name": "seller"
          }
        ]
      }
    },
    {
      "name": "swapType",
      "docs": [
        "Swap type determines how the escrow settlement works"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "nftForSol"
          },
          {
            "name": "nftForNftWithFee"
          },
          {
            "name": "nftForNftPlusSol"
          }
        ]
      }
    }
  ]
};
