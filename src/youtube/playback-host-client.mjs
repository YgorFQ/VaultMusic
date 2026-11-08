import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {dataDir} from './runtime.mjs';
const home = path.join(import.meta.dirname, 'playback-host');
const data = process.env.MEI_PLAYBACK_HOST_DATA || path.join(dataDir, 'playback-host');
let ready, child;
export async function playbackHost() {
  if (!ready) ready = (async () => {
    if (!fs.existsSync(path.join(home, 'FreeTube.exe'))) throw Error('Auxiliar de reprodução ausente. Instale pelo pacote completo da Release.');
    fs.mkdirSync(data, {recursive:true});
    const key = crypto.randomBytes(32).toString('hex'), socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
    const env = {...process.env, TEMP:path.join(data, 'temp'), TMP:path.join(data, 'temp')}; fs.mkdirSync(env.TEMP, {recursive:true});
    child = spawn(path.join(home, 'FreeTube.exe'), [String(port), key, data], {cwd:home, env, windowsHide:true, stdio:'ignore'});
    let launchError; child.on('error', error => launchError = error);
    const origin = `http://127.0.0.1:${port}`;
    for (let i=0;i<100;i++) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw Error('O auxiliar de reprodução encerrou durante a abertura.');
      try {const r=await fetch(origin+'/health',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(700)}); if(r.ok) return {origin,key};} catch {}
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw Error('O auxiliar de reprodução não iniciou.');
  })().catch(error=>{child?.kill(); ready=null; throw error;});
  return ready;
}
export async function playbackFetch(url, options={}) {
  const host=await playbackHost(), remote=[...new Headers(options.headers)];
  return fetch(host.origin+'/transport?url='+encodeURIComponent(String(url)), {...options,headers:{Authorization:'Bearer '+host.key,'X-Mei-Transport-Headers':JSON.stringify(remote)}});
}
export async function playbackToken(videoId,args) {
  const host=await playbackHost(), response=await fetch(host.origin+'/token',{method:'POST',headers:{Authorization:'Bearer '+host.key,'Content-Type':'application/json'},body:JSON.stringify({videoId,args}),signal:AbortSignal.timeout(45000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Falha ao preparar a sessão de reprodução.');return result;
}
export async function closePlaybackHost(){child?.kill();ready=null;child=undefined;}
process.on('exit',()=>child?.kill());
