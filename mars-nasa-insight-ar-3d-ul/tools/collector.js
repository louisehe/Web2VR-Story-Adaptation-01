/**
 * NYT story asset collector + render-type probe — Story 10
 *   "Explore InSight, NASA's New Mars Lander, in Augmented Reality"
 *   URL: https://www.nytimes.com/interactive/2018/11/26/science/mars-nasa-insight-ar-3d-ul.html
 *
 * This is an AR 3-D object piece: a GLB of the InSight lander (likely with an instrument-deploy
 * animation and labelled callouts for SEIS, HP3, solar panels, etc.). The script PRINTS A DISCOVERY
 * REPORT (glb list, canvas/webgl, animation/scene-config keywords), then downloads the page + story
 * text + scene-config + any real 3-D assets it finds (glb/gltf/bin/ktx/textures).
 *
 * 用法:
 *  1. Chrome 登录后打开上面的页面,从头滚到底再滚回顶部(让所有资源加载)。
 *  2. F12 → Console(若禁止粘贴先输 allow pasting),粘贴本脚本回车,允许多文件下载。
 *  3. 先把控制台打印的【DISCOVERY REPORT】那几行发给 Claude,再把下载的 nyt_insight__* 丢进 10glb。
 *
 * 仅收集页面公开加载的资产,不绕过付费墙/鉴权/DRM。
 */
