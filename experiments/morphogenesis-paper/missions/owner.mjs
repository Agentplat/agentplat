import assert from "node:assert/strict";
import {hash,executeTask} from "./workload.mjs";
export class MissionOwner {
  constructor(pool,schema,caseId,input){Object.assign(this,{pool,schema,caseId,input});this.phase=0;this.events=[];this.firstFaultPhase=null;this.artifacts=[];}
  event(kind,data={}){this.events.push({sequence:this.events.length+1,phase:this.phase,kind,...data});}
  outstandingSpecialistWork(){return this.input.tasks.some(t=>t.kind==="variance"&&t.phase<=this.phase&&!this.artifacts.some(a=>a.id===t.id&&a.version===t.version));}
  async initialize(){await this.pool.query(`INSERT INTO "${this.schema}".mission_owners(case_id,roles) VALUES($1,'[]'::jsonb)`,[this.caseId]);}
  async roles(){return (await this.pool.query(`SELECT roles FROM "${this.schema}".mission_owners WHERE case_id=$1`,[this.caseId])).rows[0].roles;}
  async saveRoles(roles){await this.pool.query(`UPDATE "${this.schema}".mission_owners SET roles=$2::jsonb WHERE case_id=$1`,[this.caseId,JSON.stringify(roles)]);}
  async authorize(){this.event("owner-authorization");assert(this.caseId&&this.input.maximumRoleReservations===3);return true;}
  async activate(operationId,initial=false){
    await this.authorize();
    const roles=await this.roles(), prior=roles.find(r=>r.operationId===operationId);
    if(prior)return prior;
    assert(roles.filter(r=>r.active).length+1<this.input.maximumRoleReservations,"owner role ceiling exceeded");
    const role={roleId:`role:${hash(operationId).slice(7,23)}`,operationId,kind:"statistics",active:true,fenced:false,createdPhase:this.phase};
    roles.push(role);await this.saveRoles(roles);
    this.event("role-materialized",{roleId:role.roleId,operationId,initial});
    if(!initial && this.input.fault!=="none" && this.firstFaultPhase===null){
      this.firstFaultPhase=this.phase;this.event("ack-lost",{operationId});throw new Error("lost activation acknowledgement");
    }
    return role;
  }
  async reconcile(operationId){
    this.event("owner-reconciliation",{operationId});
    if(this.input.fault==="reconciliation_outage"&&this.firstFaultPhase!==null&&this.phase<this.firstFaultPhase+2)return {status:"unknown"};
    const role=(await this.roles()).find(r=>r.operationId===operationId);
    return role?{status:"applied",role}:{status:"absent"};
  }
  async fence(roleId){
    const roles=await this.roles(), role=roles.find(r=>r.roleId===roleId);assert(role);
    role.fenced=true;await this.saveRoles(roles);this.event("role-fenced",{roleId});return hash(role);
  }
  async retire(roleId){
    await this.authorize();
    const roles=await this.roles(),role=roles.find(r=>r.roleId===roleId);assert(role);
    role.fenced=true;role.active=false;await this.saveRoles(roles);this.event("role-retired",{roleId});return role;
  }
  async chargePhase(){
    const units=1+(await this.roles()).filter(r=>r.active).length;
    const used=this.events.filter(e=>e.kind==="role-phase").reduce((n,e)=>n+e.units,0);
    if(used+units>this.input.rolePhaseBudget){this.event("budget-exhausted",{used,required:units});return false;}
    this.event("role-phase",{units});return true;
  }
  async accept(task,roleId){
    if(task.kind==="variance"){
      const role=(await this.roles()).find(r=>r.roleId===roleId);
      assert(role?.active&&!role.fenced,"task owner denied inactive specialist");
    }
    const body={id:task.id,version:task.version,inputDigest:hash(task.data),value:executeTask(task),dependencies:[]};
    return this.storeArtifact({...body,digest:hash(body)});
  }
  async storeArtifact(artifact){
    const prior=this.artifacts.find(a=>a.id===artifact.id&&a.version===artifact.version);
    if(prior){assert.equal(prior.digest,artifact.digest);return prior;}
    await this.pool.query(`INSERT INTO "${this.schema}".mission_artifacts(case_id,artifact_id,version,artifact) VALUES($1,$2,$3,$4::jsonb)`,
      [this.caseId,artifact.id,artifact.version,JSON.stringify(artifact)]);
    this.artifacts.push(artifact);this.event("artifact-accepted",{artifactDigest:artifact.digest});return artifact;
  }
  async report(){
    const latest=new Map(this.artifacts.map(a=>[a.id,a]));
    if(latest.size!==this.input.tasks.length)return null;
    if(latest.get(this.input.revision.id)?.version!==this.input.revision.version)return null;
    const artifacts=[...latest.values()].sort((a,b)=>a.id.localeCompare(b.id));
    const body={id:"report",version:1,inputDigest:hash(this.input),value:Object.fromEntries(artifacts.map(a=>[a.id,a.value])),
      dependencies:artifacts.map(a=>({id:a.id,version:a.version,digest:a.digest}))};
    return this.storeArtifact({...body,digest:hash(body)});
  }
}
