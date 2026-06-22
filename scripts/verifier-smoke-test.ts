#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..");
const REPORT_DIR = join(PROJECT_ROOT, "docs", "spikes");
const REPORT_PATH = join(REPORT_DIR, "verifier-smoke-test.md");

const CONFIG = {
  network: process.env.PRISM_STELLAR_NETWORK || "testnet",
  rpcUrl: process.env.PRISM_STELLAR_RPC_URL || "https://soroban-testnet.stellar.org",
  sourceAccount: process.env.PRISM_STELLAR_SOURCE || "",
  verifierWasm: process.env.PRISM_GROTH16_VERIFIER_WASM || "",
  verifierContractId: process.env.PRISM_GROTH16_VERIFIER_CONTRACT_ID || "",
  proofJson: process.env.PRISM_DUMMY_PROOF_JSON || "",
  publicInputsJson: process.env.PRISM_DUMMY_PUBLIC_INPUTS_JSON || "",
  verifyingKeyJson: process.env.PRISM_DUMMY_VERIFYING_KEY_JSON || "",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    shell: false,
  });

  return {
    command: [command].concat(args).join(" "),
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error ? result.error.message : "",
  };
}

function commandExists(command) {
  const result = run(command, ["--version"]);
  return result.status === 0;
}

function fileStatus(path) {
  if (!path) return "not configured";
  return existsSync(resolve(PROJECT_ROOT, path)) || existsSync(path)
    ? `found: ${path}`
    : `missing: ${path}`;
}

function markdownList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function writeReport(report) {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(REPORT_PATH, report);
}

function main() {
  const checkedAt = new Date().toISOString();
  const checks = [];
  const blockers = [];
  const evidence = [];

  const hasStellarCli = commandExists("stellar");
  checks.push(`stellar CLI: ${hasStellarCli ? "available" : "missing"}`);
  if (!hasStellarCli) {
    blockers.push("`stellar` CLI is not installed or not available on PATH.");
  }

  const hasVerifierTarget = Boolean(CONFIG.verifierContractId || CONFIG.verifierWasm);
  checks.push(
    `verifier target: ${
      CONFIG.verifierContractId
        ? `existing contract ${CONFIG.verifierContractId}`
        : CONFIG.verifierWasm
          ? `wasm ${CONFIG.verifierWasm}`
          : "not configured"
    }`,
  );
  if (!hasVerifierTarget) {
    blockers.push(
      "No verifier target configured. Set PRISM_GROTH16_VERIFIER_CONTRACT_ID for an existing verifier or PRISM_GROTH16_VERIFIER_WASM for deployment.",
    );
  }

  checks.push(`source account: ${CONFIG.sourceAccount ? "configured" : "missing"}`);
  if (!CONFIG.sourceAccount) {
    blockers.push("No source account configured. Set PRISM_STELLAR_SOURCE to the funded testnet deployer/source identity.");
  }

  checks.push(`proof artifact: ${fileStatus(CONFIG.proofJson)}`);
  checks.push(`public inputs artifact: ${fileStatus(CONFIG.publicInputsJson)}`);
  checks.push(`verifying key artifact: ${fileStatus(CONFIG.verifyingKeyJson)}`);

  if (!CONFIG.proofJson) blockers.push("No dummy proof configured. Set PRISM_DUMMY_PROOF_JSON.");
  if (!CONFIG.publicInputsJson) blockers.push("No dummy public inputs configured. Set PRISM_DUMMY_PUBLIC_INPUTS_JSON.");
  if (!CONFIG.verifyingKeyJson) blockers.push("No dummy verifying key configured. Set PRISM_DUMMY_VERIFYING_KEY_JSON.");

  if (CONFIG.proofJson && fileStatus(CONFIG.proofJson).startsWith("missing")) {
    blockers.push(`Dummy proof file does not exist: ${CONFIG.proofJson}`);
  }
  if (CONFIG.publicInputsJson && fileStatus(CONFIG.publicInputsJson).startsWith("missing")) {
    blockers.push(`Dummy public inputs file does not exist: ${CONFIG.publicInputsJson}`);
  }
  if (CONFIG.verifyingKeyJson && fileStatus(CONFIG.verifyingKeyJson).startsWith("missing")) {
    blockers.push(`Dummy verifying key file does not exist: ${CONFIG.verifyingKeyJson}`);
  }

  let outcome = "blocked";
  let fallbackDecision =
    "Use real Circom proof generation with Soroban enforcing commitment storage, settlement state, and duplicate-claim prevention until the verifier path is unblocked.";

  if (blockers.length === 0) {
    const args = [
      "contract",
      "invoke",
      "--network",
      CONFIG.network,
      "--rpc-url",
      CONFIG.rpcUrl,
      "--source",
      CONFIG.sourceAccount,
      "--id",
      CONFIG.verifierContractId,
      "--",
      "verify",
      "--proof",
      CONFIG.proofJson,
      "--public-inputs",
      CONFIG.publicInputsJson,
      "--verifying-key",
      CONFIG.verifyingKeyJson,
    ];

    if (!CONFIG.verifierContractId && CONFIG.verifierWasm) {
      blockers.push(
        "Verifier deployment flow is not configured yet. Deploy the verifier WASM, set PRISM_GROTH16_VERIFIER_CONTRACT_ID, then rerun this script.",
      );
    } else {
      const invoke = run("stellar", args);
      evidence.push(`Command: \`${invoke.command}\``);
      evidence.push(`Exit status: ${invoke.status}`);
      if (invoke.stdout.trim()) evidence.push(`stdout:\n\n\`\`\`text\n${invoke.stdout.trim()}\n\`\`\``);
      if (invoke.stderr.trim()) evidence.push(`stderr:\n\n\`\`\`text\n${invoke.stderr.trim()}\n\`\`\``);
      if (invoke.error) evidence.push(`spawn error: ${invoke.error}`);

      if (invoke.status === 0) {
        outcome = "passed";
        fallbackDecision = "Full on-chain Groth16 verification path is selected for MVP implementation.";
      } else {
        blockers.push("Groth16 verifier invocation failed. See command evidence below.");
      }
    }
  }

  const report = `# Verifier Smoke Test

Status: ${outcome}
Checked at: ${checkedAt}

## Configuration

- Network: ${CONFIG.network}
- RPC URL: ${CONFIG.rpcUrl}
- Source account configured: ${CONFIG.sourceAccount ? "yes" : "no"}
- Verifier contract ID: ${CONFIG.verifierContractId || "not configured"}
- Verifier WASM: ${CONFIG.verifierWasm || "not configured"}
- Dummy proof: ${CONFIG.proofJson || "not configured"}
- Dummy public inputs: ${CONFIG.publicInputsJson || "not configured"}
- Dummy verifying key: ${CONFIG.verifyingKeyJson || "not configured"}

## Checks

${markdownList(checks)}

## Result

${outcome === "passed" ? "The configured Groth16 verifier accepted the dummy proof." : "The verifier path is not ready for implementation."}

## Blockers

${blockers.length ? markdownList(blockers) : "- None"}

## Command Evidence

${evidence.length ? evidence.join("\n\n") : "- No verifier command executed because prerequisite checks failed."}

## Selected Path

${fallbackDecision}
`;

  writeReport(report);
  console.log(`Verifier smoke-test status: ${outcome}`);
  console.log(`Report written: ${REPORT_PATH}`);

  if (outcome !== "passed") {
    process.exitCode = 1;
  }
}

main();
