// Teaches three.js's built-in physical materials (tusks, eyes, rocks, tools,
// people) to use the same sun shadows and atmosphere as the hand-written
// shaders, and leaves doors open for a material to work its own surface out
// in code: its colour, its roughness, the grain of it, how light soaks in.
import { COMMON, SHADOWS, ATMOSPHERE } from './glsl.js';
import { U } from './globals.js';

/**
 * @param opts.vertexHead      declarations for the vertex shader
 * @param opts.extraVertex     statements run once the vertex is placed (vWPos and vWNormal are set)
 * @param opts.fragmentHead    declarations and functions for the fragment shader
 * @param opts.fragmentColor   statements that may change `diffuseColor`
 * @param opts.fragmentSurface statements that may change `roughnessFactor` and `metalnessFactor`
 * @param opts.fragmentNormal  statements that may change `normal` (in the eye's frame)
 * @param opts.fragmentMaterial statements that may change `material` (sheen, clearcoat, ...) once it is filled in
 * @param opts.fragmentLight   statements run with `sv` (how much sun reaches here, 0..1), to add light of the material's own
 * @param opts.fragmentAmbient statements run when all light is in, to hold some of it back (occlusion)
 * @param opts.extraFragment   statements run last, on `gl_FragColor`
 */
export function patchStandardMaterial(mat, {
  taps = 6, sigma = 160, bias = 0.02, radius = 0.03, key = '', extraUniforms = null,
  vertexHead = '', extraVertex = '', fragmentHead = '', fragmentColor = '', fragmentSurface = '', fragmentNormal = '',
  fragmentMaterial = '', fragmentLight = '', fragmentAmbient = '', extraFragment = '',
} = {}) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    if (extraUniforms) Object.assign(shader.uniforms, extraUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;\n${vertexHead}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNormal = normalize(mat3(modelMatrix) * objectNormal);
        ${extraVertex}`);
    let f = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        #define SHADOW_TAPS ${taps}
        #define SHADOW_PENUMBRA
        #define SHADOW_PLANE_BIAS
        varying vec3 vWPos;
        varying vec3 vWNormal;
        ${COMMON}
        ${SHADOWS}
        ${ATMOSPHERE}
        ${fragmentHead}`)
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
          ${fragmentLight}
        }`)
      .replace('#include <fog_fragment>', `${extraFragment}
        gl_FragColor.rgb = applyAtmosphere(gl_FragColor.rgb, vWPos, cameraPosition);`);
    if (fragmentColor) f = f.replace('#include <color_fragment>', `#include <color_fragment>\n${fragmentColor}`);
    if (fragmentSurface) f = f.replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${fragmentSurface}`);
    if (fragmentNormal) f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${fragmentNormal}`);
    if (fragmentMaterial) f = f.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${fragmentMaterial}`);
    if (fragmentAmbient) f = f.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${fragmentAmbient}`);
    shader.fragmentShader = f;
  };
  mat.customProgramCacheKey = () => `sun-${taps}-${sigma}-${bias}-${radius}-${key}`;
  return mat;
}
