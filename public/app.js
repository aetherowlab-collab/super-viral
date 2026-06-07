/* ============================================================
   슈퍼바이럴 웹 — Main App Logic (Vanilla JS)
   Port of page.tsx business logic with DOM rendering
   ============================================================ */

const STORAGE_KEY = 'superviral-diagnoses';
const EMPTY_META = { title: '', description: '', thumbnailUrl: '', hashtags: [] };
const EMPTY_PERFORMANCE = { views: null, comments: null, hoursAfterUpload: null, likes: null, saves: null, shares: null };

// ---- State ----
const state = {
  step: 'home',
  url: '',
  platform: 'unknown',
  metadataStatus: 'failed',
  metadata: { ...EMPTY_META },
  manualTitle: '',
  manualSummary: '',
  manualTags: '',
  manualPlatformName: '',
  aiInference: null,
  editingInference: false,
  estimate: null,
  performance: { ...EMPTY_PERFORMANCE },
  result: null,
  videoResult: null,
  videoMessages: [],
  videoProgress: '',
  saved: [],
  loading: '',
  error: '',
  activeTab: '제목',
};

// ---- Helpers ----
function splitTags(value) {
  return value.split(/[\s,]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
}

function storage() {
  try { return window.localStorage; } catch { return null; }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || '요청에 실패했습니다.');
  return data;
}

function isValidHttpUrl(inputUrl) {
  try {
    const normalized = /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`;
    const url = new URL(normalized);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function getCurrentInput() {
  if (!state.aiInference) return null;
  return {
    contentUrl: state.url,
    platform: state.platform,
    metadataStatus: state.metadataStatus,
    metadata: state.metadata,
    manualFallback: {
      used: state.metadataStatus === 'manual_required' || state.metadataStatus === 'manual',
      titleOrHook: state.manualTitle,
      summary: state.manualSummary,
      hashtags: splitTags(state.manualTags),
    },
    aiInference: state.aiInference,
    performance: state.performance,
  };
}

function persist(next) {
  state.saved = next;
  storage()?.setItem(STORAGE_KEY, JSON.stringify(next));
}

function resetForNew() {
  state.metadata = { ...EMPTY_META };
  state.metadataStatus = 'failed';
  state.aiInference = null;
  state.estimate = null;
  state.result = null;
  state.videoResult = null;
  state.videoMessages = [];
  state.videoProgress = '';
  state.performance = { ...EMPTY_PERFORMANCE };
  state.error = '';
}

// ---- Business Logic ----
async function startDiagnosis(e) {
  if (e) e.preventDefault();
  state.error = '';
  const trimmed = state.url.trim();
  if (!trimmed) { state.error = 'SNS 링크를 입력해주세요.'; render(); return; }
  if (!isValidHttpUrl(trimmed)) { state.error = 'http 또는 https 형식의 URL을 입력해주세요.'; render(); return; }

  resetForNew();
  state.loading = '플랫폼을 확인하고 있어요.';
  render();

  try {
    const detected = await postJson('/api/detect-platform', { url: trimmed });
    state.platform = detected.platform;
    if (detected.platform === 'youtube_shorts') {
      const extracted = await postJson('/api/extract-metadata', { url: trimmed, platform: detected.platform });
      if (extracted.success) {
        state.metadata = { title: extracted.title, description: extracted.description, thumbnailUrl: extracted.thumbnailUrl, hashtags: extracted.hashtags };
        state.metadataStatus = extracted.status;
        state.manualTitle = extracted.title;
        state.manualSummary = extracted.description;
        state.manualTags = extracted.hashtags.map(t => `#${t}`).join(' ');
      }
    } else {
      state.metadataStatus = 'manual_required';
      state.metadata = { ...EMPTY_META };
    }
    state.step = 'confirm';
  } catch (err) {
    state.error = err instanceof Error ? err.message : '진단 시작에 실패했습니다.';
  } finally {
    state.loading = '';
    render();
  }
}

