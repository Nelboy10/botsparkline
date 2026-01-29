# Sparklane Bot - Guide Client

Ce logiciel permet d'extraire automatiquement des contacts de Sparklane.

## 🚀 Lancement Rapide

1.  **Décompressez** le dossier `sparklane-bot-client`.
2.  Double-cliquez sur **`sparklane-bot.exe`**.
3.  Une fenêtre s'ouvre. Attendez qu'elle affiche :
    `Dashboard Backend prêt sur http://localhost:3001`
4.  Votre navigateur va s'ouvrir automatiquement sur le tableau de bord.

## 📦 Installation sur un autre PC

Le bot a besoin de ses fichiers pour fonctionner. Pour le déplacer :
1. **Copiez L'INTÉGRALITÉ du dossier** qui contient le `.exe` (avec les dossiers `node_modules`, `browsers`, `public`, etc.).
2. **Ne copiez pas juste le fichier `.exe` !**
3. Sur le nouveau PC, lancez `sparklane-bot.exe` depuis ce dossier complet.

## 🛠️ Utilisation

1.  **Connexion** : Lors du premier lancement, le bot ouvrira une fenêtre Sparklane. Connectez-vous normalement. Une fois connecté, revenez sur la page du tableau de bord et appuyez sur le bouton bleu **"Entrée (Login)"**. Le bot retiendra votre connexion.
2.  **Lancer l'extraction** : Cliquez sur **"Lancer Extraction"** pour démarrer le processus complet.
3.  **Récupérer les résultats** : Cliquez sur le bouton **"CSV"** sur le tableau de bord pour télécharger vos contacts.

## 💡 Notes importantes

- **Internet** : Une connexion internet est requise. Au premier lancement, le bot téléchargera le navigateur nécessaire (environ 100 Mo).
- **Fichiers** : Le bot crée un fichier `contacts.csv` et un dossier `browsers` dans le dossier courant. Ne les supprimez pas si vous voulez garder vos données et votre navigateur prêt.
- **Port** : Le logiciel utilise le port `3001` de votre ordinateur.

En cas de blocage, fermez simplement la fenêtre noire et relancez le `.exe`.
