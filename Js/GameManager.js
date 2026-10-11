import * as THREE from 'three';
import EventBus from './EventBus.js';
import { ammoPrices, weapons, skills, OmniCorpDirectives } from './Database.js';
import { playerStats, savePlayerStats } from './RuntimeState.js';
import { getCampaignFloorInfo, getResearchHubStationAt, researchCommsLog, researchHubStations, researchNodeSection, nodeUnlockStation, sectorHallCenter } from './Campaign.js';

export class GameManager {
    constructor() {
        this.gameState = 'LOADING'; // 'LOADING', 'MENU', 'PLAYING', 'PAUSED', 'GAMEOVER', 'SHOPPING'
        this.score = 0;
        this.currentWave = 1;
        this.activeResearchFloor = null;
        this.activeResearchStation = null;
        this.isResearchHubActive = false;
        this.researchFloorActive = false;
        this.pendingResearchArrival = false;
        this.researchVisitedFloor = 0;
        this.nodeState = 'none';
        this.finalLiftStarted = false;
        this.liftPassengerLock = false;
        this.liftExitPending = false;
        this.liftExitIsSectorPod = false;
        this.liftExitFrom = null;
        this.liftExitTo = null;
        this.liftExitTimer = 0;
        this.pendingGateArrival = false;
        this.pendingTargetFloor = null;
        this.enemiesToSpawn = 5;
        this.pendingEnemySpawns = [];
        this.pendingAggressiveSpawns = 0;
        this.enemySpawnTimer = 0;
        this.maxConcurrentEnemies = 12;
        this.enemySpawnInterval = 0.45;
        this.hudUpdateTimer = 0;
        this.totalPausedTime = 0;
        this.waveStartTime = 0;
        this.isWaveActive = false;
        this.terminalReady = false;
        this.activePodIsSector = false;
        this.sectorLiftTransit = false;
        this.terminalPromptVisible = false;
        this.terminalSequence = 'idle';
        this.terminalSequenceTime = 0;
        this.terminalMoveFrom = null;
        this.terminalMoveTo = null;
        this.terminalHealingOriginal = null;
        this.terminalHealingLookUp = null;
        this.terminalHealingLookDown = null;
        this.hasStartedAnyWave = false;
        this.lastWaveBonus = 0;
        this.pauseStartTime = 0;
        this.pausedFromState = 'PLAYING';

        this.activeFreezeTimer = 0;
        this.freezeCooldown = 0;
        this.shopLockedForNextWave = false;
        this.isGodMode = false;

        this.waveTimeout = null;
        this.glitchInterval = null;
        this.waveSwapTimeout = null;
        this.waveStartMoveTimeout = null;

        // Ipari felvonó állapotváltozói
        this.isElevating = false;
        this.elevatorPhase = 'idle'; // 'idle', 'moving', 'stopping', 'opening', 'done'
        this.elevatorTimer = 0;
        this.elevatorExtraTime = 0;
        this.caveReinforcementTimer = 0;
        this.caveBossesLeft = 0;
        this.caveBossClock = 0;

        this.player = null;
        this.levelManager = null;
        this.enemyManager = null;
        this.itemManager = null;
        this.weaponSystem = null;

    }

    bindEvents() {
        if (this._eventsBound) return;
        this._eventsBound = true;
        EventBus.withOwner(this, () => {
        EventBus.on('ADD_SCORE', (amount) => this.onAddScore(amount));
        EventBus.on('START_GAME', (data) => this.onStartGame(data));
        EventBus.on('START_WAVE_COUNTDOWN', (isFirst) => this.startWaveCountdown(isFirst));
        EventBus.on('PAUSE_GAME', () => this.onPauseGame());
        EventBus.on('RESUME_GAME', () => this.onResumeGame());
        EventBus.on('TOGGLE_PAUSE', () => {
            if (this.gameState === 'PLAYING') {
                this.onPauseGame();
                EventBus.emit('PAUSE_GAME');
            } else if (this.gameState === 'PAUSED') {
                this.onResumeGame();
                EventBus.emit('RESUME_GAME');
            }
        });
        EventBus.on('POINTER_LOCK_LOST', () => {
            if (this.gameState === 'PLAYING') {
                this.onPauseGame();
                EventBus.emit('PAUSE_GAME');
            }
        });
        EventBus.on('ZOMBIE_KILLED', (data) => this.onZombieKilled(data));
        EventBus.on('PLAYER_DIED', () => this.onPlayerDied());
        EventBus.on('input:interact', () => this.tryActivateTerminal());
        EventBus.on('RESEARCH_TERMINAL_ANIMATION_COMPLETE', (data) => this.onResearchTerminalAnimationComplete(data));

        // Direktíva Események
        EventBus.on('ACCEPT_DIRECTIVE', (id) => this.onAcceptDirective(id));
        EventBus.on('EXECUTE_ABANDON_DIRECTIVE', () => this.onAbandonDirective());
        EventBus.on('DIRECTIVE_CHECK', (data) => {
            if (data) this.checkDirective(data.type, data.state || data.target);
        });
        EventBus.on('ENEMY_ATTACK_HIT', (enemy) => {
            if (enemy && enemy.type) this.checkDirective('take_damage', enemy.type);
        });

        // Shop Események
        EventBus.on('TRY_BUY_WEAPON', (data) => this.onTryBuyWeapon(data));
        EventBus.on('TRY_BUY_SKILL', (data) => this.onTryBuySkill(data));
        EventBus.on('TRY_BUY_AMMO', (data) => this.onTryBuyAmmo(data));
        EventBus.on('TRY_BUY_MEDKIT', (data) => this.onTryBuyMedkit(data));
        EventBus.on('TRY_BUY_HEAL', (data) => this.onTryBuyHeal(data));
        EventBus.on('TRY_BUY_ARMOR', (data) => this.onTryBuyArmor(data));
        EventBus.on('TRY_BUY_CLEAN', (data) => this.onTryBuyClean(data));
        EventBus.on('TRY_BUY_NEXUS_PURGE', () => this.onTryBuyNexusPurge());
        EventBus.on('TRY_UNLOCK_NODE_EXIT', () => this.onTryUnlockNodeExit());
        EventBus.on('TRY_BUY_RESONATOR', (data) => this.onTryBuyResonator(data));
        EventBus.on('TRY_BUY_NEURAL', (data) => this.onTryBuyNeural(data));
        EventBus.on('REQUEST_SHOP_UPDATE', () => this.sendShopData());
        EventBus.on('CLEAR_SHOP_LOCK', () => { this.shopLockedForNextWave = false; });
        EventBus.on('CLOSE_SHOP', () => {
            if (this.gameState === 'SHOPPING' && this.terminalSequence === 'hub-menu') {
                this.gameState = 'TERMINAL_TRANSITION';
                this.terminalSequence = 'hub-closing';
                EventBus.emit('RESEARCH_TERMINAL_CLOSE', { station: this.activeResearchStation });
                return;
            }
            if (this.gameState !== 'SHOPPING' || this.isResearchHubActive) return;
            this.beginLiftFromTerminal();
        });
        EventBus.on('CHANGE_GAME_STATE', (state) => { this.gameState = state; });
        EventBus.on('RETURN_TO_MAIN_MENU', () => this.onReturnToMainMenu());
        EventBus.on('RESTART_GAME', () => this.onReturnToMainMenu());

        // Képesség Események
        EventBus.on('input:freeze', () => this.triggerFreeze());

        // Dev Menu Események
        EventBus.on('DEV_SET_WAVE', (wave) => {
            this.currentWave = wave;
            this.enemiesToSpawn = 30;
            EventBus.emit('WAVE_CHANGED', wave);
            EventBus.emit('UI_UPDATE_NEEDED');
        });
        EventBus.on('DEV_SET_FLOOR', (floor) => {
            if (!Number.isInteger(floor) || floor < 1 || floor > 102) {
                EventBus.emit('DEV_FLOOR_TARGET_FAILED');
                return;
            }
            this.pendingTargetFloor = floor;
            EventBus.emit('DEV_FLOOR_TARGET_SET', { floor });
        });
        EventBus.on('DEV_MAX_ALL', () => this.devMaxAll());
        EventBus.on('DEV_SET_GOD_MODE', (isGod) => {
            this.isGodMode = isGod;
            EventBus.emit('SET_GOD_MODE', isGod);
        });
        });
    }

    unbindEvents() {
        EventBus.removeListenersForOwner(this);
        this._eventsBound = false;
    }

    onReturnToMainMenu() {
        this.gameState = 'MENU';
        this.terminalSequence = 'idle';
        this.activePodIsSector = false;
        this.sectorLiftTransit = false;
        this.activeResearchFloor = null;
        this.activeResearchStation = null;
        this.isResearchHubActive = false;
        if (this.levelManager) {
            this.levelManager.setPodDoorOpen(false);
            this.levelManager.setPodDoorOpen(false, true);
        }
        this.researchFloorActive = false;
        this.pendingResearchArrival = false;
        this.researchVisitedFloor = 0;
        this.nodeState = 'none';
        this.pendingGateArrival = false;
        this.pendingTargetFloor = null;
        EventBus.emit('RESEARCH_ROOMS_SET', { active: false });
        EventBus.emit('RESEARCH_NODE_SECTION_SET', { active: false });
        this.isWaveActive = false;
        this.terminalReady = false;
        this.setTerminalPromptVisible(false);
        EventBus.emit('TERMINAL_RESET');
        EventBus.emit('CAMPAIGN_FLOOR_RESET');
        this.pendingEnemySpawns.length = 0;
        this.pendingAggressiveSpawns = 0;
        this.enemySpawnTimer = 0;
        this.isElevating = false;
        this.elevatorPhase = 'idle';
        this.liftPassengerLock = false;
        this.liftExitPending = false;
        this.liftExitIsSectorPod = false;
        this.liftExitFrom = null;
        this.liftExitTo = null;
        if (this.waveTimeout) {
            clearTimeout(this.waveTimeout);
            this.waveTimeout = null;
        }
        if (this.glitchInterval) {
            clearInterval(this.glitchInterval);
            this.glitchInterval = null;
        }
        EventBus.emit('STOP_AUDIO', { id: 'elevatorMove' });
        EventBus.emit('STOP_AUDIO', { id: 'elevatorStop' });
        EventBus.emit('STOP_AUDIO', { id: 'gateOpen' });
        EventBus.emit('STOP_ELEVATOR_MOVE');
        EventBus.emit('STOP_AUDIO', { id: 'music' });
        EventBus.emit('STOP_AUDIO', { id: 'whispers' });
        EventBus.emit('PLAY_SOUND', { id: 'menuMusic' });
    }

