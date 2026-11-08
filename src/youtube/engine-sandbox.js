// FreeTube-compatible signature evaluation, in a network-disabled opaque-origin frame.
window.addEventListener('message',event=>{
 if(event.source!==parent||typeof event.data!=='string')return;
 let request;
 try{request=JSON.parse(event.data);if(typeof request.id!=='string'||typeof request.code!=='string')return;const result=new Function(request.code)();parent.postMessage(JSON.stringify({id:request.id,result}),'*');}
 catch(error){parent.postMessage(JSON.stringify({id:request?.id,error:error.message}),'*');}
});
