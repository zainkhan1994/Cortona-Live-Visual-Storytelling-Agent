/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable:organize-imports
// tslint:disable:ban-malformed-import-paths
// tslint:disable:no-new-decorators

import {LitElement, css, html} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {Analyser} from './analyser';

import * as THREE from 'three';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {FXAAShader} from 'three/addons/shaders/FXAAShader.js';
import {fs as backdropFS, vs as backdropVS} from './backdrop-shader';
import {vs as sphereVS} from './sphere-shader';

/**
 * 3D live audio visual.
 */
@customElement('gdm-live-audio-visuals-3d')
export class GdmLiveAudioVisuals3D extends LitElement {
  private inputAnalyser!: Analyser;
  private outputAnalyser!: Analyser;
  private camera!: THREE.PerspectiveCamera;
  private backdrop!: THREE.Mesh;
  private composer!: EffectComposer;
  private sphere!: THREE.Mesh;
  private prevTime = 0;
  private rotation = new THREE.Vector3(0, 0, 0);

  private _outputNode!: AudioNode;

  @property()
  set outputNode(node: AudioNode) {
    this._outputNode = node;
    this.outputAnalyser = new Analyser(this._outputNode);
  }

  get outputNode() {
    return this._outputNode;
  }

  private _inputNode!: AudioNode;

  @property()
  set inputNode(node: AudioNode) {
    this._inputNode = node;
    this.inputAnalyser = new Analyser(this._inputNode);
  }

  get inputNode() {
    return this._inputNode;
  }

  private _imageUrl: string = '';
  private objectSprite?: THREE.Sprite;

  @property()
  set imageUrl(url: string) {
    this._imageUrl = url;
    if (url && this.objectSprite) {
      new THREE.TextureLoader().load(url, (texture) => {
        this.objectSprite!.material.map = texture;
        this.objectSprite!.material.needsUpdate = true;
        this.objectSprite!.visible = true;
        this.sphere.visible = false;
      });
    } else if (!url && this.objectSprite && this.sphere) {
      this.objectSprite.visible = false;
      this.sphere.visible = true;
    }
  }

  get imageUrl() {
    return this._imageUrl;
  }

  @property({type: Number}) mode = 0;
  @property({type: String}) emoji = '';
  @property({type: String}) orbColor = '#000010';
  @property({type: Number}) orbSpeed = 1;
  @property({type: Number}) orbIntensity = 1;

  private canvas!: HTMLCanvasElement;
  private overlayImage!: HTMLImageElement;
  private overlayEmoji!: HTMLDivElement;
  private bloomPass!: UnrealBloomPass;

