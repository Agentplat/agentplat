import { createInterface } from 'node:readline';
import { handleRequest } from './index.js';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line: string) => { if (!line.trim()) return; try { process.stdout.write(`${JSON.stringify(handleRequest(JSON.parse(line)))}\n`); } catch (error) { process.stdout.write(`${JSON.stringify({ ok:false, error:String(error) })}\n`); } });
