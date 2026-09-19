import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import {createHash} from "node:crypto";
import {verify} from "./verify.mjs";
const original=process.env.MORPHOGENESIS_INTEGRATION_DIR;
assert(original,"set MORPHOGENESIS_INTEGRATION_DIR");
test("completed integration evidence verifies",()=>assert.equal(verify(original).winnerCompleted,true));
function mutation(file,modify){
  const dir=mkdtempSync(path.join(tmpdir(),"morph-integration-negative-"));
  try{
    cpSync(original,dir,{recursive:true});
    const target=path.join(dir,file),value=JSON.parse(readFileSync(target,"utf8"));modify(value);
    writeFileSync(target,JSON.stringify(value));
    const manifest=JSON.parse(readFileSync(path.join(dir,"manifest.json"),"utf8"));
    manifest.find(e=>e.path===file).digest=`sha256:${createHash("sha256").update(readFileSync(target)).digest("hex")}`;
    writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(manifest));
    assert.throws(()=>verify(dir));
  }finally{rmSync(dir,{recursive:true,force:true});}
}
test("rehashed invalid approval signature is rejected",()=>mutation("events.json",events=>{
  const signed=events.find(e=>e.kind==="signed-approval").value;
  signed.signature=Buffer.alloc(64).toString("base64");
}));
test("rehashed altered mandate expiry is rejected",()=>mutation("expiry.json",value=>{
  value.mandate.statement.validUntil="2026-09-19T12:00:00.100Z";
}));
test("removing the admitted-job completion trace is rejected",()=>mutation("events.json",events=>{
  events.splice(events.findIndex(e=>e.kind==="admitted-work-finished"),1);
}));
