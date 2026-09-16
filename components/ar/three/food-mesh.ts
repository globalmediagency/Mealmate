import * as THREE from "three";
import type { JunkKind } from "@/lib/game/defense";

/**
 * Junk foods in 3D for "Défendre" (spec § 3.21), built from primitives with
 * the colours of the 2D drawings. Each food is modelled y-up, standing on
 * y = 0, its front (the side facing the creature) along +x, about half a
 * marker side wide; `root` stands it in the marker's frame (z up) and can be
 * turned about z. Build one template per kind and clone it per food.
 */
export type FoodMesh = { root: THREE.Group; dispose(): void };

const BUN = "#e0a95a";
const RED = "#d64545";
const YELLOW = "#f2c14e";
const CREAM = "#f7f4ec";
const PINK = "#e07ab1";
const CHOCO = "#4a2c1a";
const SILVER = "#c9ccd1";

class Builder {
  readonly group = new THREE.Group();
  readonly disposables: { dispose(): void }[] = [];
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();

  material(color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
    const key = `${color}|${JSON.stringify(extra)}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.72, metalness: 0, ...extra });
      this.materials.set(key, m);
      this.disposables.push(m);
    }
    return m;
  }

  add(geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, extra?: Partial<THREE.MeshStandardMaterialParameters>): THREE.Mesh {
    this.disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, this.material(color, extra));
    mesh.position.set(x, y, z);
    this.group.add(mesh);
    return mesh;
  }

  cylinder(rTop: number, rBottom: number, height: number, color: string, x = 0, y = 0, z = 0) {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, height, 24), color, x, y, z);
  }

  sphere(radius: number, color: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
    const mesh = this.add(new THREE.SphereGeometry(radius, 20, 14), color, x, y, z);
    mesh.scale.set(sx, sy, sz);
    return mesh;
  }

  box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  }

  cone(radius: number, height: number, color: string, x = 0, y = 0, z = 0) {
    return this.add(new THREE.ConeGeometry(radius, height, 20), color, x, y, z);
  }

  capsule(radius: number, length: number, color: string, x = 0, y = 0, z = 0) {
    return this.add(new THREE.CapsuleGeometry(radius, length, 4, 12), color, x, y, z);
  }

  torus(radius: number, tube: number, color: string, x = 0, y = 0, z = 0, arc = Math.PI * 2) {
    return this.add(new THREE.TorusGeometry(radius, tube, 10, 28, arc), color, x, y, z);
  }

  /** A flat slice (pizza, cake): tip at x = −0.55 × length, arc toward +x… then shifted so the slice is centred. */
  wedge(length: number, angle: number, depth: number, color: string, y = 0, inset = 0) {
    const shape = new THREE.Shape();
    const l = length - inset;
    shape.moveTo(inset, 0);
    shape.lineTo(l * Math.cos(-angle / 2) + inset, l * Math.sin(-angle / 2));
    shape.absarc(inset, 0, l, -angle / 2, angle / 2, false);
    shape.lineTo(inset, 0);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
    const mesh = this.add(geometry, color, -length * 0.55, y, 0);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  }

  tube(points: [number, number, number][], radius: number, color: string) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    return this.add(new THREE.TubeGeometry(curve, 24, radius, 8, false), color);
  }
}

const MODELS: Record<JunkKind, (b: Builder) => void> = {
  burger(b) {
    b.cylinder(0.2, 0.22, 0.07, BUN, 0, 0.035);
    b.cylinder(0.23, 0.23, 0.06, "#6b3e26", 0, 0.1);
    b.box(0.4, 0.015, 0.4, YELLOW, 0, 0.137).rotation.y = 0.25;
    b.cylinder(0.21, 0.21, 0.03, RED, 0, 0.16);
    b.cylinder(0.26, 0.24, 0.03, "#7fb77e", 0, 0.19);
    b.add(new THREE.SphereGeometry(0.24, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), BUN, 0, 0.205).scale.y = 0.65;
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      b.sphere(0.014, "#f7ecd2", Math.cos(a) * 0.11, 0.33, Math.sin(a) * 0.11, 1, 0.6, 1);
    }
  },
  pizza(b) {
    b.wedge(0.5, 0.85, 0.035, "#f0c060");
    b.wedge(0.47, 0.8, 0.014, "#e0503a", 0.035, 0.03);
    b.wedge(0.45, 0.76, 0.012, "#f7d774", 0.049, 0.05);
    for (const [x, z] of [
      [0.02, 0.05],
      [0.12, -0.08],
      [-0.1, 0.0],
    ]) b.cylinder(0.045, 0.045, 0.012, "#b8402f", x, 0.067, z);
    const crust = b.torus(0.5, 0.035, "#d9a04a", -0.275, 0.03, 0, 0.85);
    crust.rotation.set(-Math.PI / 2, 0, -0.425);
  },
  hotdog(b) {
    b.capsule(0.085, 0.3, BUN, 0, 0.085).rotation.x = Math.PI / 2;
    b.capsule(0.055, 0.4, "#c0492f", 0, 0.165).rotation.x = Math.PI / 2;
    const zigzag: [number, number, number][] = [];
    for (let i = 0; i <= 8; i += 1) zigzag.push([(i % 2 === 0 ? -0.025 : 0.025) * 1, 0.225, -0.18 + (i / 8) * 0.36]);
    b.tube(zigzag, 0.012, YELLOW);
  },
  fries(b) {
    b.box(0.3, 0.2, 0.2, RED, 0, 0.1);
    b.box(0.32, 0.03, 0.22, "#b83a3a", 0, 0.2);
    const offsets: [number, number, number][] = [
      [-0.1, 0, 0.05],
      [0, 0.02, -0.04],
      [0.1, -0.01, 0.06],
      [-0.05, 0.03, -0.06],
      [0.05, 0.01, 0.0],
      [0.11, 0.03, -0.06],
      [-0.11, 0.02, -0.03],
    ];
    offsets.forEach(([x, dy, z], i) => {
      const fry = b.box(0.04, 0.34, 0.04, YELLOW, x, 0.24 + dy, z);
      fry.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.12;
      fry.rotation.x = (i % 3) * 0.06;
    });
  },
  candy(b) {
    b.sphere(0.12, PINK, 0, 0.12, 0, 1.35, 1, 1);
    b.torus(0.12, 0.012, CREAM, 0, 0.12, 0).rotation.y = Math.PI / 2;
    for (const side of [-1, 1]) {
      const wrap = b.cone(0.075, 0.15, "#f0a0cc", side * 0.235, 0.12, 0);
      wrap.rotation.z = -side * (Math.PI / 2);
      b.cylinder(0.02, 0.02, 0.05, "#f0a0cc", side * 0.32, 0.12, 0).rotation.z = Math.PI / 2;
    }
  },
  chips(b) {
    b.box(0.28, 0.4, 0.1, YELLOW, 0, 0.2);
    b.box(0.29, 0.1, 0.11, RED, 0, 0.2);
    b.box(0.3, 0.03, 0.04, "#e0b040", 0, 0.41);
    b.box(0.3, 0.03, 0.04, "#e0b040", 0, 0.015);
    [
      [-0.06, 0.46, 0.02, 0.3],
      [0.05, 0.5, -0.02, -0.4],
      [0.0, 0.44, 0.06, 0.1],
    ].forEach(([x, y, z, tilt]) => {
      b.sphere(0.07, "#f0d080", x, y, z, 1, 0.35, 0.8).rotation.z = tilt;
    });
  },
  soda(b) {
    b.cylinder(0.11, 0.11, 0.4, RED, 0, 0.2);
    b.cylinder(0.112, 0.112, 0.12, CREAM, 0, 0.2);
    b.cylinder(0.115, 0.115, 0.02, SILVER, 0, 0.01);
    b.cylinder(0.115, 0.115, 0.02, SILVER, 0, 0.39);
    b.cylinder(0.1, 0.1, 0.012, SILVER, 0, 0.405);
    b.box(0.03, 0.006, 0.055, "#a9adb3", 0.02, 0.414);
  },
  icecream(b) {
    b.cone(0.12, 0.3, BUN, 0, 0.15).rotation.x = Math.PI;
    b.sphere(0.135, "#f7ecd2", 0, 0.34);
    b.sphere(0.115, PINK, 0, 0.53);
    b.sphere(0.03, RED, 0.03, 0.66);
  },
  milkshake(b) {
    b.cylinder(0.13, 0.1, 0.34, PINK, 0, 0.17);
    b.cylinder(0.14, 0.14, 0.03, CREAM, 0, 0.355);
    b.sphere(0.12, "#ffffff", 0, 0.42, 0, 1, 0.9, 1);
    b.cylinder(0.015, 0.015, 0.32, RED, 0.06, 0.52).rotation.z = 0.25;
    b.sphere(0.03, RED, -0.04, 0.53);
  },
  donut(b) {
    b.torus(0.15, 0.07, BUN, 0, 0.07).rotation.x = Math.PI / 2;
    const glaze = b.torus(0.15, 0.072, PINK, 0, 0.085);
    glaze.rotation.x = Math.PI / 2;
    glaze.scale.z = 0.6;
    const colours = [YELLOW, "#7fb77e", CREAM, "#5aa0e0", RED, "#f0a0cc"];
    colours.forEach((colour, i) => {
      const a = (i / colours.length) * Math.PI * 2 + 0.3;
      const sprinkle = b.box(0.035, 0.01, 0.012, colour, Math.cos(a) * 0.15, 0.135, Math.sin(a) * 0.15);
      sprinkle.rotation.y = a + 0.8;
    });
  },
  cookie(b) {
    b.cylinder(0.2, 0.2, 0.06, "#c9945a", 0, 0.03);
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.5;
      const r = 0.06 + (i % 2) * 0.07;
      b.sphere(0.026, CHOCO, Math.cos(a) * r, 0.06, Math.sin(a) * r, 1, 0.5, 1);
    }
  },
  cake(b) {
    b.wedge(0.42, 0.8, 0.26, "#f0d6a8");
    b.wedge(0.42, 0.8, 0.02, RED, 0.12);
    b.wedge(0.42, 0.8, 0.03, PINK, 0.26);
    b.sphere(0.06, "#ffffff", -0.02, 0.32, 0, 1, 0.8, 1);
    b.sphere(0.03, RED, -0.02, 0.38, 0);
  },
};

/** One food, standing in the marker's frame (z up), front along +x; turn `root.rotation.z` to face the creature. */
export function buildFoodMesh(kind: JunkKind): FoodMesh {
  const b = new Builder();
  MODELS[kind](b);
  const stand = new THREE.Group();
  stand.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  stand.add(b.group);
  const root = new THREE.Group();
  root.add(stand);
  return {
    root,
    dispose() {
      for (const d of b.disposables) d.dispose();
    },
  };
}
