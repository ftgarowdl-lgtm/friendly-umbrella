/* Verità Facial — pontuação matemática 0–10 baseada exclusivamente em geometria facial. */

function clamp01(v){ return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); }
function safeRatio(a,b){ return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(b)>1e-9 ? a/b : null; }
function gaussianScore(value,target,tolerance){
  if(!Number.isFinite(value)||!Number.isFinite(target)||!Number.isFinite(tolerance)||tolerance<=0) return null;
  return Math.exp(-0.5*Math.pow((value-target)/tolerance,2));
}
function mean(values){
  const v=values.filter(Number.isFinite);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}

function landmarkIntegrityScore(landmarks){
  if(!Array.isArray(landmarks)||landmarks.length<468) return 0;
  const p=landmarks.slice(0,468);
  let valid=0;
  for(const x of p){ if(x&&Number.isFinite(x.x)&&Number.isFinite(x.y)&&Number.isFinite(x.z??0)) valid++; }
  const validity=valid/468;
  const edgePenalty=p.reduce((s,x)=>s+(x.x<-0.02||x.x>1.02||x.y<-0.02||x.y>1.02?1:0),0)/468;
  // Smoothness compares local mesh edges; isolated jumps are penalized.
  const pairs=[];
  for(let i=1;i<p.length;i+=2){
    const a=p[i-1],b=p[i];
    if(a&&b) pairs.push(Math.hypot(a.x-b.x,a.y-b.y));
  }
  const med=mean(pairs)??0;
  const mad=mean(pairs.map(v=>Math.abs(v-med)))??0;
  const smooth=med>0 ? clamp01(1-(mad/(med*2))) : 0;
  return clamp01(validity*0.65 + smooth*0.25 + (1-edgePenalty)*0.10);
}

function calculateFaceScore(landmarks,metrics){
  const m=metrics||{};
  // Reference targets are explicit geometric baselines, not claims of objective beauty.
  const components={
    vertical:{
      score:mean([
        gaussianScore(safeRatio(m.upper_third,middleSafe=m.middle_third),1,0.28),
        gaussianScore(safeRatio(m.middle_third,m.lower_third),1,0.28),
        gaussianScore(safeRatio(m.upper_third,m.lower_third),1,0.35)
      ])??0,
      weight:0.20
    },
    eyes:{
      score:mean([
        gaussianScore(m.left_eye_aspect,0.34,0.12),
        gaussianScore(m.right_eye_aspect,0.34,0.12),
        gaussianScore(safeRatio(m.intercanthal_distance,(m.right_eye_width+m.left_eye_width)/2),1,0.45),
        gaussianScore(safeRatio(Math.min(m.left_eye_width,m.right_eye_width),Math.max(m.left_eye_width,m.right_eye_width)),1,0.08)
      ])??0,
      weight:0.18
    },
    nose:{
      score:mean([
        gaussianScore(m.nasal_index,0.70,0.25),
        gaussianScore(m.normalized_nose_length,0.42,0.12),
        gaussianScore(m.nose_base_deviation,0,0.035)
      ])??0,
      weight:0.16
    },
    mouth:{
      score:mean([
        gaussianScore(m.mouth_aspect,0.28,0.14),
        gaussianScore(m.normalized_mouth_width,0.38,0.12),
        gaussianScore(m.nose_mouth_ratio,0.72,0.25)
      ])??0,
      weight:0.12
    },
    jaw:{
      score:mean([
        gaussianScore(m.jaw_face_ratio,0.70,0.18),
        gaussianScore(safeRatio(m.jaw_angle_left,m.jaw_angle_right),1,0.08)
      ])??0,
      weight:0.14
    },
    symmetry:{
      score:mean([
        gaussianScore(safeRatio(m.left_eye_width,m.right_eye_width),1,0.06),
        gaussianScore(safeRatio(m.left_eye_height,m.right_eye_height),1,0.08),
        gaussianScore(safeRatio(m.left_eyebrow_length,m.right_eyebrow_length),1,0.08),
        gaussianScore(m.nose_base_deviation,0,0.035)
      ])??0,
      weight:0.12
    }
  };

  const integrity=landmarkIntegrityScore(landmarks);
  let weighted=0,total=0;
  for(const c of Object.values(components)){ weighted+=c.score*c.weight; total+=c.weight; }
  weighted=total?weighted/total:0;
  // Geometry score uses all 468 landmarks through the integrity term.
  const final01=clamp01(weighted*0.88 + integrity*0.12);
  const score10=Number((final01*10).toFixed(2));

  const landmarkScores=landmarks.slice(0,468).map((p,i)=>({
    index:i,
    score:Number((integrity*10).toFixed(2))
  }));

  return {
    score:score10,
    label:score10>=8?'Alta consistência geométrica':score10>=6?'Consistência geométrica moderada':'Baixa consistência geométrica',
    integrity:Number((integrity*10).toFixed(2)),
    components:Object.fromEntries(Object.entries(components).map(([k,v])=>[k,Number((v.score*10).toFixed(2))])),
    landmarkScores
  };
}
