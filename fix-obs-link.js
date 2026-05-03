const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'pages', 'score-match.html');
let content = fs.readFileSync(filePath, 'utf8');

const scriptToAdd = `
                function copyObsLink() {
                    const url = window.location.origin + '/pages/overlay.html';
                    navigator.clipboard.writeText(url).then(() => {
                        showToast('✅ OBS URL Copied to Clipboard!', 'success');
                    }).catch(err => {
                        showToast('Failed to copy URL', 'error');
                    });
                }
`;

if (!content.includes('function copyObsLink()')) {
    content = content.replace('function broadcastTeamCard(teamIdx) {', scriptToAdd + '\n                function broadcastTeamCard(teamIdx) {');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('copyObsLink added to score-match.html');
} else {
    console.log('copyObsLink already exists.');
}
