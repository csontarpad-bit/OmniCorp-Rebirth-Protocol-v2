import EventBus from './EventBus.js';

class InputManager {
    constructor() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };

        this.moveX = 0;
        this.moveZ = 0;
        this.isSprinting = false;
        this.isCrouching = false;
        this.isLootingKey = false;
        this.isShootingBtnPressed = false;

        this.pitch = 0;
        this.yaw = 0;
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.accumulatedDeltaX = 0;
        this.accumulatedDeltaY = 0;

        this.sensitivity = 0.003;
        this.isLookLocked = false;
        this.isInitialized = false;

        this._bindEvents();
    }

    _bindEvents() {
        EventBus.on('SET_SENSITIVITY', (val) => {
            if (typeof val === 'number') this.sensitivity = val;
        });

        EventBus.on('LOCK_LOOK', (isLocked) => {
            this.isLookLocked = !!isLocked;
        });

        EventBus.on('PLAYER_RECOIL_ADD', (data) => {
            if (!data) return;
            if (typeof data.yaw === 'number') this.yaw += data.yaw;
            if (typeof data.pitch === 'number') this.pitch += data.pitch;
        });

        EventBus.on('START_GAME', () => this.reset());
        EventBus.on('RETURN_TO_MAIN_MENU', () => {
            this.keys = {
                w: false,
                a: false,
                s: false,
                d: false
            };
            this.moveX = 0;
            this.moveZ = 0;
            this.isSprinting = false;
            this.isCrouching = false;
            this.isLootingKey = false;
            this.isShootingBtnPressed = false;
            this.mouseDeltaX = 0;
            this.mouseDeltaY = 0;
            this.accumulatedDeltaX = 0;
            this.accumulatedDeltaY = 0;
            this.isLookLocked = false;
        });
        EventBus.on('REQUEST_POINTER_LOCK', () => this.requestSafePointerLock());
    }

    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        window.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
        window.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('pointerlockchange', () => {
            if (!document.pointerLockElement) {
                EventBus.emit('POINTER_LOCK_LOST');
            }
        });

        console.log('[KRONOS] InputManager inicializálva.');
    }

    reset() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };
        this.moveX = 0;
        this.moveZ = 0;
        this.isSprinting = false;
        this.isCrouching = false;
        this.isLootingKey = false;
        this.isShootingBtnPressed = false;
        this.pitch = 0;
        this.yaw = 0;
        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;
        this.accumulatedDeltaX = 0;
        this.accumulatedDeltaY = 0;
        this.isLookLocked = false;
    }

    onKeyDown(e) {
        // Fegyverváltás számbillentyűkkel (0-4):
        // Magyar billentyűzeten a '0' fizikai kódja 'Backquote', a 'Digit0' pedig az 'ö' betű.
        // Az e.key vizsgálatával a '0' gomb mindig működik, és az 'ö' NEM hozza elő a kést.
        if (e.key === '0' || e.code === 'Numpad0') {
            EventBus.emit('WEAPON_SWITCH', 'melee');
            return;
        }
        if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
            EventBus.emit('WEAPON_SWITCH', 'pistol');
            return;
        }
        if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') {
            EventBus.emit('WEAPON_SWITCH', 'shotgun');
            return;
        }
        if (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3') {
            EventBus.emit('WEAPON_SWITCH', 'rifle');
            return;
        }
        if (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4') {
            EventBus.emit('WEAPON_SWITCH', 'super');
            return;
        }

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.w = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.s = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.a = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.d = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.isSprinting = true;
                break;
            case 'ControlLeft':
            case 'ControlRight':
            case 'KeyC':
                this.isCrouching = true;
                break;
            case 'KeyE':
                this.isLootingKey = true;
                break;
            case 'KeyR':
                EventBus.emit('input:reload');
                EventBus.emit('RELOAD_PRESSED');
                break;
            case 'KeyV':
                EventBus.emit('input:bash');
                EventBus.emit('BASH_PRESSED');
                break;
            case 'KeyQ':
            case 'KeyH':
            case 'KeyX':
                // Q gomb: Gen-Stab Gyógyulás (terminál szerint)
                EventBus.emit('input:heal');
                break;
            case 'KeyT':
                // T gomb: CRYO-PURGE Fagyasztás (terminál szerint)
                EventBus.emit('input:freeze');
                break;
            case 'KeyF':
            case 'KeyG':
                // Rezonátor telepítés
                EventBus.emit('input:deploy');
                break;

            case 'Backspace':
            case 'Escape':
            case 'KeyP':
                // Backspace: Szünet Menü (terminál szerint)
                EventBus.emit('TOGGLE_PAUSE');
                break;
            case 'Delete':
                e.preventDefault();
                EventBus.emit('TOGGLE_DEV_MENU');
                break;
        }
    }

    onKeyUp(e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.w = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.s = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.a = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.d = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.isSprinting = false;
                break;
            case 'ControlLeft':
            case 'ControlRight':
            case 'KeyC':
                this.isCrouching = false;
                break;
            case 'KeyE':
                this.isLootingKey = false;
                break;
        }
    }

    onMouseDown(e) {
        // Ha a játék már fut, de még nincs Pointer Lock (pl. fullscreen átmenet miatt),
        // az első kattintással közvetlenül lekérjük a zárolást a felhasználói gesztusból
        if (!document.pointerLockElement) {
            const isPlaying = !document.getElementById('game-ui-wrapper')?.classList.contains('hidden') &&
                document.getElementById('pause-menu')?.classList.contains('hidden') &&
                document.getElementById('main-menu')?.classList.contains('hidden') &&
                document.getElementById('game-over')?.classList.contains('hidden') &&
                document.getElementById('shop-menu')?.classList.contains('hidden') &&
                document.getElementById('dev-menu')?.classList.contains('hidden') &&
                document.getElementById('options-menu')?.classList.contains('hidden') &&
                document.getElementById('archive-menu')?.classList.contains('hidden');

            if (isPlaying && window.innerWidth > 768) {
                this.requestSafePointerLock();
            }
            return;
        }

        if (e.button === 0) {
            this.isShootingBtnPressed = true;
            EventBus.emit('input:shootStart');
        } else if (e.button === 2) {
            EventBus.emit('input:bash');
        } else if (e.button === 1) {
            EventBus.emit('SWITCH_WEAPON_NEXT');
        }
    }

    requestSafePointerLock() {
        try {
            if (window.innerWidth > 768) {
                const lockPromise = document.body.requestPointerLock();
                if (lockPromise && typeof lockPromise.catch === 'function') {
                    lockPromise.catch(() => {
                        // Csendesen elnyeli a NotAllowedError-t, nem terheli a konzolt
                    });
                }
            }
        } catch (e) { }
    }

    onMouseUp(e) {
        if (e.button === 0) {
            this.isShootingBtnPressed = false;
            if (document.pointerLockElement) {
                EventBus.emit('input:shootStop');
            }
        }
    }

    onMouseMove(e) {
        if (document.pointerLockElement) {
            const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
            const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;

            this.accumulatedDeltaX += movementX;
            this.accumulatedDeltaY += movementY;

            if (!this.isLookLocked) {
                this.yaw -= movementX * this.sensitivity;
                this.pitch -= movementY * this.sensitivity;

                const maxPitch = (Math.PI / 2) - 0.05;
                this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
            }
        }
    }

    onWheel(e) {
        if (document.pointerLockElement) {
            EventBus.emit('SWITCH_WEAPON_NEXT');
        }
    }

    update() {
        this.mouseDeltaX = this.accumulatedDeltaX;
        this.mouseDeltaY = this.accumulatedDeltaY;
        this.accumulatedDeltaX = 0;
        this.accumulatedDeltaY = 0;

        let z = 0;
        if (this.keys.w) z -= 1;
        if (this.keys.s) z += 1;

        let x = 0;
        if (this.keys.d) x += 1;
        if (this.keys.a) x -= 1;

        const length = Math.hypot(x, z);
        if (length > 0) {
            this.moveX = x / length;
            this.moveZ = z / length;
        } else {
            this.moveX = 0;
            this.moveZ = 0;
        }
    }
}

export default new InputManager();
