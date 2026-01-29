const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, 'dist');
const timestamp = Date.now();
const packageDirName = `sparklane-bot-client_${timestamp}`;
const packageDir = path.join(distDir, packageDirName);

// Définir les chemins source et destination pour le dossier final
const packageMap = [
    { src: path.join(__dirname, 'node_modules', '@img'), dest: path.join(packageDir, 'node_modules', '@img') },
    { src: path.join(__dirname, 'node_modules', 'sharp'), dest: path.join(packageDir, 'node_modules', 'sharp') },
    // Externalisation Playwright pour éviter crash pkg snapshot
    { src: path.join(__dirname, 'node_modules', 'playwright'), dest: path.join(packageDir, 'node_modules', 'playwright') },
    { src: path.join(__dirname, 'node_modules', 'playwright-core'), dest: path.join(packageDir, 'node_modules', 'playwright-core') },

    { src: path.join(__dirname, 'config'), dest: path.join(packageDir, 'config') },
    { src: path.join(__dirname, 'public'), dest: path.join(packageDir, 'public') },
    { src: path.join(__dirname, 'browsers'), dest: path.join(packageDir, 'browsers') },
];

function copyFolderSync(from, to) {
    if (!fs.existsSync(from)) {
        console.warn(`⚠️ Source introuvable (ignoré) : ${from}`);
        return;
    }
    fs.mkdirSync(to, { recursive: true });
    try {
        fs.cpSync(from, to, { recursive: true });
        console.log(`✅ Copié : ${to}`);
    } catch (e) {
        console.error(`❌ Erreur copie ${from} -> ${to}:`, e.message);
    }
}

// 1. Préparer dist
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
fs.mkdirSync(packageDir, { recursive: true });

// 2a. Bundling ESM -> CJS
console.log("🔨 Bundling main.js with esbuild...");
try {
    execSync('npx esbuild src/main.js --bundle --platform=node --target=node18 --outfile=src/main.bundle.cjs --format=cjs --external:playwright --external:sharp --external:winston --external:open --external:csv-writer --external:tesseract.js', { stdio: 'inherit' });
    console.log("✅ Bundle créé.");
} catch (e) {
    console.error("❌ Erreur bundling.", e);
    process.exit(1);
}

// 2b. Lancer pkg avec un nom unique pour éviter EPERM
// 2b. Lancer pkg pour chaque cible
console.log("📦 Création des exécutables avec pkg...");

const targets = [
    { name: 'win', target: 'node18-win-x64', ext: '.exe' },
    { name: 'linux', target: 'node18-linux-x64', ext: '' },
    { name: 'macos-intel', target: 'node18-macos-x64', ext: '' },
    { name: 'macos-arm', target: 'node18-macos-arm64', ext: '' }
];

targets.forEach(t => {
    const targetPackageName = `sparklane-bot-${t.name}_${timestamp}`;
    const targetPackageDir = path.join(distDir, targetPackageName);
    const tempExeName = `bot_${t.name}_${timestamp}${t.ext}`;
    const finalExeName = `sparklane-bot${t.ext}`;

    console.log(`\n🔹 Construction pour systeme : ${t.name.toUpperCase()}`);

    // Créer dossier package
    fs.mkdirSync(targetPackageDir, { recursive: true });

    try {
        // Build EXE via pkg
        console.log(`   [PKG] Generation de ${tempExeName}...`);
        execSync(`npx pkg . --targets ${t.target} --output dist/${tempExeName}`, { stdio: 'inherit' });

        // Move EXE
        const srcPath = path.join(distDir, tempExeName);
        const destPath = path.join(targetPackageDir, finalExeName);

        if (fs.existsSync(srcPath)) {
            // Retry loop for Windows locking issues
            let retries = 5;
            while (retries > 0) {
                try {
                    fs.renameSync(srcPath, destPath);
                    console.log(`   ✅ Exécutable déplacé vers ${targetPackageDir}`);
                    break;
                } catch (err) {
                    if (err.code === 'EBUSY' && retries > 0) {
                        console.log(`   ⏳ Fichier verrouillé, nouvelle tentative...`);
                        const start = Date.now();
                        while (Date.now() - start < 1000) { }
                        retries--;
                    } else {
                        throw err;
                    }
                }
            }
        } else {
            console.error(`❌ Erreur: L'exécutable ${tempExeName} n'a pas été créé.`);
        }

        // Copie des assets
        console.log("   📂 Copie des fichiers natifs et configs...");
        packageMap.forEach(item => {
            const dest = item.dest.replace(packageDir, targetPackageDir); // Remplace le chemin base
            // Recalculer le chemin de destination correct
            const relativeDest = path.relative(packageDir, item.dest);
            const verifiedDest = path.join(targetPackageDir, relativeDest);

            if (fs.existsSync(item.src) && fs.lstatSync(item.src).isFile()) {
                fs.mkdirSync(path.dirname(verifiedDest), { recursive: true });
                fs.copyFileSync(item.src, verifiedDest);
            } else {
                copyFolderSync(item.src, verifiedDest);
            }
        });

        // Créer .env
        const envContent = `BASE_URL=https://predict.sparklane.fr
LIST_NAME=PROSPECTION SANS M2
USER_DATA_DIR=./chrome-profile
HEADLESS=${t.name === 'linux' ? 'true' : 'false'}
`;
        fs.writeFileSync(path.join(targetPackageDir, '.env'), envContent);
        console.log("   ✅ .env créé.");

        // Copier README
        const readmeClientPath = path.join(__dirname, 'README_CLIENT.md');
        if (fs.existsSync(readmeClientPath)) {
            fs.copyFileSync(readmeClientPath, path.join(targetPackageDir, 'README.md'));
            console.log("   ✅ README client copié.");
        }

    } catch (e) {
        console.error(`❌ Erreur build ${t.name}:`, e.message);
    }
});

console.log("\n🚀 BUILD GLOBAL TERMINÉ !");
console.log(`Les packs sont dans : ${distDir}`);
