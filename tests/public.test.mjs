import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {audit} from '../scripts/audit-public.mjs';import {buildTasteProfile,rankRecommendations} from '../src/youtube/recommendation-core.mjs';
test('source distribution has no local accounts, personal paths or Mei binaries',async()=>{assert((await audit(path.resolve(import.meta.dirname,'..'))).files>20);});
test('taste ranking uses explicit liked/listened videos and respects hidden IDs',()=>{
 const video=(id,title)=>({id,snippet:{title,channelTitle:'Artist',categoryId:'10',tags:[]}});
 const profile=buildTasteProfile({likes:[video('liked000001','Synthwave Song')],history:[{id:'heard000001',title:'Another song',channelTitle:'Other artist',listenedSeconds:90}],hidden:['hide0000001']});
 assert(profile.seeds.some(x=>x.source==='liked'));assert(profile.seeds.some(x=>x.source==='listened'));
 const candidates=[video('hide0000001','Hidden'),video('next0000001','Synthwave discovery'),video('next0000001','Duplicate')],ranked=rankRecommendations(candidates,profile);
 assert.equal(ranked.length,1);assert.equal(ranked[0].id,'next0000001');
});
