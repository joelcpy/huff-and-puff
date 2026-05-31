const W  = 400;
// Match the canvas aspect ratio to the *visible* viewport at load so the game
// fills the screen with no letterbox bars. Using innerHeight (not screen.height)
// keeps the canvas within the area the browser actually shows, so nothing is
// hidden behind the address bar. On load the address bar is visible (smallest
// viewport); afterwards the height only grows, so Math.min scaling stays
// width-locked and the canvas never jumps when the bar hides.
const H  = Math.max(600, Math.round(W * window.innerHeight / window.innerWidth));
const PY = Math.round((H - 600) / 2);

// ─── App ─────────────────────────────────────────────────────
const app = new PIXI.Application({
  width: W, height: H,
  antialias: true,
  backgroundColor: 0x061525,
  // Cap the backing-buffer scale. Phones report devicePixelRatio ~3, which on a
  // full-screen canvas rasterizes the heavy translucent-overdraw Level 2 cave at
  // ~9× the pixel count of resolution:1 every frame — fill-rate bound, the prime
  // suspect for phone-only L2 lag. Cap at 2 (~2.25× fewer px than dpr 3) for a
  // big win with minimal softening; drop to 1.5 if the phone still lags.
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.getElementById('game-container').appendChild(app.view);


// ─── Player name ─────────────────────────────────────────────
const nameInput  = document.getElementById('name-input');
let   playerName = localStorage.getItem('huffpuff_name') || '';
nameInput.value  = playerName;
nameInput.addEventListener('input', () => {
  playerName = nameInput.value;
  localStorage.setItem('huffpuff_name', playerName);
});
nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { nameInput.blur(); doFlap(); }
});
nameInput.addEventListener('focus', () => {
  setTimeout(() => window.scrollTo(0, 0), 50);
});
nameInput.addEventListener('blur', () => {
  // iOS scrolls the page up to lift the input above the keyboard (even with a
  // fixed body). Undo that scroll once the keyboard has animated closed,
  // otherwise the whole game stays shifted up.
  setTimeout(() => { window.scrollTo(0, 0); resize(); }, 300);
});

function positionNameInput() {
  const vw    = window.visualViewport ? window.visualViewport.width  : window.innerWidth;
  const vh    = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  const cw    = Math.floor(W * scale);
  const ch    = Math.floor(H * scale);
  const ox    = (vw - cw) / 2;
  const oy    = (vh - ch) / 2;
  nameInput.style.width    = Math.floor(cw * 0.58) + 'px';
  // Min 16px: iOS Safari auto-zooms (and pans the viewport, leaving the game
  // shifted up) when a focused input's font-size is under 16px.
  nameInput.style.fontSize = Math.max(16, Math.floor(14 * scale)) + 'px';
  nameInput.style.left     = Math.floor(cw / 2) + 'px';
  nameInput.style.top      = Math.floor((H / 2 + 72) * scale) + 'px';
  nameInput.style.padding  = Math.floor(5 * scale) + 'px ' + Math.floor(14 * scale) + 'px';
}

function resize() {
  if (document.activeElement === nameInput) return;
  const vw    = window.visualViewport ? window.visualViewport.width  : window.innerWidth;
  const vh    = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  app.view.style.width  = Math.floor(W * scale) + 'px';
  app.view.style.height = Math.floor(H * scale) + 'px';
  positionNameInput();
}
window.addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
resize();

// ─── Background music (crossfading playlist) ─────────────────
const TRACKS = [
  'audio/marzipan-tides.mp3',
  'audio/huffandpuff.mp3',
  'audio/coconut-compass.mp3',
  'audio/bubblesprite-xylophone.mp3',
];
const TARGET_VOL = 0.4;
const FADE_SECS  = 3;
let trackIndex  = 0;
let muted       = false;
let bgMusic     = new Audio(TRACKS[0]);
let bgMusicNext = null;
let crossfading = false;
bgMusic.volume  = TARGET_VOL;

function attachTrackListeners(audio) {
  function onTime() {
    if (!audio.duration) return;
    if (audio.currentTime >= audio.duration - FADE_SECS) {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      beginCrossfade();
    }
  }
  function onEnd() {
    audio.removeEventListener('timeupdate', onTime);
    audio.removeEventListener('ended', onEnd);
    beginCrossfade();
  }
  audio.addEventListener('timeupdate', onTime);
  audio.addEventListener('ended', onEnd);
}

function beginCrossfade() {
  if (crossfading) return;
  crossfading = true;
  trackIndex  = (trackIndex + 1) % TRACKS.length;
  bgMusicNext = new Audio(TRACKS[trackIndex]);
  bgMusicNext.volume = 0;
  bgMusicNext.muted  = muted;
  bgMusicNext.play().catch(() => {});
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / (FADE_SECS * 1000), 1);
    if (!muted) {
      bgMusic.volume     = TARGET_VOL * (1 - p);
      bgMusicNext.volume = TARGET_VOL * p;
    }
    if (p < 1) {
      requestAnimationFrame(tick);
    } else {
      bgMusic.pause();
      bgMusic     = bgMusicNext;
      bgMusicNext = null;
      crossfading = false;
      attachTrackListeners(bgMusic);
    }
  }
  requestAnimationFrame(tick);
}

attachTrackListeners(bgMusic);

function crossfadeTo(url, loop) {
  if (crossfading) {
    if (bgMusicNext) { bgMusicNext.pause(); bgMusicNext = null; }
    crossfading = false;
  }
  crossfading = true;
  bgMusicNext = new Audio(url);
  bgMusicNext.volume = 0;
  bgMusicNext.muted  = muted;
  if (loop) bgMusicNext.loop = true;
  bgMusicNext.play().catch(() => {});
  const cfStart = performance.now();
  function cfTick(now) {
    const p = Math.min((now - cfStart) / (FADE_SECS * 1000), 1);
    if (!muted) {
      bgMusic.volume     = TARGET_VOL * (1 - p);
      bgMusicNext.volume = TARGET_VOL * p;
    }
    if (p < 1) {
      requestAnimationFrame(cfTick);
    } else {
      bgMusic.pause();
      bgMusic     = bgMusicNext;
      bgMusicNext = null;
      crossfading = false;
      if (!loop) attachTrackListeners(bgMusic);
    }
  }
  requestAnimationFrame(cfTick);
}

function startMusic() { bgMusic.play().catch(() => {}); }
const autoplay = bgMusic.play();
if (autoplay !== undefined) {
  autoplay.catch(() => {
    document.addEventListener('keydown',    startMusic, { once: true });
    document.addEventListener('click',      startMusic, { once: true });
    document.addEventListener('touchstart', startMusic, { once: true, passive: true });
  });
}

// ─── Firebase ────────────────────────────────────────────────
firebase.initializeApp(window.__FIREBASE_CONFIG__);
const db = firebase.firestore();

async function saveScore(name, score) {
  try {
    await db.collection('scores').add({
      name:  name.trim() || 'Anon',
      score,
      ts:    firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.warn('Score save failed', e); }
}

async function getTopScores(n = 5) {
  try {
    const snap = await db.collection('scores')
      .orderBy('score', 'desc')
      .limit(n)
      .get();
    return snap.docs.map(d => d.data());
  } catch (e) { console.warn('Score fetch failed', e); return []; }
}

// ─── Layers ──────────────────────────────────────────────────
const bgLayer       = new PIXI.Container(); // sky gradient + sand
const causticLayer  = new PIXI.Container(); // animated light rays
const fishLayer     = new PIXI.Container(); // background fish friends
const bubbleLayer   = new PIXI.Container(); // rising bubbles
const seaweedLayer  = new PIXI.Container(); // swaying seaweed
const crabLayer     = new PIXI.Container(); // cute crab on the sand
const caveWallLayer = new PIXI.Container(); // cave stalactites / stalagmites (level 2)
const obstacleLayer = new PIXI.Container(); // coral obstacles
const anglerLayer   = new PIXI.Container(); // anglerfish patrol (level 2)
const pearlLayer    = new PIXI.Container(); // collectible pearls
const playerLayer   = new PIXI.Container(); // Puffy the pufferfish
const uiLayer       = new PIXI.Container(); // HUD text
fishLayer.alpha = 0.32;
app.stage.addChild(bgLayer, causticLayer, fishLayer, bubbleLayer, seaweedLayer, crabLayer, caveWallLayer, obstacleLayer, anglerLayer, pearlLayer, playerLayer, uiLayer);

// ─── Background gradient + sand ──────────────────────────────
(function buildBackground() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');

  const grad = cx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0.0, '#071d3e');
  grad.addColorStop(0.5, '#0c2d5a');
  grad.addColorStop(1.0, '#051525');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, W, H);

  bgLayer.addChild(new PIXI.Sprite(PIXI.Texture.from(c)));

  const sc = document.createElement('canvas');
  sc.width = W; sc.height = 80;
  const sx = sc.getContext('2d');

  const sandGrad = sx.createLinearGradient(0, 0, 0, 80);
  sandGrad.addColorStop(0.0, '#d4a855');
  sandGrad.addColorStop(1.0, '#9a7035');
  sx.fillStyle = sandGrad;

  sx.beginPath();
  sx.moveTo(0, 14);
  for (let x = 0; x <= W; x += 20) {
    sx.quadraticCurveTo(
      x + 10, 4  + Math.sin(x * 0.22) * 7,
      x + 20, 14 + Math.cos((x + 20) * 0.18) * 5
    );
  }
  sx.lineTo(W, 80);
  sx.lineTo(0, 80);
  sx.closePath();
  sx.fill();

  sx.fillStyle = 'rgba(255,220,140,0.18)';
  for (let i = 0; i < 60; i++) {
    const dx = Math.random() * W;
    const dy = 18 + Math.random() * 50;
    sx.beginPath();
    sx.arc(dx, dy, 1 + Math.random() * 2, 0, Math.PI * 2);
    sx.fill();
  }

  const sand = new PIXI.Sprite(PIXI.Texture.from(sc));
  sand.y = H - 80;
  bgLayer.addChild(sand);
})();

// ─── Cave overlay (Level 2 bg, fades in) ─────────────────────
const caveBgSprite = (() => {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const cx = c.getContext('2d');
  const grad = cx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   '#01000b');
  grad.addColorStop(0.5, '#04011a');
  grad.addColorStop(1,   '#000009');
  cx.fillStyle = grad;
  cx.fillRect(0, 0, W, H);
  const radial = cx.createRadialGradient(W / 2, H * 0.55, H * 0.05, W / 2, H * 0.55, H * 0.65);
  radial.addColorStop(0, 'rgba(0,220,160,0.0)');
  radial.addColorStop(1, 'rgba(0,80,55,0.14)');
  cx.fillStyle = radial;
  cx.fillRect(0, 0, W, H);
  const sp = new PIXI.Sprite(PIXI.Texture.from(c));
  sp.alpha = 0;
  bgLayer.addChild(sp);
  return sp;
})();

const caveWallGfx = new PIXI.Graphics();
caveWallLayer.addChild(caveWallGfx);

function updateCaveWalls(t, alpha) {
  caveWallLayer.alpha = alpha;
  const g = caveWallGfx;
  g.clear();
  if (alpha <= 0) return;

  // Ceiling band
  g.beginFill(0x03020d, 0.94);
  g.drawRect(0, 0, W, 20);
  g.endFill();
  for (let x = 0; x < W; x += 14) {
    const len = 16 + Math.sin(x * 0.45) * 9;
    g.beginFill(0x07060f);
    g.drawPolygon([x, 0, x + 7, 20 + len, x + 14, 0]);
    g.endFill();
    g.beginFill(0x00ffcc, 0.17 + 0.12 * Math.sin(t * 1.9 + x * 0.32));
    g.drawCircle(x + 7, 20 + len - 3, 2.3);
    g.endFill();
  }

  // Floor band (covers sand)
  g.beginFill(0x030112, 0.96);
  g.drawRect(0, H - 80, W, 80);
  g.endFill();
  for (let x = 7; x < W; x += 16) {
    const len = 18 + Math.cos(x * 0.38) * 8;
    g.beginFill(0x07060e);
    g.drawPolygon([x - 7, H - 80, x, H - 80 - len, x + 7, H - 80]);
    g.endFill();
    g.beginFill(0x00ddaa, 0.15 + 0.10 * Math.sin(t * 1.5 + x * 0.41));
    g.drawCircle(x, H - 80 - len + 3, 1.9);
    g.endFill();
  }
}

// ─── Caustic light rays ──────────────────────────────────────
const caustics = Array.from({ length: 16 }, () => {
  const g = new PIXI.Graphics();
  causticLayer.addChild(g);
  return {
    g,
    x:     20 + Math.random() * (W - 40),
    y:     Math.random() * (H - 140),
    rx:    22 + Math.random() * 45,
    ry:    5  + Math.random() * 9,
    phase: Math.random() * Math.PI * 2,
    speed: 0.35 + Math.random() * 0.55,
    alpha: 0.035 + Math.random() * 0.05,
  };
});

function updateCaustics(t, lvl) {
  const lt = lvl || 0;
  caustics.forEach(c => {
    c.g.clear();
    const w = Math.sin(t * c.speed + c.phase);
    const a = c.alpha * (0.65 + 0.35 * w);
    if (lt < 0.99) {
      c.g.beginFill(0x88ddff, a * (1 - lt));
      c.g.drawEllipse(c.x, c.y, c.rx * (1 + 0.22 * w), c.ry);
      c.g.endFill();
    }
    if (lt > 0.01) {
      c.g.beginFill(0x00ffaa, a * lt * 0.55);
      c.g.drawEllipse(c.x, c.y, c.rx * (1 + 0.22 * w) * 0.7, c.ry * 0.8);
      c.g.endFill();
    }
  });
}

