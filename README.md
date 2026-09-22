FANTASY LIGA ELITE 1.0 – V100
================================
Finaler integrierter Release auf Basis von V99.

ENTHALTEN
- V83 Match Engine 2.0
- V84 kohärentes Angriffssystem
- V85 Taktik & Spielstand
- V86 Spieler-Identität
- V87 Abschlüsse & Torhüter
- V88 Match-Atmosphäre
- V89 Manager-Zentrale
- V90 Vereinswelt
- V91 Fußballwelt
- V92 Pokal & Auf-/Abstieg
- V93 Historie
- V94 Statistik-Zentrale
- V95 News-System
- V96 Mobile App Polish
- V97 Save-System 2.0
- V98 Transfers & Spielerentwicklung
- V99 Balance & QA
- V100 Release-Integration

V100
- Eigene Release-Zentrale mit Systemcheck.
- V98 Transferbewegungen werden in die sichtbare V100-Kaderstruktur integriert.
- Verkaufte Spieler verschwinden aus dem aktiven Kader-Overlay.
- Verpflichtete Spieler werden im eigenen Kader-Overlay geführt.
- Entwicklungswerte fließen in die V100-Kaderstärke ein.
- Bestehende Legacy-Saves bleiben unangetastet/kompatibel.
- Save-Exporte erhalten Release-Metadaten 1.0.0.
- Keine neue experimentelle Großfunktion kurz vor Release.

HOTFIX 100.1
- Kritischen Startfehler behoben: doppelte Top-Level-Funktion openPlayerProfile.
- V90-Seitenprofil heißt intern nun openV90PlayerProfile.
- Legacy-Modalprofil behält openPlayerProfile.
- Neue aktive Datei app1001.js + Cache-Busting ?v=100.1.
- Bestehender lokaler Spielstand wird nicht gelöscht.

HOTFIX V100.2 – START/RECOVERY
- Behebt den Startfehler "undefined is not an object (evaluating state.leagues)".
- Prüft den geladenen Karriere-Spielstand vor dem Start auf leagues + teams.
- Recovery-Reihenfolge: letzter guter IndexedDB-Save -> Auto-Backup -> V97/V100 Save-Slot -> Legacy-Save -> seed.json.
- Defekte Daten werden nicht blind gelöscht.
- Kein Klick auf "Lokale Daten zurücksetzen" erforderlich.
- app1002.js + Cache-Busting v=100.2.
