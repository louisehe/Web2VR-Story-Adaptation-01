/**
 * NYT story asset collector — "Chinatown: Time Travel Through a New York Gem" (Doyers St.)
 *   Story 4 of the web2vr set.
 *   URL: https://www.nytimes.com/interactive/2020/12/02/arts/design/chinatown-virtual-walk-tour.html
 *
 * NOTE: This is a DIFFERENT template from the World-Cup stories — a street / panorama
 * walk-through rather than a soccer pitch. We don't yet know the asset shape, so this
 * collector is deliberately broad: it grabs every glb/gltf/bin, plus any large texture
 * (panorama / depth / sprite sheet) and data/JSON the page loads, then dumps the inline
 * scene-config scripts so we can reverse the scroll → camera path.
 *
 * 用法：
 *  1. Chrome 登录后打开 NYT Chinatown(Doyers St) 故事页面，手动从头滚到底再滚回顶部
 *     （务必慢慢滚，确保全景/街景资产全部按 scroll 懒加载出来）。
 *  2. F12 → Console（若禁止粘贴，先输入 allow pasting 回车），粘贴本脚本全文回车。
 *  3. 允许"下载多个文件"。文件以 nyt_chinatown__ 前缀存入下载目录。
 *  4. 把 nyt_chinatown__* 全部文件丢到一个文件夹（例如 D:\Harvard\Research\Webstory\04glb），
 *     不用自己分类，告诉 Claude 路径即可。
 *
 * 仅收集页面公开加载的资产，不绕过付费墙/鉴权/DRM。
 */
(async () => {
  const PREFIX = 'nyt_chinatown__';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log('%c[collector]', 'color:#0a84ff;font-weight:bold', ...a);

  // Slow scroll both directions — panorama walk-throughs lazy-load tiles per scroll step.
  log('Auto-scrolling to trigger lazy loads (slow, both directions)...');
  const H = () => document.body.scrollHeight;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H(); y += Math.max(300, innerHeight * 0.5)) { scrollTo(0, y); await sleep(350); }
    scrollTo(0, H()); await sleep(1500);
    for (let y = H(); y > 0; y -= Math.max(300, innerHeight * 0.5)) { scrollTo(0, y); await sleep(250); }
    scrollTo(0, 0); await sleep(800);
  }

  const urls = new Set();
  performance.getEntriesByType('resource').forEach(e => urls.add(e.name));
  document.querySelectorAll('script[src],link[href],img[src],source[src],video[src]').forEach(el => {
    const u = el.src || el.href; if (u) urls.add(u);
  });
  const html = document.documentElement.outerHTML;
  (html.match(/https?:\/\/[^\s"'<>\\)]+?\.(?:glb|gltf|bin|json|csv|geojson|topojson|ktx2?|basis|webp|png|jpe?g|mp4|hdr|exr)(?:\?[^\s"'<>\\)]*)?/gi) || []).forEach(u => urls.add(u));
  let m; const rel = /["']([^"']{2,200}?\.(?:glb|gltf|bin|ktx2?|basis|hdr|exr))["']/gi;
  while ((m = rel.exec(html)) !== null) { try { urls.add(new URL(m[1], location.href).href); } catch (e) {} }
  log('URLs discovered:', urls.size);

  const EXCLUDE = /adslot|pubads|apstag|gpt|doubleclick|datadog|chartbeat|comscore|gtm|fides|iab|newsletter|recirculation|emailsignup|wordle|connections|sudoku|spelling|favicon|apple-touch|share|video-player|vhs|purr|abra|geoip|meter|samizdat|messaging|sentry|survey|icon-|logo-|sprite-nav/i;
  const MODEL = /\.(glb|gltf|bin|ktx2?|basis|hdr|exr)(\?|$)/i, TEX = /\.(png|jpe?g|webp)(\?|$)/i, DATA = /\.(json|csv|geojson|topojson)(\?|$)/i;
  // broad story matcher for the chinatown/doyers piece on NYT graphics CDNs
  const STORY = /newsgraphics|nytg|static01|interactive|_assets|chinatown|doyers|gem|pano|street|walk|tour|scene|tile|depth|frame/i;
  const classify = u => {
    if (EXCLUDE.test(u)) return null;
    if (MODEL.test(u)) return 'model';        // glb/gltf/bin/ktx2/basis/hdr/exr always kept
    if (!STORY.test(u)) return null;
    if (TEX.test(u)) return 'texture';
    if (DATA.test(u)) return 'data';
    return null;
  };
  const assets = []; for (const u of urls) { const t = classify(u); if (t) assets.push({ asset_url: u, asset_type: t }); }
  console.table(assets);
  log('Story assets:', assets.length, '(models/geometry:', assets.filter(a => a.asset_type === 'model').length + ')');

  // story text / captions (scroll steps)
  const seen = new Set(), beats = [];
  (document.querySelector('article') || document.body).querySelectorAll('h1,h2,h3,p,figcaption,[class*="caption"],[class*="step"],[class*="slide"]').forEach(el => {
    const t = (el.innerText || '').trim().replace(/\s+/g, ' ');
    if (t.length > 1 && !seen.has(t)) { seen.add(t); beats.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), text: t }); }
  });
  // inline scene config (scroll → camera path, tile manifests, etc.)
  const structure = [];
  document.querySelectorAll('script:not([src])').forEach(s => {
    const t = s.textContent || '';
    if (/WEBGL_DATA|"slides"|"steps"|"scenes?"|"camera"|"frameNo"|"pano"|"tiles?"|"waypoints?"|"path"|sheetsById|tracksByObject|\.glb|\.ktx/i.test(t) && t.length < 2e6) structure.push(t.slice(0, 600000));
  });

  const save = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3e4); };
  const safe = u => { try { const p = new URL(u).pathname.split('/').filter(Boolean); return p.slice(-2).join('_').replace(/[^\w.\-]/g, '_'); } catch (e) { return 'asset_' + Math.random().toString(36).slice(2); } };

  const manifest = { story_url: location.href, title: document.title, timestamp: new Date().toISOString(), assets: [], failed: [] };
  log('Downloading... allow multiple downloads.');
  for (const a of assets) {
    const fname = PREFIX + a.asset_type + '__' + safe(a.asset_url);
    try { const r = await fetch(a.asset_url, { credentials: 'omit' }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = await r.blob(); save(b, fname); manifest.assets.push({ ...a, local_name: fname, size: b.size }); log('saved', fname, (b.size / 1024).toFixed(1) + 'KB');
    } catch (e) { manifest.failed.push({ ...a, error: String(e) }); console.warn('FAILED', a.asset_url, e); }
    await sleep(500);
  }
  save(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }), PREFIX + 'asset_manifest.json'); await sleep(400);
  save(new Blob([JSON.stringify({ story_url: location.href, title: document.title, headline: (document.querySelector('h1') || {}).innerText || '', beats }, null, 2)], { type: 'application/json' }), PREFIX + 'story_text.json'); await sleep(400);
  if (structure.length) { save(new Blob([JSON.stringify(structure, null, 2)], { type: 'application/json' }), PREFIX + 'story_structure_candidates.json'); await sleep(400); }
  save(new Blob([html], { type: 'text/html' }), PREFIX + 'page.html');
  window.__NYT = { assets, manifest, beats };
  log('DONE downloaded:', manifest.assets.length, 'failed:', manifest.failed.length, '— move all nyt_chinatown__* into your 04glb folder and tell Claude the path.');
})();
