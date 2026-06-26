#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, Address, Bytes, BytesN, Env,
};

const STROOPS_PER_XLM: i128 = 10_000_000;
const DEFAULT_MIN_STAKE: i128 = 5 * STROOPS_PER_XLM;
const DEFAULT_MAX_MULTIPLIER: u32 = 10;
const FEE_BPS: i128 = 200;
const BPS_DENOMINATOR: i128 = 10_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Market {
    pub id: u64,
    pub min_stake: i128,
    pub max_range_width: u64,
    pub max_multiplier: u32,
    pub resolution_time: u64,
    pub sealed_count: u32,
    pub claimed_count: u32,
    pub actual_value: i128,
    pub settled: bool,
    pub active: bool,
    pub total_pool: i128,
    pub claimed_pool: i128,
    pub fee_collected: i128,
    pub winner_count: u32,
    pub loser_count: u32,
    pub treasury_address: Address,
    pub resolver_address: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MarketStats {
    pub total_pool: i128,
    pub claimed_pool: i128,
    pub fee_collected: i128,
    pub winner_count: u32,
    pub loser_count: u32,
    pub sealed_count: u32,
    pub claimed_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CommitmentRecord {
    pub market_id: u64,
    pub wallet: Address,
    pub commitment_hash: BytesN<32>,
    pub encrypted_blob: Bytes,
    pub stake: i128,
    pub claimed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimRecord {
    pub market_id: u64,
    pub wallet: Address,
    pub predicted_low: i128,
    pub predicted_high: i128,
    pub payout: i128,
    pub fee: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    XlmToken,
    Market(u64),
    Commitment(u64, Address),
    Claim(u64, Address),
    Nullifier(u64, Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    MarketExists = 2,
    MarketMissing = 3,
    MarketInactive = 4,
    DuplicateCommitment = 5,
    InvalidStake = 6,
    PoolMissing = 7,
    AlreadySettled = 8,
    NotSettled = 9,
    AlreadyClaimed = 10,
    RangeMiss = 11,
    InvalidRange = 12,
    InvalidCommitment = 13,
    InsufficientPool = 14,
    BelowMinStake = 15,
    UnauthorizedResolver = 16,
    MarketNotReady = 17,
}

#[contract]
pub struct PrismMarketContract;

#[contractimpl]
impl PrismMarketContract {
    pub fn __constructor(env: Env, admin: Address, xlm_token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::XlmToken, &xlm_token);

        Ok(())
    }

    pub fn create_market(
        env: Env,
        admin: Address,
        market_id: u64,
        max_range_width: u64,
        max_multiplier: u32,
        min_stake: i128,
        resolution_time: u64,
        treasury_address: Address,
        resolver_address: Address,
    ) -> Result<(), Error> {
        require_admin(&env, &admin);

        let key = DataKey::Market(market_id);
        if env.storage().persistent().has(&key) {
            return Err(Error::MarketExists);
        }

        let market = Market {
            id: market_id,
            min_stake: if min_stake > 0 { min_stake } else { DEFAULT_MIN_STAKE },
            max_range_width,
            max_multiplier: if max_multiplier > 0 {
                max_multiplier
            } else {
                DEFAULT_MAX_MULTIPLIER
            },
            resolution_time,
            sealed_count: 0,
            claimed_count: 0,
            actual_value: 0,
            settled: false,
            active: true,
            total_pool: 0,
            claimed_pool: 0,
            fee_collected: 0,
            winner_count: 0,
            loser_count: 0,
            treasury_address,
            resolver_address,
        };

        env.storage().persistent().set(&key, &market);

        Ok(())
    }

    pub fn commit_prediction(
        env: Env,
        wallet: Address,
        market_id: u64,
        commitment_hash: BytesN<32>,
        encrypted_blob: Bytes,
        stake: i128,
    ) -> Result<(), Error> {
        commit_internal(env, wallet, market_id, commitment_hash, encrypted_blob, stake)
    }

    pub fn commit(
        env: Env,
        wallet: Address,
        market_id: u64,
        commitment_hash: BytesN<32>,
        encrypted_blob: Bytes,
        stake: i128,
    ) -> Result<(), Error> {
        commit_internal(env, wallet, market_id, commitment_hash, encrypted_blob, stake)
    }

    pub fn settle_market(
        env: Env,
        resolver: Address,
        market_id: u64,
        actual_value: i128,
    ) -> Result<(), Error> {
        resolver.require_auth();

        let market_key = DataKey::Market(market_id);
        let mut market: Market = env
            .storage()
            .persistent()
            .get(&market_key)
            .ok_or(Error::MarketMissing)?;

        if resolver != market.resolver_address {
            return Err(Error::UnauthorizedResolver);
        }

        if market.settled {
            return Err(Error::AlreadySettled);
        }

        if env.ledger().timestamp() < market.resolution_time {
            return Err(Error::MarketNotReady);
        }

        market.actual_value = actual_value;
        market.settled = true;
        market.active = false;
        env.storage().persistent().set(&market_key, &market);

        Ok(())
    }

    pub fn claim_winnings(
        env: Env,
        wallet: Address,
        market_id: u64,
        predicted_low: i128,
        predicted_high: i128,
        _salt: BytesN<32>,
        submitted_commitment: BytesN<32>,
    ) -> Result<i128, Error> {
        claim_internal(
            env,
            wallet,
            market_id,
            predicted_low,
            predicted_high,
            submitted_commitment,
        )
    }

    pub fn claim(
        env: Env,
        wallet: Address,
        market_id: u64,
        predicted_low: i128,
        predicted_high: i128,
        _multiplier_tier: u32,
    ) -> Result<i128, Error> {
        let submitted_commitment = BytesN::from_array(&env, &[0; 32]);
        claim_internal(
            env,
            wallet,
            market_id,
            predicted_low,
            predicted_high,
            submitted_commitment,
        )
    }

    pub fn fund_pool(
        env: Env,
        funder: Address,
        market_id: u64,
        amount: i128,
    ) -> Result<(), Error> {
        funder.require_auth();
        let _market = Self::get_market(env.clone(), market_id)?;
        if amount <= 0 {
            return Err(Error::InvalidStake);
        }

        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::XlmToken)
            .ok_or(Error::PoolMissing)?;
        let token_client = token::Client::new(&env, &token_address);
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        Ok(())
    }

    pub fn get_market(env: Env, market_id: u64) -> Result<Market, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Market(market_id))
            .ok_or(Error::MarketMissing)
    }

    pub fn get_commitment(
        env: Env,
        market_id: u64,
        wallet: Address,
    ) -> Result<CommitmentRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Commitment(market_id, wallet))
            .ok_or(Error::MarketMissing)
    }

    pub fn get_claim(env: Env, market_id: u64, wallet: Address) -> Result<ClaimRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Claim(market_id, wallet))
            .ok_or(Error::MarketMissing)
    }

    pub fn get_market_stats(env: Env, market_id: u64) -> Result<MarketStats, Error> {
        let market = Self::get_market(env, market_id)?;
        Ok(MarketStats {
            total_pool: market.total_pool,
            claimed_pool: market.claimed_pool,
            fee_collected: market.fee_collected,
            winner_count: market.winner_count,
            loser_count: market.loser_count,
            sealed_count: market.sealed_count,
            claimed_count: market.claimed_count,
        })
    }

    pub fn get_pool_balance(env: Env, market_id: u64) -> Result<i128, Error> {
        let _market = Self::get_market(env.clone(), market_id)?;
        let token_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::XlmToken)
            .ok_or(Error::PoolMissing)?;
        let token_client = token::Client::new(&env, &token_address);
        Ok(token_client.balance(&env.current_contract_address()))
    }

    pub fn is_nullifier_used(env: Env, market_id: u64, wallet: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::Nullifier(market_id, wallet))
            .unwrap_or(false)
    }
}