// ─── Rising bubbles ──────────────────────────────────────────
const bubbles = [];

function addBubble(startY) {
  const g = new PIXI.Graphics();
  bubbleLayer.addChild(g);
  bubbles.push({
    g,
    x:      10 + Math.random() * (W - 20),
    y:      startY ?? H - 80,
    r:      1.5 + Math.random() * 5,
    vy:     0.5 + Math.random() * 1.1,
    phase:  Math.random() * Math.PI * 2,
    alpha:  0.25 + Math.random() * 0.45,
  });
}

for (let i = 0; i < 20; i++) addBubble(Math.random() * H);

function updateBubbles() {
  if (Math.random() < 0.07) addBubble();

  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.phase += 0.038;
    b.x += Math.sin(b.phase) * 0.45;
    b.y -= b.vy;

    if (b.y < -12) {
      bubbleLayer.removeChild(b.g);
      bubbles.splice(i, 1);
      continue;
    }

    const lt = levelTransition || 0;
    b.g.clear();
    if (lt < 0.99) {
      b.g.lineStyle(1, 0xaaddff, b.alpha * 0.75 * (1 - lt));
      b.g.beginFill(0xffffff, b.alpha * 0.1 * (1 - lt));
      b.g.drawCircle(b.x, b.y, b.r);
      b.g.endFill();
      b.g.lineStyle(0);
      b.g.beginFill(0xffffff, b.alpha * 0.65 * (1 - lt));
      b.g.drawCircle(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.27);
      b.g.endFill();
    }
    if (lt > 0.01) {
      b.g.lineStyle(0);
      b.g.beginFill(0x00ffcc, b.alpha * 0.13 * lt);
      b.g.drawCircle(b.x, b.y, b.r * 2.6);
      b.g.endFill();
      b.g.beginFill(0x00ddaa, b.alpha * 0.88 * lt);
      b.g.drawCircle(b.x, b.y, b.r * 0.85);
      b.g.endFill();
    }
  }
}

// ─── Swaying seaweed ─────────────────────────────────────────
const WEED_COLORS = [0x2a8a48, 0x38aa5a, 0x1c6535, 0x4abf70, 0x22703c];

const seaweeds = Array.from({ length: 15 }, (_, i) => {
  const g = new PIXI.Graphics();
  seaweedLayer.addChild(g);
  return {
    g,
    x:     (W / 15) * i + Math.random() * 16 - 4,
    segs:  4 + Math.floor(Math.random() * 4),
    segH:  10 + Math.random() * 9,
    color: WEED_COLORS[i % WEED_COLORS.length],
    phase: Math.random() * Math.PI * 2,
    speed: 0.7 + Math.random() * 0.7,
    width: 3 + Math.random() * 3,
  };
});

function updateSeaweed(t) {
  seaweeds.forEach(s => {
    s.g.clear();
    s.g.lineStyle(s.width, s.color, 0.88);
    let x = s.x, y = H - 76;
    s.g.moveTo(x, y);
    for (let j = 0; j < s.segs; j++) {
      x += Math.sin(t * s.speed + s.phase + j * 0.9) * 9;
      y -= s.segH;
      s.g.lineTo(x, y);
    }
  });
}

// ─── Cute 
//  strolling on the sand ─────────────────────────
const crab = {
  g:        new PIXI.Graphics(),
  x:        W * 0.5,
  dir:      1,
  speed:    0.45,
  legPhase: 0,
};
crabLayer.addChild(crab.g);

function updateCrab(delta) {
  crab.x += crab.dir * crab.speed * delta;
  if (crab.x > W - 28) crab.dir = -1;
  if (crab.x < 28)     crab.dir =  1;
  crab.legPhase += delta * 0.3;

  const g  = crab.g;
  const cx = crab.x;
  const by = H - 52 + Math.sin(crab.legPhase * 2) * 0.8; // body, with a tiny bob
  const d  = crab.dir;
  const bodyCol = 0xe0533a, darkCol = 0xb83018, legCol = 0xc23a22;
  g.clear();

  // legs — 3 per side, alternating walk swing
  g.lineStyle(2.2, legCol, 1);
  for (let i = 0; i < 3; i++) {
    const sw = Math.sin(crab.legPhase * 2 + i * 1.2) * 3;
    g.moveTo(cx - 6, by + 1 + i * 1.5);
    g.lineTo(cx - 12, by + 6 + i * 2);
    g.lineTo(cx - 15, by + 12 + sw);
    g.moveTo(cx + 6, by + 1 + i * 1.5);
    g.lineTo(cx + 12, by + 6 + i * 2);
    g.lineTo(cx + 15, by + 12 - sw);
  }
  g.lineStyle(0);

  // claws — lean toward walking direction
  for (const side of [-1, 1]) {
    const clX = cx + side * 17 + d * 3;
    const clY = by - 6 + Math.sin(crab.legPhase * 2) * 1.5 * side;
    g.lineStyle(2.6, legCol, 1);
    g.moveTo(cx + side * 11, by - 1);
    g.lineTo(clX, clY);
    g.lineStyle(0);
    g.beginFill(bodyCol);
    g.drawCircle(clX, clY, 4.2);
    g.endFill();
    g.lineStyle(1.4, darkCol, 1);
    g.moveTo(clX + side, clY - 3); g.lineTo(clX + side * 4, clY - 1);
    g.moveTo(clX + side, clY + 1); g.lineTo(clX + side * 4, clY + 2.5);
    g.lineStyle(0);
  }

  // body
  g.beginFill(darkCol); g.drawEllipse(cx, by, 14, 9); g.endFill();
  g.beginFill(bodyCol); g.drawEllipse(cx, by - 0.5, 13, 8); g.endFill();
  g.beginFill(0xff8866, 0.5); g.drawEllipse(cx - 3, by - 3, 5, 2.5); g.endFill();

  // eyes on stalks
  for (const side of [-1, 1]) {
    const ex = cx + side * 5;
    g.lineStyle(2, darkCol, 1);
    g.moveTo(ex, by - 6); g.lineTo(ex, by - 12);
    g.lineStyle(0);
    g.beginFill(0xffffff); g.drawCircle(ex, by - 13, 2.6); g.endFill();
    g.beginFill(0x111111); g.drawCircle(ex + d * 0.8, by - 13, 1.3); g.endFill();
  }

  // little smile
  g.lineStyle(1.3, darkCol, 1);
  g.arc(cx, by, 5, 0.25 * Math.PI, 0.75 * Math.PI);
  g.lineStyle(0);
}

// ─── Background fish friends ─────────────────────────────────
const FISH_COLORS = [0xff6633, 0xff99bb, 0x44aaff, 0xffcc22, 0xbb66ff, 0x44ffcc, 0xff4488];
const fishes = [];
let fishSpawnTimer = 0;

function addFish() {
  const dir  = Math.random() < 0.2 ? 1 : -1;
  const size = 7 + Math.random() * 9;
  const g    = new PIXI.Graphics();
  fishLayer.addChild(g);
  fishes.push({
    g,
    x:     dir === -1 ? W + size + 10 : -size - 10,
    y:     60 + Math.random() * (GROUND_Y - 120),
    vx:    dir * (0.7 + Math.random() * 0.9),
    size,
    color: FISH_COLORS[Math.floor(Math.random() * FISH_COLORS.length)],
    dir,
    phase: Math.random() * Math.PI * 2,
  });
}

function updateFishes(t, delta) {
  fishSpawnTimer -= delta * 0.016;
  if (fishSpawnTimer <= 0 && fishes.length < 6) {
    addFish();
    fishSpawnTimer = 2 + Math.random() * 2.5;
  }

  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i];
    f.x += f.vx * delta;
    f.y += Math.sin(t * 1.8 + f.phase) * 0.35;

    const gone = f.dir === -1 ? f.x < -f.size - 10 : f.x > W + f.size + 10;
    if (gone) { fishLayer.removeChild(f.g); fishes.splice(i, 1); continue; }

    const s = f.size, d = f.dir;
    f.g.clear();

    // Tail (behind fish)
    const tailX = f.x - d * s * 0.65;
    f.g.beginFill(f.color, 0.85);
    f.g.drawPolygon([tailX, f.y, tailX - d * s * 0.45, f.y - s * 0.42, tailX - d * s * 0.45, f.y + s * 0.42]);
    f.g.endFill();

    // Body
    f.g.beginFill(f.color);
    f.g.drawEllipse(f.x, f.y, s, s * 0.55);
    f.g.endFill();

    // Belly highlight
    f.g.beginFill(0xffffff, 0.22);
    f.g.drawEllipse(f.x + d * s * 0.1, f.y - s * 0.12, s * 0.48, s * 0.24);
    f.g.endFill();

    // Eye (front of fish)
    const eyeX = f.x + d * s * 0.42;
    f.g.beginFill(0xffffff);
    f.g.drawCircle(eyeX, f.y - s * 0.08, s * 0.2);
    f.g.endFill();
    f.g.beginFill(0x111111);
    f.g.drawCircle(eyeX + d * s * 0.05, f.y - s * 0.08, s * 0.11);
    f.g.endFill();
  }
}

// ─── Game state ──────────────────────────────────────────────
let gameState = 'idle';
let score     = 0;
let hiScore   = 0;

// ─── Score UI ────────────────────────────────────────────────
const scoreText = new PIXI.Text('0', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 52,
  fontWeight: 'bold',
  fill: 0xffffff,
  stroke: 0x003a6e,
  strokeThickness: 6,
  dropShadow: true,
  dropShadowDistance: 3,
  dropShadowAlpha: 0.35,
});
scoreText.anchor.set(0.5, 0);
scoreText.x = W / 2;
scoreText.y = 20;
scoreText.visible = false;
uiLayer.addChild(scoreText);

const hiText = new PIXI.Text('BEST  0', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 15,
  fill: 0xaaddff,
  stroke: 0x003a6e,
  strokeThickness: 3,
});
hiText.anchor.set(0.5, 0);
hiText.x = W / 2;
hiText.y = 76;
hiText.visible = false;
uiLayer.addChild(hiText);

// ─── Title screen ─────────────────────────────────────────────
const titleScreen = new PIXI.Container();
uiLayer.addChild(titleScreen);

const titleText = new PIXI.Text('Huff & Puff', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 54,
  fontWeight: 'bold',
  fill: ['#ffffff', '#a8e6ff'],
  fillGradientStops: [0, 1],
  stroke: 0x003a6e,
  strokeThickness: 7,
  dropShadow: true,
  dropShadowDistance: 4,
  dropShadowAlpha: 0.5,
});
titleText.anchor.set(0.5);
titleText.x = W / 2;
titleText.y = H / 2 - 80;
titleScreen.addChild(titleText);

const tapText = new PIXI.Text('tap to swim!', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 20,
  fill: 0xaaddff,
  stroke: 0x003a6e,
  strokeThickness: 4,
});
tapText.anchor.set(0.5);
tapText.x = W / 2;
tapText.y = H / 2 + 10;
titleScreen.addChild(tapText);

// ─── Game-over screen ────────────────────────────────────────
const gameOverScreen = new PIXI.Container();
gameOverScreen.visible = false;
uiLayer.addChild(gameOverScreen);

const goBg = new PIXI.Graphics();
goBg.beginFill(0x000a1a, 0.78);
goBg.drawRoundedRect(18, 62 + PY, W - 36, 400, 14);
goBg.endFill();
gameOverScreen.addChild(goBg);

const ohNoText = new PIXI.Text('', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 38,
  fontWeight: 'bold',
  fill: ['#ffffff', '#ffccaa'],
  fillGradientStops: [0, 1],
  stroke: 0x5a1a00,
  strokeThickness: 6,
  dropShadow: true,
  dropShadowDistance: 4,
  dropShadowAlpha: 0.5,
});
ohNoText.anchor.set(0.5);
ohNoText.x = W / 2;
ohNoText.y = 90 + PY;
gameOverScreen.addChild(ohNoText);

const goScoreText = new PIXI.Text('', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 26,
  fill: 0xffffff,
  stroke: 0x003a6e,
  strokeThickness: 5,
});
goScoreText.anchor.set(0.5);
goScoreText.x = W / 2;
goScoreText.y = 140 + PY;
gameOverScreen.addChild(goScoreText);

const goBestText = new PIXI.Text('', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 14,
  fill: 0xaaddff,
  stroke: 0x003a6e,
  strokeThickness: 3,
});
goBestText.anchor.set(0.5);
goBestText.x = W / 2;
goBestText.y = 170 + PY;
gameOverScreen.addChild(goBestText);

const goLeaderHeader = new PIXI.Text('── TOP SCORES ──', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 13,
  fill: 0x88ccff,
  stroke: 0x003a6e,
  strokeThickness: 2,
});
goLeaderHeader.anchor.set(0.5);
goLeaderHeader.x = W / 2;
goLeaderHeader.y = 205 + PY;
gameOverScreen.addChild(goLeaderHeader);

const goLeaderEntries = [];
for (let i = 0; i < 10; i++) {
  const lt = new PIXI.Text('', {
    fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 13,
    fill: 0xffffff,
    stroke: 0x003a6e,
    strokeThickness: 2,
  });
  lt.anchor.set(0.5);
  lt.x = W / 2;
  lt.y = 228 + PY + i * 18;
  gameOverScreen.addChild(lt);
  goLeaderEntries.push(lt);
}

const retryText = new PIXI.Text('tap to try again', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 17,
  fill: 0xaaddff,
  stroke: 0x003a6e,
  strokeThickness: 3,
});
retryText.anchor.set(0.5);
retryText.x = W / 2;
retryText.y = 438 + PY;
gameOverScreen.addChild(retryText);

