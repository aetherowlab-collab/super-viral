/* ============================================================
   슈퍼바이럴 웹 — UI Components (Vanilla JS)
   ============================================================ */

// ---- Score Name Map ----
const SCORE_NAMES = {
  hooking: '후킹력',
  empathy: '공감력',
  retention: '유지력',
  commentPotential: '댓글유도력',
  saveValue: '저장가치',
  shareReason: '공유명분',
  conversionPotential: '전환력',
  platformFit: '플랫폼적합도',
  soundFit: '사운드적합도',
  beatEditSync: '비트/편집싱크',
};

const PLATFORM_LABELS = {
  youtube_shorts: 'YouTube Shorts',
  instagram: 'Instagram Reels',
  tiktok: 'TikTok',
  unknown: '직접 입력',
};

const GOAL_LABELS = {
  views: '조회수 확대',
  comments: '댓글 반응',
  saves_shares: '저장/공유',
  followers: '팔로워 증가',
  purchase_conversion: '구매 전환',
  brand_awareness: '브랜드 인지도',
};

// ---- Helpers ----
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
    else if (child instanceof Node) node.appendChild(child);
  }
  return node;
}

function html(htmlStr) {
  const t = document.createElement('template');
  t.innerHTML = htmlStr.trim();
  return t.content.firstElementChild;
}

async function copyToClipboard(text, btn) {
  await navigator.clipboard.writeText(text);
  const prev = btn.textContent;
  btn.textContent = '복사됨 ✓';
  btn.style.color = '#34d399';
  setTimeout(() => { btn.textContent = prev; btn.style.color = ''; }, 1200);
}

function formatDate(value) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

// ---- SVG Score Ring ----
function renderScoreRing(score, size = 160) {
  const r = (size - 20) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;

  const container = el('div', { className: 'score-ring-container', style: { width: size + 'px', height: size + 'px' } });
  container.innerHTML = `
    <svg class="score-ring-svg" viewBox="0 0 ${size} ${size}">
      <defs>
        <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#6366f1"/>
          <stop offset="50%" stop-color="#818cf8"/>
          <stop offset="100%" stop-color="#a78bfa"/>
        </linearGradient>
      </defs>
      <circle class="score-ring-bg" cx="${center}" cy="${center}" r="${r}"/>
      <circle class="score-ring-fg" cx="${center}" cy="${center}" r="${r}"
        stroke-dasharray="${circumference}"
        stroke-dashoffset="${circumference}"
        data-target-offset="${offset}"/>
    </svg>
    <div class="score-ring-value">
      <div class="score-ring-number" data-target="${score}">0</div>
      <div class="score-ring-label">점</div>
    </div>
  `;

  // Animate after mount
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const fg = container.querySelector('.score-ring-fg');
      fg.style.strokeDashoffset = offset;
      const numEl = container.querySelector('.score-ring-number');
      animateCounter(numEl, 0, score, 1200);
    });
  });

  return container;
}

