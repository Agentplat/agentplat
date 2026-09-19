import {createHash} from "node:crypto";
export const CONDITIONS=["fixed","minimal","durable","morphogenesis"];
export const SHAPES=["stable","burst","shrinking","false_forecast"];
export const FAULTS=["none","lost_ack","reconciliation_outage"];
export const HORIZON=8;
export function canonical(value){
  if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export const hash=value=>`sha256:${createHash("sha256").update(Buffer.isBuffer(value)?value:typeof value==="string"?value:canonical(value)).digest("hex")}`;
export function workload(seed,shape,fault){
  let state=seed>>>0;
  const next=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
  const start=shape==="shrinking"?1:2+(next()%2);
  const end=shape==="shrinking"?2:start+1;
  const special=shape==="burst"||shape==="shrinking";
  const tasks=Array.from({length:HORIZON},(_,phase)=>({id:`task:${phase}`,phase,version:1,
    kind:special&&phase>=start&&phase<=end?"variance":"sum",
    data:Array.from({length:16+next()%25},()=>Number(next()%121)-20)}));
  const revision={...tasks[0],version:2,phase:6,data:tasks[0].data.map((n,i)=>n+(i%3===0?1:0))};
  return {schemaVersion:1,seed,shape,fault,horizon:HORIZON,rolePhaseBudget:16,databaseQueryBudget:512,maximumRoleReservations:3,
    specialistStart:special?start:shape==="false_forecast"?2:null,
    specialistEnd:special?end:shape==="false_forecast"?2:null,
    fixedSpecialist:special,tasks,revision};
}
// Worker implementation; the Python oracle uses Fraction/statistical formulas.
export function executeTask(task){
  let sum=0,squares=0;
  for(const value of task.data){sum+=value;squares+=value*value;}
  if(task.kind==="sum")return {numerator:sum,denominator:1};
  let numerator=task.data.length*squares-sum*sum,denominator=task.data.length**2;
  let a=Math.abs(numerator),b=denominator;while(b){[a,b]=[b,a%b];}
  numerator/=a;denominator/=a;
  return {numerator,denominator};
}
