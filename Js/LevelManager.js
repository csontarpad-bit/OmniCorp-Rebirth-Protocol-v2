import * as THREE from 'three';
import EventBus from './EventBus.js';

class LevelManager {
    constructor() {
        this.scene = null;
        this.gatesGroup = null;
        this.wallHitboxes = [];
        this.corridorSpawns = [];
        this.doors = [];
        this.warningLights = [];

        // Ipari lift környezeti animáció állapotai
        this.isElevatorMoving = false;
        this.elevatorSpeed = 0;
        this.targetElevatorSpeed = 0;
        this.wallTex = null;
        this.lightBlinkTimer = 0;
        this.elevatorTransitTimer = 0;

        // Változó színű haladó aknalámpák (piros -> sárga -> zöld)
        this.shaftLightTiers = [];

        // Zsilipkapuk sűrű zöld füst áramlási állapota
        this.isDoorsOpen = false;
        this.smokeTickTimer = 0.0;
        this.corridorFogMat = null;

        // Esemény feliratkozások szigorúan nyílfüggvényekkel (Refactor Rule #4)
        EventBus.on('START_ELEVATOR_MOVE', () => this.startElevator());
        EventBus.on('STOP_ELEVATOR_MOVE', () => this.stopElevator());
        EventBus.on('OPEN_AIRLOCK_GATES', (data) => this.openDoors(data ? data.duration : 7.5));
        EventBus.on('CLOSE_AIRLOCK_GATES', (data) => this.closeDoors(data ? data.duration : 1.5));
    }

