import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {sha256} from '../src/native/pe-assets.mjs';
// These exact upstream-derived bundles contain public YouTube client constants, not a user's Cloud credentials.
const publicBundles=new Map([
  ['src/youtube/engine/freetube-engine.js','aceb989e8ad707b65c0726fc41e8513314375a8066ec681e6b20860dcd24acc7'],
  ['src/youtube/engine/botguard.js','5d0d81b455909bbbb2bbac7175f6dd379119bfe6e301320799852e04f6c5a215'],
  ['payload/playback-host/resources/app/botguard.js','5d0d81b455909bbbb2bbac7175f6dd379119bfe6e301320799852e04f6c5a215']
]);
const forbiddenNames=/^(connection\.json|preferences\.json|taste-cache\.json|installation\.json|account\.dpapi|settings\.dpapi|client_secret.*\.json|credentials.*\.json|\.env(?:\..*)?)$/i;
export async function audit(root,{release=false}={}) {
  const errors=[];let files=0;
  function visit(dir) {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      if(['.git','node_modules','dist','.cache','.test-output'].includes(entry.name))continue;
      const full=path.join(dir,entry.name),rel=path.relative(root,full).replaceAll('\\','/');
      if(entry.isSymbolicLink()){errors.push(rel+': vínculo');continue;}
      if(entry.isDirectory()){if(['data','webview','dados-locais','dados-roaming'].includes(entry.name))errors.push(rel+': perfil/cache');else visit(full);continue;}
      files++;
      if(forbiddenNames.test(entry.name)||/\.dpapi$|\.log$|\.tmp$/i.test(entry.name))errors.push(rel+': dados locais');
      if(entry.name==='Mei Music.exe'||entry.name==='steam_api64.dll'||entry.name==='App-CMvkbRUC.js'||entry.name==='interface-modificada.js')errors.push(rel+': arquivo original/derivado do Mei não destinado à distribuição');
      if(!release&&/\.(exe|dll|pak|bin)$/i.test(entry.name))errors.push(rel+': binário no código-fonte');
      if(/\.(mjs|cjs|js|html|css|json|md|txt|ps1|cmd)$/i.test(entry.name)&&fs.statSync(full).size<10_000_000) {
        const text=fs.readFileSync(full,'utf8');
        if(/[A-Za-z]:[\\/](?:CHATGPT|Users)[\\/]/i.test(text))errors.push(rel+': caminho privado/fixo');
        if(/AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z._-]{20,}|1\/\/[0-9A-Za-z_-]{25,}/.test(text)&&sha256(Buffer.from(text))!==publicBundles.get(rel))errors.push(rel+': formato de credencial Google');
      }
    }
  }
  visit(root);if(errors.length)throw Error('A revisão de publicação encontrou:\n'+errors.join('\n'));
  console.log(`Revisão pública: ${files} arquivos, sem contas, caches, caminhos privados ou binários do Mei.`);return {files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await audit(path.resolve(import.meta.dirname,'..'));