async function inferContent() {
  const title = state.metadata.title || state.manualTitle;
  const description = state.metadata.description || state.manualSummary;
  const hashtags = state.metadata.hashtags.length ? state.metadata.hashtags : splitTags(state.manualTags);
  if (!title.trim() || !description.trim()) {
    state.error = '콘텐츠 제목 또는 첫 문장과 한 줄 요약을 입력해주세요.';
    render(); return;
  }
  state.error = '';
  state.loading = 'AI가 콘텐츠 특징을 이해하고 있어요.';
  render();
  try {
    const inferred = await postJson('/api/infer-content', {
      platform: state.platform, title, description, hashtags,
      manualFallbackUsed: state.metadataStatus !== 'success' && state.metadataStatus !== 'partial',
    });
    state.aiInference = inferred;
    state.step = 'inference';
  } catch {
    state.error = 'AI 추론에 실패했습니다. 잠시 후 다시 시도해주세요.';
  } finally {
    state.loading = '';
    render();
  }
}

async function estimateScore(inference) {
  inference = inference || state.aiInference;
  if (!inference) return;
  const input = {
    contentUrl: state.url,
    platform: state.platform,
    metadataStatus: state.metadataStatus,
    metadata: state.metadata,
    manualFallback: {
      used: state.metadataStatus !== 'success' && state.metadataStatus !== 'partial',
      titleOrHook: state.manualTitle || state.metadata.title,
      summary: state.manualSummary || state.metadata.description,
      hashtags: splitTags(state.manualTags),
    },
    aiInference: inference,
    performance: EMPTY_PERFORMANCE,
  };
  state.loading = '무료 예상 점수를 계산하고 있어요.';
  render();
  try {
    const score = await postJson('/api/estimate-score', input);
    state.estimate = score;
    state.step = 'freeScore';
  } finally {
    state.loading = '';
    render();
  }
}

async function analyze(perf) {
  perf = perf || state.performance;
  const currentInput = getCurrentInput();
  if (!currentInput) return;
  state.loading = 'V-CARE 상세 처방전을 생성하고 있어요.';
  state.videoResult = null;
  state.videoMessages = [];
  state.videoProgress = '';
  render();
  try {
    const inputForAnalysis = { ...currentInput, performance: perf };
    const detailed = await postJson('/api/analyze', inputForAnalysis);
    state.result = detailed;
    state.step = 'result';
    state.loading = '';
    render();

    if (inputForAnalysis.platform === 'youtube_shorts') {
      const statuses = ['메타데이터 확인 중...', '영상 다운로드 중...', '프레임 추출 중...', '오디오 추출 중...', '음성 전사 중...', 'AI 분석 중...', '결과 정리 중...'];
      let index = 0;
      state.videoProgress = statuses[0];
      render();
      const timer = setInterval(() => {
        index = Math.min(index + 1, statuses.length - 1);
        state.videoProgress = statuses[index];
        render();
      }, 1400);
      try {
        const video = await postJson('/api/analyze-video', { inputData: inputForAnalysis, vcareResult: detailed });
        state.videoMessages = video.messages;
        state.videoResult = video.result ?? null;
        const merged = mergeResults(detailed, video.result ?? null);
        state.result = merged;
        state.videoProgress = video.success ? '영상·오디오 분석 완료' : '메타데이터 기반 분석으로 계속 진행 중...';
      } catch {
        const merged = mergeResults(detailed, null);
        state.result = merged;
        state.videoMessages = ['AI 분석 중 오류가 발생했습니다. 기존 메타데이터 기반 분석 결과를 표시합니다.'];
        state.videoProgress = '메타데이터 기반 분석으로 계속 진행 중...';
      } finally {
        clearInterval(timer);
      }
    }
  } finally {
    state.loading = '';
    render();
  }
}

