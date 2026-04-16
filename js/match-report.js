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
                team: idx % 2 === 0 ? (match.battingFirst || match.team1) : (match.fieldingFirst || match.team2),
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
            
            return `
                <div style="margin-bottom:60px; border:1px solid #f0f0f0; border-radius:30px; overflow:hidden; box-shadow:0 15px 45px rgba(0,0,0,0.03)">
                    <div style="background:#f8f9fa; padding:25px 40px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee">
                        <div>
                            <div style="font-size:11px; font-weight:900; color:#aaa; letter-spacing:2px; text-transform:uppercase">${innLabel.toUpperCase()}</div>
                            <div style="font-size:28px; font-weight:950; color:#1a237e">${teamName.toUpperCase()}</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:36px; font-weight:950; color:#1a237e">${inn.runs}/${inn.wickets}</div>
                            <div style="font-size:14px; color:#666; font-weight:700">(${Math.floor(inn.balls/bpo)}.${inn.balls%bpo} OVERS)</div>
                        </div>
                    </div>
                    
                    <div style="padding:40px">
                        <table style="width:100%; border-collapse:collapse; margin-bottom:40px">
                            <thead><tr style="text-align:left; font-size:11px; font-weight:900; color:#aaa; text-transform:uppercase; border-bottom:1.5px solid #eee"><th style="padding:10px">BATTING</th><th style="padding:10px; text-align:center">R</th><th style="padding:10px; text-align:center">B</th><th style="padding:10px; text-align:center">4S</th><th style="padding:10px; text-align:center">6S</th><th style="padding:10px; text-align:right">SR</th></tr></thead>
                            <tbody>
                                ${(inn.batsmen || []).map(b => `
                                    <tr style="border-bottom:1px solid #f9f9f9">
                                        <td style="padding:15px 10px"><div style="font-weight:800; color:#333; font-size:16px">${b.name}</div><div style="font-size:10px; color:#999; text-transform:uppercase; font-weight:700">${b.dismissal || 'not out'}</div></td>
                                        <td style="text-align:center; font-weight:900; color:#1a237e; font-size:18px">${b.runs || 0}</td>
                                        <td style="text-align:center; color:#666">${b.balls || 0}</td>
                                        <td style="text-align:center; color:#666">${b.fours || 0}</td>
                                        <td style="text-align:center; color:#666">${b.sixes || 0}</td>
                                        <td style="text-align:right; font-weight:800; color:#aaa">${b.balls > 0 ? ((b.runs/b.balls)*100).toFixed(1) : '0.0'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>

                        <table style="width:100%; border-collapse:collapse">
                            <thead><tr style="text-align:left; font-size:11px; font-weight:900; color:#aaa; text-transform:uppercase; border-bottom:1.5px solid #eee"><th style="padding:10px">BOWLING</th><th style="padding:10px; text-align:center">O</th><th style="padding:10px; text-align:center">M</th><th style="padding:10px; text-align:center">R</th><th style="padding:10px; text-align:center">W</th><th style="padding:10px; text-align:right">ECON</th></tr></thead>
                            <tbody>
                                ${(inn.bowlers || []).map(b => `
                                    <tr style="border-bottom:1px solid #f9f9f9">
                                        <td style="padding:15px 10px; font-weight:800; color:#333; font-size:16px">${b.name}</td>
                                        <td style="text-align:center; color:#666">${Math.floor(b.balls/bpo)}.${b.balls%bpo}</td>
                                        <td style="text-align:center; color:#666">${b.maidens || 0}</td>
                                        <td style="text-align:center; color:#666">${b.runs || 0}</td>
                                        <td style="text-align:center; font-weight:900; color:#c62828; font-size:18px">${b.wickets || 0}</td>
                                        <td style="text-align:right; font-weight:800; color:#aaa">${b.balls > 0 ? ((b.runs/b.balls)*bpo).toFixed(2) : '0.00'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
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
            const tName = i % 2 === 0 ? (m.battingFirst || m.team1) : (m.fieldingFirst || m.team2);
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
