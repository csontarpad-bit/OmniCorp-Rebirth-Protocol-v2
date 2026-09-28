import * as THREE from 'three';
import EventBus from './EventBus.js';

class AudioManager {
    constructor() {
        this.listener = null;
        this.sounds = {};
        this.activeSounds = {};
        this.audioContextUnlocked = false;
        
        this.musicVolume = 0.5;
        this.sfxVolume = 1.0;
        this.activeMusic = {};
        this.pendingMusic = null;
        this.camera = null;
        this.spatialLoops = {};

        // Eredeti alaphangerők pontos definiálása
        this.baseVolumes = {
            music: 0.1,
            menuMusic: 0.5,
            loadingMusic: 0.5,
            whispers: 0.0,
            glitch: 1.0,
            defibrillator: 1.0,
            playerStep: 0.15,
            heavyBreathing: 1.2,
            cough: 1.0,
            hurt: 1.0,
            continuousPain: 0.85,
            deathScream: 1.0,
            looting: 1.0,
            pickup: 1.0,
            genStab: 1.0,
            dryFire: 1.0,
            holster: 0.8,
            knifeHit: 1.0,
            pistolShoot: 0.7,
            pistolReload: 1.0,
            rifleShoot: 0.3,
            rifleReload: 0.8,
            shotgunShoot: 1.0,
            shotgunReload: 1.0,
            superShoot: 1.0,
            superReload: 1.0,
            superClose: 1.0,
            resonatorAudio: 1.0,
            resonatorScream: 0.5,
            resonatorInstall: 1.0,
            resonatorPowerOn: 1.0,
            gateOpen: 1.0,
            elevatorStop: 1.0,
            elevatorMove: 0.9,
            termOpen: 1.0,
            termClose: 1.0,
            purchase: 1.0,
            error: 1.0,
            questAccept: 1.0,
            questComplete: 1.0,
            zombieHit: 1.0,
            burst: 1.0,
            cryoGas: 0.8,
            iceCrack: 0.5,
            acidBurn: 0.2,
            plantBite: 1.0,
            hostAttack: 1.0,
            hostDeath: 1.0,
            hostGrowl: 1.0,
            hostStep: 0.8,
            runnerAttack: 1.0,
            runnerDeath: 1.0,
            runnerGrowl: 1.0,
            runnerStep: 0.8,
            tankAttack: 1.0,
            tankDeath: 1.0,
            tankGrowl: 1.0,
            tankStep: 1.0,
            hiderAttack: 0.5,
            hiderStep: 0.05,
            crawlerDeath: 1.0,
            crawlerStep: 0.8,
            bossAttack: 1.0,
            bossDeath: 1.0,
            bossGrowl: 1.0
        };

        this._bindEvents();
    }

