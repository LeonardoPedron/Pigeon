// Input unificato: tastiera, mouse (pointer lock), touch (joystick + pulsanti).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // premuti in questo frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.click = false;
    this.locked = false;
    this.joy = { x: 0, y: 0, active: false };
    this.touchHeld = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        if (!this.locked && !this.isTouch && this.enabled) canvas.requestPointerLock?.();
        else this.click = true;
      }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      else if (this.dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => { if (e.button === 2) this.dragging = true; });
    addEventListener('mouseup', () => { this.dragging = false; });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });

    // trascinamento touch sul canvas = ruota la camera
    this.camTouch = null;
    canvas.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (this.camTouch === null) { this.camTouch = t.identifier; this.lastT = [t.clientX, t.clientY]; this.tapStart = performance.now(); }
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.camTouch) {
        this.mouseDX += (t.clientX - this.lastT[0]) * 1.6;
        this.mouseDY += (t.clientY - this.lastT[1]) * 1.6;
        this.lastT = [t.clientX, t.clientY];
      }
    }, { passive: true });
    const endCam = (e) => {
      for (const t of e.changedTouches) if (t.identifier === this.camTouch) {
        if (performance.now() - this.tapStart < 220) this.click = true;
        this.camTouch = null;
      }
    };
    canvas.addEventListener('touchend', endCam, { passive: true });
    canvas.addEventListener('touchcancel', endCam, { passive: true });
  }

  setupTouch(root) {
    const joy = root.querySelector('#joy'), knob = root.querySelector('#joyKnob');
    let jid = null, cx = 0, cy = 0;
    const R = () => joy.clientWidth / 2;
    const move = (t) => {
      let dx = t.clientX - cx, dy = t.clientY - cy;
      const r = R();
      const l = Math.hypot(dx, dy);
      if (l > r) { dx = (dx / l) * r; dy = (dy / l) * r; }
      this.joy.x = dx / r;
      this.joy.y = dy / r;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      jid = t.identifier;
      const rc = joy.getBoundingClientRect();
      cx = rc.left + rc.width / 2; cy = rc.top + rc.height / 2;
      this.joy.active = true;
      move(t);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === jid) move(t);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === jid) {
        jid = null; this.joy.x = this.joy.y = 0; this.joy.active = false; knob.style.transform = '';
      }
    };
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);
    for (const b of root.querySelectorAll('.tb')) {
      const k = b.dataset.k;
      const down = (e) => { e.preventDefault(); this.touchHeld.add(k); this.pressed.add('touch:' + k); b.classList.add('on'); };
      const up = (e) => { e.preventDefault(); this.touchHeld.delete(k); b.classList.remove('on'); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
      b.addEventListener('mouseleave', up);
    }
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  // assi di movimento (-1..1)
  axes() {
    let x = 0, y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.joy.active) { x += this.joy.x; y -= this.joy.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  get fly() { return this.down('Space') || this.touchHeld.has('fly'); }
  get descend() { return this.down('KeyC', 'ControlLeft', 'ControlRight') || this.touchHeld.has('down'); }
  get boost() { return this.down('ShiftLeft', 'ShiftRight') || this.touchHeld.has('boost'); }
  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.click = false;
  }
}