// ─── Level-up banner ─────────────────────────────────────────
const levelBanner = new PIXI.Container();
levelBanner.visible = false;
uiLayer.addChild(levelBanner);

// Compact two-line pill near the bottom — "LEVEL 2" with "The Deep Cave"
// stacked beneath it, clear of the passage and the top-centre score.
const BANNER_CY = H - 60;

const lvlTitleText = new PIXI.Text('LEVEL 2', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 24, fontWeight: 'bold',
  fill: ['#00ffcc', '#0088ff'],
  fillGradientStops: [0, 1],
  stroke: 0x003040, strokeThickness: 4,
  dropShadow: true, dropShadowDistance: 2, dropShadowAlpha: 0.5,
});
lvlTitleText.anchor.set(0.5);
lvlTitleText.x = W / 2;
lvlTitleText.y = BANNER_CY - 13;

const lvlSubText = new PIXI.Text('The Deep Cave', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 16,
  fill: 0x88e6d6,
  stroke: 0x002030, strokeThickness: 2,
});
lvlSubText.anchor.set(0.5);
lvlSubText.x = W / 2;
lvlSubText.y = BANNER_CY + 14;

const bw = Math.max(lvlTitleText.width, lvlSubText.width) + 44;
const bh = 64;
const lvlBgGfx = new PIXI.Graphics();
lvlBgGfx.beginFill(0x000a1a, 0.72);
lvlBgGfx.drawRoundedRect(W / 2 - bw / 2, BANNER_CY - bh / 2, bw, bh, 16);
lvlBgGfx.endFill();
lvlBgGfx.lineStyle(1.5, 0x00ffcc, 0.45);
lvlBgGfx.drawRoundedRect(W / 2 - bw / 2, BANNER_CY - bh / 2, bw, bh, 16);
lvlBgGfx.lineStyle(0);
levelBanner.addChild(lvlBgGfx, lvlTitleText, lvlSubText);

// ─── Help button + modal ─────────────────────────────────────
let showHelp       = false;
let showLeader     = false;
let showCharSelect          = false;
let charSelectedThisSession = false;
let charSelectPendingStart  = false;
let selectedChar            = parseInt(localStorage.getItem('huffpuff_char') || '0');
const HB_X = W - 24, HB_Y = 24, HB_R = 18;
const LB_X = 24,      LB_Y = 24, LB_R = 18;
const MUTE_X = W - 24, MUTE_Y = 62, MUTE_R = 16;
const CHAR_X = 24,    CHAR_Y = 62, CHAR_R = 16;
const CHAR_COLORS = [
  { body: 0xf7be00, tail: 0xe09000 },
  { body: 0x00ccee, tail: 0x0088aa },
  { body: 0xff6622, tail: 0xdd4400 },
];

const helpBtnGfx  = new PIXI.Graphics();
const helpBtnLabel = new PIXI.Text('?', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 19, fontWeight: 'bold', fill: 0x88ccff,
  stroke: 0x002244, strokeThickness: 2,
});
helpBtnLabel.anchor.set(0.5);
helpBtnLabel.x = HB_X; helpBtnLabel.y = HB_Y;
uiLayer.addChild(helpBtnGfx);
uiLayer.addChild(helpBtnLabel);

function drawHelpBtn() {
  helpBtnGfx.clear();
  helpBtnGfx.beginFill(0x001428, 0.72);
  helpBtnGfx.lineStyle(1.5, 0x0088cc, 0.8);
  helpBtnGfx.drawCircle(HB_X, HB_Y, HB_R);
  helpBtnGfx.endFill();
}
drawHelpBtn();

// ─── Leaderboard button (top-left) ───────────────────────────
const lbBtnGfx = new PIXI.Graphics();
uiLayer.addChild(lbBtnGfx);

function drawLbBtn() {
  lbBtnGfx.clear();
  lbBtnGfx.beginFill(0x001428, 0.72);
  lbBtnGfx.lineStyle(1.5, 0x0088cc, 0.8);
  lbBtnGfx.drawCircle(LB_X, LB_Y, LB_R);
  lbBtnGfx.endFill();
  lbBtnGfx.lineStyle(0);
  const base = LB_Y + 9;
  lbBtnGfx.beginFill(0xffcc00);  lbBtnGfx.drawRect(LB_X - 3,   base - 13, 6, 13); lbBtnGfx.endFill();
  lbBtnGfx.beginFill(0xaaaacc);  lbBtnGfx.drawRect(LB_X - 10,  base - 9,  6, 9);  lbBtnGfx.endFill();
  lbBtnGfx.beginFill(0xcc7722);  lbBtnGfx.drawRect(LB_X + 4,   base - 7,  6, 7);  lbBtnGfx.endFill();
}
drawLbBtn();

// ─── Character button (top-left below leaderboard) ───────────
const charBtnGfx = new PIXI.Graphics();
uiLayer.addChild(charBtnGfx);

function drawCharBtn() {
  charBtnGfx.clear();
  charBtnGfx.beginFill(0x001428, 0.72);
  charBtnGfx.lineStyle(1.5, 0x0088cc, 0.8);
  charBtnGfx.drawCircle(CHAR_X, CHAR_Y, CHAR_R);
  charBtnGfx.endFill();
  charBtnGfx.lineStyle(0);
  const c = CHAR_COLORS[selectedChar];
  charBtnGfx.beginFill(c.tail);
  charBtnGfx.drawPolygon([CHAR_X - 7, CHAR_Y - 1, CHAR_X - 12, CHAR_Y - 5, CHAR_X - 12, CHAR_Y + 5, CHAR_X - 7, CHAR_Y + 1]);
  charBtnGfx.endFill();
  charBtnGfx.beginFill(c.body);
  charBtnGfx.drawEllipse(CHAR_X + 1, CHAR_Y, 8, 6);
  charBtnGfx.endFill();
  charBtnGfx.beginFill(0xffffff); charBtnGfx.drawCircle(CHAR_X + 5, CHAR_Y - 1, 2.1); charBtnGfx.endFill();
  charBtnGfx.beginFill(0x111111); charBtnGfx.drawCircle(CHAR_X + 5.5, CHAR_Y - 1, 1.2); charBtnGfx.endFill();
}
drawCharBtn();

// ─── Leaderboard modal ────────────────────────────────────────
const lbModal = new PIXI.Container();
lbModal.visible = false;
uiLayer.addChild(lbModal);

const lbDim = new PIXI.Graphics();
lbDim.beginFill(0x000510, 0.82);
lbDim.drawRect(0, 0, W, H);
lbDim.endFill();
lbModal.addChild(lbDim);

const lbPanel = new PIXI.Graphics();
lbPanel.beginFill(0x00111e, 0.97);
lbPanel.lineStyle(2, 0x0099cc, 0.65);
lbPanel.drawRoundedRect(22, 70 + PY, W - 44, 400, 18);
lbPanel.endFill();
lbModal.addChild(lbPanel);

const lbTitle = new PIXI.Text('Top Scores', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 22, fontWeight: 'bold',
  fill: 0xffffff, stroke: 0x003a6e, strokeThickness: 5,
});
lbTitle.anchor.set(0.5);
lbTitle.x = W / 2; lbTitle.y = 100 + PY;
lbModal.addChild(lbTitle);

const lbHeader = new PIXI.Text('── TOP SCORES ──', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 13, fill: 0x88ccff, stroke: 0x003a6e, strokeThickness: 2,
});
lbHeader.anchor.set(0.5);
lbHeader.x = W / 2; lbHeader.y = 132 + PY;
lbModal.addChild(lbHeader);

const lbEntries = [];
for (let i = 0; i < 10; i++) {
  const lt = new PIXI.Text('', {
    fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 14, fill: 0xffffff, stroke: 0x003a6e, strokeThickness: 2,
  });
  lt.anchor.set(0.5);
  lt.x = W / 2; lt.y = 160 + PY + i * 26;
  lbModal.addChild(lt);
  lbEntries.push(lt);
}

const lbCloseHint = new PIXI.Text('tap anywhere to close', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 12, fill: 0x336688,
});
lbCloseHint.anchor.set(0.5);
lbCloseHint.x = W / 2; lbCloseHint.y = 450 + PY;
lbModal.addChild(lbCloseHint);

async function openLeaderboard() {
  showLeader = true;
  lbEntries[0].text = 'loading…';
  lbEntries[0].style.fill = 0x88bbdd;
  for (let i = 1; i < 10; i++) lbEntries[i].text = '';
  const top = await getTopScores(10);
  if (!showLeader) return;
  top.forEach((entry, i) => {
    const n = entry.name.length > 10 ? entry.name.slice(0, 10) + '…' : entry.name;
    lbEntries[i].text = `${i + 1}.  ${n}  ${entry.score}`;
    lbEntries[i].style.fill = i === 0 ? 0xffdd44 : i === 1 ? 0xccccdd : i === 2 ? 0xdd9944 : 0xffffff;
  });
  for (let i = top.length; i < 10; i++) lbEntries[i].text = '';
}

// modal
const helpModal = new PIXI.Container();
helpModal.visible = false;
uiLayer.addChild(helpModal);

const helpDim = new PIXI.Graphics();
helpDim.beginFill(0x000510, 0.82);
helpDim.drawRect(0, 0, W, H);
helpDim.endFill();
helpModal.addChild(helpDim);

const helpPanel = new PIXI.Graphics();
helpPanel.beginFill(0x00111e, 0.97);
helpPanel.lineStyle(2, 0x0099cc, 0.65);
helpPanel.drawRoundedRect(22, 70 + PY, W - 44, 390, 18);
helpPanel.endFill();
helpModal.addChild(helpPanel);

const helpTitle = new PIXI.Text('How to Play', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 22, fontWeight: 'bold',
  fill: 0xffffff, stroke: 0x003a6e, strokeThickness: 5,
});
helpTitle.anchor.set(0.5);
helpTitle.x = W / 2; helpTitle.y = 100 + PY;
helpModal.addChild(helpTitle);

const MODAL_ROWS = [
  { type: 'starfish', name: 'Starfish  ★ ×2, ×3… combo!', desc: 'Collect consecutively for multiplied points' },
  { type: 'poison',   name: 'Sea Urchin',  desc: 'Puffs up bigger and slows down'    },
  { type: 'speed',    name: 'Speed Boost', desc: 'Swim faster for 4 seconds'          },
  { type: 'regular',  name: 'Pearl',       desc: '+1 point each'                      },
];
const ROW_YS = [150 + PY, 215 + PY, 278 + PY, 338 + PY];
const ICON_X = 58;

const modalIconGfx = new PIXI.Graphics();
helpModal.addChild(modalIconGfx);

MODAL_ROWS.forEach((row, i) => {
  const y = ROW_YS[i];
  const nameT = new PIXI.Text(row.name, {
    fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 14, fontWeight: 'bold',
    fill: 0xffffff, stroke: 0x002244, strokeThickness: 3,
  });
  nameT.anchor.set(0, 0.5); nameT.x = 84; nameT.y = y - 7;
  helpModal.addChild(nameT);

  const descT = new PIXI.Text(row.desc, {
    fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 11, fill: 0x88bbdd,
  });
  descT.anchor.set(0, 0.5); descT.x = 84; descT.y = y + 10;
  helpModal.addChild(descT);
});

// draw icons once (static)
;(function() {
  const g = modalIconGfx;
  MODAL_ROWS.forEach((row, i) => {
    const x = ICON_X, y = ROW_YS[i];
    if (row.type === 'starfish') {
      g.beginFill(0xff8833, 0.22); g.drawCircle(x, y, 14); g.endFill();
      const pts = [];
      for (let si = 0; si < 10; si++) {
        const a = (si/10)*Math.PI*2 - Math.PI/2, r = si%2===0 ? 11 : 5;
        pts.push(x+Math.cos(a)*r, y+Math.sin(a)*r);
      }
      g.beginFill(0xff7722); g.drawPolygon(pts); g.endFill();
      g.beginFill(0xffcc44, 0.75); g.drawCircle(x, y, 4); g.endFill();
    } else if (row.type === 'poison') {
      g.beginFill(0x9900cc, 0.22); g.drawCircle(x, y, 14); g.endFill();
      for (let si = 0; si < 12; si++) {
        const a = (si/12)*Math.PI*2;
        const tx = x+Math.cos(a)*12, ty = y+Math.sin(a)*12;
        g.beginFill(0xcc44ff, 0.9);
        g.drawPolygon([x+Math.cos(a-0.18)*5, y+Math.sin(a-0.18)*5, tx, ty, x+Math.cos(a+0.18)*5, y+Math.sin(a+0.18)*5]);
        g.endFill();
      }
      g.beginFill(0x440055); g.drawCircle(x, y, 5); g.endFill();
      g.beginFill(0xdd88ff, 0.75); g.drawCircle(x, y, 3); g.endFill();
    } else if (row.type === 'speed') {
      g.beginFill(0x00ddcc, 0.25); g.drawCircle(x, y, 13); g.endFill();
      g.beginFill(0x00bbaa); g.drawCircle(x, y, 7); g.endFill();
      g.beginFill(0x88ffee, 0.85); g.drawCircle(x, y, 4.5); g.endFill();
      g.lineStyle(1.2, 0x00ffdd, 0.7);
      [-3, 0, 3].forEach(dy => { g.moveTo(x-11, y+dy); g.lineTo(x-7, y+dy); });
      g.lineStyle(0);
    } else {
      g.beginFill(0xddeeff, 0.3); g.drawCircle(x, y, 11); g.endFill();
      g.beginFill(0xffffff, 0.85); g.drawCircle(x, y, 7); g.endFill();
      g.beginFill(0xffffff, 0.5); g.drawCircle(x-2, y-2, 3); g.endFill();
    }
  });
}());

