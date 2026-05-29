const W  = 400;
const H  = Math.max(600, Math.round(W * window.innerHeight / window.innerWidth));
const PY = Math.round((H - 600) / 2);

// ─── App ─────────────────────────────────────────────────────
const app = new PIXI.Application({
  width: W, height: H,
  antialias: true,
  backgroundColor: 0x061525,
  resolution: window.devicePixelRatio || 1,
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

function positionNameInput() {
  const vw    = window.visualViewport ? window.visualViewport.width  : window.innerWidth;
  const vh    = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const scale = Math.min(vw / W, vh / H);
  const cw    = Math.floor(W * scale);
  const ch    = Math.floor(H * scale);
  const ox    = (vw - cw) / 2;
  const oy    = (vh - ch) / 2;
  nameInput.style.width    = Math.floor(cw * 0.58) + 'px';
  nameInput.style.fontSize = Math.floor(14 * scale) + 'px';
  nameInput.style.left     = Math.floor(cw / 2) + 'px';
  nameInput.style.top      = Math.floor(oy + (H / 2 + 72) * scale) + 'px';
  nameInput.style.padding  = Math.floor(5 * scale) + 'px ' + Math.floor(14 * scale) + 'px';
}

function resize() {
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
const obstacleLayer = new PIXI.Container(); // coral obstacles
const pearlLayer    = new PIXI.Container(); // collectible pearls
const playerLayer   = new PIXI.Container(); // Puffy the pufferfish
const uiLayer       = new PIXI.Container(); // HUD text
fishLayer.alpha = 0.32;
app.stage.addChild(bgLayer, causticLayer, fishLayer, bubbleLayer, seaweedLayer, obstacleLayer, pearlLayer, playerLayer, uiLayer);

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

function updateCaustics(t) {
  caustics.forEach(c => {
    c.g.clear();
    const w = Math.sin(t * c.speed + c.phase);
    c.g.beginFill(0x88ddff, c.alpha * (0.65 + 0.35 * w));
    c.g.drawEllipse(c.x, c.y, c.rx * (1 + 0.22 * w), c.ry);
    c.g.endFill();
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

    b.g.clear();
    b.g.lineStyle(1, 0xaaddff, b.alpha * 0.75);
    b.g.beginFill(0xffffff, b.alpha * 0.1);
    b.g.drawCircle(b.x, b.y, b.r);
    b.g.endFill();
    b.g.beginFill(0xffffff, b.alpha * 0.65);
    b.g.drawCircle(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.27);
    b.g.endFill();
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

const ohNoText = new PIXI.Text('Oh no, Puffy!', {
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
for (let i = 0; i < 8; i++) {
  const lt = new PIXI.Text('', {
    fontFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
    fontSize: 13,
    fill: 0xffffff,
    stroke: 0x003a6e,
    strokeThickness: 2,
  });
  lt.anchor.set(0.5);
  lt.x = W / 2;
  lt.y = 228 + PY + i * 22;
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
for (let i = 0; i < 8; i++) {
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
  for (let i = 1; i < 8; i++) lbEntries[i].text = '';
  const top = await getTopScores(8);
  if (!showLeader) return;
  top.forEach((entry, i) => {
    const n = entry.name.length > 10 ? entry.name.slice(0, 10) + '…' : entry.name;
    lbEntries[i].text = `${i + 1}.  ${n}  ${entry.score}`;
    lbEntries[i].style.fill = i === 0 ? 0xffdd44 : i === 1 ? 0xccccdd : i === 2 ? 0xdd9944 : 0xffffff;
  });
  for (let i = top.length; i < 8; i++) lbEntries[i].text = '';
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
const PIPE_GAP = 195;
const PIPE_MS  = 1800;
const PIPE_SPD = 2.5;

const obstacles = [];
const pearls    = [];
let lastSpawnMs = 0;
let nextPipeMs  = 1800;
let gameSpeed      = PIPE_SPD;
let starCombo      = 0;
let comboBurst     = 1;
let nextSetBoost   = false;

function spawnPearls(topH, botY) {
  const cx      = W + 5 + PIPE_W / 2;
  const mid     = topH + (botY - topH) / 2;
  const spread  = (botY - topH) * 0.25;
  const boosted = nextSetBoost;
  nextSetBoost  = false;
  const colState = { starfishHit: false };
  [-1, 0, 1].forEach(i => {
    const g    = new PIXI.Graphics();
    pearlLayer.addChild(g);
    const rand = Math.random();
    const type = boosted
      ? (rand < 0.45 ? 'starfish' : rand < 0.53 ? 'poison' : rand < 0.62 ? 'speed' : 'regular')
      : (rand < 0.74 ? 'regular'  : rand < 0.86 ? 'starfish' : rand < 0.92 ? 'poison' : 'speed');
    pearls.push({ g, x: cx, y: mid + i * spread, type, colState });
  });
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

function spawnObstacle(now) {
  const minTop = 90;
  const maxTop = H - 80 - PIPE_GAP - 90;
  const topH   = minTop + Math.random() * (maxTop - minTop);
  const botY   = topH + PIPE_GAP;

  const g = new PIXI.Graphics();
  drawCoralPair(g, topH, botY);
  g.x = W + 5;
  obstacleLayer.addChild(g);

  spawnPearls(topH, botY);
  const moving = Math.random() < 0.6;
  obstacles.push({
    g, topH, botY, passed: false,
    bobAmp:   moving ? 20 + Math.random() * 20 : 0,
    bobSpeed: 0.8 + Math.random() * 0.7,
    bobPhase: Math.random() * Math.PI * 2,
  });
  lastSpawnMs = now;
  nextPipeMs  = 1300 + Math.random() * 1000;
}

function hitTest() {
  const r = puffy.poisonTimer > 0 ? 18 : puffy.shrinkTimer > 0 ? 5 : 8;
  if (puffy.y + r > GROUND_Y || puffy.y - r < 0) return true;
  for (const o of obstacles) {
    if (puffy.x + r > o.g.x + 3 && puffy.x - r < o.g.x + PIPE_W - 3) {
      if (puffy.y - r < o.topH + o.g.y || puffy.y + r > o.botY + o.g.y) return true;
    }
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
        puffy.poisonTimer = 3;
      } else if (p.type === 'speed') {
        puffy.speedTimer = 4;
      } else {
        score += 1;
      }
      puffy.happyTimer = 0.6;
      if (score > hiScore) hiScore = score;
      pearlLayer.removeChild(p.g);
      pearls.splice(i, 1);
      continue;
    }

    if (p.x < -20) {
      if (p.type === 'starfish' && !p.colState.starfishHit) starCombo = 0;
      pearlLayer.removeChild(p.g);
      pearls.splice(i, 1);
      continue;
    }

    const pulse = 0.7 + 0.3 * Math.sin(t * 3 + p.y * 0.1);
    p.g.clear();
    if (p.type === 'starfish') {
      p.g.beginFill(0xff8833, 0.22 * pulse);
      p.g.drawCircle(p.x, p.y, 17);
      p.g.endFill();
      const spts = [];
      for (let si = 0; si < 10; si++) {
        const sa = (si / 10) * Math.PI * 2 - Math.PI / 2;
        const sr = si % 2 === 0 ? 11 : 5;
        spts.push(p.x + Math.cos(sa) * sr, p.y + Math.sin(sa) * sr);
      }
      p.g.beginFill(0xff7722);
      p.g.drawPolygon(spts);
      p.g.endFill();
      p.g.beginFill(0xffcc44, 0.75);
      p.g.drawCircle(p.x, p.y, 4);
      p.g.endFill();
    } else {
      p.g.beginFill(0x88ccff, 0.15 * pulse);
      p.g.drawCircle(p.x, p.y, 11);
      p.g.endFill();
      p.g.beginFill(0xf5f0ff);
      p.g.drawCircle(p.x, p.y, 6);
      p.g.endFill();
      p.g.beginFill(0xffbbee, 0.5);
      p.g.drawCircle(p.x, p.y, 4.5);
      p.g.endFill();
    }
    if (p.type === 'speed') {
      p.g.beginFill(0x00ddcc, 0.25 * pulse);
      p.g.drawCircle(p.x, p.y, 13);
      p.g.endFill();
      p.g.beginFill(0x00bbaa);
      p.g.drawCircle(p.x, p.y, 7);
      p.g.endFill();
      p.g.beginFill(0x88ffee, 0.85);
      p.g.drawCircle(p.x, p.y, 4.5);
      p.g.endFill();
      p.g.lineStyle(1.2, 0x00ffdd, 0.7);
      [-3, 0, 3].forEach(oy => {
        p.g.moveTo(p.x - 11, p.y + oy);
        p.g.lineTo(p.x - 7,  p.y + oy);
      });
      p.g.lineStyle(0);
    } else if (p.type === 'poison') {
      p.g.beginFill(0x9900cc, 0.20 * pulse);
      p.g.drawCircle(p.x, p.y, 16);
      p.g.endFill();
      for (let si = 0; si < 12; si++) {
        const sa   = (si / 12) * Math.PI * 2;
        const tipX = p.x + Math.cos(sa) * 12;
        const tipY = p.y + Math.sin(sa) * 12;
        const b1x  = p.x + Math.cos(sa - 0.18) * 5;
        const b1y  = p.y + Math.sin(sa - 0.18) * 5;
        const b2x  = p.x + Math.cos(sa + 0.18) * 5;
        const b2y  = p.y + Math.sin(sa + 0.18) * 5;
        p.g.beginFill(0xcc44ff, 0.9);
        p.g.drawPolygon([b1x, b1y, tipX, tipY, b2x, b2y]);
        p.g.endFill();
      }
      p.g.beginFill(0x440055);
      p.g.drawCircle(p.x, p.y, 5.5);
      p.g.endFill();
      p.g.beginFill(0xdd88ff, 0.75);
      p.g.drawCircle(p.x, p.y, 3);
      p.g.endFill();
    }
    p.g.beginFill(0xffffff, 0.9);
    p.g.drawCircle(p.x - 2, p.y - 2, 1.8);
    p.g.endFill();
  }
}

let deathHandled = false;

async function handleDeath() {
  if (deathHandled) return;
  deathHandled = true;
  goLeaderEntries[0].text = 'loading…';
  for (let i = 1; i < 5; i++) goLeaderEntries[i].text = '';

  const name = playerName.trim() || 'Anon';
  if (score > 0) await saveScore(name, score);
  const top = await getTopScores(8);

  top.forEach((entry, i) => {
    const n = entry.name.length > 9 ? entry.name.slice(0, 9) + '…' : entry.name;
    goLeaderEntries[i].text = `${i + 1}.  ${n}  ${entry.score}`;
    goLeaderEntries[i].style.fill = (entry.name === name && entry.score === score) ? 0xffdd44 : 0xffffff;
  });
  for (let i = top.length; i < 5; i++) goLeaderEntries[i].text = '';
}

function resetGame() {
  obstacles.forEach(o => obstacleLayer.removeChild(o.g));
  obstacles.length = 0;
  pearls.forEach(p => pearlLayer.removeChild(p.g));
  pearls.length = 0;
  lastSpawnMs = 0;
  nextPipeMs  = 1800;
  score       = 0;

  puffy.y = H / 2; puffy.vy = 0;
  puffy.puff = 0; puffy.puffTimer = 0; puffy.angle = 0;
  puffy.shrinkTimer = 0;
  puffy.happyTimer  = 0;
  puffy.poisonTimer = 0;
  puffy.speedTimer  = 0;
  gameSpeed         = PIPE_SPD;
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

  updateCaustics(t);
  updateBubbles();
  updateSeaweed(t);
  updateFishes(t, delta);

  puffy.finPhase += delta * 0.12;

  if (gameState === 'idle') {
    puffy.y     = H / 2 + Math.sin(t * 1.9) * 11;
    puffy.puff  = (Math.sin(t * 1.4) + 1) * 0.22;
    puffy.angle = Math.sin(t * 1.9) * 0.08;

  } else if (gameState === 'playing') {
    const now = performance.now();

    if (now - lastSpawnMs > nextPipeMs * (PIPE_SPD / gameSpeed)) spawnObstacle(now);

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.g.x -= gameSpeed * delta;
      o.g.y  = Math.sin(t * o.bobSpeed + o.bobPhase) * o.bobAmp;

      if (!o.passed && o.g.x + PIPE_W < puffy.x) {
        o.passed = true;
        score++;
        if (score > hiScore) hiScore = score;
      }

      if (o.g.x + PIPE_W < -10) {
        obstacleLayer.removeChild(o.g);
        obstacles.splice(i, 1);
      }
    }

    updatePearls(t, delta);

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
    gameSpeed = puffy.speedTimer > 0 ? PIPE_SPD * 1.7 : puffy.poisonTimer > 0 ? PIPE_SPD * 0.6 : PIPE_SPD;
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
    goScoreText.text = `score  ${score}`;
    goBestText.text  = `best  ${hiScore}`;
    retryText.alpha  = 0.5 + 0.5 * Math.sin(t * 2.8);
  }
});
