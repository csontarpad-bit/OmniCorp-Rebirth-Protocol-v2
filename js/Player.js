import * as THREE from 'three';
import EventBus from './EventBus.js';
import { skills } from './Database.js';

export class Player {
    constructor() {
        this.engine = null;
        this.camera = null;

        // Statisztikák (Állapotok)
        this.health = 100;
        this.maxHealth = 100;
        this.armor = 0;
        this.stamina = 100;
        this.staminaCooldown = 0;
        this.infection = 0;
        this.infectionSpasmTimer = 10.0;
        this.infectionTickTimer = 1.0;
        this.breathTime = 0;
        this.isExhausted = false;
        
        // Mozgás / Fizika
        this.playerVelX = 0;
        this.playerVelZ = 0;
        this.crouchOffset = 0;
        this.cameraShake = 0;
        this.bobTime = 0;
        this.currentBob = 0;
        this.baseCamY = 1.6;
        this.velocityY = 0;
        
        this.roll = 0;
        this.recoilPitch = 0;
        
        this.sprintStopWobble = 0;
        this.wasSprinting = false;
        
        this.medkits = 0;
        this.maxMedkits = 3;
        this.resonators = 0;
        this.maxResonators = 1;
        this.isUsingMedkit = false;
        this.invulnerableTimer = 0;
        this.isGodMode = false;
        this.druggedTimer = 0;
        this.druggedTickTimer = 0;

        // Folyamatos és sűrű sebződés figyelő (continuous pain audio)
        this.recentDamageTimes = [];
        this.continuousPainActive = false;
        this.continuousPainGraceTimer = 0;

        this._bindEvents();
    }

    _bindEvents() {
        EventBus.on('PLAYER_TAKE_DAMAGE', (amount) => this.onTakeDamage(amount));
        EventBus.on('HEAL_PLAYER', (amount) => this.onHeal(amount));
        EventBus.on('ADD_ARMOR', (amount) => this.onAddArmor(amount));
        EventBus.on('DEV_SET_GOD_MODE', (val) => { this.isGodMode = val; });
        EventBus.on('ADD_RECOIL', (amount) => { this.recoilPitch += amount; });
        EventBus.on('ADD_INFECTION', (amount) => {
            this.infection = Math.min(100, Math.max(0, this.infection + amount));
            EventBus.emit('INFECTION_CHANGED', { playerInfection: this.infection });
            EventBus.emit('UI_UPDATE_NEEDED');
        });
        EventBus.on('CAMERA_SHAKE', (intensity) => {
            this.cameraShake = Math.max(this.cameraShake, intensity);
        });
        EventBus.on('PLANT_TRAP_TRIGGERED', () => this.onPlantTrapTriggered());
        EventBus.on('ADD_DRUGGED_EFFECT', (duration = 1.5) => {
            document.body.classList.add('drugged');
            setTimeout(() => {
                document.body.classList.remove('drugged');
            }, duration * 1000);
        });
        EventBus.on('ADD_MEDKIT', (count = 1) => {
            this.medkits = Math.min(this.maxMedkits, this.medkits + count);
            EventBus.emit('UI_UPDATE_NEEDED');
        });
        EventBus.on('ADD_RESONATOR', (count = 1) => {
            this.resonators = Math.min(this.maxResonators, this.resonators + count);
            EventBus.emit('UI_UPDATE_NEEDED');
        });
        EventBus.on('LOOTING_STATE_CHANGED', (isLooting) => { 
            this.isLooting = isLooting;
            // FIX: Lehajolás közben az egér be van fagyasztva
            EventBus.emit('LOCK_LOOK', isLooting || this.isDeploying);
        });
        EventBus.on('DEPLOY_STATE_CHANGED', (isDeploying) => { 
            this.isDeploying = isDeploying;
            // FIX: Lerakás közben az egér be van fagyasztva
            EventBus.emit('LOCK_LOOK', this.isLooting || isDeploying);
        });
        EventBus.on('input:heal', () => {
            // FIX: Futás közben és újratöltés közben nem lehet gyógyítani (gen stab)
            if (this.inputManagerRef && this.inputManagerRef.isSprinting) return;
            if (this.isReloading) return;
            this.useMedkit();
        });
        EventBus.on('RELOAD_START', () => { this.isReloading = true; });
        EventBus.on('RELOAD_END', () => { this.isReloading = false; });
        EventBus.on('CAMERA_DIP', (data) => {
            this.cameraDipTimer = (data && data.duration) ? data.duration : 0.7;
            EventBus.emit('PLAYER_RECOIL_ADD', { yaw: 0, pitch: -0.06 });
        });
        EventBus.on('SET_INVULNERABLE', (duration) => {
            this.invulnerableTimer = duration;
        });
        EventBus.on('input:deploy', () => {
            if (this.resonators > 0 && this.camera) {
                let forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
                forward.y = 0;
                forward.normalize();
                let deployPos = this.camera.position.clone().add(forward.multiplyScalar(1.4));
                deployPos.y = 0.05;
                
                this.resonators--;
                EventBus.emit('START_DEPLOY_RESONATOR', { deployPosition: deployPos, camera: this.camera });
                EventBus.emit('UI_UPDATE_NEEDED');
            }
        });
        EventBus.on('START_GAME', () => this.reset());
        EventBus.on('RETURN_TO_MAIN_MENU', () => {
            this.invulnerableTimer = 0;
            this.isUsingMedkit = false;
            this.isLooting = false;
            this.isDeploying = false;
            this.playerVelX = 0;
            this.playerVelZ = 0;
            this.velocityY = 0;
            this.cameraShake = 0;
            this.sprintStopWobble = 0;
            this.wasSprinting = false;
            this.infection = 0;
            this.druggedTimer = 0;
            this.druggedTickTimer = 0;
            document.body.classList.remove('drugged', 'infected-mild', 'infected-medium', 'infected-severe');
            EventBus.emit('STOP_AUDIO', { id: 'whispers' });
            EventBus.emit('INFECTION_CHANGED', { playerInfection: 0 });
        });
    }

