// Uniforms shared by every material in the scene. Materials spread this object
// into their own uniform list, so one write here updates them all.
import * as THREE from 'three';

function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  // deterministic so screenshots are repeatable
  let s = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    data[i] = s & 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

const blackTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
blackTex.needsUpdate = true;

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunColor: { value: new THREE.Vector3(1, 1, 1) },
  uSH: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
  uNoise: { value: makeNoiseTexture() },
  uWind: { value: new THREE.Vector4(1, 0, 0.35, 0.65) },
  uExposureComp: { value: 1 },
  uPxScale: { value: 1000 },   // pixels per metre at one metre from the eye
  uToolNear: { value: 1 },     // 1 = a tool in hand is drawn a little nearer the eye than it is (see Kit); 0 = where it is

  uShadowNear: { value: blackTex },
  uShadowNearMat: { value: new THREE.Matrix4() },
  uShadowNearInfo: { value: new THREE.Vector4(1, 1, 1, 0) },
  uShadowFar: { value: blackTex },
  uShadowFarMat: { value: new THREE.Matrix4() },
  uShadowFarInfo: { value: new THREE.Vector4(1, 1, 1, 0) },
  uShadowElf: { value: blackTex },
  uShadowElfMat: { value: new THREE.Matrix4() },
  uShadowElfInfo: { value: new THREE.Vector4(1, 1, 1, 0) },

  uSkyLut: { value: blackTex },
  uFogParams: { value: new THREE.Vector4(0.004, 0.08, 0, 0.00004) },
  uFogTint: { value: new THREE.Vector3(1, 1, 1) },
};

export const LAYER_SHADOW_NEAR = 1;
export const LAYER_SHADOW_FAR = 2;
export const LAYER_SHADOW_ELF = 3;
