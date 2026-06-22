declare module "circomlibjs" {
  export function buildPoseidonOpt(): Promise<{
    (inputs: Array<bigint | string | number>): unknown;
    F: {
      toString(value: unknown): string;
    };
  }>;
}
