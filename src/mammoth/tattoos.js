// What is under the coat. He has lived a long time and made some decisions.
//
// Each tattoo is drawn here in ink on one shared sheet, and laid on the hide
// by projection: a place on the body (found by walking in from outside until
// the skin is met), a frame lying in the skin there, and a size. The skin's
// shader does the rest, and shows the ink only where the hair has come off.
// He is also wearing a thong, which is painted the same way (see THONG).
import * as THREE from 'three';

const INK = '#16242c', RED = '#9c241c', GREEN = '#1f5a3a';
const SERIF = "Georgia, 'Times New Roman', serif", BLOCK = "'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif";

/** Lettering, fitted to a width, with the slight bleed of old ink. */
function words(g, text, x, y, size, { font = SERIF, style = 'bold', colour = INK, fit = 0, align = 'center', spacing = 0 } = {}) {
  g.font = `${style} ${size}px ${font}`;
  if ('letterSpacing' in g) g.letterSpacing = `${spacing}px`;
  if (fit) { const w = g.measureText(text).width; if (w > fit) { size *= fit / w; g.font = `${style} ${size}px ${font}`; } }
  g.fillStyle = colour; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(text, x, y);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
}
const line = (g, pts, width, colour = INK, close = false) => {
  g.strokeStyle = colour; g.lineWidth = width; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
  g.stroke();
};
function heart(g, cx, cy, s, fill, stroke = INK, width = 6) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.75, cy - s * 1.15, cx, cy - s * 0.42);
  g.bezierCurveTo(cx + s * 0.75, cy - s * 1.15, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
  if (fill) { g.fillStyle = fill; g.fill(); }
  g.strokeStyle = stroke; g.lineWidth = width; g.stroke();
}
function banner(g, cx, cy, w, h, text, size) {
  g.fillStyle = 'rgba(22,36,44,0.12)'; g.strokeStyle = INK; g.lineWidth = Math.max(3, h * 0.07);
  g.beginPath();
  g.moveTo(cx - w / 2, cy - h / 2); g.quadraticCurveTo(cx, cy - h * 0.85, cx + w / 2, cy - h / 2);
  g.lineTo(cx + w / 2 + h * 0.35, cy); g.lineTo(cx + w / 2, cy + h / 2);
  g.quadraticCurveTo(cx, cy + h * 0.15, cx - w / 2, cy + h / 2); g.lineTo(cx - w / 2 - h * 0.35, cy);
  g.closePath(); g.fill(); g.stroke();
  words(g, text, cx, cy - h * 0.12, size, { fit: w * 0.86 });
}

