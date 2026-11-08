import {Readable} from 'node:stream';
const roots=['www.youtube.com','youtube.com','jnn-pa.googleapis.com'];
export function allowedMediaUrl(value){
 let u;try{u=new URL(value);}catch{throw Error('Endereço de mídia inválido.');}
 if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!(roots.includes(u.hostname)||u.hostname.endsWith('.googlevideo.com')||u.hostname.endsWith('.ytimg.com')||u.hostname==='ytimg.com'||u.hostname==='www.google.com'))throw Error('Destino de reprodução não permitido.');
 if(u.hostname==='www.google.com'&&!u.pathname.startsWith('/js/'))throw Error('Destino de reprodução não permitido.');
 if((u.hostname==='youtube.com'||u.hostname==='www.youtube.com')&&!(/^\/$|^\/watch$|^\/s\/player\/|^\/s\/desktop\/|^\/youtubei\/v1\/(?:player|next|get_watch|att\/get)$|^\/api\/(?:jnn\/v1\/GenerateIT|timedtext)$|^\/sw\.js_data$/.test(u.pathname)))throw Error('Recurso de reprodução não permitido.');
 return u;
}
export async function transportRequest(req,res,{fetchImpl=fetch}={}){
 const target=allowedMediaUrl(new URL(req.url,'http://127.0.0.1').searchParams.get('url'));
 if(!['GET','HEAD','POST'].includes(req.method))throw Error('Método de reprodução inválido.');
 const supplied=JSON.parse(req.headers['x-mei-transport-headers']||'[]');
 if(!Array.isArray(supplied)||supplied.length>45)throw Error('Cabeçalhos de reprodução inválidos.');
 const headers=new Headers();
 for(const pair of supplied){if(!Array.isArray(pair)||pair.length!==2)throw Error('Cabeçalho inválido.');const [key,value]=pair;if(/^(?:accept|accept-language|content-type|range|user-agent|x-goog-visitor-id|x-youtube-client-(?:name|version)|x-youtube-bootstrap-logged-in|x-goog-api-key|x-user-agent|x-origin|x-goog-authuser|x-cookie)$/i.test(key))headers.set(key,String(value));}
 headers.set('Accept-Encoding','identity');
 if(!headers.has('User-Agent'))headers.set('User-Agent','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36');
 headers.set('Referer','https://www.youtube.com/');headers.set('Origin','https://www.youtube.com');
 if(target.hostname.endsWith('youtube.com')){
  headers.set('Cookie','CONSENT=YES+; SOCS=CAI'+(headers.has('X-Cookie')?'; '+headers.get('X-Cookie'):''));headers.delete('X-Cookie');
  if(target.pathname==='/watch'||target.pathname==='/'){headers.delete('Referer');headers.delete('Origin');headers.set('Sec-Fetch-Dest','document');headers.set('Sec-Fetch-Mode','navigate');headers.set('Sec-Fetch-Site','none');headers.set('Sec-Fetch-User','?1');}
  else{headers.set('Sec-Fetch-Site','same-origin');headers.set('Sec-Fetch-Mode','same-origin');headers.set('X-Youtube-Bootstrap-Logged-In','false');}
 }
 const controller=new AbortController();const disconnect=()=>controller.abort();res.on('close',disconnect);
 const timeout=setTimeout(()=>controller.abort(),90000);timeout.unref();
 try{
  let body;if(req.method==='POST'){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>2*1024*1024)throw Error('Solicitação de mídia muito grande.');chunks.push(chunk);}body=Buffer.concat(chunks);}
  let u=target,response;
  for(let i=0;i<5;i++){response=await fetchImpl(u,{method:req.method,headers,body,redirect:'manual',signal:controller.signal});if(![301,302,303,307,308].includes(response.status))break;const next=allowedMediaUrl(new URL(response.headers.get('location'),u).href);await response.body?.cancel();u=next;if(i===4)throw Error('Redirecionamentos de mídia em excesso.');}
  const outgoing={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Mei-Upstream-Status':String(response.status)};
  for(const name of ['content-type','content-range','accept-ranges'])if(response.headers.has(name))outgoing[name]=response.headers.get(name);
  res.writeHead(response.status,outgoing);
  if(response.body&&req.method!=='HEAD'){const stream=Readable.fromWeb(response.body);stream.on('error',()=>res.destroy());stream.pipe(res);await new Promise(resolve=>{res.once('close',resolve);res.once('finish',resolve);});}else res.end();
 }finally{clearTimeout(timeout);res.off('close',disconnect);}
}
