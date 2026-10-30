const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function crc16(data) {
  let crc = 0;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i=0;i<8;i++) crc = crc & 32768 ? ((crc << 1) ^ 0x1021) & 65535 : (crc << 1) & 65535;
  }
  return crc;
}
function encode(body) {
  const crc = crc16(body);
  const bytes = [...body, crc & 255, crc >> 8];
  let bits=0, buffer=0, value='';
  for(const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while(bits >= 5) {bits -= 5; value += ALPHA[(buffer >>> bits) & 31];}
  }
  if (bits > 0) value += ALPHA[(buffer << (5-bits)) & 31];
  return value;
}
export async function makeSigner() {
  const keys = await crypto.subtle.generateKey('Ed25519', true, ['sign','verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  return {account: encode([48,...raw]), muxed: encode([96,...raw,0,0,0,0,0,0,0,7]), key:keys.privateKey};
}
export async function sign(key, bytes) {
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519',key,bytes));
  return btoa(String.fromCharCode(...signature));
}
