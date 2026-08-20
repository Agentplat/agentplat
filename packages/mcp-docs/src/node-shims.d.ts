declare const process: { cwd(): string; env: Record<string, string | undefined>; stdin: unknown; stdout: { write(value: string): void }; exitCode?: number };
declare module 'node:fs' { export const existsSync: any; export const readFileSync: any; export const readdirSync: any; export const statSync: any; }
declare module 'node:path' { export const join: any; export const relative: any; }
declare module 'node:readline' { export const createInterface: any; }