    init(scene, assetManager) {
        this.scene = scene;
        this.gatesGroup = new THREE.Group();
        this.gatesGroup.visible = false;
        this.scene.add(this.gatesGroup);
        this.wallHitboxes = [];
        this.corridorSpawns = [];
        this.doors = [];
        this.warningLights = [];
        this.shaftLightTiers = [];
        this.transitShutters = [];
        this.isDoorsOpen = false;
        this.smokeTickTimer = 0.0;
        this.isElevatorMoving = false;
        this.elevatorSpeed = 0;
        this.targetElevatorSpeed = 0;
        this.lightBlinkTimer = 0;
        this.elevatorTransitTimer = 0;

        // Textúrák bekérése az AssetManager-től
        const floorTex = assetManager.loadTexture('floor', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/35c845f70c8ae3a8577562a70a9abac70baadcf1/Pictures/LVL3%20Floor.png', true);
        floorTex.wrapS = THREE.RepeatWrapping;
        floorTex.wrapT = THREE.RepeatWrapping;
        floorTex.repeat.set(10, 10);

        this.wallTex = assetManager.loadTexture('wall', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff430b224fb8cd358b83fade1e06710d708d094/1783431502863.png', true);
        this.wallTex.wrapS = THREE.RepeatWrapping;
        this.wallTex.wrapT = THREE.RepeatWrapping;
        // Az UV-k közvetlenül a geometriákban vannak leképezve a folytonos textúra megőrzése érdekében
        this.wallTex.repeat.set(1, 1);

        // Anyagok
        const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0.1 });
        const shaftWallMat = new THREE.MeshStandardMaterial({ map: this.wallTex, roughness: 0.8, metalness: 0.2 });
        const portalFrameMat = new THREE.MeshStandardMaterial({ color: 0x272d36, roughness: 0.4, metalness: 0.8 });
        const blastDoorMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.35, metalness: 0.85 });
        const doorRibMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.4, metalness: 0.9 });
        const corridorWallMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9, metalness: 0.1 });

        // Zsilip alagút belső sűrű toxikus gőz textúrája és anyagai (lágy, gömbölyű hatás nélküli füstgőz)
        const smokeCanvas = document.createElement('canvas');
        smokeCanvas.width = 256;
        smokeCanvas.height = 256;
        const sCtx = smokeCanvas.getContext('2d');
        const sGrad = sCtx.createRadialGradient(128, 128, 15, 128, 128, 126);
        sGrad.addColorStop(0, 'rgba(40, 245, 80, 0.98)');
        sGrad.addColorStop(0.3, 'rgba(28, 195, 60, 0.90)');
        sGrad.addColorStop(0.6, 'rgba(18, 140, 40, 0.65)');
        sGrad.addColorStop(0.85, 'rgba(8, 70, 20, 0.25)');
        sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sCtx.fillStyle = sGrad;
        sCtx.fillRect(0, 0, 256, 256);

        const corridorSmokeTex = new THREE.CanvasTexture(smokeCanvas);
        corridorSmokeTex.wrapS = THREE.RepeatWrapping;
        corridorSmokeTex.wrapT = THREE.RepeatWrapping;

        this.corridorFogMat = new THREE.MeshBasicMaterial({
            map: corridorSmokeTex,
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const chamberFogSpriteMat = new THREE.SpriteMaterial({
            map: corridorSmokeTex,
            color: 0x22ff55,
            transparent: true,
            opacity: 0.82,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        // --- PÁLYAMÉRETEK (-100. EMELETI MONUMENTÁLIS AKNA) ---
        const arenaSize = 50.0;
        const shaftWallHeight = 60.0; // 60 méter magas gigantikus aknanyílás
        const shaftBottom = -60.0;    // Alsó aknamező az emelkedő/süllyedő környezeti tranzithoz
        const shaftTop = 60.0;        // Felső aknamező
        const doorWidth = 6.4;        // Tágas kapunyílás (Nexus Boss és Tank akadálymentes közlekedéséhez)
        const doorHeight = 5.2;       // Szabad nyílásmagasság
        const corridorDepth = 8.5;    // Zsilip alagutak mélysége
        const wallThick = 2.0;        // Fal vastagsága
        const cThick = 1.0;           // Alagút falvastagság

        // 1. LIFT PADLÓ PLATFORM (50x50m)
        const mainFloor = new THREE.Mesh(new THREE.PlaneGeometry(arenaSize, arenaSize), floorMat);
        mainFloor.rotation.x = -Math.PI / 2;
        this.scene.add(mainFloor);

        // Ipari acél szegély a lift peremén
        const borderGeoX = new THREE.BoxGeometry(arenaSize, 0.15, 0.4);
        const borderGeoZ = new THREE.BoxGeometry(0.4, 0.15, arenaSize);
        const bMat = new THREE.MeshStandardMaterial({ color: 0x333942, metalness: 0.8, roughness: 0.3 });

        const bN = new THREE.Mesh(borderGeoX, bMat); bN.position.set(0, 0.075, -arenaSize / 2); this.scene.add(bN);
        const bS = new THREE.Mesh(borderGeoX, bMat); bS.position.set(0, 0.075, arenaSize / 2); this.scene.add(bS);
        const bW = new THREE.Mesh(borderGeoZ, bMat); bW.position.set(-arenaSize / 2, 0.075, 0); this.scene.add(bW);
        const bE = new THREE.Mesh(borderGeoZ, bMat); bE.position.set(arenaSize / 2, 0.075, 0); this.scene.add(bE);

        // --- 2. EGYSÉGESÍTETT, EGYBEFÜGGŐ FALGEOMETRIA (EXTRUDEGEOMETRY 3 KAPUNYÍLÁSSAL) ---
        // A fal nincs darabokra vagdosva: egyetlen, összefüggő 52 méteres tömör falfelület 3 zsilipnyílással
        // -60m-től +60m-ig ér, így a liftezés közbeni fel-le mozgáskor a tömör aknafal folytonos marad
        const wallShape = new THREE.Shape();
        wallShape.moveTo(-26.0, shaftBottom);
        wallShape.lineTo(26.0, shaftBottom);
        wallShape.lineTo(26.0, shaftTop);
        wallShape.lineTo(-26.0, shaftTop);
        wallShape.closePath();

        const doorCenters = [-14.0, 0.0, 14.0];
        doorCenters.forEach(xc => {
            const hole = new THREE.Path();
            hole.moveTo(xc - doorWidth / 2, 0.0);
            hole.lineTo(xc + doorWidth / 2, 0.0);
            hole.lineTo(xc + doorWidth / 2, doorHeight);
            hole.lineTo(xc - doorWidth / 2, doorHeight);
            hole.closePath();
            wallShape.holes.push(hole);
        });

        const wallGeo = new THREE.ExtrudeGeometry(wallShape, { depth: wallThick, bevelEnabled: false });
        const pos = wallGeo.attributes.position;
        const uvs = wallGeo.attributes.uv;

        // Folytonos, töretlen UV-leképezés a teljes 50 méteres falfelületen:
        // 4 horizontális ismétlődés a teljes 50m szélességen (12.5m / ismétlés), és 1 ismétlés 4 méterenként függőlegesen
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);

            if (Math.abs(z) < 0.02 || Math.abs(z - wallThick) < 0.02) {
                uvs.setXY(i, (x + 25.0) / 12.5, (y - shaftBottom) / 4.0);
            } else {
                uvs.setXY(i, z / wallThick, (y - shaftBottom) / 4.0);
            }
        }
        uvs.needsUpdate = true;

        // A 4 külső fal létrehozása közvetlenül a színhelyhez rendelve - SOHA nem tűnik el a fal!
        // Északi fal (Z = -25)
        const wallN = new THREE.Mesh(wallGeo, shaftWallMat);
        wallN.position.set(0, 0, -25 - wallThick);
        this.scene.add(wallN);

        // Déli fal (Z = 25)
        const wallS = new THREE.Mesh(wallGeo, shaftWallMat);
        wallS.position.set(0, 0, 25 + wallThick);
        wallS.rotation.y = Math.PI;
        this.scene.add(wallS);

        // Nyugati fal (X = -25)
        const wallW = new THREE.Mesh(wallGeo, shaftWallMat);
        wallW.position.set(-25 - wallThick, 0, 0);
        wallW.rotation.y = Math.PI / 2;
        this.scene.add(wallW);

        // Keleti fal (X = 25)
        const wallE = new THREE.Mesh(wallGeo, shaftWallMat);
        wallE.position.set(25 + wallThick, 0, 0);
        wallE.rotation.y = -Math.PI / 2;
        this.scene.add(wallE);

        // --- 2.B FLUSH ZSILIPFEDŐ PANELEK (A KAPUK ELTAKART LIFT-ÁLLAPOTA) ---
        // Pontosan a fal belső síkjában (Z = +-24.98, X = +-24.98), tökéletesen egy síkban a fallal!
        // A lift leereszkedése alatt ezek a panelek takarják el a kapukat (tömör aknafal látszatát keltve).
        // Amikor a lift megérkezik a szintre, a panelek felcsúsznak a mennyezetbe és eltűnnek, felfedve a kapukat és a folyosókat!
        const createShutterGeo = (uCenter) => {
            const geo = new THREE.PlaneGeometry(doorWidth + 0.05, doorHeight + 0.05);
            const pAttr = geo.attributes.position;
            const uvAttr = geo.attributes.uv;
            for (let i = 0; i < pAttr.count; i++) {
                const lx = pAttr.getX(i);
                const ly = pAttr.getY(i);
                const worldY = (doorHeight / 2) + ly;
                const u = (uCenter + lx + 25.0) / 12.5;
                const v = (worldY - shaftBottom) / 4.0;
                uvAttr.setXY(i, u, v);
            }
            uvAttr.needsUpdate = true;
            return geo;
        };

        const addShutter = (mesh, uCenter, initialProgress = 0.0) => {
            mesh.position.y = doorHeight / 2;
            this.scene.add(mesh);
            this.transitShutters.push({
                mesh: mesh,
                uCenter: uCenter,
                closedY: doorHeight / 2,
                openY: (doorHeight / 2) + doorHeight + 0.5,
                progress: initialProgress,
                targetProgress: initialProgress
            });
        };

        // Északi fal kapunyílás fedőpanelek (Z = -24.98)
        doorCenters.forEach(xc => {
            const sMesh = new THREE.Mesh(createShutterGeo(xc), shaftWallMat);
            sMesh.position.set(xc, doorHeight / 2, -24.98);
            addShutter(sMesh, xc);
        });

        // Déli fal kapunyílás fedőpanelek (Z = 24.98)
        doorCenters.forEach(xc => {
            const sMesh = new THREE.Mesh(createShutterGeo(-xc), shaftWallMat);
            sMesh.position.set(xc, doorHeight / 2, 24.98);
            sMesh.rotation.y = Math.PI;
            addShutter(sMesh, -xc);
        });

        // Nyugati fal kapunyílás fedőpanelek (X = -24.98)
        doorCenters.forEach(zc => {
            const sMesh = new THREE.Mesh(createShutterGeo(-zc), shaftWallMat);
            sMesh.position.set(-24.98, doorHeight / 2, zc);
            sMesh.rotation.y = Math.PI / 2;
            addShutter(sMesh, -zc);
        });

        // Keleti fal kapunyílás fedőpanelek (X = 24.98)
        doorCenters.forEach(zc => {
            const sMesh = new THREE.Mesh(createShutterGeo(zc), shaftWallMat);
            sMesh.position.set(24.98, doorHeight / 2, zc);
            sMesh.rotation.y = -Math.PI / 2;
            addShutter(sMesh, zc);
        });

        // Solid fal ütközésdobozok (Box3) hozzáadása a 4 szakaszhoz falanként (ajtónyílások szabadon hagyásával)
        const addWallHitbox = (minX, minY, minZ, maxX, maxY, maxZ) => {
            this.wallHitboxes.push(new THREE.Box3(
                new THREE.Vector3(minX, minY, minZ),
                new THREE.Vector3(maxX, maxY, maxZ)
            ));
        };

        // Északi és Déli falak tömör szakaszai
        const xIntervals = [
            [-26.0, -17.2],
            [-10.8, -3.2],
            [3.2, 10.8],
            [17.2, 26.0]
        ];

        xIntervals.forEach(intv => {
            // Északi fal tömör mezői
            addWallHitbox(intv[0], 0, -27.0, intv[1], doorHeight, -25.0);
            // Déli fal tömör mezői
            addWallHitbox(intv[0], 0, 25.0, intv[1], doorHeight, 27.0);
            // Nyugati fal tömör mezői (Z mentén)
            addWallHitbox(-27.0, 0, intv[0], -25.0, doorHeight, intv[1]);
            // Keleti fal tömör mezői (Z mentén)
            addWallHitbox(25.0, 0, intv[0], 27.0, doorHeight, intv[1]);
        });

        // Áthidalók a kapuk felett (Y = 5.2 - 60m)
        addWallHitbox(-26.0, doorHeight, -27.0, 26.0, shaftWallHeight, -25.0);
        addWallHitbox(-26.0, doorHeight, 25.0, 26.0, shaftWallHeight, 27.0);
        addWallHitbox(-27.0, doorHeight, -26.0, -25.0, shaftWallHeight, 26.0);
        addWallHitbox(25.0, doorHeight, -26.0, 27.0, shaftWallHeight, 26.0);

        // --- 3. LIFT FÜLKE 4 BELSŐ TARTÓOSZLOPA (360°-BAN KÖRBEFUTÓ FALI TEXTÚRA) ---
        const pillarHeight = 120.0;
        const pillarGeo = new THREE.BoxGeometry(4.0, pillarHeight, 4.0);
        const pUvs = pillarGeo.attributes.uv;
        const vReps = pillarHeight / 4.0; // 30 függőleges ismétlődés a 120 méteres magasságra

        // Szigorúan körbefutó 360°-os textúra: Elöl [0,1], Jobbra [1,2], Hátul [2,3], Balra [3,4]
        // Face 4: +Z (Front)
        pUvs.setXY(16, 0.0, vReps); pUvs.setXY(18, 0.0, 0.0); pUvs.setXY(17, 1.0, vReps); pUvs.setXY(19, 1.0, 0.0);
        // Face 0: +X (Right)
        pUvs.setXY(0, 1.0, vReps);  pUvs.setXY(2, 1.0, 0.0);  pUvs.setXY(1, 2.0, vReps);  pUvs.setXY(3, 2.0, 0.0);
        // Face 5: -Z (Back)
        pUvs.setXY(20, 2.0, vReps); pUvs.setXY(22, 2.0, 0.0); pUvs.setXY(21, 3.0, vReps); pUvs.setXY(23, 3.0, 0.0);
        // Face 1: -X (Left)
        pUvs.setXY(4, 3.0, vReps);  pUvs.setXY(6, 3.0, 0.0);  pUvs.setXY(5, 4.0, vReps);  pUvs.setXY(7, 4.0, 0.0);
        pUvs.needsUpdate = true;

        const pillars = [{ x: -10, z: -10 }, { x: 10, z: -10 }, { x: -10, z: 10 }, { x: 10, z: 10 }];
        pillars.forEach(p => {
            const pMesh = new THREE.Mesh(pillarGeo, shaftWallMat);
            pMesh.position.set(p.x, 0, p.z);
            this.scene.add(pMesh);
            this.wallHitboxes.push(new THREE.Box3().setFromObject(pMesh));
        });

        // --- 4. ZSILIPKAPU GYÁRTÓ SEGÉDFÜGGVÉNY (VIBRÁLÁS ÉS FEDÉSMENTES KIALAKÍTÁS) ---
        // A kapulap tisztán a falnyílás belsejében mozog, nincs közös lapja a falakkal, így zéró Z-fighting!
        const createAirlock = (doorCenterX, doorCenterZ, isXAxis, dirSign) => {
            // A) ZSILIPKERET ÉS ÁTHIDALÓ
            const frameGroup = new THREE.Group();
            
            // Felső áthidaló gerenda a kapu felett (Y = 5.25)
            const lintelGeo = isXAxis 
                ? new THREE.BoxGeometry(doorWidth + 0.1, 0.3, wallThick + 0.05)
                : new THREE.BoxGeometry(wallThick + 0.05, 0.3, doorWidth + 0.1);
            const lintelMesh = new THREE.Mesh(lintelGeo, portalFrameMat);
            lintelMesh.position.set(doorCenterX, doorHeight + 0.15, doorCenterZ);
            this.gatesGroup.add(lintelMesh);

            // B) CSÚSZÓ PÁNCÉLAJTÓ LAP
            const doorGroup = new THREE.Group();
            const dWidth = doorWidth - 0.1; // 6.3m széles, kényelmesen elfér a 6.4m-es nyílásban
            const dHeight = doorHeight + 0.1;
            const dThick = 0.35;

            const slabGeo = isXAxis
                ? new THREE.BoxGeometry(dWidth, dHeight, dThick)
                : new THREE.BoxGeometry(dThick, dHeight, dWidth);
            const doorSlab = new THREE.Mesh(slabGeo, blastDoorMat);
            doorGroup.add(doorSlab);

            // Megerősítő bordák a páncélkapun
            for (let r = 0; r < 4; r++) {
                const ribY = -dHeight / 2 + 1.0 + r * 1.1;
                const ribGeo = isXAxis
                    ? new THREE.BoxGeometry(dWidth - 0.2, 0.25, dThick + 0.1)
                    : new THREE.BoxGeometry(dThick + 0.1, 0.25, dWidth - 0.2);
                const ribMesh = new THREE.Mesh(ribGeo, doorRibMat);
                ribMesh.position.y = ribY;
                doorGroup.add(ribMesh);
            }

            const closedY = dHeight / 2;
            const openY = closedY + doorHeight + 0.3; // Teljesen felhúzódik a mennyezeti aknába
            doorGroup.position.set(doorCenterX, closedY, doorCenterZ);
            this.gatesGroup.add(doorGroup);

            // C) ZSILIP ÁLLAPOTJELZŐ NEON FÉNY AZ ÁTHIDALÓN
            const lightGeo = new THREE.BoxGeometry(isXAxis ? 1.4 : 0.25, 0.2, isXAxis ? 0.25 : 1.4);
            const lightMat = new THREE.MeshBasicMaterial({ color: 0xff1500 });
            const lightMesh = new THREE.Mesh(lightGeo, lightMat);
            const inwardOffset = -dirSign * 1.05;

            if (isXAxis) {
                lightMesh.position.set(doorCenterX, doorHeight + 0.45, doorCenterZ + inwardOffset);
            } else {
                lightMesh.position.set(doorCenterX + inwardOffset, doorHeight + 0.45, doorCenterZ);
            }
            this.gatesGroup.add(lightMesh);

            const pLight = new THREE.PointLight(0xff1500, 0.9, 8);
            pLight.position.copy(lightMesh.position);
            this.gatesGroup.add(pLight);

            // D) ZSILIP ALAGÚT A FAL MÖGÖTT
            const corridorMidZ = isXAxis ? doorCenterZ + dirSign * (wallThick / 2 + corridorDepth / 2) : doorCenterZ;
            const corridorMidX = isXAxis ? doorCenterX : doorCenterX + dirSign * (wallThick / 2 + corridorDepth / 2);

            // Alagút padló
            const cFloorGeo = isXAxis
                ? new THREE.PlaneGeometry(doorWidth, corridorDepth)
                : new THREE.PlaneGeometry(corridorDepth, doorWidth);
            const cFloor = new THREE.Mesh(cFloorGeo, floorMat);
            cFloor.rotation.x = -Math.PI / 2;
            cFloor.position.set(corridorMidX, 0.01, corridorMidZ);
            this.gatesGroup.add(cFloor);

            // Alagút oldalfalai és hátsó zárófala
            if (isXAxis) {
                // Bal oldalfal
                const wallL = new THREE.Mesh(new THREE.BoxGeometry(cThick, 6.0, corridorDepth), corridorWallMat);
                wallL.position.set(doorCenterX - doorWidth / 2 - cThick / 2, 3.0, corridorMidZ);
                this.gatesGroup.add(wallL);
                addWallHitbox(doorCenterX - doorWidth / 2 - cThick, 0, corridorMidZ - corridorDepth / 2, doorCenterX - doorWidth / 2, 6.0, corridorMidZ + corridorDepth / 2);

                // Jobb oldalfal
                const wallR = new THREE.Mesh(new THREE.BoxGeometry(cThick, 6.0, corridorDepth), corridorWallMat);
                wallR.position.set(doorCenterX + doorWidth / 2 + cThick / 2, 3.0, corridorMidZ);
                this.gatesGroup.add(wallR);
                addWallHitbox(doorCenterX + doorWidth / 2, 0, corridorMidZ - corridorDepth / 2, doorCenterX + doorWidth / 2 + cThick, 6.0, corridorMidZ + corridorDepth / 2);

                // Hátsó fal
                const backZ = doorCenterZ + dirSign * (wallThick / 2 + corridorDepth + cThick / 2);
                const wallB = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + cThick * 2, 6.0, cThick), portalFrameMat);
                wallB.position.set(doorCenterX, 3.0, backZ);
                this.gatesGroup.add(wallB);
                addWallHitbox(doorCenterX - doorWidth / 2 - cThick, 0, backZ - cThick / 2, doorCenterX + doorWidth / 2 + cThick, 6.0, backZ + cThick / 2);
            } else {
                // Bal oldalfal
                const wallL = new THREE.Mesh(new THREE.BoxGeometry(corridorDepth, 6.0, cThick), corridorWallMat);
                wallL.position.set(corridorMidX, 3.0, doorCenterZ - doorWidth / 2 - cThick / 2);
                this.gatesGroup.add(wallL);
                addWallHitbox(corridorMidX - corridorDepth / 2, 0, doorCenterZ - doorWidth / 2 - cThick, corridorMidX + corridorDepth / 2, 6.0, doorCenterZ - doorWidth / 2);

                // Jobb oldalfal
                const wallR = new THREE.Mesh(new THREE.BoxGeometry(corridorDepth, 6.0, cThick), corridorWallMat);
                wallR.position.set(corridorMidX, 3.0, doorCenterZ + doorWidth / 2 + cThick / 2);
                this.gatesGroup.add(wallR);
                addWallHitbox(corridorMidX - corridorDepth / 2, 0, doorCenterZ + doorWidth / 2, corridorMidX + corridorDepth / 2, 6.0, doorCenterZ + doorWidth / 2 + cThick);

                // Hátsó fal
                const backX = doorCenterX + dirSign * (wallThick / 2 + corridorDepth + cThick / 2);
                const wallB = new THREE.Mesh(new THREE.BoxGeometry(cThick, 6.0, doorWidth + cThick * 2), portalFrameMat);
                wallB.position.set(backX, 3.0, doorCenterZ);
                this.gatesGroup.add(wallB);
                addWallHitbox(backX - cThick / 2, 0, doorCenterZ - doorWidth / 2 - cThick, backX + cThick / 2, 6.0, doorCenterZ + doorWidth / 2 + cThick);
            }

            // Sűrű zöld füstfüggönyök és térbeli füstpamacsok a zsilipkamra belsejében:
            // 3 keresztirányú átfedő függönysík a folyosó teljes szélességében és magasságában (99.99%-os fényzárás),
            // így a játékos szeme elől tökéletesen rejtve marad az ellenfelek mélyben történő hirtelen megteremtése/spawning-ja!
            const curtainDepths = [2.2, 4.4, 6.6];
            for (let cd of curtainDepths) {
                const curtainGeo = new THREE.PlaneGeometry(doorWidth - 0.1, doorHeight - 0.1);
                const curtainMesh = new THREE.Mesh(curtainGeo, this.corridorFogMat);
                
                if (isXAxis) {
                    curtainMesh.position.set(doorCenterX, (doorHeight - 0.1) / 2 + 0.1, doorCenterZ + dirSign * (wallThick / 2 + cd));
                } else {
                    curtainMesh.rotation.y = Math.PI / 2;
                    curtainMesh.position.set(doorCenterX + dirSign * (wallThick / 2 + cd), (doorHeight - 0.1) / 2 + 0.1, doorCenterZ);
                }
                this.gatesGroup.add(curtainMesh);
            }

            // Térbeli lebegő füstpamacsok a zsilipkamra belső légterében
            for (let s = 0; s < 4; s++) {
                const fogSprite = new THREE.Sprite(chamberFogSpriteMat);
                const sDepth = 1.8 + s * 1.5;
                const sX = isXAxis ? doorCenterX + (Math.random() - 0.5) * 2.2 : doorCenterX + dirSign * (wallThick / 2 + sDepth);
                const sZ = isXAxis ? doorCenterZ + dirSign * (wallThick / 2 + sDepth) : doorCenterZ + (Math.random() - 0.5) * 2.2;
                const sY = 1.2 + (s % 3) * 1.1;
                fogSprite.position.set(sX, sY, sZ);
                const sScale = 4.8 + Math.random() * 1.6;
                fogSprite.scale.set(sScale, sScale, 1);
                this.gatesGroup.add(fogSprite);
            }

            // Alagút belső vészvilágítása: Zöld toxikus vészfény a sűrű gőz megvilágítására
            const lamp = new THREE.PointLight(0x22ff55, 1.8, 16);
            lamp.position.set(corridorMidX, 4.8, corridorMidZ);
            this.gatesGroup.add(lamp);

            // Ellenségek belépési / spawn pontja az alagút mélyén
            const spawnX = isXAxis ? doorCenterX : doorCenterX + dirSign * (wallThick / 2 + corridorDepth - 2.0);
            const spawnZ = isXAxis ? doorCenterZ + dirSign * (wallThick / 2 + corridorDepth - 2.0) : doorCenterZ;
            this.corridorSpawns.push({
                x: spawnX,
                z: spawnZ,
                dirX: isXAxis ? 0 : -dirSign,
                dirZ: isXAxis ? -dirSign : 0
            });

            const doorObj = {
                group: doorGroup,
                lightMesh: lightMesh,
                pointLight: pLight,
                closedY: closedY,
                openY: openY,
                progress: 0.0,
                targetProgress: 0.0,
                duration: 7.5,
                hitbox: new THREE.Box3().setFromObject(doorGroup),
                isXAxis: isXAxis,
                doorCenterX: doorCenterX,
                doorCenterZ: doorCenterZ,
                dirSign: dirSign
            };

            this.doors.push(doorObj);
            this.warningLights.push({ mesh: lightMesh, light: pLight });

            return doorObj;
        };

        // 12 Zsilipkapu elhelyezése a falnyílásokban (3 kapu / fal)
        // 1. Északi fal kapui (Z = -26.0)
        doorCenters.forEach(xc => createAirlock(xc, -25.0 - wallThick / 2, true, -1));
        // 2. Déli fal kapui (Z = 26.0)
        doorCenters.forEach(xc => createAirlock(xc, 25.0 + wallThick / 2, true, 1));
        // 3. Nyugati fal kapui (X = -26.0)
        doorCenters.forEach(zc => createAirlock(-25.0 - wallThick / 2, zc, false, -1));
        // 4. Keleti fal kapui (X = 26.0)
        doorCenters.forEach(zc => createAirlock(25.0 + wallThick / 2, zc, false, 1));

        // --- 5. HALADÓ AKNALÁMPÁK: SZIGORÚAN A KAPUK KÖZÖTTI MASSZÍV FALMEZŐKÖN (-7m és +7m) ---
        // A lámpák nem a kapuk felett vannak, hanem a zsilipkapuk közötti solid falszakaszokon
        const tierHeights = [-12, 0, 12, 24, 36, 48];
        const lampPositions = [
            // Északi fal kapuk közötti mezői
            { x: -7.0, z: -24.8, isX: true },
            { x: 7.0,  z: -24.8, isX: true },
            // Déli fal kapuk közötti mezői
            { x: -7.0, z: 24.8,  isX: true },
            { x: 7.0,  z: 24.8,  isX: true },
            // Nyugati fal kapuk közötti mezői
            { x: -24.8, z: -7.0, isX: false },
            { x: -24.8, z: 7.0,  isX: false },
            // Keleti fal kapuk közötti mezői
            { x: 24.8,  z: -7.0, isX: false },
            { x: 24.8,  z: 7.0,  isX: false }
        ];

        tierHeights.forEach((yPos) => {
            const tierFixtures = [];
            lampPositions.forEach(lp => {
                const group = new THREE.Group();

                const housingGeo = lp.isX
                    ? new THREE.BoxGeometry(1.6, 0.4, 0.35)
                    : new THREE.BoxGeometry(0.35, 0.4, 1.6);
                const housing = new THREE.Mesh(housingGeo, portalFrameMat);
                group.add(housing);

                const lensGeo = lp.isX
                    ? new THREE.BoxGeometry(1.3, 0.18, 0.4)
                    : new THREE.BoxGeometry(0.4, 0.18, 1.3);
                const lensMat = new THREE.MeshBasicMaterial({ color: 0xff1500 });
                const lensMesh = new THREE.Mesh(lensGeo, lensMat);
                group.add(lensMesh);

                const light = new THREE.PointLight(0xff1500, 1.5, 20, 2);
                group.add(light);

                group.position.set(lp.x, yPos, lp.z);
                this.scene.add(group);

                tierFixtures.push({
                    group: group,
                    lensMesh: lensMesh,
                    light: light
                });
            });

            this.shaftLightTiers.push({
                y: yPos,
                fixtures: tierFixtures
            });
        });

        console.log(`[KRONOS] LevelManager: Egységesített, folytonos -100. emeleti aknafalak (60m) és oszlopok kiépítve.`);
    }

    // --- LIFT KÖRNYEZETI MOZGÁS VEZÉRLÉS ---
    startElevator() {
        this.isElevatorMoving = true;
        this.targetElevatorSpeed = 0.8; // 50%-kal lassabb sebesség a felvonó mozgásához (1.6 helyett 0.8)
        this.elevatorTransitTimer = 0;
        if (this.gatesGroup) {
            this.gatesGroup.visible = false;
        }
        if (this.transitShutters) {
            for (let i = 0; i < this.transitShutters.length; i++) {
                const s = this.transitShutters[i];
                s.progress = 0.0;
                s.targetProgress = 0.0;
                s.mesh.position.y = s.closedY;
                s.mesh.visible = true;
            }
        }
    }

    stopElevator() {
        this.targetElevatorSpeed = 0.0;
        // Fékezés indítása. A kapuk és a fedőpanelek nyitása szigorúan a teljes megálláskor (8.0s / openDoors) történik!
    }

    getGatePouringPositions() {
        const list = [];
        for (let i = 0; i < this.doors.length; i++) {
            const d = this.doors[i];
            const outX = d.isXAxis ? 0 : -d.dirSign;
            const outZ = d.isXAxis ? -d.dirSign : 0;
            const sillX = d.isXAxis ? d.doorCenterX : (d.dirSign < 0 ? -24.8 : 24.8);
            const sillZ = d.isXAxis ? (d.dirSign < 0 ? -24.8 : 24.8) : d.doorCenterZ;
            list.push({
                sillX: sillX,
                sillZ: sillZ,
                outX: outX,
                outZ: outZ,
                isXAxis: d.isXAxis,
                progress: d.progress,
                targetProgress: d.targetProgress
            });
        }
        return list;
    }

    // --- ZSILIPKAPU NYITÁS ÉS ZÁRÁS VEZÉRLÉS ---
    openDoors(duration = 7.5) {
        this.isDoorsOpen = true;
        this.smokeTickTimer = 0.0;
        this.isElevatorMoving = false;
        this.elevatorSpeed = 0;
        this.targetElevatorSpeed = 0;
        if (this.gatesGroup) {
            this.gatesGroup.visible = true;
        }
        if (this.transitShutters) {
            for (let i = 0; i < this.transitShutters.length; i++) {
                const s = this.transitShutters[i];
                s.progress = 1.0;
                s.targetProgress = 1.0;
                s.mesh.visible = false;
            }
        }
        for (let i = 0; i < this.doors.length; i++) {
            const d = this.doors[i];
            d.targetProgress = 1.0;
            d.duration = duration;
            if (d.lightMesh && d.lightMesh.material) {
                d.lightMesh.material.color.setHex(0x00ff66);
            }
            if (d.pointLight) {
                d.pointLight.color.setHex(0x00ff66);
            }
        }
        EventBus.emit('GATES_SMOKE_BURST', { gates: this.getGatePouringPositions() });
    }

    closeDoors(duration = 1.5) {
        this.isDoorsOpen = false;
        if (this.transitShutters) {
            for (let i = 0; i < this.transitShutters.length; i++) {
                const s = this.transitShutters[i];
                s.progress = 0.0;
                s.targetProgress = 0.0;
                s.mesh.position.y = s.closedY;
                s.mesh.visible = true;
            }
        }
        for (let i = 0; i < this.doors.length; i++) {
            const d = this.doors[i];
            d.targetProgress = 0.0;
            d.duration = duration;
            if (d.lightMesh && d.lightMesh.material) {
                d.lightMesh.material.color.setHex(0xff1500);
            }
            if (d.pointLight) {
                d.pointLight.color.setHex(0xff1500);
            }
        }
    }

    update(delta) {
        // 0. Flush Zsilipfedő Panelek (Transit Shutters) és Kapuk szinkronizálása:
        // Liftezés alatt a fedőpanelek tökéletesen a fal belső síkjában fedik a nyílásokat,
        // 100%-ban szinkronban görgőzve a fallal (nincs külön elmozdulás vagy textúra-elcsúszás).
        // A lift teljes megállásakor (openDoors hívásakor) a fedőpanelek eltűnnek,
        // azonnal felfedve a zárt zsilipkapukat, melyek ekkor zöld fénnyel és gőzzel kinyílnak!
        if (this.transitShutters) {
            for (let i = 0; i < this.transitShutters.length; i++) {
                const s = this.transitShutters[i];
                s.mesh.visible = (s.progress < 0.5);
            }
        }

        if (this.gatesGroup) {
            this.gatesGroup.position.y = 0.0;
            // Liftezés alatt a teljes kapuegység (keret, állapotjelzők, ajtólapok)
            // szigorúan rejtve van, a kapuk megjelenése a megérkezéshez (openDoors) kötött.
            if (this.isElevatorMoving) {
                this.gatesGroup.visible = false;
            }
        }

        // 1. Környezeti textúra léptetés: A lift LEFELÉ halad, ezért a fal textúrája FELFELE halad
        // Szigorú matematikai szinkronizáció a felfelé suhanó aknalámpákkal!
        if (this.isElevatorMoving || Math.abs(this.elevatorSpeed) > 0.001) {
            this.elevatorSpeed = THREE.MathUtils.lerp(this.elevatorSpeed, this.targetElevatorSpeed, delta * 2.5);
            if (Math.abs(this.elevatorSpeed) < 0.01 && this.targetElevatorSpeed === 0) {
                this.elevatorSpeed = 0;
                this.isElevatorMoving = false;
            }

            if (this.wallTex && Math.abs(this.elevatorSpeed) > 0.001) {
                // Three.js UV koordinátákban az offset.y csökkentése mozgatja a textúrát FELFELE
                // Sebesség: 1 textúra ismétlődés = 4 méter magasság. lightMoveSpeed = elevatorSpeed * 12 m/s.
                // Így a textúra pontosan ugyanakkora sebességgel (12 m/s) halad felfele, mint a lámpatestek!
                const textureSpeedInRepeats = (this.elevatorSpeed * 12.0) / 4.0;
                this.wallTex.offset.y -= delta * textureSpeedInRepeats;
            }
        }

        // 2. Haladó aknalámpák felfelé suhanása és színváltozása (8 másodperces leereszkedés)
        if (this.isElevatorMoving || this.elevatorTransitTimer > 0) {
            if (this.isElevatorMoving) {
                this.elevatorTransitTimer += delta;
            }

            // Színmeghatározás a liftezés ideje alapján (User kérés):
            // 0 - 3 mp: VÖRÖS (0xff1500)
            // 3 - 6 mp: SÁRGA (0xffb700)
            // 6 - 8+ mp: ZÖLD (0x00ff66) - megérkezés
            let currentHex = 0x00ff66;
            if (this.elevatorTransitTimer < 3.0) {
                currentHex = 0xff1500;
            } else if (this.elevatorTransitTimer < 6.0) {
                currentHex = 0xffb700;
            } else {
                currentHex = 0x00ff66;
            }

            // Lámpák felfelé suhanása az aknában (lefele zuhanó lift hatás)
            const lightMoveSpeed = this.elevatorSpeed * 12.0;
            for (let t = 0; t < this.shaftLightTiers.length; t++) {
                const tier = this.shaftLightTiers[t];

                if (this.isElevatorMoving) {
                    tier.y += lightMoveSpeed * delta;
                    if (tier.y > 54.0) {
                        tier.y -= 72.0;
                    }
                }

                // Pozíció és fényforrás színének frissítése
                for (let f = 0; f < tier.fixtures.length; f++) {
                    const fix = tier.fixtures[f];
                    fix.group.position.y = tier.y;
                    if (fix.lensMesh && fix.lensMesh.material) {
                        fix.lensMesh.material.color.setHex(currentHex);
                    }
                    if (fix.light) {
                        fix.light.color.setHex(currentHex);
                    }
                }
            }

            // A zsilipkapuk kis jelzőfényei is követik a liftezés fázisait
            for (let i = 0; i < this.warningLights.length; i++) {
                const wl = this.warningLights[i];
                if (wl.mesh && wl.mesh.material) {
                    wl.mesh.material.color.setHex(currentHex);
                }
                if (wl.light) {
                    wl.light.color.setHex(currentHex);
                }
            }
        }

        // 3. 12 Zsilipkapu függőleges hidraulikus mozgása és ütközésdoboz frissítése
        for (let i = 0; i < this.doors.length; i++) {
            const d = this.doors[i];
            if (d.progress !== d.targetProgress) {
                const dir = Math.sign(d.targetProgress - d.progress);
                const step = (delta / (d.duration || 7.5));
                d.progress += dir * step;
                if ((dir > 0 && d.progress > d.targetProgress) || (dir < 0 && d.progress < d.targetProgress)) {
                    d.progress = d.targetProgress;
                }

                const tVal = d.progress;
                const ease = tVal * tVal * (3 - 2 * tVal);
                d.group.position.y = THREE.MathUtils.lerp(d.closedY, d.openY, ease);

                if (d.progress >= 0.8) {
                    d.hitbox.makeEmpty();
                } else {
                    d.hitbox.setFromObject(d.group);
                }
            }
        }

        // 4. Figyelmeztető fények finom pulzálása liftezés alatt
        if (this.isElevatorMoving) {
            this.lightBlinkTimer += delta * 4.0;
            const blink = (Math.sin(this.lightBlinkTimer) > 0);
            for (let i = 0; i < this.warningLights.length; i++) {
                const wl = this.warningLights[i];
                if (wl.light) {
                    wl.light.intensity = blink ? 1.4 : 0.4;
                }
            }
        } else {
            for (let i = 0; i < this.warningLights.length; i++) {
                const wl = this.warningLights[i];
                if (wl.light && wl.light.intensity !== 0.9) {
                    wl.light.intensity = 0.9;
                }
            }
        }

        // 5. Zsilipkapuk sűrű zöld füstjének kifele ömlése a platform padlójára
        if (this.isDoorsOpen) {
            this.smokeTickTimer = (this.smokeTickTimer || 0) + delta;
            if (this.smokeTickTimer >= 0.10) {
                this.smokeTickTimer = 0;
                EventBus.emit('GATES_SMOKE_TICK', { gates: this.getGatePouringPositions() });
            }
        }

        // Belső folyosói füstfüggöny textúra finom lebegtetése
        if (this.corridorFogMat && this.corridorFogMat.map) {
            this.corridorFogMat.map.offset.x = (this.corridorFogMat.map.offset.x + delta * 0.03) % 1.0;
        }
    }

    checkWallCollision(x, z, r) {
        // Ha a lift épp mozgásban van szintek között, a platform pereme (24.8m) abszolút biztonsági fal
        if (this.isElevatorMoving) {
            if (x - r < -24.8 || x + r > 24.8 || z - r < -24.8 || z + r > 24.8) {
                return true;
            }
        }
        const box = new THREE.Box3(new THREE.Vector3(x - r, 0, z - r), new THREE.Vector3(x + r, 2, z + r));
        for (let i = 0; i < this.wallHitboxes.length; i++) {
            if (box.intersectsBox(this.wallHitboxes[i])) return true;
        }
        for (let i = 0; i < this.doors.length; i++) {
            const d = this.doors[i];
            if (d.progress < 0.8 && !d.hitbox.isEmpty()) {
                if (box.intersectsBox(d.hitbox)) return true;
            }
        }
        return false;
    }
}

export default new LevelManager();