(async () => {
  const PREFIX = 'nyt_insight__';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('%c[collector]', 'color:#0a84ff;font-weight:bold', ...a);

  log('Auto-scrolling…');
  const H = () => document.body.scrollHeight;
  for (let y = 0; y < H(); y += Math.max(300, innerHeight * 0.6)) { scrollTo(0, y); await sleep(300); }
  scrollTo(0, H()); await sleep(1500); scrollTo(0, 0); await sleep(800);

  // ---- discover URLs ----
  const urls = new Set();
  performance.getEntriesByType('resource').forEach(e => urls.add(e.name));
  document.querySelectorAll('script[src],link[href],img[src],source[src],video[src]').forEach(el => { const u = el.src || el.href; if (u) urls.add(u); });
  const html = document.documentElement.outerHTML;
  (html.match(/https?:\/\/[^\s"'<>\\)]+?\.(?:glb|gltf|bin|json|csv|geojson|topojson|ktx2?|basis|webp|png|jpe?g|mp4|webm|hdr|pcd|drc)(?:\?[^\s"'<>\\)]*)?/gi) || []).forEach(u => urls.add(u));
  let m; const rel = /["']([^"']{2,200}?\.(?:glb|gltf|bin|ktx2?|basis|hdr|drc|pcd))["']/gi;
  while ((m = rel.exec(html)) !== null) { try { urls.add(new URL(m[1], location.href).href); } catch (e) {} }

  const all = [...urls];
  const glb = all.filter(u => /\.(glb|gltf|bin|ktx2?|basis|drc)(\?|$)/i.test(u) && !/draco_decoder|draco_wasm/i.test(u));
  const vids = all.filter(u => /\.(mp4|webm)(\?|$)/i.test(u));

  // ---- render-type signatures from inline scripts ----
  let inlineLen = 0, sig = { particle: 0, points: 0, shader: 0, three: 0, instanced: 0, animation: 0, gltf: 0, webglData: 0, highlights: 0, canvasEl: document.querySelectorAll('canvas').length };
  document.querySelectorAll('script:not([src])').forEach(s => {
    const t = s.textContent || ''; inlineLen += t.length;
    if (/particle/i.test(t)) sig.particle++;
    if (/THREE\.Points|gl_PointSize/i.test(t)) sig.points++;
    if (/ShaderMaterial|fragmentShader|gl_FragColor/i.test(t)) sig.shader++;
    if (/\bTHREE\b|three\.module/i.test(t)) sig.three++;
    if (/InstancedMesh/i.test(t)) sig.instanced++;
    if (/AnimationMixer|AnimationClip|clipAction|"Take 001"|mixer/i.test(t)) sig.animation++;
    if (/GLTFLoader|\.glb|\.gltf/i.test(t)) sig.gltf++;
    if (/WEBGL_DATA|IMMERSIVE_DATA|webgl-window|"slides"|"slidevals"|"initvals"|"steps"/i.test(t)) sig.webglData++;
    if (/highlight|"poi"|callout|annotation|hotspot/i.test(t)) sig.highlights++;
  });
  let ctxType = 'none'; const cv = document.querySelector('canvas');
  if (cv) { try { ctxType = cv.getContext('webgl2') ? 'webgl2' : (cv.getContext('webgl') ? 'webgl' : (cv.getContext('2d') ? '2d' : 'unknown')); } catch (e) { ctxType = 'in-use'; } }

  console.log('%c===== DISCOVERY REPORT (把这段发给 Claude) =====', 'color:#d8a657;font-weight:bold');
  console.log(JSON.stringify({
    url: location.href, title: document.title,
    glbAssets: glb, glbCount: glb.length,
    videos: vids.slice(0, 8), videoCount: vids.length,
    canvases: sig.canvasEl, canvasContext: ctxType,
    inlineScriptKB: Math.round(inlineLen / 1024),
    signatures: { three: sig.three, gltf: sig.gltf, animation: sig.animation, instancedMesh: sig.instanced, shader: sig.shader, particle: sig.particle, points: sig.points, sceneConfig: sig.webglData, highlights: sig.highlights }
  }, null, 2));
  console.log('%c================================================', 'color:#d8a657;font-weight:bold');

  // ---- download story text + page + config + any real 3D assets ----
  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3e4); };
  const safe = u => { try { const p = new URL(u).pathname.split('/').filter(Boolean); return p.slice(-2).join('_').replace(/[^\w.\-]/g, '_'); } catch (e) { return 'asset_' + Math.random().toString(36).slice(2); } };
  const seen = new Set(), beats = [];
  (document.querySelector('article') || document.body).querySelectorAll('h1,h2,h3,p,figcaption,[class*="caption"],[class*="step"]').forEach(el => { const t = (el.innerText || '').trim().replace(/\s+/g, ' '); if (t.length > 1 && !seen.has(t)) { seen.add(t); beats.push({ tag: el.tagName.toLowerCase(), text: t }); } });
  const structure = [];
  document.querySelectorAll('script:not([src])').forEach(s => { const t = s.textContent || ''; if (/THREE|GLTFLoader|AnimationMixer|WEBGL_DATA|IMMERSIVE_DATA|webgl-window|"steps"|highlight|"poi"/i.test(t) && t.length < 3e6) structure.push(t.slice(0, 900000)); });

  const manifest = { story_url: location.href, title: document.title, timestamp: new Date().toISOString(), assets: [], failed: [] };
  for (const u of glb.concat(all.filter(u => /\.(png|jpe?g|webp|ktx2?|hdr)(\?|$)/i.test(u) && /newsgraphics|nytg|static01|int\.nyt|_assets|insight|lander|mars|texture|albedo|normal|roughness|metal/i.test(u)).slice(0, 40))) {
    const fname = PREFIX + (/(glb|gltf|bin|ktx|basis|drc)/i.test(u) ? 'model' : 'texture') + '__' + safe(u);
    try { const r = await fetch(u, { credentials: 'omit' }); if (!r.ok) throw 0; const b = await r.blob(); save(b, fname); manifest.assets.push({ asset_url: u, local_name: fname, size: b.size }); log('saved', fname, (b.size / 1024).toFixed(1) + 'KB'); } catch (e) { manifest.failed.push({ asset_url: u }); }
    await sleep(400);
  }
  save(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), PREFIX + 'asset_manifest.json'); await sleep(300);
  save(new Blob([JSON.stringify({ story_url: location.href, title: document.title, headline: (document.querySelector('h1') || {}).innerText || '', beats }, null, 2)], { type: 'application/json' }), PREFIX + 'story_text.json'); await sleep(300);
  if (structure.length) { save(new Blob([JSON.stringify(structure, null, 2)], { type: 'application/json' }), PREFIX + 'story_structure_candidates.json'); await sleep(300); }
  save(new Blob([html], { type: 'text/html' }), PREFIX + 'page.html');
  window.__NYT = { glb, all, sig, beats };
  log('DONE. 先把上面的 DISCOVERY REPORT 发给 Claude;下载的 nyt_insight__* 放进 10glb。');
})();
