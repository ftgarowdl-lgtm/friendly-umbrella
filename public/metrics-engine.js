/* =============================================================================
 *   metrics-engine.js
 *   Motor puro de visão computacional / geometria facial.
 *   Extração das 150 métricas (100 estruturais + 50 de simetria bilateral) a
 *   partir dos 468 landmarks do MediaPipe Face Mesh. Sem dependências de DOM.
 *   ============================================================================= */

// -----------------------------------------------------------------------------
// Índices de landmarks do MediaPipe Face Mesh (468 pontos) usados nas métricas.
// Referência pública do topology do FaceMesh.
// -----------------------------------------------------------------------------
const LM = {
    foreheadTop: 10,        // topo da testa / linha do cabelo aproximada
        glabella: 9,             // gabela (entre sobrancelhas)
        nasion: 168,              // raiz nasal
        noseTip: 1,               // ponta do nariz
        subnasale: 2,             // base do nariz / subnasale
        gnathion: 152,            // ponto mais inferior do queixo
        chinTop: 175,             // sulco lábio-mentoniano aproximado

        // olho direito (do ponto de vista do observador)
        rEyeOuter: 33, rEyeInner: 133, rEyeTop: 159, rEyeBottom: 145,
        rEyeTop2: 158, rEyeBottom2: 144,
        // olho esquerdo
        lEyeOuter: 263, lEyeInner: 362, lEyeTop: 386, lEyeBottom: 374,
        lEyeTop2: 385, lEyeBottom2: 380,

        // sobrancelhas
        rBrowInner: 55, rBrowMid: 105, rBrowOuter: 46, rBrowApex: 105, rBrowTail: 124,
        lBrowInner: 285, lBrowMid: 334, lBrowOuter: 276, lBrowApex: 334, lBrowTail: 353,

        // nariz
        noseBridgeL: 236, noseBridgeR: 456,
        alarL: 129, alarR: 358,
        nostrilL: 98, nostrilR: 327,
        nostrilTopL: 197, nostrilTopR: 419,
        columellaTop: 6, columellaBottom: 2,

        // boca
        mouthL: 61, mouthR: 291,
        upperLipTop: 0, upperLipBottom: 13,
        lowerLipTop: 14, lowerLipBottom: 17,
        cupidL: 37, cupidR: 267, cupidCenter: 0,

        // largura facial / mandíbula
        zygomaticL: 234, zygomaticR: 454,
        gonionL: 172, gonionR: 397,
        templeL: 21, templeR: 251,
        cheekL: 132, cheekR: 361,

        // pupilas (aprox usando centro dos olhos)
};

// -----------------------------------------------------------------------------
// Funções geométricas auxiliares
// -----------------------------------------------------------------------------
function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function slope(a, b) {
    return (b.y - a.y) / ((b.x - a.x) || 1e-6);
}

function angleOf3Points(a, b, c) {
    // ângulo em graus no vértice b, formado por a-b-c
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.hypot(v1.x, v1.y);
    const mag2 = Math.hypot(v2.x, v2.y);
    const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2 || 1e-6)));
    return (Math.acos(cos) * 180) / Math.PI;
}

function shapeArea(points) {
    // fórmula do shoelace (Gauss)
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area) / 2;
}

function round(v, d = 2) {
    if (typeof v !== 'number' || !isFinite(v)) return null;
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
}

