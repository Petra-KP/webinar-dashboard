/**
 * Webinar Agent Dashboard - Frontend Logic
 * Ekosystém návrhů webinářů pro Aibility
 * Funguje i bez API (standalone) – stačí otevřít HTML
 */

const API_URL = 'http://localhost:5000/api';
const STORAGE_KEY = 'webinar_drafts';
const VOTES_STORAGE_KEY = 'webinar_votes';

let drafts = [];
let slots = [];
let lektori = [];
let spKatalog = [];
let colleaguePreferences = { merged: [], error: null };
let currentDraftId = null;
let useApi = false;

let pendingVote = null; // { topicId, topicName, preference }

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initFilters();
    initVoteModal();
    useApi = await checkApiAvailable();
    if (!useApi && (location.protocol === 'file:' || location.href.startsWith('file://'))) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fef3c7;color:#92400e;padding:12px 20px;text-align:center;font-weight:500;border-bottom:1px solid #f59e0b';
        banner.innerHTML = '⚠️ Otevřela jsi soubor přímo (file://). Pro Airtable musíš otevřít <a href="http://localhost:5000" style="color:#b45309;font-weight:bold">http://localhost:5000</a> – spusť nejdřív <strong>Otevrit_dashboard.bat</strong>.';
        document.body.insertBefore(banner, document.body.firstChild);
    }
    loadData();
    // Pro kolegy: ?vote=1 nebo #hlasovani → otevři Katalog SP (hlasování je přímo u témat)
    const params = new URLSearchParams(location.search);
    if (params.get('vote') === '1' || location.hash === '#hlasovani') {
        document.querySelector('[data-tab="katalog"]')?.click();
    }
});

function initVoteModal() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-vote');
        if (btn) {
            const topicId = btn.dataset.topicId;
            const topicName = btn.dataset.topicName || '';
            const preference = btn.dataset.preference || 'chci';
            openVoteModal(topicId, topicName, preference);
        }
    });
    document.getElementById('vote-submit-btn')?.addEventListener('click', confirmVote);
    document.getElementById('vote-modal')?.querySelector('.modal-backdrop')?.addEventListener('click', closeVoteModal);
    document.getElementById('vote-name')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirmVote(); } });
    document.getElementById('vote-note')?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmVote(); } });
}

function openVoteModal(topicId, topicName, preference) {
    pendingVote = { topicId, topicName, preference };
    const prefLabels = { chci: '✓ Chci', zvažuji: '~ Zvažuji', nechci: '✗ Nechci' };
    const prefClass = { chci: 'preference-chci', zvažuji: 'preference-zvazuji', nechci: 'preference-nechci' };
    document.getElementById('vote-modal-title').textContent = 'Váš hlas';
    document.getElementById('vote-modal-topic').textContent = topicName || topicId;
    const prefEl = document.getElementById('vote-modal-preference');
    prefEl.textContent = prefLabels[preference] || preference;
    prefEl.className = 'vote-modal-preference ' + (prefClass[preference] || '');
    document.getElementById('vote-name').value = '';
    document.getElementById('vote-note').value = '';
    document.getElementById('vote-modal').style.display = 'flex';
    document.getElementById('vote-name').focus();
}

function closeVoteModal() {
    pendingVote = null;
    document.getElementById('vote-modal').style.display = 'none';
}

function confirmVote() {
    const name = (document.getElementById('vote-name')?.value || '').trim();
    const note = (document.getElementById('vote-note')?.value || '').trim();
    if (!name) {
        showToast('Prosím zadejte své jméno');
        document.getElementById('vote-name').focus();
        return;
    }
    if (!pendingVote) return;
    submitVote(pendingVote.topicId, pendingVote.preference, name, note);
    closeVoteModal();
}

// === Tabs ===
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
            if (tab.dataset.tab === 'katalog' && spKatalog.length === 0) loadSPKatalog();
            if (tab.dataset.tab === 'archiv') renderArchivList();
        });
    });
}

// === Filters ===
function initFilters() {
    document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn[data-filter]').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            renderDrafts(btn.dataset.filter);
        });
    });
    document.querySelectorAll('.filter-btn[data-katalog-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn[data-katalog-filter]').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            renderKatalog(btn.dataset.katalogFilter);
        });
    });
    document.querySelectorAll('.filter-btn[data-archiv-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn[data-archiv-filter]').forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            archivFilter = btn.dataset.archivFilter || 'all';
            renderArchivList();
        });
    });
}

// === API check ===
async function checkApiAvailable() {
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 1500);
        const resp = await fetch(`${API_URL}/health`, { signal: ctrl.signal });
        clearTimeout(t);
        return resp.ok;
    } catch {
        return false;
    }
}

// === Slot calculation (standalone) ===
function calcSlotsStandalone(count = 12) {
    const REF = new Date('2026-04-07T11:00:00+01:00');
    const WEBINAR_HOUR = 11;
    const WEBINAR_MINUTE = 0;

    function nextTuesday(d) {
        const tue = new Date(d);
        const wd = tue.getDay();
        let add = (2 - wd + 7) % 7;
        if (add === 0 && tue.getHours() >= WEBINAR_HOUR) add = 7;
        tue.setDate(tue.getDate() + add);
        tue.setHours(WEBINAR_HOUR, WEBINAR_MINUTE, 0, 0);
        return tue;
    }

    function moduleForDate(d) {
        const daysDiff = Math.floor((d - REF) / 86400000);
        const weeksDiff = Math.floor(daysDiff / 7);
        const cycle = (Math.floor(weeksDiff / 2) % 2);
        return cycle === 0 ? 'Chat' : 'Build';
    }

    const out = [];
    let cur = nextTuesday(new Date());
    for (let i = 0; i < count; i++) {
        const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, '0'), d = String(cur.getDate()).padStart(2, '0');
        out.push({
            date: cur.toISOString(),
            date_str: `${y}-${m}-${d}`,
            weekday: 'úterý',
            time: '11:00',
            module: moduleForDate(cur),
            is_occupied: false,
            is_blocked: false,
            is_available: true
        });
        cur = nextTuesday(new Date(cur.getTime() + 86400000));
    }
    return out;
}

// === Data Loading ===
async function loadData() {
    await Promise.all([loadDrafts(), loadSlots(), loadLektori(), loadSPKatalog(), loadColleaguePreferences(), checkAirtableStatus()]);
}

async function loadDrafts() {
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/drafts`);
            const data = await resp.json();
            drafts = data.drafts || [];
        } catch (err) {
            console.error('Chyba:', err);
            drafts = [];
        }
    } else {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            drafts = raw ? JSON.parse(raw) : [];
        } catch {
            drafts = [];
        }
    }
    renderDrafts();
    updateCounts();
}

async function loadSlots() {
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/slots?count=12`);
            const data = await resp.json();
            slots = data.slots || [];
        } catch {
            slots = [];
        }
    } else {
        slots = calcSlotsStandalone(12);
    }
    renderSlots();
}

async function loadLektori() {
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/lektori`);
            const data = await resp.json();
            lektori = data.lektori || [];
        } catch {
            lektori = [];
        }
    } else {
        const pref = (window.LEKTORI_PREFEROVANI || []);
        lektori = pref.map(l => ({ jmeno: l.jmeno, profese: l.profese, pocet_eventu: 0 }));
    }
}

const DEFAULT_PREFERENCES = (window.PREFERENCES || {}).preferences || [];

async function loadColleaguePreferences() {
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/colleague-preferences`);
            const data = await resp.json();
            colleaguePreferences = data;
        } catch (err) {
            colleaguePreferences = { merged: [], error: 'Chyba načtení' };
        }
    } else if (getJsonBinConfig()) {
        try {
            const data = await fetchJsonBin();
            const prefs = data.preferences || [];
            const merged = ensureAllTopics(prefs);
            colleaguePreferences = { merged, error: null };
        } catch (err) {
            console.error('JSONBin:', err);
            colleaguePreferences = { merged: ensureAllTopics([]), error: 'Chyba načtení z JSONBin' };
        }
    } else {
        const prefs = window.PREFERENCES || { preferences: [] };
        let merged = (prefs.preferences || []).map(p => ({
            topic_id: p.topic_id,
            topic_name: p.topic_name,
            modul: p.modul,
            votes: [...(p.votes || [])]
        }));
        merged = ensureAllTopics(merged);
        try {
            const localVotes = JSON.parse(localStorage.getItem(VOTES_STORAGE_KEY) || '{}');
            for (const m of merged) {
                const lv = localVotes[m.topic_id] || [];
                m.votes = [...m.votes, ...lv];
            }
        } catch {}
        // Přidat vlastní návrhy (drafts) do Hlasování
        const spIds = new Set((DEFAULT_PREFERENCES.length ? DEFAULT_PREFERENCES : merged).map(p => p.topic_id));
        const customDrafts = drafts.filter(d =>
            (d.status === 'draft' || d.status === 'rejected') &&
            !(d.archiv_status || '') &&
            (!d.topic_id || String(d.topic_id).startsWith('draft-')) &&
            !spIds.has(d.topic_id || '')
        );
        for (const d of customDrafts) {
            const tid = d.topic_id || d.theme_id || `draft-${d.id}`;
            if (!merged.some(m => m.topic_id === tid)) {
                const lv = (() => { try { return JSON.parse(localStorage.getItem(VOTES_STORAGE_KEY) || '{}')[tid] || []; } catch { return []; } })();
                merged.push({
                    topic_id: tid,
                    topic_name: d.tema || 'Vlastní návrh',
                    modul: d.modul || 'Chat',
                    votes: [...lv],
                    is_custom: true,
                    draft_id: d.id
                });
            }
        }
        colleaguePreferences = { merged, error: null };
    }
    renderKatalog(); // Aktualizovat hlasy v Katalogu SP
}

