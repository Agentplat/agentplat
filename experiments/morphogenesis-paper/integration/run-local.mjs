import {execFileSync,spawnSync} from "node:child_process";
import {randomBytes} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import {existsSync} from "node:fs";
const output=process.argv[2];assert(output&&!existsSync(output),"supply a new output directory");
const name=`agentplat-paper-${randomBytes(6).toString("hex")}`;
const docker=(args)=>execFileSync("docker",args,{encoding:"utf8"}).trim();
let started=false;
try{
  docker(["run","-d","--rm","--name",name,"--label","agentplat.task=morphogenesis-paper","-e","POSTGRES_HOST_AUTH_METHOD=trust","-p","127.0.0.1::5432","postgres:18"]);
  started=true;
  for(let i=0;i<100;i++){
    const p=spawnSync("docker",["exec",name,"pg_isready","-U","postgres"],{encoding:"utf8"});
    if(p.status===0)break;
    if(i===99)throw new Error("PostgreSQL readiness timed out");
    await new Promise(r=>setTimeout(r,100));
  }
  const address=docker(["port",name,"5432"]);
  assert(/^127\.0\.0\.1:\d+$/.test(address),"database must bind only loopback");
  const imageId=docker(["inspect","--format","{{.Image}}",name]);
  const child=spawnSync(process.execPath,[fileURLToPath(new URL("run.mjs",import.meta.url)),path.resolve(output)],{
    stdio:"inherit",timeout:60000,env:{PATH:process.env.PATH,LANG:"en_US.UTF-8",
      MORPHOGENESIS_PG_PORT:address.split(":").at(-1),MORPHOGENESIS_PG_IMAGE_ID:imageId}});
  assert.equal(child.error,undefined);assert.equal(child.status,0,"integration runner failed; output retained");
}finally{if(started)docker(["stop",name]);}