function animateCounter(el, from, to, duration) {
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (to - from) * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ---- Copy Button ----
function renderCopyButton(text, label = '복사') {
  const btn = el('button', { className: 'btn btn-copy', type: 'button' }, label);
  btn.addEventListener('click', () => copyToClipboard(text, btn));
  return btn;
}

// ---- Pill ----
function renderPill(text, variant = '') {
  return el('span', { className: `pill ${variant}` }, text);
}

// ---- Tag List ----
function renderTagList(tags) {
  if (!tags || !tags.length) return null;
  const container = el('div', { className: 'tag-list' });
  for (const tag of tags) {
    container.appendChild(el('span', { className: 'tag-item' }, `#${tag.replace(/^#/, '')}`));
  }
  return container;
}

// ---- Bottleneck Card ----
function renderBottleneckCard(item) {
  return el('div', { className: 'bottleneck-card' },
    el('div', { className: 'bottleneck-header' },
      el('span', { className: 'bottleneck-name' }, item.name),
      el('span', { className: 'bottleneck-score' }, item.score + '점'),
    ),
    el('p', { className: 'bottleneck-reason' }, item.reason),
  );
}

// ---- Prescription Card ----
function renderPrescriptionCard(item) {
  const copyBtn = renderCopyButton(item.copyText);
  return el('div', { className: 'prescription-card' },
    el('div', { className: 'prescription-priority' }, item.priority + '순위'),
    el('div', { className: 'prescription-title' }, item.title),
    el('p', { className: 'prescription-why' }, '왜? ' + item.why),
    el('div', { className: 'prescription-copy-box' }, item.copyText),
    el('div', { className: 'prescription-footer' },
      el('span', { className: 'prescription-effect' }, '기대 효과: ' + item.expectedEffect),
      copyBtn,
    ),
  );
}

// ---- Metric Card ----
function renderMetricCard(label, value) {
  return el('div', { className: 'metric-card' },
    el('div', { className: 'metric-label' }, label),
    el('div', { className: 'metric-value' }, String(value)),
  );
}

// ---- Info Row ----
function renderInfoRow(label, text) {
  return el('div', { className: 'info-row' },
    el('div', { className: 'info-row-label' }, label),
    el('div', { className: 'info-row-value' }, text),
  );
}

// ---- List Block ----
function renderListBlock(title, items, missing = false) {
  const ul = el('ul', { className: `checklist-items ${missing ? 'missing' : ''}` });
  for (const item of items) {
    ul.appendChild(el('li', {}, item));
  }
  return el('div', { className: 'checklist-block' },
    el('div', { className: 'checklist-title' }, title),
    ul,
  );
}

// ---- Booster Tabs ----
function renderBoosterTabs(boosterPack, activeTab = '제목') {
  const tabs = {
    '제목': boosterPack.titles || [],
    '썸네일': boosterPack.thumbnailTexts || [],
    '고정댓글': boosterPack.pinnedComments || [],
    '스토리': boosterPack.storyTexts || [],
    '해시태그': (boosterPack.hashtags || []).map(tag => `#${tag.replace(/^#/, '')}`),
    '후속 콘텐츠': '__followup__',
    '사운드 추천': boosterPack.soundRecommendations || [],
  };

  const container = el('div', {});

  // Header
  const header = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' } });
  header.appendChild(el('h3', { className: 'section-title', style: { marginBottom: '0' } }, '부스터팩'));
  const allCopyBtn = renderCopyButton(JSON.stringify(boosterPack, null, 2), '전체 복사');
  header.appendChild(allCopyBtn);
  container.appendChild(header);

  // Tab bar
  const tabBar = el('div', { className: 'tab-bar' });
  const tabContent = el('div', { className: 'mt-md' });

  function setTab(tabName) {
    tabBar.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    tabContent.innerHTML = '';
    if (tabName === '후속 콘텐츠') {
      renderFollowUpContent(tabContent, boosterPack.followUpIdeas || []);
    } else {
      const items = tabs[tabName] || [];
      const grid = el('div', { className: 'grid-gap' });
      for (const text of items) {
        const item = el('div', { className: 'booster-item' },
          el('span', { className: 'booster-text' }, text),
          renderCopyButton(text),
        );
        grid.appendChild(item);
      }
      tabContent.appendChild(grid);
    }
  }

  for (const tabName of Object.keys(tabs)) {
    const btn = el('button', { className: 'tab-btn', type: 'button', 'data-tab': tabName }, tabName);
    btn.addEventListener('click', () => setTab(tabName));
    if (tabName === activeTab) btn.classList.add('active');
    tabBar.appendChild(btn);
  }

  container.appendChild(tabBar);
  container.appendChild(tabContent);
  setTab(activeTab);

  return container;
}

function renderFollowUpContent(container, ideas) {
  const grid = el('div', { className: 'grid-gap' });
  for (const idea of ideas) {
    const card = el('div', { className: 'followup-card' },
      el('div', { className: 'followup-title' }, idea.title),
      el('div', { className: 'followup-hook' }, '첫 2초 후킹 장면: ' + idea.firstTwoSeconds),
    );
    const scenes = el('div', { className: 'grid-gap mt-md' });
    for (const step of (idea.sceneSteps || [])) {
      scenes.appendChild(el('div', { className: 'followup-scene' },
        el('b', {}, step.timeRange),
        document.createTextNode(' · ' + step.scene),
        el('div', { className: 'text-secondary mt-sm' }, '자막: ' + step.caption),
      ));
    }
    card.appendChild(scenes);
    card.appendChild(el('p', { className: 'followup-detail mt-md' }, '고정댓글: ' + idea.pinnedComment));
    card.appendChild(el('p', { className: 'followup-detail' }, '스토리 재공유: ' + idea.storyText));
    card.appendChild(el('p', { className: 'followup-detail' }, '기대 효과: ' + idea.expectedEffect));
    card.appendChild(el('div', { className: 'mt-md' }, renderCopyButton(JSON.stringify(idea, null, 2))));
    grid.appendChild(card);
  }
  container.appendChild(grid);
}

// ---- Video Analysis Section ----
function renderVideoAnalysis(videoResult, videoMessages, videoProgress) {
  if (!videoResult && !videoProgress && (!videoMessages || videoMessages.length === 0)) return null;

  const card = el('div', { className: 'glass-card' });

  // Header
  const headerRow = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' } });
  const pillsDiv = el('div', { className: 'flex-gap-sm flex-wrap' });

  if (videoResult) {
    const modeLabel = videoResult.analysisMode === 'video_audio_direct'
      ? '영상·오디오 분석 기반 진단'
      : videoResult.videoAnalysisUsed
        ? '영상 프레임 기반 진단'
        : '메타데이터 기반 진단';
    pillsDiv.appendChild(renderPill(modeLabel));
    if (videoResult.audioAnalysisUsed) pillsDiv.appendChild(renderPill('오디오 분석 사용', 'pill-success'));
  }

  const left = el('div', {},
    pillsDiv,
    el('h3', { className: 'section-title mt-md', style: { marginBottom: '0' } }, '영상·오디오 기반 숏폼 분석'),
  );
  headerRow.appendChild(left);

  if (videoResult) {
    const scoreBadge = el('div', { className: 'video-score-badge' },
      el('div', { className: 'video-score-value' }, String(videoResult.overallScore)),
      el('div', { className: 'video-score-grade' }, 'Grade ' + videoResult.grade),
    );
    headerRow.appendChild(scoreBadge);
  }
  card.appendChild(headerRow);

  // Progress
  if (videoProgress) {
    card.appendChild(el('div', { className: 'video-progress mt-lg' }, videoProgress));
  }

  // Messages
  if (videoMessages && videoMessages.length) {
    const msgs = el('div', { className: 'video-messages mt-md' });
    for (const msg of videoMessages) msgs.appendChild(el('div', { className: 'video-message' }, msg));
    card.appendChild(msgs);
  }

  // Detailed results
  if (videoResult) {
    const details = el('div', { className: 'mt-xl' });

    // Score metrics
    const metrics = el('div', { className: 'dashboard-3col' });
    for (const [label, value] of [
      ['Hook', videoResult.hookScore],
      ['Retention', videoResult.retentionScore],
      ['Emotion', videoResult.emotionScore],
      ['Shareability', videoResult.shareabilityScore],
      ['Editing', videoResult.editingScore],
      ['Audio', videoResult.audioScore],
    ]) {
      metrics.appendChild(renderMetricCard(label, value));
    }
    details.appendChild(metrics);

    // Analysis blocks
    const analysisGrid = el('div', { className: 'dashboard-2col mt-lg' });

    // Visual Analysis
    const visualBlock = el('div', { className: 'analysis-block' },
      el('div', { className: 'analysis-block-title' }, '영상 분석'),
    );
    for (const [label, text] of [
      ['분석 모드', videoResult.analysisMode],
      ['사용 데이터', (videoResult.usedData || []).join(', ')],
      ['장면 분석', videoResult.visualAnalysis?.summary || ''],
      ['첫 3초 진단', videoResult.visualAnalysis?.firstThreeSeconds || ''],
      ['핵심 장면', (videoResult.visualAnalysis?.keyScenes || []).join(', ')],
      ['장면 전환 진단', videoResult.visualAnalysis?.editingStyle || ''],
      ['이탈 위험 구간', (videoResult.visualAnalysis?.retentionRiskPoints || []).join(', ')],
    ]) {
      visualBlock.appendChild(renderInfoRow(label, text));
    }
    analysisGrid.appendChild(visualBlock);

    // Audio Analysis
    const audioBlock = el('div', { className: 'analysis-block' },
      el('div', { className: 'analysis-block-title' }, '오디오 분석'),
    );
    for (const [label, text] of [
      ['음성 분석', videoResult.audioAnalysis?.voiceTone || ''],
      ['대사 분석', videoResult.audioAnalysis?.transcript || '전사 정보가 없어 대사 분석은 제한적입니다.'],
      ['음악 분석', videoResult.audioAnalysis?.musicMood || ''],
      ['효과음 분석', videoResult.audioAnalysisUsed ? '프레임과 전사 정보를 함께 보며 사운드 몰입도를 판단했습니다.' : '오디오 분석이 사용되지 않아 효과음 판단은 제한적입니다.'],
      ['사운드 개선 제안', videoResult.audioAnalysis?.soundImpact || ''],
      ['오디오 약점', (videoResult.audioAnalysis?.audioWeaknesses || []).join(', ')],
    ]) {
      audioBlock.appendChild(renderInfoRow(label, text));
    }
    analysisGrid.appendChild(audioBlock);
    details.appendChild(analysisGrid);

    // Strengths / Weaknesses
    const swGrid = el('div', { className: 'dashboard-2col mt-lg' });
    swGrid.appendChild(renderListBlock('강점', videoResult.strengths || []));
    swGrid.appendChild(renderListBlock('약점', videoResult.weaknesses || [], true));
    details.appendChild(swGrid);

    // Viral Diagnosis
    const viralGrid = el('div', { className: 'dashboard-2col mt-lg' });
    viralGrid.appendChild(renderListBlock('왜 터질 수 있는가', videoResult.viralDiagnosis?.whyItCanGoViral || []));
    viralGrid.appendChild(renderListBlock('왜 안 터질 수 있는가', videoResult.viralDiagnosis?.whyItMayFail || [], true));
    details.appendChild(viralGrid);

    // Target / Share
    const targetBlock = el('div', { className: 'analysis-block mt-lg' },
      el('div', { className: 'analysis-block-title' }, '타깃·공유 진단'),
      renderInfoRow('타깃 적합도', videoResult.viralDiagnosis?.targetAudienceFit || ''),
      renderInfoRow('공유 트리거', (videoResult.viralDiagnosis?.shareTriggers || []).join(', ')),
    );
    details.appendChild(targetBlock);

    // Top 3 fixes
    if (videoResult.prescription?.topThreeFixes?.length) {
      const fixesDiv = el('div', { className: 'mt-lg' },
        el('h4', { className: 'section-title' }, '개선 제안 TOP 3'),
      );
      const fixGrid = el('div', { className: 'grid-gap' });
      videoResult.prescription.topThreeFixes.slice(0, 3).forEach((fix, i) => {
        fixGrid.appendChild(el('div', { className: 'prescription-card' },
          el('div', { className: 'prescription-priority' }, (i + 1) + '순위 수정안'),
          el('p', { className: 'prescription-why mt-sm' }, fix),
          el('div', { className: 'prescription-copy-box' }, fix),
          el('div', { className: 'mt-sm', style: { textAlign: 'right' } }, renderCopyButton(fix)),
        ));
      });
      fixesDiv.appendChild(fixGrid);
      details.appendChild(fixesDiv);
    }

    // Prescription details
    const rxGrid = el('div', { className: 'dashboard-2col mt-lg' });
    const rxBlock1 = el('div', { className: 'analysis-block' },
      el('div', { className: 'analysis-block-title' }, '처방 문구'),
      renderInfoRow('첫 3초 재작성', videoResult.prescription?.firstThreeSecondsRewrite || ''),
      renderInfoRow('자막 제안', (videoResult.prescription?.captionSuggestions || []).join(', ')),
    );
    const rxBlock2 = el('div', { className: 'analysis-block' },
      el('div', { className: 'analysis-block-title' }, '편집·오디오 처방'),
      renderInfoRow('편집 제안', (videoResult.prescription?.editingSuggestions || []).join(', ')),
      renderInfoRow('오디오 제안', (videoResult.prescription?.audioSuggestions || []).join(', ')),
    );
    rxGrid.appendChild(rxBlock1);
    rxGrid.appendChild(rxBlock2);
    details.appendChild(rxGrid);

    card.appendChild(details);
  }

  return card;
}

// ---- Recent Diagnoses ----
function renderRecentItem(item, onOpen, onDelete) {
  return el('div', { className: 'recent-item' },
    el('div', {},
      el('div', { className: 'recent-meta' }, `${PLATFORM_LABELS[item.platform] || item.platform} · ${formatDate(item.diagnosedAt)}`),
      el('div', { className: 'recent-title' }, item.title),
      el('p', { className: 'recent-diagnosis' }, item.oneLineDiagnosis),
      el('div', { className: 'recent-score' }, `${item.totalScore}점 · ${item.status}`),
    ),
    el('div', { className: 'recent-actions' },
      el('button', { className: 'btn btn-primary', type: 'button', onClick: () => onOpen(item) }, '다시 열기'),
      el('button', { className: 'btn btn-danger', type: 'button', onClick: () => onDelete(item.id) }, '삭제'),
    ),
  );
}