function mergeResults(metadataResult, videoResult) {
  if (!videoResult) {
    return { ...metadataResult, videoAnalysisResult: null };
  }
  let accuracy = metadataResult.diagnosisAccuracy;
  if (videoResult.videoAnalysisUsed && videoResult.audioAnalysisUsed) {
    accuracy = { level: 'advanced', usedData: ['metadata', 'videoFrames', 'audioTranscript', 'aiInference'], videoAnalysisUsed: true, soundAnalysisUsed: true, note: '영상 프레임과 오디오 전사를 함께 분석했습니다.' };
  } else if (videoResult.videoAnalysisUsed) {
    accuracy = { level: 'advanced', usedData: ['metadata', 'videoFrames', 'aiInference'], videoAnalysisUsed: true, soundAnalysisUsed: false, note: '영상 프레임 분석은 사용했지만 오디오 전사는 실패했습니다.' };
  } else if (videoResult.audioAnalysisUsed) {
    accuracy = { level: 'improved', usedData: ['metadata', 'audioTranscript', 'aiInference'], videoAnalysisUsed: false, soundAnalysisUsed: true, note: '오디오 전사를 반영했지만 영상 프레임 분석은 실패했습니다.' };
  }
  return { ...metadataResult, diagnosisAccuracy: accuracy, videoAnalysisResult: videoResult };
}

function saveDiagnosis(revisit = false) {
  const currentInput = getCurrentInput();
  if (!state.result || !currentInput) return;
  const item = {
    id: crypto.randomUUID(),
    diagnosedAt: new Date().toISOString(),
    contentUrl: state.url,
    platform: state.platform,
    title: state.metadata.title || state.manualTitle || '제목 없음',
    thumbnailUrl: state.metadata.thumbnailUrl,
    metadataStatus: state.metadataStatus,
    estimatedScore: state.result.estimatedScore,
    totalScore: state.result.totalScore,
    status: state.result.status,
    oneLineDiagnosis: state.result.oneLineDiagnosis,
    result: state.result,
    videoResult: state.result.videoAnalysisResult ?? state.videoResult,
    videoMessages: state.videoMessages,
    inputData: currentInput,
    revisitAfter24h: revisit,
  };
  persist([item, ...state.saved.filter(s => s.contentUrl !== state.url)].slice(0, 20));
  render();
}

function openSaved(item) {
  state.url = item.contentUrl;
  state.platform = item.platform;
  state.metadataStatus = item.metadataStatus;
  state.metadata = item.inputData.metadata;
  state.manualTitle = item.inputData.manualFallback.titleOrHook;
  state.manualSummary = item.inputData.manualFallback.summary;
  state.manualTags = item.inputData.manualFallback.hashtags.map(t => `#${t}`).join(' ');
  state.aiInference = item.inputData.aiInference;
  state.performance = item.inputData.performance;
  state.estimate = {
    estimatedScore: item.result.estimatedScore,
    status: item.result.status,
    oneLineDiagnosis: item.result.oneLineDiagnosis,
    mainBottleneck: item.result.mainBottleneck,
    diagnosisAccuracy: item.result.diagnosisAccuracy,
  };
  state.result = item.result;
  state.videoResult = item.result.videoAnalysisResult ?? item.videoResult ?? null;
  state.videoMessages = item.videoMessages ?? [];
  state.step = 'result';
  render();
}

// ---- Render Engine ----
const root = () => document.getElementById('app');

function render() {
  const app = root();
  if (!app) return;
  app.innerHTML = '';

  const container = el('div', { className: 'app-container' });

  // Header
  const header = el('header', { className: 'app-header' });
  const logo = el('button', { className: 'app-logo', type: 'button', onClick: () => { state.step = 'home'; render(); } }, '슈퍼바이럴');
  const recentBtn = el('button', { className: 'btn btn-secondary', type: 'button', onClick: () => { state.step = 'recent'; render(); } }, '최근 진단 보기');
  header.appendChild(logo);
  header.appendChild(el('div', { className: 'header-actions' }, recentBtn));
  container.appendChild(header);

  // Status bars
  if (state.loading) container.appendChild(el('div', { className: 'status-bar loading' }, state.loading));
  if (state.error) container.appendChild(el('div', { className: 'status-bar error' }, state.error));

  // Step content
  switch (state.step) {
    case 'home': container.appendChild(renderHome()); break;
    case 'confirm': container.appendChild(renderConfirm()); break;
    case 'inference': container.appendChild(renderInference()); break;
    case 'freeScore': container.appendChild(renderFreeScore()); break;
    case 'performance': container.appendChild(renderPerformance()); break;
    case 'result': container.appendChild(renderResult()); break;
    case 'recent': container.appendChild(renderRecent()); break;
  }

  app.appendChild(container);
}

// ---- Step Renderers ----

