# Die Browser-Demo auf GitHub öffnen

## Was ist GitHub Pages?

GitHub Pages stellt die Dateien dieses Repositories als kleine Website bereit.
Du bekommst danach einen Link, den du ganz normal im Browser öffnen kannst.
Dein PC muss dafür nicht laufen, und du brauchst weder Node.js noch einen
eigenen Webserver zu installieren.

Hier veröffentlicht Pages **nur unsere interaktive Modul-Demo**: Karte,
Marker, Dossiers, Districts, Routen und umschaltbare SL-/Spieleransichten.
Es ist **kein Foundry-Server**. Eine echte gemeinsame Spielrunde benötigt
weiterhin deine Foundry-Installation und eine gültige Foundry-Lizenz.

## 1. Die neuen Dateien müssen zuerst auf GitHub sein

Die Änderungen aus dieser Copilot-Arbeitskopie sind nicht automatisch auf
GitHub. Solange sie nur lokal vorliegen, kann GitHub die neue Demo nicht bauen.

Die Dateien müssen zunächst committed und gepusht und anschließend nach
`main` übernommen werden, normalerweise über einen Pull Request.
Zu ihnen gehört insbesondere `.github/workflows/pages.yml`.
Erst danach ist der folgende Ablauf vollständig im GitHub-Webinterface
verfügbar. Diese Anleitung selbst führt **keinen Push, Merge oder
Deployment** aus.

## 2. Pages einmalig einschalten

1. Öffne dein Repository:
   https://github.com/DominikGursch/foundry-neon-dossiers
2. Klicke oben auf **Settings**.
3. Wähle links unter **Code and automation** den Eintrag **Pages**.
4. Suche den Abschnitt **Build and deployment**.
5. Wähle bei **Source** die Option **GitHub Actions**.

Du musst **keinen Branch namens `gh-pages`** anlegen und auch **keinen
`/docs`-Ordner als Veröffentlichungsquelle** auswählen. Unser vorhandener
Workflow erledigt das Erstellen und Veröffentlichen der Website.
Wenn GitHub dir Vorlagen wie „Static HTML“ anbietet, brauchst du keine neue
Vorlage zu erstellen: `pages.yml` ist bereits eingerichtet.

Die Einstellung erfordert passende Repository-Berechtigungen.
Wenn **Pages** fehlt oder deaktiviert ist, prüfe die Repository-Berechtigungen,
deinen GitHub-Tarif und gegebenenfalls Organisationsrichtlinien. Aktiviere
nicht versehentlich ein kostenpflichtiges Angebot.

## 3. Die Demo veröffentlichen

Nach neuen Änderungen auf `main` startet die Veröffentlichung automatisch.
Falls der erste Lauf bereits vor dem Einschalten von Pages fehlgeschlagen ist,
starte ihn erneut:

1. Öffne oben im Repository den Reiter **Actions**.
2. Wähle links **Deploy browser preview**.
3. Klicke rechts **Run workflow**.
4. Lass bei **Branch** zunächst **main** ausgewählt.
5. Bestätige mit dem grünen Button **Run workflow**.
6. Öffne den neu gestarteten Lauf und warte, bis **build** und **deploy**
   grüne Häkchen anzeigen.

„Workflow“ bedeutet hier einfach: GitHub führt unsere vorbereiteten Schritte
aus. Dabei werden erst die Tests ausgeführt, dann die statische Demo gebaut
und anschließend bei Pages veröffentlicht.

Wenn **Run workflow** oder der Workflow fehlt, kontrolliere, ob die
Workflow-Datei bereits auf `main` liegt, Actions erlaubt sind und du
Schreibzugriff hast. Ein Pull Request allein veröffentlicht noch keine
Pages-Demo.

## 4. Den richtigen Link öffnen

Im erfolgreichen Workflow-Lauf zeigt der Schritt **Deploy** die URL der
Website an. Alternativ findest du sie unter **Settings > Pages** bei
**Your site is live at** / **Visit site** oder im Deployment **github-pages**.

