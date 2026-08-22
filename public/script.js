/* ============================================================================
 * Facial Metrics Analyzer — script.js
 * ----------------------------------------------------------------------------
 * 1) Funções matemáticas auxiliares (transpostas de geometry.py)
 * 2) measureFeatures() — 65+ métricas + geometria de overlay por métrica
 * 3) Navegação (Visão Geral / Planos / Análise)
 * 4) Captura de imagem (upload / câmera) + detecção via face-api.js
 * 5) Overlay em canvas: ao passar o mouse sobre uma métrica, desenha na
 *   própria foto os pontos/linhas usados no cálculo e o valor obtido.
 * 6) Integração com o backend (/api/analyze, /api/history)
 *
 * NOTA SOBRE A TESTA (pontos 68-80): ver comentário em buildForeheadArc().
 * = ==*========================================================================= */

/* ---------------------------------------------------------------------- */
/* 1) FUNÇÕES MATEMÁTICAS AUXILIARES                                       */
/* ---------------------------------------------------------------------- */

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function slope(point1, point2, absolute = false) {
  const deltaX = point2.x - point1.x;
  const deltaY = point2.y - point1.y;
  if (deltaX === 0) return "inf";
  let s = deltaY / deltaX;
  if (absolute) s = Math.abs(s);
  return round3(s);
}

function angleOf3Points(p1, p2, p3) {
  const radian =
  Math.atan2(p3.y - p1.y, p3.x - p1.x) - Math.atan2(p2.y - p1.y, p2.x - p1.x);
  return Math.abs(radian) * (180 / Math.PI);
}

function shapeArea(points, circularArray = false) {
  let result = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const { x: x1, y: y1 } = points[i];
    const { x: x2, y: y2 } = points[i + 1];
    result += x1 * y2 - y1 * x2;
  }
  if (!circularArray) {
    const { x: x1, y: y1 } = points[points.length - 1];
    const { x: x2, y: y2 } = points[0];
    result += x1 * y2 - y1 * x2;
  }
  result /= 2;
  return Math.abs(result);
}

function diffYaxis(point1, point2) {
  return round3(point1.y - point2.y);
}

function dist(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function midpoint(p1, p2) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function eyeCenter(points) {
  const x = points.reduce((acc, p) => acc + p.x, 0) / points.length;
  const y = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  return { x, y };
}

function sumDifference(points) {
  let result = 0;
  for (let i = 0; i < points.length - 1; i++) {
    result += diffYaxis(points[i], points[i + 1]);
  }
  return round3(result);
}

function sumSlopes(points, absolute = false) {
  let result = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const s = slope(points[i], points[i + 1], absolute);
    if (s === "inf") continue;
    result += s;
  }
  return round3(result);
}

function pointWithExtremeY(points, mode = "max") {
  return points.reduce(
    (acc, p) => ((mode === "max" ? p.y > acc.y : p.y < acc.y) ? p : acc),
                       points[0]
  );
}

/* ---- Equações auxiliares do detector de formato de sobrancelha -------- */

function equation1(points) {
  const avgPoint = {
    x: (points[2].x + points[3].x) / 2,
    y: (points[2].y + points[3].y) / 2
  };
  return angleOf3Points(avgPoint, points[1], points[4]);
}

function equation2(points) {
  const result = slope(points[3], points[4]);
  if (result === "inf" || result === 0) return 1;
  return result;
}

function equation3(points) {
  let result = slope(points[1], points[2], true);
  if (result === "inf") result = 0;

  let slope2 = slope(points[3], points[4], true);
  if (slope2 === "inf") slope2 = 0;

  result += slope2;
  result = result === 0 ? 1 : result;
  return result;
}

function equation4(points) {
  const total = [];
  for (let i = 0; i < points.length - 2; i++) {
    total.push(points[i + 1].y - points[i].y);
  }
  let differences = Math.abs(total[1] - total[0]) + Math.abs(total[2] - total[1]);

  let slope0 = slope(points[0], points[1], true);
  let slope1 = slope(points[2], points[3]);
  const slope2 = slope(points[3], points[4], true);

  slope0 = slope0 === 0 || slope0 === "inf" ? 1 : slope0;
  slope1 = slope1 === 0 || slope1 === "inf" ? 1 : slope1;
  differences = differences === 0 ? 1 : differences;

  const slope2Safe = slope2 === "inf" ? 0 : slope2;
  let result = slope2Safe * ((0.5 * slope1) / slope0) * (5 / differences);
  result = result === 0 ? 1 : result;
  return result;
}

/* ---------------------------------------------------------------------- */
/* 2) TESTA ESTIMADA + MEDIÇÃO DE TODAS AS MÉTRICAS + GEOMETRIA DE OVERLAY */
/* ---------------------------------------------------------------------- */

const METRIC_UNITS = {
  "forehead height": "px",
  "middle face height": "px",
  "lower face height": "px",
  "jaw shape": "",
  "left eye area": "px²",
  "right eye area": "px²",
  "eye to eye dist": "px",
  "eye to eyebrow dist": "px",
  "upper lip height": "px",
  "lower lip height": "px",
  "eyebrows distance": "px",
  "nose length": "px",
  "nose width": "px",
  "nose arc": "°",
  "eyebrow shape detector 1": "°",
  "eyebrow shape detector 2": "",
  "eye slope detector1": "",
  "eye slope detector2": "",
  "eyebrow slope": "",

  // ---- unidades das métricas de extensão (ver seção 2B) ------------------
  "face width (outer)": "px",
  "jaw width": "px",
  "chin width": "px",
  "total face height": "px",
  "face width to height ratio": "",
  "golden ratio score": "",
  "left eye width": "px",
  "right eye width": "px",
  "left eye height": "px",
  "right eye height": "px",
  "left eye aspect ratio": "",
  "right eye aspect ratio": "",
  "interocular distance (inner)": "px",
  "interocular distance (outer)": "px",
  "interpupillary distance": "px",
  "left canthal tilt": "",
  "right canthal tilt": "",
  "left eyebrow length": "px",
  "right eyebrow length": "px",
  "left eyebrow slope": "",
  "right eyebrow slope": "",
  "left eyebrow to eye distance": "px",
  "right eyebrow to eye distance": "px",
  "nasal index": "",
  "nasolabial angle": "°",
  "mouth width": "px",
  "mouth height": "px",
  "mouth aspect ratio": "",
  "mouth corner tilt": "",
  "mouth corner height diff": "px",
  "upper lip thickness": "px",
  "lower lip thickness": "px",
  "philtrum length": "px",
  "interlabial gap": "px",
  "chin height": "px",
  "upper to middle third ratio": "",
  "middle to lower third ratio": "",
  "upper to lower third ratio": "",
  "mouth to nose width ratio": "",
  "mouth to interocular ratio": "",
  "jaw angle left": "°",
  "jaw angle right": "°",
  "jaw symmetry diff": "px",
  "eye area diff (left vs right)": "px²",
  "eye width diff (left vs right)": "px",
  "eyebrow length diff": "px",
  "nasal tip lateral deviation": "px",
  "face symmetry score": ""
};

