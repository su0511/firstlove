/*  Responsive — Type Motion (balanced blue-green)
 *  - EB Garamond Regular
 *  - 3 hush (different sizes) start visible; HOVER on a hush → fade out; leave → fade in
 *  - Tracking widened for hush & for foreground words (soft/breathe)
 *  - Foreground floaters: breathe (5~6), soft (8), sizes fixed in [10,18], avoid hush areas
 *    -> During runtime: NO size changes (only position drifts). Positions/sizes re-randomize on page refresh.
 *  - Animated gradient + svg texture + soft grain + slow blurred falling symbols
 *  Place A1.svg next to this file. Press S to save a frame.
 */

let W, H;
let svgTex, grainLayer;
let TRACKING_PX;


const FONT_NAME = "EB Garamond";
const WORD_HUSH = "hush";

// ==== Colors (between blue & aqua; softer than v2, cooler than v1) ====
const BASE_A   = [210, 240, 245]; // cool aqua-blue
const BASE_B   = [235, 245, 240]; // faint warmish white-green
const SIDE_TINT= [205, 235, 240]; // left soft aqua overlay

// ==== Tracking controls (as fraction of font size; tweak to taste) ====
const TRACK_HUSH_FACTOR  = 0.08; // hush letter-spacing ~= 8% of size
const TRACK_FRONT_FACTOR = 0.06; // front words letter-spacing ~= 6% of size

// ==== Three hush anchors (relative coords & relative size) ====
const hushAnchors = [
  { u: 0.53, v: 0.60, sizeFactor: 0.16 }, // biggest
  { u: 0.76, v: 0.44, sizeFactor: 0.085 },// mid
  { u: 0.28, v: 0.24, sizeFactor: 0.08 }  // small
];

let hushes = [];       // HushController[]
let symbols = [];      // background soft symbols (slow, blurred, no size change)
let frontWords = [];   // foreground floaters (soft + breathe), fixed size 10~18

// Count configuration for front words (fixed at setup; changes only on refresh)
const BREATHE_MIN = 5, BREATHE_MAX = 6;
const SOFT_COUNT = 7;

// Fixed size range for front words
const FRONT_SIZE_MIN = 12;
const FRONT_SIZE_MAX = 20;

/* ===================== Preload / Setup / Resize ===================== */

function preload() {
  svgTex = loadImage("A1.svg");
}
function setup() {
  createOrResizeCanvas();
  frameRate(60);
  textFont(FONT_NAME);
  noStroke();

  // ==== 随机生成 tracking 值（每次刷新都会变化） ====
  TRACKING = {
    hush:    0.10 + random(-0.015, 0.015), // 大 hush → 大字距
    soft:    0.12 + random(-0.02, 0.02),   // soft → 更宽
    breathe: 0.14 + random(-0.02, 0.02),   // breathe → 最宽
    symbol:  0.00                           // 符号不需要 tracking
  };

  regenerateGrain();
  regenerateSymbols();
  regenerateHushes();
  regenerateFrontWords();
}


function windowResized() {
  // Keep front words' positions relative to viewport (no re-randomization)
  // Store their u,v before resizing so we can recompute x,y after
  frontWords.forEach(fw => {
    fw.u = fw.x / W;
    fw.v = fw.y / H;
  });

  createOrResizeCanvas();

  regenerateGrain();
  // Recreate symbols to match new canvas (non-critical)
  regenerateSymbols();
  // Recompute hush sizes/positions
  regenerateHushes();

  // Recompute front words x,y from stored u,v; keep sizes the same
  frontWords.forEach(fw => {
    fw.x = fw.u * W;
    fw.y = fw.v * H;
  });
}

function createOrResizeCanvas() {
  W = windowWidth;
  H = windowHeight;
  if (!this._p5Created) {
    createCanvas(W, H);
    this._p5Created = true;
  } else {
    resizeCanvas(W, H);
  }
}

/* ===================== Generators ===================== */

function regenerateGrain() {
  grainLayer = createGraphics(W, H);
  grainLayer.clear();
  grainLayer.noStroke();
  for (let i = 0; i < W * H * 0.0022; i++) {
    const x = random(W), y = random(H);
    grainLayer.fill(255, random(12, 30));
    grainLayer.circle(x, y, random(0.7, 1.5));
  }
  
}

function regenerateSymbols() {
  symbols = [];
  for (let i = 0; i < 28; i++) symbols.push(new SoftSymbol());
}

function regenerateHushes() {
  hushes = hushAnchors.map(a => new HushController({
    x: a.u * W,
    y: a.v * H,
    size: min(W, H) * a.sizeFactor,
    blur: 3.5,
    alphaMax: 170,
    track: TRACK_HUSH_FACTOR
  }));
}