function getJsonBinConfig() {
    const c = window.JSONBIN_CONFIG || {};
    return (c.binId && c.apiKey) ? c : null;
}

function ensureAllTopics(prefs) {
    const byId = {};
    for (const p of prefs) if (p.topic_id) byId[p.topic_id] = p;
    // Katalog SP je zdroj pravdy – stejná témata jako v záložce Katalog
    const katalog = window.SP_KATALOG || [];
    const base = katalog.length ? katalog.map(t => ({
        topic_id: t.id || t.topic_id || '',
        topic_name: t.tema || t.topic_name || '',
        modul: t.modul || 'Chat',
        votes: []
    })).filter(t => t.topic_id) : (DEFAULT_PREFERENCES.length ? DEFAULT_PREFERENCES : []);
    return base.map(p => ({
        topic_id: p.topic_id,
        topic_name: (byId[p.topic_id] || p).topic_name || p.topic_name,
        modul: (byId[p.topic_id] || p).modul || p.modul,
        votes: [...((byId[p.topic_id] || p).votes || [])]
    }));
}

async function fetchJsonBin() {
    const c = getJsonBinConfig();
    if (!c) throw new Error('JSONBin není nakonfigurován');
    const resp = await fetch(`https://api.jsonbin.io/v3/b/${c.binId}/latest`, {
        headers: { 'X-Master-Key': c.apiKey }
    });
    if (!resp.ok) throw new Error('JSONBin: ' + (await resp.text()));
    const json = await resp.json();
    const data = json.record || json;
    if (!data || typeof data !== 'object') return { preferences: [] };
    if (!Array.isArray(data.preferences)) return { preferences: ensureAllTopics([]) };
    return data;
}

async function updateJsonBin(data) {
    const c = getJsonBinConfig();
    if (!c) throw new Error('JSONBin není nakonfigurován');
    const resp = await fetch(`https://api.jsonbin.io/v3/b/${c.binId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Master-Key': c.apiKey },
        body: JSON.stringify(data)
    });
    if (!resp.ok) throw new Error('JSONBin: ' + (await resp.text()));
}

function renderColleaguePreferences(filter = 'all') {
    const container = document.getElementById('preferences-list');
    const emptyState = document.getElementById('preferences-empty');
    if (!container) return;

    let merged = colleaguePreferences.merged || [];
    if (filter !== 'all') merged = merged.filter(m => m.modul === filter);
    const err = colleaguePreferences.error;

    if (merged.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        emptyState.querySelector('h3').textContent = err ? 'Chyba načtení' : 'Žádné preference';
        emptyState.querySelector('p').textContent = err || 'Kolegové mohou hlasovat přes odkaz nebo upravit data/webinar_preferences.json v Cursoru.';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = merged.map(item => {
        const votes = item.votes || [];
        const chci = votes.filter(v => v.preference === 'chci').length;
        const zvažuji = votes.filter(v => v.preference === 'zvažuji').length;
        const nechci = votes.filter(v => v.preference === 'nechci').length;
        const mc = (item.modul || '').toLowerCase();
        const mi = item.modul === 'Build' ? '🛠️' : '💬';
        const votesHtml = votes.map(v => `
            <div class="preference-vote preference-${v.preference}">
                <span class="vote-person">${esc(v.person)}</span>
                <span class="vote-pref">${v.preference === 'chci' ? '✓ Chci' : v.preference === 'zvažuji' ? '~ Zvažuji' : '✗ Nechci'}</span>
                ${v.comment ? `<div class="vote-comment">${esc(v.comment).substring(0, 150)}${v.comment.length > 150 ? '…' : ''}</div>` : ''}
            </div>
        `).join('');
        return `
            <div class="card card-preferences">
                <div class="card-header">
                    <span class="card-module ${mc}">${mi} ${item.modul || '—'}</span>
                    ${item.is_custom ? '<span style="font-size:0.7rem;background:var(--accent-build-light);color:var(--accent-build);padding:2px 8px;border-radius:6px">Vlastní návrh</span>' : ''}
                    <span class="preference-counts">
                        <span class="count-chci">${chci}✓</span>
                        <span class="count-zvazuji">${zvažuji}~</span>
                        <span class="count-nechci">${nechci}✗</span>
                    </span>
                </div>
                <h3 class="card-title">${esc(item.topic_name)}</h3>
                <div class="card-actions card-actions-hlasovani">
                    <button type="button" class="btn btn-success btn-sm btn-vote" data-topic-id="${esc(item.topic_id)}" data-topic-name="${esc(item.topic_name)}" data-preference="chci">✓ Chci</button>
                    <button type="button" class="btn btn-warning btn-sm btn-vote" data-topic-id="${esc(item.topic_id)}" data-topic-name="${esc(item.topic_name)}" data-preference="zvažuji">~ Zvažuji</button>
                    <button type="button" class="btn btn-secondary btn-sm btn-vote" data-topic-id="${esc(item.topic_id)}" data-topic-name="${esc(item.topic_name)}" data-preference="nechci">✗ Nechci</button>
                    ${votes.length ? `<button type="button" class="btn btn-danger btn-sm" onclick="clearVotes('${esc(item.topic_id)}')" title="Smazat všechny hlasy u tohoto tématu">🗑️ Smazat hlasy</button>` : ''}
                </div>
                ${votesHtml ? `<div class="preference-votes" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-200)">${votesHtml}</div>` : ''}
            </div>
        `;
    }).join('');
}

async function loadSPKatalog() {
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/sp-katalog`);
            const data = await resp.json();
            spKatalog = data.topics || [];
        } catch (err) {
            console.error('Chyba načtení katalogu:', err);
            spKatalog = [];
        }
    } else {
        spKatalog = window.SP_KATALOG || [];
    }
    renderKatalog();
    const emptyEl = document.getElementById('katalog-empty');
    if (emptyEl && spKatalog.length === 0) {
        emptyEl.style.display = 'block';
        emptyEl.querySelector('h3').textContent = 'Chyba načtení';
        emptyEl.querySelector('p').textContent = 'Nepodařilo se načíst katalog SP metodiky.';
    }
}

async function checkAirtableStatus() {
    const el = document.getElementById('airtable-status');
    if (!useApi) {
        const hasJsonBin = !!getJsonBinConfig();
        if (hasJsonBin) {
            el.className = 'status-badge status-connected';
            el.innerHTML = '🟢 Hlasy sdílené';
        } else {
            el.className = 'status-badge status-disconnected';
            el.innerHTML = '📂 Hlasy jen v prohlížeči';
        }
        return;
    }
    try {
        const resp = await fetch(`${API_URL}/config/status`);
        const data = await resp.json();
        if (data.airtable_connected) {
            el.className = 'status-badge status-connected';
            el.innerHTML = '🟢 Airtable';
        } else {
            el.className = 'status-badge status-disconnected';
            el.innerHTML = '⚪ Airtable';
        }
    } catch {
        el.className = 'status-badge status-disconnected';
        el.innerHTML = '🔴 API offline';
    }
}

// === Rendering ===
function renderDrafts(filter = 'all') {
    const container = document.getElementById('drafts-list');
    const emptyState = document.getElementById('drafts-empty');

    let filtered = drafts.filter(d =>
        (d.status === 'draft' || d.status === 'rejected') && !(d.archiv_status || '')
    );
    if (filter !== 'all') filtered = filtered.filter(d => d.modul === filter);

    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    filtered.sort((a, b) => (b.score || 0) - (a.score || 0));
    container.innerHTML = filtered.map(d => renderDraftCard(d)).join('');
}

