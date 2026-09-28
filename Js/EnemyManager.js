import * as THREE from 'three';
import EventBus from './EventBus.js';
import { difficultySettings } from './Database.js';

export class EnemyManager {
    constructor() {
        this.scene = null;
        this.navigation = null;
        this.assetManager = null;
        this.difficulty = 'medium';
        
        this.enemies = [];
        this.zombiePool = [];
        this.deadBodies = [];
        this.shockwaves = [];
        this.enemyHitboxes = [];
        this.activeFreezeTimer = 0;
        this.currentWave = 1; // FIX: Hullámszám nyomonkövetése az animációs sebességhez
        this.activeResonatorScreams = {};
        this.globalHitboxMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: false, visible: false });
        
        EventBus.on('START_GAME', (data) => {
            if (data && data.difficulty) this.difficulty = data.difficulty;
            this.currentWave = 1;
            this.reset();
        });
        EventBus.on('WAVE_CHANGED', (wave) => { if (typeof wave === 'number') this.currentWave = wave; });
        EventBus.on('ENTITY_TAKE_DAMAGE', (data) => this.onEntityTakeDamage(data));
        EventBus.on('FREEZE_TRIGGERED', (data) => this.onFreezeTriggered(data));
        EventBus.on('RESONATOR_BLAST_PULSE', (data) => this.onResonatorPulse(data));
        EventBus.on('WAVE_COMPLETED', () => this.onWaveCompleted());
        
        EventBus.on('REGISTER_HITBOX', (hitbox) => {
            if (hitbox && !this.enemyHitboxes.includes(hitbox)) {
                this.enemyHitboxes.push(hitbox);
            }
        });

        EventBus.on('UNREGISTER_HITBOX', (hitbox) => {
            let idx = this.enemyHitboxes.indexOf(hitbox);
            if (idx > -1) {
                this.enemyHitboxes.splice(idx, 1);
            }
        });
    }

    init(scene, navigation, assetManager, itemManager) {
        this.scene = scene;
        this.navigation = navigation;
        this.assetManager = assetManager;
        this.itemManager = itemManager;
    }

    reset() {
        for (let i = 0; i < this.enemies.length; i++) {
            const en = this.enemies[i];
            if (en.mesh && this.scene) {
                this.scene.remove(en.mesh);
                en.mesh.traverse((child) => {
                    if (child.isMesh && child.geometry) child.geometry.dispose();
                });
            }
            if (en.bodyHitbox && this.scene) this.scene.remove(en.bodyHitbox);
            if (en.headHitbox && this.scene) this.scene.remove(en.headHitbox);
            const radarContainer = document.getElementById('radar');
            if (radarContainer && en.blip && en.blip.parentNode === radarContainer) {
                radarContainer.removeChild(en.blip);
            }
        }
        this.enemies = [];
        this.enemyHitboxes = [];

        if (this.deadBodies) {
            this.deadBodies.forEach(db => {
                if (db.mesh && this.scene) {
                    this.scene.remove(db.mesh);
                    db.mesh.traverse(c => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
                }
            });
            this.deadBodies = [];
        }

        if (this.zombiePool) {
            this.zombiePool.forEach(pz => {
                if (pz.mesh && this.scene) {
                    this.scene.remove(pz.mesh);
                    pz.mesh.traverse(c => { if (c.isMesh && c.geometry) c.geometry.dispose(); });
                }
            });
            this.zombiePool = [];
        }

        this.activeFreezeTimer = 0;

        if (this.activeResonatorScreams) {
            for (let id in this.activeResonatorScreams) {
                EventBus.emit('STOP_SPATIAL_LOOP', { id });
            }
            this.activeResonatorScreams = {};
        }
    }

    getHitboxes() {
        return this.enemyHitboxes;
    }

    getEnemyRadius(en) {
        if (!en) return 0.6;
        switch (en.type) {
            case 'boss': return 2.2;
            case 'tank': return 1.1;
            case 'runner': return 0.5;
            case 'crawler': return 0.4;
            case 'hider': return 0.6;
            case 'normal':
            default: return 0.6;
        }
    }

    updateHitboxPositions(en) {
        if (!en || !en.mesh || !en.bodyHitbox || !en.headHitbox) return;
        en.mesh.updateMatrixWorld(true);
        let bonePos = new THREE.Vector3();
        let tempOffset = new THREE.Vector3(); 

        if (en.spineBone) {
            en.spineBone.getWorldPosition(bonePos);
            tempOffset.set(en.bx, 0, en.bz).applyQuaternion(en.mesh.quaternion);
            en.bodyHitbox.position.x = bonePos.x + tempOffset.x;
            en.bodyHitbox.position.y = bonePos.y + en.bodyOffsetY;
            en.bodyHitbox.position.z = bonePos.z + tempOffset.z;
        } else {
            tempOffset.set(en.bx, 0, en.bz).applyQuaternion(en.mesh.quaternion);
            en.bodyHitbox.position.x = en.mesh.position.x + tempOffset.x;
            en.bodyHitbox.position.y = en.mesh.position.y + en.bodyOffsetY;
            en.bodyHitbox.position.z = en.mesh.position.z + tempOffset.z;
        }

        if (en.headBone) {
            en.headBone.getWorldPosition(bonePos);
            en.headHitbox.position.x = bonePos.x;
            en.headHitbox.position.y = bonePos.y + en.headOffsetY;
            en.headHitbox.position.z = bonePos.z;
        } else {
            en.headHitbox.position.x = en.mesh.position.x;
            en.headHitbox.position.y = en.mesh.position.y + en.headOffsetY;
            en.headHitbox.position.z = en.mesh.position.z;
        }
    }

    resolveCollisions(playerPos) {
        const level = this.navigation ? this.navigation.levelManager : null;
        const len = this.enemies.length;
        
        // 1. Ellenség vs Ellenség kör-kör ütközésfeloldás (megakadályozza az egymásba klippelést / összeolvadást)
        for (let i = 0; i < len; i++) {
            let enA = this.enemies[i];
            if (!enA.mesh || enA.lifeTime <= 0) continue;
            let rA = this.getEnemyRadius(enA);
            
            for (let j = i + 1; j < len; j++) {
                let enB = this.enemies[j];
                if (!enB.mesh || enB.lifeTime <= 0) continue;
                let rB = this.getEnemyRadius(enB);
                
                let dx = enA.mesh.position.x - enB.mesh.position.x;
                let dz = enA.mesh.position.z - enB.mesh.position.z;
                let dist = Math.hypot(dx, dz);
                let minDist = rA + rB;
                
                if (dist < minDist && dist > 0.0001) {
                    let overlap = minDist - dist;
                    let nx = dx / dist;
                    let nz = dz / dist;
                    
                    // Tömeg / prioritás súlyozás:
                    // Boss megmozdíthatatlan (súly 0), Tank nehéz (0.2), sima zombi (0.5)
                    let weightA = 0.5;
                    let weightB = 0.5;
                    if (enA.type === 'boss') { weightA = 0.0; weightB = 1.0; }
                    else if (enB.type === 'boss') { weightA = 1.0; weightB = 0.0; }
                    else if (enA.type === 'tank' && enB.type !== 'tank') { weightA = 0.2; weightB = 0.8; }
                    else if (enB.type === 'tank' && enA.type !== 'tank') { weightA = 0.8; weightB = 0.2; }
                    
                    if (weightA > 0) {
                        let moveX = nx * overlap * weightA;
                        let moveZ = nz * overlap * weightA;
                        let newX = enA.mesh.position.x + moveX;
                        let newZ = enA.mesh.position.z + moveZ;
                        if (!level || !level.checkWallCollision(newX, enA.mesh.position.z, rA)) enA.mesh.position.x = newX;
                        if (!level || !level.checkWallCollision(enA.mesh.position.x, newZ, rA)) enA.mesh.position.z = newZ;
                    }
                    
                    if (weightB > 0) {
                        let moveX = -nx * overlap * weightB;
                        let moveZ = -nz * overlap * weightB;
                        let newX = enB.mesh.position.x + moveX;
                        let newZ = enB.mesh.position.z + moveZ;
                        if (!level || !level.checkWallCollision(newX, enB.mesh.position.z, rB)) enB.mesh.position.x = newX;
                        if (!level || !level.checkWallCollision(enB.mesh.position.x, newZ, rB)) enB.mesh.position.z = newZ;
                    }
                }
            }
            
            // 2. Ellenség vs Játékos lágy szeparáció (csak akkor lép életbe, ha szinte egymásban állnának, így nem okoz remegést)
            if (playerPos) {
                let pDx = enA.mesh.position.x - playerPos.x;
                let pDz = enA.mesh.position.z - playerPos.z;
                let pDist = Math.hypot(pDx, pDz);
                let hardDist = (enA.type === 'boss') ? 1.2 : (enA.type === 'tank' ? 0.75 : 0.5);
                if (pDist < hardDist && pDist > 0.001) {
                    let pOverlap = hardDist - pDist;
                    let pNx = pDx / pDist;
                    let pNz = pDz / pDist;
                    let newX = enA.mesh.position.x + pNx * pOverlap * 0.5;
                    let newZ = enA.mesh.position.z + pNz * pOverlap * 0.5;
                    if (!level || !level.checkWallCollision(newX, enA.mesh.position.z, rA)) enA.mesh.position.x = newX;
                    if (!level || !level.checkWallCollision(enA.mesh.position.x, newZ, rA)) enA.mesh.position.z = newZ;
                }
            }
        }
    }
    
    getSafeSpawnPosition(radius, cameraPos, minDist = 0) {
        let x, z; let isSafe = false; let attempts = 0;
        
        while (!isSafe && attempts < 100) { 
            x = (Math.random() - 0.5) * 42; 
            z = (Math.random() - 0.5) * 42; 
            
            let distToPlayer = Math.hypot(cameraPos.x - x, cameraPos.z - z);
            
            if (distToPlayer >= minDist) {
                if (this.navigation && this.navigation.levelManager) {
                    let safeRadius = radius * 3.5; 
                    if (!this.navigation.levelManager.checkWallCollision(x, z, safeRadius)) {
                        isSafe = true; 
                    }
                } else {
                    isSafe = true;
                }
            }
            attempts++;
        }
        
        return { x: x || 0, z: z || 0 };
    }

    getEdgeSpawnPosition(type = null) {
        // 12 folyosó bejárat (mind a 4 falon 3-3 bejárat)
        const corridorSpawns = (this.navigation && this.navigation.levelManager && this.navigation.levelManager.corridorSpawns && this.navigation.levelManager.corridorSpawns.length > 0)
            ? this.navigation.levelManager.corridorSpawns
            : [
                { x: -14, z: -30.5, dirX: 0, dirZ: 1 },
                { x: 0,   z: -30.5, dirX: 0, dirZ: 1 },
                { x: 14,  z: -30.5, dirX: 0, dirZ: 1 },
                { x: -14, z: 30.5,  dirX: 0, dirZ: -1 },
                { x: 0,   z: 30.5,  dirX: 0, dirZ: -1 },
                { x: 14,  z: 30.5,  dirX: 0, dirZ: -1 },
                { x: -30.5, z: -14, dirX: 1, dirZ: 0 },
                { x: -30.5, z: 0,   dirX: 1, dirZ: 0 },
                { x: -30.5, z: 14,  dirX: 1, dirZ: 0 },
                { x: 30.5,  z: -14, dirX: -1, dirZ: 0 },
                { x: 30.5,  z: 0,   dirX: -1, dirZ: 0 },
                { x: 30.5,  z: 14,  dirX: -1, dirZ: 0 }
            ];

        let pick = corridorSpawns[Math.floor(Math.random() * corridorSpawns.length)];
        
        // Enyhe szórás a folyosó szélességén belül (+-1.4m), hogy a zombik ne egyetlen pontban álljanak
        // Boss esetén szigorúan 0 oldalirányú eltolás, hogy pontosan a kapu tengelyében maradjon!
        let isBossType = (type === 'boss');
        let lateral = isBossType ? 0 : (Math.random() - 0.5) * 2.8;
        let sX = pick.x;
        let sZ = pick.z;
        if (pick.dirX === 0) sX += lateral;
        else sZ += lateral;

        // Boss esetén 3.5 méterrel közelebb a kapuhoz induljon a tágas szakaszon, nem a hátsó falnak nyomódva!
        if (isBossType) {
            sX += pick.dirX * 3.5;
            sZ += pick.dirZ * 3.5;
        }

        return { x: sX, z: sZ, dirX: pick.dirX, dirZ: pick.dirZ };
    }

    spawnEnemy(x, z, isBoss = false, forceType = null, currentWave = 1, difficultyStats = { health: 100, speed: 1.0 }, initialDir = null) { 
        let type = 'normal';
        
        if (forceType) {
            type = forceType; 
        } else {
            let rand = Math.random();
            if (isBoss) type = 'boss';
            else if (rand < 0.15) type = 'runner';
            else if (rand < 0.25) type = 'tank';
            else if (rand < 0.35) type = 'hider';
        }

        let enemyRadius = this.getEnemyRadius({ type: type });
        
        // Ha a főteremben spawnolna (nem folyosón), ellenőrizzük a fal- és sarokkorlátokat:
        let inCorridor = (Math.abs(x) > 24.5 || Math.abs(z) > 24.5);
        if (!inCorridor) {
            let maxEdge = (type === 'boss') ? 19.0 : (type === 'tank' ? 20.5 : 22.0);
            let maxCorner = (type === 'boss') ? 16.0 : (type === 'tank' ? 17.5 : 20.0);
            
            if (Math.abs(x) > maxEdge) x = Math.sign(x) * maxEdge;
            if (Math.abs(z) > maxEdge) z = Math.sign(z) * maxEdge;
            if (Math.abs(x) > maxCorner && Math.abs(z) > maxCorner) {
                if (Math.abs(x) > Math.abs(z)) x = Math.sign(x) * maxCorner;
                else z = Math.sign(z) * maxCorner;
            }

            // Biztonsági fal- és oszlopütközés elkerülés a teremben:
            if (this.navigation && this.navigation.levelManager) {
                let level = this.navigation.levelManager;
                let checkRadius = enemyRadius + 0.5;
                let attempts = 0;
                while (level.checkWallCollision(x, z, checkRadius) && attempts < 25) {
                    x *= 0.88;
                    z *= 0.88;
                    attempts++;
                }
            }
        }

        let mesh = null;
        let mixer = null;
        let isFromPool = false;
        let savedBodyOffsetY = 0;
        let savedHeadOffsetY = 0;

        let modelId = 'zombie';
        if (type === 'runner') modelId = 'runner';
        if (type === 'tank') modelId = 'tank';
        if (type === 'hider') modelId = 'hider';
        if (type === 'crawler') modelId = 'crawler';
        if (type === 'boss') modelId = 'boss';

        let poolIndex = this.zombiePool.findIndex(z => z.type === type);
        
        let anims = null;
        if (this.assetManager && this.assetManager.models[modelId]) {
            anims = this.assetManager.models[modelId].animations;
        }

        if (poolIndex > -1) {
            let pooledZombie = this.zombiePool.splice(poolIndex, 1)[0];
            mesh = pooledZombie.mesh;
            mixer = pooledZombie.mixer;
            if (!anims) anims = pooledZombie.animations;
            savedBodyOffsetY = pooledZombie.bodyOffsetY; 
            savedHeadOffsetY = pooledZombie.headOffsetY; 
            isFromPool = true;
            
            mesh.visible = true;
            mesh.rotation.set(0, 0, 0); 
            let groundY = 0;
            if (type === 'crawler') groundY = 0.42;
            else if (type === 'runner') groundY = 0.12;
            mesh.position.set(x, groundY, z); 
            mixer.stopAllAction(); 
            
            mesh.traverse((child) => {
                if (child.isMesh) child.frustumCulled = false;
            });
        } else {
            let cloneData = this.assetManager.cloneModel(modelId);
            if (!cloneData || !cloneData.mesh) return; 
            mesh = cloneData.mesh;
            if (!anims) anims = cloneData.animations;
            mixer = new THREE.AnimationMixer(mesh);
        }

        let scale = 1.5, hpMult = 1, speedMult = 1, opacity = 1, reward = 20;
        
        if (type === 'runner') { 
            scale = 2.0; hpMult = 0.5; speedMult = 2.5; reward = 30; 
        } 
        else if (type === 'tank') { 
            scale = 1.5; hpMult = 4.0; speedMult = 0.6; reward = 100; 
        } 
        else if (type === 'boss') { 
            scale = 4.0; hpMult = 45.0; speedMult = 0.55; reward = 5000; 
        }
        else if (type === 'hider') { 
            scale = 0.02; hpMult = 0.8; speedMult = 1.3; opacity = 0.2; reward = 40; 
        }
        else if (type === 'crawler') { 
            scale = 0.005; hpMult = 0.1; speedMult = 4.0; reward = 5000; 
        }

        mesh.scale.set(scale, scale, scale); 
        let groundY = 0;
        if (type === 'crawler') groundY = 0.42;
        else if (type === 'runner') groundY = 0.12;
        mesh.position.set(x, groundY, z);

        let initDirX = (initialDir && initialDir.dirX !== undefined) ? initialDir.dirX : (Math.abs(x) > 24.5 ? -Math.sign(x) : 0);
        let initDirZ = (initialDir && initialDir.dirZ !== undefined) ? initialDir.dirZ : (Math.abs(z) > 24.5 ? -Math.sign(z) : 0);
        if (initDirX !== 0 || initDirZ !== 0) {
            let initAngle = Math.atan2(initDirX, initDirZ);
            mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), initAngle);
        }

        if (type === 'crawler') {
            let pBlock = mesh.getObjectByName('Plane001');
            if (pBlock && pBlock.parent) pBlock.parent.remove(pBlock);
            mesh.traverse((child) => {
                if (child.isMesh && (child.name.includes('Plane001') || child.name.includes('Plane.001') || child.name.toLowerCase().includes('block'))) {
                    child.visible = false;
                }
            });
        }
        
        if (!isFromPool) {
            mesh.traverse((child) => {
                if (child.isMesh) {
                    child.frustumCulled = false;
                    
                    if (opacity < 1.0 || type === 'runner') {
                        if (Array.isArray(child.material)) child.material = child.material.map(m => m.clone());
                        else child.material = child.material.clone();
                    }

                    if (opacity < 1.0) {
                        let mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => { m.transparent = true; m.opacity = opacity; });
                    }

                    if (type === 'runner') {
                        let mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            if (m.color) m.color.setHex(0x222222);
                            if (m.emissive !== undefined) {
                                m.emissive.setHex(0x005500); 
                                if (this.assetManager && this.assetManager.textures && this.assetManager.textures['puddleTex']) {
                                    m.emissiveMap = this.assetManager.textures['puddleTex'];
                                }
                                m.emissiveIntensity = 0.3; 
                            }
                            if (m.roughness !== undefined) m.roughness = 0.8;
                            if (m.metalness !== undefined) m.metalness = 0.1;
                        });
                    }
                }
            });
        }

        let foundHeadBone = null;
        let foundSpineBone = null;

        mesh.traverse((child) => {
            if (child.isBone) {
                let bName = child.name.toLowerCase();
                if (bName.includes('head') || bName.includes('neck')) foundHeadBone = child;
                if (bName.includes('spine') || bName.includes('chest') || bName.includes('pelvis')) foundSpineBone = child;
            }
        });

        if (!foundHeadBone) foundHeadBone = mesh;
        if (!foundSpineBone) foundSpineBone = mesh;

        let bx = 0, by = 1.3, bz = 0; let bw = 0.7, bh = 1.9, bd = 0.7; 
        let hx = 0, hy = 2.5, hz = 0; let hw = 0.3, hh = 0.4, hd = 0.5; 

        if (type === 'tank') {
            bw = 1.2; bh = 2.5; bd = 1.2; 
            bx = 0; by = 1.4; bz = 0; 
            hw = 0.6; hh = 0.4; hd = 0.6; 
            hx = 0; hy = 2.6; hz = 0.4; 
        }
        else if (type === 'runner') {
            bw = 0.6; bh = 1.0; bd = 0.6; 
            bx = 0; by = 0.5; bz = 0;
            hw = 0.3; hh = 0.1; hd = 0.3; 
            hx = 0; hy = 0.9; hz = 0.4;
        } 
        else if (type === 'boss') {
            bw = 1.6; bh = 3.0; bd = 1.6; 
            bx = 0; by = 1.6; bz = 0;
            hw = 0.8; hh = 0.8; hd = 0.8; 
            hx = 0; hy = 3.4; hz = 0;
        } 
        else if (type === 'crawler') {
            bw = 1.0; bh = 0.8; bd = 1.0; 
            bx = 0; by = 0.4; bz = -0.4; 
            hw = 0.4; hh = 0.5; hd = 0.4; 
            hx = 0; hy = 0.6; hz = -0.4; 
        } 
        else if (type === 'hider') {
            bw = 0.7; bh = 1.0; bd = 0.7; 
            bx = 0; by = 0.5; bz = 0;
            hw = 0.4; hh = 0.4; hd = 0.4; 
            hx = 0; hy = 0.5; hz = 0.4;
        }

        const bodyRadius = bw / 2; 
        const bodyHitbox = new THREE.Mesh(new THREE.CylinderGeometry(bodyRadius, bodyRadius, bh, 8), this.globalHitboxMat);
        bodyHitbox.position.set(x + bx, by, z + bz); 
        bodyHitbox.frustumCulled = false; 

        const headRadius = hw / 2;
        const headHitbox = new THREE.Mesh(new THREE.CylinderGeometry(headRadius, headRadius, hh, 8), this.globalHitboxMat);
        headHitbox.position.set(x + hx, hy, z + hz); 
        headHitbox.frustumCulled = false;

        this.scene.add(bodyHitbox); 
        this.scene.add(headHitbox); 
        
        if (!isFromPool) {
            this.scene.add(mesh);
        }
        
        this.enemyHitboxes.push(bodyHitbox, headHitbox); 

        let runAction = null; let attackAction = null; let deathAction = null; 
        let hasDeathAnim = false; 
        let comboActions = []; 

        if (anims && anims.length > 0) {
            if (type === 'runner') {
                runAction = mixer.clipAction(anims.length > 9 ? anims[9] : anims[0]); 
                attackAction = mixer.clipAction(anims.length > 2 ? anims[2] : anims[0]);
                if (anims.length > 3) { deathAction = mixer.clipAction(anims[3]); hasDeathAnim = true; } 
            } 
            else if (type === 'tank') {
                runAction = mixer.clipAction(anims.length > 21 ? anims[21] : anims[0]); 
                attackAction = mixer.clipAction(anims.length > 0 ? anims[0] : anims[0]); 
                
                if (anims.length > 0) comboActions.push(mixer.clipAction(anims[0]));
                if (anims.length > 1) comboActions.push(mixer.clipAction(anims[1]));
                if (anims.length > 2) comboActions.push(mixer.clipAction(anims[2]));
                
                comboActions.forEach(action => {
                    action.setLoop(THREE.LoopOnce);
                    action.clampWhenFinished = true;
                });

                if (anims.length > 11) { deathAction = mixer.clipAction(anims[11]); hasDeathAnim = true; } 
            }
            else if (type === 'boss') {
                runAction = mixer.clipAction(anims.length > 1 ? anims[1] : anims[0]); 
                attackAction = mixer.clipAction(anims.length > 0 ? anims[0] : anims[0]);
                if (anims.length > 2) { deathAction = mixer.clipAction(anims[2]); hasDeathAnim = true; }
            }
            else if (type === 'crawler') {
                runAction = mixer.clipAction(anims.length > 1 ? anims[1] : anims[0]); 
                if (anims.length > 2) { deathAction = mixer.clipAction(anims[2]); hasDeathAnim = true; }
            }
            else if (type === 'hider') {
                let walkClip = anims.find(a => a.name.toLowerCase().includes('fight') || a.name.toLowerCase().includes('idle')) || anims[0];
                runAction = mixer.clipAction(walkClip); 
                let dClip = anims.find(a => a.name.toLowerCase().includes('death') || a.name.toLowerCase().includes('die'));
                if (dClip) { deathAction = mixer.clipAction(dClip); hasDeathAnim = true; }
            }
            else {
                let walkClip = anims.find(a => a.name.toLowerCase().includes('walk')) || anims[0];
                runAction = mixer.clipAction(walkClip); 
                let dClip = anims.find(a => a.name.toLowerCase().includes('death') || a.name.toLowerCase().includes('die'));
                if (dClip) { deathAction = mixer.clipAction(dClip); hasDeathAnim = true; }
            }

            if (hasDeathAnim && deathAction) {
                deathAction.setLoop(THREE.LoopOnce); 
                deathAction.clampWhenFinished = true; 
            }

            if(runAction) runAction.setLoop(THREE.LoopRepeat); 
            if(attackAction) attackAction.setLoop(THREE.LoopRepeat);
        }

        const baseStats = difficultySettings[this.difficulty || 'medium'] || difficultySettings.medium;
        let waveNum = currentWave || 1;
        let powerMultiplier = 1.0 + ((waveNum - 1) * 0.04);
        let speedMultiplier = 1.0 + Math.min(((waveNum - 1) * 0.035), 0.35);
        let finalDamageMult = (type === 'boss' ? 3 : type === 'tank' ? 2 : 1) * powerMultiplier;

        let newEnemy = { 
            type: type,
            mesh: mesh, 
            groundY: groundY,
            bodyHitbox: bodyHitbox, 
            headHitbox: headHitbox, 
            headBone: foundHeadBone,   
            spineBone: foundSpineBone, 
            bx: bx, bz: bz, hx: hx, hz: hz, 
            bodyOffsetY: 0, 
            headOffsetY: 0, 
            
            roarTimer: 0,
            growlTimer: Math.random() * 5 + 2,
            stepTimer: 0.5,
            animSpeedOffset: (Math.random() * 0.15) - 0.075,
            frozen: false,
            
            health: (baseStats.health * hpMult) * powerMultiplier, 
            damageMult: finalDamageMult, 
            speed: (baseStats.speed * 60 * speedMult) * speedMultiplier, 
            hpMult: hpMult,
            reward: reward, 
            animations: anims,
            mixer: mixer, 
            runAction: runAction, 
            attackAction: attackAction, 
            
            comboActions: comboActions, 
            comboStep: 0,               
            isAttacking: false,         
            attackAnimTimer: 0, 
            attackRestTimer: 0,        
            hitFrameTime: (type === 'boss') ? 0.6 : (type === 'tank') ? 0.8 : (type === 'runner') ? 0.2 : 0.5,            
            hasDealtDamage: false,      
            
            deathAction: deathAction, 
            hasDeathAnim: hasDeathAnim, 
            frozen: false, 
            currentAction: runAction,
            lifeTime: (type === 'crawler') ? 12.0 : Infinity
        };

        // KRITIKUS 2: userData.targetObj beállítása!
        bodyHitbox.userData = { type: 'body', targetObj: newEnemy };
        headHitbox.userData = { type: 'head', targetObj: newEnemy };

        if (runAction) {
            if (isFromPool) {
                mixer.stopAllAction(); 
                runAction.reset().fadeIn(0.1).play(); 
                newEnemy.currentAction = runAction;
            } else {
                runAction.play();
            }
            if (runAction._clip) {
                runAction.time = Math.random() * runAction._clip.duration;
            }
        }
        
        mesh.updateMatrixWorld(true);

        if (isFromPool) {
            newEnemy.bodyOffsetY = savedBodyOffsetY;
            newEnemy.headOffsetY = savedHeadOffsetY;
        } else {
            if (foundSpineBone) {
                let tempPos = new THREE.Vector3();
                foundSpineBone.getWorldPosition(tempPos);
                newEnemy.bodyOffsetY = by - tempPos.y; 
            }
            if (foundHeadBone) {
                let tempPos = new THREE.Vector3();
                foundHeadBone.getWorldPosition(tempPos);
                newEnemy.headOffsetY = hy - tempPos.y;
            }
        }

        const radarContainer = document.getElementById('radar');
        if (radarContainer) {
            let blip = document.createElement('div');
            blip.className = 'radar-blip';
            if (type === 'boss') {
                blip.style.width = '8px';
                blip.style.height = '8px';
                blip.style.backgroundColor = '#ff0000';
            }
            radarContainer.appendChild(blip);
            newEnemy.blip = blip;
        }

        this.enemies.push(newEnemy);
        EventBus.emit('ENEMY_SPAWNED', newEnemy);
    } 

    killZombie(en, isHeadshot) {
        if (en.screamAudio && en.screamAudio.isPlaying) en.screamAudio.stop();
        
        let rewardAmmount = isHeadshot ? en.reward * 1.5 : en.reward;
        
        let deathSound = 'hostDeath';
        if (en.type === 'boss') deathSound = 'bossDeath';
        else if (en.type === 'crawler') deathSound = 'crawlerDeath';
        else if (en.type === 'tank') deathSound = 'tankDeath';
        else if (en.type === 'runner') deathSound = 'runnerDeath';
        else if (en.type === 'normal') deathSound = 'hostDeath';
        
        // Pass position so AudioManager can calculate distance
        EventBus.emit('PLAY_SOUND', { id: deathSound, position: en.mesh.position.clone() });
        EventBus.emit('UI_LOG', { msg: `LIKVIDÁLVA: ${en.type.toUpperCase()} +${rewardAmmount}CR`, color: '#ffff00' });
        
        EventBus.emit('ADD_SCORE', rewardAmmount);
        
        if (Math.random() < 0.25) { 
            let lootEvent = Math.random() < 0.6 ? 'SPAWN_AMMO' : 'SPAWN_MEDKIT';
            EventBus.emit(lootEvent, { 
                x: en.mesh.position.x, 
                z: en.mesh.position.z 
            });
        }
        
        // Toxic puddle
        EventBus.emit('SPAWN_TOXIC_PUDDLE', { x: en.mesh.position.x, z: en.mesh.position.z });
        
        // A zombi látható marad, de a deathAnim le fog játszódni és rögzül
        en.mesh.visible = true;
        EventBus.emit('ADD_PROGRESS', 1);
        EventBus.emit('ZOMBIE_KILLED', { enemy: en, isHeadshot: isHeadshot, reward: rewardAmmount });
        
        const radarContainer = document.getElementById('radar');
        if (radarContainer && en.blip && en.blip.parentNode === radarContainer) {
            radarContainer.removeChild(en.blip);
            en.blip = null;
        }

        this.scene.remove(en.bodyHitbox); this.scene.remove(en.headHitbox);
        let bIdx = this.enemyHitboxes.indexOf(en.bodyHitbox); if (bIdx > -1) this.enemyHitboxes.splice(bIdx, 1);
        let hIdx = this.enemyHitboxes.indexOf(en.headHitbox); if (hIdx > -1) this.enemyHitboxes.splice(hIdx, 1);

        let animDuration = 0;
        if (en.mixer) {
            en.mixer.timeScale = 1.0;
            en.mixer.stopAllAction();
        }
        if (en.hasDeathAnim && en.deathAction) {
            en.deathAction.reset().play();
            animDuration = en.deathAction._clip ? en.deathAction._clip.duration : 1.5;
        }
        
        this.deadBodies.push({
            mesh: en.mesh, mixer: en.mixer, hasDeathAnim: en.hasDeathAnim,
            bodyOffsetY: en.bodyOffsetY, headOffsetY: en.headOffsetY, 
            freezeTimer: animDuration + 0.1, frozen: false, sinking: false, type: en.type,
            animations: en.animations
        });
        
        let enIdx = this.enemies.indexOf(en);
        if (enIdx > -1) this.enemies.splice(enIdx, 1);
    }

    onEntityTakeDamage(data) {
        let { target, amount, isHeadshot, isBash, isMelee } = data;
        
        if (this.enemies.includes(target)) {
            let en = target;
            if (en.shieldMult === undefined || en.shieldMult === 1.0) {
                const puddles = (this.itemManager && this.itemManager.toxicPuddles) ? this.itemManager.toxicPuddles : [];
                for (let p of puddles) {
                    let distSq = Math.pow(en.mesh.position.x - p.position.x, 2) + Math.pow(en.mesh.position.z - p.position.z, 2);
                    let puddleRadius = Math.max(1.3, (p.scale ? p.scale.x : 1.0) * 1.2);
                    if (distSq <= puddleRadius * puddleRadius) {
                        en.shieldType = p.userData ? p.userData.state : 'green';
                        if (en.shieldType === 'green') en.shieldMult = 0.8;
                        else if (en.shieldType === 'yellow') en.shieldMult = 0.5;
                        else if (en.shieldType === 'ready') en.shieldMult = 0.2;
                        break;
                    }
                }
            }

            if (en.shieldMult !== undefined && en.shieldMult < 1.0) {
                amount *= en.shieldMult;
                EventBus.emit('SHOW_SHIELD_ICON', { shieldType: en.shieldType });
            }

            en.health -= amount;
            
            EventBus.emit('PLAY_SOUND', { id: 'zombieHit' });
            
            if (en.health <= 0) {
                this.killZombie(en, isHeadshot);
            } else if (isBash || isMelee) {
                // Csak puskatus (bash) vagy kés (melee) esetén kábítjuk el! A golyó nem állítja meg őket.
                if (en.type === 'boss') en.stunTimer = 1.0; 
                else if (en.type === 'tank') en.stunTimer = 2.0; 
                else if (en.type === 'runner') en.stunTimer = 3.0; 
                else en.stunTimer = 5.0;
            }
        }
    }

    onFreezeTriggered(data) {
        this.activeFreezeTimer = (data && data.duration) ? data.duration : 6.0;
        for (let en of this.enemies) {
            en.frozen = true;
            if (en.mixer) en.mixer.timeScale = 0;
        }
    }

    onResonatorPulse(data) {
        const { position, radius = 5.0, wave = 1 } = data;
        let powerMult = 1.0 + ((wave - 1) * 0.04);
        let fryingCount = 0;
        let closestDist = Infinity;
        let closestPos = null;

        for (let i = this.enemies.length - 1; i >= 0; i--) {
            let en = this.enemies[i];
            let dist = Math.hypot(position.x - en.mesh.position.x, position.z - en.mesh.position.z);
            if (dist <= radius) {
                let tickDmg = 0.2;
                if (en.type === 'boss') tickDmg = 0.5;
                else if (en.type === 'tank') tickDmg = 0.8;
                else if (en.type === 'runner' || en.type === 'crawler') tickDmg = 0.15;

                en.health -= tickDmg * powerMult;
                en.stunTimer = 0.4;

                let enPos = en.mesh.position.clone();
                let distToPlayer = this.playerCameraRef ? Math.hypot(this.playerCameraRef.position.x - enPos.x, this.playerCameraRef.position.z - enPos.z) : null;
                if (distToPlayer !== null && distToPlayer < closestDist) {
                    closestDist = distToPlayer;
                    closestPos = enPos;
                }

                EventBus.emit('RESONATOR_ZOMBIE_BURST', { position: enPos });

                if (en.health <= 0) {
                    this.killZombie(en, false);
                } else {
                    fryingCount++;
                }
            }
        }

        const screamId = 'resonator_scream_' + (data.resonatorId || 'default');
        if (fryingCount > 0) {
            let screamPos = closestPos || position;
            if (!this.activeResonatorScreams[screamId]) {
                EventBus.emit('START_SPATIAL_LOOP', {
                    id: screamId,
                    name: 'resonatorScream',
                    position: screamPos,
                    maxDistance: 25.0,
                    baseVolume: 0.5
                });
                this.activeResonatorScreams[screamId] = true;
            } else {
                EventBus.emit('UPDATE_SPATIAL_LOOP', {
                    id: screamId,
                    position: screamPos
                });
            }
        } else {
            if (this.activeResonatorScreams[screamId]) {
                EventBus.emit('STOP_SPATIAL_LOOP', { id: screamId });
                delete this.activeResonatorScreams[screamId];
            }
        }
    }

    onWaveCompleted() {
        if (this.activeResonatorScreams) {
            for (let id in this.activeResonatorScreams) {
                EventBus.emit('STOP_SPATIAL_LOOP', { id });
            }
            this.activeResonatorScreams = {};
        }
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].type === 'crawler') {
                this.killZombie(this.enemies[i], false);
            }
        }
        for (let c of this.deadBodies) {
            c.sinking = true;
        }
    }

    update(delta, playerCamera) {
        this.playerCameraRef = playerCamera;
        if (this.activeFreezeTimer > 0) {
            let prevTimer = this.activeFreezeTimer;
            this.activeFreezeTimer -= delta;
            if (this.activeFreezeTimer <= 0 && prevTimer > 0) {
                for (let en of this.enemies) {
                    en.frozen = false;
                    if (en.mixer) en.mixer.timeScale = 1.0;
                }
                EventBus.emit('FREEZE_ENDED');
            }
        }

        const playerPos = playerCamera.position;
        const radarRange = 40;
        const radarRadius = 50;
        
        // Radar szkenner pásztázó vonalának animálása
        this.radarAngle = (this.radarAngle || 0) - delta * 3.5;
        let displayAngle = this.radarAngle % (Math.PI * 2);
        if (displayAngle < 0) displayAngle += Math.PI * 2;
        const radarScanner = document.querySelector('.radar-scanner');
        if (radarScanner) radarScanner.style.transform = `translate(0, -50%) rotate(${displayAngle}rad)`;

        // ==========================================
        // ZOMBI PAJZS OPTIMALIZÁLÁS (250ms-enként ellenőrizzük)
        // ==========================================
        this.shieldTimer = (this.shieldTimer || 0) + delta;
        if (this.shieldTimer > 0.25) {
            this.shieldTimer = 0;
            const puddles = (this.itemManager && this.itemManager.toxicPuddles) ? this.itemManager.toxicPuddles : [];
            for (let en of this.enemies) {
                en.shieldMult = 1.0;
                en.shieldType = null;
                for (let p of puddles) {
                    let distSq = Math.pow(en.mesh.position.x - p.position.x, 2) + Math.pow(en.mesh.position.z - p.position.z, 2);
                    let puddleRadius = Math.max(1.3, (p.scale ? p.scale.x : 1.0) * 1.2);
                    if (distSq <= puddleRadius * puddleRadius) {
                        en.shieldType = p.userData ? p.userData.state : 'green';
                        if (p.userData.state === 'green') en.shieldMult = 0.8;
                        else if (p.userData.state === 'yellow') en.shieldMult = 0.5;
                        else if (p.userData.state === 'ready') en.shieldMult = 0.2;
                        break;
                    }
                }
            }
        }

        // Alap frissítés. A komplex mozgás logika és támadás külön hívható vagy itt bővíthető.
        for (let i = 0; i < this.enemies.length; i++) {
            const en = this.enemies[i];
            
            en.lifeTime -= delta;
            if (en.lifeTime <= 0) {
                this.scene.remove(en.mesh); 
                this.scene.remove(en.bodyHitbox); 
                this.scene.remove(en.headHitbox); 
                let bIdx = this.enemyHitboxes.indexOf(en.bodyHitbox);
                if (bIdx > -1) this.enemyHitboxes.splice(bIdx, 1); 
                let hIdx = this.enemyHitboxes.indexOf(en.headHitbox);
                if (hIdx > -1) this.enemyHitboxes.splice(hIdx, 1);
                
                const radarContainer = document.getElementById('radar');
                if (radarContainer && en.blip && en.blip.parentNode === radarContainer) {
                    radarContainer.removeChild(en.blip);
                }
                
                this.enemies.splice(i, 1);
                i--;
                continue; 
            }

            if (typeof en.stunTimer === 'undefined') en.stunTimer = 0;
            
            if (en.frozen) {
                if (en.mixer) en.mixer.timeScale = 0; 
                continue; 
            } 
            else if (en.stunTimer > 0) {
                en.stunTimer -= delta;
                if (en.mixer) {
                    en.mixer.timeScale = 0.1; 
                    en.mixer.update(delta);
                }
                continue; 
            }
            else {
                if (en.screamAudio && en.screamAudio.isPlaying) en.screamAudio.stop();

                if (en.mixer) {
                    // FIX: Hullámszámhoz kötött sebességszorzó (pontosan mint a régi game.js 3921. sorában)
                    let waveSpeedMult = 1.0 + Math.min(((this.currentWave - 1) * 0.035), 0.35);
                    if (en.type === 'crawler') en.mixer.timeScale = 2.0 * waveSpeedMult;
                    else if (en.type === 'normal') en.mixer.timeScale = 1.2 * waveSpeedMult;
                    else if (en.type === 'boss') en.mixer.timeScale = 0.7 * waveSpeedMult;
                    else en.mixer.timeScale = 1.0 * waveSpeedMult;
                    
                    en.mixer.update(delta);
                }
            }

            this.updateHitboxPositions(en);

            
            // Radar frissítés
            if (en.blip && playerCamera) {
                const localPos = en.mesh.position.clone();
                playerCamera.worldToLocal(localPos);
                en.blip.style.left = (50 + localPos.x * 1.2) + '%';
                en.blip.style.top = (50 + localPos.z * 1.2) + '%';

                if (en.type === 'crawler') {
                    en.blip.style.backgroundColor = '#00ffff';
                    en.blip.style.boxShadow = '0 0 8px #00ffff';
                    en.blip.classList.add('visible');
                } else {
                    let targetAngle = Math.atan2(localPos.z, localPos.x);
                    if (targetAngle < 0) targetAngle += Math.PI * 2;
                    let diff = Math.abs(targetAngle - displayAngle);
                    if (diff > Math.PI) diff = Math.PI * 2 - diff;
                    if (diff < 0.3) en.blip.classList.add('visible');
                    else en.blip.classList.remove('visible');
                }
            }
            
            // Mozgás / Navigáció és Támadás
            let targetPos = playerPos;
            let isLured = false;
            let activeLureDist = Infinity;
            let luredResonator = null;

            if (this.itemManager && this.itemManager.activeResonators) {
                for (let r of this.itemManager.activeResonators) {
                    if (r.state === 'lure') {
                        let d = Math.hypot(en.mesh.position.x - r.mesh.position.x, en.mesh.position.z - r.mesh.position.z);
                        if (d < 25.0 && d < activeLureDist) {
                            activeLureDist = d;
                            targetPos = r.mesh.position;
                            isLured = true;
                            luredResonator = r;
                        }
                    }
                }
            }
            
            let distToPlayer = Math.hypot(playerPos.x - en.mesh.position.x, playerPos.z - en.mesh.position.z);
            let attackRange = (en.type === 'boss') ? 8.0 : (en.type === 'tank' ? 3.5 : 2.0);

            if (en.type === 'crawler') {
                if (!en.isAttacking) {
                    if (!en.velocity) {
                        let angle = Math.random() * Math.PI * 2;
                        en.velocity = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
                    }
                    
                    // Játékos közelsége elijeszti (mint a régi game.js 4017. sorában)
                    if (distToPlayer < 8.0) {
                        let flee = new THREE.Vector3().subVectors(en.mesh.position, new THREE.Vector3(playerPos.x, 0, playerPos.z)).normalize();
                        en.velocity.lerp(flee, 0.05).normalize();
                    }
                    
                    let mX = en.velocity.x * en.speed * delta;
                    let mZ = en.velocity.z * en.speed * delta;
                    
                    let hitWallX = false;
                    let hitWallZ = false;
                    
                    if (this.navigation && this.navigation.levelManager) {
                        hitWallX = this.navigation.levelManager.checkWallCollision(en.mesh.position.x + mX, en.mesh.position.z, 0.5);
                        hitWallZ = this.navigation.levelManager.checkWallCollision(en.mesh.position.x, en.mesh.position.z + mZ, 0.5);
                    }
                    
                    if (hitWallX) {
                        en.velocity.x *= -1;
                        mX = en.velocity.x * en.speed * delta;
                    }
                    if (hitWallZ) {
                        en.velocity.z *= -1;
                        mZ = en.velocity.z * en.speed * delta;
                    }
                    
                    en.mesh.position.x += mX;
                    en.mesh.position.z += mZ;
                    en.mesh.position.y = (en.groundY !== undefined) ? en.groundY : 0.42;
                    
                    let targetAngle = Math.atan2(en.velocity.x, en.velocity.z);
                    let targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                    en.mesh.quaternion.slerp(targetQuat, delta * 5.0);
                }
                
                // Lépéshang
                en.stepTimer -= delta;
                if (en.stepTimer <= 0) {
                    en.stepTimer = 0.2;
                    EventBus.emit('PLAY_SOUND', { name: 'crawlerStep', distance: distToPlayer });
                }
                continue;
            }

            if (en.attackRestTimer > 0) {
                en.attackRestTimer -= delta;
            }
            if (en.roarTimer > 0) {
                en.roarTimer -= delta;
                
                if (en.type === 'boss') {
                    en.attackTime = (en.attackTime || 0) + delta;

                    // 1. Támadás / ordítás alatt a modell teste stabilan a támadás irányába néz (nem csinál 8-asokat a modell teste, és nem fordul rá a játékosra)
                    if (typeof en.attackBaseAngle === 'undefined') {
                        let targetX = (en.targetResonator && en.targetResonator.mesh) ? en.targetResonator.mesh.position.x : playerPos.x;
                        let targetZ = (en.targetResonator && en.targetResonator.mesh) ? en.targetResonator.mesh.position.z : playerPos.z;
                        let dirX = targetX - en.mesh.position.x;
                        let dirZ = targetZ - en.mesh.position.z;
                        en.attackBaseAngle = Math.atan2(dirX, dirZ);
                    }
                    en.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), en.attackBaseAngle);

                    // 2. GŐZ ÉS SPÓRA SUGÁR 8-AS (LEMNISZCÁTA) PÁSZTÁZÁSA:
                    // A boss teste mereven előre néz, de a szájából kilövellő gőzsugár
                    // egy 3D lemniszkáta 8-as alakzatot rajzol le a térben (vízszintes yaw: sin(wt), függőleges pitch: sin(2wt))!
                    const t = en.attackTime;
                    const yawOffset = Math.sin(t * 4.5) * 0.35;    // kb. +-20 fokos vízszintes pásztázás
                    const pitchOffset = Math.sin(t * 9.0) * 0.18;  // kb. +-10 fokos függőleges hullámzás

                    const baseForward = new THREE.Vector3(0, 0, 1).applyQuaternion(en.mesh.quaternion).normalize();
                    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(en.mesh.quaternion).normalize();
                    const up = new THREE.Vector3(0, 1, 0);

                    const streamDir = baseForward.clone()
                        .addScaledVector(right, yawOffset)
                        .addScaledVector(up, pitchOffset)
                        .normalize();

                    const mouthPos = en.mesh.position.clone();
                    mouthPos.y += 2.6; // Nexus Boss száj/fej magasság
                    mouthPos.addScaledVector(baseForward, 1.2);
                    mouthPos.addScaledVector(right, yawOffset * 0.4);
                    mouthPos.addScaledVector(up, pitchOffset * 0.3);

                    if (typeof en.waveCooldown === 'undefined') en.waveCooldown = 0;
                    en.waveCooldown -= delta;
                    if (en.waveCooldown <= 0) {
                        EventBus.emit('SPAWN_BOSS_SHOCKWAVE', {
                            mesh: en.mesh,
                            position: mouthPos,
                            direction: streamDir
                        });
                        en.waveCooldown = 0.08; // Sűrűbb gőzáram, folyamatos 8-as szalag
                    }
                    
                    if (distToPlayer <= 8.5) {
                        let dirToPlayer = new THREE.Vector3().subVectors(playerPos, en.mesh.position);
                        dirToPlayer.y = 0;
                        dirToPlayer.normalize();
                        
                        if (baseForward.dot(dirToPlayer) >= 0.70) {
                            if (typeof en.bossDamageTick === 'undefined') en.bossDamageTick = 0;
                            en.bossDamageTick -= delta;
                            if (en.bossDamageTick <= 0) {
                                en.bossDamageTick = 0.2;
                                const stats = difficultySettings[this.difficulty || 'medium'] || difficultySettings.medium;
                                let rawDamage = stats.damage * en.damageMult * 8;
                                EventBus.emit('PLAYER_TAKE_DAMAGE', { amount: rawDamage, source: 'bossShockwave' });
                                EventBus.emit('CAMERA_SHAKE', 0.3);
                                EventBus.emit('TRIGGER_GLITCH', 150);
                                EventBus.emit('BLOOD_SPLATTER', true);
                            }
                        }
                    }

                    // Ha a rezonátort támadja: a teljes támadási ciklus alatt lökés-hullámok zúzzák a rezonátort, a csúcspontján megsemmisül
                    if (en.targetResonator && en.roarTimer <= 1.2) {
                        EventBus.emit('RESONATOR_DESTROYED', en.targetResonator);
                        en.targetResonator = null;
                    }
                }
                
                // 3. TÁMADÁS VÉGE: AZONNALI VISSZATÉRÉS SÉTÁLÓ/FUTÓ PÓZBÓL (Nincs túl sokáig tartott támadó póz!)
                if (en.roarTimer <= 0) {
                    en.attackRestTimer = 0.2;
                    if (en.targetResonator) {
                        EventBus.emit('RESONATOR_DESTROYED', en.targetResonator);
                        en.targetResonator = null;
                    }
                    delete en.attackBaseAngle;
                    delete en.attackTime;
                    en.isAttacking = false;
                    en.attackAnimTimer = 0;

                    // Modell visszatérése futó/sétáló animációra
                    if (en.attackAction) en.attackAction.fadeOut(0.2);
                    if (en.runAction) {
                        en.runAction.reset().fadeIn(0.2).play();
                        en.currentAction = en.runAction;
                    }
                }

                // Amíg a teljes támadási ciklus / ordítás tart, a Boss nem mozog tovább
                continue;
            }

            en.growlTimer -= delta;
            if (en.growlTimer <= 0) {
                en.growlTimer = Math.random() * 5 + 2;
                if (en.type === 'normal') EventBus.emit('PLAY_SOUND', { name: 'hostGrowl', distance: distToPlayer });
                else if (en.type === 'runner') EventBus.emit('PLAY_SOUND', { name: 'runnerGrowl', distance: distToPlayer });
                else if (en.type === 'tank') EventBus.emit('PLAY_SOUND', { name: 'tankGrowl', distance: distToPlayer });
                else if (en.type === 'boss') EventBus.emit('PLAY_SOUND', { name: 'bossGrowl', distance: distToPlayer });
            }

            // Lépéshangok minden ellenség típusnak 15 méteren belül
            if (distToPlayer <= 15.0 && !en.frozen && en.stunTimer <= 0) {
                if (typeof en.footstepTimer === 'undefined') en.footstepTimer = 0;
                en.footstepTimer -= delta;
                if (en.footstepTimer <= 0) {
                    en.footstepTimer = (en.type === 'runner' || en.type === 'crawler') ? 0.35 : (en.type === 'tank' || en.type === 'boss' ? 0.8 : 0.6);
                    if (en.type === 'normal') EventBus.emit('PLAY_SOUND', { name: 'hostStep', distance: distToPlayer });
                    else if (en.type === 'runner') EventBus.emit('PLAY_SOUND', { name: 'runnerStep', distance: distToPlayer });
                    else if (en.type === 'tank') EventBus.emit('PLAY_SOUND', { name: 'tankStep', distance: distToPlayer });
                    else if (en.type === 'hider') EventBus.emit('PLAY_SOUND', { name: 'hiderStep', distance: distToPlayer });
                    else if (en.type === 'crawler') EventBus.emit('PLAY_SOUND', { name: 'crawlerStep', distance: distToPlayer });
                    else if (en.type === 'boss') EventBus.emit('PLAY_SOUND', { name: 'tankStep', distance: distToPlayer });
                }
            }

            // A) TÁMADÁS FOLYAMATBAN
            if (en.isAttacking) {
                en.attackAnimTimer -= delta;
                
                if (en.attackAnimTimer <= en.hitFrameTime && !en.hasDealtDamage) {
                    en.hasDealtDamage = true;
                    
                    if (en.type === 'normal') EventBus.emit('PLAY_SOUND', { name: 'hostAttack', distance: distToPlayer });
                    else if (en.type === 'runner') EventBus.emit('PLAY_SOUND', { name: 'runnerAttack', distance: distToPlayer });
                    else if (en.type === 'tank') EventBus.emit('PLAY_SOUND', { name: 'tankAttack', distance: distToPlayer });
                    else if (en.type === 'hider') EventBus.emit('PLAY_SOUND', { name: 'hiderAttack', distance: distToPlayer });

                    if (en.type !== 'boss') {
                        let isInCone = true;
                        if (en.type === 'tank') {
                            let enemyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(en.mesh.quaternion).normalize();
                            let dirToPlayer = new THREE.Vector3().subVectors(playerPos, en.mesh.position).normalize();
                            dirToPlayer.y = 0; enemyForward.y = 0; enemyForward.normalize();
                            if (enemyForward.dot(dirToPlayer) < 0.5) {
                                isInCone = false;
                            }
                        }

                        if (distToPlayer <= attackRange && isInCone) {
                            const stats = difficultySettings[this.difficulty || 'medium'] || difficultySettings.medium;
                            let baseDamageMultiplier = 50;
                            let rawDamage = stats.damage * en.damageMult * baseDamageMultiplier;
                            if (en.type === 'tank') {
                                if (en.comboStep === 0) {
                                    EventBus.emit('PLAYER_RECOIL_ADD', { yaw: -0.15, pitch: 0.05 });
                                } else if (en.comboStep === 1) {
                                    EventBus.emit('PLAYER_RECOIL_ADD', { yaw: 0.15, pitch: 0.05 });
                                } else if (en.comboStep === 2) {
                                    rawDamage *= 1.5;
                                    EventBus.emit('PLAYER_RECOIL_ADD', { yaw: 0, pitch: -0.3 });
                                    EventBus.emit('CAMERA_SHAKE', 1.0);
                                    EventBus.emit('ADD_DRUGGED_EFFECT', 1.5);
                                }
                            }
                            EventBus.emit('PLAYER_TAKE_DAMAGE', rawDamage); 
                            EventBus.emit('ENEMY_ATTACK_HIT', en);
                            EventBus.emit('PLAY_SOUND', { id: 'hurt' });
                        } else {
                            if (en.type === 'tank') EventBus.emit('PLAY_SOUND', { name: 'knifeHit' });
                        }
                    }
                }

                if (en.attackAnimTimer <= 0) {
                    en.isAttacking = false;
                    if (en.type === 'tank' && en.comboActions && en.comboActions.length > 0) {
                        en.comboStep++;
                        if (en.comboStep >= en.comboActions.length) {
                            en.comboStep = 0;
                            en.attackRestTimer = 1.5;
                        } else {
                            en.attackRestTimer = 0.2;
                        }
                    } else {
                        en.attackRestTimer = 1.0;
                    }
                }
            } 
            // B) ÚJ TÁMADÁS INDÍTÁSA / CSALI REZONÁTOR KÖVETÉSE
            else if (isLured) {
                let lureAttackRange = (en.type === 'boss') ? 8.0 : 1.5;
                if (activeLureDist <= lureAttackRange) {
                    let targetAngle = Math.atan2(targetPos.x - en.mesh.position.x, targetPos.z - en.mesh.position.z);
                    en.attackBaseAngle = targetAngle;
                    en.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                    if (en.type === 'boss') {
                        if (!en.roarTimer || en.roarTimer <= 0) {
                            en.roarTimer = 3.0;
                            en.attackTime = 0.0;
                            en.waveCooldown = 0.0;
                            en.targetResonator = luredResonator;
                            let distToP = playerPos ? Math.hypot(playerPos.x - en.mesh.position.x, playerPos.z - en.mesh.position.z) : null;
                            EventBus.emit('PLAY_SOUND', { id: 'bossAttack', distance: distToP, position: en.mesh.position.clone() });
                            
                            if (en.attackAction && en.currentAction !== en.attackAction) {
                                if (en.runAction) en.runAction.fadeOut(0.2);
                                en.attackAction.reset().fadeIn(0.2).play();
                                en.currentAction = en.attackAction;
                            }
                            en.isAttacking = false;
                        }
                    } else {
                        if (en.attackAction && en.currentAction !== en.attackAction) {
                            if (en.runAction) en.runAction.fadeOut(0.2);
                            en.attackAction.reset().fadeIn(0.2).play();
                            en.currentAction = en.attackAction;
                        }
                    }
                    continue;
                } else {
                    // Ha a csali távolabb van: fusson a csali felé! (Minden ellenség, beleértve a Boss-t is!)
                    if (en.currentAction !== en.runAction && en.runAction) {
                        if (en.attackAction) en.attackAction.fadeOut(0.2);
                        if (en.type === 'tank' && en.comboActions) en.comboActions.forEach(a => a.fadeOut(0.2));
                        en.runAction.reset().fadeIn(0.2).play();
                        en.currentAction = en.runAction;
                    }

                    if (this.navigation) {
                        let dir = this.navigation.getBestDirection(en, targetPos);
                        let enemyRadius = this.getEnemyRadius(en);
                        if (en.type === 'boss' && (Math.abs(en.mesh.position.x) > 24.0 || Math.abs(en.mesh.position.z) > 24.0)) {
                            enemyRadius = 1.5;
                        }
                        let mX = dir.x * en.speed * delta;
                        let mZ = dir.z * en.speed * delta;
                        
                        let level = this.navigation.levelManager;
                        if (!level || !level.checkWallCollision(en.mesh.position.x + mX, en.mesh.position.z, enemyRadius)) {
                            en.mesh.position.x += mX;
                        }
                        if (!level || !level.checkWallCollision(en.mesh.position.x, en.mesh.position.z + mZ, enemyRadius)) {
                            en.mesh.position.z += mZ;
                        }
                        en.mesh.position.y = (en.groundY !== undefined) ? en.groundY : ((en.type === 'crawler') ? 0.42 : ((en.type === 'runner') ? 0.12 : 0));
                        
                        let targetAngle = Math.atan2(dir.x, dir.z);
                        let targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                        en.mesh.quaternion.slerp(targetQuat, delta * 5.0);
                    }
                }
            }
            else if (distToPlayer <= attackRange && en.attackRestTimer <= 0 && (!en.roarTimer || en.roarTimer <= 0)) {
                if (en.type === 'boss') {
                    en.roarTimer = 3.0;
                    en.attackTime = 0.0;
                    en.waveCooldown = 0.0;
                    let targetAngle = Math.atan2(playerPos.x - en.mesh.position.x, playerPos.z - en.mesh.position.z);
                    en.attackBaseAngle = targetAngle;
                    en.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                    EventBus.emit('PLAY_SOUND', { name: 'bossAttack', distance: distToPlayer, position: en.mesh.position.clone() });

                    if (en.attackAction && en.currentAction !== en.attackAction) {
                        if (en.runAction) en.runAction.fadeOut(0.2);
                        en.attackAction.reset().fadeIn(0.2).play();
                        en.currentAction = en.attackAction;
                    }
                    en.isAttacking = false;
                    continue;
                }
                
                en.isAttacking = true;
                en.hasDealtDamage = false;
                
                let animToPlay = en.attackAction;
                let animDuration = 1.0;
                if (en.type === 'tank' && en.comboActions && en.comboActions.length > 0) {
                    animToPlay = en.comboActions[en.comboStep];
                }

                if (animToPlay) {
                    if (animToPlay._clip) {
                        animDuration = animToPlay._clip.duration;
                    } else if (typeof animToPlay.getClip === 'function') {
                        animDuration = animToPlay.getClip().duration;
                    }
                }
                en.attackAnimTimer = animDuration;
                en.hitFrameTime = animDuration * 0.5;

                if (animToPlay && en.currentAction !== animToPlay) {
                    if (en.runAction) en.runAction.fadeOut(0.2);
                    if (en.type === 'tank' && en.comboActions) en.comboActions.forEach(a => a.stop());
                    animToPlay.reset().fadeIn(0.2).play();
                    en.currentAction = animToPlay;
                }

                // Támadás hangja a támadás indításakor
                if (en.type === 'normal') EventBus.emit('PLAY_SOUND', { name: 'hostAttack', distance: distToPlayer, position: en.mesh.position.clone() });
                else if (en.type === 'runner') EventBus.emit('PLAY_SOUND', { name: 'runnerAttack', distance: distToPlayer, position: en.mesh.position.clone() });
                else if (en.type === 'tank') EventBus.emit('PLAY_SOUND', { name: 'tankAttack', distance: distToPlayer, position: en.mesh.position.clone() });
                else if (en.type === 'hider') EventBus.emit('PLAY_SOUND', { name: 'hiderAttack', distance: distToPlayer, position: en.mesh.position.clone() });
            } 
            // C) MOZGÁS
            else {
                if (en.type === 'tank' && distToPlayer > attackRange * 1.5) {
                    en.comboStep = 0;
                }

                // Támadás utáni pihenés: ha még tart a pihenő időzítő (attackRestTimer) és a játékos
                // a hatótávon belül van, az ellenség NEM rohan rá a játékosra, hanem helyben állva figyeli a játékost!
                let isRestingAfterAttack = (en.attackRestTimer > 0 && distToPlayer <= attackRange * 1.15);

                if (!isRestingAfterAttack) {
                    if (en.currentAction !== en.runAction && en.runAction) {
                        if (en.attackAction) en.attackAction.fadeOut(0.2);
                        if (en.type === 'tank' && en.comboActions) en.comboActions.forEach(a => a.fadeOut(0.2));
                        en.runAction.reset().fadeIn(0.2).play();
                        en.currentAction = en.runAction;
                    }

                    if (this.navigation) {
                        let dir = this.navigation.getBestDirection(en, targetPos);
                        let enemyRadius = this.getEnemyRadius(en);
                        let minPlayerDist = (en.type === 'boss') ? 1.4 : (en.type === 'tank' ? 0.9 : 0.65);
                        
                        // Boss folyosón belüli egyenes haladása és védettsége:
                        // Ha a Boss a folyosóban van (|x| > 24 vagy |z| > 24), a folyosó tengelyén halad befelé az arénába!
                        let inCorridor = (Math.abs(en.mesh.position.x) > 24.0 || Math.abs(en.mesh.position.z) > 24.0);
                        if (en.type === 'boss' && inCorridor) {
                            if (en.mesh.position.z < -24.0) dir.set(0, 0, 1);
                            else if (en.mesh.position.z > 24.0) dir.set(0, 0, -1);
                            else if (en.mesh.position.x < -24.0) dir.set(1, 0, 0);
                            else if (en.mesh.position.x > 24.0) dir.set(-1, 0, 0);
                            enemyRadius = 1.5; // Kisebb hatósugár a folyosón, hogy még véletlenül se akadjon be a zsilip peremébe
                        }

                        // Szeparáció (egymás elkerülése és eltolása mozgás közben is, hogy ne folyjanak össze)
                        let sepX = 0, sepZ = 0;
                        if (en.type !== 'boss') { // A hatalmas Boss-t nem lökhetik el a kisebb zombik a falba
                            for (let j = 0; j < this.enemies.length; j++) {
                                if (i !== j) {
                                    let other = this.enemies[j];
                                    if (!other.mesh || other.lifeTime <= 0) continue;
                                    let otherRadius = this.getEnemyRadius(other);
                                    let desiredDist = (enemyRadius + otherRadius) * 1.25;
                                    let dx = en.mesh.position.x - other.mesh.position.x;
                                    let dz = en.mesh.position.z - other.mesh.position.z;
                                    let d = Math.hypot(dx, dz);
                                    if (d < desiredDist && d > 0.01) {
                                        let factor = ((desiredDist - d) / desiredDist);
                                        let mult = (other.type === 'boss') ? 3.0 : 1.5;
                                        sepX += (dx / d) * factor * en.speed * delta * mult;
                                        sepZ += (dz / d) * factor * en.speed * delta * mult;
                                    }
                                }
                            }
                        }
                        
                        let mX = (dir.x * en.speed * delta) + sepX;
                        let mZ = (dir.z * en.speed * delta) + sepZ;
                        
                        // Csak akkor léphet közelebb, ha nem lépi át a játékos fizikai védelmi sugarát
                        let nextX = en.mesh.position.x + mX;
                        let nextZ = en.mesh.position.z + mZ;
                        let nextDist = Math.hypot(playerPos.x - nextX, playerPos.z - nextZ);
                        if (nextDist >= minPlayerDist || nextDist > distToPlayer) {
                            let level = this.navigation.levelManager;
                            if (!level || !level.checkWallCollision(nextX, en.mesh.position.z, enemyRadius)) {
                                en.mesh.position.x = nextX;
                            }
                            if (!level || !level.checkWallCollision(en.mesh.position.x, nextZ, enemyRadius)) {
                                en.mesh.position.z = nextZ;
                            }
                        }
                        en.mesh.position.y = (en.groundY !== undefined) ? en.groundY : ((en.type === 'crawler') ? 0.42 : ((en.type === 'runner') ? 0.12 : 0));
                        
                        if (en.type === 'boss') {
                            // A Boss hatalmas testével mindig a játékos (vagy csali) felé forduljon séta közben is!
                            let faceX = isLured ? (targetPos.x - en.mesh.position.x) : (playerPos.x - en.mesh.position.x);
                            let faceZ = isLured ? (targetPos.z - en.mesh.position.z) : (playerPos.z - en.mesh.position.z);
                            let targetAngle = Math.atan2(faceX, faceZ);
                            let targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                            en.mesh.quaternion.slerp(targetQuat, delta * 6.0);
                        } else {
                            let targetAngle = Math.atan2(dir.x, dir.z);
                            let targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                            en.mesh.quaternion.slerp(targetQuat, delta * 5.0);
                        }
                    }
                } else {
                    let dirX = playerPos.x - en.mesh.position.x;
                    let dirZ = playerPos.z - en.mesh.position.z;
                    let targetAngle = Math.atan2(dirX, dirZ);
                    let targetQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), targetAngle);
                    en.mesh.quaternion.slerp(targetQuat, delta * 6.0);
                }
            }
        }

        // Ellenségek közötti és játékos elleni fizikai ütközés / szeparáció feloldása minden fázisban
        this.resolveCollisions(playerPos);

        // Hitboxok pontos szinkronizálása a végleges pozíciókhoz
        for (let i = 0; i < this.enemies.length; i++) {
            this.updateHitboxPositions(this.enemies[i]);
        }

        // Hullák (deadBodies) frissítése és süllyesztése
        for (let i = this.deadBodies.length - 1; i >= 0; i--) {
            let corpse = this.deadBodies[i];
            if (!corpse.frozen) {
                corpse.freezeTimer -= delta;
                if (corpse.freezeTimer > 0 && corpse.mixer) {
                    corpse.mixer.update(delta);
                }
                if (corpse.freezeTimer <= 0) {
                    corpse.frozen = true;
                    if (corpse.hasDeathAnim) {
                        corpse.mesh.traverse((child) => {
                            if (child.isMesh) child.frustumCulled = true;
                        });
                    }
                }
            }
            if (corpse.sinking) {
                corpse.mesh.position.y -= delta * 0.8;
                if (corpse.mesh.position.y < -2.0) {
                    corpse.mesh.visible = false;
                    this.zombiePool.push(corpse);
                    this.deadBodies.splice(i, 1);
                }
            }
        }
    }
}
