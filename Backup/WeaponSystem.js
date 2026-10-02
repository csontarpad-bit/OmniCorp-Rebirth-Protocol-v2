import * as THREE from 'three';
import EventBus from './EventBus.js';
import { weapons, getDamageBoost } from './Database.js';

export class WeaponSystem {
    constructor() {
        this.engine = null;
        this.enemyManager = null;
        this.itemManager = null;
        this.camera = null;
        this.scene = null;
        this.currentWeaponId = 'pistol';
        this.weapons = weapons;
        this.weaponModels = {};
        this.weaponMixers = {};
        this.weaponActions = {};

        this.currentWeaponId = 'pistol';
        this.isReloading = false;
        this.isWeaponBusy = false;
        this.isUsingMedkit = false;
        this.weaponIdleTimer = 2.0;
        this.cancelReloadRequested = false;
        this.reloadInterval = null;
        this.lastDryFireTime = 0;
        this.isFacingWall = false;
        this.autoShootTimer = 0;

        this.muzzleFlash = null;
        this.muzzleFlashLight = null;
        this.raycaster = new THREE.Raycaster();

        this.meleeChargeTime = 0;
        this.isChargingMelee = false;
        this.meleeCooldown = 0;

        this.baseRotations = {};
        this.basePositions = {};
        this.breathTime = 0;
        this.swayX = 0;
        this.swayY = 0;
        this.playerStamina = 100;
        this.targetFOV = 75;
        this.currentAction = null;
        this.playerRef = null;
        this.inputManagerRef = null;

        this._bindEvents();
    }

    _bindEvents() {
        EventBus.on('SHOOT_PRESSED', () => this.onShootStart());
        EventBus.on('RELOAD_PRESSED', () => this.onReload());
        EventBus.on('WEAPON_SWITCH', (id) => this.onWeaponSwitch(id));
        EventBus.on('BASH_PRESSED', () => this.onBash());
        EventBus.on('input:shootStart', () => this.onShootStart());
        EventBus.on('input:shootStop', () => this.onShootStop());
        EventBus.on('input:reload', () => this.onReload());
        EventBus.on('input:bash', () => this.onBash());
        EventBus.on('FORCE_WEAPON_SWITCH', (id) => this.forceWeaponSwitch(id));
        EventBus.on('SWITCH_WEAPON_NEXT', () => this.switchNextWeapon());
        EventBus.on('GIVE_GLOBAL_AMMO', () => this.giveGlobalAmmo());
        EventBus.on('WEAPON_BUSY_STATE', (isBusy) => { this.isWeaponBusy = isBusy; });
        EventBus.on('MEDKIT_START', () => {
            this.isUsingMedkit = true;
            this.isWeaponBusy = true;
            for (let id in this.weaponModels) {
                if (this.weaponModels[id]) this.weaponModels[id].visible = false;
            }
            if (this.weaponModels['heal']) {
                this.weaponModels['heal'].visible = true;
                let action = this.playAnimation('inject', 'heal');
                if (action) {
                    action.reset();
                    action.play();
                }
            }
        });
        EventBus.on('START_GAME', () => this.reset());
        EventBus.on('GAME_OVER', () => this.hideAllWeapons());
        EventBus.on('RETURN_TO_MAIN_MENU', () => this.hideAllWeapons());
        EventBus.on('RESTART_GAME', () => this.hideAllWeapons());
        EventBus.on('MEDKIT_END', () => {
            this.isUsingMedkit = false;
            if (this.weaponModels['heal']) {
                this.weaponModels['heal'].visible = false;
            }
            this.isWeaponBusy = false;
            this.equipWeapon(this.currentWeaponId);
        });
    }

