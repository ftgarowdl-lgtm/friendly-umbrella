/* Verità Facial — carrega o bundle ESM atual do MediaPipe e normaliza o carregamento do WASM. */

const VISION_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs';
const WASM_BUNDLE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const CLASSIC_SCRIPTS = ['landmark-validator.js','metrics-engine.js','face-score.js','script.js'];

function loadClassicScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.body.appendChild(script);
  });
}

async function boot() {
  try {
    const vision = await import(VISION_BUNDLE);
    const NativeFilesetResolver = vision.FilesetResolver;
    window.FilesetResolver = {
      forVisionTasks: () => NativeFilesetResolver.forVisionTasks(WASM_BUNDLE)
    };
    window.FaceLandmarker = vision.FaceLandmarker;
    window.DrawingUtils = vision.DrawingUtils;

    for (const src of CLASSIC_SCRIPTS) await loadClassicScript(src);
  } catch (error) {
    console.error('[MediaPipe] Falha no carregamento:', error);
    const root = document.getElementById('app-root');
    if (root) root.innerHTML = `<main style="font-family:system-ui;padding:32px;color:#122033"><h1>Falha ao carregar o MediaPipe</h1><p>${String(error.message || error)}</p><p>Recarregue a página. Se o erro persistir, verifique sua conexão com a CDN.</p></main>`;
  }
}

boot();