    init(player, enemyManager, itemManager, weaponSystem, levelManager) {
        this.bindEvents();
        this.player = player;
        this.levelManager = levelManager;
        this.enemyManager = enemyManager;
        this.itemManager = itemManager;
        this.weaponSystem = weaponSystem;

        console.log(`[KRONOS] GameManager inicializálva.`);
    }

    onStartGame(data) {
        this.gameState = 'PLAYING';
        this.terminalSequence = 'idle';
        this.activePodIsSector = false;
        this.sectorLiftTransit = false;
        this.activeResearchFloor = null;
        this.activeResearchStation = null;
        this.isResearchHubActive = false;
        this.researchFloorActive = false;
        this.pendingResearchArrival = false;
        this.researchVisitedFloor = 0;
        this.nodeState = 'none';
        this.pendingTargetFloor = null;
        EventBus.emit('RESEARCH_ROOMS_SET', { active: false });
        if (this.levelManager) {
            this.levelManager.setPodDoorOpen(false);
            this.levelManager.setPodDoorOpen(false, true);
        }
        this.currentWave = 1;
        this.hasStartedAnyWave = false;
        this.enemiesToSpawn = 5;
        this.pendingEnemySpawns.length = 0;
        this.pendingAggressiveSpawns = 0;
        this.enemySpawnTimer = 0;
        this.hudUpdateTimer = 0;
        this.score = 0;
        this.activeFreezeTimer = 0;
        this.freezeCooldown = 0;
        this.shopLockedForNextWave = false;
        this.terminalReady = false;
        this.setTerminalPromptVisible(false);
        EventBus.emit('TERMINAL_RESET');
        EventBus.emit('CAMPAIGN_FLOOR_RESET');

        // Gyári visszaállítás (Tiszta lap)
        for (let sKey in skills) {
            skills[sKey].level = 0;
        }

        if (this.weaponSystem) {
            this.weaponSystem.reset();
        }

        if (this.player) {
            this.player.reset();
            this.player.camera.position.set(0, 1.6, 2.2);
        }

        if (this.enemyManager) {
            this.enemyManager.reset();
        }

        if (this.itemManager) {
            this.itemManager.reset();
        }

        if (playerStats) {
            playerStats.activeDirective = null;
            playerStats.directiveProgress = 0;
            playerStats.completedDirectives = [];
            playerStats.abandonedDirectives = [];
            playerStats.weaponsBought = { shotgun: false, rifle: false, super: false };
            playerStats.skillsBought = 0;
            if (typeof savePlayerStats === 'function') savePlayerStats();
        }

        EventBus.emit('UPDATE_FREEZE_UI', { unlocked: false, cooldown: 0 });
        EventBus.emit('PLAY_SOUND', { id: 'music' });
        EventBus.emit('UI_UPDATE_NEEDED');
        this.terminalReady = true;
        this.updateTerminalProximity();
    }

    onAddScore(amount) {
        this.score += amount;
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    onPauseGame() {
        if (this.gameState === 'PLAYING') {
            this.pausedFromState = this.gameState;
            this.gameState = 'PAUSED';
            this.pauseStartTime = performance.now() / 1000;
        }
    }

    onResumeGame() {
        if (this.gameState === 'PAUSED') {
            this.gameState = this.pausedFromState;
            if (this.pauseStartTime > 0) {
                this.totalPausedTime += (performance.now() / 1000) - this.pauseStartTime;
                this.pauseStartTime = 0;
            }
        }
    }

    onPlayerDied() {
        this.gameState = 'GAMEOVER';
        this.isWaveActive = false;
        this.pendingEnemySpawns.length = 0;
        this.pendingAggressiveSpawns = 0;
        this.enemySpawnTimer = 0;
        if (this.waveTimeout) clearTimeout(this.waveTimeout);
        if (this.glitchInterval) clearInterval(this.glitchInterval);

        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('OmniCorpStats');
        }

        if (playerStats) {
            playerStats.plantsDestroyed = 0;
            playerStats.wavesSurvived = 0;
            playerStats.totalDataGathered = 0;
            playerStats.skillsBought = 0;
            playerStats.activeDirective = null;
            playerStats.directiveProgress = 0;
            playerStats.completedDirectives = [];
            playerStats.abandonedDirectives = [];
            for (let key in playerStats.kills) {
                playerStats.kills[key] = { body: 0, head: 0 };
            }
        }

        for (let wKey in weapons) {
            if (wKey !== 'pistol') weapons[wKey].owned = false;
            weapons[wKey].level = 1;
        }

        for (let sKey in skills) {
            skills[sKey].level = 0;
        }

        this.isElevating = false;
        this.elevatorPhase = 'idle';
        this.liftPassengerLock = false;
        EventBus.emit('STOP_AUDIO', { id: 'elevatorMove' });
        EventBus.emit('STOP_AUDIO', { id: 'elevatorStop' });
        EventBus.emit('STOP_AUDIO', { id: 'gateOpen' });
        EventBus.emit('STOP_ELEVATOR_MOVE');
        EventBus.emit('STOP_AUDIO', { id: 'music' });
        EventBus.emit('GAME_OVER', { score: this.score, wave: this.currentWave });
    }

    startWaveCountdown(isFirstWave = false) {
        if (this.waveTimeout) {
            clearTimeout(this.waveTimeout);
            this.waveTimeout = null;
        }
        if (this.waveSwapTimeout) {
            clearTimeout(this.waveSwapTimeout);
            this.waveSwapTimeout = null;
        }
        if (this.waveStartMoveTimeout) {
            clearTimeout(this.waveStartMoveTimeout);
            this.waveStartMoveTimeout = null;
        }
        if (this.glitchInterval) {
            clearInterval(this.glitchInterval);
            this.glitchInterval = null;
        }

        this.sectorLiftTransit = this.activePodIsSector;
        this.activePodIsSector = false;
        this.terminalReady = false;
        this.activeResearchFloor = null;
        this.activeResearchStation = null;
        this.isResearchHubActive = false;
        this.researchFloorActive = false;
        this.setTerminalPromptVisible(false);
        this.setResearchHubPromptVisible(false);
        EventBus.emit('TERMINAL_RESET');

        if (this.pendingTargetFloor !== null) {
            this.currentWave = this.pendingTargetFloor;
            this.pendingTargetFloor = null;
        } else if (!isFirstWave) {
            this.currentWave++;
            this.enemiesToSpawn += 2;
        }

        const floorInfo = getCampaignFloorInfo(this.currentWave);
        this.pendingResearchArrival = floorInfo.isResearchFloor && this.researchVisitedFloor !== this.currentWave;
        this.pendingGateArrival = floorInfo.isSectorGate && this.researchVisitedFloor !== this.currentWave;
        this.nodeState = 'none';
        EventBus.emit('WAVE_CHANGED', this.currentWave);
        this.elevatorExtraTime = floorInfo.isCaveFloor ? 6 : 0;
        EventBus.emit('WAVE_STARTING', {
            wave: this.currentWave,
            isCave: floorInfo.isCaveFloor,
            sector: floorInfo.sector.name,
            isServerRoom: floorInfo.isSectorGate,
            bossCount: floorInfo.bossCount
        });
        EventBus.emit('RESEARCH_ROOMS_SET', { active: this.pendingResearchArrival });
        // A szektorlift tengelye azonos a főaréna tengelyével: a lift indulásakor a játékos a külön pályáról a
        // pontosan ugyanolyan, lezárt főarénába kerül, így a lefelé út már a megszokott módon zajlik
        // (a csere a lift felpörgése alatt, elsötétített képernyő mögött történik)
        const swap = () => {
            if (fadeSwap && this.player && this.player.camera) {
                this.player.camera.position.x += sectorHallCenter;
                this.player.playerVelX = 0;
                this.player.playerVelZ = 0;
            }
            EventBus.emit('RESEARCH_NODE_SECTION_SET', { active: this.pendingGateArrival, isFinal: this.currentWave === 101 });
        };
        const fadeSwap = this.sectorLiftTransit && this.currentWave !== 102;
        this.sectorLiftTransit = false;
        if (fadeSwap) {
            EventBus.emit('SCREEN_FADE', { black: true, ms: 450 });
            this.waveSwapTimeout = setTimeout(() => {
                this.waveSwapTimeout = null;
                swap();
                EventBus.emit('SCREEN_FADE', { black: false, ms: 900 });
            }, 520);
        } else {
            swap();
        }

        // Zsilipkapuk bezárása a szintek közötti liftezés idejére
        EventBus.emit('CLOSE_AIRLOCK_GATES', { duration: 1.0 });

        // Ipari felvonó leereszkedésének indítása a következő szintre
        this.isElevating = true;
        this.elevatorPhase = 'moving';
        this.elevatorTimer = 0;

        const camPos = this.player && this.player.camera ? this.player.camera.position : { x: 0, z: 0 };
        const startMove = () => {
            const pos = this.player && this.player.camera ? this.player.camera.position : camPos;
            EventBus.emit('START_ELEVATOR_MOVE', floorInfo.isCaveFloor ? { singleCabin: { x: pos.x, z: pos.z } } : undefined);
        };
        // A lift a csere után, a fekete képernyő alatt indul
        if (fadeSwap) {
            this.waveStartMoveTimeout = setTimeout(() => {
                this.waveStartMoveTimeout = null;
                startMove();
            }, 540);
        }
        else startMove();
        EventBus.emit('PLAY_SOUND', { id: 'elevatorMove' });
    }

