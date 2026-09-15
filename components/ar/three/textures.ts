import * as THREE from "three";

/** Side of the canvas an accessory drawing is rasterised into. */
const TEXTURE_SIZE = 256;

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
