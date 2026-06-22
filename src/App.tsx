import { Buffer } from "buffer";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  CheckCircle2,
  Coins,
  Copy,
  EyeOff,
  FileLock2,
  Gauge,
  Layers3,
  Link2,
  Lock,
  Loader2,
  LockKeyhole,
  Network,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Unlock,
  Zap,
  XCircle,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Toaster } from "@/components/ui/sonner";
import DotGrid from "@/components/DotGrid";
import PillNav from "@/components/PillNav";
import { useFreighterWallet } from "@/hooks/useFreighterWallet";
import { createPredictionCommitment, generatePredictionSalt } from "@/lib/commitment";
import {
  createPredictionBlob,
  decryptPredictionBlob,
  encryptPredictionBlob,
  type EncryptedPredictionBlob,
} from "@/lib/crypto/prediction-encryption";
import {
  claimPrediction,
  getCommitment,
  getMarket,
  getPoolBalance,
  storeCommitment,
  type TransactionResult,
} from "@/lib/contract/prism-market";
import {
  formatOutcomeValue,
  getMarketById,
  parseOutcomeDisplayValue,
  stellarMetricMarkets,
  type Market,
} from "@/lib/markets";
import { calculatePayoutPreview } from "@/lib/payout-tiers";
import { formatWalletAddress } from "@/lib/wallet";
import { fetchXlmUsdcPrice, type XlmUsdcPrice } from "@/lib/resolver/xlm-usdc-price";
import { getNativeXlmBalance } from "@/lib/stellar-network";
import type { Market as ChainMarket } from "@/generated/prism-market/src";
import { toast as showToast } from "sonner";

type Route =
  | { name: "landing" }
  | { name: "markets" }
  | { name: "market"; id: string };
type FlowState = "predict" | "committed" | "settled" | "claim" | "success" | "rejected";
type SealStage = "idle" | "commitment" | "signing" | "encrypting" | "submitting" | "confirmed";
type ClaimStage = "idle" | "decrypting" | "artifacts" | "witness" | "proof" | "submitting" | "confirmed";
type RejectionReason = "RangeMiss" | "AlreadyClaimed" | "InvalidProof" | "CommitmentMissing" | "Unknown";
type Currency = "XLM" | "USD";

type PredictionOutcome = {
  inRange: boolean;
  low: string;
  high: string;
  salt: string;
};

type DecryptedPrediction = {
  low: number;
  high: number;
  salt: string;
};

type FeedEntry = {
  wallet: string;
  time: string;
  demo?: boolean;
};

const defaultMarket = stellarMetricMarkets[0];
const STAKE_MIN_XLM = 5;
const STAKE_MAX_XLM = 10_000;
const FALLBACK_XLM_USD = 0.11;

const marketRows = [
  {
    id: stellarMetricMarkets[0].id,
    category: "Stellar",
    description: "Total XLM payments",
    status: "active",
    title: "Total XLM payments · Stellar testnet",
    range: "Reference range 599,500-600,500",
    volumeXlm: 500,
    predictions: "Live",
    payout: "2.8x",
  },
  {
    id: stellarMetricMarkets[1].id,
    category: "Stellar",
    description: "XLM/USDC price",
    status: "active",
    title: "XLM/USDC price · Stellar DEX",
    range: "Live mainnet SDEX oracle",
    volumeXlm: 5000,
    predictions: "Live",
    payout: "Up to 10x",
  },
  {
    id: "btc-price-dec-2026",
    category: "Crypto",
    description: "BTC price",
    status: "sample",
    title: "BTC price · Dec 31, 2026",
    range: "Popular range $122k-$148k",
    volumeXlm: 247,
    predictions: "Sample",
    payout: "2.4x",
  },
  {
    id: "elon-next-tweet-24h",
    category: "Social",
    description: "Elon's next tweet views",
    status: "sample",
    title: "Elon's next tweet views · 24h",
    range: "Popular range 38M-52M",
    volumeXlm: 128,
    predictions: "Sample",
    payout: "3.1x",
  },
  {
    id: "ronaldo-post-likes",
    category: "Social",
    description: "Ronaldo next post likes",
    status: "sample",
    title: "Ronaldo next post likes · 48h",
    range: "Popular range 8M-14M",
    volumeXlm: 92,
    predictions: "Sample",
    payout: "3.6x",
  },
];

const previewMarkets = [
  { category: "Stellar", title: "Total XLM payments · Stellar testnet", range: "599,500 - 600,500", odds: "42%", payout: "Up to 10x", volumeXlm: 500, id: stellarMetricMarkets[0].id },
  { category: "Stellar", title: "XLM/USDC price · Stellar DEX", range: "Live mainnet price", odds: "Live", payout: "Up to 10x", volumeXlm: 5000, id: stellarMetricMarkets[1].id },
  { category: "Crypto", title: "BTC price on Dec 31, 2026", range: "$122k - $148k", odds: "31%", payout: "3.2x", volumeXlm: 247, id: "btc-price-dec-2026" },
  { category: "Social", title: "Elon's next tweet views in 24h", range: "38M - 52M", odds: "27%", payout: "3.7x", volumeXlm: 128, id: "elon-next-tweet-24h" },
];

const seededSealedFeed: FeedEntry[] = [
  { wallet: "GBN3Z...RUFRE", time: "demo", demo: true },
  { wallet: "GABC...XY12", time: "demo", demo: true },
  { wallet: "GDEF...MN34", time: "demo", demo: true },
];