function renderDraftCard(draft) {
    const mc = draft.modul.toLowerCase();
    const mi = draft.modul === 'Chat' ? '💬' : '🛠️';
    const supArr = czToEnSuperpowers(draft.usp || draft.superschopnosti);
    const lektor = draft.doporuceny_lektor || '?';
    let obsah = [];
    try { obsah = JSON.parse(draft.co_by_bylo_obsahem || '[]'); } catch { }
    const obsahClean = (Array.isArray(obsah) ? obsah : []).filter(o => o && typeof o === 'string' && !o.startsWith('**')).slice(0, 3);

    return `
        <div class="card card-draft" onclick="openDraftDetail(${draft.id})">
            <div class="card-header">
                <span class="card-module ${mc}">${mi} ${draft.modul}</span>
            </div>
            <h3 class="card-title">${esc(draft.tema)}</h3>
            ${supArr.length ? `<div class="card-superschopnosti"><strong>Superschopnosti:</strong> <span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${renderSuperpowersWithColors(supArr)}</span></div>` : ''}
            ${obsahClean.length > 0 ? `<ul class="card-obsah">${obsahClean.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
            <div class="card-meta">
                <span class="card-meta-item">🎓 ${esc(lektor)}</span>
            </div>
            <div class="card-actions" onclick="event.stopPropagation()">
                <button class="btn btn-success btn-sm" onclick="approveDraft(${draft.id})">✅ Schválit</button>
                <button class="btn btn-secondary btn-sm" onclick="openDraftDetail(${draft.id})">👁️ Detail</button>
                <button class="btn btn-warning btn-sm" onclick="rejectDraft(${draft.id})" title="Zamítnout">❌ Zamítnout</button>
                <button class="btn btn-danger btn-sm" onclick="deleteDraft(${draft.id})" title="Smazat trvale">🗑️ Smazat</button>
            </div>
        </div>
    `;
}

function renderApprovedList() {
    const container = document.getElementById('approved-list');
    const emptyState = document.getElementById('approved-empty');

    const approved = drafts.filter(d =>
        (d.status === 'approved' || d.status === 'texts_generated' || d.status === 'ready_to_publish' || d.status === 'saved') &&
        !(d.archiv_status || '')
    );

    if (approved.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = approved.map(d => renderApprovedCard(d)).join('');
}

function renderApprovedCard(draft) {
    const mc = draft.modul.toLowerCase();
    const mi = draft.modul === 'Chat' ? '💬' : '🛠️';
    const date = formatDate(draft.navrzeny_termin);

    let statusText = '', actions = '';
    if (draft.status === 'approved') {
        statusText = '✅ Schváleno';
        actions = `<button class="btn btn-primary btn-sm" onclick="generateTexts(${draft.id});event.stopPropagation()">✨ Generovat texty</button>`;
    } else if (draft.status === 'texts_generated') {
        statusText = '📝 Texty připraveny';
        actions = `
            <button class="btn btn-secondary btn-sm" onclick="openTextEditor(${draft.id});event.stopPropagation()">✏️ Upravit texty</button>
            <button class="btn btn-success btn-sm" onclick="openSaveToAirtable(${draft.id});event.stopPropagation()">💾 Uložit do Airtable</button>
        `;
    } else if (draft.status === 'ready_to_publish') {
        statusText = '📤 Připraveno k publikování';
        actions = `
            <button class="btn btn-secondary btn-sm" onclick="openTextEditor(${draft.id});event.stopPropagation()">✏️ Upravit texty</button>
            <button class="btn btn-success btn-sm" onclick="openSaveToAirtable(${draft.id});event.stopPropagation()">📤 Publikovat do Airtable</button>
        `;
    } else if (draft.status === 'saved') {
        statusText = '💾 V Airtable';
        actions = `<button class="btn btn-secondary btn-sm" onclick="openDraftDetail(${draft.id});event.stopPropagation()">👁️ Zobrazit</button>`;
    }
    actions += ` <button class="btn btn-danger btn-sm" onclick="deleteDraft(${draft.id});event.stopPropagation()" title="Smazat trvale">🗑️ Smazat</button>`;

    return `
        <div class="card card-approved" onclick="openDraftDetail(${draft.id})" style="cursor:pointer" title="Klikni pro detail a přiřazení slotu">
            <div class="card-header">
                <span class="card-module ${mc}">${mi} ${draft.modul}</span>
                <span class="card-status" style="font-size:0.75rem;color:var(--gray-500)">${statusText}</span>
            </div>
            <h3 class="card-title">${esc(draft.tema)}</h3>
            <div class="card-meta"><span class="card-meta-item">📅 ${date}</span></div>
            <div class="card-actions" onclick="event.stopPropagation()">${actions}</div>
        </div>
    `;
}

let archivFilter = 'all';

function renderArchivList() {
    const container = document.getElementById('archiv-list');
    const emptyState = document.getElementById('archiv-empty');
    if (!container) return;

    let filtered = drafts.filter(d => d.archiv_status);
    if (archivFilter !== 'all') filtered = filtered.filter(d => d.archiv_status === archivFilter);

    if (filtered.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = filtered.map(d => renderArchivCard(d)).join('');
}

function renderArchivCard(draft) {
    const mc = draft.modul.toLowerCase();
    const mi = draft.modul === 'Chat' ? '💬' : '🛠️';
    const archivLabels = {
        ulozeno_do_airtable: '📤 Uloženo do Airtable',
        proběhlo: '✅ Už proběhlo',
        zamitnuto: '🚫 Zamítnuto',
        nevyužijeme: '❌ Nevyužijeme',
        vyhodnoceno: '📋 Vyhodnoceno'
    };
    const archivLabel = archivLabels[draft.archiv_status] || draft.archiv_status;
    const date = formatDate(draft.navrzeny_termin);

    return `
        <div class="card card-draft" onclick="openDraftDetail(${draft.id})" style="opacity:0.9">
            <div class="card-header">
                <span class="card-module ${mc}">${mi} ${draft.modul}</span>
                <span class="card-status" style="font-size:0.75rem;color:var(--gray-500)">${archivLabel}</span>
            </div>
            <h3 class="card-title">${esc(draft.tema)}</h3>
            <div class="card-meta"><span class="card-meta-item">📅 ${date}</span></div>
            <div class="card-actions" onclick="event.stopPropagation()">
                <button class="btn btn-secondary btn-sm" onclick="openDraftDetail(${draft.id});event.stopPropagation()">👁️ Detail</button>
                <button class="btn btn-outline btn-sm" onclick="moveFromArchiv(${draft.id});event.stopPropagation()" title="Vrátit z archivu">↩️ Vrátit</button>
            </div>
        </div>
    `;
}

function renderSlots() {
    const container = document.getElementById('slots-list');
    container.innerHTML = slots.map(slot => {
        const sc = slot.is_available ? 'available' : (slot.is_blocked ? 'blocked' : 'occupied');
        const st = slot.is_available ? '✅ Volný' : (slot.is_blocked ? '🚫 Blokováno' : '📌 Obsazeno');
        return `
            <div class="slot-card ${sc}">
                <div class="slot-date">${formatShortDate(slot.date_str)}</div>
                <div class="slot-time">${slot.weekday} ${slot.time}</div>
                <span class="slot-module ${slot.module.toLowerCase()}">${slot.module}</span>
                <div style="margin-top:8px;font-size:0.75rem;color:var(--gray-500)">${st}</div>
            </div>
        `;
    }).join('');
}

function renderKatalog(filter = 'all') {
    const container = document.getElementById('katalog-list');
    const emptyState = document.getElementById('katalog-empty');
    if (!container) return;

    let filtered = spKatalog.filter(t => t.modul === 'Chat' || t.modul === 'Build');
    if (filter !== 'all') filtered = filtered.filter(t => t.modul === filter);

    if (filtered.length === 0) {
        container.innerHTML = '';
        emptyState.style.display = 'block';
        emptyState.querySelector('h3').textContent = spKatalog.length === 0 ? 'Katalog se načítá' : 'Žádná témata';
        emptyState.querySelector('p').textContent = spKatalog.length === 0 ? 'Načítám...' : 'Pro zvolený filtr nejsou žádná témata.';
        return;
    }

    emptyState.style.display = 'none';
    container.innerHTML = filtered.map((t, i) => renderKatalogCard(t, i)).join('');
}

function renderKatalogCard(topic, index) {
    const mc = (topic.modul || 'Chat').toLowerCase();
    const mi = topic.modul === 'Build' ? '🛠️' : '💬';
    const supArr = czToEnSuperpowers(topic.superschopnosti);
    const obsah = topic.obsah || [];
    const obsahClean = obsah.filter(o => o && !o.startsWith('**')).slice(0, 3);
    const lektor = topic.navrh_lektora || '';
    const topicId = topic.id || topic.topic_id || '';
    const prefItem = (colleaguePreferences.merged || []).find(m => m.topic_id === topicId);
    const votes = prefItem?.votes || [];

    const votesChci = votes.filter(v => v.preference === 'chci');
    const votesNechci = votes.filter(v => v.preference === 'nechci');

    return `
        <div class="card card-katalog" data-katalog-index="${index}" onclick="if (!event.target.closest('.card-actions')) openKatalogDetail(${index})">
            <div class="card-header">
                <span class="card-module ${mc}">${mi} ${topic.modul}</span>
            </div>
            <h3 class="card-title">${esc(topic.tema)}</h3>
            ${supArr.length ? `<div class="card-superschopnosti"><strong>Superschopnosti:</strong> <span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">${renderSuperpowersWithColors(supArr)}</span></div>` : ''}
            ${obsahClean.length > 0 ? `<ul class="card-obsah">${obsahClean.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}
            <div class="card-meta">
                ${lektor ? `<span class="card-meta-item">🎓 ${esc(lektor)}</span>` : ''}
            </div>
            ${votes.length > 0 ? `
            <div class="card-votes" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--gray-200);font-size:0.85rem">
                <strong style="color:var(--gray-600)">👥 Hlasy:</strong>
                <div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">
                    ${votes.map(v => {
                        const lbl = v.preference === 'chci' ? '✓ Chci' : (v.preference === 'zvažuji' ? '~ Zvažuji' : '✗ Nechci');
                        const cls = v.preference === 'chci' ? 'preference-chci' : (v.preference === 'zvažuji' ? 'preference-zvazuji' : 'preference-nechci');
                        return `<div><strong>${esc(v.person || '')}</strong> <span class="${cls}">${lbl}</span>${v.comment ? ` – ${esc(v.comment)}` : ''}</div>`;
                    }).join('')}
                </div>
            </div>
            ` : ''}
            <div class="card-actions" style="margin-top:12px;display:flex;flex-direction:column;gap:10px;align-items:flex-start">
                <button class="btn btn-primary btn-sm" onclick="useTopicFromSPByIndex(${index});event.stopPropagation()">✓ Schválit</button>
                <div style="display:flex;flex-direction:column;gap:4px">
                    <span style="font-size:0.75rem;color:var(--gray-600);font-weight:600">Hlasovat:</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        <button class="btn btn-success btn-sm btn-vote" data-topic-id="${esc(topicId)}" data-topic-name="${esc(topic.tema)}" data-preference="chci">✓ Chci</button>
                        <button class="btn btn-secondary btn-sm btn-vote" data-topic-id="${esc(topicId)}" data-topic-name="${esc(topic.tema)}" data-preference="nechci">✗ Nechci</button>
                        ${votes.length ? `<span class="preference-counts" style="font-size:0.75rem;color:var(--gray-600);align-self:center">✓${votesChci.length} ✗${votesNechci.length}</span>` : ''}
                        ${votes.length ? `<button type="button" class="btn btn-danger btn-sm" onclick="clearVotes('${esc(topicId)}');event.stopPropagation()" title="Smazat hlasy">🗑️</button>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function useTopicFromSPByIndex(index) {
    const filtered = spKatalog.filter(t => t.modul === 'Chat' || t.modul === 'Build');
    const filter = document.querySelector('.filter-btn[data-katalog-filter].active')?.dataset?.katalogFilter || 'all';
    const filteredList = filter === 'all' ? filtered : filtered.filter(t => t.modul === filter);
    const topic = filteredList[index];
    if (topic) useTopicFromSP(topic);
}

function openKatalogDetail(index) {
    const filtered = spKatalog.filter(t => t.modul === 'Chat' || t.modul === 'Build');
    const filter = document.querySelector('.filter-btn[data-katalog-filter].active')?.dataset?.katalogFilter || 'all';
    const filteredList = filter === 'all' ? filtered : filtered.filter(t => t.modul === filter);
    const topic = filteredList[index];
    if (!topic) return;

    const mc = (topic.modul || 'Chat').toLowerCase();
    const mi = topic.modul === 'Build' ? '🛠️' : '💬';
    const sup = czToEnSuperpowers(topic.superschopnosti);
    const obsah = (topic.obsah || []).filter(o => o && !o.startsWith('**'));

    let html = `
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
            <span class="card-module ${mc}">${mi} ${topic.modul}</span>
        </div>

        <h2 style="margin-bottom:16px;font-size:1.25rem">${esc(topic.tema)}</h2>

        ${topic.problem ? `
        <div class="detail-section" style="margin-bottom:20px;border-left:3px solid var(--accent-chat)">
            <h4>Problém</h4>
            <p>${esc(topic.problem)}</p>
        </div>` : ''}

        ${topic.reseni ? `
        <div class="detail-section" style="margin-bottom:20px;border-left:3px solid var(--accent-build)">
            <h4>Řešení</h4>
            <p>${esc(topic.reseni)}</p>
        </div>` : ''}

        ${sup.length > 0 ? `
        <div class="detail-section" style="margin-bottom:20px;background:var(--gray-50);padding:16px;border-radius:8px">
            <h4>⚡ Superschopnosti, které získáte</h4>
            <p style="font-size:0.8rem;color:var(--gray-600);margin-bottom:8px">(podle metodiky Superpower Professional)</p>
            <ul>${sup.map(s => {
                const col = SUPER_COLORS[s] || '#6B7280';
                return `<li><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${col};margin-right:8px;vertical-align:middle"></span><strong>${esc(s)}</strong></li>`;
            }).join('')}</ul>
        </div>` : ''}

        ${obsah.length > 0 ? `
        <div class="detail-section" style="margin-bottom:20px">
            <h4>Obsah webináře</h4>
            <ul>${obsah.map(o => `<li>${esc(o)}</li>`).join('')}</ul>
        </div>` : ''}

        ${topic.co_si_odnesou ? `
        <div class="detail-section" style="margin-bottom:20px;background:var(--gray-50);padding:16px;border-radius:8px">
            <h4>Co si odnesou</h4>
            <p>${esc(topic.co_si_odnesou)}</p>
        </div>` : ''}

        ${topic.navrh_lektora ? `
        <div class="detail-section" style="margin-bottom:20px">
            <h4>Návrh lektora</h4>
            <p>${esc(topic.navrh_lektora)}</p>
        </div>` : ''}
    `;

    const topicId = topic.id || topic.topic_id || '';
    const prefItem = (colleaguePreferences.merged || []).find(m => m.topic_id === topicId);
    const votes = prefItem?.votes || [];
    if (votes.length > 0) {
        const votesHtml = votes.map(v => {
            const pClass = v.preference === 'chci' ? 'preference-chci' : (v.preference === 'zvažuji' ? 'preference-zvazuji' : 'preference-nechci');
            const pLabel = v.preference === 'chci' ? '✓ Chci' : (v.preference === 'zvažuji' ? '~ Zvažuji' : '✗ Nechci');
            return `<div class="preference-vote-item" style="margin-bottom:8px;padding:8px;background:var(--gray-50);border-radius:6px"><strong>${esc(v.person || '')}</strong> <span class="${pClass}">${pLabel}</span>${v.comment ? `<br><small style="color:var(--gray-600)">${esc(v.comment)}</small>` : ''}</div>`;
        }).join('');
        html += `<div class="detail-section" style="margin-bottom:20px"><h4>👥 Hlasy kolegů</h4>${votesHtml}</div>`;
    }

    document.getElementById('modal-title').textContent = topic.tema;
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">Zavřít</button>
        <div style="display:flex;flex-direction:column;gap:4px">
            <span style="font-size:0.75rem;color:var(--gray-600);font-weight:600">Hlasovat:</span>
            <div style="display:flex;gap:6px">
                <button class="btn btn-success btn-sm btn-vote" data-topic-id="${esc(topicId)}" data-topic-name="${esc(topic.tema)}" data-preference="chci">✓ Chci</button>
                <button class="btn btn-secondary btn-sm btn-vote" data-topic-id="${esc(topicId)}" data-topic-name="${esc(topic.tema)}" data-preference="nechci">✗ Nechci</button>
            </div>
        </div>
        <button class="btn btn-primary" onclick="useTopicFromSPByIndex(${index});closeModal();showToast('Přidáno do Moje návrhy')">✓ Schválit</button>
    `;
    document.getElementById('draft-modal').style.display = 'flex';
}

async function useTopicFromSP(topic) {
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/drafts/from-sp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic })
            });
            const data = await resp.json();
            if (resp.ok) {
                showToast('Draft vytvořen z katalogu SP – přejdi do Návrhů');
                await loadDrafts();
                updateCounts();
                document.querySelector('[data-tab="drafts"]').click();
            } else {
                showToast(data.error || 'Chyba při vytváření draftu');
            }
        } catch (err) {
            showToast('Chyba spojení se serverem');
            console.error(err);
        }
        return;
    }
    const obsahClean = (topic.obsah || []).filter(o => o && typeof o === 'string' && !o.startsWith('**'));
    const sup = (topic.superschopnosti || []).filter(s => s && !s.startsWith('**'));
    const newDraft = {
        id: Date.now(),
        tema: topic.tema,
        modul: topic.modul || 'Chat',
        status: 'draft',
        topic_id: topic.id || topic.topic_id || '',
        usp: sup.join(', '),
        jaky_problem_resi: topic.problem || '',
        co_by_bylo_obsahem: JSON.stringify(obsahClean),
        doporuceny_lektor: topic.navrh_lektora || '?',
        metadata: JSON.stringify({
            sp_metodika: true,
            reseni: topic.reseni || '',
            co_si_odnesou: topic.co_si_odnesou || ''
        }),
        source: 'sp-katalog'
    };
    drafts.push(newDraft);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
        showToast('Draft vytvořen z katalogu SP – přejdi do Návrhů');
        loadDrafts();
        updateCounts();
        document.querySelector('[data-tab="drafts"]').click();
    } catch (e) {
        showToast('Chyba při ukládání');
    }
}

function updateCounts() {
    const notArchived = d => !(d.archiv_status || '');
    document.getElementById('drafts-count').textContent = drafts.filter(d =>
        (d.status === 'draft' || d.status === 'rejected') && notArchived(d)
    ).length;
    document.getElementById('approved-count').textContent = drafts.filter(d =>
        ['approved', 'texts_generated', 'ready_to_publish', 'saved'].includes(d.status) && notArchived(d)
    ).length;
    const archivCount = document.getElementById('archiv-count');
    if (archivCount) archivCount.textContent = drafts.filter(d => d.archiv_status).length;
    renderApprovedList();
    renderArchivList();
}

function getLektoriPreferovani() {
    if (lektori.length && lektori.some(l => l.profese)) return lektori;
    return (window.LEKTORI_PREFEROVANI || []);
}

function parseSelectedLektori(str) {
    if (!str || !String(str).trim()) return [];
    return String(str).split(/\s*\+\s*|,\s*(?![^(]*\))/).map(s => s.replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
}

async function saveDraftSlot(draftId) {
    const input = document.getElementById('draft-slot-datum');
    if (!input) return;
    const val = input.value;
    if (!val) {
        showToast('Vyber datum a čas');
        return;
    }
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    const navrzeny_termin = val.length === 16 ? val + ':00' : val;
    draft.navrzeny_termin = navrzeny_termin;
    if (useApi) {
        try {
            await fetch(`${API_URL}/drafts/${draftId}/update-fields`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ navrzeny_termin })
            });
            showToast('Datum uloženo ✅');
            loadDrafts();
            renderApprovedList();
        } catch { showToast('Chyba při ukládání'); }
    } else {
        persistDrafts();
        showToast('Datum uloženo ✅');
        loadDrafts();
        renderApprovedList();
    }
}

async function moveToArchiv(draftId, archivStatus) {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    draft.archiv_status = archivStatus;
    if (useApi) {
        try {
            await fetch(`${API_URL}/drafts/${draftId}/update-fields`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archiv_status: archivStatus })
            });
            showToast('Přesunuto do archivu');
            loadDrafts();
            updateCounts();
            closeModal();
        } catch { showToast('Chyba při ukládání'); }
    } else {
        persistDrafts();
        showToast('Přesunuto do archivu');
        loadDrafts();
        updateCounts();
        closeModal();
    }
}

async function moveFromArchiv(draftId) {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    draft.archiv_status = null;
    if (useApi) {
        try {
            await fetch(`${API_URL}/drafts/${draftId}/update-fields`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ archiv_status: null })
            });
            showToast('Vráceno z archivu');
            loadDrafts();
            updateCounts();
        } catch { showToast('Chyba při ukládání'); }
    } else {
        persistDrafts();
        showToast('Vráceno z archivu');
        loadDrafts();
        updateCounts();
    }
}

async function updateDraftLektor(draftId, checkboxEl) {
    const cbs = document.querySelectorAll('#draft-lektor-checkboxes input[name="draft-lektor"]:checked');
    const selected = Array.from(cbs).map(cb => cb.value).join(' + ');
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;
    draft.doporuceny_lektor = selected || '?';
    if (useApi) {
        try {
            await fetch(`${API_URL}/drafts/${draftId}/update-fields`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doporuceny_lektor: draft.doporuceny_lektor })
            });
            showToast('Lektor uložen');
        } catch { showToast('Chyba při ukládání'); }
    } else {
        persistDrafts();
        showToast('Lektor uložen');
    }
}

// === Přidat vlastní téma ===
function openAddTopicModal() {
    document.getElementById('add-topic-form').reset();
    const pref = getLektoriPreferovani();
    const container = document.getElementById('add-lektor-checkboxes');
    if (container) {
        container.innerHTML = pref.map(l =>
            `<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.9rem"><input type="checkbox" name="add-lektor" value="${esc(l.jmeno)}"> <span><strong>${esc(l.jmeno)}</strong><br><small style="color:var(--gray-500)">${esc((l.profese || '').substring(0, 60))}${(l.profese || '').length > 60 ? '…' : ''}</small></span></label>`
        ).join('');
    }
    document.getElementById('add-topic-modal').style.display = 'flex';
}

