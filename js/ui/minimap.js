// Minimappa circolare orientata secondo la camera.
export class Minimap {
  constructor(game, canvas) {
    this.g = game;
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.range = 160; // metri dal centro al bordo
    this.t = 0;
    this.street = '';
    canvas.parentElement.addEventListener('click', () => game.toggleMap());
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 / 15;
    const g = this.g, c = this.ctx, cv = this.cv;
    const W = cv.width, R = W / 2;
    const p = g.pigeon.pos;
    const alt = Math.max(0, p.y - g.world.terrain.heightAt(p.x, p.z));
    const range = this.range + Math.min(500, alt * 1.5);
    const land = g.world.land;
    const [sx, sy] = land.toPx(p.x, p.z);
    const k = R / (range * land.scale); // px minimappa per px sorgente
    const yaw = g.cam.yaw;
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath();
    c.arc(R, R, R, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#7d8a55';
    c.fillRect(0, 0, W, W);
    c.translate(R, R);
    // camera che guarda verso (sin yaw, cos yaw) => in alto sulla minimappa
    c.rotate(Math.PI + yaw);
    c.scale(k, k);
    c.imageSmoothingEnabled = true;
    c.drawImage(land.canvas, -sx, -sy);
    c.setTransform(1, 0, 0, 1, 0, 0);
    // conversione mondo -> minimappa
    const cs = Math.cos(Math.PI + yaw), sn = Math.sin(Math.PI + yaw);
    const toMini = (x, z) => {
      const dx = (x - p.x) * (R / range), dz = (z - p.z) * (R / range);
      return [R + dx * cs - dz * sn, R + dx * sn + dz * cs];
    };
    // persone vicine
    c.fillStyle = '#ffe9b0';
    for (const a of g.npc.visibleAgents || []) {
      const [x, y] = toMini(a.x, a.z);
      c.beginPath(); c.arc(x, y, 2.2, 0, Math.PI * 2); c.fill();
    }
    // batterie
    c.fillStyle = '#5dff7a';
    for (const it of g.batteries.visibleList(p, range)) {
      const [x, y] = toMini(it.x, it.z);
      c.fillRect(x - 2.5, y - 2.5, 5, 5);
    }
    // obiettivi missione (sul bordo se lontani)
    for (const t of g.missions.targets()) {
      let [x, y] = toMini(t.x, t.z);
      const dx = x - R, dy = y - R, d = Math.hypot(dx, dy);
      if (d > R - 10) { x = R + (dx / d) * (R - 10); y = R + (dy / d) * (R - 10); }
      c.font = '16px serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(t.icon || '📍', x, y);
    }
    // nord
    const nX = R + sn * (R - 12);
    const nY = R - cs * (R - 12);
    c.fillStyle = '#fff';
    c.font = 'bold 13px sans-serif';
    c.strokeStyle = '#000';
    c.lineWidth = 3;
    c.strokeText('N', nX, nY);
    c.fillText('N', nX, nY);
    // piccione al centro (freccia)
    c.translate(R, R);
    c.rotate(Math.PI + yaw - g.pigeon.heading + Math.PI);
    c.fillStyle = '#e9b04b';
    c.strokeStyle = '#1b1408';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 3); c.lineTo(-6, 7); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    document.getElementById('minimapStreet').textContent = this.street || g.npc.villageName(p.x, p.z);
  }
}
