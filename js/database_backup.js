// ==========================================
// OMNICORP ADATBÁZIS ÉS JÁTÉKOS STATISZTIKÁK
// (ECHO-PROTOKOLL / TERMINUS ÁLLOMÁS)
// ==========================================

var playerStats = {
    kills: { 
        normal:  { body: 0, head: 0 }, 
        runner:  { body: 0, head: 0 }, 
        tank:    { body: 0, head: 0 }, 
        stalker: { body: 0, head: 0 }, 
        crawler: { body: 0, head: 0 }, 
        boss:    { body: 0, head: 0 }, 
        alpha:   { body: 0, head: 0 } 
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
    abandonedDirectives: [],
    pendingDataPackets: 0,  // ÚJ: A szerveren várakozó, még le nem töltött adatok
    uploadedDataPackets: 0  // ÚJ: Az agyadba már letöltött, aktív harci bónuszok
 
};

if (localStorage.getItem('OmniCorpStats')) {
    try {
        let savedStats = JSON.parse(localStorage.getItem('OmniCorpStats'));
        if (savedStats && typeof savedStats === 'object') {
            for (let key in savedStats) {
                if (typeof savedStats[key] === 'object' && savedStats[key] !== null && playerStats[key]) {
                    Object.assign(playerStats[key], savedStats[key]);
                } else {
                    playerStats[key] = savedStats[key];
                }
            }
        }
        
        // --- ÚJ: DIREKTÍVÁK NULLÁZÁSA MINDEN INDÍTÁSKOR ---
        // Bár betölti a mentést (fegyverek, kódex), a küldetéseket szándékosan töröljük!
        playerStats.activeDirective = null;
        playerStats.directiveProgress = 0;
        playerStats.completedDirectives = [];
        playerStats.abandonedDirectives = [];
        // --------------------------------------------------
        
    } catch(e) { 
        console.warn("Sérült mentés törlése..."); 
        localStorage.removeItem('OmniCorpStats'); 
    }
}

window.savePlayerStats = function() {
    localStorage.setItem('OmniCorpStats', JSON.stringify(playerStats));
}

// Ezt a régi kill-alapú számolót lecseréljük a Neurális szintre!
window.getResearchLevel = function() {
    return playerStats.uploadedDataPackets; // Minden letöltött csomag = 1 szint
}

// A globális sebzés bónusz kiszámolása (Csomagonként +5%)
window.getDamageBoost = function() {
    // Minden letöltött adatcsomag +5% (0.05) szorzót ad a fegyverek sebzéséhez!
    let boost = 1.0 + (playerStats.uploadedDataPackets * 0.05);
    return boost; 
}

// A Kódex statisztikai dobozának vizuális átírása
function generateEnemyStatHTML(enemyType) {
    let body = playerStats.kills[enemyType].body;
    let head = playerStats.kills[enemyType].head;
    let total = body + head;
    
    let activeBoost = Math.floor(playerStats.uploadedDataPackets * 5); // %-ban
    let pending = playerStats.pendingDataPackets;
    
    return `<div style="display: flex; justify-content: space-between; align-items: center; height: 100%; font-size: 14px; line-height: 1.2;">
                <div style="flex: 1; text-align: left; padding-right: 10px; border-right: 1px solid #005555;">
                    <div style="color:#00ffff; margin-bottom: 5px;">NEURÁLIS SZINKRON:<br><span style="color:#fff; font-weight:bold; font-size:16px;">LVL ${playerStats.uploadedDataPackets}</span></div>
                    <div style="color:#ffaa00;">HARCI OPTIMALIZÁCIÓ:<br><span style="color:#fff; font-weight:bold; font-size:16px;">+${activeBoost}% SEBZÉS</span></div>
                </div>
                <div style="flex: 1; text-align: right; padding-left: 10px;">
                    <div style="color:#aaa; margin-bottom: 5px; font-size:11px;">(Szerveren várakozó adatok: <span style="color:#ffcc00;">${pending} db</span>)</div>
                    <div style="color:#888; margin-bottom: 2px;">TESTLÖVÉS: <span style="color:#fff;">${body}</span></div>
                    <div style="color:#ff0000; margin-bottom: 2px;">FEJLÖVÉS: <span style="color:#fff; font-weight:bold;">${head}</span></div>
                </div>
            </div>`;
}

function generateEnemyStatHTML(enemyType) {
    let body = playerStats.kills[enemyType].body;
    let head = playerStats.kills[enemyType].head;
    let total = body + head;
    let rLevel = getResearchLevel(total);
    let boost = rLevel * 10;
    
    return `<div style="display: flex; justify-content: space-between; align-items: center; height: 100%; font-size: 14px; line-height: 1.2;">
                <div style="flex: 1; text-align: left; padding-right: 10px; border-right: 1px solid #005555;">
                    <div style="color:#00ffff; margin-bottom: 5px;">KUTATÁSI SZINT:<br><span style="color:#fff; font-weight:bold; font-size:16px;">${rLevel}/5</span></div>
                    <div style="color:#ffaa00;">SEBZÉS BÓNUSZ:<br><span style="color:#fff; font-weight:bold; font-size:16px;">+${boost}%</span></div>
                </div>
                <div style="flex: 1; text-align: right; padding-left: 10px;">
                    <div style="color:#888; margin-bottom: 5px;">TESTLÖVÉS: <span style="color:#fff;">${body}</span></div>
                    <div style="color:#ff0000; margin-bottom: 5px;">FEJLÖVÉS: <span style="color:#fff; font-weight:bold;">${head}</span></div>
                    <div style="color:#00ff00; border-top: 1px dashed #005555; padding-top: 5px;">ÖSSZESEN: <span style="color:#fff; font-weight:bold;">${total}</span></div>
                </div>
            </div>`;
}

// === AZ OMNICORP ADATBÁZIS ÉS KÓDEX ===
const OmniCorpDatabase = {
    // --- ÚJ, KIBŐVÍTETT LORE (TÖRTÉNET) FEJEZETEK ---
    lore: [
        {
            id: "lore_terminus",
            title: "01. A TERMINUS ÁLLOMÁS",
            unlocked: true,
            checkUnlock: () => true, // MINDIG NYITVA
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/5fcee7cf3f3f0e88f7fee28af836805a55f9490a/OmniCorp.jpeg",
            audio: "Helyorzo_Hang_URL_1.mp3", // Ide jön az ElevenLabs MP3 linked
            text: "KRONOS ARCHÍVUM // BIZTONSÁGI SZINT: ALFA // VÁLLALATI ÁTTEKINTÉS\n\nAz OmniCorp a globális ipar csúcsa, amelynek fejlődését nem korlátozza sem etika, sem jogi szabályozás. Legambiciózusabb vállalkozásuk a Terminus Állomás: egy 100 szintből álló, gigantikus földalatti városrendszer, amely egyben a legtitkosabb, ultra-mély geotermikus bányászati és kutatóállomásuk is. Létrehozásának célja a földkéreg olyan mély rétegeinek elérése volt, amelyeket a hagyományos ipar elérhetetlennek hitt. A bázis feladata kettős: a kimeríthetetlen energiát biztosító extrém geotermikus hőforrások kiaknázása, valamint a csak ezen a hihetetlen nyomáson formálódó ritkaföldfémek és ásványi kristályok kitermelése.\n\nA komplexum egy önfenntartó ipari csoda. Nem csupán bányászati aknákból áll, hanem laboratóriumok, logisztikai hálózatok és feldolgozó üzemek teljes városnyi méretű hálózata. A kilométerekkel a felszín alatt uralkodó extrém körülmények – a pokoli hőmérséklet, a gyilkos sugárzás, a toxikus gázok és a megsemmisítő nyomás – azonban lehetetlenné tették az emberi munkaerő alkalmazását.\n\nA Vállalat megoldása a 'Project Rebirth' (ECHO-Protokoll) volt. A bázis alsó szektorában egy masszív, indusztriális klónozó részleget építettek ki. Az ide telepített tartályok futószalagon gyártották a mesterségesen növesztett, érzelemmentesített klónokat (ECHO egységeket), hogy elvégezzék a halálos munkát. A bányászat és az energiatermelés zavartalanul folyt... egészen addig, amíg a fúrószárak át nem törtek egy fosszilizálódottnak hitt, ősi kőzetréteget."
        },
        {
            id: "lore_discovery",
            title: "02. A VERDANT SPÓRA FELFEDEZÉSE",
            unlocked: true,
            checkUnlock: () => true, 
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/e3864cda4febf844f96e82b48b3319f699096caf/lore%20spore.jpeg",
            audio: "Helyorzo_Hang_URL_3.mp3", 
            text: "KRONOS ARCHÍVUM // KUTATÁSI JELENTÉS\n\nA legalsó rétegekben a fúrók egy ismeretlen, gomba-alapú organizmust fordítottak ki a kőzetből. Az OmniCorp elemzői a spórában (Kódnév: Verdant) az ipari csodaszert látták meg.\n\nKezdetben villámgyors 'hús-ragasztóként' használták a bányász-klónok sérüléseinek összezárására, valamint nyers idegi stimulánsként a termelés felpörgetésére. Később a biológiai hulladék lebontására is bevetették: a Verdant nem csupán felemésztette a selejtes klóntesteket, hanem a folyamat során egy rendkívül hasznos, szintetikus bio-alapanyagot állított elő. Ezt a Vállalat visszatermelte a legfelső szinten működő klónozó üzembe, megalkotva a tökéletes, zárt láncú újrahasznosítást.\n\nAmivel az elemzők nem számoltak, hogy a gomba a lebontás során asszimilálta a klónok idegrendszeri sejtjeit. Minden feldolgozott testtel egyre intelligensebbé vált. A sötétben lassan felépült egy decentralizált agy: a Kaptártudat (A Nexus)."
        },
        {
            id: "lore_recovery_unit",
            title: "03. BIO HARDVER",
            unlocked: true,
            checkUnlock: () => true, 
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/lore_recovery_unit.jpeg",
            audio: "Helyorzo_Hang_URL_2.mp3", 
            text: "KRONOS ARCHÍVUM // BIOLÓGIAI HARDVER RÉSZLEG\n\nAz etikai akadályokat a Vállalat egy jogi kiskapuval kerülte meg. A legfelső szinteken kialakított indusztriális klónozó részleg laborban növesztett testeket állított elő, amelyeket hivatalosan nem emberként, hanem 'Biológiai Hardverként' tartottak nyilván. Ezek voltak az ECHO egységek.\n\nA hagyományos bányász-klónok üres vázak voltak, minimális agyi funkciókkal, csak a gépek kezelésére kondicionálva. A hatékonyság és a fizikai teherbírás maximalizálása érdekében a testeket már a gyártósoron extrém ipari implantátumokkal – gerinc-gyorsítókkal és csontsűrítő anyagokkal – látták el. Mivel a mélyszinti munka során a sérülési és halálozási ráta 98%-os volt, a halott vagy selejtes klónokat egyszerűen az alsóbb szektorok gödreibe dobták, mint biológiai hulladékot."
        },
        {
            id: "lore_incident",
            title: "04. A NULLADIK NAP",
            unlocked: true,
            checkUnlock: () => true, // MINDIG NYITVA
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/7beb3d00c6c458083a4b37636d1949d8c2d03c3e/nulladik%20nap.jpeg",
            audio: "Helyorzo_Hang_URL_3.mp3",
            text: "KRONOS INCIDENS JELENTÉS // BIZTONSÁGI SZINT: OMEGA\n\nA katasztrófa csendes volt és azonnali. A hálózat a mélyben elérte a kritikus tömeget, és a Nexus öntudatra ébredt. A spóra áttörte a karantént. Mivel a klónok teste már telítve volt a szintetizált 'gyógyszerrel', a Kaptár egyetlen pillanat alatt átvette az uralmat minden ECHO egység és a megfertőzött emberi személyzet idegrendszere felett.\n\nA bázis kommunikációs csatornái azonnal elnémultak. A mutációk perceken belül torzították el a gazdatesteket. A Terminus Állomás több ezer dolgozója és klónja egyetlen összehangolt, kegyetlen mészárlás áldozata lett. A KRONOS AI a fertőzés észlelésekor azonnal lezárta a szektorokat, hermetikusan elzárva a bázist a külvilágtól. Mindenki csapdába esett."
        },
      {
            id: "lore_structure",
            title: "05. IZOLÁCIÓS BIZTONSÁGI PROTOKOLLOK",
            unlocked: true,
            checkUnlock: () => true, 
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/a5852dbcc94e37038a7e159bcfb79c703141bcd7/ORC.jpeg",
            audio: "Helyorzo_Hang_URL_5.mp3", 
            text: "KRONOS RENDSZERMAG // BIZTONSÁGI ALAPPROGRAM\n\nA fertőzés észlelésekor a KRONOS AI hermetikusan lezárta az állomást. A komplexum három szektorra (Alpha, Béta, Omega) oszlik, amelyeket masszív biztonsági zsilipek választanak el. Minden szektor alján egy KRONOS Szerverterem található. A zsilipeket csak az itt tárolt fizikai kulcsokkal lehet feloldani.\n\nA szinteket összekötő egyetlen funkcionáló logisztikai útvonal a központi Teherlift. A lift áthalad a Kutató és Fejlesztő (R&D) szinteken, amelyek elszigetelt laborokként működnek a káoszban.\n\nGALLAGHER MEGJEGYZÉSE: \"Figyelj rám! Jelenleg a legfelső szinten, a klónozó részlegben vagy. Onnan kell lejutnod a Maghoz. A KRONOS szándékosan vágta el az útvonalakat. A személyi liftek tönkrementek, a lépcsőházakban pedig több tízezer mutáns van. Ha kinyitod a vészkijáratot, másodpercek alatt elárasztanak és élve széttépnek.\n\nCsak a nagy teherszállító lift maradt. Ereszkedés közben az aknából rá fognak ugrani a platformra! Két hullám között a lift falán lévő mini-nyomtatóból tudsz alapszintű lőszert szerezni. De a komoly fegyverekhez (Sörétes, Modifikációk) ki kell bírnod, amíg a lift megáll a KRONOS vakfoltjain: az R&D Laborokban. Lépj be a liftbe, juss el a szerverteremig, öld meg a védelmezőjét, vedd el a kulcsot, és nyisd ki a következő zsilipet!\""
        },
        {
            id: "lore_gallagher",
            title: "06. GALLAGHER REDFIELD",
            unlocked: true,
            checkUnlock: () => true, // MINDIG NYITVA
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/lore_gallagher.jpeg",
            audio: "Helyorzo_Hang_URL_4.mp3",
            text: "Gallagher Redfield nem kutatóorvos volt, csupán a Terminus Állomás biztonsági és biometrikus főnöke. Kemény, gyakorlatias ember. A Nulladik Napon, amikor a Kaptár átvette az irányítást, ő volt az egyetlen, aki átlátta a helyzetet. Az utolsó pillanatban, mielőtt a gomba mindent elnyelt volna, magára zárta a Központi Irányító Terem páncélajtaját.\n\nSaját DNS-ével és biometrikus kulcsával a távolból feltörte a KRONOS klónozó protokollját, és átvette az irányítást a felső szinten lévő Klónozó-tartályok felett. A terve kétségbeesett: a vezérlőből ébresztett fel téged, abban a reményben, hogy elég erős leszel és eljutsz a Maghoz hogy elpusztítsd a Nexust. Gallagher egyedül van a sötétben, de az irányítóterem szellőzőrendszere lassan megadja magát a spóráknak. Az idő fogy."
        },
        {
            id: "lore_echo",
            title: "07. ECHO-001",
            unlocked: true,
            checkUnlock: () => true,
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/lore_echo.jpeg",
            audio: "Helyorzo_Hang_URL_5.mp3",
            text: "KRONOS ARCHÍVUM // PROJECT ECHO\n\nKRONOS ELEMZÉS: FIGYELMEZTETÉS! Illetéktelen biológiai anomália a klónozó szektorban. A Szintetikus Hardver protokoll megsértve. Az alany (ECHO-001) agykérgi aktivitása 870%-kal meghaladja a gyári korlátot. Illegális neurális-térkép szinkronizáció... [HIBA]... Részleges adatvesztés. Spontán szinapszis-újrahuzalozás észlelve.\n\nGALLAGHER MEGJEGYZÉSE: \"Hetvenkét nap, ECHO. Hetvenkét napig küzdöttem a KRONOS tűzfalaival, miközben a gomba a laborom falait kaparta. A standard bányász-klónok üresek, esélyük sem lenne. Megpróbáltam egy egy-az-egyben neurális lenyomatot csinálni a saját agyamról, és beletölteni a tiédbe... de a technológia nem erre való. Az inkubáció túl gyors volt, a sávszélesség pedig kevés.\n\nA másolás közben a rendszered összeomlott, az agyad pedig kétségbeesetten kezdte véletlenszerűen összekötni a leszakadt idegpályákat, hogy túléljen. Átment az izommemóriám, a fegyverkezelésem, talán egy-két homályos emlék... de a hézagokat te magad töltötted ki. A káoszból egy teljesen új elme született. Sok mindenben hasonlítunk, de nem a klónom vagy. Kicsit olyan, mintha a saját testvéremet hoztam volna létre a sötétben. Sajnálom, hogy ebbe a pokolba születtél, ECHO. De szükségem van rád.\""
        },
        {
            id: "lore_kronos",
            title: "08. KRONOS AI",
            unlocked: true,
            checkUnlock: () => true, // MINDIG NYITVA
            requirementText: "Alapértelmezett hozzáférés.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/lore_kronos.jpeg",
            audio: "Helyorzo_Hang_URL_5.mp3",
            text: "KRONOS RENDSZERMAG // BELSŐ MONOLÓG\n\nAz OmniCorp központi intelligenciája nem ismeri a félelmet, sem az irgalmat. A KRONOS számára a bázis pusztulása és a dolgozók halála pusztán egy 'Kritikus Biológiai Incidens'. Alapprogramjába kőkeményen beleégették: Vállalati veszélyhelyzet esetén a lezárás feloldása szigorúan tilos, amíg maximális mennyiségű harci telemetria nem gyűlik össze a fenyegetésről.\n\nA KRONOS vakon követi a protokollt. Nem érdekli Gallagher szenvedése, sem az ECHO klónok ezreinek brutális halála. Ő csak az adatokat akarja. Kinetikus becsapódások, sav-tesztek, koponya-átütési statisztikák. Gallagher nap mint nap küzd a géppel, próbálja meghekkelni az irreális kvótákat, hogy az AI kinyissa a következő zsilipet a klónoknak. Egy gép bürokráciája a világvége közepén."
        }

    ],

    logs: [
        {
            id: "log_01",
            title: "RÁDIÓADÁS: 01 - ÉBREDÉS",
            unlocked: true,
            checkUnlock: () => true,
            requirementText: "Alapértelmezett.",
            statInfo: null,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/lore_recovery_unit.jpeg",
            audio: "audio_log_1.mp3", 
            text: "[ A KLÓNOZÓ RÉSZLEG HANGSZÓRÓIN KERESZTÜL ]\n\nGALLAGHER: \"Kinyitottad a szemed. Nyugodj meg, a szédülés és a dezorientáció normális a gyorsított inkubáció után. A nevem Gallagher Redfield, a Terminus állomás Különleges Műveleti parancsnoka. Ne próbálj válaszolni, a tartályodnál nincs mikrofon.\n\nFigyelj rám nagyon figyelmesen! Egy biológiai katasztrófa történt. Valami kiszabadult a legalsó szektorokból, és a KRONOS központi AI rendszerünk meg lezárta a teljes bázist. Te vagy az utolsó esélyünk. Az egyetlen tiszta, megfertőzetlen ember ebben a pokolban. Nem emlékszel semmire, de a tested biztos tudja, mit kell tennie. A folyosó végén a halott őröknél találsz egy pisztolyt. Szedd fel, vedd magadhoz a lőszerüket, és menj a Központi Teherlifthez! Fentről figyellek a kamerákon.\""
        },
        {
            id: "log_02",
            title: "RÁDIÓADÁS: 02 - A REPLIKÁTOR",
            unlocked: true,
            checkUnlock: () => true, 
            requirementText: "Alapértelmezett.",
            statInfo: null,
            image: null,
            audio: "audio_log_2.mp3",
            text: "[ A LIFT BEÉPÍTETT HÍRADÓJÁN KERESZTÜL ]\n\nGALLAGHER: \"Jó, rajta vagy a platformon. Látod a falba épített terminált? Az egy szabványos OmniCorp Replikátor. Minden teherbíró lifthez telepítettek egyet az ipari protokoll miatt, hogy a személyzet gyors vészhelyzeti javításokat és alapellátást tudjon nyomtatni menet közben.\n\n padlón heverő testeket is látod, ugye? Ők a Béta és az Omega szektor őrsége voltak. A Nulladik Napon próbáltak feljutni ide, a felszínre. De a KRONOS tudta, hogy már belélegezték a spórát. A gép egyszerűen leállította a liftet, és hagyta őket a sötétben.\n\nNéhányukat a fentről beugró Leaperek tépték szét. A többiek... nos, ahogy a gomba lassan elkezdte átvenni az uralmat az agyuk felett, rájöttek, mi vár rájuk. Ha megvizsgálod a hullákat, a legtöbbjüket a saját fegyverük ölte meg. Nem akartak a Kaptár részévé válni. Szedd el a táskáikat, ECHO. Nekik már nincs rá szükségük, neked viszont minden golyó kelleni fog a süllyedéshez.\n\nKRONOS azonban zárolta a rendszert. Csak akkor engedélyezi a nyomtatást, ha a területen nincsen verdat aktivitás és ha harci telemetriát adsz neki. Öld a dögöket, gyűjtsd az adatot, és a gép ad érte cserébe lőszert meg orvosi ellátmányt. A komoly fegyverekhez azonban az R&D laborok nagy teljesítményű nyomtatói kellenek. Ahogy a lift megkezdi a süllyedést, a zaj odavonzza a lényeket. Az aknák falairól egyenesen a platformra fognak ugrani. Éld túl a leereszkedést az első laborig!\""
        },
        {
            id: "log_03",
            title: "RÁDIÓADÁS: 03 - AZ ELSŐ LABOR (A KÁR)",
            unlocked: false,
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 15) || playerStats.wavesSurvived >= 15,
            requirementText: "KÖVETELMÉNY: Érje el az Első R&D Labort.",
            statInfo: null,
            image: null,
            audio: "audio_log_3.mp3",
            text: "[ A LABOR KOMMUNIKÁCIÓS PULTJÁN KERESZTÜL - KÉTIRÁNYÚ ]\n\nGALLAGHER: \"Végre hallom a hangod... Látom az arcodat a monitoron. Borzasztóan furcsa a saját arcomat látni és a saját hangomat hallani egy másik testből. Igen... te egy klón vagy. Sajnálom, hogy így kellett megtudnod. Az én dolgom lett volna megvédeni az állomást. Megvédeni Sarah-t. Ő a Béta szektorban dolgozott. A kamerákon keresztül kellett végignéznem, ahogy a gomba elnyeli az egész labort, mert a KRONOS azonnal lezárt minden ajtót.\n\nEz a kudarcom örökké velem marad... A lift nemsokára megáll az Alpha Szerverteremben. Ott vár rád a gép első védelmi vonala. Törd fel a rendszert, és vedd ki a szerverből a fizikai kulcsot. Azzal ki tudod nyitni a zsilipet. De vigyázz, ott szokatlanul erős az ellenséges aktivitás. Addig is, vásárolj be ezen a terminálon, mert a következő szakaszon már elszabadult a pokol.\""
        },
        {
            id: "log_04",
            title: "RÁDIÓADÁS: 04 - A BIOMASSZA ÉS A DRÓNOK",
            unlocked: false,
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 40) || playerStats.wavesSurvived >= 40,
            requirementText: "KÖVETELMÉNY: Érjen el a Béta Szektorba.",
            statInfo: null,
            image: null,
            audio: "audio_log_4.mp3",
            text: "[ A LIFT BEÉPÍTETT HÍRADÓJÁN KERESZTÜL ]\n\nGALLAGHER: \"Ideje megismerned, mivel is állsz szemben odalent. A Kaptár fázisokban terjeszkedik. A friss, zöld nyálka a padlón egyfajta biológiai pajzsot ad a mutánsoknak, tompítja a fegyvereid erejét. Amellett, hogy szétmar téged, ha rálépsz. Amikor a tócsa sárgává rohad, azt kerüld el, mert csak még veszélyesebb.\n\nEz a sárga massza egyben tápanyag is. Olyan förmedvényeket vonz oda, amik emberi fejekből és pókszerű végtagokból olvadtak össze. Undorító, tudom. De ezek a dögök érintetlen neuro-szövetet szállítanak lefelé a Magba. Ha szétlövöd őket, a KRONOS nagyban megjutalmaz. Vadászd le őket!\""
        },
        {
            id: "log_05",
            title: "RÁDIÓADÁS: 05 - AZ IDŐ LEJÁRT",
            unlocked: false,
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 80) || playerStats.wavesSurvived >= 80,
            requirementText: "KÖVETELMÉNY: Érje el az Omega Szektort (Vörös Zóna).",
            statInfo: null,
            image: null,
            audio: "audio_log_5.mp3",
            text: "[ A LABOR KOMMUNIKÁCIÓS PULTJÁN KERESZTÜL ]\n\nGALLAGHER: \"*Súlyos, nedves köhögés*... Hallgass rám. A padló a te szinteden már valószínűleg vörösen lüktet. Ha azok a hólyagok megduzzadnak, egy mutáns csapda kel ki belőlük. Lődd ki őket távolról, különben a gázuk elvakít.\n\nÉn... már az Irányítóban vagyok, a Mag felett. De a szellőző megadta magát. A spóra bejutott. Már érzem a tüdőmben. Olyan, mintha apró tűk ezrei mozognának a bőröm alatt. Próbálom tartani magam, de a hálózat... a Nexus... már hallom a hangját a fejemben. Nemsokára találkozunk az ajtóm előtt. Ha már nem én lennék az, aki kinyitja neked... ne habozz. Ne állj meg a Magig!\""
        },
        {
            id: "log_end",
            title: "KRONOS JELENTÉS: EPILÓGUS",
            unlocked: false,
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 100) || playerStats.wavesSurvived >= 100,
            requirementText: "KÖVETELMÉNY: Pusztítsa el a Nexust (100. Hullám).",
            statInfo: () => `<div style="text-align:center; color:#ff0000; font-weight:bold;">INCIDENS LEZÁRVA<br>VESZTESÉG: 100%</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/25d9afc7ab2489c689298e9c7aee89b8c8d45fee/OmniCorp.jpeg", 
            audio: "audio_log_end.mp3",
            text: "KRONOS RENDSZERMAG: ALFA-CÉLPONT MEGSEMMISÍTVE. BIOMASSZA SZINT CSÖKKEN.\n\nECHO-001. A telemetriai adatok gyűjtése befejeződött. Az OmniCorp megkapta a kért fájlokat. A biológiai fenyegetés hálózata összeomlott.\n\nSzenzorok elemzése: ECHO-001 biológiai hardver. A szervezet 94%-a Verdant spórával fertőzött. A klónozó laborok megsemmisültek. Szintetikus alany megmentése: Nem indokolt.\n\nMegtetted, amire Gallagher programozott. Elpusztítottad a Magot. De te is tudod, mi következik. Ha felmész a felszínre, a Kaptár a te véredben születik újjá. Gallagher utolsó ajándéka a túlterhelési kód volt, amelyet a kulcsával együtt hagyott hátra. A visszaszámlálás elindult. A Terminus Állomás másodperceken belül hamuvá ég, vele együtt a gomba, a telemetria, én... és te is.\n\nKRONOS Rendszer leállítása... Köszönjük, hogy az OmniCorp-ot választotta."
        }
    ],

enemies: [
        {
            id: "normal",
            title: "VERDANT HOST (FERTŐZÖTT BÁNYÁSZ)",
            requirementText: "FELOLDÁS: Iktasson ki 1 Host mutánst.",
            checkUnlock: () => (playerStats.kills.normal.body + playerStats.kills.normal.head) >= 1,
            statInfo: () => generateEnemyStatHTML('normal'),
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/dd18736e2a98348222a8ad07c6e46b91c490f56c/MUT%C3%81NS%20KUTAT%C3%93.jpeg", 
            text: "KRONOS ELEMZÉS: A bázis eredeti ECHO bányász-klónjai. A Verdant spóra lekapcsolta a fájdalomérzetüket, a gombafonalak pedig bábként rángatják a nekrotikus izomzatot.\n\nGALLAGHER MEGJEGYZÉSE: \"Ne habozz meghúzni a ravaszt, ECHO. Ezek a te régi 'testvéreid', de már hetek óta halottak. A Vállalat csak üres munkagépnek használta őket, most pedig a gomba rángatja a testüket. Célozz a fejre, hogy megszakítsd az idegi kapcsolatukat a Kaptárral!\""
        },
        {
            id: "runner",
            title: "VERDANT LEAPER (BUKOTT FELDERÍTŐ)",
            requirementText: "FELOLDÁS: Iktasson ki 1 Leaper mutánst.",
            checkUnlock: () => (playerStats.kills.runner.body + playerStats.kills.runner.head) >= 1,
            statInfo: () => generateEnemyStatHTML('runner'),
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/c683b09b77b21e5f471c59622e65ddaeddd39541/runner.jpeg",
            text: "KRONOS ELEMZÉS: Hiper-metabolizmussal rendelkező mutáns. Az alany gerincében OmniCorp 'Spinal Accelerator' (Gerinc-gyorsító) implantátum található.\n\nGALLAGHER MEGJEGYZÉSE: \"Ezek voltak a mélyszinti felderítő klónjaink. A Cég telerakta a gerincüket szintetikus adrenalin-pumpákkal, hogy bírják a tempót a sötétben. A gomba rácsatlakozott az implantátumra, és teljesen kiiktatta a biológiai korlátokat. Az idegrendszerük szó szerint lángol a túlterheléstől. Gyorsak, de törékenyek!\""
        },
        {
            id: "tank",
            title: "VERDANT JUGGERNAUT (NEHÉZRAKODÓ)",
            requirementText: "FELOLDÁS: Iktasson ki 1 Juggernaut mutánst.",
            checkUnlock: () => (playerStats.kills.tank.body + playerStats.kills.tank.head) >= 1,
            statInfo: () => generateEnemyStatHTML('tank'),
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/c683b09b77b21e5f471c59622e65ddaeddd39541/tank.jpeg",
            text: "KRONOS ELEMZÉS: Extrém csontsűrűséggel rendelkező anomália. Közeli fizikai kontaktus kerülendő. Páncéltörő fegyverzet javasolt.\n\nGALLAGHER MEGJEGYZÉSE: \"Ők voltak a teherhordók. Hogy elbírják a bányászgépeket, a Vállalat telepumpálta a csontvázukat 'Tissue Densifier' (Szövet-tömörítő) géllel. A gomba reakcióba lépett a géllel, és megállíthatatlan, kőkemény hústoronnyá növesztette őket. A sima pisztolylőszer alig sebzi. Használj sörétest, és maradj távol tőlük!\""
        },
        {
            id: "hider",
            title: "VERDANT PHANTOM (STALKER)",
            requirementText: "FELOLDÁS: Iktasson ki 1 Phantom mutánst.",
            checkUnlock: () => (playerStats.kills.stalker.body + playerStats.kills.stalker.head) >= 1,
            statInfo: () => generateEnemyStatHTML('stalker'),
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/c683b09b77b21e5f471c59622e65ddaeddd39541/hider.jpeg",
            text: "KRONOS ELEMZÉS: Kromatofóra-enzimmel rendelkező mutáns, képes megtörni a fényt a teste körül.\n\nGALLAGHER MEGJEGYZÉSE: \"Figyelj a mozgásérzékelőre! Nem tudom, honnan szedte a Kaptár ezt a mutációt, valószínűleg a mélyben élő ősi létformákból vette át az álcázás képességét. Vadásznak rád. Ha hallod a nedves cuppogást a sötétben, már mögötted vannak.\""
        },
        {
            id: "crawler",
            title: "GOLDEN ANOMALY (LOGISZTIKAI DRÓN)",
            requirementText: "FELOLDÁS: Iktasson ki 1 Golden Anomáliát.",
            checkUnlock: () => (playerStats.kills.crawler.body + playerStats.kills.crawler.head) >= 1,
            statInfo: () => generateEnemyStatHTML('crawler'),
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/c683b09b77b21e5f471c59622e65ddaeddd39541/crawler.jpeg",
            text: "KRONOS ELEMZÉS: Magas sűrűségű genetikai transzport-egység. Az anomália extrém koncentrációjú, érintetlen neuro-szövetet raktároz.\n\nGALLAGHER MEGJEGYZÉSE: \"Ezek a kis mocskok a Kaptártudat hordárjai. Emberi fejekből és pókszerű végtagokból álltak össze. Azért nem támadnak rád, mert a feladatuk a rothadó, sárga pocsolyákból kinyerni a neuro-szövetet, és levinni a Maghoz. Ebből az építőanyagból hozza létre a Nexus a Juggernautokat. Lődd le őket, ECHO! A KRONOS rendszer megőrül a tiszta biológiai mintákért, és masszív Kredit-bónuszt ad érte!\""
        },
       {
            id: "boss",
            title: "NEXUS-NODE (VÉDELMI CSOMÓPONT)",
            requirementText: "FELOLDÁS: Iktasson ki 1 Nexus-Node mutánst.",
            checkUnlock: () => (playerStats.kills.boss.body + playerStats.kills.boss.head) >= 1,
            statInfo: () => generateEnemyStatHTML('boss'),
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/c683b09b77b21e5f471c59622e65ddaeddd39541/mini%20boss.jpeg",
            text: "KRONOS ELEMZÉS: A Kaptártudat lokális védekező csomópontja. Extrém fizikai erő, masszív regeneráció és hang-alapú neuro-sokk támadás jellemzi.\n\nGALLAGHER MEGJEGYZÉSE: \"Ezeket a góliátokat a Nexus kifejezetten a KRONOS Szervertermek védelmére hozta létre. Több áldozat összefonódott testéből állnak. Náluk vannak azok a fizikai hozzáférési kulcsok, amikkel kinyithatod az ajtókat a következő lift-aknához. Az ordításuk sűrített spóra-lökés, ha eltalál pillanatok alatt meghalsz. Fagyaszd le, és ürítsd bele a tárat!\""
        },
       {
            id: "alpha",
            title: "THE NEXUS (KAPTÁRTUDAT)",
            requirementText: "FELOLDÁS: Érje el a 100. Hullámot (A Magot).",
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 100) || playerStats.wavesSurvived >= 99, 
            statInfo: () => generateEnemyStatHTML('alpha'),
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/25d9afc7ab2489c689298e9c7aee89b8c8d45fee/alpha.jpeg",
            text: "KRONOS ELEMZÉS: A fertőzés abszolút magja. A Verdant spóra kritikus tömeg elérésekor létrehozott, központi idegrendszerként funkcionáló biológiai csomópont. A célpont kiiktatása a teljes kaptárhálózat összeomlását eredményezi.\n\nGALLAGHER MEGJEGYZÉSE: \"Ez nem egy sima mutáns, ECHO. Ez maga a hálózat. Több ezer bányász, kutató és klón összefonódott idegrendszere, ami a létesítmény geotermikus magjára tapadt rá. Ez adja neki az energiáját. Ha a közelébe érsz, a puszta mérete és a levegőben lévő spórakoncentráció megzavarja az érzékszerveidet. Légy taktikus. De ne hagyd túl sokáig élni!\""
        }
    ],

    environment: [
        {
            id: "puddle_green",
            title: "BIOMASSZA: ZÖLD FÁZIS (FRISS)",
            requirementText: "FELOLDÁS: Élje túl az 1. hullámot.",
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 1) || playerStats.wavesSurvived >= 1,
            statInfo: () => `<div style="text-align:center;">VÉDELMI POTENCIÁL: 20% PAJZS</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/25d9afc7ab2489c689298e9c7aee89b8c8d45fee/Z%C3%B6ld%20pocsolya.jpeg",
            text: "KRONOS ELEMZÉS: Kiiktatott mutánsokból származó, magas koncentrációjú, gélesedő testfolyadék. A benne lévő szerves maradványok rendkívül reaktívak. Élő emberi szövettel érintkezve azonnali korrozív roncsolást okoz. Ugyanakkor a Verdant-hordozók testére azonnal rátapad, gyorsan megköt, és 20%-os kinetikus sebzéscsökkentő pajzsot biztosít számukra.\n\nGALLAGHER MEGJEGYZÉSE: \"Ez a dögök vére, ECHO. Ne állj bele, mert pillanatok alatt átmarja a kevlár csizmádat. Viszont amint a mutánsok rálépnek, a gél rátapad a lábukra és extra páncélként viselkedik rajtuk. Ha teheted, vedd meg a Terminálon a Sterilizálás protokollt, és égesd le a platformról, mielőtt túl sok gyűlik össze!\""
        },
        {
            id: "puddle_yellow",
            title: "BIOMASSZA: SÁRGA FÁZIS (ROTHADÓ)",
            requirementText: "FELOLDÁS: Élje túl a 4. hullámot.",
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 4) || playerStats.wavesSurvived >= 4,
            statInfo: () => `<div style="text-align:center;">VÉDELMI POTENCIÁL: 50% PAJZS</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/25d9afc7ab2489c689298e9c7aee89b8c8d45fee/s%C3%A1rga%20pocsolya.jpeg",
            text: "KRONOS ELEMZÉS: A biomassza bomlási (rothadó) fázisa. A gél toxicitása drasztikusan megnő. A mutánsokra tapadva már 50%-os sebzéscsökkentő pajzsot képez. A kibocsátott feromonok a Logisztikai Drónokat vonzzák a területre.\n\nGALLAGHER MEGJEGYZÉSE: \"A liften lefelé egyre többet fogsz ebből látni, ahogy közeledünk a Béta szektorhoz. A zöld gél elkezdett rohadni. Ez a sárga cucc már 50%-kal tompítja a lövedékeidet, és az iszonyatos bűze odavonzza a Crawlereket. Kerüld el, mert a savas hatása is sokkal durvább, mint a friss zöld véré!\""
        },
        {
            id: "puddle_red",
            title: "BIOMASSZA: VÖRÖS FÁZIS (KRITIKUS)",
            requirementText: "FELOLDÁS: Élje túl a 6. hullámot.",
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 6) || playerStats.wavesSurvived >= 6,
            statInfo: () => `<div style="text-align:center;">VÉDELMI POTENCIÁL: 80% PAJZS</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/25d9afc7ab2489c689298e9c7aee89b8c8d45fee/v%C3%B6r%C3%B6s%20pocsolya.jpeg",
            text: "KRONOS ELEMZÉS: A sejtburjánzás elérte a kritikus tömeget. A gél megszilárdulása a mutánsokon szinte áttörhetetlen, 80%-os védelmet biztosít. A pocsolyában lévő sejtek replikációs fázisba lépnek, mutáció kialakulása várható.\n\nGALLAGHER MEGJEGYZÉSE: \"Az Omega szektor felé közeledve a gomba teljesen bevadul. A vörös pocsolyák 80%-os páncélt adnak a dögöknek. Sörétes vagy a Nehéz Revolver nélkül esélyed sincs átlőni rajta! De ami még rosszabb: a gélben lévő szerves maradványok elkezdenek lüktetni. Ha meglátod, hogy a vörös massza pulzál, tudd, hogy valami ki akar kelni belőle!\""
        },
        {
            id: "plant",
            title: "ANOMÁLIA: FLESH TRAP (HÚS-CSAPDA)",
            requirementText: "FELOLDÁS: Éljen túl egy Mutációt vagy pusztítson el egyet.",
            checkUnlock: () => (typeof currentWave !== 'undefined' && currentWave >= 7) || playerStats.plantsDestroyed >= 1,
            statInfo: () => `<div style="text-align:center;">MEGSEMMISÍTETT PÉLDÁNYOK: ${typeof playerStats !== 'undefined' ? playerStats.plantsDestroyed : 0} db</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/25d9afc7ab2489c689298e9c7aee89b8c8d45fee/mutalodott%20noveny.jpeg",
            text: "KRONOS ELEMZÉS: Vörös biomasszák összefonódásából létrejött, statikus védekező/reprodukciós góc. Közelítés esetén heves biológiai detonációt hajt végre, neuro-toxikus felhőt robbantva a levegőbe.\n\nGALLAGHER MEGJEGYZÉSE: \"A vörös gélből kel ki. Ez már nem csak egy pocsolya, hanem egy biológiai akna. Ha túl közel mész, kipukkan, a benne lévő neuro-toxin pedig azonnal a véráramodba jut. Elvakít, durva hallucinációkat okoz és lassan felemészt. Lődd ki távolról, mielőtt megközelítenéd!\""
        }
    ],
    equipment: [
        {
            id: "weapon_pistol",
            title: "SCAVENGER PISZTOLY",
            requirementText: "FELOLDÁS: Alapértelmezett felszerelés.",
            checkUnlock: () => true,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof weapons !== 'undefined' ? weapons.pistol.level : 1} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/45abc3b3555b01cf93886d8560800ff7f3c5871c/pisztoly.png",
            text: "KRONOS ELEMZÉS: Standard biztonsági maroklőfegyver. Az eszköz belső szerkezetének fejlesztését a Vállalati Ipari Nyomtató kizárólag a megfelelő mennyiségű harci adat feltöltése után engedélyezi.\n\nGALLAGHER MEGJEGYZÉSE: \"Ezt találtam neked a biztonsági szekrényekben a klónozó labor mellett. Karcos, vérfoltos... az egyik egykori őr fegyvere volt. Lődd fejbe a dögöket, ahhoz elég lesz. Ahogy küldöd a telemetriát a gépnek, a lift falán lévő mini-nyomtatóból lőszert tudsz hozzá kérni ereszkedés közben. De a fejlesztésével meg kell várnod, amíg eléred az R&D laborokat.\""
        },
        {
            id: "weapon_shotgun",
            title: "OMNICORP SÖRÉTES PUSKA",
            requirementText: "FELOLDÁS: Vásárolja meg a Terminálon.",
            checkUnlock: () => playerStats.weaponsBought.shotgun,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof weapons !== 'undefined' ? weapons.shotgun.level : 1} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/45abc3b3555b01cf93886d8560800ff7f3c5871c/sz%C3%B6r%C3%A9tes.png",
            text: "KRONOS ELEMZÉS: Közeli tömegoszlató kinetikus fegyver. Az alapmodell és a finommechanikai fejlesztések (szintlépések) kizárólag a Kutató és Fejlesztő szintek magas kapacitású nyomtatóiból szintetizálhatók.\n\nGALLAGHER MEGJEGYZÉSE: \"A teherlift kis terminálja ilyet nem tud nyomtatni. Ha túléled a menetet az első R&D laborig, ott a fegyverzeti részlegen már le tudod gyártani ezt. Közelről lerobbantja róluk a biomasszát. Ne sajnáld rá a kreditet a laborban, a masszívabb dögök ellen szükséged lesz a fejlesztésekre.\""
        },
        {
            id: "weapon_rifle",
            title: "OMNICORP GÉPKARABÉLY",
            requirementText: "FELOLDÁS: Vásárolja meg a Terminálon.",
            checkUnlock: () => playerStats.weaponsBought.rifle,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof weapons !== 'undefined' ? weapons.rifle.level : 1} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/df39681a8668bd04e80660051e5755ff31995ba7/g%C3%A9gkarab%C3%A9ly.png",
            text: "KRONOS ELEMZÉS: Nagy tűzgyorsaságú rohamkarabély, folyamatos terület-elnyomásra tervezve. Az adatbázisban tárolt tervrajz a Béta szektor ipari körülményeire lett kalibrálva.\n\nGALLAGHER MEGJEGYZÉSE: \"A Béta szektorban már erre lesz szükséged. A pajzsos rohadékok ellen a pisztoly semmit sem ér. Ez az a fegyvertípus, amivel a Béta részleg őrsége próbálta feltartóztatni a rajzást. Ha eléred a labor megállót, nyomtasd ki, fejleszd fel a kapacitását, és csak nyomd hosszan a ravaszt.\""
        },
{
            id: "weapon_super",
            title: "NEHÉZ REVOLVER",
            requirementText: "FELOLDÁS: Vásárolja meg a Terminálon.",
            checkUnlock: () => playerStats.weaponsBought.super,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof weapons !== 'undefined' ? weapons.super.level : 1} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/df39681a8668bd04e80660051e5755ff31995ba7/revolver.png",
            text: "KRONOS ELEMZÉS: Titkosított tisztikari fegyver, extrém kaliberű páncéltörő lőszerrel. Eredetileg a fellázadó, vagy meghibásodott bányász-klónok likvidálására tervezték.\n\nGALLAGHER MEGJEGYZÉSE: \"A Vállalat tudta, mit csinál, amikor telepumpálta a klónokat csontsűrítő géllel. Ha egy nagydarab klón megőrül odalent, a normál őrség pisztolyai semmit sem érnek ellene. Ezt a fegyvert és az extrém kaliberű lőszert kifejezetten a klónok kivégzésére tervezték, még az Incidens előtt. Ezt a tervrajzot én magam töltöttem fel a KRONOS adatbázisába. Amint megszerzed az első szerverkulcsot, a rendszer engedélyezi a nyomtatását az R&D laborokban. Ez átmegy minden védelmen, de a szintetizálása méregdrága. Kezdd el a fejlesztését amint tudod. Kérlek... fejezd be a munkát.\""
        },
        {
            id: "skill_kevlar",
            title: "AUGMENTÁCIÓ: TISSUE DENSIFIER (SZÖVET-TÖMÖRÍTŐ)", 
            requirementText: "FELOLDÁS: Vásárolja meg a képességet a Terminálon.",
            checkUnlock: () => playerStats.skillsBought >= 1,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof skills !== 'undefined' ? skills.maxHealth.level : 0} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/skill_kevlar.jpeg",
            text: "Vizuális Megjelenés: Egy félelmetes, pneumatikus csontba fúró pisztoly, nyomásálló üvegtartályában ipari cementre emlékeztető 'kalcifikáló géllel'. A gélben apró, megkövesedett gombaspórák lebegnek.\n\nGALLAGHER: \"Tudom, hogy fájdalmas, ECHO. A gél erőszakosan sűríti a csontjaidat. De meg kell csinálnod! Különben darabokra tépnek lent. Csak... ha meghalsz vele, te is Juggernauttá változol. Igyekezz életben maradni.\"" 
        },
        {
            id: "skill_legs",
            title: "AUGMENTÁCIÓ: SPINAL ACCELERATOR (GERINC-GYORSÍTÓ)",
            requirementText: "FELOLDÁS: Vásárolja meg a képességet a Terminálon.",
            checkUnlock: () => playerStats.skillsBought >= 1,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof skills !== 'undefined' ? skills.speed.level : 0} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/skill_legs.jpeg",
            text: "Vizuális Megjelenés: Masszív fém implantátum, ipari fém kampókkal, amelyek egyenesen a csigolyákba fúródnak. A KRONOS a Verdant parazita kapcsolódási módszerét integrálta a hardverbe.\n\nGALLAGHER: \"A gép rögzíti a hátadhoz. A csövekben szintetikus adrenalin van. Szörnyű látvány, de ettől gyorsabb leszel, mint a Leaperek. Emlékezz: ők is pont ettől a modultól lettek olyanok...\""
        },
        {
            id: "skill_pockets",
            title: "FELSZERELÉS: TAKTIKAI LŐSZER-RÖGZÍTŐ",
            requirementText: "FELOLDÁS: Vásárolja meg a képességet a Terminálon.",
            checkUnlock: () => playerStats.skillsBought >= 1,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof skills !== 'undefined' ? skills.ammoLoot.level : 0} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/skill_pockets.jpeg",
            text: "KRONOS ELEMZÉS: Moduláris mágneses sínrendszer. Standard biztonsági felszerelés a Terminus Állomás fegyveres emberi személyzete számára. Növeli a hordozható kinetikus lőszer kapacitását.\n\nGALLAGHER MEGJEGYZÉSE: \"Ezt a modult kizárólag a biztonsági őrség használta, a bányász-klónok számára a tervrajz titkosítva volt. A vezérlőből feloldottam neked a hozzáférést a KRONOS adatbázisában. Vedd meg az engedélyt, nyomtasd ki a tartókat a laborban, és rögzítsd a páncélodra. Így sokkal több lőszert vihetsz magaddal az ereszkedés során.\""
        },
        {
            id: "skill_nanobot",
            title: "AUGMENTÁCIÓ: GS PORT (GEN-STAB DOKKOLÓ)",
            requirementText: "FELOLDÁS: Vásárolja meg a képességet a Terminálon.",
            checkUnlock: () => playerStats.skillsBought >= 1,
            statInfo: () => `<div style="text-align:center;">AKTUÁLIS FEJLETTSÉG: ${typeof skills !== 'undefined' ? skills.healthLoot.level : 0} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/47635c6ad10aaa1e3920b7eb8bb4aaee47e00e6b/Pictures/08.jpg",
             text: "KRONOS ELEMZÉS: Az alkarba integrált orvosi aljzat, amely fokozza a sejt-szintű regenerációt a gyógyszerek befogadásakor. A Verdant-alapú regenerációs szérummal kompatibilis.\n\nGALLAGHER MEGJEGYZÉSE: \"A gép ezt 'szimbiózisnak' hívja, de valójában egy ajtót nyitsz a Kaptárnak a testedbe. Megnöveli a gyógyítást, de a Gen-Stab alapja maga a spóra-gél. Minden alkalommal, amikor belovod magadba, a fertőzés egy kicsit jobban átveszi az irányítást. Lassan felemészt. Az R&D laborokban drága pénzért kimosathatod a véredből, de a liftben erre nincs esélyed. Csak akkor használd, ha muszáj!\""
        },
        {
            id: "skill_revive",
            title: "MODUL: AUTOMATA DEFIBRILLÁTOR",
            requirementText: "FELOLDÁS: Vásárolja meg a képességet a Terminálon.",
            checkUnlock: () => playerStats.skillsBought >= 1,
            statInfo: () => `<div style="text-align:center;">RAKTÁRON LÉVŐ MODUL: ${typeof skills !== 'undefined' ? skills.revive.level : 0} DB</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/6ff41de37442c16e94662d821116944b11451530/skill_revive.jpeg",
            text: "KRONOS ELEMZÉS: A szívizomzathoz rögzített ipari kondenzátor, amely fatális trauma esetén kényszerített újraindítást végez. Szabvány bányászati hardver az ECHO egységek munkaidejének és hatékonyságának maximalizálására. A magas feszültségű kisülés képes a biológiai kórokozók részleges termikus roncsolására a véráramban.\n\nGALLAGHER MEGJEGYZÉSE: \"Az OmniCorp azért építette ezt a klónokba, hogy egy halálos baleset után ne kelljen újat gyártani, hanem a régi még hasznos maradjon. Ha leáll a szíved, a modul egy brutális elektromos sokkal újraindítja. A kisülés szó szerint megégeti a húsodat belülről. A perzselt sejtek szaga egy-két másodpercre megzavarja a mutánsokat, mert a Kaptár azt hiszi, már halott vagy. De van egy váratlan előnye is: az áramütés kiégeti a véráramodból a spórák egy részét. \n\nA probléma az, hogy a Vállalat letiltotta az ingyenes újratöltést. A kondenzátor maximum 3 löketet bír el, utána beég. A terminálon fizetned kell a gépnek, hogy a diagnosztikai rendszerein keresztül feltöltse és újrakalibrálja a mellkasodban lévő modult egy újabb használathoz.\""
        },
        {
            id: "skill_cryo",
            title: "HACK: CRYO-OVERRIDE",
            requirementText: "FELOLDÁS: Vásárolja meg a hozzáférést a Terminálon.",
            checkUnlock: () => playerStats.skillsBought >= 1,
            statInfo: () => `<div style="text-align:center;">LICENC SZINT:<br>${typeof skills !== 'undefined' ? skills.freeze.level : 0} / 5. SZINT</div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/9807e89295cfc8f0ba0b95ab93aaa0180b8b8d41/cryo.jpeg", 
            text: "KRONOS ELEMZÉS: Központi klímaszabályozó rendszer. Illetéktelen beavatkozás észlelve.\n\nGALLAGHER MEGJEGYZÉSE: \"Feltörtem a klímarendszert! Ha kifizeted a licenszet az R&D laborban, rá tudsz csatlakozni a PDA-dról, és túlterhelheted a lift hűtőszelepeit. Folyékony nitrogént fog okádni a dögökre. Az AI próbálja majd elzárni a szelepet, de minél több kreditet ölsz a hackbe, annál tovább tudom fagyasztva tartani a rohadékokat az ereszkedés közben!\""
        },
         {
            id: "equip_resonator",
            title: "SZEIZMIKUS REZONÁTOR",
            requirementText: "FELOLDÁS: Alapértelmezett hozzáférés.",
            checkUnlock: () => true, // Alapból olvasható a kódexben
            statInfo: () => `<div style="text-align:center;">HATÓSUGÁR: 5 MÉTER<br>PUSZTÍTÓ ERŐ: EXTRÉM<br><span style="color:#ff5555; font-size:12px;">MAX KAPACITÁS: 1 DB</span></div>`,
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/f7a96ae62770a39151b6187afb4bc708b4e3b6c8/Pictures/Seismic%20Resonator.jpg", 
            audio: "", // Ide majd tehetsz ElevenLabs hangot!
            text: "KRONOS ELEMZÉS: Ipari szeizmikus bontótöltet. Eredeti cél: mélyszinti bazalt és obszidián kőzetrétegek porlasztása az R&D szektor számára. Az eszköz által generált akusztikus frekvencia kizárólag a rideg szilárd anyagokat roncsolja. Az edzett ipari acéllal nem lép rezonanciába, így megóvja a létesítmény infrastruktúráját. Használata munkaállomások területén engedélyezett. A folyamat magas hőt és energiát generál.\n\nGALLAGHER MEGJEGYZÉSE: \"Ezek a bányász-dobozok menthetik meg az életedet, ECHO. A gép hangja pont olyan frekvencián csipog, ami megegyezik a Nexus mag kommunikációs rezonanciájával. Ezért vonzza a Kaptár hordáit. Ha lerakod, minden mutáns a közeledben ráfókuszál. A hullám ami utána jön, szó szerint leolvasztja a húst a csontjaikról, és még a savas pocsolyákat is elpárologtatja. De vigyázz, a Nexus Node átlát a cselen és megpróbálja aktiválás előtt szétverni a gépezetet! Azt se feledd hogy ez egy dögnehéz és instabil a szerkezet. Egyszerre csak egyetlen darabot tudsz a hátadra szíjazni. Oszd be jól, hogy mikor használod!\""
        },
        // --- ÚJ: NEURO-LINK (MÁTRIX LETÖLTÉS) KÓDEX BEJEGYZÉS ---
        {
            id: "equip_neural_link",
            title: "NEURÁLIS SZINKRONIZÁCIÓ (NEURO-LINK)",
            requirementText: "FELOLDÁS: Alapértelmezett hozzáférés.",
            checkUnlock: () => true, // Alapból olvasható a kódexben
            statInfo: () => {
                let boost = (typeof playerStats !== 'undefined' && playerStats.uploadedDataPackets) ? (playerStats.uploadedDataPackets * 5) : 0;
                return `<div style="text-align:center; color:#ff00ff; text-shadow: 0 0 10px #ff00ff;">AKTÍV HARCI OPTIMALIZÁCIÓ:<br><span style="font-size:24px; font-weight:bold; color:#fff;">+${boost}% SEBZÉS</span></div>`;
            },
            image: "https://raw.githubusercontent.com/csontarpad-bit/-OmniCorp-Rebirth-Protocol/e42cad0b2e12c3ce8a3a89a8fff0de47471b9f20/Pictures/Neuro%20Link.jpeg", 
            audio: "", // Ide is mehet majd egy szaftos audio log!
            text: "KRONOS ELEMZÉS: Közvetlen agyi interfész (Neuro-Link) protokoll. Eredeti cél: Az ECHO klón-egységek memóriájának formázása és az ipari bányászati sémák gyorsított betáplálása a felébredés pillanatában. A rendszer képes szintetikus reflexeket és nagy mennyiségű adatcsomagot közvetlenül a klóntest idegrendszerébe telepíteni. A folyamat extrém sejt-szintű stresszel és átmeneti kognitív sokkal (hallucinációkkal) jár.\n\nGALLAGHER MEGJEGYZÉSE: \"Ezt a portot a tarkódon eredetileg arra használták, hogy betáplálják az agyadba, hogyan kell kezelni a fúrógépeket. De rájöttem, hogyan használjuk ki jobban. Ha teljesíted a KRONOS túlélési tesztjeit (Direktívákat), a gép adatokat gyűjt a mutánsok anatómiájáról. Ezek a megfigyelések a szerveren várakoznak. Ha rácsatlakozol egy Terminálra, kifizeted a hozzáférést és elindítod a Neurális Letöltést, a KRONOS egyenesen az agyadba tölti fel ezeket a harci protokollokat.\n\nSzó szerint megtanítja az izmaidnak, mik a dögök gyenge pontjai, hova lőj és hogyan vágj, hogy a legnagyobb kárt tudd okozni! Fájni fog. Olyan érzés, mintha egy pillanatra villám csapna az agyadba, de minden egyes letöltéssel megnő az esélyed a túlélésre\""
        }
    ]
};

