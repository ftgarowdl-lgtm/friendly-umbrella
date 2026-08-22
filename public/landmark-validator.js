/* Verità Facial — validação robusta dos landmarks do MediaPipe Face Landmarker. */

const LANDMARK_VALIDATION = {
  minFaceWidthRatio: 0.16,
  maxFaceWidthRatio: 0.92,
  minEyeToFaceWidthRatio: 0.22,
  maxEyeToFaceWidthRatio: 0.62,
  maxRollDeg: 10,
  maxNoseAxisRatio: 0.18,
  minImageSide: 320,
  minSharpness: 6,
  minExposure: 30,
  maxExposure: 235,
  minScore: 0.72
};

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function imageQuality(image) {
  try {
    const w = image?.naturalWidth || image?.videoWidth || image?.width || 0;
    const h = image?.naturalHeight || image?.videoHeight || image?.height || 0;
    if (!w || !h) return { score: 0, errors: ['Não foi possível ler a resolução da imagem.'], warnings: [] };
    const scale = Math.min(1, 256 / Math.max(w, h));
    const cw = Math.max(64, Math.round(w * scale));
    const ch = Math.max(64, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    let mean = 0, sharp = 0;
    const gray = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x), p = i * 4;
        const g = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
        gray[i] = g; mean += g;
      }
    }
    mean /= gray.length;
    for (let y = 1; y < ch - 1; y++) {
      for (let x = 1; x < cw - 1; x++) {
        const i = y * cw + x;
        const lap = gray[i - 1] + gray[i + 1] + gray[i - cw] + gray[i + cw] - 4 * gray[i];
        sharp += lap * lap;
      }
    }
    sharp /= Math.max(1, (cw - 2) * (ch - 2));
    const lowLight = mean < LANDMARK_VALIDATION.minExposure;
    const overexposed = mean > LANDMARK_VALIDATION.maxExposure;
    const exposureScore = lowLight || overexposed ? 0 : clamp01(1 - Math.abs(mean - 128) / 128);
    const sharpScore = clamp01(sharp / 180);
    const resolutionScore = Math.min(1, Math.min(w, h) / 720);
    const score = clamp01(0.50 * exposureScore + 0.35 * sharpScore + 0.15 * resolutionScore);
    const errors = [], warnings = [];
    if (Math.min(w, h) < LANDMARK_VALIDATION.minImageSide) warnings.push('Imagem com resolução abaixo do ideal; medidas podem ter menor precisão.');
    if (lowLight) errors.push('Iluminação muito baixa.');
    if (overexposed) errors.push('Imagem superexposta.');
    if (sharp < LANDMARK_VALIDATION.minSharpness) warnings.push('Imagem com nitidez abaixo do ideal.');
    if (score < 0.45 && !errors.length) warnings.push('Qualidade visual baixa.');
    return { score: Number(score.toFixed(3)), mean: Number(mean.toFixed(1)), sharpness: Number(sharp.toFixed(2)), errors, warnings };
  } catch (e) {
    return { score: 0, errors: ['Falha ao avaliar a qualidade visual da imagem.'], warnings: [e.message] };
  }
}

function validateMediaPipeLandmarks(landmarks, width, height, confidence = 1, sourceImage = null) {
  const errors = [], warnings = [];
  if (!Array.isArray(landmarks) || landmarks.length < 468) {
    return { valid: false, score: 0, errors: ['O detector não retornou os 468 landmarks esperados.'], warnings };
  }

  let valid = 0;
  for (const p of landmarks.slice(0, 468)) {
    if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z ?? 0)) valid++;
    if (p.x < -0.02 || p.x > 1.02 || p.y < -0.02 || p.y > 1.02) {
      errors.push('Há landmarks fora dos limites esperados.');
      break;
    }
  }
  if (valid !== 468) errors.push('Existem landmarks inválidos.');

  const lm = landmarks;
  const leftEye = lm[33], rightEye = lm[263], nose = lm[1];
  const top = lm[10], chin = lm[152];
  const faceWidth = distance2D(lm[234], lm[454]);
  const faceHeight = distance2D(top, chin);
  const eyeDistance = distance2D(leftEye, rightEye);
  const eyeFaceRatio = eyeDistance / Math.max(faceWidth, 1e-6);

  if (faceWidth < LANDMARK_VALIDATION.minFaceWidthRatio) errors.push('Rosto muito pequeno na imagem.');
  if (faceWidth > LANDMARK_VALIDATION.maxFaceWidthRatio) warnings.push('Rosto ocupa grande parte da imagem.');
  if (eyeFaceRatio < LANDMARK_VALIDATION.minEyeToFaceWidthRatio || eyeFaceRatio > LANDMARK_VALIDATION.maxEyeToFaceWidthRatio) {
    errors.push('Geometria dos olhos incompatível com um rosto frontal confiável.');
  }
  if (!Number.isFinite(faceHeight) || faceHeight < 0.10) errors.push('Altura facial inválida ou insuficiente.');

  const roll = Math.abs(Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI);
  if (roll > LANDMARK_VALIDATION.maxRollDeg) errors.push(`Rosto inclinado (${roll.toFixed(1)}°).`);

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const noseAxisRatio = Math.abs(nose.x - eyeMidX) / Math.max(faceWidth, 1e-6);
  if (noseAxisRatio > LANDMARK_VALIDATION.maxNoseAxisRatio) warnings.push('Eixo nasal desviado; verifique a pose antes de medir.');

  const leftHalf = distance2D(nose, leftEye), rightHalf = distance2D(nose, rightEye);
  const yawProxy = Math.abs(leftHalf - rightHalf) / Math.max(leftHalf + rightHalf, 1e-6);
  if (yawProxy > 0.16) errors.push('Cabeça parece estar girada; use uma foto mais frontal.');
  else if (yawProxy > 0.10) warnings.push('Pequena rotação facial detectada.');

  const eyeLine = Math.abs(rightEye.y - leftEye.y);
  const poseScore = clamp01(1 - roll / 20) * clamp01(1 - yawProxy / 0.25);
  const geometryScore = clamp01(0.45 + 0.55 * Math.min(1, eyeFaceRatio / 0.30));
  const pointScore = valid / 468;
  const quality = sourceImage ? imageQuality(sourceImage) : { score: 1, errors: [], warnings: [] };
  const score = clamp01(0.42 * pointScore + 0.31 * poseScore + 0.17 * geometryScore + 0.10 * quality.score);

  return {
    valid: errors.length === 0 && quality.errors.length === 0 && score >= LANDMARK_VALIDATION.minScore,
    score: Number(score.toFixed(3)),
    errors: [...new Set([...errors, ...(quality.errors || [])])],
    warnings: [...new Set([...warnings, ...(quality.warnings || [])])],
    pose: { rollDeg: Number(roll.toFixed(2)), yawProxy: Number(yawProxy.toFixed(3)), eyeLineDelta: Number(eyeLine.toFixed(4)) },
    face: { widthRatio: Number(faceWidth.toFixed(4)), height: Number(faceHeight.toFixed(4)), eyeDistance: Number(eyeDistance.toFixed(4)), eyeFaceRatio: Number(eyeFaceRatio.toFixed(4)), noseAxisRatio: Number(noseAxisRatio.toFixed(4)) },
    image: quality
  };
}
