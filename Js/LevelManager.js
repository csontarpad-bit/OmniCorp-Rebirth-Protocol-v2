import * as THREE from 'three';
import EventBus from './EventBus.js';
import { getCampaignFloorInfo, researchHubStations, researchNodeSection, nodeUnlockStation, sectorHallCenter, isInResearchNodeRoom } from './Campaign.js';

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
        this.floorMaterial = null;
        this.caveGroup = null;
        this.caveCollisions = [];
        this.cabinGroup = null;
        this.cabinCenter = null;
        this.cabinDoorPanels = [];
        this.cabinDoorProgress = 0;
        this.cabinDoorTarget = 0;
        this.shaftWallMaterial = null;
        this.serverRoomGroup = null;
        this.sectorDressingGroups = {};
        this.sectorPropCollisions = {};
        this.activeSectorPropCollisions = [];
        this.researchHubGroup = null;
        this.researchHubCollisions = [];
        this.researchRoomLights = [];
        this.nodeSectionGroup = null;
        this.nodeTerminalGroup = null;
        this.nodeStaticCollisions = [];
        this.nodeDoors = [];
        this.nodeLights = [];
        this.nodeSectionActive = false;
        this.finalPodRoomActive = false;
        this.caveWorldOffset = 0;
        this.isResearchHubVisible = false;
        this.isNodeSectionVisible = false;
        this.researchRoomsActive = false;
        this.lightBlinkTimer = 0;
        this.elevatorTransitTimer = 0;

        // Változó színű haladó aknalámpák (piros -> sárga -> zöld)
        this.shaftLightTiers = [];
        this.shaftLensMat = null;
        this.lastElevatorLightHex = 0xff1500;
        this.lightFrustum = new THREE.Frustum();
        this.lightProjectionMatrix = new THREE.Matrix4();
        this.lightBounds = new THREE.Sphere(new THREE.Vector3(), 20);
        this.dynamicLightCandidates = [];
        this.maxActiveDynamicLights = 8;

        // Zsilipkapuk sűrű zöld füst áramlási állapota
        this.isDoorsOpen = false;
        this.smokeTickTimer = 0.0;
        this.corridorFogMat = null;
        this.sterilizationSteamIntensity = 0;
        this.sterilizationLights = [];
        this.sterilizationLightSnapshots = null;
        this.sterilizationWhite = new THREE.Color(0xffffff);

        this.regenerationPod = null;
        this.terminalModelMixer = null;
        this.terminalModelAction = null;
        this.terminalModelAnimations = [];
        this.terminalClosedTime = 2.7;
        this.terminalModelTime = this.terminalClosedTime;
        this.terminalModelTargetTime = this.terminalClosedTime;
        this.sectorTerminalModelMixer = null;
        this.sectorTerminalModelAction = null;
        this.sectorTerminalModelTime = this.terminalClosedTime;
        this.sectorTerminalModelTargetTime = this.terminalClosedTime;
        this.researchTerminalAnimations = [];
        this.podPowerLight = null;
        this.podRotor = null;
        this.podAnimationTime = 0;
        this.isTerminalActive = false;
        this.podDoorPanels = [];
        this.podDoorProgress = 0;
        this.podDoorTarget = 0;
        this.sectorPodDoorPanels = [];
        this.sectorPodDoorProgress = 0;
        this.sectorPodDoorTarget = 0;
        this.sectorPodAnimationTime = 0;
        this.isSectorPodActive = false;

    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;
        EventBus.withOwner(this, () => {
        EventBus.on('START_ELEVATOR_MOVE', (data) => this.startElevator(data));
        EventBus.on('STOP_ELEVATOR_MOVE', () => this.stopElevator());
        EventBus.on('OPEN_AIRLOCK_GATES', (data) => this.openDoors(data ? data.duration : 7.5));
        EventBus.on('CLOSE_AIRLOCK_GATES', (data) => this.closeDoors(data ? data.duration : 1.5));
        EventBus.on('TERMINAL_SESSION_ACTIVE', () => this.setTerminalActive(true));
        EventBus.on('TERMINAL_RESET', () => this.setTerminalActive(false));
        EventBus.on('TERMINAL_OPEN', (data) => this.setTerminalModelOpen(true, !!(data && data.isSectorPod)));
        EventBus.on('TERMINAL_CLOSE', (data) => this.setTerminalModelOpen(false, !!(data && data.isSectorPod)));
        EventBus.on('RESEARCH_TERMINAL_OPEN', (data) => this.setResearchTerminalOpen(data.station, true));
        EventBus.on('RESEARCH_TERMINAL_CLOSE', (data) => this.setResearchTerminalOpen(data.station, false));
        EventBus.on('STERILIZATION_STEAM', (intensity) => this.setSterilizationSteam(intensity));
        EventBus.on('WAVE_STARTED', (data) => this.setCampaignFloor(data.wave));
        EventBus.on('ELEVATOR_ARRIVED', (data) => {
            if (data && getCampaignFloorInfo(data.wave).isCaveFloor) {
                this.caveWorldOffset = -sectorHallCenter;
                if (!this.caveGroup) this.buildCave();
                this.setCaveShell(true);
                // Megérkezéskor azonnal kinyílik a kabin ajtaja, és kilátni a barlangra
                this.cabinDoorTarget = 0;
            }
        });
        EventBus.on('WAVE_STARTING', (data) => {
            if (data && data.wave >= 100) this.preloadCaveTextures();
            // A barlang felépítése a lift útja alatt történik, nem a megérkezés pillanatában
            if (data && data.isCave && !this.caveGroup) {
                this.caveWorldOffset = -sectorHallCenter;
                this.buildCave();
            }
        });
        EventBus.on('CAMPAIGN_FLOOR_RESET', () => this.setCampaignFloor(1));
        EventBus.on('RESEARCH_ROOMS_SET', (data) => {
            const active = !!(data && data.active);
            this.setResearchRoomsActive(active);
        });
        EventBus.on('RESEARCH_NODE_SECTION_SET', (data) => this.setNodeSectionActive(!!(data && data.active), !!(data && data.isFinal)));
        EventBus.on('NODE_GATE_SET', (data) => this.setNodeDoorOpen('gate', !!(data && data.open)));
        EventBus.on('NODE_CLEARED', () => this.setNodeCleared());
        EventBus.on('NODE_EXIT_UNLOCKED', () => {
            this.setNodeDoorOpen('exit', true);
            this.setSectorPodActive(true);
        });
        });
    }

    unbindEvents() {
        EventBus.removeListenersForOwner(this);
        this._eventsBound = false;
    }

    init(scene, assetManager) {
        this.bindEvents();
        this.scene = scene;
        const preInitChildren = new Set(scene.children);
        this.gatesGroup = new THREE.Group();
        this.gatesGroup.visible = false;
        this.scene.add(this.gatesGroup);

        // Alacsony teljesítményű gépeken a környezeti FX mérete csökkenthető a látvány megőrzése mellett.
        this.lowPerformanceMode = !!(typeof navigator !== 'undefined' && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
        this.wallHitboxes = [];
        this.corridorSpawns = [];
        this.doors = [];
        this.warningLights = [];
        this.sterilizationLights = [];
        this.sterilizationLightSnapshots = null;
        this.shaftLightTiers = [];
        this.dynamicLightCandidates = [];
        this.transitShutters = [];
        this.isDoorsOpen = false;
        this.smokeTickTimer = 0.0;
        this.isElevatorMoving = false;
        this.cabinCenter = null;
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
        this.floorMaterial = floorMat;
        this.shaftWallMaterial = shaftWallMat;
        const portalFrameMat = new THREE.MeshStandardMaterial({ color: 0x272d36, roughness: 0.4, metalness: 0.8 });
        const blastDoorMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.35, metalness: 0.85 });
        const doorRibMat = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.4, metalness: 0.9 });
        const corridorWallMat = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9, metalness: 0.1 });

        // Zsilip alagút belső sűrű toxikus gőz textúrája és anyagai (lágy, gömbölyű hatás nélküli füstgőz)
        const smokeCanvas = document.createElement('canvas');
        const smokeCanvasSize = this.lowPerformanceMode ? 128 : 256;
        smokeCanvas.width = smokeCanvasSize;
        smokeCanvas.height = smokeCanvasSize;
        const sCtx = smokeCanvas.getContext('2d');
        const smokeCanvasCenter = smokeCanvasSize / 2;
        const sGrad = sCtx.createRadialGradient(
            smokeCanvasCenter,
            smokeCanvasCenter,
            smokeCanvasSize * 0.06,
            smokeCanvasCenter,
            smokeCanvasCenter,
            smokeCanvasCenter - 2
        );
        sGrad.addColorStop(0, 'rgba(40, 245, 80, 0.98)');
        sGrad.addColorStop(0.3, 'rgba(28, 195, 60, 0.90)');
        sGrad.addColorStop(0.6, 'rgba(18, 140, 40, 0.65)');
        sGrad.addColorStop(0.85, 'rgba(8, 70, 20, 0.25)');
        sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sCtx.fillStyle = sGrad;
        sCtx.fillRect(0, 0, smokeCanvasSize, smokeCanvasSize);

        const corridorSmokeTex = new THREE.CanvasTexture(smokeCanvas);
        corridorSmokeTex.wrapS = THREE.RepeatWrapping;
        corridorSmokeTex.wrapT = THREE.RepeatWrapping;

        this.corridorFogMat = new THREE.MeshBasicMaterial({
            map: corridorSmokeTex,
            transparent: true,
            opacity: this.lowPerformanceMode ? 0.72 : 0.96,
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

        this.createServerRoomSet();
        this.createSectorDressing();
        this.createResearchHub(assetManager);
        this.setCampaignFloor(1);

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

        this.createRegenerationPod(assetManager);

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
            this.sterilizationLights.push({ light: pLight, mesh: lightMesh });
            const gateLight = { light: pLight, rangeSq: 64, distanceSq: Infinity, tier: null };
            this.dynamicLightCandidates.push(gateLight);

            const corridorChildStart = this.gatesGroup.children.length;
            const corridorHitboxStart = this.wallHitboxes.length;

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
            this.sterilizationLights.push({ light: lamp, mesh: null });
            const corridorLight = { light: lamp, rangeSq: 256, distanceSq: Infinity, tier: null };
            this.dynamicLightCandidates.push(corridorLight);

            const corridorParts = this.gatesGroup.children.slice(corridorChildStart);
            const corridorHitboxes = this.wallHitboxes.slice(corridorHitboxStart);

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
                dirSign: dirSign,
                corridorParts,
                corridorHitboxes,
                corridorHitboxBackups: corridorHitboxes.map(box => box.clone()),
                corridorLight,
                isResearchDoor: isXAxis ? doorCenterX === 0 : doorCenterZ === 0,
                isNodeDoor: !isXAxis && doorCenterZ === 0 && dirSign === -1,
                replaced: false
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
        this.shaftLensMat = new THREE.MeshBasicMaterial({ color: 0xff1500 });
        this.lastElevatorLightHex = 0xff1500;

        tierHeights.forEach((yPos) => {
            const tier = { y: yPos, fixtures: [] };
            this.shaftLightTiers.push(tier);
            const tierFixtures = tier.fixtures;
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
                const lensMesh = new THREE.Mesh(lensGeo, this.shaftLensMat);
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
                const fixture = tierFixtures[tierFixtures.length - 1];
                this.dynamicLightCandidates.push({
                    light,
                    fixture,
                    tier,
                    rangeSq: 400,
                    distanceSq: Infinity
                });
            });
        });

        this.createSectorArena(preInitChildren);

        console.log(`[KRONOS] LevelManager: Egységesített, folytonos -100. emeleti aknafalak (60m) és oszlopok kiépítve.`);
    }

    createRegenerationPod(assetManager) {
        const pod = new THREE.Group();
        pod.scale.set(3.2 / 9.8, 1, 3.2 / 9.8);
        const steel = new THREE.MeshStandardMaterial({ color: 0x252d32, metalness: 0.88, roughness: 0.3 });
        const trim = new THREE.MeshStandardMaterial({
            color: 0x71848a,
            metalness: 0.92,
            roughness: 0.22,
            emissive: 0x102529,
            emissiveIntensity: 0.7
        });
        const glass = new THREE.MeshStandardMaterial({
            color: 0x38aeb0,
            metalness: 0.45,
            roughness: 0.18,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const inactiveGlow = new THREE.MeshBasicMaterial({ color: 0xff7b24 });
        const activeGlow = new THREE.MeshBasicMaterial({ color: 0x00f5ff });

        const addBox = (width, height, depth, x, y, z, material, collides = false) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
            mesh.position.set(x, y, z);
            pod.add(mesh);
            if (collides) {
                mesh.updateWorldMatrix(true, false);
                this.wallHitboxes.push(new THREE.Box3().setFromObject(mesh));
            }
            return mesh;
        };

        addBox(9.4, 0.24, 9.4, 0, 0.12, 0, steel);
        addBox(9.8, 0.08, 9.8, 0, 0.26, 0, trim);

        [-4.45, 4.45].forEach(x => {
            addBox(0.3, 3.5, 9.0, x, 1.95, 0, glass, true);
            addBox(0.55, 3.9, 0.55, x, 2.05, -4.15, steel);
            addBox(0.55, 3.9, 0.55, x, 2.05, 4.15, steel);
            addBox(0.48, 0.18, 8.9, x, 0.45, 0, trim);
            addBox(0.48, 0.18, 8.9, x, 3.35, 0, trim);
        });

        addBox(9.0, 3.5, 0.3, 0, 1.95, -4.45, glass, true);
        addBox(9.0, 0.18, 0.48, 0, 0.45, -4.45, trim);
        addBox(9.0, 0.18, 0.48, 0, 3.35, -4.45, trim);

        // The south side stays open as the pod entrance.
        addBox(2.9, 3.5, 0.3, -3.45, 1.95, 4.45, glass, true);
        addBox(2.9, 3.5, 0.3, 3.45, 1.95, 4.45, glass, true);
        addBox(2.9, 0.18, 0.48, -3.45, 0.45, 4.45, trim);
        addBox(2.9, 0.18, 0.48, 3.45, 0.45, 4.45, trim);

        const podDoorMaterial = glass.clone();
        podDoorMaterial.opacity = 0.36;
        [-1, 1].forEach(direction => {
            const panel = new THREE.Mesh(new THREE.BoxGeometry(2.05, 3.42, 0.12), podDoorMaterial);
            panel.position.set(direction * 1.025, 1.95, 4.3);
            panel.name = 'regeneration-pod-door';
            panel.userData.doorDirection = direction;
            pod.add(panel);
            this.podDoorPanels.push({ mesh: panel, direction });
        });
        this.podDoorProgress = 0;
        this.podDoorTarget = 0;

        const roof = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.28, 9.5), steel);
        roof.position.set(0, 3.85, 0);
        pod.add(roof);

        const ceilingRing = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.12, 10, 48), trim);
        ceilingRing.rotation.x = Math.PI / 2;
        ceilingRing.position.y = 4.06;
        pod.add(ceilingRing);

        const rotor = new THREE.Group();
        rotor.name = 'regeneration-pod-rotor';
        rotor.position.set(0, 4.12, 0);
        const rotorRing = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.075, 8, 40), inactiveGlow);
        rotorRing.rotation.x = Math.PI / 2;
        rotor.add(rotorRing);
        const rotorCrossbar = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.06, 0.12), inactiveGlow);
        rotor.add(rotorCrossbar);
        pod.add(rotor);
        this.podRotor = rotor;

        const terminalModel = assetManager.cloneModel('terminal');
        if (!terminalModel) {
            throw new Error('[KRONOS] The terminal model was not loaded before the regeneration pod was created.');
        }
        terminalModel.mesh.name = 'regeneration-pod-terminal';
        terminalModel.mesh.scale.set(9.8 / 3.2, 1, 2);
        terminalModel.mesh.position.set(0, 0.26, -3.14);
        pod.add(terminalModel.mesh);
        if (terminalModel.animations.length > 0) {
            this.terminalModelAnimations = terminalModel.animations;
            this.terminalModelMixer = new THREE.AnimationMixer(terminalModel.mesh);
            this.terminalModelAction = this.terminalModelMixer.clipAction(terminalModel.animations[0]);
            this.terminalModelAction.play();
            this.terminalModelAction.paused = true;
            this.terminalModelAction.time = this.terminalClosedTime;
            this.terminalModelMixer.update(0);
        } else {
            console.warn('[KRONOS] The terminal model has no animation clips.');
        }

        const entryFrame = new THREE.Group();
        [
            { x: -1.7, y: 2.0, width: 0.22, height: 4.0 },
            { x: 1.7, y: 2.0, width: 0.22, height: 4.0 },
            { x: 0, y: 3.95, width: 3.62, height: 0.22 }
        ].forEach(part => {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(part.width, part.height, 0.24), trim);
            bar.position.set(part.x, part.y, 4.42);
            entryFrame.add(bar);
        });
        const entryIndicator = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.08, 0.08), inactiveGlow);
        entryIndicator.name = 'regeneration-pod-entry-indicator';
        entryIndicator.position.set(0, 3.78, 4.29);
        entryFrame.add(entryIndicator);
        pod.add(entryFrame);

        const powerLight = new THREE.PointLight(0xff7b24, 1.1, 14, 2);
        powerLight.name = 'regeneration-pod-power-light';
        powerLight.position.set(0, 3.6, 0);
        pod.add(powerLight);
        this.podPowerLight = powerLight;
        this.podGlowMaterials = { inactive: inactiveGlow, active: activeGlow };
        this.podEntryIndicator = entryIndicator;
        pod.name = 'regeneration-pod';
        this.regenerationPod = pod;
        this.scene.add(pod);
        this.setTerminalActive(false);
    }

    setTerminalActive(isActive) {
        this.isTerminalActive = isActive;
        if (this.podEntryIndicator && this.podGlowMaterials) {
            this.podEntryIndicator.material = isActive ? this.podGlowMaterials.active : this.podGlowMaterials.inactive;
        }
        if (this.podPowerLight) {
            this.podPowerLight.color.setHex(isActive ? 0x00f5ff : 0xff7b24);
            this.podPowerLight.intensity = isActive ? 2.2 : 0.85;
        }
        if (this.podRotor && this.podGlowMaterials) {
            this.podRotor.children[0].material = isActive ? this.podGlowMaterials.active : this.podGlowMaterials.inactive;
            this.podRotor.children[1].material = isActive ? this.podGlowMaterials.active : this.podGlowMaterials.inactive;
        }
        this.setSectorPodActive(isActive);
    }

    setSectorPodActive(isActive) {
        this.isSectorPodActive = isActive;
        if (this.sectorPodEntryIndicator && this.podGlowMaterials) {
            this.sectorPodEntryIndicator.material = isActive ? this.podGlowMaterials.active : this.podGlowMaterials.inactive;
        }
        if (this.sectorPodPowerLight) {
            this.sectorPodPowerLight.color.setHex(isActive ? 0x00f5ff : 0xff7b24);
            this.sectorPodPowerLight.intensity = isActive ? 2.2 : 0.85;
        }
        if (this.sectorPodRotor && this.podGlowMaterials) {
            this.sectorPodRotor.children[0].material = isActive ? this.podGlowMaterials.active : this.podGlowMaterials.inactive;
            this.sectorPodRotor.children[1].material = isActive ? this.podGlowMaterials.active : this.podGlowMaterials.inactive;
        }
    }

    createServerRoomSet() {
        this.serverRoomGroup = new THREE.Group();
        this.serverRoomGroup.visible = false;
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x101820,
            metalness: 0.85,
            roughness: 0.35,
            emissive: 0x04131c,
            emissiveIntensity: 0.6
        });
        const coreMaterial = new THREE.MeshStandardMaterial({
            color: 0x1b2530,
            metalness: 0.7,
            roughness: 0.2,
            emissive: 0x00aabb,
            emissiveIntensity: 2
        });
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x00f5ff });

        for (let index = 0; index < 3; index++) {
            const x = (index - 1) * 5;
            const rack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.4, 1.25), frameMaterial);
            rack.position.set(x, 2.2, -17);
            this.serverRoomGroup.add(rack);

            const core = new THREE.Mesh(new THREE.BoxGeometry(0.7, 3.5, 0.16), coreMaterial);
            core.position.set(x, 2.25, -16.32);
            this.serverRoomGroup.add(core);

            const status = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), lightMaterial);
            status.position.set(x, 4.45, -16.28);
            this.serverRoomGroup.add(status);
        }

        const centralCore = new THREE.Mesh(
            new THREE.CylinderGeometry(0.6, 0.9, 5.2, 8),
            new THREE.MeshStandardMaterial({
                color: 0x18232c,
                metalness: 0.8,
                roughness: 0.25,
                emissive: 0x00d8e8,
                emissiveIntensity: 1.8
            })
        );
        centralCore.position.set(0, 2.6, -21);
        this.serverRoomGroup.add(centralCore);

        const coreLight = new THREE.PointLight(0x00d8e8, 3.5, 22, 2);
        coreLight.position.set(0, 3, -19);
        this.serverRoomGroup.add(coreLight);
        this.scene.add(this.serverRoomGroup);
    }

    createSectorDressing() {
        const beta = new THREE.Group();
        beta.visible = false;
        const containerMaterial = new THREE.MeshStandardMaterial({
            color: 0x66503a,
            metalness: 0.65,
            roughness: 0.82
        });
        const containerTrim = new THREE.MeshStandardMaterial({
            color: 0xff9b32,
            metalness: 0.45,
            roughness: 0.55,
            emissive: 0x4a1d00,
            emissiveIntensity: 0.55
        });
        const betaCollisions = [];
        for (const x of [-13, 13]) {
            const container = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.8, 6.5), containerMaterial);
            container.position.set(x, 1.4, -3);
            beta.add(container);
            const ribs = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.14, 6.6), containerTrim);
            ribs.position.set(x, 2.72, -3);
            beta.add(ribs);
            betaCollisions.push(new THREE.Box3().setFromObject(container));
        }
        this.sectorDressingGroups.beta = beta;
        this.sectorPropCollisions.beta = betaCollisions;
        this.scene.add(beta);

        const omega = new THREE.Group();
        omega.visible = false;
        const omegaCollisions = [];
        const fleshMaterial = new THREE.MeshStandardMaterial({
            color: 0x45151e,
            metalness: 0.08,
            roughness: 0.82,
            emissive: 0x6b101c,
            emissiveIntensity: 0.85
        });
        const growthGeometry = new THREE.ConeGeometry(1.05, 4.6, 7);
        for (const [x, z, rotation] of [
            [-20, -18, -0.18], [20, -18, 0.2], [-20, 18, 0.2], [20, 18, -0.2]
        ]) {
            const growth = new THREE.Mesh(growthGeometry, fleshMaterial);
            growth.position.set(x, 2.25, z);
            growth.rotation.z = rotation;
            omega.add(growth);
            omegaCollisions.push(new THREE.Box3().setFromObject(growth));
        }
        this.sectorDressingGroups.omega = omega;
        this.sectorPropCollisions.omega = omegaCollisions;
        this.scene.add(omega);
    }

    createResearchHub(assetManager) {
        const wallHeight = 6;
        const wallThickness = 0.4;
        const roomHalfWidth = 7;
        const roomStart = 26;
        const roomEnd = 42;
        const roomDepth = roomEnd - roomStart;
        const roomCenter = (roomStart + roomEnd) / 2;
        const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.25, roughness: 0.6, emissive: 0x2a3338, emissiveIntensity: 0.6 });
        const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe6eef1, metalness: 0.2, roughness: 0.55, emissive: 0x2c363a, emissiveIntensity: 0.55 });
        const panelMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        const group = new THREE.Group();
        group.visible = false;
        this.researchHubGroup = group;
        this.researchHubCollisions = [];
        this.researchRoomLights = [];
        this.researchTerminalAnimations = [];
        this.scene.add(group);

        const rotations = { armory: 0, regeneration: Math.PI, comms: Math.PI / 2, augmentation: -Math.PI / 2 };
        const blocking = [];

        for (const station of researchHubStations) {
            const room = new THREE.Group();
            room.rotation.y = rotations[station.id];
            group.add(room);
            const add = (geometry, material, x, y, z, blocks = false) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(x, y, z);
                room.add(mesh);
                if (blocks) blocking.push(mesh);
                return mesh;
            };
            const color = new THREE.Color(station.color);

            add(new THREE.BoxGeometry(roomHalfWidth * 2, 0.2, roomDepth), floorMaterial, 0, 0.02, -roomCenter);
            add(new THREE.BoxGeometry(roomHalfWidth * 2 + wallThickness * 2, 0.3, roomDepth), wallMaterial, 0, wallHeight, -roomCenter);
            add(new THREE.BoxGeometry(wallThickness, wallHeight, roomDepth), wallMaterial, -roomHalfWidth - wallThickness / 2, wallHeight / 2, -roomCenter, true);
            add(new THREE.BoxGeometry(wallThickness, wallHeight, roomDepth), wallMaterial, roomHalfWidth + wallThickness / 2, wallHeight / 2, -roomCenter, true);
            add(new THREE.BoxGeometry(roomHalfWidth * 2 + wallThickness * 2, wallHeight, wallThickness), wallMaterial, 0, wallHeight / 2, -roomEnd - wallThickness / 2, true);

            for (const z of [-roomStart - 4, -roomStart - 11]) {
                add(new THREE.BoxGeometry(5, 0.08, 1.2), panelMaterial, 0, wallHeight - 0.2, z);
            }
            const stripMaterial = new THREE.MeshBasicMaterial({ color });
            add(new THREE.BoxGeometry(0.15, 0.04, roomDepth - 1), stripMaterial, -roomHalfWidth + 0.8, 0.14, -roomCenter);
            add(new THREE.BoxGeometry(0.15, 0.04, roomDepth - 1), stripMaterial, roomHalfWidth - 0.8, 0.14, -roomCenter);

            const consoleZ = -roomEnd + 1.3;
            this.addResearchConsole(room, add, assetManager, station, color, consoleZ);

            add(this.createLabelGeometry(5.5, 1.35), this.createLabelMaterial(station.label, station.color), 0, 4.4, -roomEnd - 0.03);

            for (const depth of [roomStart + 4, roomStart + 12]) {
                const light = new THREE.PointLight(0xf2fbff, 0, 24, 1.6);
                const world = new THREE.Vector3(0, wallHeight - 0.7, -depth).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotations[station.id]);
                light.position.copy(world);
                this.scene.add(light);
                this.researchRoomLights.push(light);
            }
        }

        group.updateMatrixWorld(true);
        for (const mesh of blocking) this.researchHubCollisions.push(new THREE.Box3().setFromObject(mesh));
        this.createNodeSection(assetManager);
    }

    createLabelGeometry(width, height) {
        return new THREE.PlaneGeometry(width, height);
    }

    createLabelMaterial(label, colorHex) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 128;
        const context = canvas.getContext('2d');
        context.fillStyle = '#0b1418';
        context.fillRect(0, 0, 512, 128);
        context.strokeStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
        context.lineWidth = 8;
        context.strokeRect(4, 4, 504, 120);
        context.fillStyle = '#e8f6f6';
        context.font = 'bold 40px monospace';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, 256, 64);
        return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), toneMapped: false });
    }

    addResearchConsole(room, add, assetManager, station, color, consoleZ) {
        const consoleMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4850, metalness: 0.6, roughness: 0.35 });
        const consoleBase = add(new THREE.BoxGeometry(2.2, 1.6, 1.2), consoleMaterial, 0, 0.8, consoleZ, true);
        const terminalModel = assetManager && typeof assetManager.cloneModel === 'function' ? assetManager.cloneModel('terminal') : null;
        if (terminalModel) {
            consoleBase.visible = false;
            const model = terminalModel.mesh;
            room.add(model);
            const mixer = terminalModel.animations.length
                ? new THREE.AnimationMixer(model)
                : null;
            const action = mixer
                ? mixer.clipAction(terminalModel.animations[0])
                : null;
            if (action) {
                action.setLoop(THREE.LoopOnce, 1);
                action.clampWhenFinished = true;
                action.play();
                action.paused = true;
                action.time = this.terminalClosedTime;
                mixer.update(0);
            } else {
                console.warn(`[KRONOS] Research terminal "${station.id}" has no animation clips.`);
            }
            this.researchTerminalAnimations.push({
                station: station.id,
                mixer,
                action,
                time: this.terminalClosedTime,
                targetTime: this.terminalClosedTime
            });
            model.updateMatrixWorld(true);
            const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
            const scale = 2.4 / Math.max(size.y, 0.001);
            model.scale.multiplyScalar(scale);
            model.position.set(0, 0, consoleZ);
            room.updateMatrixWorld(true);
            const fitted = new THREE.Box3().setFromObject(model);
            const center = fitted.getCenter(new THREE.Vector3());
            room.worldToLocal(center);
            model.position.x -= center.x;
            model.position.y -= new THREE.Box3().setFromObject(model).min.y;
        } else {
            consoleBase.visible = true;
            const screen = add(new THREE.BoxGeometry(2.6, 1.2, 0.12), new THREE.MeshBasicMaterial({ color }), 0, 1.7, consoleZ - 0.25);
            screen.rotation.x = -0.25;
        }
    }

    createNodeSection(assetManager) {
        const S = researchNodeSection;
        const wallHeight = 6;
        const t = 0.4;
        const doorHalf = S.corridorHalfWidth;
        const doorHeight = 5.2;
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x2b3238, metalness: 0.45, roughness: 0.6, emissive: 0x0b1216, emissiveIntensity: 0.6 });
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x3a444c, metalness: 0.35, roughness: 0.6, emissive: 0x10181c, emissiveIntensity: 0.6 });
        const rackMat = new THREE.MeshStandardMaterial({ color: 0x1c2328, metalness: 0.7, roughness: 0.4 });
        const accentMat = new THREE.MeshBasicMaterial({ color: 0x00d9ff });
        const warnMat = new THREE.MeshBasicMaterial({ color: 0xff3048 });
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x555f66, metalness: 0.8, roughness: 0.35, emissive: 0x220508, emissiveIntensity: 0.8 });

        const group = new THREE.Group();
        group.visible = false;
        this.nodeSectionGroup = group;
        this.nodeStaticCollisions = [];
        this.nodeDoors = [];
        this.nodeLights = [];
        this.scene.add(group);

        const blocking = [];
        const place = (parent, geometry, material, x, y, z, blocks = false) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            parent.add(mesh);
            if (blocks) blocking.push(mesh);
            return mesh;
        };
        const add = (w, h, d, material, x, y, z, blocks = false) => place(group, new THREE.BoxGeometry(w, h, d), material, x, y, z, blocks);
        const centerOf = (d0, d1) => -(d0 + d1) / 2;

        // Átjáró: padló, mennyezet és két oldalfal két távolság között
        const hall = (d0, d1, half) => {
            const len = d1 - d0;
            const cx = centerOf(d0, d1);
            add(len, 0.2, half * 2, floorMat, cx, 0.02, 0);
            add(len, 0.3, half * 2 + t * 2, wallMat, cx, wallHeight, 0);
            add(len, wallHeight, t, wallMat, cx, wallHeight / 2, -half - t / 2, true);
            add(len, wallHeight, t, wallMat, cx, wallHeight / 2, half + t / 2, true);
            add(len - 1, 0.04, 0.15, accentMat, cx, 0.14, -half + 0.8);
            add(len - 1, 0.04, 0.15, accentMat, cx, 0.14, half - 0.8);
        };
        // Keresztfal ajtónyílással
        const dividerWall = (d, half) => {
            const sideWidth = half + t - doorHalf;
            for (const side of [-1, 1]) {
                add(t, wallHeight, sideWidth, wallMat, -d, wallHeight / 2, side * (doorHalf + sideWidth / 2), true);
            }
            add(t, wallHeight - doorHeight, doorHalf * 2, wallMat, -d, doorHeight + (wallHeight - doorHeight) / 2, 0);
        };
        const makeDoor = (id, d, mat) => {
            const mesh = add(0.6, doorHeight, doorHalf * 2, mat, -d, doorHeight / 2, 0);
            mesh.updateMatrixWorld(true);
            this.nodeDoors.push({
                id, mesh,
                box: new THREE.Box3().setFromObject(mesh),
                progress: 0,
                target: 0,
                closedY: doorHeight / 2,
                openY: doorHeight / 2 + doorHeight
            });
        };

        hall(S.corridorStart, S.gateDistance, doorHalf);
        hall(S.gateDistance, S.roomEndDistance, S.roomHalfWidth);
        hall(S.roomEndDistance, S.exitCorridorEnd, doorHalf);
        hall(S.exitCorridorEnd, S.liftEndDistance, doorHalf);
        dividerWall(S.gateDistance, S.roomHalfWidth);
        dividerWall(S.roomEndDistance, S.roomHalfWidth);
        makeDoor('gate', S.gateDistance, doorMat);
        makeDoor('exit', S.roomEndDistance, doorMat);

        // Szerver állványok a terem két oldalán (a közepe szabad a harchoz)
        for (let d = 52; d <= 72; d += 5) {
            for (const side of [-1, 1]) {
                const z = side * (S.roomHalfWidth - 0.9);
                add(2.6, 3.6, 1.4, rackMat, -d, 1.8, z, true);
                for (let row = 0; row < 4; row++) {
                    add(2.2, 0.06, 0.05, row % 2 ? accentMat : warnMat, -d, 0.8 + row * 0.7, z - side * 0.73);
                }
            }
        }
        const pedestal = place(group, new THREE.CylinderGeometry(3.2, 3.4, 0.15, 32), floorMat, -S.bossDistance, 0.1, 0);
        pedestal.receiveShadow = true;
        const ring = place(group, new THREE.RingGeometry(2.7, 3.0, 48), warnMat, -S.bossDistance, 0.2, 0);
        ring.rotation.x = -Math.PI / 2;

        // Kommunikációs terminál a szerverterem nyugati falánál (csak a Node legyőzése után látszik)
        const terminalRoot = new THREE.Group();
        terminalRoot.position.set(-S.terminalDistance, 0, S.terminalZ);
        terminalRoot.rotation.y = Math.PI / 2;
        terminalRoot.visible = true;
        group.add(terminalRoot);
        this.nodeTerminalGroup = terminalRoot;
        const terminalAdd = (geometry, material, x, y, z, blocks = false) => place(terminalRoot, geometry, material, x, y, z, blocks);
        this.addResearchConsole(terminalRoot, terminalAdd, assetManager, nodeUnlockStation, new THREE.Color(nodeUnlockStation.color), 0);
        place(terminalRoot, this.createLabelGeometry(4.2, 1.05), this.createLabelMaterial(nodeUnlockStation.label, nodeUnlockStation.color), 0, 4.2, -1.27);

        this.nodeSigns = [];

        const lightSpots = [
            { d: 36, color: 0xf2fbff }, { d: 54, color: 0xdff4ff }, { d: 66, color: 0xffd0d6 },
            { d: 72, color: 0xf2fbff }, { d: 86, color: 0xf2fbff }, { d: 99, color: 0xcfffe8 }
        ];
        for (const spot of lightSpots) {
            const light = new THREE.PointLight(spot.color, 0, 24, 1.6);
            light.position.set(-spot.d, wallHeight - 0.8, 0);
            this.scene.add(light);
            this.nodeLights.push(light);
        }

        group.updateMatrixWorld(true);
        for (const mesh of blocking) this.nodeStaticCollisions.push(new THREE.Box3().setFromObject(mesh));
    }

    // A következő szektor pályaliftje: a központi aréna fizikai másolata a szerverfolyosó végén
    createSectorArena(preInitChildren) {
        const offsetX = -sectorHallCenter;
        const skip = new Set([this.gatesGroup, this.serverRoomGroup, this.researchHubGroup, this.nodeSectionGroup, this.caveGroup, ...Object.values(this.sectorDressingGroups)]);
        const arena = new THREE.Group();
        this.arenaShellItems = [];
        arena.position.set(offsetX, 0, 0);
        for (const child of this.scene.children) {
            if (preInitChildren.has(child) || skip.has(child) || child.isLight) continue;
            // A keleti középső zsilip a szerverfolyosóra nyílik, ott nem lehet fedőlap
            if (child.isMesh && child.position.x === 25 && child.position.z === 0 && child.geometry.type === 'PlaneGeometry') continue;
            const copy = child.clone(true);
            let hasFloor = false;
            child.traverse(o => { if (o.isMesh && o.material === this.floorMaterial) hasFloor = true; });
            if (child !== this.regenerationPod && !hasFloor) this.arenaShellItems.push(child);
            if (child === this.regenerationPod) {
                this.sectorRegenerationPod = copy;
                copy.traverse(object => {
                    if (object.name === 'regeneration-pod-door') {
                        this.sectorPodDoorPanels.push({ mesh: object, direction: object.userData.doorDirection });
                    } else if (object.name === 'regeneration-pod-entry-indicator') {
                        this.sectorPodEntryIndicator = object;
                    } else if (object.name === 'regeneration-pod-power-light') {
                        this.sectorPodPowerLight = object;
                    } else if (object.name === 'regeneration-pod-rotor') {
                        this.sectorPodRotor = object;
                    } else if (object.name === 'regeneration-pod-terminal') {
                        this.sectorPodTerminalModel = object;
                        if (this.terminalModelAnimations.length > 0) {
                            this.sectorTerminalModelMixer = new THREE.AnimationMixer(object);
                            this.sectorTerminalModelAction = this.sectorTerminalModelMixer.clipAction(this.terminalModelAnimations[0]);
                            this.sectorTerminalModelAction.play();
                            this.sectorTerminalModelAction.paused = true;
                            this.sectorTerminalModelAction.time = this.terminalClosedTime;
                            this.sectorTerminalModelMixer.update(0);
                        } else {
                            console.warn('[KRONOS] Sector lift terminal model has no animation clips.');
                        }
                    }
                });
                this.sectorPodVisibility = new Map();
                copy.traverse(object => this.sectorPodVisibility.set(object, object.visible));
            }
            copy.traverse(object => {
                if (!object.isMesh) return;
                if (object.material === this.floorMaterial) {
                    object.material = this.floorMaterial.clone();
                    object.material.color.setHex(0xb99a70);
                } else if (object.material === this.shaftWallMaterial) {
                    object.material = this.shaftWallMaterial.clone();
                    object.material.color.setHex(0xd19a58);
                }
            });
            const lights = [];
            copy.traverse(o => { if (o.isLight) lights.push(o); });
            lights.forEach(l => {
                if (l !== this.sectorPodPowerLight && l.parent) l.parent.remove(l);
            });
            copy.visible = true;
            arena.add(copy);
        }
        this.nodeSectionGroup.add(arena);

        const doorMat = new THREE.MeshStandardMaterial({ color: 0x555f66, metalness: 0.8, roughness: 0.35, emissive: 0x220508, emissiveIntensity: 0.6 });
        const slabW = 6.3, slabH = 5.3, slabT = 0.35;
        const gates = [];
        for (const c of [-14, 0, 14]) {
            gates.push({ x: c, z: -26, w: slabW, d: slabT }, { x: c, z: 26, w: slabW, d: slabT }, { x: -26, z: c, w: slabT, d: slabW });
            if (c !== 0) gates.push({ x: 26, z: c, w: slabT, d: slabW });
        }
        for (const g of gates) {
            const slab = new THREE.Mesh(new THREE.BoxGeometry(g.w, slabH, g.d), doorMat);
            slab.position.set(g.x, slabH / 2, g.z);
            arena.add(slab);
        }
        arena.updateMatrixWorld(true);
        this.sectorArenaGroup = arena;
        this.sectorArenaItems = arena.children.slice();
        this.sectorArenaCollisions = [];

        const corridorBoxes = new Set();
        for (const door of this.doors) door.corridorHitboxes.forEach(box => corridorBoxes.add(box));
        const shift = new THREE.Vector3(offsetX, 0, 0);
        for (const box of this.wallHitboxes) {
            if (corridorBoxes.has(box) || box.isEmpty()) continue;
            this.sectorArenaCollisions.push(box.clone().translate(shift));
        }
        for (const g of gates) {
            const box = new THREE.Box3(
                new THREE.Vector3(g.x - g.w / 2, 0, g.z - g.d / 2).add(shift),
                new THREE.Vector3(g.x + g.w / 2, slabH, g.z + g.d / 2).add(shift)
            );
            this.sectorArenaCollisions.push(box);
        }
        this.createFinalPodRoom(offsetX, this.floorMaterial, shift);
        for (const [dx, dz] of [[-12, -12], [-12, 12], [12, -12], [12, 12]]) {
            const light = new THREE.PointLight(0xdff4ff, 0, 34, 1.4);
            light.position.set(offsetX + dx, 5, dz);
            this.scene.add(light);
            this.nodeLights.push(light);
        }
    }

    // A 101. szint szerverterme után nem aréna, hanem egy kis barlangszerű szoba áll az egyszemélyes liftel
    createFinalPodRoom(offsetX, floorMat, shift) {
        const room = new THREE.Group();
        room.visible = false;
        room.position.set(offsetX, 0, 0);
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xe0cfc2, roughness: 0.94, metalness: 0.02 });
        const rockTexture = this.createCaveTexture('#7d5a49', 'rgba(210,95,50,0.34)', 9817);
        const floorTexture = this.createCaveTexture('#775847', 'rgba(190,120,85,0.22)', 12661);
        const rockMat = new THREE.MeshStandardMaterial({ color: 0xe0cfc2, map: rockTexture, roughness: 0.94, metalness: 0.02, flatShading: true });
        const deepRockMat = new THREE.MeshStandardMaterial({ color: 0xb49f90, map: rockTexture, roughness: 0.97, metalness: 0, flatShading: true, side: THREE.DoubleSide });
        const floorTexMat = new THREE.MeshStandardMaterial({ color: 0xcdb8a8, map: floorTexture, roughness: 0.96, metalness: 0.02 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x222c32, metalness: 0.5, roughness: 0.6 });
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x4a5258, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide });
        const rampMat = new THREE.MeshStandardMaterial({ color: 0x2a3238, metalness: 0.5, roughness: 0.55 });
        const crystalMats = [
            new THREE.MeshStandardMaterial({ color: 0x2c9c88, emissive: 0x12b89c, emissiveIntensity: 1.2, roughness: 0.22, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0xe75f2b, emissive: 0xe0471a, emissiveIntensity: 1.2, roughness: 0.28, metalness: 0.05 })
        ];
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = patchCanvas.height = 128;
        const patchCtx = patchCanvas.getContext('2d');
        const patchGradient = patchCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
        patchGradient.addColorStop(0, '#fff');
        patchGradient.addColorStop(0.55, '#bbb');
        patchGradient.addColorStop(1, '#000');
        patchCtx.fillStyle = patchGradient;
        patchCtx.fillRect(0, 0, 128, 128);
        const patchMat = new THREE.MeshStandardMaterial({
            color: 0xcdb8a8, map: floorTexture, alphaMap: new THREE.CanvasTexture(patchCanvas), transparent: true, depthWrite: false,
            roughness: 0.9, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2
        });

        const boxes = [];
        const tileSize = 4;
        // A textúra méterarányosan ismétlődik a doboz minden lapján
        const tileUvs = (geo, w, hh, d) => {
            const uv = geo.attributes.uv;
            const faces = [[d, hh], [d, hh], [w, d], [w, d], [w, hh], [w, hh]];
            for (let f = 0; f < 6; f++) {
                for (let v = 0; v < 4; v++) {
                    const i = f * 4 + v;
                    uv.setXY(i, uv.getX(i) * faces[f][0] / tileSize, uv.getY(i) * faces[f][1] / tileSize);
                }
            }
        };
        const part = (w, hh, d, mat, x, y, z, solid = true) => {
            const geo = new THREE.BoxGeometry(w, hh, d);
            if (mat === wallMat || mat === floorTexMat) tileUvs(geo, w, hh, d);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            room.add(mesh);
            if (solid) boxes.push(new THREE.Box3(
                new THREE.Vector3(x - w / 2, 0, z - d / 2).add(shift),
                new THREE.Vector3(x + w / 2, hh, z + d / 2).add(shift)
            ));
            return mesh;
        };
        const block = (x0, x1, z0, z1) => boxes.push(new THREE.Box3(
            new THREE.Vector3(x0, 0, z0).add(shift), new THREE.Vector3(x1, 6, z1).add(shift)
        ));

        const xMin = -5.5, xMax = 26.8, halfZ = 5, h = 6, t = 0.5;
        const pitHalf = 3, pitDepth = 13, cabinHalf = 1.3;
        const cx = (xMin + xMax) / 2, len = xMax - xMin;

        // Padló lyukkal a lift kabin alatt: a mély járat köré négy padlódarab kerül
        part(len, 0.2, halfZ - pitHalf, floorTexMat, cx, -0.1, -(halfZ + pitHalf) / 2, false);
        part(len, 0.2, halfZ - pitHalf, floorTexMat, cx, -0.1, (halfZ + pitHalf) / 2, false);
        part(-pitHalf - xMin, 0.2, pitHalf * 2, floorTexMat, (xMin - pitHalf) / 2, -0.1, 0, false);
        part(xMax - pitHalf, 0.2, pitHalf * 2, floorTexMat, (xMax + pitHalf) / 2, -0.1, 0, false);
        part(len, 0.3, halfZ * 2, wallMat, cx, h + 0.15, 0, false);
        part(len, h, t, wallMat, cx, h / 2, -halfZ - t / 2);
        part(len, h, t, wallMat, cx, h / 2, halfZ + t / 2);
        part(t, h, halfZ * 2 + t * 2, wallMat, xMin - t / 2, h / 2, 0);
        const gap = researchNodeSection.corridorHalfWidth;
        const side = halfZ - gap;
        part(t, h, side, wallMat, xMax + t / 2, h / 2, gap + side / 2);
        part(t, h, side, wallMat, xMax + t / 2, h / 2, -gap - side / 2);
        // A járat peremei és a kabin zárt: csak a rámpa vezet a kabinhoz
        block(-pitHalf, pitHalf, -pitHalf, -cabinHalf);
        block(-pitHalf, pitHalf, cabinHalf, pitHalf);
        block(-pitHalf, cabinHalf, -cabinHalf, cabinHalf);

        // Vegyes talaj: sima padlón repedezett foltok, mint a barlangban
        const scaleUv = (geometry, factor) => {
            const uv = geometry.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * factor, uv.getY(i) * factor);
            return geometry;
        };
        for (const [px, pz, size] of [[6, -3.4, 2.2], [9.5, 2.6, 2.4], [-3.6, 3.6, 1.8], [-3.6, -3.6, 1.6], [4.8, 3.6, 1.7], [11, -2, 1.8], [15.5, -3, 2.3], [19, 2.8, 2.1], [22.5, -1.5, 1.9], [14, 3.4, 1.6]]) {
            const patch = new THREE.Mesh(scaleUv(new THREE.PlaneGeometry(size * 2, size * 2), size / 4), patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.rotation.z = Math.random() * Math.PI;
            patch.position.set(px, 0.006, pz);
            room.add(patch);
        }

        // Kőzetréteg a falak belső oldalán, mint a barlangban
        const rockGeos = [0, 1, 2].map(() => {
            const g = new THREE.IcosahedronGeometry(1, 1);
            const rp = g.attributes.position;
            for (let i = 0; i < rp.count; i++) {
                const k = 0.6 + Math.random() * 0.8;
                rp.setXYZ(i, rp.getX(i) * k, rp.getY(i) * (0.6 + Math.random() * 0.8), rp.getZ(i) * k);
            }
            g.computeVertexNormals();
            return g;
        });
        const rnd = (a, b) => a + Math.random() * (b - a);
        const addRock = (px, py, pz, yaw, size) => {
            const rock = new THREE.Mesh(rockGeos[Math.floor(Math.random() * 3)], Math.random() < 0.4 ? deepRockMat : rockMat);
            rock.position.set(px, py, pz);
            rock.rotation.set(rnd(-0.5, 0.5), yaw + rnd(-0.8, 0.8), rnd(-0.5, 0.5));
            rock.scale.set(size * rnd(0.6, 1.5), size * rnd(0.7, 1.9), size * rnd(0.5, 1.1));
            room.add(rock);
        };
        // Szabálytalan kőzetréteg: véletlen méret, magasság, mélység és dőlés
        const scatter = (from, to, place) => {
            for (let u = from + rnd(0, 0.8); u < to; u += rnd(0.5, 1.7)) {
                const n = 1 + Math.floor(Math.random() * 3);
                for (let j = 0; j < n; j++) place(u + rnd(-0.4, 0.4), rnd(0.3, h - 0.3), rnd(0.15, 0.7), rnd(0.55, 1.35));
            }
        };
        scatter(xMin + 0.3, xMax - 0.3, (u, y, d, sz) => addRock(u, y, -halfZ - d + 0.3, 0, sz));
        scatter(xMin + 0.3, xMax - 0.3, (u, y, d, sz) => addRock(u, y, halfZ + d - 0.3, 0, sz));
        scatter(-halfZ + 0.3, halfZ - 0.3, (u, y, d, sz) => addRock(xMin - d + 0.3, y, u, Math.PI / 2, sz));
        scatter(-halfZ + 0.3, halfZ - 0.3, (u, y, d, sz) => { if (Math.abs(u) > gap + 0.8) addRock(xMax + d - 0.3, y, u, Math.PI / 2, sz); });

        // A mély járat falai és alja
        const pitWallGeo = scaleUv(new THREE.PlaneGeometry(pitHalf * 2, pitDepth), 1.5);
        for (const [px, pz, yaw] of [[pitHalf, 0, Math.PI / 2], [-pitHalf, 0, Math.PI / 2], [0, pitHalf, 0], [0, -pitHalf, 0]]) {
            const wall = new THREE.Mesh(pitWallGeo, deepRockMat);
            wall.position.set(px, -pitDepth / 2, pz);
            wall.rotation.y = yaw;
            room.add(wall);
        }
        const pitBottom = new THREE.Mesh(new THREE.PlaneGeometry(pitHalf * 2, pitHalf * 2), deepRockMat);
        pitBottom.rotation.x = -Math.PI / 2;
        pitBottom.position.y = -pitDepth;
        room.add(pitBottom);

        // Rámpa a kabinhoz: enyhén emelkedik a padlótól a kabin küszöbéig
        const rampLen = pitHalf - cabinHalf;
        const rampRise = 0.1;
        const rampGeo = new THREE.BoxGeometry(Math.hypot(rampLen, rampRise), 0.12, cabinHalf * 2);
        tileUvs(rampGeo, Math.hypot(rampLen, rampRise) * 2, 0.24, cabinHalf * 4);
        const ramp = new THREE.Mesh(rampGeo, rampMat);
        ramp.position.set(cabinHalf + rampLen / 2, rampRise / 2 - 0.06, 0);
        ramp.rotation.z = -Math.atan2(rampRise, rampLen);
        room.add(ramp);

        // A kabint körülvevő lift váz a mély járat aljától a mennyezetig (a kabin magasságában csak rácsozat, az ajtó felőli oldal nyitva)
        const shaftHalf = 1.45;
        const doorTop = 3.4;
        const ringYs = [];
        for (let y = -12.25; y < h - 0.5; y += 1.75) ringYs.push(y);
        ringYs.push(h - 0.05);
        const frameBottom = ringYs[0], frameTop = ringYs[ringYs.length - 1];
        const shaft = new THREE.Group();
        const shaftMesh = (geo, mat, x, y, z, parent) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);
            parent.add(mesh);
            return mesh;
        };
        for (let k = 0; k < 4; k++) {
            const face = new THREE.Group();
            face.rotation.y = k * Math.PI / 2;
            const isDoorFace = k === 1;
            shaftMesh(new THREE.BoxGeometry(0.12, frameTop - frameBottom, 0.12), frameMat, shaftHalf, (frameTop + frameBottom) / 2, shaftHalf, face);
            for (let i = 0; i < ringYs.length; i++) {
                if (isDoorFace && ringYs[i] > -0.01 && ringYs[i] < doorTop) continue;
                shaftMesh(new THREE.BoxGeometry(shaftHalf * 2, 0.09, 0.09), frameMat, 0, ringYs[i], shaftHalf, face);
            }
            for (let i = 0; i < ringYs.length - 1; i++) {
                const y0 = ringYs[i], y1 = ringYs[i + 1], bay = y1 - y0, y = (y0 + y1) / 2;
                const cabinZone = y > -0.1 && y < doorTop;
                if (isDoorFace && cabinZone) continue;
                if (!cabinZone && (i + k) % 2 === 0) {
                    shaftMesh(new THREE.BoxGeometry(shaftHalf * 2 - 0.12, bay - 0.1, 0.04), panelMat, 0, y, shaftHalf, face);
                } else {
                    const brace = shaftMesh(new THREE.BoxGeometry(Math.hypot(shaftHalf * 2, bay), 0.06, 0.06), frameMat, 0, y, shaftHalf, face);
                    brace.rotation.z = Math.atan2(bay, shaftHalf * 2) * (i % 2 ? 1 : -1);
                }
            }
            shaft.add(face);
        }
        room.add(shaft);

        // A kabin feletti mennyezeten kristálycsoport lóg
        const crystalCluster = [[0, 0, 2.6, 0.5], [0.55, 0.35, 1.8, 0.36], [-0.5, 0.3, 2.0, 0.38], [0.2, -0.6, 1.5, 0.32], [-0.35, -0.45, 1.3, 0.28]];
        crystalCluster.forEach(([px, pz, height, radius], i) => {
            const crystal = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6), crystalMats[i % 2]);
            crystal.rotation.x = Math.PI;
            crystal.rotation.z = (i - 2) * 0.05;
            crystal.position.set(px, h - height / 2 + 0.05, pz);
            room.add(crystal);
        });

        // Csak ebben a szobában világít (a 101. szinten); a fényszám állandó marad, így nincs shader-újrafordítás
        const light = new THREE.PointLight(0xe8a888, 0, 24, 0.7);
        light.position.set(offsetX + 8, 4.8, 0);
        light.userData.podOnlyIntensity = 7;
        this.scene.add(light);
        this.nodeLights.push(light);
        const crystalLight = new THREE.PointLight(0x2fd8bb, 0, 16, 1.5);
        crystalLight.position.set(offsetX, 4.2, 0);
        this.scene.add(crystalLight);
        this.nodeLights.push(crystalLight);
        const pitLight = new THREE.PointLight(0xff5a2a, 0, 16, 1.5);
        pitLight.position.set(offsetX, -9, 0);
        this.scene.add(pitLight);
        this.nodeLights.push(pitLight);

        // A valódi barlangtextúrák betöltődésekor kicserélik a generáltakat
        this.loadCaveTexture('podWall', (tex) => {
            wallMat.map = tex;
            wallMat.color.setHex(0xffffff);
            wallMat.needsUpdate = true;
        });
        this.loadCaveTexture('wall', (tex) => {
            for (const m of [rockMat, deepRockMat]) { m.map = tex; m.needsUpdate = true; }
            rockMat.color.setHex(0xffffff);
            deepRockMat.color.setHex(0xd8d0cb);
        });
        this.loadCaveTexture('floor', (tex) => { floorTexMat.map = tex; floorTexMat.color.setHex(0xe6dcd5); floorTexMat.needsUpdate = true; });
        this.loadCaveTexture('floorCracked', (tex) => { patchMat.map = tex; patchMat.color.setHex(0xe6dcd5); patchMat.needsUpdate = true; });
        this.loadCaveTexture('liftWall', (tex) => {
            for (const m of [frameMat, panelMat]) { m.map = tex; m.color.setHex(0x9a9a9a); m.needsUpdate = true; }
            rampMat.map = tex;
            rampMat.color.setHex(0x8c8c8c);
            rampMat.needsUpdate = true;
        });
        this.loadCaveTexture('crystal', (tex) => {
            for (const m of crystalMats) { m.map = tex; m.emissiveMap = tex; m.color.setHex(0xffffff); m.needsUpdate = true; }
            crystalMats[0].emissive.setHex(0xa8f0ff);
            crystalMats[1].emissive.setHex(0xffd890);
        });

        this.nodeSectionGroup.add(room);
        this.finalPodRoom = room;
        this.finalPodRoomCollisions = boxes;
    }

    setNodeSectionActive(isActive, isFinal = false) {
        if (this.nodeSectionActive === isActive && !isActive) return;
        this.nodeSectionActive = isActive;
        this.finalPodRoomActive = isActive && isFinal;
        if (this.sectorArenaItems) {
            for (const item of this.sectorArenaItems) item.visible = !this.finalPodRoomActive;
        }
        this.setFinalSectorPodDisplay(this.finalPodRoomActive);
        if (this.finalPodRoom) this.finalPodRoom.visible = this.finalPodRoomActive;
        if (this.finalPodRoomActive) this.showSingleCabin(-sectorHallCenter, 0);
        else if (!this.isElevatorMoving) this.hideSingleCabin();
        if (this.nodeSigns) {
            for (const sign of this.nodeSigns) sign.mesh.material = this.finalPodRoomActive ? sign.final : sign.normal;
        }
        for (const door of this.nodeDoors) {
            door.progress = 0;
            door.target = 0;
            door.mesh.position.y = door.closedY;
            door.mesh.visible = true;
        }
        if (this.nodeTerminalGroup) this.nodeTerminalGroup.visible = true;
        this.setSectorPodActive(false);
        this.applyReplacedDoors();
    }

    setFinalSectorPodDisplay(isFinal) {
        if (!this.sectorRegenerationPod || !this.sectorPodVisibility) return;
        if (!isFinal) {
            for (const [object, visible] of this.sectorPodVisibility) object.visible = visible;
            return;
        }
        for (const [object] of this.sectorPodVisibility) object.visible = false;
    }

    setNodeDoorOpen(id, isOpen) {
        const door = this.nodeDoors.find(entry => entry.id === id);
        if (door) door.target = isOpen ? 1 : 0;
    }

    setNodeCleared() {
        if (!this.nodeSectionActive) return;
        this.setNodeDoorOpen('gate', true);
        if (this.nodeTerminalGroup) this.nodeTerminalGroup.visible = true;
    }

    updateNodeDoors(delta) {
        for (const door of this.nodeDoors) {
            if (door.progress === door.target) continue;
            door.progress = THREE.MathUtils.damp(door.progress, door.target, 3, delta);
            if (Math.abs(door.progress - door.target) < 0.005) door.progress = door.target;
            door.mesh.position.y = door.closedY + (door.openY - door.closedY) * door.progress;
            door.mesh.visible = door.progress < 0.99;
        }
    }

    setResearchRoomsActive(isActive) {
        if (this.researchRoomsActive === isActive) return;
        this.researchRoomsActive = isActive;
        this.applyReplacedDoors();
    }

    // A kapuk mögötti alap folyosót az R&D szoba vagy a szerverfolyosó váltja ki
    applyReplacedDoors() {
        for (const door of this.doors) {
            const replaced = (this.researchRoomsActive && door.isResearchDoor) || (this.nodeSectionActive && door.isNodeDoor);
            door.replaced = replaced;
            for (const part of door.corridorParts) part.visible = !replaced;
            door.corridorLight.disabled = replaced;
            door.corridorHitboxes.forEach((box, index) => {
                if (replaced) box.makeEmpty();
                else box.copy(door.corridorHitboxBackups[index]);
            });
        }
        this.syncResearchRoomVisibility();
    }

    // A látható fények száma a pályarészek (kapuk, szerverterem, barlang, kabin) váltásakor megváltozik, ilyenkor a three.js
    // újrafordítja az összes anyag shaderét: ez okozta az akadozást. Betöltéskor minden változatot egyszer lefordítunk.
    prewarmLightStates(renderer, camera) {
        if (!renderer || !camera || !this.scene) return;
        const savedOffset = this.caveWorldOffset;
        try {
            if (!this.caveGroup) {
                this.caveWorldOffset = -sectorHallCenter;
                this.buildCave();
                this.caveWorldOffset = savedOffset;
                this.caveGroup.position.x = savedOffset;
            }
            if (!this.cabinGroup) {
                this.showSingleCabin(0, 0);
                this.hideSingleCabin();
            }
            const targets = [this.gatesGroup, this.serverRoomGroup, this.caveGroup, this.nodeSectionGroup, this.cabinGroup, this.sectorRegenerationPod]
                .filter(Boolean);
            // Az r128 compile() a rejtett objektumokat is bejárja, ezért valódi, apró célpufferbe renderelünk
            const target = new THREE.WebGLRenderTarget(16, 16);
            target.texture.encoding = renderer.outputEncoding;
            const culled = [];
            this.scene.traverse((o) => { if (o.isMesh && o.frustumCulled) { culled.push(o); o.frustumCulled = false; } });
            const saved = targets.map(t => t.visible);
            const prevTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(target);
            for (let mask = 0; mask < (1 << targets.length); mask++) {
                targets.forEach((t, i) => { t.visible = !!(mask & (1 << i)); });
                renderer.render(this.scene, camera);
            }
            renderer.setRenderTarget(prevTarget);
            targets.forEach((t, i) => { t.visible = saved[i]; });
            for (const o of culled) o.frustumCulled = true;
            target.dispose();
        } catch (err) {
            console.warn('[KRONOS] Fényváltozat előmelegítés figyelmeztetés:', err);
        }
    }

    syncResearchRoomVisibility() {
        const gatesVisible = !!this.gatesGroup && this.gatesGroup.visible;
        const hubVisible = this.researchRoomsActive && gatesVisible;
        const nodeVisible = this.nodeSectionActive && gatesVisible;
        if (this.researchHubGroup) this.researchHubGroup.visible = hubVisible;
        if (this.nodeSectionGroup) this.nodeSectionGroup.visible = nodeVisible;
        this.isResearchHubVisible = hubVisible;
        this.isNodeSectionVisible = nodeVisible;
        for (const light of this.researchRoomLights) light.intensity = hubVisible ? 2.4 : 0;
        for (const light of this.nodeLights) {
            const podOnly = light.userData.podOnlyIntensity;
            light.intensity = !nodeVisible ? 0 : podOnly !== undefined ? (this.finalPodRoomActive ? podOnly : 0) : 2.4;
        }
    }

    showSingleCabin(x, z) {
        if (!this.cabinGroup) {
            const group = new THREE.Group();
            const half = 1.25;
            const frameMat = new THREE.MeshStandardMaterial({ color: 0x222c32, metalness: 0.5, roughness: 0.6 });
            const armorMat = new THREE.MeshStandardMaterial({ color: 0x141b20, metalness: 0.4, roughness: 0.65 });
            const warningMat = new THREE.MeshStandardMaterial({ color: 0xff3348, emissive: 0xb80b1e, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.3 });
            const liftCeilMat = new THREE.MeshStandardMaterial({ color: 0x141b20, metalness: 0.4, roughness: 0.65 });
            this.cabinTexMats = { wall: armorMat, ceiling: liftCeilMat, frame: frameMat, shaft: null };
            const part = (geometry, material, px, py, pz) => {
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(px, py, pz);
                group.add(mesh);
                return mesh;
            };
            part(new THREE.BoxGeometry(2.65, 0.18, 2.65), armorMat, 0, -0.03, 0);
            part(new THREE.BoxGeometry(2.55, 0.08, 2.55), frameMat, 0, 0.08, 0);
            part(new THREE.BoxGeometry(2.62, 0.12, 2.62), liftCeilMat, 0, 3.24, 0);
            for (const sx of [-1, 1]) {
                for (const sz of [-1, 1]) {
                    part(new THREE.BoxGeometry(0.14, 3.2, 0.14), frameMat, sx * half, 1.65, sz * half);
                }
            }
            for (const side of [-1, 1]) {
                part(new THREE.BoxGeometry(0.09, 2.65, 0.72), armorMat, -half, 1.65, side * 0.86);
                part(new THREE.BoxGeometry(0.09, 2.65, 0.72), armorMat, half, 1.65, side * 0.86);
                // Ablakkal áttört hátsó/első fal: ezen át látszik az akna lefelé menet
                part(new THREE.BoxGeometry(2.38, 0.975, 0.09), armorMat, 0, 0.8125, side * half);
                part(new THREE.BoxGeometry(2.38, 0.875, 0.09), armorMat, 0, 2.5375, side * half);
                part(new THREE.BoxGeometry(0.59, 0.8, 0.09), armorMat, -0.895, 1.7, side * half);
                part(new THREE.BoxGeometry(0.59, 0.8, 0.09), armorMat, 0.895, 1.7, side * half);
                part(new THREE.BoxGeometry(1.22, 0.05, 0.12), frameMat, 0, 1.3, side * half);
                part(new THREE.BoxGeometry(1.22, 0.05, 0.12), frameMat, 0, 2.1, side * half);
            }
            for (const side of [-1, 1]) {
                const panel = part(new THREE.BoxGeometry(0.08, 2.72, 0.69), armorMat, half - 0.05, 1.63, side * 0.34);
                this.cabinDoorPanels.push({ mesh: panel, side });
            }
            const controlPanel = part(new THREE.BoxGeometry(0.12, 0.75, 0.34), frameMat, -0.72, 1.55, -half + 0.08);
            controlPanel.rotation.y = Math.PI / 2;
            part(new THREE.BoxGeometry(0.035, 0.42, 0.22), warningMat, -0.79, 1.6, -half + 0.1);
            const light = new THREE.PointLight(0xff3048, 1.5, 8, 1.8);
            light.position.set(0, 2.8, 0);
            group.add(light);
            // Lefelé haladáskor a kabin körül felfelé suhanó repedezett kőfalú akna: ez adja a süllyedés érzetét
            const fx = new THREE.Group();
            fx.visible = false;
            const shaftWallMat = new THREE.MeshStandardMaterial({ color: 0x4a2c22, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
            const beamMat = new THREE.MeshStandardMaterial({ color: 0x1a2227, metalness: 0.5, roughness: 0.6 });
            this.cabinShaftWallMat = shaftWallMat;
            this.cabinFxItems = [];
            const shaftHalf = 1.9;
            const segHeight = 6;
            for (let seg = 0; seg < 4; seg++) {
                const segment = new THREE.Group();
                segment.position.y = -9 + seg * segHeight;
                for (let k = 0; k < 4; k++) {
                    const plane = new THREE.Mesh(new THREE.PlaneGeometry(shaftHalf * 2, segHeight), shaftWallMat);
                    plane.position.set(Math.sin(k * Math.PI / 2) * shaftHalf, 0, Math.cos(k * Math.PI / 2) * shaftHalf);
                    plane.rotation.y = k * Math.PI / 2 + Math.PI;
                    segment.add(plane);
                }
                const beam = new THREE.Mesh(new THREE.BoxGeometry(shaftHalf * 2 + 0.2, 0.22, 0.22), beamMat);
                beam.position.set(0, segHeight / 2, shaftHalf - 0.08);
                segment.add(beam);
                const beam2 = beam.clone();
                beam2.position.set(0, segHeight / 2, -shaftHalf + 0.08);
                segment.add(beam2);
                fx.add(segment);
                this.cabinFxItems.push(segment);
            }
            group.add(fx);
            this.cabinTexMats.shaft = shaftWallMat;
            this.cabinShaftFx = fx;
            this.cabinGlassMats = [frameMat, armorMat];
            this.cabinGroup = group;
            this.scene.add(group);
            if (this.caveTexturesRequested) this.applyCabinTextures();
        }
        this.cabinGroup.position.set(x, 0, z);
        this.cabinGroup.visible = true;
        this.cabinCenter = { x, z };
        this.cabinDoorProgress = 0;
        this.cabinDoorTarget = 0;
        this.updateCabinDoorPose();
    }

    // Hullámzó, véletlenszerűen villódzó barlangfények és időnkénti kisebb földrengések
    updateCaveEffects(delta) {
        if (!this.caveShellHidden || !this.caveFlicker) return;
        const now = (this.caveFxTime = (this.caveFxTime || 0) + delta);
        for (const f of this.caveFlicker) {
            f.next -= delta;
            if (f.next <= 0) {
                f.next = 0.4 + Math.random() * 2.2;
                f.kick = (Math.random() - 0.5) * 0.7;
            }
            f.kick = THREE.MathUtils.damp(f.kick, 0, 3, delta);
            const wave = Math.sin(now * f.speed + f.phase) * 0.18 + Math.sin(now * f.speed * 2.7 + f.phase * 1.9) * 0.1;
            f.light.intensity = f.base * Math.max(0.3, 1 + wave + f.kick);
        }
        if (this.caveTunnelGlowMat) {
            this.caveTunnelGlowMat.opacity = (this.caveGateTextured ? 0.85 : 0.5) + Math.sin(now * 1.3) * 0.08 + Math.sin(now * 3.1 + 1) * 0.06;
        }
        if (this.isElevatorMoving) return;
        this.caveRumbleTimer = (this.caveRumbleTimer === undefined ? 6 : this.caveRumbleTimer) - delta;
        if (this.caveRumbleTimer <= 0) {
            this.caveRumbleTimer = 6 + Math.random() * 9;
            EventBus.emit('CAMERA_SHAKE', 0.12 + Math.random() * 0.14);
        }
    }

    updateCabinShaftFx(delta) {
        if (!this.cabinShaftFx) return;
        const active = !!this.cabinGroup && this.cabinGroup.visible && this.isElevatorMoving && !this.caveShellHidden;
        const fadeTarget = active ? 1 : 0;
        this.cabinFxFade = THREE.MathUtils.damp(this.cabinFxFade || 0, fadeTarget, 3, delta);
        const fade = this.cabinFxFade;
        this.cabinShaftFx.visible = fade > 0.02;
        if (!this.cabinShaftFx.visible) return;
        const rise = Math.max(this.elevatorSpeed, 0.2) * 7.0 * delta;
        for (const item of this.cabinFxItems) {
            item.position.y += rise;
            if (item.position.y > 15) item.position.y -= 24;
        }
    }

    hideSingleCabin() {
        if (this.cabinGroup) this.cabinGroup.visible = false;
        this.cabinCenter = null;
    }

    updateCabinDoorPose() {
        for (const { mesh, side } of this.cabinDoorPanels) {
            mesh.position.z = side * (0.78 - this.cabinDoorProgress * 0.44);
        }
    }

    // A barlang textúrái külső képek (2048 px): csak a barlang előtt töltődnek be, és betöltésig a generált textúra marad
    loadCaveTexture(key, onReady) {
        const base = 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/db78bfe9900ca50572496fface14e2f09d6862cf/Pictures/';
        const files = {
            wall: 'barlang%20fal.jpg',
            crystal: 'barlang%20krist%C3%A1ly.jpg',
            floorCracked: 'barlang%20talaj%20reped%C3%A9ssel.jpg',
            floor: 'barlang%20talaj.jpg',
            stalactite: 'barlang%20cseppk%C5%91.jpg',
            tunnel: 'NEW:barlang%20j%C3%A1rat.jpg',
            liftWall: 'NEW:barlang%20lift%20fal.jpg',
            liftCeiling: 'NEW:barlang%20lift%20mennyezet.jpg',
            podWall: 'NEW:barlang%20talaj.jpg'
        };
        const newBase = 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/46399bd0bc0c099bef3a82537ef5d40017b595e2/Pictures/';
        if (!this.caveTextureCache) this.caveTextureCache = {};
        let entry = this.caveTextureCache[key];
        if (!entry) {
            entry = { tex: null, waiting: [] };
            this.caveTextureCache[key] = entry;
            const file = files[key];
            const url = file.startsWith('NEW:') ? newBase + file.slice(4) : base + file;
            new THREE.TextureLoader().load(url, (tex) => {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.encoding = THREE.sRGBEncoding;
                tex.anisotropy = 4;
                entry.tex = tex;
                if (this.renderer) this.renderer.initTexture(tex);
                for (const fn of entry.waiting) fn(tex);
                entry.waiting.length = 0;
            }, undefined, () => { entry.waiting.length = 0; });
        }
        if (entry.tex) onReady(entry.tex);
        else if (onReady) entry.waiting.push(onReady);
    }

    preloadCaveTextures() {
        for (const key of ['wall', 'crystal', 'floorCracked', 'floor', 'stalactite', 'tunnel', 'liftWall', 'liftCeiling']) this.loadCaveTexture(key, () => {});
        this.caveTexturesRequested = true;
        this.applyCabinTextures();
    }

    // A barlangba vezető lift belső fala és mennyezete
    applyCabinTextures() {
        const mats = this.cabinTexMats;
        if (!mats) return;
        this.loadCaveTexture('liftWall', (tex) => {
            mats.wall.map = tex;
            mats.wall.color.setHex(0x8c8c8c);
            mats.wall.needsUpdate = true;
        });
        this.loadCaveTexture('liftWall', (tex) => {
            mats.frame.map = tex;
            mats.frame.color.setHex(0x8c8c8c);
            mats.frame.needsUpdate = true;
        });
        this.loadCaveTexture('floorCracked', (tex) => {
            if (!mats.shaft) return;
            mats.shaft.map = tex;
            mats.shaft.color.setHex(0xe0d6d0);
            mats.shaft.needsUpdate = true;
        });
        this.loadCaveTexture('liftCeiling', (tex) => {
            mats.ceiling.map = tex;
            mats.ceiling.color.setHex(0x8c8c8c);
            mats.ceiling.needsUpdate = true;
        });
    }

    createCaveTexture(base, fleck, seed) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        context.fillStyle = base;
        context.fillRect(0, 0, canvas.width, canvas.height);
        let state = seed;
        for (let i = 0; i < 190; i++) {
            state = (state * 1664525 + 1013904223) >>> 0;
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const radius = 5 + (state % 420) / 10;
            const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, i % 3 === 0 ? 'rgba(12,5,4,0.25)' : fleck);
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            context.fillStyle = gradient;
            context.beginPath();
            context.ellipse(x, y, radius, radius * (0.35 + Math.random() * 0.55), Math.random() * Math.PI, 0, Math.PI * 2);
            context.fill();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        texture.encoding = THREE.sRGBEncoding;
        return texture;
    }

    buildCave() {
        const group = new THREE.Group();
        group.position.x = this.caveWorldOffset;
        const collisions = [];
        const rockTexture = this.createCaveTexture('#7d5a49', 'rgba(210,95,50,0.34)', 9817);
        const floorTexture = this.createCaveTexture('#775847', 'rgba(190,120,85,0.22)', 12661);
        const rockMat = new THREE.MeshStandardMaterial({
            color: 0xe0cfc2, map: rockTexture,
            roughness: 0.94, metalness: 0.02, flatShading: true
        });
        const deepRockMat = new THREE.MeshStandardMaterial({
            color: 0xb49f90, map: rockTexture,
            roughness: 0.97, metalness: 0, flatShading: true
        });
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0xcdb8a8, map: floorTexture,
            roughness: 0.96, metalness: 0.02, side: THREE.DoubleSide
        });
        const scaleUv = (geometry, factor) => {
            const uv = geometry.attributes.uv;
            for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * factor, uv.getY(i) * factor);
            return geometry;
        };
        const ground = new THREE.Mesh(scaleUv(new THREE.PlaneGeometry(70, 70, 1, 1), 9), floorMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.025;
        group.add(ground);
        const stalactiteMat = new THREE.MeshStandardMaterial({ color: 0xc9a88f, map: rockTexture, roughness: 0.95, metalness: 0.02, flatShading: true });
        const crystalMats = [
            new THREE.MeshStandardMaterial({ color: 0x2c9c88, emissive: 0x12b89c, emissiveIntensity: 1.2, roughness: 0.22, metalness: 0.1 }),
            new THREE.MeshStandardMaterial({ color: 0xe75f2b, emissive: 0xe0471a, emissiveIntensity: 1.2, roughness: 0.28, metalness: 0.05 })
        ];
        const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x3a2a24, map: rockTexture, roughness: 1, side: THREE.DoubleSide });
        // Repedezett, izzó talajfoltok lágy szélű átmenettel a sima talajon
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = patchCanvas.height = 128;
        const patchCtx = patchCanvas.getContext('2d');
        const patchGradient = patchCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
        patchGradient.addColorStop(0, '#fff');
        patchGradient.addColorStop(0.55, '#bbb');
        patchGradient.addColorStop(1, '#000');
        patchCtx.fillStyle = patchGradient;
        patchCtx.fillRect(0, 0, 128, 128);
        const patchAlpha = new THREE.CanvasTexture(patchCanvas);
        const patchMat = new THREE.MeshStandardMaterial({
            color: 0xcdb8a8, map: floorTexture, alphaMap: patchAlpha, transparent: true, depthWrite: false,
            roughness: 0.9, metalness: 0.02, polygonOffset: true, polygonOffsetFactor: -2
        });
        const patchSpots = [[-14, -9, 9], [10, -17, 8], [17, 8, 10], [-6, 14, 8], [-19, 17, 7], [2, -3, 6], [24, -22, 7], [-24, -20, 8]];
        for (const [px, pz, size] of patchSpots) {
            const patch = new THREE.Mesh(scaleUv(new THREE.PlaneGeometry(size * 2, size * 2), size / 4), patchMat);
            patch.rotation.x = -Math.PI / 2;
            patch.rotation.z = Math.random() * Math.PI;
            patch.position.set(px, 0.006, pz);
            group.add(patch);
        }
        // A valódi textúrák betöltődésekor kicserélik a generáltakat
        const useTexture = (key, apply) => this.loadCaveTexture(key, (tex) => { if (this.caveGroup === group || !this.caveGroup) apply(tex); });
        useTexture('wall', (tex) => {
            for (const m of [rockMat, deepRockMat, ceilingMat]) { m.map = tex; m.needsUpdate = true; }
            rockMat.color.setHex(0xffffff);
            deepRockMat.color.setHex(0xd8d0cb);
            ceilingMat.color.setHex(0x9a8a82);
        });
        useTexture('floor', (tex) => { floorMat.map = tex; floorMat.color.setHex(0xe6dcd5); floorMat.needsUpdate = true; });
        useTexture('floorCracked', (tex) => { patchMat.map = tex; patchMat.color.setHex(0xe6dcd5); patchMat.needsUpdate = true; });
        useTexture('stalactite', (tex) => { stalactiteMat.map = tex; stalactiteMat.color.setHex(0xffffff); stalactiteMat.needsUpdate = true; });
        useTexture('crystal', (tex) => {
            for (const m of crystalMats) { m.map = tex; m.emissiveMap = tex; m.color.setHex(0xffffff); m.needsUpdate = true; }
            crystalMats[0].emissive.setHex(0xa8f0ff);
            crystalMats[1].emissive.setHex(0xffd890);
        });

        const walls = new THREE.Group();
        walls.visible = false;
        const wallRockGeo = new THREE.IcosahedronGeometry(1, 1);
        const positions = wallRockGeo.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const variation = 0.82 + Math.random() * 0.38;
            positions.setXYZ(i, positions.getX(i) * variation, positions.getY(i) * variation, positions.getZ(i) * variation);
        }
        wallRockGeo.computeVertexNormals();
        let rockIndex = 0;
        // A falban lévő járatok (12 db: minden falon 3) középpontjai a fal mentén
        const tunnelCenters = [-14, 0, 14];
        for (let value = -27; value <= 27; value += 3.1) {
            const nearTunnel = tunnelCenters.some(c => Math.abs(value - c) < 9.6);
            for (const [x, z] of [[value, -27], [value, 27], [-27, value], [27, value]]) {
                if (nearTunnel) continue;
                const rock = new THREE.Mesh(wallRockGeo, rockIndex++ % 3 ? rockMat : deepRockMat);
                const size = 2.3 + Math.random() * 1.7;
                rock.position.set(x + (Math.random() - 0.5) * 1.2, 2.2 + Math.random() * 2.0, z + (Math.random() - 0.5) * 1.2);
                rock.scale.set(size * (0.7 + Math.random() * 0.6), 3.0 + Math.random() * 3.4, size * (0.7 + Math.random() * 0.6));
                rock.rotation.set(Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.5);
                walls.add(rock);
                const reach = size * 0.72;
                collisions.push(new THREE.Box3(
                    new THREE.Vector3(rock.position.x - reach + this.caveWorldOffset, 0, rock.position.z - reach),
                    new THREE.Vector3(rock.position.x + reach + this.caveWorldOffset, 6, rock.position.z + reach)
                ));
            }
        }

        // A mennyezetről lelógó cseppkövek, közöttük kristályok
        const stalactiteGeo = new THREE.ConeGeometry(1, 1, 7, 2);
        const ceilingCrystalMats = crystalMats;
        const crystalGeo = new THREE.ConeGeometry(0.4, 1, 6);
        for (let i = 0; i < 110; i++) {
            const x = (Math.random() - 0.5) * 56;
            const z = (Math.random() - 0.5) * 56;
            const isCrystal = i % 4 === 0;
            const length = isCrystal ? 1.2 + Math.random() * 2.2 : 1.2 + Math.random() * 4.2;
            const spike = new THREE.Mesh(isCrystal ? crystalGeo : stalactiteGeo, isCrystal ? ceilingCrystalMats[(i >> 2) % 2] : stalactiteMat);
            spike.position.set(x, 9.3 - length / 2, z);
            const width = isCrystal ? 0.6 + Math.random() * 0.7 : 0.5 + Math.random() * 1.6;
            spike.scale.set(width, length, width);
            spike.rotation.x = Math.PI;
            spike.rotation.z = (Math.random() - 0.5) * 0.4;
            spike.rotation.y = Math.random() * Math.PI;
            walls.add(spike);
        }
        // Falban lévő járatok: innen jönnek elő az ellenfelek és ezekből ömlik a vörös füst
        const tunnelGlowMat = new THREE.MeshBasicMaterial({ color: 0xff2a14, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        useTexture('tunnel', (tex) => {
            tunnelGlowMat.map = tex;
            tunnelGlowMat.color.setHex(0xffffff);
            tunnelGlowMat.needsUpdate = true;
            this.caveGateTextured = true;
        });
        const tunnelDarkMat = new THREE.MeshBasicMaterial({ color: 0x120303 });
        const tunnels = [];
        const addTunnelBox = (cx, cy, cz, sx, sy, sz, material, solid) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material);
            mesh.position.set(cx, cy, cz);
            walls.add(mesh);
            if (solid) {
                collisions.push(new THREE.Box3(
                    new THREE.Vector3(cx - sx / 2 + this.caveWorldOffset, 0, cz - sz / 2),
                    new THREE.Vector3(cx + sx / 2 + this.caveWorldOffset, sy, cz + sz / 2)
                ));
            }
        };
        const tunnelDepthStart = 25.0, tunnelDepthEnd = 35.0, tunnelHalfWidth = 4.3, blockOuter = 9.4, wallHeight = 9.2;
        const depthCenter = (tunnelDepthStart + tunnelDepthEnd) / 2, depthLength = tunnelDepthEnd - tunnelDepthStart;
        for (const wallSign of [-1, 1]) {
            for (const c of tunnelCenters) {
                for (const alongX of [true, false]) {
                    // alongX: a járat a z = ±27 falon nyílik (a fal mentén az x tengely a lateral)
                    const place = (lateral, depth) => alongX
                        ? { x: lateral, z: wallSign * depth }
                        : { x: wallSign * depth, z: lateral };
                    const box = (lateralCenter, lateralSize, depthCenterValue, depthSize, y, height, material, solid) => {
                        const p = place(lateralCenter, depthCenterValue);
                        addTunnelBox(p.x, y, p.z,
                            alongX ? lateralSize : depthSize, height, alongX ? depthSize : lateralSize, material, solid);
                    };
                    const blockWidth = blockOuter - tunnelHalfWidth;
                    const blockCenter = (blockOuter + tunnelHalfWidth) / 2;
                    for (const side of [-1, 1]) {
                        box(c + side * blockCenter, blockWidth, depthCenter, depthLength, wallHeight / 2, wallHeight, deepRockMat, true);
                    }
                    box(c, tunnelHalfWidth * 2, depthCenter, depthLength, wallHeight - 0.8, 1.6, deepRockMat, false);
                    box(c, tunnelHalfWidth * 2, tunnelDepthEnd + 0.25, 0.5, wallHeight / 2, wallHeight, tunnelDarkMat, true);
                    const glow = place(c, tunnelDepthEnd - 0.1);
                    const glowPanel = new THREE.Mesh(new THREE.PlaneGeometry(tunnelHalfWidth * 2, wallHeight), tunnelGlowMat);
                    glowPanel.position.set(glow.x, wallHeight / 2, glow.z);
                    if (!alongX) glowPanel.rotation.y = Math.PI / 2;
                    walls.add(glowPanel);
                    // Szabálytalan sziklák: a járat szélei, boltozata és szája nem egyenes
                    const tunnelRock = (lateral, depth, y, size) => {
                        const p = place(lateral, depth);
                        const rock = new THREE.Mesh(wallRockGeo, Math.random() < 0.5 ? rockMat : deepRockMat);
                        rock.position.set(p.x, y, p.z);
                        rock.scale.set(size * (0.7 + Math.random() * 0.7), size * (0.8 + Math.random() * 0.9), size * (0.7 + Math.random() * 0.7));
                        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
                        walls.add(rock);
                    };
                    // Nagy, egymásra torlódó sziklák: a járat oldalait és boltozatát teljesen eltakarják
                    for (let d = tunnelDepthStart - 1.0; d < tunnelDepthStart + 7; d += 2.0 + Math.random() * 0.8) {
                        for (const side of [-1, 1]) {
                            for (let y = 1.0; y < wallHeight + 0.5; y += 2.3 + Math.random() * 0.8) {
                                const size = 2.2 + Math.random() * 1.2;
                                tunnelRock(c + side * (tunnelHalfWidth + size * 0.55 + (Math.random() - 0.5) * 0.8), d + (Math.random() - 0.5) * 0.8, y, size);
                            }
                        }
                        for (let l = -tunnelHalfWidth; l <= tunnelHalfWidth + 0.1; l += 2.6) {
                            tunnelRock(c + l + (Math.random() - 0.5) * 1.2, d, 8.2 + Math.random() * 1.0, 2.0 + Math.random() * 1.2);
                        }
                    }
                    // A járat szája: nagy boltív-sziklák és a sarkoknál kiálló tömbök
                    for (let k = 0; k < 9; k++) {
                        const archAngle = Math.PI * k / 8;
                        const size = 2.4 + Math.random() * 1.4;
                        tunnelRock(c + Math.cos(archAngle) * (tunnelHalfWidth + size * 0.45),
                            tunnelDepthStart - 0.6 + Math.random() * 1.0,
                            wallHeight * 0.45 + Math.sin(archAngle) * (wallHeight * 0.55), size);
                    }
                    tunnels.push({
                        lateral: c,
                        outX: alongX ? 0 : wallSign,
                        outZ: alongX ? wallSign : 0,
                        isXAxis: alongX,
                        mouth: place(c, 27)
                    });
                }
            }
        }
        this.caveTunnels = tunnels;
        const ceiling = new THREE.Mesh(
            scaleUv(new THREE.PlaneGeometry(70, 70), 8),
            ceilingMat
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 9.2;
        walls.add(ceiling);
        group.add(walls);
        this.caveWalls = walls;

        const caveFlicker = [];
        const glowMats = crystalMats;
        for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI * 2 / 8;
            const x = Math.cos(angle) * (13 + i % 3 * 2.5);
            const z = Math.sin(angle) * (13 + i % 3 * 2.5);
            const crystalMat = glowMats[i % 2];
            for (let shard = 0; shard < 3; shard++) {
                const height = 1.2 + ((i + shard) % 3) * 0.75;
                const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.28 + shard * 0.08, height, 6), crystalMat);
                crystal.position.set(x + (shard - 1) * 0.42, height / 2, z + (shard % 2 ? 0.28 : -0.18));
                crystal.rotation.z = (shard - 1) * 0.14;
                group.add(crystal);
            }
            const light = new THREE.PointLight(i % 2 ? 0x2fd8bb : 0xff6034, 38, 32, 1.5);
            light.position.set(x, 1.5, z);
            group.add(light);
            caveFlicker.push({ light, base: 38, phase: Math.random() * 10, speed: 0.7 + Math.random() * 1.6, next: 0, kick: 0 });
        }

        // Falak mentén álló, csak világító kristálycsoportok (fényforrás nélkül, hogy olcsó maradjon)
        for (let i = 0; i < 14; i++) {
            const angle = (i + 0.5) * Math.PI * 2 / 14;
            const radius = 21 + (i % 3);
            for (let shard = 0; shard < 2; shard++) {
                const height = 1.6 + ((i + shard) % 3) * 0.9;
                const crystal = new THREE.Mesh(new THREE.ConeGeometry(0.34 + shard * 0.1, height, 6), glowMats[(i + shard) % 2]);
                crystal.position.set(Math.cos(angle) * radius + shard * 0.5, height / 2, Math.sin(angle) * radius + shard * 0.3);
                crystal.rotation.z = (shard - 0.5) * 0.2;
                group.add(crystal);
            }
        }
        // A barlangi lift: panelburkolatú padlólemez és a mennyezet fölé nyúló, könnyű szerkezetű lift akna
        const liftPanelMat = new THREE.MeshStandardMaterial({ color: 0x4a5258, metalness: 0.3, roughness: 0.7, side: THREE.DoubleSide });
        const liftFrameMat = new THREE.MeshStandardMaterial({ color: 0x222c32, metalness: 0.5, roughness: 0.6 });
        useTexture('liftWall', (tex) => {
            liftPanelMat.map = tex; liftPanelMat.color.setHex(0x9a9a9a); liftPanelMat.needsUpdate = true;
            liftFrameMat.map = tex; liftFrameMat.color.setHex(0x8c8c8c); liftFrameMat.needsUpdate = true;
        });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.06, 4.4), liftPanelMat);
        pad.position.set(0, 0.03, 0);
        group.add(pad);
        const shaft = new THREE.Group();
        const shaftHalf = 1.4;
        const bayHeight = 1.75;
        const shaftBottom = 3.3;
        const shaftTop = 10.8;
        const bays = Math.ceil((shaftTop - shaftBottom) / bayHeight);
        const shaftMeshes = (geometry, material, x, y, z, parent) => {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, y, z);
            parent.add(mesh);
            return mesh;
        };
        for (let k = 0; k < 4; k++) {
            const face = new THREE.Group();
            face.rotation.y = k * Math.PI / 2;
            shaftMeshes(new THREE.BoxGeometry(0.12, shaftTop - shaftBottom, 0.12), liftFrameMat, shaftHalf, (shaftTop + shaftBottom) / 2, shaftHalf, face);
            for (let b = 0; b <= bays; b++) {
                shaftMeshes(new THREE.BoxGeometry(shaftHalf * 2, 0.09, 0.09), liftFrameMat, 0, shaftBottom + b * bayHeight, shaftHalf, face);
            }
            for (let b = 0; b < bays; b++) {
                const y = shaftBottom + (b + 0.5) * bayHeight;
                if ((b + k) % 2 === 0) {
                    shaftMeshes(new THREE.BoxGeometry(shaftHalf * 2 - 0.12, bayHeight - 0.1, 0.04), liftPanelMat, 0, y, shaftHalf, face);
                } else {
                    const brace = shaftMeshes(new THREE.BoxGeometry(Math.hypot(shaftHalf * 2, bayHeight), 0.06, 0.06), liftFrameMat, 0, y, shaftHalf, face);
                    brace.rotation.z = Math.atan2(bayHeight, shaftHalf * 2) * (b % 2 ? 1 : -1);
                }
            }
            shaft.add(face);
        }
        group.add(shaft);
        group.add(new THREE.AmbientLight(0xd8987c, 4.2));

        const coreGlow = new THREE.PointLight(0xff5a2a, 45, 50, 1.5);
        coreGlow.position.set(0, 1.2, 0);
        group.add(coreGlow);
        caveFlicker.push({ light: coreGlow, base: 45, phase: 3, speed: 1.1, next: 0, kick: 0 });
        this.caveFlicker = caveFlicker;
        this.caveTunnelGlowMat = tunnelGlowMat;

        group.visible = false;
        this.scene.add(group);
        this.caveGroup = group;
        this.caveCollisions = collisions;
    }

    // A barlang külön helyiség: a lift aknaburkolata (falak, kapuk, zsilipek) eltűnik, csak a talaj marad
    setCaveShell(isOn) {
        this.caveShellHidden = isOn;
        this.caveWorldOffset = isOn ? -sectorHallCenter : 0;
        if (this.caveGroup) this.caveGroup.position.x = this.caveWorldOffset;
        if (isOn) {
            this.activeSectorPropCollisions = this.caveCollisions;
            for (const item of this.sectorArenaItems || []) item.visible = false;
        }
        if (this.caveWalls) this.caveWalls.visible = isOn;
        if (this.caveGroup) this.caveGroup.visible = isOn;
        this.applyCaveAtmosphere(isOn);
        if (!isOn) {
            for (const item of this.arenaShellItems || []) item.visible = true;
            if (this.gatesGroup) this.gatesGroup.visible = this.isDoorsOpen;
        }
        this.enforceCaveShell();
    }

    applyCaveAtmosphere(isOn) {
        if (!this.scene || !this.scene.fog) return;
        if (this.defaultFogColor === undefined) this.defaultFogColor = this.scene.fog.color.getHex();
        this.scene.userData.caveAtmosphere = isOn;
        EventBus.emit('CAVE_ATMOSPHERE', !!isOn);
        if (isOn) {
            this.scene.fog.color.setHex(0x331510);
            this.scene.fog.density = 0.013;
            if (this.scene.background && this.scene.background.isColor) this.scene.background.setHex(0x331510);
        } else {
            this.scene.fog.color.setHex(this.defaultFogColor);
            if (this.scene.background && this.scene.background.isColor) this.scene.background.setHex(this.defaultFogColor);
        }
    }

    enforceCaveShell() {
        if (!this.caveShellHidden) return;
        for (const item of this.arenaShellItems || []) item.visible = false;
        if (this.gatesGroup) this.gatesGroup.visible = false;
    }

    setCampaignFloor(floor) {
        const info = getCampaignFloorInfo(floor);
        if (!info.isCaveFloor && this.caveShellHidden) this.setCaveShell(false);
        this.caveWorldOffset = info.isCaveFloor ? -sectorHallCenter : 0;
        if (info.isCaveFloor && !this.caveGroup) this.buildCave();
        if (this.caveGroup) this.caveGroup.position.x = this.caveWorldOffset;
        if (this.caveGroup) this.caveGroup.visible = info.isCaveFloor;
        this.applyCaveAtmosphere(info.isCaveFloor);
        const floorTint = info.isCaveFloor ? 0x6a5248 : info.sector.id === 'alpha' ? 0xd4e2da : info.sector.id === 'beta' ? 0xb99a70 : 0xffffff;
        const wallTint = info.isCaveFloor ? 0x7a5a4a : info.sector.id === 'alpha' ? 0xc8e2d8 : info.sector.id === 'beta' ? 0xd19a58 : 0xffffff;
        if (this.floorMaterial) this.floorMaterial.color.setHex(floorTint);
        if (this.shaftWallMaterial) this.shaftWallMaterial.color.setHex(wallTint);
        for (const [sectorId, group] of Object.entries(this.sectorDressingGroups)) {
            group.visible = !info.isCaveFloor && sectorId === info.sector.id;
        }
        this.activeSectorPropCollisions = info.isCaveFloor ? this.caveCollisions : (this.sectorPropCollisions[info.sector.id] || []);
        if (this.serverRoomGroup) {
            this.serverRoomGroup.visible = info.bossCount > 0 && !info.isCaveFloor;
            this.serverRoomGroup.traverse((object) => {
                if (object.isPointLight) {
                    object.color.setHex(info.sector.color);
                } else if (object.material && object.material.emissive) {
                    object.material.emissive.setHex(info.sector.color);
                } else if (object.material && object.material.isMeshBasicMaterial) {
                    object.material.color.setHex(info.sector.color);
                }
            });
        }
        for (const { mesh, light } of this.warningLights) {
            if (mesh.material) mesh.material.color.setHex(info.sector.color);
            if (light) light.color.setHex(info.sector.color);
        }
        if (this.shaftLensMat) this.shaftLensMat.color.setHex(info.sector.color);
    }

    setTerminalModelOpen(isOpen, isSectorPod = false) {
        if (isSectorPod) {
            this.sectorTerminalModelTargetTime = isOpen ? 0 : this.terminalClosedTime;
            if (this.sectorTerminalModelTime === this.sectorTerminalModelTargetTime) {
                this.sectorTerminalModelMixer?.update(0);
            }
            return;
        }
        this.terminalModelTargetTime = isOpen ? 0 : this.terminalClosedTime;
    }

    setResearchTerminalOpen(station, isOpen) {
        const terminal = this.researchTerminalAnimations.find(entry => entry.station === station);
        if (!terminal || !terminal.action) {
            EventBus.emit('RESEARCH_TERMINAL_ANIMATION_COMPLETE', { station, isOpen });
            return;
        }

        terminal.targetTime = isOpen ? 0 : this.terminalClosedTime;
        if (terminal.time === terminal.targetTime) {
            EventBus.emit('RESEARCH_TERMINAL_ANIMATION_COMPLETE', { station, isOpen });
        }
    }

    setPodDoorOpen(isOpen, isSectorPod = false) {
        if (isSectorPod) this.sectorPodDoorTarget = isOpen ? 1 : 0;
        else this.podDoorTarget = isOpen ? 1 : 0;
    }

    // --- LIFT KÖRNYEZETI MOZGÁS VEZÉRLÉS ---
    startElevator(data) {
        this.isElevatorMoving = true;
        if (data && data.singleCabin && data.singleCabin.hidden) {
            this.hideSingleCabin();
            this.cabinCenter = { x: data.singleCabin.x, z: data.singleCabin.z };
        } else if (data && data.singleCabin) this.showSingleCabin(data.singleCabin.x, data.singleCabin.z);
        else this.hideSingleCabin();
        if (this.cabinGroup && this.cabinGroup.visible) this.cabinDoorTarget = 1;
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
        if (this.caveShellHidden && this.caveTunnels) {
            return this.caveTunnels.map(t => ({
                sillX: t.mouth.x + this.caveWorldOffset,
                sillZ: t.mouth.z,
                outX: -t.outX,
                outZ: -t.outZ,
                isXAxis: t.isXAxis,
                progress: 1,
                targetProgress: 1,
                width: 4.0,
                red: true
            }));
        }
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

    setSterilizationSteam(intensity) {
        this.sterilizationSteamIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
        if (this.sterilizationSteamIntensity > 0 && !this.sterilizationLightSnapshots) {
            this.sterilizationLightSnapshots = this.sterilizationLights.map(({ light, mesh }) => ({
                light,
                mesh,
                lightColor: light.color.clone(),
                lightIntensity: light.intensity,
                meshColor: mesh && mesh.material && mesh.material.color
                    ? mesh.material.color.clone()
                    : null
            }));
            if (this.podPowerLight) {
                this.sterilizationLightSnapshots.push({
                    light: this.podPowerLight,
                    mesh: null,
                    lightColor: this.podPowerLight.color.clone(),
                    lightIntensity: this.podPowerLight.intensity,
                    meshColor: null
                });
            }
        }

        if (this.sterilizationLightSnapshots) {
            for (const snapshot of this.sterilizationLightSnapshots) {
                snapshot.light.color.copy(snapshot.lightColor).lerp(
                    this.sterilizationWhite,
                    this.sterilizationSteamIntensity
                );
                snapshot.light.intensity = THREE.MathUtils.lerp(
                    snapshot.lightIntensity,
                    snapshot.lightIntensity * 1.8,
                    this.sterilizationSteamIntensity
                );
                if (snapshot.meshColor && snapshot.mesh && snapshot.mesh.material) {
                    snapshot.mesh.material.color.copy(snapshot.meshColor).lerp(
                        this.sterilizationWhite,
                        this.sterilizationSteamIntensity
                    );
                }
            }
        }

        if (this.sterilizationSteamIntensity === 0) {
            this.sterilizationLightSnapshots = null;
        } else {
            this.smokeTickTimer = Math.max(this.smokeTickTimer, 0.1);
        }
    }

    emitSterilizationSteam(delta) {
        if (this.sterilizationSteamIntensity <= 0) return;
        this.smokeTickTimer += delta;
        if (this.smokeTickTimer < 0.07) return;

        this.smokeTickTimer = 0;
        EventBus.emit('GATES_STERILIZATION_TICK', {
            gates: this.getGatePouringPositions(),
            intensity: this.sterilizationSteamIntensity
        });
    }

    // --- ZSILIPKAPU NYITÁS ÉS ZÁRÁS VEZÉRLÉS ---
    openDoors(duration = 7.5) {
        if (this.cabinGroup && this.cabinGroup.visible) {
            this.cabinDoorTarget = 0;
            if (!this.caveShellHidden && !this.finalPodRoomActive) this.hideSingleCabin();
        }
        // A 101. szinten a lift indulása elrejti a kabint, ezért a megérkezéskor újra meg kell jeleníteni
        if (this.finalPodRoomActive) this.showSingleCabin(-sectorHallCenter, 0);
        this.isDoorsOpen = true;
        this.elevatorTransitTimer = 0;
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
            if (this.isSpecialFloor() && !d.replaced) continue;
            d.targetProgress = 1.0;
            d.duration = duration;
            if (d.lightMesh && d.lightMesh.material) {
                d.lightMesh.material.color.setHex(0x00ff66);
            }
            if (d.pointLight) {
                d.pointLight.color.setHex(0x00ff66);
            }
        }
        this.syncResearchRoomVisibility();
        if (!this.isSpecialFloor()) EventBus.emit('GATES_SMOKE_BURST', { gates: this.getGatePouringPositions() });
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

    updateLightVisibility(camera) {
        if (!camera) return;

        this.lightProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.lightFrustum.setFromProjectionMatrix(this.lightProjectionMatrix);

        const cameraPosition = camera.position;
        for (const candidate of this.dynamicLightCandidates) {
            if (candidate.tier) {
                const fixture = candidate.fixture;
                this.lightBounds.center.set(fixture.group.position.x, candidate.tier.y, fixture.group.position.z);
                if (!this.lightFrustum.intersectsSphere(this.lightBounds)) {
                    candidate.distanceSq = Infinity;
                    continue;
                }
                const dx = cameraPosition.x - this.lightBounds.center.x;
                const dy = cameraPosition.y - this.lightBounds.center.y;
                const dz = cameraPosition.z - this.lightBounds.center.z;
                candidate.distanceSq = dx * dx + dy * dy + dz * dz;
            } else if (this.gatesGroup.visible && !candidate.disabled) {
                const position = candidate.light.position;
                const dx = cameraPosition.x - position.x;
                const dy = cameraPosition.y - position.y;
                const dz = cameraPosition.z - position.z;
                const distanceSq = dx * dx + dy * dy + dz * dz;
                candidate.distanceSq = distanceSq <= candidate.rangeSq ? distanceSq : Infinity;
            } else {
                candidate.distanceSq = Infinity;
            }
        }

        this.dynamicLightCandidates.sort((a, b) => a.distanceSq - b.distanceSq);
        for (let i = 0; i < this.dynamicLightCandidates.length; i++) {
            const candidate = this.dynamicLightCandidates[i];
            candidate.light.visible = i < this.maxActiveDynamicLights && Number.isFinite(candidate.distanceSq);
        }
    }

    update(delta) {
        this.updateNodeDoors(delta);
        if (this.cabinDoorProgress !== this.cabinDoorTarget) {
            this.cabinDoorProgress = THREE.MathUtils.damp(this.cabinDoorProgress, this.cabinDoorTarget, 4.5, delta);
            if (Math.abs(this.cabinDoorProgress - this.cabinDoorTarget) < 0.005) {
                this.cabinDoorProgress = this.cabinDoorTarget;
            }
            this.updateCabinDoorPose();
        }
        for (const terminal of this.researchTerminalAnimations) {
            if (terminal.time === terminal.targetTime) continue;
            const direction = Math.sign(terminal.targetTime - terminal.time);
            terminal.time += direction * Math.min(delta, Math.abs(terminal.targetTime - terminal.time));
            terminal.action.time = terminal.time;
            terminal.mixer.update(0);
            if (terminal.time === terminal.targetTime) {
                EventBus.emit('RESEARCH_TERMINAL_ANIMATION_COMPLETE', {
                    station: terminal.station,
                    isOpen: terminal.targetTime === 0
                });
            }
        }

        if (this.terminalModelAction && this.terminalModelMixer) {
            const timeRemaining = this.terminalModelTargetTime - this.terminalModelTime;
            if (Math.abs(timeRemaining) > 0.001) {
                this.terminalModelTime += Math.sign(timeRemaining) * Math.min(delta, Math.abs(timeRemaining));
                this.terminalModelAction.time = this.terminalModelTime;
                this.terminalModelMixer.update(0);
            }
        }
        if (this.sectorTerminalModelAction && this.sectorTerminalModelMixer) {
            const timeRemaining = this.sectorTerminalModelTargetTime - this.sectorTerminalModelTime;
            if (Math.abs(timeRemaining) > 0.001) {
                this.sectorTerminalModelTime += Math.sign(timeRemaining) * Math.min(delta, Math.abs(timeRemaining));
                this.sectorTerminalModelAction.time = this.sectorTerminalModelTime;
                this.sectorTerminalModelMixer.update(0);
            }
        }

        if (this.podDoorPanels.length) {
            this.podDoorProgress = THREE.MathUtils.damp(this.podDoorProgress, this.podDoorTarget, 5, delta);
            if (Math.abs(this.podDoorProgress - this.podDoorTarget) < 0.005) {
                this.podDoorProgress = this.podDoorTarget;
            }
            if (this.sectorPodDoorPanels.length) {
                this.sectorPodDoorProgress = THREE.MathUtils.damp(this.sectorPodDoorProgress, this.sectorPodDoorTarget, 5, delta);
                if (Math.abs(this.sectorPodDoorProgress - this.sectorPodDoorTarget) < 0.005) {
                    this.sectorPodDoorProgress = this.sectorPodDoorTarget;
                }
                for (const panel of this.sectorPodDoorPanels) {
                    panel.mesh.position.x = panel.direction * (1.025 + this.sectorPodDoorProgress * 2.1);
                }
            }
            for (const panel of this.podDoorPanels) {
                panel.mesh.position.x = panel.direction * (1.025 + this.podDoorProgress * 2.1);
            }
        }
        if (this.podRotor) {
            this.podAnimationTime += delta;
            this.podRotor.rotation.y += delta * (this.isTerminalActive ? 1.15 : 0.35);
            if (this.podPowerLight) {
                const pulse = 0.9 + Math.sin(this.podAnimationTime * (this.isTerminalActive ? 3.4 : 1.2)) * 0.18;
                this.podPowerLight.intensity = (this.isTerminalActive ? 2.2 : 0.85) * pulse;
            }
        }
        if (this.sectorPodRotor) {
            this.sectorPodAnimationTime += delta;
            this.sectorPodRotor.rotation.y += delta * (this.isSectorPodActive ? 1.15 : 0.35);
            if (this.sectorPodPowerLight) {
                const pulse = 0.9 + Math.sin(this.sectorPodAnimationTime * (this.isSectorPodActive ? 3.4 : 1.2)) * 0.18;
                this.sectorPodPowerLight.intensity = (this.isSectorPodActive ? 2.2 : 0.85) * pulse;
            }
        }

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
        if (this.caveShellHidden) {
            this.applyCaveAtmosphere(true);
        }
        this.enforceCaveShell();
        this.syncResearchRoomVisibility();

        this.updateCabinShaftFx(delta);
        this.updateCaveEffects(delta);

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

                // A fixture-ek mozognak, a közös fényanyag csak fázisváltáskor változik.
                for (let f = 0; f < tier.fixtures.length; f++) {
                    const fix = tier.fixtures[f];
                    fix.group.position.y = tier.y;
                }
            }

            if (currentHex !== this.lastElevatorLightHex) {
                this.lastElevatorLightHex = currentHex;
                this.shaftLensMat.color.setHex(currentHex);

                for (const tier of this.shaftLightTiers) {
                    for (const fixture of tier.fixtures) fixture.light.color.setHex(currentHex);
                }

                // A zsilipkapuk jelzőfényei is követik a lift fázisait.
                for (const warningLight of this.warningLights) {
                    if (warningLight.mesh && warningLight.mesh.material) {
                        warningLight.mesh.material.color.setHex(currentHex);
                    }
                    if (warningLight.light) warningLight.light.color.setHex(currentHex);
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
                if (this.sterilizationSteamIntensity === 0 && wl.light && wl.light.intensity !== 0.9) {
                    wl.light.intensity = 0.9;
                }
            }
        }

        // 5. Zsilipkapuk sűrű zöld füstjének kifele ömlése a platform padlójára
        if (this.isDoorsOpen && !this.isSpecialFloor() && this.sterilizationSteamIntensity === 0) {
            this.smokeTickTimer = (this.smokeTickTimer || 0) + delta;
            if (this.smokeTickTimer >= 0.10) {
                this.smokeTickTimer = 0;
                EventBus.emit('GATES_SMOKE_TICK', { gates: this.getGatePouringPositions() });
            }
        }
        this.emitSterilizationSteam(delta);

        // Belső folyosói füstfüggöny textúra finom lebegtetése
        if (this.corridorFogMat && this.corridorFogMat.map) {
            this.corridorFogMat.map.offset.x = (this.corridorFogMat.map.offset.x + delta * 0.03) % 1.0;
        }
    }

    collisionBoxOverlapsAabb(box, minX, maxX, minZ, maxZ) {
        return !(box.max.x < minX || box.min.x > maxX ||
            box.max.y < 0 || box.min.y > 2 || box.max.z < minZ || box.min.z > maxZ);
    }

    isSpecialFloor() {
        return this.researchRoomsActive || this.nodeSectionActive;
    }

    isInNodeRoom(x, z) {
        return this.nodeSectionActive && isInResearchNodeRoom(x, z);
    }

    checkWallCollision(x, z, r) {
        // Ha a lift épp mozgásban van szintek között, a platform pereme (24.8m) abszolút biztonsági fal
        if (this.isElevatorMoving && this.cabinCenter) {
            const half = 1.25;
            if (Math.abs(x - this.cabinCenter.x) + r > half || Math.abs(z - this.cabinCenter.z) + r > half) {
                return true;
            }
        } else if (this.isElevatorMoving) {
            if (x - r < -24.8 || x + r > 24.8 || z - r < -24.8 || z + r > 24.8) {
                return true;
            }
        }
        const minX = x - r;
        const maxX = x + r;
        const minZ = z - r;
        const maxZ = z + r;
        for (let i = 0; i < this.wallHitboxes.length; i++) {
            if (this.collisionBoxOverlapsAabb(this.wallHitboxes[i], minX, maxX, minZ, maxZ)) return true;
        }
        for (let i = 0; i < this.activeSectorPropCollisions.length; i++) {
            if (this.collisionBoxOverlapsAabb(this.activeSectorPropCollisions[i], minX, maxX, minZ, maxZ)) return true;
        }
        if (this.isResearchHubVisible) {
            for (let i = 0; i < this.researchHubCollisions.length; i++) {
                if (this.collisionBoxOverlapsAabb(this.researchHubCollisions[i], minX, maxX, minZ, maxZ)) return true;
            }
        }
        if (this.isNodeSectionVisible) {
            for (let i = 0; i < this.nodeStaticCollisions.length; i++) {
                if (this.collisionBoxOverlapsAabb(this.nodeStaticCollisions[i], minX, maxX, minZ, maxZ)) return true;
            }
            const sectionBoxes = this.finalPodRoomActive ? this.finalPodRoomCollisions : this.sectorArenaCollisions;
            for (let i = 0; i < sectionBoxes.length; i++) {
                if (this.collisionBoxOverlapsAabb(sectionBoxes[i], minX, maxX, minZ, maxZ)) return true;
            }
            for (const door of this.nodeDoors) {
                if (door.progress < 0.8 && this.collisionBoxOverlapsAabb(door.box, minX, maxX, minZ, maxZ)) return true;
            }
        }
        for (let i = 0; i < this.doors.length; i++) {
            const d = this.doors[i];
            if (d.progress < 0.8 && !d.hitbox.isEmpty()) {
                if (this.collisionBoxOverlapsAabb(d.hitbox, minX, maxX, minZ, maxZ)) return true;
            }
        }
        if (this.podDoorProgress < 0.98) {
            for (const panel of this.podDoorPanels) {
                panel.mesh.updateWorldMatrix(true, false);
                const box = this._panelBox || (this._panelBox = new THREE.Box3()); box.setFromObject(panel.mesh);
                if (this.collisionBoxOverlapsAabb(box, minX, maxX, minZ, maxZ)) return true;
            }
            if (this.sectorPodDoorProgress < 0.98) {
                for (const panel of this.sectorPodDoorPanels) {
                    panel.mesh.updateWorldMatrix(true, false);
                    const box = this._panelBox || (this._panelBox = new THREE.Box3()); box.setFromObject(panel.mesh);
                    if (this.collisionBoxOverlapsAabb(box, minX, maxX, minZ, maxZ)) return true;
                }
            }
        }
        return false;
    }
}

export default new LevelManager();
