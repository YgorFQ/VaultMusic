const MeiGamerContext=Z.createContext({active:false,open:()=>{},handleNavigationClick:()=>{}});
const MeiYTEmpty={owned:false,id:null,title:'',channel:'',thumbnail:'',playing:false,currentTime:0,duration:0,volume:70,rate:1,canNext:false,canPrevious:false,canLike:false,liked:false,discord:true};
let MeiYTSnapshot=MeiYTEmpty;
const MeiYTListeners=new Set();
function MeiYTSubscribe(fn){MeiYTListeners.add(fn);return()=>MeiYTListeners.delete(fn);}
function MeiYTSet(next){MeiYTSnapshot=next;MeiYTListeners.forEach(fn=>fn());}
function MeiUsePlayback(){return Z.useSyncExternalStore(MeiYTSubscribe,()=>MeiYTSnapshot,()=>MeiYTEmpty);}
const MeiYTBridge={frame:null,open:()=>{},pauseNativeUntil:0,send(action,value){this.frame?.contentWindow?.postMessage({type:'mei-youtube-command',action,value},__MEI_ORIGIN__);}};
function MeiGamerButton(){const state=Z.useContext(MeiGamerContext);return (0,$.jsxs)('button',{type:'button',className:KY(state.active),'data-app-navigation-id':'mei-gamer','aria-current':state.active?'page':void 0,onClick:state.open,children:[(0,$.jsx)('span',{'aria-hidden':true,style:{fontSize:17},children:'▶'}),(0,$.jsx)('span',{children:'YouTube'})]});}
function MeiGamerPage({active}){
 const context=Z.useContext(MeiGamerContext),state=MeiUsePlayback(),ref=Z.useRef(null);
 Z.useEffect(()=>{MeiYTBridge.open=context.open;MeiYTBridge.frame=ref.current;const receive=event=>{
  if(event.origin!==__MEI_ORIGIN__||event.source!==ref.current?.contentWindow)return;
  if(event.data?.type==='mei-youtube-open'){context.open();return;}
  if(event.data?.type!=='mei-youtube-state')return;
  const v=event.data.state;
  if(!v||typeof v!=='object')return;
  if(!v.owned){MeiYTSet(MeiYTEmpty);return;}
  if(!/^[\w-]{11}$/.test(v.id||''))return;
  const num=(key,max,fallback=0)=>Number.isFinite(v[key])?Math.max(0,Math.min(max,v[key])):fallback;
  const next={owned:true,id:v.id,title:String(v.title||'YouTube').slice(0,300),channel:String(v.channel||'YouTube').slice(0,200),thumbnail:`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,playing:!!v.playing,currentTime:num('currentTime',1e7),duration:num('duration',1e7),volume:num('volume',100,70),rate:num('rate',4,1),canNext:!!v.canNext,canPrevious:!!v.canPrevious,canLike:!!v.canLike,liked:!!v.liked,discord:v.discord!==false};
  if(next.playing&&(!MeiYTSnapshot.playing||MeiYTSnapshot.id!==next.id)){MeiYTBridge.pauseNativeUntil=Date.now()+2000;HD(We).catch(()=>{});}
  MeiYTSet(next);
 };window.addEventListener('message',receive);return()=>{window.removeEventListener('message',receive);MeiYTBridge.frame=null;MeiYTSet(MeiYTEmpty);};},[context.open]);
 Z.useEffect(()=>{MeiYTBridge.send('presentation',active?'full':'compact');},[active,state.owned]);
 const mini=!active&&state.owned;
 const style=active?{position:'relative',height:'100%',width:'100%',minWidth:0,minHeight:0,flex:1}:{position:'fixed',right:16,bottom:'calc(var(--app-playback-bar-height,76px) + 14px)',width:'min(380px,calc(100vw - 32px))',height:304,zIndex:60,borderRadius:12,overflow:'hidden',border:'1px solid #42585a',boxShadow:'0 10px 40px #0009',display:mini?'block':'none'};
 return (0,$.jsx)('div',{'data-mei-youtube-panel':true,'data-mode':active?'full':'compact',className:active?'content-shell':void 0,style,children:(0,$.jsx)('iframe',{ref,title:'YouTube no Mei Music',src:__MEI_FRAME_URL__,allow:'autoplay; encrypted-media; fullscreen; picture-in-picture',onLoad:()=>MeiYTBridge.send('presentation',active?'full':'compact'),style:{border:0,width:'100%',height:'100%',background:'#111315'}})});
}
function GT(props){
 const yt=MeiUsePlayback();
 if(!yt.owned||!props.events)return (0,$.jsx)(MeiNativePlaybackBar,props);
 const send=(action,value)=>MeiYTBridge.send(action,value);
 const seek=event=>{const value=Number(event.currentTarget.value);MeiYTSet({...MeiYTSnapshot,currentTime:value});send('seek',value);};
 const volume=event=>{const value=Number(event.currentTarget.value);MeiYTSet({...MeiYTSnapshot,volume:value});send('volume',value);};
 return (0,$.jsx)(MeiNativePlaybackBar,{...props,track:{title:yt.title,artistText:yt.channel+' · YouTube',durationText:'',canToggleLike:yt.canLike,isLiked:yt.liked,meiYouTube:true,meiCanNext:yt.canNext,meiCanPrevious:yt.canPrevious,meiYouTubeArtwork:yt.thumbnail},hasPlayableSource:yt.duration>0,isPlaying:yt.playing,isLikePending:false,currentTimeSeconds:yt.currentTime,durationSeconds:yt.duration,progressValue:yt.currentTime,progressFillPercent:yt.duration?yt.currentTime/yt.duration*100:0,globalVolume:yt.volume,isDesktopLyricsEnabled:false,titleContent:void 0,events:{onOpenSongDetails:()=>MeiYTBridge.open(),onToggleSongLike:()=>send('like'),onPrevious:()=>send('previous'),onNext:()=>send('next'),onTogglePlayback:()=>send('toggle'),onOpenPlaybackMenu:()=>{MeiYTBridge.open();send('queue');},seek:{onChange:seek},volume:{onChange:volume}}});
}
