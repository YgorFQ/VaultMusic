import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import {pathToFileURL} from 'node:url';
import {patchMei, validateOriginal} from '../src/native/patch-ui.mjs';
import {sha256} from '../src/native/pe-assets.mjs';
const root=path.resolve(import.meta.dirname,'..');
const within=(child,parent)=>{const rel=path.relative(parent,child);return !rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));};
function copyTree(source,destination) {
  const st=fs.lstatSync(source);if(st.isSymbolicLink())throw Error('A instalação original contém um vínculo inesperado.');
  if(st.isDirectory()){fs.mkdirSync(destination,{recursive:true});for(const name of fs.readdirSync(source))copyTree(path.join(source,name),path.join(destination,name));}
  else if(st.isFile()){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination,fs.constants.COPYFILE_EXCL);}
}
async function freePort(preferred=18743) {
  const socket=net.createServer();
  try{await new Promise((resolve,reject)=>{socket.once('error',reject);socket.listen(preferred,'127.0.0.1',resolve);});const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;}
  catch(error){if(preferred&&error.code==='EADDRINUSE')return freePort(0);throw error;}
}
export async function install({source,destination,packageRoot=root,port}={}) {
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Este pacote requer Windows x64.');
  if(!source||!destination)throw Error('Informe a pasta original e uma pasta nova para a cópia.');
  source=fs.realpathSync(source);destination=path.resolve(destination);
  let ancestor=destination;const missing=[];
  while(!fs.existsSync(ancestor)){missing.unshift(path.basename(ancestor));const parent=path.dirname(ancestor);if(parent===ancestor)throw Error('Destino inválido.');ancestor=parent;}
  destination=path.resolve(fs.realpathSync(ancestor),...missing);
  if(within(destination,source)||within(source,destination))throw Error('Escolha uma pasta de destino separada da instalação original.');
  if(fs.existsSync(destination))throw Error('A pasta de destino já existe. Use sua instalação atual ou escolha outra pasta vazia; nenhum arquivo será sobrescrito.');
  const bytes=fs.readFileSync(path.join(source,'Mei Music.exe'));validateOriginal(bytes);
  for(const name of ['steam_api64.dll','tools'])if(!fs.existsSync(path.join(source,name)))throw Error('A pasta original está incompleta: falta '+name);
  for(const name of ['runtime/node.exe','payload/playback-host/FreeTube.exe','src/youtube/engine/source.zip'])if(!fs.existsSync(path.join(packageRoot,name)))throw Error('Pacote incompleto. Baixe e extraia o ZIP completo da Release.');
  const config={port:await freePort(port??18743),capability:crypto.randomBytes(32).toString('hex'),instanceId:crypto.randomUUID()};
  console.log('Conferindo o Mei Music 1.1.21 e preparando a interface...');
  const modified=await patchMei(bytes,config);
  const staging=destination+'.instalando-'+crypto.randomBytes(5).toString('hex');
  fs.mkdirSync(staging,{recursive:true});
  try{
    // Only distribution files from the original are copied. User profiles are never imported.
    for(const name of ['steam_api64.dll','tools','release-manifest.json'])if(fs.existsSync(path.join(source,name)))copyTree(path.join(source,name),path.join(staging,name));
    fs.writeFileSync(path.join(staging,'Mei Music.exe'),modified,{flag:'wx'});
    const youtube=path.join(staging,'youtube');fs.mkdirSync(youtube);
    // Fixed allowlist prevents local connection files, accounts and caches from entering a new copy.
    const names=['app.js','index.html','style.css','server.mjs','runtime.mjs','start.mjs','player-support.mjs','direct-player.mjs','direct-transport.mjs','playback-host-client.mjs','recommendations.mjs','recommendation-core.mjs','engine-sandbox.js','engine-sandbox.html','player-about.html'];
    for(const name of names)copyTree(path.join(packageRoot,'src/youtube',name),path.join(youtube,name));
    for(const name of ['freetube-engine.js','botguard.js','renderer.js.LICENSE.txt','LICENSE-FreeTube.txt','NOTICE.txt','build-manifest.json','source.zip'])copyTree(path.join(packageRoot,'src/youtube/engine',name),path.join(youtube,'engine',name));
    copyTree(path.join(packageRoot,'payload/playback-host'),path.join(youtube,'playback-host'));
    copyTree(path.join(packageRoot,'runtime/node.exe'),path.join(youtube,'node.exe'));
    copyTree(path.join(packageRoot,'runtime/LICENSE-node.txt'),path.join(youtube,'LICENSE-node.txt'));
    copyTree(path.join(packageRoot,'installer/Abrir-VaultMusic.cmd'),path.join(staging,'Abrir-VaultMusic.cmd'));
    copyTree(path.join(packageRoot,'docs'),path.join(staging,'docs'));
    copyTree(path.join(packageRoot,'LICENSE'),path.join(staging,'LICENSE'));
    fs.writeFileSync(path.join(youtube,'connection.json'),JSON.stringify(config,null,2),{flag:'wx'});
    const version=JSON.parse(fs.readFileSync(path.join(packageRoot,'compatibility.json')));
    fs.writeFileSync(path.join(staging,'installation.json'),JSON.stringify({pluginVersion:version.pluginVersion,meiVersion:version.meiVersion,originalSha256:sha256(bytes),modifiedSha256:sha256(modified),installedAt:new Date().toISOString(),nativeInstructionsPreserved:true},null,2));
    if(sha256(fs.readFileSync(path.join(source,'Mei Music.exe')))!==sha256(bytes))throw Error('O aplicativo original mudou durante a instalação.');
    fs.renameSync(staging,destination);
    console.log('Pronto. Abra Abrir-VaultMusic.cmd na pasta criada.');
    return {destination,port:config.port};
  }catch(error){
    // Keep a failed staging directory for inspection; never delete arbitrary user paths.
    throw Error(error.message+' A instalação não foi ativada; arquivos parciais podem estar em '+staging);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const args=process.argv.slice(2),get=key=>args[args.indexOf(key)+1];
  try{await install({source:args.includes('--source')?get('--source'):null,destination:args.includes('--destination')?get('--destination'):null});}
  catch(error){console.error('ERRO: '+error.message);process.exitCode=1;}
}