    _startResearchFloor() {
        const isGate = this.pendingGateArrival;
        this.pendingResearchArrival = false;
        this.pendingGateArrival = false;
        this.researchFloorActive = true;
        this.researchVisitedFloor = this.currentWave;
        this.activeResearchFloor = this.currentWave;
        if (this.currentWave === 101) this.finalLiftStarted = false;
        this.gameState = 'PLAYING';
        const floorInfo = getCampaignFloorInfo(this.currentWave);
        // A szektorhatár-szinteken a központi terminál nem használható: a lejutás csak az új lifttel lehetséges
        this.nodeState = isGate ? 'sealed' : 'none';
        this.terminalReady = !isGate;
        EventBus.emit('RESEARCH_FLOOR_ENTERED', { floor: this.currentWave, sector: floorInfo.sector.name, isGate, isFinal: floorInfo.isFinalGate });
        this.updateTerminalProximity();
    }

    _startWaveAction() {
        this.isWaveActive = true;
        this.hasStartedAnyWave = true;
        this.waveStartTime = performance.now() / 1000;
        this.totalPausedTime = 0;

        EventBus.emit('WAVE_STARTED', { wave: this.currentWave });

        // A földön nincs ellátmány, csak az ellenfelek dobnak
        if (this.itemManager) {
            if (this.itemManager.lootItems) {
                this.itemManager.clearLootItems();
            }

        }

        // A nagy hullámok ne hozzák létre egyszerre az összes modellt.
        if (this.enemyManager) {
            this.pendingEnemySpawns.length = 0;
            this.pendingAggressiveSpawns = 0;
            const floorInfo = getCampaignFloorInfo(this.currentWave);
            const bossCount = floorInfo.bossCount;
            const initialSpawns = floorInfo.isCaveFloor ? 10 : this.enemiesToSpawn + bossCount;
            this.caveReinforcementTimer = 4;
            // A barlangban a Nexus Node-ok nem egyszerre, hanem időben eltolva érkeznek
            this.caveBossesLeft = floorInfo.isCaveFloor ? bossCount : 0;
            this.caveBossClock = 0;
            for (let i = 0; i < initialSpawns; i++) {
                let isBoss = !floorInfo.isCaveFloor && i < bossCount;
                this.pendingEnemySpawns.push({ isBoss, forceType: null });
                this.pendingAggressiveSpawns++;
            }

            // Crawler zombik a sárga pocsolyák száma alapján
            let yellowPuddles = (this.itemManager && this.itemManager.toxicPuddles)
                ? this.itemManager.toxicPuddles.filter(p => p.userData && p.userData.state === 'yellow').length
                : 0;

            let crawlerCount = 0;
            if (yellowPuddles >= 40) crawlerCount = 4;
            else if (yellowPuddles >= 25) crawlerCount = 2;
            else if (yellowPuddles >= 10) crawlerCount = 1;

            for (let c = 0; c < crawlerCount; c++) {
                this.pendingEnemySpawns.push({ isBoss: false, forceType: 'crawler' });
            }
        }
        this.enemySpawnTimer = 0;
        this.spawnQueuedEnemies(0);
    }

    getAliveBossCount() {
        return this.enemyManager ? this.enemyManager.enemies.filter(e => e.type === 'boss').length : 0;
    }

    isCaveBattleOver() {
        return this.getAliveBossCount() === 0 && !(this.caveBossesLeft > 0) &&
            !this.pendingEnemySpawns.some(spawn => spawn.isBoss);
    }

    // A barlang járataiból folyamatosan érkeznek az apróbb ellenfelek, amíg él Nexus Node
    updateCaveReinforcements(delta) {
        if (!this.isWaveActive || !this.enemyManager || this.currentWave !== 102) return;
        if (this.isCaveBattleOver()) return;
        if (this.caveBossesLeft > 0) {
            this.caveBossClock += delta;
            const bossTotal = getCampaignFloorInfo(this.currentWave).bossCount;
            const arrivedBosses = bossTotal - this.caveBossesLeft;
            // 1. Node 3 mp után, a következők 28 mp-es időközzel
            if (this.caveBossClock >= 3 + arrivedBosses * 28) {
                this.caveBossesLeft--;
                this.pendingEnemySpawns.unshift({ isBoss: true, forceType: null });
                this.pendingAggressiveSpawns++;
                this.enemySpawnTimer = 0;
            }
        }
        this.caveReinforcementTimer -= delta;
        if (this.caveReinforcementTimer > 0) return;
        this.caveReinforcementTimer = 2.5;
        const smallEnemies = this.enemyManager.enemies.filter(e => e.type !== 'boss').length;
        if (smallEnemies + this.pendingEnemySpawns.length >= 18) return;
        const types = [null, null, 'runner', 'crawler'];
        const forceType = types[Math.floor(Math.random() * types.length)];
        this.pendingEnemySpawns.push({ isBoss: false, forceType });
        if (forceType !== 'crawler') this.pendingAggressiveSpawns++;
        const extra = 1 + Math.floor(Math.random() * 2);
        for (let n = 0; n < extra && smallEnemies + this.pendingEnemySpawns.length < 18; n++) {
            this.pendingEnemySpawns.push({ isBoss: false, forceType: null });
            this.pendingAggressiveSpawns++;
        }
    }

    spawnQueuedEnemies(delta) {
        if (!this.enemyManager || this.pendingEnemySpawns.length === 0) return;

        this.enemySpawnTimer = Math.max(0, this.enemySpawnTimer - delta);
        if (this.enemySpawnTimer > 0 || this.enemyManager.enemies.length >= this.maxConcurrentEnemies) return;

        // Csak a barlangban érkezhet egyszerre több ellenfél (különböző járatokból)
        const batchSize = this.currentWave === 102 ? 2 + Math.floor(Math.random() * 3) : 1;
        for (let n = 0; n < batchSize && this.pendingEnemySpawns.length > 0; n++) {
            if (this.enemyManager.enemies.length >= this.maxConcurrentEnemies) break;
            const nextSpawn = this.pendingEnemySpawns.shift();
            if (nextSpawn.isBoss && this.currentWave === 102) {
                EventBus.emit('CAMERA_SHAKE', 2.0);
            }
            if (nextSpawn.forceType !== 'crawler') this.pendingAggressiveSpawns--;
            const spawnPosition = this.enemyManager.getEdgeSpawnPosition(nextSpawn.isBoss ? 'boss' : null);
            this.enemyManager.spawnEnemy(
                spawnPosition.x,
                spawnPosition.z,
                nextSpawn.isBoss,
                nextSpawn.forceType,
                this.currentWave,
                undefined,
                spawnPosition
            );
        }
        this.enemySpawnTimer = this.enemySpawnInterval;
    }

    onZombieKilled(data) {
        if (data && data.enemy) {
            let statType = data.enemy.type;
            let isHeadshot = data.isHeadshot;

            if (playerStats && playerStats.kills && playerStats.kills[statType]) {
                if (isHeadshot) playerStats.kills[statType].head++;
                else playerStats.kills[statType].body++;
                if (typeof savePlayerStats === 'function') savePlayerStats();
            }

            if (isHeadshot) this.checkDirective('kill_head', statType);
            else this.checkDirective('kill_body', statType);

            if (data.enemy.shieldType) {
                this.checkDirective('puddle_kill', data.enemy.shieldType);
            }
        }

        if (this.isWaveActive && this.enemyManager) {
            let activeAggressive = this.enemyManager.enemies.filter(e => e.type !== 'crawler').length;
            const caveWon = this.currentWave === 102 && this.isCaveBattleOver();
            if (caveWon || (activeAggressive === 0 && this.pendingAggressiveSpawns === 0)) {
                this.endWave();
            }
        }
    }

    endWave() {
        if (!this.isWaveActive) return;
        this.isWaveActive = false;
        this.pendingEnemySpawns.length = 0;
        this.pendingAggressiveSpawns = 0;
        this.enemySpawnTimer = 0;

        let waveDuration = (performance.now() / 1000) - this.waveStartTime - this.totalPausedTime;
        let parTime = this.enemiesToSpawn * 4;
        this.lastWaveBonus = 0;

        if (waveDuration < parTime) {
            let savedSeconds = Math.floor(parTime - waveDuration);
            this.lastWaveBonus = savedSeconds * 10;
            this.score += this.lastWaveBonus;
        }

        if (playerStats) {
            playerStats.wavesSurvived = Math.max(playerStats.wavesSurvived || 0, this.currentWave);
            if (typeof savePlayerStats === 'function') savePlayerStats();
        }

        EventBus.emit('WAVE_COMPLETED', { wave: this.currentWave, bonus: this.lastWaveBonus });
        EventBus.emit('UI_UPDATE_NEEDED');

        const nextFloor = this.currentWave + 1;
        const nextFloorInfo = nextFloor <= 102 ? getCampaignFloorInfo(nextFloor) : null;
        const isResearchStop = !!(nextFloorInfo && nextFloorInfo.isResearchFloor);
        this.activeResearchFloor = null;

        if (this.currentWave >= 102) {
            this.gameState = 'VICTORY';
            this.terminalReady = false;
            this.setTerminalPromptVisible(false);
            EventBus.emit('STOP_ELEVATOR_MOVE');
            EventBus.emit('CAMPAIGN_COMPLETED', {
                floor: this.currentWave,
                nodesDefeated: 3,
                score: this.score
            });
            return;
        }

        this.terminalReady = true;
        this.gameState = 'PLAYING';
        EventBus.emit('TERMINAL_ACTIVATED', {
            wave: this.currentWave,
            researchFloor: null
        });
        EventBus.emit('TERMINAL_AVAILABLE', {
            wave: this.currentWave,
            researchFloor: isResearchStop ? nextFloor : null,
            sector: nextFloorInfo ? nextFloorInfo.sector.name : null
        });
        this.updateTerminalProximity();
    }