const betaNotice = new PIXI.Text('★ Beta Test  ·  Ends 30 Jun 2026', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 12, fill: 0xffcc44,
});
betaNotice.anchor.set(0.5);
betaNotice.x = W / 2; betaNotice.y = 393 + PY;
helpModal.addChild(betaNotice);

const helpCloseHint = new PIXI.Text('tap anywhere to close', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 12, fill: 0x336688,
});
helpCloseHint.anchor.set(0.5);
helpCloseHint.x = W / 2; helpCloseHint.y = 440 + PY;
helpModal.addChild(helpCloseHint);

// ─── Character select modal ───────────────────────────────────
const charModal = new PIXI.Container();
charModal.visible = false;
uiLayer.addChild(charModal);

const charDim = new PIXI.Graphics();
charDim.beginFill(0x000510, 0.82);
charDim.drawRect(0, 0, W, H);
charDim.endFill();
charModal.addChild(charDim);

const charPanel = new PIXI.Graphics();
charPanel.beginFill(0x00111e, 0.97);
charPanel.lineStyle(2, 0x0099cc, 0.65);
charPanel.drawRoundedRect(22, 80 + PY, W - 44, 370, 18);
charPanel.endFill();
charModal.addChild(charPanel);

const charTitle = new PIXI.Text('Choose Your Fish', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 20, fontWeight: 'bold',
  fill: 0xffffff, stroke: 0x003a6e, strokeThickness: 5,
});
charTitle.anchor.set(0.5);
charTitle.x = W / 2; charTitle.y = 112 + PY;
charModal.addChild(charTitle);

// Static fish preview graphics
const charPreviewGfx = new PIXI.Graphics();
charModal.addChild(charPreviewGfx);

const SLOT_XS = [78, 200, 322];
const SLOT_Y  = 210 + PY;
const CHAR_NAMES = ['Puffy', 'Bubbles', 'Sunny'];

;(function drawCharPreviews() {
  const g = charPreviewGfx;

  // Puffy (slot 0)
  ;(function() {
    const cx = SLOT_XS[0], cy = SLOT_Y;
    const br = 15, nSpikes = 10, spikeLen = 5;
    g.beginFill(0xcc8000, 0.9);
    for (let i = 0; i < nSpikes; i++) {
      const a = (i/nSpikes)*Math.PI*2;
      g.drawPolygon([Math.cos(a-0.22)*br+cx, Math.sin(a-0.22)*br+cy, Math.cos(a)*(br+spikeLen)+cx, Math.sin(a)*(br+spikeLen)+cy, Math.cos(a+0.22)*br+cx, Math.sin(a+0.22)*br+cy]);
    }
    g.endFill();
    g.beginFill(0xf7be00); g.drawEllipse(cx, cy, br, br*0.88); g.endFill();
    g.beginFill(0xffe980, 0.55); g.drawEllipse(cx+1, cy-br*0.1, br*0.54, br*0.38); g.endFill();
    g.beginFill(0xe09000); g.drawPolygon([cx-br, cy-5, cx-br-10, cy-9, cx-br-10, cy+9, cx-br, cy+5]); g.endFill();
    const ex = cx+br*0.36, ey = cy-br*0.18, er = 5;
    g.beginFill(0xffffff); g.drawCircle(ex, ey, er); g.endFill();
    g.beginFill(0x1a60c0); g.drawCircle(ex+0.7, ey, er*0.66); g.endFill();
    g.beginFill(0x111111); g.drawCircle(ex+1.1, ey, er*0.38); g.endFill();
    g.beginFill(0xffffff, 0.9); g.drawCircle(ex+er*0.28, ey-er*0.3, er*0.22); g.endFill();
    g.beginFill(0xff99aa, 0.4); g.drawEllipse(ex-2, ey+er+2, 7, 3); g.endFill();
  }());

  // Bubbles (slot 1)
  ;(function() {
    const cx = SLOT_XS[1], cy = SLOT_Y;
    const br = 16;
    g.beginFill(0x00ccee); g.drawCircle(cx, cy, br); g.endFill();
    g.beginFill(0x88eeff, 0.65); g.drawEllipse(cx+1, cy+br*0.2, br*0.58, br*0.48); g.endFill();
    g.beginFill(0x0088aa); g.drawPolygon([cx-br, cy-5, cx-br-10, cy-9, cx-br-10, cy+9, cx-br, cy+5]); g.endFill();
    g.beginFill(0x00aacc, 0.9); g.drawPolygon([cx+2, cy-br*0.15, cx+11, cy-br*0.15-9, cx+8, cy-br*0.15-5]); g.endFill();
    const ex = cx+br*0.36, ey = cy-br*0.18, er = 5.5;
    g.beginFill(0xffffff); g.drawCircle(ex, ey, er); g.endFill();
    g.beginFill(0x006688); g.drawCircle(ex+0.7, ey, er*0.66); g.endFill();
    g.beginFill(0x111111); g.drawCircle(ex+1.1, ey, er*0.38); g.endFill();
    g.beginFill(0xffffff, 0.9); g.drawCircle(ex+er*0.28, ey-er*0.3, er*0.22); g.endFill();
    g.beginFill(0xff99cc, 0.55); g.drawEllipse(ex-2, ey+er+2, 9, 4); g.endFill();
    // bubble above
    g.lineStyle(1.2, 0x88eeff, 0.85);
    g.beginFill(0x88eeff, 0.2); g.drawCircle(cx+5, cy-br-8, 5); g.endFill();
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.7); g.drawCircle(cx+3.5, cy-br-10, 1.5); g.endFill();
  }());

  // Sunny (slot 2)
  ;(function() {
    const cx = SLOT_XS[2], cy = SLOT_Y;
    const br = 15, bry = 13;
    g.beginFill(0xff6622); g.drawEllipse(cx, cy, br, bry); g.endFill();
    g.beginFill(0xffffff, 0.92); g.drawEllipse(cx, cy, br*0.2, bry*0.92); g.endFill();
    g.lineStyle(1, 0x333333, 0.35); g.drawEllipse(cx, cy, br*0.2, bry*0.92); g.lineStyle(0);
    g.beginFill(0xdd4400); g.drawPolygon([cx-br, cy-5, cx-br-11, cy-9, cx-br-11, cy+9, cx-br, cy+5]); g.endFill();
    g.beginFill(0xff8833, 0.9); g.drawPolygon([cx+3, cy-bry*0.15, cx+12, cy-bry*0.15-9, cx+9, cy-bry*0.15-5]); g.endFill();
    const ex = cx+br*0.38, ey = cy-bry*0.18, er = 5;
    g.beginFill(0xffffff); g.drawCircle(ex, ey, er); g.endFill();
    g.beginFill(0x1a60c0); g.drawCircle(ex+0.7, ey, er*0.66); g.endFill();
    g.beginFill(0x111111); g.drawCircle(ex+1.1, ey, er*0.38); g.endFill();
    g.beginFill(0xffffff, 0.9); g.drawCircle(ex+er*0.28, ey-er*0.3, er*0.22); g.endFill();
    g.beginFill(0xff99aa, 0.4); g.drawEllipse(ex-2, ey+er+2, 7, 3); g.endFill();
  }());
}());

// Selection rings (redrawn on change)
const charSelRings = new PIXI.Graphics();
charModal.addChild(charSelRings);

function drawCharSelRings() {
  charSelRings.clear();
  SLOT_XS.forEach((cx, i) => {
    const sel = i === selectedChar;
    charSelRings.lineStyle(sel ? 2.5 : 1.2, sel ? 0xffdd44 : 0x224466, sel ? 1 : 0.45);
    charSelRings.drawCircle(cx, SLOT_Y, 48);
    charSelRings.lineStyle(0);
  });
}
drawCharSelRings();

// Name labels
CHAR_NAMES.forEach((name, i) => {
  const nt = new PIXI.Text(name, {
    fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 14, fontWeight: 'bold',
    fill: 0xffffff, stroke: 0x002244, strokeThickness: 3,
  });
  nt.anchor.set(0.5);
  nt.x = SLOT_XS[i]; nt.y = 275 + PY;
  charModal.addChild(nt);
});

const charStartBtnGfx = new PIXI.Graphics();
charStartBtnGfx.beginFill(0x001428, 0.95);
charStartBtnGfx.lineStyle(2, 0xffdd44, 0.95);
charStartBtnGfx.drawRoundedRect(W / 2 - 65, 330 + PY, 130, 38, 10);
charStartBtnGfx.endFill();
charModal.addChild(charStartBtnGfx);

const charStartBtnLabel = new PIXI.Text('START', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 16, fontWeight: 'bold',
  fill: 0xffdd44, stroke: 0x002244, strokeThickness: 3,
});
charStartBtnLabel.anchor.set(0.5);
charStartBtnLabel.x = W / 2; charStartBtnLabel.y = 349 + PY;
charModal.addChild(charStartBtnLabel);

const charCloseHint = new PIXI.Text('tap outside to close', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 11, fill: 0x336688,
});
charCloseHint.anchor.set(0.5);
charCloseHint.x = W / 2; charCloseHint.y = 415 + PY;
charModal.addChild(charCloseHint);

// ─── Mute button (always visible, top-right below ?) ─────────
const muteBtnGfx   = new PIXI.Graphics();
const muteBtnLabel = new PIXI.Text('♪', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 18, fontWeight: 'bold', fill: 0x88ccff,
  stroke: 0x002244, strokeThickness: 2,
});
muteBtnLabel.anchor.set(0.5);
muteBtnLabel.x = MUTE_X; muteBtnLabel.y = MUTE_Y;
uiLayer.addChild(muteBtnGfx);
uiLayer.addChild(muteBtnLabel);

function drawMuteBtn() {
  muteBtnGfx.clear();
  muteBtnGfx.beginFill(0x001428, 0.72);
  muteBtnGfx.lineStyle(1.5, 0x0088cc, 0.8);
  muteBtnGfx.drawCircle(MUTE_X, MUTE_Y, MUTE_R);
  muteBtnGfx.endFill();
  muteBtnGfx.lineStyle(0);
  muteBtnLabel.style.fill = muted ? 0x445566 : 0x88ccff;
  if (muted) {
    muteBtnGfx.lineStyle(1.5, 0xff4455, 0.9);
    muteBtnGfx.moveTo(MUTE_X - 8, MUTE_Y - 8);
    muteBtnGfx.lineTo(MUTE_X + 8, MUTE_Y + 8);
    muteBtnGfx.lineStyle(0);
  }
}
drawMuteBtn();

// ─── Combo display + floating score texts ────────────────────
const comboText = new PIXI.Text('', {
  fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
  fontSize: 20,
  fontWeight: 'bold',
  fill: 0xffdd44,
  stroke: 0x884400,
  strokeThickness: 4,
  dropShadow: true,
  dropShadowDistance: 2,
  dropShadowAlpha: 0.5,
});
comboText.anchor.set(0.5, 1);
comboText.visible = false;
uiLayer.addChild(comboText);

const floatTexts = [];
function addFloatText(x, y, str, color) {
  const ft = new PIXI.Text(str, {
    fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 19,
    fontWeight: 'bold',
    fill: color || 0xffffff,
    stroke: 0x003060,
    strokeThickness: 3,
  });
  ft.anchor.set(0.5);
  ft.x = x; ft.y = y;
  ft.alpha = 1;
  ft.life = 1.0;
  uiLayer.addChild(ft);
  floatTexts.push(ft);
}

// ─── Puffy the Pufferfish ────────────────────────────────────
const puffyGfx = new PIXI.Graphics();
playerLayer.addChild(puffyGfx);

const GRAVITY  = 0.42;
const FLAP_VY  = -8.2;
const GROUND_Y = H - 80;

const puffy = {
  x: 110, y: H / 2, vy: 0,
  puff: 0, puffTimer: 0, finPhase: 0, angle: 0,
  shrinkTimer: 0, happyTimer: 0, poisonTimer: 0, speedTimer: 0,
};

// ─── Obstacles ───────────────────────────────────────────────
const PIPE_W   = 65;
// Gap is a fixed number of world units (not scaled to canvas height) so the
// threading challenge is identical on every device — a tall phone canvas must
// not turn into an easy, wide passage.
const PIPE_GAP = 195;
// On a tall canvas a gap could otherwise jump from the top to the bottom of the
// screen between two obstacles — unreachable. Cap how far each gap moves from
// the previous one so every jump stays fair.
const MAX_GAP_DELTA = 190;
const PIPE_MS     = 1800;
const PIPE_SPD    = 2.9;
const LEVEL2_SCORE  = 300;
const PIPE_SPD_L2   = 3.3;
const ANGLER_SPACING = 720;  // world units between anglerfish spawns in L2
const ANGLER_LURE_X  = -36;  // lure tip offset from body centre
const ANGLER_LURE_Y  = -40;
const ANGLER_SCALE   = 0.68; // overall anglerfish size (visual + hitbox)

// ── Level 2 continuous cave tunnel ──
// Instead of discrete columns, L2 is one winding rocky tunnel (a cenote-like
// passage) defined by a moving array of ceiling/floor control points.
const CAVE_SEG_W      = 34;   // world-units between cave control points
const CAVE_GAP_BASE   = 338;  // base passage height (wide & forgiving)
const CAVE_GAP_VAR    = 24;   // ± gap breathing
const CAVE_GAP_MIN    = 300;  // never narrower than this
const CAVE_SCORE_DIST = 250;  // world-units travelled per score point in tunnel
const CAVE_PEARL_DIST = 250;  // world-units between pearl sets in tunnel

