import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';
import {patchMei,validateOriginal} from '../src/native/patch-ui.mjs';import {sha256} from '../src/native/pe-assets.mjs';
test('refuses an unsupported original before any modification',()=>assert.throws(()=>validateOriginal(Buffer.from('unsupported')),/incompatível/));
test('transforms only embedded web assets of the supported original',{skip:!process.env.VAULTMUSIC_TEST_ORIGINAL},async()=>{
 const file=path.join(process.env.VAULTMUSIC_TEST_ORIGINAL,'Mei Music.exe'),bytes=fs.readFileSync(file),before=sha256(bytes);
 const config={port:18761,capability:'a'.repeat(64)},result=await patchMei(bytes,config);
 assert.equal(sha256(fs.readFileSync(file)),before);assert.notEqual(sha256(result),before);
 const pe=result.readUInt32LE(60),opt=pe+24,table=opt+result.readUInt16LE(pe+20),n=result.readUInt16LE(pe+6);
 const h=table,textRaw=bytes.readUInt32LE(h+20),textSize=bytes.readUInt32LE(h+16);
 assert(bytes.subarray(textRaw,textRaw+textSize).equals(result.subarray(textRaw,textRaw+textSize)));
 const assets=[];for(let i=n-2;i<n;i++){const at=table+i*40,raw=result.readUInt32LE(at+20),size=result.readUInt32LE(at+8);assets.push(zlib.brotliDecompressSync(result.subarray(raw,raw+size)).toString());}
 assert(assets[0].includes('mei-youtube-state'));assert(assets[0].includes(config.capability));assert(assets[0].includes('MeiNativePlaybackBar'));assert(assets[0].includes('meiYT.discord'));
 assert(assets[1].includes('frame-src http://mei-layout.localhost http://127.0.0.1:18761'));
 assert(!assets[0].includes('__MEI_FRAME_URL__'));
});
