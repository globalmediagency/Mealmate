import * as THREE from "three";
import { cameraFovDeg, pickPose, posesFromCorners, type Pose3d } from "@/lib/ar/pose3d";
import { buildCreatureMesh, type CreatureMesh, type CreatureMeshInput } from "./creature-mesh";

export type Corner = { x: number; y: number };

/** Weight of a new pose against the smoothed one (0–1): high enough to follow the hand, low enough to hide jitter. */
const SMOOTHING = 0.35;
/** Ground shadow radius in marker sides. */
const SHADOW_RADIUS = 0.42;
/** Side of the canvas an accessory drawing is rasterised into. */
const TEXTURE_SIZE = 256;

type Slot = {
  /** Marker frame: x right, y toward the top edge, z out of the paper. */
  group: THREE.Group;
  mesh: CreatureMesh;
  /** Last raw pose kept, so the next frame picks the POSIT solution closest to it. */
  pose: Pose3d | null;
  fresh: boolean;
};

const matrix = new THREE.Matrix4();
const nextQuaternion = new THREE.Quaternion();
const nextPosition = new THREE.Vector3();
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
    group.add(holder);
    this.scene.add(group);
    this.slots.set(id, { group, mesh, pose: null, fresh: true });
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

/**
 * Rasterises a stand-alone SVG (an accessory layer, see `AccessoryLayerSvg`)
 * into a texture. Resolves to null when the browser cannot draw it.
 */
export function textureFromSvg(markup: string, size = TEXTURE_SIZE): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      resolve(texture);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
