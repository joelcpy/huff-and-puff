const W = 400, H = 600;

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

// ─── Background music (playlist) ─────────────────────────────
const TRACKS = ['audio/huffandpuff.mp3', 'audio/coconut-compass.mp3'];
let trackIndex = 0;
const bgMusic = new Audio(TRACKS[trackIndex]);
bgMusic.volume = 0.4;
bgMusic.addEventListener('ended', () => {
  trackIndex = (trackIndex + 1) % TRACKS.length;
  bgMusic.src = TRACKS[trackIndex];
  bgMusic.play();
});
function startMusic() { bgMusic.play().catch(() => {}); }
const autoplay = bgMusic.play();
if (autoplay !== undefined) {
  autoplay.catch(() => {
    // Browser blocked autoplay — start on first interaction instead
    document.addEventListener('keydown',    startMusic, { once: true });
    app.view.addEventListener('click',      startMusic, { once: true });
    app.view.addEventListener('touchstart', startMusic, { once: true });
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
titleText.y = H / 2 - 60;
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
tapText.y = H / 2 + 20;
titleScreen.addChild(tapText);

// ─── Game-over screen ────────────────────────────────────────
const gameOverScreen = new PIXI.Container();
gameOverScreen.visible = false;
uiLayer.addChild(gameOverScreen);

const goBg = new PIXI.Graphics();
goBg.beginFill(0x000a1a, 0.78);
goBg.drawRoundedRect(18, 62, W - 36, 400, 14);
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
ohNoText.y = 90;
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
goScoreText.y = 140;
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
goBestText.y = 170;
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
goLeaderHeader.y = 205;
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
  lt.y = 228 + i * 22;
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
retryText.y = 438;
gameOverScreen.addChild(retryText);

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
  [-1, 0, 1].forEach(i => {
    const g    = new PIXI.Graphics();
    pearlLayer.addChild(g);
    const rand = Math.random();
    const type = boosted
      ? (rand < 0.45 ? 'starfish' : rand < 0.53 ? 'poison' : rand < 0.62 ? 'speed' : 'regular')
      : (rand < 0.74 ? 'regular'  : rand < 0.86 ? 'starfish' : rand < 0.92 ? 'poison' : 'speed');
    pearls.push({ g, x: cx, y: mid + i * spread, type });
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
      if (p.type === 'starfish') starCombo = 0;
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
  if (gameState === 'idle') gameState = 'playing';
  puffy.vy        = FLAP_VY;
  puffy.puffTimer = 16;
}

document.addEventListener('keydown', e => {
  if (e.code === 'Space' && document.activeElement !== nameInput) { e.preventDefault(); doFlap(); }
});
app.view.addEventListener('click', doFlap);
app.view.addEventListener('touchstart', e => { e.preventDefault(); doFlap(); }, { passive: false });

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

    if (now - lastSpawnMs > PIPE_MS) spawnObstacle(now);

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
    gameSpeed = puffy.speedTimer > 0 ? PIPE_SPD * 1.7 : PIPE_SPD;
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
  drawPuffy(puffy.puff, puffy.finPhase, t);

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
  nameInput.style.display = gameState === 'idle' ? 'block' : 'none';

  // ── Title screen ──
  titleScreen.visible = gameState === 'idle';
  if (gameState === 'idle') {
    titleText.y   = H / 2 - 60 + Math.sin(t * 1.4) * 6;
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