const obstacles = [];
const pearls    = [];
let nextSpacing = 300;  // world-unit distance to leave before the next column
let lastTopH    = null; // previous gap's top edge, for reachability clamping
let lastBobAmp  = 0;    // previous gap's bob amplitude, reserved in the clamp
let gameSpeed       = PIPE_SPD;
let gameLevel          = 1;
let levelTransition    = 0;
let levelBannerT       = 0;
let level2MusicStarted = false;
const anglerfish     = [];
let anglerSpawnDist  = 0;

// Cave tunnel runtime state
const caveSegs    = [];   // { x, ceil, floor, jagC, jagF, stal, glow, rubble }
let caveActive    = false;
let caveCenter    = 0;    // current passage centre (world Y)
let caveSegPhase  = 0;    // drives the winding meander
let caveGapPhase  = 0;    // drives gap breathing
let caveScoreDist = 0;
let cavePearlDist = 0;
let caveEntrySeg  = 0;    // counts segments since entry, for a widening mouth
// Each segment pair gets its own PIXI.Graphics drawn once at spawn (draw-once
// pattern). Culled segments return their Graphics to caveGfxPool — g.clear()
// reuses the existing WebGL buffer in place, zero GC pressure. The container
// is translated each frame for the scroll effect (no per-frame tessellation).
let caveScroll    = 0;
const caveContainer = new PIXI.Container();
obstacleLayer.addChild(caveContainer);
const caveGfxPool = Array.from({ length: 20 }, () => new PIXI.Graphics());
let starCombo       = 0;
let comboBurst     = 1;
let nextSetBoost   = false;

function drawPearl(g, type) {
  const pulse = 0.85;
  if (type === 'starfish') {
    g.beginFill(0xff8833, 0.22 * pulse); g.drawCircle(0, 0, 17); g.endFill();
    const spts = [];
    for (let si = 0; si < 10; si++) {
      const sa = (si / 10) * Math.PI * 2 - Math.PI / 2;
      const sr = si % 2 === 0 ? 11 : 5;
      spts.push(Math.cos(sa) * sr, Math.sin(sa) * sr);
    }
    g.beginFill(0xff7722); g.drawPolygon(spts); g.endFill();
    g.beginFill(0xffcc44, 0.75); g.drawCircle(0, 0, 4); g.endFill();
  } else {
    g.beginFill(0x88ccff, 0.15 * pulse); g.drawCircle(0, 0, 11); g.endFill();
    g.beginFill(0xf5f0ff);              g.drawCircle(0, 0, 6);  g.endFill();
    g.beginFill(0xffbbee, 0.5);         g.drawCircle(0, 0, 4.5); g.endFill();
  }
  if (type === 'speed') {
    g.beginFill(0x00ddcc, 0.25 * pulse); g.drawCircle(0, 0, 13); g.endFill();
    g.beginFill(0x00bbaa);               g.drawCircle(0, 0, 7);  g.endFill();
    g.beginFill(0x88ffee, 0.85);         g.drawCircle(0, 0, 4.5); g.endFill();
    g.lineStyle(1.2, 0x00ffdd, 0.7);
    [-3, 0, 3].forEach(oy => { g.moveTo(-11, oy); g.lineTo(-7, oy); });
    g.lineStyle(0);
  } else if (type === 'poison') {
    g.beginFill(0x9900cc, 0.20 * pulse); g.drawCircle(0, 0, 16); g.endFill();
    for (let si = 0; si < 12; si++) {
      const sa = (si / 12) * Math.PI * 2;
      g.beginFill(0xcc44ff, 0.9);
      g.drawPolygon([Math.cos(sa-0.18)*5, Math.sin(sa-0.18)*5, Math.cos(sa)*12, Math.sin(sa)*12, Math.cos(sa+0.18)*5, Math.sin(sa+0.18)*5]);
      g.endFill();
    }
    g.beginFill(0x440055); g.drawCircle(0, 0, 5.5); g.endFill();
    g.beginFill(0xdd88ff, 0.75); g.drawCircle(0, 0, 3); g.endFill();
  }
  g.beginFill(0xffffff, 0.9); g.drawCircle(-2, -2, 1.8); g.endFill();
}

function spawnPearlSet(cx, midY, spread) {
  const boosted = nextSetBoost;
  nextSetBoost  = false;
  const colState = { starfishHit: false };
  [-1, 0, 1].forEach(i => {
    const g    = new PIXI.Graphics();
    const rand = Math.random();
    const type = boosted
      ? (rand < 0.45 ? 'starfish' : rand < 0.53 ? 'poison' : rand < 0.62 ? 'speed' : 'regular')
      : (rand < 0.74 ? 'regular'  : rand < 0.86 ? 'starfish' : rand < 0.92 ? 'poison' : 'speed');
    const py = midY + i * spread;
    drawPearl(g, type);
    g.x = cx; g.y = py;
    pearlLayer.addChild(g);
    pearls.push({ g, x: cx, y: py, type, colState });
  });
}

function spawnPearls(topH, botY) {
  spawnPearlSet(W + 5 + PIPE_W / 2, topH + (botY - topH) / 2, (botY - topH) * 0.25);
}

function spawnCavePearls() {
  if (!caveSegs.length) return;
  const s = caveSegs[caveSegs.length - 1];
  spawnPearlSet(W + 12, (s.ceil + s.floor) / 2, (s.floor - s.ceil) * 0.22);
}

function drawCoralPair(g, topH, botY) {
  g.beginFill(0x0e1020);
  g.drawRect(0, 0, PIPE_W, topH);
  g.endFill();

  g.beginFill(0x1c1e35);
  for (let x = 0; x < PIPE_W; x += 13) {
    const dh = 13 + Math.sin(x * 0.55) * 7;
    g.drawPolygon([x, topH, x + 6.5, topH + dh, x + 13, topH]);
  }
  g.endFill();

  g.beginFill(0x2244cc, 0.16);
  g.drawRect(0, topH - 5, PIPE_W, 5);
  g.endFill();

  const botH = H - 80 - botY;
  g.beginFill(0x0e1020);
  g.drawRect(0, botY, PIPE_W, botH);
  g.endFill();

  const coralCols = [0xff5e8a, 0xff9030, 0xcc44ee, 0xff3355, 0x22cc66];
  for (let x = 0; x < PIPE_W; x += 13) {
    const col = coralCols[Math.floor(x / 13) % coralCols.length];
    const ph  = 14 + Math.cos(x * 0.48) * 7;

    g.beginFill(col, 0.93);
    g.drawPolygon([x, botY, x + 6.5, botY - ph, x + 13, botY]);
    g.endFill();

    g.beginFill(col, 0.7);
    g.drawPolygon([x + 2,   botY - ph * 0.55, x + 4.5, botY - ph - 9,  x + 6,    botY - ph - 3]);
    g.drawPolygon([x + 6.5, botY - ph,         x + 8.5, botY - ph - 8,  x + 10.5, botY - ph * 0.45]);
    g.endFill();
  }

  g.beginFill(0x2244cc, 0.16);
  g.drawRect(0, botY, PIPE_W, 5);
  g.endFill();
}

// ─── Level 2 cave tunnel ─────────────────────────────────────
// Draw one segment pair (a → b) into a pooled Graphics. Each pair is drawn
// once at spawn and never redrawn; the container is translated for scrolling.
function drawCaveSegGfx(a, b, prevSeg) {
  const g = caveGfxPool.length ? caveGfxPool.pop() : new PIXI.Graphics();
  g.clear();

  // Smooth-curve anchors: midpoints between adjacent control points
  const lx     = prevSeg ? (prevSeg.x + a.x) / 2 : a.x;
  const lCeil  = prevSeg ? (prevSeg.ceil  + a.ceil)  / 2 : a.ceil;
  const lFloor = prevSeg ? (prevSeg.floor + a.floor) / 2 : a.floor;
  const rx     = (a.x + b.x) / 2;
  const rCeil  = (a.ceil  + b.ceil)  / 2;
  const rFloor = (a.floor + b.floor) / 2;

  // Ceiling rock mass
  g.beginFill(0x0a1f2e);
  g.moveTo(lx, -6); g.lineTo(lx, lCeil);
  g.quadraticCurveTo(a.x, a.ceil, rx, rCeil);
  g.lineTo(rx, -6); g.closePath(); g.endFill();

  // Floor rock mass
  g.beginFill(0x0c2230);
  g.moveTo(lx, H + 6); g.lineTo(lx, lFloor);
  g.quadraticCurveTo(a.x, a.floor, rx, rFloor);
  g.lineTo(rx, H + 6); g.closePath(); g.endFill();

  // Inner rock band (depth)
  g.lineStyle(7, 0x1d4a58, 0.4);
  g.moveTo(lx, lCeil + 5);  g.quadraticCurveTo(a.x, a.ceil  + 5, rx, rCeil  + 5);
  g.moveTo(lx, lFloor - 5); g.quadraticCurveTo(a.x, a.floor - 5, rx, rFloor - 5);
  g.lineStyle(0);

  // Aqua rim glow
  g.lineStyle(6, 0x2f9fb0, 0.16);
  g.moveTo(lx, lCeil);  g.quadraticCurveTo(a.x, a.ceil,  rx, rCeil);
  g.moveTo(lx, lFloor); g.quadraticCurveTo(a.x, a.floor, rx, rFloor);
  g.lineStyle(2, 0x5fd6e0, 0.42);
  g.moveTo(lx, lCeil);  g.quadraticCurveTo(a.x, a.ceil,  rx, rCeil);
  g.moveTo(lx, lFloor); g.quadraticCurveTo(a.x, a.floor, rx, rFloor);
  g.lineStyle(0);

  if (a.stalC) {
    const dh = 7 + a.jagC * 0.9;
    g.beginFill(0x103040); g.drawEllipse(a.x, a.ceil  + dh * 0.4, 7, dh); g.endFill();
    g.beginFill(a.knobCol, 0.45); g.drawCircle(a.x, a.ceil  + dh, 1.8); g.endFill();
  }
  if (a.stalF) {
    const ph = 7 + a.jagF * 0.9;
    g.beginFill(0x123444); g.drawEllipse(a.x, a.floor - ph * 0.4, 7, ph); g.endFill();
    g.beginFill(a.knobCol, 0.45); g.drawCircle(a.x, a.floor - ph, 1.8); g.endFill();
  }

  caveContainer.addChild(g);
  a.gfx = g;
}

// A single continuous winding passage. `caveSegs` holds ceiling/floor control
// points spaced CAVE_SEG_W apart in world-x; they scroll left and new ones are
// generated on the right. The fish swims through the gap between rock masses.
function caveBounds() {
  return { top: PY + 34, bot: GROUND_Y - 34 };
}

function pushCaveSeg(x) {
  const { top, bot } = caveBounds();
  const span = bot - top;
  // Winding centre: two layered sines for an organic, non-repeating meander.
  // Gentle steps + low amplitude keep the curves long and flowing, not jagged.
  caveSegPhase += 0.26;
  caveGapPhase += 0.22;
  const target = (top + bot) / 2
               + Math.sin(caveSegPhase) * span * 0.20
               + Math.sin(caveSegPhase * 0.43 + 1.3) * span * 0.09;
  // Limit how far the centre can shift per segment so the passage stays
  // reachable (the fish climbs/dives far faster than the world scrolls).
  const maxStep = CAVE_SEG_W * 0.55;
  caveCenter += Math.max(-maxStep, Math.min(maxStep, target - caveCenter));

  // Mouth opens extra-wide and eases to the base gap over the first segments
  // so entering the cave feels smooth rather than slamming into a passage.
  const entryBonus = Math.max(0, 90 * (1 - caveEntrySeg / 16));
  caveEntrySeg++;

  let gap = CAVE_GAP_BASE + entryBonus + Math.sin(caveGapPhase) * CAVE_GAP_VAR;
  if (gap < CAVE_GAP_MIN) gap = CAVE_GAP_MIN;
  let ceil  = caveCenter - gap / 2;
  let floor = caveCenter + gap / 2;
  if (ceil  < top) { ceil  = top; floor = Math.min(bot, top + gap); }
  if (floor > bot) { floor = bot; ceil  = Math.max(top, bot - gap); }

  // Moonlit-teal monochrome palette — one cohesive colour family, calm.
  const GLOW = [0x5fd6e0, 0x7fe9f0, 0x2fb8c4, 0x4fd0dc];
  caveSegs.push({
    x, ceil, floor,
    jagC:   3 + Math.random() * 7,
    jagF:   3 + Math.random() * 7,
    stalC:  Math.random() < 0.4,
    stalF:  Math.random() < 0.4,
    knobCol: GLOW[Math.floor(Math.random() * GLOW.length)],
    gfx: null,
  });
  // Draw the pair (N-2, N-1) now that both endpoints are known.
  if (caveSegs.length >= 2) {
    const i = caveSegs.length - 2;
    drawCaveSegGfx(caveSegs[i], caveSegs[i + 1], caveSegs[i - 1] || null);
  }
}

function startCaveTunnel(seedY) {
  const { top, bot } = caveBounds();
  caveSegs.forEach(s => {
    if (s.gfx) { caveContainer.removeChild(s.gfx); s.gfx.clear(); caveGfxPool.push(s.gfx); }
  });
  caveSegs.length = 0;
  caveCenter   = Math.max(top + 80, Math.min(bot - 80, seedY));
  caveSegPhase = Math.random() * Math.PI * 2;
  caveGapPhase = Math.random() * Math.PI * 2;
  caveScoreDist = 0;
  cavePearlDist = 0;
  caveEntrySeg  = 0;
  caveScroll    = 0;
  caveContainer.x = 0;
  caveActive   = true;
}

