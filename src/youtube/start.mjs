import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {dataDir} from './runtime.mjs';
const dir=import.meta.dirname, root=path.dirname(dir);
fs.mkdirSync(dataDir,{recursive:true});
const log=message=>{console.log(message);fs.appendFileSync(path.join(dataDir,'inicializacao.log'),new Date().toISOString()+' '+message+'\r\n');};
try {
  const config=JSON.parse(fs.readFileSync(path.join(dir,'connection.json'),'utf8')), origin=`http://127.0.0.1:${config.port}`;
  const env={...process.env,VAULTMUSIC_DATA:dataDir,TEMP:path.join(dataDir,'temp'),TMP:path.join(dataDir,'temp'),LOCALAPPDATA:path.join(dataDir,'dados-locais'),APPDATA:path.join(dataDir,'dados-roaming'),WEBVIEW2_USER_DATA_FOLDER:path.join(dataDir,'webview')};
  for(const key of ['TEMP','LOCALAPPDATA','APPDATA','WEBVIEW2_USER_DATA_FOLDER'])fs.mkdirSync(env[key],{recursive:true});
  const ready=async()=>{try{const response=await fetch(origin+'/api/status',{headers:{Authorization:'Bearer '+config.capability},signal:AbortSignal.timeout(1200)});if(!response.ok)return false;const value=await response.json();return value.instanceId===config.instanceId&&value.playbackEngine==='freetube-shaka'&&value.recommendationEngine==='video-seeds-v2';}catch{return false;}};
  log('Preparando o YouTube local...');
  if(!await ready()) {
    const fd=fs.openSync(path.join(dataDir,'servico.log'),'a'); let launchError;
    const child=spawn(process.execPath,[path.join(dir,'server.mjs')],{cwd:dir,env,windowsHide:true,detached:true,stdio:['ignore','ignore',fd]});
    child.on('error',error=>launchError=error);child.unref();fs.closeSync(fd);
    let ok=false;
    for(let i=0;i<40;i++){if(launchError)throw launchError;if(await ready()){ok=true;break;}await new Promise(resolve=>setTimeout(resolve,250));}
    if(!ok)throw Error(`O serviço não iniciou. A porta ${config.port} pode estar ocupada. Consulte youtube/data/servico.log. Feche esta cópia antes de reinstalar em outra pasta.`);
  }
  log('Conexão local pronta.');
  if(!process.argv.includes('--diagnostico')) {
    const child=spawn(path.join(root,'Mei Music.exe'),[],{cwd:root,env,detached:true,stdio:'ignore'});
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
    log('Mei Music aberto diretamente. Se já estava aberto, confira a janela existente e a bandeja.');
  }
} catch(error) { log('ERRO: '+error.message);process.exitCode=1; }
