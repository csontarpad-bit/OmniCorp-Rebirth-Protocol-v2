import * as THREE from 'three';

class Engine {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.clock = null;
        this.listener = null;
    }

    init() {
        // --- 1. Jelenet és Kamera ---
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x051a05); // Radioaktív zöldes fekete
        this.scene.fog = new THREE.FogExp2(0x051a05, 0.035);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
        this.camera.position.set(0, 1.6, 0); // Szemmagasság

        // --- 2. Audio Listener ---
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        this.scene.add(this.camera);

        // --- 3. Renderer ---
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); 
        this.renderer.physicallyCorrectLights = true; 
        this.renderer.outputEncoding = THREE.LinearEncoding; // Eredeti sötét, kontrasztos hangulat
        this.renderer.shadowMap.enabled = false;
        
        let container = document.getElementById('game-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'game-container';
            document.body.appendChild(container);
        }
        container.appendChild(this.renderer.domElement);

        // --- 4. Clock ---
        this.clock = new THREE.Clock();

        // --- 5. Fények ---
        this.setupLights();

        // --- 6. Ablak átméretezés ---
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0x55ff55, 0.3); // Régi zöldes alapfény
        this.scene.add(ambientLight);
    }

    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    getScene() {
        return this.scene;
    }
    
    getCamera() {
        return this.camera;
    }
}

export default new Engine();