    _bindEvents() {
        EventBus.on('AUDIO_LOADED', (data) => {
            this.registerSound(data.name, data.buffer);
        });
        EventBus.on('UNLOCK_AUDIO', () => this.unlockAudio());
        EventBus.on('PLAY_SOUND', (payload) => {
            if (!payload) return;
            if (typeof payload === 'string') {
                this.playSound(payload);
            } else {
                const sName = payload.name || payload.id;
                let dist = payload.distance !== undefined ? payload.distance : null;
                if (dist === null && payload.position && this.camera) {
                    dist = this.camera.position.distanceTo(payload.position);
                }
                this.playSound(
                    sName, 
                    payload.offset || 0, 
                    payload.fadeOutDuration || 0, 
                    dist,
                    payload.playbackRate || 1.0,
                    payload.stopAfter || 0
                );
            }
        });
        EventBus.on('PLAY_AUDIO', (payload) => {
            if (!payload) return;
            if (typeof payload === 'string') {
                this.playSound(payload);
            } else {
                const sName = payload.name || payload.id;
                let dist = payload.distance !== undefined ? payload.distance : null;
                if (dist === null && payload.position && this.camera) {
                    dist = this.camera.position.distanceTo(payload.position);
                }
                this.playSound(
                    sName,
                    payload.offset || 0,
                    payload.fadeOutDuration || 0,
                    dist,
                    payload.playbackRate || 1.0,
                    payload.stopAfter || 0
                );
            }
        });
        EventBus.on('START_SPATIAL_LOOP', (data) => {
            if (!data || !data.id || !data.name || !this.sounds[data.name] || !this.listener) return;
            if (this.spatialLoops[data.id]) {
                this.stopSpatialLoop(data.id);
            }
            const sound = new THREE.Audio(this.listener);
            sound.setBuffer(this.sounds[data.name]);
            sound.setLoop(data.loop !== undefined ? data.loop : true);

            const maxDistance = data.maxDistance || 20.0;
            const baseVol = data.baseVolume !== undefined ? data.baseVolume : (this.baseVolumes[data.name] || 1.0);
            const pos = data.position ? data.position.clone() : new THREE.Vector3();

            let dist = this.camera ? Math.hypot(this.camera.position.x - pos.x, this.camera.position.z - pos.z) : 0;
            let vol = 0;
            if (dist < maxDistance) {
                let ratio = Math.max(0, 1.0 - (dist / maxDistance));
                vol = baseVol * Math.pow(ratio, 2) * this.sfxVolume;
            }
            sound.setVolume(vol);
            sound.play();

            this.spatialLoops[data.id] = {
                sound: sound,
                name: data.name,
                position: pos,
                maxDistance: maxDistance,
                baseVolume: baseVol
            };
        });
        EventBus.on('UPDATE_SPATIAL_LOOP', (data) => {
            if (!data || !data.id || !this.spatialLoops[data.id]) return;
            const item = this.spatialLoops[data.id];
            if (data.position) item.position.copy(data.position);

            if (item.sound && item.sound.isPlaying && this.camera) {
                let dist = Math.hypot(this.camera.position.x - item.position.x, this.camera.position.z - item.position.z);
                let vol = 0;
                if (dist < item.maxDistance) {
                    let ratio = Math.max(0, 1.0 - (dist / item.maxDistance));
                    vol = item.baseVolume * Math.pow(ratio, 2) * this.sfxVolume;
                }
                item.sound.setVolume(vol);
            }
        });
        EventBus.on('STOP_SPATIAL_LOOP', (data) => {
            const id = typeof data === 'string' ? data : (data ? data.id : null);
            if (id) this.stopSpatialLoop(id);
        });
        EventBus.on('START_GAME', () => this.reset());
        EventBus.on('RESTART_GAME', () => this.reset());
        EventBus.on('FREEZE_ENDED', () => {
            this.stopAudioByName('cryoGas');
            this.stopAudioByName('iceCrack');
        });
        EventBus.on('SET_FREEZE_VISUALS', (isFrozen) => {
            if (!isFrozen) {
                this.stopAudioByName('cryoGas');
                this.stopAudioByName('iceCrack');
            }
        });
        EventBus.on('STOP_AUDIO', (payload) => {
            const sName = typeof payload === 'string' ? payload : (payload ? (payload.name || payload.id) : null);
            this.stopAudioByName(sName);
        });
        EventBus.on('STOP_SOUND', (payload) => {
            const sName = typeof payload === 'string' ? payload : (payload ? (payload.name || payload.id) : null);
            this.stopAudioByName(sName);
        });
        EventBus.on('SET_MUSIC_VOLUME', (vol) => {
            this.musicVolume = vol;
            for (let key in this.activeMusic) {
                if (this.activeMusic[key] && this.activeMusic[key].isPlaying) {
                    let base = this.baseVolumes[key] !== undefined ? this.baseVolumes[key] : 1.0;
                    this.activeMusic[key].setVolume(base * vol);
                }
            }
        });
        EventBus.on('SET_SFX_VOLUME', (vol) => {
            this.sfxVolume = vol;
            for (let id in this.spatialLoops) {
                let item = this.spatialLoops[id];
                if (item && item.sound && item.sound.isPlaying && this.camera) {
                    let dist = Math.hypot(this.camera.position.x - item.position.x, this.camera.position.z - item.position.z);
                    let v = 0;
                    if (dist < item.maxDistance) {
                        let ratio = Math.max(0, 1.0 - (dist / item.maxDistance));
                        v = item.baseVolume * Math.pow(ratio, 2) * this.sfxVolume;
                    }
                    item.sound.setVolume(v);
                }
            }
        });
        EventBus.on('SET_WHISPER_VOLUME', (vol) => {
            if (!this.sounds['whispers']) return;
            if (!this.activeMusic['whispers']) {
                let sound = new THREE.Audio(this.listener);
                sound.setBuffer(this.sounds['whispers']);
                sound.setLoop(true);
                sound.setVolume(vol);
                if (vol > 0) sound.play();
                this.activeMusic['whispers'] = sound;
            } else {
                this.activeMusic['whispers'].setVolume(vol);
                if (vol > 0 && !this.activeMusic['whispers'].isPlaying) {
                    this.activeMusic['whispers'].play();
                } else if (vol <= 0 && this.activeMusic['whispers'].isPlaying) {
                    this.activeMusic['whispers'].stop();
                }
            }
        });
    }

    stopAudioByName(sName) {
        if (!sName) return;
        if (this.pendingMusic === sName) {
            this.pendingMusic = null;
        }
        if (this.activeMusic && this.activeMusic[sName]) {
            if (this.activeMusic[sName].isPlaying) this.activeMusic[sName].stop();
            delete this.activeMusic[sName];
        }
        if (this.activeSounds && this.activeSounds[sName]) {
            try {
                if (this.activeSounds[sName].isPlaying) this.activeSounds[sName].stop();
            } catch(e) {}
            delete this.activeSounds[sName];
        }
    }

    init(camera, existingListener = null) {
        this.camera = camera;
        if (existingListener) {
            this.listener = existingListener;
        } else if (camera) {
            this.listener = new THREE.AudioListener();
            camera.add(this.listener);
        }
    }

    registerSound(name, buffer) {
        this.sounds[name] = buffer;
        if (this.pendingMusic === name) {
            const musicToPlay = this.pendingMusic;
            this.pendingMusic = null;
            this.playSound(musicToPlay);
        }
    }

