import * as THREE from 'three';
import EventBus from './EventBus.js';
import { playerStats, savePlayerStats } from './Database.js';

class ItemManager {
    constructor() {
        this.scene = null;
        this.assetManager = null;
        this.inputManager = null;
        
        this.lootItems = [];
        this.toxicPuddles = [];
        this.activePlants = [];
        this.activeResonators = [];

        // Immerzív lootolás állapota
        this.isLootingActive = false;
        this.activeLootTarget = null;
        this.currentLootProgress = 0;

        // Rezonátor telepítés állapota
        this.isDeploying = false;
        this.deployTimer = 0;
        this.resonatorOpened = false;
        this.deployMesh = null;
        this.deployMixer = null;
        this.deployAction = null;

        this.raycaster = new THREE.Raycaster();
        this.globalToxicMat = null;
        this.globalRedToxicMat = null;
        this.globalHitboxMat = null;
        this.currentWave = 1;
        this.pendingMutations = [];

        this._bindEvents();
    }

    _bindEvents() {
        EventBus.on('SPAWN_MEDKIT', (data) => this.spawnMedkit(data.x, data.z));
        EventBus.on('SPAWN_AMMO', (data) => this.spawnAmmoBox(data.x, data.z));
        EventBus.on('SPAWN_TOXIC_PUDDLE', (data) => this.createToxicPuddle(data.x, data.z));
        EventBus.on('SPAWN_PLANT', (data) => this.spawnPlant(data.x, data.z));
        EventBus.on('START_DEPLOY_RESONATOR', (data) => this.startDeployment(data));
        EventBus.on('RESONATOR_DESTROYED', (res) => this.destroyResonator(res));
        EventBus.on('WAVE_CHANGED', (wave) => { this.currentWave = wave; });
        EventBus.on('WAVE_COMPLETED', () => { 
            this.evolvePuddles(this.currentWave); 
            this.prepareMutations(); 
        });
        EventBus.on('WAVE_STARTED', () => { 
            this.executeMutations(); 
        });
        EventBus.on('ENTITY_TAKE_DAMAGE', (data) => this.onPlantDamage(data));
        EventBus.on('CLEAN_TOXIC_PUDDLES', (count) => this.cleanToxicPuddles(count));
        EventBus.on('DAMAGE_TAKEN', () => {
            if (this.isLootingActive) {
                this.isLootingActive = false;
                this.activeLootTarget = null;
                this.currentLootProgress = 0;
                const progressUI = document.getElementById('loot-progress-container');
                if (progressUI) progressUI.classList.add('hidden');
                EventBus.emit('STOP_AUDIO', { id: 'looting' });
                EventBus.emit('LOOTING_STATE_CHANGED', false);
            }
        });
        EventBus.on('START_GAME', () => this.reset());
    }

    reset() {
        if (this.lootItems) {
            for (let item of this.lootItems) {
                if (item.mesh && this.scene) this.scene.remove(item.mesh);
            }
            this.lootItems = [];
        }
        if (this.toxicPuddles) {
            for (let p of this.toxicPuddles) {
                if (this.scene) this.scene.remove(p);
                if (p.geometry) p.geometry.dispose();
            }
            this.toxicPuddles = [];
        }
        if (this.activePlants) {
            for (let plant of this.activePlants) {
                if (this.scene) {
                    if (plant.mesh) this.scene.remove(plant.mesh);
                    if (plant.puddle) this.scene.remove(plant.puddle);
                    if (plant.hitbox) this.scene.remove(plant.hitbox);
                }
                if (plant.puddle && plant.puddle.geometry) plant.puddle.geometry.dispose();
            }
            this.activePlants = [];
        }
        if (this.activeResonators) {
            for (let res of this.activeResonators) {
                if (this.scene) {
                    if (res.mesh) this.scene.remove(res.mesh);
                    if (res.light) this.scene.remove(res.light);
                }
                if (res.id) {
                    EventBus.emit('STOP_SPATIAL_LOOP', { id: res.id });
                    EventBus.emit('STOP_SPATIAL_LOOP', { id: 'resonator_scream_' + res.id });
                }
                EventBus.emit('STOP_AUDIO', { id: 'resonatorAudio' });
                EventBus.emit('STOP_AUDIO', { id: 'resonatorScream' });
                if (res.sound && res.sound.isPlaying) {
                    res.sound.stop();
                }
            }
            this.activeResonators = [];
        }
        if (this.deployMesh && this.scene) {
            this.scene.remove(this.deployMesh);
            this.deployMesh = null;
        }
        this.pendingMutations = [];
        this.isDeploying = false;
        this.isLootingActive = false;
        this.activeLootTarget = null;
        this.currentWave = 1;
        EventBus.emit('UPDATE_TOXIC_FOG', 0);
    }

