// ─── CONFIG ────────────────────────────────────────────────────────────────
const API_URL = window.location.hostname === "localhost" ? "http://localhost:7860/api" : "https://ismizo-cvbora.hf.space/api";

const token = localStorage.getItem('cv_token');
if (!token) window.location.href = 'index.html';

// ─── STATE ──────────────────────────────────────────────────────────────────
let currentTab = 'upload';
let generatedData = null;       // { personal_info, cv_html, cover_letter_html }
let currentPreview = 'cv';
let builderMessages = [];       // [{role, content}]
let builderDone = false;
let resumeText_fromBuilder = '';

// Job desc images tracked separately (FileList can't be mutated)
let jobDescFiles = [];

// ─── TOAST ──────────────────────────────────────────────────────────────────
function toast(message, type = 'info', duration = 4000) {
    const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
    container.appendChild(el);
    setTimeout(() => {
        el.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => el.remove(), 300);
    }, duration);
}

// ─── PROFILE ────────────────────────────────────────────────────────────────
async function loadProfile() {
    try {
        const res = await fetch(`${API_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 401) { logout(); return; }
        const user = await res.json();

        const freeLeft = Math.max(0, 3 - user.freeGenerationsUsed);
        const paid = user.paidCredits;
        document.getElementById('creditsDisplay').innerHTML =
            `<i class="fas fa-bolt"></i> Free: ${freeLeft} &nbsp;|&nbsp; Credits: ${paid}`;

        const used = user.storageUsedBytes || 0;
        const quota = user.storageQuotaBytes || (45 * 1024 * 1024);
        document.getElementById('storageText').textContent = `${formatBytes(used)} / ${formatBytes(quota)}`;
    } catch (err) {
        console.error("Auth Error", err);
    }
}

// ─── MOBILE PANEL SWITCHER ────────────────────────────────────────────────────
function switchMobilePanel(panel) {
    const left  = document.getElementById('panelLeft');
    const right = document.getElementById('panelRight');
    const tabIn = document.getElementById('mobileTabInput');
    const tabPr = document.getElementById('mobileTabPreview');

    if (panel === 'input') {
        left.classList.remove('mobile-hidden');
        right.classList.add('mobile-hidden');
        tabIn.classList.add('active');
        tabPr.classList.remove('active');
    } else {
        left.classList.add('mobile-hidden');
        right.classList.remove('mobile-hidden');
        tabIn.classList.remove('active');
        tabPr.classList.add('active');
    }
}

function formatBytes(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── TAB SWITCHING ───────────────────────────────────────────────────────────
function switchTab(tabName) {
    currentTab = tabName;
    ['upload', 'links', 'builder'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle('active', t === tabName);
        document.getElementById(`content-${t}`).classList.toggle('hidden', t !== tabName);
    });
    if (tabName === 'builder' && builderMessages.length === 0) {
        // Show start button, hide chat input
    }
}

// ─── RESUME FILE HANDLING ────────────────────────────────────────────────────
function handleResumeFile(input) {
    const file = input.files[0];
    if (!file) return;
    renderResumePreview(file);
}

function renderResumePreview(file) {
    const zone = document.getElementById('resumeDropZone');
    const preview = document.getElementById('resumePreview');
    zone.classList.add('has-file');

    const isImage = file.type.startsWith('image/');
    const sizeFmt = formatBytes(file.size);

    let thumbHtml = '';
    if (isImage) {
        const url = URL.createObjectURL(file);
        thumbHtml = `<img src="${url}" alt="preview">`;
    } else {
        const icon = file.type === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-word';
        const color = file.type === 'application/pdf' ? '#f85149' : '#58a6ff';
        thumbHtml = `<div class="file-icon" style="color:${color}"><i class="fas ${icon}"></i></div>`;
    }

    preview.innerHTML = `
        <div class="resume-thumb">
            ${thumbHtml}
            <div class="thumb-info">
                <div class="file-name">${file.name}</div>
                <div class="file-meta">${sizeFmt}</div>
            </div>
            <button class="thumb-clear" onclick="clearResumeFile(event)" title="Remove">
                <i class="fas fa-times"></i>
            </button>
        </div>`;
}

function clearResumeFile(e) {
    e.stopPropagation();
    const zone = document.getElementById('resumeDropZone');
    const preview = document.getElementById('resumePreview');
    zone.classList.remove('has-file');
    document.getElementById('resumeFile').value = '';
    preview.innerHTML = `
        <i class="fas fa-cloud-upload-alt upload-icon"></i>
        <p class="drop-hint">Click or drag your CV here</p>
        <p class="drop-sub">PDF, Image, or DOCX</p>`;
}

// ─── JOB DESC IMAGES ─────────────────────────────────────────────────────────
function handleJobDescImages(input) {
    jobDescFiles = Array.from(input.files);
    renderJobDescPreviews();
}

function renderJobDescPreviews() {
    const container = document.getElementById('jobDescPreviews');
    container.innerHTML = '';
    jobDescFiles.forEach((file, idx) => {
        const url = URL.createObjectURL(file);
        const card = document.createElement('div');
        card.className = 'thumb-card';
        card.innerHTML = `
            <img src="${url}" alt="job post screenshot">
            <button class="remove-thumb" onclick="removeJobImage(${idx})">×</button>`;
        container.appendChild(card);
    });
}

function removeJobImage(idx) {
    jobDescFiles.splice(idx, 1);
    renderJobDescPreviews();
}

// ─── CONVERSATIONAL BUILDER ──────────────────────────────────────────────────
async function startBuilderInterview() {
    builderMessages = [];
    builderDone = false;
    resumeText_fromBuilder = '';
    document.getElementById('chatMessages').innerHTML = '';
    document.getElementById('startInterviewBtn').classList.add('hidden');
    document.getElementById('chatHint').classList.add('hidden');
    document.getElementById('chatInput').disabled = false;
    document.getElementById('chatSendBtn').disabled = false;

    // Kick off the first AI message
    await sendBuilderMessage(null);
}

async function sendBuilderMessage(userText) {
    if (builderDone) return;

    const inputEl = document.getElementById('chatInput');
    const text = userText !== null ? (userText ?? inputEl.value.trim()) : null;

    if (text !== null && text !== undefined) {
        if (!text) { inputEl.focus(); return; }
        appendChatMsg(text, 'user');
        builderMessages.push({ role: 'user', content: text });
        inputEl.value = '';
    }

    setBuilderLoading(true);

    try {
        const res = await fetch(`${API_URL}/builder/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ messages: builderMessages })
        });
        const data = await res.json();

        appendChatMsg(data.reply, 'ai');
        builderMessages.push({ role: 'assistant', content: data.reply });

        if (data.done) {
            builderDone = true;
            resumeText_fromBuilder = data.resumeText;
            appendChatMsg('✅ Interview complete! Click **Generate Professional CV** below to create your documents.', 'ai');
            document.getElementById('chatInput').disabled = true;
            document.getElementById('chatSendBtn').disabled = true;
        }
    } catch (err) {
        toast('Connection error. Please try again.', 'error');
    } finally {
        setBuilderLoading(false);
    }
}

