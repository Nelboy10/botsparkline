# Sparklane Extraction Bot - Guide d'Utilisation

Ce logiciel est un robot automatique qui permet d'extraire les contacts d'entreprises depuis Sparklane et de les sauvegarder dans un fichier Excel (CSV).

---

## Partie 1 : Installation (À faire une seule fois)

Si vous venez de recevoir ce dossier sur un nouvel ordinateur, suivez ces étapes :

### 1. Installer Node.js
Le robot a besoin du moteur "Node.js" pour fonctionner.
1.  Allez sur le site officiel : <https://nodejs.org/>
2.  Téléchargez la version LTS (Recommandée).
3.  Lancez l'installation et cliquez sur "Suivant" jusqu'à la fin.
4.  Une fois fini, redémarrez votre ordinateur.

### 2. Préparer le Robot
1.  Ouvrez le dossier du robot (là où se trouve ce fichier README).
2.  Faites un clic droit dans un espace vide du dossier > "Ouvrir dans le terminal" (ou "Ouvrir une fenêtre PowerShell ici").
    *   Astuce : Si vous ne trouvez pas, tapez `cmd` dans la barre d'adresse en haut du dossier et appuyez sur Entrée.
3.  Une fenêtre noire s'ouvre. Tapez (ou copiez-collez) la commande suivante et appuyez sur Entrée :
    ```bash
    npm install
    ```
4.  Attendez que ça finisse (des barres de progression vont s'afficher). Quand c'est fini, vous pouvez fermer la fenêtre.

---

## Partie 2 : Utilisation Quotidienne

Pour lancer le robot, c'est très simple :

1.  Ouvrez le dossier du robot.
2.  Ouvrez le terminal (Clic droit > Ouvrir le terminal OU tapez `cmd` dans la barre d'adresse).
3.  Tapez cette commande et validez :
    ```bash
    npm run gui
    ```
4.  Une ligne va s'afficher : `Dashboard Backend prêt sur http://localhost:3001`
5.  Ouvrez votre navigateur internet (Chrome, Edge...) et allez à l'adresse :
    **<http://localhost:3001>**

---

## L'Interface de Contrôle (Dashboard)

Une fois sur la page web, tout se passe ici :

### 1. Connexion (Première fois)
Le robot va ouvrir une fenêtre Chrome.
- Connectez-vous à Sparklane avec vos identifiants.
- Une fois connecté, revenez sur le Dashboard et cliquez sur le bouton "Entrée (Login)" (ou appuyez sur Entrée dans la fenêtre noire).
- Le robot va mémoriser votre connexion pour la prochaine fois.

### 2. Choisir la Liste
- En haut, une case "Nom de la liste" vous permet de dire quelle liste viser.
- Exemple : `PROSPECTION SANS M2`
- Si vous laissez vide, il prendra une liste par défaut.

### 3. Lancer l'Extraction
Vous avez deux boutons :
- **Test (10 items)** : Rapide, pour vérifier que tout marche. Il fera 10 entreprises et s'arrêtera.
- **Lancer Extraction** : Le mode complet. Il scannera toute la liste (jusqu'à 7400+ entreprises) en descendant petit à petit.

### 4. Récupérer les Résultats
Les contacts s'affichent en temps réel dans le tableau du bas.
- Cliquez sur le bouton **"CSV"** pour télécharger le fichier Excel/CSV complet.
- Le fichier s'appelle `contacts.csv` et se trouve aussi dans le dossier du robot.

---

## En cas de problème

**"Le robot dit qu'il est déjà en cours ?"**
Cela arrive si on rafraichit la page pendant qu'il travaille.
-> Fermez la fenêtre noire (terminal), et relancez `npm run gui`.

**"Il ne trouve pas la liste ?"**
Vérifiez que vous avez bien écrit le nom EXACT de la liste dans la case (Majuscules/Minuscules importantes).

**"Il s'arrête de scroller ?"**
Le robot est programmé pour insister 5 fois (environ 1 minute) si la page met du temps à charger. S'il s'arrête vraiment, c'est qu'il pense être arrivé au bout. Relancez-le, il reprendra (il évite automatiquement les doublons déjà faits dans la session).

---

*Bonne prospection !*
