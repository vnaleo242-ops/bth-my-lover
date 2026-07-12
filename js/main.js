/* ╔══════════════════════════════════════════════════════════════╗
   ║  MAIN ORCHESTRATOR — Stage Transitions, UI Logic, Audio     ║
   ║                                                              ║
   ║  Coordinates:                                                ║
   ║    • Stage 1 → particles.js  (ParticleHeart)                ║
   ║    • Stage 2 → scene3d.js    (Scene3D)                      ║
   ║    • Stage 3 → Confetti, floating hearts, scroll reveal     ║
   ╚══════════════════════════════════════════════════════════════╝ */

(function () {
  'use strict';

  // ── DOM REFERENCES ────────────────────────────────────────────
  var stage1      = document.getElementById('stage-1');
  var stage2      = document.getElementById('stage-2');
  var stage3      = document.getElementById('stage-3');
  var btnYes      = document.getElementById('btn-yes');
  var btnNo       = document.getElementById('btn-no');
  var btnDiscover = document.getElementById('btn-discover');
  var heroCta     = document.getElementById('hero-cta');
  var letterSec   = document.getElementById('letter');
  var playerEl    = document.getElementById('music-player');
  var toggleBtn   = document.getElementById('music-toggle');
  var audioEl     = document.getElementById('bg-music');
  var onboardingEl = document.getElementById('onboarding-modal');
  var onboardDismiss = document.getElementById('btn-onboarding-dismiss');

  var musicPlaying = false;


  // ╔════════════════════════════════════════════════════════════╗
  // ║  STAGE 1 — THE GATEKEEPER                                ║
  // ╚════════════════════════════════════════════════════════════╝

  // Start the particle heart immediately
  if (window.ParticleHeart) {
    window.ParticleHeart.start();
  }


  // ── "KHÔNG" BUTTON — CLICK/TAP TO MOVE ─────────────────────────
  //
  //  Starts next to "Có" inside the modal. On click/tap, moves out
  //  to body level and jumps to a random visible position.
  // ─────────────────────────────────────────────────────────────

  if (btnNo) {
    var noButtonMoved = false;

    function moveNoButton() {
      if (!stage1 || !stage1.classList.contains('active')) return;

      // On first click, move button out of modal to body so it's never clipped
      if (!noButtonMoved) {
        document.body.appendChild(btnNo);
        btnNo.style.position = 'fixed';
        btnNo.style.zIndex   = '99999';
        noButtonMoved = true;
      }

      var pad  = 40;
      var btnW = btnNo.offsetWidth  || 100;
      var btnH = btnNo.offsetHeight || 45;
      var maxX = window.innerWidth  - btnW - pad;
      var maxY = window.innerHeight - btnH - pad;

      var newX = pad + Math.floor(Math.random() * Math.max(1, maxX - pad));
      var newY = pad + Math.floor(Math.random() * Math.max(1, maxY - pad));

      btnNo.style.left       = newX + 'px';
      btnNo.style.top        = newY + 'px';
      btnNo.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
    }

    // Desktop: move on click
    btnNo.addEventListener('click', function (e) {
      e.preventDefault();
      moveNoButton();
    });

    // Mobile: move on tap
    btnNo.addEventListener('touchstart', function (e) {
      e.preventDefault();
      moveNoButton();
    }, { passive: false });
  }


  // ── STAGE 1 → STAGE 2 TRANSITION ─────────────────────────────

  if (btnYes) {
    btnYes.addEventListener('click', function () {
      // Start music on first interaction (bypasses autoplay block)
      startMusic();
      
      // Hide the "Không" button if it was moved to body
      if (btnNo) {
        btnNo.style.display = 'none';
      }

      // Fade out particle heart
      if (window.ParticleHeart) {
        window.ParticleHeart.fadeOut(function () {
          // Particle canvas is now fully transparent & stopped
        });
      }

      // Fade out Stage 1 UI
      stage1.classList.remove('active');

      // After Stage 1 fades, bring in Stage 2 + Heart Planet
      setTimeout(function () {
        stage2.classList.add('active');

        // Start the 3D heart planet scene
        if (window.Scene3D) {
          window.Scene3D.start();
        }

        // Show onboarding modal after planet appears
        if (onboardingEl) {
          setTimeout(function () {
            onboardingEl.classList.add('visible');
          }, 800);
        }
      }, 1200);
    });
  }


  // ╔════════════════════════════════════════════════════════════╗
  // ║  ONBOARDING DISMISS                                       ║
  // ╚════════════════════════════════════════════════════════════╝

  if (onboardDismiss) {
    onboardDismiss.addEventListener('click', function () {
      if (!onboardingEl) return;

      // Play dismissal animation
      onboardingEl.classList.add('dismissing');
      onboardingEl.classList.remove('visible');

      // After the CSS fade-out completes, clean up and enable controls
      setTimeout(function () {
        onboardingEl.style.display = 'none';

        // Enable orbit controls now that the user is ready
        if (window.Scene3D && window.Scene3D.enableControls) {
          window.Scene3D.enableControls();
        }
      }, 650);
    });
  }


  // ╔════════════════════════════════════════════════════════════╗
  // ║  STAGE 2 → STAGE 3 TRANSITION                            ║
  // ╚════════════════════════════════════════════════════════════╝

  if (btnDiscover) {
    btnDiscover.addEventListener('click', function () {
      // Fade out Stage 2 UI
      stage2.classList.remove('active');

      // Fade out 3D scene
      if (window.Scene3D) {
        window.Scene3D.fadeOut(function () {
          // Canvas hidden, rendering stopped
        });
      }

      // After fade, show Stage 3
      setTimeout(function () {
        // Change body background to cream for Stage 3
        document.body.style.background = '#fffbf7';

        stage3.classList.add('active');
        window.scrollTo(0, 0);

        // Fire confetti celebration 🎉
        launchCelebration();
        createFloatingHearts();
      }, 1500);
    });
  }


  // ╔════════════════════════════════════════════════════════════╗
  // ║  AUDIO PLAYER                                             ║
  // ╚════════════════════════════════════════════════════════════╝

  function startMusic() {
    if (!audioEl || musicPlaying) return;
    var p = audioEl.play();
    if (p !== undefined) {
      p.then(function () {
        musicPlaying = true;
        playerEl.setAttribute('data-playing', 'true');
        playerEl.classList.add('visible');
      }).catch(function () {
        // Autoplay blocked — show player so user can manually start
        playerEl.classList.add('visible');
      });
    }
  }

  if (toggleBtn && audioEl) {
    toggleBtn.addEventListener('click', function () {
      if (musicPlaying) {
        audioEl.pause();
        playerEl.setAttribute('data-playing', 'false');
        musicPlaying = false;
      } else {
        audioEl.play().then(function () {
          playerEl.setAttribute('data-playing', 'true');
          musicPlaying = true;
        }).catch(function () {});
      }
    });
  }


  // ╔════════════════════════════════════════════════════════════╗
  // ║  STAGE 3 EFFECTS                                          ║
  // ╚════════════════════════════════════════════════════════════╝

  // ── CONFETTI ──────────────────────────────────────────────────

  function launchCelebration() {
    if (typeof confetti !== 'function') return;

    var colors = ['#f06292', '#ec407a', '#f48fb1', '#fce4ec', '#e91e63', '#ff80ab', '#f8bbd0'];

    // Initial burst
    confetti({ particleCount: 80, spread: 90, startVelocity: 35, origin: { y: 0.6 }, colors: colors, ticks: 300 });
    confetti({ particleCount: 30, spread: 120, startVelocity: 25, origin: { y: 0.5 }, colors: colors, shapes: ['circle'], scalar: 1.2, ticks: 250 });

    // Continuous side-cannons for 4.5 seconds
    var end = Date.now() + 4500;
    var interval = setInterval(function () {
      if (Date.now() > end) { clearInterval(interval); return; }
      confetti({ particleCount: 3, angle: 60, spread: 55, startVelocity: 30, origin: { x: 0, y: 0.5 }, colors: colors, ticks: 200 });
      confetti({ particleCount: 3, angle: 120, spread: 55, startVelocity: 30, origin: { x: 1, y: 0.5 }, colors: colors, ticks: 200 });
    }, 250);
  }


  // ── FLOATING HEARTS ───────────────────────────────────────────

  function createFloatingHearts() {
    var heroEl = document.getElementById('hero');
    if (!heroEl) return;

    var symbols = ['❤', '💕', '💖', '💗', '✨', '🌸'];

    // Inject keyframes once
    if (!document.getElementById('heart-rise-kf')) {
      var s = document.createElement('style');
      s.id = 'heart-rise-kf';
      s.textContent = '@keyframes heart-rise{0%{opacity:0;transform:translateY(0) rotate(0) scale(.5)}10%{opacity:.7}90%{opacity:.3}100%{opacity:0;transform:translateY(-100vh) rotate(360deg) scale(1)}}';
      document.head.appendChild(s);
    }

    for (var i = 0; i < 15; i++) {
      var el = document.createElement('span');
      el.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText =
        'position:absolute;pointer-events:none;z-index:1;opacity:0;' +
        'font-size:' + (Math.random() * 1.2 + 0.6) + 'rem;' +
        'left:' + (Math.random() * 100) + '%;' +
        'bottom:-30px;' +
        'animation:heart-rise ' + (Math.random() * 4 + 6) + 's ease-in ' + (Math.random() * 3) + 's infinite;';
      heroEl.appendChild(el);
    }
  }


  // ── SCROLL REVEAL ─────────────────────────────────────────────

  function initScrollReveal() {
    var els = document.querySelectorAll('[data-reveal]');
    if (!els.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    els.forEach(function (el) { observer.observe(el); });
  }

  initScrollReveal();


  // ── HERO CTA SCROLL ───────────────────────────────────────────

  if (heroCta && letterSec) {
    heroCta.addEventListener('click', function () {
      letterSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (typeof confetti === 'function') {
        confetti({ particleCount: 50, spread: 70, startVelocity: 25, origin: { y: 0.8 }, colors: ['#f06292', '#ec407a', '#f48fb1', '#fce4ec', '#ff80ab'], ticks: 200 });
      }
    });
  }

})();