function App() {
  const wallet = useFreighterWallet();
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const selectedMarket = route.name === "market" ? getMarketById(route.id) ?? defaultMarket : defaultMarket;
  const [chainMarkets, setChainMarkets] = useState<Record<string, ChainMarket>>({});
  const [low, setLow] = useState(defaultMarket.defaultLow);
  const [high, setHigh] = useState(defaultMarket.defaultHigh);
  const [stake, setStake] = useState(10);
  const [currency, setCurrency] = useState<Currency>("XLM");
  const [xlmUsdPrice, setXlmUsdPrice] = useState(FALLBACK_XLM_USD);
  const [priceEstimate, setPriceEstimate] = useState(true);
  const [flowState, setFlowState] = useState<FlowState>("predict");
  const [commitmentHash, setCommitmentHash] = useState<string | null>(null);
  const [commitTx, setCommitTx] = useState<string | null>(null);
  const [claimTx, setClaimTx] = useState<string | null>(null);
  const [claimPayout, setClaimPayout] = useState<string | null>(null);
  const [revealedRange, setRevealedRange] = useState<{ low: string; high: string } | null>(null);
  const [outcome, setOutcome] = useState<PredictionOutcome | null>(null);
  const [decryptedPrediction, setDecryptedPrediction] = useState<DecryptedPrediction | null>(null);
  const [sealStage, setSealStage] = useState<SealStage>("idle");
  const [claimStage, setClaimStage] = useState<ClaimStage>("idle");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<RejectionReason>("Unknown");
  const [rejectionDetail, setRejectionDetail] = useState("No payout issued.");
  const [marketFilter, setMarketFilter] = useState("All");
  const [poolBalancesXlm, setPoolBalancesXlm] = useState<Record<string, number>>({});
  const [liveFeed, setLiveFeed] = useState<FeedEntry[]>(seededSealedFeed);
  const [walletBalanceXlm, setWalletBalanceXlm] = useState<number | null>(null);
  const [dexPriceState, setDexPriceState] = useState<{ current: XlmUsdcPrice | null; previous: XlmUsdcPrice | null }>({
    current: null,
    previous: null,
  });

  const chainMarket = chainMarkets[selectedMarket.numericId] ?? null;
  const sealedCount = chainMarket?.sealed_count ?? selectedMarket.sealedPredictions;
  const isSettled = Boolean(chainMarket?.settled);
  const actualValue = chainMarket?.actual_value?.toString() ?? "0";
  const payoutPreview = calculatePayoutPreview(low, high, selectedMarket.tiers);
  const economics = useMemo(
    () => calculateEconomics(low, high, stake, Number(selectedMarket.maxRangeWidth)),
    [high, low, selectedMarket.maxRangeWidth, stake],
  );
  const poolBalanceXlm = poolBalancesXlm[selectedMarket.numericId] ?? null;

  useEffect(() => {
    function onPop() {
      setRoute(parseRoute(window.location.pathname));
    }

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    setLow(selectedMarket.defaultLow);
    setHigh(selectedMarket.defaultHigh);
    setStake(10);
    setFlowState("predict");
    setCommitmentHash(null);
    setCommitTx(null);
    setClaimTx(null);
    setClaimPayout(null);
    setRevealedRange(null);
    setOutcome(null);
    setDecryptedPrediction(null);
    setSealStage("idle");
    setClaimStage("idle");
    setConfirmOpen(false);
    setUnlockOpen(false);
    setUnlocking(false);
    setLiveFeed(seededSealedFeed);
  }, [selectedMarket.numericId]);

  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;

    async function refreshPrice() {
      try {
        const response = await fetch("https://api.coinbase.com/v2/prices/XLM-USD/spot");
        if (!response.ok) throw new Error("price fetch failed");
        const payload = (await response.json()) as { data?: { amount?: string } };
        const nextPrice = Number(payload.data?.amount);
        if (!Number.isFinite(nextPrice) || nextPrice <= 0) throw new Error("invalid price");
        if (cancelled) return;
        setXlmUsdPrice(nextPrice);
        setPriceEstimate(false);
      } catch {
        if (cancelled) return;
        setXlmUsdPrice(FALLBACK_XLM_USD);
        setPriceEstimate(true);
      }
    }

    void refreshPrice();
    interval = window.setInterval(refreshPrice, 60_000);
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (
      selectedMarket.metricKind !== "xlm_usdc_price"
      || !dexPriceState.current
      || flowState !== "predict"
      || commitmentHash
      || low !== selectedMarket.defaultLow
      || high !== selectedMarket.defaultHigh
    ) {
      return;
    }

    const center = dexPriceState.current.scaledPrice;
    setLow(String(clamp(center - 500, selectedMarket.rangeMin, selectedMarket.rangeMax - 1)));
    setHigh(String(clamp(center + 500, selectedMarket.rangeMin + 1, selectedMarket.rangeMax)));
  }, [commitmentHash, dexPriceState.current, flowState, high, low, selectedMarket]);

  useEffect(() => {
    let cancelled = false;

    async function refreshMarkets() {
      const results = await Promise.allSettled(
        stellarMetricMarkets.map(async (market) => ({
          id: market.numericId,
          value: await getMarket(market.numericId, wallet.address ?? undefined),
        })),
      );
      if (cancelled) return;

      setChainMarkets((current) => {
        const next = { ...current };
        for (const result of results) {
          if (result.status === "fulfilled") next[result.value.id] = result.value.value;
        }
        return next;
      });

      const selected = results.find(
        (result) => result.status === "fulfilled" && result.value.id === selectedMarket.numericId,
      );
      if (selected?.status === "fulfilled" && selected.value.value.settled) {
        setFlowState((current) => current === "predict" || current === "committed" ? "settled" : current);
      }
    }

    void refreshMarkets();
    const interval = window.setInterval(refreshMarkets, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedMarket.numericId, wallet.address]);

  useEffect(() => {
    let cancelled = false;

    async function refreshLiveMarketData() {
      const balances = await Promise.allSettled(
        stellarMetricMarkets.map(async (market) => ({
          id: market.numericId,
          value: Number(await getPoolBalance(market.numericId, wallet.address ?? undefined)) / 10_000_000,
        })),
      );
      if (!cancelled) {
        setPoolBalancesXlm((current) => {
          const next = { ...current };
          for (const result of balances) {
            if (result.status === "fulfilled") next[result.value.id] = result.value.value;
          }
          return next;
        });
      }

      if (!wallet.address) {
        if (!cancelled) {
          setCommitmentHash(null);
          setLiveFeed(seededSealedFeed);
        }
        return;
      }

      try {
        const commitment = await getCommitment(selectedMarket.numericId, wallet.address);
        if (cancelled) return;
        setCommitmentHash(bytesToDecimal(commitment.commitment_hash));
        setFlowState((current) => {
          if (chainMarkets[selectedMarket.numericId]?.settled) return current === "success" || current === "rejected" ? current : "settled";
          return current === "predict" ? "committed" : current;
        });
        setLiveFeed([
          { wallet: formatWalletAddress(wallet.address), time: commitmentHash ? "just now" : "live" },
          ...seededSealedFeed,
        ]);
      } catch {
        if (!cancelled) {
          setCommitmentHash(null);
          setLiveFeed(seededSealedFeed);
        }
      }
    }

    void refreshLiveMarketData();
    const interval = window.setInterval(refreshLiveMarketData, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chainMarkets, commitmentHash, selectedMarket.numericId, wallet.address]);

  useEffect(() => {
    let cancelled = false;

    async function refreshWalletBalance() {
      if (!wallet.address) {
        setWalletBalanceXlm(null);
        return;
      }
      try {
        const balance = await getNativeXlmBalance(wallet.address);
        if (!cancelled) setWalletBalanceXlm(balance);
      } catch {
        if (!cancelled) setWalletBalanceXlm(null);
      }
    }

    void refreshWalletBalance();
    const interval = window.setInterval(refreshWalletBalance, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [commitTx, claimTx, wallet.address]);

  useEffect(() => {
    let cancelled = false;

    async function refreshDexPrice() {
      try {
        const price = await fetchXlmUsdcPrice();
        if (!cancelled) {
          setDexPriceState((current) => ({ current: price, previous: current.current }));
        }
      } catch {
        // Keep the last valid DEX price visible during transient Horizon failures.
      }
    }

    void refreshDexPrice();
    const interval = window.setInterval(refreshDexPrice, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openSampleMarket() {
    showToast("This market is for display only. Only Stellar Metrics markets are live in this demo.");
  }

  async function connectWallet() {
    try {
      const address = await wallet.connect();
      if (address) {
        const balance = await getNativeXlmBalance(address);
        setWalletBalanceXlm(balance);
      }
      return address;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Freighter could not connect";
      if (/install freighter/i.test(message)) {
        showToast.error("Install Freighter wallet to predict");
      } else if (/switch freighter|testnet/i.test(message)) {
        showToast.error("Switch Freighter to Stellar testnet");
      } else {
        showToast.error(message);
      }
      return null;
    }
  }

  async function placePrediction() {
    if (isSettled) {
      reject("Unknown", "This market is already settled.");
      return;
    }

    try {
      let address = wallet.address;
      if (wallet.status !== "connected" || !address) {
        address = await connectWallet();
      }

      if (!address) throw new Error("Connect Freighter before predicting.");
      if (payoutPreview.status !== "valid") throw new Error(payoutPreview.reason);

      setSealStage("commitment");
      const salt = generatePredictionSalt();
      const commitment = await createPredictionCommitment({
        low,
        high,
        salt,
        marketId: selectedMarket.numericId,
      });

      setSealStage("signing");
      const signature = await wallet.signEncryptionMessage();

      setSealStage("encrypting");
      const encrypted = await encryptPredictionBlob(
        createPredictionBlob({ marketId: selectedMarket.numericId, low, high, salt }),
        signature,
      );

      setSealStage("submitting");
      const result = await storeCommitment({
        walletAddress: address,
        marketId: selectedMarket.numericId,
        commitmentHash: commitment.commitment,
        encryptedBlob: encrypted,
        stake: xlmToStroops(stake),
        signTransaction: wallet.signSorobanTransaction,
      });

      setCommitmentHash(commitment.commitment);
      setCommitTx(result.txHash);
      setChainMarkets((current) => ({ ...current, [selectedMarket.numericId]: result.result }));
      setLiveFeed([
        { wallet: formatWalletAddress(address), time: "just now" },
        ...seededSealedFeed,
      ]);
      setSealStage("confirmed");
      setFlowState("committed");
      setConfirmOpen(false);
    } catch (error) {
      setSealStage("idle");
      setConfirmOpen(false);
      reject(mapErrorToReason(error), cleanRejectionDetail(error instanceof Error ? error.message : "Prediction could not be placed."));
    }
  }

  function showDecryptedOutcome(prediction: DecryptedPrediction) {
    const actual = BigInt(actualValue);
    const inRange = actual >= BigInt(prediction.low) && actual <= BigInt(prediction.high);
    setOutcome({
      low: prediction.low.toString(),
      high: prediction.high.toString(),
      salt: prediction.salt,
      inRange,
    });
    setFlowState("settled");
  }

  function openOutcomeUnlock() {
    if (decryptedPrediction) {
      showDecryptedOutcome(decryptedPrediction);
      return;
    }
    setUnlockOpen(true);
  }

  async function unlockAndCheckOutcome() {
    setUnlocking(true);
    try {
      const address = wallet.address ?? await connectWallet();
      if (!address) throw new Error("Connect Freighter before checking the result.");

      const prediction = await recoverPrediction(address);
      const decrypted = {
        low: Number(prediction.low),
        high: Number(prediction.high),
        salt: prediction.salt,
      };
      if (!Number.isSafeInteger(decrypted.low) || !Number.isSafeInteger(decrypted.high)) {
        throw new Error("The decrypted prediction contains invalid range values.");
      }
      setDecryptedPrediction(decrypted);
      showDecryptedOutcome(decrypted);
      setUnlockOpen(false);
    } catch (error) {
      showToast.error(cleanRejectionDetail(error instanceof Error ? error.message : "Unable to unlock prediction."));
    } finally {
      setUnlocking(false);
    }
  }

  async function claimWinnings() {
    if (!decryptedPrediction) {
      setFlowState("settled");
      setUnlockOpen(true);
      return;
    }

    try {
      const address = wallet.address ?? await connectWallet();
      if (!address) throw new Error("Connect Freighter before claiming.");

      setFlowState("claim");
      setClaimStage("decrypting");
      await new Promise((resolve) => window.setTimeout(resolve, 150));

      const prediction = decryptedPrediction;
      const actual = BigInt(actualValue);
      if (actual < BigInt(prediction.low) || actual > BigInt(prediction.high)) {
        throw new Error("RangeMiss");
      }

      const predictedLow = prediction.low.toString();
      const predictedHigh = prediction.high.toString();
      const preview = calculatePayoutPreview(predictedLow, predictedHigh, selectedMarket.tiers);
      if (preview.status !== "valid") throw new Error(preview.reason);

      const proofCommitment =
        commitmentHash ?? bytesToDecimal((await getCommitment(selectedMarket.numericId, address)).commitment_hash);
      if (!commitmentHash) setCommitmentHash(proofCommitment);

      setClaimStage("artifacts");
      await generateBrowserProof(
        {
          predicted_low: predictedLow,
          predicted_high: predictedHigh,
          salt: prediction.salt,
          actual_value: actualValue,
          market_id: selectedMarket.numericId,
          multiplier_tier: preview.tier.id.toString(),
          commitment: proofCommitment,
        },
        {
          onArtifactsLoaded: () => undefined,
          onProofStarted: () => setClaimStage("proof"),
        },
      );

      setClaimStage("submitting");
      const result: TransactionResult<bigint> = await claimPrediction({
        walletAddress: address,
        marketId: selectedMarket.numericId,
        predictedLow,
        predictedHigh,
        salt: prediction.salt,
        submittedCommitment: proofCommitment,
        signTransaction: wallet.signSorobanTransaction,
      });

      setClaimTx(result.txHash);
      setClaimPayout(`${Number(result.result) / 10_000_000} XLM`);
      setRevealedRange({ low: predictedLow, high: predictedHigh });
      setClaimStage("confirmed");
      setFlowState("success");
    } catch (error) {
      reject(mapErrorToReason(error), cleanRejectionDetail(error instanceof Error ? error.message : "Claim failed."));
    }
  }

  async function recoverPrediction(address = wallet.address) {
    if (!address) throw new Error("Connect Freighter first.");
    const signature = await wallet.signEncryptionMessage();
    const commitment = await getCommitment(selectedMarket.numericId, address);
    if (!commitmentHash) setCommitmentHash(bytesToDecimal(commitment.commitment_hash));
    setStake(Number(commitment.stake) / 10_000_000);
    const encrypted = JSON.parse(Buffer.from(commitment.encrypted_blob).toString("utf8")) as EncryptedPredictionBlob;
    const prediction = await decryptPredictionBlob(encrypted, signature);
    if (prediction.marketId !== selectedMarket.numericId) {
      throw new Error("The encrypted prediction belongs to a different market.");
    }
    return prediction;
  }

  function reject(reason: RejectionReason, detail: string) {
    setRejectionReason(reason);
    setRejectionDetail(detail);
    setFlowState("rejected");
  }

  return (
    <main className="min-h-screen bg-[var(--prism-bg)] text-[var(--prism-text)]">
      <TopNav
        connectedAddress={wallet.address}
        onConnect={() => void connectWallet()}
        onHome={() => navigate("/")}
        onMarkets={() => navigate("/markets")}
      />

      {route.name === "landing" ? (
        <LandingPage
          onOpenMarket={(id) => navigate(`/markets/${id}`)}
          onMarkets={() => navigate("/markets")}
        />
      ) : null}

      {route.name === "markets" ? (
        <MarketsPage
          currency={currency}
          filter={marketFilter}
          onFilter={setMarketFilter}
          onOpenMarket={(id) => navigate(`/markets/${id}`)}
          onOpenSample={openSampleMarket}
          chainMarkets={chainMarkets}
          poolBalancesXlm={poolBalancesXlm}
          priceEstimate={priceEstimate}
          xlmUsdPrice={xlmUsdPrice}
        />
      ) : null}

      {route.name === "market" ? (
        <MarketDetailPage
          actualValue={actualValue}
          market={selectedMarket}
          chainMarket={chainMarket}
          claimPayout={claimPayout}
          claimStage={claimStage}
          claimTx={claimTx}
          commitmentHash={commitmentHash}
          commitTx={commitTx}
          economics={economics}
          flowState={flowState}
          high={high}
          isConnected={wallet.status === "connected"}
          isSettled={isSettled}
          low={low}
          outcome={outcome}
          rejectionDetail={rejectionDetail}
          rejectionReason={rejectionReason}
          revealedRange={revealedRange}
          sealedCount={sealedCount}
          sealStage={sealStage}
          stake={stake}
          walletAddress={wallet.address}
          walletBalanceXlm={walletBalanceXlm}
          dexPriceState={dexPriceState}
          currency={currency}
          priceEstimate={priceEstimate}
          poolBalanceXlm={poolBalanceXlm}
          liveFeed={liveFeed}
          xlmUsdPrice={xlmUsdPrice}
          onClaim={() => void claimWinnings()}
          onConnect={() => void connectWallet()}
          onDuplicate={() => void claimWinnings()}
          onHighChange={setHigh}
          onLowChange={setLow}
          onCurrencyChange={setCurrency}
          onOpenConfirm={() => setConfirmOpen(true)}
          onReset={() => setFlowState(isSettled ? "settled" : "predict")}
          onStakeChange={setStake}
          onCheckOutcome={openOutcomeUnlock}
          onViewAccuracy={() => showToast("Hall of Accuracy is coming in a future version.")}
          onMarkets={() => navigate("/markets")}
        />
      ) : null}

      <ConfirmPredictionDialog
        economics={economics}
        market={selectedMarket}
        high={high}
        low={low}
        open={confirmOpen}
        currency={currency}
        priceEstimate={priceEstimate}
        xlmUsdPrice={xlmUsdPrice}
        sealStage={sealStage}
        stake={stake}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void placePrediction()}
      />

      <UnlockPredictionDialog
        open={unlockOpen}
        unlocking={unlocking}
        onCancel={() => setUnlockOpen(false)}
        onUnlock={() => void unlockAndCheckOutcome()}
      />

      <Toaster richColors closeButton />
    </main>
  );
}

function TopNav({
  connectedAddress,
  onConnect,
  onHome,
  onMarkets,
}: {
  connectedAddress: string | null;
  onConnect: () => void;
  onHome: () => void;
  onMarkets: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <PillNav
        baseColor="#18201D"
        brand="PRISM"
        ease="power2.out"
        hoveredPillTextColor="#18201D"
        hoverColor="#B5F35B"
        initialLoadAnimation
        items={[
          { label: "Markets", active: window.location.pathname.startsWith("/markets"), onSelect: onMarkets },
          { label: "How it works", href: "/#how" },
          { label: "Privacy", href: "/#privacy" },
          { label: connectedAddress ? formatWalletAddress(connectedAddress) : "Connect wallet", onSelect: connectedAddress ? undefined : onConnect },
        ]}
        logo={<PrismLogo />}
        onLogoClick={onHome}
        pillColor="#202925"
        pillTextColor="#F5F1E6"
      />
    </header>
  );
}

function LandingPage({
  onOpenMarket,
  onMarkets,
}: {
  onOpenMarket: (id: string) => void;
  onMarkets: () => void;
}) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border bg-background">
        <DotGrid
          activeColor="#B5F35B"
          baseColor="#202925"
          className="dot-grid-hero"
          dotSize={5}
          gap={15}
          idleMotion={2.4}
          idleSpeed={0.0012}
          maxSpeed={5000}
          proximity={140}
          resistance={650}
          returnDuration={1.3}
          shockRadius={280}
          shockStrength={7}
          speedTrigger={20}
        />
        <div className="relative z-10 mx-auto grid max-w-6xl gap-14 px-5 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
          <div>
            <Badge className="rounded-full border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-primary" />
              Zero-knowledge prediction market
            </Badge>
            <h1 className="mt-7 max-w-2xl text-4xl font-medium leading-[1.04] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Don't just predict
              <br />
              <span className="italic text-primary">yes or no.</span> Predict
              <br />
              the range.
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
              PRISM lets you stake on a range of outcomes and earn more the tighter you are right. Every position is shielded with zero-knowledge proofs, so your edge stays yours.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button className="h-11 rounded-[var(--radius)] bg-primary px-5 font-semibold text-primary-foreground hover:bg-primary/90" onClick={onMarkets}>
                Explore markets <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-8">
              <LandingStat label="Total volume" value="$412M" />
              <LandingStat label="Open markets" value="1,840" />
              <LandingStat label="Proofs verified" value="9.1M" />
            </dl>
          </div>
          <RangeCard />
        </div>
      </section>

      <section id="privacy" className="border-b border-border/60 bg-background px-5 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-medium text-primary">Why PRISM</p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            A prediction market built for nuance and privacy
          </h2>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Most markets force you into a coin flip. PRISM gives you the full spectrum and keeps it confidential.
          </p>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={<SlidersHorizontal />} title="Bet in range" copy="Stake on a continuous band of outcomes instead of binary yes/no." />
            <FeatureCard icon={<EyeOff />} title="Zero-knowledge privacy" copy="Positions are shielded with ZK proofs. Trade your conviction without leaking your strategy." />
            <FeatureCard icon={<Gauge />} title="Sharper payouts" copy="The tighter and more accurate your range, the higher your multiplier. Precision is rewarded." />
            <FeatureCard icon={<Layers3 />} title="Pool-based settlement" copy="Losers fund winners. Tighter predictions earn a larger share of the pool." />
            <FeatureCard icon={<Coins />} title="Instant settlement" copy="On-chain resolution settles winning ranges automatically when the resolver reports." />
            <FeatureCard icon={<Network />} title="Verifiable by anyone" copy="Every payout is backed by a public proof. Trustless, auditable, impossible to fake." />
          </div>
        </div>
      </section>

      <section id="how" className="border-b border-border/60 bg-background px-5 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-medium text-primary">How it works</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">From conviction to payout in four steps</h2>
          <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {["Choose a market", "Set your range", "Stake privately", "Settle and collect"].map((title, index) => (
              <li className="bg-card p-7" key={title}>
                <p className="font-mono text-sm font-semibold text-primary">{String(index + 1).padStart(2, "0")}</p>
                <h3 className="mt-7 text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{stepCopy(index)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="markets" className="border-b border-border/60 bg-background px-5 py-24 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-primary">Live markets</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Trade ranges on what matters</h2>
            </div>
            <Button className="border-border bg-transparent text-foreground hover:bg-secondary/70" variant="outline" onClick={onMarkets}>
              View all
            </Button>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {previewMarkets.map((market) => (
              <PreviewMarketCard
                currency="XLM"
                key={market.id}
                market={market}
                priceEstimate={false}
                xlmUsdPrice={FALLBACK_XLM_USD}
                onClick={stellarMetricMarkets.some((item) => item.id === market.id) ? () => onOpenMarket(market.id) : onMarkets}
              />
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}

function RangeCard() {
  const distribution = [3, 5, 7, 9, 12, 16, 19, 22, 24, 23, 20, 17, 14, 11, 8, 6, 4, 3];
  const minValue = 0;
  const maxValue = 1000;
  const [range, setRange] = useState<[number, number]>([5, 10]);
  const low = range[0];
  const high = range[1];
  const lowValue = valueAtDistributionIndex(low, minValue, maxValue, distribution.length);
  const highValue = valueAtDistributionIndex(high, minValue, maxValue, distribution.length);

  const { multiplier, probability } = useMemo(() => {
    const total = distribution.reduce((sum, item) => sum + item, 0);
    const inRange = distribution.slice(low, high + 1).reduce((sum, item) => sum + item, 0);
    const nextProbability = Math.max(2, Math.round((inRange / total) * 100));
    return {
      multiplier: (100 / nextProbability).toFixed(2),
      probability: nextProbability,
    };
  }, [distribution, high, low]);

  function handleRangeChange(values: number[]) {
    if (values.length !== 2) return;
    const nextLow = Math.min(values[0], values[1]);
    const nextHigh = Math.max(values[0], values[1]);
    if (nextHigh - nextLow >= 1) setRange([nextLow, nextHigh]);
  }

  return (
    <Card className="rounded-2xl border border-border bg-card p-0 shadow-2xl shadow-black/30">
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total XLM payments · Stellar testnet</p>
          <CardTitle className="mt-1 text-lg font-semibold text-card-foreground">Pick your range</CardTitle>
        </div>
        <Badge className="rounded-full border-0 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <Lock className="mr-1 h-3 w-3" />
          ZK-shielded
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="mt-2 flex h-36 items-end gap-1">
          {distribution.map((height, index) => {
            const inRange = index >= low && index <= high;
            return (
              <div
                className={`flex-1 rounded-t-sm transition-colors duration-200 ${inRange ? "bg-primary" : "bg-secondary"}`}
                key={index}
                style={{ height: `${(height / 24) * 100}%` }}
              />
            );
          })}
        </div>
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Lower bound</span>
            <span className="font-mono text-foreground">{lowValue} XLM</span>
          </div>
          <Slider
            className="w-full"
            max={distribution.length - 1}
            min={0}
            step={1}
            value={range}
            onValueChange={handleRangeChange}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Upper bound</span>
            <span className="font-mono text-foreground">{highValue} XLM</span>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 rounded-xl border border-border bg-secondary/50 p-4">
          <MiniStat label="Range" value={`${lowValue}-${highValue}`} />
          <MiniStat label="Implied odds" value={`${probability}%`} />
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">Payout</p>
            <p className="mt-1 inline-flex items-center gap-1 font-mono text-sm font-semibold text-primary">
              <TrendingUp className="h-3.5 w-3.5" />
              {multiplier}x
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MarketsPage({
  chainMarkets,
  currency,
  filter,
  onFilter,
  onOpenMarket,
  onOpenSample,
  poolBalancesXlm,
  priceEstimate,
  xlmUsdPrice,
}: {
  chainMarkets: Record<string, ChainMarket>;
  currency: Currency;
  filter: string;
  onFilter: (filter: string) => void;
  onOpenMarket: (id: string) => void;
  onOpenSample: () => void;
  poolBalancesXlm: Record<string, number>;
  priceEstimate: boolean;
  xlmUsdPrice: number;
}) {
  const [search, setSearch] = useState("");
  const categories = ["All", "Stellar", "Crypto", "Social"];
  const normalizedSearch = search.trim().toLowerCase();
  const rows = marketRows
    .map((row) => {
      const market = getMarketById(row.id);
      if (!market || row.status !== "active") return row;
      return {
        ...row,
        predictions: (chainMarkets[market.numericId]?.sealed_count ?? market.sealedPredictions).toString(),
        volumeXlm: poolBalancesXlm[market.numericId] ?? row.volumeXlm,
      };
    })
    .filter((row) => filter === "All" || row.category === filter)
    .filter((row) => !normalizedSearch || row.title.toLowerCase().includes(normalizedSearch));

  return (
    <section id="markets" className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6 sm:py-20">
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Browse Markets</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Sealed ranges. Private predictions. Provable results.
        </p>
      </div>

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Market categories">
          {categories.map((category) => (
            <Button
              className={`h-9 rounded-full px-4 text-sm ${
                filter === category
                  ? "border-primary bg-primary/10 text-primary hover:bg-primary/15"
                  : "border-[#222228] bg-[#141418] text-muted-foreground hover:border-[#34343c] hover:text-foreground"
              }`}
              key={category}
              onClick={() => onFilter(category)}
              size="sm"
              type="button"
              variant="outline"
            >
              {category}
            </Button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search markets"
            className="h-10 border-[#222228] bg-[#141418] pl-9 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search markets"
            type="search"
            value={search}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((market) => {
          const isLive = market.status === "active";
          return (
            <Card
              className={`group flex min-h-[340px] flex-col rounded-xl border bg-[#141418] p-0 transition-all duration-200 ${
                isLive
                  ? "border-[#2b3432] hover:border-primary hover:shadow-[0_0_24px_rgba(0,194,168,0.12)]"
                  : "border-[#222228] opacity-70 hover:border-[#34343c] hover:opacity-85"
              }`}
              key={market.id}
            >
              <CardHeader className="space-y-0 px-5 pb-0 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Badge className="border border-[#303036] bg-[#1b1b20] text-xs font-medium text-foreground">
                      {isLive ? <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-400" /> : null}
                      <Lock className="mr-1 h-3 w-3 text-primary" />
                      {market.category}
                    </Badge>
                    {isLive ? (
                      <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                        <Zap className="h-3 w-3" />
                        Stellar Native
                      </p>
                    ) : null}
                  </div>
                  {isLive ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-green-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      Live
                    </span>
                  ) : (
                    <Badge className="border border-[#303036] bg-[#1b1b20] text-muted-foreground">Sample</Badge>
                  )}
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col px-5 pb-5 pt-5">
                <h2 className="line-clamp-2 min-h-[48px] text-lg font-semibold leading-6 text-foreground">
                  {market.title}
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">{market.range.replace("Reference range", "Popular range:")}</p>

                <div className="mt-7 grid grid-cols-3 gap-3 border-t border-[#222228] pt-5">
                  <MarketCardStat
                    label="Volume"
                    value={formatMarketAmount(market.volumeXlm, currency, xlmUsdPrice, priceEstimate)}
                  />
                  <MarketCardStat label="Predictions" value={market.predictions} />
                  <MarketCardStat label="Avg Payout" value={market.payout} accent />
                </div>

                <Button
                  className={`mt-auto h-11 w-full rounded-md ${
                    isLive
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_18px_rgba(0,194,168,0.2)]"
                      : "border-[#303036] bg-[#1b1b20] text-muted-foreground hover:bg-[#222228] hover:text-foreground"
                  }`}
                  onClick={isLive ? () => onOpenMarket(market.id) : onOpenSample}
                  type="button"
                  variant={isLive ? "default" : "outline"}
                >
                  {isLive ? "Trade →" : "Coming Soon"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#303036] bg-[#141418] px-6 py-14 text-center text-sm text-muted-foreground">
          No markets match your search.
        </div>
      ) : null}
    </section>
  );
}

function MarketCardStat({ accent = false, label, value }: { accent?: boolean; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-mono text-sm font-semibold ${accent ? "text-primary" : "text-foreground"}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function MarketDetailPage(props: {
  actualValue: string;
  market: Market;
  currency: Currency;
  chainMarket: ChainMarket | null;
  claimPayout: string | null;
  claimStage: ClaimStage;
  claimTx: string | null;
  commitmentHash: string | null;
  commitTx: string | null;
  economics: ReturnType<typeof calculateEconomics>;
  flowState: FlowState;
  high: string;
  isConnected: boolean;
  isSettled: boolean;
  low: string;
  outcome: PredictionOutcome | null;
  rejectionDetail: string;
  rejectionReason: RejectionReason;
  revealedRange: { low: string; high: string } | null;
  sealedCount: number;
  sealStage: SealStage;
  stake: number;
  priceEstimate: boolean;
  poolBalanceXlm: number | null;
  liveFeed: FeedEntry[];
  xlmUsdPrice: number;
  walletAddress: string | null;
  walletBalanceXlm: number | null;
  dexPriceState: { current: XlmUsdcPrice | null; previous: XlmUsdcPrice | null };
  onCheckOutcome: () => void;
  onClaim: () => void;
  onConnect: () => void;
  onDuplicate: () => void;
  onCurrencyChange: (value: Currency) => void;
  onHighChange: (value: string) => void;
  onLowChange: (value: string) => void;
  onMarkets: () => void;
  onOpenConfirm: () => void;
  onReset: () => void;
  onStakeChange: (value: number) => void;
  onViewAccuracy: () => void;
}) {
  return (
    <main className="flex-1 px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
          <div>
            <button className="mb-5 block text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground" onClick={props.onMarkets} type="button">
              Markets / {props.market.shortQuestion}
            </button>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-0 bg-secondary/50 text-sm font-medium text-foreground">Stellar Metrics</Badge>
              <Badge className="border-0 bg-primary/20 text-sm font-medium text-primary">
                <Lock className="mr-1 h-3.5 w-3.5" />
                ZK-shielded
              </Badge>
            </div>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{props.market.question}</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{props.market.description}</p>
          </div>
          {props.market.metricKind === "xlm_usdc_price" ? (
            <DexPriceTicker priceState={props.dexPriceState} />
          ) : null}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MarketStat
              detail={props.poolBalanceXlm === null ? "Seed fallback" : "Live contract liquidity"}
              label="Pool"
              value={formatMarketAmount(props.poolBalanceXlm ?? (props.market.metricKind === "xlm_usdc_price" ? 5000 : 500), props.currency, props.xlmUsdPrice, props.priceEstimate)}
            />
            <MarketStat label="Predictions" value={props.sealedCount.toString()} />
            <MarketStat detail={props.isSettled ? "Resolved" : "Resolver-triggered"} label="Closes" value={props.isSettled ? "Settled" : "Open"} />
            <MarketStat
              detail={props.isSettled && props.outcome ? props.outcome.inRange ? "Claim available" : "No payout" : undefined}
              label="Your position"
              value={
                props.isSettled && props.outcome
                  ? props.outcome.inRange ? "Winner ✓" : "Range missed"
                  : props.commitmentHash ? "Placed ✓" : "None"
              }
            />
          </div>
          <div className={`rounded-xl border p-4 ${props.isSettled ? "border-blue-500/25 bg-blue-500/10" : "border-border/40 bg-secondary/20"}`}>
            {props.isSettled ? (
              <div>
                <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-blue-300">
                  <span className="h-2 w-2 rounded-full bg-blue-400" />
                  Settled
                </p>
                <p className="mt-3 font-mono text-3xl font-semibold text-foreground">
                  Result: {formatOutcomeValue(props.market, props.actualValue)}
                </p>
                <a
                  className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                  href={props.market.metricKind === "xlm_usdc_price" ? props.dexPriceState.current?.source ?? "https://horizon-testnet.stellar.org" : "https://horizon-testnet.stellar.org/payments"}
                  rel="noreferrer"
                  target="_blank"
                >
                  Source: Stellar Horizon · verify <Link2 className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
                <p className="text-base font-semibold text-foreground">Accepting predictions</p>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 p-5">
            <h2 className="mb-4 text-lg font-semibold text-foreground">Sealed predictions feed</h2>
            <div className="space-y-3">
              {props.liveFeed.map((item) => (
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/20 bg-background/50 p-3" key={`${item.wallet}-${item.time}`}>
                  <span className="flex items-center gap-2">
                    <LockKeyhole className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{item.wallet}</span>
                    <span className="text-xs text-muted-foreground">sealed a prediction</span>
                    {item.demo ? (
                      <span className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">demo</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.time}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs italic text-muted-foreground">On other markets you'd see exactly what they bet. Here you see nothing.</p>
          </div>
          </div>
          <div className="lg:col-span-1">
            <BettingPanel {...props} />
          </div>
        </div>
      </div>
    </main>
  );
}

function BettingPanel(props: Parameters<typeof MarketDetailPage>[0]) {
  if (props.flowState === "committed") return <CommittedPanel {...props} />;
  if (props.flowState === "settled") return <SettlementPanel {...props} />;
  if (props.flowState === "claim") return <ClaimProgressPanel {...props} />;
  if (props.flowState === "success") return <SuccessPanel {...props} />;
  if (props.flowState === "rejected") return <RejectedPanel {...props} />;

  const busy = props.sealStage !== "idle" && props.sealStage !== "confirmed";
  const disabled = busy || props.economics.invalid;
  const rangeValues = [Number(props.low || 0), Number(props.high || 0)];
  const rangeMin = props.market.rangeMin;
  const rangeMax = props.market.rangeMax;
  const rangeSpan = rangeMax - rangeMin;
  const lowerPercent = clamp(((rangeValues[0] - rangeMin) / rangeSpan) * 100, 0, 100);
  const upperPercent = clamp(((rangeValues[1] - rangeMin) / rangeSpan) * 100, 0, 100);
  const stakePercent = stakeToSliderPosition(props.stake);

  function updateRange(values: number[]) {
    const sortedLow = Math.min(values[0] ?? rangeMin, values[1] ?? rangeMax);
    const sortedHigh = Math.max(values[0] ?? rangeMin, values[1] ?? rangeMax);
    const nextLow = clamp(Math.floor(sortedLow), rangeMin, rangeMax - 1);
    const nextHigh = clamp(Math.floor(sortedHigh), nextLow + 1, rangeMax);
    props.onLowChange(String(nextLow));
    props.onHighChange(String(nextHigh));
  }

  function updateStakeFromDisplay(value: string) {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    if (props.currency === "USD") {
      props.onStakeChange(clamp(next / props.xlmUsdPrice, STAKE_MIN_XLM, STAKE_MAX_XLM));
      return;
    }
    props.onStakeChange(clamp(next, STAKE_MIN_XLM, STAKE_MAX_XLM));
  }

  function updateLowBound(value: string) {
    const next = parseOutcomeDisplayValue(props.market, value);
    if (next === null) return;
    props.onLowChange(String(clamp(Number(next), rangeMin, Math.max(rangeMin, rangeValues[1] - 1))));
  }

  function updateHighBound(value: string) {
    const next = parseOutcomeDisplayValue(props.market, value);
    if (next === null) return;
    props.onHighChange(String(clamp(Number(next), Math.min(rangeMax, rangeValues[0] + 1), rangeMax)));
  }

  return (
    <div className="sticky top-6 rounded-2xl border border-border/40 bg-card p-6">
      <h2 className="mb-6 text-2xl font-semibold text-foreground">Your Prediction</h2>
      <ToggleGroup className="mb-8 w-fit rounded-lg bg-secondary/30 p-1" type="single" value={props.currency} onValueChange={(value) => {
            if (value === "XLM" || value === "USD") props.onCurrencyChange(value);
          }}>
        <ToggleGroupItem className="rounded px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" value="XLM">
          XLM
        </ToggleGroupItem>
        <ToggleGroupItem className="rounded px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground" value="USD">
          USD
        </ToggleGroupItem>
      </ToggleGroup>
      <div className="space-y-6">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Price range selector</span>
            <span className="text-sm font-semibold text-primary">
              {formatOutcomeValue(props.market, props.low)} - {formatOutcomeValue(props.market, props.high)}
            </span>
          </div>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatOutcomeValue(props.market, rangeMin)}</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-secondary">
              <div
                className="absolute h-full rounded-full bg-primary"
                style={{ left: `${lowerPercent}%`, width: `${Math.max(0, upperPercent - lowerPercent)}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{formatOutcomeValue(props.market, rangeMax)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
          <BoundInput
            label="Lower bound"
            market={props.market}
            value={props.low}
            onChange={updateLowBound}
          />
          <BoundInput
            label="Upper bound"
            market={props.market}
            value={props.high}
            onChange={updateHighBound}
          />
          </div>
          <Slider className="mt-4" max={rangeMax} min={rangeMin} step={1} value={rangeValues} onValueChange={updateRange} />
        </div>
        <div className="grid grid-cols-3 gap-3 border-b border-border/40 pb-8">
          <PanelStat label="Range width" value={formatOutcomeWidth(props.market, props.economics.width)} />
          <PanelStat label="Coverage" value={`${props.economics.coverage.toFixed(1)}%`} />
          <PanelStat label="Multiplier" value={`~${props.economics.multiplier.toFixed(1)}x`} green />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Stake amount</span>
            <span className="text-sm font-semibold text-primary">{formatStakeDisplay(props.stake, props.currency, props.xlmUsdPrice, props.priceEstimate)}</span>
          </div>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatStakeDisplay(STAKE_MIN_XLM, props.currency, props.xlmUsdPrice, props.priceEstimate)}</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-secondary">
              <div className="absolute left-0 h-full rounded-full bg-primary" style={{ width: `${stakePercent}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{formatStakeDisplay(STAKE_MAX_XLM, props.currency, props.xlmUsdPrice, props.priceEstimate)}</span>
          </div>
          <Slider className="prisma-range" max={100} min={0} step={1} value={[stakePercent]} onValueChange={(value) => props.onStakeChange(sliderPositionToStake(value[0]))} />
          <div className="relative mt-3">
            {props.currency === "USD" ? (
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">$</span>
            ) : null}
            <Input
              className={`border-border/40 bg-background/50 font-mono text-foreground ${props.currency === "USD" ? "pl-8" : "pr-14"}`}
              inputMode="decimal"
              value={props.currency === "USD" ? formatUsdInputValue(props.stake * props.xlmUsdPrice) : formatDisplayValue(props.stake, 0)}
              onChange={(event) => updateStakeFromDisplay(event.target.value)}
            />
            {props.currency === "XLM" ? (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">XLM</span>
            ) : null}
          </div>
        </div>
        <div className="mb-8 rounded-lg border border-border/40 bg-secondary/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">If correct</p>
                <p className="font-semibold text-foreground">Stake</p>
                <p className="font-mono text-primary">{formatStakeDisplay(props.stake, props.currency, props.xlmUsdPrice, props.priceEstimate)}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-primary" />
              <div className="text-right">
                <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Potential payout</p>
                <p className="font-semibold text-foreground">Return</p>
                <p className="font-mono text-primary">{formatStakeDisplay(props.economics.returnAmount, props.currency, props.xlmUsdPrice, props.priceEstimate)}</p>
                <p className="text-sm font-medium text-primary">Profit +{formatStakeDisplay(props.economics.profit, props.currency, props.xlmUsdPrice, props.priceEstimate)}</p>
              </div>
            </div>
        </div>
        <p className="mb-6 text-xs italic text-muted-foreground">Payout = your share of total pool weighted by precision. Tighter range = larger share.</p>
        {props.isConnected && props.walletAddress ? (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-3 py-2">
            <span className="font-mono text-xs text-foreground">{formatWalletAddress(props.walletAddress)}</span>
            <span className="text-xs text-muted-foreground">
              Balance: {props.walletBalanceXlm === null ? "--" : `${formatDisplayValue(props.walletBalanceXlm, 2)} XLM`}
            </span>
          </div>
        ) : null}
        <Button className="h-12 w-full border-primary text-primary hover:bg-primary/10" disabled={disabled} onClick={props.isConnected ? props.onOpenConfirm : props.onConnect} variant="outline">
          {busy ? "Placing..." : props.isConnected ? "Place Prediction" : "Connect Freighter to Predict"}
        </Button>
      </div>
    </div>
  );
}

function CommittedPanel(props: Parameters<typeof MarketDetailPage>[0]) {
  return (
    <Card className="prism-card-soft sticky top-24 h-fit">
      <CardContent className="space-y-5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--prism-lime)]" />
        <h2 className="text-3xl font-black text-white">Prediction Placed</h2>
        <p className="text-sm text-foreground">Commitment sealed on Stellar testnet</p>
        <Badge className="mx-auto max-w-full border-[var(--prism-border)] bg-[#0b110d] font-mono text-[var(--prism-muted)]">
          {formatCommitmentHash(props.commitmentHash)}
          <button className="ml-2 text-[var(--prism-lime)]" onClick={() => props.commitmentHash && void navigator.clipboard.writeText(commitmentToHex(props.commitmentHash))} type="button">
            <Copy className="h-3 w-3" />
          </button>
        </Badge>
        <div className="space-y-1 text-sm text-[var(--prism-muted)]">
          <p>Your range is hidden until settlement.</p>
          <p>Check back after the market resolves to claim.</p>
        </div>
        <ExpertLink txHash={props.commitTx} />
      </CardContent>
    </Card>
  );
}

function SettlementPanel(props: Parameters<typeof MarketDetailPage>[0]) {
  const outcomeEconomics = props.outcome
    ? calculateEconomics(props.outcome.low, props.outcome.high, props.stake, Number(props.market.maxRangeWidth))
    : props.economics;

  return (
    <Card className="prism-card-soft sticky top-24 h-fit">
      <CardContent className="space-y-6 p-6">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--prism-muted)]">Actual value</p>
          <p className="mt-3 text-5xl font-black text-white">{formatOutcomeValue(props.market, props.actualValue)}</p>
        </div>
        {props.outcome ? (
          <div className={`rounded-2xl border p-5 ${props.outcome.inRange ? "border-[rgba(174,245,92,0.22)] bg-[rgba(174,245,92,0.08)]" : "border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.08)]"}`}>
            <div className="flex items-start gap-3">
              {props.outcome.inRange ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prism-lime)]" />
              ) : (
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--prism-red)]" />
              )}
              <div className="min-w-0 space-y-2 font-mono text-sm">
                <p className="text-white">
                  Your prediction: {formatOutcomeValue(props.market, props.outcome.low)} — {formatOutcomeValue(props.market, props.outcome.high)}
                </p>
                <p className="text-white">
                  Actual result: {formatOutcomeValue(props.market, props.actualValue)}
                  <span className={props.outcome.inRange ? "text-[var(--prism-lime)]" : "text-[var(--prism-red)]"}>
                    {props.outcome.inRange ? " ← inside your range" : " ← outside your range"}
                  </span>
                </p>
              </div>
            </div>

            {props.outcome.inRange ? (
              <p className="mt-5 border-t border-white/10 pt-4 text-sm text-white">
                Potential payout: <span className="font-mono font-bold text-[var(--prism-lime)]">{formatDisplayValue(outcomeEconomics.returnAmount, 2)} XLM ({outcomeEconomics.multiplier.toFixed(1)}x)</span>
              </p>
            ) : (
              <p className="mt-5 border-t border-white/10 pt-4 text-sm leading-relaxed text-muted-foreground">
                Your {formatDisplayValue(props.stake, 2)} XLM stake funded the winner pool.
              </p>
            )}
          </div>
        ) : null}
        {props.outcome?.inRange ? (
          <Button className="h-12 w-full rounded-xl bg-[var(--prism-lime)] font-black text-[#08100b] hover:bg-[#c2ff69]" onClick={props.onClaim}>
            Generate Proof &amp; Claim →
          </Button>
        ) : props.outcome ? (
          <Button className="h-12 w-full rounded-xl border-border bg-transparent text-foreground hover:bg-secondary/70" onClick={props.onViewAccuracy} variant="outline">
            View Hall of Accuracy
          </Button>
        ) : (
          <Button className="h-12 w-full rounded-xl bg-[var(--prism-lime)] font-black text-[#08100b] hover:bg-[#c2ff69]" onClick={props.onCheckOutcome}>
            Unlock &amp; Check My Result
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimProgressPanel(props: Parameters<typeof MarketDetailPage>[0]) {
  const steps: Array<[ClaimStage, string, string]> = [
    ["decrypting", "Reading your prediction", "from memory"],
    ["artifacts", "Building witness", "locally"],
    ["proof", "Generating Groth16 proof", "calculating..."],
    ["submitting", "Submitting claim", "Stellar testnet"],
  ];
  const index = Math.max(0, steps.findIndex(([id]) => id === props.claimStage));
  return (
    <Card className="prism-card-soft sticky top-24 h-fit">
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-2xl font-black text-white">Generating your proof...</h2>
          <p className="mt-2 text-sm text-muted-foreground">Keep this tab open while PRISM proves and submits your claim.</p>
        </div>
        <Progress value={((index + 1) / steps.length) * 100} />
        <div className="space-y-3">
          {steps.map(([id, label, detail], stepIndex) => (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--prism-border)] bg-[#0b110d] p-3" key={id}>
              {stepIndex < index ? <Check className="h-4 w-4 text-[var(--prism-lime)]" /> : props.claimStage === id ? <Loader2 className="h-4 w-4 animate-spin text-[var(--prism-lime)]" /> : <span className="h-4 w-4 rounded-full border border-[var(--prism-border)]" />}
              <span className="flex-1 text-sm font-semibold text-white">{label}</span>
              <span className="text-xs text-muted-foreground">{stepIndex <= index ? detail : ""}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SuccessPanel(props: Parameters<typeof MarketDetailPage>[0]) {
  const claimPayoutXlm = props.claimPayout ? parseXlmAmount(props.claimPayout) : 40;
  const gross = props.economics.returnAmount;
  const fee = gross * 0.02;
  const profit = gross - props.stake;
  return (
    <Card className="prism-card-soft sticky top-24 h-fit">
      <CardContent className="space-y-5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--prism-lime)]" />
        <div>
          <h2 className="text-3xl font-black text-white">Claimed Successfully</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your winning range is now revealed.</p>
        </div>
        <div className="space-y-2 rounded-xl border border-[var(--prism-border)] bg-[#0b110d] p-4 text-left font-mono text-sm text-white">
          <SuccessRow
            label="Your prediction"
            value={props.revealedRange ? `${formatOutcomeValue(props.market, props.revealedRange.low)} — ${formatOutcomeValue(props.market, props.revealedRange.high)}` : "--"}
          />
          <SuccessRow label="Actual result" value={`${formatOutcomeValue(props.market, props.actualValue)} ✓ Inside range`} />
          <div className="my-3 border-t border-border/40" />
          <SuccessRow label="Stake" value={`${formatDisplayValue(props.stake, 2)} XLM`} />
          <SuccessRow label="Return" value={`${formatDisplayValue(gross, 2)} XLM`} />
          <SuccessRow label="Profit" value={`+${formatDisplayValue(profit, 2)} XLM (${props.economics.multiplier.toFixed(1)}x)`} green />
          <SuccessRow label="Fee" value={`${formatDisplayValue(fee, 2)} XLM (2%)`} />
          <SuccessRow label="Net" value={`${formatDisplayValue(claimPayoutXlm, 2)} XLM`} green />
        </div>
        <ExpertLink txHash={props.claimTx} />
        <Button className="w-full rounded-xl border border-[var(--prism-border)] bg-transparent text-white hover:bg-[#151f17]" variant="outline" onClick={props.onDuplicate}>
          Try duplicate claim
        </Button>
      </CardContent>
    </Card>
  );
}

function RejectedPanel(props: Parameters<typeof MarketDetailPage>[0]) {
  return (
    <Card className="sticky top-24 h-fit border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.11)]">
      <CardContent className="space-y-5 p-6 text-center">
        <XCircle className="mx-auto h-16 w-16 text-[var(--prism-red)]" />
        <h2 className="text-4xl font-black text-white">{props.rejectionReason === "AlreadyClaimed" ? "Already Claimed" : props.rejectionReason === "RangeMiss" ? "Range Missed" : "REJECTED"}</h2>
        {props.rejectionReason === "RangeMiss" && props.outcome ? (
          <div className="space-y-2 rounded-xl border border-red-400/20 bg-black/15 p-4 text-left font-mono text-sm">
            <SuccessRow label="Your prediction" value={`${formatOutcomeValue(props.market, props.outcome.low)} — ${formatOutcomeValue(props.market, props.outcome.high)}`} />
            <SuccessRow label="Actual result" value={`${formatOutcomeValue(props.market, props.actualValue)} ✕ Outside range`} />
            <p className="pt-3 text-xs leading-relaxed text-muted-foreground">
              Your stake of {formatDisplayValue(props.stake, 2)} XLM remains in the pool to fund winners with tighter ranges.
            </p>
          </div>
        ) : (
          <>
            <p className="text-lg font-bold text-white">{rejectionTitle(props.rejectionReason)}</p>
            <p className="text-sm text-[var(--prism-muted)]">{props.rejectionDetail}</p>
          </>
        )}
        {props.rejectionReason === "AlreadyClaimed" && props.claimTx ? <ExpertLink txHash={props.claimTx} /> : null}
        <p className="text-sm text-[var(--prism-muted)]">No payout issued.</p>
        <Button className="w-full rounded-xl bg-[var(--prism-red)] text-white hover:bg-[#f87171]" onClick={props.onReset}>
          Back to market
        </Button>
      </CardContent>
    </Card>
  );
}

function UnlockPredictionDialog({
  onCancel,
  onUnlock,
  open,
  unlocking,
}: {
  onCancel: () => void;
  onUnlock: () => void;
  open: boolean;
  unlocking: boolean;
}) {
  return (
    <Dialog open={open}>
      <DialogContent className="border-[var(--prism-border)] bg-[#101511]">
        <DialogHeader>
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Unlock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-2xl text-white">Unlock Your Prediction</DialogTitle>
          <DialogDescription className="leading-relaxed">
            To check your result, PRISM decrypts your sealed prediction locally in your browser.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
            <p className="font-semibold text-foreground">Freighter will ask you to sign a message.</p>
            <p className="mt-2">No transaction. No XLM moves. Zero fees.</p>
          </div>
          <p>This signature only unlocks your range on this device so PRISM can check whether it contained the public settlement result.</p>
        </div>

        <DialogFooter>
          <Button className="border-[var(--prism-border)] bg-transparent text-white hover:bg-[#151f17]" disabled={unlocking} onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button className="bg-[var(--prism-lime)] font-bold text-[#08100b] hover:bg-[#c2ff69]" disabled={unlocking} onClick={onUnlock}>
            {unlocking ? (
              <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Waiting for Freighter</span>
            ) : "Unlock Prediction →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmPredictionDialog(props: {
  currency: Currency;
  economics: ReturnType<typeof calculateEconomics>;
  market: Market;
  high: string;
  low: string;
  open: boolean;
  priceEstimate: boolean;
  sealStage: SealStage;
  stake: number;
  xlmUsdPrice: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const busy = props.sealStage !== "idle" && props.sealStage !== "confirmed";
  const progressSteps: Array<[SealStage, string]> = [
    ["commitment", "Generating commitment"],
    ["signing", "Waiting for signature"],
    ["encrypting", "Encrypting prediction"],
    ["submitting", "Submitting to Stellar"],
  ];
  const activeIndex = progressSteps.findIndex(([stage]) => stage === props.sealStage);
  return (
    <Dialog open={props.open}>
      <DialogContent className="border-[var(--prism-border)] bg-[#101511]">
        <DialogHeader>
          <DialogTitle className="text-white">Confirm Prediction</DialogTitle>
          <DialogDescription>Review the exact position Freighter will authorize.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <ConfirmRow label="Market" value={props.market.question} />
          <ConfirmRow
            label="Your range"
            value={`${formatOutcomeValue(props.market, props.low)} — ${formatOutcomeValue(props.market, props.high)}`}
          />
          <ConfirmRow label="Stake" value={formatStakeDisplay(props.stake, props.currency, props.xlmUsdPrice, props.priceEstimate)} />
          <ConfirmRow label="Coverage" value={`${props.economics.coverage.toFixed(1)}%`} />
          <ConfirmRow label="Multiplier" value={`~${props.economics.multiplier.toFixed(1)}x`} />
          <ConfirmRow label="Potential return" value={formatStakeDisplay(props.economics.returnAmount, props.currency, props.xlmUsdPrice, props.priceEstimate)} />
          <ConfirmRow label="Potential profit" value={`+${formatStakeDisplay(props.economics.profit, props.currency, props.xlmUsdPrice, props.priceEstimate)}`} />
          <p className="rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm leading-relaxed text-muted-foreground">
            Your range is sealed on-chain with a ZK commitment. Nobody can see your prediction until you claim.
          </p>
          {busy ? (
            <div className="space-y-2 pt-2">
              {progressSteps.map(([stage, label], index) => (
                <div className="flex items-center gap-3 text-sm" key={stage}>
                  {index < activeIndex ? <Check className="h-4 w-4 text-primary" /> : index === activeIndex ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <span className="h-4 w-4 rounded-full border border-border" />}
                  <span className={index <= activeIndex ? "text-foreground" : "text-muted-foreground"}>{label}{index === activeIndex ? "..." : ""}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button className="border-[var(--prism-border)] bg-transparent text-white hover:bg-[#151f17]" variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button className="bg-[var(--prism-lime)] font-bold text-[#08100b] hover:bg-[#c2ff69]" disabled={busy} onClick={props.onConfirm}>
            {busy ? "Processing..." : "Confirm & Sign →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeatureCard({ copy, icon, title }: { copy: string; icon: React.ReactNode; title: string }) {
  return (
    <Card className="rounded-2xl border-border bg-card transition-colors hover:border-primary/50">
      <CardContent className="p-6">
        <div className="mb-8 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{copy}</p>
      </CardContent>
    </Card>
  );
}

function PreviewMarketCard({
  currency,
  market,
  onClick,
  priceEstimate,
  xlmUsdPrice,
}: {
  currency: Currency;
  market: (typeof previewMarkets)[number];
  onClick: () => void;
  priceEstimate: boolean;
  xlmUsdPrice: number;
}) {
  return (
    <button className="text-left" onClick={onClick} type="button">
      <Card className="rounded-2xl border-border bg-card transition-colors hover:border-primary/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <Badge className="rounded-full border-border bg-secondary text-xs text-muted-foreground">{market.category}</Badge>
            <span className="flex items-center gap-1 text-xs font-medium text-primary">
              <FileLock2 className="h-3 w-3" />
              Shielded
            </span>
          </div>
          <h3 className="mt-6 text-lg font-semibold text-foreground">{market.title}</h3>
          <div className="mt-8 grid grid-cols-4 border-t border-border pt-4">
            <MiniStat label="Popular range" value={market.range} />
            <MiniStat label="Odds" value={market.odds} />
            <MiniStat label="Payout" value={market.payout} green />
            <MiniStat label="Volume" value={formatMarketAmount(market.volumeXlm, currency, xlmUsdPrice, priceEstimate)} />
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

function BoundInput({
  label,
  market,
  onChange,
  value,
}: {
  label: string;
  market: Market;
  onChange: (value: string) => void;
  value: string;
}) {
  const displayValue = market.metricKind === "xlm_usdc_price"
    ? (Number(value) / market.outcomeScale).toFixed(market.outcomeDecimals)
    : value;

  return (
    <label>
      <span className="mb-2 block text-xs text-muted-foreground">{label}</span>
      <Input
        className="border-border/40 bg-background/50 font-mono text-foreground"
        inputMode="decimal"
        value={displayValue}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function LandingStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-2 font-mono text-xl font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function MiniStat({ green, label, value }: { green?: boolean; label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${green ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function valueAtDistributionIndex(index: number, min: number, max: number, count: number) {
  return Math.round(min + ((max - min) * index) / Math.max(1, count - 1));
}

function PanelStat({ green, label, value }: { green?: boolean; label: string; value: string }) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${green ? "text-primary" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function MarketStat({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-4 sm:p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 font-mono text-xl font-semibold text-foreground sm:text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function DexPriceTicker({
  priceState,
}: {
  priceState: { current: XlmUsdcPrice | null; previous: XlmUsdcPrice | null };
}) {
  const current = priceState.current;
  const previous = priceState.previous;
  const change = current && previous && previous.midPrice > 0
    ? ((current.midPrice - previous.midPrice) / previous.midPrice) * 100
    : 0;
  const increased = change >= 0;

  return (
    <div className="rounded-xl border border-border/40 bg-card/50 p-5">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Current XLM/USDC price</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <p className="font-mono text-4xl font-semibold text-foreground">
          {current ? `$${current.midPrice.toFixed(4)}` : "Loading..."}
        </p>
        {current ? (
          <span className={`mb-1 inline-flex items-center gap-1 font-mono text-sm font-semibold ${increased ? "text-green-400" : "text-red-400"}`}>
            {increased ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {change >= 0 ? "+" : ""}{change.toFixed(2)}%
          </span>
        ) : null}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Updates every 30s · {current?.method === "recent_trade_vwap" ? `Recent-trade VWAP (${current.tradeCount} trades)` : "Order-book midpoint"} · Source: Stellar mainnet DEX
      </p>
      {current ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {current.method === "recent_trade_vwap"
            ? `Recent-trade VWAP · order-book spread ${current.spreadPercent.toFixed(1)}%`
            : "Liquid order-book midpoint"}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">Mainnet price feed · bets and payouts remain on Stellar testnet</p>
    </div>
  );
}

function SuccessRow({ green, label, value }: { green?: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${green ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function VisualBound({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex justify-between text-xs font-semibold text-[var(--prism-muted)]">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-1 rounded-full bg-[#1f271f]">
        <div className="h-1 w-[46%] rounded-full bg-[var(--prism-lime)]" />
      </div>
    </div>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--prism-border)] pb-3">
      <span className="text-sm text-[var(--prism-muted)]">{label}</span>
      <span className="font-mono text-sm font-bold text-white">{value}</span>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-[var(--prism-border)] bg-[#101511] px-4 py-3 text-sm font-bold text-white shadow-2xl">
      {message}
    </div>
  );
}

function ExpertLink({ txHash }: { txHash: string | null }) {
  if (!txHash) return <p className="text-sm text-[var(--prism-muted)]">Transaction pending</p>;
  return (
    <a
      className="inline-flex items-center justify-center gap-2 text-sm font-bold text-[var(--prism-lime)] hover:text-[#c2ff69]"
      href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
      rel="noreferrer"
      target="_blank"
    >
      View on Stellar Expert <Link2 className="h-4 w-4" />
    </a>
  );
}

function PrismLogo() {
  return (
    <svg aria-hidden="true" className="h-7 w-7" fill="none" viewBox="0 0 28 28">
      <path d="M14 3 25 24H14V3Z" fill="var(--primary)" />
      <path d="M14 3v21H3L14 3Z" fill="var(--foreground)" opacity="0.92" />
      <path d="M14 12.4 25 24H3L14 12.4Z" fill="var(--chart-2)" />
    </svg>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border px-5 py-12 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-xs">
          <div className="flex items-center gap-3">
            <PrismLogo />
            <span className="text-lg font-semibold tracking-tight text-foreground">PRISM</span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            The range-based prediction market secured by zero-knowledge proofs.
          </p>
        </div>
      </div>
    </footer>
  );
}

function stepCopy(index: number) {
  const copy = [
    "From crypto prices to election counts to Stellar metrics, pick a market with a numeric outcome.",
    "Drag the bounds to capture the outcomes you believe in. Wider is safer, tighter pays more.",
    "Your position is committed on-chain behind a zero-knowledge proof. No one sees your hand.",
    "When the result lands inside your range, the contract pays out automatically and verifiably.",
  ];
  return copy[index];
}

function calculateEconomics(low: string, high: string, stake: number, maxRangeWidth: number) {
  const lowNumber = Number(low);
  const highNumber = Number(high);
  const width = Math.max(0, highNumber - lowNumber);
  const coverage = width > 0 ? (width / maxRangeWidth) * 100 : 0;
  const multiplier = width > 0 ? Math.min(Math.floor(maxRangeWidth / width), 10) : 0;
  const returnAmount = stake * multiplier;
  return {
    coverage,
    invalid: width <= 0 || width > maxRangeWidth,
    multiplier,
    profit: Math.max(0, returnAmount - stake),
    returnAmount,
    width,
  };
}

function formatMarketAmount(valueXlm: number, currency: Currency, xlmUsdPrice: number, estimated: boolean) {
  if (currency === "USD") {
    const prefix = estimated ? "~" : "";
    return `${prefix}$${formatDisplayValue(valueXlm * xlmUsdPrice, valueXlm * xlmUsdPrice >= 100 ? 0 : 2)}`;
  }
  return `${formatDisplayValue(valueXlm, valueXlm >= 100 ? 0 : 2)} XLM`;
}

function formatStakeDisplay(valueXlm: number, currency: Currency, xlmUsdPrice: number, estimated: boolean) {
  return formatMarketAmount(valueXlm, currency, xlmUsdPrice, estimated);
}

function formatOutcomeWidth(market: Market, scaledWidth: number) {
  const value = scaledWidth / market.outcomeScale;
  if (market.metricKind === "xlm_usdc_price") return `$${value.toFixed(market.outcomeDecimals)}`;
  return `${formatDisplayValue(value, market.outcomeDecimals)} ${market.outcomeUnit}`;
}

function formatDisplayValue(value: number, fractionDigits: number) {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatUsdInputValue(value: number) {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
}

function stakeToSliderPosition(value: number) {
  const safeValue = clamp(value, STAKE_MIN_XLM, STAKE_MAX_XLM);
  const min = Math.log10(STAKE_MIN_XLM);
  const max = Math.log10(STAKE_MAX_XLM);
  return ((Math.log10(safeValue) - min) / (max - min)) * 100;
}

function sliderPositionToStake(position: number) {
  const min = Math.log10(STAKE_MIN_XLM);
  const max = Math.log10(STAKE_MAX_XLM);
  const value = 10 ** (min + (clamp(position, 0, 100) / 100) * (max - min));
  return Math.round(value);
}

function parseXlmAmount(value: string) {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseRoute(pathname: string): Route {
  if (pathname.startsWith("/markets/")) return { name: "market", id: pathname.split("/")[2] ?? defaultMarket.id };
  if (pathname === "/markets") return { name: "markets" };
  return { name: "landing" };
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function xlmToStroops(value: number) {
  return Math.round(value * 10_000_000).toString();
}

function truncate(value: string | null) {
  if (!value) return "--";
  return value.length > 22 ? `${value.slice(0, 12)}...${value.slice(-8)}` : value;
}

function formatCommitmentHash(value: string | null) {
  if (!value) return "--";
  try {
    const hex = commitmentToHex(value).slice(2);
    return `0x${hex.slice(0, 8)}...${hex.slice(-8)}`;
  } catch {
    return truncate(value);
  }
}

function commitmentToHex(value: string) {
  return `0x${BigInt(value).toString(16).padStart(64, "0")}`;
}

function bytesToDecimal(bytes: Uint8Array) {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) + BigInt(byte);
  }
  return value.toString();
}

function cleanRejectionDetail(detail: string) {
  if (/alreadyclaimed|#10/i.test(detail)) return "Already claimed.";
  if (/rangemiss|#11/i.test(detail)) return "Range missed the outcome.";
  if (/proof|verify/i.test(detail)) return "Invalid proof.";
  return detail;
}

function rejectionTitle(reason: RejectionReason) {
  const titles: Record<RejectionReason, string> = {
    AlreadyClaimed: "Already claimed",
    CommitmentMissing: "No prediction found",
    InvalidProof: "Invalid proof",
    RangeMiss: "Range missed the outcome",
    Unknown: "Transaction rejected",
  };
  return titles[reason];
}

function mapErrorToReason(error: unknown): RejectionReason {
  const message = error instanceof Error ? error.message : String(error);
  if (/alreadyclaimed|#10/i.test(message)) return "AlreadyClaimed";
  if (/rangemiss|#11/i.test(message)) return "RangeMiss";
  if (/commitment|missing|not found/i.test(message)) return "CommitmentMissing";
  if (/proof|verify/i.test(message)) return "InvalidProof";
  return "Unknown";
}

async function generateBrowserProof(
  input: Record<string, string>,
  callbacks: {
    onArtifactsLoaded: () => void;
    onProofStarted: () => void;
  },
) {
  const snarkjs = await import("snarkjs");
  const [wasmResponse, provingKeyResponse, verificationKeyResponse] = await Promise.all([
    fetch("/proofs/range_market.wasm"),
    fetch("/proofs/range_market_final.zkey"),
    fetch("/proofs/verification_key.json"),
  ]);
  if (!wasmResponse.ok || !provingKeyResponse.ok || !verificationKeyResponse.ok) {
    throw new Error("Unable to load proof artifacts");
  }
  const verificationKey = await verificationKeyResponse.json();
  callbacks.onArtifactsLoaded();
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  callbacks.onProofStarted();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    "/proofs/range_market.wasm",
    "/proofs/range_market_final.zkey",
  );
  const valid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
  if (!valid) throw new Error("Invalid proof");
  return { proof, publicSignals };
}

export default App;