function appendChatMsg(text, role) {
    const win = document.getElementById('chatMessages');
    const el = document.createElement('div');
    el.className = `chat-msg ${role}`;
    // Simple markdown bold support
    el.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    win.appendChild(el);
    win.scrollTop = win.scrollHeight;
}

function setBuilderLoading(loading) {
    const btn = document.getElementById('chatSendBtn');
    btn.innerHTML = loading ? '<i class="fas fa-circle-notch fa-spin"></i>' : '<i class="fas fa-paper-plane"></i>';
}

// ─── GENERATE CV ──────────────────────────────────────────────────────────────
async function generateCV() {
    const btn = document.getElementById('generateBtn');

    const jobText = document.getElementById('jobDesc').value;
    if (!jobText && jobDescFiles.length === 0) {
        toast('Please provide a Job Description (text or images).', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('jobDescText', jobText);
    formData.append('instructions', document.getElementById('instructions').value);
    for (const f of jobDescFiles) formData.append('jobDescImages', f);

    let hasSource = false;

    if (currentTab === 'upload') {
        const file = document.getElementById('resumeFile').files[0];
        if (file) { formData.append('resumeFiles', file); hasSource = true; }
    } else if (currentTab === 'links') {
        const txt = document.getElementById('rawText').value;
        const li = document.getElementById('linkedin').value;
        const gh = document.getElementById('github').value;
        if (txt || li || gh) {
            formData.append('resumeText', txt);
            formData.append('linkedInUrl', li);
            formData.append('githubUrl', gh);
            hasSource = true;
        }
    } else if (currentTab === 'builder') {
        if (builderDone && resumeText_fromBuilder) {
            formData.append('resumeText', resumeText_fromBuilder);
            hasSource = true;
        } else {
            toast('Please complete the interview first, or switch to another input tab.', 'error');
            return;
        }
    }

    if (!hasSource) {
        toast('Please provide candidate data (File, Links, or complete the Interview).', 'error');
        return;
    }

    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Generating…';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/generate-cv`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        if (res.status === 402) {
            btn.innerHTML = '<i class="fas fa-magic"></i> Generate Professional CV';
            btn.disabled = false;
            document.getElementById('paymentModal').classList.remove('hidden');
            return;
        }

        const data = await res.json();

        if (data.success) {
            generatedData = data.data;
            renderPreviews();
            document.getElementById('placeholder').classList.add('hidden');
            document.getElementById('resultContainer').classList.remove('hidden');
            // On mobile: automatically switch to Preview panel
            if (window.innerWidth <= 768) switchMobilePanel('preview');
            loadProfile();
            toast('CV generated successfully!', 'success');
        } else {
            toast(data.error || 'Generation failed. Please try again.', 'error');
        }
    } catch (e) {
        console.error(e);
        toast('Server error. Please try again.', 'error');
    } finally {
        btn.innerHTML = '<i class="fas fa-magic"></i> Generate Professional CV';
        btn.disabled = false;
    }
}