function renderHome() {
  const section = el('div', { className: 'glass-card' });
  const grid = el('div', { className: 'hero-section' });

  // Left
  const left = el('div', {});
  left.appendChild(renderPill('콘텐츠 응급실'));
  left.appendChild(el('h1', { className: 'hero-headline mt-lg' },
    el('span', {}, '조회수 안 나온 콘텐츠,'),
    document.createElement('br'),
    el('span', { className: 'accent' }, '심폐소생술'),
  ));
  left.appendChild(el('p', { className: 'hero-subtitle' },
    'YouTube Shorts는 링크만으로, Instagram과 TikTok은 최소 입력으로 30초 만에 노출 병목과 바이럴 처방전을 받아보세요.',
  ));

  const form = el('form', { className: 'hero-form', onSubmit: startDiagnosis });
  const input = el('input', {
    className: 'input-field', type: 'text', placeholder: 'SNS 링크를 붙여넣으세요',
    value: state.url,
  });
  input.addEventListener('input', e => state.url = e.target.value);
  form.appendChild(input);
  form.appendChild(el('button', { className: 'btn btn-primary', type: 'submit' }, '콘텐츠 응급진단 시작'));
  left.appendChild(form);

  // Right - V-CARE preview
  const right = el('div', { className: 'vcare-preview' });
  right.appendChild(el('div', { className: 'vcare-label' }, 'V-CARE'));
  const items = el('div', { className: 'vcare-items' });
  for (const label of ['Viral Score', 'Content Bottleneck', 'Action Prescription', 'Ready-to-copy Booster']) {
    items.appendChild(el('div', { className: 'vcare-item' }, label));
  }
  right.appendChild(items);

  grid.appendChild(left);
  grid.appendChild(right);
  section.appendChild(grid);
  return section;
}

function renderConfirm() {
  const card = el('div', { className: 'glass-card' });
  const manualRequired = state.platform !== 'youtube_shorts' || state.metadataStatus === 'manual';
  let title, guide = '';

  if (state.platform === 'youtube_shorts') title = '콘텐츠를 찾았어요.';
  else if (state.platform === 'instagram') { title = '인스타그램 릴스 링크는 확인했어요.'; guide = '다만 인스타그램은 외부 앱에서 제목, 썸네일, 본문 가져오기를 제한하는 경우가 많아요. 아래 2가지만 입력하면 바로 V-CARE 진단을 진행할 수 있습니다.'; }
  else if (state.platform === 'tiktok') { title = '틱톡 영상 링크는 확인했어요.'; guide = '틱톡은 외부 미리보기 정보가 제한되어 있어요. 아래 2가지만 입력하면 바로 V-CARE 진단을 진행할 수 있습니다.'; }
  else title = '지원 플랫폼이 아니지만, 콘텐츠 정보를 직접 입력하면 진단할 수 있어요.';

  card.appendChild(renderPill(PLATFORM_LABELS[state.platform] || state.platform));
  card.appendChild(el('h2', { className: 'mt-md' }, title));
  if (guide) card.appendChild(el('p', { className: 'text-secondary text-sm mt-sm', style: { maxWidth: '600px', lineHeight: '1.7' } }, guide));

  if (!manualRequired) {
    const layout = el('div', { className: 'confirm-layout mt-xl' });
    const thumb = el('div', { className: 'confirm-thumbnail' });
    if (state.metadata.thumbnailUrl) thumb.appendChild(el('img', { src: state.metadata.thumbnailUrl, alt: '' }));
    layout.appendChild(thumb);

    const info = el('div', {});
    info.appendChild(el('h3', { style: { fontSize: '1.25rem', fontWeight: '800' } }, state.metadata.title));
    info.appendChild(el('p', { className: 'text-secondary text-sm mt-sm', style: { lineHeight: '1.7' } }, state.metadata.description || '설명 정보가 비어 있습니다.'));
    const tags = renderTagList(state.metadata.hashtags);
    if (tags) info.appendChild(tags);
    info.appendChild(el('div', { className: 'flex-gap-sm mt-xl' },
      el('button', { className: 'btn btn-primary', type: 'button', onClick: inferContent }, '이 콘텐츠 맞아요'),
      el('button', { className: 'btn btn-secondary', type: 'button', onClick: () => { state.metadataStatus = 'manual'; render(); } }, '정보 수정하기'),
    ));
    layout.appendChild(info);
    card.appendChild(layout);
  } else {
    card.appendChild(renderManualForm());
  }
  return card;
}

