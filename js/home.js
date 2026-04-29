window.renderOngoing = function() {
    console.log("🔄 Home Ticker refreshing from Global Sync...");
    updateTicker();
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof window.pullGlobalData === 'function') window.pullGlobalData();
    initParticles();
    updateClock();
    setInterval(updateClock, 1000);
    updateTicker();
    setInterval(updateTicker, 15000);
});

function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    // Reduce particle count on mobile (15 vs 40)
    const isMobile = window.innerWidth < 768;
    const count = isMobile ? 15 : 40;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 3 + 1;
        p.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      width: ${size}px;
      height: ${size}px;
      opacity: ${Math.random() * 0.5 + 0.1};
      animation-duration: ${Math.random() * 20 + 10}s;
      animation-delay: ${Math.random() * -20}s;
    `;
        container.appendChild(p);
    }
}

function updateClock() {
    // Check both potential IDs used in different templates
    const el = document.getElementById('live-clock') || document.getElementById('current-time') || document.getElementById('overlay-live-clock');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function updateTicker() {
    const container = document.getElementById('live-cards-container');
    const panel = document.getElementById('top-live-panel');
    if (!container || !panel) return;

    const matches = DB.getMatches().filter(m => (m.status === 'live' || m.status === 'paused' || m.status === 'ongoing') && m.publishLive);
    
    if (!matches.length) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    
    container.innerHTML = matches.map(m => {
        const inn = m.innings[m.currentInnings];
        if (!inn) return '';
        
        let innText = '';
        if (m.currentInnings === 0) innText = '1ST INNINGS IN PROGRESS';
        else if (m.currentInnings === 1) innText = '2ND INNINGS IN PROGRESS';
        else innText = 'INNINGS IN PROGRESS';

        // Check if there is a target (in 2nd innings)
        if (m.currentInnings === 1 && m.innings[0]) {
            const target = m.innings[0].runs + 1;
            const needs = target - inn.runs;
            if (needs > 0) {
                innText = `${inn.battingTeam} NEEDS ${needs} RUNS`;
            } else if (needs <= 0) {
                innText = 'SCORES LEVEL';
            }
        }

        const teamA = m.team1;
        const teamB = m.team2;
        
        // Determine scores for Team A and Team B
        let aScoreHTML = '<span class="live-yet-to-bat">YET TO BAT</span>';
        let bScoreHTML = '<span class="live-yet-to-bat">YET TO BAT</span>';

        // If Team 1 is batting now
        if (inn.battingTeam === teamA) {
            aScoreHTML = `${inn.runs}-${inn.wickets} <span class="live-team-overs">(${formatOvers(inn.balls, m.ballsPerOver)} ov)</span>`;
            if (m.currentInnings === 1 && m.innings[0]) {
                const prevInn = m.innings[0];
                bScoreHTML = `${prevInn.runs}-${prevInn.wickets} <span class="live-team-overs">(${formatOvers(prevInn.balls, m.ballsPerOver)} ov)</span>`;
            }
        } else if (inn.battingTeam === teamB) {
            bScoreHTML = `${inn.runs}-${inn.wickets} <span class="live-team-overs">(${formatOvers(inn.balls, m.ballsPerOver)} ov)</span>`;
            if (m.currentInnings === 1 && m.innings[0]) {
                const prevInn = m.innings[0];
                aScoreHTML = `${prevInn.runs}-${prevInn.wickets} <span class="live-team-overs">(${formatOvers(prevInn.balls, m.ballsPerOver)} ov)</span>`;
            }
        }

        const tournName = m.tournamentName ? `${m.tournamentName} - LIVE` : 'LIVE MATCH';

        return `
        <div class="live-match-card" onclick="window.location.href='pages/score-match.html?matchId=${m.id}'">
            <div class="live-card-header">${tournName}</div>
            <div class="live-card-body">
                <div class="live-team-row">
                    <div class="live-team-name">${teamA}</div>
                    <div class="live-team-score">${aScoreHTML}</div>
                </div>
                <div class="live-team-row">
                    <div class="live-team-name">${teamB}</div>
                    <div class="live-team-score">${bScoreHTML}</div>
                </div>
            </div>
            <div class="live-card-footer">${innText}</div>
        </div>
        `;
    }).join('');
}

function formatOvers(balls, bpo = 6) {
    return `${Math.floor(balls / bpo)}.${balls % bpo}`;
}

function formatCRR(runs, balls, bpo = 6) {
    return balls ? (runs / (balls / bpo)).toFixed(2) : '0.00';
}

// ========== GLOBAL SYNC HANDLER ==========
window.renderOngoing = updateTicker;

// Handle cross-tab updates (e.g. from score-match.html)
window.addEventListener('storage', (e) => {
    if (e.key === 'cricpro_force_update') {
        updateTicker();
    }
});
