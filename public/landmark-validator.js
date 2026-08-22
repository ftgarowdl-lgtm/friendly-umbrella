/* Verità Facial — validação dos 468 landmarks do MediaPipe Face Landmarker. */

const LANDMARK_VALIDATION = {
  minFaceWidthRatio: 0.12,
  maxFaceWidthRatio: 0.95,
  maxRollDeg: 12,
  minEyeDistanceRatio: 0.08,
  minConfidence: 0.70
};

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function angleDeg(a, b, c) {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const den = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (!den) return 180;
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / den));
  return Math.acos(cos) * 180 / Math.PI;
}

function validateMediaPipeLandmarks(landmarks, width, height, confidence = 1) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(landmarks) || landmarks.length < 468) {
    return { valid: false, score: 0, errors: ["O detector não retornou os 468 landmarks esperados."], warnings };
  }
  if (confidence < LANDMARK_VALIDATION.minConfidence) errors.push("Confiança do detector muito baixa.");

  let valid = 0;
  for (const p of landmarks.slice(0, 468)) {
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0)) valid++;
    if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) warnings.push("Há landmarks fora da área esperada da imagem.");
  }
  if (valid < 468) errors.push("Existem landmarks inválidos.");

  const lm = landmarks;
  const leftEye = lm[33], rightEye = lm[263], nose = lm[1];
  const top = lm[10], chin = lm[152];
  const faceWidth = distance2D(lm[234], lm[454]);
  const faceHeight = distance2D(top, chin);
  const eyeDistance = distance2D(leftEye, rightEye);
  const faceWidthRatio = faceWidth;

  if (faceWidthRatio < LANDMARK_VALIDATION.minFaceWidthRatio) errors.push("Rosto muito pequeno na imagem.");
  if (faceWidthRatio > LANDMARK_VALIDATION.maxFaceWidthRatio) warnings.push("Rosto ocupa grande parte da imagem.");
  if (eyeDistance < LANDMARK_VALIDATION.minEyeDistanceRatio) errors.push("Distância entre os olhos incompatível com uma medição confiável.");
  if (!Number.isFinite(faceHeight) || faceHeight <= 0) errors.push("Altura facial inválida.");

  const roll = Math.abs(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI);
  if (roll > LANDMARK_VALIDATION.maxRollDeg) errors.push(`Rosto inclinado (${roll.toFixed(1)}°).`);

  const noseCenter = Math.abs(nose.x - ((leftEye.x + rightEye.x) / 2));
  if (noseCenter > faceWidth * 0.35) warnings.push("Eixo nasal apresenta desvio elevado; verificar pose antes de medir.");

  const score = Math.max(0, Math.min(1,
    (valid / 468) * 0.45 +
    Math.max(0, 1 - Math.min(1, roll / 20)) * 0.20 +
    Math.min(1, confidence) * 0.25 +
    (errors.length === 0 ? 0.10 : 0)
  ));

  return {
    valid: errors.length === 0 && score >= 0.75,
    score: Number(score.toFixed(3)),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    pose: { rollDeg: Number(roll.toFixed(2)) },
    face: { widthRatio: Number(faceWidth.toFixed(4)), height: Number(faceHeight.toFixed(4)), eyeDistance: Number(eyeDistance.toFixed(4)) }
  };
}