function angleFromHorizontal(a, b) {
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

// -----------------------------------------------------------------------------
// FUNÇÃO PRINCIPAL: measure_features(landmarks)
// Recebe o array de 468 landmarks normalizados (x,y) do MediaPipe e retorna
// o dicionário com as 100 métricas antropométricas.
// -----------------------------------------------------------------------------
function measure_all_features(landmarks) {
    const P = (i) => landmarks[i];
    const m = {};

    // ---------------------------------------------------------------------
    // I. Terços Faciais e Proporções Verticais (1-10)
    // ---------------------------------------------------------------------
    const foreheadHeight = dist(P(LM.foreheadTop), P(LM.glabella));
    const middleFaceHeight = dist(P(LM.glabella), P(LM.subnasale));
    const lowerFaceHeight = dist(P(LM.subnasale), P(LM.gnathion));
    const totalFacialHeight = dist(P(LM.foreheadTop), P(LM.gnathion));

    m.forehead_height = round(foreheadHeight);
    m.middle_face_height = round(middleFaceHeight);
    m.lower_face_height = round(lowerFaceHeight);
    m.total_facial_height = round(totalFacialHeight);
    m.upper_to_middle_ratio = round(foreheadHeight / (middleFaceHeight || 1e-6));
    m.middle_to_lower_ratio = round(middleFaceHeight / (lowerFaceHeight || 1e-6));
    m.upper_to_lower_ratio = round(foreheadHeight / (lowerFaceHeight || 1e-6));
    m.trichion_to_glabella = round(dist(P(LM.foreheadTop), P(LM.glabella)));
    m.glabella_to_subnasale = round(dist(P(LM.glabella), P(LM.subnasale)));
    m.subnasale_to_gnathion = round(dist(P(LM.subnasale), P(LM.gnathion)));

    // ---------------------------------------------------------------------
    // II. Larguras e Proporções Horizontais (11-20)
    // ---------------------------------------------------------------------
    const bizygomatic = dist(P(LM.zygomaticL), P(LM.zygomaticR));
    const bigonial = dist(P(LM.gonionL), P(LM.gonionR));
    const bicoronal = dist(P(LM.templeL), P(LM.templeR));
    const intercanthal = dist(P(LM.rEyeInner), P(LM.lEyeInner));
    const biocular = dist(P(LM.rEyeOuter), P(LM.lEyeOuter));
    const interpupillar = dist(
        midpoint(P(LM.rEyeOuter), P(LM.rEyeInner)),
                               midpoint(P(LM.lEyeOuter), P(LM.lEyeInner))
    );
    const nasalWidth = dist(P(LM.alarL), P(LM.alarR));
    const mouthWidth = dist(P(LM.mouthL), P(LM.mouthR));

    m.bizygomatic_width = round(bizygomatic);
    m.bigonial_width = round(bigonial);
    m.bicoronal_width = round(bicoronal);
    m.bigonial_to_bizygomatic_ratio = round(bigonial / (bizygomatic || 1e-6));
    m.intercanthal_width = round(intercanthal);
    m.biocular_width = round(biocular);
    m.interpupillar_distance = round(interpupillar);
    m.nasal_width = round(nasalWidth);
    m.mouth_width = round(mouthWidth);
    m.face_width_to_height_ratio = round(bizygomatic / (totalFacialHeight || 1e-6));

    // ---------------------------------------------------------------------
    // III. Olhos e Região Periocular (21-40)
    // ---------------------------------------------------------------------
    const rEyePoly = [P(LM.rEyeOuter), P(LM.rEyeTop), P(LM.rEyeTop2), P(LM.rEyeInner), P(LM.rEyeBottom2), P(LM.rEyeBottom)];
    const lEyePoly = [P(LM.lEyeOuter), P(LM.lEyeTop), P(LM.lEyeTop2), P(LM.lEyeInner), P(LM.lEyeBottom2), P(LM.lEyeBottom)];
    const rEyeW = dist(P(LM.rEyeOuter), P(LM.rEyeInner));
    const lEyeW = dist(P(LM.lEyeOuter), P(LM.lEyeInner));
    const rEyeH = dist(P(LM.rEyeTop), P(LM.rEyeBottom));
    const lEyeH = dist(P(LM.lEyeTop), P(LM.lEyeBottom));

    m.left_eye_area = round(shapeArea(lEyePoly), 5);
    m.right_eye_area = round(shapeArea(rEyePoly), 5);
    m.left_eye_width = round(lEyeW);
    m.right_eye_width = round(rEyeW);
    m.left_eye_height = round(lEyeH);
    m.right_eye_height = round(rEyeH);
    m.left_eye_aspect_ratio = round(lEyeH / (lEyeW || 1e-6));
    m.right_eye_aspect_ratio = round(rEyeH / (rEyeW || 1e-6));
    m.left_canthal_tilt = round(angleFromHorizontal(P(LM.lEyeInner), P(LM.lEyeOuter)), 2);
    m.right_canthal_tilt = round(angleFromHorizontal(P(LM.rEyeInner), P(LM.rEyeOuter)), 2);
    m.eye_to_eyebrow_distance_left = round(dist(P(LM.lEyeTop), P(LM.lBrowMid)));
    m.eye_to_eyebrow_distance_right = round(dist(P(LM.rEyeTop), P(LM.rBrowMid)));
    m.upper_eyelid_exposure_left = round(dist(P(LM.lEyeTop), P(LM.lBrowInner)));
    m.upper_eyelid_exposure_right = round(dist(P(LM.rEyeTop), P(LM.rBrowInner)));
    m.palpebral_fissure_inclination = round(
        (angleFromHorizontal(P(LM.lEyeInner), P(LM.lEyeOuter)) +
        angleFromHorizontal(P(LM.rEyeInner), P(LM.rEyeOuter))) / 2, 2
    );
    m.endocanthion_to_exocanthion_left = round(lEyeW);
    m.endocanthion_to_exocanthion_right = round(rEyeW);
    m.inter_eye_space_ratio = round(intercanthal / (((lEyeW + rEyeW) / 2) || 1e-6));
    m.eyeball_protrusion_estimate = round(dist(P(LM.rEyeOuter), P(LM.lEyeOuter)) - biocular === 0 ? 0 : (rEyeH + lEyeH) / 2, 3);
    m.periocular_symmetry_index = round(1 - Math.abs(lEyeH - rEyeH) / (((lEyeH + rEyeH) / 2) || 1e-6), 3);

    // ---------------------------------------------------------------------
    // IV. Nariz e Região Nasal (41-60)
    // ---------------------------------------------------------------------
    const noseLength = dist(P(LM.glabella), P(LM.noseTip));
    const noseBridgeWidth = dist(P(LM.noseBridgeL), P(LM.noseBridgeR));
    const noseTipWidth = dist(P(LM.alarL), P(LM.alarR));
    const columellaLen = dist(P(LM.columellaTop), P(LM.columellaBottom));
    const nostrilH = dist(P(LM.nostrilTopL), P(LM.nostrilL));

    m.nose_length = round(noseLength);
    m.nose_bridge_width = round(noseBridgeWidth);
    m.nose_tip_width = round(noseTipWidth);
    m.nasal_index = round(nasalWidth / (noseLength || 1e-6));
    m.nasolabial_angle = round(angleOf3Points(P(LM.columellaTop), P(LM.subnasale), P(LM.upperLipTop)), 2);
    m.nose_tip_projection = round(dist(P(LM.noseTip), midpoint(P(LM.alarL), P(LM.alarR))));
    m.columella_length = round(columellaLen);
    m.nostril_height = round(nostrilH);
    m.nostril_width = round(dist(P(LM.nostrilL), P(LM.nostrilR)) / 2);
    m.nose_symmetry_deviation = round(Math.abs(P(LM.noseTip).x - midpoint(P(LM.alarL), P(LM.alarR)).x), 4);
    m.dorsum_convexity_index = round(angleOf3Points(P(LM.glabella), P(LM.nasion), P(LM.noseTip)), 2);
    m.nasofrontal_angle = round(angleOf3Points(P(LM.foreheadTop), P(LM.glabella), P(LM.nasion)), 2);
    m.mentonasal_angle = round(angleOf3Points(P(LM.noseTip), P(LM.subnasale), P(LM.gnathion)), 2);
    m.alar_base_width_ratio = round(nasalWidth / (intercanthal || 1e-6));
    m.tip_defining_points_distance = round(dist(P(LM.alarL), P(LM.alarR)) * 0.5);
    m.supratip_break_depth = round(dist(P(LM.nasion), P(LM.noseTip)) - noseLength === 0 ? 0 : Math.abs(dist(P(LM.nasion), P(LM.noseTip)) - noseLength), 4);
    m.columella_to_lobule_ratio = round(columellaLen / (noseTipWidth || 1e-6));
    m.nasal_projection_goode_ratio = round(m.nose_tip_projection / (noseLength || 1e-6));
    m.nasal_facial_angle = round(angleOf3Points(P(LM.foreheadTop), P(LM.noseTip), P(LM.gnathion)), 2);
    m.nose_area_total = round(shapeArea([P(LM.nasion), P(LM.alarL), P(LM.noseTip), P(LM.alarR)]), 5);

    // ---------------------------------------------------------------------
    // V. Lábios, Boca e Região Nariz-Boca (61-75)
    // ---------------------------------------------------------------------
    const upperLipH = dist(P(LM.upperLipTop), P(LM.upperLipBottom));
    const lowerLipH = dist(P(LM.lowerLipTop), P(LM.lowerLipBottom));
    const philtrumLen = dist(P(LM.subnasale), P(LM.upperLipTop));

    m.upper_lip_height = round(upperLipH);
    m.lower_lip_height = round(lowerLipH);
    m.philtrum_length = round(philtrumLen);
    m.philtrum_width = round(dist(P(LM.cupidL), P(LM.cupidR)));
    m.upper_to_lower_lip_ratio = round(upperLipH / (lowerLipH || 1e-6));
    m.mouth_corner_angle = round(angleOf3Points(P(LM.mouthL), P(LM.upperLipBottom), P(LM.mouthR)), 2);
    m.subnasale_to_upper_lip = round(philtrumLen);
    m.lip_thickness_total = round(upperLipH + lowerLipH);
    m.cupids_bow_width = round(dist(P(LM.cupidL), P(LM.cupidR)));
    m.cupids_bow_depth = round(Math.abs(P(LM.cupidCenter).y - midpoint(P(LM.cupidL), P(LM.cupidR)).y));
    m.interlabial_gap = round(dist(P(LM.upperLipBottom), P(LM.lowerLipTop)));
    m.mouth_to_nose_width_ratio = round(mouthWidth / (nasalWidth || 1e-6));
    m.mouth_to_intercanthal_ratio = round(mouthWidth / (intercanthal || 1e-6));
    m.vermilion_border_definition = round((upperLipH + lowerLipH) / (mouthWidth || 1e-6));
    m.labiomental_fold_depth = round(dist(P(LM.lowerLipBottom), P(LM.chinTop)));

    // ---------------------------------------------------------------------
    // VI. Maxilar, Mento e Mandíbula (76-85)
    // ---------------------------------------------------------------------
    const chinHeight = dist(P(LM.chinTop), P(LM.gnathion));
    const jawAngleL = angleOf3Points(P(LM.zygomaticL), P(LM.gonionL), P(LM.gnathion));
    const jawAngleR = angleOf3Points(P(LM.zygomaticR), P(LM.gonionR), P(LM.gnathion));

    m.chin_height = round(chinHeight);
    m.chin_width = round(dist(P(LM.gonionL), P(LM.gonionR)) * 0.5);
    m.chin_projection = round(dist(P(LM.gnathion), midpoint(P(LM.gonionL), P(LM.gonionR))));
    m.jaw_angle_degree = round((jawAngleL + jawAngleR) / 2, 2);
    m.mandibular_ramus_height = round((dist(P(LM.zygomaticL), P(LM.gonionL)) + dist(P(LM.zygomaticR), P(LM.gonionR))) / 2);
    m.bigonial_to_intercanthal_ratio = round(bigonial / (intercanthal || 1e-6));
    m.chin_to_philtrum_ratio = round(chinHeight / (philtrumLen || 1e-6));
    m.jaw_symmetry_index = round(1 - Math.abs(jawAngleL - jawAngleR) / (((jawAngleL + jawAngleR) / 2) || 1e-6), 3);
    m.menton_deviation = round(Math.abs(P(LM.gnathion).x - midpoint(P(LM.zygomaticL), P(LM.zygomaticR)).x), 4);
    m.gonial_sharpness_index = round(180 - ((jawAngleL + jawAngleR) / 2), 2);

    // ---------------------------------------------------------------------
    // VII. Sobrancelhas e Região Supraorbital (86-92)
    // ---------------------------------------------------------------------
    m.eyebrows_distance = round(dist(P(LM.rBrowInner), P(LM.lBrowInner)));
    m.left_eyebrow_length = round(dist(P(LM.lBrowInner), P(LM.lBrowOuter)));
    m.right_eyebrow_length = round(dist(P(LM.rBrowInner), P(LM.rBrowOuter)));
    m.left_eyebrow_apex_height = round(Math.abs(P(LM.lBrowApex).y - P(LM.lEyeTop).y));
    m.right_eyebrow_apex_height = round(Math.abs(P(LM.rBrowApex).y - P(LM.rEyeTop).y));
    m.eyebrow_slope_left = round(angleFromHorizontal(P(LM.lBrowInner), P(LM.lBrowTail)), 2);
    m.eyebrow_slope_right = round(angleFromHorizontal(P(LM.rBrowInner), P(LM.rBrowTail)), 2);

    // ---------------------------------------------------------------------
    // VIII. Índices Globais (93-100)
    // ---------------------------------------------------------------------
    const symPairs = [
        [LM.rEyeOuter, LM.lEyeOuter], [LM.rEyeInner, LM.lEyeInner],
        [LM.alarL, LM.alarR], [LM.mouthL, LM.mouthR],
        [LM.gonionL, LM.gonionR], [LM.zygomaticL, LM.zygomaticR]
    ];
    const centerX = P(LM.noseTip).x;
    let symDeviations = [];
    symPairs.forEach(([a, b]) => {
        const da = Math.abs(P(a).x - centerX);
        const db = Math.abs(P(b).x - centerX);
        symDeviations.push(Math.abs(da - db));
    });
    const avgSymDeviation = symDeviations.reduce((s, v) => s + v, 0) / symDeviations.length;

    const verticalGoldenTarget = 1.618;
    const verticalRatioActual = totalFacialHeight / (bizygomatic || 1e-6);
    const horizontalGoldenTarget = 1.618;
    const horizontalRatioActual = mouthWidth ? (nasalWidth || 1e-6) / (mouthWidth / 1.5 || 1e-6) : 0;

    m.facial_dimorphism_index = round(bigonial / (bizygomatic || 1e-6), 3);
    m.global_symmetry_score = round(1 - avgSymDeviation, 3);
    m.golden_ratio_vertical_score = round(1 - Math.abs(verticalRatioActual - verticalGoldenTarget) / verticalGoldenTarget, 3);
    m.golden_ratio_horizontal_score = round(1 - Math.abs(horizontalRatioActual - horizontalGoldenTarget) / horizontalGoldenTarget, 3);
    m.facial_convexity_angle = round(angleOf3Points(P(LM.glabella), P(LM.noseTip), P(LM.gnathion)), 2);
    m.structural_robustness_index = round(bizygomatic / (totalFacialHeight || 1e-6), 3);
    m.inter_feature_proportionality = round(
        (m.upper_to_middle_ratio + m.middle_to_lower_ratio + m.face_width_to_height_ratio) / 3, 3
    );
    const harmonyComponents = [
        m.global_symmetry_score, m.golden_ratio_vertical_score, m.golden_ratio_horizontal_score
    ].filter((v) => typeof v === 'number');
    m.overall_aesthetic_harmony_score = round(
        (harmonyComponents.reduce((s, v) => s + v, 0) / (harmonyComponents.length || 1)) * 100, 2
    );

    // =========================================================================
    // PARTE 2 — SUÍTE DE SIMETRIA BILATERAL (101-150)
    // Compara sistematicamente o hemisfério esquerdo e direito da face.
    // =========================================================================
    function mirrorDeviation(ptL, ptR, axisX) {
        // desvio de espelhamento: quanto a distância de cada ponto ao eixo sagital difere
        return Math.abs(Math.abs(ptL.x - axisX) - Math.abs(ptR.x - axisX));
    }

    const axisX = P(LM.glabella).x; // eixo sagital aproximado (linha média facial)

    // --- Simetria Periocular (101-110) ---
    m.left_to_right_eye_width_diff = round(Math.abs(lEyeW - rEyeW));
    m.left_to_right_eye_height_diff = round(Math.abs(lEyeH - rEyeH));
    m.left_to_right_eye_area_diff = round(Math.abs(m.left_eye_area - m.right_eye_area), 4);
    m.left_to_right_canthal_tilt_diff = round(Math.abs(m.left_canthal_tilt - m.right_canthal_tilt));
    m.eye_vertical_alignment_offset = round(Math.abs(P(LM.lEyeInner).y - P(LM.rEyeInner).y));
    m.left_to_right_eyebrow_length_diff = round(Math.abs(m.left_eyebrow_length - m.right_eyebrow_length));
    m.left_to_right_eyebrow_apex_diff = round(Math.abs(m.left_eyebrow_apex_height - m.right_eyebrow_apex_height));
    m.left_to_right_eyebrow_slope_diff = round(Math.abs(m.eyebrow_slope_left - m.eyebrow_slope_right));
    m.eyebrow_vertical_symmetry_index = round(
        1 - Math.abs(P(LM.lBrowMid).y - P(LM.rBrowMid).y) / (((P(LM.lBrowMid).y + P(LM.rBrowMid).y) / 2) || 1e-6)
    );
    m.left_to_right_eyebrow_thickness_diff = round(
        Math.abs(dist(P(LM.lBrowInner), P(LM.lBrowApex)) - dist(P(LM.rBrowInner), P(LM.rBrowApex)))
    );

    // --- Simetria Nasal (111-118) ---
    const nostrilWL = dist(P(LM.nostrilL), P(LM.alarL));
    const nostrilWR = dist(P(LM.nostrilR), P(LM.alarR));
    const nostrilHL = dist(P(LM.nostrilTopL), P(LM.nostrilL));
    const nostrilHR = dist(P(LM.nostrilTopR), P(LM.nostrilR));
    m.nostril_width_asymmetry_ratio = round(nostrilWL / (nostrilWR || 1e-6));
    m.nostril_height_asymmetry_ratio = round(nostrilHL / (nostrilHR || 1e-6));
    m.nostril_area_asymmetry = round(Math.abs((nostrilWL * nostrilHL) - (nostrilWR * nostrilHR)), 4);
    m.nasal_tip_lateral_deviation = round(Math.abs(P(LM.noseTip).x - axisX));
    m.nasal_dorsum_tilt_angle = round(angleFromHorizontal(P(LM.nasion), P(LM.noseTip)) - 90);
    m.alar_base_projection_asymmetry = round(Math.abs(dist(P(LM.alarL), P(LM.noseTip)) - dist(P(LM.alarR), P(LM.noseTip))));
    m.columella_lateral_offset = round(Math.abs(P(LM.columellaBottom).x - axisX));
    m.nasal_axis_deviation_index = round(
        Math.abs(P(LM.noseTip).x - midpoint(P(LM.alarL), P(LM.alarR)).x) / (nasalWidth || 1e-6)
    );

    // --- Simetria Labial e Oral (119-127) ---
    const upperLipHL = dist(P(LM.cupidL), P(LM.upperLipBottom));
    const upperLipHR = dist(P(LM.cupidR), P(LM.upperLipBottom));
    const lowerLipHL = dist(P(LM.mouthL), P(LM.lowerLipBottom));
    const lowerLipHR = dist(P(LM.mouthR), P(LM.lowerLipBottom));
    m.upper_lip_height_left_vs_right = round(Math.abs(upperLipHL - upperLipHR));
    m.lower_lip_height_left_vs_right = round(Math.abs(lowerLipHL - lowerLipHR));
    m.lip_commissure_height_difference = round(Math.abs(P(LM.mouthL).y - P(LM.mouthR).y));
    m.left_to_right_upper_lip_area_diff = round(
        Math.abs(shapeArea([P(LM.mouthL), P(LM.cupidL), P(LM.upperLipBottom)]) -
        shapeArea([P(LM.mouthR), P(LM.cupidR), P(LM.upperLipBottom)])), 4
    );
    m.left_to_right_lower_lip_area_diff = round(
        Math.abs(shapeArea([P(LM.mouthL), P(LM.lowerLipBottom), P(LM.lowerLipTop)]) -
        shapeArea([P(LM.mouthR), P(LM.lowerLipBottom), P(LM.lowerLipTop)])), 4
    );
    m.cupids_bow_lateral_offset = round(Math.abs(midpoint(P(LM.cupidL), P(LM.cupidR)).x - axisX));
    m.philtrum_ridge_asymmetry = round(Math.abs(dist(P(LM.cupidL), P(LM.subnasale)) - dist(P(LM.cupidR), P(LM.subnasale))));
    m.mouth_width_left_segment_ratio = round(
        dist(P(LM.mouthL), midpoint(P(LM.cupidL), P(LM.cupidR))) / (mouthWidth || 1e-6)
    );
    m.oral_slit_tilt_angle = round(angleFromHorizontal(P(LM.mouthL), P(LM.mouthR)));

    // --- Simetria Maxilar e Mandibular (128-136) ---
    m.chin_lateral_deviation = round(Math.abs(P(LM.gnathion).x - axisX));
    m.left_to_right_chin_width_diff = round(
        Math.abs(dist(P(LM.gnathion), P(LM.gonionL)) - dist(P(LM.gnathion), P(LM.gonionR)))
    );
    m.gonial_angle_left_vs_right_diff = round(Math.abs(jawAngleL - jawAngleR));
    m.mandibular_ramus_height_diff = round(
        Math.abs(dist(P(LM.zygomaticL), P(LM.gonionL)) - dist(P(LM.zygomaticR), P(LM.gonionR)))
    );
    m.bigonial_width_symmetry_balance = round(
        1 - mirrorDeviation(P(LM.gonionL), P(LM.gonionR), axisX) / (bigonial || 1e-6)
    );
    m.jaw_line_slope_asymmetry = round(
        Math.abs(angleFromHorizontal(P(LM.gonionL), P(LM.gnathion)) - angleFromHorizontal(P(LM.gonionR), P(LM.gnathion)))
    );
    m.bizygomatic_width_symmetry_balance = round(
        1 - mirrorDeviation(P(LM.zygomaticL), P(LM.zygomaticR), axisX) / (bizygomatic || 1e-6)
    );
    m.zygomatic_arch_height_diff = round(Math.abs(P(LM.zygomaticL).y - P(LM.zygomaticR).y));
    m.temporal_width_asymmetry = round(mirrorDeviation(P(LM.templeL), P(LM.templeR), axisX));

    // --- Simetria Global e Vetores de Mapeamento (137-150) ---
    const mirrorPairs = [
        [LM.rEyeOuter, LM.lEyeOuter], [LM.rEyeInner, LM.lEyeInner],
        [LM.alarL, LM.alarR], [LM.mouthL, LM.mouthR],
        [LM.gonionL, LM.gonionR], [LM.zygomaticL, LM.zygomaticR],
        [LM.templeL, LM.templeR], [LM.rBrowInner, LM.lBrowInner]
    ];
    const deviations = mirrorPairs.map(([a, b]) => mirrorDeviation(P(a), P(b), axisX));
    const sqDeviations = deviations.map((d) => d * d);
    const meanDeviation = deviations.reduce((s, v) => s + v, 0) / deviations.length;
    const varianceDeviation = deviations.reduce((s, v) => s + Math.pow(v - meanDeviation, 2), 0) / deviations.length;
    const mse = sqDeviations.reduce((s, v) => s + v, 0) / sqDeviations.length;

    const leftHalf = [P(LM.zygomaticL), P(LM.gonionL), P(LM.gnathion), P(LM.foreheadTop)];
    const rightHalf = [P(LM.zygomaticR), P(LM.gonionR), P(LM.gnathion), P(LM.foreheadTop)];
    const leftArea = shapeArea(leftHalf);
    const rightArea = shapeArea(rightHalf);
    const leftPerimeter = dist(leftHalf[0], leftHalf[1]) + dist(leftHalf[1], leftHalf[2]) + dist(leftHalf[2], leftHalf[3]) + dist(leftHalf[3], leftHalf[0]);
    const rightPerimeter = dist(rightHalf[0], rightHalf[1]) + dist(rightHalf[1], rightHalf[2]) + dist(rightHalf[2], rightHalf[3]) + dist(rightHalf[3], rightHalf[0]);

    m.sagittal_plane_deviation_vector = round(meanDeviation, 4);
    m.bilateral_euclidean_distance_variance = round(varianceDeviation, 4);
    m.mean_squared_error_landmarks_mirror = round(mse, 4);
    m.facial_hemi_area_ratio_left_right = round(leftArea / (rightArea || 1e-6));
    m.hemi_perimeter_difference_left_right = round(Math.abs(leftPerimeter - rightPerimeter));
    m.transverse_symmetry_coefficient = round(1 - (meanDeviation / (bizygomatic || 1e-6)));
    m.periocular_symmetry_score_advanced = round(
        1 - ((m.left_to_right_eye_width_diff + m.left_to_right_eye_height_diff + m.eye_vertical_alignment_offset) / 3) /
        (((lEyeW + rEyeW) / 2) || 1e-6)
    );
    m.maxillomandibular_symmetry_index = round(
        1 - ((m.left_to_right_chin_width_diff + m.gonial_angle_left_vs_right_diff / 100 + m.mandibular_ramus_height_diff) / 3) /
        (bigonial || 1e-6)
    );
    m.nasal_oral_axis_alignment_variance = round(
        Math.abs(m.nasal_tip_lateral_deviation - m.cupids_bow_lateral_offset), 4
    );
    m.frontal_upper_third_symmetry_index = round(
        1 - Math.abs(P(LM.templeL).y - P(LM.templeR).y) / (foreheadHeight || 1e-6)
    );
    m.mid_face_bilateral_balance_score = round(
        1 - (m.nasal_tip_lateral_deviation + m.alar_base_projection_asymmetry) / (middleFaceHeight || 1e-6)
    );
    m.lower_face_bilateral_balance_score = round(
        1 - (m.chin_lateral_deviation + m.left_to_right_chin_width_diff) / (lowerFaceHeight || 1e-6)
    );

    const globalComponents = [
        m.periocular_symmetry_score_advanced,
        m.maxillomandibular_symmetry_index,
        m.frontal_upper_third_symmetry_index,
        m.mid_face_bilateral_balance_score,
        m.lower_face_bilateral_balance_score,
        m.transverse_symmetry_coefficient
    ].filter((v) => typeof v === 'number' && isFinite(v));
    m.global_bilateral_symmetry_index = round(
        globalComponents.reduce((s, v) => s + v, 0) / (globalComponents.length || 1)
    );

    const severity = 1 - m.global_bilateral_symmetry_index;
    m.asymmetry_severity_classification_score = round(Math.max(0, Math.min(1, severity)) * 100);

    return m;
}

// =============================================================================
// MOTOR DE PONTUAÇÃO ESTATÍSTICA
// Para cada métrica, define uma faixa de normalidade [mean, sd] observada em
// literatura antropométrica geral (valores aproximados, normalizados à escala
// de coordenadas 0-1 do MediaPipe). A partir do z-score, calcula:
//   - um score 0-10 (10 = perfeitamente na média/ideal, decai com o desvio)
//   - uma classificação: "below_average" | "average" | "above_average"
// Isso é determinístico (mesma entrada → mesma saída), não é um julgamento
// subjetivo de "beleza" — é apenas a posição estatística de cada proporção
// dentro de uma distribuição de referência.
// =============================================================================

// mean = valor central esperado; sd = desvio padrão de referência (tolerância)
// higherIsBetter é usado apenas para orientar a cor da barra em índices onde
// "mais alto" tende a mais simetria/harmonia (ex: *_symmetry_index).
const METRIC_NORMS = {
    upper_to_middle_ratio:            { mean: 1.00, sd: 0.12 },
    middle_to_lower_ratio:            { mean: 1.00, sd: 0.12 },
    upper_to_lower_ratio:             { mean: 1.00, sd: 0.15 },
    bigonial_to_bizygomatic_ratio:    { mean: 0.78, sd: 0.08 },
    face_width_to_height_ratio:       { mean: 1.90, sd: 0.20 },
    left_eye_aspect_ratio:            { mean: 0.30, sd: 0.06 },
    right_eye_aspect_ratio:           { mean: 0.30, sd: 0.06 },
    left_canthal_tilt:                { mean: -6.0, sd: 5.0 },
    right_canthal_tilt:               { mean: -6.0, sd: 5.0 },
    inter_eye_space_ratio:            { mean: 1.00, sd: 0.15 },
    periocular_symmetry_index:        { mean: 0.95, sd: 0.05, higherIsBetter: true },
    nasal_index:                      { mean: 0.66, sd: 0.10 },
    nasolabial_angle:                 { mean: 100,  sd: 12 },
    dorsum_convexity_index:           { mean: 170,  sd: 12 },
    nasofrontal_angle:                { mean: 135,  sd: 12 },
    mentonasal_angle:                 { mean: 125,  sd: 12 },
    alar_base_width_ratio:            { mean: 1.00, sd: 0.15 },
    nasal_projection_goode_ratio:     { mean: 0.55, sd: 0.10 },
    upper_to_lower_lip_ratio:         { mean: 0.60, sd: 0.15 },
    mouth_corner_angle:               { mean: 150,  sd: 15 },
    mouth_to_nose_width_ratio:        { mean: 1.55, sd: 0.20 },
    mouth_to_intercanthal_ratio:      { mean: 1.10, sd: 0.15 },
    jaw_angle_degree:                 { mean: 125,  sd: 10 },
    bigonial_to_intercanthal_ratio:   { mean: 2.60, sd: 0.30 },
    chin_to_philtrum_ratio:           { mean: 2.20, sd: 0.40 },
    jaw_symmetry_index:               { mean: 0.95, sd: 0.05, higherIsBetter: true },
    gonial_sharpness_index:           { mean: 55,   sd: 10 },
    eyebrow_slope_left:               { mean: -8,   sd: 6 },
    eyebrow_slope_right:              { mean: -8,   sd: 6 },
    facial_dimorphism_index:          { mean: 0.78, sd: 0.08 },
    global_symmetry_score:            { mean: 0.95, sd: 0.05, higherIsBetter: true },
    golden_ratio_vertical_score:      { mean: 0.90, sd: 0.08, higherIsBetter: true },
    golden_ratio_horizontal_score:    { mean: 0.90, sd: 0.08, higherIsBetter: true },
    facial_convexity_angle:           { mean: 168,  sd: 10 },
    structural_robustness_index:      { mean: 0.78, sd: 0.10 },
    inter_feature_proportionality:    { mean: 1.00, sd: 0.15 },
    overall_aesthetic_harmony_score:  { mean: 90,   sd: 8, higherIsBetter: true },

    // --- Parte 2: simetria (quanto menor o desvio, melhor => "higherIsBetter: false" com mean 0) ---
    left_to_right_eye_width_diff:        { mean: 0, sd: 0.01 },
    left_to_right_eye_height_diff:       { mean: 0, sd: 0.008 },
    left_to_right_canthal_tilt_diff:     { mean: 0, sd: 4 },
    eye_vertical_alignment_offset:       { mean: 0, sd: 0.008 },
    left_to_right_eyebrow_length_diff:   { mean: 0, sd: 0.01 },
    nostril_width_asymmetry_ratio:       { mean: 1, sd: 0.10 },
    nostril_height_asymmetry_ratio:      { mean: 1, sd: 0.10 },
    nasal_tip_lateral_deviation:         { mean: 0, sd: 0.01 },
    cupids_bow_lateral_offset:           { mean: 0, sd: 0.008 },
    oral_slit_tilt_angle:                { mean: 0, sd: 4 },
    chin_lateral_deviation:              { mean: 0, sd: 0.01 },
    gonial_angle_left_vs_right_diff:     { mean: 0, sd: 5 },
    bigonial_width_symmetry_balance:     { mean: 0.95, sd: 0.05, higherIsBetter: true },
    bizygomatic_width_symmetry_balance:  { mean: 0.95, sd: 0.05, higherIsBetter: true },
    transverse_symmetry_coefficient:     { mean: 0.95, sd: 0.05, higherIsBetter: true },
    periocular_symmetry_score_advanced:  { mean: 0.95, sd: 0.06, higherIsBetter: true },
    maxillomandibular_symmetry_index:    { mean: 0.90, sd: 0.08, higherIsBetter: true },
    frontal_upper_third_symmetry_index:  { mean: 0.95, sd: 0.05, higherIsBetter: true },
    mid_face_bilateral_balance_score:    { mean: 0.90, sd: 0.08, higherIsBetter: true },
    lower_face_bilateral_balance_score:  { mean: 0.90, sd: 0.08, higherIsBetter: true },
    global_bilateral_symmetry_index:     { mean: 0.93, sd: 0.06, higherIsBetter: true },
};

// Métrica -> pilar (para agregação ponderada do score por pilar)
const METRIC_PILLAR = {};
[
    'upper_to_middle_ratio', 'middle_to_lower_ratio', 'upper_to_lower_ratio',
'face_width_to_height_ratio', 'golden_ratio_vertical_score', 'golden_ratio_horizontal_score',
'inter_feature_proportionality', 'overall_aesthetic_harmony_score', 'facial_convexity_angle'
].forEach((k) => (METRIC_PILLAR[k] = 'harmony'));

[
    'jaw_angle_degree', 'gonial_sharpness_index', 'bigonial_to_bizygomatic_ratio',
'nasolabial_angle', 'mentonasal_angle', 'dorsum_convexity_index',
'nasofrontal_angle', 'mouth_corner_angle'
].forEach((k) => (METRIC_PILLAR[k] = 'angularity'));

[
    'facial_dimorphism_index', 'structural_robustness_index', 'bigonial_to_intercanthal_ratio',
'chin_to_philtrum_ratio', 'nasal_index', 'alar_base_width_ratio'
].forEach((k) => (METRIC_PILLAR[k] = 'dimorphism'));

[
    'global_symmetry_score', 'jaw_symmetry_index', 'periocular_symmetry_index',
'left_to_right_eye_width_diff', 'left_to_right_eye_height_diff', 'nostril_width_asymmetry_ratio',
'nasal_tip_lateral_deviation', 'chin_lateral_deviation', 'global_bilateral_symmetry_index',
'periocular_symmetry_score_advanced', 'maxillomandibular_symmetry_index',
'frontal_upper_third_symmetry_index', 'mid_face_bilateral_balance_score',
'lower_face_bilateral_balance_score', 'transverse_symmetry_coefficient'
].forEach((k) => (METRIC_PILLAR[k] = 'features'));

function zScoreToTenScale(z) {
    // Score máximo (10) quando z=0, decaindo suavemente com |z|. Nunca abaixo de 0.
    const score = 10 * Math.exp(-0.5 * Math.pow(z, 2) / 1.6);
    return Math.max(0, Math.min(10, score));
}

function classify(z) {
    if (z <= -0.6) return 'below_average';
    if (z >= 0.6) return 'above_average';
    return 'average';
}

/**
 * score_metrics(metrics) -> { perMetric: {...}, pillars: {...}, overall: number }
 * Para cada métrica com norma estatística conhecida, calcula z-score, nota 0-10
 * e classificação. Agrega por pilar (média simples) e um score geral ponderado
 * (Harmony 40%, Angularity 25%, Dimorphism 20%, Features 15% — reflete o peso
 * que a harmonia geral tem sobre índices mais específicos).
 */
function score_metrics(metrics) {
    const perMetric = {};

    Object.entries(METRIC_NORMS).forEach(([key, norm]) => {
        const raw = metrics[key];
        if (typeof raw !== 'number' || !isFinite(raw)) return;
        let z = (raw - norm.mean) / (norm.sd || 1e-6);
        if (norm.higherIsBetter) z = -Math.abs(z) + (raw >= norm.mean ? 0.15 : 0); // suaviza quando já favorável
        const score = zScoreToTenScale(z);
        perMetric[key] = {
            raw,
            z: Math.round(z * 100) / 100,
                                         score: Math.round(score * 10) / 10,
                                         classification: classify(norm.higherIsBetter ? (raw >= norm.mean ? 0.3 : -1) : z),
                                         pillar: METRIC_PILLAR[key] || 'features'
        };
    });

    const pillarBuckets = { harmony: [], angularity: [], dimorphism: [], features: [] };
    Object.values(perMetric).forEach((entry) => {
        if (pillarBuckets[entry.pillar]) pillarBuckets[entry.pillar].push(entry.score);
    });

        const pillars = {};
        Object.entries(pillarBuckets).forEach(([pillar, scores]) => {
            pillars[pillar] = scores.length
            ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10
            : null;
        });

        const weights = { harmony: 0.40, angularity: 0.25, dimorphism: 0.20, features: 0.15 };
        let weightedSum = 0;
        let weightTotal = 0;
        Object.entries(weights).forEach(([pillar, w]) => {
            if (typeof pillars[pillar] === 'number') {
                weightedSum += pillars[pillar] * w;
                weightTotal += w;
            }
        });
        const overall = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : null;

        return { perMetric, pillars, overall };
}
