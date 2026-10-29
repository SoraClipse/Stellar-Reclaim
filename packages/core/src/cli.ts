import { formatStroops, parseStroops } from './index.ts';
if (process.argv[2] !== '--amount' || !process.argv[3]) {
  console.error('Usage: node --experimental-strip-types packages/core/src/cli.ts --amount 12.3456789');
  process.exitCode = 2;
} else {
  try { console.log(JSON.stringify({stroops:parseStroops(process.argv[3]).toString(),exact:formatStroops(parseStroops(process.argv[3]))})); }
  catch (err) {console.error(err instanceof Error ? err.message : 'Invalid amount');process.exitCode = 2;}
}