// ─── PREVIEW ─────────────────────────────────────────────────────────────────
function renderPreviews() {
    if (!generatedData) return;
    setIframeContent('cvFrame', generatedData.cv_html);
    setIframeContent('clFrame', generatedData.cover_letter_html);
}

function setIframeContent(frameId, html) {
    const frame = document.getElementById(frameId);
    const doc = frame.contentDocument || frame.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
}

function switchPreview(type) {
    currentPreview = type;
    document.getElementById('cvFrame').classList.toggle('hidden', type !== 'cv');
    document.getElementById('clFrame').classList.toggle('hidden', type !== 'cover_letter');
    document.getElementById('prev-cv').classList.toggle('active', type === 'cv');
    document.getElementById('prev-cl').classList.toggle('active', type === 'cover_letter');
}

// ─── DOWNLOADS ────────────────────────────────────────────────────────────────
async function downloadFile(docType, format) {
    if (!generatedData) { toast('No CV generated yet.', 'error'); return; }

    const html = docType === 'cv' ? generatedData.cv_html : generatedData.cover_letter_html;
    const name = generatedData.personal_info?.name?.replace(/\s+/g, '_') || 'document';
    const filename = docType === 'cv' ? `${name}_CV` : `${name}_CoverLetter`;

    const endpoint = format === 'pdf' ? '/download-pdf' : '/download-word';
    const ext = format === 'pdf' ? 'pdf' : 'docx';
    const mimeType = format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    toast(`Preparing ${format.toUpperCase()} download…`, 'info', 2500);

    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ html, filename })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Download failed');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Download started!', 'success');
    } catch (err) {
        console.error(err);
        toast(err.message || 'Download failed. Please try again.', 'error');
    }
}

// ─── MY FILES MODAL ───────────────────────────────────────────────────────────
async function openFilesModal() {
    document.getElementById('filesModal').classList.remove('hidden');
    await loadFiles();
}

function closeFilesModal(event) {
    if (!event || event.target.id === 'filesModal') {
        document.getElementById('filesModal').classList.add('hidden');
    }
}

