import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {execFileSync} from 'node:child_process';
import {sha256} from '../src/native/pe-assets.mjs';
import {audit} from './audit-public.mjs';
const root=path.resolve(import.meta.dirname,'..'),version=JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
const cache=process.env.VAULTMUSIC_CACHE||path.join(os.tmpdir(),'VaultMusic-build');fs.mkdirSync(cache,{recursive:true});
const archive=(action,source,dest)=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/archive.ps1'),'-Action',action,'-Source',source,'-Destination',dest],{stdio:'inherit',windowsHide:true});
async function download(url,name,expected) {
  const target=path.join(cache,name);
  if(fs.existsSync(target)&&sha256(fs.readFileSync(target))===expected)return target;
  console.log('Baixando '+name+' da origem oficial...');
  const response=await fetch(url,{signal:AbortSignal.timeout(240000)});if(!response.ok)throw Error('Download falhou: '+response.status);
  await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(target+'.part'));
  if(sha256(fs.readFileSync(target+'.part'))!==expected)throw Error('SHA-256 inesperado em '+name);
  fs.renameSync(target+'.part',target);return target;
}
function copy(source,dest) {fs.mkdirSync(path.dirname(dest),{recursive:true});fs.cpSync(source,dest,{recursive:true,errorOnExist:true,force:false});}
function sourceTree(source,dest) {
  for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
    if(entry.name==='source.zip')continue;
    const from=path.join(source,entry.name),to=path.join(dest,entry.name);
    if(entry.isSymbolicLink())throw Error('Vínculo inesperado em fonte de distribuição.');
    if(entry.isDirectory())sourceTree(from,to);else copy(from,to);
  }
}
function find(parent,name) {if(fs.existsSync(path.join(parent,name)))return parent;for(const e of fs.readdirSync(parent,{withFileTypes:true}))if(e.isDirectory()){const found=find(path.join(parent,e.name),name);if(found)return found;}}
await audit(root);
const nodeZip=await download('https://nodejs.org/dist/v24.22.1/node-v24.22.1-win-x64.zip','node-v24.22.1-win-x64.zip','d2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5');
const ftZip=await download('https://github.com/FreeTubeApp/FreeTube/releases/download/v0.26.0-beta/freetube-0.26.0-beta-win-x64-portable.zip','freetube-0.26.0-beta-win-x64-portable.zip','0dc6af44013bf64d270fe7e1e1430177cbd1400cf76fd01750139bf121c41a27');
const scratch=fs.mkdtempSync(path.join(cache,'package-'));
archive('Expand',nodeZip,path.join(scratch,'node'));archive('Expand',ftZip,path.join(scratch,'freetube'));
const nodeDir=find(path.join(scratch,'node'),'node.exe'),ftDir=find(path.join(scratch,'freetube'),'FreeTube.exe');
if(!nodeDir||!ftDir)throw Error('Estrutura dos runtimes não reconhecida.');
if(sha256(fs.readFileSync(path.join(ftDir,'resources/app.asar')))!=='9a2179317202ddf6e54884d3581c3c8d063d456ca3cfcb0e03b3aba407b9569e')throw Error('ASAR do FreeTube não corresponde à adaptação.');
const staged=path.join(scratch,'VaultMusic');fs.mkdirSync(staged);
for(const name of ['Instalar.cmd','README.md','LICENSE','THIRD-PARTY.md','package.json','package-lock.json','compatibility.json'])copy(path.join(root,name),path.join(staged,name));
for(const name of ['src','installer','scripts','docs','licenses','upstream','tests'])sourceTree(path.join(root,name),path.join(staged,name));
copy(path.join(root,'node_modules/prettier'),path.join(staged,'node_modules/prettier'));
copy(path.join(nodeDir,'node.exe'),path.join(staged,'runtime/node.exe'));copy(path.join(nodeDir,'LICENSE'),path.join(staged,'runtime/LICENSE-node.txt'));
const host=path.join(staged,'payload/playback-host');fs.mkdirSync(host,{recursive:true});
for(const entry of fs.readdirSync(ftDir,{withFileTypes:true}))if(entry.name!=='resources')copy(path.join(ftDir,entry.name),path.join(host,entry.name));
for(const [source,target]of [['playback-host.cjs','main.cjs'],['playback-host-package.json','package.json'],['engine/botguard.js','botguard.js']])copy(path.join(root,'src/youtube',source),path.join(host,'resources/app',target));
const sourceStage=path.join(scratch,'sources');fs.mkdirSync(sourceStage);
for(const name of ['README.md','LICENSE','THIRD-PARTY.md','package.json','package-lock.json','compatibility.json','Instalar.cmd'])copy(path.join(root,name),path.join(sourceStage,name));
for(const name of ['src','installer','scripts','docs','licenses','upstream','tests'])sourceTree(path.join(root,name),path.join(sourceStage,name));
const sourceZip=path.join(staged,'src/youtube/engine/source.zip');archive('Compress',sourceStage,sourceZip);
await audit(staged,{release:true});
const dist=path.join(root,'dist');fs.mkdirSync(dist,{recursive:true});
const output=path.join(dist,`VaultMusic-${version}-Windows-x64.zip`);
if(fs.existsSync(output))throw Error('O ZIP desta versão já existe. Altere a versão antes de gerar outra publicação.');
console.log('Compactando o pacote completo...');archive('Compress',staged,output);
const manifest={version,createdAt:new Date().toISOString(),file:path.basename(output),bytes:fs.statSync(output).size,sha256:sha256(fs.readFileSync(output)),meiIncluded:false,personalDataIncluded:false,stagedPackage:staged};
fs.writeFileSync(path.join(dist,'local-build.json'),JSON.stringify(manifest,null,2));
fs.writeFileSync(output+'.sha256',manifest.sha256+'  '+path.basename(output)+'\n');
console.log(JSON.stringify({package:path.basename(output),MiB:Math.round(manifest.bytes/1048576),sha256:manifest.sha256}));
