import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {install} from '../installer/install.mjs';import {sha256} from '../src/native/pe-assets.mjs';
test('install creates a new copy with isolated identity and zero linked account',{skip:!process.env.VAULTMUSIC_TEST_ORIGINAL||!process.env.VAULTMUSIC_TEST_PACKAGE,timeout:120000},async()=>{
 const source=process.env.VAULTMUSIC_TEST_ORIGINAL,packageRoot=process.env.VAULTMUSIC_TEST_PACKAGE,temp=fs.mkdtempSync(path.join(os.tmpdir(),'VaultMusic-install-test-')),destination=path.join(temp,'Aplicativo com espaços');
 const before=sha256(fs.readFileSync(path.join(source,'Mei Music.exe')));
 await assert.rejects(install({source,destination:path.join(source,'DO-NOT-CREATE'),packageRoot}),/separada/);
 await install({source,destination,packageRoot,port:0});
 assert.equal(sha256(fs.readFileSync(path.join(source,'Mei Music.exe'))),before);
 assert(fs.existsSync(path.join(destination,'Abrir-VaultMusic.cmd')));assert(fs.existsSync(path.join(destination,'youtube/playback-host/resources/app/botguard.js')));
 const config=JSON.parse(fs.readFileSync(path.join(destination,'youtube/connection.json')));assert.match(config.capability,/^[a-f0-9]{64}$/);assert(config.instanceId);assert(config.port>1024);
 assert(!fs.existsSync(path.join(destination,'youtube/data')));
 await assert.rejects(install({source,destination,packageRoot}),/já existe/);
 const {createBridge}=await import(pathToFileURL(path.join(destination,'youtube/server.mjs')));
 const dataDir=path.join(destination,'youtube/data'),bridge=await createBridge({config,dataDir,openBrowser:false});await new Promise(resolve=>bridge.listen(config.port,'127.0.0.1',resolve));
 try {
  const url=`http://127.0.0.1:${config.port}`;
  assert.equal((await fetch(url+'/api/status')).status,403);
  const headers={Authorization:'Bearer '+config.capability},response=await fetch(url+'/api/status',{headers});assert(response.ok);const status=await response.json();
  assert.equal(status.instanceId,config.instanceId);assert.equal(status.configured,false);assert.equal(status.linked,false);assert.equal(status.canWrite,false);assert.deepEqual(status.history,[]);assert.deepEqual(status.topics,[]);
  assert.equal((await fetch(url+'/api/status',{headers:{...headers,Origin:'https://unrelated.invalid'}})).status,403);
  for(const name of ['app.js','recommendations.mjs','recommendation-core.mjs','engine/freetube-engine.js'])assert.equal((await fetch(url+'/'+name)).status,200,name);
  assert(!fs.existsSync(path.join(dataDir,'settings.dpapi')));assert(!fs.existsSync(path.join(dataDir,'account.dpapi')));
  const profile=await(await fetch(url+'/api/taste-profile',{headers})).json();assert.equal(profile.likedCount,0);assert.deepEqual(profile.seeds,[]);
 }finally{await new Promise(resolve=>bridge.close(resolve));}
 console.log('Installed copy and source preservation verified; no production profile accessed.');
});
