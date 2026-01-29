# Instructions : Sparklane Bot Exécutable

L'application a été compilée en un fichier exécutable autonome.

## Emplacement
L'exécutable se trouve dans le dossier `dist/` :
> **sparklane-bot.exe**

## Démarrage
1. Double-cliquez sur `sparklane-bot.exe`.
2. Une fenêtre de console s'ouvrira (c'est le serveur interne).
3. Le navigateur Chrome se lancera automatiquement.
4. L'interface de pilotage (GUI) s'ouvrira dans votre navigateur par défaut (http://localhost:3001).

## Configuration
Le fichier de configuration des sélecteurs est accessible et modifiable **sans recompiler** :
> `dist/config/selectors.json`

Si vous modifiez ce fichier, relancez simplement l'exécutable pour prendre en compte les changements.

## Mise à jour (Build)
Si vous modifiez le code source (dossier `src`), vous devez recréer l'exécutable :
```bash
npm run build-exe
```
Cela mettra à jour le dossier `dist`.
