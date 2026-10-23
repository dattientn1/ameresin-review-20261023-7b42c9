'use strict';
const state = { data: null, images: [], activeImage: 0, team: '', search: '', repeatOnly: false, busy: false };
const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const imageButton = (image, extra = '') => `<button class="image-button ${extra}" type="button" data-image="${esc(image.id)}" aria-label="Xem lớn: ${esc(image.label)}"><img src="${esc(image.src)}" alt="${esc(image.label)}" loading="lazy" decoding="async"></button>`;

byId('toggle-password').addEventListener('click', () => {
  const field = byId('password');
  const show = field.type === 'password';
  field.type = show ? 'text' : 'password';
  byId('toggle-password').textContent = show ? 'Ẩn' : 'Hiện';
  byId('toggle-password').setAttribute('aria-label', show ? 'Ẩn mật khẩu' : 'Hiện mật khẩu');
  byId('toggle-password').setAttribute('aria-pressed', String(show));
});

byId('unlock-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  const password = byId('password').value;
  const status = byId('unlock-status');
  status.className = 'form-status';
  if (!password) { status.textContent = 'A nhập mật khẩu để mở báo cáo nhé.'; byId('password').focus(); return; }
  if (!globalThis.crypto?.subtle) { status.classList.add('error'); status.textContent = 'Trình duyệt này chưa hỗ trợ giải mã an toàn. A mở đường dẫn bằng Safari hoặc Chrome mới nhé.'; return; }
  state.busy = true;
  byId('unlock-button').disabled = true;
  byId('password').disabled = true;
  status.textContent = 'Đang tải dữ liệu mã hóa…';
  try {
    const response = await fetch('report.enc.json', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw new Error('download');
    const envelope = await response.json();
    if (envelope.version !== 1 || envelope.iterations !== 600000 || envelope.cipher !== 'AES-GCM') throw new Error('download');
    status.textContent = 'Đang giải mã trên thiết bị…';
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: bytes(envelope.salt), iterations: envelope.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(envelope.iv), additionalData: new TextEncoder().encode('ameresin-private-report-v1'), tagLength: 128 }, key, bytes(envelope.data));
    const data = JSON.parse(new TextDecoder().decode(clear));
    if (!Array.isArray(data.groups) || !Array.isArray(data.images) || !data.groups.length || !Number.isInteger(data.stats?.images)) throw new Error('download');
    const imageMap = new Map(data.images.map(image => [image.id, image]));
    data.groups.forEach(group => {
      group.sources = group.sources.map(image => ({ ...imageMap.get(image.id), ...image }));
      group.rounds.forEach(round => { round.variants = round.variants.map(image => ({ ...imageMap.get(image.id), ...image })); });
    });
    state.data = data;
    state.images = data.images;
    byId('password').value = '';
    byId('password').type = 'password';
    byId('toggle-password').textContent = 'Hiện';
    byId('toggle-password').setAttribute('aria-pressed', 'false');
    byId('lock-view').hidden = true;
    byId('report-view').hidden = false;
    renderReport();
    byId('report-view').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    status.textContent = '';
  } catch (error) {
    status.classList.add('error');
    status.textContent = error.name === 'OperationError' ? 'Mật khẩu chưa đúng. A kiểm tra rồi thử lại nhé.' : 'Chưa mở được báo cáo. A kiểm tra mạng rồi thử lại nhé.';
  } finally {
    state.busy = false;
    byId('unlock-button').disabled = false;
    byId('password').disabled = false;
  }
});

