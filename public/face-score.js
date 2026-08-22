/* Verità Facial — nota matemática 0–10 + integração visual no frontend. */
function clamp01(v){return Math.max(0,Math.min(1,Number.isFinite(v)?v:0))}
function safeRatio(a,b){return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(b)>1e-9?a/b:null}
function gaussianScore(value,target,tolerance){if(!Number.isFinite(value)||!Number.isFinite(target)||!Number.isFinite(tolerance)||tolerance<=0)return null;return Math.exp(-0.5*Math.pow((value-target)/tolerance,2))}
function mean(values){const v=values.filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function calculateFaceScoreFromMetrics(m){
  const components={
    vertical:{score:mean([gaussianScore(safeRatio(m.upper_third,m.middle_third),1,.28),gaussianScore(safeRatio(m.middle_third,m.lower_third),1,.28),gaussianScore(safeRatio(m.upper_third,m.lower_third),1,.35)])??0,weight:.20},
    eyes:{score:mean([gaussianScore(m.left_eye_aspect,.34,.12),gaussianScore(m.right_eye_aspect,.34,.12),gaussianScore(safeRatio(m.intercanthal_distance,(m.right_eye_width+m.left_eye_width)/2),1,.45),gaussianScore(safeRatio(Math.min(m.left_eye_width,m.right_eye_width),Math.max(m.left_eye_width,m.right_eye_width)),1,.08)])??0,weight:.18},
    nose:{score:mean([gaussianScore(m.nasal_index,.70,.25),gaussianScore(m.normalized_nose_length,.42,.12),gaussianScore(m.nose_base_deviation,0,.035)])??0,weight:.16},
    mouth:{score:mean([gaussianScore(m.mouth_aspect,.28,.14),gaussianScore(m.normalized_mouth_width,.38,.12),gaussianScore(m.nose_mouth_ratio,.72,.25)])??0,weight:.12},
    jaw:{score:mean([gaussianScore(m.jaw_face_ratio,.70,.18),gaussianScore(safeRatio(m.jaw_angle_left,m.jaw_angle_right),1,.08)])??0,weight:.14},
    symmetry:{score:mean([gaussianScore(safeRatio(m.left_eye_width,m.right_eye_width),1,.06),gaussianScore(safeRatio(m.left_eye_height,m.right_eye_height),1,.08),gaussianScore(safeRatio(m.left_eyebrow_length,m.right_eyebrow_length),1,.08),gaussianScore(m.nose_base_deviation,0,.035)])??0,weight:.12}
  };
  let weighted=0,total=0;Object.values(components).forEach(c=>{weighted+=c.score*c.weight;total+=c.weight});
  const final01=clamp01(total?weighted/total:0),score=Number((final01*10).toFixed(2));
  return{score,label:score>=8?'Alta consistência geométrica':score>=6?'Consistência geométrica moderada':'Baixa consistência geométrica',components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Number((v.score*10).toFixed(2))]))};
}
function calculateFaceScore(landmarks,metrics={}){
  const base=calculateFaceScoreFromMetrics(metrics||{});
  let integrity=1;
  if(Array.isArray(landmarks)&&landmarks.length>=468){let valid=0,edge=0;for(const p of landmarks.slice(0,468)){if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z??0))valid++;if(!p||p.x<0||p.x>1||p.y<0||p.y>1)edge++}integrity=clamp01(.8*(valid/468)+.2*(1-edge/468));}
  const score=Number((clamp01((base.score/10)*.9+integrity*.1)*10).toFixed(2));
  return{...base,score,integrity:Number((integrity*10).toFixed(2))};
}
window.calculateFaceScore=calculateFaceScore;
window.calculateFaceScoreFromMetrics=calculateFaceScoreFromMetrics;
function ensureScoreCard(){
  let card=document.getElementById('vfFinalScore');if(card)return card;
  const anchor=document.getElementById('metrics');if(!anchor)return null;
  card=document.createElement('div');card.id='vfFinalScore';card.className='vf-score-card';
  card.innerHTML='<div class="vf-score-head"><div><span class="vf-score-eyebrow">NOTA MATEMÁTICA FINAL</span><h2 id="vfScoreValue">—<small>/10</small></h2><p id="vfScoreLabel">Calculada pelas relações geométricas das medidas detectadas.</p></div><div class="vf-score-ring"><span id="vfScoreRingValue">—</span></div></div><div class="vf-score-grid" id="vfScoreComponents"></div><div class="vf-score-note">Cálculo matemático no navegador. A IA não altera a nota.</div>';
  anchor.parentElement.insertBefore(card,anchor);return card;
}
function renderMathematicalScore(metrics){const card=ensureScoreCard();if(!card)return;const s=calculateFaceScoreFromMetrics(metrics);document.getElementById('vfScoreValue').innerHTML=`${s.score}<small>/10</small>`;document.getElementById('vfScoreRingValue').textContent=s.score;document.getElementById('vfScoreLabel').textContent=s.label;const labels={vertical:'Terços faciais',eyes:'Olhos',nose:'Nariz',mouth:'Boca',jaw:'Mandíbula',symmetry:'Simetria'};document.getElementById('vfScoreComponents').innerHTML=Object.entries(s.components).map(([k,v])=>`<div><span>${labels[k]||k}</span><strong>${v}/10</strong></div>`).join('')}
