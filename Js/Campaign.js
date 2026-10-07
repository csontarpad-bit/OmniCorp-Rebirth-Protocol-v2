export const sectorGateFloors = [31, 61, 101];
export const caveFloor = 102;
export const finalFloor = 102;

export function getCampaignFloorInfo(floor) {
    const safeFloor = Math.min(finalFloor, Math.max(1, Math.floor(floor)));
    // A szektorhatár-szintek (31., 61., 101.) még a régi szektor pályalifthez tartoznak
    const sector = safeFloor <= 31
        ? { id: 'alpha', name: 'ALPHA', range: '1–31', color: 0x00ff99 }
        : safeFloor <= 61
            ? { id: 'beta', name: 'BÉTA', range: '32–61', color: 0xff9b32 }
            : { id: 'omega', name: 'OMEGA', range: '62–101', color: 0xff3048 };

    return {
        floor: safeFloor,
        sector,
        isResearchFloor: safeFloor % 10 === 0 && safeFloor <= 100,
        isCaveFloor: safeFloor === caveFloor,
        isSectorGate: sectorGateFloors.includes(safeFloor),
        isFinalGate: safeFloor === 101,
        bossCount: safeFloor === caveFloor ? 3 : 0,
        nodeBossCount: safeFloor === 31 ? 1 : safeFloor === 61 ? 2 : safeFloor === 101 ? 1 : 0
    };
}

export const researchHubStations = [
    { id: 'armory', label: 'FEGYVERÉSZET', x: 0, z: -39, color: 0xffb347 },
    { id: 'augmentation', label: 'MODIFIKÁCIÓ', x: 39, z: 0, color: 0x00d9ff },
    { id: 'regeneration', label: 'REGENERÁCIÓ', x: 0, z: 39, color: 0x49bfff },
    { id: 'comms', label: 'KOMMUNIKÁCIÓ', x: -39, z: 0, color: 0xff4f70 }
];

// Szektorhatár-szintek (31., 61., 101.): nyugati folyosó -> kapu -> szerverterem -> feloldó terminál -> kijárati folyosó.
// Minden távolság a központi aréna közepétől mért, nyugat (-X) felé.
export const researchNodeSection = {
    corridorStart: 26,
    gateDistance: 46,
    roomEndDistance: 76,
    exitCorridorEnd: 96,
    liftEndDistance: 110,
    corridorHalfWidth: 3.2,
    roomHalfWidth: 12,
    lockDistance: 50,
    bossDistance: 68,
    terminalDistance: 74.7,
    terminalZ: 8,
    terminalStation: { x: -73, z: 8 }
};

export const nodeUnlockStation = { id: 'unlock', label: 'KRONOS ZÁR // FELOLDÁS', ...researchNodeSection.terminalStation, color: 0x00d9ff };

export function isInResearchNodeRoom(x, z) {
    const s = researchNodeSection;
    return -x > s.gateDistance + 0.3 && -x < s.roomEndDistance && Math.abs(z) < s.roomHalfWidth;
}

// A szektor-aréna közepe: a falvastagsággal (2 m) és a félszélességgel (25 m) a folyosó végétől
export const sectorHallCenter = researchNodeSection.liftEndDistance + 27;

export function getResearchHubStationAt(position, maxDistance = 2.5, stations = researchHubStations) {
    let closest = null;
    let closestDistance = maxDistance;
    for (const station of stations) {
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
    80: { signal: 'TORZ', mood: 'glitch', text: 'ECHO... *köhögés* A gépnek igaza volt. Én is a hálózat része vagyok már. De még tartom az ajtót a Maghoz. Vedd fel a Revolvert az asztalról.' },
    90: { signal: 'TORZ', mood: 'glitch', text: 'A Mag közel van. A 101. szinten az utolsó szerverterem vár, és ott... nem a Node áll az utadban. Én leszek az. Bocsáss meg előre.' },
    100: { signal: 'MEGSZAKADT', mood: 'glitch', text: 'A 101-es szerverteremben várlak, ECHO. Az az utolsó zár. Utána már csak a Mag barlangja marad.' }
};
