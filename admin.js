/* ─────────────────────────────────────────────────────────────────────────────
   CVBora Admin Dashboard — admin.js
   ───────────────────────────────────────────────────────────────────────────── */

const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:7860/api'
    : 'https://ismizo-cvbora.hf.space/api';

const token = localStorage.getItem('cv_token');
if (!token) window.location.href = 'index.html';

// ─── State ────────────────────────────────────────────────────────────────────

let currentTab       = 'payments';
let currentUserPage  = 1;
const USER_PAGE_SIZE = 20;

let currentLogPage   = 1;
const LOG_PAGE_SIZE  = 30;
let currentLogFilter = 'all';

// ─── Tab Switching ─────────────────────────────────────────────────────────────

function switchAdminTab(tab) {
    currentTab = tab;

    ['payments', 'users', 'logs'].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle('active', t === tab);
        document.getElementById(`panel-${t}`).classList.toggle('active', t === tab);
    });

    if (tab === 'payments') loadPayments();
    if (tab === 'users')    { currentUserPage = 1; loadUsers(); }
    if (tab === 'logs')     { currentLogPage  = 1; loadLogs(); }
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

async function loadStats() {
    try {
        // Load total users, generation count, pending payments, transactions
        const [usersRes, logsRes, paymentsRes] = await Promise.all([
            fetch(`${API_URL}/admin/users?limit=1`, { headers: auth() }),
            fetch(`${API_URL}/admin/logs?limit=1`,  { headers: auth() }),
            fetch(`${API_URL}/admin/payments`,       { headers: auth() }),
        ]);

        if (usersRes.status === 403 || logsRes.status === 403) {
            document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:80px;font-family:Inter,sans-serif;">⛔ Access Denied — Admin Only</h1>';
            return;
        }

        const usersData    = await usersRes.json();
        const logsData     = await logsRes.json();
        const paymentsData = paymentsRes.ok ? await paymentsRes.json() : [];

        // Count pending payments and ClickPesa transactions from the logs endpoint
        const allLogsRes = await fetch(`${API_URL}/admin/logs?limit=9999`, { headers: auth() });
        const allLogs    = allLogsRes.ok ? await allLogsRes.json() : { logs: [] };

        const genCount    = allLogs.logs.filter(l => l.type === 'generation').length;
        const txnCount    = allLogs.logs.filter(l => l.type === 'payment').length;
        const pendCount   = Array.isArray(paymentsData) ? paymentsData.length : 0;

        setEl('statUsers',   usersData.total ?? '?');
        setEl('statGens',    genCount);
        setEl('statPending', pendCount);
        setEl('statTxns',    txnCount);
    } catch (e) {
        console.warn('Stats load failed:', e.message);
    }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

async function loadPayments() {
    const list = document.getElementById('paymentsList');
    list.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

    try {
        const res = await fetch(`${API_URL}/admin/payments`, { headers: auth() });
        if (res.status === 403) {
            document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:80px;font-family:Inter,sans-serif;">⛔ Access Denied</h1>';
            return;
        }
        const data = await res.json();
        setEl('paymentCount', `${data.length} pending`);

        if (data.length === 0) {
            list.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle" style="color:#3fb950;font-size:28px;margin-bottom:10px;display:block;"></i>No pending payments.</div>';
            return;
        }

        list.innerHTML = '';
        data.forEach(p => {
            const email = p.userId?.email || 'Unknown User';
            const date  = new Date(p.uploadedAt).toLocaleString();
            const imgHtml = p.screenshotUrl
                ? `<img src="${p.screenshotUrl}" alt="Screenshot" onclick="showImg('${p.screenshotUrl}')">`
                : `<div style="width:220px;height:120px;background:#161b22;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#484f58;border:1px solid #21262d;"><i class="fas fa-image" style="font-size:24px;"></i></div>`;

            const card = document.createElement('div');
            card.className = 'payment-card';
            card.innerHTML = `
                <div class="payment-img">${imgHtml}</div>
                <div class="payment-info" style="flex:1;">
                    <h4><i class="fas fa-user"></i> ${email}</h4>
                    <div class="info-row"><strong>Tx ID:</strong> ${p.transactionId || '<em style="color:#484f58">N/A</em>'}</div>
                    <div class="info-row"><strong>Amount:</strong> TZS ${p.amount?.toLocaleString() || '908'}</div>
                    <div class="info-row"><strong>Submitted:</strong> ${date}</div>
                    <div class="payment-actions">
                        <button class="btn-green" onclick="handlePayment('${p._id}', 'approve')">
                            <i class="fas fa-check"></i> Approve &amp; Add Credits
                        </button>
                        <button class="btn-red" onclick="handlePayment('${p._id}', 'reject')">
                            <i class="fas fa-times"></i> Reject
                        </button>
                    </div>
                </div>`;
            list.appendChild(card);
        });
    } catch (e) {
        list.innerHTML = '<div class="empty-state" style="color:#f85149;"><i class="fas fa-triangle-exclamation"></i> Failed to load payments.</div>';
    }
}

function showImg(src) {
    document.getElementById('imgModalSrc').src = src;
    document.getElementById('imgModal').classList.remove('hidden');
}

async function handlePayment(id, action) {
    if (!confirm(`Are you sure you want to ${action} this payment?`)) return;
    try {
        const res = await fetch(`${API_URL}/admin/payments/${action}/${id}`, {
            method: 'POST',
            headers: auth(),
        });
        if (res.ok) {
            loadPayments();
            loadStats();
        } else {
            alert(`Failed to ${action} payment.`);
        }
    } catch {
        alert('Action failed. Please try again.');
    }
}

// ─── Users (paginated) ────────────────────────────────────────────────────────

async function loadUsers() {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty-row" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    const q = document.getElementById('userQuery').value.trim();
    const url = `${API_URL}/admin/users?page=${currentUserPage}&limit=${USER_PAGE_SIZE}${q ? `&search=${encodeURIComponent(q)}` : ''}`;

    try {
        const res  = await fetch(url, { headers: auth() });
        const data = await res.json();

        const { users = [], total = 0, page = 1, totalPages = 1 } = data;

        setEl('userTotalBadge', `${total} user${total !== 1 ? 's' : ''}`);

        tbody.innerHTML = '';
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#484f58;padding:40px;">No users found.</td></tr>';
        } else {
            users.forEach(u => {
                const tr = document.createElement('tr');
                const banCls  = u.isBanned ? 'btn-green' : 'btn-red';
                const banText = u.isBanned ? 'Unban' : 'Ban';
                const storageMB = ((u.storageUsedBytes || 0) / 1024 / 1024).toFixed(1);
                tr.innerHTML = `
                    <td class="email-cell">${u.email}</td>
                    <td class="credits-cell">${u.paidCredits ?? 0}</td>
                    <td style="color:#8b949e;">${u.freeGenerationsUsed ?? 0}</td>
                    <td style="color:#8b949e;">${storageMB} MB</td>
                    <td>${u.isBanned ? '<span style="color:#f85149;font-weight:600;">Yes</span>' : '<span style="color:#3fb950;">No</span>'}</td>
                    <td>
                        <button class="${banCls}" onclick="toggleBan('${u._id}', this)" style="min-width:70px;">${banText}</button>
                    </td>`;
                tbody.appendChild(tr);
            });
        }

        // Paginator
        const paginator = document.getElementById('userPaginator');
        paginator.style.display = totalPages > 1 ? 'flex' : 'none';
        setEl('userPageInfo', `Page ${page} of ${totalPages}`);
        document.getElementById('btnPrevUser').disabled = (page <= 1);
        document.getElementById('btnNextUser').disabled = (page >= totalPages);

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#f85149;padding:40px;">Failed to load users.</td></tr>`;
    }
}

