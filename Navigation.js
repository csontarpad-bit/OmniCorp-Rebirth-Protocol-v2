import * as THREE from 'three';
import EventBus from './EventBus.js';

export class Navigation {
    constructor() {
        this.waypoints = [];
        this.debugMode = false;
        this.debugMeshes = [];
        this.levelManager = null;
    }

    init(levelManager) {
        this.levelManager = levelManager;
        this.waypoints = [];
        
        // --- EXTRA SŰRŰ HÁLÓ (Labirintus mód) ---
        // -20-tól +20-ig, minden 5 méteren lesz egy pont (9x9 = 81 pont)
        for (let x = -20; x <= 20; x += 5) {
            for (let z = -20; z <= 20; z += 5) {
                // Az oszlopokat kivonjuk: a 10 és -10 koordináták metszéspontjait
                if ((Math.abs(x) === 10 && Math.abs(z) === 10) || 
                    (Math.abs(x) === 10 && Math.abs(z) === 5) || 
                    (Math.abs(x) === 5 && Math.abs(z) === 10)) {
                    // Kiterjesztettük a tiltott zónát az oszlopok körül, hogy ne lógjon be a falba a pont
                    continue; 
                }
                this.waypoints.push(new THREE.Vector3(x, 0, z));
            }
        }

        // 12 Folyosó bejárat útvonalpontjai (zökkenőmentes beáramlás a folyosókból)
        const doorOffsets = [-14, 0, 14];
        doorOffsets.forEach(pos => {
            this.waypoints.push(new THREE.Vector3(pos, 0, -23.5));
            this.waypoints.push(new THREE.Vector3(pos, 0, -28.5));
            this.waypoints.push(new THREE.Vector3(pos, 0, 23.5));
            this.waypoints.push(new THREE.Vector3(pos, 0, 28.5));
            this.waypoints.push(new THREE.Vector3(-23.5, 0, pos));
            this.waypoints.push(new THREE.Vector3(-28.5, 0, pos));
            this.waypoints.push(new THREE.Vector3(23.5, 0, pos));
            this.waypoints.push(new THREE.Vector3(28.5, 0, pos));
        });
        
        console.log(`[KRONOS] AI Navigáció: ${this.waypoints.length} csomópont kalibrálva.`);
        setTimeout(() => this.drawDebug(), 1000); 
    }

    drawDebug() {
        if (!this.debugMode || !this.levelManager || !this.levelManager.scene) return;
        
        const geo = new THREE.SphereGeometry(0.3, 8, 8); // Kisebb gömbök, hogy ne takarjanak ki mindent
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.3 });
        
        for (let wp of this.waypoints) {
            let mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(wp);
            mesh.position.y = 1.0; 
            this.levelManager.scene.add(mesh);
            this.debugMeshes.push(mesh);
        }
    }

    hasLineOfSight(startPos, endPos, padding = 0.8) {
        let dir = new THREE.Vector3().subVectors(endPos, startPos);
        let dist = dir.length();
        if (dist <= 1.0) return true; // Közvetlen közelben nincs fal köztük
        dir.normalize();
        
        // Csak a két pont KÖZÖTTI szakaszt vizsgáljuk:
        // Megállítjuk a vizsgálatot padding távolsággal a végpont (játékos) előtt,
        // így ha a játékos a falnak dőlve áll, a háta mögötti fal NEM teszi érvénytelenné a látóvonalat!
        let maxDist = Math.max(0.5, dist - padding);
        let steps = Math.floor(maxDist / 0.5); 
        for (let i = 1; i <= steps; i++) {
            let checkX = startPos.x + dir.x * (i * 0.5);
            let checkZ = startPos.z + dir.z * (i * 0.5);
            if (this.levelManager && this.levelManager.checkWallCollision(checkX, checkZ, padding)) {
                return false; 
            }
        }
        return true; 
    }

    getBestDirection(enemy, playerPos) {
        let dir = new THREE.Vector3();
        let enemyPos = enemy.mesh.position;
        let distToPlayer = enemyPos.distanceTo(playerPos);

        // FÁZIS 1: Ha 3.5 méteren belül van (harci közelség), vagy tisztán látja a játékost:
        // közvetlenül a játékos felé menjen, NE keressen távoli waypointokat a szoba közepén!
        if (distToPlayer <= 3.5 || this.hasLineOfSight(enemyPos, playerPos, 0.4)) {
            enemy.currentWaypoint = null;
            let finalDir = dir.subVectors(playerPos, enemyPos);
            finalDir.y = 0;
            return finalDir.normalize();
        }

        // FÁZIS 2: Ha már van kiválasztott célpontja a memóriájában
        if (enemy.currentWaypoint) {
            let distToWP = enemyPos.distanceTo(enemy.currentWaypoint);
            
            // Ha kb. 2 méterre van, "odaértnek" tekintjük, elengedi
            if (distToWP < 2.0 || !this.hasLineOfSight(enemyPos, enemy.currentWaypoint, 0.2)) {
                enemy.currentWaypoint = null;
            } else {
                let finalDir = dir.subVectors(enemy.currentWaypoint, enemyPos);
                finalDir.y = 0;
                return finalDir.normalize();
            }
        }

        // FÁZIS 3: Célpont keresése (OPTIMALIZÁLVA!)
        let bestDist = Infinity;
        let bestTarget = null;

        for (let wp of this.waypoints) {
            // OPTIMALIZÁCIÓ 1: Távolság szűrés (Spatial Hashing alap)
            let distFromEnemy = wp.distanceTo(enemyPos);
            if (distFromEnemy > 15.0 || distFromEnemy < 1.5) continue; 

            // Látja-e a zombi az adott (közeli) pontot tisztán?
            if (this.hasLineOfSight(enemyPos, wp, 0.2)) { 
                let distToPlayer = wp.distanceTo(playerPos);
                
                // Még mindig közelebb kell vinnie a játékoshoz
                if (this.hasLineOfSight(wp, playerPos, 0.2)) {
                    distToPlayer -= 5.0; // Bónusz pont, ha a sarokból már látni a játékost
                }
                
                if (distToPlayer < bestDist) {
                    bestDist = distToPlayer;
                    bestTarget = wp;
                }
            }
        }

        if (bestTarget) {
            enemy.currentWaypoint = bestTarget;
            let finalDir = dir.subVectors(bestTarget, enemyPos);
            finalDir.y = 0;
            return finalDir.normalize();
        }

        let finalDir = dir.subVectors(playerPos, enemyPos);
        finalDir.y = 0;
        return finalDir.normalize();
    }
}