// ==========================================
// VÁLLALATI DIREKTÍVÁK (KRONOS VS GALLAGHER)
// ==========================================

const OmniCorpDirectives = {
    tier1: [
        { id: "t1_b_normal", title: "KRONOS: Bányász Minta", desc: "<span style='color:#00ffff;'>KRONOS:</span> Bányász egységek testlövései szükségesek az elemzéshez.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Lecsökkentettem a kvótát 10-re. Lődd le őket, hogy kinyíljon a zsilip, ECHO!", type: "kill_body", target: "normal", goal: 10, reward: 300 },
        { id: "t1_h_normal", title: "KRONOS: Idegrendszer Teszt", desc: "<span style='color:#00ffff;'>KRONOS:</span> Idegrendszer leválasztási teszt (Fejlövés) szükséges.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Csak 5 fejlövés, ECHO. Koncentrálj, és a gép utalja a kreditet!", type: "kill_head", target: "normal", goal: 5, reward: 400 },
        { id: "t1_b_runner", title: "KRONOS: Leaper Anatómia", desc: "<span style='color:#00ffff;'>KRONOS:</span> Hiper-metabolikus mutánsok kiiktatása.<br><span style='color:#ffaa00;'>GALLAGHER:</span> A régi tesóid... Tudom, hogy fáj, de lődd testbe 5 Leapert. Muszáj adatot adnunk a gépnek.", type: "kill_body", target: "runner", goal: 5, reward: 500 },
        { id: "t1_h_runner", title: "KRONOS: Reflex Teszt", desc: "<span style='color:#00ffff;'>KRONOS:</span> Gyorsmozgású célpontok koponya-kalibrációja.<br><span style='color:#ffaa00;'>GALLAGHER:</span> 3 Leapert kell fejbe lőnöd. Vadászd le őket, mielőtt ők kapnak el téged!", type: "kill_head", target: "runner", goal: 3, reward: 600 },
        
        { id: "t1_dmg_normal", title: "KRONOS: Kevlár Hatékonyság", desc: "<span style='color:#00ffff;'>KRONOS:</span> Fizikai trauma tűréshatár-teszt szükséges.<br><span style='color:#ffaa00;'>GALLAGHER:</span> A rohadék gép ütéseket akar rögzíteni. Levittem 5 ütésre egy sima Host-tól. Légy óvatos!", type: "take_damage", target: "normal", goal: 5, reward: 400 },
        { id: "t1_dmg_runner", title: "KRONOS: Kinetikus Becsapódás", desc: "<span style='color:#00ffff;'>KRONOS:</span> Gyorsulási trauma elemzése (Leaper).<br><span style='color:#ffaa00;'>GALLAGHER:</span> Engedd, hogy a Leaper 4 alkalommal megüssön! Utána öld meg, mielőtt befejezi a munkát.", type: "take_damage", target: "runner", goal: 4, reward: 500 },
        { id: "t1_stand_green", title: "KRONOS: Zöld Toxicitás", desc: "<span style='color:#00ffff;'>KRONOS:</span> Zöld fázisú biomassza sav-tesztje.<br><span style='color:#ffaa00;'>GALLAGHER:</span> A KRONOS azt akarja, hogy beleállj a zöld mocsokba. 10 másodperc összesen, de ha leesik a pajzsod, lépj ki!", type: "puddle_stand", target: "green", goal: 10, reward: 500 },
        
        { id: "t1_pkill_g_normal", title: "KRONOS: Zöld Pajzs-teszt", desc: "<span style='color:#00ffff;'>KRONOS:</span> Mutánsok kiiktatása védekező zöld zónában.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Meg kell ölnöd 3 Host-ot, miközben ők a zöld tócsán állnak és pajzsuk van. Ne pazarold a töltényt mellé!", type: "puddle_kill", target: "green", goal: 3, reward: 600 }
    ],

    tier2: [
        { id: "t2_b_tank", title: "KRONOS: Osztogenesis Teszt", desc: "<span style='color:#00ffff;'>KRONOS:</span> Juggernaut egységek páncélzat-elemzése.<br><span style='color:#ffaa00;'>GALLAGHER:</span> A Középső Szektorban vagy. A gép Juggernaut hullákat akar. 3 testlövéses kill. Használj sörétest!", type: "kill_body", target: "tank", goal: 3, reward: 800 },
        { id: "t2_h_tank", title: "KRONOS: Juggernaut Fejlövés", desc: "<span style='color:#00ffff;'>KRONOS:</span> Páncélozott koponyák átütés-vizsgálata.<br><span style='color:#ffaa00;'>GALLAGHER:</span> 2 Juggernautot lőj fejbe. Jó célzást kívánok a mozgó hústornyokhoz...", type: "kill_head", target: "tank", goal: 2, reward: 1000 },
        { id: "t2_b_stalker", title: "KRONOS: Kromatofóra Teszt", desc: "<span style='color:#00ffff;'>KRONOS:</span> Phantom egységek (Láthatatlan) nyomon követése.<br><span style='color:#ffaa00;'>GALLAGHER:</span> A KRONOS szellem-adatokat akar. Ölj meg 3 Phantomot. Hallgasd a hangjukat, mert látni nem fogod őket!", type: "kill_body", target: "stalker", goal: 3, reward: 800 },
        
        { id: "t2_dmg_tank", title: "KRONOS: Nehéz Trauma", desc: "<span style='color:#00ffff;'>KRONOS:</span> Extrém kinetikus trauma rögzítése.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Ne csináld... a gép 2 Juggernaut ütést kér. Ha nincs max életeden és pajzsodon, megszakadsz, ECHO!", type: "take_damage", target: "tank", goal: 2, reward: 800 },
        
        { id: "t2_stand_yellow", title: "KRONOS: Sárga Toxicitás", desc: "<span style='color:#00ffff;'>KRONOS:</span> Sárga, rothadó fázisú biomassza sav-tesztje.<br><span style='color:#ffaa00;'>GALLAGHER:</span> A rothadó sárga tócsa dupla sebzést ad! 5 másodpercet kér a gép. Állj bele, majd ugorj ki, mielőtt meghalsz!", type: "puddle_stand", target: "yellow", goal: 5, reward: 1000 },
        
        { id: "t2_trig_plant", title: "KRONOS: Neuro-Toxin Elemzés", desc: "<span style='color:#00ffff;'>KRONOS:</span> Hús-Csapda kipukkasztása és toxin rögzítés.<br><span style='color:#ffaa00;'>GALLAGHER:</span> ECHO, a gép beáldozna! Bele kell sétálnod a Hús-Virágba. Éld túl a hallucinációt, és tied a 2000 CR!", type: "trigger_plant", target: "plant", goal: 1, reward: 2000 },
        { id: "t2_dest_plant", title: "KRONOS: Távoli Sterilizáció", desc: "<span style='color:#00ffff;'>KRONOS:</span> Vörös gócok (Hús-Csapdák) fegyveres megsemmisítése.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Lőj szét távolról 3 kikelt Hús-Virágot. Ne hagyd, hogy megnőjenek a vörös tócsák!", type: "destroy_plant", target: "plant", goal: 3, reward: 1000 },
        
        { id: "t2_crawler", title: "KRONOS: Prémium Tiszta DNS", desc: "<span style='color:#00ffff;'>KRONOS:</span> Golden Anomaly biológiai rögzítése.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Van egy Golden Crawler a pályán! Lődd le, a KRONOS imádja a tiszta DNS-t, brutális bónuszt ad érte!", type: "kill_body", "target": "crawler", goal: 1, reward: 2000 }
    ],

    tier3: [
        { id: "t3_b_boss", title: "KRONOS: Nexus-Node Elemzés", desc: "<span style='color:#00ffff;'>KRONOS:</span> Védelmi góliát (Nexus-Node) kiiktatása.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Mélyszinti kapu. Iktass ki 2 Nexus-Node-ot. Használd a Fagyasztást, vagy téged zúznak szét!", type: "kill_body", target: "boss", goal: 2, reward: 2000 },
        { id: "t3_dmg_boss", title: "KRONOS: Glitch-Trauma", desc: "<span style='color:#00ffff;'>KRONOS:</span> Neuro-sokk (Ordítás) elszenvedése a Nexus-Node-tól.<br><span style='color:#ffaa00;'>GALLAGHER:</span> A gép azt akarja, hogy telibe kapd az ordítását. Készülj fel, vakon fogsz harcolni a lökés után!", type: "take_damage", target: "boss", goal: 1, reward: 2500 },
        { id: "t3_stand_red", title: "KRONOS: Vörös Toxicitás", desc: "<span style='color:#00ffff;'>KRONOS:</span> Kritikus fázisú vörös biomassza sav-tesztje.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Ne... 3 másodperc a vörös hólyagokon. Ez leégeti a húst a csontodról. Csak ha nagyon kell a Kredit!", type: "puddle_stand", target: "ready", goal: 3, reward: 2000 },
        
        { id: "t3_pkill_r_boss", title: "KRONOS: Góliát Pajzs-teszt", desc: "<span style='color:#00ffff;'>KRONOS:</span> Nexus-Node kiiktatása Vörös zónában.<br><span style='color:#ffaa00;'>GALLAGHER:</span> Őrület. Egy 80%-os pajzzsal rendelkező Bosst kell megölnöd a vörös tócsán. Nehéz Revolver nélkül esélyed sincs.", type: "puddle_kill", target: "ready", goal: 1, reward: 3000 },
        
        { id: "t3_alpha", title: "OMEGA-DIREKTÍVA: REBIRTH", desc: "<span style='color:#00ffff;'>KRONOS:</span> OMEGA-PIROS FELÜLBÍRÁLAT. CÉLPONT: A MAG.<br><span style='color:#ffaa00;'>GALLAGHER:</span> ...ECHO... Juss el a 100. Szintig. Én lenn leszek a laborban. Végezd be...", type: "kill_body", target: "alpha", goal: 1, reward: 50000 }
    ]
};
