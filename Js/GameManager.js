import * as THREE from 'three';
import EventBus from './EventBus.js';
import { weapons, skills, OmniCorpDirectives } from './Database.js';
import { playerStats, savePlayerStats } from './RuntimeState.js';
import { getCampaignFloorInfo, getResearchHubStationAt, researchCommsLog } from './Campaign.js';

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

        // Ipari felvonó állapotváltozói
        this.isElevating = false;
        this.elevatorPhase = 'idle'; // 'idle', 'moving', 'stopping', 'opening', 'done'
        this.elevatorTimer = 0;

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
        EventBus.on('TRY_BUY_RESONATOR', (data) => this.onTryBuyResonator(data));
        EventBus.on('TRY_BUY_NEURAL', (data) => this.onTryBuyNeural(data));
        EventBus.on('REQUEST_SHOP_UPDATE', () => this.sendShopData());
        EventBus.on('CLEAR_SHOP_LOCK', () => { this.shopLockedForNextWave = false; });
        EventBus.on('CLOSE_SHOP', () => {
            if (this.gameState === 'SHOPPING' && this.terminalSequence === 'hub-menu') {
                this.terminalSequence = 'idle';
                this.gameState = 'PLAYING';
                this.isResearchHubActive = false;
                this.activeResearchStation = null;
                this.updateResearchHubProximity();
                return;
            }
            if (this.gameState !== 'SHOPPING' || !this.terminalReady || this.terminalSequence !== 'menu') return;
            this.beginTerminalExit();
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
            if (!Number.isInteger(floor) || floor < 1 || floor > 100) {
                EventBus.emit('DEV_FLOOR_TARGET_FAILED');
                return;
            }
            this.pendingTargetFloor = floor;
            EventBus.emit('DEV_FLOOR_TARGET_SET', { floor });
        });
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
        this.activeResearchFloor = null;
        this.activeResearchStation = null;
        this.isResearchHubActive = false;
        if (this.levelManager) this.levelManager.setPodDoorOpen(false);
        this.researchFloorActive = false;
        this.pendingResearchArrival = false;
        this.researchVisitedFloor = 0;
        this.pendingTargetFloor = null;
        EventBus.emit('RESEARCH_ROOMS_SET', { active: false });
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
        this.activeResearchFloor = null;
        this.activeResearchStation = null;
        this.isResearchHubActive = false;
        this.researchFloorActive = false;
        this.pendingResearchArrival = false;
        this.researchVisitedFloor = 0;
        this.pendingTargetFloor = null;
        EventBus.emit('RESEARCH_ROOMS_SET', { active: false });
        if (this.levelManager) this.levelManager.setPodDoorOpen(false);
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
        if (this.glitchInterval) {
            clearInterval(this.glitchInterval);
            this.glitchInterval = null;
        }

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
        EventBus.emit('WAVE_CHANGED', this.currentWave);
        EventBus.emit('WAVE_STARTING', {
            wave: this.currentWave,
            sector: floorInfo.sector.name,
            isServerRoom: floorInfo.bossCount > 0 && !this.pendingResearchArrival,
            bossCount: this.pendingResearchArrival ? 0 : floorInfo.bossCount
        });
        EventBus.emit('RESEARCH_ROOMS_SET', { active: this.pendingResearchArrival });

        // Zsilipkapuk bezárása a szintek közötti liftezés idejére
        EventBus.emit('CLOSE_AIRLOCK_GATES', { duration: 1.0 });

        // Ipari felvonó leereszkedésének indítása a következő szintre
        this.isElevating = true;
        this.elevatorPhase = 'moving';
        this.elevatorTimer = 0;

        EventBus.emit('START_ELEVATOR_MOVE');
        EventBus.emit('PLAY_SOUND', { id: 'elevatorMove' });
    }

    _startResearchFloor() {
        this.pendingResearchArrival = false;
        this.researchFloorActive = true;
        this.researchVisitedFloor = this.currentWave;
        this.activeResearchFloor = this.currentWave;
        this.terminalReady = true;
        this.gameState = 'PLAYING';
        const floorInfo = getCampaignFloorInfo(this.currentWave);
        EventBus.emit('RESEARCH_FLOOR_ENTERED', { floor: this.currentWave, sector: floorInfo.sector.name });
        this.updateTerminalProximity();
    }

    _startWaveAction() {
        this.isWaveActive = true;
        this.hasStartedAnyWave = true;
        this.waveStartTime = performance.now() / 1000;
        this.totalPausedTime = 0;

        EventBus.emit('WAVE_STARTED', { wave: this.currentWave });

        // Dobozok lerakása a hullám elején
        if (this.itemManager) {
            if (this.itemManager.lootItems) {
                this.itemManager.clearLootItems();
            }

            let playerPos = this.player && this.player.camera ? this.player.camera.position : { x: 0, y: 0, z: 0 };
            for (let i = 0; i < 4; i++) {
                let mPos = this.enemyManager ? this.enemyManager.getSafeSpawnPosition(0.5, playerPos, 5) : { x: (Math.random() - 0.5) * 40, z: (Math.random() - 0.5) * 40 };
                this.itemManager.spawnMedkit(mPos.x, mPos.z);
            }
            for (let i = 0; i < 4; i++) {
                let aPos = this.enemyManager ? this.enemyManager.getSafeSpawnPosition(0.4, playerPos, 5) : { x: (Math.random() - 0.5) * 40, z: (Math.random() - 0.5) * 40 };
                this.itemManager.spawnAmmoBox(aPos.x, aPos.z);
            }
        }

        // A nagy hullámok ne hozzák létre egyszerre az összes modellt.
        if (this.enemyManager) {
            this.pendingEnemySpawns.length = 0;
            this.pendingAggressiveSpawns = 0;
            const floorInfo = getCampaignFloorInfo(this.currentWave);
            const bossCount = floorInfo.bossCount || (this.currentWave % 5 === 0 && this.currentWave >= 5 ? 1 : 0);
            for (let i = 0; i < this.enemiesToSpawn; i++) {
                let isBoss = i < bossCount;
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

    spawnQueuedEnemies(delta) {
        if (!this.enemyManager || this.pendingEnemySpawns.length === 0) return;

        this.enemySpawnTimer = Math.max(0, this.enemySpawnTimer - delta);
        if (this.enemySpawnTimer > 0 || this.enemyManager.enemies.length >= this.maxConcurrentEnemies) return;

        const nextSpawn = this.pendingEnemySpawns.shift();
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
            if (activeAggressive === 0 && this.pendingAggressiveSpawns === 0) {
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
        const nextFloorInfo = nextFloor <= 100 ? getCampaignFloorInfo(nextFloor) : null;
        const isResearchStop = !!(nextFloorInfo && nextFloorInfo.isResearchFloor);
        this.activeResearchFloor = null;

        if (this.currentWave >= 100) {
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

    setTerminalPromptVisible(visible) {
        if (this.terminalPromptVisible === visible) return;
        this.terminalPromptVisible = visible;
        EventBus.emit('SHOW_INTERACT_PROMPT', {
            visible,
            type: 'terminal',
            researchFloor: null
        });
    }

    updateTerminalProximity() {
        if (!this.terminalReady || !this.player || !this.player.camera) {
            this.setTerminalPromptVisible(false);
            return;
        }

        const { x, z } = this.player.camera.position;
        const doorwayZ = 4.45 * (3.2 / 9.8);
        const isNearTerminal = Math.hypot(x, z - doorwayZ) <= 0.9;
        this.setTerminalPromptVisible(isNearTerminal && this.isFacingTerminalDoor(doorwayZ));
    }

    isFacingTerminalDoor(doorwayZ) {
        const camera = this.player.camera;
        const toDoor = new THREE.Vector3(-camera.position.x, 0, doorwayZ - camera.position.z);
        if (toDoor.lengthSq() === 0) return false;

        const forward = camera.getWorldDirection(new THREE.Vector3());
        forward.y = 0;
        forward.normalize();

        return forward.dot(toDoor.normalize()) >= Math.SQRT1_2;
    }

    tryActivateTerminal() {
        if (this.researchFloorActive && this.gameState === 'PLAYING' && this.tryResearchHubInteraction()) return;
        if (!this.terminalReady || this.gameState !== 'PLAYING' || !this.player || !this.player.camera) return;

        const { x, z } = this.player.camera.position;
        const doorwayZ = 4.45 * (3.2 / 9.8);
        if (Math.hypot(x, z - doorwayZ) > 0.9 || !this.isFacingTerminalDoor(doorwayZ)) return;

        EventBus.emit('CONSUME_INTERACTION');
        this.setTerminalPromptVisible(false);
        this.beginTerminalEntry();
    }

    beginTerminalEntry() {
        if (!this.levelManager || this.terminalSequence !== 'idle') return;
        EventBus.emit('CLEAR_CORPSES');
        EventBus.emit('TERMINAL_OPEN');
        if (this.weaponSystem) this.weaponSystem.holsterForTerminal();
        this.gameState = 'TERMINAL_TRANSITION';
        this.terminalSequence = 'enter-opening';
        this.terminalSequenceTime = 0;
        this.player.playerVelX = 0;
        this.player.playerVelZ = 0;
        this.levelManager.setPodDoorOpen(true);
    }

    updateResearchHubProximity() {
        if (!this.researchFloorActive || this.gameState !== 'PLAYING' || !this.player || !this.player.camera) {
            this.setResearchHubPromptVisible(false);
            return;
        }
        const station = getResearchHubStationAt(this.player.camera.position);
        const stationId = station ? station.id : null;
        if (stationId === this.activeResearchStation) return;
        this.activeResearchStation = stationId;
        this.setResearchHubPromptVisible(!!station, station);
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
        const station = getResearchHubStationAt(this.player.camera.position);
        if (!station) return false;
        EventBus.emit('CONSUME_INTERACTION');
        this.setResearchHubPromptVisible(false);
        this.activeResearchStation = null;

        this.activeResearchStation = station.id;
        this.isResearchHubActive = true;
        this.gameState = 'SHOPPING';
        this.terminalSequence = 'hub-menu';
        EventBus.emit('OPEN_SHOP', {
            terminal: true,
            hub: true,
            researchFloor: this.activeResearchFloor,
            sector: getCampaignFloorInfo(this.activeResearchFloor).sector.name,
            researchStation: station.id,
            researchTab: station.id === 'augmentation' ? 'skills' : 'weapons',
            commsLog: station.id === 'comms'
                ? Object.keys(researchCommsLog).map(Number).filter(floor => floor <= this.activeResearchFloor)
                    .map(floor => ({ floor, ...researchCommsLog[floor] }))
                : null
        });
        return true;
    }

    beginTerminalExit() {
        if (!this.levelManager || this.terminalSequence !== 'menu') return;
        EventBus.emit('TERMINAL_CLOSE');
        this.gameState = 'TERMINAL_TRANSITION';
        this.terminalSequence = 'exit-opening';
        this.terminalSequenceTime = 0;
        this.player.playerVelX = 0;
        this.player.playerVelZ = 0;
        EventBus.emit('TERMINAL_RESET');
        this.levelManager.setPodDoorOpen(true);
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
        const exitDirection = new THREE.Vector3(-camera.position.x, 0, 2.2 - camera.position.z);
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
        if (this.weaponSystem) this.weaponSystem.updateTerminalTransition(delta);
        this.terminalSequenceTime += delta;
        if (this.terminalSequence === 'healing') {
            this.updateHealingSequence();
            return;
        }
        if (this.terminalSequence === 'sterilization') {
            this.updateSterilizationSequence();
            return;
        }

        if (this.terminalSequence === 'enter-opening' && this.levelManager.podDoorProgress >= 0.98) {
            this.startTerminalMove({ x: 0, y: 1.6, z: 0.15 }, 'enter-moving');
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
                this.levelManager.setPodDoorOpen(false);
            }
        } else if (this.terminalSequence === 'enter-closing' && this.levelManager.podDoorProgress <= 0.02) {
            this.gameState = 'SHOPPING';
            this.terminalSequence = 'menu';
            EventBus.emit('TERMINAL_SESSION_ACTIVE');
            EventBus.emit('OPEN_SHOP', {
                shopLockedForNextWave: this.shopLockedForNextWave,
                terminal: true
            });
        } else if (this.terminalSequence === 'exit-opening' && this.levelManager.podDoorProgress >= 0.98) {
            this.startTerminalExitTurn();
        } else if (this.terminalSequence === 'exit-turning') {
            const progress = Math.min(1, this.terminalSequenceTime / 0.55);
            const eased = progress * progress * (3 - 2 * progress);
            this.player.camera.quaternion.slerpQuaternions(this.terminalTurnFrom, this.terminalTurnTo, eased);
            if (progress >= 1) {
                this.player.camera.quaternion.copy(this.terminalTurnTo);
                const inputManager = this.player.inputManagerRef || (this.weaponSystem && this.weaponSystem.inputManagerRef);
                if (inputManager) inputManager.yaw = this.terminalTurnYaw;
                this.startTerminalMove({ x: 0, y: 1.6, z: 2.2 }, 'exit-moving');
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
                this.levelManager.setPodDoorOpen(false);
                if (this.weaponSystem) this.weaponSystem.drawFromTerminal();
            }
        } else if (this.terminalSequence === 'exit-closing' && this.levelManager.podDoorProgress <= 0.02) {
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
        this.updateResearchHubProximity();

        // Ipari felvonó és zsilipkapu szekvencia a szintek között
        if (this.isElevating) {
            this.elevatorTimer += delta;

            // 1. Fázis: Lift süllyed a mélybe (6.5 mp dübörgés és fal-textúra görgetés)
            if (this.elevatorPhase === 'moving') {
                if (this.elevatorTimer >= 6.5) {
                    this.elevatorPhase = 'stopping';
                    EventBus.emit('STOP_AUDIO', { id: 'elevatorMove' });
                    EventBus.emit('PLAY_SOUND', { id: 'elevatorStop' });
                    EventBus.emit('STOP_ELEVATOR_MOVE');
                    EventBus.emit('CAMERA_DIP', { duration: 0.7 });
                    EventBus.emit('ELEVATOR_ARRIVED', { wave: this.currentWave });
                }
            } 
            // 2. Fázis: Lift megáll (1.5 mp fékezés), megérkeztünk -> kinyílnak a zsilipkapuk
            else if (this.elevatorPhase === 'stopping') {
                if (this.elevatorTimer >= 8.0) {
                    this.elevatorPhase = 'opening';
                    EventBus.emit('PLAY_SOUND', { id: 'gateOpen' });
                    EventBus.emit('OPEN_AIRLOCK_GATES', { duration: 7.5 });
                    EventBus.emit('GATES_OPENING', { wave: this.currentWave });
                }
            } 
            // 3. Fázis: Zsilipkapuk kitárultak -> a szint élesedik, ellenfelek beözönlenek
            else if (this.elevatorPhase === 'opening') {
                if (this.elevatorTimer >= 15.5) {
                    this.isElevating = false;
                    this.elevatorPhase = 'done';
                    if (this.pendingResearchArrival) this._startResearchFloor();
                    else this._startWaveAction();
                }
            }
        }

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
        let price = data.price || 50;
        let needsAmmo = false;
        for (let key in weapons) {
            if (weapons[key].owned && weapons[key].reserve < weapons[key].maxReserve) {
                needsAmmo = true;
                break;
            }
        }

        if (this.score < price || !needsAmmo) {
            EventBus.emit('PURCHASE_FAILED');
            return;
        }

        this.score -= price;
        for (let key in weapons) {
            if (weapons[key].owned) {
                let ammoToAdd = Math.floor(weapons[key].maxReserve * 0.25);
                weapons[key].reserve = Math.min(weapons[key].maxReserve, weapons[key].reserve + ammoToAdd);
            }
        }

        let currentW = this.weaponSystem ? weapons[this.weaponSystem.currentWeaponId] : null;
        if (currentW) {
            EventBus.emit('AMMO_CHANGED', { current: currentW.ammo, max: currentW.reserve });
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