function closeAddTopicModal() {
    document.getElementById('add-topic-modal').style.display = 'none';
}

async function submitAddTopic() {
    const tema = (document.getElementById('add-tema')?.value || '').trim();
    const modul = document.getElementById('add-modul')?.value || 'Chat';
    if (!tema) {
        showToast('Zadejte název tématu');
        document.getElementById('add-tema').focus();
        return;
    }
    const problem = (document.getElementById('add-problem')?.value || '').trim();
    const usp = (document.getElementById('add-usp')?.value || '').trim();
    const reseni = (document.getElementById('add-reseni')?.value || '').trim();
    const obsahRaw = (document.getElementById('add-obsah')?.value || '').trim();
    const obsah = obsahRaw ? obsahRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
    const co_si_odnesou = (document.getElementById('add-odnesou')?.value || '').trim();
    const lektorCbs = document.querySelectorAll('#add-lektor-checkboxes input[name="add-lektor"]:checked');
    const doporuceny_lektor = lektorCbs.length ? Array.from(lektorCbs).map(cb => cb.value).join(' + ') : '?';

    const payload = {
        tema,
        modul,
        jaky_problem_resi: problem || undefined,
        usp: usp || undefined,
        reseni: reseni || undefined,
        co_by_bylo_obsahem: obsah.length ? obsah : undefined,
        co_si_odnesou: co_si_odnesou || undefined,
        doporuceny_lektor: doporuceny_lektor !== '?' ? doporuceny_lektor : undefined
    };

    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/drafts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await resp.json();
            if (resp.ok) {
                showToast('Návrh přidán ✅');
                closeAddTopicModal();
                await loadDrafts();
                await loadColleaguePreferences();
                updateCounts();
                document.querySelector('[data-tab="drafts"]')?.click();
            } else {
                showToast(data.error || 'Chyba při vytváření');
            }
        } catch (err) {
            showToast('Chyba spojení se serverem');
            console.error(err);
        }
        return;
    }

    const draftId = Date.now();
    const newDraft = {
        id: draftId,
        tema,
        modul,
        status: 'draft',
        topic_id: `draft-${draftId}`,
        theme_id: `draft-${draftId}`,
        usp: usp || '',
        jaky_problem_resi: problem || '',
        co_by_bylo_obsahem: JSON.stringify(obsah),
        doporuceny_lektor: doporuceny_lektor,
        metadata: JSON.stringify({ reseni: reseni || '', co_si_odnesou: co_si_odnesou || '' }),
        source: 'custom'
    };
    drafts.push(newDraft);
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
        showToast('Návrh přidán ✅');
        closeAddTopicModal();
        loadDrafts();
        loadColleaguePreferences();
        updateCounts();
        document.querySelector('[data-tab="drafts"]')?.click();
    } catch (e) {
        showToast('Chyba při ukládání');
    }
}

