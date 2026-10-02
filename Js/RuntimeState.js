export const playerStats = {
    kills: {
        normal: { body: 0, head: 0 },
        runner: { body: 0, head: 0 },
        tank: { body: 0, head: 0 },
        stalker: { body: 0, head: 0 },
        crawler: { body: 0, head: 0 },
        boss: { body: 0, head: 0 },
        alpha: { body: 0, head: 0 }
    },
    plantsDestroyed: 0,
    wavesSurvived: 0,
    totalDataGathered: 0,
    weaponsBought: { shotgun: false, rifle: false, super: false },
    skillsBought: 0,
    activeDirective: null,
    directiveProgress: 0,
    completedDirectives: [],
    abandonedDirectives: [],
    pendingDataPackets: 0,
    uploadedDataPackets: 0
};

export function loadPlayerStats() {
    const savedValue = localStorage.getItem('OmniCorpStats');
    if (!savedValue) return;
    try {
        const savedStats = JSON.parse(savedValue);
        if (savedStats && typeof savedStats === 'object') {
            for (const key in savedStats) {
                if (typeof savedStats[key] === 'object' && savedStats[key] !== null && playerStats[key]) {
                    Object.assign(playerStats[key], savedStats[key]);
                } else {
                    playerStats[key] = savedStats[key];
                }
            }
        }
        playerStats.activeDirective = null;
        playerStats.directiveProgress = 0;
        playerStats.completedDirectives = [];
        playerStats.abandonedDirectives = [];
    } catch (error) {
        console.warn('Sérült mentés törlése...', error);
        localStorage.removeItem('OmniCorpStats');
    }
}

export function savePlayerStats() {
    localStorage.setItem('OmniCorpStats', JSON.stringify(playerStats));
}

export function getResearchLevel() {
    return playerStats.uploadedDataPackets || 0;
}

export function getDamageBoost() {
    return 1.0 + (playerStats.uploadedDataPackets || 0) * 0.05;
}