fn commit_internal(
    env: Env,
    wallet: Address,
    market_id: u64,
    commitment_hash: BytesN<32>,
    encrypted_blob: Bytes,
    stake: i128,
) -> Result<(), Error> {
    wallet.require_auth();

    let market_key = DataKey::Market(market_id);
    let mut market: Market = env
        .storage()
        .persistent()
        .get(&market_key)
        .ok_or(Error::MarketMissing)?;

    if !market.active {
        return Err(Error::MarketInactive);
    }

    if stake < market.min_stake {
        return Err(Error::BelowMinStake);
    }

    let commitment_key = DataKey::Commitment(market_id, wallet.clone());
    if env.storage().persistent().has(&commitment_key) {
        return Err(Error::DuplicateCommitment);
    }

    let token_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::XlmToken)
        .ok_or(Error::PoolMissing)?;
    let contract_address = env.current_contract_address();
    let token_client = token::Client::new(&env, &token_address);
    token_client.transfer(&wallet, &contract_address, &stake);

    let record = CommitmentRecord {
        market_id,
        wallet,
        commitment_hash,
        encrypted_blob,
        stake,
        claimed: false,
    };

    market.sealed_count += 1;
    market.total_pool += stake;
    env.storage().persistent().set(&commitment_key, &record);
    env.storage().persistent().set(&market_key, &market);

    Ok(())
}