    setTerminalPromptVisible(visible, maglift = false) {
        if (this.terminalPromptVisible === visible && this.terminalPromptMaglift === maglift) return;
        this.terminalPromptVisible = visible;
        this.terminalPromptMaglift = maglift;
        EventBus.emit('SHOW_INTERACT_PROMPT', {
            visible,
            type: 'terminal',
            maglift,
            researchFloor: null
        });
    }

    // A 101. szinten, a feloldott kijárat után a barlangba vezető egyszemélyes Maglift áll a helyiségben
    isFinalLiftAvailable() {
        return !this.finalLiftStarted && this.currentWave === 101 && this.nodeState === 'unlocked' &&
            this.researchFloorActive && this.gameState === 'PLAYING' && !this.isWaveActive &&
            !!this.levelManager && !!this.levelManager.finalPodRoomActive &&
            !!this.player && !!this.player.camera;
    }

    isNearFinalLift() {
        const { x, z } = this.player.camera.position;
        return Math.hypot(x + sectorHallCenter, z) <= 3.2 && this.isFacingTerminalDoor(0, -sectorHallCenter);
    }

    updateTerminalProximity() {
        if (this.isFinalLiftAvailable()) {
            this.setTerminalPromptVisible(this.isNearFinalLift(), true);
            return;
        }
        if (this.researchFloorActive && this.nodeState === 'unlocked' && this.player && this.player.camera) {
            const { x, z } = this.player.camera.position;
            const doorwayZ = 4.45 * (3.2 / 9.8);
            const isNearSectorPod = Math.hypot(x + sectorHallCenter, z - doorwayZ) <= 0.9;
            this.setTerminalPromptVisible(isNearSectorPod && this.isFacingTerminalDoor(doorwayZ, -sectorHallCenter));
            return;
        }
        if (!this.terminalReady || !this.player || !this.player.camera) {
            this.setTerminalPromptVisible(false);
            return;
        }

        const { x, z } = this.player.camera.position;
        const doorwayZ = 4.45 * (3.2 / 9.8);
        const isNearTerminal = Math.hypot(x, z - doorwayZ) <= 0.9;
        this.setTerminalPromptVisible(isNearTerminal && this.isFacingTerminalDoor(doorwayZ));
    }

    isFacingTerminalDoor(doorwayZ, doorwayX = 0) {
        const camera = this.player.camera;
        const toDoor = new THREE.Vector3(doorwayX - camera.position.x, 0, doorwayZ - camera.position.z);
        if (toDoor.lengthSq() < 0.01) return true;

        const forward = camera.getWorldDirection(new THREE.Vector3());
        forward.y = 0;
        forward.normalize();

        return forward.dot(toDoor.normalize()) >= Math.SQRT1_2;
    }

    tryActivateTerminal() {
        if (!this.player || !this.player.camera) return;
        if (this.isFinalLiftAvailable()) {
            if (this.isNearFinalLift()) {
                EventBus.emit('CONSUME_INTERACTION');
                this.setTerminalPromptVisible(false);
                this.beginFinalLiftEntry();
            }
            return;
        }
        if (this.researchFloorActive && this.gameState === 'PLAYING') {
            if (this.nodeState === 'unlocked') {
                const { x, z } = this.player.camera.position;
                const doorwayZ = 4.45 * (3.2 / 9.8);
                if (Math.hypot(x + sectorHallCenter, z - doorwayZ) <= 0.9 &&
                    this.isFacingTerminalDoor(doorwayZ, -sectorHallCenter)) {
                    EventBus.emit('CONSUME_INTERACTION');
                    this.setTerminalPromptVisible(false);
                    this.beginTerminalEntry(true);
                    return;
                }
            }
            if (this.tryResearchHubInteraction()) return;
        }
        if (!this.terminalReady || this.gameState !== 'PLAYING' || !this.player || !this.player.camera) return;

        const { x, z } = this.player.camera.position;
        const doorwayZ = 4.45 * (3.2 / 9.8);
        if (Math.hypot(x, z - doorwayZ) > 0.9 || !this.isFacingTerminalDoor(doorwayZ)) return;

        EventBus.emit('CONSUME_INTERACTION');
        this.setTerminalPromptVisible(false);
        this.beginTerminalEntry();
    }

    beginTerminalEntry(isSectorPod = false) {
        if (!this.levelManager || this.terminalSequence !== 'idle') return;
        this.activePodIsSector = isSectorPod;
        EventBus.emit('CLEAR_CORPSES');
        EventBus.emit('TERMINAL_OPEN', { isSectorPod });
        if (this.weaponSystem) this.weaponSystem.holsterForTerminal();
        this.gameState = 'TERMINAL_TRANSITION';
        this.terminalSequence = 'enter-opening';
        this.terminalSequenceTime = 0;
        this.player.playerVelX = 0;
        this.player.playerVelZ = 0;
        this.levelManager.setPodDoorOpen(true, isSectorPod);
    }

    updateResearchHubProximity() {
        if (!this.researchFloorActive || this.gameState !== 'PLAYING' || !this.player || !this.player.camera) {
            this.setResearchHubPromptVisible(false);
            return;
        }
        const station = this.getHubTarget();
        const stationId = station ? station.id : null;
        if (stationId === this.activeResearchStation) return;
        this.activeResearchStation = stationId;
        this.setResearchHubPromptVisible(!!station, station);
    }

    getAvailableHubStations() {
        if (this.nodeState === 'none') return researchHubStations;
        return this.nodeState === 'cleared' ? [nodeUnlockStation] : [];
    }

    getHubTarget() {
        const position = this.player.camera.position;
        const station = getResearchHubStationAt(position, 2.5, this.getAvailableHubStations());
        if (station) return station;
        return null;
    }

    onTryUnlockNodeExit() {
        if (this.gameState !== 'SHOPPING' || this.terminalSequence !== 'hub-menu' || this.activeResearchStation !== 'unlock') return;
        if (this.nodeState !== 'cleared') return;
        this.nodeState = 'unlocked';
        EventBus.emit('NODE_EXIT_UNLOCKED');
        EventBus.emit('PLAY_SOUND', { id: 'gateOpen' });
        this.openResearchHubShop('unlock');
    }

    updateNodeSection() {
        if (!this.researchFloorActive || !this.player || !this.player.camera) return;
        if (this.nodeState !== 'sealed' && this.nodeState !== 'fighting') return;
        const distance = -this.player.camera.position.x;
        const inCorridor = Math.abs(this.player.camera.position.z) <= researchNodeSection.corridorHalfWidth;
        if (this.nodeState === 'sealed') {
            if (inCorridor && distance > researchNodeSection.gateDistance - 8) {
                EventBus.emit('NODE_GATE_SET', { open: true });
            }
            if (inCorridor && distance > researchNodeSection.lockDistance) this.engageNode();
        } else if (this.nodeState === 'fighting' && this.getAliveBossCount() === 0) {
            this.nodeState = 'cleared';
            EventBus.emit('NODE_CLEARED', { isFinal: this.currentWave === 101 });
            EventBus.emit('PLAY_SOUND', { id: 'gateOpen' });
        }
    }

    engageNode() {
        this.nodeState = 'fighting';
        EventBus.emit('NODE_GATE_SET', { open: false, isFinal: this.currentWave === 101 });
        EventBus.emit('PLAY_SOUND', { id: 'gateOpen' });
        const count = getCampaignFloorInfo(this.currentWave).nodeBossCount;
        for (let i = 0; i < count; i++) {
            const z = count === 1 ? 0 : (i - (count - 1) / 2) * 8;
            this.enemyManager.spawnEnemy(-researchNodeSection.bossDistance, z, true, null, this.currentWave, undefined, { dirX: 1, dirZ: 0 });
        }
    }

    // A lift az indítógomb megnyomásakor azonnal elindul; a játékos marad a jelenlegi kabinpozícióban.
    beginFinalLiftEntry() {
        if (!this.levelManager || this.terminalSequence !== 'idle') return;
        this.finalLiftStarted = true;
        this.gameState = 'PLAYING';
        this.terminalSequence = 'idle';
        this.player.playerVelX = 0;
        this.player.playerVelZ = 0;
        const position = this.player.camera.position;
        this.liftPassengerLock = true;
        this.liftPassengerPos = { x: position.x, z: position.z };
        EventBus.emit('MAGLIFT_DEPARTING');
        this.startWaveCountdown(false);
    }

    updateLiftWalk() {
        const progress = Math.min(1, this.terminalSequenceTime / this.liftWalkDuration);
        const eased = progress * progress * (3 - 2 * progress);
        const from = this.terminalMoveFrom, to = this.terminalMoveTo;
        this.player.camera.position.x = from.x + (to.x - from.x) * eased;
        this.player.camera.position.z = from.z + (to.z - from.z) * eased;
        if (progress < 1) return;
        this.terminalSequence = 'idle';
        this.gameState = 'PLAYING';
        this.player.playerVelX = 0;
        this.player.playerVelZ = 0;
        this.liftPassengerLock = true;
        this.liftPassengerPos = null;
        EventBus.emit('MAGLIFT_DEPARTING');
        this.startWaveCountdown(false);
    }

    setResearchHubPromptVisible(visible, station = null) {
        EventBus.emit('SHOW_INTERACT_PROMPT', {
            visible,
            type: 'research',
            station: station ? station.id : null,
            label: station ? station.label : null
        });
    }

    tryResearchHubInteraction() {
        if (!this.player || !this.player.camera) return;
        const station = this.getHubTarget();
        if (!station) return false;
        EventBus.emit('CONSUME_INTERACTION');
        this.setResearchHubPromptVisible(false);
        this.activeResearchStation = null;

        this.activeResearchStation = station.id;
        this.isResearchHubActive = true;
        this.gameState = 'TERMINAL_TRANSITION';
        this.terminalSequence = 'hub-opening';
        EventBus.emit('RESEARCH_TERMINAL_OPEN', { station: station.id });
        return true;
    }

