// Foto → quadratisches, kleines JPEG (schnell zu verschicken, ~10–20 KB).

const SIZE = 192;

export function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      const s = Math.min(img.width, img.height);
      // Mittig zuschneiden, leicht nach oben versetzt (Gesichter sind meist oben)
      const sx = (img.width - s) / 2;
      const sy = Math.max(0, (img.height - s) / 2 - s * 0.1);
      c.getContext('2d').drawImage(img, sx, sy, s, s, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Data-URL → fertiges Bild-Objekt (gecacht pro Spieler)
const cache = new Map();
export function avatarImage(id, dataUrl) {
  if (!dataUrl) { cache.delete(id); return null; }
  const hit = cache.get(id);
  if (hit && hit.src === dataUrl) return hit;
  const img = new Image();
  img.src = dataUrl;
  cache.set(id, img);
  return img;
}