    reset() {
        this.health = 100;
        this.maxHealth = 100;
        this.armor = 0;
        this.stamina = 100;
        this.staminaCooldown = 0;
        this.infection = 0;
        this.infectionSpasmTimer = 10.0;
        this.infectionTickTimer = 1.0;
        this.breathTime = 0;
        this.isExhausted = false;
        this.playerVelX = 0;
        this.playerVelZ = 0;
        this.crouchOffset = 0;
        this.cameraShake = 0;
        this.bobTime = 0;
        this.currentBob = 0;
        this.baseCamY = 1.6;
        this.velocityY = 0;
        this.roll = 0;
        this.recoilPitch = 0;
        this.sprintStopWobble = 0;
        this.wasSprinting = false;
        this.medkits = 0;
        this.resonators = 0;
        this.isUsingMedkit = false;
        this.invulnerableTimer = 0;
        this.isLooting = false;
        this.isDeploying = false;
        this.isReloading = false;
        this.cameraDipTimer = 0;
        this.crouchOffset = 0;
        this.druggedTimer = 0;
        this.druggedTickTimer = 0;

        if (this.continuousPainActive) {
            this.continuousPainActive = false;
            EventBus.emit('STOP_AUDIO', { id: 'continuousPain' });
        }
        this.recentDamageTimes = [];
        this.continuousPainGraceTimer = 0;

        if (this.camera) {
            this.camera.position.set(0, 1.6, 0);
        }

        document.body.classList.remove('drugged', 'infected-mild', 'infected-medium', 'infected-severe');
        EventBus.emit('STOP_AUDIO', { id: 'whispers' });
        EventBus.emit('STOP_AUDIO', { id: 'continuousPain' });
        EventBus.emit('INFECTION_CHANGED', { playerInfection: 0 });
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    init(engine) {
        this.engine = engine;
        this.camera = engine.camera;
        
        // --- Játékos fények ---
        this.playerLight = new THREE.PointLight(0xaaffaa, 0.8, 20);
        this.engine.scene.add(this.playerLight);

        this.flashlight = new THREE.SpotLight(0xaaffaa, 20, 50, Math.PI / 6, 0.5);
        this.flashlight.position.set(0, 0, 0);
        this.camera.add(this.flashlight);
        this.flashlight.target.position.set(0, 0, -1);
        this.camera.add(this.flashlight.target);

        // Zseblámpa kapcsoló állapota
        this.flashlightOn = true;
        
        console.log(`[KRONOS] Player modul inicializálva.`);
    }

    onTakeDamage(amount) {
        if (this.isGodMode || this.invulnerableTimer > 0) return; // Sérthetetlenség aktív

        let noShake = false;
        let noBlood = false;
        let isContinuousSource = false;
        if (typeof amount === 'object' && amount !== null) {
            noShake = !!amount.noShake;
            noBlood = !!amount.noBlood;
            if (amount.source === 'puddle' || amount.source === 'bossShockwave' || amount.isContinuous) {
                isContinuousSource = true;
            }
            amount = amount.amount || 0;
        }

        if (this.armor > 0) {
            if (this.armor >= amount) { 
                this.armor -= amount; 
                amount = 0; 
            } else { 
                amount -= this.armor; 
                this.armor = 0; 
            }
        }
        
        if (amount > 0) {
            this.health -= amount;

            // Sebződés gyakoriságának és forrásának figyelése
            const now = performance.now() / 1000;
            this.recentDamageTimes.push(now);
            this.recentDamageTimes = this.recentDamageTimes.filter(t => (now - t) <= 1.2);

            const isFrequent = isContinuousSource || this.recentDamageTimes.length >= 2;

            if (isFrequent) {
                if (!this.continuousPainActive) {
                    this.continuousPainActive = true;
                    EventBus.emit('PLAY_SOUND', { id: 'continuousPain', loop: true });
                }
                this.continuousPainGraceTimer = 0.8;
            } else {
                if (!this.continuousPainActive) {
                    EventBus.emit('PLAY_SOUND', { id: 'hurt' });
                }
            }

            if (!noShake) {
                this.cameraShake = Math.max(this.cameraShake, 0.3); // Feszültség remegés
            }
            if (!noBlood) {
                let bloodPos = this.camera ? this.camera.position.clone() : new THREE.Vector3();
                EventBus.emit('SPAWN_BLOOD', { isPlayer: true, position: bloodPos });
            }
            EventBus.emit('DAMAGE_TAKEN');
        }

        if (this.health <= 0) {
            if (this.continuousPainActive) {
                this.continuousPainActive = false;
                EventBus.emit('STOP_AUDIO', { id: 'continuousPain' });
            }

            if (skills && skills.revive && skills.revive.level > 0) {
                skills.revive.level--;
                let maxHP = 100 + (skills.maxHealth ? skills.maxHealth.level * 20 : 0);
                this.health = maxHP;
                this.invulnerableTimer = 2.0;
                this.infection = Math.max(0, this.infection - 40);
                this.druggedTimer = 0;
                document.body.classList.remove('drugged', 'infected-mild', 'infected-medium', 'infected-severe');
                EventBus.emit('PLAY_SOUND', { id: 'defibrillator' });
                EventBus.emit('UI_UPDATE_NEEDED');
                return;
            }

            this.health = 0;
            this.druggedTimer = 0;
            document.body.classList.remove('drugged', 'infected-mild', 'infected-medium', 'infected-severe');
            EventBus.emit('STOP_AUDIO', { id: 'whispers' });
            EventBus.emit('STOP_AUDIO', { id: 'continuousPain' });
            EventBus.emit('PLAY_SOUND', { id: 'deathScream' });
            EventBus.emit('PLAYER_DIED');
        }
        
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    onHeal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    onAddArmor(amount) {
        this.armor += amount;
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    useMedkit() {
        if (this.medkits <= 0 || this.health >= this.maxHealth || this.isUsingMedkit || this.isReloading) return;
        this.isUsingMedkit = true;
        EventBus.emit('MEDKIT_START');

        setTimeout(() => {
            EventBus.emit('PLAY_SOUND', { id: 'genStab', offset: 1.3 });
            setTimeout(() => {
                EventBus.emit('STOP_AUDIO', { id: 'genStab' });
            }, 1150);
        }, 3500);

        setTimeout(() => {
            this.medkits--;
            let healAmount = 40 * (1 + ((skills && skills.healthLoot) ? skills.healthLoot.level * 0.2 : 0));
            this.health = Math.min(this.maxHealth, this.health + healAmount);
            this.infection = Math.min(100, this.infection + 5);

            document.body.classList.add('drugged');
            setTimeout(() => {
                document.body.classList.remove('drugged');
            }, 1500);

            const healFlash = document.getElementById('heal-flash');
            if (healFlash) {
                healFlash.style.opacity = '1';
                setTimeout(() => { healFlash.style.opacity = '0'; }, 300);
            }
            EventBus.emit('UI_UPDATE_NEEDED');
        }, 5200);

        setTimeout(() => {
            this.isUsingMedkit = false;
            EventBus.emit('MEDKIT_END');
        }, 5700);
    }

    onPlantTrapTriggered() {
        this.onTakeDamage(20);
        this.infection = Math.min(100, this.infection + 15);
        EventBus.emit('INFECTION_CHANGED', { playerInfection: this.infection });

        const damageFlash = document.getElementById('damage-flash');
        if (damageFlash) {
            damageFlash.style.backgroundColor = 'rgba(150, 0, 255, 0.4)';
            damageFlash.style.opacity = '1';
            setTimeout(() => {
                damageFlash.style.opacity = '0';
                damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
            }, 300);
        }

        this.druggedTimer = 5.0;
        this.druggedTickTimer = 0;
        document.body.classList.add('drugged');
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    update(delta, inputManager, levelManager, weaponSystem) {
        if (!this.engine || !inputManager) return;
        // FIX: inputManager referencia tárolása (sprint ellenőrzés a heal-hoz)
        this.inputManagerRef = inputManager;

        // Sérthetetlenség időzítő
        if (this.invulnerableTimer > 0) {
            this.invulnerableTimer -= delta;
        }

        // --- FERTŐZÉS (NEXUS SYNC) EFFEKT ÉS RÁNGÁSOK ---
        if (this.infection > 0) {
            document.body.classList.remove('infected-mild', 'infected-medium', 'infected-severe');
            if (this.infection > 75) document.body.classList.add('infected-severe');
            else if (this.infection > 50) document.body.classList.add('infected-medium');
            else if (this.infection > 25) document.body.classList.add('infected-mild');

            if (this.infection >= 30) {
                this.infectionSpasmTimer -= delta;
                if (this.infectionSpasmTimer <= 0) {
                    EventBus.emit('PLAY_SOUND', { id: 'cough' });
                    this.cameraShake = Math.max(this.cameraShake, 0.3 * (this.infection / 100));
                    EventBus.emit('TRIGGER_GLITCH', 200 + Math.random() * 300);
                    let spasmFrequency = 15 - (this.infection / 10);
                    this.infectionSpasmTimer = spasmFrequency + Math.random() * 5;
                }
            }

            if (this.infection >= 100) {
                this.infectionTickTimer -= delta;
                if (this.infectionTickTimer <= 0) {
                    this.infectionTickTimer = 1.0;
                    this.health = Math.max(0, this.health - 1);
                    if (this.health <= 0) {
                        this.onTakeDamage(1);
                    }
                    EventBus.emit('UI_UPDATE_NEEDED');
                }
            }

            let whisperVolume = this.infection / 100;
            if (this.infection < 10) whisperVolume = 0;
            EventBus.emit('SET_WHISPER_VOLUME', whisperVolume);
        } else {
            document.body.classList.remove('infected-mild', 'infected-medium', 'infected-severe');
            EventBus.emit('SET_WHISPER_VOLUME', 0);
        }

        // --- FOLYAMATOS DROG-SEBZÉS (DoT) ---
        if (this.druggedTimer > 0) {
            this.druggedTimer -= delta;
            this.druggedTickTimer += delta;
            if (this.druggedTickTimer >= 1.0) {
                this.druggedTickTimer = 0;
                if (!this.isGodMode) {
                    this.onTakeDamage({ amount: 2, isContinuous: true });
                }
                EventBus.emit('UI_UPDATE_NEEDED');
            }
            if (this.druggedTimer <= 0) {
                document.body.classList.remove('drugged');
            }
        }

        // Folyamatos sebződéshang lecsengése
        if (this.continuousPainActive) {
            this.continuousPainGraceTimer -= delta;
            if (this.continuousPainGraceTimer <= 0 || this.health <= 0) {
                this.continuousPainActive = false;
                EventBus.emit('STOP_AUDIO', { id: 'continuousPain' });
            }
        }

        // Fények pozíciójának frissítése és Horror Villódzás
        if (this.playerLight && this.flashlight) {
            this.playerLight.position.copy(this.camera.position);

            // Játékos állapota határozza meg a lámpa stabilitását
            let cameraShake = this.cameraShake || 0; 
            if (this.infection > 60 || cameraShake > 0.4) {
                // Erősen pislákol (Sérülés vagy magas fertőzés)
                this.flashlight.intensity = Math.random() > 0.5 ? 5 : 20;
                this.playerLight.intensity = Math.random() > 0.5 ? 0.2 : 0.8;
            } else {
                // Ritka, "hibás érintkezés" villanás (1% eséllyel pislant egyet)
                if (Math.random() < 0.01) {
                    this.flashlight.intensity = 5;
                    this.playerLight.intensity = 0.2;
                } else {
                    // Stabil fény simítása
                    this.flashlight.intensity = THREE.MathUtils.lerp(this.flashlight.intensity, 20, delta * 10);
                    this.playerLight.intensity = THREE.MathUtils.lerp(this.playerLight.intensity, 0.8, delta * 10);
                }
            }
            
            // --- LÁMPA LOMHASÁG ÉS LÉLEGZÉS (Task 10) ---
            let mx = inputManager.mouseDeltaX || 0;
            let my = inputManager.mouseDeltaY || 0;
            let currentSpeed = Math.hypot(inputManager.moveX, inputManager.moveZ);
            
            this.lightTargetX = -(mx * 0.0015);
            this.lightTargetY = -(my * 0.0015);
            
            if (currentSpeed > 0.05) {
                this.lightTargetX += Math.cos(this.bobTime) * 0.08;
                this.lightTargetY += Math.abs(Math.sin(this.bobTime)) * 0.12;
            } else {
                let lampBreath = this.isExhausted ? 0.08 : 0.02;
                this.breathTime += delta * (this.isExhausted ? 4.0 : 2.0);
                this.lightTargetY += Math.sin(this.breathTime) * lampBreath;
                this.lightTargetX += Math.cos(this.breathTime * 0.5) * (lampBreath * 0.5);
            }
            
            this.flashlight.target.position.x = THREE.MathUtils.lerp(this.flashlight.target.position.x, this.lightTargetX * 4, delta * 8);
            this.flashlight.target.position.y = THREE.MathUtils.lerp(this.flashlight.target.position.y, this.lightTargetY * 4, delta * 8);
            this.flashlight.target.position.z = -5; // Fix távolság előre
        }
        
        let moveX = inputManager.moveX;
        let moveZ = inputManager.moveZ;
        let isSprinting = inputManager.isSprinting;
        let isCrouching = inputManager.isCrouching;
        
        // FIX: Lehajolás (lootolás / lerakás) közben mozgás és egér zár
        let isLootingActive = this.isLooting || false;
        let isDeployingActive = this.isDeploying || false;
        if (isLootingActive || isDeployingActive) {
            moveX = 0;
            moveZ = 0;
            // Egér mozgásának befagyasztása: a pitch és yaw nem változhat
        }
        
        let speedMult = 0.08 * (1 + ((skills && skills.speed) ? skills.speed.level * 0.2 : 0)); 
        
        if (this.staminaCooldown > 0) this.staminaCooldown -= delta;

        let isMoving = (Math.abs(moveX) > 0.1 || Math.abs(moveZ) > 0.1);
        
        // --- STAMINA LOGIKA ---
        let prevStamina = this.stamina;
        let targetFOV = 75; 

        if (isSprinting && isMoving && !isCrouching && !this.isExhausted && this.staminaCooldown <= 0) {
            this.stamina -= delta * 25.0; 
            speedMult *= 2.2; 
            targetFOV = 85; 
            
            if (this.stamina <= 0) {
                this.stamina = 0; 
                this.isExhausted = true; 
                this.staminaCooldown = 3.0;
                EventBus.emit('PLAYER_EXHAUSTED');
                EventBus.emit('PLAY_SOUND', { id: 'cough' });
            }
        } else {
            if (this.stamina < 100) { 
                this.stamina += delta * 15.0; 
                if (this.stamina >= 100) { 
                    this.stamina = 100; 
                    this.isExhausted = false; 
                }
            }
            if (this.isExhausted) speedMult *= 0.6; 
        }

        if (weaponSystem && weaponSystem.meleeChargeTime > 0) {
            targetFOV = 75 - Math.min(weaponSystem.meleeChargeTime * 10, 20);
        }

        if (Math.abs(prevStamina - this.stamina) > 0.1) {
            EventBus.emit('UI_UPDATE_NEEDED');
        }

        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, delta * 5.0);
        this.camera.updateProjectionMatrix(); 

        if (isCrouching) {
            speedMult *= 0.4; 
        }

        // --- TEHETETLENSÉG (LENDÜLET ÉS CSÚSZÁS) ---
        let targetVx = moveX * speedMult;
        let targetVz = moveZ * speedMult;

        let friction = 6.0; // Eredeti lendület
        
        let isCurrentlySprinting = (isSprinting && isMoving && !this.isExhausted && this.staminaCooldown <= 0);

        if (isCurrentlySprinting) {
            this.wasSprinting = true;
        } else if (this.wasSprinting) {
            this.wasSprinting = false;
            this.sprintStopWobble = 1.0; 
        }

        if (moveX === 0 && moveZ === 0) {
            friction = (this.sprintStopWobble > 0) ? 3.0 : 6.0; 
        }

        this.playerVelX = THREE.MathUtils.lerp(this.playerVelX, targetVx, delta * friction);
        this.playerVelZ = THREE.MathUtils.lerp(this.playerVelZ, targetVz, delta * friction);


        // --- KAMERA DŐLÉS (Strafe Tilt + Lépés Dőlés) ---
        let targetRoll = 0;
        if (isMoving) {
            if (inputManager.keys.a) targetRoll = 0.02;  
            if (inputManager.keys.d) targetRoll = -0.02; 
            if (isSprinting && !this.isExhausted && this.staminaCooldown <= 0) targetRoll *= 1.5; 
            targetRoll += Math.cos(this.bobTime) * (isSprinting ? 0.015 : 0.008);
        }
        this.roll = THREE.MathUtils.lerp(this.roll, targetRoll, delta * 8.0);

        let stopWobblePitch = 0;
        if (this.sprintStopWobble > 0) {
            stopWobblePitch = Math.sin(this.sprintStopWobble * Math.PI) * 0.05;
            this.sprintStopWobble -= delta * 2.0;
        }

        this.recoilPitch = Math.max(0, this.recoilPitch - delta * 1.5);

        // --- KAMERA FORGATÁSA (Quaternion) ---
        this.camera.quaternion.setFromEuler(new THREE.Euler(
            inputManager.pitch + this.recoilPitch + stopWobblePitch, 
            inputManager.yaw, 
            this.roll, 
            'YXZ'
        ));

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion); 
        forward.y = 0; 
        if (forward.lengthSq() > 0.001) forward.normalize(); else forward.set(0,0,-1);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion); right.y = 0; right.normalize();

        let nextX = this.camera.position.x + forward.x * (-this.playerVelZ) + right.x * (this.playerVelX);
        let nextZ = this.camera.position.z + forward.z * (-this.playerVelZ) + right.z * (this.playerVelX);
       
        let playerRadius = 0.3; // Hitbox
        if (levelManager && !levelManager.checkWallCollision(nextX, this.camera.position.z, playerRadius)) this.camera.position.x = nextX;
        if (levelManager && !levelManager.checkWallCollision(this.camera.position.x, nextZ, playerRadius)) this.camera.position.z = nextZ;

        this.velocityY -= 9.81 * delta; // Gravitáció
        this.baseCamY += this.velocityY * delta; 
        if (this.baseCamY < 1.6) { this.baseCamY = 1.6; this.velocityY = 0; }
        
        // --- KAMERA MAGASSÁG ÉS GUGGOLÁS / HAJOLÁS (LOOTOLÁS & TELEPÍTÉS) ---
        // (isLootingActive és isDeployingActive már deklarálva van feljebb)
        let targetOffset = (isCrouching || isLootingActive || isDeployingActive) ? -0.7 : 0;
        this.crouchOffset = THREE.MathUtils.lerp(this.crouchOffset, targetOffset, delta * 8.0);

        // --- LÉPÉSHANGOK ÉS KAMERA RUGÓZÁS (BOBBING) ---
        let effX = this.playerVelX / speedMult; if (isNaN(effX)) effX = 0;
        let effZ = this.playerVelZ / speedMult; if (isNaN(effZ)) effZ = 0;
        const speed = Math.min(1.0, Math.hypot(effX, effZ)); 

        if (speed > 0.05) { 
            let bobSpeedMult = 1.0;
            if (isSprinting && !this.isExhausted) bobSpeedMult = 1.8;     
            else if (this.isExhausted) bobSpeedMult = 0.6;                
            else if (isCrouching || isLootingActive || isDeployingActive) bobSpeedMult = 0.5; 
            
            let prevBobPhase = this.bobTime % Math.PI;
            this.bobTime += delta * 7.0 * bobSpeedMult * (1 + ((skills && skills.speed) ? skills.speed.level * 0.2 : 0)); 
            let currentBobPhase = this.bobTime % Math.PI;

            let bobAmplitude = 0.06 * Math.min(1.0, speed * 2.0);
            this.currentBob = -Math.abs(Math.sin(this.bobTime)) * bobAmplitude; 
            
            if (currentBobPhase < prevBobPhase) {
                EventBus.emit('PLAY_SOUND', { id: 'playerStep' });
                EventBus.emit('SPAWN_DUST', { position: this.camera.position.clone() });
            }
        } 
        else { 
            this.currentBob = THREE.MathUtils.lerp(this.currentBob, 0, delta * 12.0); 
        }
        
        let dipY = 0;
        if (this.cameraDipTimer > 0) {
            this.cameraDipTimer -= delta;
            let progress = Math.max(0, this.cameraDipTimer / 0.6);
            dipY = -Math.sin(progress * Math.PI) * 0.18;
        }
        
        let shakeX = 0, shakeY = 0;
        if (this.cameraShake > 0) {
            shakeX = (Math.random() - 0.5) * this.cameraShake; shakeY = (Math.random() - 0.5) * this.cameraShake;
            this.cameraShake -= delta;
        }
        
        this.camera.position.y = this.baseCamY + this.crouchOffset + this.currentBob + shakeY + dipY;
        this.camera.updateMatrixWorld(true);
    }
}