// Edges at a SCREEN x. Segment x is world-space, so subtract the scroll offset.
function caveEdgesAt(px) {
  for (let i = 0; i < caveSegs.length - 1; i++) {
    const a = caveSegs[i], b = caveSegs[i + 1];
    const ax = a.x - caveScroll, bx = b.x - caveScroll;
    if (px >= ax && px <= bx) {
      const f = (px - ax) / (bx - ax);
      return { ceil: a.ceil + (b.ceil - a.ceil) * f, floor: a.floor + (b.floor - a.floor) * f };
    }
  }
  return null;
}

function updateCaveTunnel(delta) {
  caveScroll += gameSpeed * delta;
  // Pool Graphics for segments that have scrolled past the left edge.
  while (caveSegs.length > 2 && (caveSegs[1].x - caveScroll) < -CAVE_SEG_W) {
    const culled = caveSegs[0];
    if (culled.gfx) {
      caveContainer.removeChild(culled.gfx);
      culled.gfx.clear();
      caveGfxPool.push(culled.gfx);
    }
    caveSegs.shift();
  }
  // Generate segments ahead of the right edge; pushCaveSeg draws each new pair.
  while (!caveSegs.length || (caveSegs[caveSegs.length - 1].x - caveScroll) < W + CAVE_SEG_W * 2) {
    const lastX = caveSegs.length ? caveSegs[caveSegs.length - 1].x : (caveScroll + W - CAVE_SEG_W);
    pushCaveSeg(lastX + CAVE_SEG_W);
  }
  caveContainer.x = -caveScroll;
}

// ─── Anglerfish (Level 2 predator) ───────────────────────────
function drawAngler(a, t) {
  const g = a.g;
  g.clear();
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.8 + a.phase);
  const lx = ANGLER_LURE_X, ly = ANGLER_LURE_Y;

  // ── Whole-body luminous bloom (the fish itself glows magenta) ──
  g.beginFill(0xff2db0, 0.06 + 0.04 * pulse); g.drawEllipse(2, 0, 54, 42); g.endFill();
  g.beginFill(0xff4dc0, 0.10 + 0.05 * pulse); g.drawEllipse(2, 0, 42, 30); g.endFill();
  g.beginFill(0xff7ad6, 0.13 + 0.06 * pulse); g.drawEllipse(0, 0, 32, 22); g.endFill();

  // Tail fin (glowing)
  g.lineStyle(1.5, 0xff9ce0, 0.8);
  g.beginFill(0xc71e87, 0.94);
  g.drawPolygon([26, -14, 44, -22, 44, 22, 26, 14]);
  g.endFill();
  // Dorsal fin
  g.beginFill(0xc71e87, 0.94);
  g.drawPolygon([-2, -22, 8, -33, 18, -22]);
  g.endFill();
  // Body — luminous magenta with bright pink rim
  g.beginFill(0xe61f9c, 0.97);
  g.drawEllipse(0, 0, 30, 20);
  g.endFill();
  // Belly fin
  g.beginFill(0xc71e87, 0.94);
  g.drawPolygon([4, 20, 10, 29, 18, 20]);
  g.endFill();
  g.lineStyle(0);

  // Bright bioluminescent body spots
  [[-8, 6], [4, -7], [13, 5], [-2, 9]].forEach(([sx, sy], i) => {
    const sa = 0.55 + 0.35 * Math.sin(t * 1.8 + i * 1.4);
    g.beginFill(0xffd6f1, sa); g.drawCircle(sx, sy, 3); g.endFill();
  });

  // Eye — facing left (head side)
  g.beginFill(0x2a0820); g.drawCircle(-22, -5, 6); g.endFill();
  g.beginFill(0xfff0fa, 0.92); g.drawCircle(-22, -5, 2.5); g.endFill();

  // Mouth with teeth
  g.beginFill(0x3a0626);
  g.drawPolygon([-30, -4, -39, 2, -30, 7]);
  g.endFill();
  g.beginFill(0xfff0fa, 0.9);
  for (let i = 0; i < 3; i++) {
    g.drawPolygon([-33 + i * 2.8, -3, -32.5 + i * 2.8, 2, -32 + i * 2.8, -3]);
  }
  g.endFill();

  // Lure stalk
  g.lineStyle(1.5, 0x665500, 0.8);
  g.moveTo(-14, -20);
  g.quadraticCurveTo(-28, -38, lx, ly);
  g.lineStyle(0);

  // ── Lure light — YELLOW bloom with white-hot core ──
  g.beginFill(0xffdd22, 0.05 + 0.05 * pulse); g.drawCircle(lx, ly, 30); g.endFill();
  g.beginFill(0xffe23a, 0.11 + 0.08 * pulse); g.drawCircle(lx, ly, 18); g.endFill();
  g.beginFill(0xffea55, 0.22 + 0.14 * pulse); g.drawCircle(lx, ly, 10); g.endFill();
  g.beginFill(0xffe23a, 0.6 + 0.4 * pulse);   g.drawCircle(lx, ly, 5 + pulse * 1.8); g.endFill();
  g.beginFill(0xfffce0, 0.97);                g.drawCircle(lx, ly, 3);               g.endFill();
}

function spawnAngler() {
  const playTop = PY + 120;
  const playBot = GROUND_Y - 120;
  if (playBot <= playTop) return;
  const midY = playTop + Math.random() * (playBot - playTop);
  const g = new PIXI.Graphics();
  g.scale.set(ANGLER_SCALE);
  anglerLayer.addChild(g);
  const a = {
    g,
    x:     W + 55,
    y:     midY,
    baseY: midY,
    amp:   50 + Math.random() * 38,
    phase: Math.random() * Math.PI * 2,
    speed: 0.65 + Math.random() * 0.35,
  };
  anglerfish.push(a);
  // Draw the anglerfish geometry ONCE here, not every frame. Re-tessellating and
  // re-uploading this complex translucent shape each frame churned WebGL buffers
  // and triggered periodic GC stalls on the phone (the L2-only frame spikes). The
  // fish still bobs and scrolls — only position animates now. Phase seeds a fixed
  // glow snapshot so different fish don't look identical.
  drawAngler(a, 0);
}

function spawnObstacle() {
  const activeGap = PIPE_GAP;
  const minTop = PY + 90;
  const maxTop = H - 80 - activeGap - 90;

  // Decide movement up front so its bob can be reserved in the reach budget.
  const moving = Math.random() < 0.5;
  const bobAmp = moving ? 12 + Math.random() * 14 : 0; // ±12–26

  let topH;
  if (lastTopH === null) {
    topH = minTop + Math.random() * (maxTop - minTop);
  } else {
    // nextSpacing is the exact centre-to-centre distance to the previous column.
    const freeWin = Math.max(0, nextSpacing - PIPE_W); // open water between columns
    // The fish climbs/falls far faster than it scrolls, and each 195-tall gap
    // gives extra slack — but reserve room for BOTH columns bobbing together.
    const reachable = freeWin * 1.4 + 70 - bobAmp - lastBobAmp;
    const allowed   = Math.max(50, Math.min(MAX_GAP_DELTA, reachable));
    const lo = Math.max(minTop, lastTopH - allowed);
    const hi = Math.min(maxTop, lastTopH + allowed);
    topH = lo + Math.random() * (hi - lo);
  }
  lastTopH   = topH;
  lastBobAmp = bobAmp;
  const botY = topH + activeGap;

  const g = new PIXI.Graphics();
  drawCoralPair(g, topH, botY);
  g.x = W + 5;
  obstacleLayer.addChild(g);

  spawnPearls(topH, botY);
  obstacles.push({
    g, topH, botY, passed: false,
    bobAmp,
    bobSpeed: 0.8 + Math.random() * 0.7,
    bobPhase: Math.random() * Math.PI * 2,
  });
  // Distance (world units) the next column must leave before it spawns.
  nextSpacing = 250 + Math.random() * 120; // 250–370
}

function hitTest() {
  const r = puffy.poisonTimer > 0 ? 18 : puffy.shrinkTimer > 0 ? 5 : 8;
  if (puffy.y + r > GROUND_Y || puffy.y - r < 0) return true;
  for (const o of obstacles) {
    if (puffy.x + r > o.g.x + 3 && puffy.x - r < o.g.x + PIPE_W - 3) {
      if (puffy.y - r < o.topH + o.g.y || puffy.y + r > o.botY + o.g.y) return true;
    }
  }
  if (caveActive) {
    const e = caveEdgesAt(puffy.x);
    if (e && (puffy.y - r < e.ceil || puffy.y + r > e.floor)) return true;
  }
  for (const a of anglerfish) {
    const lx = a.x + ANGLER_LURE_X * ANGLER_SCALE, ly = a.y + ANGLER_LURE_Y * ANGLER_SCALE;
    if (Math.hypot(puffy.x - lx,  puffy.y - ly) < 11 * ANGLER_SCALE + r) return true;
    if (Math.hypot(puffy.x - a.x, puffy.y - a.y) < 21 * ANGLER_SCALE + r) return true;
  }
  return false;
}

function updatePearls(t, delta) {
  for (let i = pearls.length - 1; i >= 0; i--) {
    const p = pearls[i];
    p.x -= gameSpeed * delta;

    const dx = puffy.x - p.x;
    const dy = puffy.y - p.y;
    if (Math.sqrt(dx * dx + dy * dy) < 18) {
      if (p.type === 'starfish') {
        p.colState.starfishHit = true;
        starCombo++;
        comboBurst   = 1.8;
        nextSetBoost = true;
        const pts = 5 * starCombo;
        score += pts;
        addFloatText(p.x, p.y, `+${pts}`, starCombo >= 3 ? 0xff8800 : starCombo >= 2 ? 0xffdd44 : 0xffffff);
      } else if (p.type === 'poison') {
        puffy.poisonTimer = 5;
      } else if (p.type === 'speed') {
        puffy.speedTimer = 4;
      } else {
        score += 1;
      }
      puffy.happyTimer = 0.6;
      if (score > hiScore) hiScore = score;
      pearlLayer.removeChild(p.g); p.g.destroy();
      pearls.splice(i, 1);
      continue;
    }

    if (p.x < -20) {
      if (p.type === 'starfish' && !p.colState.starfishHit) starCombo = 0;
      pearlLayer.removeChild(p.g); p.g.destroy();
      pearls.splice(i, 1);
      continue;
    }

    p.g.x = p.x;
    p.g.y = p.y;
  }
}

let deathHandled = false;

async function handleDeath() {
  if (deathHandled) return;
  deathHandled = true;
  goLeaderEntries[0].text = 'loading…';
  for (let i = 1; i < 10; i++) goLeaderEntries[i].text = '';

  const name = playerName.trim() || 'Anon';
  if (score > 0) await saveScore(name, score);
  const top = await getTopScores(10);

  top.forEach((entry, i) => {
    const n = entry.name.length > 9 ? entry.name.slice(0, 9) + '…' : entry.name;
    goLeaderEntries[i].text = `${i + 1}.  ${n}  ${entry.score}`;
    goLeaderEntries[i].style.fill = (entry.name === name && entry.score === score) ? 0xffdd44 : 0xffffff;
  });
  for (let i = top.length; i < 10; i++) goLeaderEntries[i].text = '';
}

function resetGame() {
  obstacles.forEach(o => { obstacleLayer.removeChild(o.g); o.g.destroy(); });
  obstacles.length = 0;
  pearls.forEach(p => { pearlLayer.removeChild(p.g); p.g.destroy(); });
  pearls.length = 0;
  anglerfish.forEach(a => { anglerLayer.removeChild(a.g); a.g.destroy(); });
  anglerfish.length = 0;
  anglerSpawnDist = 0;
  caveActive    = false;
  caveSegs.forEach(s => {
    if (s.gfx) { caveContainer.removeChild(s.gfx); s.gfx.clear(); caveGfxPool.push(s.gfx); }
  });
  caveSegs.length = 0;
  caveScoreDist = 0;
  cavePearlDist = 0;
  caveEntrySeg  = 0;
  caveScroll    = 0;
  caveContainer.x = 0;
  nextSpacing = 300;
  lastTopH    = null;
  lastBobAmp  = 0;
  score       = 0;

  puffy.y = H / 2; puffy.vy = 0;
  puffy.puff = 0; puffy.puffTimer = 0; puffy.angle = 0;
  puffy.shrinkTimer = 0;
  puffy.happyTimer  = 0;
  puffy.poisonTimer = 0;
  puffy.speedTimer  = 0;
  gameSpeed         = PIPE_SPD;
  gameLevel         = 1;
  levelTransition   = 0;
  levelBannerT      = 0;
  caveBgSprite.alpha = 0;
  crabLayer.alpha   = 1;
  seaweedLayer.alpha = 1;
  fishLayer.alpha   = 0.32;
  bubbleLayer.alpha = 1;
  if (level2MusicStarted) {
    level2MusicStarted = false;
    crossfading = false;
    if (bgMusicNext) { bgMusicNext.pause(); bgMusicNext = null; }
    bgMusic.pause();
    trackIndex = (trackIndex + 1) % TRACKS.length;
    bgMusic = new Audio(TRACKS[trackIndex]);
    bgMusic.volume = muted ? 0 : TARGET_VOL;
    bgMusic.muted  = muted;
    bgMusic.play().catch(() => {});
    attachTrackListeners(bgMusic);
  }
  deathHandled      = false;
  starCombo         = 0;
  comboBurst        = 1;
  nextSetBoost      = false;
  floatTexts.forEach(ft => uiLayer.removeChild(ft));
  floatTexts.length = 0;
}

let _fullscreenDone = false;
function tryFullscreen() {
  if (_fullscreenDone) return;
  _fullscreenDone = true;
  const el = document.documentElement;
  if      (el.requestFullscreen)       el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

function doFlap() {
  tryFullscreen();
  if (gameState === 'dead') { resetGame(); gameState = 'idle'; return; }
  if (gameState === 'idle') {
    if (!charSelectedThisSession) { charSelectPendingStart = true; showCharSelect = true; return; }
    gameState = 'playing';
  }
  puffy.vy        = FLAP_VY;
  puffy.puffTimer = 16;
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && document.activeElement !== nameInput) { e.preventDefault(); doFlap(); }
});
function getCanvasXY(e) {
  const rect = app.view.getBoundingClientRect();
  const cx = e.touches ? e.touches[0].clientX : e.clientX;
  const cy = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
}