function renderManualForm() {
  const form = el('div', { className: 'grid-gap mt-xl' });

  if (state.platform === 'unknown') {
    const platformInput = el('input', { className: 'input-field', placeholder: '플랫폼명, 선택', value: state.manualPlatformName });
    platformInput.addEventListener('input', e => state.manualPlatformName = e.target.value);
    form.appendChild(platformInput);
  }

  const titleInput = el('input', { className: 'input-field', placeholder: '콘텐츠 제목 또는 첫 문장', value: state.manualTitle });
  titleInput.addEventListener('input', e => state.manualTitle = e.target.value);
  form.appendChild(titleInput);

  const summaryInput = el('textarea', { className: 'textarea-field', placeholder: '콘텐츠 내용 한 줄 요약' });
  summaryInput.value = state.manualSummary;
  summaryInput.addEventListener('input', e => state.manualSummary = e.target.value);
  form.appendChild(summaryInput);

  const tagsInput = el('input', { className: 'input-field', placeholder: '해시태그, 선택 예: #제주여행 #쇼츠', value: state.manualTags });
  tagsInput.addEventListener('input', e => state.manualTags = e.target.value);
  form.appendChild(tagsInput);

  form.appendChild(el('button', { className: 'btn btn-primary', type: 'button', onClick: inferContent }, '이 정보로 진단하기'));
  return form;
}

function renderInference() {
  if (!state.aiInference) return el('div');
  const card = el('div', { className: 'glass-card' });
  card.appendChild(el('h2', {}, 'AI가 이 콘텐츠를 이렇게 이해했어요.'));

  const rows = [
    ['타깃 고객', state.aiInference.targetAudience],
    ['콘텐츠 목적', GOAL_LABELS[state.aiInference.goal] || state.aiInference.goal],
    ['무드', state.aiInference.mood],
    ['콘텐츠 유형', state.aiInference.contentType],
    ['예상 시청자 욕구', state.aiInference.viewerDesire],
  ];
  const grid = el('div', { className: 'inference-grid mt-xl' });
  for (const [label, value] of rows) {
    grid.appendChild(el('div', { className: 'inference-item' },
      el('div', { className: 'inference-label' }, label),
      el('div', { className: 'inference-value' }, value),
    ));
  }
  card.appendChild(grid);

  if (state.editingInference) {
    const editGrid = el('div', { className: 'grid-gap mt-lg' });
    for (const key of ['targetAudience', 'mood', 'contentType', 'viewerDesire']) {
      const inp = el('input', { className: 'input-field', value: state.aiInference[key] });
      inp.addEventListener('input', e => { state.aiInference[key] = e.target.value; });
      editGrid.appendChild(inp);
    }
    card.appendChild(editGrid);
  }

  card.appendChild(el('div', { className: 'flex-gap-sm mt-xl' },
    el('button', { className: 'btn btn-primary', type: 'button', onClick: () => estimateScore(state.aiInference) }, '맞아요'),
    el('button', { className: 'btn btn-secondary', type: 'button', onClick: () => { state.editingInference = !state.editingInference; render(); } }, '수정할래요'),
  ));
  return card;
}

function renderFreeScore() {
  if (!state.estimate) return el('div');
  const card = el('div', { className: 'glass-card' });

  const summary = el('div', { className: 'result-summary' });
  summary.appendChild(renderScoreRing(state.estimate.estimatedScore));
  const meta = el('div', { className: 'result-meta' },
    renderPill(state.estimate.status),
    el('h2', { className: 'mt-md' }, '무료 예상 바이럴 점수'),
    el('p', { className: 'font-bold mt-md', style: { fontSize: '1.0625rem' } }, state.estimate.oneLineDiagnosis),
    el('div', { className: 'info-row mt-md' },
      el('div', { className: 'info-row-label' }, '대표 병목'),
      el('div', { className: 'info-row-value' }, state.estimate.mainBottleneck),
    ),
    el('p', { className: 'text-xs text-muted mt-sm font-bold' }, '진단 정확도: 기본 진단 · 사용 데이터: 링크 정보 + AI 추론'),
  );
  summary.appendChild(meta);
  card.appendChild(summary);

  card.appendChild(el('div', { className: 'flex-gap-sm mt-xl' },
    el('button', { className: 'btn btn-primary', type: 'button', onClick: () => { state.step = 'performance'; render(); } }, '상세 처방전 받기'),
    el('button', { className: 'btn btn-secondary', type: 'button', onClick: () => analyze(EMPTY_PERFORMANCE) }, '기본 처방만 보기'),
  ));
  return card;
}