function prevUserPage() { if (currentUserPage > 1) { currentUserPage--; loadUsers(); } }
function nextUserPage() { currentUserPage++; loadUsers(); }

async function toggleBan(id) {
    if (!confirm('Toggle ban status for this user?')) return;
    try {
        const res = await fetch(`${API_URL}/admin/users/${id}/ban`, {
            method: 'POST',
            headers: auth(),
        });
        if (res.ok) loadUsers();
        else alert('Failed to toggle ban.');
    } catch {
        alert('Failed. Please try again.');
    }
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

async function loadLogs() {
    const tbody = document.getElementById('logTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#484f58;"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    const url = `${API_URL}/admin/logs?page=${currentLogPage}&limit=${LOG_PAGE_SIZE}&type=${currentLogFilter}`;

    try {
        const res  = await fetch(url, { headers: auth() });
        const data = await res.json();
        const { logs = [], total = 0, page = 1, totalPages = 1 } = data;

        setEl('logTotalBadge', `${total} event${total !== 1 ? 's' : ''}`);

        tbody.innerHTML = '';
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#484f58;padding:40px;">No logs found.</td></tr>';
        } else {
            logs.forEach(l => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${logTypeBadge(l)}</td>
                    <td class="log-email">${l.email || '—'}</td>
                    <td class="log-detail">${l.detail || '—'}</td>
                    <td class="log-amount">${l.amount ? `TZS ${l.amount.toLocaleString()}` : '—'}</td>
                    <td>${logStatusBadge(l)}</td>
                    <td class="log-date">${new Date(l.createdAt).toLocaleString()}</td>`;
                tbody.appendChild(tr);
            });
        }

        const paginator = document.getElementById('logPaginator');
        paginator.style.display = totalPages > 1 ? 'flex' : 'none';
        setEl('logPageInfo', `Page ${page} of ${totalPages}`);
        document.getElementById('btnPrevLog').disabled = (page <= 1);
        document.getElementById('btnNextLog').disabled = (page >= totalPages);

    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#f85149;padding:40px;">Failed to load logs.</td></tr>`;
    }
}

function prevLogPage() { if (currentLogPage > 1) { currentLogPage--; loadLogs(); } }
function nextLogPage() { currentLogPage++; loadLogs(); }

function setLogFilter(f) {
    currentLogFilter = f;
    currentLogPage   = 1;

    // Update pill states
    const map = { all: 'fpAll', generation: 'fpGen', payment: 'fpPay', manual: 'fpManual' };
    const cls = { all: 'active-all', generation: 'active-gen', payment: 'active-pay', manual: 'active-manual' };

    Object.keys(map).forEach(k => {
        const el = document.getElementById(map[k]);
        el.className = 'filter-pill' + (k === f ? ` ${cls[k]}` : '');
    });

    loadLogs();
}

// ─── Badge Helpers ─────────────────────────────────────────────────────────────

function logTypeBadge(l) {
    if (l.type === 'generation') {
        const cls = l.subtype === 'paid' ? 'badge-gen-paid' : 'badge-gen-free';
        return `<span class="log-badge ${cls}"><i class="fas fa-file-circle-check"></i> CV Gen (${l.subtype})</span>`;
    }
    if (l.type === 'payment') {
        return `<span class="log-badge badge-pay-click"><i class="fas fa-mobile-screen"></i> ClickPesa</span>`;
    }
    if (l.type === 'manual_payment') {
        return `<span class="log-badge badge-manual-pend"><i class="fas fa-receipt"></i> Manual M-Pesa</span>`;
    }
    return `<span class="log-badge">${l.type}</span>`;
}

function logStatusBadge(l) {
    if (l.type === 'generation') return '<span style="color:#484f58;font-size:11px;">—</span>';
    const s = (l.status || '').toLowerCase();
    if (s === 'success' || s === 'settled' || s === 'approved')
        return `<span class="log-badge badge-pay-ok"><i class="fas fa-check"></i> ${l.status}</span>`;
    if (s === 'rejected' || s === 'failed' || s === 'reversed' || s === 'refunded')
        return `<span class="log-badge badge-pay-fail"><i class="fas fa-times"></i> ${l.status}</span>`;
    return `<span class="log-badge badge-pay-pend">${l.status || 'pending'}</span>`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function auth() { return { 'Authorization': `Bearer ${token}` }; }
function setEl(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ─── Init ─────────────────────────────────────────────────────────────────────

loadStats();
loadPayments();
