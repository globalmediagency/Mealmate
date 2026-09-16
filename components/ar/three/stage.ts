import * as THREE from "three";
import { cameraFovDeg, pickPose, posesFromCorners, type Pose3d } from "@/lib/ar/pose3d";
import type { Corner } from "../marker-camera";
import { buildCreatureMesh, type CreatureMesh, type CreatureMeshInput, type MouthPosition } from "./creature-mesh";

export { textureFromSvg } from "./textures";
export type { Corner } from "../marker-camera";

/** Weight of a new pose against the smoothed one (0–1): high enough to follow the hand, low enough to hide jitter. */
const SMOOTHING = 0.35;
/** Ground shadow radius in marker sides. */
const SHADOW_RADIUS = 0.42;

type Slot = {
  /** Marker frame: x right, y toward the top edge, z out of the paper. */
  group: THREE.Group;
  /** Turns the creature about the paper's normal (0 = facing the bottom edge). */
  turn: THREE.Group;
  mesh: CreatureMesh;
  /** Top of the creature above the paper, in marker sides. */
  top: number;
  /** Last raw pose kept, so the next frame picks the POSIT solution closest to it. */
  pose: Pose3d | null;
  fresh: boolean;
};

const bounds = new THREE.Box3();

const matrix = new THREE.Matrix4();
const nextQuaternion = new THREE.Quaternion();
const nextPosition = new THREE.Vector3();
const inverse = new THREE.Matrix4();
const rayOrigin = new THREE.Vector3();
const rayDirection = new THREE.Vector3();
/** Stands the creature on the paper: its up (+y) becomes the marker's z, its front (+z) the marker's bottom edge (−y). */
const STANDING = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

/**
 * Level 3 of "Voir en vrai" (spec § 3.19): a WebGL canvas laid over the
 * video, with one 3D creature per recognised marker placed from the full
 * POSIT pose. The virtual camera reproduces the phone camera's field of
 * view so the drawing lands on the paper. Throws when WebGL is unavailable:
 * the viewer then falls back to the eight-view drawings.
 */
