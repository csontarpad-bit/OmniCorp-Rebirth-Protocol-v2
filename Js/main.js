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
// A WebGL engine és az erőforrás-betöltés csak a figyelmeztetés elfogadása után indul,
// hogy a játék ne fagyjon be a kezdéskor a renderelés és a nagy GLTF letöltések miatt.
if (typeof InputManager.init === 'function') {
    InputManager.init();
}
UIManager.init();

let bootstrapStarted = false;
function bootstrapGame() {
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    Engine.init();
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
        gameManager.init(player, enemyManager, ItemManager, weaponSystem, LevelManager);

        // --- GPU & SHADER ELŐMELEGÍTÉS (PRE-WARM) ---
        // A korábbi, minden modell klónozásával végzett előmelegítés a kezdeti betöltést blokkolta.
        // A minimális, nem blokkoló előmelegítés elkerüli a startup befagyást.
        setTimeout(() => preWarmShaders(Engine), 50);
        AssetManager.loadOptional();

        console.log('[KRONOS] Rendszerek sikeresen integrálva.');
        startAnimationLoop();
    });

    // --- 3. Erőforrások betöltése ---
    // Ennek legutoljára kell meghívódnia, miután minden modul feliratkozott a LOADING_COMPLETE eseményre
    AssetManager.loadAll();
}

EventBus.on('START_BOOTSTRAP', bootstrapGame);
if (!document.getElementById('epilepsy-screen')) {
    bootstrapGame();
}

function preWarmShaders(engine) {
    if (!engine || !engine.renderer || !engine.scene || !engine.camera) return;
    try {
        const warmupScene = new THREE.Scene();
        warmupScene.background = null;
        warmupScene.fog = null;

        const warmupMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.25, 0.25),
            new THREE.MeshBasicMaterial({ color: 0x00ffff })
        );
        warmupMesh.position.set(0, 0, -3);
        warmupScene.add(warmupMesh);

        engine.renderer.compile(warmupScene, engine.camera);
        engine.renderer.render(warmupScene, engine.camera);

        console.log('[KRONOS] GPU előmelegítés elkészült egy minimális, nem blokkoló tesztobjektumon.');
    } catch (err) {
        console.warn('[KRONOS] Shader pre-warm figyelmeztetés:', err);
    }
}

// --- 3. Erőforrások betöltése ---
// Ennek legutoljára kell meghívódnia, miután minden modul feliratkozott a LOADING_COMPLETE eseményre
AssetManager.loadAll();



// --- 4. Fő Játékhurok (Game Loop) ---
let lastTime = performance.now();
let lastFrameTime = lastTime;
let frameAccumulator = 0;
const frameIntervalToleranceMs = 0.01;
let menuYaw = 0;
const updateBudget = {
    lightVisibility: 0
};
const perfPanel = document.createElement('div');
perfPanel.id = 'game-performance-monitor';
perfPanel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:9000;display:none;pointer-events:none;padding:10px 12px;background:rgba(0,12,12,.88);border:1px solid #00ccaa;color:#baffef;font:12px/1.5 monospace;white-space:pre;box-shadow:0 0 12px rgba(0,204,170,.25)';
document.body.appendChild(perfPanel);

const perfSamples = new Float32Array(300);
const updatePerfSamples = new Float32Array(300);
const renderPerfSamples = new Float32Array(300);
const perfSortBuffer = new Float32Array(300);
let perfSampleIndex = 0;
let perfSampleCount = 0;
let perfFrameCount = 0;
let perfLastReportTime = lastTime;
let lowPerfDuration = 0;
let highPerfDuration = 0;
let perfVisible = new URLSearchParams(window.location.search).get('perf') === '1';
perfPanel.style.display = perfVisible ? 'block' : 'none';

window.__gamePerf = {
    fps: 0,
    avgFps: 0,
    minFps: 0,
    frameMs: 0,
    avgFrameMs: 0,
    p95FrameMs: 0,
    updateMs: 0,
    updateP95Ms: 0,
    renderMs: 0,
    renderP95Ms: 0,
    drawCalls: 0,
    triangles: 0,
    dynamicLights: 0,
    renderPixelRatio: 1,
    enemies: 0,
    gameState: gameManager.gameState,
    sampleWindowMs: 0
};

function summarizePerfSamples(samples, count) {
    for (let i = 0; i < count; i++) perfSortBuffer[i] = samples[i];
    const sorted = perfSortBuffer.subarray(0, count);
    sorted.sort();
    let total = 0;
    for (let i = 0; i < sorted.length; i++) total += sorted[i];
    const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
    return {
        average: sorted.length ? total / sorted.length : 0,
        p95: sorted[p95Index] || 0,
        total
    };
}

window.__toggleGamePerf = () => {
    perfVisible = !perfVisible;
    perfPanel.style.display = perfVisible ? 'block' : 'none';
};

window.addEventListener('keydown', (event) => {
    if (event.code === 'F3') {
        event.preventDefault();
        window.__toggleGamePerf();
    }
});

