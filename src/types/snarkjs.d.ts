declare module "snarkjs" {
  export const groth16: {
    fullProve: (
      input: Record<string, string>,
      wasmFile: string,
      zkeyFile: string,
    ) => Promise<{ proof: unknown; publicSignals: unknown }>;
    verify: (verificationKey: unknown, publicSignals: unknown, proof: unknown) => Promise<boolean>;
  };
}
