import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const circuitPath = "circuits/range_market.circom";
const circomBinary = process.env.CIRCOM_BIN ?? `${homedir()}/.cargo/bin/circom`;

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function binaryWorks(command: string, args: string[] = ["--version"]): boolean {
  const result = spawnSync(command, args, {
    encoding: "utf8",
  });

  return result.status === 0 && /circom compiler 2\./i.test(`${result.stdout}\n${result.stderr}`);
}

const checks = {
  circuit: await exists(circuitPath),
  circom: binaryWorks(circomBinary),
  snarkjs: await exists("node_modules/.bin/snarkjs"),
  circomlib: await exists("node_modules/circomlib/circuits/poseidon.circom"),
};

if (!checks.circuit || !checks.circom || !checks.snarkjs || !checks.circomlib) {
  console.error(
    JSON.stringify(
      {
        status: "blocked",
        checks,
        blockers: [
          !checks.circuit ? `${circuitPath} is missing` : null,
          !checks.circom ? `Circom 2 compiler not found at ${circomBinary}. Set CIRCOM_BIN to override.` : null,
          !checks.snarkjs ? "`snarkjs` is not installed" : null,
          !checks.circomlib ? "`circomlib` circuits are not installed" : null,
        ].filter(Boolean),
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: "ready",
      checks,
      circomBinary,
      next: "Compile circuit, generate witness, run Groth16 setup/prove/verify.",
    },
    null,
    2,
  ),
);
