import { playerStats } from './RuntimeState.js';

export function generateEnemyStatHTML(enemyType) {
    const stats = playerStats.kills[enemyType];
    if (!stats) return '';
    const activeBoost = Math.floor(playerStats.uploadedDataPackets * 5);

    return `<div style="display: flex; justify-content: space-between; align-items: center; height: 100%; font-size: 14px; line-height: 1.2;">
                <div style="flex: 1; text-align: left; padding-right: 10px; border-right: 1px solid #005555;">
                    <div style="color:#00ffff; margin-bottom: 5px;">NEURÁLIS SZINKRON:<br><span style="color:#fff; font-weight:bold; font-size:16px;">LVL ${playerStats.uploadedDataPackets}</span></div>
                    <div style="color:#ffaa00;">HARCI OPTIMALIZÁCIÓ:<br><span style="color:#fff; font-weight:bold; font-size:16px;">+${activeBoost}% SEBZÉS</span></div>
                </div>
                <div style="flex: 1; text-align: right; padding-left: 10px;">
                    <div style="color:#aaa; margin-bottom: 5px; font-size:11px;">(Szerveren várakozó adatok: <span style="color:#ffcc00;">${playerStats.pendingDataPackets} db</span>)</div>
                    <div style="color:#888; margin-bottom: 2px;">TESTLÖVÉS: <span style="color:#fff;">${stats.body}</span></div>
                    <div style="color:#ff0000; margin-bottom: 2px;">FEJLÖVÉS: <span style="color:#fff; font-weight:bold;">${stats.head}</span></div>
                </div>
            </div>`;
}

export function renderArchiveStatHTML(templateId, { playerStats, weapons, skills }) {
    const enemyTypes = ['normal', 'runner', 'tank', 'stalker', 'crawler', 'boss', 'alpha'];
    if (enemyTypes.includes(templateId)) return generateEnemyStatHTML(templateId);

    const templates = {
        incident_closed: () => `<div style="text-align:center; color:#ff0000; font-weight:bold;">INCIDENS LEZÁRVA<br>VESZTESÉG: 100%</div>`,
        shield_green: () => `<div style="text-align:center;">VÉDELMI POTENCIÁL: 20% PAJZS</div>`,
        shield_yellow: () => `<div style="text-align:center;">VÉDELMI POTENCIÁL: 50% PAJZS</div>`,
        shield_red: () => `<div style="text-align:center;">VÉDELMI POTENCIÁL: 80% PAJZS</div>`,
        plant: () => `<div style="text-align:center;">MEGSEMMISÍTETT PÉLDÁNYOK: ${playerStats.plantsDestroyed} db</div>`,
        weapon_pistol: () => weaponLevel('pistol'),
        weapon_shotgun: () => weaponLevel('shotgun'),
        weapon_rifle: () => weaponLevel('rifle'),
        weapon_super: () => weaponLevel('super'),
        skill_maxHealth: () => skillLevel('maxHealth'),
        skill_speed: () => skillLevel('speed'),
        skill_ammoLoot: () => skillLevel('ammoLoot'),
        skill_healthLoot: () => skillLevel('healthLoot'),
        skill_revive: () => `<div style="text-align:center;">RAKTÁRON LÉVŐ MODUL: ${skills.revive.level} DB</div>`,
        skill_freeze: () => `<div style="text-align:center;">LICENC SZINT:<br>${skills.freeze.level} / 5. SZINT</div>`,
        resonator: () => `<div style="text-align:center;">HATÓSUGÁR: 5 MÉTER<br>PUSZTÍTÓ ERŐ: EXTRÉM<br><span style="color:#ff5555; font-size:12px;">MAX KAPACITÁS: 1 DB</span></div>`,
        neural_link: () => {
            const boost = playerStats.uploadedDataPackets * 5;
            return `<div style="text-align:center; color:#ff00ff; text-shadow: 0 0 10px #ff00ff;">AKTÍV HARCI OPTIMALIZÁCIÓ:<br><span style="font-size:24px; font-weight:bold; color:#fff;">+${boost}% SEBZÉS</span></div>`;
        }
    };
    const render = templates[templateId];
    return render ? render() : null;

    function weaponLevel(weaponId) {
        return `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${weapons[weaponId].level} / 5. SZINT</div>`;
    }

    function skillLevel(skillId) {
        return `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${skills[skillId].level} / 5. SZINT</div>`;
    }
}