function animate() {
    requestAnimationFrame(animate);
    
    let time = performance.now();
    const elapsedSinceFrame = Math.max(0, time - lastTime);
    lastTime = time;
    const targetFrameMs = 1000 / (gameManager.gameState === 'PLAYING' ? 60 : 30);
    if (elapsedSinceFrame > 100) frameAccumulator = targetFrameMs;
    else frameAccumulator += elapsedSinceFrame;
    if (frameAccumulator + frameIntervalToleranceMs < targetFrameMs) return;

    let frameTimeMs = Math.max(0, time - lastFrameTime);
    lastFrameTime = time;
    frameAccumulator = Math.max(0, frameAccumulator - targetFrameMs);
    let delta = Math.min(frameTimeMs / 1000, 0.1); // Max 0.1 delta a fizika szétesésének elkerülésére
    const sampleIndex = perfSampleIndex;
    perfSamples[sampleIndex] = frameTimeMs;
    perfSampleIndex = (sampleIndex + 1) % perfSamples.length;
    perfSampleCount = Math.min(perfSampleCount + 1, perfSamples.length);
    perfFrameCount++;
    const updateStartTime = performance.now();
    updateBudget.lightVisibility += delta;
    if (updateBudget.lightVisibility >= 0.1 && typeof LevelManager.updateLightVisibility === 'function') {
        LevelManager.updateLightVisibility(Engine.camera);
        updateBudget.lightVisibility %= 0.1;
    }

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
    } else if (gameManager.gameState === 'TERMINAL_TRANSITION') {
        if (typeof LevelManager.update === 'function') LevelManager.update(delta);
        if (typeof VFXManager.update === 'function') VFXManager.update(delta, player ? player.camera : Engine.camera);
        if (typeof gameManager.update === 'function') gameManager.update(delta);
    } else if (gameManager.gameState === 'SHOPPING') {
        if (typeof LevelManager.update === 'function') LevelManager.update(delta);
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
    const updateTimeMs = performance.now() - updateStartTime;
    const renderStartTime = performance.now();
    if (Engine.renderer && Engine.scene && Engine.camera) {
        if (typeof Engine.render === 'function') {
            Engine.render();
        } else {
            Engine.renderer.render(Engine.scene, Engine.camera);
        }
    }
    const renderTimeMs = performance.now() - renderStartTime;
    updatePerfSamples[sampleIndex] = updateTimeMs;
    renderPerfSamples[sampleIndex] = renderTimeMs;

    const reportElapsed = time - perfLastReportTime;
    if (reportElapsed >= 500) {
        const frameStats = summarizePerfSamples(perfSamples, perfSampleCount);
        const updateStats = summarizePerfSamples(updatePerfSamples, perfSampleCount);
        const renderStats = summarizePerfSamples(renderPerfSamples, perfSampleCount);
        let maxFrameMs = 0;
        for (let i = 0; i < perfSampleCount; i++) {
            maxFrameMs = Math.max(maxFrameMs, perfSamples[i]);
        }
        const perf = window.__gamePerf;
        perf.fps = perfFrameCount * 1000 / reportElapsed;
        perf.avgFps = frameStats.average > 0 ? 1000 / frameStats.average : 0;
        perf.minFps = maxFrameMs > 0 ? 1000 / maxFrameMs : 0;
        perf.frameMs = frameTimeMs;
        perf.avgFrameMs = frameStats.average;
        perf.p95FrameMs = frameStats.p95;
        perf.updateMs = updateStats.average;
        perf.updateP95Ms = updateStats.p95;
        perf.renderMs = renderStats.average;
        perf.renderP95Ms = renderStats.p95;
        perf.drawCalls = Engine.renderer ? Engine.renderer.info.render.calls : 0;
        perf.triangles = Engine.renderer ? Engine.renderer.info.render.triangles : 0;
        perf.dynamicLights = LevelManager.dynamicLightCandidates.reduce((count, candidate) => count + Number(candidate.light.visible), 0);
        perf.renderPixelRatio = Engine.renderer ? Engine.renderer.getPixelRatio() : 1;
        perf.enemies = enemyManager.enemies.length;
        perf.gameState = gameManager.gameState;
        perf.sampleWindowMs = frameStats.total;

        // WebGL submission time does not include GPU execution, so use frame pacing
        // rather than renderer.render() duration to detect sustained rendering pressure.
        if (perf.gameState !== 'PLAYING') {
            lowPerfDuration = 0;
            highPerfDuration = 0;
            if (Engine.renderScale < 1) Engine.setRenderScale(1);
        } else if (perf.fps < 45) {
            lowPerfDuration += reportElapsed;
            highPerfDuration = 0;
            if (lowPerfDuration >= 2000 && Engine.renderScale > Engine.minimumPixelRatio / Engine.basePixelRatio) {
                Engine.setRenderScale(Engine.renderScale - 0.1);
                lowPerfDuration = 0;
            }
        } else if (perf.fps > 55) {
            highPerfDuration += reportElapsed;
            lowPerfDuration = 0;
            if (highPerfDuration >= 5000 && Engine.renderScale < 1) {
                Engine.setRenderScale(Engine.renderScale + 0.1);
                highPerfDuration = 0;
            }
        } else {
            lowPerfDuration = 0;
            highPerfDuration = 0;
        }

        if (perfVisible) {
            perfPanel.textContent = `FPS ${perf.fps.toFixed(1)} | AVG ${perf.avgFps.toFixed(1)} | LOW ${perf.minFps.toFixed(1)}\n` +
            `FRAME ${perf.frameMs.toFixed(1)} ms | AVG ${perf.avgFrameMs.toFixed(1)} | P95 ${perf.p95FrameMs.toFixed(1)}\n` +
            `UPDATE ${perf.updateMs.toFixed(2)} ms (P95 ${perf.updateP95Ms.toFixed(2)}) | RENDER ${perf.renderMs.toFixed(2)} (P95 ${perf.renderP95Ms.toFixed(2)})\n` +
                `DRAWS ${perf.drawCalls} | TRIS ${perf.triangles.toLocaleString()}\n` +
            `LEVEL LIGHTS ${perf.dynamicLights} | PIXEL RATIO ${perf.renderPixelRatio.toFixed(2)}\n` +
                `ENEMIES ${perf.enemies} | ${perf.gameState}`;
        }

        perfFrameCount = 0;
        perfLastReportTime = time;
    }
}

let animationStarted = false;
function startAnimationLoop() {
    if (animationStarted) return;
    animationStarted = true;
    animate();
}