Nimm **diesen von GitHub angezeigten Link**. Der Link zur Repository-Datei
`preview/index.html` ist nicht die Demo: GitHub zeigt dort nur ihren Quelltext.

## 5. Die Demo ausprobieren

- Demo und Modul enthalten ausschließlich **Community Night City 2045**;
  die übrigen Karten und die Kartenauswahl sind entfernt.
- Eine neue oder zurückgesetzte Demo startet auf der **Community-Karte ohne
  Dossiers**. Community-Daten bleiben erhalten; alte Kartenkonfigurationen
  und automatisch angelegte Beispiele anderer Karten werden entfernt.
  Eigene Dossiers werden nicht auf eine andere Karte umgerechnet.
  Optional **SL-WERKZEUGE > Beispieldossiers hinzufügen** bestätigen und die gewünschten
  Dossiers freigeben. Die Community-Karte hat keine aufgedruckten POI-Marker
  und keine schwarzen Seitenstreifen. Sie startet ohne interaktive POIs;
  mit **SL-WERKZEUGE > Ort hinzufügen** legt die Spielleitung eigene Orte an.
- Einen nummerierten Marker anklicken: Rechts öffnet sich sein Dossier.
  Die Marker sind kompakte rechteckige Terminal-Tags. Die Kartenansicht
  bleibt über die Ränder der Bedienelemente hinweg sichtbar. Dezente Scanlines,
  leichtes Signalflackern und ein langsam wanderndes Scanband erzeugen einen
  Bildschirm-Look, ohne Karte oder Bedienelemente zu verschieben. Reduzierte
  Bewegung und erhöhter Kontrast deaktivieren die Bildschirm-Effekte.
- Mit **Dossier bearbeiten** lässt sich der Marker auf der Karte ziehen
  oder mit den Pfeiltasten verschieben. Erst **Dossier speichern** übernimmt
  die neue Position. Ein vorhandener Straßenzugang muss nach dem Verschieben
  gegebenenfalls neu gezeichnet werden; **Abbrechen** erhält die alten Daten.
  Auch beim Anlegen oder Bearbeiten lässt sich die Karte durch Ziehen
  verschieben; ein einzelner Klick setzt den Marker.
- Einen District auswählen: Rechts erscheinen Threat Level, Fraktionen und
  die für diese Ansicht sichtbaren POIs. Eine dezente neongelbe Fläche und
  ein gelb-schwarzer Rand mit laufenden Streifen im Absperrband-Stil zeigen den
  District. Bei reduzierter Bewegung bleibt der Rand statisch.
- Unter **SL-WERKZEUGE > Kategorien verwalten** eigene Kategorien mit Namen
  und Farben anlegen oder die vier Startkategorien ändern. Erst **Kategorien
  speichern** übernimmt sie für Filter, Marker und Dossiers. Vor dem Löschen
  einer Kategorie alle zugehörigen Dossiers umsortieren; auch private Dossiers
  zählen. Mindestens eine Kategorie bleibt erhalten. Namen und Farben sind
  auch für Spieler sichtbar; die Dossierfreigaben bleiben unverändert.
  Nach dem Auswählen eines Werkzeugs klappt das SL-Menü automatisch ein.
- Unter **Karte und Districts** Eckpunkte direkt ziehen, kleine Zwischenpunkte
  zum Einfügen anklicken und ausgewählte Ecken mit **Entf** oder **Eckpunkt löschen**
  entfernen. **Rückgängig / Wiederholen** korrigieren Änderungen.
  Beim Zeichnen setzt ein Klick eine Ecke; Ziehen verschiebt die Karte.
  Auf den ersten Punkt klicken oder **Grenze fertig** wählen, um die Form
  zu schließen. Erst **Konfiguration speichern** übernimmt die Änderungen.
