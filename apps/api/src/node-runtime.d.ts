/** Minimal Node runtime type surface for this dependency-free workspace.
 * Replace with @types/node when package management permits dependency updates.
 */
declare class Buffer extends Uint8Array {
 static from(value: string | Uint8Array, encoding?: string):Buffer;
 static concat(chunks: readonly Uint8Array[]):Buffer;
 toString(encoding?:string):string;
}
declare module 'node:crypto' {
 export function createHash(algorithm:string):{update(data:string):{digest(encoding:'hex'):string}};
 export function randomBytes(size:number):Buffer;
 export function randomUUID():string;
 export function timingSafeEqual(a:Uint8Array,b:Uint8Array):boolean;
 export function createPublicKey(options:{key:Uint8Array;format:'der';type:'spki'}):unknown;
 export function verify(algorithm:null,data:Uint8Array,key:unknown,signature:Uint8Array):boolean;
}
declare module 'node:http' {
 export interface IncomingMessage extends AsyncIterable<Uint8Array>{
  url?:string;method?:string;headers:Record<string,string|string[]|undefined>;socket:{remoteAddress?:string};
 }
 export interface ServerResponse {
  writeHead(status:number,headers:Record<string,string>):void;
  end(body?:string):void;
 }
 export interface Server {listen(port:number,host:string):void}
 export function createServer(handler:(req:IncomingMessage,res:ServerResponse)=>void|Promise<void>):Server;
}