// Every tattoo: where it is (a point outside him to start from, and the way to
// walk in), which way is up for it, how big (metres), and how it is drawn in a
// box w by h. `name` is what the game calls it when it is found.
export const TATTOOS = [
  {
    id: 'left', name: 'LEFT', from: [1.02, 0.3, 1.3], dir: [0, 0, -1], size: [0.2, 0.09],
    draw(g, w, h) { words(g, 'LEFT', w / 2, h * 0.52, h * 0.8, { font: BLOCK, style: '', fit: w * 0.9 }); },
  },
  {
    id: 'otherleft', name: 'OTHER LEFT', from: [1.02, 0.3, -1.3], dir: [0, 0, 1], size: [0.22, 0.12],
    draw(g, w, h) { words(g, 'OTHER', w / 2, h * 0.28, h * 0.46, { font: BLOCK, style: '', fit: w * 0.9 }); words(g, 'LEFT', w / 2, h * 0.74, h * 0.46, { font: BLOCK, style: '', fit: w * 0.9 }); },
  },
  {
    id: 'bestbefore', name: 'BEST BEFORE: END OF ICE AGE', from: [-1.22, 0.33, 1.3], dir: [0, 0, -1], size: [0.24, 0.15],
    draw(g, w, h) {
      let x = w * 0.08, seed = 5;
      while (x < w * 0.92) { seed = (seed * 16807) % 2147483647; const bw = 2 + (seed % 5) * 1.6; g.fillStyle = INK; g.fillRect(x, h * 0.08, bw, h * 0.5); x += bw + 2 + ((seed >> 4) % 4) * 1.7; }
      words(g, 'BEST BEFORE:', w / 2, h * 0.7, h * 0.14, { font: BLOCK, style: '', fit: w * 0.88 });
      words(g, 'END OF ICE AGE', w / 2, h * 0.87, h * 0.14, { font: BLOCK, style: '', fit: w * 0.88 });
    },
  },
  {
    id: 'thaw', name: 'IF FOUND FROZEN, DO NOT THAW', from: [-1.22, 0.33, -1.3], dir: [0, 0, 1], size: [0.24, 0.13],
    draw(g, w, h) {
      g.strokeStyle = INK; g.lineWidth = h * 0.04; g.strokeRect(w * 0.04, h * 0.07, w * 0.92, h * 0.86);
      words(g, 'IF FOUND FROZEN', w / 2, h * 0.34, h * 0.24, { font: BLOCK, style: '', fit: w * 0.82 });
      words(g, 'DO NOT THAW', w / 2, h * 0.68, h * 0.28, { font: BLOCK, style: '', colour: RED, fit: w * 0.82 });
    },
  },
  {
    id: 'cuthere', name: 'CUT HERE', from: [1.7, 0.4, 0.57], dir: [-1, 0, 0], size: [0.24, 0.07],
    draw(g, w, h) {
      g.strokeStyle = INK; g.lineWidth = h * 0.08; g.setLineDash([h * 0.3, h * 0.22]);
      g.beginPath(); g.moveTo(w * 0.02, h * 0.3); g.lineTo(w * 0.98, h * 0.3); g.stroke(); g.setLineDash([]);
      // a small pair of scissors on the line
      g.lineWidth = h * 0.07;
      for (const s of [-1, 1]) { g.beginPath(); g.arc(w * 0.1, h * 0.3 + s * h * 0.13, h * 0.09, 0, 7); g.stroke(); line(g, [[w * 0.12, h * 0.3 + s * h * 0.07], [w * 0.22, h * 0.3 - s * h * 0.08]], h * 0.06); }
      words(g, 'CUT HERE', w * 0.56, h * 0.72, h * 0.36, { font: BLOCK, style: '', fit: w * 0.7, spacing: 2 });
    },
  },
  {
    // a butcher's chart, for the convenience of whoever comes next
    id: 'butcher', name: "the butcher's chart", from: [-0.1, 1.82, 1.7], dir: [0, 0, -1], size: [1.3, 0.78],
    draw(g, w, h) {
      const lw = h * 0.012;
      g.setLineDash([lw * 4, lw * 3]);
      line(g, [[w * 0.05, h * 0.2], [w * 0.2, h * 0.07], [w * 0.5, h * 0.05], [w * 0.8, h * 0.08], [w * 0.95, h * 0.24], [w * 0.95, h * 0.72], [w * 0.8, h * 0.93], [w * 0.2, h * 0.93], [w * 0.05, h * 0.75]], lw, INK, true);
      line(g, [[w * 0.3, h * 0.06], [w * 0.27, h * 0.93]], lw); line(g, [[w * 0.56, h * 0.05], [w * 0.55, h * 0.93]], lw); line(g, [[w * 0.78, h * 0.08], [w * 0.8, h * 0.93]], lw);
      line(g, [[w * 0.28, h * 0.5], [w * 0.8, h * 0.52]], lw);
      g.setLineDash([]);
      const lab = (t, x, y, s = 0.075, c = INK) => words(g, t, w * x, h * y, h * s, { font: BLOCK, style: '', colour: c, fit: w * 0.22 });
      lab('RUMP', 0.165, 0.5); lab('LOIN', 0.42, 0.28); lab('RIBS', 0.67, 0.28); lab('CHUCK', 0.875, 0.5);
      lab('BELLY', 0.42, 0.73); lab('MORE BELLY', 0.67, 0.73, 0.06);
      lab('the good bit', 0.165, 0.68, 0.045, RED);
      line(g, [[w * 0.165, h * 0.64], [w * 0.165, h * 0.57]], lw * 0.8, RED);
      words(g, 'serves 400', w * 0.5, h * 0.985 - h * 0.02, h * 0.05, { style: 'italic' });
    },
  },
  {
    id: 'livelaugh', name: 'LIVE, LAUGH, GO EXTINCT', from: [-0.1, 1.86, -1.7], dir: [0, 0, 1], size: [1.1, 0.62],
    draw(g, w, h) {
      words(g, 'Live,', w * 0.3, h * 0.2, h * 0.26, { style: 'italic' });
      words(g, 'Laugh,', w * 0.56, h * 0.47, h * 0.26, { style: 'italic' });
      words(g, 'Go Extinct', w * 0.5, h * 0.78, h * 0.25, { style: 'italic bold', colour: RED, fit: w * 0.92 });
      // flourishes
      g.strokeStyle = INK; g.lineWidth = h * 0.012;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w * (0.5 + s * 0.1), h * 0.94); g.bezierCurveTo(w * (0.5 + s * 0.25), h * 0.9, w * (0.5 + s * 0.38), h * 1.0, w * (0.5 + s * 0.46), h * 0.9); g.stroke(); }
      heart(g, w * 0.82, h * 0.2, h * 0.07, RED, INK, h * 0.012);
    },
  },
  {
    id: 'mum', name: 'the heart for MUM', from: [1.0, 2.2, 1.7], dir: [0, 0, -1], size: [0.44, 0.44],
    draw(g, w, h) {
      heart(g, w * 0.5, h * 0.44, w * 0.3, 'rgba(156,36,28,0.85)', INK, w * 0.022);
      banner(g, w * 0.5, h * 0.52, w * 0.66, h * 0.2, 'MUM', h * 0.16);
      words(g, 'd. 9,994 BC', w * 0.5, h * 0.9, h * 0.085, { style: 'italic' });
      // an arrow through it, as is traditional
      line(g, [[w * 0.06, h * 0.2], [w * 0.3, h * 0.33]], w * 0.016); line(g, [[w * 0.7, h * 0.55], [w * 0.95, h * 0.69]], w * 0.016);
      line(g, [[w * 0.95, h * 0.69], [w * 0.87, h * 0.69]], w * 0.016); line(g, [[w * 0.95, h * 0.69], [w * 0.92, h * 0.61]], w * 0.016);
    },
  },
  {
    id: 'death', name: 'DEATH BEFORE SHAVING', from: [1.0, 2.2, -1.7], dir: [0, 0, 1], size: [0.5, 0.5],
    draw(g, w, h) {
      // crossed razors behind a skull
      for (const s of [-1, 1]) {
        g.save(); g.translate(w / 2, h * 0.42); g.rotate(s * 0.72);
        g.fillStyle = 'rgba(22,36,44,0.25)'; g.strokeStyle = INK; g.lineWidth = w * 0.014;
        g.fillRect(-w * 0.035, -h * 0.4, w * 0.07, h * 0.36); g.strokeRect(-w * 0.035, -h * 0.4, w * 0.07, h * 0.36);
        g.fillStyle = INK; g.fillRect(-w * 0.02, -h * 0.04, w * 0.04, h * 0.42);
        g.restore();
      }
      g.fillStyle = '#e9e2d0'; g.strokeStyle = INK; g.lineWidth = w * 0.02;
      g.beginPath(); g.ellipse(w / 2, h * 0.38, w * 0.17, h * 0.16, 0, 0, 7); g.fill(); g.stroke();
      g.beginPath(); g.rect(w * 0.41, h * 0.48, w * 0.18, h * 0.1); g.fill(); g.stroke();
      g.fillStyle = INK;
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + s * w * 0.07, h * 0.38, w * 0.045, h * 0.05, 0, 0, 7); g.fill(); }
      g.beginPath(); g.moveTo(w / 2, h * 0.43); g.lineTo(w * 0.48, h * 0.47); g.lineTo(w * 0.52, h * 0.47); g.fill();
      for (let i = 0; i < 4; i++) line(g, [[w * (0.445 + i * 0.037), h * 0.5], [w * (0.445 + i * 0.037), h * 0.58]], w * 0.008);
      banner(g, w / 2, h * 0.78, w * 0.74, h * 0.15, 'DEATH BEFORE SHAVING', h * 0.07);
    },
  },
  {
    // the small of the back, just ahead of where the thong goes over
    id: 'exit', name: 'EXIT ONLY', from: [-0.38, 4.0, 0], dir: [0, -1, 0], up: [1, 0, 0], size: [0.6, 0.3],
    draw(g, w, h) {
      g.strokeStyle = INK; g.lineWidth = h * 0.03;
      for (const s of [-1, 1]) {
        // wings
        for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(w * (0.5 + s * 0.2), h * (0.42 + i * 0.05)); g.bezierCurveTo(w * (0.5 + s * 0.32), h * (0.2 + i * 0.07), w * (0.5 + s * 0.42), h * (0.3 + i * 0.07), w * (0.5 + s * (0.48 - i * 0.03)), h * (0.18 + i * 0.12)); g.stroke(); }
      }
      words(g, 'EXIT ONLY', w / 2, h * 0.4, h * 0.3, { font: BLOCK, style: '', colour: RED, fit: w * 0.42 });
      // the arrow says which way
      g.fillStyle = INK; g.beginPath(); g.moveTo(w * 0.5, h * 0.98); g.lineTo(w * 0.44, h * 0.78); g.lineTo(w * 0.48, h * 0.78); g.lineTo(w * 0.48, h * 0.6); g.lineTo(w * 0.52, h * 0.6); g.lineTo(w * 0.52, h * 0.78); g.lineTo(w * 0.56, h * 0.78); g.closePath(); g.fill();
    },
  },
  {
    id: 'kiss', name: 'KISS THIS', from: [-2.5, 1.95, 1.0], dir: [0.76, 0, -0.65], size: [0.3, 0.3],
    draw(g, w, h) {
      g.fillStyle = 'rgba(156,36,28,0.9)';
      // a pair of lips
      g.beginPath(); g.moveTo(w * 0.14, h * 0.4); g.bezierCurveTo(w * 0.3, h * 0.16, w * 0.45, h * 0.22, w * 0.5, h * 0.3); g.bezierCurveTo(w * 0.55, h * 0.22, w * 0.7, h * 0.16, w * 0.86, h * 0.4); g.bezierCurveTo(w * 0.66, h * 0.44, w * 0.34, h * 0.44, w * 0.14, h * 0.4); g.fill();
      g.beginPath(); g.moveTo(w * 0.16, h * 0.44); g.bezierCurveTo(w * 0.36, h * 0.5, w * 0.64, h * 0.5, w * 0.84, h * 0.44); g.bezierCurveTo(w * 0.7, h * 0.72, w * 0.3, h * 0.72, w * 0.16, h * 0.44); g.fill();
      words(g, 'KISS THIS', w / 2, h * 0.86, h * 0.14, { font: BLOCK, style: '', fit: w * 0.86, spacing: 2 });
    },
  },
  {
    id: 'honk', name: 'HONK IF HORNY', from: [-2.5, 1.95, -1.0], dir: [0.76, 0, 0.65], size: [0.4, 0.17],
    draw(g, w, h) {
      g.fillStyle = 'rgba(233,226,208,0.9)'; g.strokeStyle = INK; g.lineWidth = h * 0.05;
      g.beginPath(); g.roundRect(w * 0.03, h * 0.08, w * 0.94, h * 0.84, h * 0.12); g.fill(); g.stroke();
      words(g, 'HONK IF HORNY', w / 2, h * 0.52, h * 0.4, { font: BLOCK, style: '', fit: w * 0.84 });
    },
  },
  {
    id: 'ride', name: 'MY OTHER RIDE IS YOUR MUM', from: [-2.4, 1.52, 0.75], dir: [0.82, 0.1, -0.56], size: [0.42, 0.15],
    draw(g, w, h) {
      g.fillStyle = 'rgba(22,36,44,0.88)'; g.beginPath(); g.roundRect(w * 0.02, h * 0.08, w * 0.96, h * 0.84, h * 0.1); g.fill();
      words(g, 'MY OTHER RIDE', w / 2, h * 0.34, h * 0.3, { font: BLOCK, style: '', colour: '#e9e2d0', fit: w * 0.86 });
      words(g, 'IS YOUR MUM', w / 2, h * 0.68, h * 0.3, { font: BLOCK, style: '', colour: '#e9a23a', fit: w * 0.86 });
    },
  },
  {
    id: 'nosy', name: "NOSY, AREN'T WE", from: [0.15, 0.5, 0], dir: [0, 1, 0], up: [1, 0, 0], size: [0.5, 0.15],
    draw(g, w, h) { words(g, 'NOSY, AREN’T WE', w / 2, h * 0.5, h * 0.5, { style: 'italic bold', fit: w * 0.94 }); },
  },
  {
    id: 'dnr', name: 'D.N.R.', from: [2.05, 0.75, 0.3], dir: [-0.5, 0.866, 0], size: [0.34, 0.22],
    draw(g, w, h) {
      words(g, 'D.N.R.', w / 2, h * 0.36, h * 0.5, { font: BLOCK, style: '', colour: RED, fit: w * 0.9 });
      words(g, 'do not resuscitate', w / 2, h * 0.7, h * 0.12, { style: 'italic', fit: w * 0.9 });
      words(g, '(seriously. it is far too warm now)', w / 2, h * 0.87, h * 0.085, { style: 'italic', fit: w * 0.9 });
    },
  },
  {
    // a ruler, down the trunk
    id: 'ruler', name: 'the ruler marked ACTUAL SIZE', from: [3.6, 1.25, 0], dir: [-1, 0, 0], size: [0.11, 0.62],
    draw(g, w, h) {
      g.strokeStyle = INK; g.lineWidth = w * 0.04; g.strokeRect(w * 0.14, h * 0.02, w * 0.4, h * 0.96);
      for (let i = 0; i <= 30; i++) { const y = h * (0.04 + (i / 30) * 0.92), long = i % 5 === 0; line(g, [[w * 0.14, y], [w * (long ? 0.38 : 0.27), y]], w * (long ? 0.035 : 0.02)); }
      g.save(); g.translate(w * 0.78, h * 0.5); g.rotate(Math.PI / 2);
      words(g, 'ACTUAL SIZE', 0, 0, w * 0.3, { font: BLOCK, style: '', fit: h * 0.8, spacing: 3 });
      g.restore();
    },
  },
  {
    id: 'hello', name: 'HELLO, my name is KEVIN', from: [3.3, 3.25, 0], dir: [-0.8, -0.6, 0], size: [0.34, 0.22],
    draw(g, w, h) {
      g.fillStyle = 'rgba(156,36,28,0.92)'; g.beginPath(); g.roundRect(w * 0.02, h * 0.04, w * 0.96, h * 0.92, h * 0.1); g.fill();
      g.fillStyle = 'rgba(233,226,208,0.95)'; g.fillRect(w * 0.06, h * 0.42, w * 0.88, h * 0.44);
      words(g, 'HELLO', w / 2, h * 0.19, h * 0.2, { font: BLOCK, style: '', colour: '#e9e2d0', fit: w * 0.8, spacing: 3 });
      words(g, 'my name is', w / 2, h * 0.345, h * 0.085, { colour: '#e9e2d0', style: '' });
      words(g, 'Kevin', w / 2, h * 0.64, h * 0.3, { style: 'italic bold', fit: w * 0.8 });
    },
  },
  {
    // on top, where only something that flies would see it
    id: 'pad', name: 'the landing pad (NO ELVES)', from: [0.35, 4.2, 0], dir: [0, -1, 0], up: [1, 0, 0], size: [0.74, 0.74],
    draw(g, w, h) {
      g.strokeStyle = INK; g.lineWidth = w * 0.03;
      g.beginPath(); g.arc(w / 2, h / 2, w * 0.44, 0, 7); g.stroke();
      g.setLineDash([w * 0.04, w * 0.03]); g.lineWidth = w * 0.012; g.beginPath(); g.arc(w / 2, h / 2, w * 0.38, 0, 7); g.stroke(); g.setLineDash([]);
      words(g, 'H', w / 2, h * 0.47, h * 0.46, { font: BLOCK, style: '' });
      words(g, 'NO ELVES', w / 2, h * 0.77, h * 0.09, { font: BLOCK, style: '', colour: RED, spacing: 2 });
    },
  },
  {
    id: 'property', name: 'PROPERTY OF (crossed out)', from: [1.75, 2.75, 1.6], dir: [-0.25, -0.2, -1], size: [0.4, 0.34],
    draw(g, w, h) {
      words(g, 'PROPERTY OF', w / 2, h * 0.12, h * 0.13, { font: BLOCK, style: '', fit: w * 0.9, spacing: 1 });
      const names = ['Gnorman', 'the last elf', 'that glacier', 'Tina'];
      names.forEach((n, i) => {
        const y = h * (0.3 + i * 0.15);
        words(g, n, w / 2, y, h * 0.12, { style: 'italic', fit: w * 0.8 });
        line(g, [[w * 0.14, y + h * 0.01], [w * 0.86, y - h * 0.015]], h * 0.018, RED);
      });
      words(g, 'NOBODY', w / 2, h * 0.9, h * 0.15, { font: BLOCK, style: '', colour: GREEN, fit: w * 0.8 });
    },
  },
];