// === Actions ===
async function approveDraft(id) {
    if (!confirm('Schválit tento návrh?')) return;
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/drafts/${id}/approve`, { method: 'POST' });
            const data = await resp.json();
            if (resp.ok) {
                showToast('Návrh schválen ✅');
                loadDrafts();
            } else {
                showToast(data.error || 'Chyba');
            }
        } catch { showToast('Chyba spojení'); }
        return;
    }
    const d = drafts.find(x => x.id === id);
    if (d) {
        d.status = 'approved';
        localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
        showToast('Návrh schválen ✅');
        loadDrafts();
    }
}

async function rejectDraft(id) {
    if (useApi) {
        try {
            await fetch(`${API_URL}/drafts/${id}/reject`, { method: 'POST' });
            showToast('Návrh zamítnut');
            loadDrafts();
        } catch { showToast('Chyba'); }
        return;
    }
    const d = drafts.find(x => x.id === id);
    if (d) {
        d.status = 'rejected';
        d.archiv_status = 'zamitnuto';
        persistDrafts();
        showToast('Návrh zamítnut');
        loadDrafts();
    }
}

async function deleteDraft(id) {
    const draft = drafts.find(d => d.id === id);
    const tema = draft ? draft.tema : 'Návrh';
    if (!confirm(`Opravdu smazat návrh „${tema}“? Tato akce je nevratná.`)) return;
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/drafts/${id}`, { method: 'DELETE' });
            if (resp.ok) {
                showToast('Návrh smazán');
                closeModal();
                loadDrafts();
            } else {
                const data = await resp.json();
                showToast(data.error || 'Chyba při mazání');
            }
        } catch { showToast('Chyba spojení'); }
        return;
    }
    drafts = drafts.filter(x => x.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    showToast('Návrh smazán');
    closeModal();
    loadDrafts();
}

async function generateTexts(id) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;

    if (useApi) {
        showToast('Generuji texty...');
        try {
            const resp = await fetch(`${API_URL}/drafts/${id}/generate-texts`, { method: 'POST' });
            if (resp.ok) {
                showToast('Texty vygenerovány ✅');
                await loadDrafts();
                openTextEditor(id);
            } else {
                const data = await resp.json();
                showToast(data.error || 'Chyba');
            }
        } catch { showToast('Chyba spojení'); }
        return;
    }

    // Standalone: generování v prohlížeči (bez API)
    if (typeof TextGenerator === 'undefined') {
        showToast('Chyba: text_generator.js není načten');
        return;
    }
    showToast('Generuji texty...');
    try {
        const texts = TextGenerator.generateTexts(draft);
        draft.texts = texts;
        if (texts.usp) draft.usp = texts.usp;
        draft.status = 'texts_generated';
        persistDrafts();
        showToast('Texty vygenerovány ✅');
        await loadDrafts();
        openTextEditor(id);
    } catch (e) {
        console.error(e);
        showToast('Chyba při generování');
    }
}