function renderReport() {
  const data = state.data;
  const metrics = [ ['Bộ ảnh không trùng', data.stats.photoSets, 'Không phải số khách đã xác thực'], ['Yêu cầu mới', data.stats.jobs, 'Đã gộp một bộ ảnh gửi lại'], ['Vòng gen', data.stats.rounds, `Gồm ${data.stats.regenerations} lượt Generate again`], ['Ảnh hoàn tất', data.stats.images, `${data.stats.engineCounts.gpt} GPT + ${data.stats.engineCounts.magnific} Magnific`] ];
  byId('report-view').innerHTML = `
    <div class="report-toolbar"><p class="eyebrow">Studio review / 23.10.2026</p><button id="lock-report" type="button" class="button secondary">Khóa báo cáo ↗</button></div>
    <header class="report-heading"><div><h1>Ảnh thật. Lượt gen thật.</h1><p>Đối soát ảnh gốc và từng phương án được tạo. Không thấy job trùng các lượt test nội bộ đã ghi nhận; chưa loại trừ được test tay không ghi log.</p></div><div class="snapshot"><span>Snapshot giờ Việt Nam</span><strong>23/10 · 00:00–07:49</strong></div></header>
    <section class="metrics" aria-label="Tổng quan">${metrics.map((m,i) => `<div class="metric ${i === 0 ? 'featured' : ''}"><div class="metric-label">${esc(m[0])}</div><div class="metric-value">${esc(m[1])}</div><div class="metric-note">${esc(m[2])}</div></div>`).join('')}</section>
    <aside class="caution"><strong>Đọc đúng con số:</strong> ${data.stats.photoSets} là số bộ ảnh khác nhau, chưa phải ${data.stats.photoSets} khách duy nhất. NHL chưa ghi IP/phiên khách. Hai yêu cầu Florida dùng cùng một ảnh đã được gộp thành một bộ.</aside>
    <section aria-labelledby="summary-heading"><div class="section-heading"><h2 id="summary-heading">Bảng đối soát</h2><p>Nhấn ảnh để xem lớn</p></div>
      <div class="filters"><input id="report-search" class="search-input" type="search" placeholder="Tìm đội, bộ ảnh hoặc thời điểm…" aria-label="Tìm đội, bộ ảnh hoặc thời điểm"><select id="team-filter" class="filter-select" aria-label="Lọc theo đội"><option value="">Tất cả đội</option>${data.groups.map(g => `<option value="${esc(g.team)}">${esc(g.teamName)} · ${esc(g.team)}</option>`).join('')}</select><button id="repeat-filter" class="chip-button" type="button" aria-pressed="false">Chỉ bộ có gen lại</button></div>
      <div id="summary-table-container"></div><div class="filter-status"><span id="filter-count"></span><span>NHL: ${data.stats.images} ảnh · Caroline: ${data.stats.carolineJobs} lượt mới</span></div>
    </section>
    <section aria-labelledby="gallery-heading"><div class="section-heading gallery-head"><h2 id="gallery-heading">Ảnh gốc & phương án</h2><button id="collapse-groups" class="expand-button" type="button">Thu gọn tất cả ↑</button></div><div id="groups-container"></div></section>
    <footer class="report-footer">Đối chiếu dữ liệu job, nhật ký dịch vụ, file ảnh và SHA256 ảnh gốc. Mỗi vòng tạo 4 phương án: A/B từ GPT, C/D từ Magnific.<br>Bản chụp dữ liệu lúc 07:49 ngày 23/10/2026; không tự cập nhật. Mật khẩu không được lưu trên thiết bị. Người có link và mật khẩu vẫn có thể lưu hoặc chụp lại ảnh.</footer>`;
  byId('lock-report').addEventListener('click', lockReport);
  byId('report-search').addEventListener('input', event => { state.search = event.target.value; renderGroups(); });
  byId('team-filter').addEventListener('change', event => { state.team = event.target.value; renderGroups(); });
  byId('repeat-filter').addEventListener('click', () => { state.repeatOnly = !state.repeatOnly; byId('repeat-filter').setAttribute('aria-pressed', String(state.repeatOnly)); renderGroups(); });
  byId('collapse-groups').addEventListener('click', () => {
    const groups = [...document.querySelectorAll('.group-card')];
    const open = !groups.every(group => group.open);
    groups.forEach(group => { group.open = open; });
    byId('collapse-groups').textContent = open ? 'Thu gọn tất cả ↑' : 'Mở rộng tất cả ↓';
  });
  renderGroups();
}

