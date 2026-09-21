import test from 'node:test';
import assert from 'node:assert/strict';
import {canOwnerApproveRelease} from '../scripts/npm-owner-review-exception.mjs';
const owner={login:'douglas-grishen',id:207043696};
test('only the owner can automatically approve his own original and rerun release',()=>{
 assert(canOwnerApproveRelease({actor:owner,triggeringActor:owner,viewer:owner}));
 for(const field of ['actor','triggeringActor','viewer'])for(const person of [undefined,{...owner,id:1},{...owner,login:'other'}])
  assert.equal(canOwnerApproveRelease({...{actor:owner,triggeringActor:owner,viewer:owner},[field]:person}),false);
});
