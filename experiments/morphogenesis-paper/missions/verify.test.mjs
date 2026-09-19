import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync,readdirSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {verify} from "./verify.mjs";
import {hash} from "./workload.mjs";
const original=process.env.MORPHOGENESIS_MISSION_DIR;assert(original);
test("all four conditions and injection coverage verify",()=>assert.equal(verify(original).matchedConditions,4));
function mutation(fn){const dir=mkdtempSync(path.join(tmpdir(),"mission-verify-negative-"));
  try{cpSync(original,dir,{recursive:true});fn(dir);assert.throws(()=>verify(dir));}finally{rmSync(dir,{recursive:true,force:true});}}
function rehash(dir,file){const m=JSON.parse(readFileSync(path.join(dir,"manifest.json"),"utf8"));m.find(e=>e.path===file).digest=hash(readFileSync(path.join(dir,file)));writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(m));}
test("a rehashed condition input mismatch is rejected",()=>mutation(dir=>{
  const file=`cases/${readdirSync(path.join(dir,"cases"))[0]}`,p=path.join(dir,file),c=JSON.parse(readFileSync(p,"utf8"));
  c.input.rolePhaseBudget=99;writeFileSync(p,JSON.stringify(c));rehash(dir,file);
}));
test("rehashed missing fault injection is rejected",()=>mutation(dir=>{
  const file=`cases/${readdirSync(path.join(dir,"cases")).find(f=>f.includes("burst-lost_ack-morphogenesis"))}`,p=path.join(dir,file),c=JSON.parse(readFileSync(p,"utf8"));
  c.events=c.events.filter(e=>e.kind!=="ack-lost");writeFileSync(p,JSON.stringify(c));rehash(dir,file);
}));