    init(scene, assetManager, inputManager) {
        this.scene = scene;
        this.assetManager = assetManager;
        this.inputManager = inputManager;
        this.currentWave = 1;
        this.pendingMutations = [];

        let puddleTex = this.assetManager.textures['puddleTex'];

        this.globalToxicMat = new THREE.MeshStandardMaterial({ 
            map: puddleTex, 
            color: 0x55ff55,     
            transparent: true, 
            opacity: 0.8, 
            depthWrite: false,
            roughness: 0.5,
            metalness: 0.1
        });

        this.globalRedToxicMat = new THREE.MeshBasicMaterial({ 
            map: puddleTex, 
            color: 0xff2222,    
            transparent: true, 
            opacity: 0.9, 
            depthWrite: false 
        });
        
        this.globalHitboxMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            wireframe: false, 
            visible: false 
        });
    }

    spawnMedkit(x, z) {
        let modelData = this.assetManager ? (this.assetManager.cloneModel('health') || this.assetManager.cloneModel('healthModel')) : null;
        if (!modelData) return;
        let mesh = modelData.mesh;
        mesh.position.set(x, 0.2, z);
        mesh.rotation.x = Math.random() * 0.2;
        mesh.rotation.z = Math.random() * 0.2;
        mesh.scale.set(0.6, 0.6, 0.6); 
        
        mesh.traverse((c) => {
            if (c.isMesh && c.material) {
                c.material = c.material.clone();
                c.material.emissive = new THREE.Color(0x00aaff); 
                c.material.emissiveIntensity = 0.3;
            }
        });

        mesh.userData = { isLoot: true, type: 'health' };
        
        this.scene.add(mesh);
        this.lootItems.push({ mesh: mesh, type: 'health' });
    }

    spawnAmmoBox(x, z) {
        let modelData = this.assetManager ? (this.assetManager.cloneModel('ammo') || this.assetManager.cloneModel('ammoModel')) : null;
        if (!modelData) return;
        let mesh = modelData.mesh;
        mesh.position.set(x, 0.2, z); 
        mesh.rotation.y = Math.random() * Math.PI;
        mesh.scale.set(1.8, 1.8, 1.8); 
        
        mesh.traverse((c) => {
            if (c.isMesh && c.material) {
                c.material = c.material.clone();
                c.material.emissive = new THREE.Color(0xffcc00); 
                c.material.emissiveIntensity = 0.1;
            }
        });

        mesh.userData = { isLoot: true, type: 'ammo' };

        this.scene.add(mesh);
        this.lootItems.push({ mesh: mesh, type: 'ammo' });
    }

    createToxicPuddle(x, z) {
        const baseRadius = 0.7 + Math.random() * 0.4;
        const geo = new THREE.CircleGeometry(baseRadius, 32); 
        const posAttribute = geo.attributes.position;
        const phase1 = Math.random() * Math.PI * 2;
        const phase2 = Math.random() * Math.PI * 2;

        for (let i = 1; i < posAttribute.count; i++) {
            let vx = posAttribute.getX(i);
            let vy = posAttribute.getY(i);
            let angle = Math.atan2(vy, vx);
            let distort = 1.0 + 0.15 * Math.sin(angle * 3 + phase1) + 0.10 * Math.cos(angle * 5 + phase2);
            posAttribute.setX(i, vx * distort);
            posAttribute.setY(i, vy * distort);
        }
        
        geo.computeVertexNormals();

        const mesh = new THREE.Mesh(geo, this.globalToxicMat.clone()); 
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = Math.random() * Math.PI; 
        mesh.scale.set(0.01, 0.01, 0.01);
        
        mesh.userData = { state: 'green', targetScale: 1.0, spawnWave: this.currentWave };
        mesh.position.set(x, 0.02, z);
        this.scene.add(mesh);
        this.toxicPuddles.push(mesh);
        // FIX: Köd frissítése minden egyes pocsolya létrehozásakor (nem csak törléskor)
        EventBus.emit('UPDATE_TOXIC_FOG', this.toxicPuddles.length);
    }

    spawnPlant(x, z) {
        let modelData = this.assetManager.cloneModel('plant');
        if (!modelData) return;
        let mesh = modelData.mesh;
        mesh.position.set(x, 0, z);
        mesh.scale.set(1.5, 1.5, 1.5); 
        this.scene.add(mesh);
        
        // Nagy Piros Pocsolya a növény alá
        const geo = new THREE.CircleGeometry(1.5, 32); 
        const puddle = new THREE.Mesh(geo, this.globalRedToxicMat);
        puddle.rotation.x = -Math.PI / 2;
        puddle.position.set(x, 0.025, z); 
        this.scene.add(puddle);

        // Lőhető hitbox
        const plantHitbox = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.5, 8), this.globalHitboxMat);
        plantHitbox.position.set(x, 0.75, z);
        
        let newPlant = { mesh: mesh, puddle: puddle, hitbox: plantHitbox, health: 100, x: x, z: z, type: 'plant' };
        
        plantHitbox.userData = { type: 'plant', targetObj: newPlant };
        plantHitbox.frustumCulled = false;
        this.scene.add(plantHitbox);
        
        EventBus.emit('REGISTER_HITBOX', plantHitbox);

        let mixer = new THREE.AnimationMixer(mesh);
        if (modelData.animations && modelData.animations.length > 0) {
            mixer.clipAction(modelData.animations[0]).setLoop(THREE.LoopRepeat).play();
        }
        
        newPlant.mixer = mixer;
        this.activePlants.push(newPlant);
    }

    startDeployment(data) {
        if (this.isDeploying) return;
        let modelData = this.assetManager.cloneModel('resonator');
        if (!modelData) return;

        this.isDeploying = true;
        this.deployTimer = 0;
        this.resonatorOpened = false;

        let mesh = modelData.mesh;
        mesh.scale.set(4.5, 4.5, 4.5);
        mesh.position.copy(data.deployPosition);
        mesh.position.y = 0.05;
        this.scene.add(mesh);

        this.deployMesh = mesh;
        this.deployMixer = new THREE.AnimationMixer(mesh);

        if (modelData.animations && modelData.animations.length > 0) {
            let action = this.deployMixer.clipAction(modelData.animations[0]);
            action.setLoop(THREE.LoopOnce);
            action.clampWhenFinished = true;
            this.deployAction = action;
        }

        const deployUI = document.getElementById('deploy-progress-container');
        if (deployUI) deployUI.classList.remove('hidden');

        EventBus.emit('PLAY_SOUND', { id: 'resonatorInstall' });
        EventBus.emit('DEPLOY_STATE_CHANGED', true);
        EventBus.emit('WEAPON_BUSY_STATE', true);
    }

    destroyResonator(res) {
        let idx = this.activeResonators.indexOf(res);
        if (idx > -1) {
            EventBus.emit('STOP_AUDIO', { id: 'resonatorAudio' });
            EventBus.emit('PLAY_SOUND', { id: 'error' });
            if (res.light) this.scene.remove(res.light);
            if (res.mesh) this.scene.remove(res.mesh);
            this.activeResonators.splice(idx, 1);
        }
    }

    evaporatePuddles(position, maxDist = 5.0) {
        let removed = 0;
        for (let i = this.toxicPuddles.length - 1; i >= 0; i--) {
            let p = this.toxicPuddles[i];
            let dist = Math.hypot(position.x - p.position.x, position.z - p.position.z);
            if (dist <= maxDist) {
                this.scene.remove(p);
                if (p.geometry) p.geometry.dispose();
                this.toxicPuddles.splice(i, 1);
                removed++;
            }
        }
        if (removed > 0) {
            EventBus.emit('UPDATE_TOXIC_FOG', this.toxicPuddles.length);
        }
    }

    onPlantDamage(data) {
        let { target, amount } = data;
        
        let plantIndex = this.activePlants.findIndex(p => p === target || p.hitbox === target);
        if (plantIndex > -1) {
            let plant = this.activePlants[plantIndex];
            plant.health -= amount;
            EventBus.emit('PLAY_SOUND', { id: 'zombieHit' });
            
            if (plant.health <= 0) {
                EventBus.emit('PLAY_SOUND', { id: 'burst' });

                if (typeof playerStats !== 'undefined' && playerStats) {
                    playerStats.plantsDestroyed = (playerStats.plantsDestroyed || 0) + 1;
                    if (typeof savePlayerStats === 'function') savePlayerStats();
                }
                EventBus.emit('DIRECTIVE_CHECK', { type: 'destroy_plant', target: 'mutant' });

                EventBus.emit('SPAWN_BLOOD', {
                    position: plant.hitbox.position.clone(),
                    isPlant: true
                });

                this.scene.remove(plant.mesh);
                this.scene.remove(plant.puddle);
                this.scene.remove(plant.hitbox);
                if (plant.puddle.geometry) plant.puddle.geometry.dispose();
                EventBus.emit('UNREGISTER_HITBOX', plant.hitbox);
                EventBus.emit('ADD_SCORE', 50);
                this.activePlants.splice(plantIndex, 1);
            }
        }
    }

    evolvePuddles(currentWave) {
        for (let p of this.toxicPuddles) {
            let age = currentWave - p.userData.spawnWave;
            
            if (age >= 5 && p.userData.state !== 'ready') {
                p.userData.state = 'ready';
                if (p.material) {
                    p.material.color.setHex(0x990000); 
                    if (p.material.emissive !== undefined) {
                        p.material.emissive.setHex(0x550000);
                        p.material.emissiveIntensity = 0.5; 
                    }
                    p.material.needsUpdate = true;
                }
            } else if (age >= 3 && age < 5 && p.userData.state === 'green') {
                p.userData.state = 'yellow';
                if (p.material) {
                    p.material.color.setHex(0xaa8800); 
                    if (p.material.emissive !== undefined) {
                        p.material.emissive.setHex(0x554400); 
                        p.material.emissiveIntensity = 0.4; 
                    }
                    p.material.needsUpdate = true;
                }
            }
        }
    }

    prepareMutations() {
        this.pendingMutations = [];
        let availablePuddles = this.toxicPuddles.filter(p => p.userData.state === 'ready');
        let i = 0;
        
        while (i < availablePuddles.length) {
            let p1 = availablePuddles[i];
            let cluster = [p1];
            
            for (let j = 0; j < availablePuddles.length; j++) {
                if (i === j) continue;
                let p2 = availablePuddles[j];
                let distSq = Math.pow(p1.position.x - p2.position.x, 2) + Math.pow(p1.position.z - p2.position.z, 2);
                if (distSq < 6.25) { 
                    cluster.push(p2);
                }
            }

            if (cluster.length >= 5) {
                let usedPuddles = cluster.slice(0, 5);
                let cx = 0, cz = 0;
                for (let p of usedPuddles) { cx += p.position.x; cz += p.position.z; }
                cx /= usedPuddles.length; cz /= usedPuddles.length;

                this.pendingMutations.push({ cx: cx, cz: cz, puddles: usedPuddles });
                availablePuddles = availablePuddles.filter(p => !usedPuddles.includes(p));
                i = 0; 
            } else {
                i++; 
            }
        }
    }

    executeMutations() {
        if (!this.pendingMutations) return;
        for (let mut of this.pendingMutations) {
            for (let p of mut.puddles) {
                let idx = this.toxicPuddles.indexOf(p);
                if (idx > -1) this.toxicPuddles.splice(idx, 1);
                this.scene.remove(p);
                if (p.material.color) p.material.color.setHex(0x55ff55);
                p.geometry.dispose();
            }
            this.spawnPlant(mut.cx, mut.cz);
        }
        this.pendingMutations = [];
        
        EventBus.emit('UPDATE_TOXIC_FOG', this.toxicPuddles.length);
    }

    update(delta, camera) {
        // --- 1. SZEIZMIKUS REZONÁTOR TELEPÍTÉSI FOLYAMAT (3 SEC) ---
        if (this.isDeploying && this.deployMesh) {
            this.deployTimer += delta;

            if (this.deployTimer > 0.5 && camera && this.inputManager) {
                let deployPos = this.deployMesh.position.clone();
                deployPos.y += 0.2;
                let targetMatrix = new THREE.Matrix4().lookAt(camera.position, deployPos, new THREE.Vector3(0, 1, 0));
                let targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
                camera.quaternion.slerp(targetQuat, delta * 4.0);
                let euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
                this.inputManager.yaw = euler.y;
                this.inputManager.pitch = euler.x;
            }

            if (this.deployMixer) this.deployMixer.update(delta);

            const deployBar = document.getElementById('deploy-progress-bar');
            if (deployBar) deployBar.style.width = Math.min(100, (this.deployTimer / 3.0) * 100) + '%';

            if (this.deployTimer >= 2.5 && !this.resonatorOpened) {
                this.resonatorOpened = true;
                EventBus.emit('PLAY_SOUND', { id: 'resonatorPowerOn' });

                if (this.deployAction) {
                    this.deployAction.play();
                }
            }

            if (this.deployTimer >= 3.0) {
                this.isDeploying = false;
                EventBus.emit('DEPLOY_STATE_CHANGED', false);
                const deployUI = document.getElementById('deploy-progress-container');
                if (deployUI) deployUI.classList.add('hidden');

                let resLight = new THREE.PointLight(0x00ff00, 2.0, 15);
                resLight.position.set(this.deployMesh.position.x, 0.5, this.deployMesh.position.z);
                this.scene.add(resLight);

                const resId = 'resonator_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
                EventBus.emit('START_SPATIAL_LOOP', {
                    id: resId,
                    name: 'resonatorAudio',
                    position: this.deployMesh.position.clone(),
                    maxDistance: 20.0,
                    baseVolume: 1.0,
                    loop: false
                });

                this.activeResonators.push({
                    id: resId,
                    mesh: this.deployMesh,
                    mixer: this.deployMixer,
                    light: resLight,
                    state: 'lure',
                    timer: 10.0,
                    blastTimer: 7.0,
                    pulseTimer: 0.3
                });

                this.deployMesh = null;
                this.deployMixer = null;
                this.deployAction = null;
                EventBus.emit('WEAPON_BUSY_STATE', false);
                EventBus.emit('WEAPON_EQUIPPED');
            }
        }

        // --- 2. AKTÍV REZONÁTOROK MŰKÖDÉSE ---
        for (let i = this.activeResonators.length - 1; i >= 0; i--) {
            let res = this.activeResonators[i];
            if (res.mixer) res.mixer.update(delta);
            if (res.id && res.mesh) {
                EventBus.emit('UPDATE_SPATIAL_LOOP', { id: res.id, position: res.mesh.position });
            }

            // 1. FÁZIS: VONZÁS (10 másodperc pittyegés)
            if (res.state === 'lure') {
                res.timer -= delta;

                if (res.timer > 6) {
                    res.light.color.setHex(0x00ff00);
                    res.light.intensity = 2.0;
                } else if (res.timer > 3) {
                    res.light.color.setHex(0xffff00);
                    res.light.intensity = Math.sin(res.timer * 10) > 0 ? 3.0 : 1.0;
                } else {
                    res.light.color.setHex(0xff0000);
                    res.light.intensity = Math.sin(res.timer * 25) > 0 ? 4.0 : 0.5;
                }

                if (res.timer <= 0) {
                    res.state = 'detonate';
                    res.light.color.setHex(0x00ffff);
                    res.light.intensity = 6.0;
                    EventBus.emit('CAMERA_SHAKE', 0.5);
                    EventBus.emit('ADD_RECOIL', 0.5);
                }
            } 
            // 2. FÁZIS: ENERGIA-VIHAR (7 másodperc)
            else if (res.state === 'detonate') {
                res.blastTimer -= delta;
                res.light.intensity = 6.0 + Math.random() * 4.0;

                res.pulseTimer -= delta;
                if (res.pulseTimer <= 0) {
                    res.pulseTimer = 0.3;

                    EventBus.emit('SPAWN_SONIC_BOOM', { 
                        position: res.mesh.position.clone(),
                        isGroundWave: true,
                        maxRadius: 5.0
                    });

                    EventBus.emit('RESONATOR_BLAST_PULSE', {
                        position: res.mesh.position.clone(),
                        radius: 5.0,
                        wave: this.currentWave,
                        resonatorId: res.id
                    });

                    this.evaporatePuddles(res.mesh.position, 5.0);
                }

                if (res.blastTimer <= 0) {
                    if (res.id) {
                        EventBus.emit('STOP_SPATIAL_LOOP', { id: res.id });
                        EventBus.emit('STOP_SPATIAL_LOOP', { id: 'resonator_scream_' + res.id });
                    }
                    EventBus.emit('STOP_AUDIO', { id: 'resonatorAudio' });
                    EventBus.emit('STOP_AUDIO', { id: 'resonatorScream' });
                    if (res.light) this.scene.remove(res.light);
                    if (res.mesh) {
                        res.mesh.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material = child.material.clone();
                                child.material.color.setHex(0x222222);
                                if (child.material.emissive) child.material.emissive.setHex(0x000000);
                            }
                        });
                    }
                    this.activeResonators.splice(i, 1);
                }
            }
        }

        // --- 3. IMMERZÍV LOOTOLÁS (GUGYOLÁS + 'E' GOMB) ---
        if (camera) {
            let closestLoot = null;
            let closestDist = Infinity;
            for (let item of this.lootItems) {
                let d = camera.position.distanceTo(item.mesh.position);
                if (d < 2.5 && d < closestDist) {
                    closestDist = d;
                    closestLoot = item;
                }
            }

            const promptUI = document.getElementById('loot-interaction-prompt');
            const progressUI = document.getElementById('loot-progress-container');
            const progressBar = document.getElementById('loot-progress-bar');

            if (closestLoot && !this.isLootingActive) {
                if (promptUI) promptUI.classList.remove('hidden');
                
                if (this.inputManager && this.inputManager.isLootingKey) {
                    this.isLootingActive = true;
                    this.activeLootTarget = closestLoot;
                    this.currentLootProgress = 0;
                    EventBus.emit('PLAY_SOUND', { id: 'looting' });
                    EventBus.emit('LOOTING_STATE_CHANGED', true);
                }
            } else if (!this.isLootingActive) {
                if (promptUI) promptUI.classList.add('hidden');
            }

            if (this.isLootingActive && this.activeLootTarget) {
                if (promptUI) promptUI.classList.add('hidden');
                if (progressUI) progressUI.classList.remove('hidden');

                let lootPos = this.activeLootTarget.mesh.position.clone();
                lootPos.y += 0.2;
                let targetMatrix = new THREE.Matrix4().lookAt(camera.position, lootPos, new THREE.Vector3(0, 1, 0));
                let targetQuat = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
                camera.quaternion.slerp(targetQuat, delta * 5.0);
                if (this.inputManager) {
                    let euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
                    this.inputManager.yaw = euler.y;
                    this.inputManager.pitch = euler.x;
                }

                this.currentLootProgress += delta * 0.65;
                if (progressBar) progressBar.style.width = Math.min(100, this.currentLootProgress * 100) + '%';

                if (!this.inputManager || !this.inputManager.isLootingKey) {
                    this.isLootingActive = false;
                    this.activeLootTarget = null;
                    this.currentLootProgress = 0;
                    if (progressUI) progressUI.classList.add('hidden');
                    EventBus.emit('STOP_AUDIO', { id: 'looting' });
                    EventBus.emit('LOOTING_STATE_CHANGED', false);
                } else if (this.currentLootProgress >= 1.0) {
                    EventBus.emit('STOP_AUDIO', { id: 'looting' });
                    EventBus.emit('PLAY_SOUND', { id: 'pickup' });

                    if (this.activeLootTarget.type === 'health' || this.activeLootTarget.type === 'medkit') {
                        EventBus.emit('ADD_MEDKIT', 1);
                        EventBus.emit('SHOW_LOOT_POPUP', { text: '+1 GEN-STAB BEGYŰJTVE', color: '#00ff00' });
                    } else if (this.activeLootTarget.type === 'ammo') {
                        EventBus.emit('GIVE_GLOBAL_AMMO');
                        EventBus.emit('SHOW_LOOT_POPUP', { text: '+ LŐSZER BEGYŰJTVE', color: '#ffcc00' });
                        const ammoFlash = document.getElementById('ammo-flash');
                        if (ammoFlash) {
                            ammoFlash.style.opacity = '1';
                            setTimeout(() => { ammoFlash.style.opacity = '0'; }, 200);
                        }
                    }

                    this.scene.remove(this.activeLootTarget.mesh);
                    let lIdx = this.lootItems.indexOf(this.activeLootTarget);
                    if (lIdx > -1) this.lootItems.splice(lIdx, 1);

                    this.isLootingActive = false;
                    this.activeLootTarget = null;
                    this.currentLootProgress = 0;
                    if (progressUI) progressUI.classList.add('hidden');
                    EventBus.emit('LOOTING_STATE_CHANGED', false);
                    EventBus.emit('UI_UPDATE_NEEDED');
                }
            }
        }

        // --- 4. HÚS-VIRÁGOK (PLANTS) ANIMÁLÁSA ÉS KÖZELSÉGI CSAPDA ---
        for (let i = this.activePlants.length - 1; i >= 0; i--) {
            let plant = this.activePlants[i];
            if (plant.mixer) plant.mixer.update(delta);

            if (camera) {
                let distToPlayer = Math.hypot(camera.position.x - plant.x, camera.position.z - plant.z);
                if (distToPlayer < 1.2) {
                    EventBus.emit('PLAY_SOUND', { id: 'burst' });

                    this.scene.remove(plant.mesh);
                    this.scene.remove(plant.puddle);
                    if (plant.puddle.geometry) plant.puddle.geometry.dispose();
                    if (plant.hitbox) {
                        this.scene.remove(plant.hitbox);
                        EventBus.emit('UNREGISTER_HITBOX', plant.hitbox);
                    }
                    this.activePlants.splice(i, 1);

                    EventBus.emit('PLANT_TRAP_TRIGGERED');
                    EventBus.emit('DIRECTIVE_CHECK', { type: 'trigger_plant', target: 'mutant' });
                }
            }
        }

        // --- 5. POCSOLYÁK LASSÚ KIFOLYÁSA (TERJEDÉS) ---
        for (let i = 0; i < this.toxicPuddles.length; i++) {
            let p = this.toxicPuddles[i];
            if (p.userData && p.userData.targetScale && p.scale.x < p.userData.targetScale) {
                let newScale = p.scale.x + (delta * 0.25);
                if (newScale > p.userData.targetScale) {
                    newScale = p.userData.targetScale;
                }
                p.scale.set(newScale, newScale, newScale);
            }
        }

        // --- 6. POCSOLYA SEBZÉS A JÁTÉKOSON ---
        if (camera) {
            this.toxicTickTimer = (this.toxicTickTimer || 0) + delta;
            this.toxicEffectTimer = (this.toxicEffectTimer || 0) - delta;

            if (this.toxicTickTimer >= 0.2) {
                this.toxicTickTimer = 0;
                let playerDamage = 0;
                let worstPuddleState = null;
                let px = camera.position.x;
                let pz = camera.position.z;

                for (let p of this.toxicPuddles) {
                    let distSq = Math.pow(px - p.position.x, 2) + Math.pow(pz - p.position.z, 2);
                    if (distSq <= 1.2) {
                        if (p.userData && p.userData.state === 'green') {
                            playerDamage += 0.4;
                            if (!worstPuddleState) worstPuddleState = 'green';
                        } else if (p.userData && p.userData.state === 'yellow') {
                            playerDamage += 1.0;
                            if (worstPuddleState !== 'ready') worstPuddleState = 'yellow';
                        } else if (p.userData && p.userData.state === 'ready') {
                            playerDamage += 2.0;
                            worstPuddleState = 'ready';
                        }
                    }
                }

                if (playerDamage > 0) {
                    EventBus.emit('PLAYER_TAKE_DAMAGE', { amount: playerDamage, source: 'puddle', noShake: true, noBlood: true });
                    EventBus.emit('SHOW_ACID_OVERLAY', worstPuddleState);
                }

                if (worstPuddleState && this.toxicEffectTimer <= 0) {
                    this.toxicEffectTimer = 1.0;
                    EventBus.emit('PLAY_SOUND', { id: 'acidBurn' });
                    EventBus.emit('DIRECTIVE_CHECK', { type: 'puddle_stand', state: worstPuddleState });
                }
            }
        }
    }

    destroyResonator(res) {
        let rIdx = this.activeResonators.indexOf(res);
        if (rIdx > -1) {
            let r = this.activeResonators[rIdx];
            if (r.id) {
                EventBus.emit('STOP_SPATIAL_LOOP', { id: r.id });
                EventBus.emit('STOP_SPATIAL_LOOP', { id: 'resonator_scream_' + r.id });
            }
            if (r.mesh) this.scene.remove(r.mesh);
            if (r.light) this.scene.remove(r.light);
            EventBus.emit('STOP_AUDIO', { id: 'resonatorAudio' });
            EventBus.emit('STOP_AUDIO', { id: 'resonatorScream' });
            this.activeResonators.splice(rIdx, 1);
            EventBus.emit('PLAY_SOUND', { id: 'error' });
        }
    }

    cleanToxicPuddles(amountToClean) {
        let count = Math.min(amountToClean, this.toxicPuddles.length);
        for (let i = 0; i < count; i++) {
            let oldestPuddle = this.toxicPuddles.shift();
            if (oldestPuddle) {
                this.scene.remove(oldestPuddle);
                if (oldestPuddle.geometry) oldestPuddle.geometry.dispose();
                if (oldestPuddle.material) oldestPuddle.material.dispose();
            }
        }
        EventBus.emit('UPDATE_TOXIC_FOG', this.toxicPuddles.length);
    }
}

export default new ItemManager();
