# Kundenzettel

Öffentliche WhatsApp-Vorschau (weitere Bereiche gesperrt).

## Lokal

```bash
cd portal
npm install
npm run dev
```

Vollzugriff lokal (Standard). Für die gesperrte Vorschau:

```bash
VITE_PUBLIC_SURFACE=whatsapp npm run dev
```

## GitHub Pages

Der Workflow baut mit `VITE_PUBLIC_SURFACE=whatsapp`,
`VITE_RUNTIME_MODE=preview` und `VITE_BASE_PATH=/` und veröffentlicht
`portal/dist` unter `https://kundenzettel.de/`.
