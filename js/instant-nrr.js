/**
 * SLCRICKPRO – Instant NRR Generator Logic
 * Standalone tool for quick NRR calculations without database persistence.
 */

let nrrState = {
    matches: [],
    teams: [],
    tournName: "Quick Tournament",
    oversPerMatch: 20
};

function startInstantNRR() {
    const teamCount = parseInt(document.getElementById('nrr-team-count').value) || 2;
    const matchCount = parseInt(document.getElementById('nrr-match-count').value) || 2;
    const oversPerMatch = parseInt(document.getElementById('nrr-overs-per-match').value) || 20;
    const tournName = document.getElementById('nrr-tourn-name').value.trim() || "Quick Tournament";
    const teamsText = document.getElementById('nrr-teams').value.trim();
    
    if (!teamsText) {
        showToast("❌ Please enter team names", "error");
        return;
    }
    
    const teams = teamsText.split('\n').map(t => t.trim()).filter(Boolean);
    if (teams.length !== teamCount) {
        showToast(`❌ Enter exactly ${teamCount} teams`, "error");
        return;
    }
    
    nrrState.teams = teams;
    nrrState.tournName = tournName;
    nrrState.oversPerMatch = oversPerMatch;
    nrrState.matches = [];
    
    for (let i = 0; i < matchCount; i++) {
        nrrState.matches.push({
            id: i,
            team1: teams[0],
            team2: teams[1],
            r1: 0, o1: oversPerMatch, w1: 0, ao1: false,
            r2: 0, o2: oversPerMatch, w2: 0, ao2: false,
            played: false
        });
    }
    
    document.getElementById('nrr-config-step').style.display = 'none';
    document.getElementById('nrr-work-step').style.display = 'block';
    
    renderNRRMatches();
    updateNRRStandings();
}

function renderNRRMatches() {
    const container = document.getElementById('nrr-match-list');
    let html = nrrState.matches.map((m, idx) => {
        const statusClass = m.played ? 'btn-green' : 'btn-ghost';
        const label = m.played ? `${m.r1}-${m.r2}` : `Match ${idx + 1}`;
        return `<button class="btn ${statusClass} btn-sm" onclick="openNRRMatchModal(${idx})">${label}</button>`;
    }).join('');
    
    // Add Match button
    html += `<button class="btn btn-amber btn-sm" onclick="addNRRMatch()">➕ Add Match</button>`;
    container.innerHTML = html;
}

function addNRRMatch() {
    const idx = nrrState.matches.length;
    nrrState.matches.push({
        id: idx,
        team1: nrrState.teams[0],
        team2: nrrState.teams[1],
        r1: 0, o1: nrrState.oversPerMatch, w1: 0, ao1: false,
        r2: 0, o2: nrrState.oversPerMatch, w2: 0, ao2: false,
        played: false
    });
    renderNRRMatches();
    showToast("✅ Extra match added", "success");
}

function openNRRMatchModal(idx) {
    const m = nrrState.matches[idx];
    document.getElementById('nrr-modal-title').textContent = `Match ${idx + 1} Result`;
    document.getElementById('nrr-current-match-idx').value = idx;
    
    const t1Sel = document.getElementById('nrr-m-t1');
    const t2Sel = document.getElementById('nrr-m-t2');
    
    const opts = nrrState.teams.map(t => `<option value="${t}">${t}</option>`).join('');
    t1Sel.innerHTML = opts;
    t2Sel.innerHTML = opts;
    
    t1Sel.value = m.team1;
    t2Sel.value = m.team2;
    
    document.getElementById('nrr-m-r1').value = m.r1;
    document.getElementById('nrr-m-o1').value = m.o1 === 0 ? 20 : m.o1;
    document.getElementById('nrr-m-ao1').checked = m.ao1;
    
    document.getElementById('nrr-m-r2').value = m.r2;
    document.getElementById('nrr-m-o2').value = m.o2 === 0 ? 20 : m.o2;
    document.getElementById('nrr-m-ao2').checked = m.ao2;
    
    openModal('modal-nrr-match-entry');
}