// === Detail Modal ===
async function openDraftDetail(id) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    currentDraftId = id;
    await loadColleaguePreferences();

    document.getElementById('modal-title').textContent = draft.tema;

    let obsah = [];
    try { obsah = JSON.parse(draft.co_by_bylo_obsahem || '[]'); } catch { obsah = []; }
    const obsahClean = (Array.isArray(obsah) ? obsah : []).filter(o => o && typeof o === 'string' && !o.startsWith('**'));
    let metadata = {};
    try { metadata = JSON.parse(draft.metadata || '{}'); } catch { }
    const reseni = metadata.reseni || '';
    const co_si_odnesou = metadata.co_si_odnesou || '';
    const problem = draft.jaky_problem_resi || '';
    const sup = czToEnSuperpowers(draft.usp || draft.superschopnosti);

    const mc = draft.modul.toLowerCase();
    const mi = draft.modul === 'Chat' ? '💬' : '🛠️';

    const emptyHint = '<em style="color:var(--gray-500);font-size:0.9rem">Zatím nevyplněno – doplňte před schválením</em>';

    let html = `
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:20px;flex-wrap:wrap">
            <span class="card-module ${mc}">${mi} ${draft.modul}</span>
        </div>

        <h2 style="margin-bottom:20px;font-size:1.25rem">${esc(draft.tema)}</h2>

        <div class="detail-section" style="margin-bottom:20px;border-left:3px solid var(--accent-chat)">
            <h4>O čem má webinář být</h4>
            <p>${problem ? esc(problem) : emptyHint}</p>
        </div>

        <div class="detail-section" style="margin-bottom:20px;border-left:3px solid var(--accent-build)">
            <h4>Proč právě tento webinář</h4>
            <p>${(draft.usp || '').trim() ? esc(draft.usp) : emptyHint}</p>
        </div>

        <div class="detail-section" style="margin-bottom:20px">
            <h4>Řešení / co webinář nabízí</h4>
            <p>${reseni ? esc(reseni) : emptyHint}</p>
        </div>

        <div class="detail-section" style="margin-bottom:20px">
            <h4>Struktura a obsah</h4>
            ${obsahClean.length > 0 ? `<ul>${obsahClean.map(o => `<li>${esc(o)}</li>`).join('')}</ul>` : `<p>${emptyHint}</p>`}
        </div>

        <div class="detail-section" style="margin-bottom:20px;background:var(--gray-50);padding:16px;border-radius:8px">
            <h4>Co se lidé mají dozvědět</h4>
            <p>${co_si_odnesou ? esc(co_si_odnesou) : emptyHint}</p>
        </div>

        ${sup.length > 0 ? `
        <div class="detail-section" style="margin-bottom:20px;background:var(--gray-50);padding:16px;border-radius:8px">
            <h4>⚡ Superschopnosti</h4>
            <p style="font-size:0.8rem;color:var(--gray-600);margin-bottom:8px">(podle metodiky Superpower Professional)</p>
            <ul>${sup.map(s => {
                const col = SUPER_COLORS[s] || '#6B7280';
                return `<li><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${col};margin-right:8px;vertical-align:middle"></span><strong>${esc(s)}</strong></li>`;
            }).join('')}</ul>
        </div>` : ''}

        <div class="detail-section" style="margin-bottom:20px;background:var(--gray-50);padding:16px;border-radius:8px">
            <h4>🎓 Vyber lektora</h4>
            <p style="font-size:0.85rem;color:var(--gray-600);margin-bottom:12px">Zaklikni lektory – při generování textů se doplní medailonek.</p>
            <div id="draft-lektor-checkboxes" style="display:flex;flex-direction:column;gap:8px">
                ${getLektoriPreferovani().map(l => {
                    const sel = parseSelectedLektori(draft.doporuceny_lektor);
                    const checked = sel.includes(l.jmeno) ? 'checked' : '';
                    return `<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:0.9rem"><input type="checkbox" name="draft-lektor" value="${esc(l.jmeno)}" ${checked} onchange="updateDraftLektor(${id}, this)"> <span><strong>${esc(l.jmeno)}</strong><br><small style="color:var(--gray-500)">${esc((l.profese || '').substring(0, 80))}${(l.profese || '').length > 80 ? '…' : ''}</small></span></label>`;
                }).join('')}
            </div>
        </div>

        ${renderDraftVotesSection(draft)}

        ${['approved', 'texts_generated', 'ready_to_publish', 'saved'].includes(draft.status) ? `
        <div class="detail-section" style="margin-bottom:20px;background:var(--accent-build-light);padding:16px;border-radius:8px;border-left:4px solid var(--accent-build)">
            <h4>📅 Přiřadit slot (datum a čas)</h4>
            <p style="font-size:0.85rem;color:var(--gray-600);margin-bottom:12px">Nastav datum webináře před uložením do Airtable. Úterky 11:00 – střídání Chat/Build.</p>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                <input type="datetime-local" id="draft-slot-datum" value="${(draft.navrzeny_termin || '').substring(0, 16)}" style="padding:8px 12px;border:1px solid var(--gray-300);border-radius:8px;font-size:0.9rem">
                <button type="button" class="btn btn-primary btn-sm" onclick="saveDraftSlot(${id})">💾 Uložit datum</button>
            </div>
            ${slots.length ? `
            <div style="margin-top:12px">
                <small style="color:var(--gray-500);font-size:0.75rem">Rychlý výběr volných slotů:</small>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                    ${slots.filter(s => s.is_available && s.module === draft.modul).slice(0, 6).map(s => {
                        const val = s.date_str ? `${s.date_str.substring(0, 10)}T11:00` : '';
                        const label = esc(formatShortDate(s.date_str) + ' ' + (s.module || ''));
                        return `<button type="button" class="btn btn-secondary btn-sm" onclick="var i=document.getElementById('draft-slot-datum');if(i)i.value='${val}';showToast('Vybráno')" style="font-size:0.8rem">${label}</button>`;
                    }).join('')}
                </div>
            </div>` : ''}
        </div>` : ''}
    `;

    document.getElementById('modal-body').innerHTML = html;

    const archivBtns = draft.archiv_status
        ? `<button class="btn btn-outline btn-sm" onclick="moveFromArchiv(${id});closeModal()" title="Vrátit z archivu">↩️ Vrátit z archivu</button>`
        : `
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <small style="color:var(--gray-500)">Přesunout do archivu:</small>
            <button class="btn btn-outline btn-sm" onclick="moveToArchiv(${id}, 'proběhlo')" title="Webinář už proběhl">✅ Už proběhlo</button>
            <button class="btn btn-outline btn-sm" onclick="moveToArchiv(${id}, 'zamitnuto')" title="Zamítnuto">🚫 Zamítnuto</button>
            <button class="btn btn-outline btn-sm" onclick="moveToArchiv(${id}, 'nevyužijeme')" title="Nevyužijeme">❌ Nevyužijeme</button>
        </span>
    `;
    const footer = document.getElementById('modal-footer');
    if (draft.status === 'draft' || draft.status === 'rejected') {
        footer.innerHTML = `
            <button class="btn btn-secondary" onclick="closeModal()">Zavřít</button>
            <button class="btn btn-danger btn-sm" onclick="deleteDraft(${id})" title="Smazat trvale">🗑️ Smazat</button>
            <button class="btn btn-warning btn-sm" onclick="rejectDraft(${id});closeModal()">❌ Zamítnout</button>
            <button class="btn btn-success" onclick="approveDraft(${id});closeModal()">✅ Schválit návrh</button>
            ${archivBtns}
        `;
    } else {
        let extraBtns = '';
        if (draft.status === 'approved') {
            extraBtns = `<button class="btn btn-primary" onclick="generateTexts(${id});closeModal()">✨ Generovat texty</button>`;
        } else if (draft.status === 'texts_generated' || draft.status === 'ready_to_publish') {
            extraBtns = `
                <button class="btn btn-secondary" onclick="openTextEditor(${id})">✏️ Upravit texty</button>
                <button class="btn btn-success" onclick="openSaveToAirtable(${id})">📤 Uložit do Airtable</button>
            `;
        }
        footer.innerHTML = `
            <button class="btn btn-secondary" onclick="closeModal()">Zavřít</button>
            <button class="btn btn-danger btn-sm" onclick="deleteDraft(${id})" title="Smazat trvale">🗑️ Smazat</button>
            ${extraBtns}
            ${archivBtns}
        `;
    }

    document.getElementById('draft-modal').style.display = 'flex';
}

// === Text Editor Modal ===
async function openTextEditor(id) {
    await loadColleaguePreferences();
    const draft = drafts.find(d => d.id === id);
    if (!draft || !draft.texts) {
        showToast('Nejsou texty k úpravě');
        return;
    }
    currentDraftId = id;

    document.getElementById('modal-title').textContent = `Úprava textů: ${draft.tema}`;

    const body = document.getElementById('modal-body');
    body.innerHTML = `
        ${renderDraftVotesSection(draft)}
        <div class="text-section">
            <h3>USP</h3>
            <textarea id="edit-usp" rows="3">${esc(draft.usp || '')}</textarea>
        </div>
        <div class="text-section">
            <h3>Veřejný popis</h3>
            <textarea id="edit-verejny-popis" rows="12">${esc(draft.texts.verejny_popis || '')}</textarea>
        </div>
        <div class="text-section">
            <h3>Text pro confirmation mail</h3>
            <textarea id="edit-confirmation-mail" rows="6">${esc(draft.texts.confirmation_mail || '')}</textarea>
        </div>
        <div class="text-section">
            <h3>Co se naučíte (HTML)</h3>
            <textarea id="edit-co-se-naucite" rows="8">${esc(draft.texts.co_se_naucite_html || '')}</textarea>
        </div>
    `;

    document.getElementById('modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">Zrušit</button>
        <button class="btn btn-primary" onclick="saveEditedTexts()">💾 Uložit a označit jako připraveno</button>
        <button class="btn btn-success" onclick="saveAndOpenPublish(${id})">📤 Publikovat do Airtable</button>
    `;

    document.getElementById('draft-modal').style.display = 'flex';
}

async function saveAndOpenPublish(id) {
    await saveEditedTexts();
    closeModal();
    openSaveToAirtable(id);
}