/**
 * Estima 13 pontos ao longo do topo da testa (equivalentes aos índices
 * 68-80 do preditor dlib de 81 pontos, indisponível via CDN), usando a
 * regra dos terços do rosto para definir a altura da testa.
 */
function buildForeheadArc(lm) {
  const browIndices = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  const browTopY = Math.min(...browIndices.map((i) => lm[i].y));
  const noseBaseY = lm[33].y;
  const middleThirdHeight = noseBaseY - browTopY;

  const leftTemple = lm[0];
  const rightTemple = lm[16];

  const arc = [];
  const n = 13; // pontos 68..80
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const x = leftTemple.x + t * (rightTemple.x - leftTemple.x);
    const bulge = Math.sin(Math.PI * t);
    const y = browTopY - middleThirdHeight * (0.35 + 0.65 * bulge);
    arc.push({ x, y });
  }
  return arc;
}

function collectFaceComponents(lm, foreheadArc) {
  const point = (i) => (i < 68 ? lm[i] : foreheadArc[i - 68]);

  const faceShapeIdx = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    78, 74, 79, 73, 80, 71, 70, 69, 76, 75, 77, 0
  ];
  const faceShape = faceShapeIdx.map(point);

  const leftEye = [36, 37, 38, 39, 40, 41, 36].map((i) => lm[i]);
  const rightEye = [42, 43, 44, 45, 46, 42].map((i) => lm[i]);
  const leftIBrow = [17, 18, 19, 20, 21].map((i) => lm[i]);
  const rightIBrow = [22, 23, 24, 25, 26].map((i) => lm[i]);
  const noseLine = [27, 28, 29, 30].map((i) => lm[i]);
  const noseArc = [31, 32, 33, 34, 35].map((i) => lm[i]);
  const upperLip = [50, 51, 52, 63, 62, 61, 50].map((i) => lm[i]);
  const lowerLip = [67, 66, 65, 56, 57, 58, 67].map((i) => lm[i]);

  return {
    faceShape, leftEye, rightEye, leftIBrow, rightIBrow,
    noseLine, noseArc, upperLip, lowerLip
  };
}

/**
 * Calcula todas as métricas (base + extensão) e retorna também `geometry`: para cada métrica,
 * os pontos exatos usados no cálculo, prontos para desenhar no overlay.
 * lm: array de 68 pontos {x,y} no esquema clássico dlib.
 */
