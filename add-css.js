const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'pages', 'overlay.html');
let content = fs.readFileSync(filePath, 'utf8');

const cssToAdd = `
        /* --- MODE 2: MODERN SCORECARD WITH LOGOS --- */
        .overlay-container.mode-2 {
            bottom: 40px; left: 50%; right: auto;
            transform: translateX(-50%);
            display: flex; gap: 15px; align-items: stretch;
            background: transparent; box-shadow: none; padding: 0; border-radius: 0;
            backdrop-filter: none;
        }
        .m2-team-score {
            display: flex; background: rgba(15, 23, 42, 0.95);
            border-radius: 12px; overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            border: 2px solid rgba(255,255,255,0.1);
        }
        .m2-logo-box {
            width: 70px; display: flex; align-items: center; justify-content: center;
            background: #e61b4d; color: #fff; font-weight: 900; font-size: 20px;
        }
        .m2-team-names {
            padding: 10px 20px; display: flex; flex-direction: column; justify-content: center;
            border-right: 1px solid rgba(255,255,255,0.1);
        }
        .m2-team-names .name { font-size: 22px; font-weight: 900; color: #fff; letter-spacing: 1px; }
        .m2-team-names .vs { font-size: 11px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 2px; }
        
        .m2-score-box {
            padding: 10px 25px; display: flex; flex-direction: column; justify-content: center; align-items: center;
            background: #0f172a;
        }
        .m2-score-box .score { font-size: 32px; font-weight: 950; color: #fbbf24; line-height: 1; }
        .m2-score-box .overs { font-size: 14px; font-weight: 800; color: #fff; opacity: 0.8; margin-top: 4px; }

        .m2-player-box {
            display: flex; background: rgba(30, 41, 59, 0.9);
            border-radius: 12px; padding: 6px 16px 6px 6px; align-items: center; gap: 12px;
            border: 1px solid rgba(255,255,255,0.05); transition: all 0.3s;
        }
        .m2-player-box.active {
            background: rgba(15, 23, 42, 0.95); border-color: #38bdf8;
            box-shadow: 0 0 20px rgba(56, 189, 248, 0.2);
        }
        .m2-player-photo img { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; background: #334155; }
        .m2-player-info { display: flex; flex-direction: column; }
        .m2-player-info .p-name { font-size: 15px; font-weight: 800; color: #fff; margin-bottom: 2px; }
        .m2-player-info .p-score { font-size: 18px; font-weight: 900; color: #fff; }
        .m2-player-info .p-score span { font-size: 12px; color: #94a3b8; font-weight: 700; margin-left: 6px; }

        .m2-info-pill {
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            background: rgba(15, 23, 42, 0.9); border-radius: 12px; padding: 0 16px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .m2-info-pill .label { font-size: 10px; font-weight: 800; color: #94a3b8; letter-spacing: 1px; }
        .m2-info-pill .value { font-size: 16px; font-weight: 900; color: #fff; }

        .m2-bowler-box {
            display: flex; background: rgba(30, 41, 59, 0.9);
            border-radius: 12px; padding: 6px 16px 6px 6px; align-items: center; gap: 12px;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .m2-bowler-box .m2-player-info .p-score { color: #fbbf24; }

        .m2-dots-section {
            display: flex; align-items: center; background: rgba(15, 23, 42, 0.9);
            padding: 0 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);
        }
        .m2-dots-row { display: flex; gap: 6px; }
        .m2-dots-row .dot {
            width: 28px; height: 28px; border-radius: 50%;
            background: rgba(255,255,255,0.1); color: #fff;
            display: flex; align-items: center; justify-content: center;
            font-size: 13px; font-weight: 900;
        }
        .m2-dots-row .dot.b { background: #38bdf8; color: #fff; box-shadow: 0 0 10px #38bdf8; }
        .m2-dots-row .dot.w { background: #e32459; color: #fff; box-shadow: 0 0 10px #e32459; }

        .m2-logo-box.right-logo { background: #38bdf8; border-radius: 0 10px 10px 0; }
        .m2-team-score.right-side { border-radius: 12px; flex-direction: row-reverse; }
        .m2-team-score.right-side .m2-team-names { border-right: none; border-left: 1px solid rgba(255,255,255,0.1); text-align: right; }

        /* --- MODE 3: MANUAL DETAILED BAR --- */
        .overlay-container.mode-3 {
            bottom: 40px; left: 50%; right: auto; transform: translateX(-50%);
            width: 1400px; max-width: 95vw;
            background: linear-gradient(90deg, rgba(15,23,42,0.95), rgba(30,41,59,0.95));
            border-radius: 16px; padding: 0; border: 2px solid rgba(255,255,255,0.1);
            display: grid; grid-template-columns: 250px 1fr 300px; align-items: stretch;
            box-shadow: 0 20px 50px rgba(0,0,0,0.6); overflow: hidden;
            backdrop-filter: blur(10px);
        }
        .m3-left {
            background: linear-gradient(135deg, #e61b4d, #ff4081);
            padding: 15px 25px; display: flex; flex-direction: column; justify-content: center;
            position: relative; overflow: hidden;
        }
        .m3-left::after { content: ''; position: absolute; top:0; right:0; bottom:0; width: 40px; background: linear-gradient(90deg, transparent, rgba(0,0,0,0.2)); }
        .m3-score { font-size: 42px; font-weight: 950; color: #fff; line-height: 1; margin-bottom: 4px; display:flex; align-items:baseline; gap:8px; }
        .m3-score small { font-size: 20px; font-weight: 800; opacity: 0.9; }
        .m3-teams { font-size: 16px; font-weight: 800; color: rgba(255,255,255,0.9); letter-spacing: 1px; text-transform: uppercase; }
        
        .m3-center { padding: 15px 30px; display: flex; flex-direction: column; justify-content: space-around; }
        .m3-row { display: flex; align-items: center; gap: 15px; }
        .m3-row .lbl { font-size: 12px; font-weight: 800; color: #94a3b8; letter-spacing: 1px; }
        .m3-row .val { font-size: 18px; font-weight: 800; color: #e2e8f0; margin-right: 15px; }
        .m3-row .val.highlight { color: #fbbf24; font-weight: 950; font-size: 20px; }
        
        .m3-right {
            background: rgba(0,0,0,0.3); padding: 15px 20px;
            display: flex; flex-direction: column; justify-content: center; align-items: flex-end;
            border-left: 1px solid rgba(255,255,255,0.05);
        }
        .m3-right-title { font-size: 10px; font-weight: 800; color: #94a3b8; letter-spacing: 2px; margin-bottom: 8px; text-transform: uppercase; }
        .m3-recent { display: flex; gap: 6px; }
        .m3-recent span {
            display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center;
            background: rgba(255,255,255,0.1); border-radius: 50%; font-size: 14px; font-weight: 900; color: #fff;
        }
        .m3-recent span.w { background: #e32459; box-shadow: 0 0 10px rgba(227,36,89,0.5); }
        .m3-recent span.b { background: #38bdf8; box-shadow: 0 0 10px rgba(56,189,248,0.5); }
`;

if (!content.includes('MODE 2: MODERN SCORECARD')) {
    content = content.replace('</style>', cssToAdd + '\n    </style>');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('CSS added successfully.');
} else {
    console.log('CSS already exists.');
}
