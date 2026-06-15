/**
 * Doyers Street WebGL → GLB ripper (route B, v4).
 * three.js + Umbra photogrammetry. FLOAT vec3 pos + FLOAT vec2 uv, USHORT indices,
 * three.js modelViewMatrix/projectionMatrix. Street textures are COMPRESSED, captured by
 * rendering each to an offscreen FBO and reading pixels back. Geometry baked to the
 * capture frame's camera (view) space — one GLB node per POI.
 *
 * auto() captures all 7 POIs and downloads ONE combined file (doyers_all.glb) with nodes
 * poi0..poi6 — avoids the browser multi-download block / name collisions.
 *
 * Usage (in the open page Console):
 *   1. Refresh (F5), let the 3-D load.
 *   2. Paste this whole file, Enter.
 *   3. Test:  await __RIP.reupload(); await __RIP.grab('test'); __RIP.info()
 *   4. All:   await __RIP.auto()        →  doyers_all.glb  (one download)
 */
(() => {
  const cvs = document.querySelector('canvas');
  const gl = cvs.getContext('webgl') || cvs.getContext('experimental-webgl');
  if (!gl) { console.warn('no webgl ctx'); return; }
  const P = Object.getPrototypeOf(gl);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const LC = gl.getExtension('WEBGL_lose_context');
  const bufs = new WeakMap(), texDims = new WeakMap();
  let mode = 'idle', busy = false, prims = [], dedup = new Set(), texCount = 0, compressedTexN = 0, curName = null;

  const _bd = P.bufferData;
  P.bufferData = function (t, d, u) { const r = _bd.apply(this, arguments); if (busy) return r; try { if (d && d.byteLength != null) { const b = this.getParameter(t === this.ELEMENT_ARRAY_BUFFER ? this.ELEMENT_ARRAY_BUFFER_BINDING : this.ARRAY_BUFFER_BINDING); if (b) { const u8 = d.buffer ? new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength)) : new Uint8Array(d.slice(0)); bufs.set(b, u8); } } } catch (e) {} return r; };
  const _bsd = P.bufferSubData;
  P.bufferSubData = function (t, off, d) { const r = _bsd.apply(this, arguments); if (busy) return r; try { if (d && d.byteLength != null) { const b = this.getParameter(t === this.ELEMENT_ARRAY_BUFFER ? this.ELEMENT_ARRAY_BUFFER_BINDING : this.ARRAY_BUFFER_BINDING); if (b) { let dst = bufs.get(b); const src = d.buffer ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d); if (dst) dst.set(src, off); else bufs.set(b, src.slice()); } } } catch (e) {} return r; };

  const _tx = P.texImage2D;
  P.texImage2D = function () { const r = _tx.apply(this, arguments); if (busy) return r; try { const a = arguments; if ((a[1] | 0) === 0) { const t = this.getParameter(this.TEXTURE_BINDING_2D); if (t) { let w = 0, h = 0; const L = a[a.length - 1]; if (a.length >= 9 && typeof a[3] === 'number') { w = a[3]; h = a[4]; } else if (L && (L.width || L.videoWidth)) { w = L.width || L.videoWidth; h = L.height || L.videoHeight; } if (w && h) { texDims.set(t, { w, h }); texCount++; } } } } catch (e) {} return r; };
  const _ctx = P.compressedTexImage2D; if (_ctx) P.compressedTexImage2D = function () { const r = _ctx.apply(this, arguments); if (busy) return r; try { const a = arguments; if ((a[1] | 0) === 0) { const t = this.getParameter(this.TEXTURE_BINDING_2D); if (t && typeof a[3] === 'number') { texDims.set(t, { w: a[3], h: a[4] }); compressedTexN++; } } } catch (e) {} return r; };

  const mv = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  const uvt = (m, u, v) => m ? [m[0] * u + m[3] * v + m[6], m[1] * u + m[4] * v + m[7]] : [u, v];
  const ga = (g, l) => { if (!g.getVertexAttrib(l, g.VERTEX_ATTRIB_ARRAY_ENABLED)) return null; return { buf: g.getVertexAttrib(l, g.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING), size: g.getVertexAttrib(l, g.VERTEX_ATTRIB_ARRAY_SIZE), stride: g.getVertexAttrib(l, g.VERTEX_ATTRIB_ARRAY_STRIDE), off: g.getVertexAttribOffset(l, g.VERTEX_ATTRIB_ARRAY_POINTER) }; };

  function cap(g, count, offset) {
    try {
      const pr = g.getParameter(g.CURRENT_PROGRAM); if (!pr) return;
      const pl = g.getUniformLocation(pr, 'projectionMatrix'); if (!pl) return;
      const proj = g.getUniform(pr, pl); if (!proj || Math.abs(proj[11] + 1) > 0.01) return;
      const ml = g.getUniformLocation(pr, 'modelViewMatrix'); if (!ml) return;
      const M = g.getUniform(pr, ml);
      const pos = ga(g, 0); if (!pos || pos.size !== 3) return;
      const pU = bufs.get(pos.buf); if (!pU) return;
      const eb = g.getParameter(g.ELEMENT_ARRAY_BUFFER_BINDING); const iU = bufs.get(eb); if (!iU) return;
      const dk = (pos.buf.__k || (pos.buf.__k = Math.random())) + '|' + offset + '|' + count + '|' + M[12].toFixed(3) + M[13].toFixed(3) + M[14].toFixed(3); if (dedup.has(dk)) return; dedup.add(dk);
      const idx = new Uint16Array(iU.buffer, iU.byteOffset + (offset || 0), count); let mn = 1 / 0, mx = -1; for (let i = 0; i < count; i++) { const v = idx[i]; if (v < mn) mn = v; if (v > mx) mx = v; } const nV = mx - mn + 1;
      const pS = pos.stride || 12, pD = new DataView(pU.buffer, pU.byteOffset);
      const ua = ga(g, 1), uU = ua && ua.size === 2 ? bufs.get(ua.buf) : null, uS = ua ? (ua.stride || 8) : 0, uD = uU ? new DataView(uU.buffer, uU.byteOffset) : null;
      const utl = g.getUniformLocation(pr, 'uvTransform'), UT = utl ? g.getUniform(pr, utl) : null;
      const positions = new Float32Array(nV * 3), uvs = uD ? new Float32Array(nV * 2) : null;
      for (let v = 0; v < nV; v++) { const s = mn + v, po = pos.off + s * pS; const w = mv(M, pD.getFloat32(po, true), pD.getFloat32(po + 4, true), pD.getFloat32(po + 8, true)); positions[v * 3] = w[0]; positions[v * 3 + 1] = w[1]; positions[v * 3 + 2] = w[2]; if (uvs) { const uo = ua.off + s * uS, r = uvt(UT, uD.getFloat32(uo, true), uD.getFloat32(uo + 4, true)); uvs[v * 2] = r[0]; uvs[v * 2 + 1] = r[1]; } }
      const indices = new Uint32Array(count); for (let i = 0; i < count; i++) indices[i] = idx[i] - mn;
      let tex = null; try { const mp = g.getUniformLocation(pr, 'map'); if (mp) { const un = g.getUniform(pr, mp) | 0, cu = g.getParameter(g.ACTIVE_TEXTURE); g.activeTexture(g.TEXTURE0 + un); tex = g.getParameter(g.TEXTURE_BINDING_2D); g.activeTexture(cu); } } catch (e) {}
      prims.push({ positions, uvs, indices, tex });
    } catch (e) { window.__RIPERR = String(e); }
  }
  const _de = P.drawElements; P.drawElements = function (m, c, t, o) { if (mode === 'collecting' && !busy) cap(this, c, o); return _de.apply(this, arguments); };

  let quad = null;
  function setupQuad(g) {
    if (quad) return quad;
    const sh = (ty, src) => { const s = g.createShader(ty); g.shaderSource(s, src); g.compileShader(s); return s; };
    const vs = sh(g.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}');
    const fs = sh(g.FRAGMENT_SHADER, 'precision highp float;uniform sampler2D t;varying vec2 v;void main(){gl_FragColor=texture2D(t,v);}');
    const pr = g.createProgram(); g.attachShader(pr, vs); g.attachShader(pr, fs); g.bindAttribLocation(pr, 0, 'p'); g.linkProgram(pr);
    const buf = g.createBuffer(); g.bindBuffer(g.ARRAY_BUFFER, buf); g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    quad = { pr, buf, tloc: g.getUniformLocation(pr, 't') }; return quad;
  }
  function readTex(g, tex) {
    const dim = texDims.get(tex); if (!dim) return null; let w = Math.min(dim.w, 2048), h = Math.min(dim.h, 2048); if (!w || !h) return null;
    const q = setupQuad(g);
    const vao = g.getExtension('OES_vertex_array_object'); const prevVAO = vao ? g.getParameter(vao.VERTEX_ARRAY_BINDING_OES) : null; if (vao) vao.bindVertexArrayOES(null);
    const tgt = g.createTexture(); g.bindTexture(g.TEXTURE_2D, tgt); g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, w, h, 0, g.RGBA, g.UNSIGNED_BYTE, null); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR); g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
    const fb = g.createFramebuffer(); g.bindFramebuffer(g.FRAMEBUFFER, fb); g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, tgt, 0);
    let url = null;
    if (g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE) {
      g.viewport(0, 0, w, h); g.disable(g.DEPTH_TEST); g.disable(g.BLEND); g.useProgram(q.pr);
      g.activeTexture(g.TEXTURE0); g.bindTexture(g.TEXTURE_2D, tex); g.uniform1i(q.tloc, 0);
      g.bindBuffer(g.ARRAY_BUFFER, q.buf); g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      g.drawArrays(g.TRIANGLES, 0, 3);
      const px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
      const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); const id = ctx.createImageData(w, h);
      for (let row = 0; row < h; row++) { const s = (h - 1 - row) * w * 4, d2 = row * w * 4; for (let i = 0; i < w * 4; i++) id.data[d2 + i] = px[s + i]; }
      ctx.putImageData(id, 0, 0); url = c.toDataURL('image/jpeg', 0.9);
    }
    g.bindFramebuffer(g.FRAMEBUFFER, null); g.deleteFramebuffer(fb); g.deleteTexture(tgt);
    if (vao) vao.bindVertexArrayOES(prevVAO);
    return url;
  }

  // collect one POI's geometry (current view), resolve its textures
  async function collect() {
    prims = []; dedup = new Set(); mode = 'collecting';
    await sleep(800); mode = 'idle';
    busy = true; const cache = new Map();
    for (const p of prims) { if (!p.tex) continue; let u = cache.get(p.tex); if (u === undefined) { u = readTex(gl, p.tex); cache.set(p.tex, u); } p.url = u; }
    busy = false;
    return prims.slice();
  }

  // build ONE glb from groups=[{name, prims}] → one node+mesh per group
  function buildGLB(groups) {
    try {
      const P4 = n => (n + 3) & ~3; const bin = []; let off = 0; const bv = [], acc = [], mats = [], imgs = [], texs = [], meshes = [], nodes = [], ic = new Map();
      const put = ta => { const b = new Uint8Array(ta.buffer, ta.byteOffset, ta.byteLength); const st = off; bin.push(b); off += b.byteLength; const pd = P4(off) - off; if (pd) { bin.push(new Uint8Array(pd)); off += pd; } return st; };
      for (const grp of groups) {
        const mp = [];
        for (const p of grp.prims) {
          if (p.indices.length < 3) continue;
          const io = put(p.indices), ibv = bv.length; bv.push({ buffer: 0, byteOffset: io, byteLength: p.indices.byteLength }); const ia = acc.length; acc.push({ bufferView: ibv, componentType: 5125, count: p.indices.length, type: 'SCALAR' });
          let mn = [1 / 0, 1 / 0, 1 / 0], mx = [-1 / 0, -1 / 0, -1 / 0]; for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = p.positions[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
          const po = put(p.positions), pbv = bv.length; bv.push({ buffer: 0, byteOffset: po, byteLength: p.positions.byteLength }); const pa = acc.length; acc.push({ bufferView: pbv, componentType: 5126, count: p.positions.length / 3, type: 'VEC3', min: mn, max: mx });
          const at = { POSITION: pa }; if (p.uvs) { const uo = put(p.uvs), ubv = bv.length; bv.push({ buffer: 0, byteOffset: uo, byteLength: p.uvs.byteLength }); const ua = acc.length; acc.push({ bufferView: ubv, componentType: 5126, count: p.uvs.length / 2, type: 'VEC2' }); at.TEXCOORD_0 = ua; }
          let mi; if (p.url && p.uvs) { let ti = ic.get(p.url); if (ti == null) { const ii = imgs.length; imgs.push({ uri: p.url }); ti = texs.length; texs.push({ source: ii, sampler: 0 }); ic.set(p.url, ti); } mi = mats.length; mats.push({ pbrMetallicRoughness: { baseColorTexture: { index: ti }, metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }); } else { mi = mats.length; mats.push({ pbrMetallicRoughness: { baseColorFactor: [.8, .8, .8, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }); }
          mp.push({ attributes: at, indices: ia, material: mi });
        }
        const mIdx = meshes.length; meshes.push({ primitives: mp }); nodes.push({ mesh: mIdx, name: grp.name });
      }
      const j = { asset: { version: '2.0', generator: 'doyers-rip' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors: acc, bufferViews: bv, buffers: [{ byteLength: off }], materials: mats };
      if (imgs.length) { j.images = imgs; j.textures = texs; j.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }]; }
      let jb = new TextEncoder().encode(JSON.stringify(j)); const jp = P4(jb.length) - jb.length; if (jp) { const t = new Uint8Array(jb.length + jp); t.set(jb); t.fill(0x20, jb.length); jb = t; }
      const ba = new Uint8Array(off); let q = 0; for (const b of bin) { ba.set(b, q); q += b.byteLength; }
      const tot = 12 + 8 + jb.length + 8 + ba.length, ob = new ArrayBuffer(tot), dv = new DataView(ob); let o = 0;
      dv.setUint32(o, 0x46546C67, 1); o += 4; dv.setUint32(o, 2, 1); o += 4; dv.setUint32(o, tot, 1); o += 4;
      dv.setUint32(o, jb.length, 1); o += 4; dv.setUint32(o, 0x4E4F534A, 1); o += 4; new Uint8Array(ob, o, jb.length).set(jb); o += jb.length;
      dv.setUint32(o, ba.length, 1); o += 4; dv.setUint32(o, 0x004E4942, 1); o += 4; new Uint8Array(ob, o, ba.length).set(ba);
      const nm = 'doyers_' + (curName || ('frame_' + Date.now())) + '.glb';
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ob], { type: 'model/gltf-binary' })); a.download = nm; a.click();
      const totPrims = meshes.reduce((s, m) => s + m.primitives.length, 0);
      console.log('✅', nm, (tot / 1048576).toFixed(2) + 'MB  nodes:' + nodes.length + '  prims:' + totPrims + '  textures:' + imgs.length, window.__RIPERR ? '(warn:' + window.__RIPERR + ')' : '');
    } catch (e) { console.warn('build failed', e); }
  }

  async function reupload(wait = 4000) {
    if (!LC) { console.warn('⚠ 无 WEBGL_lose_context — 请硬刷新后立刻粘脚本'); return; }
    LC.loseContext(); await sleep(300); LC.restoreContext(); await sleep(wait);
  }

  window.__RIP = {
    reupload,
    _pois: [],
    // manual per-POI accumulate: navigate to a point yourself, then call add('pN'); finally save()
    // NOTE: no reupload here — manually-navigated points stream fresh tiles that are captured
    // directly. Only the FIRST (already-resident) point needs a one-time __RIP.reupload() before add.
    add: async (name) => {
      const pr = await collect();
      const nm = name || ('p' + window.__RIP._pois.length);
      window.__RIP._pois.push({ name: nm, prims: pr });
      console.log('➕ 收入 ' + nm + '  prims=' + pr.length + '  (累计 ' + window.__RIP._pois.length + ' 个点)' + (pr.length < 15 ? '  ⚠几何很少,这个点可能没抓到' : ''));
    },
    save: () => { if (!window.__RIP._pois.length) { console.warn('还没 add 任何点'); return; } curName = 'all'; buildGLB(window.__RIP._pois); console.log('💾 已导出 doyers_all.glb,含 ' + window.__RIP._pois.length + ' 个节点'); },
    reset: () => { window.__RIP._pois = []; console.log('已清空累计'); },
    grab: async (name) => { curName = name || 'frame'; const pr = await collect(); buildGLB([{ name: name || 'frame', prims: pr }]); },
    // one-command walk: drive the scroll-wheel to advance POIs, capture each, save one file
    autoWalk: async (count = 7, navWait = 4000, reWait = 3500) => {
      const zone = document.querySelector('.g-story-points-interactive, .g-story-points-zone, .g-story-points') || cvs;
      window.__RIP._pois = []; let prevSig = '';
      for (let i = 0; i < count; i++) {
        if (i > 0) { for (let n = 0; n < 12; n++) { zone.dispatchEvent(new WheelEvent('wheel', { deltaY: 150, bubbles: true, cancelable: true })); await sleep(50); } await sleep(navWait); }
        await reupload(reWait);
        const pr = await collect();
        const sig = pr.length ? pr[0].positions.slice(0, 3).map(x => x.toFixed(3)).join(',') : '';
        window.__RIP._pois.push({ name: 'poi' + i, prims: pr });
        console.log('✔ poi' + i + '  prims=' + pr.length + (sig && sig === prevSig ? '  ⚠与上一点相同(滚轮没驱动导航)' : ''));
        prevSig = sig;
      }
      curName = 'all'; buildGLB(window.__RIP._pois);
      console.log('💾 doyers_all.glb 含 ' + window.__RIP._pois.length + ' 节点');
    },
    auto: async (navWait = 5000, reWait = 4000) => {
      const cards = [...document.querySelectorAll('button[data-poi-index]')];
      if (!cards.length) { console.warn('找不到 POI 控件,用 __RIP.grab() 手动抓'); return; }
      console.log('共 ' + cards.length + ' 个 POI,逐个抓取(完成后只下载一个合并文件)...');
      const groups = [];
      for (let k = 0; k < cards.length; k++) {
        const c = cards[k], i = c.getAttribute('data-poi-index');
        c.click(); await sleep(navWait);
        if (k === 0) await reupload(reWait);          // re-upload only once (for already-resident tiles); later POIs stream fresh on navigation
        const pr = await collect(); groups.push({ name: 'poi' + i, prims: pr });
        console.log('✔ POI ' + i + '  prims=' + pr.length + (pr.length < 15 ? '  ⚠低(可能被缓存,稍后单独补抓)' : ''));
      }
      curName = 'all'; buildGLB(groups); console.log('🎉 完成 → 单文件 doyers_all.glb,含 ' + groups.length + ' 个节点 poi0..poi' + (groups.length - 1));
    },
    info: () => ({ prims: prims.length, uncompressedTex: texCount, compressedTex: compressedTexN })
  };
  console.log('🔧 RIP v5 已安装。手动逐点(推荐):走到每个点位后各跑一次  await __RIP.add()  ,7 个点都收完后  __RIP.save()  导出单文件。');
})();