function measureFeatures(lm) {
  const foreheadArc = buildForeheadArc(lm);
  const point = (i) => (i < 68 ? lm[i] : foreheadArc[i - 68]);

  const fc = collectFaceComponents(lm, foreheadArc);
  const {
    faceShape, leftEye, rightEye,
    leftIBrow: leftIbrow, rightIBrow: rightIbrow,
    noseLine, noseArc, upperLip, lowerLip
  } = fc;

  const geometry = {};
  const metrics = {};

  // ---- Altura da testa -----------------------------------------------
  const threeMiddleForeheadPts = [point(70), point(71), point(80)];
  const foreheadTopAvg = {
    x: threeMiddleForeheadPts.reduce((a, p) => a + p.x, 0) / 3,
    y: threeMiddleForeheadPts.reduce((a, p) => a + p.y, 0) / 3
  };
  const middleRightIbrowY = rightIbrow[2].y;
  const foreheadHeight = middleRightIbrowY - foreheadTopAvg.y;
  metrics["forehead height"] = Math.round(foreheadHeight);
  geometry["forehead height"] = {
    type: "line",
    points: [foreheadTopAvg, rightIbrow[2]],
    labelText: `${metrics["forehead height"]} px`
  };

  // ---- Formato do maxilar ----------------------------------------------
  const m1 = sumSlopes(
    [faceShape[8], faceShape[9], faceShape[10], faceShape[11], faceShape[12]], true
  );
  const m2 = sumSlopes(
    [faceShape[4], faceShape[5], faceShape[6], faceShape[7], faceShape[8]], true
  );
  const m3 = Math.abs(sumDifference(
    [faceShape[8], faceShape[9], faceShape[10], faceShape[11], faceShape[12]]
  ));
  const m4 = Math.abs(sumDifference(
    [faceShape[4], faceShape[5], faceShape[6], faceShape[7], faceShape[8]]
  ));
  const jawWidth = (((m1 * m3) / 2) * ((Math.abs(m2) * Math.abs(m4)) / 2)) / 1000;
  const jawAngle = angleOf3Points(faceShape[8], faceShape[5], faceShape[11]);
  const jawClass = round3((jawWidth / jawAngle) * 100);
  metrics["jaw shape"] = jawClass;
  geometry["jaw shape"] = {
    type: "polyline",
    points: faceShape.slice(4, 13),
    labelText: `${jawClass}`
  };

  // ---- Áreas dos olhos --------------------------------------------------
  const leftEyeArea = round3(shapeArea(leftEye));
  const rightEyeArea = round3(shapeArea(rightEye));
  metrics["left eye area"] = leftEyeArea;
  metrics["right eye area"] = rightEyeArea;
  geometry["left eye area"] = { type: "polygon", points: leftEye, labelText: `${leftEyeArea} px²` };
  geometry["right eye area"] = { type: "polygon", points: rightEye, labelText: `${rightEyeArea} px²` };

  // ---- Distância olho-a-olho --------------------------------------------
  const leftMaxXPoint = leftEye.reduce((a, p) => (p.x > a.x ? p : a), leftEye[0]);
  const rightMinXPoint = rightEye.reduce((a, p) => (p.x < a.x ? p : a), rightEye[0]);
  const eye2eyeDistance = round3(rightMinXPoint.x - leftMaxXPoint.x);
  metrics["eye to eye dist"] = eye2eyeDistance;
  geometry["eye to eye dist"] = {
    type: "line",
    points: [leftMaxXPoint, rightMinXPoint],
    labelText: `${eye2eyeDistance} px`
  };

  // ---- Distância olho-sobrancelha ---------------------------------------
  const leftEyeMinYPoint = leftEye.reduce((a, p) => (p.y < a.y ? p : a), leftEye[0]);
  const rightEyeMinYPoint = rightEye.reduce((a, p) => (p.y < a.y ? p : a), rightEye[0]);
  const left2ibrowDist = leftEyeMinYPoint.y - leftIbrow[2].y;
  const right2ibrowDist = rightEyeMinYPoint.y - rightIbrow[2].y;
  const eye2eyebrowDistance = round3((left2ibrowDist + right2ibrowDist) / 2);
  metrics["eye to eyebrow dist"] = eye2eyebrowDistance;
  geometry["eye to eyebrow dist"] = {
    type: "multiline",
    points: [leftEyeMinYPoint, leftIbrow[2], rightEyeMinYPoint, rightIbrow[2]],
    labelText: `${eye2eyebrowDistance} px`
  };

  // ---- Altura dos lábios --------------------------------------------------
  const upperLipMaxY = pointWithExtremeY(upperLip, "max");
  const upperLipMinY = pointWithExtremeY(upperLip, "min");
  const upperLipHeight = round3(upperLipMaxY.y - upperLipMinY.y);
  metrics["upper lip height"] = upperLipHeight;
  geometry["upper lip height"] = {
    type: "line",
    points: [upperLipMinY, upperLipMaxY],
    labelText: `${upperLipHeight} px`
  };

  const lowerLipMaxY = pointWithExtremeY(lowerLip, "max");
  const lowerLipMinY = pointWithExtremeY(lowerLip, "min");
  const lowerLipHeight = round3(lowerLipMaxY.y - lowerLipMinY.y);
  metrics["lower lip height"] = lowerLipHeight;
  geometry["lower lip height"] = {
    type: "line",
    points: [lowerLipMinY, lowerLipMaxY],
    labelText: `${lowerLipHeight} px`
  };

  // ---- Distância entre sobrancelhas ---------------------------------------
  const eyebrowsDistance = round3(rightIbrow[0].x - leftIbrow[4].x);
  metrics["eyebrows distance"] = eyebrowsDistance;
  geometry["eyebrows distance"] = {
    type: "line",
    points: [leftIbrow[4], rightIbrow[0]],
    labelText: `${eyebrowsDistance} px`
  };

  // ---- Comprimento do nariz ------------------------------------------------
  const noseMaxY = pointWithExtremeY(noseLine, "max");
  const noseMinY = pointWithExtremeY(noseLine, "min");
  const noseLength = round3(noseMaxY.y - noseMinY.y);
  metrics["nose length"] = noseLength;
  geometry["nose length"] = {
    type: "line",
    points: [noseMinY, noseMaxY],
    labelText: `${noseLength} px`
  };

  // ---- Largura e arco do nariz -----------------------------------------
  const noseWidth = round3(noseArc[4].x - noseArc[0].x);
  metrics["nose width"] = noseWidth;
  geometry["nose width"] = {
    type: "line",
    points: [noseArc[0], noseArc[4]],
    labelText: `${noseWidth} px`
  };

  const noseArcAngle = Math.round(angleOf3Points(noseArc[2], noseArc[0], noseArc[4]));
  metrics["nose arc"] = noseArcAngle;
  geometry["nose arc"] = {
    type: "angle",
    points: [noseArc[0], noseArc[2], noseArc[4]],
    labelText: `${noseArcAngle}°`
  };

  // ---- Altura do terço médio -------------------------------------------
  const middleFaceHeight = round3(noseLine[3].y - rightIbrow[2].y);
  metrics["middle face height"] = middleFaceHeight;
  geometry["middle face height"] = {
    type: "line",
    points: [rightIbrow[2], noseLine[3]],
    labelText: `${middleFaceHeight} px`
  };

  // ---- Altura do terço inferior -----------------------------------------
  const chinPoint = faceShape.reduce((a, p) => (p.y > a.y ? p : a), faceShape[0]);
  const lowerFaceHeight = round3(chinPoint.y - noseArc[2].y);
  metrics["lower face height"] = lowerFaceHeight;
  geometry["lower face height"] = {
    type: "line",
    points: [noseArc[2], chinPoint],
    labelText: `${lowerFaceHeight} px`
  };

  // ---- Detectores de formato de sobrancelha ------------------------------
  const lefteyeside = leftEye[3];
  const righteyeside = rightEye[0];
  const noseTip = noseLine[noseLine.length - 1];
  const noseEyeDiff =
  Math.abs(noseTip.x - lefteyeside.x) - Math.abs(noseTip.x - righteyeside.x);
  const ibrowPosition = noseEyeDiff <= 3 ? "right" : "left";
  let clearIbrow = ibrowPosition === "right" ? rightIbrow.slice() : leftIbrow.slice();
  if (ibrowPosition === "left") clearIbrow = clearIbrow.reverse();

  const angleX = Math.round(angleOf3Points(clearIbrow[2], clearIbrow[0], clearIbrow[4]));
  metrics["eyebrow shape detector 1"] = angleX;
  geometry["eyebrow shape detector 1"] = {
    type: "angle",
    points: [clearIbrow[2], clearIbrow[0], clearIbrow[4]],
    labelText: `${angleX}°`
  };

  const archedAngledEQ = Math.ceil(
    (equation1(clearIbrow) * equation2(clearIbrow) * equation3(clearIbrow) *
    equation4(clearIbrow)) / 100
  );
  metrics["eyebrow shape detector 2"] = archedAngledEQ;
  geometry["eyebrow shape detector 2"] = {
    type: "polyline",
    points: clearIbrow,
    labelText: `${archedAngledEQ}`
  };

  // ---- Detectores de inclinação dos olhos ---------------------------------
  const lefteyecenter = eyeCenter([leftEye[1], leftEye[2], leftEye[4], leftEye[5]]);
  const righteyecenter = eyeCenter([rightEye[1], rightEye[2], rightEye[4], rightEye[5]]);

  let lefteyeslope = slope(leftEye[0], lefteyecenter);
  let righteyeslope = slope(righteyecenter, rightEye[3]);
  const lefteyeslopeSafe = lefteyeslope === "inf" ? 0 : lefteyeslope;
  const righteyeslopeSafe = righteyeslope === "inf" ? 0 : righteyeslope;

  const lefteyediff = diffYaxis(leftEye[0], lefteyecenter);
  const righteyediff = diffYaxis(righteyecenter, rightEye[3]);

  const leftpair = [lefteyeslopeSafe * -1, righteyeslopeSafe];
  const rightpair = [lefteyediff, righteyediff * -1];
  const totalpair = [leftpair[0] + rightpair[0], leftpair[1] + rightpair[1]];

  const eyeSlopeDetector1 = round3(totalpair[0]);
  const eyeSlopeDetector2 = round3(totalpair[1]);
  metrics["eye slope detector1"] = eyeSlopeDetector1;
  metrics["eye slope detector2"] = eyeSlopeDetector2;

  const eyeSlopeGeometry = {
    type: "multiline",
    points: [leftEye[0], lefteyecenter, righteyecenter, rightEye[3]],
    labelText: ""
  };
  geometry["eye slope detector1"] = { ...eyeSlopeGeometry, labelText: `${eyeSlopeDetector1}` };
  geometry["eye slope detector2"] = { ...eyeSlopeGeometry, labelText: `${eyeSlopeDetector2}` };

  // ---- Inclinação da sobrancelha -------------------------------------------
  const ibrowTip = { x: clearIbrow[0].x, y: (clearIbrow[0].y + clearIbrow[1].y) / 2 };
  const ibrowSlopeRaw = slope(ibrowTip, clearIbrow[2]);
  const ibrowSlope = ibrowSlopeRaw === "inf" ? "inf" : round3(ibrowSlopeRaw);
  metrics["eyebrow slope"] = ibrowSlope;
  geometry["eyebrow slope"] = {
    type: "line",
    points: [ibrowTip, clearIbrow[2]],
    labelText: `${ibrowSlope}`
  };

  /* ---------------------------------------------------------------------- */
  /* 2B) EXTENSÃO — TODAS AS MÉTRICAS ADICIONAIS POSSÍVEIS                   */
  /* Reaproveita os pontos e valores já calculados acima (faceShape,        */
  /* leftEye/rightEye, leftIbrow/rightIbrow, noseLine/noseArc,              */
  /* upperLip/lowerLip, foreheadTopAvg, chinPoint, foreheadHeight,          */
  /* middleFaceHeight, lowerFaceHeight, noseWidth, noseLength...) para      */
  /* derivar dezenas de métricas antropométricas adicionais.                */
  /* ---------------------------------------------------------------------- */

  // ---- I. Largura/altura facial geral -----------------------------------
  const faceWidthOuter = dist(faceShape[0], faceShape[16]);
  metrics["face width (outer)"] = Math.round(faceWidthOuter);
  geometry["face width (outer)"] = { type: "line", points: [faceShape[0], faceShape[16]], labelText: `${metrics["face width (outer)"]} px` };

  const jawWidthOuter = dist(faceShape[4], faceShape[12]);
  metrics["jaw width"] = Math.round(jawWidthOuter);
  geometry["jaw width"] = { type: "line", points: [faceShape[4], faceShape[12]], labelText: `${metrics["jaw width"]} px` };

  const chinWidthOuter = dist(faceShape[6], faceShape[10]);
  metrics["chin width"] = Math.round(chinWidthOuter);
  geometry["chin width"] = { type: "line", points: [faceShape[6], faceShape[10]], labelText: `${metrics["chin width"]} px` };

  const totalFaceHeight = chinPoint.y - foreheadTopAvg.y;
  metrics["total face height"] = Math.round(totalFaceHeight);
  geometry["total face height"] = { type: "line", points: [foreheadTopAvg, chinPoint], labelText: `${metrics["total face height"]} px` };

  const faceWidthToHeightRatio = round3(faceWidthOuter / (totalFaceHeight || 1e-6));
  metrics["face width to height ratio"] = faceWidthToHeightRatio;
  geometry["face width to height ratio"] = {
    type: "multiline",
    points: [faceShape[0], faceShape[16], foreheadTopAvg, chinPoint],
    labelText: `${faceWidthToHeightRatio}`
  };

  const goldenRatioScore = round3(
    1 - Math.abs((totalFaceHeight / (faceWidthOuter || 1e-6)) - 1.618) / 1.618
  );
  metrics["golden ratio score"] = goldenRatioScore;
  geometry["golden ratio score"] = geometry["face width to height ratio"];

  // ---- II. Olhos individuais ----------------------------------------------
  const leftEyeWidth = dist(lm[36], lm[39]);
  const rightEyeWidth = dist(lm[42], lm[45]);
  metrics["left eye width"] = Math.round(leftEyeWidth);
  metrics["right eye width"] = Math.round(rightEyeWidth);
  geometry["left eye width"] = { type: "line", points: [lm[36], lm[39]], labelText: `${metrics["left eye width"]} px` };
  geometry["right eye width"] = { type: "line", points: [lm[42], lm[45]], labelText: `${metrics["right eye width"]} px` };

  const leftEyeHeight = (dist(lm[37], lm[41]) + dist(lm[38], lm[40])) / 2;
  const rightEyeHeight = (dist(lm[43], lm[47]) + dist(lm[44], lm[46])) / 2;
  metrics["left eye height"] = round3(leftEyeHeight);
  metrics["right eye height"] = round3(rightEyeHeight);
  geometry["left eye height"] = { type: "multiline", points: [lm[37], lm[41], lm[38], lm[40]], labelText: `${metrics["left eye height"]} px` };
  geometry["right eye height"] = { type: "multiline", points: [lm[43], lm[47], lm[44], lm[46]], labelText: `${metrics["right eye height"]} px` };

  metrics["left eye aspect ratio"] = round3(leftEyeHeight / (leftEyeWidth || 1e-6));
  metrics["right eye aspect ratio"] = round3(rightEyeHeight / (rightEyeWidth || 1e-6));
  geometry["left eye aspect ratio"] = geometry["left eye width"];
  geometry["right eye aspect ratio"] = geometry["right eye width"];

  const interocularInner = dist(lm[39], lm[42]);
  metrics["interocular distance (inner)"] = Math.round(interocularInner);
  geometry["interocular distance (inner)"] = { type: "line", points: [lm[39], lm[42]], labelText: `${metrics["interocular distance (inner)"]} px` };

  const interocularOuter = dist(lm[36], lm[45]);
  metrics["interocular distance (outer)"] = Math.round(interocularOuter);
  geometry["interocular distance (outer)"] = { type: "line", points: [lm[36], lm[45]], labelText: `${metrics["interocular distance (outer)"]} px` };

  const leftEyeCenter = midpoint(lm[37], lm[40]);
  const rightEyeCenter = midpoint(lm[43], lm[46]);
  const interpupillaryDistance = dist(leftEyeCenter, rightEyeCenter);
  metrics["interpupillary distance"] = Math.round(interpupillaryDistance);
  geometry["interpupillary distance"] = { type: "line", points: [leftEyeCenter, rightEyeCenter], labelText: `${metrics["interpupillary distance"]} px` };

  const leftCanthalTilt = slope(lm[39], lm[36]);
  const rightCanthalTilt = slope(lm[42], lm[45]);
  metrics["left canthal tilt"] = leftCanthalTilt;
  metrics["right canthal tilt"] = rightCanthalTilt;
  geometry["left canthal tilt"] = { type: "line", points: [lm[39], lm[36]], labelText: `${leftCanthalTilt}` };
  geometry["right canthal tilt"] = { type: "line", points: [lm[42], lm[45]], labelText: `${rightCanthalTilt}` };

  // ---- III. Sobrancelhas individuais --------------------------------------
  const leftEyebrowLength = dist(lm[17], lm[21]);
  const rightEyebrowLength = dist(lm[22], lm[26]);
  metrics["left eyebrow length"] = Math.round(leftEyebrowLength);
  metrics["right eyebrow length"] = Math.round(rightEyebrowLength);
  geometry["left eyebrow length"] = { type: "line", points: [lm[17], lm[21]], labelText: `${metrics["left eyebrow length"]} px` };
  geometry["right eyebrow length"] = { type: "line", points: [lm[22], lm[26]], labelText: `${metrics["right eyebrow length"]} px` };

  const leftEyebrowSlope = slope(lm[17], lm[21]);
  const rightEyebrowSlope = slope(lm[22], lm[26]);
  metrics["left eyebrow slope"] = leftEyebrowSlope;
  metrics["right eyebrow slope"] = rightEyebrowSlope;
  geometry["left eyebrow slope"] = geometry["left eyebrow length"];
  geometry["right eyebrow slope"] = geometry["right eyebrow length"];

  const leftEyebrowMid = lm[19];
  const rightEyebrowMid = lm[24];
  const leftEyeTopMid = midpoint(lm[37], lm[38]);
  const rightEyeTopMid = midpoint(lm[43], lm[44]);
  const leftEyebrowToEye = Math.abs(leftEyebrowMid.y - leftEyeTopMid.y);
  const rightEyebrowToEye = Math.abs(rightEyebrowMid.y - rightEyeTopMid.y);
  metrics["left eyebrow to eye distance"] = Math.round(leftEyebrowToEye);
  metrics["right eyebrow to eye distance"] = Math.round(rightEyebrowToEye);
  geometry["left eyebrow to eye distance"] = { type: "line", points: [leftEyebrowMid, leftEyeTopMid], labelText: `${metrics["left eyebrow to eye distance"]} px` };
  geometry["right eyebrow to eye distance"] = { type: "line", points: [rightEyebrowMid, rightEyeTopMid], labelText: `${metrics["right eyebrow to eye distance"]} px` };

  // ---- IV. Nariz — índices adicionais --------------------------------------
  metrics["nasal index"] = round3(noseWidth / (noseLength || 1e-6));
  geometry["nasal index"] = geometry["nose width"];

  const nasolabialAngle = Math.round(angleOf3Points(lm[30], lm[33], lm[51]));
  metrics["nasolabial angle"] = nasolabialAngle;
  geometry["nasolabial angle"] = { type: "angle", points: [lm[30], lm[33], lm[51]], labelText: `${nasolabialAngle}°` };

  // ---- V. Boca e lábios — extensão ------------------------------------------
  const mouthWidth = dist(lm[48], lm[54]);
  metrics["mouth width"] = Math.round(mouthWidth);
  geometry["mouth width"] = { type: "line", points: [lm[48], lm[54]], labelText: `${metrics["mouth width"]} px` };

  const mouthHeight = dist(lm[51], lm[57]);
  metrics["mouth height"] = Math.round(mouthHeight);
  geometry["mouth height"] = { type: "line", points: [lm[51], lm[57]], labelText: `${metrics["mouth height"]} px` };

  metrics["mouth aspect ratio"] = round3(mouthHeight / (mouthWidth || 1e-6));
  geometry["mouth aspect ratio"] = geometry["mouth height"];

  const mouthCornerTilt = slope(lm[48], lm[54]);
  metrics["mouth corner tilt"] = mouthCornerTilt;
  geometry["mouth corner tilt"] = geometry["mouth width"];

  const mouthCornerHeightDiff = round3(lm[48].y - lm[54].y);
  metrics["mouth corner height diff"] = mouthCornerHeightDiff;
  geometry["mouth corner height diff"] = geometry["mouth width"];

  const upperLipThickness = dist(lm[51], lm[62]);
  const lowerLipThickness = dist(lm[57], lm[66]);
  metrics["upper lip thickness"] = Math.round(upperLipThickness);
  metrics["lower lip thickness"] = Math.round(lowerLipThickness);
  geometry["upper lip thickness"] = { type: "line", points: [lm[51], lm[62]], labelText: `${metrics["upper lip thickness"]} px` };
  geometry["lower lip thickness"] = { type: "line", points: [lm[57], lm[66]], labelText: `${metrics["lower lip thickness"]} px` };

  const philtrumLength = dist(lm[33], lm[51]);
  metrics["philtrum length"] = Math.round(philtrumLength);
  geometry["philtrum length"] = { type: "line", points: [lm[33], lm[51]], labelText: `${metrics["philtrum length"]} px` };

  const interlabialGap = dist(lm[62], lm[66]);
  metrics["interlabial gap"] = Math.round(interlabialGap);
  geometry["interlabial gap"] = { type: "line", points: [lm[62], lm[66]], labelText: `${metrics["interlabial gap"]} px` };

  // ---- VI. Queixo e terços faciais -------------------------------------------
  const chinHeightLower = dist(lm[57], lm[8]);
  metrics["chin height"] = Math.round(chinHeightLower);
  geometry["chin height"] = { type: "line", points: [lm[57], lm[8]], labelText: `${metrics["chin height"]} px` };

  metrics["upper to middle third ratio"] = round3(foreheadHeight / (middleFaceHeight || 1e-6));
  metrics["middle to lower third ratio"] = round3(middleFaceHeight / (lowerFaceHeight || 1e-6));
  metrics["upper to lower third ratio"] = round3(foreheadHeight / (lowerFaceHeight || 1e-6));
  geometry["upper to middle third ratio"] = geometry["forehead height"];
  geometry["middle to lower third ratio"] = geometry["middle face height"];
  geometry["upper to lower third ratio"] = geometry["lower face height"];

  metrics["mouth to nose width ratio"] = round3(mouthWidth / (noseWidth || 1e-6));
  metrics["mouth to interocular ratio"] = round3(mouthWidth / (interocularInner || 1e-6));
  geometry["mouth to nose width ratio"] = geometry["mouth width"];
  geometry["mouth to interocular ratio"] = geometry["mouth width"];

  // ---- VII. Mandíbula e simetria global ---------------------------------------
  const jawAngleLeftDeg = Math.round(angleOf3Points(faceShape[4], faceShape[0], faceShape[8]));
  const jawAngleRightDeg = Math.round(angleOf3Points(faceShape[12], faceShape[16], faceShape[8]));
  metrics["jaw angle left"] = jawAngleLeftDeg;
  metrics["jaw angle right"] = jawAngleRightDeg;
  geometry["jaw angle left"] = { type: "angle", points: [faceShape[0], faceShape[4], faceShape[8]], labelText: `${jawAngleLeftDeg}°` };
  geometry["jaw angle right"] = { type: "angle", points: [faceShape[16], faceShape[12], faceShape[8]], labelText: `${jawAngleRightDeg}°` };

  const jawSymmetryDiff = Math.round(Math.abs(dist(faceShape[8], faceShape[4]) - dist(faceShape[8], faceShape[12])));
  metrics["jaw symmetry diff"] = jawSymmetryDiff;
  geometry["jaw symmetry diff"] = { type: "multiline", points: [faceShape[8], faceShape[4], faceShape[8], faceShape[12]], labelText: `${jawSymmetryDiff} px` };

  const eyeAreaDiff = round3(Math.abs(leftEyeArea - rightEyeArea));
  metrics["eye area diff (left vs right)"] = eyeAreaDiff;
  geometry["eye area diff (left vs right)"] = { type: "multiline", points: [lm[36], lm[39], lm[42], lm[45]], labelText: `${eyeAreaDiff} px²` };

  const eyeWidthDiff = Math.round(Math.abs(leftEyeWidth - rightEyeWidth));
  metrics["eye width diff (left vs right)"] = eyeWidthDiff;
  geometry["eye width diff (left vs right)"] = geometry["eye area diff (left vs right)"];

  const eyebrowLengthDiff = Math.round(Math.abs(leftEyebrowLength - rightEyebrowLength));
  metrics["eyebrow length diff"] = eyebrowLengthDiff;
  geometry["eyebrow length diff"] = { type: "multiline", points: [lm[17], lm[21], lm[22], lm[26]], labelText: `${eyebrowLengthDiff} px` };

  const faceCenterX = (faceShape[0].x + faceShape[16].x) / 2;
  const nasalTipDeviation = Math.round(Math.abs(lm[33].x - faceCenterX));
  metrics["nasal tip lateral deviation"] = nasalTipDeviation;
  geometry["nasal tip lateral deviation"] = { type: "line", points: [lm[33], { x: faceCenterX, y: lm[33].y }], labelText: `${nasalTipDeviation} px` };

  const symmetryComponents = [
    1 - Math.min(1, eyeWidthDiff / (((leftEyeWidth + rightEyeWidth) / 2) || 1e-6)),
    1 - Math.min(1, eyebrowLengthDiff / (((leftEyebrowLength + rightEyebrowLength) / 2) || 1e-6)),
    1 - Math.min(1, jawSymmetryDiff / (jawWidthOuter || 1e-6)),
    1 - Math.min(1, nasalTipDeviation / (faceWidthOuter || 1e-6))
  ];
  const faceSymmetryScore = round3(
    symmetryComponents.reduce((s, v) => s + v, 0) / symmetryComponents.length
  );
  metrics["face symmetry score"] = faceSymmetryScore;
  geometry["face symmetry score"] = geometry["nasal tip lateral deviation"];

  return { metrics, geometry };
}

