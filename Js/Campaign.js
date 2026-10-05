export function getCampaignFloorInfo(floor) {
    const safeFloor = Math.min(100, Math.max(1, Math.floor(floor)));
    const sector = safeFloor <= 30
        ? { id: 'alpha', name: 'ALPHA', range: '0–30', color: 0x00ff99 }
        : safeFloor <= 60
            ? { id: 'beta', name: 'BÉTA', range: '31–60', color: 0xff9b32 }
            : { id: 'omega', name: 'OMEGA', range: '61–100', color: 0xff3048 };

    return {
        floor: safeFloor,
        sector,
        isResearchFloor: safeFloor % 10 === 0,
        bossCount: safeFloor === 30 ? 1 : safeFloor === 60 ? 2 : safeFloor === 100 ? 3 : 0
    };
}

export const researchHubStations = [
    { id: 'armory', label: 'FEGYVERÉSZET', x: 0, z: -39, color: 0xffb347 },
    { id: 'augmentation', label: 'MODIFIKÁCIÓ', x: 39, z: 0, color: 0x00d9ff },
    { id: 'regeneration', label: 'REGENERÁCIÓ', x: 0, z: 39, color: 0x49bfff },
    { id: 'comms', label: 'KOMMUNIKÁCIÓ', x: -39, z: 0, color: 0xff4f70 }
];

export function getResearchHubStationAt(position, maxDistance = 2.5) {
    let closest = null;
    let closestDistance = maxDistance;
    for (const station of researchHubStations) {
        const distance = Math.hypot(position.x - station.x, position.z - station.z);
        if (distance <= closestDistance) {
            closest = station;
            closestDistance = distance;
        }
    }
    return closest;
}

export const researchCommsLog = {
    10: { signal: 'TISZTA', mood: 'calm', text: 'ECHO, működik! Ezekben a laborokban a KRONOS nem lát minket. Fejleszd a fegyverzeted, és ha megsérültél, a Regenerációs Kamra kimossa a spórát a véredből. Maradj tiszta!' },
    20: { signal: 'TISZTA', mood: 'calm', text: 'A KRONOS kamerái sorra elnémulnak az Alpha szektorban. Jó jel, de ne bízd el magad: a következő szint alján a szerverterem már vár rád.' },
    30: { signal: 'ERŐS', mood: 'calm', text: 'A védelmi csomópont aktív az alsó szerverteremben. A zsilipkulcsot csak a Node után szerezheted meg. Töltsd fel a készleteidet, mielőtt lemész.' },
    40: { signal: 'GYENGE', mood: 'tired', text: 'A Béta szektorban már látom, ahogy a gomba felemészti a kamerákat. A teherakna fertőzött, ne maradj sokáig egy helyben.' },
    50: { signal: 'GYENGE', mood: 'tired', text: 'Nehezedik a helyzet... *köhögés* Valami bejutott a szellőzőmbe. A Regenerációs Kamrák odalent már nem működnek, csak a te szinteden. Használd ki!' },
    60: { signal: 'ZAVAROS', mood: 'tired', text: 'Két Nexus Node védi a következő zsilipet. Ne hagyd, hogy bekerítsenek. Siess, ECHO... nincs sok időm.' },
    70: { signal: 'ZAVAROS', mood: 'glitch', text: 'A Kaptártudat már a falakon keresztül is figyel. Hallom, ahogy kattog a vezetékekben... Maradj tiszta, bármi áron.' },
    80: { signal: 'TORZ', mood: 'glitch', text: 'ECHO... *köhögés* A gépnek igaza volt. Én is a hálózat része vagyok már. De még tartom az ajtót a Maghoz. Vedd fel a Szuper Fegyvert az asztalról.' },
    90: { signal: 'TORZ', mood: 'glitch', text: 'A Mag közel van. A következő megálló lesz az utolsó. Három Node tartja zárva a kaput. Lőjj át mindenen... rajtam is.' },
    100: { signal: 'MEGSZAKADT', mood: 'glitch', text: 'Három Node tartja zárva a Magot. ECHO... fejezd be. Öld meg a Nexust.' }
};
