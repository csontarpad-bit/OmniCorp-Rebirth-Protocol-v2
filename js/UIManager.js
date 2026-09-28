import * as THREE from 'three';
import EventBus from './EventBus.js';
import { OmniCorpDatabase, OmniCorpDirectives, playerStats, savePlayerStats, weapons, skills } from './Database.js';

class UIManager {
    constructor() {
        this.currentArchiveCategory = 'lore';
        this.archiveOpenedFrom = 'mainMenu';
        this.typeInterval = null;
        this.omniCurrentDirTier = 'info';
        this.omniDirOpenedFrom = 'mainMenu';
        this.weaponsDataCache = null;
        this.skillsDataCache = null;
        this.isModelsLoaded = false;

        // Globális függvények az inline onclick eseményekhez
        this.loreAudio = null;
        window.acceptDirective = (id) => EventBus.emit('ACCEPT_DIRECTIVE', id);
        window.abandonDirective = () => EventBus.emit('EXECUTE_ABANDON_DIRECTIVE');
        window.switchShopWeapon = (key) => {
            EventBus.emit('WEAPON_SWITCH', key);
            EventBus.emit('UI_UPDATE_NEEDED');
        };
        window.switchTerminalWeapon = window.switchShopWeapon;
    }

    init() {
        this._bindDOM();
        this._setupEpilepsyScreen();
        this._setupIntroVideoFlow();
        this._setupArchiveMenu();
        this._setupShopMenu();
        this._setupDirectivesMenu();
        this._setupOptionsMenu();
        this._setupMainMenu();
        this._setupGameUI();
        this._setupDevMenu();
        this._bindEventBus();
    }

    _bindDOM() {
        this.healthFill = document.getElementById('health-fill');
        this.armorFill = document.getElementById('armor-fill');
        this.ammoDisplay = document.getElementById('ammo-display');
        this.weaponInfoDisplay = document.getElementById('weapon-info-display');
        this.hitmarker = document.getElementById('hitmarker');
        this.hsMsg = document.getElementById('headshot-msg');
        this.shopPoints = document.getElementById('shop-points');
        this.archiveMenu = document.getElementById('archive-menu');
        this.mainMenu = document.getElementById('main-menu');
        this.archiveList = document.getElementById('archive-list');
        this.archiveContent = document.getElementById('archive-content');
        this.shopMenu = document.getElementById('shop-menu');
        this.omniDirMenu = document.getElementById('directives-menu');
        this.omniDirContent = document.getElementById('dir-content');
    }

    _bindEventBus() {
        EventBus.on('HP_CHANGED', (data) => this.updateHP(data));
        EventBus.on('ARMOR_CHANGED', (data) => this.updateArmor(data));
        EventBus.on('AMMO_CHANGED', (data) => this.updateAmmo(data));
        EventBus.on('SHOW_LOOT_POPUP', (data) => this.showLootPopup(data));
        EventBus.on('SHOW_INTERACT_PROMPT', (data) => this.showInteractPrompt(data));
        EventBus.on('OPEN_SHOP', (data) => this.openShop(data || {}));
        EventBus.on('SHOP_DATA_READY', (data) => {
            this.lastShopData = data;
            this.updateShopButtons(data);
        });
        EventBus.on('WAVE_STARTING', (data) => {
            const waveDisplay = document.getElementById('wave-display');
            if (waveDisplay) {
                waveDisplay.classList.remove('normal-wave');
                waveDisplay.innerText = `⬇️ IPARI FELVONÓ: SÜLLYEDÉS A(Z) ${data.wave}. SZINTRE... ⬇️`;
                waveDisplay.classList.remove('hidden');
            }
        });
        EventBus.on('ELEVATOR_ARRIVED', (data) => {
            const waveDisplay = document.getElementById('wave-display');
            if (waveDisplay) {
                waveDisplay.innerText = `⚠️ MEGÉRKEZÉS: ${data.wave}. SZINT ⚠️`;
            }
        });
        EventBus.on('GATES_OPENING', (data) => {
            const waveDisplay = document.getElementById('wave-display');
            if (waveDisplay) {
                waveDisplay.innerText = `⚠️ ZSILIPKAPUK NYITÁSA... ⚠️`;
            }
        });
        EventBus.on('WAVE_STARTED', (data) => {
            const waveDisplay = document.getElementById('wave-display');
            if (waveDisplay) {
                waveDisplay.innerText = `${data.wave}. SZINT`;
                waveDisplay.classList.add('normal-wave');
                setTimeout(() => {
                    waveDisplay.classList.add('hidden');
                    waveDisplay.classList.remove('normal-wave');
                }, 2500);
            }
        });
        EventBus.on('GAME_OVER', (data) => {
            const fsEl = document.getElementById('final-score');
            if (fsEl) fsEl.innerText = `ADAT: ${data.score} CR`;
            const fwEl = document.getElementById('final-wave');
            if (fwEl) fwEl.innerText = `TÚLÉLT ITERÁCIÓ: ${data.wave}`;
            const goEl = document.getElementById('game-over');
            if (goEl) goEl.classList.remove('hidden');
            const guiEl = document.getElementById('game-ui-wrapper');
            if (guiEl) guiEl.classList.add('hidden');
            try { document.exitPointerLock(); } catch (e) { }
            this.clearScreenBlood();
        });
        EventBus.on('RETURN_TO_MAIN_MENU', () => {
            this.clearScreenBlood();
        });
        EventBus.on('START_GAME', () => {
            const goEl = document.getElementById('game-over');
            if (goEl) goEl.classList.add('hidden');
            const guiEl = document.getElementById('game-ui-wrapper');
            if (guiEl) guiEl.classList.remove('hidden');
        });
        EventBus.on('PAUSE_GAME', () => {
            const pauseMenu = document.getElementById('pause-menu');
            if (pauseMenu) pauseMenu.classList.remove('hidden');
            try { document.exitPointerLock(); } catch (e) { }
        });
        EventBus.on('RESUME_GAME', () => {
            const pauseMenu = document.getElementById('pause-menu');
            if (pauseMenu) pauseMenu.classList.add('hidden');
            this.requestSafePointerLock();
        });
        EventBus.on('PURCHASE_SUCCESS', () => this.updateShopButtons());
        EventBus.on('PURCHASE_FAILED', () => this.flashMoneyError());
        EventBus.on('UPDATE_HUD', (data) => this.updateHUD(data));
        EventBus.on('SHOW_HITMARKER', (data) => this.showHitmarker(data.isHeadshot));
        EventBus.on('SHOW_SHIELD_ICON', (data) => this.showShieldIcon(data ? data.shieldType : null));
        EventBus.on('DAMAGE_TAKEN', () => this.showDamageFlash());
        EventBus.on('BLOOD_SPLATTER', (data) => this.splashVisorBlood(true));
        EventBus.on('SPAWN_VFX_BLOOD', (data) => this.splashVisorBlood(false));
        EventBus.on('INFECTION_CHANGED', (data) => this.updateInfection(data));
        EventBus.on('LOADING_PROGRESS', (percent) => {
            const liquid = document.getElementById('radioactive-liquid');
            const percentText = document.getElementById('loading-percentage');
            if (liquid && (!liquid.style.width || parseInt(liquid.style.width) < percent)) {
                liquid.style.width = `${percent}%`;
            }
            if (percentText && (!percentText.innerText || parseInt(percentText.innerText) < percent)) {
                percentText.innerText = `${percent}%`;
            }
        });
        EventBus.on('LOADING_COMPLETE', () => { this.isModelsLoaded = true; });
        EventBus.on('REQUEST_ARCHIVE_RENDER', (data) => this._renderArchiveList(data.category));
        EventBus.on('REQUEST_DIRECTIVES_RENDER', (data) => this._renderDirectivesData(data.tier));
        EventBus.on('ACCEPT_DIRECTIVE', () => EventBus.emit('REQUEST_DIRECTIVES_RENDER', { tier: this.omniCurrentDirTier }));
        EventBus.on('EXECUTE_ABANDON_DIRECTIVE', () => EventBus.emit('REQUEST_DIRECTIVES_RENDER', { tier: this.omniCurrentDirTier }));
        EventBus.on('TOGGLE_DEV_MENU', () => {
            const devMenu = document.getElementById('dev-menu');
            if (!devMenu) return;
            const isOpening = devMenu.classList.contains('hidden');
            if (isOpening) {
                devMenu.classList.remove('hidden');
                try { document.exitPointerLock(); } catch (e) { }
            } else {
                devMenu.classList.add('hidden');
                const isPlaying = !document.getElementById('game-ui-wrapper')?.classList.contains('hidden') &&
                    document.getElementById('pause-menu')?.classList.contains('hidden') &&
                    document.getElementById('main-menu')?.classList.contains('hidden');
                if (isPlaying) {
                    this.requestSafePointerLock();
                }
            }
        });
        EventBus.on('TRIGGER_GLITCH', (duration) => {
            const glitchOverlay = document.getElementById('glitch-overlay');
            if (glitchOverlay) {
                glitchOverlay.classList.remove('hidden');
                glitchOverlay.classList.add('glitch-active');
                setTimeout(() => {
                    glitchOverlay.classList.remove('glitch-active');
                    glitchOverlay.classList.add('hidden');
                }, duration || 300);
            }
        });
        EventBus.on('SET_FREEZE_VISUALS', (isFrozen) => {
            const ice = document.getElementById('ice-overlay');
            if (ice) ice.style.opacity = isFrozen ? '1' : '0';
        });
        EventBus.on('UPDATE_FREEZE_UI', (data) => {
            // freeze-btn eltávolítva
        });
        EventBus.on('SHOW_ACID_OVERLAY', (state) => {
            const acidOverlay = document.getElementById('acid-overlay');
            if (acidOverlay) {
                acidOverlay.classList.remove('acid-green', 'acid-yellow', 'acid-red');
                if (state === 'green') acidOverlay.classList.add('acid-green');
                else if (state === 'yellow') acidOverlay.classList.add('acid-yellow');
                else if (state === 'ready') acidOverlay.classList.add('acid-red');
                acidOverlay.style.opacity = '1';
                acidOverlay.classList.add('acid-burn-active');
                if (this.acidClearTimeout) clearTimeout(this.acidClearTimeout);
                this.acidClearTimeout = setTimeout(() => {
                    acidOverlay.style.opacity = '0';
                    acidOverlay.classList.remove('acid-burn-active');
                }, 300);
            }
        });
        EventBus.on('UI_UPDATE_NEEDED', () => {
            this.updateShopButtons();
        });
    }


