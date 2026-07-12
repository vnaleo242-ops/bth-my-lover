/**
 * ParticleHeart — High-performance Canvas 2D particle system.
 *
 * Renders a beating heart shape assembled from glowing particles that
 * stream in from the screen edges, settle on the heart perimeter,
 * pulse, then fade and recycle. Ambient sparkles add atmosphere.
 *
 * API:  window.ParticleHeart.start()
 *       window.ParticleHeart.stop()
 *       window.ParticleHeart.fadeOut(callback)
 *
 * Zero external dependencies. Uses an object pool and pre-rendered
 * glow textures for minimal per-frame allocation.
 */
;(function () {
  'use strict';

  // ── Constants / Config ───────────────────────────────────────────
  var POOL_SIZE          = 2500;   // max simultaneous particles
  var HEART_POINTS       = 200;    // target points on the heart curve
  var SPAWN_MIN          = 5;      // particles spawned per frame (min)
  var SPAWN_MAX          = 8;      //                              (max)
  var SPARKLE_COUNT      = 80;     // ambient background sparkles
  var FADE_OUT_DURATION  = 1500;   // ms for the fadeOut transition

  // Particle state enum
  var STATE_INACTIVE  = 0;
  var STATE_TRAVELING = 1;
  var STATE_ARRIVED   = 2;
  var STATE_FADING    = 3;

  // ── Module-level references ──────────────────────────────────────
  var canvas, ctx;
  var W, H;                        // current canvas dimensions
  var animId = null;               // requestAnimationFrame handle
  var running = false;
  var time = 0;                    // monotonic frame counter

  // Heart geometry (recalculated on resize)
  var heartTargets = [];           // [{x, y}, …]  — unscaled offsets from center
  var heartScale   = 1;
  var centerX, centerY;

  // Particle pool (flat array, never reallocated)
  var pool = new Array(POOL_SIZE);

  // Ambient sparkles
  var sparkles = new Array(SPARKLE_COUNT);

  // Pre-rendered glow textures (offscreen canvases)
  var glowSmall = null;   // for traveling / fading particles
  var glowLarge = null;   // bloom halo for arrived particles

  // Fade-out state
  var fadingOut       = false;
  var fadeStartTime   = 0;
  var fadeCallback    = null;
  var globalAlpha     = 1;

  // ── Heart parametric equation ────────────────────────────────────
  /**
   * Classic parametric heart:
   *   x =  16 sin³(t)
   *   y = -(13 cos(t) − 5 cos(2t) − 2 cos(3t) − cos(4t))
   *
   * We pre-compute HEART_POINTS points evenly spaced in t ∈ [0, 2π)
   * as unit offsets (before scaling).
   */
  function buildHeartPoints() {
    heartTargets.length = 0;
    var step = (Math.PI * 2) / HEART_POINTS;
    for (var i = 0; i < HEART_POINTS; i++) {
      var t  = i * step;
      var st = Math.sin(t);
      var hx = 16 * st * st * st;
      var hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) -
                  2 * Math.cos(3 * t) - Math.cos(4 * t));
      heartTargets.push({ x: hx, y: hy });
    }
  }

  // ── Pre-rendered glow textures ───────────────────────────────────
  /**
   * Render a soft radial glow to an offscreen canvas so we can stamp
   * it with drawImage() instead of calling createRadialGradient every
   * frame for every particle.
   *
   * @param {number} radius  — outer radius in pixels
   * @returns {HTMLCanvasElement}
   */
  function makeGlowTexture(radius) {
    var size = Math.ceil(radius * 2);
    var c    = document.createElement('canvas');
    c.width  = size;
    c.height = size;
    var g    = c.getContext('2d');
    var grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
    // White center → transparent edge.  Colour is applied at draw-time
    // via globalCompositeOperation + fillStyle tinting on the main canvas.
    grad.addColorStop(0,   'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  function rebuildGlowTextures() {
    // Small glow: radius 8px covers max particle size ~3.5 * 2 + margin
    glowSmall = makeGlowTexture(8);
    // Large bloom: radius 24px for the arrived halo
    glowLarge = makeGlowTexture(24);
  }

  // ── Resize handler ───────────────────────────────────────────────
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W;
    canvas.height = H;
    centerX = W * 0.5;
    centerY = H * 0.5;
    heartScale = Math.min(W, H) * 0.025;

    // Re-scatter sparkles across the new viewport
    initSparkles();
  }

  // ── Sparkles ─────────────────────────────────────────────────────
  function initSparkles() {
    for (var i = 0; i < SPARKLE_COUNT; i++) {
      sparkles[i] = {
        x:     Math.random() * W,
        y:     Math.random() * H,
        size:  0.5 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.008 + Math.random() * 0.015
      };
    }
  }

  // ── Object pool initialisation ───────────────────────────────────
  function initPool() {
    for (var i = 0; i < POOL_SIZE; i++) {
      pool[i] = {
        x: 0, y: 0,
        targetX: 0, targetY: 0,
        startX: 0, startY: 0,
        vx: 0, vy: 0,
        size: 2,
        opacity: 0,
        hue: 340,
        progress: 0,
        state: STATE_INACTIVE,
        lifetime: 0,      // frames to stay ARRIVED
        age: 0,            // frames spent in ARRIVED
        glowTimer: 0
      };
    }
  }

  // ── Spawn a single particle ──────────────────────────────────────
  function spawnParticle(p) {
    // Pick a random target on the heart
    var idx = (Math.random() * HEART_POINTS) | 0;
    var ht  = heartTargets[idx];

    p.targetX = ht.x;  // unscaled — we apply scale + beat at render time
    p.targetY = ht.y;

    // Emitter: left or right edge, random Y
    if (Math.random() < 0.5) {
      p.startX = -20;
    } else {
      p.startX = W + 20;
    }
    p.startY = Math.random() * H;

    p.x = p.startX;
    p.y = p.startY;
    p.progress = 0;
    p.opacity  = 0;
    p.state    = STATE_TRAVELING;

    // Visual variety
    p.size = 1.5 + Math.random() * 2;               // 1.5 – 3.5 px
    p.hue  = 330 + Math.random() * 20;               // 330 – 350
    p.lifetime = 60 + (Math.random() * 60) | 0;      // 60 – 120 frames
    p.age  = 0;
    p.glowTimer = Math.random() * Math.PI * 2;
  }

  // ── Per-frame update ─────────────────────────────────────────────
  function update() {
    time++;

    // Beat factor — subtle rhythmic pulse applied to the heart scale
    var sinVal = Math.sin(time * 0.04167);            // ~2.5 rad/s at 60 fps
    var beat   = 1 + Math.pow(sinVal * sinVal, 2) * 0.06;  // sin⁴ * 0.06

    var effectiveScale = heartScale * beat;

    // ── Spawn new particles (unless we're fading out) ──────────────
    if (!fadingOut) {
      var toSpawn = SPAWN_MIN + ((Math.random() * (SPAWN_MAX - SPAWN_MIN + 1)) | 0);
      for (var s = 0; s < toSpawn; s++) {
        // Find an inactive slot
        for (var j = 0; j < POOL_SIZE; j++) {
          if (pool[j].state === STATE_INACTIVE) {
            spawnParticle(pool[j]);
            break;
          }
        }
      }
    }

    // ── Update each particle ───────────────────────────────────────
    for (var i = 0; i < POOL_SIZE; i++) {
      var p = pool[i];
      if (p.state === STATE_INACTIVE) continue;

      if (p.state === STATE_TRAVELING) {
        // Advance progress
        p.progress += 0.003 + Math.random() * 0.004;
        if (p.progress > 1) p.progress = 1;

        // Cubic ease-out
        var inv = 1 - p.progress;
        var ease = 1 - inv * inv * inv;

        // Effective target with beat
        var tx = centerX + p.targetX * effectiveScale;
        var ty = centerY + p.targetY * effectiveScale;

        p.x = p.startX + (tx - p.startX) * ease;
        p.y = p.startY + (ty - p.startY) * ease;

        // Opacity ramps up during travel
        p.opacity = p.progress * 3;
        if (p.opacity > 1) p.opacity = 1;

        // Transition when arrived
        if (p.progress >= 1) {
          p.state = STATE_ARRIVED;
          p.age   = 0;
        }

      } else if (p.state === STATE_ARRIVED) {
        // Sit on target, applying the current beat offset
        p.x = centerX + p.targetX * effectiveScale;
        p.y = centerY + p.targetY * effectiveScale;

        // Pulse opacity between 0.8 and 1.0
        p.glowTimer += 0.1;
        p.opacity = 0.9 + 0.1 * Math.sin(p.glowTimer);

        p.age++;
        if (p.age >= p.lifetime) {
          p.state = STATE_FADING;
        }

      } else if (p.state === STATE_FADING) {
        // Keep following beat while fading
        p.x = centerX + p.targetX * effectiveScale;
        p.y = centerY + p.targetY * effectiveScale;

        p.opacity -= 0.015;
        if (p.opacity <= 0) {
          p.opacity = 0;
          p.state = STATE_INACTIVE;
        }
      }
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, W, H);

    // Apply global fade-out alpha if active
    ctx.globalAlpha = globalAlpha;

    // ── Ambient sparkles ───────────────────────────────────────────
    ctx.globalCompositeOperation = 'lighter';
    for (var s = 0; s < SPARKLE_COUNT; s++) {
      var sp  = sparkles[s];
      // Twinkle: slow sine oscillation
      var sop = (Math.sin(sp.phase + time * sp.speed) * 0.5 + 0.5) * 0.4;
      if (sop < 0.01) continue;

      ctx.globalAlpha = globalAlpha * sop;
      ctx.drawImage(
        glowSmall,
        sp.x - 8, sp.y - 8   // center the 16×16 texture
      );
    }

    // ── Particles ──────────────────────────────────────────────────
    ctx.globalCompositeOperation = 'lighter';

    for (var i = 0; i < POOL_SIZE; i++) {
      var p = pool[i];
      if (p.state === STATE_INACTIVE || p.opacity <= 0) continue;

      var alpha = p.opacity * globalAlpha;
      if (alpha < 0.005) continue;

      // Tint colour in HSL
      var hsl = 'hsl(' + (p.hue | 0) + ',90%,70%)';

      // ── Arrived bloom halo ───────────────────────────────────────
      if (p.state === STATE_ARRIVED) {
        ctx.globalAlpha = alpha * 0.18;
        ctx.drawImage(
          glowLarge,
          p.x - 24, p.y - 24  // center the 48×48 texture
        );
      }

      // ── Core glow dot ───────────────────────────────────────────
      ctx.globalAlpha = alpha;

      // We tint the white glow texture by drawing a coloured rect
      // behind it with 'destination-over', but that would be costly.
      // Instead we draw a tiny coloured circle then stamp the glow
      // texture on top with 'lighter', which naturally tints it.

      // Coloured core circle
      ctx.fillStyle = hsl;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Soft glow stamp (additive on top → creates pinkish-white bloom)
      ctx.globalAlpha = alpha * 0.55;
      var texHalf = 8;  // half-size of glowSmall texture
      // Scale the stamp to match particle size
      var stampSize = p.size * 2.5;
      ctx.drawImage(
        glowSmall,
        p.x - stampSize, p.y - stampSize,
        stampSize * 2, stampSize * 2
      );
    }

    // Reset composite mode
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ── Main loop ────────────────────────────────────────────────────
  function loop() {
    if (!running) return;

    // Handle fade-out transition
    if (fadingOut) {
      var elapsed = Date.now() - fadeStartTime;
      globalAlpha = 1 - (elapsed / FADE_OUT_DURATION);
      if (globalAlpha <= 0) {
        globalAlpha = 0;
        running = false;
        ctx.clearRect(0, 0, W, H);
        if (fadeCallback) {
          var cb = fadeCallback;
          fadeCallback = null;
          cb();
        }
        return;
      }
    }

    update();
    render();
    animId = requestAnimationFrame(loop);
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Start the particle system. Safe to call multiple times — subsequent
   * calls are no-ops if already running.
   */
  function start() {
    if (running) return;

    canvas = document.getElementById('particle-canvas');
    if (!canvas) {
      console.error('[ParticleHeart] Canvas #particle-canvas not found.');
      return;
    }
    ctx = canvas.getContext('2d');

    // Build geometry & assets
    buildHeartPoints();
    rebuildGlowTextures();
    initPool();
    resize();

    // Listen for viewport changes
    window.addEventListener('resize', resize);

    // Reset state
    running     = true;
    fadingOut   = false;
    globalAlpha = 1;
    time        = 0;

    animId = requestAnimationFrame(loop);
  }

  /**
   * Immediately stop the render loop and clear the canvas.
   */
  function stop() {
    running = false;
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (ctx) ctx.clearRect(0, 0, W, H);
    window.removeEventListener('resize', resize);
  }

  /**
   * Gracefully fade the entire canvas to transparent, then invoke the
   * callback. New particles stop spawning immediately.
   *
   * @param {Function} [callback] — called once fully faded out.
   */
  function fadeOut(callback) {
    if (fadingOut) return;
    fadingOut     = true;
    fadeStartTime = Date.now();
    fadeCallback  = callback || null;
  }

  // ── Expose on window ─────────────────────────────────────────────
  window.ParticleHeart = {
    start:   start,
    stop:    stop,
    fadeOut: fadeOut
  };

})();