    giveGlobalAmmo() {
        for (let key in this.weapons) {
            let w = this.weapons[key];
            if (w && w.owned && key !== 'melee') {
                if (w.ammo < w.maxAmmo) {
                    w.ammo = w.maxAmmo;
                }
                let fillAmount = Math.ceil(w.maxReserve * 0.25);
                w.reserve = Math.min(w.maxReserve, w.reserve + fillAmount);
            }
        }
        let cur = this.weapons[this.currentWeaponId];
        if (cur) {
            EventBus.emit('AMMO_CHANGED', {
                ammo: cur.ammo,
                reserve: cur.reserve,
                maxAmmo: cur.maxAmmo,
                maxReserve: cur.maxReserve
            });
        }
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    init(engine, enemyManager, itemManager, assetManager) {
        this.engine = engine;
        this.camera = engine.camera;
        this.scene = engine.scene;
        this.enemyManager = enemyManager;
        this.itemManager = itemManager;

        this.weaponModels = {};
        this.weaponMixers = {};
        this.weaponActions = {};

        this.raycaster = new THREE.Raycaster();

        this.muzzleFlash = new THREE.PointLight(0xffaa00, 0, 100);
        this.muzzleFlash.position.set(0.8, -0.6, -3.0);
        this.camera.add(this.muzzleFlash);

        if (assetManager) {
            this.loadModels(assetManager);
            this.equipWeapon(this.currentWeaponId);
        }

        console.log(`[KRONOS] WeaponSystem inicializálva.`);
    }

    loadModels(assetManager) {
        const configs = {
            pistol: { scale: 0.01, pos: { x: 0.150, y: -0.300, z: -0.350 }, rot: { x: 0.000, y: 3.142, z: 0.000 }, anims: { shoot: [7.47, 7.80], reload: [2.13, 4.35], hide: [4.35, 4.73], take: [4.73, 5.90], watch: [5.90, 6.80], bash: [6.80, 7.46] } },
            rifle: { scale: 0.01, pos: { x: 0.200, y: -0.300, z: -0.050 }, rot: { x: 0.000, y: 3.142, z: 0.000 }, anims: { shoot: [0, 0.20], reload: [0.20, 2.70], hide: [4.30, 4.65], take: [4.65, 5.91], watch: [5.91, 7.15], bash: [7.10, 7.80] } },
            super: { scale: 0.01, pos: { x: 0.250, y: -0.200, z: -0.350 }, rot: { x: 0.000, y: 3.042, z: 0.000 }, anims: { shoot: [0, 0.45], reload: [0.45, 7.40], hide: [7.40, 7.80], take: [7.80, 8.95], watch: [8.95, 9.80], bash: [9.80, 10.66] } },
            shotgun: { scale: 0.01, pos: { x: 0.200, y: -0.300, z: -0.050 }, rot: { x: 0.000, y: 3.142, z: 0.000 }, anims: { shoot: [0, 0.40], pump: [0.36, 1.12], reloadStart: [1.12, 1.60], reload: [1.60, 2.60], reloadEnd: [2.60, 2.95], hide: [2.95, 3.35], take: [3.35, 4.30], watch: [4.30, 5.20], bash: [5.31, 6.00] } },
            melee: { scale: 0.01, pos: { x: 0.150, y: -0.300, z: -0.350 }, rot: { x: 0.000, y: 3.142, z: 0.000 }, anims: { watch: [0, 1.33], charge: [3.40, 3.52], strike: [3.52, 4.14], hide: [4.15, 4.48], take: [4.48, 4.83] } },
            heal: { scale: 1.0, pos: { x: 0.000, y: -0.150, z: -0.100 }, rot: { x: 0.000, y: 3.142, z: 0.000 }, anims: { inject: 0 } }
        };

        for (let id in configs) {
            let cloned = assetManager.cloneModel(id);
            if (!cloned) continue;
            let mesh = cloned.mesh;
            let conf = configs[id];

            mesh.scale.set(conf.scale, conf.scale, conf.scale);
            mesh.position.set(conf.pos.x, conf.pos.y, conf.pos.z);
            mesh.rotation.set(conf.rot.x, conf.rot.y, conf.rot.z);

            mesh.traverse((c) => {
                if (c.isMesh) {
                    let n = c.name.toLowerCase();
                    if (n.includes('pose') || n.includes('controller') || n.includes('text') || n.includes('helper')) c.visible = false;
                    else { c.frustumCulled = false; c.castShadow = true; }
                }
            });

            mesh.visible = false;
            this.camera.add(mesh);
            this.weaponModels[id] = mesh;
            this.baseRotations[id] = new THREE.Euler(conf.rot.x, conf.rot.y, conf.rot.z);
            this.basePositions[id] = new THREE.Vector3(conf.pos.x, conf.pos.y, conf.pos.z);

            let mixer = new THREE.AnimationMixer(mesh);
            this.weaponMixers[id] = mixer;
            this.weaponActions[id] = {};

            if (cloned.animations && cloned.animations.length > 0) {
                for (let animName in conf.anims) {
                    let limits = conf.anims[animName];
                    let clip = cloned.animations[0].clone();

                    let fps = 30;
                    if (Array.isArray(limits)) {
                        let startFrame = Math.round(limits[0] * fps);
                        let endFrame = Math.round(limits[1] * fps);
                        clip = THREE.AnimationUtils.subclip(clip, clip.name + '_' + animName, startFrame, endFrame, fps);
                    }

                    let action = mixer.clipAction(clip);
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;

                    let defaultScale = 1.0;
                    if (animName === 'watch') defaultScale = 0.6;
                    if (id === 'rifle' && animName === 'shoot') defaultScale = 2.5;

                    action.timeScale = defaultScale;
                    action.userData = { defaultTimeScale: defaultScale };

                    this.weaponActions[id][animName] = action;
                }
            }
        }
    }

    playAnimation(animName, weaponId = this.currentWeaponId, fadeDuration = 0.05) {
        let mixer = this.weaponMixers[weaponId];
        let nextAction = this.weaponActions[weaponId] ? this.weaponActions[weaponId][animName] : null;
        if (!nextAction || !mixer) return null;

        let baseScale = (nextAction.userData && nextAction.userData.defaultTimeScale) ? nextAction.userData.defaultTimeScale : 1.0;

        if (this.currentAction && this.currentAction !== nextAction) {
            if (animName === 'shoot' || animName === 'bash' || (weaponId === 'shotgun' && animName === 'reload')) {
                this.currentAction.stop();
            } else {
                this.currentAction.fadeOut(fadeDuration);
            }
        }

        nextAction.reset();
        nextAction.setEffectiveTimeScale(baseScale);
        nextAction.setEffectiveWeight(1.0);

        if (this.currentAction && this.currentAction !== nextAction && animName !== 'shoot' && animName !== 'bash') {
            nextAction.fadeIn(fadeDuration);
        }

        nextAction.play();
        this.currentAction = nextAction;
        return nextAction;
    }


    equipWeapon(weaponId) {
        if (!this.weaponModels || !this.weaponModels[weaponId]) return;

        for (let id in this.weaponModels) {
            if (this.weaponModels[id]) {
                this.weaponModels[id].visible = false;
            }
        }

        this.isWeaponBusy = true;
        this.currentWeaponId = weaponId;

        let mesh = this.weaponModels[this.currentWeaponId];
        mesh.visible = true;

        // Csak a Revolvernél van hang (A pörgetés), a sörétesnél késleltetett pumpa
        if (weaponId === 'super') {
            EventBus.emit('PLAY_SOUND', { id: 'superClose' });
        } else if (weaponId === 'shotgun') {
            setTimeout(() => {
                EventBus.emit('PLAY_SOUND', { id: 'shotgunShoot', offset: 0.6 });
            }, 300);
        }

        let action = this.playAnimation('take');
        if (action && action._clip) {
            let duration = (action._clip.duration / action.timeScale) * 1000;
            setTimeout(() => {
                this.isWeaponBusy = false;
                this.weaponIdleTimer = 1.0;
            }, duration);
        } else {
            this.isWeaponBusy = false;
            this.weaponIdleTimer = 1.0;
        }

        EventBus.emit('UI_UPDATE_NEEDED');
        EventBus.emit('WEAPON_EQUIPPED', weaponId);
        let wpn = this.weapons[weaponId];
        if (wpn) {
            EventBus.emit('AMMO_CHANGED', {
                ammo: wpn.ammo,
                reserve: wpn.reserve,
                maxAmmo: wpn.maxAmmo,
                maxReserve: wpn.maxReserve
            });
        }
    }

    hideAllWeapons() {
        this.isReloading = false;
        this.isWeaponBusy = false;
        if (this.reloadInterval) {
            clearInterval(this.reloadInterval);
            this.reloadInterval = null;
        }
        for (let id in this.weaponModels) {
            if (this.weaponModels[id]) {
                this.weaponModels[id].visible = false;
            }
        }
    }

    reset() {
        for (let id in this.weaponModels) {
            if (this.weaponModels[id]) {
                this.weaponModels[id].visible = false;
            }
        }
        this.currentWeaponId = 'pistol';
        this.isReloading = false;
        this.isWeaponBusy = false;
        this.weaponIdleTimer = 2.0;
        this.cancelReloadRequested = false;
        if (this.reloadInterval) {
            clearInterval(this.reloadInterval);
            this.reloadInterval = null;
        }
        this.autoShootTimer = 0;
        this.meleeChargeTime = 0;
        this.isChargingMelee = false;
        this.meleeCooldown = 0;

        for (let key in this.weapons) {
            let w = this.weapons[key];
            if (key === 'pistol') {
                w.ammo = 10;
                w.reserve = 30;
                w.owned = true;
            } else if (key === 'melee') {
                w.ammo = Infinity;
                w.reserve = Infinity;
                w.owned = true;
            } else {
                w.ammo = 0;
                w.reserve = 0;
                w.owned = false;
            }
        }

        this.equipWeapon('pistol');
        EventBus.emit('AMMO_CHANGED', {
            ammo: this.weapons.pistol.ammo,
            reserve: this.weapons.pistol.reserve,
            maxAmmo: this.weapons.pistol.maxAmmo,
            maxReserve: this.weapons.pistol.maxReserve
        });
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    switchWeapon(weaponId) {
        this.equipWeapon(weaponId);
    }

    onWeaponSwitch(weaponId) {
        if (!this.weapons[weaponId] || !this.weapons[weaponId].owned || this.currentWeaponId === weaponId) return;

        if (this.isWeaponBusy || this.isReloading) {
            this.forceWeaponSwitch(weaponId);
            return;
        }

        this.equipWeapon(weaponId);
    }

    switchNextWeapon() {
        if (this.isWeaponBusy) return;
        const keys = Object.keys(this.weapons);
        let currIdx = keys.indexOf(this.currentWeaponId);
        let nextIdx = currIdx;
        do {
            nextIdx = (nextIdx + 1) % keys.length;
        } while (!this.weapons[keys[nextIdx]].owned && nextIdx !== currIdx);
        if (nextIdx === currIdx) return;
        this.onWeaponSwitch(keys[nextIdx]);
    }

    forceWeaponSwitch(targetWeaponId = 'melee') {
        if (this.currentWeaponId === targetWeaponId) return;
        if (!this.weapons[targetWeaponId] || !this.weapons[targetWeaponId].owned) return;

        this.isWeaponBusy = true;
        this.isReloading = false;
        this.cancelReloadRequested = true;
        if (this.reloadInterval) {
            clearInterval(this.reloadInterval);
            this.reloadInterval = null;
        }
        EventBus.emit('RELOAD_END');

        let hideAction = this.playAnimation('hide');
        let hideDuration = (hideAction && hideAction._clip) ? (hideAction._clip.duration * 1000) : 300;

        setTimeout(() => {
            this.isWeaponBusy = false;
            this.equipWeapon(targetWeaponId);
            EventBus.emit('UI_UPDATE_NEEDED');
        }, hideDuration);
    }

    hasAnyAmmoLeft() {
        for (let k in this.weapons) {
            if (k !== 'melee' && this.weapons[k].owned && (this.weapons[k].ammo > 0 || this.weapons[k].reserve > 0)) {
                return true;
            }
        }
        return false;
    }

    onShootStart() {
        if (!this.camera || !this.engine) return;

        // FIX: Futás közben nem lehet lőni
        if (this.inputManagerRef && this.inputManagerRef.isSprinting && this.currentWeaponId !== 'melee') return;

        if (this.isReloading && (this.currentWeaponId === 'shotgun' || this.currentWeaponId === 'super')) {
            this.cancelReloadRequested = true;
            return;
        }

        if (this.currentWeaponId === 'shotgun') {
            if (this.shotgunNextFireTime && performance.now() < this.shotgunNextFireTime) {
                return;
            }
        }

        if (this.isWeaponBusy && !this.isReloading) return;

        // Fal-közelség: ha közelebb vagyunk mint 0.9m, fegyverrel nem lőhetünk
        if (this.isFacingWall && this.currentWeaponId !== 'melee') {
            return;
        }

        let wpn = this.weapons[this.currentWeaponId];
        if (!wpn) return;

        if (this.currentWeaponId !== 'melee' && wpn.ammo <= 0) {
            let now = performance.now();
            if (now - this.lastDryFireTime > 300) {
                this.lastDryFireTime = now;
                EventBus.emit('PLAY_SOUND', { id: 'dryFire' });
            }
            if (!this.hasAnyAmmoLeft()) {
                setTimeout(() => this.forceWeaponSwitch('melee'), 300);
            }
            return;
        }

        if (this.currentWeaponId === 'melee') {
            if (this.meleeCooldown > 0 || this.isWeaponBusy || this.playerStamina < 15) {
                if (this.playerStamina < 15) EventBus.emit('PLAY_SOUND', { id: 'cough' });
                return;
            }
            this.isWeaponBusy = true;
            this.isChargingMelee = true;
            this.meleeChargeTime = 0;

            EventBus.emit('PLAY_SOUND', { id: 'heavyBreathing' });
            this.playAnimation('charge');
            return;
        }

        this.isWeaponBusy = true;
        this.isReloading = false;
        if (wpn.auto) this.autoShootTimer = wpn.fireRate;
        this.handleFire();
    }

    onShootStop() {
        if (this.currentWeaponId === 'melee' && this.isChargingMelee) {
            this.isChargingMelee = false;
            EventBus.emit('STOP_AUDIO', { id: 'heavyBreathing' });
            this.executeMeleeStrike(this.playerRef, this.inputManagerRef);
        }
    }

    handleFire() {
        if (!this.camera || !this.engine) return;

        let wpn = this.weapons[this.currentWeaponId];
        if (!wpn) return;

        if (this.currentWeaponId !== 'melee') {
            wpn.ammo--;
            EventBus.emit('AMMO_CHANGED', {
                ammo: wpn.ammo,
                reserve: wpn.reserve,
                maxAmmo: wpn.maxAmmo,
                maxReserve: wpn.maxReserve
            });
            EventBus.emit('UI_UPDATE_NEEDED');

            EventBus.emit('WEAPON_FIRED', { weaponId: this.currentWeaponId });

            if (this.currentWeaponId === 'pistol') EventBus.emit('PLAY_SOUND', { id: 'pistolShoot' });
            else if (this.currentWeaponId === 'shotgun') EventBus.emit('PLAY_SOUND', { id: 'shotgunShoot' });
            else if (this.currentWeaponId === 'rifle') EventBus.emit('PLAY_SOUND', { id: 'rifleShoot', offset: 0.4 });
            else if (this.currentWeaponId === 'super') EventBus.emit('PLAY_SOUND', { id: 'superShoot' });

            if (wpn.ammo === 0 && wpn.reserve === 0 && !this.hasAnyAmmoLeft()) {
                setTimeout(() => this.forceWeaponSwitch('melee'), 800);
            }
        }

        let damage = wpn.damage;
        let pellets = wpn.pellets;
        let spread = wpn.spread;

        EventBus.emit('ADD_RECOIL', 0.08 + (wpn.spread * 0.5));

        let shootAction = this.playAnimation('shoot', this.currentWeaponId, 0.01);
        let duration = (shootAction && shootAction._clip) ? (shootAction._clip.duration / (shootAction.timeScale || 1.0)) * 1000 : 200;

        if (this.currentWeaponId === 'shotgun') {
            this.isWeaponBusy = true;
            this.shotgunNextFireTime = performance.now() + duration + 760;

            setTimeout(() => {
                let pumpAction = this.playAnimation('pump');
                let pumpDur = (pumpAction && pumpAction._clip) ? (pumpAction._clip.duration * 1000) : 760;
                setTimeout(() => {
                    this.isWeaponBusy = false;
                    this.weaponIdleTimer = 1.0;
                }, pumpDur);
            }, duration);
        } else {
            this.isWeaponBusy = true;
            setTimeout(() => {
                this.isWeaponBusy = false;
                this.weaponIdleTimer = 1.0;
            }, duration);
        }

        if (this.muzzleFlash && this.currentWeaponId !== 'melee') {
            this.muzzleFlash.intensity = 8.0;
            let wpnMesh = this.weaponModels[this.currentWeaponId];
            if (wpnMesh) {
                this.muzzleFlash.position.set(
                    wpnMesh.position.x,
                    wpnMesh.position.y + 0.1,
                    wpnMesh.position.z - 0.5
                );
            }
        }

        // --- RAYCASTING LOGIKA ---
        this.camera.updateMatrixWorld(true);
        for (let i = 0; i < pellets; i++) {
            let spreadX = (Math.random() - 0.5) * spread;
            let spreadY = (Math.random() - 0.5) * spread;

            const rayDirection = new THREE.Vector3(spreadX, spreadY, -1);
            rayDirection.unproject(this.camera);
            rayDirection.sub(this.camera.position).normalize();

            this.raycaster.set(this.camera.position, rayDirection);
            this.raycaster.params.Mesh.threshold = 0.1;

            let hitboxes = this.enemyManager ? this.enemyManager.enemyHitboxes : [];
            const intersects = this.raycaster.intersectObjects(hitboxes, false);

            if (intersects.length > 0) {
                let hitObj = intersects[0].object;

                if (hitObj.userData && hitObj.userData.targetObj) {
                    let target = hitObj.userData.targetObj;
                    let isHeadshot = (hitObj.userData.type === 'head');

                    let researchBoost = typeof getDamageBoost === 'function' ? getDamageBoost() : 1.0;
                    let actualDamage = damage * (isHeadshot ? 3 : 1) * researchBoost;

                    // Super revolver piercing
                    if (this.currentWeaponId === 'super' && intersects.length > 1) {
                        let secondObj = intersects[1].object;
                        if (secondObj.userData && secondObj.userData.targetObj) {
                            EventBus.emit('ENTITY_TAKE_DAMAGE', {
                                target: secondObj.userData.targetObj,
                                amount: damage * researchBoost,
                                isHeadshot: (secondObj.userData.type === 'head')
                            });
                        }
                    }

                    EventBus.emit('ENTITY_TAKE_DAMAGE', {
                        target: target,
                        amount: actualDamage,
                        isHeadshot: isHeadshot
                    });

                    // Célkereszt találatjelző
                    EventBus.emit('SHOW_HITMARKER', { isHeadshot: isHeadshot });

                    // Üvegre csapódó vér közeli találatnál (< 4 méter)
                    if (intersects[0].distance < 4.0) {
                        EventBus.emit('SPAWN_VFX_BLOOD');
                    }

                    let slashDir = new THREE.Vector3().subVectors(intersects[0].point, this.camera.position).normalize();
                    EventBus.emit('SPAWN_BLOOD', {
                        position: intersects[0].point,
                        isHeadshot: isHeadshot,
                        slashDir: slashDir,
                        distance: intersects[0].distance
                    });
                    EventBus.emit('PLAY_SOUND', { id: 'zombieHit' });
                }
            }

            let wpnMesh = this.weaponModels[this.currentWeaponId];
            let mX = wpnMesh ? wpnMesh.position.x : 0.2;
            let mY = wpnMesh ? wpnMesh.position.y + 0.08 : -0.2;
            let mZ = wpnMesh ? wpnMesh.position.z - 0.7 : -1.0;

            this.camera.updateMatrixWorld();
            let startPos = new THREE.Vector3(mX, mY, mZ).applyMatrix4(this.camera.matrixWorld);

            if (this.currentWeaponId === 'super') {
                let endPos = this.raycaster.ray.at(50, new THREE.Vector3());
                EventBus.emit('SPAWN_SONIC_RINGS', { start: startPos, end: endPos, distance: 50.0 });
            } else {
                let endPos = (intersects.length > 0) ? intersects[0].point.clone() : new THREE.Vector3().copy(this.camera.position).add(rayDirection.clone().multiplyScalar(50.0));
                if (intersects.length > 0) {
                    let pushDirection = new THREE.Vector3().subVectors(endPos, startPos).normalize();
                    endPos.add(pushDirection.multiplyScalar(2.0));
                }
                EventBus.emit('SPAWN_TRACER', { start: startPos, end: endPos });
            }
        }
    }


    onBash() {
        if ((this.isWeaponBusy && !this.isReloading) || this.currentWeaponId === 'melee' || this.currentWeaponId === 'heal') return;

        if (this.isReloading) {
            this.cancelReloadRequested = true;
        }

        this.isWeaponBusy = true;
        this.isReloading = false;
        EventBus.emit('RELOAD_END');

        let action = this.playAnimation('bash');
        let totalDur = (action && action._clip) ? (action._clip.duration * 1000) : 500;

        let hitDelay = 200;
        if (this.currentWeaponId === 'shotgun') hitDelay = 190;
        if (this.currentWeaponId === 'super') hitDelay = 300;

        setTimeout(() => {
            EventBus.emit('PLAY_SOUND', { id: 'knifeHit', offset: 0.0 });
        }, Math.max(0, hitDelay - 50));

        setTimeout(() => {
            let shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
            this.raycaster.set(this.camera.position, shootDir);
            let hitboxes = this.enemyManager ? this.enemyManager.enemyHitboxes : [];
            const intersects = this.raycaster.intersectObjects(hitboxes, false);

            if (intersects.length > 0 && intersects[0].distance < 2.5) {
                EventBus.emit('PLAY_SOUND', { id: 'zombieHit' });
                let hitObj = intersects[0].object;
                if (hitObj.userData && hitObj.userData.targetObj) {
                    let en = hitObj.userData.targetObj;
                    let stunDuration = 2.5;
                    if (en.type === 'boss') stunDuration = 0.5;
                    else if (en.type === 'tank') stunDuration = 0.5;
                    else if (en.type === 'runner') stunDuration = 1.5;

                    EventBus.emit('ENTITY_TAKE_DAMAGE', {
                        target: en,
                        amount: 2,
                        isHeadshot: false,
                        stunDuration: stunDuration,
                        isBash: true
                    });

                    // Üvegre csapódó vér fegyverütésnél
                    EventBus.emit('SPAWN_VFX_BLOOD');

                    let bashDir = new THREE.Vector3().subVectors(intersects[0].point, this.camera.position).normalize();
                    EventBus.emit('SPAWN_BLOOD', {
                        position: intersects[0].point,
                        isHeadshot: false,
                        slashDir: bashDir,
                        distance: intersects[0].distance
                    });
                }
            }
        }, hitDelay);

        setTimeout(() => {
            this.isWeaponBusy = false;
            this.weaponIdleTimer = 1.0;
            this.playAnimation('watch');
        }, totalDur);
    }

    onReload() {
        // FIX: Futás közben és Gen Stab (medkit) közben nem lehet újratölteni
        if (this.inputManagerRef && this.inputManagerRef.isSprinting) return;
        if (this.isUsingMedkit || (this.weaponModels['heal'] && this.weaponModels['heal'].visible)) return;

        let wpn = this.weapons[this.currentWeaponId];
        if (this.isWeaponBusy || wpn.ammo >= wpn.maxAmmo || wpn.reserve <= 0) return;

        this.isReloading = true;
        this.isWeaponBusy = true;
        this.cancelReloadRequested = false;

        EventBus.emit('RELOAD_START', { weaponId: this.currentWeaponId });

        if (this.currentWeaponId === 'shotgun') {
            this.playAnimation('reloadStart');
            setTimeout(() => { this.reloadSingleShell(wpn); }, 480);
        } else if (this.currentWeaponId === 'super') {
            this.playAnimation('reload');
            this.reloadRevolver(wpn);
        } else {
            this.playAnimation('reload');
            if (this.currentWeaponId === 'pistol') {
                EventBus.emit('PLAY_SOUND', { id: 'pistolReload', playbackRate: 1.70, stopAfter: 2100 });
            } else if (this.currentWeaponId === 'rifle') {
                setTimeout(() => {
                    if (this.isReloading && this.currentWeaponId === 'rifle') {
                        EventBus.emit('PLAY_SOUND', { id: 'rifleReload' });
                    }
                }, 200);
            } else {
                EventBus.emit('PLAY_SOUND', { id: this.currentWeaponId + 'Reload' });
            }
            let action = this.weaponActions[this.currentWeaponId] ? this.weaponActions[this.currentWeaponId]['reload'] : null;
            let animDuration = (action && action._clip) ? (action._clip.duration * 1000) : wpn.reloadTime;

            setTimeout(() => {
                if (!this.isReloading) return;
                const load = Math.min(wpn.maxAmmo - wpn.ammo, wpn.reserve);
                wpn.ammo += load;
                wpn.reserve -= load;
                this.isReloading = false;
                this.isWeaponBusy = false;
                this.weaponIdleTimer = 1.0;
                this.playAnimation('watch');
                EventBus.emit('AMMO_CHANGED', {
                    ammo: wpn.ammo,
                    reserve: wpn.reserve,
                    maxAmmo: wpn.maxAmmo,
                    maxReserve: wpn.maxReserve
                });
                EventBus.emit('UI_UPDATE_NEEDED');
                EventBus.emit('RELOAD_END');
            }, animDuration);
        }
    }

    playShotgunPump() {
        let pumpAction = this.playAnimation('pump');
        let pumpDur = (pumpAction && pumpAction._clip) ? (pumpAction._clip.duration * 1000) : 760;

        // 0.6 átugorja a lövést, és pont a pumpánál kezdődik!
        EventBus.emit('PLAY_SOUND', { id: 'shotgunShoot', offset: 0.6 });

        setTimeout(() => {
            this.isReloading = false;
            this.isWeaponBusy = false;
            this.weaponIdleTimer = 1.0;
            this.playAnimation('watch');
            EventBus.emit('UI_UPDATE_NEEDED');
            EventBus.emit('RELOAD_END');
        }, pumpDur);
    }

    reloadSingleShell(wpn) {
        if (this.cancelReloadRequested || wpn.ammo >= wpn.maxAmmo || wpn.reserve <= 0 || !this.isReloading) {
            this.playShotgunPump();
            return;
        }

        EventBus.emit('PLAY_SOUND', { id: 'shotgunReload' });
        this.playAnimation('reload');
        setTimeout(() => {
            if (!this.isReloading || this.cancelReloadRequested) {
                this.playShotgunPump();
                return;
            }
            wpn.ammo++;
            wpn.reserve--;
            EventBus.emit('AMMO_CHANGED', {
                ammo: wpn.ammo,
                reserve: wpn.reserve,
                maxAmmo: wpn.maxAmmo,
                maxReserve: wpn.maxReserve
            });
            EventBus.emit('UI_UPDATE_NEEDED');
            this.reloadSingleShell(wpn);
        }, 1000);
    }

    finishRevolverReload() {
        this.isReloading = false;
        this.isWeaponBusy = false;
        this.weaponIdleTimer = 1.0;
        this.playAnimation('watch');
        EventBus.emit('UI_UPDATE_NEEDED');
        EventBus.emit('RELOAD_END');
    }

    reloadRevolver(wpn) {
        let bulletsToLoad = Math.min(wpn.maxAmmo - wpn.ammo, wpn.reserve);
        let timePerBullet = 5750 / 6.0;
        let loadedBullets = 0;
        let action = this.weaponActions[this.currentWeaponId] ? this.weaponActions[this.currentWeaponId]['reload'] : null;

        if (this.reloadInterval) clearInterval(this.reloadInterval);

        this.reloadInterval = setInterval(() => {
            if (this.cancelReloadRequested || !this.isReloading) {
                clearInterval(this.reloadInterval);
                this.reloadInterval = null;
                if (action) {
                    action.time = 5.75;
                    action.setEffectiveTimeScale(1.5);
                }
                setTimeout(() => { EventBus.emit('PLAY_SOUND', { id: 'superClose' }); }, 500);
                setTimeout(() => {
                    if (action) action.setEffectiveTimeScale(1.0);
                    this.finishRevolverReload();
                }, 800);
                return;
            }

            EventBus.emit('PLAY_SOUND', { id: 'superReload' });
            wpn.ammo++;
            wpn.reserve--;
            loadedBullets++;
            EventBus.emit('AMMO_CHANGED', {
                ammo: wpn.ammo,
                reserve: wpn.reserve,
                maxAmmo: wpn.maxAmmo,
                maxReserve: wpn.maxReserve
            });
            EventBus.emit('UI_UPDATE_NEEDED');

            if (loadedBullets >= bulletsToLoad) {
                clearInterval(this.reloadInterval);
                this.reloadInterval = null;
                if (action) action.time = 5.75;
                setTimeout(() => { EventBus.emit('PLAY_SOUND', { id: 'superClose' }); }, 500);
                setTimeout(() => {
                    this.finishRevolverReload();
                }, 1200);
            }
        }, timePerBullet);
    }

    executeMeleeStrike(player, inputManager) {
        EventBus.emit('PLAY_SOUND', { id: 'knifeHit', offset: 0.0 });
        let action = this.playAnimation('strike');
        if (action) action.timeScale = 1.5;
        let dur = (action && action._clip) ? ((action._clip.duration / 1.5) * 1000) : 410;

        let effectiveCharge = Math.min(this.meleeChargeTime, 2.0);
        let researchBoost = typeof getDamageBoost === 'function' ? getDamageBoost() : 1.0;
        let finalDamage = (0.5 + (effectiveCharge / 2.0) * 3.5) * researchBoost;

        let isSprintStrike = (player && player.wasSprinting && inputManager && (Math.abs(inputManager.moveX) > 0.1 || Math.abs(inputManager.moveZ) > 0.1));
        if (isSprintStrike) {
            finalDamage *= 1.5;
        }

        let strikeCost = 10 + (effectiveCharge * 10);
        if (isSprintStrike) strikeCost += 10;

        if (player) {
            player.stamina -= strikeCost;
            if (player.stamina <= 0) {
                player.stamina = 0;
                player.isExhausted = true;
                player.staminaCooldown = 3.0;
                EventBus.emit('PLAYER_EXHAUSTED');
                EventBus.emit('PLAY_SOUND', { id: 'cough' });
            }
            EventBus.emit('UI_UPDATE_NEEDED');
        }

        setTimeout(() => {
            let shootDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
            this.raycaster.set(this.camera.position, shootDir);
            let hitboxes = this.enemyManager ? this.enemyManager.enemyHitboxes : [];
            const intersects = this.raycaster.intersectObjects(hitboxes, false);

            let hitDistance = effectiveCharge > 1.0 ? 3.5 : 2.5;

            if (intersects.length > 0 && intersects[0].distance < hitDistance) {
                let hitObj = intersects[0].object;
                if (hitObj.userData && hitObj.userData.targetObj) {
                    EventBus.emit('PLAY_SOUND', { id: 'zombieHit' });
                    let en = hitObj.userData.targetObj;
                    let isHeadshot = (hitObj.userData.type === 'head');

                    let stunDuration = 0;
                    if (isSprintStrike) {
                        EventBus.emit('ADD_RECOIL', 0.5);
                        if (en.type === 'boss') stunDuration = 1.0;
                        else if (en.type === 'tank') stunDuration = 2.0;
                        else if (en.type === 'runner') stunDuration = 3.0;
                        else stunDuration = 5.0;
                    }

                    EventBus.emit('ENTITY_TAKE_DAMAGE', {
                        target: en,
                        amount: finalDamage * (isHeadshot ? 3 : 1),
                        isHeadshot: isHeadshot,
                        isMelee: true,
                        stunDuration: stunDuration
                    });

                    // Célkereszt találatjelző és üvegre csapódó vér
                    EventBus.emit('SHOW_HITMARKER', { isHeadshot: isHeadshot });
                    EventBus.emit('SPAWN_VFX_BLOOD');

                    let slashDir = new THREE.Vector3().subVectors(intersects[0].point, this.camera.position).normalize();
                    EventBus.emit('SPAWN_BLOOD', {
                        position: intersects[0].point,
                        isHeadshot: isHeadshot,
                        slashDir: slashDir,
                        distance: intersects[0].distance
                    });
                }
            }
        }, 120);

        setTimeout(() => {
            this.isWeaponBusy = false;
            this.weaponIdleTimer = 1.0;
            this.playAnimation('watch');
        }, dur);
    }

    update(delta, inputManager, player, levelManager) {
        this.inputManagerRef = inputManager;
        this.playerRef = player;

        if (this.muzzleFlash && this.muzzleFlash.intensity > 0) {
            this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - delta * 30);
        }

        if (this.meleeCooldown > 0) this.meleeCooldown -= delta;

        // Melee feltöltés (Charge)
        if (this.isChargingMelee) {
            this.meleeChargeTime = Math.min(2.0, this.meleeChargeTime + delta);

            if (player) {
                player.stamina -= delta * 5.0;
                if (player.stamina <= 0) {
                    player.stamina = 0;
                    player.isExhausted = true;
                    player.staminaCooldown = 3.0;
                    EventBus.emit('PLAYER_EXHAUSTED');
                    EventBus.emit('PLAY_SOUND', { id: 'cough' });
                    this.isChargingMelee = false;
                    EventBus.emit('STOP_AUDIO', { id: 'heavyBreathing' });
                    this.playAnimation('watch');
                    this.isWeaponBusy = false;
                    this.meleeCooldown = 0.5;
                }
            }

            this.targetFOV = 75 - Math.min(this.meleeChargeTime * 10, 20);
            if (this.meleeChargeTime >= 2.0) {
                EventBus.emit('ADD_RECOIL', 0.005);
            }
        } else {
            this.targetFOV = 75;
        }

        if (this.camera) {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFOV, delta * 5.0);
            this.camera.updateProjectionMatrix();
        }

        // Automata fegyver (Rifle/SMG) folyamatos tüzelés
        let wpn = this.weapons[this.currentWeaponId];
        if (wpn && wpn.auto && inputManager && inputManager.isShootingBtnPressed && !this.isReloading && !this.isFacingWall) {
            this.autoShootTimer -= delta;
            if (this.autoShootTimer <= 0) {
                this.autoShootTimer = wpn.fireRate;
                if (wpn.ammo > 0) {
                    this.handleFire();
                } else {
                    let now = performance.now();
                    if (now - this.lastDryFireTime > 300) {
                        this.lastDryFireTime = now;
                        EventBus.emit('PLAY_SOUND', { id: 'dryFire' });
                    }
                    if (!this.hasAnyAmmoLeft()) {
                        this.forceWeaponSwitch('melee');
                    }
                }
            }
        }

        // Frissítjük az összes fegyver (és Gen-Stab) animációját
        for (let key in this.weaponMixers) {
            if (this.weaponMixers[key]) {
                this.weaponMixers[key].update(delta);
            }
        }

        let activeWeaponId = (this.weaponModels['heal'] && this.weaponModels['heal'].visible) ? 'heal' : this.currentWeaponId;
        if (this.weaponModels[activeWeaponId] && this.weaponModels[activeWeaponId].visible) {
            // --- FAL-VISSZAHÚZÁS ---
            let wallPullbackZ = 0;
            let wallPullbackRotX = 0;
            this.isFacingWall = false;

            if (this.currentWeaponId !== 'heal' && levelManager) {
                let camPos = this.camera.position.clone();
                let rayDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
                rayDir.y = 0;
                rayDir.normalize();

                let wallRay = new THREE.Ray(camPos, rayDir);
                let closestDist = Infinity;

                for (let i = 0; i < levelManager.wallHitboxes.length; i++) {
                    let intersect = wallRay.intersectBox(levelManager.wallHitboxes[i], new THREE.Vector3());
                    if (intersect) {
                        let dist = camPos.distanceTo(intersect);
                        if (dist < closestDist) closestDist = dist;
                    }
                }

                if (closestDist < 1.2) {
                    let intensity = 1.0 - (closestDist / 1.2);
                    wallPullbackZ = intensity * 0.5;
                    wallPullbackRotX = intensity * 1.2;

                    if (closestDist < 0.9 && this.currentWeaponId !== 'melee') {
                        this.isFacingWall = true;
                    }
                }
            }

            // --- SPRINTELÉS ALATTI FEGYVER LEENGEDÉS ---
            let sprintRotX = 0, sprintRotY = 0, sprintRotZ = 0, sprintPosY = 0;
            let isSprinting = inputManager ? inputManager.isSprinting : false;
            let speed = player ? Math.hypot(player.playerVelX, player.playerVelZ) : 0;
            let isExhausted = player ? player.isExhausted : false;

            if (isSprinting && !isExhausted && speed > 0.05 && this.currentWeaponId !== 'heal') {
                sprintRotX = -0.2;
                sprintRotY = 0.6;
                sprintRotZ = 0.3;
                sprintPosY = -0.05;
            }

            // --- SWAY ÉS BOBBING ---
            let mx = inputManager ? (inputManager.mouseDeltaX || 0) : 0;
            let my = inputManager ? (inputManager.mouseDeltaY || 0) : 0;
            this.swayX = THREE.MathUtils.lerp(this.swayX, mx * 0.001, delta * 5);
            this.swayY = THREE.MathUtils.lerp(this.swayY, my * 0.001, delta * 5);

            let breathSpeed = isExhausted ? 5.0 : 1.5;
            this.breathTime += delta * breathSpeed;

            let weaponBobX = 0;
            let weaponBobY = 0;

            if (speed > 0.05) {
                let bobTime = player ? player.bobTime : this.breathTime;
                weaponBobX = Math.cos(bobTime) * 0.015;
                weaponBobY = Math.abs(Math.sin(bobTime)) * 0.02;
                if (isSprinting && !isExhausted) {
                    weaponBobX *= 2.0;
                    weaponBobY *= 2.0;
                } else if (isExhausted || (inputManager && inputManager.isCrouching)) {
                    weaponBobX *= 0.5;
                    weaponBobY *= 0.5;
                }
            } else {
                let breathIntensity = isExhausted ? 0.01 : 0.003;
                weaponBobY = Math.sin(this.breathTime) * breathIntensity;
                weaponBobX = Math.cos(this.breathTime * 0.5) * (breathIntensity * 0.4);
            }

            // --- IDLE (WATCH) ANIMÁCIÓ ---
            if (!this.isWeaponBusy && !this.isReloading && this.currentWeaponId !== 'heal') {
                this.weaponIdleTimer -= delta;
                if (this.weaponIdleTimer <= 0) {
                    let action = this.weaponActions[this.currentWeaponId] ? this.weaponActions[this.currentWeaponId]['watch'] : null;
                    if (action) {
                        this.playAnimation('watch');
                        let animLen = action._clip ? (action._clip.duration / action.timeScale) : 1.0;
                        this.weaponIdleTimer = animLen + 2.0 + (Math.random() * 2.0);
                    } else {
                        this.weaponIdleTimer = 5.0;
                    }
                }
            }

            // ALKALMAZÁS
            let currentWeaponMesh = this.weaponModels[activeWeaponId];
            let baseRot = this.baseRotations[activeWeaponId];
            let basePos = this.basePositions[activeWeaponId];

            if (currentWeaponMesh && baseRot && basePos) {
                currentWeaponMesh.rotation.x = THREE.MathUtils.lerp(currentWeaponMesh.rotation.x, baseRot.x - this.swayY + wallPullbackRotX + sprintRotX, delta * 10);
                currentWeaponMesh.rotation.y = THREE.MathUtils.lerp(currentWeaponMesh.rotation.y, baseRot.y - this.swayX + sprintRotY, delta * 10);
                currentWeaponMesh.rotation.z = THREE.MathUtils.lerp(currentWeaponMesh.rotation.z, baseRot.z + sprintRotZ, delta * 10);

                currentWeaponMesh.position.x = THREE.MathUtils.lerp(currentWeaponMesh.position.x, basePos.x + weaponBobX, delta * 10);
                currentWeaponMesh.position.y = THREE.MathUtils.lerp(currentWeaponMesh.position.y, basePos.y - weaponBobY + sprintPosY, delta * 10);
                currentWeaponMesh.position.z = THREE.MathUtils.lerp(currentWeaponMesh.position.z, basePos.z + wallPullbackZ, delta * 10);
            }
        }
    }
}