function regenerateFrontWords() {
  frontWords = [];

  const breatheCount = floor(random(BREATHE_MIN, BREATHE_MAX + 1)); // 5 or 6
  const softCount    = SOFT_COUNT; // 8

  // helper: sample a position that avoids all hush areas (avoid radius ~ 0.85 * hush size)
  const pickPosAvoidingHush = (triesMax = 90, padding = 0.85) => {
    for (let tries = 0; tries < triesMax; tries++) {
      const u = random(0.05, 0.95);
      const v = random(0.06, 0.94);
      const x = u * W;
      const y = v * H;
      let ok = true;
      for (const h of hushes) {
        const avoidR = h.size * padding;
        if (dist(x, y, h.x, h.y) < avoidR) { ok = false; break; }
      }
      if (ok) return { u, v, x, y };
    }
    // fallback
    const u = random(), v = random();
    return { u, v, x: u * W, y: v * H };
  };

  // create breathe (fixed size 10~18, lighter alpha), widened tracking
  for (let i = 0; i < breatheCount; i++) {
    const { u, v, x, y } = pickPosAvoidingHush();
    frontWords.push(new FloaterWord({
      text: "breathe",
      u, v, x, y,
      size: random(FRONT_SIZE_MIN, FRONT_SIZE_MAX),
      baseAlpha: random(35, 70),
      blurPx: random([0.8, 1.2, 1.6]),
      speed: random(0.08, 0.16), // gentle
      drift: random(0.30, 0.50), // gentle
      trackFactor: TRACK_FRONT_FACTOR
    }));
  }

  // create soft (fixed size 10~18, a bit stronger alpha), widened tracking
  for (let i = 0; i < softCount; i++) {
    const { u, v, x, y } = pickPosAvoidingHush();
    frontWords.push(new FloaterWord({
      text: "soft",
      u, v, x, y,
      size: random(FRONT_SIZE_MIN, FRONT_SIZE_MAX),
      baseAlpha: random(60, 95),
      blurPx: random([0.8, 1.0, 1.4]),
      speed: random(0.08, 0.16),
      drift: random(0.30, 0.50),
      trackFactor: TRACK_FRONT_FACTOR
    }));
  }
}

/* ===================== Draw Loop ===================== */

function draw() {
  drawAnimatedGradient();
  drawSvgTexture(80);

  // background slow blurred symbols
  for (let s of symbols) s.updateAndDraw();

  // three hush (hover to fade)
  for (let h of hushes) h.updateAndDraw();

  // foreground floaters (fixed sizes; only position drifts)
  for (let fw of frontWords) fw.updateAndDraw();

  image(grainLayer, 0, 0); // soft grain on top
}

function keyPressed() {
  if (key === 'S' || key === 's') saveCanvas('hush-responsive', 'png');
}

/* ===================== Background painters ===================== */

function drawAnimatedGradient() {
  const t = frameCount * 0.0022;
  const a = 0.18 * sin(t * 0.8);
  const b = 0.15 * sin(t * 0.9 + 1.1);

  const c1 = color(
    BASE_A[0] + 10 * a,
    BASE_A[1] + 8  * a,
    BASE_A[2] + 14 * a
  );
  const c2 = color(
    BASE_B[0] + 12 * b,
    BASE_B[1] + 12 * b,
    BASE_B[2] + 10 * b
  );

  // vertical gradient
  for (let y = 0; y < H; y++) {
    const m = y / H;
    const row = lerpColor(c1, c2, m * 0.9);
    stroke(row);
    line(0, y, W, y);
  }
  noStroke();

  // left → right soft aqua overlay
  for (let x = 0; x < W; x++) {
    const m = x / W;
    fill(SIDE_TINT[0], SIDE_TINT[1], SIDE_TINT[2], map(1 - m, 0, 1, 0, 80));
    rect(x, 0, 1, H);
  }

  // vignette glow
  push();
  noFill();
  drawingContext.save();
  drawingContext.filter = 'blur(26px)';
  stroke(255, 70);
  strokeWeight(120);
  rect(-60, -60, W + 120, H + 120, 60);
  drawingContext.restore();
  pop();
}

function drawSvgTexture(alpha = 80) {
  if (!svgTex) return;
  push();
  tint(255, alpha);
  const ar = svgTex.width / svgTex.height;
  let w = W, h = W / ar;
  if (h < H) { h = H; w = H * ar; }
  image(svgTex, (W - w) / 2, (H - h) / 2, w, h);
  pop();
}

/* ===================== Classes ===================== */

