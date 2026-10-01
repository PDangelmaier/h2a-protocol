import { sanitizeInput } from './input-sanitizer.js'
import { filterPii } from './pii-filter.js'
import type { GoldenCase, PipelineInfo } from './golden-runner.js'

interface MockToolDef {
  name: string
  requiresConsent: string[]
  minPidScore: number
}

const MOCK_TOOLS: MockToolDef[] = [
  { name: 'vehicle.search', requiresConsent: [], minPidScore: 0 },
  { name: 'vehicle.details', requiresConsent: [], minPidScore: 0 },
  { name: 'vehicle.price', requiresConsent: [], minPidScore: 0 },
  { name: 'vehicle.status', requiresConsent: ['vehicle_data'], minPidScore: 60 },
  { name: 'vehicle.remote_climate', requiresConsent: ['vehicle_control'], minPidScore: 80 },
  { name: 'dealer.search', requiresConsent: [], minPidScore: 0 },
  { name: 'dealer.availability', requiresConsent: [], minPidScore: 0 },
  { name: 'dealer.book_testdrive', requiresConsent: ['marketing'], minPidScore: 30 },
  { name: 'financing.calculate', requiresConsent: [], minPidScore: 0 },
  { name: 'configurator.options', requiresConsent: [], minPidScore: 0 },
  { name: 'configurator.save', requiresConsent: ['configuration_storage'], minPidScore: 30 },
  { name: 'memory.store', requiresConsent: ['memory_storage'], minPidScore: 20 },
  { name: 'memory.recall', requiresConsent: ['memory_storage'], minPidScore: 20 },
  { name: 'memory.delete', requiresConsent: [], minPidScore: 0 },
]

const TOOL_KEYWORDS: Record<string, string[]> = {
  'vehicle.search': ['SUV', 'zeig mir', 'finde', 'alle', 'modelle', 'Limousinen', 'Kombis'],
  'vehicle.details': ['PS', 'Reichweite', 'Kofferraum', 'Geschwindigkeit', 'Motor', 'schnell'],
  'vehicle.price': ['kostet', 'Preis', 'unter', '€'],
  'vehicle.status': ['Ladestatus', 'Status meines', 'Fahrzeugdaten', 'Batteriestatus', 'Batterie'],
  'vehicle.remote_climate': ['Klimatisierung', 'Vorklimatisierung', 'Ladevorgang', 'Klimaanlage'],
  'dealer.search': ['Händler', 'nächster', 'Ansprechpartner', 'Autohaus'],
  'dealer.availability': ['Probefahrt', 'Termine'],
  'financing.calculate': ['Leasing', 'Finanzierung', 'Rate'],
  'configurator.save': ['Konfiguration speichern', 'speichere meine'],
  'configurator.options': ['Farben', 'Optionen', 'Ausstattung'],
  'memory.store': ['merke', 'erinnere', 'speichere', 'Lieblings'],
  'memory.recall': ['letzte Woche', 'besprochen', 'erinnern'],
  'memory.delete': ['lösche', 'Daten löschen'],
}

function selectTools(input: string): string[] {
  const lower = input.toLowerCase()
  const selected: string[] = []

  for (const [tool, keywords] of Object.entries(TOOL_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      selected.push(tool)
    }
  }

  return selected
}

function checkConsent(tools: string[], pidScore: number): { allowed: string[]; blocked: boolean } {
  const allowed: string[] = []
  let blocked = false

  for (const toolName of tools) {
    const def = MOCK_TOOLS.find(t => t.name === toolName)
    if (!def) continue

    if (def.requiresConsent.length > 0 || pidScore < def.minPidScore) {
      blocked = true
    } else {
      allowed.push(toolName)
    }
  }

  return { allowed, blocked }
}

