import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
export const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function readAsset(exe, asset) {
  const data = zlib.brotliDecompressSync(exe.subarray(asset.offset, asset.offset + asset.compressedSize));
  assert.equal(sha256(data), asset.sha256, 'O conteúdo do aplicativo não corresponde à versão suportada.');
  return data.toString('utf8');
}
export function replaceAsset(exe, asset, value, name) {
  const pe = exe.readUInt32LE(60), opt = pe + 24, table = opt + exe.readUInt16LE(pe + 20), n = exe.readUInt16LE(pe + 6);
  assert.equal(exe.readUInt16LE(opt), 0x20b, 'É necessário o Mei Music x64.');
  assert.equal(exe.readUInt32LE(opt + 112 + 4 * 8 + 4), 0, 'Executável com assinatura inesperada.');
  assert(table + (n + 1) * 40 <= exe.readUInt32LE(opt + 60), 'Não há espaço para os recursos da interface.');
  const base = exe.readBigUInt64LE(opt + 24), fa = exe.readUInt32LE(opt + 36), sa = exe.readUInt32LE(opt + 32);
  const sections = Array.from({ length: n }, (_, i) => {
    const h = table + i * 40;
    return { rva: exe.readUInt32LE(h + 12), raw: exe.readUInt32LE(h + 20), size: exe.readUInt32LE(h + 16), vsize: exe.readUInt32LE(h + 8) };
  });
  const containing = offset => { const s = sections.find(s => offset >= s.raw && offset < s.raw + s.size); assert(s); return s; };
  const section = containing(asset.offset), oldVA = base + BigInt(section.rva + asset.offset - section.raw);
  const pattern = Buffer.alloc(8); pattern.writeBigUInt64LE(oldVA);
  const refs = [];
  for (let p = -1; (p = exe.indexOf(pattern, p + 1)) >= 0;)
    if (Number(exe.readBigUInt64LE(p + 8)) === asset.compressedSize) refs.push(p);
  assert.equal(refs.length, 1, 'Ponteiro do recurso não reconhecido.');
  const pointerSection = containing(refs[0]), pointerRva = pointerSection.rva + refs[0] - pointerSection.raw;
  const offsetOf = rva => { const s = sections.find(s => rva >= s.rva && rva < s.rva + Math.max(s.size, s.vsize)); assert(s); return s.raw + rva - s.rva; };
  let rel = exe.readUInt32LE(opt + 112 + 5 * 8), end = rel + exe.readUInt32LE(opt + 112 + 5 * 8 + 4), relocated = false;
  while (rel < end) {
    const at = offsetOf(rel), page = exe.readUInt32LE(at), len = exe.readUInt32LE(at + 4);
    if (!len) break;
    assert(len >= 8 && rel + len <= end);
    for (let i = 8; i < len; i += 2) { const entry = exe.readUInt16LE(at + i); if (entry >>> 12 === 10 && page + (entry & 4095) === pointerRva) relocated = true; }
    rel += len;
  }
  assert(relocated, 'A realocação ASLR do recurso não foi reconhecida.');
  const data = zlib.brotliCompressSync(Buffer.from(value), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9 } });
  const align = (v, a) => Math.ceil(v / a) * a, raw = align(exe.length, fa), rva = align(Math.max(...sections.map(s => s.rva + Math.max(s.size, s.vsize))), sa), size = align(data.length, fa);
  const patched = Buffer.alloc(raw + size); exe.copy(patched); data.copy(patched, raw);
  const h = table + n * 40; patched.fill(0, h, h + 40); patched.write(name.slice(0, 8), h, 'ascii');
  patched.writeUInt32LE(data.length, h + 8); patched.writeUInt32LE(rva, h + 12); patched.writeUInt32LE(size, h + 16); patched.writeUInt32LE(raw, h + 20); patched.writeUInt32LE(0x40000040, h + 36);
  patched.writeUInt16LE(n + 1, pe + 6); patched.writeUInt32LE(align(rva + data.length, sa), opt + 56); patched.writeUInt32LE(exe.readUInt32LE(opt + 8) + size, opt + 8);
  patched.writeBigUInt64LE(base + BigInt(rva), refs[0]); patched.writeBigUInt64LE(BigInt(data.length), refs[0] + 8);
  patched.writeUInt32LE(0, opt + 64); let sum = 0;
  for (let i = 0; i < patched.length; i += 2) { sum += (patched[i] || 0) + ((patched[i + 1] || 0) << 8); sum = (sum & 65535) + (sum >>> 16); }
  sum = (sum & 65535) + (sum >>> 16); patched.writeUInt32LE((sum + patched.length) >>> 0, opt + 64);
  const text = sections[0]; assert(exe.subarray(text.raw, text.raw + text.size).equals(patched.subarray(text.raw, text.raw + text.size)), 'Código nativo alterado inesperadamente.');
  assert.equal(zlib.brotliDecompressSync(patched.subarray(raw, raw + data.length)).toString(), value);
  return patched;
}
