import * as THREE from "three";
import type { MarkupSource, TextureSource } from "./creature-mesh";
import { solidFromSvg, type SolidResult } from "./svg-solid";

/** Side of the square an accessory drawing (72-unit viewBox) is rasterised onto. */
const ACCESSORY_PLANE = 72;

export type AccessoryLayer = "front" | "back";

export type AccessoryAttacher = {
  /** The rasterised drawing: a billboard sprite or a flat card at `at`, once its texture resolves. */
  attach(id: string | undefined, layer: AccessoryLayer, holder: THREE.Object3D, at: THREE.Vector3, shape: "card" | "sprite"): void;
  /** The drawing as a real volume (slabs and tubes, spec § 3.19) draped on `drape`; null without the markup. */
  solid(id: string | undefined, layer: AccessoryLayer, holder: THREE.Object3D, at: THREE.Vector3, drape: (x: number, y: number) => number, facing?: 1 | -1): SolidResult | null;
};

/**
 * How accessories get onto a creature volume, shared by the drawn creatures
 * (`creature-mesh.ts`) and the pixel ones (`pixel-mesh.ts`): everything
 * created is registered in `disposables`, and a texture arriving after the
 * creature was disposed is dropped.
 */
export function createAccessoryAttacher(sources: { textures: TextureSource; markup?: MarkupSource }, disposables: { dispose(): void }[], isDisposed: () => boolean): AccessoryAttacher {
  /** A flat card in the creature's own plane (front or back of the body), its anchor at the group's origin. */
  const card = (texture: THREE.Texture) => {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(ACCESSORY_PLANE, ACCESSORY_PLANE);
    const m = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide, depthWrite: false });
    disposables.push(geo, m, texture);
    const plane = new THREE.Mesh(geo, m);
    plane.position.y = 8; // the SVG origin (the anchor) sits 8 units below the card's centre
    g.add(plane);
    return g;
  };
  /** The drawing always facing the camera, its anchor at the sprite's position: readable from every side, hidden by the body from behind. */
  const sprite = (texture: THREE.Texture) => {
    const m = new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.08 });
    disposables.push(m, texture);
    const s = new THREE.Sprite(m);
    s.scale.set(ACCESSORY_PLANE, ACCESSORY_PLANE, 1);
    s.center.set(0.5, (ACCESSORY_PLANE - 44) / ACCESSORY_PLANE);
    return s;
  };
  return {
    attach(id, layer, holder, at, shape) {
      if (!id) return;
      void sources.textures(id, layer).then((texture) => {
        if (!texture || isDisposed()) return;
        const c = shape === "sprite" ? sprite(texture) : card(texture);
        c.position.copy(at);
        holder.add(c);
      });
    },
    solid(id, layer, holder, at, drape, facing = 1) {
      if (!id) return null;
      const markup = sources.markup?.(id, layer);
      if (!markup) return null;
      const result = solidFromSvg(markup, { drape, facing });
      if (!result) return null;
      disposables.push(result);
      result.group.position.copy(at);
      holder.add(result.group);
      return result;
    },
  };
}
