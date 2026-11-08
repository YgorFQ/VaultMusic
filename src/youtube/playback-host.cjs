// Local playback transport and isolated token helper, adapted from FreeTube v0.26.0-beta (AGPL-3.0-or-later).
const {app,session,BrowserWindow,net}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const [portText,key,dataDir]=process.argv.slice(-3),port=Number(portText);
if(!Number.isInteger(port)||port<1024||!key||key.length!==64||!dataDir)process.exit(1);
fs.mkdirSync(path.join(dataDir,'session'),{recursive:true});app.setPath('userData',dataDir);app.setPath('sessionData',path.join(dataDir,'session'));
app.on('window-all-closed',()=>{});
const allowed=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!(['www.youtube.com','youtube.com','www.google.com','jnn-pa.googleapis.com'].includes(u.hostname)||u.hostname.endsWith('.googlevideo.com')||u.hostname.endsWith('.ytimg.com')))throw Error('Destino de reprodução não permitido.');return u;};
const origin='https://www.youtube.com';let tokenSession,tokenCode;
async function generateToken(videoId,args){
 let view,timer;
 try{
  view=new BrowserWindow({show:false,width:1920,height:1080,webPreferences:{backgroundThrottling:false,safeDialogs:true,sandbox:true,contextIsolation:true,v8CacheOptions:'none',session:tokenSession,offscreen:true}});
  timer=setTimeout(()=>{if(!view.isDestroyed())view.destroy();},35000);
  view.webContents.setWindowOpenHandler(()=>({action:'deny'}));view.webContents.setAudioMuted(true);view.webContents.debugger.attach();
  fs.appendFileSync(path.join(dataDir,'host.log'),new Date().toISOString()+' token:load\n');
  await view.webContents.loadURL('data:text/html,<!DOCTYPE html><html lang="en"><head><title></title></head><body></body></html>',{baseURLForDataURL:origin+'/'});
  fs.appendFileSync(path.join(dataDir,'host.log'),new Date().toISOString()+' token:environment\n');
  await view.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false,screenWidth:1920,screenHeight:1080,positionX:0,positionY:0,screenOrientation:{type:'landscapePrimary',angle:0}});
  return await view.webContents.executeJavaScript(tokenCode+';globalThis.MeiGeneratePoToken('+[JSON.stringify(videoId),...args].join(',')+')');
 }finally{clearTimeout(timer);if(view&&!view.isDestroyed())view.destroy();}
}
app.whenReady().then(async()=>{
 tokenSession=session.fromPartition('mei-playback-token',{cache:false});
 const ua=session.defaultSession.getUserAgent().split(' ').filter(s=>!s.includes('Electron')&&!s.includes('FreeTube')&&!s.includes('mei-playback')).join(' ');
 session.defaultSession.setUserAgent(ua);tokenSession.setUserAgent(ua);
 for(const s of [tokenSession,session.defaultSession]){
  s.setPermissionRequestHandler((webContents,permission,callback)=>callback(false));
  s.webRequest.onBeforeSendHeaders({urls:['https://*/*']},({requestHeaders:h,url},callback)=>{
   const u=new URL(url);h['User-Agent']=ua;
   if(url.startsWith(origin+'/youtubei/')){h.Referer=origin+'/';h.Origin=origin;h['Sec-Fetch-Site']='same-origin';h['Sec-Fetch-Mode']='same-origin';h['X-Youtube-Bootstrap-Logged-In']='false';}
   else if(u.hostname==='www.youtube.com'&&['/','/watch'].includes(u.pathname)){delete h.Referer;delete h.Origin;h['Sec-Fetch-Dest']='document';h['Sec-Fetch-Mode']='navigate';h['Sec-Fetch-Site']='none';h['Sec-Fetch-User']='?1';}
   else if(u.hostname.endsWith('.googlevideo.com')){h.Referer=origin+'/';h.Origin=origin;delete h['Content-Type'];delete h['content-type'];}
   if(s===tokenSession&&!url.startsWith(origin+'/youtubei/')){h['Sec-Fetch-Dest']='script';h['Sec-Fetch-Site']='cross-site';h['Accept-Language']='*';}
   callback({requestHeaders:h});
  });
  s.webRequest.onHeadersReceived({urls:['https://*/*']},({responseHeaders:h},callback)=>callback({responseHeaders:{...h,'Access-Control-Allow-Origin':['*'],'Access-Control-Allow-Methods':['GET, HEAD, POST, OPTIONS']}}));
  s.webRequest.onBeforeRequest({urls:['<all_urls>'],types:['cspReport','ping']},(details,callback)=>callback({cancel:true}));
 }
 tokenCode=fs.readFileSync(path.join(__dirname,'botguard.js'),'utf8');
 for(const url of [origin,'https://youtube.com'])await session.defaultSession.cookies.set({url,name:'CONSENT',value:'YES+',sameSite:'no_restriction'});
 await session.defaultSession.cookies.set({url:origin,name:'SOCS',value:'CAI',sameSite:'no_restriction'});
 const server=http.createServer(async(req,res)=>{
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
   if(req.headers.host!==`127.0.0.1:${port}`||req.headers.authorization!=='Bearer '+key||req.headers.origin)return send(403,{error:'Acesso local não autorizado.'});
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname==='/health')return send(200,{engine:'freetube-native-host',pid:process.pid});
   if(url.pathname==='/token'&&req.method==='POST'){
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1_500_000)throw Error('Solicitação muito grande.');chunks.push(chunk);}
    const data=JSON.parse(Buffer.concat(chunks));if(!/^[\w-]{11}$/.test(data.videoId)||!Array.isArray(data.args)||data.args.length!==3)throw Error('Solicitação de sessão inválida.');
    for(const arg of data.args)JSON.parse(arg);
    return send(200,{token:await generateToken(data.videoId,data.args)});
   }
   if(url.pathname!=='/transport'||!['GET','HEAD','POST'].includes(req.method))return send(404,{error:'Recurso não encontrado.'});
   const target=allowed(url.searchParams.get('url')),headers=new Headers();
   for(const [k,v] of JSON.parse(req.headers['x-mei-transport-headers']||'[]'))if(/^(?:accept|accept-language|content-type|range|x-goog-visitor-id|x-youtube-client-(?:name|version)|x-goog-api-key|x-user-agent|x-cookie)$/i.test(k))headers.set(k,String(v));
   if(headers.has('X-Cookie')){headers.set('Cookie','CONSENT=YES+; SOCS=CAI; '+headers.get('X-Cookie'));headers.delete('X-Cookie');}
   let body;if(req.method==='POST'){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw Error('Solicitação muito grande.');chunks.push(chunk);}body=Buffer.concat(chunks);}
   const controller=new AbortController();res.on('close',()=>controller.abort());
   let response,u=target;
   for(let i=0;i<5;i++){response=await net.fetch(u.href,{method:req.method,headers,body,redirect:'manual',signal:controller.signal});if(![301,302,303,307,308].includes(response.status))break;u=allowed(new URL(response.headers.get('location'),u));await response.body?.cancel();if(i===4)throw Error('Redirecionamentos em excesso.');}
   const outgoing={'Cache-Control':'no-store','Content-Type':response.headers.get('content-type')||'application/octet-stream'};for(const k of ['content-range','accept-ranges'])if(response.headers.has(k))outgoing[k]=response.headers.get(k);res.writeHead(response.status,outgoing);
   if(response.body&&req.method!=='HEAD'){const reader=response.body.getReader();while(true){const {value,done}=await reader.read();if(done)break;if(!res.write(Buffer.from(value)))await new Promise(resolve=>res.once('drain',resolve));}}
   res.end();
  }catch(error){if(res.headersSent)res.destroy();else send(400,{error:error.message});}
 });
 server.listen(port,'127.0.0.1');server.on('error',()=>app.quit());
}).catch(error=>{console.error(error.message);app.quit();});
