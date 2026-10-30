import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
function scan(dir){for(const ent of readdirSync(dir,{withFileTypes:true})){const p=join(dir,ent.name);if(ent.isDirectory())scan(p);else if(/\.(ts|mjs|json|sql|yaml|yml|md)$/.test(p)){const t=readFileSync(p,'utf8');if(/\r/.test(t)||!t.endsWith('\n')||/[\t ]+$/m.test(t))throw Error(`Formatting error: ${p}`);}}}
for(const dir of ['packages','docs','scripts','.github','apps','schemas'])scan(dir);
console.log('Lint: whitespace/newlines OK');
