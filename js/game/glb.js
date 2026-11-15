// ============================================================
//  brix • js/game/glb.js
//  GLB-загрузчик для глобального THREE (без модулей).
//  Поддерживает то, что нужно для пропсов и ПЕРСОНАЖА BRIX:
//  - буферы/accessor: FLOAT/UBYTE/USHORT/UINT, VEC2/3/4, MAT4
//  - примитивы TRIANGLES, иерархия нод с matrix/TRS
//  - материалы: baseColor/metallicRoughness/normal текстуры
//    (имя материала берётся из glTF — по нему firstperson.js
//    понимает, какие меши «руки», а какие — тело)
//  - СКЕЛЕТ: skins + JOINTS_0/WEIGHTS_0 → THREE.Bone, SkinnedMesh,
//    Skeleton с inverseBindMatrices (порт подхода GLTFLoader)
// ============================================================
window.BrixGLB = (function () {
  'use strict';

  var COMPONENT = {
    5120: { array: Int8Array, size: 1 },
    5121: { array: Uint8Array, size: 1 },
    5122: { array: Int16Array, size: 2 },
    5123: { array: Uint16Array, size: 2 },
    5125: { array: Uint32Array, size: 4 },
    5126: { array: Float32Array, size: 4 }
  };
  var TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

  function readAccessor(json, bin, index) {
    var acc = json.accessors[index];
    var bv = json.bufferViews[acc.bufferView];
    var comp = COMPONENT[acc.componentType];
    var comps = TYPE_SIZE[acc.type];
    var start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
    var elems = acc.count * comps;
    var bytes = elems * comp.size;
    var out = new comp.array(elems);
    // копируем через выровненный view (start может быть не кратен comp.size)
    var aligned = (start % comp.size === 0);
    var src;
    if (aligned) {
      src = new comp.array(bin.buffer, start, elems);
      out.set(src);
    } else {
      var buf = new ArrayBuffer(bytes);
      var u8 = new Uint8Array(buf);
      u8.set(bin.subarray(start, start + bytes));
      out.set(new comp.array(buf));
    }
    return { array: out, itemSize: comps, count: acc.count };
  }

  function loadTexture(json, bin, texIndex, srgb) {
    var tex = json.textures[texIndex];
    var img = json.images[tex.source];
    var bv = json.bufferViews[img.bufferView];
    var start = bv.byteOffset || 0;
    var bytes = bin.subarray(start, start + bv.byteLength);
    var mime = img.mimeType || 'image/png';
    var blob = new Blob([bytes], { type: mime });
    var url = URL.createObjectURL(blob);

    return new Promise(function (resolve, reject) {
      var loader = new THREE.TextureLoader();
      loader.load(url, function (texture) {
        texture.flipY = false; // UV-конвенция glTF
        if (srgb && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
        var sampler = json.samplers && json.samplers[tex.sampler];
        if (sampler) {
          var WRAP = { 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping, 10497: THREE.RepeatWrapping };
          var FILT = { 9728: THREE.NearestFilter, 9729: THREE.LinearFilter, 9984: THREE.NearestMipmapNearestFilter, 9985: THREE.LinearMipmapNearestFilter, 9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter };
          if (WRAP[sampler.wrapS]) texture.wrapS = WRAP[sampler.wrapS];
          if (WRAP[sampler.wrapT]) texture.wrapT = WRAP[sampler.wrapT];
          if (FILT[sampler.magFilter]) texture.magFilter = FILT[sampler.magFilter];
          if (FILT[sampler.minFilter]) texture.minFilter = FILT[sampler.minFilter];
        }
        texture.needsUpdate = true;
        resolve(texture);
      }, undefined, reject);
    });
  }

  function buildMaterial(json, bin, matIndex) {
    var def = (json.materials || [])[matIndex] || {};
    var m = def;
    var pbr = m.pbrMetallicRoughness || {};
    var pending = [];

    if (pbr.baseColorTexture !== undefined) pending.push(loadTexture(json, bin, pbr.baseColorTexture.index, true));
    else pending.push(Promise.resolve(null));
    if (pbr.metallicRoughnessTexture !== undefined) pending.push(loadTexture(json, bin, pbr.metallicRoughnessTexture.index, false));
    else pending.push(Promise.resolve(null));
    if (m.normalTexture !== undefined) pending.push(loadTexture(json, bin, m.normalTexture.index, false));
    else pending.push(Promise.resolve(null));

    return Promise.all(pending).then(function (r) {
      var baseMap = r[0], mrMap = r[1], normalMap = r[2];
      var mat = new THREE.MeshStandardMaterial({
        color: pbr.baseColorFactor ? new THREE.Color(pbr.baseColorFactor[0], pbr.baseColorFactor[1], pbr.baseColorFactor[2]) : new THREE.Color(0xffffff),
        roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 1.0,
        metalness: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 1.0,
        side: m.doubleSided ? THREE.DoubleSide : THREE.FrontSide
      });
      if (baseMap) mat.map = baseMap;
      if (mrMap) { mat.roughnessMap = mrMap; mat.metalnessMap = mrMap; }
      if (normalMap) {
        mat.normalMap = normalMap;
        if (m.normalTexture && m.normalTexture.scale) mat.normalScale.set(m.normalTexture.scale, m.normalTexture.scale);
      }
      // имя материала из glTF — по нему visible рук/тела (firstperson.js)
      mat.name = m.name || '';
      // ✅ прозрачность листвы: MASK/BLEND → кат-аут (без сортировочных артефактов)
      if (m.alphaMode === 'MASK') {
        mat.alphaTest = (m.alphaCutoff !== undefined) ? m.alphaCutoff : 0.5;
      } else if (m.alphaMode === 'BLEND') {
        mat.alphaTest = 0.4;
        mat.side = THREE.DoubleSide;
      }
      return mat;
    });
  }

  /** матрица ноды в мировых координатах (по иерархии файла) */
  function nodeWorldMatrix(json, nodeIndex, parentMatrix, cache) {
    if (cache[nodeIndex]) return cache[nodeIndex];
    var node = json.nodes[nodeIndex];
    var local = new THREE.Matrix4();
    if (node.matrix) local.fromArray(node.matrix);
    else {
      var t = node.translation || [0, 0, 0];
      var q = node.rotation || [0, 0, 0, 1];
      var s = node.scale || [1, 1, 1];
      local.compose(
        new THREE.Vector3(t[0], t[1], t[2]),
        new THREE.Quaternion(q[0], q[1], q[2], q[3]),
        new THREE.Vector3(s[0], s[1], s[2])
      );
    }
    var world = new THREE.Matrix4().multiplyMatrices(parentMatrix, local);
    cache[nodeIndex] = world;
    (node.children || []).forEach(function (c) {
      nodeWorldMatrix(json, c, world, cache);
    });
    return world;
  }

  /* ============================================================
     ГЕОМЕТРИЯ ПРИМИТИВА
     skinned=true → добавляются skinIndex/skinWeight (для SkinnedMesh)
     ============================================================ */
  function buildPrimitiveGeometry(json, bin, prim, skinned) {
    var geo = new THREE.BufferGeometry();
    var at = prim.attributes;
    if (at.POSITION !== undefined) {
      var p = readAccessor(json, bin, at.POSITION);
      geo.setAttribute('position', new THREE.BufferAttribute(p.array, p.itemSize));
    }
    if (at.NORMAL !== undefined) {
      var n = readAccessor(json, bin, at.NORMAL);
      geo.setAttribute('normal', new THREE.BufferAttribute(n.array, n.itemSize));
    }
    if (at.TEXCOORD_0 !== undefined) {
      var uv = readAccessor(json, bin, at.TEXCOORD_0);
      geo.setAttribute('uv', new THREE.BufferAttribute(uv.array, uv.itemSize));
    }
    if (skinned && at.JOINTS_0 !== undefined && at.WEIGHTS_0 !== undefined) {
      var j = readAccessor(json, bin, at.JOINTS_0);
      // three.js ждёт skinIndex как unsigned int (Uint16BufferAttribute)
      var jArr = (j.array instanceof Uint8Array || j.array instanceof Int8Array)
        ? new Uint16Array(j.array) : j.array;
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(jArr, 4));
      var w = readAccessor(json, bin, at.WEIGHTS_0);
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(w.array instanceof Float32Array ? w.array : new Float32Array(w.array), 4));
    }
    if (prim.indices !== undefined) {
      var idx = readAccessor(json, bin, prim.indices);
      geo.setIndex(new THREE.BufferAttribute(idx.array, 1));
    }
    geo.computeBoundingSphere();
    return geo;
  }

  /* ============================================================
     РАЗБОР GLB
     ============================================================ */
  function parseGLB(ab) {
    var head = new DataView(ab);
    if (head.getUint32(0, true) !== 0x46546C67) throw new Error('Не GLB-файл');
    var off = 12, json = null, bin = null;
    while (off < ab.byteLength) {
      var len = head.getUint32(off, true);
      var type = head.getUint32(off + 4, true);
      var chunk = ab.slice(off + 8, off + 8 + len);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(chunk));
      else if (type === 0x004E4942) bin = new Uint8Array(chunk);
      off += 8 + len;
    }
    if (!json) throw new Error('GLB без JSON-чанка');
    return { json: json, bin: bin };
  }

  /** байты модели: на http — всегда с диска (свежие файлы),
      на file:// — встроенная копия из embeddata.js */
  function getBytes(url) {
    var base = url.split('?')[0].split('/').pop();
    var embedded = window.BrixEmbed && window.BrixEmbed.models && window.BrixEmbed.models[base];
    if (window.location.protocol === 'file:') {
      if (embedded) return Promise.resolve(window.BrixEmbed.b64ab(embedded));
    }
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('GLB ' + r.status);
      return r.arrayBuffer();
    }).catch(function (err) {
      // сеть/сервер недоступны — пробуем встроенную копию
      if (embedded) return window.BrixEmbed.b64ab(embedded);
      throw err;
    });
  }

  /**
   * Сборка сцены GLB с иерархией нод и скелетом.
   * @returns {Promise<THREE.Group>} корневая группа
   */
  function buildScene(json, bin) {
    return Promise.resolve().then(function () {
      var nodes = [];
      var jointSet = {};
      (json.skins || []).forEach(function (s) {
        (s.joints || []).forEach(function (jn) { jointSet[jn] = true; });
      });

      // 1) ноды: кости для суставов, Object3D для остальных
      (json.nodes || []).forEach(function (n, i) {
        var obj = jointSet[i] ? new THREE.Bone() : new THREE.Object3D();
        obj.name = n.name || '';
        if (n.matrix) {
          new THREE.Matrix4().fromArray(n.matrix).decompose(obj.position, obj.quaternion, obj.scale);
        } else {
          if (n.translation) obj.position.fromArray(n.translation);
          if (n.rotation) obj.quaternion.fromArray(n.rotation);
          if (n.scale) obj.scale.fromArray(n.scale);
        }
        nodes.push(obj);
      });
      (json.nodes || []).forEach(function (n, i) {
        (n.children || []).forEach(function (c) {
          if (nodes[c]) nodes[i].add(nodes[c]);
        });
      });

      // 2) меши
      var skinnedBySkin = {};   // skinIndex → [SkinnedMesh]
      var meshJobs = [];        // {nodeIndex, primIndex, geoPromise, matIndex, skin}
      (json.nodes || []).forEach(function (n, ni) {
        if (n.mesh === undefined) return;
        var mesh = json.meshes[n.mesh];
        mesh.primitives.forEach(function (prim, pi) {
          if (prim.mode !== undefined && prim.mode !== 4) return; // только треугольники
          var hasSkin = n.skin !== undefined;
          meshJobs.push({
            nodeIndex: ni,
            geo: buildPrimitiveGeometry(json, bin, prim, hasSkin),
            matIndex: prim.material || 0,
            skin: hasSkin ? n.skin : -1,
            primIndex: pi
          });
        });
      });

      // материалы (с именами)
      var matPromises = {};
      meshJobs.forEach(function (job) {
        if (matPromises[job.matIndex] === undefined) {
          matPromises[job.matIndex] = buildMaterial(json, bin, job.matIndex);
        }
      });
      var matIds = Object.keys(matPromises);

      // мировые матрицы нод (для запекания статических мешей):
      // сначала проходим от корней сцены вниз, заполняя кэш
      var wcache = [];
      var wIdentity = new THREE.Matrix4();
      (json.scenes && json.scenes[json.scene || 0].nodes || []).forEach(function (n) {
        nodeWorldMatrix(json, n, wIdentity, wcache);
      });

      return Promise.all(matIds.map(function (k) { return matPromises[k]; })).then(function (mats) {
        var matById = {};
        matIds.forEach(function (k, i) { matById[k] = mats[i]; });

        var root = new THREE.Group();
        root.name = 'brixGlbScene';
        (json.scenes && json.scenes[json.scene || 0].nodes || []).forEach(function (n) {
          if (nodes[n]) root.add(nodes[n]);
        });

        meshJobs.forEach(function (job) {
          var mat = matById[job.matIndex];
          var node = nodes[job.nodeIndex];
          if (job.skin >= 0) {
            var m = new THREE.SkinnedMesh(job.geo, mat);
            m.frustumCulled = false;
            m.castShadow = false;
            m.receiveShadow = false;
            node.add(m);
            if (!skinnedBySkin[job.skin]) skinnedBySkin[job.skin] = [];
            skinnedBySkin[job.skin].push(m);
          } else {
            // статический меш: запекаем мировую матрицу ноды в геометрию
            var worldM = nodeWorldMatrix(json, job.nodeIndex, wIdentity, wcache);
            job.geo.applyMatrix4(worldM);
            var sm = new THREE.Mesh(job.geo, mat);
            sm.castShadow = false;
            sm.receiveShadow = false;
            sm.frustumCulled = false;
            root.add(sm); // статические меши — вне иерархии костей
          }
        });

        // 3) скелеты: Skeleton(bones, inverseBindMatrices) + bind
        (json.skins || []).forEach(function (skinDef, si) {
          var list = skinnedBySkin[si];
          if (!list || !list.length) return;
          var bones = (skinDef.joints || []).map(function (jn) { return nodes[jn]; });
          var boneInverses = null;
          if (skinDef.inverseBindMatrices !== undefined) {
            var ibm = readAccessor(json, bin, skinDef.inverseBindMatrices);
            boneInverses = [];
            for (var b = 0; b < skinDef.joints.length; b++) {
              var m4 = new THREE.Matrix4();
              m4.fromArray(ibm.array, b * 16);
              boneInverses.push(m4);
            }
          }
          var skeleton = new THREE.Skeleton(bones, boneInverses || undefined);
          root.updateMatrixWorld(true);
          list.forEach(function (mesh) {
            mesh.bind(skeleton, new THREE.Matrix4()); // bind = identity (как в GLTFLoader)
          });
        });

        root.updateMatrixWorld(true);
        return root;
      });
    });
  }

  /**
   * Загрузка GLB-модели (статической или скелетной).
   * @param {string} url  путь к .glb
   * @param {Function} onReady  (group, boxSize) — вызывается один раз
   * @param {Function} [onError]
   */
  function load(url, onReady, onError) {
    getBytes(url)
      .then(function (ab) {
        var parts = parseGLB(ab);
        return buildScene(parts.json, parts.bin).then(function (root) {
          var box = new THREE.Box3().setFromObject(root);
          onReady(root, box.getSize(new THREE.Vector3()), box);
        });
      })
      .catch(function (err) {
        if (onError) onError(err);
        else console.error('[BrixGLB]', err);
      });
  }

  return { load: load };
})();