async function saveEditedTexts() {
    const usp = document.getElementById('edit-usp')?.value || '';
    const verejny_popis = document.getElementById('edit-verejny-popis').value;
    const confirmation_mail = document.getElementById('edit-confirmation-mail').value;
    const co_se_naucite_html = document.getElementById('edit-co-se-naucite').value;

    const draft = drafts.find(d => d.id === currentDraftId);
    if (!draft) return;

    if (useApi) {
        try {
            const [r1, r2] = await Promise.all([
                fetch(`${API_URL}/drafts/${currentDraftId}/update-texts`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ verejny_popis, confirmation_mail, co_se_naucite_html })
                }),
                fetch(`${API_URL}/drafts/${currentDraftId}/update-fields`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usp, status: 'ready_to_publish' })
                })
            ]);
            if (r1.ok) { showToast('Texty uloženy – připraveno k publikování ✅'); loadDrafts(); }
        } catch { showToast('Chyba při ukládání'); }
        return;
    }

    draft.usp = usp;
    draft.texts = { verejny_popis, confirmation_mail, co_se_naucite_html };
    draft.status = 'ready_to_publish';
    persistDrafts();
    showToast('Texty uloženy – připraveno k publikování ✅');
    loadDrafts();
}

// === Save to Airtable Modal ===
function openSaveToAirtable(id) {
    const draft = drafts.find(d => d.id === id);
    if (!draft) return;
    currentDraftId = id;

    document.getElementById('modal-title').textContent = `Publikovat do Airtable: ${draft.tema}`;

    const lektorOptions = lektori.map(l =>
        `<option value="${esc(l.jmeno)}" ${l.jmeno === draft.doporuceny_lektor ? 'selected' : ''}>${esc(l.jmeno)}${(l.pocet_eventu ?? 0) > 0 ? ' (' + l.pocet_eventu + ' eventů)' : ''}</option>`
    ).join('');

    const body = document.getElementById('modal-body');
    body.innerHTML = `
        <p style="margin-bottom:20px;color:var(--gray-600)">Zkontroluj a uprav údaje před zápisem do Airtable tabulky Eventy (AI Edu Stream).</p>
        <div class="field-row">
            <div class="field-group">
                <label>Datum a čas</label>
                <input type="datetime-local" id="at-datum" value="${draft.navrzeny_termin ? draft.navrzeny_termin.substring(0, 16) : ''}">
            </div>
            <div class="field-group">
                <label>Lektor</label>
                <select id="at-lektor">
                    <option value="">-- Vyber lektora --</option>
                    ${lektorOptions}
                </select>
            </div>
        </div>
        <div class="field-row">
            <div class="field-group">
                <label>Úroveň</label>
                <small style="display:block;color:var(--gray-500);font-size:0.75rem">Technická hloubka AI (Level 1–5)</small>
                <select id="at-uroven">
                    <option value="">-- Vyber úroveň --</option>
                    <option value="Úroveň 1 – Manuální používání AI" ${(draft.ai_level || '').includes('Úroveň 1') ? 'selected' : ''}>Úroveň 1 – Manuální používání AI</option>
                    <option value="Úroveň 2 – Vytváření AI asistentů" ${(draft.ai_level || '').includes('Úroveň 2') ? 'selected' : ''}>Úroveň 2 – Vytváření AI asistentů</option>
                    <option value="Úroveň 3 – AI-poháněné skriptování a vibe coding" ${(draft.ai_level || '').includes('Úroveň 3') ? 'selected' : ''}>Úroveň 3 – AI-poháněné skriptování a vibe coding</option>
                    <option value="Úroveň 4 – Automatizace procesů s AI" ${(draft.ai_level || '').includes('Úroveň 4') ? 'selected' : ''}>Úroveň 4 – Automatizace procesů s AI</option>
                    <option value="Úroveň 5 – AI agenti a agentské pracovní postupy" ${(draft.ai_level || '').includes('Úroveň 5') ? 'selected' : ''}>Úroveň 5 – AI agenti a agentské pracovní postupy</option>
                    <option value="Úroveň 1-5" ${(draft.ai_level || '').includes('1-5') ? 'selected' : ''}>Úroveň 1-5</option>
                </select>
            </div>
            <div class="field-group">
                <label>Doporučujeme pro</label>
                <small style="display:block;color:var(--gray-500);font-size:0.75rem">Pro koho je webinář (začátečníky, pokročilé…)</small>
                <select id="at-doporucujeme">
                    <option value="">-- Vyber --</option>
                    <option value="Začátečníky" ${(draft.doporucujeme_pro || '').includes('Začátečníky') ? 'selected' : ''}>Začátečníky</option>
                    <option value="Mírně pokročilé" ${(draft.doporucujeme_pro || '').includes('Mírně pokročilé') ? 'selected' : ''}>Mírně pokročilé</option>
                    <option value="Středně pokročilé" ${(draft.doporucujeme_pro || '').includes('Středně pokročilé') ? 'selected' : ''}>Středně pokročilé</option>
                    <option value="Pokročilé" ${(draft.doporucujeme_pro || '').includes('Pokročilé') ? 'selected' : ''}>Pokročilé</option>
                    <option value="Super pokročilé" ${(draft.doporucujeme_pro || '').includes('Super pokročilé') ? 'selected' : ''}>Super pokročilé</option>
                </select>
            </div>
        </div>
        <div class="field-row">
            <div class="field-group" style="grid-column: 1 / -1">
                <label>Super schopnost</label>
                <div id="at-super-schopnost" style="display:flex;flex-direction:column;gap:6px;padding:12px;border:1px solid var(--gray-300);border-radius:8px;background:var(--gray-50)">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem"><input type="checkbox" name="sp" value="Super Perception" style="margin:0" ${(draft.super_schopnost || czToEnSuperpowers(draft.usp).join(', ')).includes('Super Perception') ? 'checked' : ''}> <span style="width:12px;height:12px;border-radius:3px;background:#3B82F6;flex-shrink:0"></span> Super Perception</label>
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem"><input type="checkbox" name="sp" value="Super Intelligence" style="margin:0" ${(draft.super_schopnost || czToEnSuperpowers(draft.usp).join(', ')).includes('Super Intelligence') ? 'checked' : ''}> <span style="width:12px;height:12px;border-radius:3px;background:#8B5CF6;flex-shrink:0"></span> Super Intelligence</label>
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem"><input type="checkbox" name="sp" value="Super Knowledge" style="margin:0" ${(draft.super_schopnost || czToEnSuperpowers(draft.usp).join(', ')).includes('Super Knowledge') ? 'checked' : ''}> <span style="width:12px;height:12px;border-radius:3px;background:#F59E0B;flex-shrink:0"></span> Super Knowledge</label>
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem"><input type="checkbox" name="sp" value="Super Creation" style="margin:0" ${(draft.super_schopnost || czToEnSuperpowers(draft.usp).join(', ')).includes('Super Creation') ? 'checked' : ''}> <span style="width:12px;height:12px;border-radius:3px;background:#F43F5E;flex-shrink:0"></span> Super Creation</label>
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem"><input type="checkbox" name="sp" value="Super Integration" style="margin:0" ${(draft.super_schopnost || czToEnSuperpowers(draft.usp).join(', ')).includes('Super Integration') ? 'checked' : ''}> <span style="width:12px;height:12px;border-radius:3px;background:#10B981;flex-shrink:0"></span> Super Integration</label>
                </div>
                <small style="color:var(--gray-500);font-size:0.75rem">Barvy z metodiky SP. Sloupec v Airtable přidáš postupně.</small>
            </div>
        </div>
        <div class="field-row" style="grid-template-columns: 1fr">
            <div class="field-group">
                <label>Poznámka (volitelně)</label>
                <textarea id="at-poznamka" rows="2" style="padding:8px 16px;border:1px solid var(--gray-300);border-radius:8px;font-family:inherit;font-size:0.875rem">${esc(draft['poznámka'] || '')}</textarea>
            </div>
        </div>

        <div style="background:var(--gray-50);border-radius:12px;padding:16px;margin-top:16px">
            <h4 style="font-size:0.8rem;color:var(--gray-500);margin-bottom:8px">CO SE ZAPÍŠE DO AIRTABLE (AI Edu Stream → Eventy)</h4>
            <ul style="font-size:0.85rem;color:var(--gray-700);padding-left:20px">
                <li><strong>Název:</strong> ${esc(draft.tema)}</li>
                <li><strong>Status:</strong> Návrh</li>
                <li><strong>USP:</strong> ${esc((draft.usp || '').substring(0, 60))}...</li>
                <li><strong>Veřejný popis:</strong> ✅</li>
                <li><strong>Confirmation mail:</strong> ✅</li>
                <li><strong>Co se naučíte:</strong> ✅</li>
                <li><strong>+ Datum, Lektor, Úroveň, Doporučujeme pro, Super schopnost, Poznámka</strong></li>
            </ul>
        </div>
    `;

    document.getElementById('modal-footer').innerHTML = `
        <button class="btn btn-secondary" onclick="closeModal()">Zrušit</button>
        <button class="btn btn-success" onclick="confirmSaveToAirtable()">📤 Publikovat do Airtable</button>
    `;

    document.getElementById('draft-modal').style.display = 'flex';
}

