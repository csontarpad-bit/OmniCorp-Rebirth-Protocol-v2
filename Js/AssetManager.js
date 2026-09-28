import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/addons/utils/SkeletonUtils.js';
import EventBus from './EventBus.js';

class AssetManager {
    constructor() {
        this.manager = new THREE.LoadingManager();
        this.gltfLoader = null;
        this.audioLoader = null;
        this.textureLoader = null;
        
        this.models = {};
        this.textures = {};
        this.audioBuffers = {};

        this._initLoaders();
    }

    _initLoaders() {
        this.gltfLoader = new GLTFLoader(this.manager);

        this.audioLoader = new THREE.AudioLoader(this.manager);
        this.textureLoader = new THREE.TextureLoader(this.manager);

        // --- KRITIKUS: Események elsütése betöltés alatt ---
        this.manager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const percent = Math.floor((itemsLoaded / itemsTotal) * 100);
            EventBus.emit('LOADING_PROGRESS', percent);
        };

        this.manager.onLoad = () => {
            EventBus.emit('LOADING_COMPLETE');
        };
    }

    loadModel(name, url) {
        if (!this.gltfLoader) return;
        this.gltfLoader.load(url, (gltf) => {
            let model = gltf.scene;
            model.traverse((c) => { 
                if(c.isMesh) {
                    c.frustumCulled = false;
                    c.castShadow = true;
                }
            });
            // NE hozz létre itt AnimationMixer-t, azt a modulok végzik!
            this.models[name] = { scene: model, animations: gltf.animations };
        });
    }

    loadTexture(name, url, wrapAndRepeat = false) {
        const tex = this.textureLoader.load(url);
        if (wrapAndRepeat) {
            tex.wrapS = THREE.RepeatWrapping; 
            tex.wrapT = THREE.RepeatWrapping; 
        }
        this.textures[name] = tex;
        return tex;
    }

    loadAudio(name, url) {
        this.audioLoader.load(url, (buffer) => {
            this.audioBuffers[name] = buffer;
            EventBus.emit('AUDIO_LOADED', { name, buffer });
        });
    }

    // --- PUBLIKUS KLÓNOZÓ METÓDUS (Független példányokhoz) ---
    cloneModel(modelName) {
        let entry = this.models[modelName];
        if (!entry) {
            if (modelName === 'ammo') entry = this.models['ammoModel'];
            else if (modelName === 'health') entry = this.models['healthModel'];
            else if (modelName === 'ammoModel') entry = this.models['ammo'];
            else if (modelName === 'healthModel') entry = this.models['health'];
        }
        if (!entry) return null;
        
        const original = entry.scene;
        const clonedMesh = SkeletonUtils.clone(original);
        clonedMesh.userData = { ...original.userData };
        return {
            mesh: clonedMesh,
            animations: entry.animations
        };
    }
    loadAll() {
        console.log("[AssetManager] Betöltés indítása...");

        // --- 3D Modellek ---
        this.loadModel('plant', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/061e749b34c35aa535f6a41895cdeaebaa6f4d1c/flesh_bomb.glb');
        this.loadModel('resonator', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/fdec8a5bc1e3f9c22360ed369f686eddf256695f/3DModels/Seismic%20Resonator.glb');
        this.loadModel('zombie', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/main/zombie.glb');
        this.loadModel('runner', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/0214d22fe4ca2284df78cbf1eb8f820834651f9a/runerv2.glb');
        this.loadModel('tank', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/7e6d7e06a66a6c9df5665f7df2a92cdfb14846d7/tankv2.glb');
        this.loadModel('hider', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6aa130a4c148ae5e16855905c4a15b9978e974ee/hider%20zombie.glb');
        this.loadModel('crawler', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/3530b5fab56eb32e0fe925babfef2db89bd2b1ac/crying_head_2.glb');
        this.loadModel('boss', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6100b7a688723ad1b3a67403b99e8dbaf82fc040/three-head.glb');
        // FPS Fegyverek
        this.loadModel('pistol', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/54aa4e08f9a8991f952a06b845453bf31403aff8/3DModels/fps_pistol_animated.glb');
        this.loadModel('rifle', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/54aa4e08f9a8991f952a06b845453bf31403aff8/3DModels/fps_animated_smg.glb');
        this.loadModel('super', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/54aa4e08f9a8991f952a06b845453bf31403aff8/3DModels/revolver_animated.glb');
        this.loadModel('shotgun', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/54aa4e08f9a8991f952a06b845453bf31403aff8/3DModels/shotgun_animated.glb');
        this.loadModel('melee', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/54aa4e08f9a8991f952a06b845453bf31403aff8/3DModels/knife_animated.glb');
        this.loadModel('heal', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/e6a5236b367eedf148605c2f1e504e6a25bd98d4/3DModels/Gen-stab.glb');

        this.loadModel('ammoModel', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/db069dbbe97f2d9cd71985c37eb64dad31848434/ammo.glb');
        this.loadModel('healthModel', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/db069dbbe97f2d9cd71985c37eb64dad31848434/health.glb');

        // --- Textúrák ---
        this.loadTexture('floorTex', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/35c845f70c8ae3a8577562a70a9abac70baadcf1/Pictures/LVL3%20Floor.png', true);
        this.loadTexture('wallTex', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff430b224fb8cd358b83fade1e06710d708d094/1783431502863.png', true);
        this.loadTexture('puddleTex', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/102a0d507c37ef59b9aeb075e1b30110c95f3b3f/puddle.jpg', true);

        // --- Hangok ---
        this.loadAudio('music', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/f162302b83992b9adfe75b1c3ade387a25e2478d/music.mp3');
        this.loadAudio('menuMusic', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/212958c21ddceb0db80820c1d91b06b7d9a5a950/main.m4a');
        this.loadAudio('loadingMusic', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/fea9f5d83283e004ddc56527e42e8d665ef93bc0/Loading%20Screen%20music.mp3');
        this.loadAudio('whispers', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/610723d633422339cc4d1d3384fcc2a70a98f27a/whispers.mp3');
        this.loadAudio('glitch', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/102a0d507c37ef59b9aeb075e1b30110c95f3b3f/noice02.mp3');
        this.loadAudio('defibrillator', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/306cb8beb9956a05ffb3ea66d00923be4cb95b5c/Sound/shock.mp3');
        this.loadAudio('playerStep', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/player%20foot%20step.mp3');
        this.loadAudio('heavyBreathing', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/9c9e289dd7d9bc589b5f1014a8469bb8375929ea/Sound/heavy_breathing_8sec.mp3');
        this.loadAudio('cough', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/537e7833404c4f1d16355bce8db5451231f4797e/coughing.mp3');
        this.loadAudio('hurt', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/7bc7874a7ddc6802b16f0d3eafb82b2b4860e125/me%20get%20hit.mp3');
        this.loadAudio('continuousPain', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/ffd67b0b48d6a6b26dd380846e95eaeffd1db1da/Sound/folyamatos%20pain.mp3');
        this.loadAudio('deathScream', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/dd55e7027743a8ed1ec9aa2c9bd70895c3605773/Death%20scream.mp3');
        this.loadAudio('looting', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/search%207%20sec.mp3');
        this.loadAudio('pickup', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/610723d633422339cc4d1d3384fcc2a70a98f27a/pick%20up%20item.mp3');
        this.loadAudio('genStab', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/gen%20stab%20use.mp3');
        this.loadAudio('dryFire', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/dire%20fire.mp3');
        this.loadAudio('holster', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/holster%20gun.mp3');
        this.loadAudio('knifeHit', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/b211fb47b900f276a65e2667467386ef325d70ef/Sound/Knife%20hit.mp3');
        this.loadAudio('pistolShoot', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/pistol%20shot.mp3');
        this.loadAudio('pistolReload', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/reload%20pistol.mp3');
        this.loadAudio('rifleShoot', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/7bc7874a7ddc6802b16f0d3eafb82b2b4860e125/gun%20shoot.mp3');
        this.loadAudio('rifleReload', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/Reload%20smg.mp3');
        this.loadAudio('shotgunShoot', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/shotgun%20fire%20and%20one%20pump.mp3');
        this.loadAudio('shotgunReload', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/shotgun%20reload%20one%20bullet.mp3');
        this.loadAudio('superShoot', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/single%20shot%20revolver.mp3');
        this.loadAudio('superReload', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/reload%20a%20single%20bullet%20on%20revolver.mp3');
        this.loadAudio('superClose', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/spin%20revolver.mp3');
        this.loadAudio('resonatorAudio', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/b0ce018a1c718cf2f2aaa1e32a46418028fd049e/Sound/Seismic%20Resonator.mp3');
        this.loadAudio('resonatorScream', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/35033a30a8ae1e549584d93357797b5f670778f6/Sound/resonator%20monster%20screem.mp3');
        this.loadAudio('resonatorInstall', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/ecee88afd568854963e855216ed1c82a9bececb9/Sound/install%20resonator.mp3');
        this.loadAudio('resonatorPowerOn', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/f7d4dd2396d884b481e26201beeb38a1a8738590/Sound/rezonator%20power%20on.mp3');
        this.loadAudio('termOpen', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/open%20terminal.mp3');
        this.loadAudio('termClose', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/close%20terminal.mp3');
        this.loadAudio('purchase', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/purchse%20sound.mp3');
        this.loadAudio('error', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/error.mp3');
        this.loadAudio('questAccept', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/accept%20quest.mp3');
        this.loadAudio('questComplete', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/completed%20quest.mp3');
        this.loadAudio('zombieHit', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/7bc7874a7ddc6802b16f0d3eafb82b2b4860e125/zombie%20get%20hit.mp3');
        this.loadAudio('burst', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/df6d333b9936fa81cffbce5c2bdb8891eaf9ee37/burst.mp3');
        this.loadAudio('cryoGas', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/5abe88d4b8b1dd33f0887daa25511297b89eecbd/cryo%20gas.mp3');
        this.loadAudio('iceCrack', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/46c22b763dcc098c3c6581afdfbccad22203c429/ice%20brake.mp3');
        this.loadAudio('acidBurn', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/acid%20burning%201%20sec.mp3');
        this.loadAudio('plantBite', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/bite%20sound.mp3');
        this.loadAudio('hostAttack', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/host%20attack.mp3');
        this.loadAudio('hostDeath', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/host%20death.mp3');
        this.loadAudio('hostGrowl', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/host%20gowling.mp3');
        this.loadAudio('hostStep', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/host%20footstep.mp3');
        this.loadAudio('runnerAttack', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/runner%20attack.mp3');
        this.loadAudio('runnerDeath', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/runner%20death.mp3');
        this.loadAudio('runnerGrowl', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/runner%20growling.mp3');
        this.loadAudio('runnerStep', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/runner%20footstep.mp3');
        this.loadAudio('tankAttack', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/tank%20attack.mp3');
        this.loadAudio('tankDeath', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/tank%20death.mp3');
        this.loadAudio('tankGrowl', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/tank%20growling.mp3');
        this.loadAudio('tankStep', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/tank%20footstep.mp3');
        this.loadAudio('hiderAttack', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/hider%20attack.mp3');
        this.loadAudio('hiderStep', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/hider%20step.mp3');
        this.loadAudio('crawlerDeath', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/crawler%20detah.mp3');
        this.loadAudio('crawlerStep', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/crawler%20footstep%203%20sec.mp3');
        this.loadAudio('bossAttack', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/d992c4493c5e5a4fb0c3e9d8134bdc308aa5f46d/boss%20screem%20v2.mp3');
        this.loadAudio('bossDeath', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/nexus%20node%20death.mp3');
        this.loadAudio('bossGrowl', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/72f3fdbf963b4e0b53e98a3633e958164014a89e/Sound/nexus%20node%20growling.mp3');
        this.loadAudio('gateOpen', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/96eadb746f7957548bcc9acff700d61a1ce667f0/Sound/gate%20open.mp3');
        this.loadAudio('elevatorStop', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/96eadb746f7957548bcc9acff700d61a1ce667f0/Sound/elevator%20stop.mp3');
        this.loadAudio('elevatorMove', 'https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/96eadb746f7957548bcc9acff700d61a1ce667f0/Sound/heavy%20duty%20underground%20elevator.mp3');
    }

}

export default new AssetManager();