- **Route / Orte** öffnen, einen Startort und eine Fortbewegung auswählen
  und anschließend einen Zielmarker anklicken oder das Ziel im Menü auswählen.
  Die Route wird direkt auf der simulierten Kartenszene dargestellt, ohne
  zusätzliches Journal- oder Modulfenster.
  **Bike** bezeichnet ein Motorrad. Auto und Bike nutzen Fahrstraßen; liegt
  der Start auf einem Parkweg, wird ein gelber Fußweg bis zur Fahrstraße
  eingeplant. Bewegte Linienimpulse und ein Zielpfeil zeigen die Reiserichtung.
- Bodenrouten benötigen erfasste Straßen und angebundene Orte. Beispielorte
  sind keine geprüften Straßeneingänge: bei Bedarf im Dossiereditor **Zugang
  auf Karte zeichnen**, begehbare Wegpunkte setzen und mit einem roten
  Straßenknoten abschließen. Alternativ neue Orte direkt an erfasste Straßen
  setzen (maximal 20 m Einrastabstand). Freie Verbindungen quer über Wasser
  werden nicht mehr automatisch gezeichnet.
- Unter **SL-WERKZEUGE > Straßennetz bearbeiten** Punkte ziehen oder
  Abschnitte anklicken und Richtung je Fortbewegung wählen. Per Doppelklick
  auf einen Abschnitt oder mit **Punkt einfügen** lässt sich ein Punkt
  ergänzen. **Straße einzeichnen** verbindet neue und vorhandene Punkte.
  Änderungen werden erst mit **Straßennetz speichern** übernommen.
  Dossiermarker sind währenddessen ausgeblendet und verdecken keine Straßenpunkte.
- **Netz prüfen** zeigt verbundene Netzteile, Endpunkte und unverbundene
  geometrische Kreuzungen. Das Community-Netz enthält 696 Knoten und 995 Abschnitte,
  ist aber **keine vollständige Erfassung sämtlicher Straßen und Gassen**.
- Bereits gespeicherte eigene Netze werden nicht automatisch ersetzt.
  Zum Aktualisieren im Editor ausdrücklich **Aktuelles Vorlagen-Straßennetz
  übernehmen** bestätigen und anschließend speichern. Nur die Straßen dieser Kartenfamilie werden ersetzt; bestehende
  Ortszugänge müssen anschließend kontrolliert werden.
- Auf **Spieler / Player** umschalten, um die eingeschränkte Ansicht zu sehen.
- Den Kartenhintergrund ziehen, um ihn zu verschieben; mit dem Mausrad oder
  unten links mit **+ / -** zoomen. Dossierkarten und SL-Editor liegen rechts
  direkt über der Szene. In echtem Foundry gelten dessen Canvas-Steuerungen.

Der SL-/Spielerwechsel ist nur eine lokale Simulation. Alle Demodaten liegen
in deinem Browser, nicht in einer gemeinsamen Foundry-Welt. Andere Besucher
sehen deine Änderungen nicht. **Demo zurücksetzen / Reset** stellt den
Startzustand in diesem Browser wieder her. Keine geheimen Kampagneninfos
in eine öffentliche Demo eintragen.

## Falls ein rotes Kreuz erscheint

Öffne den fehlgeschlagenen Lauf unter **Actions**, dann den roten Job und
den rot markierten Schritt. Die dortige Fehlermeldung unterscheidet etwa:
Pages noch nicht aktiviert, fehlende Berechtigungen oder ein fehlgeschlagener
Test. Ein erneuter Versuch behebt keine fehlende Pages-Einstellung.
Wenn `deploy` auf eine Freigabe wartet, muss die zuständige Person das
Deployment im Environment `github-pages` genehmigen.

Nach einer erfolgreichen Veröffentlichung lädt GitHub bei künftigen
Änderungen an `main` automatisch die neue Version hoch. Falls dein Browser
noch einen älteren Stand zeigt, lade die Seite vollständig neu.
