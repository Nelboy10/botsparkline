const express = require('express');
const cors = require('cors');
const { spawn, fork } = require('child_process');
const fs = require('fs');
const path = require('path');

// In CJS, __dirname is available directly
const currentDir = __dirname;

// 🔹 WORKER HANDLING FOR PKG
const rootDir = process.pkg ? path.dirname(process.execPath) : process.cwd();

if (process.argv.includes('--worker')) {
    const logFile = path.join(rootDir, 'debug_worker.log');
    try {
        fs.appendFileSync(logFile, `Worker started at ${new Date().toISOString()}\n`);

        if (process.pkg) {
            // IN PKG: Use bundled CJS
            const mainBundle = path.join(currentDir, 'src', 'main.bundle.cjs');
            fs.appendFileSync(logFile, `Loading bundle (PKG): ${mainBundle}\n`);
            require('./src/main.bundle.cjs');
        } else {
            // LOCAL DEV: Use source ESM
            fs.appendFileSync(logFile, `Loading source (DEV): src/main.js\n`);
            (async () => {
                try {
                    // Dynamic import for ESM
                    await import('./src/main.js');
                } catch (err) {
                    console.error("Failed to import main.js:", err);
                    fs.appendFileSync(logFile, `Import Error: ${err.message}\n${err.stack}\n`);
                    process.exit(1);
                }
            })();
        }

        fs.appendFileSync(logFile, `Worker init sequence complete\n`);
    } catch (e) {
        const msg = `Worker Error: ${e.message}\nStack: ${e.stack}\n`;
        console.error(msg);
        fs.appendFileSync(logFile, msg);
        process.exit(1);
    }
} else {
    const logFile = path.join(rootDir, 'debug_server.log');
    try {
        fs.appendFileSync(logFile, `Server started at ${new Date().toISOString()}\n`);
        startServer();
    } catch (e) {
        fs.writeFileSync('panic_server.log', e.message);
    }
}

function startServer() {
    const app = express();
    const port = 3001;

    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(currentDir, 'public')));

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

        const { mode, listName, godMode } = req.body;

        // 🔹 MODIFIED: Use fork() instead of spawn() for pkg compatibility
        // fork() correctly handles scripts inside the snapshot
        const args = ['--worker']; // Signal internal worker mode

        if (mode === 'dry') args.push('--dry');
        if (godMode) args.push('--godmode');

        // Arguments passed to worker
        if (listName && listName.trim().length > 0) {
            args.push('--list', listName.trim());
        }

        console.log(`Lancement du bot en mode: ${mode} (Liste: ${listName || 'Defaut'})`);
        broadcast({ type: 'status', message: `Lancement du bot (${mode})... Liste: ${listName || 'Defaut'}` });

        // fork with silent: true pipes stdout/stderr
        try {
            console.log(` Tentative fork sur: ${__filename}`);
            console.log(` Args: ${JSON.stringify(args)}`);

            botProcess = fork(__filename, args, { silent: true });

            botProcess.on('error', (err) => {
                console.error("Erreur botProcess:", err);
                broadcast({ type: 'error', message: "Erreur process: " + err.message });
            });

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
        } catch (e) {
            console.error(" Exception lors du fork:", e);
            res.status(500).json({ error: e.message });
        }
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
        // 🔹 MODIFIED: Use rootDir for files created at runtime
        const csvPath = path.join(rootDir, 'contacts.csv');
        if (fs.existsSync(csvPath)) {
            const content = fs.readFileSync(csvPath, 'utf-8');
            res.json({ content });
        } else {
            res.json({ content: '' });
        }
    });

    app.get('/api/download', (req, res) => {
        // 🔹 MODIFIED: Use rootDir for files created at runtime
        const csvPath = path.join(rootDir, 'contacts.csv');
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
        try {
            const open = require('open');
            open(`http://localhost:${port}`);
        } catch (err) {
            console.error("Failed to open browser:", err);
            // Fallback for Windows if open fails inside pkg
            if (process.platform === 'win32') {
                // Try to open using start command as fallback
                spawn('cmd', ['/c', 'start', `http://localhost:${port}`]);
            }
        }
    });
}
