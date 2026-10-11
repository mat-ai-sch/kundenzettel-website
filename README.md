# Kundenzettel-Website

Dies ist das öffentliche Quellcode-Repository für die Kundenzettel-Landingpage. Die React-/Vite-Anwendung liegt in `portal/` und wird als statische Vorschau ohne Live-Kundendaten auf GitHub Pages veröffentlicht.

Der vollständige Projektstand einschließlich des geschützten Workers und der Weiterentwicklungsplanung liegt im privaten Repository `Moinwerk/Kundenzettel`. Änderungen an der Website müssen in beiden Repositories abgeglichen werden, bis ein automatischer Abgleich eingerichtet ist.

Für die lokale Prüfung Node.js 22 verwenden:

```sh
cd portal
npm ci
npm run lint
npm test
VITE_RUNTIME_MODE=preview VITE_BASE_PATH=/ npm run build
```

Die Veröffentlichung umfasst ausschließlich `portal/dist`. Die geschützte Betreiber-App und die API werden dadurch nicht veröffentlicht.