/** The sheet of ink: every tattoo drawn into its own box. Returns the texture and where each one is on it. */
export function makeTattooSheet() {
  const W = 2048, H = 2048, pad = 8;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  // boxes are sized by how big the tattoo is on him (the small ones are looked at from closer, so they get more)
  const want = TATTOOS.map((t) => { const s = Math.min(2400, Math.max(1000, 600 / Math.max(t.size[0], t.size[1]))); return [Math.round(t.size[0] * s), Math.round(t.size[1] * s)]; });
  const order = TATTOOS.map((_, i) => i).sort((a, b) => want[b][1] - want[a][1]);
  const rects = new Array(TATTOOS.length);
  let x = pad, y = pad, row = 0;
  for (const i of order) {
    let [w, h] = want[i];
    if (w > W - 2 * pad) { h = Math.round(h * (W - 2 * pad) / w); w = W - 2 * pad; }
    if (x + w + pad > W) { x = pad; y += row + pad; row = 0; }
    rects[i] = [x, y, w, h];
    x += w + pad; row = Math.max(row, h);
  }
  const used = y + row + pad;
  const squeeze = used > H ? H / used : 1;       // (does not happen with the present set; kept so adding one cannot overflow)
  const paint = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    TATTOOS.forEach((t, i) => {
      const [rx, ry, rw, rh] = rects[i];
      g.save();
      g.setTransform(1, 0, 0, squeeze, rx, ry * squeeze);
      g.beginPath(); g.rect(0, 0, rw, rh); g.clip();
      g.shadowColor = 'rgba(22,36,44,0.55)'; g.shadowBlur = Math.max(1.5, rh * 0.006);       // old ink spreads a little
      t.draw(g, rw, rh);
      g.restore();
    });
  };
  paint();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.flipY = false;
  texture.premultiplyAlpha = true;       // (so that the soft edges of the ink filter cleanly; the shader divides it out again)
  // the lettering wants the page's own typefaces if they arrive late
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { paint(); texture.needsUpdate = true; });
  return { texture, rects: rects.map(([rx, ry, rw, rh]) => [rx / W, (ry * squeeze) / H, rw / W, (rh * squeeze) / H]) };
}

