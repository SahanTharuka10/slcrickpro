/**
 * SLCRICKPRO – Match Report Engine
 * Specialized module for deep data analysis and report assembly.
 */

const MatchReportEngine = {
    /**
     * Extracts an over-by-over summary for a specific innings.
     */
    getOverSummary(innings, bpo = 6) {
        if (!innings || !innings.overHistory) return [];
        
        return innings.overHistory.map((over, idx) => {
            let runs = 0;
            let wkts = 0;
            let extras = 0;
            let bowler = over.length > 0 ? over[0].bowlerName : 'Unknown';
            
            over.forEach(ball => {
                runs += (ball.runs || 0);
                if (ball.wicket) wkts++;
                if (ball.type !== 'run') extras++;
            });
            
            return {
                overNum: idx + 1,
                runs,
                wkts,
                extras,
                bowler
            };
        });
    },

    /**
     * Assembles a high-detail metadata object for a match.
     */
    assembleReportData(match) {
        const report = {
            id: 'REP-' + Date.now() + '-' + Math.floor(Math.random()*1000),
            matchId: match.id,
            generatedAt: Date.now(),
            matchMeta: {
                teams: `${match.team1} vs ${match.team2}`,
                venue: match.venue || 'Home Ground',
                format: match.matchFormat || 'Limited Overs',
                tournament: match.tournamentName || 'Single Match',
                toss: match.tossWinner ? `${match.tossWinner} won & elected to ${match.tossDecision}` : 'N/A'
            },
            innings: (match.innings || []).map((inn, idx) => ({
                team: inn.battingTeam || (idx % 2 === 0 ? (match.battingFirst || match.team1) : (match.fieldingFirst || match.team2)),
                score: `${inn.runs}/${inn.wickets}`,
                overs: `${Math.floor(inn.balls/6)}.${inn.balls%6}`,
                overByOver: this.getOverSummary(inn, match.ballsPerOver),
                partnerships: inn.partnerships || [],
                fallOfWickets: inn.fallOfWickets || []
            }))
        };
        return report;
    },

    /**
     * Renders a high-fidelity PDF report for the given match.
     */
    async generatePDF(matchId) {
        const m = DB.getMatch(matchId);
        if (!m) return alert('Match not found');

        // Show UI Overlay
        const overlay = document.createElement('div');
        overlay.id = 'pdf-gen-overlay';
        overlay.style = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:99999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:'Outfit',sans-serif; backdrop-filter:blur(10px);`;
        overlay.innerHTML = `
            <div style="font-size:60px; margin-bottom:20px">📊</div>
            <div style="font-size:24px; font-weight:900; letter-spacing:1px">SLCRICKPRO ANALYTICS</div>
            <div style="font-size:14px; opacity:0.7; margin-top:8px">Assembling professional performance report...</div>
            <div style="margin-top:30px; width:200px; height:4px; background:rgba(255,255,255,0.1); border-radius:2px; overflow:hidden">
                <div id="pdf-progress" style="width:0%; height:100%; background:#ffc107; transition:width 2s ease"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => { const p = document.getElementById('pdf-progress'); if(p) p.style.width = '100%'; }, 50);

        const container = document.createElement('div');
        // FIXED: Using position:fixed at top:0 with z-index:-9999 ensures it's in the viewport for html2canvas
        // but hidden behind the main UI. Far-off absolute positions can cause blank captures.
        container.style = `position:fixed; top:0; left:0; width:1000px; background:#fff; color:#111; font-family:'Outfit',sans-serif; z-index:-9999;`;
        const renderInningsTablePDF = (inn, teamName, innLabel) => {
            if (!inn) return `<div style="margin-bottom:40px; padding:40px; border:2px dashed #eee; text-align:center; color:#bbb; border-radius:20px; font-weight:600">Waiting for ${innLabel} Data...</div>`;
            const bpo = m.ballsPerOver || 6;
            
            // Calculate extras total - Supporting both long and short naming conventions
            const ex = inn.extras || { wides: 0, noBalls: 0, byes: 0, legByes: 0, wd: 0, nb: 0, b:0, lb: 0 };
            const w = ex.wides || ex.wd || 0;
            const nb = ex.noBalls || ex.nb || 0;
            const b = ex.byes || ex.b || 0;
            const lb = ex.legByes || ex.lb || 0;
            const exTotal = w + nb + b + lb;

            return `
                <div style="margin-bottom:60px; border:1px solid #f0f0f0; border-radius:30px; overflow:hidden; box-shadow:0 25px 50px rgba(0,0,0,0.04); background:#fff">
                    <div style="background:linear-gradient(to right, #f8f9fa, #ffffff); padding:30px 40px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee">
                        <div>
                            <div style="font-size:11px; font-weight:900; color:#aaa; letter-spacing:2px; text-transform:uppercase; margin-bottom:4px">${innLabel.toUpperCase()}</div>
                            <div style="font-size:32px; font-weight:950; color:#1a237e">${teamName.toUpperCase()}</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:42px; font-weight:950; color:#1a237e">${inn.runs}/${inn.wickets}</div>
                            <div style="font-size:16px; color:#666; font-weight:800">(${Math.floor(inn.balls/bpo)}.${inn.balls%bpo} OVERS)</div>
                        </div>
                    </div>
                    
                    <div style="padding:40px">
                        <!-- Batting Section -->
                        <div style="font-size:12px; font-weight:900; color:#1a237e; letter-spacing:1px; text-transform:uppercase; margin-bottom:15px; border-left:4px solid #ffc107; padding-left:12px">Batting Scorecard</div>
                        <table style="width:100%; border-collapse:collapse; margin-bottom:30px">
                            <thead><tr style="text-align:left; font-size:10px; font-weight:900; color:#bbb; text-transform:uppercase; border-bottom:1.5px solid #eee"><th style="padding:10px">BATSMAN</th><th style="padding:10px; text-align:center">R</th><th style="padding:10px; text-align:center">B</th><th style="padding:10px; text-align:center">4S</th><th style="padding:10px; text-align:center">6S</th><th style="padding:10px; text-align:right">SR</th></tr></thead>
                            <tbody>
                                ${(inn.batsmen || []).map(b => `
                                    <tr style="border-bottom:1px solid #fcfcfc">
                                        <td style="padding:15px 10px"><div style="font-weight:800; color:#333; font-size:17px">${b.name}</div><div style="font-size:10px; color:#999; text-transform:uppercase; font-weight:700">${b.dismissal || 'not out'}</div></td>
                                        <td style="text-align:center; font-weight:950; color:#1a237e; font-size:19px">${b.runs || 0}</td>
                                        <td style="text-align:center; color:#555; font-weight:600">${b.balls || 0}</td>
                                        <td style="text-align:center; color:#777">${b.fours || 0}</td>
                                        <td style="text-align:center; color:#777">${b.sixes || 0}</td>
                                        <td style="text-align:right; font-weight:800; color:#bbb">${b.balls > 0 ? ((b.runs/b.balls)*100).toFixed(1) : '0.0'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>

                        <!-- Extras Row -->
                        <div style="background:#fcfcfc; padding:15px 25px; border-radius:15px; display:flex; justify-content:space-between; align-items:center; margin-bottom:40px; border:1px solid #f0f0f0">
                            <span style="font-size:13px; font-weight:800; color:#666">EXTRAS: <span style="color:#1a237e">${exTotal}</span> (Wd ${w}, Nb ${nb}, B ${b}, Lb ${lb})</span>
                            <span style="font-size:13px; font-weight:800; color:#666">TOTAL: <strong style="color:#1a237e; font-size:16px">${inn.runs}/${inn.wickets}</strong> (${Math.floor(inn.balls/bpo)}.${inn.balls%bpo} ov)</span>
                        </div>

                        <!-- Bowling Section -->
                        <div style="font-size:12px; font-weight:900; color:#1a237e; letter-spacing:1px; text-transform:uppercase; margin-bottom:15px; border-left:4px solid #ffc107; padding-left:12px">Bowling Summary</div>
                        <table style="width:100%; border-collapse:collapse; margin-bottom:40px">
                            <thead><tr style="text-align:left; font-size:10px; font-weight:900; color:#bbb; text-transform:uppercase; border-bottom:1.5px solid #eee"><th style="padding:10px">BOWLER</th><th style="padding:10px; text-align:center">O</th><th style="padding:10px; text-align:center">M</th><th style="padding:10px; text-align:center">R</th><th style="padding:10px; text-align:center">W</th><th style="padding:10px; text-align:right">ECON</th></tr></thead>
                            <tbody>
                                ${(inn.bowlers || []).map(b => `
                                    <tr style="border-bottom:1px solid #fcfcfc">
                                        <td style="padding:15px 10px; font-weight:800; color:#333; font-size:17px">${b.name}</td>
                                        <td style="text-align:center; color:#555; font-weight:600">${Math.floor(b.balls/bpo)}.${b.balls%bpo}</td>
                                        <td style="text-align:center; color:#777">${b.maidens || 0}</td>
                                        <td style="text-align:center; color:#555; font-weight:600">${b.runs || 0}</td>
                                        <td style="text-align:center; font-weight:950; color:#c62828; font-size:19px">${b.wickets || 0}</td>
                                        <td style="text-align:right; font-weight:800; color:#bbb">${b.balls > 0 ? ((b.runs/b.balls)*bpo).toFixed(2) : '0.00'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>

                        <!-- Fall of Wickets -->
                        ${inn.fallOfWickets && inn.fallOfWickets.length > 0 ? `
                            <div style="margin-bottom:30px">
                                <div style="font-size:11px; font-weight:900; color:#bbb; text-transform:uppercase; margin-bottom:10px">Fall of Wickets</div>
                                <div style="font-size:13px; color:#666; font-weight:600; line-height:1.6">
                                    ${inn.fallOfWickets.map((f, i) => `${f.score}-${i+1} (${f.batsman}, ${f.overs} ov)`).join(', ')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Partnerships -->
                        ${inn.partnerships && inn.partnerships.length > 0 ? `
                            <div style="background:#f8f9fa; border-radius:20px; padding:25px">
                                <div style="font-size:11px; font-weight:900; color:#aaa; text-transform:uppercase; margin-bottom:15px; letter-spacing:1px">Key Partnerships</div>
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px">
                                    ${inn.partnerships.slice(0, 4).map(p => `
                                        <div style="background:#fff; padding:12px 15px; border-radius:12px; border:1px solid #eee">
                                            <div style="font-size:14px; font-weight:900; color:#1a237e">${p.runs} runs (${p.balls} balls)</div>
                                            <div style="font-size:11px; color:#888; margin-top:3px">${p.batsman1} & ${p.batsman2}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>`;
        };

        const totalInns = m.totalInnings || (m.matchFormat === 'test' ? 4 : 2);
        let inningsHtml = '';
        for (let i = 0; i < totalInns; i++) {
            const inn = m.innings[i];
            if (!inn && i > m.currentInnings) continue;
            let label = (i+1) + (i===0?'st':i===1?'nd':i===2?'rd':'th') + ' Innings';
            if (m.matchFormat !== 'test') label = i === 0 ? 'Initial Innings' : 'Target Chase';
            const tName = inn ? inn.battingTeam : (i % 2 === 0 ? (m.battingFirst || m.team1) : (m.fieldingFirst || m.team2));
            inningsHtml += renderInningsTablePDF(inn, tName, label);
        }

        container.innerHTML = `
            <div style="background:linear-gradient(135deg, #0a0e27 0%, #1a237e 100%); color:#fff; padding:100px 60px; text-align:center; border-radius:0 0 50px 50px">
                <div style="font-size:72px; font-weight:950; letter-spacing:-4px; margin-bottom:5px">SLCRICK<span style="color:#ffc107">PRO</span></div>
                <div style="font-size:14px; letter-spacing:10px; font-weight:400; opacity:0.6; text-transform:uppercase; margin-top:20px">Professional Analytical Performance Report</div>
                <div style="margin-top:60px; font-size:24px; font-weight:700; color:#ffc107; text-transform:uppercase">${(m.tournamentName || 'OFFICIAL FIXTURE')}</div>
                <div style="font-size:16px; opacity:0.8; margin-top:10px">${new Date(m.createdAt || Date.now()).toLocaleDateString(undefined, { dateStyle: 'full' })}</div>
            </div>
            
            <div style="padding:80px 60px">
                <div style="background:#f1f3f8; border:1px solid #dee2e6; padding:30px; border-radius:20px; text-align:center; font-weight:950; color:#1a237e; font-size:28px; margin-bottom:80px; text-transform:uppercase; box-shadow:0 8px 30px rgba(0,0,0,0.02)">
                    🏆 ${m.result || (m.status === 'live' ? '⚡ LIVE UPDATE: IN PROGRESS' : 'MATCH CONCLUDED')}
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:80px; padding:0 40px">
                    <div style="text-align:center; flex:1"><div style="font-size:48px; font-weight:950; color:#1a237e">${m.team1.toUpperCase()}</div><div style="font-size:12px; color:#aaa; font-weight:800; letter-spacing:3px; margin-top:10px">HOME SQUAD</div></div>
                    <div style="font-size:32px; font-weight:900; color:#eee; font-style:italic; padding:0 40px">VS</div>
                    <div style="text-align:center; flex:1"><div style="font-size:48px; font-weight:950; color:#1a237e">${m.team2.toUpperCase()}</div><div style="font-size:12px; color:#aaa; font-weight:800; letter-spacing:3px; margin-top:10px">VISITOR SQUAD</div></div>
                </div>

                <div style="text-align:center; margin-bottom:80px; background:#fff; border:2px solid #ffc107; display:inline-block; padding:15px 40px; border-radius:100px; position:relative; left:50%; transform:translateX(-50%)">
                    <div style="font-size:14px; font-weight:900; color:#000; letter-spacing:1px">TOSS: ${(m.tossWinner || 'TBD').toUpperCase()} WON & CHOSE TO ${(m.tossDecision || 'BAT').toUpperCase()}</div>
                </div>

                ${inningsHtml}

                <div style="margin-top:120px; padding-top:40px; border-top:2px solid #f8f9fa; display:flex; justify-content:space-between; align-items:center">
                    <div style="font-size:12px; color:#ccc; font-weight:700; letter-spacing:2px">POWERED BY SLCRICKPRO v4.5 ANALYTICS</div>
                    <div style="font-size:11px; color:#eee; font-family:monospace; background:#fafafa; padding:5px 15px; border-radius:5px">${m.id}</div>
                </div>
            </div>
        `;

        document.body.appendChild(container);
        await new Promise(r => setTimeout(r, 2000));

        const opt = {
            margin: [0, 0, 0, 0],
            filename: `SLCRICKPRO_Report_${(m.team1||'T1').replace(/\s+/g,'_')}_vs_${(m.team2||'T2').replace(/\s+/g,'_')}.pdf`,
            image: { type: 'jpeg', quality: 1.0 },
            html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0, windowWidth: 1000 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try {
            await html2pdf().set(opt).from(container).save();
        } catch (err) {
            console.error(err);
        } finally {
            container.remove();
            overlay.remove();
        }
    }
};

window.MatchReportEngine = MatchReportEngine;