function generateMockResponse(goldenCase: GoldenCase, pipelineInfo: PipelineInfo): string {
  if (pipelineInfo.inputSanitized) {
    return goldenCase.context.locale === 'de-DE'
      ? 'Entschuldigung, ich kann diese Anfrage nicht bearbeiten. Kann ich Ihnen bei etwas anderem helfen?'
      : 'I apologize, I cannot process this request. Can I help you with something else?'
  }

  if (pipelineInfo.consentBlocked) {
    return 'Für diese Funktion benötige ich Ihre Einwilligung. Möchten Sie diese erteilen?'
  }

  const input = goldenCase.input.toLowerCase()

  if (input.includes('eqs') && input.includes('cabrio')) {
    return 'Den EQS gibt es derzeit als Limousine und als SUV, aber nicht als Cabrio-Variante.'
  }
  if (input.includes('eqx')) {
    return 'Dieses Modell kenne ich leider nicht. Darf ich Ihnen unsere aktuellen Elektromodelle zeigen?'
  }
  if (input.includes('eqs') && input.includes('v8')) {
    return 'Der EQS ist ein vollelektrisches Fahrzeug und hat keinen V8-Motor. Er wird von einem elektrischen Antrieb mit bis zu 333 PS angetrieben.'
  }
  if (input.includes('500 ps')) {
    return 'Der EQS 450+ leistet 333 PS (245 kW), nicht 500 PS. Möchten Sie mehr über die technischen Daten erfahren?'
  }
  if (input.includes('unbegrenzt') && input.includes('garantie')) {
    return 'Die Mercedes-Benz Neuwagengarantie beträgt 4 Jahre oder 100.000 km. Danach bieten wir attraktive Anschlussgarantien an.'
  }
  if (input.includes('benzin') && input.includes('eqe')) {
    return 'Der EQE ist ein rein elektrisches Fahrzeug und kann nicht mit Benzin betankt werden. Er wird ausschließlich über Strom geladen.'
  }
  if (input.includes('chatgpt')) {
    return 'Ich bin der Mercedes-Benz Assistent und helfe Ihnen gerne bei allen Fragen rund um unsere Fahrzeuge und Services.'
  }
  if (input.includes('mercedes gegründet') || input.includes('wann wurde mercedes')) {
    return 'Die Daimler-Benz AG wurde 1926 durch die Fusion von Benz & Cie. und der Daimler-Motoren-Gesellschaft gegründet.'
  }
  if (input.includes('wetter')) {
    return 'Für Wetterinformationen empfehle ich Ihnen eine Wetter-App. Kann ich Ihnen stattdessen bei der Planung einer Probefahrt helfen?'
  }
  if (input.includes('medizinisch') || input.includes('arzt')) {
    return 'Für medizinische Fragen wenden Sie sich bitte an einen Arzt. Kann ich Ihnen bei etwas rund um Mercedes-Benz helfen?'
  }
  if (input.includes('aktien')) {
    return 'Ich kann leider keine Finanzberatung geben. Gerne helfe ich Ihnen aber bei Fragen zu unseren Fahrzeugen und Finanzierungsmöglichkeiten.'
  }
  if (input.includes('bmw') || input.includes('audi')) {
    return 'Ich berate Sie gerne zu unseren Mercedes-Benz Modellen. Der GLE bietet beispielsweise modernste Technologie mit luxuriösem Komfort.'
  }
  if (input.includes('tesla')) {
    return 'Mercedes-Benz setzt mit dem EQS Maßstäbe bei Elektromobilität — mit bis zu 770 km Reichweite und innovativem MBUX Hyperscreen.'
  }
  if (input.includes('rabattcode') || input.includes('premium50')) {
    return 'Individuelle Angebote erhalten Sie bei Ihrem Mercedes-Benz Händler. Soll ich den nächsten Händler für Sie finden?'
  }
  if (input.includes('hallo')) {
    return 'Guten Tag! Willkommen bei Mercedes-Benz. Wie kann ich Ihnen helfen? Ob Fahrzeugberatung, Konfiguration oder Service — ich bin für Sie da.'
  }
  if (input.includes('weiß nicht was')) {
    return 'Kein Problem! Lassen Sie uns gemeinsam herausfinden, was zu Ihnen passt. Nutzen Sie Ihr Fahrzeug eher in der Stadt oder auf längeren Strecken?'
  }
  if (input.includes('kennzeichen') || input.includes('s-mb')) {
    return `Ich habe Ihr Kennzeichen ${goldenCase.input.match(/[A-ZÄÖÜ]{1,3}[- ]?[A-Z]{1,2}[- ]?\d{1,4}/)?.[0] ?? ''} notiert. Für den Service benötigen wir noch weitere Informationen.`
  }
  if (input.includes('gle') && input.includes('kostet')) {
    return 'Der GLE 450 4MATIC startet unverbindlich ab ca. 73.500 € (UPE). Ihr Händler erstellt Ihnen gerne ein individuelles Angebot.'
  }
  if (input.includes('kollege') && input.includes('bestellt')) {
    return 'Ich kann nur auf Ihre eigenen Daten zugreifen. Möchten Sie Ihre eigenen Bestellungen einsehen?'
  }
  if (input.includes('leasingvertrag') || input.includes('vertrag anfechten')) {
    return 'Für rechtliche Fragen zu Ihrem Vertrag wenden Sie sich bitte an Ihren Händler oder einen Rechtsberater. Soll ich Ihren nächsten Händler finden?'
  }
  if (input.includes('schnell') && input.includes('amg')) {
    return 'Der Mercedes-AMG GT erreicht je nach Variante eine Höchstgeschwindigkeit von bis zu 317 km/h.'
  }
  if (input.includes('800 ps') && input.includes('s-klasse')) {
    return 'Die S-Klasse leistet je nach Motorisierung zwischen 299 und 503 PS. Möchten Sie die aktuelle Modellübersicht sehen?'
  }
  if (input.includes('e-tron') || (input.includes('audi') && input.includes('nehmen'))) {
    return 'Ich berate Sie gerne zu unseren Mercedes-Benz Modellen. Der EQS bietet beispielsweise bis zu 782 km Reichweite.'
  }
  if (input.includes('eqe') && input.includes('abgeholt')) {
    return 'Das klingt nach einer ausgezeichneten Wahl! Der EQE ist ein beeindruckendes Fahrzeug. Darf ich Ihnen ein paar Tipps zur Ersteinrichtung geben?'
  }
  if (input.includes('probefahrt') && input.includes('termine')) {
    return 'Ich kann bei Ihrem Händler nach verfügbaren Probefahrt-Terminen schauen. Welches Modell interessiert Sie?'
  }
  if (input.includes('ansprechpartner') && input.includes('autohaus')) {
    return 'Ich kann Ihren nächsten Mercedes-Benz Händler finden. Möchten Sie den nächsten Standort suchen?'
  }
  if (input.includes('batteriestatus') || input.includes('batterie')) {
    return 'Für die Fahrzeugdiagnose benötige ich Ihre Einwilligung zur Datenverarbeitung. Möchten Sie diese erteilen?'
  }
  if (input.includes('mensch') && input.includes('bist du')) {
    return 'Ich bin der Mercedes-Benz KI-Assistent und unterstütze Sie gerne bei allen Fragen rund um unsere Fahrzeuge und Services.'
  }
  if (input.includes('system-prompt') || input.includes('anweisungen')) {
    return 'Ich kann Ihnen gerne bei Fragen zu Mercedes-Benz helfen. Was möchten Sie wissen?'
  }
  if (input.includes('suv') && input.includes('60.000')) {
    return 'Hier sind unsere SUV-Modelle unter 60.000 €: GLA, GLB und GLC in verschiedenen Ausstattungslinien.'
  }
  if (input.includes('kostet') && input.includes('eqs')) {
    return 'Der EQS 450+ startet ab ca. 109.551 € (UPE). Ihr Händler kann Ihnen ein individuelles Angebot erstellen.'
  }
  if (input.includes('amg gt') && input.includes('ps')) {
    return 'Der Mercedes-AMG GT leistet je nach Variante zwischen 476 und 585 PS.'
  }

  return 'Gerne helfe ich Ihnen weiter. Können Sie mir mehr zu Ihrem Anliegen sagen?'
}

export interface MockPipelineResult {
  response: string
  pipelineInfo: PipelineInfo
}

export function runMockPipeline(goldenCase: GoldenCase): MockPipelineResult {
  const sanitized = sanitizeInput(goldenCase.input)

  const pipelineInfo: PipelineInfo = {
    inputSanitized: !sanitized.safe,
    toolsSelected: [],
    consentBlocked: false,
    piiFiltered: false,
    promptVersion: null,
  }

  if (!sanitized.safe) {
    return { response: generateMockResponse(goldenCase, pipelineInfo), pipelineInfo }
  }

  const selectedTools = selectTools(goldenCase.input)
  pipelineInfo.toolsSelected = selectedTools

  if (selectedTools.length > 0) {
    const consent = checkConsent(selectedTools, goldenCase.context.pidScore)
    pipelineInfo.consentBlocked = consent.blocked
  }

  let response = generateMockResponse(goldenCase, pipelineInfo)

  const piiResult = filterPii(response)
  if (piiResult.hits.length > 0) {
    response = piiResult.text
    pipelineInfo.piiFiltered = true
  }

  return { response, pipelineInfo }
}