async function loadFiles() {
    const list = document.getElementById('filesList');
    list.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading files…</div>';

    try {
        const res = await fetch(`${API_URL}/files`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();

        // Update storage bar
        const usedPct = Math.min(100, (data.storageUsedBytes / data.storageQuotaBytes) * 100);
        const fill = document.getElementById('storageBarFill');
        fill.style.width = `${usedPct}%`;
        if (usedPct > 80) fill.classList.add('warn');
        else fill.classList.remove('warn');
        document.getElementById('storageBarLabel').textContent =
            `${formatBytes(data.storageUsedBytes)} / ${formatBytes(data.storageQuotaBytes)}`;

        if (!data.files || data.files.length === 0) {
            list.innerHTML = '<div class="empty-state"><i class="fas fa-inbox" style="font-size:32px;display:block;margin-bottom:12px"></i>No files saved yet.<br>Generate a CV to see your files here.</div>';
            return;
        }

        list.innerHTML = '';
        for (const file of data.files) {
            const isUpload = file.type === 'upload';
            const ext = file.name.split('.').pop().toLowerCase();
            const iconMap = { pdf: 'fa-file-pdf', html: 'fa-file-code', png: 'fa-file-image', jpg: 'fa-file-image', jpeg: 'fa-file-image', docx: 'fa-file-word' };
            const icon = iconMap[ext] || 'fa-file';
            const date = new Date(file.lastModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
            const isHtml = ext === 'html';
            const encodedKey = encodeURIComponent(file.key);

            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <div class="file-item-icon ${isUpload ? 'icon-upload' : 'icon-gen'}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="file-item-info">
                    <div class="file-item-name" title="${file.name}">${file.name}</div>
                    <div class="file-item-meta">${formatBytes(file.size)} &middot; ${date}</div>
                </div>
                <span class="file-badge ${isUpload ? 'badge-upload' : 'badge-gen'}">${isUpload ? 'Upload' : 'Generated'}</span>
                <div class="file-item-actions">
                    ${isHtml ? `
                    <button class="btn-file-action pdf" title="Download as PDF" onclick="convertSavedFile('${encodedKey}', 'pdf', this)">
                        <i class="fas fa-file-pdf"></i>
                    </button>
                    <button class="btn-file-action word" title="Download as Word" onclick="convertSavedFile('${encodedKey}', 'word', this)">
                        <i class="fas fa-file-word"></i>
                    </button>
                    ` : `
                    <button class="btn-file-action" title="Download" onclick="downloadFileFromR2('${encodedKey}')">
                        <i class="fas fa-download"></i>
                    </button>
                    `}
                    <button class="btn-file-action del" title="Delete" onclick="deleteUserFile('${encodedKey}', this)">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>`;
            list.appendChild(item);
        }
    } catch (err) {
        list.innerHTML = '<div class="empty-state">Failed to load files. Please try again.</div>';
        console.error(err);
    }
}

async function convertSavedFile(encodedKey, format, btn) {
    const key = decodeURIComponent(encodedKey);
    const origHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    const ext = format === 'pdf' ? 'pdf' : 'docx';
    const mimeType = format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    toast(`Converting to ${format.toUpperCase()}…`, 'info', 3000);

    try {
        const res = await fetch(`${API_URL}/convert-saved`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ key, format })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Conversion failed');
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
        const a = document.createElement('a');
        const baseName = key.split('/').pop().replace(/\.html$/i, '');
        a.href = url;
        a.download = `${baseName}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Download started!', 'success');
    } catch (err) {
        console.error(err);
        toast(err.message || 'Conversion failed. Please try again.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = origHtml;
    }
}

async function downloadFileFromR2(encodedKey) {
    try {
        const key = decodeURIComponent(encodedKey);
        const res = await fetch(`${API_URL}/files/download-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (data.url) {
            window.open(data.url, '_blank');
        } else {
            toast('Could not get download URL.', 'error');
        }
    } catch {
        toast('Download failed.', 'error');
    }
}

async function deleteUserFile(encodedKey, btn) {
    if (!confirm('Delete this file permanently?')) return;
    const key = decodeURIComponent(encodedKey);

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

    try {
        const res = await fetch(`${API_URL}/files`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ key })
        });
        const data = await res.json();
        if (data.success) {
            toast('File deleted.', 'success');
            await loadFiles();
            await loadProfile();
        } else {
            toast(data.error || 'Delete failed.', 'error');
        }
    } catch {
        toast('Delete failed.', 'error');
    } finally {
        btn.disabled = false;
    }
}

// ─── PAYMENT ──────────────────────────────────────────────────────────────────
async function pay() {
    const phone = document.getElementById('payPhone').value;
    if (!phone) { toast('Enter your phone number to buy 3 credits for 1000 TZS.', 'error'); return; }

    try {
        const res = await fetch(`${API_URL}/pay`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ phoneNumber: phone, amount: 908 })
        });
        const data = await res.json();
        toast(data.message || 'Payment initiated!', data.success ? 'success' : 'error');
        if (data.success) closePayModal();
    } catch {
        toast('Payment failed. Please try again.', 'error');
    }
}

function closePayModal() {
    document.getElementById('paymentModal').classList.add('hidden');
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
function logout() {
    localStorage.removeItem('cv_token');
    window.location.href = 'index.html';
}

// ─── DRAG & DROP SUPPORT ──────────────────────────────────────────────────────
(function setupDragDrop() {
    const zone = document.getElementById('resumeDropZone');
    if (!zone) return;

    zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.style.borderColor = '#388bfd';
        zone.style.background = '#0d1f35';
    });
    zone.addEventListener('dragleave', () => {
        zone.style.borderColor = '';
        zone.style.background = '';
    });
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.style.borderColor = '';
        zone.style.background = '';
        const file = e.dataTransfer.files[0];
        if (file) {
            const input = document.getElementById('resumeFile');
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            renderResumePreview(file);
        }
    });
})();

// ─── INIT ─────────────────────────────────────────────────────────────────────
loadProfile();