    onResearchTerminalAnimationComplete({ station, isOpen }) {
        if (station !== this.activeResearchStation) return;
        if (isOpen && this.terminalSequence === 'hub-opening') {
            this.gameState = 'SHOPPING';
            this.terminalSequence = 'hub-menu';
            this.openResearchHubShop(station);
        } else if (!isOpen && this.terminalSequence === 'hub-closing') {
            this.terminalSequence = 'idle';
            this.gameState = 'PLAYING';
            this.isResearchHubActive = false;
            this.activeResearchStation = null;
            EventBus.emit('RESEARCH_TERMINAL_SESSION_CLOSED');
            this.updateResearchHubProximity();
        }
    }

    openResearchHubShop(station) {
        EventBus.emit('OPEN_SHOP', {
            terminal: true,
            hub: true,
            researchFloor: this.activeResearchFloor,
            sector: getCampaignFloorInfo(this.activeResearchFloor).sector.name,
            researchStation: station,
            nodeUnlocked: this.nodeState === 'unlocked',
            isFinalGate: this.activeResearchFloor === 101,
            researchTab: station === 'augmentation' ? 'skills' : 'weapons',
            commsLog: station === 'comms'
                ? Object.keys(researchCommsLog).map(Number).filter(floor => floor <= this.activeResearchFloor)
                    .map(floor => ({ floor, ...researchCommsLog[floor] }))
                : null
        });
    }

    beginTerminalExit() {
        if (!this.levelManager || this.terminalSequence !== 'menu') return;
        EventBus.emit('TERMINAL_CLOSE', { isSectorPod: this.activePodIsSector });
        this.gameState = 'TERMINAL_TRANSITION';
        this.terminalSequence = 'exit-opening';
        this.terminalSequenceTime = 0;
        this.player.playerVelX = 0;
        this.player.playerVelZ = 0;
        EventBus.emit('TERMINAL_RESET');
        if (this.activePodIsSector) this.levelManager.setSectorPodActive(true);
        this.levelManager.setPodDoorOpen(true, this.activePodIsSector);
    }

    beginLiftFromTerminal() {
        if (!this.levelManager || this.gameState !== 'SHOPPING' || this.isResearchHubActive) return;

        const isSectorPod = this.activePodIsSector;
        EventBus.emit('TERMINAL_CLOSE', { isSectorPod });
        EventBus.emit('TERMINAL_RESET');
        this.gameState = 'PLAYING';
        this.terminalSequence = 'idle';
        this.terminalReady = false;
        this.player.playerVelX = 0;
        this.player.playerVelZ = 0;
        this.liftPassengerLock = true;
        this.liftPassengerPos = {
            x: this.player.camera.position.x,
            z: this.player.camera.position.z
        };
        this.liftExitPending = true;
        this.liftExitIsSectorPod = isSectorPod;
        this.liftExitFrom = null;
        this.liftExitTo = null;
        this.liftExitStage = 'opening';
        this.liftExitTimer = 0;
        this.liftLook = null;
        if (isSectorPod) this.levelManager.setSectorPodActive(true);
        this.levelManager.setPodDoorOpen(true, isSectorPod);
        if (this.weaponSystem) this.weaponSystem.drawFromTerminal();
        this.startWaveCountdown(!this.hasStartedAnyWave);
    }

    finishElevatorArrival() {
        this.isElevating = false;
        this.elevatorPhase = 'done';
        this.liftExitPending = false;
        this.liftExitStage = 'idle';
        this.liftExitFrom = null;
        this.liftExitTo = null;
        this.liftExitTimer = 0;
        this.liftPassengerLock = false;
        this.liftPassengerPos = null;
        if (this.pendingResearchArrival || this.pendingGateArrival) this._startResearchFloor();
        else this._startWaveAction();
    }

    // A lift indulásakor a játékos körülnéz, megfordul az ajtó felé, és arccal előre sétál ki; az ajtótól 1 méterre áll meg
    updateLiftExit(delta) {
        if (!this.liftExitPending || !this.player || !this.player.camera) return;
        const isSector = this.liftExitIsSectorPod;
        const doorZ = 4.45 * (3.2 / 9.8);
        const doorProgress = isSector ? this.levelManager.sectorPodDoorProgress : this.levelManager.podDoorProgress;
        const input = this.player.inputManagerRef;
        const ease = (t) => t * t * (3 - 2 * t);
        const clamp01 = (t) => Math.min(1, Math.max(0, t));
        this.liftExitTimer += delta;
        const t = this.liftExitTimer;

        if (this.liftExitStage === 'opening') {
            if (!this.liftLook) {
                const yaw = input ? input.yaw : 0;
                const wrapped = Math.atan2(Math.sin(Math.PI - yaw), Math.cos(Math.PI - yaw));
                this.liftLook = { yaw0: yaw, yawDelta: wrapped, pitch0: input ? input.pitch : 0 };
            }
            const turnDuration = 1.8;
            const k = ease(clamp01(t / turnDuration));
            if (input) {
                // Körbenéz: előbb oldalra, majd vissza az ajtó felé fordul, közben a fej enyhén lebillen
                const glance = Math.sin(clamp01(t / turnDuration) * Math.PI);
                input.yaw = this.liftLook.yaw0 + this.liftLook.yawDelta * k + Math.sin(t * 2.6) * 0.1 * glance;
                input.pitch = this.liftLook.pitch0 * (1 - k) + (-0.08 * glance) + Math.sin(t * 1.9) * 0.04 * glance;
            }
            if (t >= turnDuration && (doorProgress >= 0.98 || t >= 3.0)) {
                const from = this.player.camera.position;
                this.liftExitFrom = { x: from.x, y: from.y, z: from.z };
                this.liftExitTo = { x: isSector ? -sectorHallCenter : 0, y: from.y, z: doorZ + 1 };
                this.liftExitStage = 'walking';
                this.liftExitTimer = 0;
            }
        } else if (this.liftExitStage === 'walking') {
            const duration = 2.4;
            const progress = clamp01(t / duration);
            const eased = ease(progress);
            const sway = Math.sin(progress * Math.PI * 4);
            const envelope = Math.sin(progress * Math.PI);
            this.player.camera.position.set(
                this.liftExitFrom.x + (this.liftExitTo.x - this.liftExitFrom.x) * eased + sway * 0.03 * envelope,
                this.liftExitFrom.y - Math.abs(sway) * 0.04 * envelope,
                this.liftExitFrom.z + (this.liftExitTo.z - this.liftExitFrom.z) * eased
            );
            if (input) {
                input.yaw = Math.PI + sway * 0.05 * envelope;
                input.pitch = Math.sin(progress * Math.PI * 2) * 0.03;
            }
            this.player.playerVelX = 0;
            this.player.playerVelZ = 0;
            if (progress >= 1) {
                this.liftPassengerPos = { x: this.liftExitTo.x, z: this.liftExitTo.z };
                this.liftExitStage = 'closing';
                this.liftExitTimer = 0;
                this.levelManager.setPodDoorOpen(false, isSector);
            }
        } else if (this.liftExitStage === 'closing') {
            if (input) {
                input.yaw = Math.PI;
                input.pitch = 0;
            }
            if (doorProgress <= 0.02 || t >= 1.2) {
                this.liftExitStage = 'done';
                this.liftExitPending = false;
                this.liftLook = null;
            }
        }
    }

    startTerminalMove(target, nextSequence) {
        const position = this.player.camera.position;
        this.terminalMoveFrom = { x: position.x, y: position.y, z: position.z };
        this.terminalMoveTo = target;
        this.terminalSequence = nextSequence;
        this.terminalSequenceTime = 0;
    }