  static styles = css`
    canvas {
      width: 100% !important;
      height: 100% !important;
      position: absolute;
      inset: 0;
      image-rendering: pixelated;
    }
    .overlay-container {
      position: absolute;
      inset: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 5;
    }
    .overlay-image {
      position: absolute;
      top: 50%;
      left: 50%;
      max-width: 50vmin;
      max-height: 50vmin;
      border-radius: 20px;
      box-shadow: 0 0 40px rgba(0,0,0,0.8);
      transition: opacity 0.3s;
      transform-origin: center;
      opacity: 0;
    }
    .overlay-emoji {
      position: absolute;
      top: 50%;
      left: 50%;
      font-size: 30vmin;
      transition: opacity 0.3s;
      transform-origin: center;
      text-shadow: 0 0 40px rgba(255,255,255,0.2);
      opacity: 0;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  private init() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: {value: new THREE.Vector2(1, 1)},
          rand: {value: 0},
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);
    this.backdrop = backdrop;

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(2, -2, 5);
    this.camera = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio / 1);

    const geometry = new THREE.IcosahedronGeometry(1, 10);

    new EXRLoader().load('piz_compressed.exr', (texture: THREE.Texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
    });

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x000010,
      metalness: 0.5,
      roughness: 0.1,
      emissive: 0x000010,
      emissiveIntensity: 1.5,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = {value: 0};
      shader.uniforms.inputData = {value: new THREE.Vector4()};
      shader.uniforms.outputData = {value: new THREE.Vector4()};

      sphereMaterial.userData.shader = shader;

      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false;

    this.sphere = sphere;

    const spriteMaterial = new THREE.SpriteMaterial({
      color: 0xffffff,
      blending: THREE.NormalBlending,
      transparent: true,
    });
    const objectSprite = new THREE.Sprite(spriteMaterial);
    objectSprite.scale.set(4, 4, 1);
    objectSprite.visible = false;
    scene.add(objectSprite);
    this.objectSprite = objectSprite;

    const renderPass = new RenderPass(scene, camera);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      5,
      0.5,
      0,
    );
    this.bloomPass = bloomPass;

    const fxaaPass = new ShaderPass(FXAAShader);

    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    // composer.addPass(fxaaPass);
    composer.addPass(bloomPass);

    this.composer = composer;

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      backdrop.material.uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
      fxaaPass.material.uniforms['resolution'].value.set(
        1 / (w * dPR),
        1 / (h * dPR),
      );
    }

    window.addEventListener('resize', onWindowResize);
    onWindowResize();

    this.animation();
  }

  private animation() {
    requestAnimationFrame(() => this.animation());

    this.inputAnalyser.update();
    this.outputAnalyser.update();

    const t = performance.now();
    const dt = (t - this.prevTime) / (1000 / 60);
    this.prevTime = t;
    const backdropMaterial = this.backdrop.material as THREE.RawShaderMaterial;
    const sphereMaterial = this.sphere.material as THREE.MeshStandardMaterial;

    backdropMaterial.uniforms.rand.value = Math.random() * 10000;

    const audioScale = 1 + (0.5 * this.outputAnalyser.data[1]) / 255 + (0.5 * this.inputAnalyser.data[1]) / 255;

    // Handle Modes
    if (this.mode === 0) { // HTML Image
      this.sphere.visible = true;
      if (this.objectSprite) this.objectSprite.visible = false;
      this.bloomPass.strength = 5;
      sphereMaterial.color.setHex(0x000010);
      sphereMaterial.emissive.setHex(0x000010);
    } else if (this.mode === 1) { // Abstract Orb
      this.sphere.visible = true;
      if (this.objectSprite) this.objectSprite.visible = false;
      this.bloomPass.strength = 5;
      sphereMaterial.color.set(this.orbColor);
      sphereMaterial.emissive.set(this.orbColor);
    } else if (this.mode === 2) { // Emoji
      this.sphere.visible = true;
      if (this.objectSprite) this.objectSprite.visible = false;
      this.bloomPass.strength = 2;
      sphereMaterial.color.setHex(0x000010);
      sphereMaterial.emissive.setHex(0x000010);
    } else if (this.mode === 3) { // 3D Sprite
      this.sphere.visible = false;
      if (this.objectSprite && this.imageUrl) this.objectSprite.visible = true;
      this.bloomPass.strength = 1.5;
    }

    // Apply DOM transforms
    if (this.overlayImage) {
      this.overlayImage.style.transform = `translate(-50%, -50%) scale(${this.mode === 0 && this.imageUrl ? audioScale : 0})`;
      this.overlayImage.style.opacity = this.mode === 0 && this.imageUrl ? '1' : '0';
    }
    if (this.overlayEmoji) {
      this.overlayEmoji.style.transform = `translate(-50%, -50%) scale(${this.mode === 2 && this.emoji ? audioScale : 0})`;
      this.overlayEmoji.style.opacity = this.mode === 2 && this.emoji ? '1' : '0';
    }

    const speedMult = this.mode === 1 ? this.orbSpeed : 1;
    const intMult = this.mode === 1 ? this.orbIntensity : 1;

    if (sphereMaterial.userData.shader) {
      this.sphere.scale.setScalar(
        1 + (0.2 * intMult * this.outputAnalyser.data[1]) / 255,
      );

      const f = 0.001 * speedMult;
      this.rotation.x += (dt * f * 0.5 * this.outputAnalyser.data[1]) / 255;
      this.rotation.z += (dt * f * 0.5 * this.inputAnalyser.data[1]) / 255;
      this.rotation.y += (dt * f * 0.25 * this.inputAnalyser.data[2]) / 255;
      this.rotation.y += (dt * f * 0.25 * this.outputAnalyser.data[2]) / 255;

      const euler = new THREE.Euler(
        this.rotation.x,
        this.rotation.y,
        this.rotation.z,
      );
      const quaternion = new THREE.Quaternion().setFromEuler(euler);
      const vector = new THREE.Vector3(0, 0, 5);
      vector.applyQuaternion(quaternion);
      this.camera.position.copy(vector);
      this.camera.lookAt(this.sphere.position);

      sphereMaterial.userData.shader.uniforms.time.value +=
        (dt * 0.1 * speedMult * this.outputAnalyser.data[0]) / 255;
      sphereMaterial.userData.shader.uniforms.inputData.value.set(
        (1 * intMult * this.inputAnalyser.data[0]) / 255,
        (0.1 * intMult * this.inputAnalyser.data[1]) / 255,
        (10 * intMult * this.inputAnalyser.data[2]) / 255,
        0,
      );
      sphereMaterial.userData.shader.uniforms.outputData.value.set(
        (2 * intMult * this.outputAnalyser.data[0]) / 255,
        (0.1 * intMult * this.outputAnalyser.data[1]) / 255,
        (10 * intMult * this.outputAnalyser.data[2]) / 255,
        0,
      );
    }

    if (this.objectSprite && this.objectSprite.visible) {
      const scaleBase = 4;
      this.objectSprite.scale.set(scaleBase * audioScale, scaleBase * audioScale, 1);
    }

    this.composer.render();
  }

  protected firstUpdated() {
    this.canvas = this.shadowRoot!.querySelector('canvas') as HTMLCanvasElement;
    this.overlayImage = this.shadowRoot!.querySelector('.overlay-image') as HTMLImageElement;
    this.overlayEmoji = this.shadowRoot!.querySelector('.overlay-emoji') as HTMLDivElement;
    this.init();
  }

  protected render() {
    return html`
      <canvas></canvas>
      <div class="overlay-container">
        <img class="overlay-image" src=${this.imageUrl} />
        <div class="overlay-emoji">${this.emoji}</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'gdm-live-audio-visuals-3d': GdmLiveAudioVisuals3D;
  }
}
