const fs = require('fs');
const p = 'd:/Mobile App/slcrickpro-master/js/scorer.js';
let c = fs.readFileSync(p, 'utf8');
const search = '    sendBroadcast(\'SHOW_STRIKER_PROFILE\', { name: strikerName, profile: p, stats, age });\n};\n}';
const replace = '    sendBroadcast(\'SHOW_STRIKER_PROFILE\', { name: strikerName, profile: p, stats, age });\n}';
if (c.includes(search)) {
    c = c.replace(search, replace);
    fs.writeFileSync(p, c, 'utf8');
    console.log('✅ scorer.js fixed with exact match');
} else {
    // Try without the spaces
    const search2 = '    sendBroadcast(\'SHOW_STRIKER_PROFILE\', { name: strikerName, profile: p, stats, age });\r\n};\r\n}';
    if (c.includes(search2)) {
        c = c.replace(search2, replace);
        fs.writeFileSync(p, c, 'utf8');
        console.log('✅ scorer.js fixed with CRLF match');
    } else {
        console.log('❌ Could not find exact search string. Checking line by line.');
        const lines = c.split(/\r?\n/);
        for(let i=0; i<lines.length; i++){
            if(lines[i].includes('SHOW_STRIKER_PROFILE') && lines[i+1] === '};' && lines[i+2] === '}'){
                lines.splice(i+1, 2, '}');
                fs.writeFileSync(p, lines.join('\n'), 'utf8');
                console.log('✅ Fixed by line replacement');
                break;
            }
        }
    }
}
