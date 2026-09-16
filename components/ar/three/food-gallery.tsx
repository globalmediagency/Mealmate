"use client";

import { useEffect, useRef, useState } from "react";
import { GOOD_KINDS, JUNK_KINDS } from "@/lib/game/defense";
import { FOOD_KIND_LABELS } from "@/lib/meals/food-icons";

const COLS = 6;
const SPACING = 0.95;
const ALL_KINDS = [...JUNK_KINDS, ...GOOD_KINDS];

/** Dev gallery: the junk foods and the good foods of "Défendre" in 3D, spinning on a grid (spec § 3.21). */
export function FoodGallery() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unsupported">("loading");

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import("three"), import("./food-mesh")]).then(([THREE, { buildFoodMesh }]) => {
      const c = canvas.current;
      if (!c || disposed) return;
      try {
        const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(c.clientWidth, c.clientHeight, false);
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, c.clientWidth / c.clientHeight, 0.1, 50);
        camera.up.set(0, 0, 1);
        camera.position.set(0, -6.2, 4.4);
        camera.lookAt(0, -0.1, 0.15);
        scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b5a48, 2.1));
        const sun = new THREE.DirectionalLight(0xffffff, 2.4);
        sun.position.set(1.2, -2, 3);
        scene.add(sun);
        const disc = new THREE.CircleGeometry(0.34, 32);
        const discMaterial = new THREE.MeshBasicMaterial({ color: 0x1c2a22, transparent: true, opacity: 0.5 });
        const foods = ALL_KINDS.map((kind, i) => {
          const food = buildFoodMesh(kind);
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          food.root.position.set((col - (COLS - 1) / 2) * SPACING, (1 - row) * SPACING, 0);
          scene.add(food.root);
          const shadow = new THREE.Mesh(disc, discMaterial);
          shadow.position.set(food.root.position.x, food.root.position.y, -0.002);
          scene.add(shadow);
          return food;
        });
        const clock = new THREE.Clock();
        let raf = 0;
        const loop = () => {
          raf = requestAnimationFrame(loop);
          const t = clock.getElapsedTime();
          foods.forEach((food, i) => {
            food.root.rotation.z = t * 0.6 + i;
          });
          renderer.render(scene, camera);
        };
        loop();
        setStatus("ready");
        cleanup = () => {
          cancelAnimationFrame(raf);
          for (const food of foods) food.dispose();
          disc.dispose();
          discMaterial.dispose();
          renderer.dispose();
        };
      } catch (error) {
        console.warn("[food-3d] WebGL unavailable", error);
        setStatus("unsupported");
      }
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div className="space-y-2">
      <canvas ref={canvas} data-food-gallery data-status={status} className="aspect-[4/3] w-full rounded-3xl border border-ink-600/80 bg-gradient-to-b from-ink-800 to-ink-900" aria-label="Les aliments de Défendre en 3D" role="img" />
      {status === "unsupported" ? <p className="text-xs text-cream-500">La 3D n&apos;est pas disponible dans ce navigateur.</p> : null}
      <ol className="grid grid-cols-6 gap-1 text-center text-xs text-cream-500">
        {ALL_KINDS.map((kind) => (
          <li key={kind}>{FOOD_KIND_LABELS[kind]}</li>
        ))}
      </ol>
    </div>
  );
}