export class ThreeStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly slots = new Map<number, Slot>();
  private readonly shadowGeometry = new THREE.CircleGeometry(SHADOW_RADIUS, 36);
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1210, transparent: true, opacity: 0.32, depthWrite: false });
  private readonly clock = new THREE.Clock();
  private width: number;
  private height: number;

  constructor(canvas: HTMLCanvasElement, videoWidth: number, videoHeight: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.width = 0;
    this.height = 0;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    this.resize(videoWidth, videoHeight);
    const sky = new THREE.HemisphereLight(0xfff6e8, 0x6b5a48, 2.1);
    this.scene.add(sky);
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(1.2, 2.4, 2);
    this.scene.add(sun);
  }

  /** Matches the drawing buffer and the field of view to the video frame. */
  resize(videoWidth: number, videoHeight: number) {
    if (videoWidth === this.width && videoHeight === this.height) return;
    this.width = videoWidth;
    this.height = videoHeight;
    this.renderer.setSize(videoWidth, videoHeight, false);
    this.camera.fov = cameraFovDeg(videoWidth, videoHeight);
    this.camera.aspect = videoWidth / videoHeight;
    this.camera.updateProjectionMatrix();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Builds the creature of a marker the first time it is seen. */
  ensureTarget(id: number, input: CreatureMeshInput) {
    if (this.slots.has(id)) return;
    const group = new THREE.Group();
    group.visible = false;
    const shadow = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    shadow.position.z = 0.002;
    shadow.renderOrder = -1;
    group.add(shadow);
    const mesh = buildCreatureMesh(input);
    const holder = new THREE.Group();
    holder.quaternion.copy(STANDING);
    holder.add(mesh.root);
    const turn = new THREE.Group();
    turn.add(holder);
    group.add(turn);
    this.scene.add(group);
    bounds.setFromObject(mesh.root);
    const top = Number.isFinite(bounds.max.y) ? bounds.max.y : 1;
    this.slots.set(id, { group, turn, mesh, top, pose: null, fresh: true });
  }

  /** Height of a creature's top above its paper, in marker sides. */
  topOf(id: number): number | null {
    return this.slots.get(id)?.top ?? null;
  }

  /** Whether a marker's creature is currently shown (seen recently). */
  isVisible(id: number): boolean {
    return this.slots.get(id)?.group.visible ?? false;
  }

  /** A point of a marker's frame in the camera's frame (null for an unknown marker). */
  worldPoint(id: number, x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 | null {
    const slot = this.slots.get(id);
    if (!slot) return null;
    slot.group.updateMatrixWorld(true);
    return slot.group.localToWorld(out.set(x, y, z));
  }

  /** A point of the camera's frame expressed in a marker's frame (null for an unknown marker). */
  localPoint(id: number, world: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 | null {
    const slot = this.slots.get(id);
    if (!slot) return null;
    slot.group.updateMatrixWorld(true);
    return slot.group.worldToLocal(out.copy(world));
  }

  isTracked(id: number): boolean {
    return this.slots.has(id);
  }

  /** Where a creature's mouth is (height above the paper, distance ahead of its centre), in marker sides. */
  mouthOf(id: number): MouthPosition | null {
    return this.slots.get(id)?.mesh.mouth ?? null;
  }

  /** Turns a creature on its marker (radians about the paper's normal, positive = counter-clockwise seen from above). */
  setYaw(id: number, yaw: number) {
    const slot = this.slots.get(id);
    if (slot) slot.turn.rotation.z = yaw;
  }

  /** Adds an object to a marker's frame (x right, y toward the top edge, z up, the side is 1). */
  attach(id: number, object: THREE.Object3D) {
    this.slots.get(id)?.group.add(object);
  }

  detach(id: number, object: THREE.Object3D) {
    this.slots.get(id)?.group.remove(object);
  }

  /** Where the camera's axis (the centre of the screen) meets a marker's plane, in that marker's frame; null when it looks away. */
  aimOnMarker(id: number): { x: number; y: number } | null {
    const slot = this.slots.get(id);
    if (!slot || !slot.group.visible) return null;
    slot.group.updateMatrixWorld(true);
    inverse.copy(slot.group.matrixWorld).invert();
    rayOrigin.set(0, 0, 0).applyMatrix4(inverse);
    rayDirection.set(0, 0, -1).transformDirection(inverse);
    if (Math.abs(rayDirection.z) < 1e-4) return null;
    const t = -rayOrigin.z / rayDirection.z;
    if (t <= 0) return null;
    return { x: rayOrigin.x + rayDirection.x * t, y: rayOrigin.y + rayDirection.y * t };
  }

  /**
   * Moves every creature: `detections` carries the corners (video pixels,
   * canonical order) of the markers read this frame, `visible` the markers
   * still shown (seen recently). Positions are smoothed; a marker that was
   * hidden snaps to its first new pose.
   */
  update(detections: ReadonlyMap<number, readonly Corner[]>, visible: ReadonlySet<number>) {
    for (const [id, slot] of this.slots) {
      const corners = detections.get(id);
      if (corners && corners.length === 4) {
        const pose = pickPose(posesFromCorners(corners, this.width, this.height), slot.pose);
        slot.pose = pose;
        const r = pose.rotation;
        matrix.set(r[0], r[1], r[2], 0, r[3], r[4], r[5], 0, r[6], r[7], r[8], 0, 0, 0, 0, 1);
        nextQuaternion.setFromRotationMatrix(matrix);
        nextPosition.set(pose.position[0], pose.position[1], pose.position[2]);
        if (slot.fresh) {
          slot.group.quaternion.copy(nextQuaternion);
          slot.group.position.copy(nextPosition);
          slot.fresh = false;
        } else {
          slot.group.quaternion.slerp(nextQuaternion, SMOOTHING);
          slot.group.position.lerp(nextPosition, SMOOTHING);
        }
      }
      const shown = visible.has(id);
      slot.group.visible = shown;
      if (!shown) {
        slot.pose = null;
        slot.fresh = true;
      }
    }
  }

  render() {
    const t = this.clock.getElapsedTime();
    for (const slot of this.slots.values()) if (slot.group.visible) slot.mesh.animate(t);
    this.renderer.render(this.scene, this.camera);
  }

  /** Draws the creatures over a picture of the same size as the video (snapshot). */
  drawTo(ctx: CanvasRenderingContext2D) {
    this.render();
    ctx.drawImage(this.renderer.domElement, 0, 0);
  }

  dispose() {
    for (const slot of this.slots.values()) {
      this.scene.remove(slot.group);
      slot.mesh.dispose();
    }
    this.slots.clear();
    this.shadowGeometry.dispose();
    this.shadowMaterial.dispose();
    this.renderer.dispose();
  }
}
