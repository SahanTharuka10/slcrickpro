// Home page JS
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    updateClock();
    setInterval(updateClock, 1000);
    updateTicker();
    setInterval(updateTicker, 15000);
});

function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    for (let i = 0; i < 40; i++) {
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
    const el = document.getElementById('current-time');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function updateTicker() {
    const el = document.getElementById('ticker-content');
    if (!el) return;
    const matches = DB.getMatches().filter(m => m.status === 'live' && m.publishLive);
    if (!matches.length) {
        el.textContent = '🏏 Welcome to SLCRICKPRO — No live matches right now. Start a match to see live scores here! &nbsp;&nbsp;&nbsp;&nbsp; 🏆 Use Score New Match to begin ball-by-ball scoring &nbsp;&nbsp;&nbsp;&nbsp; 📊 Check rankings and stats in Player & Team Rankings &nbsp;&nbsp;&nbsp;&nbsp; 🛒 Visit Crick Store for equipment needs';
        el.innerHTML = el.textContent + '&nbsp;&nbsp;&nbsp;&nbsp;' + el.textContent;
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