    // ==========================================
    // EPILEPSZIA FIGYELMEZTETÉS ÉS BETÖLTÉS
    // ==========================================
    _setupEpilepsyScreen() {
        const acceptBtn = document.getElementById('epilepsy-accept-btn');
        const screen = document.getElementById('epilepsy-screen');
        if (acceptBtn && screen) {
            acceptBtn.addEventListener('click', () => {
                screen.style.transition = 'opacity 1s ease-in-out';
                screen.style.opacity = '0';

                // 1. Audio kontextus feloldása
                EventBus.emit('UNLOCK_AUDIO');

                // 2. Betöltőképernyő zene indítása
                EventBus.emit('PLAY_SOUND', 'loadingMusic');

                // 3. Terminál szöveg indítása
                this.typeTerminalLog();

                setTimeout(() => {
                    screen.style.display = 'none';
                }, 1000);
            });
        }
    }

    typeTerminalLog() {
        const container = document.getElementById('loading-logs-container');
        const bgBad = document.getElementById('bg-bad');
        const liquid = document.getElementById('radioactive-liquid');
        const continueBtn = document.getElementById('loading-continue-btn');
        if (!container) return;

        const terminalLogs = [
            { text: "OMNICORP KRONOS SYSTEM INIT...", color: "#00ff00" },
            { text: "CONNECTING TO MAINFRAME...", color: "#00ff00" },
            { text: "BYPASSING SECURITY PROTOCOLS...", color: "#ffff00" },
            { text: "ACCESS GRANTED.", color: "#00ff00" },
            { text: "WARNING: ANOMALOUS BIOLOGICAL SIGNATURES DETECTED.", color: "#ff0000" },
            { text: "LOADING ASSETS...", color: "#00ffff" }
        ];

        container.innerHTML = '';
        let delay = 0;
        let currentLogIndex = 0;

        terminalLogs.forEach((log) => {
            setTimeout(() => {
                const p = document.createElement('p');
                p.textContent = log.text;
                p.style.color = log.color;
                container.appendChild(p);

                currentLogIndex++;
                let progress = currentLogIndex / terminalLogs.length;

                if (bgBad) bgBad.style.opacity = progress;
                // A szöveggel arányosan max 80%-ig megy a csík. A maradék 20% a tényleges modellbetöltés, 
                // ami ha kész (isModelsLoaded), akkor ugrik 100%-ra.
                let pct = Math.floor(progress * 80);
                if (liquid) liquid.style.width = pct + '%';
                const percentText = document.getElementById('loading-percentage');
                if (percentText) percentText.innerText = pct + '%';

                // Amikor a gépelés a végére ér, elindítjuk a figyelőt
                if (currentLogIndex === terminalLogs.length) {
                    const checkInterval = setInterval(() => {
                        if (this.isModelsLoaded) {
                            clearInterval(checkInterval);

                            // 100%-ra húzzuk a csíkot
                            if (liquid) liquid.style.width = '100%';
                            if (percentText) percentText.innerText = '100%';

                            // Eltüntetjük a terminál logokat és magát a betöltő sávot is!
                            container.style.opacity = '0';
                            const progressArea = document.getElementById('loading-progress-area');
                            if (progressArea) progressArea.style.opacity = '0';

                            // Megjelenítjük a tovább lépés gombot
                            if (continueBtn) {
                                continueBtn.style.display = 'flex';
                                continueBtn.classList.remove('hidden');
                                setTimeout(() => {
                                    continueBtn.style.opacity = '1';
                                }, 100);
                            }
                        }
                    }, 500);
                }
            }, delay);
            delay += 800 + Math.random() * 500;
        });
    }

