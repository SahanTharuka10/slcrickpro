const fs = require('fs');
const path = require('path');

const filePath = 'd:/Mobile App/slcrickpro-master/js/scorer.js';
let content = fs.readFileSync(filePath, 'utf8');

const calculateAgeFunc = `
function calculateAge(dob) {
    if (!dob) return "";
    try {
        const birthDate = new Date(dob);
        if (isNaN(birthDate.getTime())) return "";
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age > 0 ? age : "";
    } catch(e) { return ""; }
}
`;

if (!content.includes('function calculateAge')) {
    content = content.replace('function resolvePlayerProfileForBatter', calculateAgeFunc + '\nfunction resolvePlayerProfileForBatter');
}

// Update broadcastStrikerProfile to SHOW_STRIKER_PROFILE with internal age calculation
const oldBroadSearch = /function\s+broadcastStrikerProfile\(\)\s*\{[\s\S]*?sendBroadcast\('SHOW_BATTER_PROFILES'[\s\S]*?\}\)/;
const newBroad = `function broadcastStrikerProfile() {
    const m = currentMatch;
    if (!m) return;
    const inn = m.innings[m.currentInnings];
    if (!inn) return;
    const strikerName = getStrikerBatterName(inn);
    if (!strikerName) return;
    
    const p = resolvePlayerProfileForBatter(inn, strikerName);
    const stats = inn.batsmen.find(x => x.name === strikerName) || { runs:0, balls:0, fours:0, sixes:0 };
    const age = p ? calculateAge(p.dob) : "";
    
    sendBroadcast('SHOW_STRIKER_PROFILE', { name: strikerName, profile: p, stats, age });
}`;

content = content.replace(oldBroadSearch, newBroad);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ scorer.js updated successfully');
