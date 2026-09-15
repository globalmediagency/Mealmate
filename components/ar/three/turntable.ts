import * as THREE from "three";
import { buildCreatureMesh, CREATURE_HEIGHT_UNITS, type CreatureMesh, type CreatureMeshInput } from "./creature-mesh";

export { textureFromSvg } from "./textures";

const MIN_PITCH = -0.2;
const MAX_PITCH = 1.3;
/** Turns per second while the automatic rotation is on. */
const AUTO_TURN = 0.05;

/**
 * A creature alone on a small stage, seen by an orbiting camera (admin
 * "Créatures" tab, spec § 3.20): the same volumes as "Voir en vrai" without
 * a marker. Throws when WebGL is unavailable.
 */
export class Turntable {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
  private readonly holder = new THREE.Group();
  private readonly target = new THREE.Vector3(0, CREATURE_HEIGHT_UNITS * 0.5, 0);
  private readonly disposables: { dispose(): void }[] = [];
  private readonly clock = new THREE.Clock();
  private mesh: CreatureMesh | null = null;
  private raf: number | null = null;
  /** Orbit angles (radians) and distance (marker sides). */
  yaw = 0.4;
  pitch = 0.32;
  distance = 4.7;
  autoRotate = true;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setClearColor(0x000000, 0);
    this.resize(width, height);
    this.scene.add(this.holder);
    const discGeometry = new THREE.CircleGeometry(0.75, 48);
    const discMaterial = new THREE.MeshBasicMaterial({ color: 0x1c2a22, transparent: true, opacity: 0.55 });
    const disc = new THREE.Mesh(discGeometry, discMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.002;
    this.scene.add(disc);
    this.disposables.push(discGeometry, discMaterial);
    const sky = new THREE.HemisphereLight(0xfff6e8, 0x6b5a48, 2.1);
    this.scene.add(sky);
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(1.2, 2.4, 2);
    this.scene.add(sun);
    this.loop = this.loop.bind(this);
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Replaces the creature on the stage. */
  setCreature(input: CreatureMeshInput) {
    if (this.mesh) {
      this.holder.remove(this.mesh.root);
      this.mesh.dispose();
    }
    this.mesh = buildCreatureMesh(input);
    this.holder.add(this.mesh.root);
  }

  rotate(deltaYaw: number, deltaPitch: number) {
    this.yaw += deltaYaw;
    this.pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, this.pitch + deltaPitch));
  }

  start() {
    if (this.raf === null) this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private loop() {
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.clock.getDelta();
    if (typeof document !== "undefined" && document.hidden) return;
    if (this.autoRotate) this.yaw += dt * AUTO_TURN * Math.PI * 2;
    this.mesh?.animate(this.clock.elapsedTime);
    const cosPitch = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + this.distance * Math.sin(this.yaw) * cosPitch,
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * Math.cos(this.yaw) * cosPitch,
    );
    this.camera.lookAt(this.target);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.stop();
    this.mesh?.dispose();
    this.mesh = null;
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
  }
}