    _setupIntroVideoFlow() {
        const continueBtn = document.getElementById('loading-continue-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                const loadingScreen = document.getElementById('loading-screen');
                if (loadingScreen) {
                    loadingScreen.style.transition = 'opacity 1s ease';
                    loadingScreen.style.opacity = '0';
                    setTimeout(() => {
                        loadingScreen.style.display = 'none';
                    }, 1000);
                }

                EventBus.emit('STOP_AUDIO', 'loadingMusic');

                const introVideoScreen = document.getElementById('intro-video-screen');
                const introVideo = document.getElementById('intro-video');
                const skipBtn = document.getElementById('skip-intro-btn');

                if (introVideoScreen) {
                    introVideoScreen.style.display = 'flex';
                    introVideoScreen.classList.remove('hidden');
                }

                let videoEnded = false;
                const endVideoFlow = () => {
                    if (videoEnded) return;
                    videoEnded = true;
                    if (introVideoScreen) {
                        introVideoScreen.style.transition = 'opacity 0.5s ease';
                        introVideoScreen.style.opacity = '0';
                        setTimeout(() => {
                            introVideoScreen.style.display = 'none';
                        }, 500);
                    }
                    if (introVideo) {
                        introVideo.pause();
                        introVideo.currentTime = 0;
                    }

                    const mainMenu = document.getElementById('main-menu');
                    if (mainMenu) {
                        mainMenu.style.display = 'flex';
                        mainMenu.classList.remove('hidden');
                        // Make sure opacity is reset if it was hidden via opacity
                        mainMenu.style.opacity = '1';
                    }
                    EventBus.emit('PLAY_SOUND', 'menuMusic');
                    EventBus.emit('CHANGE_GAME_STATE', 'MENU');
                };

                if (introVideo) {
                    introVideo.play().catch(e => console.warn("Videó auto-play hiba:", e));
                    introVideo.onended = endVideoFlow;
                }

                if (skipBtn) {
                    skipBtn.addEventListener('click', endVideoFlow, { once: true });
                }
            });
        }
    }

    // ==========================================
    // FŐMENÜ ÉS NEHÉZSÉG VÁLASZTÁS
    // ==========================================
    requestSafePointerLock() {
        try {
            if (window.innerWidth > 768) {
                const lockPromise = document.body.requestPointerLock();
                if (lockPromise && typeof lockPromise.catch === 'function') {
                    lockPromise.catch(() => { });
                }
            }
        } catch (e) { }
    }

    _setupMainMenu() {
        this.selectedDifficulty = 'medium';

        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                let clickedBtn = e.target.closest('.diff-btn');
                if (clickedBtn) {
                    clickedBtn.classList.add('active');
                    this.selectedDifficulty = clickedBtn.getAttribute('data-diff') || 'medium';
                }
            });
        });

        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.addEventListener('click', (e) => {
                e.preventDefault();
                let elem = document.documentElement;
                try {
                    if (elem.requestFullscreen) {
                        elem.requestFullscreen().catch(err => console.log("Fullscreen hiba:", err));
                    } else if (elem.webkitRequestFullscreen) {
                        elem.webkitRequestFullscreen();
                    }
                    this.requestSafePointerLock();
                } catch (err) {
                    console.warn("Fullscreen / pointer lock warning:", err);
                }

                const fadeOverlay = document.getElementById('fade-overlay');
                if (fadeOverlay) fadeOverlay.style.opacity = '1';
                EventBus.emit('STOP_AUDIO', 'menuMusic');

                setTimeout(() => {
                    const mainMenu = document.getElementById('main-menu');
                    if (mainMenu) mainMenu.classList.add('hidden');
                    const gameUI = document.getElementById('game-ui-wrapper');
                    if (gameUI) gameUI.classList.remove('hidden');
                    EventBus.emit('START_GAME', { difficulty: this.selectedDifficulty || 'medium' });
                    setTimeout(() => { if (fadeOverlay) fadeOverlay.style.opacity = '0'; }, 500);
                }, 1500);
            });
        }

        const restartBtn = document.getElementById('restart-btn');
        if (restartBtn) {
            restartBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const gameOver = document.getElementById('game-over');
                if (gameOver) gameOver.classList.add('hidden');
                const gameUI = document.getElementById('game-ui-wrapper');
                if (gameUI) gameUI.classList.add('hidden');
                const mainMenu = document.getElementById('main-menu');
                if (mainMenu) {
                    mainMenu.classList.remove('hidden');
                    mainMenu.style.display = 'flex';
                }
                document.body.classList.remove('drugged', 'infected-mild', 'infected-medium', 'infected-severe');
                try { document.exitPointerLock(); } catch (err) {}
                EventBus.emit('RETURN_TO_MAIN_MENU');
            });
        }

        const resumeBtn = document.getElementById('resume-btn');
        if (resumeBtn) {
            resumeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                EventBus.emit('RESUME_GAME');
            });
        }

        const quitBtn = document.getElementById('quit-to-main-btn');
        if (quitBtn) {
            quitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const pauseMenu = document.getElementById('pause-menu');
                if (pauseMenu) pauseMenu.classList.add('hidden');
                const gameUI = document.getElementById('game-ui-wrapper');
                if (gameUI) gameUI.classList.add('hidden');
                const mainMenu = document.getElementById('main-menu');
                if (mainMenu) {
                    mainMenu.classList.remove('hidden');
                    mainMenu.style.display = 'flex';
                }
                document.body.classList.remove('drugged', 'infected-mild', 'infected-medium', 'infected-severe');
                try { document.exitPointerLock(); } catch (err) {}
                EventBus.emit('RETURN_TO_MAIN_MENU');
            });
        }

        const pauseCodexBtn = document.getElementById('pause-codex-btn');
        if (pauseCodexBtn) {
            pauseCodexBtn.addEventListener('click', () => {
                this.archiveOpenedFrom = 'pauseMenu';
                const pauseMenu = document.getElementById('pause-menu');
                if (pauseMenu) pauseMenu.classList.add('hidden');
                const archMenu = document.getElementById('archive-menu');
                if (archMenu) {
                    archMenu.classList.remove('hidden');
                    archMenu.style.display = 'flex';
                }
                document.querySelectorAll('.archive-tab-btn').forEach(b => b.classList.remove('active'));
                let loreBtn = document.querySelector('.archive-tab-btn[data-category="lore"]');
                if (loreBtn) loreBtn.classList.add('active');
                this.currentArchiveCategory = 'lore';
                this._renderArchiveList('lore');
            });
        }

        const pauseDevBtn = document.getElementById('pause-dev-btn');
        if (pauseDevBtn) {
            pauseDevBtn.addEventListener('click', () => {
                EventBus.emit('TOGGLE_DEV_MENU');
            });
        }

        const quitMainBtn = document.getElementById('quit-desktop-main-btn');
        if (quitMainBtn) {
            quitMainBtn.addEventListener('click', () => {
                window.close();
                location.reload();
            });
        }
        const quitPauseBtn = document.getElementById('quit-desktop-pause-btn');
        if (quitPauseBtn) {
            quitPauseBtn.addEventListener('click', () => {
                window.close();
                location.reload();
            });
        }
    }

    _setupOptionsMenu() {
        const optionsMenu = document.getElementById('options-menu');
        const openOptionsBtn = document.getElementById('open-options-btn');
        const pauseOptionsBtn = document.getElementById('pause-options-btn');
        const closeOptionsBtn = document.getElementById('close-options-btn');

        if (openOptionsBtn && optionsMenu) {
            openOptionsBtn.addEventListener('click', () => {
                optionsMenu.classList.remove('hidden');
                optionsMenu.style.display = 'flex';
                EventBus.emit('PLAY_SOUND', 'termOpen');
            });
        }
        if (pauseOptionsBtn && optionsMenu) {
            pauseOptionsBtn.addEventListener('click', () => {
                const pauseMenu = document.getElementById('pause-menu');
                if (pauseMenu) pauseMenu.classList.add('hidden');
                optionsMenu.classList.remove('hidden');
                optionsMenu.style.display = 'flex';
                EventBus.emit('PLAY_SOUND', 'termOpen');
            });
        }
        if (closeOptionsBtn && optionsMenu) {
            closeOptionsBtn.addEventListener('click', () => {
                optionsMenu.classList.add('hidden');
                optionsMenu.style.display = 'none';
                EventBus.emit('PLAY_SOUND', 'termClose');
                if (!document.getElementById('game-ui-wrapper').classList.contains('hidden') && document.getElementById('game-over').classList.contains('hidden')) {
                    document.getElementById('pause-menu').classList.remove('hidden');
                }
            });
        }

        document.querySelectorAll('.opt-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.opt-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.opt-section').forEach(c => c.classList.add('hidden'));

                let targetBtn = e.currentTarget;
                targetBtn.classList.add('active');
                let targetId = targetBtn.getAttribute('data-target');
                let targetContent = document.getElementById(targetId);
                if (targetContent) targetContent.classList.remove('hidden');
            });
        });

        // Sliders
        const musicSlider = document.getElementById('volume-music-slider');
        const musicVal = document.getElementById('vol-music-val');
        if (musicSlider && musicVal) {
            musicSlider.addEventListener('input', (e) => {
                let v = parseFloat(e.target.value);
                musicVal.innerText = Math.round(v * 100) + '%';
                EventBus.emit('SET_MUSIC_VOLUME', v);
            });
        }

        const sfxSlider = document.getElementById('volume-sfx-slider');
        const sfxVal = document.getElementById('vol-sfx-val');
        if (sfxSlider && sfxVal) {
            sfxSlider.addEventListener('input', (e) => {
                let v = parseFloat(e.target.value);
                sfxVal.innerText = Math.round(v * 100) + '%';
                EventBus.emit('SET_SFX_VOLUME', v);
            });
        }

        const brightSlider = document.getElementById('brightness-slider');
        const brightVal = document.getElementById('bright-val');
        if (brightSlider && brightVal) {
            // Alap fényerő alkalmazása betöltéskor
            const initBrightness = parseFloat(brightSlider.value);
            document.body.style.filter = `brightness(${initBrightness})`;
            brightVal.innerText = Math.round(initBrightness * 100) + '%';

            brightSlider.addEventListener('input', (e) => {
                let v = parseFloat(e.target.value);
                brightVal.innerText = Math.round(v * 100) + '%';
                document.body.style.filter = `brightness(${v})`;
            });
        }

        const sensSlider = document.getElementById('sensitivity-slider');
        const sensVal = document.getElementById('sens-val');
        if (sensSlider && sensVal) {
            sensSlider.addEventListener('input', (e) => {
                let v = parseFloat(e.target.value);
                if (v < 0.002) sensVal.innerText = "Alacsony";
                else if (v > 0.006) sensVal.innerText = "Magas";
                else sensVal.innerText = "Normál";
                EventBus.emit('SET_SENSITIVITY', v);
            });
        }

        const fsBtn = document.getElementById('toggle-fullscreen-btn');
        if (fsBtn) {
            fsBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!document.fullscreenElement) {
                    if (document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(err => console.log("Fullscreen hiba:", err));
                    } else if (document.documentElement.webkitRequestFullscreen) {
                        document.documentElement.webkitRequestFullscreen();
                    }
                } else {
                    if (document.exitFullscreen) document.exitFullscreen();
                    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                }
            });
        }
    }

    _setupGameUI() {
        const switchBtn = document.getElementById('switch-weapon-btn');
        if (switchBtn) {
            switchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                EventBus.emit('SWITCH_WEAPON_NEXT');
            });
        }
    }

    _setupDevMenu() {
        const devMenu = document.getElementById('dev-menu');
        const devClose = document.getElementById('dev-close');
        const devMoney = document.getElementById('dev-add-money');
        const devWave = document.getElementById('dev-wave-99');
        const devUnlock = document.getElementById('dev-unlock-all');
        const devGod = document.getElementById('dev-god-mode');

        if (devClose && devMenu) {
            devClose.addEventListener('click', () => {
                devMenu.classList.add('hidden');
                const isPlaying = !document.getElementById('game-ui-wrapper')?.classList.contains('hidden') &&
                    document.getElementById('pause-menu')?.classList.contains('hidden') &&
                    document.getElementById('main-menu')?.classList.contains('hidden');
                if (isPlaying) {
                    this.requestSafePointerLock();
                }
            });
        }

        if (devMoney) {
            devMoney.addEventListener('click', () => {
                EventBus.emit('ADD_SCORE', 10000);
                devMoney.style.background = "#00ffff"; devMoney.style.color = "#000";
                setTimeout(() => { devMoney.style.background = "rgba(0, 50, 50, 0.8)"; devMoney.style.color = "#00ffff"; }, 150);
            });
        }

        if (devWave) {
            devWave.addEventListener('click', () => {
                EventBus.emit('DEV_SET_WAVE', 99);
                devWave.style.background = "#00ffff"; devWave.style.color = "#000";
                setTimeout(() => { devWave.style.background = "rgba(0, 50, 50, 0.8)"; devWave.style.color = "#00ffff"; }, 150);
            });
        }

        if (devUnlock) {
            devUnlock.addEventListener('click', () => {
                if (playerStats) {
                    const enemies = ['normal', 'runner', 'tank', 'stalker', 'crawler', 'boss', 'alpha'];
                    enemies.forEach(e => {
                        if (playerStats.kills && playerStats.kills[e]) {
                            playerStats.kills[e].body = 50;
                            playerStats.kills[e].head = 50;
                        }
                    });
                    playerStats.plantsDestroyed = 10;
                    playerStats.wavesSurvived = 100;
                    if (typeof savePlayerStats === 'function') savePlayerStats();
                    this._renderArchiveList(this.currentArchiveCategory || 'lore');
                    EventBus.emit('UI_UPDATE_NEEDED');
                }
                devUnlock.style.background = "#00ffff"; devUnlock.style.color = "#000";
                setTimeout(() => { devUnlock.style.background = "rgba(0, 50, 50, 0.8)"; devUnlock.style.color = "#00ffff"; }, 150);
            });
        }

        let isGodMode = false;
        if (devGod) {
            devGod.addEventListener('click', () => {
                isGodMode = !isGodMode;
                EventBus.emit('DEV_SET_GOD_MODE', isGodMode);
                devGod.innerText = isGodMode ? "GOD MODE: BE" : "GOD MODE: KI";
                devGod.style.background = isGodMode ? "#00ffff" : "rgba(50, 0, 0, 0.8)";
                devGod.style.color = isGodMode ? "#000" : "#ff5555";
                devGod.style.borderColor = isGodMode ? "#00ffff" : "#aa0000";
            });
        }
    }

    updateHUD(data) {
        if (this.healthFill) this.healthFill.style.width = Math.max(0, data.playerHealth) + '%';
        if (this.armorFill) this.armorFill.style.width = Math.max(0, data.playerArmor) + '%';

        const healthNum = document.getElementById('health-number');
        if (healthNum) healthNum.innerHTML = Math.max(0, Math.floor(data.playerHealth));

        const resCounter = document.getElementById('resonator-counter');
        if (resCounter) {
            if (data.playerResonators > 0) {
                resCounter.style.display = 'inline-block';
                resCounter.innerText = `[ S-R: ${data.playerResonators} ]`;
            } else resCounter.style.display = 'none';
        }

        const medkitCounter = document.getElementById('medkit-counter');
        if (medkitCounter) {
            if (data.playerMedkits > 0) {
                medkitCounter.style.display = 'inline-block';
                medkitCounter.innerText = `[+${data.playerMedkits}]`;
            } else medkitCounter.style.display = 'none';
        }

        const staminaFill = document.getElementById('stamina-fill');
        if (staminaFill) {
            staminaFill.style.width = Math.max(0, data.playerStamina) + '%';
            if (data.isExhausted) {
                staminaFill.style.background = '#ff5555';
                staminaFill.style.boxShadow = '0 0 5px #ff0000';
            } else {
                staminaFill.style.background = '#00ffcc';
                staminaFill.style.boxShadow = '0 0 5px #00ffcc';
            }
        }

        this.updateBonusTimer(data);
        this.updateWeaponHUD(data);
        this.updateDirectiveHUD(data);
    }

    updateInfection(data) {
        const infNum = document.getElementById('infection-number');
        if (infNum) {
            let inf = Math.floor(data.playerInfection);
            infNum.innerHTML = inf + '%';
            if (inf < 30) {
                infNum.style.color = '#00ff00'; infNum.style.textShadow = '0 0 5px #00ff00';
            } else if (inf < 70) {
                infNum.style.color = '#ffaa00'; infNum.style.textShadow = '0 0 8px #ffaa00';
            } else {
                infNum.style.color = '#ff0000'; infNum.style.textShadow = '0 0 15px #ff0000';
            }
        }
    }

    updateBonusTimer(data) {
        const bonusPanel = document.getElementById('bonus-panel');
        const timerDisplay = document.getElementById('timer-display');
        const bonusDisplay = document.getElementById('bonus-display');

        if (bonusPanel && timerDisplay && bonusDisplay) {
            if (data.isWaveActive) {
                bonusPanel.classList.remove('hidden');
                let seconds = Math.floor(data.timeLeft);
                let millis = Math.floor((data.timeLeft - seconds) * 10);
                let currentBonusCR = seconds * 10;

                timerDisplay.innerText = `00:${seconds < 10 ? '0' + seconds : seconds}.${millis}`;
                bonusDisplay.innerText = `+${currentBonusCR} CR`;

                if (data.timeLeft > data.parTime * 0.5) {
                    timerDisplay.style.color = '#fff'; timerDisplay.style.textShadow = '0 0 10px rgba(255, 255, 255, 0.8)';
                    bonusDisplay.style.color = '#ffcc00'; bonusDisplay.style.textShadow = '0 0 10px rgba(255, 204, 0, 0.8)';
                } else if (data.timeLeft > 0) {
                    timerDisplay.style.color = '#ffaa00'; timerDisplay.style.textShadow = '0 0 10px rgba(255, 170, 0, 0.8)';
                    bonusDisplay.style.color = '#ff8800'; bonusDisplay.style.textShadow = '0 0 10px rgba(255, 136, 0, 0.8)';
                } else {
                    timerDisplay.innerText = `00:00.0`; timerDisplay.style.color = '#ff0000'; timerDisplay.style.textShadow = '0 0 10px rgba(255, 0, 0, 0.8)';
                    bonusDisplay.innerText = `+0 CR`; bonusDisplay.style.color = '#555'; bonusDisplay.style.textShadow = 'none';
                }
            } else {
                bonusPanel.classList.add('hidden');
            }
        }
    }

    updateHP(data) {
        if (!data) return;
        let hp = (typeof data === 'number') ? data : (data.current !== undefined ? data.current : (data.playerHealth !== undefined ? data.playerHealth : 0));
        let maxHP = data.max || 100;
        let percentage = Math.min(100, Math.max(0, (hp / maxHP) * 100));

        if (!this.healthFill) this.healthFill = document.getElementById('health-fill');
        if (this.healthFill) this.healthFill.style.width = percentage + '%';

        const healthNum = document.getElementById('health-number');
        if (healthNum) healthNum.innerHTML = Math.max(0, Math.floor(hp));
    }

    updateArmor(data) {
        if (!data) return;
        let armor = (typeof data === 'number') ? data : (data.current !== undefined ? data.current : (data.playerArmor !== undefined ? data.playerArmor : 0));
        let maxArmor = data.max || 100;
        let percentage = Math.min(100, Math.max(0, (armor / maxArmor) * 100));

        if (!this.armorFill) this.armorFill = document.getElementById('armor-fill');
        if (this.armorFill) this.armorFill.style.width = percentage + '%';
    }

    updateAmmo(data) {
        if (!data) return;
        let ammoVal = (data.ammo !== undefined) ? data.ammo : data.current;
        let reserveVal = (data.reserve !== undefined) ? data.reserve : data.max;
        const ammoClip = document.getElementById('ammo-clip');
        const ammoReserve = document.getElementById('ammo-reserve');
        if (ammoClip && ammoVal !== undefined) {
            ammoClip.innerText = ammoVal === Infinity ? '∞' : ammoVal;
            if (ammoVal === 0) {
                ammoClip.style.color = '#ff0000'; ammoClip.style.textShadow = '0 0 15px rgba(255,0,0,1)';
            } else if (data.maxAmmo && ammoVal <= data.maxAmmo * 0.3) {
                ammoClip.style.color = '#ffaa00'; ammoClip.style.textShadow = '0 0 10px rgba(255,170,0,0.8)';
            } else {
                ammoClip.style.color = '#00ffff'; ammoClip.style.textShadow = '0 2px 10px rgba(0,255,255,0.5)';
            }
        }
        if (ammoReserve && reserveVal !== undefined) {
            ammoReserve.innerText = reserveVal === Infinity ? '—' : reserveVal;
        }
    }

    updateWeaponHUD(data) {
        if (!data.weaponData) return;
        let w = data.weaponData;
        const weaponIcon = document.getElementById('weapon-icon-display');
        if (weaponIcon) {
            weaponIcon.innerHTML = `<img src="${w.image}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 0 5px rgba(0,255,255,0.8));">`;
        }

        const ammoClip = document.getElementById('ammo-clip');
        const ammoReserve = document.getElementById('ammo-reserve');

        if (ammoClip) {
            ammoClip.innerText = w.ammo === Infinity ? '∞' : w.ammo;
            if (w.ammo === 0) {
                ammoClip.style.color = '#ff0000'; ammoClip.style.textShadow = '0 0 15px rgba(255,0,0,1)';
            } else if (w.ammo <= w.maxAmmo * 0.3) {
                ammoClip.style.color = '#ffaa00'; ammoClip.style.textShadow = '0 0 10px rgba(255,170,0,0.8)';
            } else {
                ammoClip.style.color = '#00ffff'; ammoClip.style.textShadow = '0 2px 10px rgba(0,255,255,0.5)';
            }
        }
        if (ammoReserve) ammoReserve.innerText = w.reserve === Infinity ? '—' : w.reserve;
    }

    updateDirectiveHUD(data) {
        const dirHud = document.getElementById('directive-hud');
        if (dirHud && data.activeDirective && data.gameState === 'PLAYING') {
            dirHud.classList.remove('hidden');
            if (data.directiveData) {
                document.getElementById('directive-title').innerText = data.directiveData.title;
                const progDisplay = document.getElementById('directive-progress');
                if (data.directiveProgress >= data.directiveData.goal) {
                    progDisplay.innerText = "TELJESÍTVE!"; progDisplay.style.color = "#00ff00";
                } else {
                    progDisplay.innerText = `${data.directiveProgress} / ${data.directiveData.goal}`; progDisplay.style.color = "#ffaa00";
                }
            }
        } else if (dirHud) {
            dirHud.classList.add('hidden');
        }
    }

    showHitmarker(isHeadshot) {
        if (this.hitmarker) {
            this.hitmarker.classList.remove('hidden');
            setTimeout(() => this.hitmarker.classList.add('hidden'), 100);
        }
        if (isHeadshot && this.hsMsg) {
            this.hsMsg.classList.remove('hidden');
            this.hsMsg.classList.remove('headshot-anim');
            void this.hsMsg.offsetWidth;
            this.hsMsg.classList.add('headshot-anim');
        }
    }

    showShieldIcon(shieldType) {
        const shieldIcon = document.getElementById('shield-icon');
        if (!shieldIcon) return;

        shieldIcon.classList.remove('hidden');

        // Színezés a pocsolya állapota alapján
        if (shieldType === 'ready') {
            shieldIcon.style.filter = 'hue-rotate(150deg) saturate(300%) brightness(150%)'; // Pirosas
        } else if (shieldType === 'yellow') {
            shieldIcon.style.filter = 'hue-rotate(220deg) saturate(300%)'; // Sárgás
        } else {
            shieldIcon.style.filter = 'hue-rotate(0deg) saturate(200%)'; // Alap (Zöldes)
        }

        // Animáció újraindítása
        shieldIcon.classList.remove('shield-anim');
        void shieldIcon.offsetWidth;
        shieldIcon.classList.add('shield-anim');

        if (this.shieldIconTimeout) clearTimeout(this.shieldIconTimeout);
        this.shieldIconTimeout = setTimeout(() => {
            const icon = document.getElementById('shield-icon');
            if (icon) icon.classList.add('hidden');
        }, 450);
    }

    showDamageFlash() {
        const damageFlash = document.getElementById('damage-flash');
        if (damageFlash) {
            damageFlash.style.opacity = 1;
            setTimeout(() => damageFlash.style.opacity = 0, 300);
        }
    }

    clearScreenBlood() {
        document.querySelectorAll('.visor-blood-splatter').forEach(el => el.remove());
        const sb = document.getElementById('screen-blood');
        if (sb) sb.style.opacity = '0';
        const df = document.getElementById('damage-flash');
        if (df) df.style.opacity = '0';
        const hf = document.getElementById('heal-flash');
        if (hf) hf.style.opacity = '0';
    }

    splashVisorBlood(isPlayerBlood = false) {
        const mainMenu = document.getElementById('main-menu');
        const gameOver = document.getElementById('game-over');
        if ((mainMenu && !mainMenu.classList.contains('hidden')) || (gameOver && !gameOver.classList.contains('hidden'))) {
            return;
        }

        // Overlay villanás piros vér esetén
        if (isPlayerBlood) {
            const visor = document.getElementById('visor-blood') || document.getElementById('screen-blood');
            if (visor) {
                visor.style.opacity = '1.0';
                setTimeout(() => {
                    visor.style.opacity = '0';
                }, 2000);
            }
        }

        // Képernyőre fröccsenő cseppek (Zöld vagy Piros)
        const uiLayer = document.getElementById('ui-layer') || document.body;

        let dropCount = Math.floor(Math.random() * 4) + 3;
        for (let i = 0; i < dropCount; i++) {
            let drop = document.createElement('div');
            drop.className = 'visor-blood-splatter';
            if (isPlayerBlood === true) {
                drop.classList.add('red');
            }

            let x = Math.random() * 90 + 5;
            let y = Math.random() * 60 + 5;

            drop.style.left = x + 'vw';
            drop.style.top = y + 'vh';

            let scale = Math.random() * 1.5 + 0.5;
            drop.style.transform = `scale(${scale})`;

            uiLayer.appendChild(drop);

            setTimeout(() => {
                drop.style.opacity = '0';
                setTimeout(() => drop.remove(), 1000);
            }, 100);
        }
    }

    showInteractPrompt(data) {
        const prompt = document.getElementById('loot-interaction-prompt') || document.getElementById('interact-prompt');
        if (prompt) {
            if (data.visible) {
                prompt.classList.remove('hidden');
                let text = "Interakció [E]";
                if (data.type === 'health') text = "Gen-Stab felvétele [E]";
                if (data.type === 'ammo') text = "Lőszer felvétele [E]";
                prompt.innerText = text;
            } else {
                prompt.classList.add('hidden');
            }
        }
    }

    showLootPopup(data) {
        // UI loot popup logika (felugró szöveg a HUD-on)
        const popup = document.createElement('div');
        popup.className = 'loot-popup';
        popup.innerText = data.text;
        popup.style.position = 'absolute';
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.color = data.color || '#00ffff';
        popup.style.fontFamily = "'Share Tech Mono', monospace";
        popup.style.fontSize = '24px';
        popup.style.textShadow = `0 0 10px ${data.color || '#00ffff'}`;
        popup.style.zIndex = '9999';
        popup.style.pointerEvents = 'none';
        document.body.appendChild(popup);

        let op = 1.0;
        let pos = 50;
        let intv = setInterval(() => {
            op -= 0.05;
            pos -= 0.5;
            popup.style.opacity = op;
            popup.style.top = `${pos}%`;
            if (op <= 0) {
                clearInterval(intv);
                popup.remove();
            }
        }, 30);
    }

    // ==========================================
    // BOLT ÉS FEJLESZTÉSEK
    // ==========================================
    _setupShopMenu() {
        const tabWeaponsBtn = document.getElementById('tab-weapons');
        const tabSkillsBtn = document.getElementById('tab-skills');
        const tabDirectivesBtn = document.getElementById('tab-directives');

        const shopWeaponsDiv = document.getElementById('shop-weapons');
        const shopSkillsDiv = document.getElementById('shop-skills');
        const shopDirectivesDiv = document.getElementById('shop-directives');

        const resetShopTabs = () => {
            if (tabWeaponsBtn) tabWeaponsBtn.classList.remove('active');
            if (tabSkillsBtn) tabSkillsBtn.classList.remove('active');
            if (tabDirectivesBtn) tabDirectivesBtn.classList.remove('active');
            if (shopWeaponsDiv) shopWeaponsDiv.classList.add('hidden');
            if (shopSkillsDiv) shopSkillsDiv.classList.add('hidden');
            if (shopDirectivesDiv) shopDirectivesDiv.classList.add('hidden');
        };

        if (tabWeaponsBtn && tabSkillsBtn && tabDirectivesBtn) {
            tabWeaponsBtn.addEventListener('click', () => { resetShopTabs(); tabWeaponsBtn.classList.add('active'); shopWeaponsDiv.classList.remove('hidden'); });
            tabSkillsBtn.addEventListener('click', () => { resetShopTabs(); tabSkillsBtn.classList.add('active'); shopSkillsDiv.classList.remove('hidden'); });
            tabDirectivesBtn.addEventListener('click', () => {
                this.omniDirOpenedFrom = 'shopMenu';
                if (this.shopMenu) this.shopMenu.classList.add('hidden');
                if (this.omniDirMenu) {
                    this.omniDirMenu.classList.remove('hidden');
                    this.omniDirMenu.style.display = 'flex';
                }
                document.querySelectorAll('.dir-tab-btn').forEach(b => b.classList.remove('active'));
                let infoTab = document.querySelector('.dir-tab-btn[data-tier="info"]');
                if (infoTab) infoTab.classList.add('active');

                this.omniCurrentDirTier = 'info';
                EventBus.emit('REQUEST_DIRECTIVES_RENDER', { tier: 'info' });
            });
        }

        const closeBtn = document.getElementById('close-shop-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                EventBus.emit('PLAY_SOUND', 'termClose');
                if (this.shopMenu) this.shopMenu.classList.add('hidden');
                document.getElementById('game-ui-wrapper').classList.remove('hidden');
                this.requestSafePointerLock();
                EventBus.emit('CLOSE_SHOP');
            });
        }
    }

    openShop(data) {
        try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { }
        EventBus.emit('PLAY_SOUND', 'termOpen');
        if (this.shopMenu) this.shopMenu.classList.remove('hidden');
        document.getElementById('game-ui-wrapper').classList.add('hidden');

        const statsBar = document.getElementById('shop-points') ? document.getElementById('shop-points').parentNode.parentNode : null;
        const weaponBar = document.getElementById('shop-weapon-switches') ? document.getElementById('shop-weapon-switches').parentNode : null;
        const tabsBar = document.querySelector('.shop-tabs');

        if (data.shopLockedForNextWave) {
            if (statsBar) statsBar.style.display = 'none';
            if (weaponBar) weaponBar.style.display = 'none';
            if (tabsBar) tabsBar.style.display = 'none';
            document.getElementById('shop-weapons').classList.add('hidden');
            document.getElementById('shop-skills').classList.add('hidden');
            document.getElementById('shop-directives').classList.add('hidden');

            let penaltyDiv = document.getElementById('penalty-screen');
            if (!penaltyDiv) {
                penaltyDiv = document.createElement('div');
                penaltyDiv.id = 'penalty-screen';
                penaltyDiv.style.textAlign = 'center';
                penaltyDiv.style.marginTop = '80px';
                penaltyDiv.style.marginBottom = '40px';
                document.getElementById('shop-content-wrapper').appendChild(penaltyDiv);
            }
            penaltyDiv.innerHTML = `
                <div style="color: #ff0000; font-size: 50px; text-shadow: 0 0 20px #ff0000; margin-bottom: 20px;">⚠️ HOZZÁFÉRÉS MEGTAGADVA ⚠️</div>
                <div style="color: #ff5555; font-size: 24px; margin-bottom: 30px; font-weight: bold; letter-spacing: 2px;">SZERZŐDÉSSZEGÉS ÉSZLELVE</div>
                <div style="color: #aaa; font-size: 18px; max-width: 600px; line-height: 1.8; margin-left: auto; margin-right: auto; padding: 25px; border: 1px dashed #aa0000; background: rgba(50,0,0,0.2); box-shadow: inset 0 0 20px rgba(255,0,0,0.1);">
                    A KRONOS protokoll megsértése miatt a vállalati nyomtatóhoz és orvosi készletekhez való hozzáférés ideiglenesen felfüggesztésre került.<br><br>
                    <span style="color:#ffaa00;">Az ellátmányozás a következő sikeres adatgyűjtési ciklus (hullám) után áll helyre.</span>
                </div>
            `;
            penaltyDiv.style.display = 'block';
            EventBus.emit('CLEAR_SHOP_LOCK');
            return;
        }

        if (statsBar) statsBar.style.display = 'flex';
        if (weaponBar) weaponBar.style.display = 'flex';
        if (tabsBar) tabsBar.style.display = 'flex';

        let penaltyDiv = document.getElementById('penalty-screen');
        if (penaltyDiv) penaltyDiv.style.display = 'none';

        const tabWeaponsBtn = document.getElementById('tab-weapons');
        const shopWeaponsDiv = document.getElementById('shop-weapons');
        if (tabWeaponsBtn) tabWeaponsBtn.classList.add('active');
        if (shopWeaponsDiv) shopWeaponsDiv.classList.remove('hidden');

        EventBus.emit('REQUEST_SHOP_UPDATE');
    }

    flashMoneyError() {
        EventBus.emit('PLAY_SOUND', 'error');
        if (this.shopPoints) {
            this.shopPoints.style.color = '#ff0000';
            setTimeout(() => this.shopPoints.style.color = '#ffcc00', 300);
        }
    }

    getBtnHTML(name, imageUrl, stat, price) {
        let imageHTML = imageUrl ? `<img src="${imageUrl}" style="width: 100%; height: 100%; object-fit: contain;">` : '';
        return `
            <div class="item-header">
                <span class="item-name">${name}</span>
                <div class="item-icon-box" style="width: 40px; height: 30px; background: transparent; border: none;">${imageHTML}</div>
            </div>
            <div class="item-stat">${stat}</div>
            <div class="item-price">${price}</div>
        `;
    }

    updateShopButtons(data = this.lastShopData) {
        if (!data) {
            EventBus.emit('REQUEST_SHOP_UPDATE');
            return;
        }
        this.lastShopData = data;

        let bonusText = data.lastWaveBonus > 0 ? ` <span style="color:#00ff00; font-size:18px;">(+${data.lastWaveBonus} BÓNUSZ)</span>` : '';
        if (this.shopPoints) this.shopPoints.innerHTML = `${data.score} CR${bonusText}`;

        let weaponSwitchHTML = `<div style="display: flex; gap: 8px;">`;
        const weaponKeys = Object.keys(data.weapons);
        weaponKeys.forEach(key => {
            let isOwned = data.weapons[key].owned;
            let isActive = (key === data.currentWeaponId);
            let w = data.weapons[key];

            let bgColor = isActive ? "#00ffff" : (isOwned ? "rgba(0, 100, 100, 0.6)" : "rgba(30, 0, 0, 0.5)");
            let color = isActive ? "#000" : (isOwned ? "#00ffff" : "#555");
            let border = isActive ? "1px solid #fff" : "1px solid #005555";
            let cursor = isOwned ? "pointer" : "not-allowed";
            let clickHandler = isOwned ? `switchShopWeapon('${key}')` : '';
            weaponSwitchHTML += `<button onclick="${clickHandler}" style="background: ${bgColor}; color: ${color}; border: ${border}; padding: 5px 12px; font-size: 14px; cursor: ${cursor}; font-family: 'Share Tech Mono', monospace; border-radius: 3px; letter-spacing: 1px;">${w.name.toUpperCase()}</button>`;
        });
        weaponSwitchHTML += `</div>`;

        let w = data.weapons[data.currentWeaponId];
        const shopAmmoDisplay = document.getElementById('shop-ammo-display');
        if (shopAmmoDisplay && w) shopAmmoDisplay.innerText = `${w.ammo} / ${w.reserve}`;

        const shopWeaponSwitches = document.getElementById('shop-weapon-switches');
        if (shopWeaponSwitches) shopWeaponSwitches.innerHTML = weaponSwitchHTML;

        let maxHP = 100 + (data.skills.maxHealth.level * 20);
        const shopHealthDisplay = document.getElementById('shop-health-display');
        if (shopHealthDisplay) {
            let healthPercent = Math.max(0, Math.floor((data.playerHealth / maxHP) * 100));
            shopHealthDisplay.innerText = `${Math.floor(data.playerHealth)} / ${maxHP} HP`;
            shopHealthDisplay.style.color = healthPercent < 50 ? '#ff0000' : '#00ff00';
        }

        const infNum = document.getElementById('shop-infection-display');
        if (infNum) {
            let inf = Math.floor(data.playerInfection);
            infNum.innerHTML = inf + '%';
            if (inf < 30) {
                infNum.style.color = '#00ff00'; infNum.style.textShadow = '0 0 5px #00ff00';
            } else if (inf < 70) {
                infNum.style.color = '#ffaa00'; infNum.style.textShadow = '0 0 8px #ffaa00';
            } else {
                infNum.style.color = '#ff0000'; infNum.style.textShadow = '0 0 15px #ff0000';
            }
        }

        // Fegyver gombok generálása
        const weaponsList = [
            { id: 'pistol', name: 'OMNICORP PISZTOLY', basePrice: 200, image: data.weapons.pistol.image },
            { id: 'shotgun', name: 'SÖRÉTES PUSKA', basePrice: 500, image: data.weapons.shotgun.image },
            { id: 'rifle', name: 'GÉPKARABÉLY', basePrice: 1000, image: data.weapons.rifle.image },
            { id: 'super', name: 'NEHÉZ REVOLVER', basePrice: 5000, image: data.weapons.super.image }
        ];

        weaponsList.forEach(wData => {
            let btn = document.getElementById(`buy-${wData.id}`);
            if (!btn) return;
            let wp = data.weapons[wData.id];

            let nextLevelDesc = "";
            if (wp.level === 1) nextLevelDesc = "+50% Tartalék Lőszer";
            else if (wp.level === 2) nextLevelDesc = "-25% Újratöltési Idő";
            else if (wp.level === 3) nextLevelDesc = (wData.id === 'super') ? "Magnum Kaliber (+50% Sebzés)" : "+50% Tárkapacitás";
            else if (wp.level === 4) nextLevelDesc = "Páncéltörő (+100% Sebzés)";

            if (!wp.owned) {
                let pColor = data.score >= wData.basePrice ? "#00ff00" : "#ff5555";
                btn.innerHTML = this.getBtnHTML(wData.name, wData.image, "ÁLLAPOT: ZÁROLVA", `<span style="color:${pColor};">ENGEDÉLYEZÉS: ${wData.basePrice} CR</span>`);
                btn.disabled = false;
            } else if (wp.level < 5) {
                let upgPrice = wData.basePrice * wp.level;
                let pColor = data.score >= upgPrice ? "#00ff00" : "#ff5555";
                btn.innerHTML = this.getBtnHTML(wData.name, wData.image, `FEJLETTSÉG: LVL <span style="color:#fff;">${wp.level}</span> ➔ <span style="color:#00ffff;">${wp.level + 1}</span><br><span style="color:#00ffff; font-size: 12px;">BÓNUSZ: ${nextLevelDesc}</span>`, `<span style="color:${pColor};">KALIBRÁCIÓ: ${upgPrice} CR</span>`);
                btn.disabled = false;
            } else {
                btn.innerHTML = this.getBtnHTML(wData.name, wData.image, "ÁLLAPOT: MAX SZINT (LVL 5)", "---");
                btn.disabled = true;
            }
            btn.onclick = () => EventBus.emit('TRY_BUY_WEAPON', { id: wData.id, price: wp.owned ? wData.basePrice * wp.level : wData.basePrice });
        });

        // Skill gombok generálása
        const skillsList = [
            { id: 'maxHealth', name: 'SZÖVET SŰRŰSÍTŐ', desc: '+20% Max HP', image: "" },
            { id: 'speed', name: 'CYBER LÁB', desc: '+20% Sebesség', image: "" },
            { id: 'ammoLoot', name: 'LŐSZER ZSEB', desc: '+20% Max Tartalék', image: "" },
            { id: 'healthLoot', name: 'NANOBOTOK', desc: '+20% Gyógyulás', image: "" },
            { id: 'revive', name: 'AUTOMATA DEFIBRILLÁTOR', desc: 'Újraélesztés + 40% Fertőzés Tisztítás', image: "" },
            { id: 'freeze', name: 'CRYO-OVERRIDE', desc: '+2 mp Rendszeridő', image: "" }
        ];

        skillsList.forEach(sData => {
            let btn = document.getElementById(`skill-${sData.id}`);
            if (!btn) return;
            let s = data.skills[sData.id];

            if (s.level < s.maxLevel) {
                let upgPrice = s.baseCost * (s.level + 1);
                let pColor = data.score >= upgPrice ? "#00ff00" : "#ff5555";

                let levelText = `FEJLETTSÉG: LVL <span style="color:#fff;">${s.level}</span> / ${s.maxLevel}`;
                let btnActionText = `<span style="color:${pColor};">KALIBRÁCIÓ: ${upgPrice} CR</span>`;

                if (sData.id === 'revive') {
                    levelText = `AKTÍV TÖLTÉSEK: <span style="color:#fff;">${s.level} / ${s.maxLevel}</span>`;
                    btnActionText = `<span style="color:${pColor};">ÚJRAKALIBRÁLÁS: ${upgPrice} CR</span>`;
                } else if (sData.id === 'freeze') {
                    levelText = `LICENC SZINT: <span style="color:#fff;">${s.level}</span> / ${s.maxLevel}`;
                    btnActionText = `<span style="color:${pColor};">HOZZÁFÉRÉS VÉTELE: ${upgPrice} CR</span>`;
                }

                btn.innerHTML = this.getBtnHTML(sData.name, sData.image, `${levelText}<br><span style="color:#00ffff; font-size: 12px;">HATÁS: ${sData.desc}</span>`, btnActionText);
                btn.disabled = false;
            } else {
                let maxText = sData.id === 'freeze' ? "JOGOSULTSÁG: MAX (KORLÁTLAN)" : "ÁLLAPOT: MAX SZINT";
                btn.innerHTML = this.getBtnHTML(sData.name, sData.image, maxText, "---");
                btn.disabled = true;
            }
            btn.onclick = () => EventBus.emit('TRY_BUY_SKILL', { id: sData.id, price: s.baseCost * (s.level + 1) });
        });

        // Gyorsműveletek (Eseményt küldünk)
        const ammoBtn = document.getElementById('buy-ammo');
        if (ammoBtn) {
            ammoBtn.classList.add('btn-action');
            let needsAmmo = data.needsAmmo;
            if (!needsAmmo) {
                ammoBtn.innerHTML = this.getBtnHTML("LŐSZER UTÁNPÓTLÁS", "", "A tartalék kapacitás maximális.", "KÖLTSÉG: 0 CR");
                ammoBtn.disabled = true;
            } else {
                let pColor = data.score >= 50 ? "#00ff00" : "#ff5555";
                ammoBtn.innerHTML = this.getBtnHTML("LŐSZER UTÁNPÓTLÁS", "", "+25% Tartalék minden fegyverbe", `<span style="color:${pColor};">KÖLTSÉG: 50 CR</span>`);
                ammoBtn.disabled = false;
            }
            ammoBtn.onclick = () => EventBus.emit('TRY_BUY_AMMO', { price: 50 });
        }

        const medkitBtn = document.getElementById('buy-medkit');
        if (medkitBtn) {
            medkitBtn.classList.add('btn-heal');
            let medkitCost = 100;
            if (data.playerMedkits >= data.maxMedkits) {
                medkitBtn.innerHTML = this.getBtnHTML("GEN-STAB KÉSZLET", "", "Injekciós rekesz kapacitása maximális.", "KÖLTSÉG: 0 CR");
                medkitBtn.disabled = true;
            } else {
                let healAmount = 40 * (1 + (data.skills.healthLoot.level * 0.2));
                medkitBtn.innerHTML = this.getBtnHTML("GEN-STAB SZINTÉZIS", "", `Gyors-gyógyítás (+${healAmount} HP). Rekesz: ${data.playerMedkits}/${data.maxMedkits}`, `KÖLTSÉG: ${medkitCost} CR`);
                medkitBtn.disabled = (data.score < medkitCost);
            }
            medkitBtn.onclick = () => EventBus.emit('TRY_BUY_MEDKIT', { price: medkitCost });
        }

        const neuralBtn = document.getElementById('buy-neural-upload');
        if (neuralBtn) {
            let uploadCost = 1000;
            let pending = data.playerStats.pendingDataPackets || 0;
            let activeBoost = (data.playerStats.uploadedDataPackets || 0) * 5;
            let nextBoost = (pending > 0) ? (pending * 5) : 0;

            if (pending <= 0) {
                neuralBtn.innerHTML = this.getBtnHTML("NEURÁLIS SZINKRONIZÁCIÓ", "", `Aktív harci optimalizáció: +${activeBoost}% Sebzés.<br><span style="color:#aaa;">Nincs elérhető új adatcsomag a KRONOS szerveren.</span>`, "KÖLTSÉG: 0 CR");
                neuralBtn.disabled = true;
                neuralBtn.style.borderColor = "#333";
            } else {
                let pColor = data.score >= uploadCost ? "#ff00ff" : "#ff5555";
                neuralBtn.innerHTML = this.getBtnHTML("NEURÁLIS SZINKRONIZÁCIÓ", "", `KRONOS szerveren várakozó adatok: <span style="color:#ffcc00; font-weight:bold;">${pending} db</span>.<br><span style="color:#ff00ff;">Közvetlen tudat-letöltés: +${nextBoost}% Sebzés bónusz!</span>`, `<span style="color:${pColor};">LETÖLTÉS ÁRA: ${uploadCost} CR</span>`);
                neuralBtn.disabled = false;
                neuralBtn.style.borderColor = "#ff00ff";
            }
            neuralBtn.onclick = () => {
                EventBus.emit('TRY_BUY_NEURAL', { price: uploadCost });
                // Mátrix vizuál
                const damageFlash = document.getElementById('damage-flash');
                if (damageFlash && pending > 0 && data.score >= uploadCost) {
                    damageFlash.style.backgroundColor = 'rgba(255, 0, 255, 0.4)';
                    damageFlash.style.opacity = 1;
                    setTimeout(() => {
                        damageFlash.style.opacity = 0;
                        damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
                    }, 400);
                }
            };
        }

        const resBtn = document.getElementById('buy-resonator');
        if (resBtn) {
            resBtn.classList.add('btn-action');
            let resCost = 250;
            if (data.playerResonators >= data.maxResonators) {
                resBtn.innerHTML = this.getBtnHTML("SZEIZMIKUS REZONÁTOR", "", "Készlet maximális (3/3).", "KÖLTSÉG: 0 CR");
                resBtn.disabled = true;
            } else {
                let pColor = data.score >= resCost ? "#00ff00" : "#ff5555";
                resBtn.innerHTML = this.getBtnHTML("SZEIZMIKUS REZONÁTOR", "", `Ipari terület-megtisztító töltet. Vonzza a mutánsokat!<br>Készlet: ${data.playerResonators} / ${data.maxResonators}`, `<span style="color:${pColor};">KÖLTSÉG: ${resCost} CR</span>`);
                resBtn.disabled = false;
            }
            resBtn.onclick = () => EventBus.emit('TRY_BUY_RESONATOR', { price: resCost });
        }

        const healBtn = document.getElementById('buy-health');
        if (healBtn) {
            healBtn.classList.add('btn-heal');
            let missingHP = maxHP - data.playerHealth;
            let healCost = Math.ceil(missingHP * 2);
            if (missingHP <= 0) {
                healBtn.innerHTML = this.getBtnHTML("BIOLÓGIAI HELYREÁLLÍTÁS", "", "A klóntest állapota stabil (100%).", "KÖLTSÉG: 0 CR");
                healBtn.disabled = true;
            } else {
                healBtn.innerHTML = this.getBtnHTML(`BIOLÓGIAI HELYREÁLLÍTÁS (+${Math.floor(missingHP)} HP)`, "", "Azonnali, teljes sejtszintű regeneráció.", `KÖLTSÉG: ${healCost} CR`);
                healBtn.disabled = (data.score < healCost);
            }
            healBtn.onclick = () => {
                EventBus.emit('TRY_BUY_HEAL', { price: healCost, missingHP });
                const healFlash = document.getElementById('heal-flash');
                if (healFlash && missingHP > 0 && data.score >= healCost) { healFlash.style.opacity = 1; setTimeout(() => healFlash.style.opacity = 0, 300); }
            };
        }

        const armorBtn = document.getElementById('buy-armor');
        if (armorBtn) {
            armorBtn.classList.add('btn-action');
            let armorCost = 40;
            let maxArmor = 100;
            let missingArmor = maxArmor - data.playerArmor;
            if (missingArmor <= 0) {
                armorBtn.innerHTML = this.getBtnHTML("KEVLÁR PÁNCÉL", "", "A páncélzat sértetlen.", "KÖLTSÉG: 0 CR");
                armorBtn.disabled = true;
            } else {
                let armorGain = Math.min(25, missingArmor);
                armorBtn.innerHTML = this.getBtnHTML("KEVLÁR PÁNCÉL", "", `Pajzs generálása (+${Math.floor(armorGain)} AP).<br>Készlet: ${Math.floor(data.playerArmor)} / ${maxArmor}`, `KÖLTSÉG: ${armorCost} CR`);
                armorBtn.disabled = (data.score < armorCost);
            }
            armorBtn.onclick = () => EventBus.emit('TRY_BUY_ARMOR', { price: armorCost });
        }

        const puddleCountDisplay = document.getElementById('puddle-count');
        if (puddleCountDisplay) puddleCountDisplay.innerText = data.toxicPuddlesCount;

        const cleanBtn = document.getElementById('buy-clean');
        if (cleanBtn) {
            cleanBtn.classList.add('btn-action');
            let amountToClean = Math.min(10, data.toxicPuddlesCount);
            let cost = amountToClean * 10;

            if (data.toxicPuddlesCount === 0) {
                cleanBtn.innerHTML = this.getBtnHTML("STERILIZÁLÁS PROTOKOLL", "", "A Szektor mentes minden biomasszától.", "KÖLTSÉG: 0 CR");
                cleanBtn.disabled = true;
            } else {
                cleanBtn.innerHTML = this.getBtnHTML(`STERILIZÁLÁS (${amountToClean} db)`, "", "Toxikus biomassza megsemmisítése a területen.", `KÖLTSÉG: ${cost} CR`);
                cleanBtn.disabled = (data.score < cost);
            }
            cleanBtn.onclick = () => EventBus.emit('TRY_BUY_CLEAN', { price: cost, amountToClean });
        }
    }


    // ==========================================
    // ARCHÍVUM / KÓDEX (LORE) LOGIKA
    // ==========================================
    _setupArchiveMenu() {
        document.querySelectorAll('.archive-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.archive-tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.currentArchiveCategory = e.target.getAttribute('data-category');
                EventBus.emit('REQUEST_ARCHIVE_RENDER', { category: this.currentArchiveCategory });
            });
        });

        const openArchiveBtn = document.getElementById('open-archive-btn');
        if (openArchiveBtn) {
            openArchiveBtn.addEventListener('click', () => {
                this.archiveOpenedFrom = 'mainMenu';
                if (this.mainMenu) this.mainMenu.classList.add('hidden');
                if (this.archiveMenu) {
                    this.archiveMenu.classList.remove('hidden');
                    this.archiveMenu.style.display = 'flex';
                    EventBus.emit('PLAY_SOUND', 'termOpen');
                }
                document.querySelectorAll('.archive-tab-btn').forEach(b => b.classList.remove('active'));
                let loreBtn = document.querySelector('.archive-tab-btn[data-category="lore"]');
                if (loreBtn) loreBtn.classList.add('active');
                this.currentArchiveCategory = 'lore';
                EventBus.emit('REQUEST_ARCHIVE_RENDER', { category: 'lore' });
            });
        }

        const tabArchiveIngameBtn = document.getElementById('tab-archive-ingame');
        if (tabArchiveIngameBtn) {
            tabArchiveIngameBtn.addEventListener('click', () => {
                this.archiveOpenedFrom = 'shopMenu';
                if (this.shopMenu) this.shopMenu.classList.add('hidden');
                if (this.archiveMenu) {
                    this.archiveMenu.classList.remove('hidden');
                    this.archiveMenu.style.display = 'flex';
                    EventBus.emit('PLAY_SOUND', 'termOpen');
                }
                document.querySelectorAll('.archive-tab-btn').forEach(b => b.classList.remove('active'));
                let loreBtn = document.querySelector('.archive-tab-btn[data-category="lore"]');
                if (loreBtn) loreBtn.classList.add('active');
                this.currentArchiveCategory = 'lore';
                EventBus.emit('REQUEST_ARCHIVE_RENDER', { category: 'lore' });
            });
        }

        const archiveCloseElement = document.getElementById('close-archive-btn');
        if (archiveCloseElement) {
            archiveCloseElement.addEventListener('click', () => {
                this.stopLoreAudio();
                clearInterval(this.typeInterval);
                if (this.archiveMenu) {
                    this.archiveMenu.classList.add('hidden');
                    this.archiveMenu.style.display = 'none';
                }
                if (this.archiveOpenedFrom === 'mainMenu' && this.mainMenu) {
                    this.mainMenu.classList.remove('hidden');
                } else if (this.archiveOpenedFrom === 'shopMenu' && this.shopMenu) {
                    this.shopMenu.classList.remove('hidden');
                } else if (this.archiveOpenedFrom === 'pauseMenu') {
                    document.getElementById('pause-menu').classList.remove('hidden');
                }
            });
        }

        // Fényképnagyító globális hivatkozás
        window.openLightbox = (url) => {
            const lightboxImg = document.getElementById('lightbox-img');
            const lightboxOverlay = document.getElementById('lightbox-overlay');
            if (lightboxImg && lightboxOverlay) {
                lightboxImg.src = url;
                lightboxOverlay.style.display = 'flex';
            }
        };
        window.closeLightbox = () => {
            const lightboxOverlay = document.getElementById('lightbox-overlay');
            if (lightboxOverlay) lightboxOverlay.style.display = 'none';
        };
    }

    stopLoreAudio() {
        if (this.loreAudio) {
            this.loreAudio.pause();
            this.loreAudio.currentTime = 0;
            this.loreAudio = null;
        }
    }

    playLoreAudio(url) {
        this.stopLoreAudio();
        if (url && typeof url === 'string' && url.trim() !== '' && !url.includes('Helyorzo') && !url.startsWith('audio_log_')) {
            this.loreAudio = new Audio(url);
            this.loreAudio.volume = 0.8;
            this.loreAudio.play().catch(e => console.warn("Lore audio play blocked:", e));
        }
    }

    _renderArchiveList(category) {
        if (!this.archiveList || !this.archiveContent) return;
        this.archiveList.innerHTML = '';
        this.archiveContent.innerHTML = "<div style='text-align:center; color:#005555; margin-top:20px;'>Válasszon ki egy bejegyzést a dekódoláshoz.</div>";
        this.stopLoreAudio();

        let dataArray = OmniCorpDatabase[category];
        if (dataArray && Array.isArray(dataArray)) {
            dataArray.forEach(item => {
                let isUnlocked = item.checkUnlock ? item.checkUnlock() : true;
                let statText = item.statInfo ? item.statInfo() : null;
                let actualText = typeof item.text === 'function' ? item.text() : item.text;

                this.createArchiveButton({
                    isUnlocked: isUnlocked,
                    title: item.title,
                    audioUrl: item.audio,
                    imageUrl: item.image,
                    statText: statText,
                    text: actualText,
                    reqText: item.requirementText
                });
            });
        }
    }

    createArchiveButton(item) {
        const btn = document.createElement('button');
        btn.className = 'archive-entry-btn';

        if (item.isUnlocked) {
            btn.innerText = item.title;
            btn.onclick = () => {
                document.querySelectorAll('.archive-entry-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (item.audioUrl) {
                    this.playLoreAudio(item.audioUrl);
                } else {
                    this.stopLoreAudio();
                }

                let contentHTML = "";
                if (item.imageUrl) {
                    contentHTML += `<div style="display: flex; justify-content: center; margin-bottom: 25px;">
                                       <img src="${item.imageUrl}" onclick="openLightbox('${item.imageUrl}')" style="cursor: pointer; max-width: 100%; max-height: 400px; width: auto; border: 2px solid #00ffff; box-shadow: 0 0 20px rgba(0, 255, 255, 0.4); border-radius: 5px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                                    </div>`;
                }
                if (item.statText) {
                    contentHTML += `<div style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; max-width: 250px; min-height: 180px; margin: 0 auto 25px auto; background: rgba(0, 20, 20, 0.6); padding: 15px; border: 1px solid #00ffff; border-radius: 5px; box-shadow: inset 0 0 15px rgba(0,255,255,0.1);">
                                        ${item.statText}
                                    </div>`;
                }

                contentHTML += `<div id="typing-text"></div>`;
                this.archiveContent.innerHTML = contentHTML;

                let typeTarget = document.getElementById('typing-text');
                let i = 0;
                clearInterval(this.typeInterval);
                let typeSpeed = item.text.length > 500 ? 5 : 15;
                this.typeInterval = setInterval(() => {
                    let char = item.text.charAt(i);
                    if (char === '\n') typeTarget.innerHTML += '<br>';
                    else typeTarget.innerHTML += char;
                    i++;
                    if (i >= item.text.length) clearInterval(this.typeInterval);
                }, typeSpeed);
            };
        } else {
            btn.classList.add('locked');
            btn.innerText = "██████ [ZÁROLVA]";
            btn.onclick = () => {
                document.querySelectorAll('.archive-entry-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.stopLoreAudio();
                clearInterval(this.typeInterval);
                this.archiveContent.innerHTML = `
                    <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; min-height: 350px; text-align: center; white-space: normal;">
                        <div style="color: #ff0000; font-size: 32px; font-weight: bold; text-shadow: 0 0 15px rgba(255,0,0,0.8); margin-bottom: 20px; letter-spacing: 2px;">
                            BELÉPÉS MEGTAGADVA
                        </div>
                        <div style="color: #ff5555; font-size: 20px; margin-bottom: 30px;">
                            BIZTONSÁGI SZINT ELÉGTELEN.
                        </div>
                        <div style="color: #aaa; font-size: 16px; max-width: 80%; line-height: 1.5; border-top: 1px dashed #550000; padding-top: 20px;">
                            ${item.reqText}
                        </div>
                    </div>
                `;
            };
        }
        this.archiveList.appendChild(btn);
    }

    // ==========================================
    // DIREKTÍVÁK LOGIKA
    // ==========================================
    _setupDirectivesMenu() {
        const omniOpenDirBtn = document.getElementById('open-directives-btn');
        if (omniOpenDirBtn) {
            omniOpenDirBtn.addEventListener('click', () => {
                this.omniDirOpenedFrom = 'mainMenu';
                if (this.mainMenu) this.mainMenu.classList.add('hidden');
                if (this.omniDirMenu) {
                    this.omniDirMenu.classList.remove('hidden');
                    this.omniDirMenu.style.display = 'flex';
                    EventBus.emit('PLAY_SOUND', 'termOpen');
                }
                EventBus.emit('REQUEST_DIRECTIVES_RENDER', { tier: 'info' });
            });
        }

        const omniCloseDirBtn = document.getElementById('close-directives-btn');
        if (omniCloseDirBtn) {
            omniCloseDirBtn.addEventListener('click', () => {
                EventBus.emit('PLAY_SOUND', 'termClose');
                if (this.omniDirMenu) {
                    this.omniDirMenu.classList.add('hidden');
                    this.omniDirMenu.style.display = 'none';
                }
                if (this.omniDirOpenedFrom === 'mainMenu' && this.mainMenu) {
                    this.mainMenu.classList.remove('hidden');
                } else if (this.omniDirOpenedFrom === 'shopMenu' && this.shopMenu) {
                    this.shopMenu.classList.remove('hidden');
                    EventBus.emit('REQUEST_SHOP_UPDATE');
                } else if (this.omniDirOpenedFrom === 'pauseMenu') {
                    const pauseMenu = document.getElementById('pause-menu');
                    if (pauseMenu) pauseMenu.classList.remove('hidden');
                }
            });
        }

        document.querySelectorAll('.dir-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.dir-tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.omniCurrentDirTier = e.target.getAttribute('data-tier');
                EventBus.emit('REQUEST_DIRECTIVES_RENDER', { tier: this.omniCurrentDirTier });
            });
        });

        // Globális hívások a HTML onclick-hez (Ez szükséges a string-alapú HTML-hez!)
        window.acceptDirective = (id) => EventBus.emit('ACCEPT_DIRECTIVE', id);
        window.abandonDirective = () => {
            const overlay = document.getElementById('confirm-abandon-overlay');
            if (overlay) overlay.style.display = 'flex';
        };
        window.cancelAbandon = () => {
            const overlay = document.getElementById('confirm-abandon-overlay');
            if (overlay) overlay.style.display = 'none';
        };
        window.executeAbandon = () => {
            const overlay = document.getElementById('confirm-abandon-overlay');
            if (overlay) overlay.style.display = 'none';
            EventBus.emit('EXECUTE_ABANDON_DIRECTIVE');
        };
    }

    _renderDirectivesData(tier) {
        if (tier === 'info') {
            this.renderDirectivesTab({ tier: 'info' });
            return;
        }

        let isUnlocked = true;
        let lockReasonKronos = "";
        let lockReasonGallagher = "";

        if (tier === 'tier2' && playerStats.uploadedDataPackets < 3) {
            isUnlocked = false;
            lockReasonKronos = "BÉTA SZEKTOR ELÉRÉSÉHEZ MIN. 3 DB FELTÖLTÖTT ADATCSOMAG SZÜKSÉGES.";
            lockReasonGallagher = "Még nem bízik benned a gép. Kell neki még adat. Végezz el több Tier 1-es feladatot!";
        }
        if (tier === 'tier3' && playerStats.uploadedDataPackets < 10) {
            isUnlocked = false;
            lockReasonKronos = "OMEGA SZEKTOR ELÉRÉSÉHEZ MIN. 10 DB FELTÖLTÖTT ADATCSOMAG SZÜKSÉGES.";
            lockReasonGallagher = "Az OMEGA szintre nem enged be. Szerezz még több adatot, és próbálom áttörni a tűzfalat!";
        }

        let directives = [];
        if (isUnlocked && OmniCorpDirectives[tier]) {
            directives = OmniCorpDirectives[tier].map(d => {
                return {
                    id: d.id,
                    title: d.title,
                    desc: d.desc,
                    reward: d.reward,
                    goal: d.goal,
                    isCompleted: playerStats.completedDirectives.includes(d.id),
                    isAbandoned: playerStats.abandonedDirectives.includes(d.id),
                    isActive: (playerStats.activeDirective === d.id)
                };
            });
        }

        this.renderDirectivesTab({
            tier: tier,
            isTierUnlocked: isUnlocked,
            lockReasonKronos: lockReasonKronos,
            lockReasonGallagher: lockReasonGallagher,
            directives: directives,
            playerProgress: playerStats.directiveProgress
        });
    }

    renderDirectivesTab(data) {
        if (!this.omniDirContent) return;
        this.omniDirContent.innerHTML = '';
        const tier = data.tier;

        const dirHeader = document.querySelector('#directives-menu .terminal-header');
        const dirSub = document.querySelector('#directives-menu .terminal-sub');
        if (dirHeader) dirHeader.innerText = "KRONOS TELEMETRIAI RENDSZER";
        if (dirSub) dirSub.innerText = "TERMINUS BÁNYÁSZATI ÉS KUTATÓÁLLOMÁS";

        if (tier === 'info') {
            this.omniDirContent.innerHTML = `
                <div style="display: flex; gap: 20px;">
                    <div style="flex: 1;">
                        <img src="https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/lore_kronos.jpeg" style="width: 100%; border: 2px solid #00ffff; box-shadow: 0 0 15px rgba(0,255,255,0.3); border-radius: 5px;">
                    </div>
                    <div style="flex: 2; color:#e0ffff; font-size:16px; line-height:1.6; font-family: 'Share Tech Mono', monospace;">
                        <h3 style="color:#00ffff; margin-bottom: 5px; margin-top: 0;">[ RENDSZERÜZENET ]</h3>
                        <span style="color:#00ffff; font-weight:bold;">KRONOS AI:</span> A Terminus Állomás lezárása aktív. A zsilipkapuk feloldásához a protokoll harci telemetriát követel a Verdant anomáliákról. A sikeres adatszerzésért a rendszer túlélési csomagokat (CR) hagy jóvá.<br><br>
                        <span style="color:#ffaa00; font-weight:bold;">GALLAGHER:</span> "ECHO, én vagyok az! A gép megőrült. Nem enged tovább a szektorokban, amíg nem hajtod végre a 'tesztjeit'. Próbálom meghekkelni a kvótákat a vezérlőből, hogy túlélhesd. Végezd el a feladatokat, és kinyitom a következő ajtót!"<br><br>
                        <span style="color:#ff5555; font-weight: bold;">KRONOS BIZTONSÁGI RENDSZER:</span> Egy folyamatban lévő protokoll megszakítása a szerződés végleges törlését vonja maga után. A Mélyszinti szektorok (BÉTA, OMEGA) kizárólag megfelelő mennyiségű adat feltöltése után nyílnak meg.
                    </div>
                </div>
                
                <div style="margin-top: 30px; border: 1px solid #00ffff; padding: 15px; background: rgba(0,30,30,0.6); box-shadow: inset 0 0 10px rgba(0,255,255,0.1);">
                    <h4 style="color:#fff; margin-bottom:10px; margin-top:0;">KRONOS ADATKAPCSOLAT: FOLYAMATBAN LÉVŐ TESZT</h4>
                    <div id="active-dir-display"></div>
                </div>
            `;
            this.renderActiveDirectiveBox(data);
            return;
        }

        if (!data.isTierUnlocked) {
            this.omniDirContent.innerHTML = `
                <div style="text-align: center; margin-top: 50px; font-family: 'Share Tech Mono', monospace;">
                    <span style="color:#f00; font-size: 28px; font-weight: bold; text-shadow: 0 0 15px #f00;">ZSILIP ZÁROLVA</span><br><br>
                    <span style="color:#ff5555; font-size: 18px;">[ KRONOS AI ]: EZ A SZEKTOR JELENLEG TITKOSÍTVA VAN.</span><br><br>
                    <span style="color:#aaa; font-size: 14px;">${data.lockReasonKronos}</span><br><br>
                    <div style="margin-top: 30px; padding: 15px; border-top: 1px dashed #ffaa00; display: inline-block; max-width: 80%;">
                        <span style="color:#ffaa00; font-style: italic;">GALLAGHER: ${data.lockReasonGallagher}</span>
                    </div>
                </div>`;
            return;
        }

        let listHTML = `<div style="display:flex; flex-direction:column; gap:15px;">`;
        data.directives.forEach(d => {
            let statusText = "";
            let bgColor = "rgba(30, 20, 0, 0.7)";
            let btnHTML = "";

            if (d.isCompleted) {
                statusText = `<span style="color:#00ff00; font-weight:bold; float:right;">[ ADAT ELKÜLDVE ]</span>`;
                bgColor = "rgba(0, 50, 50, 0.4)";
            } else if (d.isAbandoned) {
                statusText = `<span style="color:#ff5555; font-weight:bold; float:right;">[ PROTOKOLL TÖRÖLVE ]</span>`;
                bgColor = "rgba(50, 0, 0, 0.4)";
            } else if (d.isActive) {
                statusText = `<span style="color:#00ffff; font-weight:bold; float:right;">[ ELEMZÉS: ${data.playerProgress} / ${d.goal} ]</span>`;
                bgColor = "rgba(0, 60, 60, 0.8)";
                if (this.omniDirOpenedFrom === 'pauseMenu') {
                    btnHTML = `<div style="position: absolute; right: 15px; bottom: 15px; color: #ff5555; font-size: 12px; font-weight: bold; border: 1px solid #ff5555; padding: 5px;">[ MÓDOSÍTÁS LETILTVA: HARC FOLYAMATBAN ]</div>`;
                } else {
                    btnHTML = `<button class="directive-action-btn abandon-directive" onclick="abandonDirective()">TESZT MEGSZAKÍTÁSA</button>`;
                }
            } else {
                if (this.omniDirOpenedFrom === 'pauseMenu') {
                    btnHTML = `<div style="position: absolute; right: 15px; bottom: 15px; color: #888; font-size: 12px; font-weight: bold; border: 1px solid #555; padding: 5px;">[ KIVÁLASZTÁS LETILTVA: HARC FOLYAMATBAN ]</div>`;
                } else {
                    btnHTML = `<button class="directive-action-btn accept-directive" onclick="acceptDirective('${d.id}')">PROTOKOLL INDÍTÁSA</button>`;
                }
            }

            listHTML += `
                <div class="directive-card" style="background: ${bgColor}; padding: 15px; border: 1px solid #00ffff; position: relative;">
                    ${statusText}
                    <h4>${d.title}</h4>
                    <p>${d.desc}</p>
                    <div class="reward">JÓVÁHAGYOTT TÚLÉLÉSI KERET: ${d.reward} CR</div>
                    ${btnHTML}
                </div>
            `;
        });
        listHTML += `</div>`;
        this.omniDirContent.innerHTML = listHTML;
    }

    renderActiveDirectiveBox(data) {
        let target = document.getElementById('active-dir-display');
        if (!target) return;
        if (!data.activeDirective) {
            target.innerHTML = `<span style="color:#888;">Nincs aktív telemetriai kapcsolat. Indítson el egy tesztet a szintek fülön!</span>`;
            return;
        }
        if (data.directiveData) {
            target.innerHTML = `
                <div style="color:#00ffff; font-size: 20px;">${data.directiveData.title}</div>
                <div style="color:#ccc; margin-top: 10px; margin-bottom: 10px;">${data.directiveData.desc}</div>
                <div style="color:#ffaa00; font-weight:bold; border-top: 1px dashed #005555; padding-top: 10px;">ADATFELDOLGOZÁS: ${data.playerProgress} / ${data.directiveData.goal}</div>
            `;
        }
    }
}

export default new UIManager();
