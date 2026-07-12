/**
 * scene3d.js — Stage 2: Heart Planet + Interactive Photo Ring
 *
 * Features:
 *   • Heart-shaped 3D planet (ExtrudeGeometry from parametric curve)
 *   • Fresnel rim-glow atmosphere shader
 *   • 2 500-star deep-space starfield
 *   • 16 polaroid frames arranged randomly in a tilted torus orbit
 *   • OrbitControls — drag to rotate the entire scene
 *   • Raycaster — click any photo to zoom in; "Back" button to zoom out
 *   • Drag-vs-click detection (prevents accidental zoom on drag)
 *   • Orbiting sparkle particles
 *   • GSAP intro animations
 *
 * Dependencies (CDN): Three.js r128, OrbitControls, GSAP 3.12
 *
 * API:  window.Scene3D = {
 *         start(), stop(), fadeOut(cb), zoomOut(),
 *         enableControls(), disableControls()
 *       }
 */
;(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  //  CONFIGURATION
  // ═══════════════════════════════════════════════════════════
  var PHOTO_COUNT    = 20;
  var RING_RADIUS    = 38;           // major radius of the torus orbit
  var STAR_COUNT     = 2500;
  var SPARKLE_COUNT  = 300;
  var FRAME_W        = 6.5;          // polaroid frame width
  var FRAME_H        = 8;            // polaroid frame height
  var PHOTO_RATIO    = 0.82;         // photo-to-frame ratio
  var ZOOM_DIST      = 11;           // camera distance from frame on zoom
  var DRAG_THRESHOLD = 8;            // px — movement beyond this = drag, not click

  // ★ Photo paths — tất cả 20 ảnh từ thư mục image/
  var PHOTO_PATHS = [
    'image/14fe67aa-9641-487f-ae5e-7098b410e82d.jpeg',
    'image/1783820697402_790380041396167469_3824493599118096585_eb491737cf59ddd6b63f7e6f975beb13.jpg',
    'image/1783820697422_790380041396167469_3824493599118096585_10cd55c7c084cc1925c6eb25c0712411.jpg',
    'image/1783820697441_790380041396167469_3824493599118096585_3b4208f11a542f3a7f61a0d1c8cf6289.jpg',
    'image/1783820828210_790380041396167469_3824493599118096585_6428f807d4d1c328dc0c9f1f63d63f03.jpg',
    'image/1783820828253_790380041396167469_3824493599118096585_41ae5051271e07738675a355f39c9037.jpg',
    'image/1783820828273_790380041396167469_3824493599118096585_59502a27570dd9e530ede93a12b7dfbd.jpg',
    'image/1783820828293_790380041396167469_3824493599118096585_fcc1020ffd695cdc7d1109c6723154cc.jpg',
    'image/2e5742da-e41e-4ee3-accb-2f9ee368222e.jpeg',
    'image/48f6ce91-18fa-4d61-8cb0-ebec4c1f6546.jpeg',
    'image/563deb10-ffb6-4227-968f-da93789dd308.jpeg',
    'image/5d78e8b2-77c0-494b-b8d8-ff0854df7f58.jpeg',
    'image/656c571e-2df6-4530-b349-d3e23e2d5897.jpeg',
    'image/965ba107-c185-4991-960b-08d7792638fc.jpeg',
    'image/9adfc4f5-f332-4731-a1cc-d67db7ff35de.jpeg',
    'image/a253e99a-ec47-436b-9a5c-082af83c444e.jpeg',
    'image/b5a769bc-f917-4732-b31d-abad33daa2bb.jpeg',
    'image/deef4d68-c327-4f34-8b29-fd2fc03f5431.jpeg',
    'image/e2dd195a-0cad-440e-8516-70508b60a929.jpeg',
    'image/e846a1dc-059f-431b-b887-08d58938c06f.jpeg'
  ];

  // ═══════════════════════════════════════════════════════════
  //  STATE
  // ═══════════════════════════════════════════════════════════
  var canvas, renderer, scene, camera, controls;
  var heartPlanet, heartGlow, ringGroup, starfield, sparkles;
  var raycaster, mouseVec;
  var animId       = null;
  var clock        = new THREE.Clock();
  var introDone    = false;

  // Camera animation state
  var isZoomed     = false;
  var isAnimating  = false;
  var origCamPos   = new THREE.Vector3(-55.7, -22.0, 50.6);
  var camLook      = { x: 0, y: 0, z: 0 };

  // Drag-vs-click detection
  var dragStartPos = { x: 0, y: 0 };
  var wasDragged   = false;

  // All frame meshes the raycaster can hit
  var clickableFrames = [];

  // UI elements (populated during init)
  var backBtn, discoverOverlay;


  // ═══════════════════════════════════════════════════════════
  //  INIT
  // ═══════════════════════════════════════════════════════════
  function init() {
    canvas = document.getElementById('webgl-canvas');
    if (!canvas) return;
    canvas.style.display = 'none';

    backBtn          = document.getElementById('btn-back');
    discoverOverlay  = document.querySelector('.stage2-overlay');

    // ── Renderer ────────────────────────────────────────────
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // ── Scene ───────────────────────────────────────────────
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030010);

    // ── Camera ──────────────────────────────────────────────
    camera = new THREE.PerspectiveCamera(
      50, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    camera.position.copy(origCamPos);
    camera.lookAt(0, 0, 0);

    // ── OrbitControls (drag-to-rotate) ──────────────────────
    if (THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, canvas);
      controls.enableDamping  = true;
      controls.dampingFactor  = 0.06;
      controls.enableZoom     = false;     // Scroll zoom disabled (raycaster handles zoom)
      controls.enablePan      = false;     // No panning
      controls.rotateSpeed    = 0.55;
      controls.minPolarAngle  = Math.PI * 0.15;   // Limit vertical rotation
      controls.maxPolarAngle  = Math.PI * 0.85;
      controls.minDistance    = 30;
      controls.maxDistance    = 120;
      controls.enabled        = false;     // Start disabled (onboarding first)
    }

    // ── Lights ──────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    var keyLight = new THREE.PointLight(0xff69b4, 2.5, 350);
    keyLight.position.set(30, 25, 55);
    scene.add(keyLight);

    var fillLight = new THREE.PointLight(0xff9ec5, 1, 250);
    fillLight.position.set(-28, -18, 45);
    scene.add(fillLight);

    var rimLight = new THREE.PointLight(0x7c3aed, 0.6, 200);
    rimLight.position.set(0, -25, -50);
    scene.add(rimLight);

    // ── Raycaster ───────────────────────────────────────────
    raycaster = new THREE.Raycaster();
    mouseVec  = new THREE.Vector2();

    // ── Build scene objects ─────────────────────────────────
    buildStarfield();
    buildHeartPlanet();
    buildAtmosphere();
    buildPhotoRing();
    buildSparkles();

    // ── Events ──────────────────────────────────────────────
    window.addEventListener('resize', onResize, false);

    // Drag-vs-click tracking: record pointer-down position so we
    // can distinguish a "click" (no movement) from a "drag" (rotation)
    canvas.addEventListener('mousedown', function (e) {
      dragStartPos.x = e.clientX;
      dragStartPos.y = e.clientY;
      wasDragged = false;
    }, false);

    canvas.addEventListener('mousemove', function (e) {
      if (e.buttons > 0) {
        var dx = e.clientX - dragStartPos.x;
        var dy = e.clientY - dragStartPos.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          wasDragged = true;
        }
      }
    }, false);

    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        dragStartPos.x = e.touches[0].clientX;
        dragStartPos.y = e.touches[0].clientY;
        wasDragged = false;
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length === 1) {
        var dx = e.touches[0].clientX - dragStartPos.x;
        var dy = e.touches[0].clientY - dragStartPos.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          wasDragged = true;
        }
      }
    }, { passive: true });

    // The actual click handler uses wasDragged to filter
    canvas.addEventListener('click', onCanvasClick, false);

    if (backBtn) {
      backBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        zoomOut();
      });
    }
  }


  // ═══════════════════════════════════════════════════════════
  //  STARFIELD
  // ═══════════════════════════════════════════════════════════
  function buildStarfield() {
    var pos = new Float32Array(STAR_COUNT * 3);
    for (var i = 0; i < STAR_COUNT; i++) {
      var r     = 120 + Math.random() * 200;
      var theta = Math.random() * Math.PI * 2;
      var phi   = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    starfield = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.35,
      transparent: true, opacity: 0.75,
      sizeAttenuation: true, depthWrite: false
    }));
    scene.add(starfield);
  }


  // ═══════════════════════════════════════════════════════════
  //  HEART-SHAPED PLANET (ExtrudeGeometry)
  // ═══════════════════════════════════════════════════════════
  function buildHeartPlanet() {
    // Parametric heart → THREE.Shape
    var shape = new THREE.Shape();
    var sc = 0.7;        // controls overall heart size
    var N  = 120;        // curve resolution

    for (var i = 0; i <= N; i++) {
      var t  = (i / N) * Math.PI * 2;
      var st = Math.sin(t);
      var hx = 16 * st * st * st * sc;
      var hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) -
                 2 * Math.cos(3 * t) - Math.cos(4 * t)) * sc;
      if (i === 0) shape.moveTo(hx, hy);
      else shape.lineTo(hx, hy);
    }

    var geo = new THREE.ExtrudeGeometry(shape, {
      depth:         6,
      bevelEnabled:  true,
      bevelThickness:3.5,
      bevelSize:     2.5,
      bevelSegments: 14,
      curveSegments: 48
    });
    geo.center();

    var mat = new THREE.MeshStandardMaterial({
      color:            0xff69b4,
      emissive:         0x8b0040,
      emissiveIntensity:0.6,
      roughness:        0.22,
      metalness:        0.12
    });

    heartPlanet = new THREE.Mesh(geo, mat);
    heartPlanet.scale.set(0.01, 0.01, 0.01);   // start tiny for intro
    scene.add(heartPlanet);

    // Soft sphere glow behind the heart (additive)
    var glowGeo = new THREE.SphereGeometry(16, 32, 32);
    heartGlow   = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
      color: 0xff69b4, transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    heartGlow.scale.set(0.01, 0.01, 0.01);
    scene.add(heartGlow);
  }


  // ═══════════════════════════════════════════════════════════
  //  ATMOSPHERE (Fresnel rim-glow shader)
  // ═══════════════════════════════════════════════════════════
  function buildAtmosphere() {
    var vShader = [
      'varying vec3 vNormal;',
      'void main() {',
      '  vNormal = normalize(normalMatrix * normal);',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
      '}'
    ].join('\n');

    var fShader = [
      'varying vec3 vNormal;',
      'void main() {',
      '  float intensity = pow(0.62 - dot(vNormal, vec3(0.0,0.0,1.0)), 2.0);',
      '  gl_FragColor = vec4(1.0, 0.42, 0.72, 1.0) * intensity;',
      '}'
    ].join('\n');

    var geo = new THREE.SphereGeometry(17, 64, 64);
    var atm = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader:   vShader,
      fragmentShader: fShader,
      transparent:    true,
      side:           THREE.FrontSide,
      blending:       THREE.AdditiveBlending,
      depthWrite:     false
    }));
    atm.scale.set(0.01, 0.01, 0.01);
    heartPlanet.userData.atmosphere = atm;
    scene.add(atm);
  }


  // ═══════════════════════════════════════════════════════════
  //  PHOTO RING — 16 Polaroid Frames in Torus Orbit
  // ═══════════════════════════════════════════════════════════
  // ── Custom image loader (works with file:// and http://) ──────────
  function loadImageTexture(path, onSuccess, onError) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var tex = new THREE.CanvasTexture(canvas);
      tex.image = img;   // keep reference so width/height readable
      onSuccess(tex);
    };
    img.onerror = function (e) {
      console.error('[Scene3D] Failed to load image:', path, e);
      if (typeof onError === 'function') onError(e);
    };
    img.src = path;
  }

  function buildPhotoRing() {
    ringGroup = new THREE.Group();

    for (var i = 0; i < PHOTO_COUNT; i++) {
      // ── Semi-random torus distribution ────────────────────
      var baseAngle  = (i / PHOTO_COUNT) * Math.PI * 2;
      var theta      = baseAngle + (Math.random() - 0.5) * (Math.PI * 2 / PHOTO_COUNT) * 0.55;
      var yOffset    = (Math.random() - 0.5) * 9;
      var radiusJitter = RING_RADIUS + (Math.random() - 0.5) * 10;

      // ── White polaroid frame ─────────────────────────────
      var frameGeo = new THREE.PlaneGeometry(FRAME_W, FRAME_H);
      var frameMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      var frame    = new THREE.Mesh(frameGeo, frameMat);

      frame.position.set(
        Math.cos(theta) * radiusJitter,
        yOffset,
        Math.sin(theta) * radiusJitter
      );

      // Face outward from center
      frame.rotation.y = Math.PI / 2 - theta;
      // Organic tilt
      frame.rotation.z = (Math.random() - 0.5) * 0.18;
      frame.rotation.x = (Math.random() - 0.5) * 0.10;

      // Bobbing metadata
      frame.userData.index     = i;
      frame.userData.baseY     = yOffset;
      frame.userData.bobSpeed  = 0.7 + Math.random() * 0.7;
      frame.userData.bobAmount = 0.6 + Math.random() * 1.4;

      // ── Photo texture (via custom loader — works with file:// too) ──
      var photoPath = PHOTO_PATHS[i % PHOTO_PATHS.length];
      ;(function (parentFrame, path) {
        loadImageTexture(path, function (tex) {
          // Read actual image dimensions to preserve aspect ratio
          var imgW   = tex.image.naturalWidth  || tex.image.width  || 1;
          var imgH   = tex.image.naturalHeight || tex.image.height || 1;
          var aspect = imgW / imgH;

          // Max photo area inside the polaroid frame
          var maxW = FRAME_W * PHOTO_RATIO;          // 5.33
          var maxH = (FRAME_H - 1.2) * PHOTO_RATIO;  // ~5.58 (leave bottom space for polaroid feel)

          var pw, ph;
          if (aspect >= maxW / maxH) {
            // Landscape or square — width is the constraint
            pw = maxW;
            ph = maxW / aspect;
          } else {
            // Portrait — height is the constraint
            ph = maxH;
            pw = maxH * aspect;
          }

          var photoMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(pw, ph),
            new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
          );
          // Center vertically within the frame, slightly above center
          photoMesh.position.set(0, (FRAME_H - ph) / 2 - 0.4, 0.02);
          parentFrame.add(photoMesh);
        }, function () {
          // Graceful fallback — pink placeholder
          var pw = FRAME_W * PHOTO_RATIO;
          var ph = (FRAME_H - 1.2) * PHOTO_RATIO;
          var placeholderMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(pw, ph),
            new THREE.MeshBasicMaterial({ color: 0xfce4ec, side: THREE.DoubleSide })
          );
          placeholderMesh.position.set(0, (FRAME_H - ph) / 2 - 0.4, 0.02);
          parentFrame.add(placeholderMesh);
        });
      })(frame, photoPath);

      clickableFrames.push(frame);
      ringGroup.add(frame);
    }

    // Tilt the whole ring like Saturn's
    ringGroup.rotation.x = Math.PI / 5.5;
    ringGroup.scale.set(0.01, 0.01, 0.01);
    scene.add(ringGroup);
  }


  // ═══════════════════════════════════════════════════════════
  //  ORBITING SPARKLES (torus-distributed particles)
  // ═══════════════════════════════════════════════════════════
  function buildSparkles() {
    var positions = new Float32Array(SPARKLE_COUNT * 3);
    var torusR = 32, tubeR = 8;

    for (var i = 0; i < SPARKLE_COUNT; i++) {
      var theta = Math.random() * Math.PI * 2;
      var phi   = Math.random() * Math.PI * 2;
      positions[i * 3]     = (torusR + tubeR * Math.cos(phi)) * Math.cos(theta);
      positions[i * 3 + 1] = tubeR * Math.sin(phi);
      positions[i * 3 + 2] = (torusR + tubeR * Math.cos(phi)) * Math.sin(theta);
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    sparkles = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffccdd, size: 0.45,
      transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false, sizeAttenuation: true
    }));
    scene.add(sparkles);
  }


  // ═══════════════════════════════════════════════════════════
  //  RAYCASTER — Click a Photo to Zoom
  // ═══════════════════════════════════════════════════════════
  function onCanvasClick(evt) {
    if (isAnimating || !canvas || canvas.style.display === 'none') return;

    // ★ If the pointer moved significantly, this was a drag (rotation),
    //   not a click — ignore it so we don't accidentally zoom.
    if (wasDragged) { wasDragged = false; return; }

    // If already zoomed, clicking anywhere (except Back btn) zooms out
    if (isZoomed) return;

    // Normalised device coords
    var rect = canvas.getBoundingClientRect();
    mouseVec.x =  ((evt.clientX - rect.left) / rect.width)  * 2 - 1;
    mouseVec.y = -((evt.clientY - rect.top)  / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouseVec, camera);

    // Test against frame meshes and their children (photo planes)
    var hits = raycaster.intersectObjects(ringGroup.children, true);
    if (hits.length === 0) return;

    // Walk up to the frame-level mesh
    var obj = hits[0].object;
    while (obj.parent && obj.parent !== ringGroup) obj = obj.parent;
    if (clickableFrames.indexOf(obj) === -1) return;

    zoomToFrame(obj);
  }


  // ═══════════════════════════════════════════════════════════
  //  CAMERA ZOOM — In / Out
  // ═══════════════════════════════════════════════════════════
  function zoomToFrame(frame) {
    if (isZoomed || isAnimating) return;
    isAnimating = true;
    isZoomed    = true;

    // Disable orbit controls during zoom
    if (controls) controls.enabled = false;

    // World position & orientation of the clicked frame
    var worldPos  = new THREE.Vector3();
    var worldQuat = new THREE.Quaternion();
    frame.getWorldPosition(worldPos);
    frame.getWorldQuaternion(worldQuat);

    // Frame's outward normal (local +Z in world space)
    var normal = new THREE.Vector3(0, 0, 1).applyQuaternion(worldQuat).normalize();

    // Camera target = in front of the frame
    var camTarget = worldPos.clone().add(normal.clone().multiplyScalar(ZOOM_DIST));

    // Smoothly animate camera position
    gsap.to(camera.position, {
      x: camTarget.x, y: camTarget.y, z: camTarget.z,
      duration: 1.8, ease: 'power2.inOut',
      onComplete: function () { isAnimating = false; }
    });

    // Smoothly animate lookAt target
    gsap.to(camLook, {
      x: worldPos.x, y: worldPos.y, z: worldPos.z,
      duration: 1.8, ease: 'power2.inOut'
    });

    // Show Back button, hide discover overlay
    if (backBtn)         backBtn.classList.remove('hidden');
    if (discoverOverlay) gsap.to(discoverOverlay, { opacity: 0, duration: 0.4, pointerEvents: 'none' });
  }

  function zoomOut() {
    if (!isZoomed || isAnimating) return;
    isAnimating = true;

    gsap.to(camera.position, {
      x: origCamPos.x, y: origCamPos.y, z: origCamPos.z,
      duration: 1.8, ease: 'power2.inOut',
      onComplete: function () {
        isAnimating = false;
        isZoomed    = false;

        // Re-enable orbit controls and sync their internal state
        if (controls) {
          controls.target.set(0, 0, 0);
          controls.update();
          controls.enabled = true;
        }
      }
    });

    gsap.to(camLook, {
      x: 0, y: 0, z: 0,
      duration: 1.8, ease: 'power2.inOut'
    });

    if (backBtn)         backBtn.classList.add('hidden');
    if (discoverOverlay) gsap.to(discoverOverlay, { opacity: 1, duration: 0.6, delay: 1, pointerEvents: 'auto' });
  }


  // ═══════════════════════════════════════════════════════════
  //  RENDER LOOP
  // ═══════════════════════════════════════════════════════════
  function animate() {
    animId = requestAnimationFrame(animate);
    var elapsed = clock.getElapsedTime();

    // ── OrbitControls or manual lookAt ──────────────────────
    //    When controls are enabled, they handle camera orientation.
    //    When disabled (zoomed / onboarding), we use manual lookAt.
    if (controls && controls.enabled) {
      controls.update();
    } else {
      camera.lookAt(camLook.x, camLook.y, camLook.z);
    }

    // ── Heart rotation + beating ───────────────────────────
    if (heartPlanet) {
      heartPlanet.rotation.y += 0.003;

      // Beat only after intro animation finishes
      if (introDone) {
        var beat = 1 + Math.pow(Math.sin(elapsed * 2.5), 4) * 0.045;
        heartPlanet.scale.set(beat, beat, beat);
        if (heartGlow) heartGlow.scale.set(beat * 1.05, beat * 1.05, beat * 1.05);
        var atm = heartPlanet.userData.atmosphere;
        if (atm) atm.scale.set(beat * 1.12, beat * 1.12, beat * 1.12);
      }

      // Atmosphere follows rotation
      if (heartPlanet.userData.atmosphere) {
        heartPlanet.userData.atmosphere.rotation.y = heartPlanet.rotation.y;
      }
    }

    if (heartGlow) heartGlow.rotation.y += 0.002;

    // ── Ring rotation (paused when zoomed) ─────────────────
    if (ringGroup && !isZoomed) {
      ringGroup.rotation.y += 0.0015;
    }

    // ── Per-frame bobbing ─────────────────────────────────
    if (ringGroup) {
      for (var i = 0; i < ringGroup.children.length; i++) {
        var f = ringGroup.children[i];
        f.position.y = f.userData.baseY +
          Math.sin(elapsed * f.userData.bobSpeed + f.userData.index * 0.7) * f.userData.bobAmount;
      }
    }

    // ── Sparkles rotation ─────────────────────────────────
    if (sparkles) {
      sparkles.rotation.y += 0.0008;
      sparkles.rotation.x += 0.0002;
    }

    // ── Starfield rotation ────────────────────────────────
    if (starfield) starfield.rotation.y += 0.00008;

    renderer.render(scene, camera);
  }


  // ═══════════════════════════════════════════════════════════
  //  RESIZE
  // ═══════════════════════════════════════════════════════════
  function onResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }


  // ═══════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════

  /** Reveal canvas, start rendering, play intro animations. */
  function start() {
    canvas.style.display       = 'block';
    canvas.style.opacity       = '1';
    canvas.style.pointerEvents = 'auto';

    introDone = false;
    animate();

    // Heart + glow + atmosphere scale up
    gsap.to(heartPlanet.scale, {
      x: 1, y: 1, z: 1, duration: 2.5, ease: 'back.out(1.5)',
      onComplete: function () { introDone = true; }
    });
    gsap.to(heartGlow.scale, {
      x: 1, y: 1, z: 1, duration: 2.5, ease: 'back.out(1.5)'
    });
    if (heartPlanet.userData.atmosphere) {
      gsap.to(heartPlanet.userData.atmosphere.scale, {
        x: 1, y: 1, z: 1, duration: 2.5, ease: 'back.out(1.5)'
      });
    }

    // Ring scales up with delay
    gsap.to(ringGroup.scale, {
      x: 1, y: 1, z: 1, duration: 3, delay: 0.6, ease: 'power3.out'
    });
  }

  /** Cancel the render loop. */
  function stop() {
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  }

  /** Fade the canvas out, then stop and hide it. */
  function fadeOut(callback) {
    if (controls) controls.enabled = false;

    gsap.to(canvas, {
      opacity: 0, duration: 1.5,
      onComplete: function () {
        stop();
        canvas.style.display       = 'none';
        canvas.style.pointerEvents = 'none';
        if (typeof callback === 'function') callback();
      }
    });
  }

  /** Enable OrbitControls (called after onboarding dismissal). */
  function enableControls() {
    if (controls && !isZoomed) {
      controls.target.set(0, 0, 0);
      controls.update();
      controls.enabled = true;
    }
  }

  /** Disable OrbitControls. */
  function disableControls() {
    if (controls) controls.enabled = false;
  }


  // ═══════════════════════════════════════════════════════════
  //  BOOTSTRAP
  // ═══════════════════════════════════════════════════════════
  init();

  window.Scene3D = {
    start:           start,
    stop:            stop,
    fadeOut:          fadeOut,
    zoomOut:         zoomOut,
    enableControls:  enableControls,
    disableControls: disableControls
  };

})();