function renderGroups() {
  const query = state.search.toLocaleLowerCase('vi').trim();
  const groups = state.data.groups.filter(g => (!state.team || g.team === state.team) && (!state.repeatOnly || g.hasRepeat) && (!query || [g.label, g.team, g.teamName, g.timeLabel].join(' ').toLocaleLowerCase('vi').includes(query)));
  byId('filter-count').textContent = `Đang xem ${groups.length}/${state.data.groups.length} bộ ảnh`;
  byId('summary-table-container').innerHTML = groups.length ? `<div class="summary-table-wrap"><table class="summary-table"><thead><tr><th>Bộ ảnh & đội</th><th>Ảnh gốc</th><th>Thời điểm</th><th>Yêu cầu / vòng</th><th>Ảnh tạo</th><th></th></tr></thead><tbody>${groups.map(g => `<tr><td class="group-cell"><strong>${esc(g.label)} · ${esc(g.team)}</strong><span>${esc(g.teamName)}</span></td><td class="original-cell"><div class="original-strip">${g.sources.map(imageButtonSimple).join('')}</div></td><td data-label="Thời điểm" class="mono">${esc(g.timeLabel)}</td><td data-label="Yêu cầu / vòng" class="mono">${g.jobs} yêu cầu · ${g.rounds.length} vòng</td><td data-label="Ảnh tạo"><strong class="mono">${g.imageCount}</strong> <span class="status">Hoàn tất</span></td><td><button class="table-link" type="button" data-jump="${g.id}">Xem ảnh ↘</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">Không có bộ ảnh phù hợp. A thử đổi bộ lọc nhé.</div>';
  byId('groups-container').innerHTML = groups.map(g => `<details class="group-card" id="${g.id}" open><summary><div class="group-name"><span class="group-index">${esc(g.number)}</span><div><h3>${esc(g.teamName)}</h3><p>${esc(g.timeLabel)} · ${g.jobs} yêu cầu · ${g.rounds.length} vòng</p></div></div><div class="summary-meta"><span>${g.imageCount} ảnh</span><span class="status">Hoàn tất</span><span class="chevron" aria-hidden="true">⌄</span></div></summary><div class="group-body"><aside class="source-panel"><p class="panel-heading">Ảnh khách gửi · ${g.sources.length}</p><div class="source-images">${g.sources.map(imageButtonSimple).join('')}</div><p class="source-caption">${esc(g.sourceNote)}<br>${g.jobs > 1 ? 'Hai yêu cầu dùng đúng cùng một ảnh gốc.' : 'Ảnh gốc của bộ yêu cầu này.'}</p></aside><div class="rounds-panel">${g.rounds.map(r => `<section class="round-block"><header class="round-title"><div><h4>Yêu cầu ${r.jobOrdinal} · Vòng ${r.n}${r.n > 1 ? ' · Gen lại' : ''}</h4><p>${esc(r.formatLabel)}</p></div><time>${esc(r.startTime)} → ${esc(r.finishTime)}</time></header><div class="variant-grid">${r.variants.map(v => `<figure class="variant">${imageButton(v)}<figcaption><strong>Phương án ${esc(v.key)}</strong><span>${esc(v.engine)}</span></figcaption><div class="pose">${v.key === 'A' || v.key === 'C' ? 'Dáng relaxed' : 'Dáng alternate'}</div></figure>`).join('')}</div></section>`).join('')}</div></div></details>`).join('');
  byId('collapse-groups').textContent = 'Thu gọn tất cả ↑';
}
function imageButtonSimple(image) { return imageButton(image); }

byId('report-view').addEventListener('click', event => {
  const image = event.target.closest('[data-image]');
  if (image) { openImage(image.dataset.image); return; }
  const jump = event.target.closest('[data-jump]');
  if (jump) { const group = byId(jump.dataset.jump); group.open = true; group.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }
});
function openImage(id) {
  const index = state.images.findIndex(image => image.id === id);
  if (index < 0) return;
  state.activeImage = index;
  updateImage();
  byId('image-dialog').showModal();
  document.body.classList.add('dialog-open');
}
function updateImage() {
  const image = state.images[state.activeImage];
  byId('large-image').src = image.src;
  byId('large-image').alt = image.label;
  byId('image-label').textContent = image.label;
  byId('image-position').textContent = `${state.activeImage + 1} / ${state.images.length}`;
  byId('download-image').href = image.src;
  byId('download-image').download = `${image.id}.webp`;
}
byId('previous-image').addEventListener('click', () => { state.activeImage = (state.activeImage - 1 + state.images.length) % state.images.length; updateImage(); });
byId('next-image').addEventListener('click', () => { state.activeImage = (state.activeImage + 1) % state.images.length; updateImage(); });
byId('close-dialog').addEventListener('click', () => byId('image-dialog').close());
byId('image-dialog').addEventListener('close', () => { document.body.classList.remove('dialog-open'); byId('large-image').removeAttribute('src'); byId('download-image').removeAttribute('href'); });
byId('image-dialog').addEventListener('click', event => { if (event.target === byId('image-dialog')) byId('image-dialog').close(); });
byId('image-dialog').addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); byId('previous-image').click(); } if (event.key === 'ArrowRight') { event.preventDefault(); byId('next-image').click(); } });
function lockReport() {
  byId('image-dialog').close();
  state.data = null; state.images = []; state.team = ''; state.search = ''; state.repeatOnly = false;
  byId('report-view').replaceChildren();
  byId('report-view').hidden = true;
  byId('lock-view').hidden = false;
  byId('password').value = '';
  byId('password').focus();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
