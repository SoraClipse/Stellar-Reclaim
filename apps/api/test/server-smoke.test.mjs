import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

const serverFile=fileURLToPath(new URL('../src/server.mjs',import.meta.url));
async function freePort(){
 const srv=createServer();
 return new Promise((resolve,reject)=>{
  srv.once('error',reject);srv.listen(0,'127.0.0.1',()=>{
   const port=srv.address().port;srv.close(()=>resolve(port));
  });
 });
}
test('real HTTP entry point requires durable storage and serves testnet-only API', {timeout:16000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),'reclaim-http-'));
 const port=await freePort(),origin='http://127.0.0.1:'+port;
 const proc=spawn(process.execPath,['--experimental-strip-types',serverFile],{
  env:{...process.env,PORT:String(port),RECLAIM_ORIGIN:origin,RECLAIM_DB_PATH:join(dir,'service.db'),RECLAIM_NETWORK:'testnet'},
  stdio:['ignore','pipe','pipe']
 });
 let err='';proc.stderr.on('data',b=>{err+=b.toString().slice(0,2000);});
 try{
  let online=false;
  for(let i=0;i<50;i++){
   if(proc.exitCode!==null)break;
   try{const response=await fetch(origin+'/health',{signal:AbortSignal.timeout(250)});if(response.ok){online=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(online,true,'HTTP service failed to start: '+err.slice(-500));
  const healthy=await (await fetch(origin+'/health')).json();
  assert.equal(healthy.storage,'sqlite');
  assert.equal(healthy.refundVerification,false);
  const response=await fetch(origin+'/v2/challenges',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({account:'not-a-stellar-account',network:'public'})});
  assert.equal(response.status,403);
  const legacy=await fetch(origin+'/v1/challenge',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(legacy.status,404,'legacy unsafe API must not be exposed');
 }finally{
  proc.kill('SIGTERM');
  await Promise.race([new Promise(r=>proc.once('exit',r)),new Promise(r=>setTimeout(r,900))]);
  if(proc.exitCode===null)proc.kill('SIGKILL');
  rmSync(dir,{recursive:true,force:true});
 }
});
