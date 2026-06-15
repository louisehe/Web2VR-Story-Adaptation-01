/**
 * NYT story asset collector — Germany’s Late Equalizer Revives Its World Cup Hopes
 * https://www.nytimes.com/interactive/2022/11/27/sports/world-cup/spain-germany-world-cup-goal.html
 *
 * 用法：
 *  1. Chrome 登录后打开上面的故事页面，手动滚到底再滚回顶部。
 *  2. F12 → Console（若禁止粘贴，先输入 allow pasting 回车），粘贴本脚本全文回车。
 *  3. 允许"下载多个文件"。文件以 nyt_spain__ 前缀存入下载目录。
 *  4. 把 nyt_spain__* 文件复制到 ../captures/active/ 对应子目录（models/textures/data）。
 *
 * 仅收集页面公开加载的资产，不绕过付费墙/鉴权/DRM。
 */
(async () => {
  const PREFIX = 'nyt_spain__';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('%c[collector]', 'color:#0a84ff;font-weight:bold', ...a);

  log('Auto-scrolling to trigger lazy loads...');
  const H = () => document.body.scrollHeight;
  for (let y = 0; y < H(); y += Math.max(400, innerHeight*0.7)) { scrollTo(0,y); await sleep(250); }
  scrollTo(0,H()); await sleep(1500); scrollTo(0,0); await sleep(800);

  const urls = new Set();
  performance.getEntriesByType('resource').forEach(e => urls.add(e.name));
  document.querySelectorAll('script[src],link[href],img[src],source[src],video[src]').forEach(el => {
    const u = el.src || el.href; if (u) urls.add(u);
  });
  const html = document.documentElement.outerHTML;
  (html.match(/https?:\/\/[^\s"'<>\\)]+?\.(?:glb|gltf|bin|json|csv|geojson|topojson|ktx2?|basis|webp|png|jpe?g)(?:\?[^\s"'<>\\)]*)?/gi)||[]).forEach(u=>urls.add(u));
  let m; const rel=/["']([^"']{2,200}?\.(?:glb|gltf|bin))["']/gi;
  while ((m=rel.exec(html))!==null) { try { urls.add(new URL(m[1], location.href).href); } catch(e){} }
  log('URLs discovered:', urls.size);

  const EXCLUDE = /adslot|pubads|apstag|gpt|doubleclick|datadog|chartbeat|comscore|gtm|fides|iab|newsletter|recirculation|emailsignup|wordle|connections|sudoku|spelling|favicon|apple-touch|share|video-player|vhs|purr|abra|geoip|meter|samizdat|messaging|sentry|survey|icon-/i;
  const MODEL=/\.(glb|gltf|bin)(\?|$)/i, TEX=/\.(png|jpe?g|webp|ktx2?|basis)(\?|$)/i, DATA=/\.(json|csv|geojson|topojson)(\?|$)/i;
  const STORY=/newsgraphics|nytg|spain|germany|goal|gergoal|world-cup/i;
  const classify = u => {
    if (EXCLUDE.test(u)) return null;
    if (MODEL.test(u)) return 'model';
    if (!STORY.test(u)) return null;
    if (TEX.test(u)) return 'texture';
    if (DATA.test(u)) return 'data';
    return null;
  };
  const assets=[]; for (const u of urls) { const t=classify(u); if (t) assets.push({asset_url:u, asset_type:t}); }
  console.table(assets);
  log('Story assets:', assets.length, '(models:', assets.filter(a=>a.asset_type==='model').length+')');

  // story text / beats
  const seen=new Set(), beats=[];
  (document.querySelector('article')||document.body).querySelectorAll('h1,h2,h3,p,figcaption,[class*="caption"]').forEach(el=>{
    const t=(el.innerText||'').trim().replace(/\s+/g,' ');
    if (t.length>1 && !seen.has(t)) { seen.add(t); beats.push({tag:el.tagName.toLowerCase(), cls:String(el.className).slice(0,80), text:t}); }
  });
  const structure=[];
  document.querySelectorAll('script:not([src])').forEach(s=>{
    const t=s.textContent||'';
    if (/WEBGL_DATA|"slides"|"steps"|"camera"|"frameNo"|\.glb/i.test(t) && t.length<2e6) structure.push(t.slice(0,500000));
  });

  const save=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),3e4);};
  const safe=u=>{try{const p=new URL(u).pathname.split('/').filter(Boolean);return p.slice(-2).join('_').replace(/[^\w.\-]/g,'_');}catch(e){return 'asset_'+Math.random().toString(36).slice(2);}};

  const manifest={story_url:location.href,title:document.title,timestamp:new Date().toISOString(),assets:[],failed:[]};
  log('Downloading... allow multiple downloads.');
  for (const a of assets) {
    const fname=PREFIX+a.asset_type+'__'+safe(a.asset_url);
    try { const r=await fetch(a.asset_url,{credentials:'omit'}); if(!r.ok) throw new Error('HTTP '+r.status);
      const b=await r.blob(); save(b,fname); manifest.assets.push({...a,local_name:fname,size:b.size}); log('saved',fname,(b.size/1024).toFixed(1)+'KB');
    } catch(e){ manifest.failed.push({...a,error:String(e)}); console.warn('FAILED',a.asset_url,e); }
    await sleep(600);
  }
  save(new Blob([JSON.stringify(manifest,null,2)],{type:'application/json'}),PREFIX+'asset_manifest.json'); await sleep(400);
  save(new Blob([JSON.stringify({story_url:location.href,title:document.title,headline:(document.querySelector('h1')||{}).innerText||'',beats},null,2)],{type:'application/json'}),PREFIX+'story_text.json'); await sleep(400);
  if (structure.length) { save(new Blob([JSON.stringify(structure,null,2)],{type:'application/json'}),PREFIX+'story_structure_candidates.json'); await sleep(400); }
  save(new Blob([html],{type:'text/html'}),PREFIX+'page.html');
  window.__NYT={assets,manifest,beats};
  log('DONE downloaded:',manifest.assets.length,'failed:',manifest.failed.length);
})();