/* ---------------------------------------------------------------------- */
/* 3) NAVEGAÇÃO (Visão Geral / Planos / Análise)                           */
/* ---------------------------------------------------------------------- */

const viewSections = {
  overview: document.getElementById("view-overview"),
  plans: document.getElementById("view-plans"),
  analysis: document.getElementById("view-analysis")
};
const navLinkButtons = document.querySelectorAll(".nav-link[data-view]");

function switchView(viewName) {
  Object.entries(viewSections).forEach(([name, el]) => {
    if (!el) return;
    el.classList.toggle("active", name === viewName);
  });
  navLinkButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navLinkButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.goto));
});

document.getElementById("navCtaBtn").addEventListener("click", () => switchView("analysis"));

document.querySelectorAll("[data-plan-select]").forEach((btn) => {
  btn.addEventListener("click", () => {
    switchView("analysis");
    setStatus(`Plano "${btn.dataset.planSelect}" selecionado. Envie sua foto para começar.`, "success");
  });
});

/* ---------------------------------------------------------------------- */
/* 4) CAPTURA DE IMAGEM (upload / câmera) + DETECÇÃO DE LANDMARKS          */
/* ---------------------------------------------------------------------- */

const els = {
  captureArea: document.getElementById("captureArea"),
  capturePlaceholder: document.getElementById("capturePlaceholder"),
  video: document.getElementById("video"),
  overlayCanvas: document.getElementById("overlayCanvas"),
  previewImage: document.getElementById("previewImage"),
  fileInput: document.getElementById("fileInput"),
  startCameraBtn: document.getElementById("startCameraBtn"),
  captureBtn: document.getElementById("captureBtn"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  statusLine: document.getElementById("statusLine"),
  resultPanel: document.getElementById("resultPanel"),
  metricsList: document.getElementById("metricsList"),
  analysisContent: document.getElementById("analysisContent"),
  analysisLoader: document.getElementById("analysisLoader"),
  historyList: document.getElementById("historyList"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn")
};

let modelsLoaded = false;
let currentImageBlob = null;
let mediaStream = null;
let lastGeometry = null;

const MODEL_URL =
"https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

  function setStatus(message, type = "") {
    els.statusLine.textContent = message;
    els.statusLine.className = "status-line" + (type ? ` ${type}` : "");
  }

  async function ensureModelsLoaded() {
    if (modelsLoaded) return;
    if (typeof faceapi === "undefined") {
      throw new Error(
        "A biblioteca face-api.js não carregou (CDN bloqueado ou sem conexão). Recarregue a página."
      );
    }
    setStatus("Carregando modelos de detecção facial...");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL)
    ]);
    modelsLoaded = true;
    setStatus("Modelos carregados. Pronto para analisar.", "success");
  }

  function showPreviewImage(src) {
    els.capturePlaceholder.classList.add("hidden");
    els.video.classList.add("hidden");
    els.previewImage.src = src;
    els.previewImage.classList.remove("hidden");
    clearOverlay();
  }

  els.fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    currentImageBlob = file;
    stopCamera();
    const url = URL.createObjectURL(file);
    showPreviewImage(url);
    els.analyzeBtn.disabled = false;
    setStatus('Imagem carregada. Clique em "Analisar rosto".');
  });

  els.startCameraBtn.addEventListener("click", async () => {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      els.capturePlaceholder.classList.add("hidden");
      els.previewImage.classList.add("hidden");
      els.video.srcObject = mediaStream;
      els.video.classList.remove("hidden");
      els.captureBtn.classList.remove("hidden");
      setStatus("Câmera ativa. Centralize o rosto e capture a foto.");
    } catch (err) {
      setStatus("Não foi possível acessar a câmera: " + err.message, "error");
    }
  });

  function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    els.video.classList.add("hidden");
    els.captureBtn.classList.add("hidden");
  }

  els.captureBtn.addEventListener("click", () => {
    const canvas = document.createElement("canvas");
    canvas.width = els.video.videoWidth;
    canvas.height = els.video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      currentImageBlob = blob;
      const url = URL.createObjectURL(blob);
      stopCamera();
      showPreviewImage(url);
      els.analyzeBtn.disabled = false;
      setStatus('Foto capturada. Clique em "Analisar rosto".');
    }, "image/jpeg", 0.92);
  });

  els.analyzeBtn.addEventListener("click", async () => {
    if (!currentImageBlob) return;

    try {
      els.analyzeBtn.disabled = true;
      await ensureModelsLoaded();
      setStatus("Detectando landmarks faciais...");

      const imgEl = await blobToHTMLImage(currentImageBlob);
      const detection = await faceapi
      .detectSingleFace(imgEl, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

      if (!detection) {
        setStatus("Nenhum rosto detectado. Tente outra foto.", "error");
        els.analyzeBtn.disabled = false;
        return;
      }

      const landmarks68 = detection.landmarks.positions.map((p) => ({ x: p.x, y: p.y }));
      const { metrics, geometry } = measureFeatures(landmarks68);
      lastGeometry = geometry;
      renderMetrics(metrics);

      els.resultPanel.classList.remove("hidden");
      els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      els.analysisLoader.classList.remove("hidden");
      els.analysisContent.innerHTML = "";
      els.analysisContent.appendChild(els.analysisLoader);

      setStatus("Enviando métricas para análise...");

      const formData = new FormData();
      formData.append("image", currentImageBlob, "capture.jpg");
      formData.append("metrics", JSON.stringify(metrics));

      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na análise.");

      els.analysisContent.innerHTML = simpleMarkdownToHtml(data.analysis.gemini_analysis);
      setStatus("Análise concluída.", "success");
      loadHistory();
    } catch (err) {
      console.error(err);
      setStatus("Erro: " + err.message, "error");
      els.analysisContent.innerHTML = '<p class="empty-state">Não foi possível gerar a análise.</p>';
    } finally {
      els.analyzeBtn.disabled = false;
    }
  });

  function blobToHTMLImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }

  function updateMetricCountLabels(count) {
    ["heroStatCount", "heroLedeCount", "metricsPanelCount"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(count);
    });
      const plansLede = document.getElementById("plansLedeCount");
      if (plansLede) plansLede.textContent = `todas as ${count}`;
      const planFeature = document.getElementById("planFeatureCount");
      if (planFeature) planFeature.textContent = `Todas as ${count}`;
  }

  function renderMetrics(metrics) {
    els.metricsList.innerHTML = "";
    els.metricsList.classList.remove("hovering");
    const entries = Object.entries(metrics);
    updateMetricCountLabels(entries.length);
    entries.forEach(([label, value]) => {
      const unit = METRIC_UNITS[label] || "";
      const row = document.createElement("div");
      row.className = "metric-row";
      row.dataset.metricKey = label;
      row.innerHTML = `<span class="label">${label}</span><span class="value">${value}${unit ? " " + unit : ""}</span>`;
      els.metricsList.appendChild(row);
    });
  }

  function simpleMarkdownToHtml(md) {
    if (!md) return "<p>Sem conteúdo.</p>";
    return md
    .replace(/^### (.*$)/gim, "<h3>$1</h3>")
    .replace(/^## (.*$)/gim, "<h2>$1</h2>")
    .replace(/^# (.*$)/gim, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .concat("</p>");
  }

  /* ---------------------------------------------------------------------- */
  /* 5) OVERLAY EM CANVAS — desenha na foto o cálculo da métrica em hover    */
  /* ---------------------------------------------------------------------- */

  function getDisplayTransform() {
    const img = els.previewImage;
    if (!img.naturalWidth || !img.naturalHeight) return null;
    const rect = els.captureArea.getBoundingClientRect();
    const cw = rect.width;
    const ch = rect.height;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    const scale = Math.max(cw / nw, ch / nh); // espelha object-fit: cover
    const offsetX = (cw - nw * scale) / 2;
    const offsetY = (ch - nh * scale) / 2;
    return { scale, offsetX, offsetY, cw, ch };
  }

  function toDisplay(p, t) {
    return { x: t.offsetX + p.x * t.scale, y: t.offsetY + p.y * t.scale };
  }

  function resizeCanvasToDisplay() {
    const canvas = els.overlayCanvas;
    const rect = els.captureArea.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function clearOverlay() {
    const { ctx, width, height } = resizeCanvasToDisplay();
    ctx.clearRect(0, 0, width, height);
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawMetricOverlay(metricKey) {
    const t = getDisplayTransform();
    if (!t || !lastGeometry || !lastGeometry[metricKey]) return;
    const { ctx, width, height } = resizeCanvasToDisplay();
    ctx.clearRect(0, 0, width, height);

    const accentA = "#13294B";
    const accentB = "#0E6E52";
    const g = lastGeometry[metricKey];
    const disp = g.points.map((p) => toDisplay(p, t));

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = accentB;
    ctx.fillStyle = accentB;

    const drawPointMarker = (p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    };
    const drawLineSeg = (p1, p2) => {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    };

    if (g.type === "line") {
      drawLineSeg(disp[0], disp[1]);
      disp.forEach(drawPointMarker);
    } else if (g.type === "multiline") {
      for (let i = 0; i < disp.length; i += 2) {
        drawLineSeg(disp[i], disp[i + 1]);
        drawPointMarker(disp[i]);
        drawPointMarker(disp[i + 1]);
      }
    } else if (g.type === "polygon") {
      ctx.fillStyle = "rgba(14,110,82,0.16)";
      ctx.beginPath();
      disp.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = accentB;
      ctx.stroke();
    } else if (g.type === "polyline") {
      ctx.beginPath();
      disp.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      disp.forEach(drawPointMarker);
    } else if (g.type === "angle") {
      drawLineSeg(disp[0], disp[1]);
      drawLineSeg(disp[0], disp[2]);
      disp.forEach(drawPointMarker);
    }

    // Rótulo com o valor calculado
    const anchor = disp[Math.floor(disp.length / 2)] || disp[0];
    ctx.font = '600 11px "IBM Plex Mono", monospace';
    const paddingX = 6;
    const boxH = 18;
    const textW = ctx.measureText(g.labelText).width;
    const boxW = textW + paddingX * 2;
    let lx = anchor.x + 8;
    let ly = anchor.y - boxH - 8;
    if (lx + boxW > width) lx = width - boxW - 4;
    if (lx < 4) lx = 4;
    if (ly < 4) ly = anchor.y + 10;

    roundRectPath(ctx, lx, ly, boxW, boxH, 5);
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fill();
    ctx.strokeStyle = accentB;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = accentA;
    ctx.fillText(g.labelText, lx + paddingX, ly + boxH / 2 + 4);
  }

  els.metricsList.addEventListener("mouseover", (e) => {
    const row = e.target.closest(".metric-row");
    if (!row) return;
    els.metricsList.classList.add("hovering");
    els.metricsList.querySelectorAll(".metric-row").forEach((r) => r.classList.remove("metric-active"));
    row.classList.add("metric-active");
    drawMetricOverlay(row.dataset.metricKey);
  });

  els.metricsList.addEventListener("mouseleave", () => {
    els.metricsList.classList.remove("hovering");
    els.metricsList.querySelectorAll(".metric-row").forEach((r) => r.classList.remove("metric-active"));
    clearOverlay();
  });

  /* ---------------------------------------------------------------------- */
  /* 6) HISTÓRICO                                                            */
  /* ---------------------------------------------------------------------- */

  async function loadHistory() {
    els.historyList.innerHTML = '<p class="empty-state">Carregando histórico...</p>';
    try {
      const res = await fetch("/api/history?limit=20");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao buscar histórico.");

      if (!data.history || data.history.length === 0) {
        els.historyList.innerHTML = '<p class="empty-state">Nenhuma análise salva ainda.</p>';
        return;
      }

      els.historyList.innerHTML = "";
      data.history.forEach((item) => {
        const div = document.createElement("div");
        div.className = "history-item";
        const date = new Date(item.created_at).toLocaleString("pt-BR");
        const snippet = (item.gemini_analysis || "").replace(/[#*]/g, "").slice(0, 180);
        div.innerHTML = `
        <div class="history-date">${date}</div>
        <div class="history-snippet">${snippet}...</div>
        `;
        div.addEventListener("click", () => {
          lastGeometry = null;
          renderMetrics(item.metrics);
          els.analysisContent.innerHTML = simpleMarkdownToHtml(item.gemini_analysis);
          els.resultPanel.classList.remove("hidden");
          switchView("analysis");
          els.resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        els.historyList.appendChild(div);
      });
    } catch (err) {
      els.historyList.innerHTML = `<p class="empty-state">Erro ao carregar histórico: ${err.message}</p>`;
    }
  }

  els.refreshHistoryBtn.addEventListener("click", loadHistory);

  /* ---------------------------------------------------------------------- */
  /* Inicialização                                                           */
  /* ---------------------------------------------------------------------- */

  window.addEventListener("DOMContentLoaded", () => {
    loadHistory();
    ensureModelsLoaded().catch((err) => {
      setStatus("Falha ao carregar modelos de IA: " + err.message, "error");
    });
  });
