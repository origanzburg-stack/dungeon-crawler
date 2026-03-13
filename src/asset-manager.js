export class AssetManager {
  constructor(scene) {
    this.scene = scene;
  }

  ensureItemTexture(itemDef, size = 32) {
    const scene = this.scene;
    const atlasKey = itemDef.atlas_key || itemDef.icon || itemDef.id;
    if (scene.textures.exists(atlasKey)) return atlasKey;

    const tex = scene.textures.createCanvas(atlasKey, size, size);
    const ctx = tex.getContext();
    const color = itemDef.particle_color || '#cbd5e1';
    ctx.clearRect(0, 0, size, size);

    ctx.fillStyle = 'rgba(8,12,24,0.0)';
    ctx.fillRect(0, 0, size, size);

    if (itemDef.type === 'weapon') {
      ctx.fillStyle = color;
      ctx.fillRect(size * 0.56, size * 0.12, size * 0.14, size * 0.62);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(size * 0.34, size * 0.52, size * 0.44, size * 0.10);
    } else if (itemDef.type === 'armor' && itemDef.slot === 'chest') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(size * 0.2, size * 0.2);
      ctx.lineTo(size * 0.8, size * 0.2);
      ctx.lineTo(size * 0.72, size * 0.84);
      ctx.lineTo(size * 0.28, size * 0.84);
      ctx.closePath();
      ctx.fill();
    } else if (itemDef.type === 'armor' && itemDef.slot === 'head') {
      ctx.fillStyle = color;
      ctx.fillRect(size * 0.22, size * 0.22, size * 0.56, size * 0.30);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(size * 0.28, size * 0.42, size * 0.44, size * 0.10);
    } else if (itemDef.type === 'tool') {
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(size * 0.5, size * 0.18, size * 0.12, size * 0.60);
      ctx.fillStyle = color;
      ctx.fillRect(size * 0.28, size * 0.18, size * 0.42, size * 0.16);
    } else if (itemDef.type === 'consumable') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(size * 0.5, size * 0.54, size * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(size * 0.44, size * 0.18, size * 0.12, size * 0.12);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(size * 0.18, size * 0.18, size * 0.64, size * 0.64);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = Math.max(1, Math.floor(size * 0.06));
    ctx.strokeRect(size * 0.12, size * 0.12, size * 0.76, size * 0.76);
    tex.refresh();
    return atlasKey;
  }
}
