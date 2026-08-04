# Package de production e-commerce

Le CRM assemble le package uniquement à la demande. Il ne réinterprète jamais le projet du client : les PNG 1:1, SVG, images et polices sont les octets originaux fournis par le site.

## Structure

```text
Commande_AC-XXXX.zip
├── Bon_Production.pdf
├── Projet.acproject
├── Preview_HD.png
├── Impression_1_1.png
├── Configurateur.json
├── Images/
├── SVG/
├── Fonts/
└── Manifest.json
```

Le manifest contient la commande, le client, les produits, la zone d'impression, les versions, l'inventaire des artefacts et un checksum SHA-256 pour chaque fichier.

## Workflow

1. Le site génère et stocke le snapshot, le projet, la preview HD et les exports 1:1 à 300 DPI/sRGB.
2. La synchronisation transmet des références signées ou des URLs accessibles au CRM.
3. La fiche contrôle la présence de chaque artefact.
4. Au clic, le CRM télécharge les originaux, génère le bon PDF et assemble le ZIP en mémoire.
5. Aucun export n'est généré avant une action explicite de l'opérateur.

## PNG, SVG, images et polices

Le PNG doit déjà porter les dimensions physiques et la résolution dans le snapshot (`210 × 90 mm`, `2480 × 1063 px`, `300 DPI` pour le mug). Le CRM n'effectue aucun redimensionnement. Les SVG et images sont copiés sans compression ni rasterisation. Une police n'est incluse que si le site a validé son droit d'export ; sinon le site doit fournir une version vectorisée de production.

## Reprise du configurateur

Le bouton n'est actif que si `ecommerce.resumeUrl` ou `ecommerce.configuratorUrl` est fourni. Cette URL doit restaurer le projet côté site avec son contrôle d'accès normal. Le CRM ne contourne jamais la RLS ni l'authentification du client.

## Package incomplet

Le package est signalé incomplet si le projet, le snapshot, la preview ou le PNG prêt à imprimer manque. L'opérateur peut consulter le détail, mais l'envoi Atelier reste soumis au contrôle de complétude existant.
