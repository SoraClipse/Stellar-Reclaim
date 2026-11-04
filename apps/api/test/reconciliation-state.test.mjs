import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReconciliationState} from '../src/reconciliation-state.mjs';

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'reclaim-reconcile-'));
  const path=join(dir,'state.sqlite');
  const open=()=>{
    const db=new DatabaseSync(path);
    db.exec('PRAGMA journal_mode=WAL;PRAGMA busy_timeout=2000;');
    return {db,state:new ReconciliationState(db)};
  };
  return {open,dispose:()=>rmSync(dir,{recursive:true,force:true})};
}
test('checkpoint survives restart; cursors compare numerically',()=>{
  const f=fixture();
  try{
    let {db,state}=f.open();
    const lease=state.acquire('testnet',100);
    assert.equal(lease.cursor,null);
    assert.equal(state.advance('testnet',lease.token,'9',101),'9');
    assert.equal(state.advance('testnet',lease.token,'10',102),'10');
    assert.throws(()=>state.advance('testnet',lease.token,'09',103),{code:'non_monotonic_cursor'});
    assert.equal(state.release('testnet',lease.token,104),true);
    db.close();
    ({db,state}=f.open());
    assert.equal(state.read('testnet').cursor,'10');
    const next=state.acquire('testnet',105);
    assert.equal(next.cursor,'10');
    assert.equal(state.advance('testnet',next.token,'11',106),'11');
    db.close();
  }finally{f.dispose();}
});
test('two workers cannot share a lease; stale owner is fenced out',()=>{
  const f=fixture();
  try{
    const a=f.open(),b=f.open();
    const first=a.state.acquire('testnet',200,10);
    assert.equal(b.state.acquire('testnet',205,10),null);
    assert.equal(a.state.heartbeat('testnet',first.token,206,10),216);
    assert.equal(b.state.acquire('testnet',215,10),null);
    const second=b.state.acquire('testnet',216,10);
    assert.ok(second&&second.token!==first.token);
    assert.throws(()=>a.state.advance('testnet',first.token,'100',217),{code:'lease_lost'});
    assert.equal(a.state.release('testnet',first.token,217),false);
    assert.equal(b.state.advance('testnet',second.token,'100',217),'100');
    a.db.close();b.db.close();
  }finally{f.dispose();}
});
test('invalid network, lease, cursor and expired owner fail closed',()=>{
  const f=fixture();
  try{
    const {db,state}=f.open();
    assert.throws(()=>state.acquire('public',20),{code:'invalid_network'});
    assert.throws(()=>state.acquire('testnet',-1),{code:'invalid_lease'});
    const lease=state.acquire('testnet',20,5);
    assert.throws(()=>state.advance('testnet',lease.token,'5',25),{code:'lease_lost'});
    assert.throws(()=>state.advance('testnet',lease.token,'wrong',21),{code:'invalid_checkpoint'});
    assert.throws(()=>state.heartbeat('testnet','a'.repeat(64),21),{code:'lease_lost'});
    assert.equal(state.read('testnet').cursor,null);
    db.close();
  }finally{f.dispose();}
});
