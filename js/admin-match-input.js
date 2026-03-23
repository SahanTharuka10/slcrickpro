/**
 * SLCRICKPRO – Official Match Entry (Admin)
 * Manual completed-match input with up to 5 batters + 5 bowlers for both teams.
 */

document.addEventListener('DOMContentLoaded', () => {});

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
        updateAMETeams();
    }

    resetAMEPlayerRows();
}

function updateAMETeams() {
    const t1 = document.getElementById('ame-t1').value;
    const t2 = document.getElementById('ame-t2').value;
    const b1 = document.getElementById('ame-inn1-bat').value;

    const b2Name = b1 === t1 ? t2 : t1;
    document.getElementById('ame-inn2-bat-name').textContent = b2Name || '--';
}

function resetAMEPlayerRows() {
    ['team1', 'team2'].forEach(teamKey => {
        document.getElementById(`ame-${teamKey}-batters`).innerHTML = '';
        document.getElementById(`ame-${teamKey}-bowlers`).innerHTML = '';
        addAMEPlayerRow(teamKey, 'bat');
        addAMEPlayerRow(teamKey, 'bat');
        addAMEPlayerRow(teamKey, 'bowl');
        addAMEPlayerRow(teamKey, 'bowl');
    });
}

function addAMEPlayerRow(teamKey, role) {
    const container = document.getElementById(`ame-${teamKey}-${role === 'bat' ? 'batters' : 'bowlers'}`);
    if (!container) return;
    const current = container.querySelectorAll('.ame-player-row').length;
    if (current >= 5) {
        showToast('❌ Maximum 5 entries allowed', 'error');
        return;
    }

    const idx = current + 1;
    const row = document.createElement('div');
    row.className = 'ame-player-row';
    row.style.cssText = 'display:grid; grid-template-columns: 1.2fr 0.6fr 0.6fr auto; gap:8px; margin-bottom:8px;';

    if (role === 'bat') {
        row.innerHTML = `
            <input type="text" class="form-input ame-pid" placeholder="Batter ${idx} ID (CP0001)" />
            <input type="number" class="form-input ame-runs" placeholder="Runs" value="0" min="0" />
            <input type="number" class="form-input ame-balls" placeholder="Balls" value="0" min="0" />
            <button class="btn btn-red btn-sm" type="button" onclick="removeAMEPlayerRow(this)">✕</button>
        `;
    } else {
        row.innerHTML = `
            <input type="text" class="form-input ame-pid" placeholder="Bowler ${idx} ID (CP0001)" />
            <input type="number" class="form-input ame-wkts" placeholder="Wkts" value="0" min="0" />
            <input type="number" class="form-input ame-runs" placeholder="Runs" value="0" min="0" />
            <button class="btn btn-red btn-sm" type="button" onclick="removeAMEPlayerRow(this)">✕</button>
        `;
    }
    container.appendChild(row);
}

function removeAMEPlayerRow(btn) {
    const parent = btn.closest('.ame-player-row');
    if (!parent) return;
    const wrap = parent.parentElement;
    if (wrap.querySelectorAll('.ame-player-row').length <= 1) {
        showToast('❌ Keep at least 1 row', 'error');
        return;
    }
    parent.remove();
}

function parseAMEBatters(teamKey) {
    const rows = document.querySelectorAll(`#ame-${teamKey}-batters .ame-player-row`);
    const data = [];
    rows.forEach(r => {
        const playerId = (r.querySelector('.ame-pid')?.value || '').trim();
        const runs = parseInt(r.querySelector('.ame-runs')?.value) || 0;
        const balls = parseInt(r.querySelector('.ame-balls')?.value) || 0;
        if (!playerId && runs === 0 && balls === 0) return;
        data.push({ playerId, runs, balls, fours: 0, sixes: 0, notOut: false });
    });
    return data.slice(0, 5);
}

