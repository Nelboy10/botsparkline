import open from 'open';
import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔹 WORKER HANDLING FOR PKG
if (process.argv.includes('--worker')) {
    const logFile = path.join(process.cwd(), 'debug_worker.log');
    fs.appendFileSync(logFile, `Worker started at ${new Date().toISOString()}\n`);

    const mainScript = path.join(__dirname, 'src', 'main.js');
    fs.appendFileSync(logFile, `Target script: ${mainScript}\n`);

    import(mainScript)
        .then(() => fs.appendFileSync(logFile, `Worker imported successfully\n`))
        .catch(err => {
            const msg = `Worker Error: ${err.message}\nStack: ${err.stack}\n`;
            console.error(msg);
            fs.appendFileSync(logFile, msg);
            process.exit(1);
        });
} else {
    // Log for main process too
    const logFile = path.join(process.cwd(), 'debug_server.log');
    fs.appendFileSync(logFile, `Server started at ${new Date().toISOString()}\n`);
    startServer();
}

function startServer() {
    const app = express();
    const port = 3001;

    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    let botProcess = null;
    let clients = [];

    // SSE logs
    app.get('/api/logs', (req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const client = { id: Date.now(), res };
        clients.push(client);

        req.on('close', () => {
            clients = clients.filter(c => c.id !== client.id);
        });
    });

    function broadcast(data) {
        clients.forEach(c => {
            c.res.write(`data: ${JSON.stringify(data)}\n\n`);
        });
    }

    // Lancer le bot
    app.post('/api/start', (req, res) => {
        if (botProcess) {
            return res.status(400).json({ error: 'Bot est déjà en cours' });
        }

        const { mode, listName } = req.body;

        // 🔹 pkg-safe spawn
        const nodePath = process.execPath;
        const args = ['--worker']; // Signal internal worker mode

        if (mode === 'dry') args.push('--dry');

        // Arguments passed to worker
        if (listName && listName.trim().length > 0) {
            args.push('--list', listName.trim());
        }

        console.log(`Lancement du bot en mode: ${mode} (Liste: ${listName || 'Defaut'})`);
        broadcast({ type: 'status', message: `Lancement du bot (${mode})... Liste: ${listName || 'Defaut'}` });

        botProcess = spawn(nodePath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

        botProcess.stdout.on('data', (data) => {
            const message = data.toString();
            process.stdout.write(message);
            broadcast({ type: 'log', message });
        });

        botProcess.stderr.on('data', (data) => {
            const message = data.toString();
            process.stderr.write(message);
            broadcast({ type: 'error', message });
        });

        botProcess.on('close', (code) => {
            console.log(`Bot arrete avec le code ${code}`);
            broadcast({ type: 'status', message: `Bot arrete (Code ${code})` });
            broadcast({ type: 'exit', code });
            botProcess = null;
        });

        res.json({ status: 'started' });
    });

    // Stop bot
    app.post('/api/stop', (req, res) => {
        if (botProcess) {
            botProcess.kill();
            botProcess = null;
            res.json({ status: 'stopped' });
        } else {
            res.status(400).json({ error: 'Aucun bot en cours' });
        }
    });

    // Statut
    app.get('/api/status', (req, res) => {
        res.json({ running: !!botProcess });
    });

    // CSV
    app.get('/api/data', (req, res) => {
        // 🔹 MODIFIED: Use process.cwd() for files created at runtime
        const csvPath = path.join(process.cwd(), 'contacts.csv');
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf-8');
            res.json({ content });
        } else {
            res.json({ content: '' });
        }
    });

    app.get('/api/download', (req, res) => {
        // 🔹 MODIFIED: Use process.cwd() for files created at runtime
        const csvPath = path.join(process.cwd(), 'contacts.csv');
        if (fs.existsSync(csvPath)) {
            res.download(csvPath, 'contacts.csv');
        } else {
            res.status(404).send('Fichier non trouvé');
        }
    });

    app.post('/api/input', (req, res) => {
        if (botProcess && botProcess.stdin.writable) {
            botProcess.stdin.write('\n');
            res.json({ status: 'sent' });
        } else {
            res.status(400).json({ error: 'Stdin non disponible' });
        }
    });

    app.listen(port, () => {
        console.log(`Dashboard Backend pret sur http://localhost:${port}`);
        open(`http://localhost:${port}`);
    });
}
