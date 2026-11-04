import {createServer} from 'node:http';
import {createSecureService} from './secure-service.mjs';

// Fail closed: no default ephemeral storage, accidental public-network access,
// or public binding. An HTTPS reverse proxy and independent review are required.
const origin=process.env.RECLAIM_ORIGIN;
const dbPath=process.env.RECLAIM_DB_PATH;
const port=Number(process.env.PORT??8787);
if(!Number.isSafeInteger(port)||port<=0||port>65535)throw Error('Invalid port');
const service=createSecureService({origin,dbPath,network:process.env.RECLAIM_NETWORK??'testnet'});
const server=createServer(async(req,res)=>{
 try {
  if(!req.url?.startsWith('/')||req.url.startsWith('//')){res.writeHead(400);res.end();return;}
  const method=req.method??'GET';
  const chunks=[];let size=0;
  for await(const chunk of req){
   size+=chunk.length;
   if(size>8192){res.writeHead(413,{'cache-control':'no-store'});res.end();return;}
   chunks.push(chunk);
  }
  const request=new Request(new URL(req.url,origin),{
   method,headers:req.headers,
   ...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})
  });
  const response=await service.handle(request);
  res.writeHead(response.status,Object.fromEntries(response.headers));
  res.end(await response.text());
 }catch{
  res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
  res.end('{"error":"service_unavailable"}');
 }
});
server.listen(port,'127.0.0.1',()=>console.log('Stellar Reclaim secure API listening on loopback port '+port));
function shutdown(){server.close(()=>{service.close();process.exit(0);});}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
