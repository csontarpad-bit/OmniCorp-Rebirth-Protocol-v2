import * as THREE from 'three';
import EventBus from './EventBus.js';

class VFXManager {
    constructor() {
        this.scene = null;
        
        // Object Pool-ok
        this.bloodPool = [];
        this.laserPool = [];
        this.activeSpurts = [];
        
        this.poolLaserMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 3 });
        this.sonicBooms = [];
        this.shockwaves = [];
        this.fogTexture = null;
        this.corridorSmokePuffs = [];
        
        this.radSystem = null;
        this.fogSystem = null;

        this._bindEvents();
    }

    init(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        for (let i = 0; i < 60; i++) {
            let lGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
            let l = new THREE.Line(lGeo, this.poolLaserMat);
            l.frustumCulled = false;
            l.visible = false;
            this.scene.add(l);
            this.laserPool.push({ mesh: l });
        }
        this.createBloodPool();
        this.createRadSystem();
        this.createFogSystem();
    }

    _bindEvents() {
        EventBus.on('WEAPON_FIRED', (data) => this.showMuzzleFlash(data));
        EventBus.on('SPAWN_SONIC_BOOM', (data) => this.spawnSonicBoom(data));
        EventBus.on('RESONATOR_BLAST_PULSE', (data) => this.spawnResonatorSteam(data));
        EventBus.on('SPAWN_BOSS_SHOCKWAVE', (data) => this.spawnBossShockwave(data));
        EventBus.on('SPAWN_BLOOD', (data) => this.spawnBlood(data));
        EventBus.on('SPAWN_DUST', (data) => this.spawnDust(data));
        EventBus.on('SPAWN_TRACER', (data) => this.spawnBulletTracer(data));
        EventBus.on('SPAWN_SONIC_RINGS', (data) => this.spawnSonicRings(data));
        EventBus.on('UPDATE_TOXIC_FOG', (count) => this.updateFogOpacity(count));
        EventBus.on('RESONATOR_ZOMBIE_BURST', (data) => this.spawnResonatorBurst(data));
        EventBus.on('SET_FREEZE_VISUALS', (isFrozen) => this.setFreezeVisuals(isFrozen));
        EventBus.on('FREEZE_ENDED', () => this.setFreezeVisuals(false));
        EventBus.on('GATES_SMOKE_BURST', (data) => this.spawnGateSmokeBurst(data));
        EventBus.on('GATES_SMOKE_TICK', (data) => this.spawnGateSmokeTick(data));
        EventBus.on('GAME_OVER', () => this.clearScreenBlood());
        EventBus.on('RETURN_TO_MAIN_MENU', () => this.clearScreenBlood());
        EventBus.on('START_GAME', () => this.reset());
    }

    setFreezeVisuals(isFrozen) {
        this.isFrozen = isFrozen;
        if (this.fogSystem && this.fogSystem.material) {
            if (isFrozen) {
                this.fogSystem.material.color.setHex(0xaaaaee);
                this.fogSystem.material.opacity = 0.8;
                if (this.scene && this.scene.fog) {
                    this.scene.fog.color.setHex(0x001133);
                    if (this.scene.background) this.scene.background.copy(this.scene.fog.color);
                }
            } else {
                this.fogSystem.material.color.setHex(0xffffff);
                this.updateFogOpacity(this.lastPuddleCount || 0);
            }
        } else {
            if (!isFrozen && this.scene && this.scene.fog) {
                this.updateFogOpacity(this.lastPuddleCount || 0);
            }
        }
    }

    updateFogOpacity(puddleCount) {
        let maxPuddles = 200;
        let count = (typeof puddleCount === 'number') ? puddleCount : (this.lastPuddleCount || 0);
        this.lastPuddleCount = count;
        let currentPuddles = Math.min(count, maxPuddles);

        if (this.fogSystem && this.fogSystem.material) {
            this.fogSystem.material.opacity = (currentPuddles / maxPuddles) * 0.6;
        }

        if (this.scene && this.scene.fog) {
            let fogDensity = 0.035 + (currentPuddles / maxPuddles) * 0.6;
            this.scene.fog.density = fogDensity;

            if (!this.isFrozen) {
                let baseG = 26;
                let maxG = 40;
                let currentG = baseG + (currentPuddles / maxPuddles) * (maxG - baseG);
                this.scene.fog.color.setRGB(5 / 255, currentG / 255, 5 / 255);
                if (this.scene.background) {
                    this.scene.background.copy(this.scene.fog.color);
                }
            }
        }
    }

    createBloodPool() {
        if (this.bloodGroup) return;
        this.bloodGroup = new THREE.Group();
        if (this.scene) this.scene.add(this.bloodGroup);
        this.bloodParticles = [];
        
        const dropCanvas = document.createElement('canvas');
        dropCanvas.width = 32; dropCanvas.height = 32;
        const dCtx = dropCanvas.getContext('2d');
        const dGrad = dCtx.createRadialGradient(16, 16, 2, 16, 16, 16);
        dGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        dGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
        dGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        dCtx.fillStyle = dGrad;
        dCtx.fillRect(0, 0, 32, 32);
        const dropTexture = new THREE.CanvasTexture(dropCanvas);
        dropTexture.needsUpdate = true;
        
        this.bloodMat = new THREE.SpriteMaterial({ 
            map: dropTexture, 
            color: 0xaa0000, 
            transparent: true,
            opacity: 1.0,
            depthWrite: false, 
            blending: THREE.NormalBlending,
            alphaTest: 0.05
        });
        
        for (let i = 0; i < 400; i++) {
            let p = new THREE.Sprite(this.bloodMat.clone());
            p.visible = false;
            this.bloodGroup.add(p);
            this.bloodParticles.push({ mesh: p, life: 0, vx: 0, vy: 0, vz: 0 });
        }
    }

    spawnBlood(data) {
        if (!this.bloodGroup) {
            this.createBloodPool();
        }
        
        let isPlayer = (data && data.isPlayer) || false;
        let isPlant = (data && data.isPlant) || false;
        let bloodColor = (isPlayer || isPlant) ? 0xaa0000 : 0x55ff55;
        
        const mainMenu = document.getElementById('main-menu');
        const gameOver = document.getElementById('game-over');
        const isCinematic = (mainMenu && !mainMenu.classList.contains('hidden')) || (gameOver && !gameOver.classList.contains('hidden'));

        if (!isCinematic && (isPlayer || (data && data.distance && data.distance < 4.0))) {
            this.splashVisorBlood(isPlayer);
            const screenBlood = document.getElementById('screen-blood');
            if (screenBlood) screenBlood.style.opacity = '1.0';
        }

        if (!data || !data.position) {
            return;
        }

        let count = data.isBash ? 30 : (data.isPlant ? 20 : (data.isHeadshot ? 15 : 5));
        
        let baseSprayDx = 0, baseSprayDy = 0, baseSprayDz = 0;
        if (data.slashDir) {
            let sideMult = Math.random() > 0.5 ? 1 : -1;
            let bloodSide = new THREE.Vector3().crossVectors(data.slashDir, new THREE.Vector3(0,1,0)).normalize();
            baseSprayDx = bloodSide.x * 0.4 * sideMult;
            baseSprayDy = -0.05;
            baseSprayDz = bloodSide.z * 0.4 * sideMult;
        } else if (data.isBash && data.direction) {
            baseSprayDx = data.direction.x * 0.2;
            baseSprayDy = 0.1;
            baseSprayDz = data.direction.z * 0.2;
        }

        if (!this.bloodParticles) return;

        for (let i = 0; i < count; i++) {
            let p = this.bloodParticles.find(x => x.life <= 0);
            if (p) {
                p.life = data.isBash ? 0.3 + Math.random() * 0.2 : (data.isPlant ? 1.0 : 0.8);
                p.mesh.position.copy(data.position);
                p.mesh.scale.setScalar(data.isBash ? 0.2 + Math.random() * 0.1 : 0.15);
                p.mesh.material.color.setHex(bloodColor);
                p.mesh.material.opacity = 1.0;
                
                if (data.isPlant) {
                    p.vx = (Math.random() - 0.5) * 0.08;
                    p.vy = Math.random() * 0.3 + 0.2; // Erőteljes gejzír felfelé
                    p.vz = (Math.random() - 0.5) * 0.08;
                } else if (data.slashDir) {
                    p.vx = baseSprayDx * 0.8 + (Math.random() - 0.5) * 0.15;
                    p.vy = baseSprayDy + (Math.random() - 0.5) * 0.2;
                    p.vz = baseSprayDz * 0.8 + (Math.random() - 0.5) * 0.15;
                } else if (data.isBash && data.direction) {
                    p.vx = baseSprayDx + (Math.random() - 0.5) * 0.15;
                    p.vy = baseSprayDy + (Math.random() - 0.5) * 0.15;
                    p.vz = baseSprayDz + (Math.random() - 0.5) * 0.15;
                } else {
                    p.vx = (Math.random() - 0.5) * 0.15;
                    p.vy = Math.random() * 0.2;
                    p.vz = (Math.random() - 0.5) * 0.15;
                }
                p.mesh.visible = true;
                
                // Csak az első részecskénél regisztráljuk a sugarat, hogy ne legyen 15 sugár
                if (i === 0 && !data.isBash && !isPlayer && !data.isPlant) {
                    this.activeSpurts.push({
                        pos: data.position.clone(),
                        timer: data.isHeadshot ? 0.35 : 0.2, // Fejlövésnél tovább spriccel
                        dropTimer: 0,
                        dx: baseSprayDx, 
                        dy: baseSprayDy, 
                        dz: baseSprayDz,
                        color: bloodColor
                    });
                }
            }
        }
    }
        
    splashVisorBlood(isPlayerBlood = false) {
        const mainMenu = document.getElementById('main-menu');
        const gameOver = document.getElementById('game-over');
        if ((mainMenu && !mainMenu.classList.contains('hidden')) || (gameOver && !gameOver.classList.contains('hidden'))) {
            return;
        }

        const uiLayer = document.getElementById('ui-layer') || document.body;
        
        let dropCount = Math.floor(Math.random() * 4) + 3;
        
        for (let i = 0; i < dropCount; i++) {
            let drop = document.createElement('div');
            drop.className = 'visor-blood-splatter';
            
            // Ha a játékos sérül, rárakjuk a piros CSS osztályt!
            if (isPlayerBlood === true) {
                drop.classList.add('red');
            }
            
            let x = Math.random() * 90 + 5; 
            let y = Math.random() * 60 + 5; 
            let size = Math.random() * 25 + 15; 
            
            drop.style.left = `${x}vw`;
            drop.style.top = `${y}vh`;
            drop.style.width = `${size}px`;
            drop.style.height = `${size}px`;
            
            uiLayer.appendChild(drop);
            
            setTimeout(() => {
                if (drop.parentNode) drop.parentNode.removeChild(drop);
            }, 3000);
        }
    }


    spawnDust(data) {
        if (!this.bloodGroup) {
            this.createBloodPool();
        }
        if (!this.bloodParticles || !data || !data.position) return;
        for (let i = 0; i < 3; i++) { 
            let p = this.bloodParticles.find(x => x.life <= 0);
            if (p) {
                p.life = 0.6;
                p.mesh.position.set(
                    data.position.x + (Math.random()-0.5)*0.5, 
                    0.1, 
                    data.position.z + (Math.random()-0.5)*0.5
                );
                
                // Kisebb por (0.3)
                p.mesh.scale.setScalar(0.3);
                
                p.mesh.material.color.setHex(0x889988); 
                p.mesh.material.opacity = 1.0;
                
                p.vx = (Math.random() - 0.5) * 0.1; 
                p.vy = Math.random() * 0.05 + 0.02;    // Alig emelkedik fel a földről
                p.vz = (Math.random() - 0.5) * 0.1; 
                
                p.mesh.visible = true;
            }
        }
    }

    spawnBulletTracer(data) {
        if (!this.laserPool) return;
        let l = this.laserPool.find(x => !x.mesh.visible);
        if (l) {
            l.mesh.geometry.setFromPoints([data.start, data.end]);
            l.mesh.visible = true;
            setTimeout(() => { l.mesh.visible = false; }, 100); 
        }
    }

    spawnSonicRings(data) {
        if (!data || !data.start || !data.end || !this.scene) return;
        const startPoint = data.start;
        const endPoint = data.end;
        const distance = startPoint.distanceTo(endPoint);

        // 1. A fő lézersugár (Villámgyors, vékony henger csík, ahogy a régi kód 1227. sorában)
        const cylinderGeo = new THREE.CylinderGeometry(0.015, 0.015, distance, 4);
        const cylinderMat = new THREE.MeshBasicMaterial({
            color: 0xe0ffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
        cylinder.frustumCulled = false;
        cylinder.position.copy(startPoint).lerp(endPoint, 0.5);
        cylinder.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3().subVectors(endPoint, startPoint).normalize()
        );
        this.scene.add(cylinder);

        setTimeout(() => {
            if (this.scene) this.scene.remove(cylinder);
            cylinderGeo.dispose();
            cylinderMat.dispose();
        }, 50);

        // 2. Hangrobbanás (Mach-cone) gyűrűk haladási animációval
        let bulletDir = new THREE.Vector3().subVectors(endPoint, startPoint).normalize();
        let ringCount = Math.floor(distance / 2.0);
        if (ringCount > 15) ringCount = 15;

        for (let i = 1; i <= ringCount; i++) {
            setTimeout(() => {
                if (!this.scene) return;
                let ringPos = new THREE.Vector3().copy(startPoint).add(bulletDir.clone().multiplyScalar(i * 2.0));
                let ringGeo = new THREE.RingGeometry(0.05, 0.15, 16);
                let ringMat = new THREE.MeshBasicMaterial({
                    color: 0x00ffff,
                    transparent: true,
                    opacity: 0.8,
                    blending: THREE.AdditiveBlending,
                    side: THREE.DoubleSide,
                    depthWrite: false
                });
                let ring = new THREE.Mesh(ringGeo, ringMat);
                ring.position.copy(ringPos);
                ring.lookAt(ringPos.clone().add(bulletDir));
                this.scene.add(ring);

                this.sonicBooms.push({
                    mesh: ring,
                    life: 1.0,
                    isGroundWave: false
                });
            }, i * 15);
        }
    }

    createRadSystem() {
        // Radioaktív por (400 részecske, pontosan mint a régi kód 246. sorában)
        const particleCount = 400;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 50;
            positions[i * 3 + 1] = Math.random() * 10;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 50;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const particleCanvas = document.createElement('canvas');
        particleCanvas.width = 32; particleCanvas.height = 32;
        const pContext = particleCanvas.getContext('2d');
        const gradient = pContext.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(200, 255, 200, 1)');
        gradient.addColorStop(0.4, 'rgba(0, 255, 0, 0.6)');
        gradient.addColorStop(1, 'rgba(0, 50, 0, 0)');
        pContext.fillStyle = gradient;
        pContext.fillRect(0, 0, 32, 32);
        const particleTexture = new THREE.CanvasTexture(particleCanvas);
        particleTexture.needsUpdate = true;

        const mat = new THREE.PointsMaterial({
            color: 0x55ff55,
            size: 0.3,
            map: particleTexture,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.radSystem = new THREE.Points(geo, mat);
        this.radSystem.renderOrder = 999;
        if (this.scene) this.scene.add(this.radSystem);
    }

    createFogSystem() {
        // 3D Toxikus füst (150 pamacs, pontosan mint a régi kód 269. sorában)
        this.fogParticleCount = 150;
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(this.fogParticleCount * 3);
        this.fogData = [];
        
        for (let i = 0; i < this.fogParticleCount; i++) {
            let x = (Math.random() - 0.5) * 40;
            let y = Math.random() * 4;
            let z = (Math.random() - 0.5) * 40;
            
            positions[i * 3] = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            
            this.fogData.push({
                vx: (Math.random() - 0.5) * 0.05,
                vy: (Math.random() - 0.5) * 0.02,
                vz: (Math.random() - 0.5) * 0.05,
            });
        }
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const fogCanvas = document.createElement('canvas');
        fogCanvas.width = 128; fogCanvas.height = 128;
        const fCtx = fogCanvas.getContext('2d');
        const fGrad = fCtx.createRadialGradient(64, 64, 10, 64, 64, 60);
        fGrad.addColorStop(0, 'rgba(40, 255, 90, 0.4)');
        fGrad.addColorStop(0.5, 'rgba(20, 180, 60, 0.1)');
        fGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        fCtx.fillStyle = fGrad;
        fCtx.fillRect(0, 0, 128, 128);
        this.fogTexture = new THREE.CanvasTexture(fogCanvas);
        this.fogTexture.needsUpdate = true;

        const mat = new THREE.PointsMaterial({
            size: 15.0,
            map: this.fogTexture,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.fogSystem = new THREE.Points(geo, mat);
        this.fogSystem.renderOrder = 1;
        if (this.scene) this.scene.add(this.fogSystem);
    }

    spawnSonicBoom(data) {
        if (!data) return;
        let pos = (data instanceof THREE.Vector3) ? data : (data.position || data);
        if (!pos || typeof pos.x !== 'number') return;

        if (data.isGroundWave) {
            let ringGeo = new THREE.RingGeometry(0.1, 1.5, 32); 
            let ringMat = new THREE.MeshBasicMaterial({ 
                color: 0x00ffff, 
                transparent: true, 
                opacity: 1.0, 
                blending: THREE.AdditiveBlending, 
                side: THREE.DoubleSide, 
                depthWrite: false 
            });
            let ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.copy(pos);
            ring.position.y += 0.5; 
            ring.rotation.x = -Math.PI / 2; 
            if (this.scene) this.scene.add(ring);
            
            this.sonicBooms.push({ 
                mesh: ring, 
                life: 1.0, 
                isGroundWave: true, 
                radius: 0.1, 
                maxRadius: data.maxRadius || 5.0 
            });
            return;
        }

        let initialScale = (typeof data.scale === 'number') ? data.scale : 0.1;
        const geo = new THREE.RingGeometry(0.1, 0.5, 32);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        
        const boom = {
            mesh: mesh,
            scale: initialScale,
            life: 1.0,
            isGroundWave: false
        };
        
        if (this.scene) this.scene.add(mesh);
        this.sonicBooms.push(boom);
    }

    spawnResonatorSteam(data) {
        if (!data || !data.position) return;
        let pos = data.position;
        for (let j = 0; j < 6; j++) {
            let p = this.bloodParticles ? this.bloodParticles.find(part => part.life <= 0) : null;
            if (p) {
                p.life = 0.8;
                p.mesh.material.color.setHex(0x00ffff);
                p.mesh.material.opacity = 0.5;
                p.mesh.material.blending = THREE.AdditiveBlending;
                p.mesh.position.set(
                    pos.x + (Math.random() - 0.5) * (data.radius || 5.0) * 1.5,
                    0.2 + Math.random() * 1.5,
                    pos.z + (Math.random() - 0.5) * (data.radius || 5.0) * 1.5
                );
                p.mesh.scale.setScalar(0.8);
                p.vx = (Math.random() - 0.5) * 0.05;
                p.vy = Math.random() * 0.05 + 0.02;
                p.vz = (Math.random() - 0.5) * 0.05;
                p.mesh.visible = true;
            }
        }
    }

    spawnResonatorBurst(data) {
        if (!data || !data.position || !this.bloodParticles) return;
        const pos = data.position;
        // 1. Zöld vér fröccsenés a sokkolt ellenfélből (ahogy a régi kód csinálta)
        for (let j = 0; j < 2; j++) {
            let p = this.bloodParticles.find(part => part.life <= 0);
            if (p) {
                p.life = 0.5;
                p.mesh.material.color.setHex(0x55ff55);
                p.mesh.material.opacity = 1.0;
                p.mesh.material.blending = THREE.NormalBlending;
                p.mesh.position.set(
                    pos.x + (Math.random() - 0.5) * 0.5,
                    1.0 + Math.random(),
                    pos.z + (Math.random() - 0.5) * 0.5
                );
                p.mesh.scale.setScalar(0.2);
                p.vx = (Math.random() - 0.5) * 0.2;
                p.vy = Math.random() * 0.3;
                p.vz = (Math.random() - 0.5) * 0.2;
                p.mesh.visible = true;
            }
        }
        // 2. Kékes-fehér izzó gőz pamacsok a zombi testéből
        for (let j = 0; j < 5; j++) {
            let p = this.bloodParticles.find(part => part.life <= 0);
            if (p) {
                p.life = 0.8;
                p.mesh.material.color.setHex(0x00ffff);
                p.mesh.material.opacity = 0.5;
                p.mesh.material.blending = THREE.AdditiveBlending;
                p.mesh.position.set(
                    pos.x + (Math.random() - 0.5) * 1.2,
                    0.2 + Math.random() * 1.5,
                    pos.z + (Math.random() - 0.5) * 1.2
                );
                p.mesh.scale.setScalar(0.8);
                p.vx = (Math.random() - 0.5) * 0.05;
                p.vy = Math.random() * 0.05 + 0.02;
                p.vz = (Math.random() - 0.5) * 0.05;
                p.mesh.visible = true;
            }
        }
    }
    
    spawnBossShockwave(data) {
        if (!data || !this.fogTexture || !this.scene) return;
        
        let startPos;
        if (data.position) {
            startPos = data.position.clone();
        } else if (data.mesh) {
            startPos = data.mesh.position.clone();
            startPos.y += 2.5;
        } else {
            return;
        }

        let baseDir;
        if (data.direction) {
            baseDir = data.direction.clone().normalize();
        } else if (data.mesh) {
            baseDir = new THREE.Vector3(0, 0, 1).applyQuaternion(data.mesh.quaternion).normalize();
        } else {
            baseDir = new THREE.Vector3(0, 0, 1);
        }

        const puffMat = new THREE.SpriteMaterial({
            map: this.fogTexture,
            color: 0xff3300,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // 6 gőz pamacs kilövellése a 8-as pásztázás nyomvonalán
        for (let j = 0; j < 6; j++) {
            const puff = new THREE.Sprite(puffMat.clone());
            
            // Finom szóródás a nyaláb körül
            let pDir = baseDir.clone();
            pDir.x += (Math.random() - 0.5) * 0.12;
            pDir.y += (Math.random() - 0.5) * 0.12;
            pDir.z += (Math.random() - 0.5) * 0.12;
            pDir.normalize();

            let spreadX = (Math.random() - 0.5) * 0.3;
            let spreadY = (Math.random() - 0.5) * 0.3;
            puff.position.set(startPos.x + spreadX, startPos.y + spreadY, startPos.z);

            let initialScale = Math.random() * 1.5 + 1.8;
            puff.scale.set(initialScale, initialScale, 1);

            this.scene.add(puff);

            this.shockwaves.push({
                mesh: puff,
                life: 0.9,
                direction: pDir,
                speed: Math.random() * 5.0 + 16.0,
                growth: Math.random() * 7.0 + 6.0,
                rotSpeed: (Math.random() - 0.5) * 4.0
            });
        }
    }

    showMuzzleFlash(data) {
        // TODO: MuzzleFlash logika ide jön
    }

    spawnGateSmokeBurst(data) {
        if (!data || !data.gates || !this.scene || !this.fogTexture) return;
        const gates = data.gates;
        for (let g = 0; g < gates.length; g++) {
            const gate = gates[g];
            // 6 gőz pamacs kilövellése kapunként a hirtelen kitörő nyomás érzékeltetésére (Nexus Node támadás stílus)
            for (let k = 0; k < 6; k++) {
                this._createGateSmokePuff(gate, true);
            }
        }
    }

    spawnGateSmokeTick(data) {
        if (!data || !data.gates || !this.scene || !this.fogTexture) return;
        if (this.corridorSmokePuffs.length >= 180) return; // Teljesítmény védelmi limit
        const gates = data.gates;
        // Folyamatos áramlás: véletlenszerűen kiválasztott 4 kapuból ömlik tovább a gőz tickenként
        const numPuffs = 4;
        for (let i = 0; i < numPuffs; i++) {
            const gate = gates[Math.floor(Math.random() * gates.length)];
            this._createGateSmokePuff(gate, false);
        }
    }

    _createGateSmokePuff(gate, isBurst) {
        if (!this.scene || !this.fogTexture) return;
        if (this.corridorSmokePuffs.length >= 200) return;

        // Pontosan a Nexus Node támadásának SpriteMaterial beállításai, zöld toxikus színnel
        const puffMat = new THREE.SpriteMaterial({
            map: this.fogTexture,
            color: 0x22ff55,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        const puff = new THREE.Sprite(puffMat);

        // Szétterülés a kapunyílás szélességében (5.0m mentén szórva)
        const lateralOffset = (Math.random() - 0.5) * 5.0;
        let posX = gate.sillX;
        let posZ = gate.sillZ;
        if (gate.isXAxis) {
            posX += lateralOffset;
        } else {
            posZ += lateralOffset;
        }
        const posY = 0.5 + Math.random() * 0.9;
        puff.position.set(posX, posY, posZ);

        // Kifelé mutató irányvektor, finom szóródással a nyaláb körül (Nexus Node stílus)
        let pDir = new THREE.Vector3(gate.outX, 0.08, gate.outZ);
        if (gate.isXAxis) {
            pDir.x += (Math.random() - 0.5) * 0.25;
            pDir.z += (Math.random() - 0.5) * 0.12;
        } else {
            pDir.x += (Math.random() - 0.5) * 0.12;
            pDir.z += (Math.random() - 0.5) * 0.25;
        }
        pDir.y += (Math.random() - 0.5) * 0.08;
        pDir.normalize();

        const initialScale = Math.random() * 1.5 + 2.0;
        puff.scale.set(initialScale, initialScale, 1);

        this.scene.add(puff);

        this.corridorSmokePuffs.push({
            mesh: puff,
            life: isBurst ? (Math.random() * 0.3 + 1.1) : (Math.random() * 0.3 + 0.85),
            direction: pDir,
            speed: isBurst ? (Math.random() * 4.0 + 8.0) : (Math.random() * 3.0 + 5.5),
            growth: Math.random() * 6.0 + 5.0, // Erőteljes gőztágulás (Nexus boss érték)
            rotSpeed: (Math.random() - 0.5) * 4.0 // Gyors turbulens forgás (Nexus boss érték)
        });
    }

    update(delta, camera) {
        const cam = camera || this.camera;
        const camX = cam ? cam.position.x : 0;
        const camZ = cam ? cam.position.z : 0;

        // 1. Radioaktív por (radSystem) lebegése, hullámzása és örvénylése (pontosan mint a régi kód 5009. sorában)
        if (this.radSystem) {
            this.radSystem.rotation.y += delta * 0.05; // A por lassan örvénylik
            const positions = this.radSystem.geometry.attributes.position.array;
            this.elapsedTime = (this.elapsedTime || 0) + delta;
            const time = this.elapsedTime;
            const limit = 25.0;

            for (let i = 0; i < positions.length; i += 3) {
                positions[i + 1] += delta * 0.3; // Lassú emelkedés (Y tengely)
                positions[i] += Math.sin(time * 1.5 + positions[i + 1]) * delta * 0.5; // Hullámzás (X)
                positions[i + 2] += Math.cos(time * 1.5 + positions[i + 1]) * delta * 0.5; // Hullámzás (Z)

                // Ha túl magasra szállt, kezdje újra lentről
                if (positions[i + 1] > 10.0) positions[i + 1] = 0.2;

                // Kamera-követő végtelenítő doboz
                if (positions[i] > camX + limit) positions[i] -= limit * 2;
                if (positions[i] < camX - limit) positions[i] += limit * 2;
                if (positions[i + 2] > camZ + limit) positions[i + 2] -= limit * 2;
                if (positions[i + 2] < camZ - limit) positions[i + 2] += limit * 2;
            }
            this.radSystem.geometry.attributes.position.needsUpdate = true;
        }

        // 2. Toxikus füst (fogSystem) lebegése és kamera-relatív végtelenítése (pontosan mint a régi kód 5024. sorában)
        if (this.fogSystem && this.fogSystem.material.opacity > 0) {
            const fogPos = this.fogSystem.geometry.attributes.position.array;
            const limit = 20.0;
            for (let i = 0; i < this.fogParticleCount; i++) {
                let idx = i * 3;

                // Mozgatás az előre elmentett véletlenszerű irányokba
                fogPos[idx] += this.fogData[i].vx;     // X tengely
                fogPos[idx + 1] += this.fogData[i].vy; // Y tengely
                fogPos[idx + 2] += this.fogData[i].vz; // Z tengely

                // Ha a füstpamacs kimegy a 40 méteres dobozból, visszadobjuk a túloldalra!
                // Így sosem fogy el körülötted a gőz, mindig visszakerül
                if (fogPos[idx] > camX + limit) fogPos[idx] -= limit * 2;
                if (fogPos[idx] < camX - limit) fogPos[idx] += limit * 2;

                if (fogPos[idx + 2] > camZ + limit) fogPos[idx + 2] -= limit * 2;
                if (fogPos[idx + 2] < camZ - limit) fogPos[idx + 2] += limit * 2;

                // Felfelé és lefelé mozgás korlátozása (Hogy a föld felett kavarogjon)
                if (fogPos[idx + 1] > 5.0) fogPos[idx + 1] = 0;
                if (fogPos[idx + 1] < 0) fogPos[idx + 1] = 5.0;
            }
            this.fogSystem.geometry.attributes.position.needsUpdate = true;
        }

        // Vér részecskék
        if (this.bloodParticles) {
            for (let p of this.bloodParticles) {
                if (p.life > 0) {
                    p.life -= delta * 1.5;
                    
                    let isSteam = (p.mesh.material.blending === THREE.AdditiveBlending);
                    
                    if (isSteam) {
                        p.mesh.scale.addScalar(delta * 0.4);
                    } else {
                        p.vy -= delta * 0.8; 
                    }
                    
                    p.mesh.position.x += p.vx;
                    p.mesh.position.y += p.vy;
                    p.mesh.position.z += p.vz;
                    
                    // Padlóhoz érés (Csak a vérnél és a pornál)
                    if (p.mesh.position.y <= 0.05 && !isSteam) {
                        p.mesh.position.y = 0.05 + (Math.random() * 0.02); 
                        p.vx = 0; p.vy = 0; p.vz = 0; 
                        // Amikor földet ér a csepp, vizuálisan "elkenődik", laposabb lesz
                        p.mesh.scale.y = p.mesh.scale.x * 0.3; 
                    }

                    if (p.life > 0) {
                        if (isSteam) {
                            p.mesh.material.opacity = Math.max(0, p.life * 0.6);
                        } else {
                            p.mesh.material.opacity = Math.max(0, p.life);
                        }
                    }

                    if (p.life <= 0) { 
                        p.mesh.visible = false; 
                        p.mesh.material.blending = THREE.NormalBlending;
                        p.mesh.scale.y = p.mesh.scale.x; 
                    }
                }
            }
        }

        // Vér sugár (Arterial Spray) rendszer
        if (this.activeSpurts) {
            for (let i = this.activeSpurts.length - 1; i >= 0; i--) {
                let spurt = this.activeSpurts[i];
                spurt.timer -= delta;
                spurt.dropTimer -= delta;

                // Folyadéksugár létrehozása (Sűrűbben indítjuk, hogy összefolyjon a vonal!)
                while (spurt.dropTimer <= 0) {
                    spurt.dropTimer += 0.005; // 3x sűrűbb sugár!
                    
                    let p = this.bloodParticles.find(part => part.life <= 0);
                    if (p) {
                        p.life = 0.6; // Kicsit gyorsabban halványul el a levegőben
                        p.mesh.material.color.setHex(spurt.color);
                        p.mesh.material.opacity = 1.0;
                        p.mesh.position.copy(spurt.pos);
                        p.mesh.scale.setScalar(0.18); 
                        
                        // Szinte nulla szórás, tökéletesen követik a kiszámolt irányt!
                        p.vx = spurt.dx + (Math.random() - 0.5) * 0.03; 
                        p.vy = spurt.dy + (Math.random() - 0.5) * 0.03;       
                        p.vz = spurt.dz + (Math.random() - 0.5) * 0.03; 
                        p.mesh.visible = true;
                    }
                }

                // Ha letelt a vérzés ideje, lezárjuk a sugarat
                if (spurt.timer <= 0) {
                    this.activeSpurts.splice(i, 1);
                }
            }
        }

        // Sonic boom / Rezonátor lökéshullám tágulása
        for (let i = this.sonicBooms.length - 1; i >= 0; i--) {
            let boom = this.sonicBooms[i];
            if (boom.isGroundWave) {
                boom.radius += delta * 15.0;
                boom.mesh.scale.setScalar(boom.radius);
                boom.life = 1.0 - (boom.radius / (boom.maxRadius || 5.0));
                boom.mesh.material.opacity = Math.max(0, boom.life * 0.8);

                if (boom.radius >= (boom.maxRadius || 5.0) || boom.life <= 0) {
                    if (this.scene) this.scene.remove(boom.mesh);
                    if (boom.mesh.geometry) boom.mesh.geometry.dispose();
                    if (boom.mesh.material) boom.mesh.material.dispose();
                    this.sonicBooms.splice(i, 1);
                }
            } else {
                let currentScale = (typeof boom.scale === 'number') ? boom.scale : 0.1;
                currentScale += delta * 20.0;
                boom.scale = currentScale;
                boom.life -= delta * 4.0;
                boom.mesh.scale.setScalar(currentScale);
                boom.mesh.material.opacity = Math.max(0, boom.life);

                if (boom.life <= 0) {
                    if (this.scene) this.scene.remove(boom.mesh);
                    if (boom.mesh.geometry) boom.mesh.geometry.dispose();
                    if (boom.mesh.material) boom.mesh.material.dispose();
                    this.sonicBooms.splice(i, 1);
                }
            }
        }

        // Boss Spóra-Üvöltés animálása (shockwaves)
        if (this.shockwaves) {
            for (let i = this.shockwaves.length - 1; i >= 0; i--) {
                let sw = this.shockwaves[i];
                sw.life -= delta * 1.2;

                let currentScale = sw.mesh.scale.x + (sw.growth * delta);
                sw.mesh.scale.set(currentScale, currentScale, 1);

                sw.mesh.position.add(sw.direction.clone().multiplyScalar(sw.speed * delta));

                sw.mesh.material.rotation += sw.rotSpeed * delta;
                sw.mesh.material.opacity = Math.max(0, sw.life * 0.8);

                if (sw.life <= 0) {
                    if (this.scene) this.scene.remove(sw.mesh);
                    if (sw.mesh.material) sw.mesh.material.dispose();
                    this.shockwaves.splice(i, 1);
                }
            }
        }

        // Zsilipkapukból kiömlő sűrű zöld gőz animálása (pontosan a Nexus Node támadásának stílusában)
        if (this.corridorSmokePuffs) {
            for (let i = this.corridorSmokePuffs.length - 1; i >= 0; i--) {
                const sw = this.corridorSmokePuffs[i];
                sw.life -= delta * 1.1;

                const currentScale = sw.mesh.scale.x + (sw.growth * delta);
                sw.mesh.scale.set(currentScale, currentScale, 1);

                sw.speed = Math.max(0.6, sw.speed - delta * 3.5);
                sw.mesh.position.add(sw.direction.clone().multiplyScalar(sw.speed * delta));

                sw.mesh.material.rotation += sw.rotSpeed * delta;
                sw.mesh.material.opacity = Math.max(0, sw.life * 0.85);

                if (sw.life <= 0) {
                    if (this.scene) this.scene.remove(sw.mesh);
                    if (sw.mesh.material) sw.mesh.material.dispose();
                    this.corridorSmokePuffs.splice(i, 1);
                }
            }
        }

        const screenBlood = document.getElementById('screen-blood');
        if (screenBlood && parseFloat(screenBlood.style.opacity) > 0) {
            let op = Math.max(0, parseFloat(screenBlood.style.opacity) - delta * 0.8);
            screenBlood.style.opacity = op.toString();
        }
    }

    clearScreenBlood() {
        const screenBlood = document.getElementById('screen-blood');
        if (screenBlood) screenBlood.style.opacity = '0';
        const damageFlash = document.getElementById('damage-flash');
        if (damageFlash) damageFlash.style.opacity = '0';
        const healFlash = document.getElementById('heal-flash');
        if (healFlash) healFlash.style.opacity = '0';
        const splatters = document.querySelectorAll('.visor-blood-splatter');
        for (let i = 0; i < splatters.length; i++) {
            splatters[i].remove();
        }
        if (this.bloodParticles) {
            for (let p of this.bloodParticles) {
                p.life = 0;
                if (p.mesh) p.mesh.visible = false;
            }
        }
    }

    updateMenu(delta) {
        if (this.radSystem) {
            this.radSystem.rotation.y += delta * 0.05;
        }
        this.clearScreenBlood();
    }

    reset() {
        if (this.shockwaves) {
            for (let sw of this.shockwaves) {
                if (this.scene && sw.mesh) this.scene.remove(sw.mesh);
                if (sw.mesh && sw.mesh.material) sw.mesh.material.dispose();
            }
            this.shockwaves = [];
        }
        if (this.corridorSmokePuffs) {
            for (let p of this.corridorSmokePuffs) {
                if (this.scene && p.mesh) this.scene.remove(p.mesh);
                if (p.mesh && p.mesh.material) p.mesh.material.dispose();
            }
            this.corridorSmokePuffs = [];
        }
        if (this.sonicBooms) {
            for (let b of this.sonicBooms) {
                if (this.scene && b.mesh) this.scene.remove(b.mesh);
            }
            this.sonicBooms = [];
        }
        if (this.activeSpurts) {
            this.activeSpurts = [];
        }
        if (this.bloodParticles) {
            for (let p of this.bloodParticles) {
                p.life = 0;
                p.mesh.visible = false;
            }
        }
        const screenBlood = document.getElementById('screen-blood');
        if (screenBlood) screenBlood.style.opacity = '0';
        this.isFrozen = false;
        this.updateFogOpacity(0);
    }
}

export default new VFXManager();
