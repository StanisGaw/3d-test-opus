import * as THREE from 'three';
import { GUN_HEIGHT } from '../entities/player.ts';
import { CAMERA_DIR, CAMERA_DISTANCE } from '../gfx/iso.ts';

/** World units visible vertically; with 32 buffer pixels per unit this gives a 480px tall low-res frame. */
const VIEW_HEIGHT = 15;
const BUFFER_HEIGHT = 480;

/** Renderer, isometric camera, sun light, screen shake and mouse picking. */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly raycaster = new THREE.Raycaster();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GUN_HEIGHT);
  private shakeAmount = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.domElement.tabIndex = 0;
    container.appendChild(this.renderer.domElement);

    this.camera.position.copy(CAMERA_DIR).multiplyScalar(CAMERA_DISTANCE);
    this.camera.lookAt(0, 0, 0);

    this.scene.background = new THREE.Color(0x1b1f1a);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x6a6048, 1.45));
    this.sun = new THREE.DirectionalLight(0xfff0d0, 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const s = this.sun.shadow.camera;
    s.left = -24;
    s.right = 24;
    s.top = 24;
    s.bottom = -24;
    s.near = 1;
    s.far = 80;
    this.sun.shadow.bias = -0.002;
    this.scene.add(this.sun, this.sun.target);

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  focus(): void {
    this.renderer.domElement.focus();
  }

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(BUFFER_HEIGHT / h);
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.left = (-VIEW_HEIGHT * aspect) / 2;
    this.camera.right = (VIEW_HEIGHT * aspect) / 2;
    this.camera.top = VIEW_HEIGHT / 2;
    this.camera.bottom = -VIEW_HEIGHT / 2;
    this.camera.updateProjectionMatrix();
  };

  shake(amount: number): void {
    this.shakeAmount = Math.min(1, Math.max(this.shakeAmount, amount));
  }

  /** Centres the camera (and the shadow-casting sun) on a map position, with screen shake. */
  follow(x: number, y: number, dt: number): void {
    this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.5);
    const s = this.shakeAmount * this.shakeAmount * 0.6;
    const target = new THREE.Vector3(x + (Math.random() - 0.5) * s, 0, y + (Math.random() - 0.5) * s);
    this.camera.position.copy(target).addScaledVector(CAMERA_DIR, CAMERA_DISTANCE);
    this.sun.position.set(target.x - 12, 22, target.z + 6);
    this.sun.target.position.copy(target);
  }

  /**
   * Writes the map point under the mouse (at gun height) into `aimPoint` and returns the screen-space
   * angle from the hero's gun to the mouse, which the hero uses to face and rotate the gun.
   */
  aim(mouseX: number, mouseY: number, hero: { x: number; y: number }, aimPoint: { x: number; y: number }): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((mouseX - rect.left) / rect.width) * 2 - 1, -((mouseY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.aimPlane, hit)) {
      aimPoint.x = hit.x;
      aimPoint.y = hit.z;
    }
    const gun = new THREE.Vector3(hero.x, GUN_HEIGHT, hero.y).project(this.camera);
    return Math.atan2(ndc.y - gun.y, (ndc.x - gun.x) * (rect.width / rect.height));
  }

  /** Normalised device coordinates (-1..1) of a map position at height `h`. */
  project(x: number, h: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x, h, y).project(this.camera);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
