// Wraps the browser Gamepad API. Poll once per frame; getGamepads() returns fresh
// snapshots each call (the objects themselves aren't live), so edge-detection for
// buttons needs to diff against the previous poll's state ourselves.

const DEADZONE_MOVE = 0.2;
const DEADZONE_AIM = 0.3;

// Standard gamepad mapping button indices (Xbox/PS controllers reporting as "standard").
const BTN_ABILITY = 2; // X / Square
const BTN_CONFIRM = 0; // A / Cross
const BTN_INTERACT = 4; // LB / L1 — held, doubles as door-hack / medic-revive
const BTN_FIRE = 7; // RT / R2 — analog, also checked via .value
const BTN_CYCLE_PREV = 4;
const BTN_CYCLE_NEXT = 5;

class GamepadManager {
  constructor() {
    this.index = null;
    this._prevButtons = [];
    this._abilityQueued = false;
    this._confirmQueued = false;
    this._cycleQueued = 0;
    this._fireHeld = false;
    this._interactHeld = false;
  }

  _getPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    if (this.index != null && pads[this.index]) return pads[this.index];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]) {
        this.index = i;
        return pads[i];
      }
    }
    this.index = null;
    return null;
  }

  get connected() {
    return this._getPad() != null;
  }

  poll() {
    const pad = this._getPad();
    if (!pad) {
      this._fireHeld = false;
      this._interactHeld = false;
      return;
    }

    const pressed = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
    const wasPressed = (i) => !!this._prevButtons[i];

    if (pressed(BTN_ABILITY) && !wasPressed(BTN_ABILITY)) this._abilityQueued = true;
    if (pressed(BTN_CONFIRM) && !wasPressed(BTN_CONFIRM)) this._confirmQueued = true;
    if (pressed(BTN_CYCLE_PREV) && !wasPressed(BTN_CYCLE_PREV)) this._cycleQueued = -1;
    if (pressed(BTN_CYCLE_NEXT) && !wasPressed(BTN_CYCLE_NEXT)) this._cycleQueued = 1;

    this._interactHeld = pressed(BTN_INTERACT);
    const triggerValue = pad.buttons[BTN_FIRE] ? pad.buttons[BTN_FIRE].value : 0;
    this._fireHeld = pressed(BTN_FIRE) || triggerValue > 0.15;

    this._prevButtons = pad.buttons.map((b) => b.pressed);
  }

  // Returns {x,z} in the same convention as keyboard moveVector, or null if the
  // stick is within its deadzone (so callers can fall back to another input source).
  get moveVector() {
    const pad = this._getPad();
    if (!pad) return null;
    const x = pad.axes[0] || 0;
    const z = pad.axes[1] || 0;
    if (Math.hypot(x, z) < DEADZONE_MOVE) return null;
    return { x, z };
  }

  get aimVector() {
    const pad = this._getPad();
    if (!pad) return null;
    const x = pad.axes[2] || 0;
    const z = pad.axes[3] || 0;
    if (Math.hypot(x, z) < DEADZONE_AIM) return null;
    return { x, z };
  }

  get firing() {
    return this._fireHeld;
  }

  get interacting() {
    return this._interactHeld;
  }

  consumeAbilityPress() {
    if (!this._abilityQueued) return false;
    this._abilityQueued = false;
    return true;
  }

  consumeConfirmPress() {
    if (!this._confirmQueued) return false;
    this._confirmQueued = false;
    return true;
  }

  consumeClassCycle() {
    const v = this._cycleQueued;
    this._cycleQueued = 0;
    return v;
  }
}

export const gamepad = new GamepadManager();
