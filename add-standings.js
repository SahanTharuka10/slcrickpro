const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'scorer.js');
let content = fs.readFileSync(filePath, 'utf8');

const targetStr = 'function renderTournamentTeams() {';

const newLogic = `
function renderTournamentStandings() {
    const t = currentTournament;
    if (!t) return;
    
    const container = document.getElementById('tm-standings-table');
    if (!container) return;

    if (!t.teams || t.teams.length === 0) {
        container.innerHTML = '<div style="padding:40px;text-align:center;opacity:0.5">No teams added yet.</div>';
        return;
    }

    // Initialize standings map
    const standings = {};
    t.teams.forEach(team => {
        standings[team] = { played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0, nrr: 0 };
    });

    // Process all completed matches to calculate points and NRR
    if (t.matches) {
        t.matches.forEach(mId => {
            const m = DB.getMatch(mId);
            if (!m || m.status !== 'completed' || !m.innings || m.innings.length < 2) return;

            const t1 = m.team1;
            const t2 = m.team2;
            
            // If teams are missing from original roster, dynamically add them
            if (t1 !== 'TBD' && !standings[t1]) standings[t1] = { played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0, nrr: 0 };
            if (t2 !== 'TBD' && !standings[t2]) standings[t2] = { played: 0, won: 0, lost: 0, tied: 0, nr: 0, points: 0, runsFor: 0, oversFor: 0, runsAgainst: 0, oversAgainst: 0, nrr: 0 };

            if (t1 === 'TBD' || t2 === 'TBD') return;

            const inn1 = m.innings[0];
            const inn2 = m.innings[1];
            
            // Batting first team
            const team1Bat = (inn1.battingTeam === t1) ? inn1 : inn2;
            const team1Bowl = (inn1.bowlingTeam === t1) ? inn1 : inn2;
            
            // Batting second team
            const team2Bat = (inn1.battingTeam === t2) ? inn1 : inn2;
            const team2Bowl = (inn1.bowlingTeam === t2) ? inn1 : inn2;

            if (!team1Bat || !team2Bat) return;

            standings[t1].played++;
            standings[t2].played++;

            // Win/Loss Calculation
            let result = m.resultText || '';
            if (result.includes(t1) && result.includes('won')) {
                standings[t1].won++; standings[t1].points += 2;
                standings[t2].lost++;
            } else if (result.includes(t2) && result.includes('won')) {
                standings[t2].won++; standings[t2].points += 2;
                standings[t1].lost++;
            } else if (result.toLowerCase().includes('tie') || result.toLowerCase().includes('drawn')) {
                standings[t1].tied++; standings[t1].points += 1;
                standings[t2].tied++; standings[t2].points += 1;
            } else if (result.toLowerCase().includes('no result') || result.toLowerCase().includes('abandoned')) {
                standings[t1].nr++; standings[t1].points += 1;
                standings[t2].nr++; standings[t2].points += 1;
            } else {
                // Fallback check if resultText is weird
                if (team1Bat.runs > team2Bat.runs) { standings[t1].won++; standings[t1].points += 2; standings[t2].lost++; }
                else if (team2Bat.runs > team1Bat.runs) { standings[t2].won++; standings[t2].points += 2; standings[t1].lost++; }
                else { standings[t1].tied++; standings[t2].tied++; standings[t1].points += 1; standings[t2].points += 1; }
            }

            // NRR Calculation Helpers
            const getOvers = (balls, isAllOut, maxOvers) => {
                if (isAllOut) return maxOvers;
                return Math.floor(balls / 6) + (balls % 6) / 6;
            };

            const t1AllOut = team1Bat.wickets >= m.playersPerSide - 1 || team1Bat.isAllOut;
            const t2AllOut = team2Bat.wickets >= m.playersPerSide - 1 || team2Bat.isAllOut;

            // Update runs and overs
            standings[t1].runsFor += team1Bat.runs;
            standings[t1].oversFor += getOvers(team1Bat.balls, t1AllOut, m.overs);
            standings[t1].runsAgainst += team2Bat.runs;
            standings[t1].oversAgainst += getOvers(team2Bat.balls, t2AllOut, m.overs);

            standings[t2].runsFor += team2Bat.runs;
            standings[t2].oversFor += getOvers(team2Bat.balls, t2AllOut, m.overs);
            standings[t2].runsAgainst += team1Bat.runs;
            standings[t2].oversAgainst += getOvers(team1Bat.balls, t1AllOut, m.overs);
        });
    }

    // Calculate NRR
    const teamsArr = Object.keys(standings).map(team => {
        const s = standings[team];
        if (s.oversFor > 0 && s.oversAgainst > 0) {
            s.nrr = (s.runsFor / s.oversFor) - (s.runsAgainst / s.oversAgainst);
        }
        return { name: team, ...s };
    });

    // Sort by points, then NRR
    teamsArr.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return b.nrr - a.nrr;
    });

    let html = \`
    <div style="background:rgba(255,255,255,0.03); border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.08)">
        <table style="width:100%; border-collapse:collapse; text-align:center; font-size:13px">
            <thead>
                <tr style="background:rgba(0,0,0,0.3); color:var(--c-muted); font-size:11px; text-transform:uppercase; letter-spacing:1px">
                    <th style="padding:12px 16px; text-align:left">Team</th>
                    <th style="padding:12px 8px">P</th>
                    <th style="padding:12px 8px">W</th>
                    <th style="padding:12px 8px">L</th>
                    <th style="padding:12px 8px">PTS</th>
                    <th style="padding:12px 16px; text-align:right">NRR</th>
                </tr>
            </thead>
            <tbody>
    \`;

    teamsArr.forEach((t, i) => {
        const isTop4 = i < 4;
        const color = isTop4 ? 'var(--c-primary)' : 'var(--c-text)';
        const bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent';
        
        html += \`
            <tr style="background:\${bg}; border-bottom:1px solid rgba(255,255,255,0.05)">
                <td style="padding:12px 16px; text-align:left; font-weight:800; color:\${color}">
                    \${i + 1}. \${t.name}
                </td>
                <td style="padding:12px 8px; opacity:0.8">\${t.played}</td>
                <td style="padding:12px 8px; color:#00e676; font-weight:700">\${t.won}</td>
                <td style="padding:12px 8px; color:#ff1744; font-weight:700">\${t.lost}</td>
                <td style="padding:12px 8px; font-weight:900; font-size:15px">\${t.points}</td>
                <td style="padding:12px 16px; text-align:right; font-weight:700; color:\${t.nrr >= 0 ? '#38bdf8' : '#ff8a65'}">
                    \${t.nrr > 0 ? '+' : ''}\${t.nrr.toFixed(3)}
                </td>
            </tr>
        \`;
    });

    html += \`
            </tbody>
        </table>
    </div>
    <div style="font-size:11px; opacity:0.5; margin-top:12px; text-align:center;">
        * NRR formula: (Total Runs Scored / Total Overs Faced) - (Total Runs Conceded / Total Overs Bowled).
    </div>
    \`;

    container.innerHTML = html;
}

`;

if (!content.includes('function renderTournamentStandings()')) {
    content = content.replace(targetStr, newLogic + targetStr);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Added renderTournamentStandings');
} else {
    console.log('Already exists');
}
