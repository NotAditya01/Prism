# PRISM

Private range prediction markets on Stellar.

Instead of betting yes or no, you predict a numeric range.
Tighter range = higher multiplier. Your prediction stays
sealed until settlement — then you prove it was right.

## Live Demo

**App:** [http://localhost:5173](http://localhost:5173) (local development)

**Contract:** `CCNVNXIE74IBGWJOFNKQD6J2VZEZGQVNKZXBEKHFRWKVCOUXKFAFIQTJ`  
[View on Stellar Expert →](https://stellar.expert/explorer/testnet/contract/CCNVNXIE74IBGWJOFNKQD6J2VZEZGQVNKZXBEKHFRWKVCOUXKFAFIQTJ)

**Live markets:**
- Market 3003: Total XLM payments on Stellar testnet
- Market 3004: XLM/USDC price from Stellar mainnet DEX

## How It Works

1. Pick a market with a numeric outcome
2. Choose a range — your prediction is sealed as a
   Poseidon hash commitment on Stellar. Nobody sees
   your range.
3. Stake XLM — transferred to the contract pool on-chain
4. Market settles from live Stellar Horizon data
5. Unlock your sealed prediction, generate a Groth16 ZK
   proof locally, submit claim — contract verifies and
   pays out

## Why ZK Is Essential

Without ZK, range prediction markets break. The moment
you place a bet, everyone can see your range. Skilled
forecasters get copied instantly. The precision multiplier
— which rewards tighter ranges — becomes worthless because
anyone can wait and copy the tightest visible range.

With ZK, your range is sealed as a cryptographic
commitment before settlement. Copying is mathematically
impossible — you can see there's a commitment, but you
cannot see what range it represents. At claim time, you
generate a Groth16 proof locally that proves two things
without revealing them early: your commitment matches
your actual range, and the settled result falls inside it.

ZK is not a privacy feature added on top. It is the
reason the core mechanic works at all.

## Why Stellar Specifically

**Native oracle:** PRISM's Stellar Metrics markets settle
from Horizon API data — total XLM payment volume,
XLM/USDC order book mid-price from the SDEX. No
Chainlink. No external trust. The chain resolves itself.

**BN254/Poseidon host functions:** Stellar Protocol 25
introduced native BN254 elliptic curve operations
(CAP-0074) and Poseidon/Poseidon2 hashing (CAP-0075)
as host functions. These are the exact primitives PRISM's
ZK stack uses. On-chain Groth16 verification is the
production upgrade path — the contract and circuit are
structured to support it.

**Low fees:** Soroban's near-zero transaction costs make
micro-predictions economically viable. A 5 XLM minimum
stake is practical because fees don't eat into returns.

**Freighter wallet:** Native Stellar wallet integration
for both transaction signing and deterministic encryption
key derivation.

## What Is Real vs Simulated

| Component | Status |
|---|---|
| Circom range_market circuit | Real |
| snarkjs Groth16 proof generation in browser | Real |
| Local proof verification via snarkjs | Real |
| Poseidon commitment stored on Soroban | Real |
| AES-GCM prediction encryption via Freighter signature | Real |
| XLM stake transfer to contract | Real — testnet |
| Pool-based payout with 2% fee | Real — testnet |
| Duplicate claim prevention via nullifier | Real |
| Settlement rejection for missed ranges | Real |
| Horizon oracle for XLM payment volume | Real |
| Horizon/SDEX oracle for XLM/USDC price | Real |
| BN254 on-chain Groth16 proof verification | Not yet wired — see below |

## Current Limitation

The Soroban contract does not yet verify the Groth16
proof on-chain. The contract enforces commitment storage,
settlement state, range validation, payout math, and
duplicate prevention — but a modified client could
theoretically submit a different winning range.

The production path is documented in
docs/spikes/bn254-verifier-search.md. The contract and
circuit are structured to support BN254 on-chain
verification via Stellar's CAP-0074 host functions once
a compatible verifier contract is available.

For this hackathon MVP: proof generation and local
verification are real, and Soroban enforces all
state transitions.

## Payout Formula

```text
width = high - low

multiplier = min(max_range_width / width, max_multiplier)

gross_payout = stake × multiplier

fee = gross_payout × 2%

net_payout = gross_payout - fee
```

Example: 10 XLM stake, range width 50, max width 1000
→ multiplier = min(20, 10) = 10x
→ gross = 100 XLM, fee = 2 XLM, net = 98 XLM

Losing stakes remain in the contract pool and fund
future winning payouts.

## Architecture

```text
React frontend (Vite + TypeScript + shadcn)
├── Freighter wallet connection
├── Poseidon commitment generation (circomlibjs)
├── AES-GCM encryption (Freighter sig → HKDF → key)
├── Groth16 proof generation (snarkjs in browser)
└── Soroban contract calls

Soroban contract (Rust)
├── Market configuration and pool accounting
├── Commitment + encrypted blob storage
├── Settlement enforcement
├── Payout calculation and transfer
└── Nullifier-based duplicate prevention

Resolver scripts (TypeScript)
├── scripts/resolve-xlm-payments.ts
└── scripts/resolve-xlm-usdc-price.ts

Circom circuit
└── circuits/range_market.circom
```

## Path to Mainnet

- Replace testnet XLM with USDC stakes
- Wire BN254 Groth16 verifier using CAP-0074 host functions
- Decentralized resolver network for trustless settlement
- Stellar anchor integration for fiat deposit/withdrawal
- Additional Stellar Metrics markets — SDEX volume,
  anchor TVL, corridor payment flows
- PRISM markets about Stellar's own metrics create a
  feedback loop: network growth makes markets more
  interesting and more liquid

## How to Run Locally

```bash
git clone [repo]
cd prismf
npm install
cp .env.example .env
# Fill in VITE_CONTRACT_ID and network config
npm run dev
```

To run the resolver:

```bash
npm run resolve:xlm-payments -- --max-pages=1
npm run resolve:xlm-usdc
```

To run integration tests:

```bash
npx ts-node scripts/integration-test.ts
```

## ZK Circuit Details

**Proof system:** Circom + snarkjs + Groth16 (BN254)  
**Commitment hash:** Poseidon(low, high, salt, market_id)  
**Encryption:** AES-GCM with HKDF-derived key from Freighter signature

Private inputs: predicted_low, predicted_high, salt  
Public inputs: commitment, actual_value, market_id, multiplier_tier

The circuit proves commitment correctness and range
containment without revealing the range.

## Deployed Contracts (Testnet)

| Contract | Address |
|---|---|
| PRISM Market v4 | `CCNVNXIE74IBGWJOFNKQD6J2VZEZGQVNKZXBEKHFRWKVCOUXKFAFIQTJ` |
| Market 3003 pool | 10,000 XLM funded |
| Market 3004 pool | 5,000 XLM funded |
| Treasury/Resolver | `GDYC2AUKPBCFS24PIUYXUWPYL46QIQCELNUPTXA6B4SNNNTQJM2BBVP7` |

## Built With

- Circom + snarkjs (ZK proof generation)
- Soroban / Stellar SDK (smart contracts)
- React + Vite + TypeScript (frontend)
- shadcn/ui (components)
- Freighter (wallet)
- Stellar Horizon API (oracle)
# Prism
