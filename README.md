# Zenoria — Boutique Luxe + Zen

Prototype e-commerce pour la marque **Zenoria**, bagues artisanales en cristaux Swarovski.

## 🚀 Déployer en ligne gratuitement (Vercel) — étape par étape

### Étape 1 — Créer un compte Vercel
1. Va sur https://vercel.com
2. Clique sur **Sign Up**
3. Choisis **Continue with GitHub** (le plus simple, gratuit, sans carte bancaire)

### Étape 2 — Mettre le projet sur GitHub
1. Crée un compte sur https://github.com si tu n'en as pas
2. Crée un nouveau dépôt (repository), par exemple `zenoria-boutique`
3. Sur ton PC, dans le dossier du projet dézippé, exécute :
   ```bash
   git init
   git add .
   git commit -m "Premier déploiement Zenoria"
   git branch -M main
   git remote add origin https://github.com/TON-COMPTE/zenoria-boutique.git
   git push -u origin main
   ```
   (Remplace `TON-COMPTE` par ton nom d'utilisateur GitHub)

### Étape 3 — Importer le projet dans Vercel
1. Dans Vercel, clique sur **Add New... → Project**
2. Sélectionne le dépôt `zenoria-boutique`
3. Vercel détecte automatiquement **Next.js** — ne change rien
4. Clique sur **Deploy**

### Étape 4 — Récupérer ton URL
Après 1 à 2 minutes, Vercel te donne une URL du type :
```
https://zenoria-boutique.vercel.app
```
C'est ton site, en ligne, public et gratuit. Chaque fois que tu modifies le code et fais un `git push`, le site se met à jour automatiquement.

---

## 🖼️ Ajouter tes vraies photos et vidéos

Dans le dossier `public/images/`, tu trouveras un sous-dossier par collection :

```
public/images/
├── bleu-de-mer/
├── bleu-saphir/
├── bleu-violette/
├── bleue/
├── chocolat/
├── citron/
├── rose/
├── rose-bonbon/
├── verte/
└── violette/
```

Dépose simplement tes fichiers (mêmes noms que dans ton dossier `C:\Users\RH5514\Downloads\Bagues`) dans le sous-dossier correspondant. Le site les affichera automatiquement à la place du visuel graphique de remplacement — aucune modification de code n'est nécessaire, les noms de fichiers sont déjà renseignés dans `pages/index.js`.

Pour les vidéos, tu pourras les intégrer dans les fiches produits en ajoutant une balise `<video>` pointant vers `/images/<collection>/<nom-du-fichier>.mp4` (je peux le faire pour toi sur demande).

---

## 💻 Tester en local (optionnel)

Si tu as Node.js installé :

```bash
npm install
npm run dev
```

Puis ouvre http://localhost:3000

---

## 📁 Structure du projet

```
zenoria/
├── pages/
│   ├── _app.js
│   └── index.js          ← page principale (catalogue, panier, quiz...)
├── components/ui/        ← Button et Card
├── public/images/         ← tes photos/vidéos par collection
├── styles/globals.css
├── package.json
└── tailwind.config.js
```