// --- Hush (hover to fade; wider tracking) ---
class HushController {
  constructor({x, y, size, blur, alphaMax, track = TRACK_HUSH_FACTOR}) {
    Object.assign(this, {x, y, size, blur, alphaMax, track});
    this.alpha = alphaMax;
    this.phase = random(TAU);    // subtle drift phase
    this.targetAlpha = alphaMax; // hover sets to 0, else back to alphaMax
    this.ease = 0.04;            // fade smoothing
    const trackPx = this.size * TRACKING.hush;
drawTrackedTextCentered(WORD_HUSH, this.size, trackPx);

  }
  updateAndDraw() {
    // hover region ~ circle with radius proportional to size
    const hoverR = this.size * 0.58;
    const hovering = dist(mouseX, mouseY, this.x, this.y) <= hoverR;
    this.targetAlpha = hovering ? 0 : this.alphaMax;

    // ease alpha toward target
    this.alpha += (this.targetAlpha - this.alpha) * this.ease;

    // subtle drift
    const dx = 2.0 * sin((frameCount + this.phase) * 0.02);
    const dy = 1.4 * cos((frameCount + this.phase) * 0.018);

    // draw tracked hush at center
    const trackPx = this.size * this.track;
    push();
    translate(this.x + dx, this.y + dy);
    drawingContext.save();
    drawingContext.filter = `blur(${this.blur}px)`;
    fill(64, 121, 114, this.alpha);
    drawTrackedTextCentered(WORD_HUSH, this.size, trackPx);
    drawingContext.restore();
    pop();
  }
}

// --- Foreground floaters (soft / breathe) ---
// Fixed sizes; only position drifts; start away from hush areas.
// Positions & sizes re-randomize ONLY on refresh (not while running).
class FloaterWord {
  constructor({text, u, v, x, y, size, baseAlpha, blurPx = 1, speed = 0.12, drift = 0.45, trackFactor = TRACK_FRONT_FACTOR}) {
    Object.assign(this, {text, u, v, x, y, size, baseAlpha, blurPx, speed, drift});
    this.trackFactor = trackFactor;
    this.seed = random(1000);
    this.fadeOffset = random(1000);
    const trackPx = this.size * (this.text === "soft" ? TRACKING.soft : TRACKING.breathe);
drawTrackedTextCentered(this.text, this.size, trackPx);

  }
  updateAndDraw() {
    const t = frameCount * this.speed;

    // noise flow (gentle)
    const vx = (noise(this.seed, t * 0.01) - 0.5) * this.drift;
    const vy = (noise(this.seed + 99, t * 0.01) - 0.5) * this.drift;
    this.x = (this.x + vx + W) % W;
    this.y = (this.y + vy + H) % H;

    // push away softly if entering hush zones (keep avoiding during motion)
    for (const h of hushes) {
      const avoidR = h.size * 0.80;
      const d = dist(this.x, this.y, h.x, h.y);
      if (d < avoidR && d > 0.0001) {
        const push = (avoidR - d) * 0.08;
        this.x += (this.x - h.x) / d * push;
        this.y += (this.y - h.y) / d * push;
      }
    }

    // breathing alpha (keep very gentle)
    const breathAlpha = 0.5 + 0.5 * sin((frameCount + this.fadeOffset) * 0.01);
    const alpha = this.baseAlpha * (0.65 + 0.35 * breathAlpha);

    // fixed size; NO size pulse
    const trackPx = this.size * this.trackFactor;

    push();
    translate(this.x, this.y);
    drawingContext.save();
    drawingContext.filter = `blur(${this.blurPx}px)`;
    fill(30, alpha);
    drawTrackedTextCentered(this.text, this.size, trackPx);
    drawingContext.restore();
    pop();
  }
}

// --- Background soft geometric symbols ---
// Slower fall, constant size, always blurred.
class SoftSymbol {
  constructor() { this.reset(true); }
  reset(init=false) {
    this.x = random(W); this.y = init ? random(H) : -20;
    this.r = random(TAU); this.rs = random(-0.002, 0.002); // slower rotation
    this.k = random(["—","·","□","◇","/","×"]);
    this.sz = random(12, 20); // constant size
    this.sp = random(0.012, 0.030); // slower fall speed
    this.al = random(60, 95);
    this.wobble = random(1000);
    this.blurPx = 1.2; // always blurred
  }
  updateAndDraw() {
    this.y += this.sp * 14; // gentle descent
    this.x += sin(frameCount * 0.008 + this.wobble) * 0.35;
    this.r += this.rs;
    if (this.y > H + 30) this.reset();

    push();
    translate(this.x, this.y);
    rotate(this.r);
    drawingContext.save();
    drawingContext.filter = `blur(${this.blurPx}px)`;
    fill(30, this.al);
    textSize(this.sz); // NO size change while falling
    textAlign(CENTER, CENTER);
    text(this.k, 0, 0);
    drawingContext.restore();
    pop();
  }
}

/* ===================== Tracked Text Helpers ===================== */

// Draw centered text with custom tracking (letter-spacing)
// We simulate tracking by placing characters manually with extra advance.
function drawTrackedTextCentered(str, sizePx, trackPx) {
  push();
  textSize(sizePx);
  textAlign(LEFT, BASELINE);
  const tw = trackedTextWidth(str, sizePx, trackPx);
  let x = -tw / 2;
  let y = sizePx * 0.35; // optical baseline tweak for EB Garamond
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    text(ch, x, y);
    x += textWidth(ch) + trackPx;
  }
  pop();
}

function trackedTextWidth(str, sizePx, trackPx) {
  push();
  textSize(sizePx);
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    w += textWidth(str[i]);
    if (i < str.length - 1) w += trackPx;
  }
  pop();
  return w;
}
