import * as THREE from 'three';
import Engine from './Engine.js';
import InputManager from './InputManager.js';
import AssetManager from './AssetManager.js';
import AudioManager from './AudioManager.js';
import LevelManager from './LevelManager.js';
import ItemManager from './ItemManager.js';
import UIManager from './UIManager.js';
import VFXManager from './VFXManager.js';
import NetworkManager from './NetworkManager.js';
import EventBus from './EventBus.js';

import { Navigation } from './Navigation.js';
import { EnemyManager } from './EnemyManager.js';
import { Player } from './Player.js';
import { WeaponSystem } from './WeaponSystem.js';
import { GameManager } from './GameManager.js';

// Példányosítás
const navigation = new Navigation();
const enemyManager = new EnemyManager();
const player = new Player();
const weaponSystem = new WeaponSystem();
const gameManager = new GameManager();

// --- 1. Alapvető rendszerek inicializálása ---
Engine.init();
if (typeof InputManager.init === 'function') {
    InputManager.init();
}
UIManager.init();
if (typeof AudioManager.init === 'function') AudioManager.init(Engine.camera, Engine.listener);

// --- 2. Feliratkozás a betöltés végére (KRITIKUS 2) ---
let isInitialized = false;
EventBus.on('LOADING_COMPLETE', () => {
    if (isInitialized) return; // Végtelen hurok megakadályozása!
    isInitialized = true;
    
    console.log('[KRONOS] LOADING_COMPLETE esemény fogadva. Játék modulok inicializálása...');
    
    // Szint és Navigáció
    LevelManager.init(Engine.scene, AssetManager);
    navigation.init(LevelManager);
    
    // Entitások és Rendszerek
    enemyManager.init(Engine.scene, navigation, AssetManager, ItemManager);
    ItemManager.init(Engine.scene, AssetManager, InputManager);
    player.init(Engine);
    weaponSystem.init(Engine, enemyManager, ItemManager, AssetManager);
    
    // VFX és Hálózat
    if (typeof VFXManager.init === 'function') VFXManager.init(Engine.scene, Engine.camera, AssetManager);
    if (typeof NetworkManager.init === 'function') NetworkManager.init();
    
    // GameManager
    gameManager.init(player, enemyManager, ItemManager, weaponSystem);
    
    // --- GPU & SHADER ELŐMELEGÍTÉS (PRE-WARM) ---
    // Megszünteti az első hullám és az első rezonátor lerakásakor tapasztalható megakadást
    preWarmShaders(Engine, AssetManager);
    
    console.log('[KRONOS] Rendszerek sikeresen integrálva.');
});

function preWarmShaders(engine, assetManager) {
    if (!engine || !engine.renderer || !engine.scene || !engine.camera) return;
    try {
        const warmupGroup = new THREE.Group();
        warmupGroup.position.set(0, -500, 0);

        const modelKeys = ['normal', 'runner', 'tank', 'hider', 'crawler', 'boss', 'resonator', 'ammoModel', 'healthModel', 'pistol', 'rifle', 'shotgun', 'super', 'melee', 'heal'];
        modelKeys.forEach(key => {
            const mData = assetManager.cloneModel(key);
            if (mData && mData.mesh) {
                warmupGroup.add(mData.mesh);
            }
        });

        engine.scene.add(warmupGroup);
        engine.renderer.compile(engine.scene, engine.camera);
        engine.renderer.render(engine.scene, engine.camera);
        engine.scene.remove(warmupGroup);

        console.log('[KRONOS] GPU shaderek és modellek sikeresen előmelegítve (0 fps drop az első spawnnál/rezonátornál).');
    } catch (err) {
        console.warn('[KRONOS] Shader pre-warm figyelmeztetés:', err);
    }
}

// --- 3. Erőforrások betöltése ---
// Ennek legutoljára kell meghívódnia, miután minden modul feliratkozott a LOADING_COMPLETE eseményre
AssetManager.loadAll();



// --- 4. Fő Játékhurok (Game Loop) ---
let lastTime = performance.now();
let menuYaw = 0;

function animate() {
    requestAnimationFrame(animate);
    
    let time = performance.now();
    let delta = Math.min((time - lastTime) / 1000, 0.1); // Max 0.1 delta a fizika szétesésének elkerülésére
    lastTime = time;

    // Ha a játék fut
    if (gameManager.gameState === 'PLAYING') {
        if (InputManager && typeof InputManager.yaw === 'number') {
            menuYaw = InputManager.yaw;
        }
        // Szigorú sorrendű frissítések
        if (typeof InputManager.update === 'function') InputManager.update();
        if (typeof LevelManager.update === 'function') LevelManager.update(delta);
        if (typeof player.update === 'function') player.update(delta, InputManager, LevelManager, weaponSystem);
        if (typeof weaponSystem.update === 'function') weaponSystem.update(delta, InputManager, player, LevelManager);
        if (typeof enemyManager.update === 'function') enemyManager.update(delta, player.camera);
        if (typeof ItemManager.update === 'function') ItemManager.update(delta, player.camera);
        if (typeof VFXManager.update === 'function') VFXManager.update(delta, player ? player.camera : Engine.camera);
        if (typeof gameManager.update === 'function') gameManager.update(delta);
    } else if (gameManager.gameState === 'MENU' || gameManager.gameState === 'GAMEOVER') {
        // --- VISSZAÁLLÍTVA: Filmes lebegés és forgás a halál / kilépés helyszínén ---
        if (Engine.camera && Engine.clock) {
            menuYaw -= delta * 0.15; 
            Engine.camera.position.y = 1.6 + Math.sin(Engine.clock.getElapsedTime() * 0.8) * 0.15; 
            Engine.camera.quaternion.setFromEuler(new THREE.Euler(-0.05, menuYaw, 0, 'YXZ'));
            
            if (typeof VFXManager !== 'undefined' && VFXManager.updateMenu) {
                VFXManager.updateMenu(delta); // Ha majd a VFX-ben por/köd lesz
            }
        }
    }

    // Renderelés
    if (Engine.renderer && Engine.scene && Engine.camera) {
        if (typeof Engine.render === 'function') {
            Engine.render();
        } else {
            Engine.renderer.render(Engine.scene, Engine.camera);
        }
    }
}

// Hurok indítása
animate();