    startTerminalExitTurn() {
        const camera = this.player.camera;
        const podCenterX = this.activePodIsSector ? -sectorHallCenter : 0;
        const exitDirection = new THREE.Vector3(podCenterX - camera.position.x, 0, 5.6 - camera.position.z);
        if (exitDirection.lengthSq() === 0) exitDirection.set(0, 0, 1);
        exitDirection.normalize();

        const targetYaw = Math.atan2(-exitDirection.x, -exitDirection.z);
        const currentRotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        this.terminalTurnFrom = camera.quaternion.clone();
        this.terminalTurnTo = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(currentRotation.x, targetYaw, 0, 'YXZ')
        );
        this.terminalTurnYaw = targetYaw;
        this.terminalSequence = 'exit-turning';
        this.terminalSequenceTime = 0;
    }

    updateTerminalSequence(delta) {
        if (!this.player || !this.player.camera || !this.levelManager) return;
        if (this.terminalSequence === 'lift-walking') {
            this.terminalSequenceTime += delta;
            this.updateLiftWalk();
            return;
        }
        if (this.weaponSystem) this.weaponSystem.updateTerminalTransition(delta);
        this.terminalSequenceTime += delta;
        const activePodDoorProgress = this.activePodIsSector
            ? this.levelManager.sectorPodDoorProgress
            : this.levelManager.podDoorProgress;
        if (this.terminalSequence === 'healing') {
            this.updateHealingSequence();
            return;
        }
        if (this.terminalSequence === 'sterilization') {
            this.updateSterilizationSequence();
            return;
        }

        if (this.terminalSequence === 'enter-opening' && activePodDoorProgress >= 0.98) {
            this.startTerminalMove({ x: this.activePodIsSector ? -sectorHallCenter : 0, y: 1.6, z: 0.15 }, 'enter-moving');
        } else if (this.terminalSequence === 'enter-moving') {
            const progress = Math.min(1, this.terminalSequenceTime / 1.0);
            const eased = progress * progress * (3 - 2 * progress);
            this.player.camera.position.set(
                this.terminalMoveFrom.x + (this.terminalMoveTo.x - this.terminalMoveFrom.x) * eased,
                this.terminalMoveFrom.y + (this.terminalMoveTo.y - this.terminalMoveFrom.y) * eased,
                this.terminalMoveFrom.z + (this.terminalMoveTo.z - this.terminalMoveFrom.z) * eased
            );
            if (progress >= 1) {
                this.terminalSequence = 'enter-closing';
                this.terminalSequenceTime = 0;
                this.levelManager.setPodDoorOpen(false, this.activePodIsSector);
            }
        } else if (this.terminalSequence === 'enter-closing' && activePodDoorProgress <= 0.02) {
            this.gameState = 'SHOPPING';
            this.terminalSequence = 'menu';
            EventBus.emit('TERMINAL_SESSION_ACTIVE');
            EventBus.emit('OPEN_SHOP', {
                shopLockedForNextWave: this.shopLockedForNextWave,
                terminal: true
            });
        } else if (this.terminalSequence === 'exit-opening' && activePodDoorProgress >= 0.98) {
            this.startTerminalExitTurn();
        } else if (this.terminalSequence === 'exit-turning') {
            const progress = Math.min(1, this.terminalSequenceTime / 0.55);
            const eased = progress * progress * (3 - 2 * progress);
            this.player.camera.quaternion.slerpQuaternions(this.terminalTurnFrom, this.terminalTurnTo, eased);
            if (progress >= 1) {
                this.player.camera.quaternion.copy(this.terminalTurnTo);
                const inputManager = this.player.inputManagerRef || (this.weaponSystem && this.weaponSystem.inputManagerRef);
                if (inputManager) inputManager.yaw = this.terminalTurnYaw;
                this.startTerminalMove({ x: this.activePodIsSector ? -sectorHallCenter : 0, y: 1.6, z: 5.6 }, 'exit-moving');
            }
        } else if (this.terminalSequence === 'exit-moving') {
            const progress = Math.min(1, this.terminalSequenceTime / 1.1);
            const eased = progress * progress * (3 - 2 * progress);
            this.player.camera.position.set(
                this.terminalMoveFrom.x + (this.terminalMoveTo.x - this.terminalMoveFrom.x) * eased,
                this.terminalMoveFrom.y + (this.terminalMoveTo.y - this.terminalMoveFrom.y) * eased,
                this.terminalMoveFrom.z + (this.terminalMoveTo.z - this.terminalMoveFrom.z) * eased
            );
            if (progress >= 1) {
                this.terminalSequence = 'exit-closing';
                this.terminalSequenceTime = 0;
                this.levelManager.setPodDoorOpen(false, this.activePodIsSector);
                if (this.weaponSystem) this.weaponSystem.drawFromTerminal();
            }
        } else if (
            this.terminalSequence === 'exit-closing' &&
            activePodDoorProgress <= 0.02 &&
            (!this.weaponSystem ||
                (!this.weaponSystem.terminalWeaponTransition && !this.weaponSystem.isWeaponBusy))
        ) {
            this.terminalSequence = 'idle';
            this.gameState = 'PLAYING';
            this.player.playerVelX = 0;
            this.player.playerVelZ = 0;
            if (this.researchFloorActive) {
                const bossCount = getCampaignFloorInfo(this.currentWave).bossCount;
                this.startWaveCountdown(bossCount > 0);
            } else {
                this.startWaveCountdown(!this.hasStartedAnyWave);
            }
        }
    }

    triggerFreeze() {
        if (skills.freeze && skills.freeze.level > 0 && this.freezeCooldown <= 0 && this.gameState === 'PLAYING') {
            this.activeFreezeTimer = skills.freeze.level * 2; // Szintenként 2 mp
            this.freezeCooldown = 30; // 30 mp cooldown

            EventBus.emit('PLAY_SOUND', { id: 'cryoGas' });
            EventBus.emit('PLAY_SOUND', { id: 'iceCrack' });
            EventBus.emit('FREEZE_TRIGGERED', { duration: this.activeFreezeTimer });
            EventBus.emit('SET_FREEZE_VISUALS', true);
            EventBus.emit('UPDATE_FREEZE_UI', { unlocked: true, cooldown: this.freezeCooldown });
        }
    }

    update(delta) {
        if (this.gameState === 'TERMINAL_TRANSITION') {
            this.updateTerminalSequence(delta);
            return;
        }
        if (this.gameState !== 'PLAYING') return;

        this.updateTerminalProximity();
        this.updateNodeSection();
        this.updateResearchHubProximity();

        // Ipari felvonó és zsilipkapu szekvencia a szintek között
        if (this.isElevating) {
            this.elevatorTimer += delta;

            this.updateLiftExit(delta);

            // A játékos a lift útja alatt egy helyben áll (kivezetés közben a kivezetés mozgatja)
            if (this.liftPassengerLock && this.liftExitStage !== 'walking' && this.player && this.player.camera) {
                const camPos = this.player.camera.position;
                if (!this.liftPassengerPos) this.liftPassengerPos = { x: camPos.x, z: camPos.z };
                camPos.x = this.liftPassengerPos.x;
                camPos.z = this.liftPassengerPos.z;
                this.player.playerVelX = 0;
                this.player.playerVelZ = 0;
            }

            // 1. Fázis: Lift süllyed a mélybe (6.5 mp dübörgés és fal-textúra görgetés)
            if (this.elevatorPhase === 'moving') {
                if (this.elevatorTimer >= 6.5 + this.elevatorExtraTime) {
                    this.elevatorPhase = 'stopping';
                    EventBus.emit('STOP_AUDIO', { id: 'elevatorMove' });
                    EventBus.emit('PLAY_SOUND', { id: 'elevatorStop' });
                    EventBus.emit('STOP_ELEVATOR_MOVE');
                    EventBus.emit('CAMERA_DIP', { duration: this.currentWave === 102 ? 1.1 : 0.7 });
                    if (this.currentWave === 102) EventBus.emit('CAMERA_SHAKE', 0.9);
                    if (!this.liftExitPending) this.liftPassengerLock = false;
                    EventBus.emit('ELEVATOR_ARRIVED', { wave: this.currentWave });
                }
            } 
            // 2. Fázis: Lift megáll (1.5 mp fékezés), megérkeztünk -> kinyílnak a zsilipkapuk
            else if (this.elevatorPhase === 'stopping') {
                if (this.elevatorTimer >= 8.0 + this.elevatorExtraTime) {
                    this.elevatorPhase = 'opening';
                    EventBus.emit('PLAY_SOUND', { id: 'gateOpen' });
                    EventBus.emit('OPEN_AIRLOCK_GATES', { duration: 7.5 });
                    EventBus.emit('GATES_OPENING', { wave: this.currentWave });
                }
            } 
            // 3. Fázis: Zsilipkapuk kitárultak -> a szint élesedik, ellenfelek beözönlenek
            else if (this.elevatorPhase === 'opening') {
                if (this.elevatorTimer >= 15.5 + this.elevatorExtraTime && !this.liftExitPending) {
                    this.finishElevatorArrival();
                }
            }
        }

        this.updateCaveReinforcements(delta);

        // Fagyasztás időzítő és terem effektek
        if (this.activeFreezeTimer > 0) {
            let prevTimer = this.activeFreezeTimer;
            this.activeFreezeTimer -= delta;

            if (this.activeFreezeTimer <= 0 && prevTimer > 0) {
                EventBus.emit('SET_FREEZE_VISUALS', false);
                EventBus.emit('STOP_AUDIO', { id: 'cryoGas' });
                EventBus.emit('STOP_AUDIO', { id: 'iceCrack' });
            }
        }

        // Fagyasztás visszahűlési idő (cooldown)
        if (this.freezeCooldown > 0) {
            this.freezeCooldown -= delta;
            if (skills.freeze && skills.freeze.level > 0) {
                EventBus.emit('UPDATE_FREEZE_UI', {
                    unlocked: true,
                    cooldown: Math.max(0, this.freezeCooldown)
                });
            }
        }

        // Ellenőrzés: ha minden agresszív zombi elpusztult
        if (this.isWaveActive && this.enemyManager) {
            let activeAggressive = 0;
            for (const enemy of this.enemyManager.enemies) {
                if (enemy.type !== 'crawler') activeAggressive++;
            }
            if (activeAggressive === 0 && this.pendingAggressiveSpawns === 0) {
                this.endWave();
            }
        }

        if (this.isWaveActive) this.spawnQueuedEnemies(delta);

        this.hudUpdateTimer += delta;
        if (this.hudUpdateTimer < 0.1) return;
        this.hudUpdateTimer %= 0.1;

        // HUD frissítési adatok összeállítása és kiküldése
        let activeDirectiveData = null;
        if (playerStats && playerStats.activeDirective) {
            ['tier1', 'tier2', 'tier3'].forEach(tier => {
                if (OmniCorpDirectives && OmniCorpDirectives[tier]) {
                    let f = OmniCorpDirectives[tier].find(d => d.id === playerStats.activeDirective);
                    if (f) activeDirectiveData = f;
                }
            });
        }

        let currentWeapon = this.weaponSystem ? weapons[this.weaponSystem.currentWeaponId] : null;
        let parTime = this.enemiesToSpawn * 4;
        let waveDuration = this.isWaveActive ? ((performance.now() / 1000) - this.waveStartTime - this.totalPausedTime) : 0;
        let timeLeft = Math.max(0, parTime - waveDuration);

        EventBus.emit('UPDATE_HUD', {
            playerHealth: this.player ? this.player.health : 100,
            playerArmor: this.player ? this.player.armor : 0,
            playerResonators: this.player ? this.player.resonators : 0,
            playerMedkits: this.player ? this.player.medkits : 0,
            playerStamina: this.player ? this.player.stamina : 100,
            isExhausted: this.player ? this.player.isExhausted : false,
            playerInfection: this.player ? this.player.infection : 0,
            isWaveActive: this.isWaveActive,
            timeLeft: timeLeft,
            parTime: parTime,
            weaponData: currentWeapon,
            activeDirective: playerStats ? playerStats.activeDirective : null,
            directiveData: activeDirectiveData,
            directiveProgress: playerStats ? playerStats.directiveProgress : 0,
            gameState: this.gameState
        });

    }

    sendShopData() {
        let currentWId = this.weaponSystem ? this.weaponSystem.currentWeaponId : 'pistol';
        let puddlesCount = (this.itemManager && this.itemManager.toxicPuddles) ? this.itemManager.toxicPuddles.length : 0;
        let sterilizationPuddleCount = this.getSterilizablePuddleCount();

        let needsAmmo = false;
        for (let key in weapons) {
            if (weapons[key].owned && weapons[key].reserve < weapons[key].maxReserve) {
                needsAmmo = true;
                break;
            }
        }

        let payload = {
            score: this.score,
            lastWaveBonus: this.lastWaveBonus,
            weapons: weapons,
            currentWeaponId: currentWId,
            skills: skills,
            playerHealth: this.player ? this.player.health : 100,
            playerArmor: this.player ? this.player.armor : 0,
            playerInfection: this.player ? this.player.infection : 0,
            playerMedkits: this.player ? this.player.medkits : 0,
            maxMedkits: 3,
            playerResonators: this.player ? this.player.resonators : 0,
            maxResonators: 1,
            toxicPuddlesCount: puddlesCount,
            sterilizationPuddleCount,
            needsAmmo: needsAmmo,
            playerStats: playerStats,
            shopLockedForNextWave: this.shopLockedForNextWave || false,
            hub: this.terminalSequence === 'hub-menu',
            researchStation: this.activeResearchStation
        };

        EventBus.emit('SHOP_DATA_READY', payload);
    }

    // ==========================================
    // SHOP LOGIKA ÉS ESEMÉNYEK
    // ==========================================
    onTryBuyWeapon(data) {
        const { id, price } = data;
        let w = weapons[id];
        if (!w || this.score < price || w.level >= 5) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= price;
        EventBus.emit('PLAY_SOUND', { id: 'purchase' });

        if (!w.owned) {
            w.owned = true;
            if (this.weaponSystem) this.weaponSystem.switchWeapon(id);
            w.ammo = w.maxAmmo;
            w.reserve = w.maxReserve;

            if (playerStats && playerStats.weaponsBought) {
                playerStats.weaponsBought[id] = true;
                if (typeof savePlayerStats === 'function') savePlayerStats();
            }
        } else {
            w.level++;
            if (w.level === 2) w.maxReserve = Math.floor(w.maxReserve * 1.5);
            if (w.level === 3) w.reloadTime = Math.floor(w.reloadTime * 0.75);
            if (w.level === 4) {
                if (id === 'super') {
                    w.damage = Math.floor(w.damage * 1.5);
                } else {
                    w.maxAmmo = Math.floor(w.maxAmmo * 1.5);
                    w.ammo = w.maxAmmo;
                }
            }
            if (w.level === 5) w.damage *= 2;
        }
        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
    }

    devMaxAll() {
        for (const id in weapons) {
            const w = weapons[id];
            if (id === 'melee') continue;
            w.owned = true;
            while (w.level < 5) {
                w.level++;
                if (w.level === 2) w.maxReserve = Math.floor(w.maxReserve * 1.5);
                if (w.level === 3) w.reloadTime = Math.floor(w.reloadTime * 0.75);
                if (w.level === 4) {
                    if (id === 'super') w.damage = Math.floor(w.damage * 1.5);
                    else w.maxAmmo = Math.floor(w.maxAmmo * 1.5);
                }
                if (w.level === 5) w.damage *= 2;
            }
            if (playerStats && playerStats.weaponsBought) playerStats.weaponsBought[id] = true;
        }
        for (const id in skills) {
            const sk = skills[id];
            while (sk.level < sk.maxLevel) {
                sk.level++;
                if (id === 'ammoLoot') {
                    for (const key in weapons) weapons[key].maxReserve = Math.floor(weapons[key].maxReserve * 1.20);
                }
            }
        }
        for (const id in weapons) {
            if (id === 'melee') continue;
            weapons[id].ammo = weapons[id].maxAmmo;
            weapons[id].reserve = weapons[id].maxReserve;
        }
        if (this.player) {
            const maxHP = 100 + skills.maxHealth.level * 20;
            this.player.maxHealth = maxHP;
            this.player.health = maxHP;
            EventBus.emit('HP_CHANGED', { current: maxHP, max: maxHP });
        }
        if (skills.freeze.level > 0) EventBus.emit('UPDATE_FREEZE_UI', { unlocked: true, cooldown: this.freezeCooldown });
        if (playerStats && typeof savePlayerStats === 'function') savePlayerStats();
        const cur = this.weaponSystem && weapons[this.weaponSystem.currentWeaponId];
        if (cur) {
            EventBus.emit('AMMO_CHANGED', { ammo: cur.ammo, reserve: cur.reserve, maxAmmo: cur.maxAmmo, maxReserve: cur.maxReserve });
        }
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    onTryBuySkill(data) {
        const { id, price } = data;
        let s = skills[id];
        if (!s || this.score < price || s.level >= s.maxLevel) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= price;
        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        s.level++;

        if (playerStats) {
            playerStats.skillsBought++;
            if (typeof savePlayerStats === 'function') savePlayerStats();
        }

        if (id === 'maxHealth') {
            let maxHP = 100 + (skills.maxHealth.level * 20);
            if (this.player) {
                this.player.maxHealth = maxHP;
                this.player.health = maxHP;
                EventBus.emit('HP_CHANGED', { current: this.player.health, max: maxHP });
            }
        }

        if (id === 'ammoLoot') {
            for (let key in weapons) {
                weapons[key].maxReserve = Math.floor(weapons[key].maxReserve * 1.20);
            }
        }

        if (id === 'freeze' && s.level === 1) {
            EventBus.emit('UPDATE_FREEZE_UI', { unlocked: true, cooldown: this.freezeCooldown });
        }

        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
    }

    onTryBuyAmmo(data) {
        const weapon = data && weapons[data.weaponId];
        const amount = data && data.amount;
        const price = ammoPrices[data && data.weaponId];
        const isLiftTerminal = this.gameState === 'SHOPPING' && this.terminalSequence === 'menu';
        if (!isLiftTerminal || !weapon || !weapon.owned || !Number.isInteger(amount) ||
            amount <= 0 || !Number.isFinite(price) || weapon.reserve >= weapon.maxReserve ||
            amount > weapon.maxReserve - weapon.reserve || this.score < amount * price) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= amount * price;
        weapon.reserve += amount;

        if (this.weaponSystem && this.weaponSystem.currentWeaponId === data.weaponId) {
            EventBus.emit('AMMO_CHANGED', { current: weapon.ammo, max: weapon.reserve });
        }

        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
    }

    onTryBuyMedkit(data) {
        let price = data.price || 100;
        if (this.score < price || (this.player && this.player.medkits >= 3)) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= price;
        if (this.player) this.player.medkits++;
        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
    }

    onTryBuyHeal(data) {
        if (!data || !data.confirmed || this.gameState !== 'SHOPPING' ||
            (this.terminalSequence !== 'menu' && this.terminalSequence !== 'hub-menu')) return;

        let maxHP = 100 + (skills.maxHealth ? skills.maxHealth.level * 20 : 0);
        let missingHP = this.player ? (maxHP - this.player.health) : 0;
        let healCost = Math.ceil(missingHP * 2);

        if (this.score < healCost || missingHP <= 0) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= healCost;
        if (this.player) {
            this.player.health = maxHP;
            EventBus.emit('HP_CHANGED', { current: this.player.health, max: maxHP });
        }

        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
        const rotation = new THREE.Euler().setFromQuaternion(this.player.camera.quaternion, 'YXZ');
        this.terminalHealingOriginal = this.player.camera.quaternion.clone();
        this.terminalHealingLookUp = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotation.x - 0.2, rotation.y, rotation.z, 'YXZ')
        );
        this.terminalHealingLookDown = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotation.x + 0.2, rotation.y, rotation.z, 'YXZ')
        );
        this.gameState = 'TERMINAL_TRANSITION';
        this.terminalSequence = 'healing';
        this.terminalSequenceTime = 0;
        EventBus.emit('HEALING_STARTED');
        EventBus.emit('HEALING_STEAM', 0);
    }

    updateHealingSequence() {
        const elapsed = this.terminalSequenceTime;
        const ease = (progress) => {
            const clamped = Math.min(1, Math.max(0, progress));
            return clamped * clamped * (3 - 2 * clamped);
        };
        const camera = this.player.camera;
        let steamIntensity = 0;

        if (elapsed < 8.5) {
            steamIntensity = ease(elapsed / 8.5);
        } else if (elapsed < 9.5) {
            steamIntensity = 1 - ease((elapsed - 8.5) / 1);
        }

        if (elapsed < 0.8) {
            camera.quaternion.copy(this.terminalHealingOriginal);
        } else if (elapsed < 2.4) {
            camera.quaternion.slerpQuaternions(
                this.terminalHealingOriginal,
                this.terminalHealingLookUp,
                ease((elapsed - 0.8) / 1.6)
            );
        } else if (elapsed < 3.6) {
            camera.quaternion.copy(this.terminalHealingLookUp);
        } else if (elapsed < 5.2) {
            camera.quaternion.slerpQuaternions(
                this.terminalHealingLookUp,
                this.terminalHealingLookDown,
                ease((elapsed - 3.6) / 1.6)
            );
        } else if (elapsed < 6.4) {
            camera.quaternion.copy(this.terminalHealingLookDown);
        } else if (elapsed < 8.0) {
            camera.quaternion.slerpQuaternions(
                this.terminalHealingLookDown,
                this.terminalHealingOriginal,
                ease((elapsed - 6.4) / 1.6)
            );
        } else {
            camera.quaternion.copy(this.terminalHealingOriginal);
        }

        EventBus.emit('HEALING_STEAM', steamIntensity);

        if (elapsed >= 11) {
            EventBus.emit('HEALING_STEAM', 0);
            camera.quaternion.copy(this.terminalHealingOriginal);
            const inputManager = this.player.inputManagerRef;
            if (inputManager) {
                const rotation = new THREE.Euler().setFromQuaternion(this.terminalHealingOriginal, 'YXZ');
                inputManager.yaw = rotation.y;
                inputManager.pitch = rotation.x;
            }
            this.terminalSequence = this.isResearchHubActive ? 'hub-menu' : 'menu';
            this.gameState = 'SHOPPING';
            EventBus.emit('HEALING_COMPLETED');
        }
    }

    onTryBuyArmor(data) {
        let armorCost = data.price || 40;
        let maxArmor = 100;
        let currentArmor = this.player ? this.player.armor : 0;
        let missingArmor = maxArmor - currentArmor;

        if (this.score < armorCost || missingArmor <= 0) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= armorCost;
        if (this.player) {
            this.player.armor = Math.min(maxArmor, this.player.armor + 25);
            EventBus.emit('ARMOR_CHANGED', { current: this.player.armor, max: maxArmor });
        }

        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
    }

    onTryBuyClean(data) {
        if (!data || !data.confirmed || this.gameState !== 'SHOPPING' ||
            (this.terminalSequence !== 'menu' && this.terminalSequence !== 'hub-menu')) return;

        let puddlesCount = this.getSterilizablePuddleCount();
        let cost = puddlesCount * 10;

        if (this.score < cost || puddlesCount <= 0) {
            EventBus.emit('PURCHASE_FAILED');
            this.sendShopData();
            return;
        }

        this.score -= cost;
        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        EventBus.emit('PURCHASE_SUCCESS');
        this.beginSterilization(puddlesCount);
        this.sendShopData();
    }

    onTryBuyNexusPurge() {
        const cost = 2000;
        const inAllowedShop = this.gameState === 'SHOPPING' &&
            (this.terminalSequence === 'menu' || this.terminalSequence === 'hub-menu');
        if (!inAllowedShop || !this.player || this.player.infection <= 0 || this.score < cost) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= cost;
        this.player.infection = 0;
        EventBus.emit('INFECTION_CHANGED', { playerInfection: 0 });
        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        EventBus.emit('PURCHASE_SUCCESS');
        EventBus.emit('SHOW_LOOT_POPUP', { text: 'NEXUS SYNC MEGTISZTVA', color: '#00ffff' });
        this.sendShopData();
    }

    beginSterilization(puddleCount) {
        const camera = this.player.camera;
        const rotation = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
        this.terminalSterilizationOriginal = camera.quaternion.clone();
        this.terminalSterilizationSide = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotation.x, rotation.y + Math.PI / 2, 0, 'YXZ')
        );
        this.terminalSterilizationLook = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(rotation.x, rotation.y - Math.PI / 3, 0, 'YXZ')
        );
        this.terminalSterilizationCleaned = false;
        this.terminalSterilizationDoorsClosing = false;
        this.gameState = 'TERMINAL_TRANSITION';
        this.terminalSequence = 'sterilization';
        this.terminalSequenceTime = 0;
        EventBus.emit('STERILIZATION_STEAM', 0);
        EventBus.emit('STERILIZATION_STARTED', { puddleCount });
    }

    getSterilizablePuddleCount() {
        if (!this.itemManager) return 0;
        const toxicPuddles = this.itemManager.toxicPuddles || [];
        const plantPuddles = (this.itemManager.activePlants || [])
            .filter(plant => plant.puddle && plant.puddle.visible).length;
        return toxicPuddles.length + plantPuddles;
    }

    updateSterilizationSequence() {
        const elapsed = this.terminalSequenceTime;
        const ease = (progress) => {
            const clamped = Math.min(1, Math.max(0, progress));
            return clamped * clamped * (3 - 2 * clamped);
        };
        const camera = this.player.camera;
        let steamIntensity = 0;

        if (elapsed < 3.0) {
            const progress = ease(elapsed / 3.0);
            camera.quaternion.slerpQuaternions(
                this.terminalSterilizationOriginal,
                this.terminalSterilizationSide,
                progress
            );
            steamIntensity = progress * 0.14;
        } else if (elapsed < 6.0) {
            camera.quaternion.copy(this.terminalSterilizationSide);
            steamIntensity = 0.14 + 0.36 * ease((elapsed - 3.0) / 3.0);
        } else if (elapsed < 8.5) {
            camera.quaternion.copy(this.terminalSterilizationSide);
            steamIntensity = 0.5 + 0.5 * ease((elapsed - 6.0) / 2.5);
            if (!this.isResearchHubActive && !this.researchFloorActive && !this.terminalSterilizationDoorsClosing) {
                this.terminalSterilizationDoorsClosing = true;
                this.levelManager.closeDoors(2.5);
            }
        } else if (elapsed < 9.2) {
            camera.quaternion.copy(this.terminalSterilizationSide);
            steamIntensity = 1;
            if (!this.terminalSterilizationCleaned) {
                this.terminalSterilizationCleaned = true;
                EventBus.emit('STERILIZE_SECTOR');
                EventBus.emit('STERILIZE_AIR');
            }
        } else if (elapsed < 10.8) {
            camera.quaternion.copy(this.terminalSterilizationSide);
            steamIntensity = 1 - 0.95 * ease((elapsed - 9.2) / 1.6);
        } else if (elapsed < 11.4) {
            camera.quaternion.slerpQuaternions(
                this.terminalSterilizationSide,
                this.terminalSterilizationLook,
                ease((elapsed - 10.8) / 0.6)
            );
        } else if (elapsed < 12) {
            camera.quaternion.slerpQuaternions(
                this.terminalSterilizationLook,
                this.terminalSterilizationOriginal,
                ease((elapsed - 11.4) / 0.6)
            );
        } else {
            camera.quaternion.copy(this.terminalSterilizationOriginal);
        }

        EventBus.emit('STERILIZATION_STEAM', steamIntensity);

        if (elapsed >= 12) {
            EventBus.emit('STERILIZATION_STEAM', 0);
            camera.quaternion.copy(this.terminalSterilizationOriginal);
            const inputManager = this.player.inputManagerRef;
            if (inputManager) {
                const rotation = new THREE.Euler().setFromQuaternion(this.terminalSterilizationOriginal, 'YXZ');
                inputManager.yaw = rotation.y;
                inputManager.pitch = rotation.x;
            }
            this.terminalSequence = this.isResearchHubActive ? 'hub-menu' : 'menu';
            this.gameState = 'SHOPPING';
            EventBus.emit('STERILIZATION_COMPLETED');
        }
    }

    onTryBuyResonator(data) {
        let resCost = data.price || 250;
        let maxRes = 1;
        let currentRes = this.player ? this.player.resonators : 0;

        if (this.score < resCost || currentRes >= maxRes) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= resCost;
        if (this.player) this.player.resonators++;
        EventBus.emit('PLAY_SOUND', { id: 'purchase' });
        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
    }

    onTryBuyNeural(data) {
        let uploadCost = data.price || 1000;
        let pending = (playerStats && playerStats.pendingDataPackets) ? playerStats.pendingDataPackets : 0;

        if (this.score < uploadCost || pending <= 0) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= uploadCost;
        playerStats.uploadedDataPackets = (playerStats.uploadedDataPackets || 0) + pending;
        playerStats.pendingDataPackets = 0;
        if (typeof savePlayerStats === 'function') savePlayerStats();

        EventBus.emit('PLAY_SOUND', { id: 'resonatorPowerOn' });
        EventBus.emit('PURCHASE_SUCCESS');
        this.sendShopData();
    }

    // ==========================================
    // DIREKTÍVA LOGIKA
    // ==========================================
    checkDirective(actionType, targetType) {
        if (!playerStats || !playerStats.activeDirective) return;

        let activeData = null;
        ['tier1', 'tier2', 'tier3'].forEach(tier => {
            if (OmniCorpDirectives && OmniCorpDirectives[tier]) {
                let f = OmniCorpDirectives[tier].find(d => d.id === playerStats.activeDirective);
                if (f) activeData = f;
            }
        });

        if (!activeData) return;
        if (playerStats.directiveProgress >= activeData.goal) return;

        if (activeData.type === actionType && activeData.target === targetType) {
            playerStats.directiveProgress++;
            if (typeof savePlayerStats === 'function') savePlayerStats();
            EventBus.emit('UI_UPDATE_NEEDED');

            if (playerStats.directiveProgress >= activeData.goal) {
                EventBus.emit('PLAY_SOUND', { id: 'questComplete' });
                this.score += activeData.reward;
                playerStats.pendingDataPackets = (playerStats.pendingDataPackets || 0) + 1;
                playerStats.completedDirectives.push(playerStats.activeDirective);
                playerStats.activeDirective = null;
                playerStats.directiveProgress = 0;

                const ammoFlash = document.getElementById('ammo-flash');
                if (ammoFlash) {
                    ammoFlash.style.opacity = '0.8';
                    setTimeout(() => { ammoFlash.style.opacity = '0'; }, 500);
                }

                if (typeof savePlayerStats === 'function') savePlayerStats();
                EventBus.emit('UI_UPDATE_NEEDED');
            }
        }
    }

    onAcceptDirective(id) {
        if (!playerStats || playerStats.activeDirective) return;
        playerStats.activeDirective = id;
        playerStats.directiveProgress = 0;
        if (typeof savePlayerStats === 'function') savePlayerStats();

        EventBus.emit('PLAY_SOUND', { id: 'termOpen' });
        EventBus.emit('UI_UPDATE_NEEDED');
    }

    onAbandonDirective() {
        if (!playerStats || !playerStats.activeDirective) return;
        playerStats.abandonedDirectives.push(playerStats.activeDirective);
        playerStats.activeDirective = null;
        playerStats.directiveProgress = 0;
        this.shopLockedForNextWave = true; // KRONOS Szerződésszegés büntetés

        if (typeof savePlayerStats === 'function') savePlayerStats();

        EventBus.emit('PLAY_SOUND', { id: 'termClose' });
        EventBus.emit('UI_UPDATE_NEEDED');
    }
}