function parseAMEBowlers(teamKey) {
    const rows = document.querySelectorAll(`#ame-${teamKey}-bowlers .ame-player-row`);
    const data = [];
    rows.forEach(r => {
        const playerId = (r.querySelector('.ame-pid')?.value || '').trim();
        const wickets = parseInt(r.querySelector('.ame-wkts')?.value) || 0;
        const runs = parseInt(r.querySelector('.ame-runs')?.value) || 0;
        if (!playerId && wickets === 0 && runs === 0) return;
        data.push({ playerId, wickets, runs, balls: 0, maidens: 0 });
    });
    return data.slice(0, 5);
}

async function saveOfficialMatchAdmin() {
    const t1 = document.getElementById('ame-t1').value;
    const t2 = document.getElementById('ame-t2').value;
    const name = document.getElementById('ame-name').value.trim() || 'Official Match';
    const overs = parseInt(document.getElementById('ame-overs').value) || 20;

    const b1 = document.getElementById('ame-inn1-bat').value;
    const b2 = b1 === t1 ? t2 : t1;

    const r1 = parseInt(document.getElementById('ame-inn1-runs').value) || 0;
    const w1 = parseInt(document.getElementById('ame-inn1-wkts').value) || 0;
    const o1 = parseFloat(document.getElementById('ame-inn1-ovPlayed').value) || 0;
    const ao1 = document.getElementById('ame-inn1-ao').checked;

    const r2 = parseInt(document.getElementById('ame-inn2-runs').value) || 0;
    const w2 = parseInt(document.getElementById('ame-inn2-wkts').value) || 0;
    const o2 = parseFloat(document.getElementById('ame-inn2-ovPlayed').value) || 0;
    const ao2 = document.getElementById('ame-inn2-ao').checked;

    if (t1 === t2) {
        showToast('❌ Select different teams', 'error');
        return;
    }

    const team1Batters = parseAMEBatters('team1');
    const team1Bowlers = parseAMEBowlers('team1');
    const team2Batters = parseAMEBatters('team2');
    const team2Bowlers = parseAMEBowlers('team2');

    const matchId = 'MATCH-' + Date.now();
    const resultText = r1 > r2
        ? `${b1} won by ${r1 - r2} runs`
        : (r2 > r1 ? `${b2} won by ${w2 < 10 ? (10 - w2) + ' wickets' : 'runs'}` : 'Match Tied');

    const inn1Balls = Math.floor(o1) * 6 + Math.round((o1 % 1) * 10);
    const inn2Balls = Math.floor(o2) * 6 + Math.round((o2 % 1) * 10);

    const inn1Batters = b1 === t1 ? team1Batters : team2Batters;
    const inn1Bowlers = b1 === t1 ? team2Bowlers : team1Bowlers;
    const inn2Batters = b2 === t1 ? team1Batters : team2Batters;
    const inn2Bowlers = b2 === t1 ? team2Bowlers : team1Bowlers;

    const matchData = {
        id: matchId,
        team1: t1,
        team2: t2,
        overs: overs,
        scheduledName: name,
        type: 'single',
        isOfficial: true,
        status: 'completed',
        createdAt: Date.now(),
        result: resultText,
        currentInnings: 1,
        ballsPerOver: 6,
        playersPerSide: 11,
        battingFirst: b1,
        fieldingFirst: b2,
        innings: [
            {
                battingTeam: b1,
                bowlingTeam: b2,
                runs: r1,
                wickets: w1,
                balls: inn1Balls,
                allOut: ao1,
                extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
                batsmen: inn1Batters,
                bowlers: inn1Bowlers
            },
            {
                battingTeam: b2,
                bowlingTeam: b1,
                runs: r2,
                wickets: w2,
                balls: inn2Balls,
                allOut: ao2,
                extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0 },
                batsmen: inn2Batters,
                bowlers: inn2Bowlers
            }
        ]
    };

    const matches = DB.getMatches();
    matches.push(matchData);
    DB.saveMatches(matches);

    showToast('Match saved. Updating stats...', 'info');
    reSyncAllStats();
}
