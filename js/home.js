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
    const el = document.getElementById('ticker-content');
    if (!el) return;
    const matches = DB.getMatches().filter(m => (m.status === 'live' || m.status === 'paused' || m.status === 'ongoing') && m.publishLive);
    if (!matches.length) {
        const welcome = '🏏 Welcome to SLCRICKPRO — No live matches right now. Start a match to see live scores here! &nbsp;&nbsp;&nbsp;&nbsp; 🏆 Use Score New Match to begin ball-by-ball scoring &nbsp;&nbsp;&nbsp;&nbsp; 📊 Check rankings and stats in Player & Team Rankings &nbsp;&nbsp;&nbsp;&nbsp; 🛒 Visit Crick Store for equipment needs';
        el.innerHTML = welcome + '&nbsp;&nbsp;&nbsp;&nbsp;' + welcome;
        return;
    }
    const parts = matches.map(m => {
        const inn = m.innings[m.currentInnings];
        if (!inn) return '';
        const score = `${inn.runs}/${inn.wickets}`;
        const ov = formatOvers(inn.balls, m.ballsPerOver);
        return `🏏 ${m.team1} vs ${m.team2} | ${inn.battingTeam}: ${score} (${ov}) | CRR: ${formatCRR(inn.runs, inn.balls)}`;
    });
    const content = parts.join('   &nbsp;|&nbsp;   ');
    el.innerHTML = content + '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' + content;
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
