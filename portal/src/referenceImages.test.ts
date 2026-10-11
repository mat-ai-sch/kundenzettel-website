import {
  isCommerciallyUsableLicense,
  formatAttribution,
  referenceQueryForKind,
  orderedReferenceQueriesForKind,
  isRelevantReferenceImage,
  validateReferenceImage,
  type ReferenceImage,
} from './referenceImages'
import { detectFloristryProduct } from './floristryLexicon'

function assert(condition: unknown, message: string) {
  if (!condition) {
    console.error(`FAIL  ${message}`)
    process.exitCode = 1
    return
  }
  console.log(`ok    ${message}`)
}

{
  assert(isCommerciallyUsableLicense('cc0'), 'cc0 erlaubt')
  assert(isCommerciallyUsableLicense('CC0'), 'CC0 erlaubt')
  assert(isCommerciallyUsableLicense('pdm'), 'pdm erlaubt')
  assert(isCommerciallyUsableLicense('Public domain'), 'Public domain erlaubt')
  assert(isCommerciallyUsableLicense('by'), 'by erlaubt')
  assert(isCommerciallyUsableLicense('by-sa'), 'by-sa erlaubt')
  assert(isCommerciallyUsableLicense('CC BY 4.0'), 'CC BY 4.0 erlaubt')
  assert(isCommerciallyUsableLicense('CC BY-SA 4.0'), 'CC BY-SA 4.0 erlaubt')
  assert(!isCommerciallyUsableLicense('by-nc-sa'), 'by-nc-sa gesperrt')
  assert(!isCommerciallyUsableLicense('CC BY-NC 4.0'), 'CC BY-NC gesperrt')
  assert(!isCommerciallyUsableLicense('by-nd'), 'by-nd gesperrt')
  assert(!isCommerciallyUsableLicense(''), 'leere Lizenz gesperrt')
}

{
  const sample: ReferenceImage = {
    id: 't1',
    title: 'Test',
    url: 'https://example.com/a.jpg',
    thumbUrl: 'https://example.com/a-t.jpg',
    license: 'CC BY 4.0',
    creator: 'Ada',
    source: 'commons',
    query: 'wreath',
  }
  assert(
    formatAttribution(sample) === 'Ada · CC BY 4.0 · Wikimedia Commons',
    'Attribution-Format',
  )
}

{
  assert(
    referenceQueryForKind('tuerkranz').includes('door'),
    'Türkranz-Query enthält door',
  )
  const hoopQ = referenceQueryForKind('blumenhoop')
  assert(
    /metal\s*ring|metallring|dried|trocken/i.test(hoopQ),
    'Blumenhoop-Query: Metallring/Trockenblumen',
  )
  assert(!/\bflower\s*hoop\b/i.test(hoopQ), 'Blumenhoop-Query: kein nacktes flower hoop')
  const straussQ = referenceQueryForKind('strauss')
  assert(straussQ.includes('bouquet'), 'Strauß-Query enthält bouquet')
  assert(straussQ.includes('hand') || straussQ.includes('stem'), 'Strauß-Query: gebunden/Stiele')
  assert(!/\bdried\b/.test(straussQ), 'Strauß-Query nicht als Trockenfeld')
  const straussQueries = new Set(
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => referenceQueryForKind('strauss', s)),
  )
  assert(straussQueries.size >= 2, 'Strauß-Query streut über Seeds')
  const orderedA = orderedReferenceQueriesForKind('blumenhoop', 'ord-1')
  const orderedB = orderedReferenceQueriesForKind('blumenhoop', 'ord-2')
  assert(orderedA.length >= 3, 'Blumenhoop: mehrere Query-Varianten')
  assert(
    orderedA[0] !== orderedB[0] || orderedA.join('|') !== orderedB.join('|'),
    'Query-Reihenfolge streut über Seeds',
  )
}

