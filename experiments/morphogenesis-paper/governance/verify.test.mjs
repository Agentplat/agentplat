import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {verifyCase} from './verify.mjs';
const dir=process.env.MORPHOGENESIS_GOVERNANCE_EVIDENCE;
assert(dir,'set MORPHOGENESIS_GOVERNANCE_EVIDENCE to raw evaluation directory');
const trustedKey=JSON.parse(readFileSync(path.join(dir,'registration.json'))).trustedPublicKey;
const load=()=>JSON.parse(readFileSync(path.join(dir,'cases/nominal-morphogenesis.json')));
test('valid positive control reconstructs',()=>assert.equal(verifyCase(load(),trustedKey).effects,1));
for(const [name,mutate] of Object.entries({
 'missing chain':c=>{c.chains=[];},
 'changed scope':c=>{c.admissions[0].request.scopeDigest='sha256:'+'0'.repeat(64);},
 'changed proposal':c=>{c.proposal.proposedAtLogicalMs++;},
 'expired admission time':c=>{c.admissions[0].at=500;},
 'forged signature':c=>{c.admissions[0].signature=Buffer.alloc(64).toString('base64');},
 'missing fence':c=>{c.controller.executions.at(-1).fence=null;},
 'changed terminal phase':c=>{c.controller.executions.at(-1).phase='superseded';},
 'missing original admission':c=>{c.admissions=[];},
}))test(`rejects ${name}`,()=>{const c=load();mutate(c);assert.throws(()=>verifyCase(c,trustedKey));});
