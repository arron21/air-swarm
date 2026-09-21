class InputManager {
  constructor() {
    this.keys = new Set();
    this.pointerNdc = { x: 0, y: 0 };
    this.firing = false;
    this._abilityQueued = false;
    this._grenadeQueued = false;
    this._setupDone = false;
  }

  setup(domElement) {
    if (this._setupDone) return;
    this._setupDone = true;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyQ' && !this.keys.has('KeyQ')) this._abilityQueued = true;
      if (e.code === 'KeyG' && !this.keys.has('KeyG')) this._grenadeQueued = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    domElement.addEventListener('mousemove', (e) => {
      const rect = domElement.getBoundingClientRect();
      this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    domElement.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.firing = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.firing = false;
    });
    domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get moveVector() {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    return { x, z };
  }

  get hacking() {
    return this.keys.has('KeyE');
  }

  // Edge-triggered: true exactly once per Q press, then consumed.
  consumeAbilityPress() {
    if (!this._abilityQueued) return false;
    this._abilityQueued = false;
    return true;
  }

  consumeGrenadePress() {
    if (!this._grenadeQueued) return false;
    this._grenadeQueued = false;
    return true;
  }

  reset() {
    this.keys.clear();
    this.firing = false;
    this._abilityQueued = false;
    this._grenadeQueued = false;
  }
}

export const input = new InputManager();
