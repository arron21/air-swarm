// Dual virtual joysticks + action buttons for touch devices. API shape mirrors
// Gamepad.js (moveVector/aimVector/firing/interacting/consumeAbilityPress) so
// Game.js can merge all three input sources (keyboard+mouse, gamepad, touch)
// with the same `sourceA.value || sourceB.value` fallback pattern.

const MOVE_MAX_RADIUS = 55;
const AIM_MAX_RADIUS = 55;
const AIM_DEADZONE = 0.25;

export function isTouchDevice() {
  return typeof window !== 'undefined'
    && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
}

class TouchControls {
  constructor() {
    this._moveVec = null;
    this._aimVec = null;
    this._moveTouchId = null;
    this._aimTouchId = null;
    this._abilityQueued = false;
    this._interacting = false;
  }

  init() {
    if (this._initDone) return;
    this._initDone = true;

    this.root = document.getElementById('touch-controls');
    if (!this.root) return;
    this.root.classList.remove('hidden');

    this._setupStick(
      document.getElementById('touch-move-zone'),
      document.getElementById('touch-move-base'),
      document.getElementById('touch-move-knob'),
      MOVE_MAX_RADIUS,
      () => this._moveTouchId,
      (id) => { this._moveTouchId = id; },
      (v) => { this._moveVec = v; },
    );

    this._setupStick(
      document.getElementById('touch-aim-zone'),
      document.getElementById('touch-aim-base'),
      document.getElementById('touch-aim-knob'),
      AIM_MAX_RADIUS,
      () => this._aimTouchId,
      (id) => { this._aimTouchId = id; },
      (v) => { this._aimVec = v; },
    );

    const abilityBtn = document.getElementById('touch-ability-btn');
    abilityBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this._abilityQueued = true;
    });

    const interactBtn = document.getElementById('touch-interact-btn');
    interactBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        interactBtn.setPointerCapture(e.pointerId);
      } catch {
        // See the joystick capture comment above.
      }
      this._interacting = true;
    });
    const releaseInteract = () => { this._interacting = false; };
    interactBtn.addEventListener('pointerup', releaseInteract);
    interactBtn.addEventListener('pointercancel', releaseInteract);
  }

  _setupStick(zone, base, knob, maxRadius, getId, setId, setVec) {
    zone.addEventListener('pointerdown', (e) => {
      if (getId() != null) return; // already tracking a finger on this stick
      e.preventDefault();
      setId(e.pointerId);
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // Capture is a nice-to-have (keeps the drag tracked if the finger leaves the
        // zone bounds) — if the browser rejects it, fall through and track normally.
      }

      const rect = zone.getBoundingClientRect();
      const originX = e.clientX - rect.left;
      const originY = e.clientY - rect.top;
      base.style.left = `${originX}px`;
      base.style.top = `${originY}px`;
      base.dataset.originX = String(originX);
      base.dataset.originY = String(originY);
      base.classList.add('active');
      setVec({ x: 0, z: 0 });
    });

    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== getId()) return;
      e.preventDefault();
      const rect = zone.getBoundingClientRect();
      const originX = parseFloat(base.dataset.originX);
      const originY = parseFloat(base.dataset.originY);
      let dx = (e.clientX - rect.left) - originX;
      let dy = (e.clientY - rect.top) - originY;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / maxRadius;
      const nz = dy / maxRadius;
      setVec(Math.hypot(nx, nz) < 0.001 ? { x: 0, z: 0 } : { x: nx, z: nz });
    });

    const release = (e) => {
      if (e.pointerId !== getId()) return;
      base.classList.remove('active');
      knob.style.transform = 'translate(0px, 0px)';
      setId(null);
      setVec(null);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
  }

  get moveVector() {
    return this._moveVec && Math.hypot(this._moveVec.x, this._moveVec.z) > 0.001 ? this._moveVec : null;
  }

  get aimVector() {
    if (!this._aimVec) return null;
    return Math.hypot(this._aimVec.x, this._aimVec.z) < AIM_DEADZONE ? null : this._aimVec;
  }

  // Twin-stick convention: pushing the aim stick both aims and fires, freeing
  // screen space from needing a separate fire button.
  get firing() {
    return this.aimVector != null;
  }

  get interacting() {
    return this._interacting;
  }

  consumeAbilityPress() {
    if (!this._abilityQueued) return false;
    this._abilityQueued = false;
    return true;
  }
}

export const touchControls = new TouchControls();