/**
 * Find where each tattoo sits on the hide. `body` answers dist(x, y, z) and
 * normal(x, y, z, out) for the mammoth standing at rest. Returns, for each,
 * its centre on the skin and the frame it lies in.
 */
export function placeTattoos(body) {
  const n = [0, 0, 0];
  return TATTOOS.map((t) => {
    const p = new THREE.Vector3(...t.from), d = new THREE.Vector3(...t.dir).normalize();
    let hit = false;
    for (let i = 0; i < 200; i++) {
      const dist = body.dist(p.x, p.y, p.z);
      if (dist < 0.003) { hit = true; break; }
      p.addScaledVector(d, Math.min(0.25, Math.max(dist * 0.8, 0.003)));
    }
    body.normal(p.x, p.y, p.z, n);
    const N = new THREE.Vector3(n[0], n[1], n[2]).normalize();
    const up = new THREE.Vector3(...(t.up || [0, 1, 0]));
    const V = up.addScaledVector(N, -up.dot(N));
    if (V.lengthSq() < 1e-4) V.set(1, 0, 0).addScaledVector(N, -N.x);
    V.normalize();
    const Uv = new THREE.Vector3().crossVectors(V, N);
    return { id: t.id, hit, centre: p.clone(), u: Uv, v: V, n: N, w: t.size[0] / 2, h: t.size[1] / 2 };
  });
}

