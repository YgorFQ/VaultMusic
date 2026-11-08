import fs from 'node:fs';
import assert from 'node:assert/strict';
import { parsers } from 'prettier/plugins/babel';
import { readAsset, replaceAsset, sha256 } from './pe-assets.mjs';
const compatibility = JSON.parse(fs.readFileSync(new URL('../../compatibility.json', import.meta.url)));
function walk(n, cb) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const v of n) walk(v, cb); return; }
  if (n.type) cb(n);
  for (const [key, v] of Object.entries(n)) if (!['loc', 'comments', 'tokens', 'extra'].includes(key)) walk(v, cb);
}
export function validateOriginal(bytes) {
  if (sha256(bytes) !== compatibility.executableSha256)
    throw Error('Mei Music incompatível. Esta melhoria aceita somente o executável original Windows x64 1.1.21 conhecido. A pasta original não foi alterada.');
}
export async function patchMei(bytes, config) {
  validateOriginal(bytes);
  assert(/^[a-f0-9]{64}$/.test(config.capability)); assert(Number.isInteger(config.port) && config.port > 1024 && config.port < 65536);
  const source = readAsset(bytes, compatibility.assets.app), ast = await parsers.babel.parse(source);
  const vars = new Map(), funcs = new Map();
  walk(ast, n => { if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') vars.set(n.id.name, n); if (n.type === 'FunctionDeclaration') funcs.set(n.id.name, n); });
  const side = vars.get('lX').init.arguments[0], shell = funcs.get('fX'), page = vars.get('pX').init.arguments[0];
  const edits = [], put = (start, end, text) => edits.push({ start, end, text });
  put(side.body.start + 1, side.body.start + 1, 'const meiGamer=Z.useContext(MeiGamerContext);');
  let selected = 0, groups = 0, workspace = 0, artwork = 0, volume = 0;
  walk(side, n => {
    if (n.type === 'VariableDeclarator' && n.id.name === 'y' && n.init?.callee?.name === 'Ef') { put(n.init.start, n.init.end, 'meiGamer.active?null:(' + source.slice(n.init.start, n.init.end) + ')'); selected++; }
    if (n.type === 'CallExpression' && n.arguments?.[0]?.name === 'XY') { put(n.start, n.end, '(0,$.jsxs)($.Fragment,{children:[' + source.slice(n.start, n.end) + ',e.id===`library`?(0,$.jsx)(MeiGamerButton,{}):null]})'); groups++; }
  });
  put(shell.body.start + 1, shell.body.start + 1, 'const meiGamer=Z.useContext(MeiGamerContext);');
  walk(shell, n => { if (n.type === 'ObjectExpression' && n.properties.some(p => p.key?.name === 'className' && p.value?.type === 'TemplateLiteral' && p.value.quasis[0].value.cooked === 'workspace')) { put(n.start + 1, n.start + 1, 'onClickCapture:meiGamer.handleNavigationClick,'); workspace++; } });
  assert.equal(selected, 1); assert.equal(groups, 1); assert.equal(workspace, 1);
  const origin = `http://127.0.0.1:${config.port}`;
  const components = fs.readFileSync(new URL('./components.js', import.meta.url), 'utf8').replaceAll('__MEI_ORIGIN__', JSON.stringify(origin)).replaceAll('__MEI_FRAME_URL__', JSON.stringify(origin + '/#' + config.capability));
  const start = source.lastIndexOf('var pX=', page.start); assert(start >= 0); put(start, start, components);
  put(page.body.start, page.body.end, `{
const [meiGamerActive,setMeiGamerActive]=Z.useState(false),[meiYTVisited,setMeiYTVisited]=Z.useState(false);
const open=Z.useCallback(()=>{setMeiYTVisited(true);setMeiGamerActive(true);},[]);
const handleNavigationClick=Z.useCallback(event=>{const item=event.target?.closest?.('[data-app-navigation-id]');if(item&&item.dataset.appNavigationId!=='mei-gamer')setMeiGamerActive(false);},[]);
Z.useEffect(()=>{setMeiGamerActive(false);},[e.activePage,t.nav.page.navigationRequestKey,t.nav.editor.contentOverlay]);
const context=Z.useMemo(()=>({active:meiGamerActive,open,handleNavigationClick}),[meiGamerActive,open,handleNavigationClick]);
return (0,$.jsx)(Fj,{value:n,children:(0,$.jsx)(MeiGamerContext.Provider,{value:context,children:(0,$.jsx)(fX,{...e,children:(0,$.jsxs)($.Fragment,{children:[meiGamerActive?null:(0,$.jsx)(WY,{...t}),meiYTVisited?(0,$.jsx)(MeiGamerPage,{active:meiGamerActive}):null]})})})});
}`);
  const nativeBar = funcs.get('GT'); assert(nativeBar); put(nativeBar.id.start, nativeBar.id.end, 'MeiNativePlaybackBar');
  walk(nativeBar, node => {
    if (node.type === 'VariableDeclarator' && node.id.name === 'g') { put(node.init.start, node.init.end, 'e?.meiYouTube?Math.round(s):(' + source.slice(node.init.start, node.init.end) + ')'); volume++; }
    if (node.type === 'CallExpression' && node.arguments?.[0]?.name === 'BT') { put(node.start, node.end, "e?.meiYouTubeArtwork?(0,$.jsx)('img',{src:e.meiYouTubeArtwork,alt:'',className:'playback-album-art',style:{width:'100%',height:'100%',objectFit:'cover',borderRadius:8}}):(" + source.slice(node.start, node.end) + ')'); artwork++; }
    if (node.type === 'ObjectExpression') {
      const click = node.properties.find(p => p.key?.name === 'onClick')?.value?.property?.name;
      if (click === 'onPrevious' || click === 'onNext') { const p = node.properties.find(p => p.key?.name === 'disabled'); assert(p); put(p.value.start, p.value.end, '!e||(e.meiYouTube&&!e.' + (click === 'onNext' ? 'meiCanNext' : 'meiCanPrevious') + ')'); }
      if (click === 'onToggleDesktopLyrics') put(node.start + 1, node.start + 1, 'disabled:!!e?.meiYouTube,');
    }
  }); assert.equal(artwork, 1); assert.equal(volume, 1);
  const discord = funcs.get('DD'); assert(discord);
  put(discord.body.start + 1, discord.body.start + 1, `
const meiYT=MeiUsePlayback(),meiNativePlaying=o,meiNativeSongId=c?.id;
Z.useEffect(()=>{if(meiNativePlaying&&meiYT.owned&&Date.now()>MeiYTBridge.pauseNativeUntil){MeiYTBridge.send('release');MeiYTSet(MeiYTEmpty);}},[meiNativePlaying,meiNativeSongId,meiYT.owned]);
if(meiYT.owned){e=meiYT.currentTime;t=meiYT.duration;n=meiYT.duration>0;r=meiYT.discord;i=true;o=meiYT.playing;s=meiYT.rate;c={id:'youtube:'+meiYT.id,name:meiYT.title,artist:meiYT.channel+' · YouTube',durationSeconds:meiYT.duration,songUrl:'https://www.youtube.com/watch?v='+meiYT.id,discordArtworkUrl:meiYT.thumbnail};}
`);
  const ordered = edits.toSorted((a, b) => b.start - a.start);
  for (let i = 1; i < ordered.length; i++) assert(ordered[i].end <= ordered[i - 1].start, 'Alterações sobrepostas.');
  let modified = source; for (const edit of ordered) modified = modified.slice(0, edit.start) + edit.text + modified.slice(edit.end);
  const checked = await parsers.babel.parse(modified); assert.equal(checked.errors.length, 0);
  let exe = replaceAsset(bytes, compatibility.assets.app, modified, '.vaultjs');
  const html = readAsset(bytes, compatibility.assets.html), old = 'frame-src http://mei-layout.localhost'; assert.equal(html.split(old).length, 2);
  exe = replaceAsset(exe, compatibility.assets.html, html.replace(old, old + ' ' + origin), '.vaultht');
  return exe;
}
