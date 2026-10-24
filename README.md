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

## Domains und alte Browseransichten

`kundenzettel.de` ist die kanonische Website, `www.kundenzettel.de` leitet dorthin weiter. Beide verwenden GitHub Pages; Cloudflare verwaltet DNS und IONOS die Domainregistrierung. GitLab besitzt keine Domainbindung mehr und veröffentlicht nicht mehr.

Die öffentliche Website registriert keinen Offline-Worker mehr. `portal/public/sw.js` löst bestehende Root-Registrierungen ab, ohne lokale Browserdaten zu löschen. Der direkte Einstieg https://kundenzettel.de/_v/update.html umgeht den früheren Dokument-Cache. Die getrennte Demo liegt ausschließlich unter https://demo.kundenzettel.de/.