function handleTap(e) {
  const { x, y } = getCanvasXY(e);
  const mx = x - MUTE_X, my = y - MUTE_Y;
  if (mx*mx + my*my <= MUTE_R*MUTE_R) {
    muted = !muted;
    bgMusic.muted = muted;
    if (bgMusicNext) bgMusicNext.muted = muted;
    drawMuteBtn();
    return;
  }
  if (showLeader) { showLeader = false; return; }
  if (showHelp)   { showHelp   = false; return; }
  if (showCharSelect) {
    // Start button hit: rect centered at (W/2, 349+PY), 130×38
    if (x >= W / 2 - 65 && x <= W / 2 + 65 && y >= 330 + PY && y <= 368 + PY) {
      charSelectedThisSession = true;
      showCharSelect = false;
      if (charSelectPendingStart) { charSelectPendingStart = false; gameState = 'playing'; }
      return;
    }
    // Fish slot taps — select only, keep modal open
    for (let i = 0; i < 3; i++) {
      const dx = x - SLOT_XS[i], dy = y - SLOT_Y;
      if (dx*dx + dy*dy <= 48*48) {
        selectedChar = i;
        localStorage.setItem('huffpuff_char', i);
        drawCharSelRings();
        drawCharBtn();
        charSelectedThisSession = true;
        return;
      }
    }
    // Tap outside — close without starting
    showCharSelect = false;
    charSelectPendingStart = false;
    return;
  }
  if (gameState === 'idle') {
    const dx = x - HB_X, dy = y - HB_Y;
    if (dx*dx + dy*dy <= HB_R*HB_R) { showHelp = true; return; }
    const lx = x - LB_X, ly = y - LB_Y;
    if (lx*lx + ly*ly <= LB_R*LB_R) { openLeaderboard(); return; }
    const cx = x - CHAR_X, cy = y - CHAR_Y;
    if (cx*cx + cy*cy <= CHAR_R*CHAR_R) { charSelectPendingStart = false; showCharSelect = true; return; }
  }
  doFlap();
}

app.view.addEventListener('click', handleTap);
app.view.addEventListener('touchstart', e => { e.preventDefault(); handleTap(e); }, { passive: false });

// ─── Draw Puffy ──────────────────────────────────────────────
function drawPuffy(puff, finPhase, t) {
  const g = puffyGfx;
  g.clear();

  const br  = 10 + puff * 9;
  const bry = br * (0.86 - puff * 0.06);
  const nSpikes  = Math.round(10 + puff * 7);
  const spikeLen = 3.5 + puff * 7;

  const poisoned = puffy.poisonTimer > 0;
  const speeding = puffy.speedTimer  > 0;
  const spikeCol = poisoned ? 0x550088 : speeding ? 0xbb2200 : 0xcc8000;
  const bodyCol  = poisoned ? 0x9933cc : speeding ? 0xff6600 : 0xf7be00;
  const hlCol    = poisoned ? 0xdd88ff : speeding ? 0xffcc44 : 0xffe980;
  const tailCol  = poisoned ? 0x440066 : speeding ? 0xaa2200 : 0xe09000;
  const finCol   = poisoned ? 0x7722bb : speeding ? 0xff4400 : 0xf0a800;

  // Poison aura — pulsing green ring
  if (poisoned) {
    const pulse = 0.4 + 0.35 * Math.sin(t * 4);
    g.beginFill(0xaa00ff, pulse * 0.18);
    g.drawCircle(0, 0, br + spikeLen + 6);
    g.endFill();
    g.lineStyle(1.5, 0xff00ff, pulse * 0.7);
    g.drawCircle(0, 0, br + spikeLen + 3);
    g.lineStyle(0);
  }

  // Speed trail — orange streaks to the left
  if (speeding) {
    const pulse  = 0.5 + 0.5 * Math.sin(t * 10);
    const trailX = -br - spikeLen;
    [6, 0, -6].forEach((oy, i) => {
      const len = 20 - i * 4;
      g.lineStyle(2 - i * 0.4, 0xff8800, (0.5 + 0.3 * pulse) * (1 - i * 0.2));
      g.moveTo(trailX - len, oy);
      g.lineTo(trailX, oy);
    });
    g.lineStyle(0);
  }

  g.beginFill(spikeCol, 0.92);
  for (let i = 0; i < nSpikes; i++) {
    const a   = (i / nSpikes) * Math.PI * 2;
    const tipX = Math.cos(a) * (br  + spikeLen);
    const tipY = Math.sin(a) * (bry + spikeLen);
    const b1x  = Math.cos(a - 0.2) * br;
    const b1y  = Math.sin(a - 0.2) * bry;
    const b2x  = Math.cos(a + 0.2) * br;
    const b2y  = Math.sin(a + 0.2) * bry;
    g.drawPolygon([b1x, b1y, tipX, tipY, b2x, b2y]);
  }
  g.endFill();

  g.beginFill(bodyCol);
  g.drawEllipse(0, 0, br, bry);
  g.endFill();

  g.beginFill(hlCol, 0.55);
  g.drawEllipse(1, bry * 0.22, br * 0.54, bry * 0.38);
  g.endFill();

  g.beginFill(tailCol);
  g.drawPolygon([-br, -6, -br - 15, -13 - puff * 3, -br - 15, 13 + puff * 3, -br, 6]);
  g.endFill();

  const fa = finPhase;
  g.beginFill(finCol, 0.9);
  g.drawPolygon([
    3,  -bry * 0.15,
    3 + Math.cos(fa) * 12,       -bry * 0.15 - Math.sin(fa) * 14,
    3 + Math.cos(fa + 0.55) * 8, -bry * 0.15 - Math.sin(fa + 0.55) * 8,
  ]);
  g.endFill();

  g.beginFill(tailCol, 0.85);
  g.drawPolygon([3, bry * 0.5, 9, bry * 0.5 + 10, -1, bry * 0.5 + 7]);
  g.endFill();

  const ex    = br * 0.36;
  const ey    = -bry * 0.18;
  const er    = 4.5 + puff * 2.5;
  const happy = puffy.happyTimer > 0;
  const eyeR  = happy ? er * 1.4 : er;

  g.beginFill(0xffffff);
  g.drawCircle(ex, ey, eyeR);
  g.endFill();
  g.beginFill(0x1a60c0);
  g.drawCircle(ex + 0.8, ey, eyeR * 0.66);
  g.endFill();
  g.beginFill(0x111111);
  g.drawCircle(ex + 1.3, ey, eyeR * 0.38);
  g.endFill();
  g.beginFill(0xffffff, 0.92);
  g.drawCircle(ex + eyeR * 0.28, ey - eyeR * 0.3, eyeR * 0.22);
  g.endFill();

  if (happy) {
    g.beginFill(0xffffff, 0.9);
    g.drawCircle(ex + eyeR + 3, ey - 3, 2);
    g.drawCircle(ex + eyeR,     ey - eyeR - 2, 1.5);
    g.drawCircle(ex - 2,        ey - eyeR - 2, 1.5);
    g.endFill();
  }

  g.beginFill(0xff99aa, happy ? 0.6 : 0.38);
  g.drawEllipse(ex - 2, ey + eyeR + 2, happy ? 10 : 7, 3.5);
  g.endFill();

  if (happy) {
    g.beginFill(0x772200, 0.9);
    g.drawEllipse(ex + 2, ey + eyeR + 8, 8, 5);
    g.endFill();
    g.beginFill(0xf7be00, 0.95);
    g.drawEllipse(ex + 2, ey + eyeR + 4.5, 8, 5);
    g.endFill();
  } else if (puff > 0.55) {
    g.beginFill(0x994400);
    g.drawCircle(ex + 4, ey + er + 6, 4);
    g.endFill();
    g.beginFill(0xff8866, 0.85);
    g.drawCircle(ex + 4, ey + er + 6, 2.4);
    g.endFill();
  } else {
    g.beginFill(0x994400, 0.75);
    g.drawEllipse(ex + 4, ey + er + 5, 4.5, 2.2);
    g.endFill();
    g.beginFill(0xf7be00, 0.85);
    g.drawEllipse(ex + 4, ey + er + 3.5, 4.5, 2.2);
    g.endFill();
  }
}

function drawBubbles(puff, finPhase, t) {
  const g = puffyGfx;
  g.clear();

  const br = 11 + puff * 8;

  const poisoned = puffy.poisonTimer > 0;
  const speeding = puffy.speedTimer  > 0;
  const bodyCol  = poisoned ? 0x9933cc : speeding ? 0x00ffee : 0x00ccee;
  const bellyCol = poisoned ? 0xcc88ff : speeding ? 0xaaffee : 0x88eeff;
  const tailCol  = poisoned ? 0x440066 : speeding ? 0x009988 : 0x0088aa;
  const finCol   = poisoned ? 0x7722bb : speeding ? 0x00ccbb : 0x00aacc;

  if (poisoned) {
    const pulse = 0.4 + 0.35 * Math.sin(t * 4);
    g.beginFill(0xaa00ff, pulse * 0.18); g.drawCircle(0, 0, br + 8); g.endFill();
    g.lineStyle(1.5, 0xff00ff, pulse * 0.7); g.drawCircle(0, 0, br + 5); g.lineStyle(0);
  }
  if (speeding) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 10);
    [-5, 0, 5].forEach((oy, i) => {
      const len = 18 - i * 3;
      g.lineStyle(1.8 - i * 0.3, 0x00ddff, (0.5 + 0.3 * pulse) * (1 - i * 0.2));
      g.moveTo(-br - len, oy); g.lineTo(-br, oy);
    });
    g.lineStyle(0);
  }

  g.beginFill(bodyCol); g.drawCircle(0, 0, br); g.endFill();
  g.beginFill(bellyCol, 0.65); g.drawEllipse(1, br * 0.2, br * 0.58, br * 0.48); g.endFill();
  g.beginFill(tailCol); g.drawPolygon([-br, -5, -br-13, -11-puff*2, -br-13, 11+puff*2, -br, 5]); g.endFill();

  const fa = finPhase;
  g.beginFill(finCol, 0.9);
  g.drawPolygon([2, -br*0.15, 2+Math.cos(fa)*11, -br*0.15-Math.sin(fa)*12, 2+Math.cos(fa+0.55)*7, -br*0.15-Math.sin(fa+0.55)*7]);
  g.endFill();

  // Floating bubble above (animated)
  const bubY = -br - 7 - Math.sin(t * 1.8) * 3;
  g.lineStyle(1.2, 0x88eeff, 0.8);
  g.beginFill(0x88eeff, 0.22); g.drawCircle(br * 0.2, bubY, 4.5); g.endFill();
  g.lineStyle(0);
  g.beginFill(0xffffff, 0.65); g.drawCircle(br * 0.2 - 1.2, bubY - 1.5, 1.3); g.endFill();

  const ex = br * 0.36, ey = -br * 0.18;
  const er = 5 + puff * 2.5;
  const happy = puffy.happyTimer > 0;
  const eyeR  = happy ? er * 1.4 : er;

  g.beginFill(0xffffff); g.drawCircle(ex, ey, eyeR); g.endFill();
  g.beginFill(0x006688); g.drawCircle(ex+0.8, ey, eyeR*0.66); g.endFill();
  g.beginFill(0x111111); g.drawCircle(ex+1.3, ey, eyeR*0.38); g.endFill();
  g.beginFill(0xffffff, 0.92); g.drawCircle(ex+eyeR*0.28, ey-eyeR*0.3, eyeR*0.22); g.endFill();
  if (happy) {
    g.beginFill(0xffffff, 0.9);
    g.drawCircle(ex+eyeR+3, ey-3, 2); g.drawCircle(ex+eyeR, ey-eyeR-2, 1.5); g.drawCircle(ex-2, ey-eyeR-2, 1.5);
    g.endFill();
  }
  g.beginFill(0xff99cc, happy ? 0.65 : 0.5); g.drawEllipse(ex-2, ey+eyeR+2, happy ? 10 : 8, 4); g.endFill();
}