    unlockAudio() {
        if (!this.audioContextUnlocked && this.listener) {
            const ctx = this.listener.context;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            this.audioContextUnlocked = true;
        }
    }

    playSound(name, offset = 0, fadeOutDuration = 0, distance = null, playbackRate = 1.0, stopAfter = 0) {
        if (name === 'zombieDie' && !this.sounds['zombieDie']) {
            name = 'hostDeath';
        }
        let isMusic = ['music', 'menuMusic', 'loreAudio', 'loadingMusic'].includes(name);

        if (!this.sounds[name]) {
            if (isMusic) {
                this.pendingMusic = name;
            }
            return null;
        }
        if (!this.listener) return null;

        const buffer = this.sounds[name];
        
        let baseVol = this.baseVolumes[name] !== undefined ? this.baseVolumes[name] : 1.0;
        let finalVolume = isMusic ? (baseVol * this.musicVolume) : (baseVol * this.sfxVolume);

        // Lépcsőzetes halkulás 3 méterenként (Max 15 méter, ahogy az eredeti játékban)
        if (distance !== null) {
            if (distance > 15.0) return null;
            else if (distance > 12.0) finalVolume *= 0.1;
            else if (distance > 9.0)  finalVolume *= 0.3;
            else if (distance > 6.0)  finalVolume *= 0.6;
            else if (distance > 3.0)  finalVolume *= 0.8;
        }

        const tempSound = new THREE.Audio(this.listener);
        tempSound.setBuffer(buffer);
        tempSound.setLoop(isMusic && name !== 'loreAudio');
        tempSound.setVolume(finalVolume);
        tempSound.offset = offset;
        if (playbackRate && playbackRate !== 1.0) {
            tempSound.setPlaybackRate(playbackRate);
        }
        tempSound.play();
        
        if (isMusic) {
            if (this.activeMusic[name] && this.activeMusic[name].isPlaying) {
                this.activeMusic[name].stop();
            }
            this.activeMusic[name] = tempSound;
        } else {
            if (this.activeSounds && this.activeSounds[name] && this.activeSounds[name].isPlaying) {
                try { this.activeSounds[name].stop(); } catch(e) {}
            }
            if (this.activeSounds) {
                this.activeSounds[name] = tempSound;
                tempSound.onEnded = () => {
                    if (this.activeSounds && this.activeSounds[name] === tempSound) {
                        delete this.activeSounds[name];
                    }
                };
            }
        }

        if (stopAfter > 0) {
            setTimeout(() => {
                try {
                    if (tempSound.isPlaying) tempSound.stop();
                } catch(e) {}
                try {
                    tempSound.disconnect();
                } catch(e) {}
            }, stopAfter);
        }

        if (fadeOutDuration > 0) {
            setTimeout(() => {
                if (tempSound.isPlaying) {
                    const ctx = this.listener.context;
                    const gainNode = tempSound.getFilter() || tempSound.gain;
                    if (gainNode && gainNode.gain) {
                        gainNode.gain.setTargetAtTime(0, ctx.currentTime, fadeOutDuration / 1000);
                    }
                    setTimeout(() => {
                        try {
                            if (tempSound.isPlaying) tempSound.stop();
                        } catch(e) {}
                        try {
                            tempSound.disconnect();
                        } catch(e) {}
                    }, fadeOutDuration);
                }
            }, (tempSound.buffer.duration / (playbackRate || 1.0)) * 1000 - fadeOutDuration - (offset * 1000));
        } else if (!tempSound.getLoop()) {
            let duration = ((buffer.duration / (playbackRate || 1.0)) * 1000) + 100;
            setTimeout(() => {
                try {
                    if (tempSound.isPlaying) tempSound.stop();
                } catch(e) {}
                try {
                    tempSound.disconnect();
                } catch(e) {}
            }, duration);
        }

        return tempSound;
    }

    stopSpatialLoop(id) {
        if (this.spatialLoops && this.spatialLoops[id]) {
            if (this.spatialLoops[id].sound) {
                try {
                    if (this.spatialLoops[id].sound.isPlaying) this.spatialLoops[id].sound.stop();
                } catch(e) {}
                try {
                    this.spatialLoops[id].sound.disconnect();
                } catch(e) {}
            }
            delete this.spatialLoops[id];
        }
    }

    reset() {
        if (this.spatialLoops) {
            for (let id in this.spatialLoops) {
                this.stopSpatialLoop(id);
            }
            this.spatialLoops = {};
        }
        if (this.activeSounds) {
            for (let name in this.activeSounds) {
                try {
                    if (this.activeSounds[name].isPlaying) this.activeSounds[name].stop();
                } catch(e) {}
            }
            this.activeSounds = {};
        }
        if (this.activeMusic) {
            for (let name in this.activeMusic) {
                try {
                    if (this.activeMusic[name].isPlaying) this.activeMusic[name].stop();
                } catch(e) {}
            }
            this.activeMusic = {};
        }
    }
}

export default new AudioManager();
