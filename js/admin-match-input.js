/**
 * SLCRICKPRO – Official Match Entry (Admin)
 * Allows admins to manually input completed match results.
 */

document.addEventListener('DOMContentLoaded', () => {
    // We populate teams when the tab is switched, or here if already on it
});

function initMatchEntryTab() {
    const t1Sel = document.getElementById('ame-t1');
    const t2Sel = document.getElementById('ame-t2');
    const b1Sel = document.getElementById('ame-inn1-bat');
    
    const teams = DB.getTeams();
    const opts = teams.map(t => `<option value="${t.name}">${t.name}</option>`).join('');
    
    t1Sel.innerHTML = opts;
    t2Sel.innerHTML = opts;
    b1Sel.innerHTML = opts;
    
    if (teams.length >= 2) {
        t1Sel.selectedIndex = 0;
        t2Sel.selectedIndex = 1;
        b1Sel.value = t1Sel.value;
        updateAMETeams(1);
    }
}

function updateAMETeams(inn) {
    const t1 = document.getElementById('ame-t1').value;
    const t2 = document.getElementById('ame-t2').value;
    const b1 = document.getElementById('ame-inn1-bat').value;
    
    const b2Name = (b1 === t1) ? t2 : t1;
    document.getElementById('ame-inn2-bat-name').textContent = b2Name;
}

async function saveOfficialMatchAdmin() {
    const t1 = document.getElementById('ame-t1').value;
    const t2 = document.getElementById('ame-t2').value;
    const name = document.getElementById('ame-name').value.trim() || "Official Match";
    const overs = parseInt(document.getElementById('ame-overs').value) || 20;

    const b1 = document.getElementById('ame-inn1-bat').value;
    const b2 = (b1 === t1) ? t2 : t1;

    const r1 = parseInt(document.getElementById('ame-inn1-runs').value) || 0;
    const w1 = parseInt(document.getElementById('ame-inn1-wkts').value) || 0;
    const o1 = parseFloat(document.getElementById('ame-inn1-ovPlayed').value) || 0;
    const ao1 = document.getElementById('ame-inn1-ao').checked;

    const r2 = parseInt(document.getElementById('ame-inn2-runs').value) || 0;
    const w2 = parseInt(document.getElementById('ame-inn2-wkts').value) || 0;
    const o2 = parseFloat(document.getElementById('ame-inn2-ovPlayed').value) || 0;
    const ao2 = document.getElementById('ame-inn2-ao').checked;

    const topBatId = document.getElementById('ame-inn1-topBat').value.trim();
    const topBatRuns = parseInt(document.getElementById('ame-inn1-topBatRuns').value) || 0;
    const topBowlId = document.getElementById('ame-inn2-topBowl').value.trim();
    const topBowlStats = document.getElementById('ame-inn2-topBowlStats').value.trim();

    if (t1 === t2) {
        showToast("❌ Select different teams", "error");
        return;
    }

    // Construct a minimal "completed" match object that DB.js can process
    const matchId = "MATCH-" + Date.now();
    const resultText = r1 > r2 ? `${b1} won by ${r1 - r2} runs` : (r2 > r1 ? `${b2} won by ${w2 < 10 ? (10 - w2) + ' wickets' : 'runs'}` : "Match Tied");

    const matchData = {
        id: matchId,
        team1: t1,
        team2: t2,
        overs: overs,
        type: 'single', // treating as standalone official match
        isOfficial: true,
        status: 'completed',
        createdAt: Date.now(),
        result: resultText,
        currentInnings: 1,
        ballsPerOver: 6,
        playersPerSide: 11,
        innings: [
            {
                battingTeam: b1,
                runs: r1,
                wickets: w1,
                balls: Math.floor(o1)*6 + Math.round((o1%1)*10),
                allOut: ao1,
                extras: { wide: 0, noball: 0, bye: 0, legbye: 0, penalty: 0 }
            },
            {
                battingTeam: b2,
                runs: r2,
                wickets: w2,
                balls: Math.floor(o2)*6 + Math.round((o2%1)*10),
                allOut: ao2,
                extras: { wide: 0, noball: 0, bye: 0, legbye: 0, penalty: 0 }
            }
        ]
    };

    // Save locally
    const matches = DB.getMatches();
    matches.push(matchData);
    DB.saveMatches(matches);

    // Sync to Cloud
    if (typeof DB.syncMatchToCloud === 'function') {
        DB.syncMatchToCloud(matchData);
    }

    showToast("Match saved locally. Syncing stats...", "info");

    // Recalculate stats for involved players if provided
    if (topBatId) {
        updatePlayerStatManual(topBatId, { runs: topBatRuns, matches: 1, innings: 1 });
    }
    if (topBowlId) {
        const [wkts, runs] = topBowlStats.split('/').map(Number);
        updatePlayerStatManual(topBowlId, { wickets: wkts || 0, bowlingRuns: runs || 0, matches: 1, overs: Math.floor(o2) });
    }

    // Final full resync trigger (simulated or actual)
    if (confirm("Match saved. Do you want to trigger a full stats re-sync to update all rankings?")) {
        reSyncAllStats();
    } else {
        showToast("✅ Match added successfully", "success");
    }
}

async function updatePlayerStatManual(pId, delta) {
    const players = DB.getPlayers();
    const p = players.find(x => x.playerId === pId);
    if (!p) return;
    
    if (!p.stats) p.stats = {};
    for (let key in delta) {
        p.stats[key] = (p.stats[key] || 0) + delta[key];
    }
    
    DB.savePlayers(players);
    if (typeof DB.pushPlayerStats === 'function') {
        DB.pushPlayerStats(p);
    }
}
