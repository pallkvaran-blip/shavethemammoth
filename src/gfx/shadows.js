// Sun shadow maps. We store linear light-space depth in a float texture so
// materials can measure how much stuff lies between them and the sun (soft,
// absorbing shadows) instead of a hard yes/no test.
import * as THREE from 'three';

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class SunShadow {
  constructor(width, height, layer, floatLinear = true) {
    this.layer = layer;
    this.target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RedFormat,
      type: THREE.FloatType,
      minFilter: floatLinear ? THREE.LinearFilter : THREE.NearestFilter,
      magFilter: floatLinear ? THREE.LinearFilter : THREE.NearestFilter,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.target.texture.wrapS = this.target.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.camera.layers.set(layer);
    this.matrix = new THREE.Matrix4();
    this.info = new THREE.Vector4();
    this._clear = new THREE.Color(1, 1, 1);
    this._old = new THREE.Color();
  }

  /**
   * Fit the light frustum: centre point, half extents across the light, depth
   * range. With `snap`, the centre moves only in whole texels, so shadows do
   * not shimmer as the map follows something.
   */
  fit(center, sunDir, halfW, halfH, depth, snap = false) {
    const cam = this.camera;
    if (snap) {
      const X = _x.crossVectors(_up, sunDir).normalize(), Y = _y.crossVectors(sunDir, X);
      const tx = (2 * halfW) / this.target.width, ty = (2 * halfH) / this.target.height;
      const cx = Math.round(center.dot(X) / tx) * tx, cy = Math.round(center.dot(Y) / ty) * ty, cz = center.dot(sunDir);
      center = _c.set(0, 0, 0).addScaledVector(X, cx).addScaledVector(Y, cy).addScaledVector(sunDir, cz);
    }
    cam.left = -halfW; cam.right = halfW; cam.top = halfH; cam.bottom = -halfH;
    cam.near = 0.5; cam.far = depth;
    cam.position.copy(center).addScaledVector(sunDir, depth * 0.5);
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    this.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    this.info.set(0.5 / halfW, 0.5 / halfH, cam.far - cam.near, 1);
  }

  resize(width, height) {
    this.target.setSize(width, height);
  }

  bind(uTex, uMat, uInfo) {
    uTex.value = this.target.texture;
    uMat.value.copy(this.matrix);
    uInfo.value.copy(this.info);
  }

  /** Render the casters (objects on this map's layer that carry userData.shadowMaterial). */
  render(renderer, scene, casters, before, after) {
    const swapped = [];
    for (const o of casters) {
      if (!o.visible || !o.userData.shadowMaterial) continue;
      swapped.push(o, o.material);
      o.material = o.userData.shadowMaterial;
    }
    if (before) before();
    const background = scene.background;
    scene.background = null; // a background colour would overwrite the cleared depth
    renderer.getClearColor(this._old);
    const oldAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(this._clear, 1);
    renderer.clear(true, true, false);
    renderer.render(scene, this.camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(this._old, oldAlpha);
    scene.background = background;
    if (after) after();
    for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
  }
}

/** Depth-only material for ordinary rigid meshes. */
export function makeDepthMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }`,
    side: opts.side ?? THREE.DoubleSide,
  });
}