{
  const dress: ReferenceImage = {
    id: 'bad',
    title: 'Rococo hoop skirt gown on mannequin',
    url: 'https://example.com/dress.jpg',
    thumbUrl: 'https://example.com/dress.jpg',
    license: 'CC BY 4.0',
    creator: 'Museum',
    source: 'commons',
    query: 'flower hoop arrangement',
  }
  assert(!isRelevantReferenceImage('blumenhoop', dress), 'Relevanz: Reifrock/Kleid verworfen')
  const floral: ReferenceImage = {
    id: 'good',
    title: 'Dried flowers on metal ring wall decor',
    url: 'https://example.com/ring.jpg',
    thumbUrl: 'https://example.com/ring.jpg',
    license: 'CC0',
    creator: 'Florist',
    source: 'openverse',
    query: 'dried flowers on metal ring wreath',
  }
  assert(isRelevantReferenceImage('blumenhoop', floral), 'Relevanz: Metallring-Deko akzeptiert')

  const memorial: ReferenceImage = {
    id: 'mem',
    title:
      'Collinwood school fire memorial — teachers and children who lost their lives',
    url: 'https://example.com/memorial.jpg',
    thumbUrl: 'https://example.com/memorial.jpg',
    license: 'CC BY-SA 2.0',
    creator: 'Tim Evanson from Cleveland Heights, Ohio, USA',
    source: 'commons',
    query: 'dried flower wall wreath',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Collinwood_memorial.jpg',
  }
  assert(
    !isRelevantReferenceImage('wandkranz', memorial),
    'Validierung: Denkmal/Personenfoto als Wandkranz verworfen',
  )
  assert(
    !validateReferenceImage('wandkranz', memorial),
    'validateReferenceImage: Denkmal verworfen',
  )

  const cactusCheat: ReferenceImage = {
    id: 'cactus',
    title: 'Flowering cactus with pink blooms',
    url: 'https://example.com/cactus.jpg',
    thumbUrl: 'https://example.com/cactus.jpg',
    license: 'by-sa',
    creator: 'wallygrom',
    source: 'openverse',
    query: 'dried flower table wreath candle',
  }
  assert(
    !validateReferenceImage('tischkranz', cactusCheat),
    'Validierung: Kaktus trotz Kranz-Suchquery verworfen',
  )

  const wallWreath: ReferenceImage = {
    id: 'ww',
    title: 'Dried flower wall wreath with eucalyptus',
    url: 'https://example.com/wall-wreath.jpg',
    thumbUrl: 'https://example.com/wall-wreath.jpg',
    license: 'CC0',
    creator: 'Studio',
    source: 'openverse',
    query: 'dried flower wall wreath',
  }
  assert(
    validateReferenceImage('wandkranz', wallWreath),
    'Validierung: echter Wandkranz freigegeben',
  )
  assert(
    !validateReferenceImage('wandkranz', {
      ...wallWreath,
      title: 'Autumn park group photo near stone plaque',
      query: 'wall hanging',
    }),
    'Validierung: Gruppenfoto ohne Kranz verworfen',
  )

  const flowerBall: ReferenceImage = {
    id: 'ball',
    title: 'Three green and white flower balls on wooden dining table',
    url: 'https://example.com/balls.jpg',
    thumbUrl: 'https://example.com/balls.jpg',
    license: 'CC BY-SA 4.0',
    creator: 'Illuminat2k',
    source: 'commons',
    query: 'floral table centerpiece bowl',
  }
  assert(
    !validateReferenceImage('gesteck', flowerBall),
    'Validierung: Blütenkugeln sind kein Gesteck',
  )

  const realGesteck: ReferenceImage = {
    id: 'gest',
    title: 'Low floral table arrangement in ceramic bowl with oasis foam',
    url: 'https://example.com/gesteck.jpg',
    thumbUrl: 'https://example.com/gesteck.jpg',
    license: 'CC0',
    creator: 'Florist',
    source: 'openverse',
    query: 'Tischgesteck Steckmasse Schale Blumen',
  }
  assert(
    validateReferenceImage('gesteck', realGesteck),
    'Validierung: echtes Tischgesteck freigegeben',
  )
}

{
  const hoop = detectFloristryProduct('hättest du Luft für so einen Blumenhoop')
  assert(hoop?.kind === 'blumenhoop', 'Lexikon: Blumenhoop')
  const door = detectFloristryProduct('Ich bräuchte einen Türkranz für draußen')
  assert(door?.kind === 'tuerkranz' && door.inCollection === false, 'Lexikon: Türkranz off-collection')
  const table = detectFloristryProduct('lieber ein Tischgesteck bis Samstag')
  assert(table?.label === 'Tischgesteck', 'Lexikon: Tischgesteck')
  const catalog = detectFloristryProduct('nochmal den Blickfang bitte')
  assert(catalog?.label === 'Blickfang' && catalog.inCollection === true, 'Lexikon: Kollektion Blickfang')
  const deixis = detectFloristryProduct('dieser Goldring hier mit Pampas und Trockenblumen')
  assert(deixis?.kind === 'blumenhoop', 'Lexikon: Goldring+Pampas → Blumenhoop')
  const bouquet = detectFloristryProduct('Hallo Anna zur Zeit mache ich nur Sträuße')
  assert(bouquet?.kind === 'strauss' && bouquet.label === 'Strauß', 'Lexikon: Sträuße mit Umlaut')
  const blumen = detectFloristryProduct(
    'Derzeit arbeite ich nur mit Frischware und verkaufe Blumensträuße oder Einzelwerkstücke.',
  )
  assert(blumen?.kind === 'strauss', 'Lexikon: Blumensträuße als Compound')
  const loop = detectFloristryProduct('ich kann dir einen Loop mit Trockenblumen machen')
  assert(loop?.kind === 'blumenhoop', 'Lexikon: Loop allein → Blumenhoop')
  const herbst = detectFloristryProduct('Ich kann dir einen schönen Herbststrauß machen')
  assert(herbst?.kind === 'strauss', 'Lexikon: Herbststrauß → Strauß')
}

if (process.exitCode) {
  console.error('\nreference/lexicon tests failed')
  process.exit(1)
}
console.log('\nreference/lexicon tests passed')