/** Where he wears it (rest pose, metres): the band goes round him just ahead of the hind legs, the rest goes where a thong goes. */
export const THONG = { band: -0.8, wide: 0.06, strap: 0.05, split: 1.9, end: -2.14 };       // (end: where his tail begins, which wears nothing)

/** For the skin's shader: uniforms, and the two functions that say what is inked or worn at a point of the hide. */
export const TATTOO_COUNT = TATTOOS.length;
export const TATTOO_GLSL = /* glsl */ `
#define TATTOOS ${TATTOOS.length}
uniform sampler2D uTatSheet;
uniform vec4 uTatC[TATTOOS];     // centre on the skin (rest pose); w: how deep the projection reaches
uniform vec4 uTatU[TATTOOS];     // across it, divided by its half width
uniform vec4 uTatV[TATTOOS];     // up it, divided by its half height
uniform vec4 uTatN[TATTOOS];     // out of the skin there
uniform vec4 uTatR[TATTOOS];     // its box on the sheet
uniform float uTatOn;

// ink at this point of the hide: rgb is the colour it leaves, a how much of it there is
vec4 tattooInk(vec3 p, vec3 n, vec3 dpx, vec3 dpy) {
  vec4 ink = vec4(0.0);
  for (int i = 0; i < TATTOOS; i++) {
    vec3 d = p - uTatC[i].xyz;
    float x = dot(d, uTatU[i].xyz), y = dot(d, uTatV[i].xyz);
    if (abs(x) < 1.0 && abs(y) < 1.0 && abs(dot(d, uTatN[i].xyz)) < uTatC[i].w && dot(n, uTatN[i].xyz) > 0.25) {
      vec4 r = uTatR[i];
      vec2 uv = r.xy + vec2(x * 0.5 + 0.5, 0.5 - y * 0.5) * r.zw;
      vec2 gx = vec2(dot(dpx, uTatU[i].xyz), -dot(dpx, uTatV[i].xyz)) * 0.5 * r.zw;
      vec2 gy = vec2(dot(dpy, uTatU[i].xyz), -dot(dpy, uTatV[i].xyz)) * 0.5 * r.zw;
      vec4 t = textureGrad(uTatSheet, uv, gx, gy);
      // (the sheet holds ink times how much of it there is: divide that out, except where there is too little to trust the answer)
      t.rgb = mix(vec3(0.086, 0.14, 0.17), t.rgb / max(t.a, 0.004), smoothstep(0.04, 0.3, t.a));
      // fade out at the very edge of the box, so nothing is cut off square
      float edge = smoothstep(1.0, 0.94, max(abs(x), abs(y)));
      if (t.a * edge > ink.a) ink = vec4(t.rgb, t.a * edge);
    }
  }
  return ink;
}

// the thong: x is how much of it covers this point, y picks out its hems, z the stone on the back of it
vec3 thongAt(vec3 p) {
  const float band = ${THONG.band.toFixed(3)}, wide = ${THONG.wide.toFixed(3)}, strap = ${THONG.strap.toFixed(3)}, split = ${THONG.split.toFixed(2)}, end = ${THONG.end.toFixed(2)};
  float db = abs(p.x - band);
  float onBand = 1.0 - smoothstep(wide - 0.003, wide, db);
  // behind the band: a strap down the middle, widening to meet the band on top, and to a pouch underneath
  float topSide = step(split, p.y);
  float w = mix(strap + 0.5 * max(0.0, p.x - (band - 0.5)), strap * 0.8 + 0.9 * max(0.0, p.x - (band - 0.3)), topSide);
  float behind = step(p.x, band + wide) * step(end, p.x);
  float dz = abs(p.z);
  float onStrap = behind * (1.0 - smoothstep(w - 0.003, w, dz));
  float cover = max(onBand, onStrap);
  float hem = max(onBand * smoothstep(wide - 0.014, wide - 0.008, db), onStrap * (1.0 - onBand) * smoothstep(w - 0.014, w - 0.008, dz));
  float stone = topSide * (1.0 - smoothstep(0.016, 0.02, length(vec2(p.x - band, p.z))));
  return vec3(cover, hem, stone);
}
`;

/** The uniforms for the above, filled in from where the tattoos turned out to be. */
export function tattooUniforms(sheet, placed) {
  const vec = (fn) => placed.map(fn);
  return {
    uTatSheet: { value: sheet.texture },
    uTatC: { value: vec((t) => new THREE.Vector4(t.centre.x, t.centre.y, t.centre.z, 0.1 + 0.32 * Math.max(t.w, t.h))) },
    uTatU: { value: vec((t) => new THREE.Vector4(t.u.x / t.w, t.u.y / t.w, t.u.z / t.w, 0)) },
    uTatV: { value: vec((t) => new THREE.Vector4(t.v.x / t.h, t.v.y / t.h, t.v.z / t.h, 0)) },
    uTatN: { value: vec((t) => new THREE.Vector4(t.n.x, t.n.y, t.n.z, 0)) },
    uTatR: { value: sheet.rects.map((r) => new THREE.Vector4(...r)) },
    uTatOn: { value: 1 },
  };
}