function drawSunny(puff, finPhase, t) {
  const g = puffyGfx;
  g.clear();

  const br  = 10 + puff * 8;
  const bry = br * 0.88;

  const poisoned = puffy.poisonTimer > 0;
  const speeding = puffy.speedTimer  > 0;
  const bodyCol  = poisoned ? 0x9933cc : speeding ? 0xff9900 : 0xff6622;
  const tailCol  = poisoned ? 0x440066 : speeding ? 0xaa4400 : 0xdd4400;
  const finCol   = poisoned ? 0x7722bb : speeding ? 0xffcc00 : 0xff8833;

  if (poisoned) {
    const pulse = 0.4 + 0.35 * Math.sin(t * 4);
    g.beginFill(0xaa00ff, pulse * 0.18); g.drawCircle(0, 0, br + 7); g.endFill();
    g.lineStyle(1.5, 0xff00ff, pulse * 0.7); g.drawCircle(0, 0, br + 4); g.lineStyle(0);
  }
  if (speeding) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 10);
    [-5, 0, 5].forEach((oy, i) => {
      const len = 18 - i * 3;
      g.lineStyle(1.8 - i * 0.3, 0xffaa00, (0.5 + 0.3 * pulse) * (1 - i * 0.2));
      g.moveTo(-br - len, oy); g.lineTo(-br, oy);
    });
    g.lineStyle(0);
  }

  g.beginFill(bodyCol); g.drawEllipse(0, 0, br, bry); g.endFill();
  // White stripe
  g.beginFill(0xffffff, 0.9); g.drawEllipse(0, 0, br * 0.2, bry * 0.92); g.endFill();
  g.lineStyle(1, 0x333333, 0.3); g.drawEllipse(0, 0, br * 0.2, bry * 0.92); g.lineStyle(0);

  g.beginFill(tailCol); g.drawPolygon([-br, -6, -br-14, -12-puff*3, -br-14, 12+puff*3, -br, 6]); g.endFill();

  const fa = finPhase;
  g.beginFill(finCol, 0.9);
  g.drawPolygon([3, -bry*0.15, 3+Math.cos(fa)*12, -bry*0.15-Math.sin(fa)*13, 3+Math.cos(fa+0.55)*8, -bry*0.15-Math.sin(fa+0.55)*8]);
  g.endFill();

  const ex = br * 0.36, ey = -bry * 0.18;
  const er = 4.5 + puff * 2.5;
  const happy = puffy.happyTimer > 0;
  const eyeR  = happy ? er * 1.4 : er;

  g.beginFill(0xffffff); g.drawCircle(ex, ey, eyeR); g.endFill();
  g.beginFill(0x1a60c0); g.drawCircle(ex+0.8, ey, eyeR*0.66); g.endFill();
  g.beginFill(0x111111); g.drawCircle(ex+1.3, ey, eyeR*0.38); g.endFill();
  g.beginFill(0xffffff, 0.92); g.drawCircle(ex+eyeR*0.28, ey-eyeR*0.3, eyeR*0.22); g.endFill();
  if (happy) {
    g.beginFill(0xffffff, 0.9);
    g.drawCircle(ex+eyeR+3, ey-3, 2); g.drawCircle(ex+eyeR, ey-eyeR-2, 1.5); g.drawCircle(ex-2, ey-eyeR-2, 1.5);
    g.endFill();
  }
  g.beginFill(0xff99aa, happy ? 0.6 : 0.38); g.drawEllipse(ex-2, ey+eyeR+2, happy ? 10 : 7, 3.5); g.endFill();

  if (happy) {
    g.beginFill(0x772200, 0.9); g.drawEllipse(ex+2, ey+eyeR+8, 8, 5); g.endFill();
    g.beginFill(0xff6622, 0.95); g.drawEllipse(ex+2, ey+eyeR+4.5, 8, 5); g.endFill();
  } else if (puff > 0.55) {
    g.beginFill(0x994400); g.drawCircle(ex+4, ey+er+6, 4); g.endFill();
    g.beginFill(0xff8866, 0.85); g.drawCircle(ex+4, ey+er+6, 2.4); g.endFill();
  } else {
    g.beginFill(0x994400, 0.75); g.drawEllipse(ex+4, ey+er+5, 4.5, 2.2); g.endFill();
    g.beginFill(0xff6622, 0.85); g.drawEllipse(ex+4, ey+er+3.5, 4.5, 2.2); g.endFill();
  }
}

function drawPlayer(puff, finPhase, t) {
  if      (selectedChar === 1) drawBubbles(puff, finPhase, t);
  else if (selectedChar === 2) drawSunny(puff, finPhase, t);
  else                         drawPuffy(puff, finPhase, t);
}

// ─── Main loop ───────────────────────────────────────────────
let t = 0;

app.ticker.add(delta => {
  t += delta * 0.016;

  updateCaustics(t, levelTransition);
  updateCaveWalls(t, caveActive ? 0 : levelTransition);

  // Level 1 ambience (bubbles, seaweed, crabs, fish) fades to alpha 0 once we're
  // fully inside the cave. Once invisible, stop both updating AND rendering it —
  // otherwise Level 2 keeps redrawing all of it every frame behind the opaque
  // rock, doing all of Level 1's work on top of the cave. That was the L2 lag.
  const bgVisible = levelTransition < 1;
  seaweedLayer.visible = crabLayer.visible = fishLayer.visible = bubbleLayer.visible = bgVisible;
  if (bgVisible) {
    updateBubbles();
    updateSeaweed(t);
    updateCrab(delta);
    updateFishes(t, delta);
    seaweedLayer.alpha = 1 - levelTransition;
    crabLayer.alpha    = 1 - levelTransition;
    fishLayer.alpha    = 0.32 * (1 - levelTransition);
    bubbleLayer.alpha  = 1 - levelTransition;
  }

  puffy.finPhase += delta * 0.12;

  if (gameState === 'idle') {
    puffy.y     = H / 2 + Math.sin(t * 1.9) * 11;
    puffy.puff  = (Math.sin(t * 1.4) + 1) * 0.22;
    puffy.angle = Math.sin(t * 1.9) * 0.08;

  } else if (gameState === 'playing') {
    // Level 2 transition
    if (gameLevel === 1 && score >= LEVEL2_SCORE) {
      gameLevel    = 2;
      levelBannerT = 3.0;
      startCaveTunnel(puffy.y);   // cave mouth opens where the fish is
      // Clear any upcoming columns so none sit at the cave entrance.
      for (let i = obstacles.length - 1; i >= 0; i--) {
        if (obstacles[i].g.x + PIPE_W > puffy.x) {
          obstacleLayer.removeChild(obstacles[i].g);
          obstacles.splice(i, 1);
        }
      }
      if (!level2MusicStarted) {
        level2MusicStarted = true;
        crossfadeTo('audio/glass-pulse.mp3', true);
      }
    }
    if (gameLevel === 2 && levelTransition < 1) {
      levelTransition = Math.min(1, levelTransition + delta * 0.008);
      caveBgSprite.alpha = levelTransition;
    }

    if (gameLevel === 2) {
      // ── Continuous cave tunnel (replaces columns in L2) ──
      updateCaveTunnel(delta);
      caveScoreDist += gameSpeed * delta;
      while (caveScoreDist >= CAVE_SCORE_DIST) {
        caveScoreDist -= CAVE_SCORE_DIST;
        score++;
        if (score > hiScore) hiScore = score;
      }
      cavePearlDist += gameSpeed * delta;
      if (cavePearlDist >= CAVE_PEARL_DIST) {
        cavePearlDist -= CAVE_PEARL_DIST;
        spawnCavePearls();
      }
    } else {
      // Spawn by world-distance, not a timer: the newest (rightmost) column must
      // travel `nextSpacing` units past the spawn point before the next appears.
      // This keeps spacing exact even when a speed boost or poison changes speed.
      const newest = obstacles[obstacles.length - 1];
      if (!newest || (W + 5) - newest.g.x >= nextSpacing) spawnObstacle();
    }

    // Scroll/cull columns (active in L1; any leftovers finish leaving in L2).
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.g.x -= gameSpeed * delta;
      o.g.y  = Math.sin(t * o.bobSpeed + o.bobPhase) * o.bobAmp;

      if (!o.passed && o.g.x + PIPE_W < puffy.x) {
        o.passed = true;
        if (gameLevel === 1) { score++; if (score > hiScore) hiScore = score; }
      }

      if (o.g.x + PIPE_W < -10) {
        obstacleLayer.removeChild(o.g); o.g.destroy();
        obstacles.splice(i, 1);
      }
    }

    updatePearls(t, delta);

    // Anglerfish: spawn + scroll + patrol in Level 2, after a short grace
    // period so the player eases into the cave before the predator appears.
    if (gameLevel === 2 && score >= LEVEL2_SCORE + 8) {
      anglerSpawnDist += gameSpeed * delta;
      if (anglerSpawnDist >= ANGLER_SPACING) {
        anglerSpawnDist -= ANGLER_SPACING;
        spawnAngler();
      }
    }
    for (let i = anglerfish.length - 1; i >= 0; i--) {
      const a = anglerfish[i];
      a.x -= gameSpeed * delta;
      // Keep the predator lurking inside the winding passage, not in the rock.
      const e = caveEdgesAt(a.x);
      if (e) {
        const c    = (e.ceil + e.floor) / 2;
        const room = Math.max(6, (e.floor - e.ceil) / 2 - 24);
        a.y = c + Math.max(-room, Math.min(room, Math.sin(t * a.speed + a.phase) * a.amp));
      } else {
        a.y = a.baseY + Math.sin(t * a.speed + a.phase) * a.amp;
      }
      a.g.x = a.x;
      a.g.y = a.y;
      if (a.x < -70) {
        anglerLayer.removeChild(a.g); a.g.destroy();
        anglerfish.splice(i, 1);
      }
    }

    puffy.vy += GRAVITY * delta;
    puffy.y  += puffy.vy * delta;

    if (puffy.poisonTimer > 0) {
      puffy.poisonTimer -= delta * 0.016;
      puffy.puff = 1.0;
    } else if (puffy.puffTimer > 0) {
      puffy.puffTimer -= delta;
      puffy.puff = Math.max(0, puffy.puffTimer / 16);
    } else {
      puffy.puff = 0;
    }

    if (puffy.shrinkTimer > 0) puffy.shrinkTimer -= delta * 0.016;
    if (puffy.happyTimer  > 0) puffy.happyTimer  -= delta * 0.016;
    if (puffy.speedTimer  > 0) puffy.speedTimer  -= delta * 0.016;
    const baseSpd = gameLevel === 2 ? PIPE_SPD_L2 : PIPE_SPD;
    gameSpeed = puffy.speedTimer > 0 ? baseSpd * 1.7 : puffy.poisonTimer > 0 ? baseSpd * 0.6 : baseSpd;
    if (comboBurst > 1) comboBurst = Math.max(1, comboBurst - delta * 0.06);

    puffy.angle = Math.min(Math.max(puffy.vy * 0.058, -0.5), 1.3);

    if (hitTest()) { gameState = 'dead'; handleDeath(); }

  } else if (gameState === 'dead') {
    puffy.vy    = Math.min(puffy.vy + GRAVITY * delta, 6);
    puffy.y    += puffy.vy * delta;
    puffy.angle = Math.min(puffy.angle + 0.05 * delta, 1.6);
    puffy.puff  = Math.min(puffy.puff + 0.02 * delta, 1);
    puffy.y     = Math.min(puffy.y, GROUND_Y - 20);
  }

  puffyGfx.x        = puffy.x;
  puffyGfx.y        = puffy.y;
  puffyGfx.rotation = puffy.angle;
  puffyGfx.scale.set(puffy.poisonTimer > 0 ? 1.2 : puffy.shrinkTimer > 0 ? 0.6 : 1.0);
  drawPlayer(puffy.puff, puffy.finPhase, t);

  // ── Combo display ──
  if (starCombo >= 1 && gameState === 'playing') {
    comboText.visible = true;
    comboText.text = `★ ×${starCombo}`;
    comboText.style.fill = starCombo >= 4 ? 0xff4400 : starCombo >= 3 ? 0xff8800 : starCombo >= 2 ? 0xffdd44 : 0xffffff;
    comboText.x = puffy.x;
    comboText.y = Math.max(28, puffy.y - 36);
    comboText.alpha = 0.85 + 0.15 * Math.sin(t * 5);
    comboText.scale.set(comboBurst);
  } else {
    comboText.visible = false;
  }

  // ── Float texts ──
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const ft = floatTexts[i];
    ft.y -= 1.2;
    ft.life -= delta * 0.016;
    ft.alpha = Math.min(1, ft.life / 0.3);
    if (ft.life <= 0) { uiLayer.removeChild(ft); floatTexts.splice(i, 1); }
  }

  // ── Level banner ──
  if (levelBannerT > 0) {
    levelBannerT -= delta * 0.016;
    levelBanner.visible = true;
    const fadeIn  = Math.min(1, (3.0 - levelBannerT) / 0.4);
    const fadeOut = levelBannerT < 0.7 ? levelBannerT / 0.7 : 1;
    levelBanner.alpha = Math.min(fadeIn, fadeOut);
  } else {
    levelBanner.visible = false;
  }

  // ── Score HUD ──
  const showScore = gameState !== 'idle';
  scoreText.visible = showScore;
  hiText.visible    = showScore;
  if (showScore) {
    scoreText.text = score;
    hiText.text    = `BEST  ${hiScore}`;
  }

  // ── Name input visibility ──
  nameInput.style.display = gameState === 'idle' && !showHelp && !showLeader && !showCharSelect ? 'block' : 'none';

  // ── Help button + modal ──
  const onIdle = gameState === 'idle';
  helpBtnGfx.visible   = onIdle;
  helpBtnLabel.visible = onIdle;
  lbBtnGfx.visible     = onIdle;
  charBtnGfx.visible   = onIdle;
  helpModal.visible    = showHelp;
  lbModal.visible      = showLeader;
  charModal.visible    = showCharSelect;
  if (showHelp)       helpCloseHint.alpha = 0.4 + 0.4 * Math.sin(t * 2.5);
  if (showLeader)     lbCloseHint.alpha   = 0.4 + 0.4 * Math.sin(t * 2.5);
  if (showCharSelect) charCloseHint.alpha = 0.4 + 0.4 * Math.sin(t * 2.5);

  // ── Title screen ──
  titleScreen.visible = onIdle;
  if (onIdle) {
    titleText.y   = H / 2 - 80 + Math.sin(t * 1.4) * 6;
    tapText.alpha = 0.5 + 0.5 * Math.sin(t * 2.8);
  }

  // ── Game-over screen ──
  gameOverScreen.visible = gameState === 'dead';
  if (gameState === 'dead') {
    ohNoText.text    = `Oh no, ${CHAR_NAMES[selectedChar]}!`;
    goScoreText.text = `score  ${score}`;
    goBestText.text  = `best  ${hiScore}`;
    retryText.alpha  = 0.5 + 0.5 * Math.sin(t * 2.8);
  }
});
