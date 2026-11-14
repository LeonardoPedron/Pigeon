// Polaroid: la foto esce dal basso in primo piano, si sviluppa, riceve il timbro e vola nell'album.
export class Polaroid {
  constructor() {
    this.layer = document.getElementById('polaroidLayer');
    this.album = document.getElementById('album');
    this.count = document.getElementById('albumCount');
    this.active = [];
  }

  show(img, caption, sub, secret) {
    const el = document.createElement('div');
    el.className = 'polaroid';
    const im = document.createElement('img');
    im.src = img;
    im.alt = caption;
    const cap = document.createElement('div');
    cap.className = 'cap';
    cap.textContent = caption;
    const sm = document.createElement('small');
    sm.textContent = sub;
    cap.append(sm);
    el.append(im, cap);
    if (secret) {
      const st = document.createElement('div');
      st.className = 'stamp';
      st.textContent = 'TOP SECRET · ILLUMINATI';
      el.append(st);
    }
    // piccola rotazione casuale
    el.style.setProperty('--r', (Math.random() * 6 - 3).toFixed(1) + 'deg');
    this.layer.append(el);
    this.active.push(el);
    setTimeout(() => el.classList.add('away'), 4300);
    setTimeout(() => {
      el.remove();
      this.active = this.active.filter((x) => x !== el);
      this.album.classList.add('bump');
      setTimeout(() => this.album.classList.remove('bump'), 250);
    }, 5100);
    while (this.active.length > 2) this.active.shift().remove();
    return el;
  }

  setCount(n) { this.count.textContent = n; }
}