async function confirmSaveToAirtable() {
    if (!useApi) {
        showToast('Pro uložení do Airtable spusť Otevrit_dashboard.bat nebo přidej server do autostartu (Pridat_do_autostartu.bat)');
        return;
    }
    const datum = document.getElementById('at-datum').value;
    const lektor = document.getElementById('at-lektor').value;
    const uroven = document.getElementById('at-uroven').value;
    const doporucujeme_pro = document.getElementById('at-doporucujeme').value;
    const poznamka = document.getElementById('at-poznamka').value;
    const superSchopnostCbs = document.querySelectorAll('#at-super-schopnost input[name="sp"]:checked');
    const super_schopnost = Array.from(superSchopnostCbs).map(cb => cb.value).join(', ');

    try {
        const resp = await fetch(`${API_URL}/drafts/${currentDraftId}/save-to-airtable`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ datum_a_cas: datum, lektor, uroven, doporucujeme_pro, super_schopnost, poznamka })
        });
        const data = await resp.json();

        if (resp.ok) {
            showToast('Event vytvořen v Airtable! 💾');
            closeModal();
            loadDrafts();
        } else {
            showToast(data.error || 'Chyba při ukládání');
        }
    } catch { showToast('Chyba spojení se serverem'); }
}

// === Modal helpers ===
function closeModal() {
    document.getElementById('draft-modal').style.display = 'none';
    currentDraftId = null;
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
});

// === Helpers ===
function formatDate(isoString) {
    if (!isoString) return '(bez termínu)';
    try {
        return new Date(isoString).toLocaleDateString('cs-CZ', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch { return isoString; }
}

function formatShortDate(dateStr) {
    if (!dateStr) return '';
    try {
        const [y, m, d] = dateStr.split('-');
        return `${parseInt(d)}. ${parseInt(m)}.`;
    } catch { return dateStr; }
}

function esc(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/** Mapování českých superschopností na 5 anglických Superpowers (metodika SP) */
const CZ_TO_EN_SUPERPOWERS = [
    [/vidět příležitosti/i, 'Super Perception'],
    [/rozumná důvěra|kdy AI věřit|kdy ověřit/i, 'Super Intelligence'],
    [/umění promptů/i, 'Super Intelligence'],
    [/ukládání a znovupoužití znalostí/i, 'Super Knowledge'],
    [/rychlé tvoření|AI dělá 90|ty 10 %/i, 'Super Creation'],
    [/propojování nástrojů a systémů/i, 'Super Integration']
];
function czToEnSuperpowers(input) {
    if (!input) return [];
    const arr = Array.isArray(input) ? input : String(input).split(/,\s*/).map(s => s.trim()).filter(Boolean);
    const seen = new Set();
    const out = [];
    for (const s of arr) {
        if (!s || s.startsWith('**')) continue;
        for (const [re, en] of CZ_TO_EN_SUPERPOWERS) {
            if (re.test(s)) {
                if (!seen.has(en)) { seen.add(en); out.push(en); }
                break;
            }
        }
    }
    return out;
}

const SUPER_COLORS = { 'Super Perception': '#3B82F6', 'Super Intelligence': '#8B5CF6', 'Super Knowledge': '#F59E0B', 'Super Creation': '#F43F5E', 'Super Integration': '#10B981' };
function renderSuperpowersWithColors(supArr) {
    const arr = Array.isArray(supArr) ? supArr : czToEnSuperpowers(supArr);
    if (!arr.length) return '';
    return arr.map(s => {
        const col = SUPER_COLORS[s] || '#6B7280';
        return `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:8px;margin-bottom:4px;padding:2px 8px;border-radius:6px;background:${col}22;font-size:0.8rem"><span style="width:8px;height:8px;border-radius:2px;background:${col}"></span>${esc(s)}</span>`;
    }).join('');
}

/** Najde vysvětlení superschopnosti ze Slovníčku (metodika SP) */
/** Vrátí HTML sekci s hlasy kolegů pro draft (když má topic_id a existují hlasy). */
function renderDraftVotesSection(draft) {
    const topicId = draft.topic_id || draft.theme_id || '';
    if (!topicId) return '';
    const item = (colleaguePreferences.merged || []).find(m => m.topic_id === topicId);
    const votes = (item && item.votes) || [];
    if (votes.length === 0) return '';
    const items = votes.map(v => {
        const pref = v.preference === 'chci' ? '✓ Chci' : v.preference === 'zvažuji' ? '~ Zvažuji' : '✗ Nechci';
        const cls = v.preference === 'chci' ? 'preference-chci' : v.preference === 'zvažuji' ? 'preference-zvazuji' : 'preference-nechci';
        return `<div class="preference-vote ${cls}" style="margin-bottom:8px;padding:8px 12px;border-radius:8px;background:var(--gray-50)">
            <strong>${esc(v.person || 'Kolega')}</strong> – ${pref}
            ${v.comment ? `<div style="margin-top:4px;font-size:0.85rem;color:var(--gray-600)">${esc(v.comment)}</div>` : ''}
        </div>`;
    }).join('');
    return `
        <div class="detail-section" style="margin-bottom:20px;background:var(--accent-chat-light);padding:16px;border-radius:8px;border-left:4px solid var(--accent-chat)">
            <h4>👥 Hlasy kolegů</h4>
            <p style="font-size:0.85rem;color:var(--gray-600);margin-bottom:12px">Zpětná vazba od kolegů k tomuto tématu – propsáno z Hlasování.</p>
            <div>${items}</div>
        </div>
    `;
}

function getSlovnickeDesc(superschopnost) {
    if (!superschopnost) return null;
    const slovnicek = window.SLOVNICEK_SUPERSCHOPNOSTI || {};
    const key = superschopnost.split('(')[0].trim();
    if (slovnicek[key]) return slovnicek[key];
    for (const [k, v] of Object.entries(slovnicek)) {
        if (key.includes(k) || k.includes(key)) return v;
    }
    return null;
}

function persistDrafts() {
    if (!useApi) localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}

/** Smaže všechny hlasy u daného tématu. */
async function clearVotes(topicId) {
    if (!confirm('Opravdu smazat všechny hlasy u tohoto tématu? Tato akce je nevratná.')) return;
    if (!useApi) {
        showToast('Pro mazání hlasů spusť API server (Spustit_dashboard.bat)');
        return;
    }
    try {
        const resp = await fetch(`${API_URL}/votes/${encodeURIComponent(topicId)}/clear`, { method: 'DELETE' });
        if (resp.ok) {
            showToast('Hlasy smazány');
            loadColleaguePreferences();
        } else {
            const d = await resp.json();
            showToast(d.error || 'Chyba při mazání');
        }
    } catch (e) {
        showToast('Chyba spojení – spusť API server');
    }
}

/** Smaže všechny hlasy u všech témat. Standalone: localStorage. S API: volá endpoint. */
async function clearAllVotes() {
    if (!confirm('Opravdu smazat všechny hlasy u všech témat? Tato akce je nevratná.')) return;
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/votes/clear-all`, { method: 'DELETE' });
            if (resp.ok) {
                showToast('Všechny hlasy smazány');
                loadColleaguePreferences();
            } else {
                const d = await resp.json();
                showToast(d.error || 'Chyba při mazání');
            }
        } catch (e) {
            showToast('Chyba spojení – spusť API server (Spustit_dashboard.bat)');
        }
        return;
    }
    localStorage.removeItem(VOTES_STORAGE_KEY);
    showToast('Všechny hlasy smazány (v tomto prohlížeči)');
    loadColleaguePreferences();
}

/** Uloží hlas – přes API, JSONBin nebo do localStorage. Person a comment z modalu. */
async function submitVote(topicId, preference, person, comment) {
    const p = (person || '').trim() || 'Kolega';
    const c = (comment || '').trim() || '';
    if (useApi) {
        try {
            const resp = await fetch(`${API_URL}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ topic_id: topicId, preference, person: p, comment: c })
            });
            if (resp.ok) {
                showToast(`Hlas uložen: ${preference === 'chci' ? '✓ Chci' : preference === 'zvažuji' ? '~ Zvažuji' : '✗ Nechci'}`);
                loadColleaguePreferences();
            } else {
                const d = await resp.json();
                showToast(d.error || 'Chyba');
            }
        } catch (e) {
            showToast('Chyba spojení – spusť API server (Spustit_dashboard.bat)');
        }
        return;
    }
    if (getJsonBinConfig()) {
        try {
            const data = await fetchJsonBin();
            const prefs = ensureAllTopics(data.preferences || []);
            const topic = prefs.find(t => t.topic_id === topicId);
            if (topic) {
                topic.votes = topic.votes || [];
                topic.votes.push({ person: p, preference, comment: c });
                await updateJsonBin({ last_updated: new Date().toISOString().slice(0, 10), preferences: prefs });
                showToast(`Hlas uložen: ${preference === 'chci' ? '✓ Chci' : preference === 'zvažuji' ? '~ Zvažuji' : '✗ Nechci'}`);
                loadColleaguePreferences();
            } else {
                showToast('Téma nenalezeno');
            }
        } catch (e) {
            console.error(e);
            showToast('Chyba ukládání do JSONBin – zkontroluj config.js');
        }
        return;
    }
    let votes = {};
    try {
        votes = JSON.parse(localStorage.getItem(VOTES_STORAGE_KEY) || '{}');
    } catch {}
    if (!votes[topicId]) votes[topicId] = [];
    votes[topicId].push({ person: p, preference, comment: c });
    localStorage.setItem(VOTES_STORAGE_KEY, JSON.stringify(votes));
    showToast('Hlas uložen (v tomto prohlížeči). Pro sdílení nastav JSONBin v config.js.');
    loadColleaguePreferences();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toast-message').textContent = message;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3500);
}
