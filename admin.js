const API_URL = window.location.hostname === "localhost" ? "http://localhost:7860/api" : "https://ismizo-cvbora.hf.space/api";
const token = localStorage.getItem('cv_token');

if (!token) {
    window.location.href = 'index.html';
}

function switchAdminTab(tab) {
    document.getElementById('tab-payments').classList.toggle('active', tab === 'payments');
    document.getElementById('tab-users').classList.toggle('active', tab === 'users');
    document.getElementById('content-payments').classList.toggle('hidden', tab !== 'payments');
    document.getElementById('content-users').classList.toggle('hidden', tab !== 'users');

    if (tab === 'payments') loadPayments();
}

async function loadPayments() {
    const list = document.getElementById('paymentsList');
    list.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    try {
        const res = await fetch(`${API_URL}/admin/payments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.status === 403) {
            document.body.innerHTML = '<h1 style="color:white;text-align:center;margin-top:50px;">Access Denied. Admin Only.</h1>';
            return;
        }
        const data = await res.json();
        
        if (data.length === 0) {
            list.innerHTML = '<div class="center-text" style="color:#a8b2d1;margin-top:20px;">No pending payments.</div>';
            return;
        }

        list.innerHTML = '';
        data.forEach(p => {
            const card = document.createElement('div');
            card.className = 'payment-card';
            
            let imgHtml = '';
            if (p.screenshotUrl) {
                imgHtml = `<img src="${p.screenshotUrl}" alt="Screenshot" onclick="showImg('${p.screenshotUrl}')">`;
            } else {
                imgHtml = `<div style="width:200px; height:100px; background:#334155; display:flex; align-items:center; justify-content:center; border-radius:8px;">No Image</div>`;
            }

            const email = p.userId ? p.userId.email : 'Unknown User';
            const date = new Date(p.uploadedAt).toLocaleString();

            card.innerHTML = `
                <div class="payment-img">
                    ${imgHtml}
                </div>
                <div class="payment-info">
                    <h4>User: ${email}</h4>
                    <div><strong>Tx ID:</strong> ${p.transactionId || 'N/A'}</div>
                    <div style="margin-bottom:15px;"><strong>Date:</strong> ${date}</div>
                    
                    <button class="btn-green" onclick="handlePayment('${p._id}', 'approve')"><i class="fas fa-check"></i> Approve & Add Credits</button>
                    <button class="btn-outline" onclick="handlePayment('${p._id}', 'reject')" style="margin-left:10px;"><i class="fas fa-times"></i> Reject</button>
                </div>
            `;
            list.appendChild(card);
        });

    } catch (e) {
        list.innerHTML = '<div class="center-text" style="color:#ff5555;">Failed to load.</div>';
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
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            alert(`Payment ${action}d successfully.`);
            loadPayments();
        } else {
            alert(`Failed to ${action}.`);
        }
    } catch {
        alert('Action failed.');
    }
}

async function searchUsers() {
    const q = document.getElementById('userQuery').value;
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="center-text"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    try {
        const res = await fetch(`${API_URL}/admin/users?search=${encodeURIComponent(q)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const users = await res.json();

        tbody.innerHTML = '';
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="center-text">No users found.</td></tr>';
            return;
        }

        users.forEach(u => {
            const tr = document.createElement('tr');
            const banBtnClass = u.isBanned ? 'btn-green' : 'btn-red';
            const banBtnText = u.isBanned ? 'Unban' : 'Ban';
            
            tr.innerHTML = `
                <td>${u.email}</td>
                <td>${u.paidCredits}</td>
                <td>${u.freeGenerationsUsed}</td>
                <td>${u.isBanned ? '<span style="color:#ff5555">Yes</span>' : 'No'}</td>
                <td>
                    <button class="${banBtnClass}" onclick="toggleBan('${u._id}')">${banBtnText}</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch {
        tbody.innerHTML = '<tr><td colspan="5" class="center-text">Failed to search.</td></tr>';
    }
}

async function toggleBan(id) {
    if (!confirm('Toggle ban status for this user?')) return;
    try {
        const res = await fetch(`${API_URL}/admin/users/${id}/ban`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            searchUsers();
        } else {
            alert('Failed.');
        }
    } catch {
        alert('Failed.');
    }
}

// Init
loadPayments();
