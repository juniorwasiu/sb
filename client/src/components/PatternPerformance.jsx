import React, { useState, useEffect } from 'react';
const G='#00FF88',N='#00E5FF',P='#A78BFA',R='#FF3355',O='#FF6B35',GOLD='#FFD700';
const li=(lg)=>({
  'England - Virtual':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Germany - Virtual':'🇩🇪','Italy - Virtual':'🇮🇹',
  'Spain - Virtual':'🇪🇸','France - Virtual':'🇫🇷'
}[lg]||'🌐');

function StatBox({label,value,color,sub}){
  return(
    <div style={{background:`${color}10`,border:`1px solid ${color}25`,borderRadius:10,padding:'14px 18px',textAlign:'center',minWidth:100}}>
      <div style={{fontSize:'1.6rem',fontWeight:900,color}}>{value}</div>
      <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.45)',textTransform:'uppercase',letterSpacing:'0.06em',marginTop:2}}>{label}</div>
      {sub&&<div style={{fontSize:'0.58rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>{sub}</div>}
    </div>
  );
}

function HitBar({rate,label}){
  const c=rate>=80?G:rate>=60?GOLD:rate>=40?O:R;
  return(
    <div style={{marginBottom:6}}>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.72rem',marginBottom:3}}>
        <span style={{color:'rgba(255,255,255,0.7)'}}>{label}</span>
        <span style={{fontWeight:800,color:c}}>{rate}%</span>
      </div>
      <div style={{height:6,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${rate}%`,background:`linear-gradient(90deg,${c}99,${c})`,borderRadius:3,transition:'width 0.8s ease'}}/>
      </div>
    </div>
  );
}

export default function PatternPerformance(){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(null);

  useEffect(()=>{
    console.log('[Performance] 📊 Fetching performance overview...');
    fetch('/api/pattern-intel/performance')
      .then(r=>r.json())
      .then(j=>{
        if(j.success){setData(j);console.log('[Performance] ✅ Loaded',j.overview);}
        else throw new Error(j.error);
      })
      .catch(e=>{console.error('[Performance] ❌',e.message);setError(e.message);})
      .finally(()=>setLoading(false));
  },[]);

  if(loading) return(
    <div style={{textAlign:'center',padding:'60px 0'}}>
      <div style={{width:40,height:40,border:`3px solid ${G}20`,borderTopColor:G,borderRadius:'50%',animation:'spin 1s linear infinite',margin:'0 auto 12px'}}/>
      <p style={{color:'rgba(255,255,255,0.4)',fontSize:'0.85rem'}}>Analysing performance records...</p>
    </div>
  );

  if(error) return(
    <div style={{textAlign:'center',padding:40,background:'rgba(255,51,85,0.05)',border:`1px solid ${R}30`,borderRadius:12}}>
      <div style={{fontSize:'2rem',marginBottom:8}}>⚠️</div>
      <div style={{color:R,fontWeight:700,marginBottom:6}}>Failed to load performance data</div>
      <div style={{color:'rgba(255,255,255,0.4)',fontSize:'0.8rem'}}>{error}</div>
    </div>
  );

  if(!data||data.overview.totalSnapshots===0) return(
    <div style={{textAlign:'center',padding:60}}>
      <div style={{fontSize:'3rem',marginBottom:12}}>📭</div>
      <div style={{fontWeight:700,color:'rgba(255,255,255,0.5)',marginBottom:8}}>No performance data yet</div>
      <div style={{fontSize:'0.82rem',color:'rgba(255,255,255,0.3)'}}>Performance records build up as patterns are triggered daily and their outcomes resolved.</div>
    </div>
  );

  const {overview,outcomeSummary,dateSummary,topPatterns}=data;
  const rateColor=r=>r>=80?G:r>=60?GOLD:r>=40?O:R;

  return(
    <div>
      {/* Global KPIs */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:24}}>
        <StatBox label="Total Predictions" value={overview.totalPredictions} color={N}/>
        <StatBox label="Hits" value={overview.totalHits} color={G}/>
        <StatBox label="Misses" value={overview.totalPredictions-overview.totalHits} color={R}/>
        <StatBox label="Overall Hit Rate" value={`${overview.overallHitRate}%`} color={rateColor(overview.overallHitRate)}/>
        <StatBox label="Resolved" value={overview.resolvedSnapshots} color={GOLD} sub={`${overview.pendingSnapshots} pending`}/>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
        {/* Outcome accuracy */}
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:18}}>
          <div style={{fontSize:'0.72rem',color:N,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>🎯 Outcome Accuracy</div>
          {outcomeSummary.length===0
            ? <div style={{color:'rgba(255,255,255,0.3)',fontSize:'0.8rem'}}>No resolved outcomes yet</div>
            : outcomeSummary.map(o=>(
              <div key={o.label} style={{marginBottom:10}}>
                <HitBar rate={o.hitRate} label={`${o.label} (${o.hits}/${o.predictions})`}/>
              </div>
            ))
          }
        </div>

        {/* Per-date summary */}
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:18}}>
          <div style={{fontSize:'0.72rem',color:GOLD,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>📅 Daily Accuracy</div>
          <div style={{maxHeight:260,overflowY:'auto',display:'flex',flexDirection:'column',gap:6}}>
            {dateSummary.length===0
              ? <div style={{color:'rgba(255,255,255,0.3)',fontSize:'0.8rem'}}>No resolved days yet</div>
              : dateSummary.map(d=>{
                  const rate=d.total>0?Math.round((d.hits/d.total)*100):0;
                  return(
                    <div key={d.date} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'rgba(255,255,255,0.02)',borderRadius:8,border:`1px solid rgba(255,255,255,0.05)`}}>
                      <span style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.5)',minWidth:80}}>{d.date}</span>
                      <div style={{flex:1,height:5,background:'rgba(255,255,255,0.06)',borderRadius:3}}>
                        <div style={{height:'100%',width:`${rate}%`,background:rateColor(rate),borderRadius:3}}/>
                      </div>
                      <span style={{fontSize:'0.72rem',fontWeight:800,color:rateColor(rate),minWidth:38,textAlign:'right'}}>{rate}%</span>
                      <span style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.3)',minWidth:50}}>{d.hits}✓ {d.misses}✗</span>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>

      {/* Top performing patterns */}
      {topPatterns.length>0&&(
        <div style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:18}}>
          <div style={{fontSize:'0.72rem',color:G,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>🏆 Most Reliable Patterns</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {topPatterns.map((p,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:`${rateColor(p.hitRate)}08`,border:`1px solid ${rateColor(p.hitRate)}25`,borderRadius:8}}>
                <div style={{fontSize:'1.1rem',fontWeight:900,fontFamily:'monospace',color:rateColor(p.hitRate),minWidth:50}}>{p.score}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'0.75rem',fontWeight:700,color:'rgba(255,255,255,0.8)'}}>{li(p.league)} {p.league.replace(' - Virtual','')} · {p.role}</div>
                  <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.35)',marginTop:2}}>{p.total} appearances tracked</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'1.3rem',fontWeight:900,color:rateColor(p.hitRate)}}>{p.hitRate}%</div>
                  <div style={{fontSize:'0.58rem',color:'rgba(255,255,255,0.3)'}}>{p.hits}✓ {p.total-p.hits}✗</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
