// Teaches three.js's built-in physical materials (tusks, eyes, rocks) to use
// the same sun shadows and atmosphere as the hand-written shaders.
import { COMMON, SHADOWS, ATMOSPHERE } from './glsl.js';
import { U } from './globals.js';

export function patchStandardMaterial(mat, { taps = 6, sigma = 160, bias = 0.02, radius = 0.03, extraFragment = '', extraUniforms = null, key = '' } = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    if (extraUniforms) Object.assign(shader.uniforms, extraUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        #define SHADOW_TAPS ${taps}
        #define SHADOW_PENUMBRA
        #define SHADOW_PLANE_BIAS
        varying vec3 vWPos;
        varying vec3 vWNormal;
        ${COMMON}
        ${SHADOWS}
        ${ATMOSPHERE}`)
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        {
          float sv = sunVisibility(vWPos + normalize(vWNormal) * 0.01, ${sigma.toFixed(1)}, ${bias.toFixed(4)}, ${radius.toFixed(4)}, ign(gl_FragCoord.xy));
          reflectedLight.directDiffuse *= sv;
          reflectedLight.directSpecular *= sv;
          #ifdef USE_CLEARCOAT
            clearcoatSpecularDirect *= sv;
          #endif
          #ifdef USE_SHEEN
            sheenSpecularDirect *= sv;
          #endif
        }`)
      .replace('#include <fog_fragment>', `${extraFragment}
        gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vWPos, cameraPosition);`);
  };
  mat.customProgramCacheKey = () => `sun-${taps}-${sigma}-${bias}-${radius}-${key}`;
  return mat;
}