function saveNRRMatch() {
    const idx = parseInt(document.getElementById('nrr-current-match-idx').value);
    const m = nrrState.matches[idx];
    
    m.team1 = document.getElementById('nrr-m-t1').value;
    m.team2 = document.getElementById('nrr-m-t2').value;
    
    if (m.team1 === m.team2) {
        showToast("❌ Team 1 and Team 2 must be different", "error");
        return;
    }
    
    m.r1 = parseInt(document.getElementById('nrr-m-r1').value) || 0;
    const o1Val = parseFloat(document.getElementById('nrr-m-o1').value) || 0;
    if (!isValidOvers(o1Val)) {
        showToast("❌ Invalid Overs (e.g. 1.6 is invalid, use 2.0)", "error");
        return;
    }
    m.o1 = o1Val;
    m.ao1 = document.getElementById('nrr-m-ao1').checked;
    
    m.r2 = parseInt(document.getElementById('nrr-m-r2').value) || 0;
    const o2Val = parseFloat(document.getElementById('nrr-m-o2').value) || 0;
    if (!isValidOvers(o2Val)) {
        showToast("❌ Invalid Overs (e.g. 1.6 is invalid, use 2.0)", "error");
        return;
    }
    m.o2 = o2Val;
    m.ao2 = document.getElementById('nrr-m-ao2').checked;
    
    m.played = true;
    
    closeModal('modal-nrr-match-entry');
    renderNRRMatches();
    updateNRRStandings();
    showToast("✅ Match result saved!", "success");
}

function updateNRRStandings() {
    const standings = {};
    nrrState.teams.forEach(t => {
        standings[t] = { played:0, won:0, lost:0, tied:0, pts:0, runsFor:0, ballsFor:0, runsAg:0, ballsAg:0, nrr:0 };
    });
    
    nrrState.matches.forEach(m => {
        if (!m.played) return;
        const s1 = standings[m.team1];
        const s2 = standings[m.team2];
        if (!s1 || !s2) return;
        
        s1.played++; s2.played++;
        
        // Convert overs to balls
        let b1 = Math.floor(m.o1) * 6 + (Math.round((m.o1 % 1) * 10));
        let b2 = Math.floor(m.o2) * 6 + (Math.round((m.o2 % 1) * 10));
        
        // Handlers for All Out (max overs)
        if (m.ao1) b1 = nrrState.oversPerMatch * 6;
        if (m.ao2) b2 = nrrState.oversPerMatch * 6;
        
        s1.runsFor += m.r1; s1.ballsFor += b1;
        s1.runsAg += m.r2; s1.ballsAg += b2;
        
        s2.runsFor += m.r2; s2.ballsFor += b2;
        s2.runsAg += m.r1; s2.ballsAg += b1;
        
        if (m.r1 > m.r2) { s1.won++; s1.pts += 2; s2.lost++; }
        else if (m.r2 > m.r1) { s2.won++; s2.pts += 2; s1.lost++; }
        else { s1.tied++; s2.tied++; s1.pts += 1; s2.pts += 1; }
    });
    
    const sorted = Object.entries(standings).map(([name, s]) => {
        const rrFor = s.ballsFor > 0 ? (s.runsFor / (s.ballsFor / 6)) : 0;
        const rrAg = s.ballsAg > 0 ? (s.runsAg / (s.ballsAg / 6)) : 0;
        s.nrr = (rrFor - rrAg).toFixed(3);
        return { name, ...s };
    }).sort((a,b) => b.pts - a.pts || b.nrr - a.nrr);
    
    const body = document.getElementById('nrr-standings-body');
    body.innerHTML = sorted.map(s => `<tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.played}</td><td>${s.won}</td><td>${s.lost}</td><td>${s.tied}</td>
        <td><strong>${s.pts}</strong></td>
        <td style="color:${s.nrr >= 0 ? '#00e676' : '#ff6d3b'}">${s.nrr >=0 ? '+' : ''}${s.nrr}</td>
    </tr>`).join('');
}

function resetInstantNRR() {
    if (!confirm("Are you sure? This will clear all data in this session.")) return;
    document.getElementById('nrr-config-step').style.display = 'block';
    document.getElementById('nrr-work-step').style.display = 'none';
}

function printInstantNRR() {
    window.print();
}

/**
 * Validates cricket overs (decimal part should be .0 to .5)
 */
function isValidOvers(val) {
    const frac = Math.round((val % 1) * 10);
    return frac >= 0 && frac <= 5;
}
