/**
 * Rebuild a COMPACT, complete GLB from the capture still held in memory (window.__RIP._pois).
 * The first export embedded 254 textures as base64 inside the JSON chunk, bloating the file to
 * ~67 MB which got truncated on download. This re-packs the same captured geometry with:
 *   - textures stored as BINARY in the BIN chunk (no base64 33% inflation),
 *   - textures re-encoded at max 1024px, JPEG q0.8,
 *   - duplicate textures de-duplicated.
 * Run this in the SAME page tab where you captured (do NOT refresh, or _pois is gone).
 */
(async () => {
  const pois = window.__RIP && window.__RIP._pois;
  if (!pois || !pois.length) { console.warn('⚠ 内存里没有捕获数据(window.__RIP._pois 为空)——页面可能刷新过,需要重新抓。'); return; }
  console.log('重建中… POIs:', pois.length);

  const P4 = n => (n + 3) & ~3;
  const bin = []; let off = 0;
  const put = u8 => { const st = off; bin.push(u8); off += u8.byteLength; const pd = P4(off) - off; if (pd) { bin.push(new Uint8Array(pd)); off += pd; } return st; };
  const bv = [], acc = [], mats = [], images = [], texs = [], meshes = [], nodes = [], imgCache = new Map();

  const recompress = async (url) => {
    try {
      const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
      let w = img.width, h = img.height; const cap = 1024; if (w > cap || h > cap) { const s = cap / Math.max(w, h); w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s)); }
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.8);
    } catch (e) { return url; }
  };
  const b64ToU8 = (dataURL) => { const b64 = dataURL.slice(dataURL.indexOf(',') + 1); const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

  for (const g of pois) {
    const mp = [];
    for (const p of g.prims) {
      if (!p.indices || p.indices.length < 3 || !p.positions) continue;
      const io = put(new Uint8Array(p.indices.buffer, p.indices.byteOffset, p.indices.byteLength));
      bv.push({ buffer: 0, byteOffset: io, byteLength: p.indices.byteLength }); const ibv = bv.length - 1;
      const ia = acc.length; acc.push({ bufferView: ibv, componentType: 5125, count: p.indices.length, type: 'SCALAR' });
      let mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30]; for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = p.positions[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
      const po = put(new Uint8Array(p.positions.buffer, p.positions.byteOffset, p.positions.byteLength));
      bv.push({ buffer: 0, byteOffset: po, byteLength: p.positions.byteLength }); const pbv = bv.length - 1;
      const pa = acc.length; acc.push({ bufferView: pbv, componentType: 5126, count: p.positions.length / 3, type: 'VEC3', min: mn, max: mx });
      const at = { POSITION: pa };
      if (p.uvs) { const uo = put(new Uint8Array(p.uvs.buffer, p.uvs.byteOffset, p.uvs.byteLength)); bv.push({ buffer: 0, byteOffset: uo, byteLength: p.uvs.byteLength }); acc.push({ bufferView: bv.length - 1, componentType: 5126, count: p.uvs.length / 2, type: 'VEC2' }); at.TEXCOORD_0 = acc.length - 1; }
      let mi;
      if (p.url && p.uvs) {
        let ti = imgCache.get(p.url);
        if (ti == null) {
          const small = await recompress(p.url);
          const u8 = b64ToU8(small);
          const ibo = put(u8); bv.push({ buffer: 0, byteOffset: ibo, byteLength: u8.byteLength }); const ibvi = bv.length - 1;
          const ii = images.length; images.push({ bufferView: ibvi, mimeType: 'image/jpeg' });
          ti = texs.length; texs.push({ source: ii, sampler: 0 }); imgCache.set(p.url, ti);
        }
        mi = mats.length; mats.push({ pbrMetallicRoughness: { baseColorTexture: { index: ti }, metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true });
      } else { mi = mats.length; mats.push({ pbrMetallicRoughness: { baseColorFactor: [.8, .8, .8, 1], metallicFactor: 0, roughnessFactor: 1 }, doubleSided: true }); }
      mp.push({ attributes: at, indices: ia, material: mi });
    }
    meshes.push({ primitives: mp }); nodes.push({ mesh: meshes.length - 1, name: g.name });
  }

  const j = { asset: { version: '2.0', generator: 'doyers-rebuild' }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors: acc, bufferViews: bv, buffers: [{ byteLength: off }], materials: mats };
  if (images.length) { j.images = images; j.textures = texs; j.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }]; }
  let jb = new TextEncoder().encode(JSON.stringify(j)); const jp = P4(jb.length) - jb.length; if (jp) { const t = new Uint8Array(jb.length + jp); t.set(jb); t.fill(0x20, jb.length); jb = t; }
  const ba = new Uint8Array(off); let q = 0; for (const b of bin) { ba.set(b, q); q += b.byteLength; }
  const tot = 12 + 8 + jb.length + 8 + ba.length, ob = new ArrayBuffer(tot), dv = new DataView(ob); let o = 0;
  dv.setUint32(o, 0x46546C67, 1); o += 4; dv.setUint32(o, 2, 1); o += 4; dv.setUint32(o, tot, 1); o += 4;
  dv.setUint32(o, jb.length, 1); o += 4; dv.setUint32(o, 0x4E4F534A, 1); o += 4; new Uint8Array(ob, o, jb.length).set(jb); o += jb.length;
  dv.setUint32(o, ba.length, 1); o += 4; dv.setUint32(o, 0x004E4942, 1); o += 4; new Uint8Array(ob, o, ba.length).set(ba);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ob], { type: 'model/gltf-binary' })); a.download = 'doyers_all2.glb'; a.click();
  console.log('💾 doyers_all2.glb', (tot / 1048576).toFixed(2) + 'MB  nodes:' + nodes.length + '  images:' + images.length + '  jsonChunk:' + (jb.length / 1048576).toFixed(1) + 'MB');
})();
