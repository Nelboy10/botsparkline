const term = document.getElementById('terminalOutput');
const dataTable = document.getElementById('dataTable').querySelector('tbody');

let logSource = null;

function appendLog(text, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-line ${type}`;
    div.textContent = text;
    term.appendChild(div);
    term.scrollTop = term.scrollHeight; // Auto-scroll
}

function updateStatus(active) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    const btnStart = document.getElementById('btnStart');
    const btnDry = document.getElementById('btnDry');
    const btnStop = document.getElementById('btnStop');

    if (active) {
        dot.classList.add('active');
        text.textContent = "Extraction en cours...";
        text.style.color = "var(--success)";
        btnStart.disabled = true;
        btnDry.disabled = true;
        btnStop.disabled = false;
    } else {
        dot.classList.remove('active');
        text.textContent = "Prêt";
        text.style.color = "var(--text-muted)";
        btnStart.disabled = false;
        btnDry.disabled = false;
        btnStop.disabled = true;
    }
}

async function startBot(mode) {
    try {
        const listName = document.getElementById('listNameInput').value;
        const godMode = document.getElementById('godModeInput')?.checked;
        const displayList = listName ? listName : "Défaut";

        appendLog(`--- Lancement commande: ${mode} (Liste: ${displayList})${godMode ? ' [GOD MODE]' : ''} ---`, 'system');
        updateStatus(true);
        const res = await fetch('/api/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode, listName, godMode })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
    } catch (e) {
        appendLog(`Erreur lancement: ${e.message}`, 'error');
        updateStatus(false);
    }
}

async function stopBot() {
    try {
        appendLog(`--- Arrêt demandé ---`, 'system');
        await fetch('/api/stop', { method: 'POST' });
    } catch (e) {
        appendLog(`Erreur arrêt: ${e.message}`, 'error');
    }
}

async function sendInput() {
    try {
        await fetch('/api/input', { method: 'POST' });
        appendLog(`[Input] ENTER envoyé`, 'system');
    } catch (e) { }
}

function downloadCsv() {
    window.location.href = '/api/download';
}

async function refreshData() {
    try {
        const res = await fetch('/api/data');
        const { content } = await res.json();
        if (!content) return;

        // Parse CSV simple (Attention aux virgules dans les champs, mais on a remplacé par espace dans le code JS)
        const lines = content.trim().split('\n');
        // Remove Header
        if (lines.length > 0) lines.shift();

        // Reverse for latest first
        const latest = lines.reverse().slice(0, 50);

        dataTable.innerHTML = '';

        let companyCount = 0;
        let contactCount = 0;

        latest.forEach(line => {
            const cols = line.split(',');
            if (cols.length >= 3) {
                const tr = document.createElement('tr');
                const contactName = cols[3] && cols[3] !== "N/A" ? cols[3] : "Aucun";
                const contactTitle = cols[4] && cols[4] !== "N/A" ? cols[4] : "";

                tr.innerHTML = `
                    <td>${cols[0]}</td>
                    <td>${cols[1]}</td>
                    <td>${contactName}</td>
                    <td>${contactTitle}</td>
                `;
                dataTable.appendChild(tr);
            }
        });

        // Stats approximation
        document.getElementById('statCompanies').textContent = lines.length;
        // Approximation: on compte 1 par ligne si y'a un nom
        document.getElementById('statContacts').textContent = lines.reduce((acc, l) => acc + (l.includes(",N/A,N/A,") ? 0 : 1), 0);


    } catch (e) {
        console.error("Erreur data refresh", e);
    }
}

function clearLogs() {
    term.innerHTML = '';
}

// Init SSE Logs
function initLogs() {
    if (logSource) logSource.close();
    logSource = new EventSource('/api/logs');

    logSource.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'log') appendLog(data.message);
        else if (data.type === 'error') appendLog(data.message, 'error');
        else if (data.type === 'exit') {
            appendLog(`--- Fin du processus (Code ${data.code}) ---`, 'system');
            updateStatus(false);
        }
    };
}

async function checkStatus() {
    try {
        const res = await fetch('/api/status');
        const { running } = await res.json();
        updateStatus(running);
    } catch (e) { }
}

// Auto refresh data every 5s
setInterval(refreshData, 5000);
initLogs();
refreshData();
checkStatus(); // Vérif initiale
