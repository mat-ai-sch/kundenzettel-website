export type InfoTopic = {
  id: string
  title: string
  question: string
  answer: string
  emphasis?: string
}

export const infoTopics: InfoTopic[] = [
  { id: 'kundenzettel', title: 'Wofür Kundenzettel gedacht ist', question: 'Was ist Kundenzettel?', answer: 'Kundenzettel bindet deine WhatsApp-Kommunikation in deine Arbeitsansicht ein. Dort siehst du die Gespräche mit deinen Kunden. Zu jedem Chat kannst du einen Auftrag anlegen und später im Archiv wiederfinden.' },
  { id: 'nachrichten', title: 'Nachrichten bearbeiten', question: 'Was passiert mit einer Nachricht?', answer: 'Du kannst Nachrichten senden und löschen. Über die Suchleiste findest du Chats, Gruppen und Nachrichten wieder. Zustellungs- und Lesestatus werden nur angezeigt, wenn dein Kunde diese Bestätigungen in WhatsApp aktiviert hat.' },
  { id: 'entwurf', title: 'Aus dem Chat wird ein Entwurf', question: 'Wie entsteht ein Auftragsentwurf?', answer: 'Kundenzettel sucht im Chat nach Angaben wie Produkt, Farbe, Termin oder Preis. Diese Angaben erscheinen in einer Auftragsvorlage. Du prüfst sie und kannst sie ergänzen oder ändern.' },
  { id: 'archiv', title: 'Aufträge mit Kontakt ablegen', question: 'Wie kommt ein Auftrag ins Archiv?', answer: 'Die Auftragsvorlage steht im Seitenbereich. Du kannst jeden Eintrag bearbeiten. Der Erfolgsscore zeigt in Prozent, wie gut Kundenzettel die auftragsrelevanten Angaben im ausgewählten Chatabschnitt erkannt hat. Mit „Auftrag erstellen“ wird dieser Abschnitt dem Auftrag zugeordnet und mit ihm gespeichert. Spätere Anfragen desselben Kunden ändern einen bereits archivierten Auftrag nicht.' },
  { id: 'status', title: 'Auftragsstatus', question: 'Welche Auftragsstatus gibt es?', answer: 'Jeder Auftrag hat einen Status. Du kannst zwischen Anfrage, Angebot, Bestätigt, In Arbeit und Fertig wählen. Der aktuelle Stand bleibt am Auftrag sichtbar.', emphasis: 'Anfrage, Angebot, Bestätigt, In Arbeit und Fertig' },
  { id: 'gruppen', title: 'Chatgruppen', question: 'Wie funktionieren Chatgruppen?', answer: 'Du kannst Chats Gruppen zuordnen. Über den Filter Gruppen blendest du diese Unterhaltungen in der Chatliste ein.' },
  { id: 'fixieren', title: 'Chat fixieren', question: 'Wie fixiere ich einen Chat?', answer: 'Fixierte Chats stehen oben in der Chatliste. Du kannst die Fixierung jederzeit wieder entfernen.' },
  { id: 'sprachnachrichten', title: 'Sprachnachrichten und Texttranskript', question: 'Wie werden Sprachnachrichten angezeigt?', answer: 'Du kannst Sprachnachrichten im Chat anhören. Für jede Sprachnachricht kann optional ein Transkript erstellt werden. Wenn ein Transkript vorliegt, erscheint der gesprochene Text bei der Nachricht.' },
  { id: 'loeschen', title: 'Chatdaten löschen', question: 'Wie lösche ich einen Chat?', answer: 'Du kannst einzelne Nachrichten löschen oder einen vollständigen Chat entfernen. Dateien, die nur zu diesem Chat gehören, werden dabei ebenfalls gelöscht.' },
]

export const infoExampleQuestions = [
  'Was ist Kundenzettel?',
  'Wie entsteht ein Auftragsentwurf?',
  'Wie kommt ein Auftrag ins Archiv?',
]

export type InfoQaAnswer = {
  answer: string
  sources: string[]
  suggestions: string[]
}

function findLocalTopic(question: string) {
  const folded = question.toLocaleLowerCase('de-DE')
  return infoTopics.find((topic) =>
    topic.title.toLocaleLowerCase('de-DE').split(' ').some((word) => word.length > 4 && folded.includes(word)),
  ) ?? infoTopics.find((topic) => folded.includes(topic.question.toLocaleLowerCase('de-DE').replace('?', '')))
}

/** Local preview never sends a question outside the browser. */
export function localInfoAnswer(question: string): InfoQaAnswer {
  const topic = findLocalTopic(question)
  if (!topic) {
    return {
      answer: 'Dazu findest du hier keine verlässliche Information. Schreib uns bitte an info@kundenzettel.de.',
      sources: [],
      suggestions: infoExampleQuestions,
    }
  }
  return { answer: topic.answer, sources: [topic.title], suggestions: infoExampleQuestions.filter((item) => item !== topic.question) }
}