fn claim_internal(
    env: Env,
    wallet: Address,
    market_id: u64,
    predicted_low: i128,
    predicted_high: i128,
    submitted_commitment: BytesN<32>,
) -> Result<i128, Error> {
    wallet.require_auth();

    let market_key = DataKey::Market(market_id);
    let mut market: Market = env
        .storage()
        .persistent()
        .get(&market_key)
        .ok_or(Error::MarketMissing)?;

    if !market.settled {
        return Err(Error::NotSettled);
    }

    if predicted_high <= predicted_low {
        return Err(Error::InvalidRange);
    }

    let commitment_key = DataKey::Commitment(market_id, wallet.clone());
    let mut commitment: CommitmentRecord = env
        .storage()
        .persistent()
        .get(&commitment_key)
        .ok_or(Error::MarketMissing)?;

    if commitment.claimed || is_nullifier_used_internal(&env, market_id, wallet.clone()) {
        return Err(Error::AlreadyClaimed);
    }

    if submitted_commitment != commitment.commitment_hash {
        return Err(Error::InvalidCommitment);
    }

    if market.actual_value < predicted_low || market.actual_value > predicted_high {
        market.loser_count += 1;
        env.storage().persistent().set(&market_key, &market);
        return Err(Error::RangeMiss);
    }

    let width = predicted_high - predicted_low;
    if width <= 0 || width > market.max_range_width as i128 {
        return Err(Error::InvalidRange);
    }

    let gross_payout = gross_payout_for_width(
        commitment.stake,
        width,
        market.max_range_width as i128,
        market.max_multiplier as i128,
    )?;
    let fee = gross_payout * FEE_BPS / BPS_DENOMINATOR;
    let net_payout = gross_payout - fee;

    let token_address: Address = env
        .storage()
        .instance()
        .get(&DataKey::XlmToken)
        .ok_or(Error::PoolMissing)?;
    let contract_address = env.current_contract_address();
    let token_client = token::Client::new(&env, &token_address);
    let available_pool = token_client.balance(&contract_address);
    if net_payout + fee > available_pool {
        return Err(Error::InsufficientPool);
    }

    if fee > 0 {
        token_client.transfer(&contract_address, &market.treasury_address, &fee);
    }
    token_client.transfer(&contract_address, &wallet, &net_payout);

    commitment.claimed = true;
    market.claimed_count += 1;
    market.winner_count += 1;
    market.claimed_pool += net_payout;
    market.fee_collected += fee;

    let claim = ClaimRecord {
        market_id,
        wallet: wallet.clone(),
        predicted_low,
        predicted_high,
        payout: net_payout,
        fee,
    };

    env.storage().persistent().set(&commitment_key, &commitment);
    env.storage()
        .persistent()
        .set(&DataKey::Nullifier(market_id, wallet.clone()), &true);
    env.storage().persistent().set(&market_key, &market);
    env.storage()
        .persistent()
        .set(&DataKey::Claim(market_id, wallet), &claim);

    Ok(net_payout)
}

fn is_nullifier_used_internal(env: &Env, market_id: u64, wallet: Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Nullifier(market_id, wallet))
        .unwrap_or(false)
}

fn require_admin(env: &Env, candidate: &Address) {
    let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
    candidate.require_auth();
    if admin != *candidate {
        panic!("admin required");
    }
}

fn gross_payout_for_width(
    stake: i128,
    width: i128,
    max_range_width: i128,
    max_multiplier: i128,
) -> Result<i128, Error> {
    if width <= 0 || max_range_width <= 0 || max_multiplier <= 0 {
        return Err(Error::InvalidRange);
    }

    let uncapped_multiplier = max_range_width / width;
    let multiplier = if uncapped_multiplier > max_multiplier {
        max_multiplier
    } else {
        uncapped_multiplier
    };

    Ok(stake * multiplier)
}
