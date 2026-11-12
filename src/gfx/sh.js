// Project a radiance function onto 9 spherical-harmonic coefficients
// (same convention as three.js light probes).
import * as THREE from 'three';

export function projectSH(radiance, samples = 6000) {
  const c = Array.from({ length: 9 }, () => new THREE.Vector3());
  const d = new THREE.Vector3(), col = new THREE.Vector3();
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < samples; i++) {
    const y = 1 - (2 * (i + 0.5)) / samples;
    const r = Math.sqrt(1 - y * y), a = i * golden;
    d.set(Math.cos(a) * r, y, Math.sin(a) * r);
    radiance(d, col);
    const b = [
      0.282095, 0.488603 * d.y, 0.488603 * d.z, 0.488603 * d.x,
      1.092548 * d.x * d.y, 1.092548 * d.y * d.z, 0.315392 * (3 * d.z * d.z - 1),
      1.092548 * d.x * d.z, 0.546274 * (d.x * d.x - d.y * d.y),
    ];
    for (let k = 0; k < 9; k++) c[k].addScaledVector(col, b[k]);
  }
  const norm = (4 * Math.PI) / samples;
  for (const v of c) v.multiplyScalar(norm);
  return c;
}