function renderPerformance() {
  const card = el('div', { className: 'glass-card' });
  card.appendChild(el('h2', {}, '정확도를 높이고 싶다면 현재 반응을 알려주세요.'));
  card.appendChild(el('p', { className: 'text-secondary text-sm mt-sm' }, '모르면 건너뛰어도 괜찮아요.'));

  const grid = el('div', { className: 'perf-grid mt-xl' });
  grid.appendChild(makeMetricInput('조회수', 'views'));
  grid.appendChild(makeMetricInput('댓글 수', 'comments'));

  const select = el('select', { className: 'input-field' });
  for (const [val, label] of [['', '업로드 후 경과 시간'], ['6', '6시간 이내'], ['24', '24시간 이내'], ['72', '3일 이내'], ['168', '1주일 이상']]) {
    const opt = el('option', { value: val }, label);
    if ((state.performance.hoursAfterUpload ?? '') == val) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', e => { state.performance.hoursAfterUpload = e.target.value === '' ? null : Number(e.target.value); });
  grid.appendChild(select);
  card.appendChild(grid);

  // Advanced
  const details = el('details', { className: 'accordion-section mt-lg' });
  details.appendChild(el('summary', {}, '고급 입력'));
  const advBody = el('div', { className: 'accordion-body' });
  const advGrid = el('div', { className: 'perf-grid mt-md' });
  advGrid.appendChild(makeMetricInput('좋아요', 'likes'));
  advGrid.appendChild(makeMetricInput('저장', 'saves'));
  advGrid.appendChild(makeMetricInput('공유', 'shares'));
  advBody.appendChild(advGrid);
  details.appendChild(advBody);
  card.appendChild(details);

  card.appendChild(el('div', { className: 'flex-gap-sm mt-xl' },
    el('button', { className: 'btn btn-primary', type: 'button', onClick: () => analyze(state.performance) }, '입력하고 정확도 높이기'),
    el('button', { className: 'btn btn-secondary', type: 'button', onClick: () => analyze(EMPTY_PERFORMANCE) }, '건너뛰고 바로 진단하기'),
  ));
  return card;
}

function makeMetricInput(label, key) {
  const input = el('input', { className: 'input-field', type: 'number', placeholder: label, value: state.performance[key] ?? '' });
  input.addEventListener('input', e => { state.performance[key] = e.target.value === '' ? null : Number(e.target.value); });
  return input;
}

function renderResult() {
  if (!state.result) return el('div');
  const result = state.result;
  const grid = el('div', { className: 'dashboard-grid' });

  // Summary Card
  const summaryCard = el('div', { className: 'glass-card' });
  const summary = el('div', { className: 'result-summary' });
  summary.appendChild(renderScoreRing(result.totalScore));
  const meta = el('div', { className: 'result-meta' },
    renderPill(result.status),
    el('h2', { className: 'mt-md' }, '상태 요약'),
    el('p', { className: 'font-bold mt-md', style: { fontSize: '1.0625rem' } }, result.oneLineDiagnosis),
  );
  summary.appendChild(meta);
  summaryCard.appendChild(summary);
  grid.appendChild(summaryCard);

  // Accuracy Card
  const accCard = el('div', { className: 'glass-card' });
  accCard.appendChild(el('h3', { className: 'section-title' }, '진단 정확도'));
  accCard.appendChild(el('p', { className: 'text-sm text-secondary' },
    `${result.diagnosisAccuracy.level} · 사용 데이터: ${result.diagnosisAccuracy.usedData.join(', ')}`));
  if (result.diagnosisAccuracy.note) accCard.appendChild(el('p', { className: 'text-sm text-muted mt-sm' }, result.diagnosisAccuracy.note));
  grid.appendChild(accCard);

  // Video Analysis
  const videoSection = renderVideoAnalysis(result.videoAnalysisResult ?? state.videoResult, state.videoMessages, state.videoProgress);
  if (videoSection) grid.appendChild(videoSection);

  // Bottlenecks
  const bnCard = el('div', { className: 'glass-card' });
  bnCard.appendChild(el('h3', { className: 'section-title' }, '노출 병목 TOP 3'));
  const bnGrid = el('div', { className: 'dashboard-3col' });
  for (const item of result.bottlenecks) bnGrid.appendChild(renderBottleneckCard(item));
  bnCard.appendChild(bnGrid);
  grid.appendChild(bnCard);

  // Prescriptions
  const rxCard = el('div', { className: 'glass-card' });
  rxCard.appendChild(el('h3', { className: 'section-title' }, '우선순위 처방전'));
  const rxGrid = el('div', { className: 'grid-gap' });
  for (const item of result.prescriptions.slice(0, 3)) rxGrid.appendChild(renderPrescriptionCard(item));
  rxCard.appendChild(rxGrid);
  grid.appendChild(rxCard);

  // Score Details
  const scoreDetails = el('details', { className: 'accordion-section' });
  scoreDetails.appendChild(el('summary', {}, '세부 점수 카드'));
  const scoreBody = el('div', { className: 'accordion-body' });
  const scoreGrid = el('div', { className: 'score-card-grid' });
  for (const [key, item] of Object.entries(result.scores)) {
    scoreGrid.appendChild(el('div', { className: 'score-card' },
      el('div', { className: 'score-card-name' }, `${SCORE_NAMES[key] || key} · ${item.score}점`),
      el('div', { className: 'score-card-type' }, item.analysisType),
    ));
  }
  scoreBody.appendChild(scoreGrid);
  scoreDetails.appendChild(scoreBody);
  grid.appendChild(scoreDetails);

  // Checklist
  const clCard = el('div', { className: 'glass-card' });
  clCard.appendChild(el('h3', { className: 'section-title' }, '체크리스트 결과'));
  const clGrid = el('div', { className: 'dashboard-2col' });
  clGrid.appendChild(renderListBlock('통과', result.checklist.passed));
  clGrid.appendChild(renderListBlock('보완 필요', result.checklist.missing, true));
  clCard.appendChild(clGrid);
  grid.appendChild(clCard);

  // Booster Pack
  const bpCard = el('div', { className: 'glass-card' });
  bpCard.appendChild(renderBoosterTabs(result.boosterPack, state.activeTab));
  grid.appendChild(bpCard);

  // Action Buttons
  const actCard = el('div', { className: 'glass-card' });
  actCard.appendChild(el('div', { className: 'flex-gap-sm flex-wrap' },
    el('button', { className: 'btn btn-primary', type: 'button', onClick: () => { saveDiagnosis(false); alert('결과가 저장되었습니다.'); } }, '결과 저장하기'),
    el('button', { className: 'btn btn-secondary', type: 'button', onClick: () => { saveDiagnosis(true); alert('24시간 후 재진단으로 저장되었습니다.'); } }, '24시간 후 재진단하기'),
  ));
  grid.appendChild(actCard);

  return grid;
}

function renderRecent() {
  const card = el('div', { className: 'glass-card' });
  card.appendChild(el('h2', {}, '최근 진단'));
  const list = el('div', { className: 'grid-gap mt-lg' });

  if (state.saved.length === 0) {
    list.appendChild(el('p', { className: 'text-sm text-muted' }, '아직 저장된 진단이 없습니다.'));
  }
  for (const item of state.saved) {
    list.appendChild(renderRecentItem(item, openSaved, (id) => { persist(state.saved.filter(s => s.id !== id)); render(); }));
  }
  card.appendChild(list);
  return card;
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (raw) {
    try { state.saved = JSON.parse(raw); } catch { storage()?.removeItem(STORAGE_KEY); }
  }
  render();
});
