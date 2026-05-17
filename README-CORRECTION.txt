Correction Vue3DTshirt v2

Remplace uniquement ces 2 fichiers dans ton CRM :

src/components/Vue3DTshirt.jsx
src/components/Vue3DTshirt.css

Ne remplace pas App.jsx et ne touche pas à Vue3D.jsx du mug.

Corrections :
- le t-shirt ne change plus de couleur pendant le déplacement d'un logo
- sélection séparée des logos et textes
- plusieurs logos et textes possibles en même temps
- redimensionnement individuel avec une poignée bleue en bas à droite
- possibilité de placer sur avant, dos, manche gauche, manche droite ou texture complète
- import de police personnalisée .ttf, .otf, .woff, .woff2

Relancer ensuite :
Ctrl+C
npm run dev
