# Kundenzettel – öffentlicher Einstieg

`kundenzettel.de` und `www.kundenzettel.de` führen zur aktuellen Ansicht auf
https://demo.kundenzettel.de/#/gespraeche. Die frühere Marie-/Kranz-Landingpage,
ihr Quellcode, ihre Demo-App und ihre Medien sind aus dem aktuellen Stand entfernt.

## Ausschließliche Veröffentlichung über GitHub

- Dieses Repository veröffentlicht ausschließlich `site/` über GitHub Actions / Pages.
- Die aktuelle Gesprächsoberfläche wird separat aus `mat-ai-sch/kundenzettel-demo` veröffentlicht.
- Der Produktquellcode liegt in `Moinwerk/Kundenzettel`.
- Cloudflare verwaltet DNS und Zugangsschutz; IONOS bleibt Domainregistrar.
- Keine zusätzliche Buildquelle, Archiv-Ausgabe oder automatische Übernahme fremder Veröffentlichungen.

Die Pfade `/anbieter/`, `/impressum/`, `/datenschutz/` und `/dienst-datenschutz/`
bleiben erreichbar. Alte Rechtsseiten-Hashlinks werden auf diese Pfade umgesetzt.
`/_v/update.html` und `sw.js` lösen frühere Website-Offline-Caches ab; Cookies,
LocalStorage und geschützte Betreiber-Daten werden dabei nicht gelöscht.

## Prüfung und Nachweis

```sh
node --test scripts/entry.test.mjs
python scripts/verify-site.py
python -m http.server 4190 --directory site
```

Die CI prüft die erlaubten Dateien, Rechtsseiten und Weiterleitungen. Sie erzeugt
`release.json` mit dem GitHub-Commit und SHA-256-Prüfsummen. Der aktive Stand ist
unter https://kundenzettel.de/release.json nachprüfbar.
