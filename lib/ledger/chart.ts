// ============================================================================
//  Chart of accounts generator.
//
//  One studio-shaped chart (tuition, enrolment fees, costumes, shows, studio
//  hire, instructor fees, music licensing…) rendered in the jurisdiction's
//  idiom:
//
//    • English-speaking packs use Xero-style numbering (090 bank, 200 sales,
//      610 receivables, 800 payables, 820 tax), so an accountant used to Xero
//      or MYOB is at home and a class's existing account_code "200" maps
//      straight onto the right account.
//    • France, Germany and Spain have statutory/standard charts (PCG, SKR03,
//      PGC). Accountants there expect those numbers, so the same accounts get
//      national codes and local names.
//    • Italy, the Netherlands, Japan and Korea have no single mandated
//      numbering for a business this size; they get the generic numbering with
//      local-language names.
//
//  Every account carries a `slug` so the three dimensions (code, name, tax
//  default) are tables keyed by the same thing rather than parallel arrays
//  that drift.
// ============================================================================

import type { AccountSubtype, BankKind, SystemKey } from "./types";
import type { ChartLanguage, Jurisdiction, RegionPack } from "./jurisdictions/types";

/** Which of the jurisdiction's tax codes an account defaults to. */
type TaxRole = "sales" | "service_sales" | "purchases" | "exempt_sales" | "exempt_purchases" | "none";

type Slug =
  | "bank" | "savings" | "stripe_clearing" | "cash" | "ar" | "prepayments" | "inventory"
  | "equipment" | "equipment_dep" | "computers" | "computers_dep"
  | "ap" | "wages_payable" | "payroll_tax" | "retirement_payable" | "tax_output" | "tax_input"
  | "tax_output_2" | "tax_input_2" | "tax_settlement" | "income_tax_payable" | "customer_deposits"
  | "suspense" | "rounding" | "loan"
  | "retained" | "owner_funds" | "drawings" | "opening_balance"
  | "tuition" | "class_passes" | "registration" | "costume_sales" | "shop_sales" | "tickets" | "private_lessons"
  | "hire_income" | "other_revenue" | "interest_income"
  | "instructors" | "cogs" | "advertising" | "bank_fees" | "cleaning" | "accounting" | "entertainment"
  | "freight" | "general" | "insurance" | "interest_expense" | "legal" | "utilities" | "vehicle"
  | "office" | "printing" | "rent" | "repairs" | "wages" | "retirement" | "subscriptions" | "phone"
  | "travel" | "music_licensing" | "competitions" | "training" | "depreciation" | "income_tax";

type BaseAccount = {
  slug: Slug;
  code: string;
  subtype: AccountSubtype;
  systemKey?: SystemKey;
  tax: TaxRole;
  bankKind?: BankKind;
  /** Only generated for jurisdictions with separate input/output tax accounts. */
  separateTaxOnly?: boolean;
  /** Only generated when there's a second tax (provincial / second VAT rate). */
  secondTaxOnly?: boolean;
};

const BASE: BaseAccount[] = [
  // Assets
  { slug: "bank", code: "090", subtype: "bank", systemKey: "bank", tax: "none", bankKind: "bank" },
  { slug: "savings", code: "091", subtype: "bank", tax: "none", bankKind: "bank" },
  { slug: "stripe_clearing", code: "095", subtype: "bank", systemKey: "stripe_clearing", tax: "none", bankKind: "clearing" },
  { slug: "cash", code: "096", subtype: "bank", systemKey: "undeposited", tax: "none", bankKind: "cash" },
  { slug: "ar", code: "610", subtype: "receivable", systemKey: "ar", tax: "none" },
  { slug: "prepayments", code: "620", subtype: "current_asset", tax: "none" },
  { slug: "inventory", code: "630", subtype: "inventory", tax: "none" },
  { slug: "equipment", code: "710", subtype: "fixed_asset", tax: "purchases" },
  { slug: "equipment_dep", code: "711", subtype: "fixed_asset", tax: "none" },
  { slug: "computers", code: "720", subtype: "fixed_asset", tax: "purchases" },
  { slug: "computers_dep", code: "721", subtype: "fixed_asset", tax: "none" },
  // Liabilities
  { slug: "ap", code: "800", subtype: "payable", systemKey: "ap", tax: "none" },
  { slug: "wages_payable", code: "804", subtype: "current_liability", tax: "none" },
  { slug: "tax_output", code: "820", subtype: "tax", systemKey: "tax_collected", tax: "none" },
  { slug: "tax_input", code: "821", subtype: "tax", systemKey: "tax_paid", tax: "none", separateTaxOnly: true },
  { slug: "tax_output_2", code: "822", subtype: "tax", systemKey: "tax_collected_2", tax: "none", secondTaxOnly: true },
  { slug: "tax_input_2", code: "823", subtype: "tax", systemKey: "tax_paid_2", tax: "none", secondTaxOnly: true, separateTaxOnly: true },
  { slug: "tax_settlement", code: "824", subtype: "tax", systemKey: "tax_settlement", tax: "none", separateTaxOnly: true },
  { slug: "payroll_tax", code: "825", subtype: "current_liability", tax: "none" },
  { slug: "retirement_payable", code: "826", subtype: "current_liability", tax: "none" },
  { slug: "income_tax_payable", code: "830", subtype: "current_liability", tax: "none" },
  { slug: "customer_deposits", code: "835", subtype: "current_liability", tax: "none" },
  { slug: "suspense", code: "850", subtype: "current_liability", systemKey: "suspense", tax: "none" },
  { slug: "rounding", code: "860", subtype: "current_liability", systemKey: "rounding", tax: "none" },
  { slug: "loan", code: "900", subtype: "non_current_liability", tax: "none" },
  // Equity
  { slug: "retained", code: "960", subtype: "retained_earnings", systemKey: "retained_earnings", tax: "none" },
  { slug: "owner_funds", code: "970", subtype: "equity", systemKey: "owner_funds", tax: "none" },
  { slug: "drawings", code: "980", subtype: "equity", tax: "none" },
  { slug: "opening_balance", code: "990", subtype: "equity", systemKey: "opening_balance", tax: "none" },
  // Revenue
  { slug: "tuition", code: "200", subtype: "revenue", systemKey: "sales", tax: "service_sales" },
  { slug: "class_passes", code: "200-01", subtype: "revenue", systemKey: "class_passes", tax: "service_sales" },
  { slug: "registration", code: "205", subtype: "revenue", tax: "service_sales" },
  { slug: "costume_sales", code: "210", subtype: "revenue", tax: "sales" },
  { slug: "shop_sales", code: "215", subtype: "revenue", tax: "sales" },
  { slug: "tickets", code: "220", subtype: "revenue", tax: "sales" },
  { slug: "private_lessons", code: "225", subtype: "revenue", tax: "service_sales" },
  { slug: "hire_income", code: "230", subtype: "revenue", tax: "sales" },
  { slug: "other_revenue", code: "260", subtype: "revenue", tax: "sales" },
  { slug: "interest_income", code: "270", subtype: "other_income", tax: "exempt_sales" },
  // Direct costs
  { slug: "instructors", code: "310", subtype: "direct_cost", tax: "purchases" },
  { slug: "cogs", code: "315", subtype: "direct_cost", tax: "purchases" },
  // Overheads
  { slug: "advertising", code: "400", subtype: "expense", tax: "purchases" },
  { slug: "bank_fees", code: "404", subtype: "expense", systemKey: "bank_fees", tax: "exempt_purchases" },
  { slug: "cleaning", code: "408", subtype: "expense", tax: "purchases" },
  { slug: "accounting", code: "412", subtype: "expense", tax: "purchases" },
  { slug: "entertainment", code: "420", subtype: "expense", tax: "purchases" },
  { slug: "freight", code: "425", subtype: "expense", tax: "purchases" },
  { slug: "general", code: "429", subtype: "expense", tax: "purchases" },
  { slug: "insurance", code: "433", subtype: "expense", tax: "purchases" },
  { slug: "interest_expense", code: "437", subtype: "expense", tax: "exempt_purchases" },
  { slug: "legal", code: "441", subtype: "expense", tax: "purchases" },
  { slug: "utilities", code: "445", subtype: "expense", tax: "purchases" },
  { slug: "vehicle", code: "449", subtype: "expense", tax: "purchases" },
  { slug: "office", code: "453", subtype: "expense", tax: "purchases" },
  { slug: "printing", code: "461", subtype: "expense", tax: "purchases" },
  { slug: "rent", code: "469", subtype: "expense", tax: "purchases" },
  { slug: "repairs", code: "473", subtype: "expense", tax: "purchases" },
  { slug: "wages", code: "477", subtype: "expense", tax: "none" },
  { slug: "retirement", code: "478", subtype: "expense", tax: "none" },
  { slug: "subscriptions", code: "485", subtype: "expense", tax: "purchases" },
  { slug: "phone", code: "489", subtype: "expense", tax: "purchases" },
  { slug: "travel", code: "493", subtype: "expense", tax: "purchases" },
  { slug: "music_licensing", code: "494", subtype: "expense", tax: "purchases" },
  { slug: "competitions", code: "495", subtype: "expense", tax: "purchases" },
  { slug: "training", code: "496", subtype: "expense", tax: "purchases" },
  { slug: "depreciation", code: "497", subtype: "depreciation", tax: "none" },
  { slug: "income_tax", code: "505", subtype: "other_expense", tax: "none" },
];

/**
 * Names per language. `{tax}`, `{taxIn}`, `{settle}`, `{payroll}`, `{retire}`,
 * `{retirePay}`, `{music}` are filled from the pack's chartTerms.
 */
const NAMES: Record<ChartLanguage, Record<Slug, string>> = {
  en: {
    bank: "Business bank account", savings: "Business savings account", stripe_clearing: "Stripe clearing",
    cash: "Cash on hand / undeposited funds", ar: "Accounts receivable", prepayments: "Prepayments",
    inventory: "Inventory (costumes & merchandise)", equipment: "Studio equipment",
    equipment_dep: "Less accumulated depreciation on studio equipment", computers: "Computer equipment",
    computers_dep: "Less accumulated depreciation on computer equipment", ap: "Accounts payable",
    wages_payable: "Wages payable", payroll_tax: "{payroll}", retirement_payable: "{retirePay}",
    tax_output: "{tax}", tax_input: "{taxIn}", tax_output_2: "{tax2}", tax_input_2: "{tax2In}",
    tax_settlement: "{settle}", income_tax_payable: "Income tax payable",
    customer_deposits: "Fees received in advance", suspense: "Suspense", rounding: "Rounding",
    loan: "Loan", retained: "Retained earnings", owner_funds: "Owner funds introduced",
    drawings: "Owner drawings", opening_balance: "Opening balance equity",
    tuition: "Tuition & class fees", class_passes: "Class passes", registration: "Registration & enrolment fees",
    costume_sales: "Costume & uniform sales", shop_sales: "Shop & merchandise sales",
    tickets: "Event & performance tickets", private_lessons: "Private lessons",
    hire_income: "Studio hire income", other_revenue: "Other revenue", interest_income: "Interest income",
    instructors: "Instructor & contractor fees", cogs: "Costumes & merchandise purchased",
    advertising: "Advertising & marketing", bank_fees: "Bank & payment processing fees", cleaning: "Cleaning",
    accounting: "Accounting & bookkeeping", entertainment: "Entertainment", freight: "Freight & courier",
    general: "General expenses", insurance: "Insurance", interest_expense: "Interest expense",
    legal: "Legal expenses", utilities: "Light, power & heating", vehicle: "Motor vehicle expenses",
    office: "Office expenses", printing: "Printing & stationery", rent: "Studio rent",
    repairs: "Repairs & maintenance", wages: "Wages & salaries", retirement: "{retire}",
    subscriptions: "Subscriptions & software", phone: "Telephone & internet", travel: "Travel",
    music_licensing: "{music}", competitions: "Competition & exam entry fees",
    training: "Staff training & development", depreciation: "Depreciation", income_tax: "Income tax expense",
  },
  fr: {
    bank: "Banque", savings: "Banque – compte épargne", stripe_clearing: "Stripe – encaissements en transit",
    cash: "Caisse", ar: "Clients", prepayments: "Charges constatées d'avance",
    inventory: "Stocks de marchandises (costumes, boutique)", equipment: "Matériel du studio",
    equipment_dep: "Amortissements du matériel du studio", computers: "Matériel informatique",
    computers_dep: "Amortissements du matériel informatique", ap: "Fournisseurs",
    wages_payable: "Personnel – rémunérations dues", payroll_tax: "{payroll}", retirement_payable: "{retirePay}",
    tax_output: "{tax}", tax_input: "{taxIn}", tax_output_2: "{tax2}", tax_input_2: "{tax2In}",
    tax_settlement: "{settle}", income_tax_payable: "État – impôts sur les bénéfices",
    customer_deposits: "Clients – avances et acomptes reçus", suspense: "Compte d'attente",
    rounding: "Écarts d'arrondi", loan: "Emprunts auprès des établissements de crédit",
    retained: "Report à nouveau", owner_funds: "Compte de l'exploitant", drawings: "Prélèvements de l'exploitant",
    opening_balance: "Bilan d'ouverture", tuition: "Prestations de services – cours", class_passes: "Cartes de cours",
    registration: "Frais d'inscription", costume_sales: "Ventes de costumes et tenues",
    shop_sales: "Ventes boutique", tickets: "Billetterie spectacles et événements",
    private_lessons: "Cours particuliers", hire_income: "Locations de salle", other_revenue: "Autres produits",
    interest_income: "Produits financiers", instructors: "Sous-traitance – professeurs indépendants",
    cogs: "Achats de marchandises", advertising: "Publicité", bank_fees: "Services bancaires et frais de paiement",
    cleaning: "Entretien et nettoyage", accounting: "Honoraires comptables", entertainment: "Réceptions",
    freight: "Transports", general: "Charges diverses", insurance: "Primes d'assurance",
    interest_expense: "Charges d'intérêts", legal: "Frais d'actes et de contentieux",
    utilities: "Eau, électricité, chauffage", vehicle: "Frais de véhicule", office: "Fournitures administratives",
    printing: "Impressions", rent: "Loyer du studio", repairs: "Entretien et réparations",
    wages: "Rémunérations du personnel", retirement: "{retire}", subscriptions: "Abonnements et logiciels",
    phone: "Télécommunications", travel: "Déplacements", music_licensing: "{music}",
    competitions: "Inscriptions aux concours et examens", training: "Formation professionnelle",
    depreciation: "Dotations aux amortissements", income_tax: "Impôts sur les bénéfices",
  },
  de: {
    bank: "Bank", savings: "Tagesgeldkonto", stripe_clearing: "Geldtransit (Stripe)", cash: "Kasse",
    ar: "Forderungen aus Lieferungen und Leistungen", prepayments: "Aktive Rechnungsabgrenzung",
    inventory: "Bestand Waren (Kostüme, Shop)", equipment: "Betriebs- und Geschäftsausstattung",
    equipment_dep: "Wertberichtigung Betriebsausstattung", computers: "EDV-Ausstattung",
    computers_dep: "Wertberichtigung EDV-Ausstattung", ap: "Verbindlichkeiten aus Lieferungen und Leistungen",
    wages_payable: "Verbindlichkeiten aus Lohn und Gehalt", payroll_tax: "{payroll}",
    retirement_payable: "{retirePay}", tax_output: "{tax}", tax_input: "{taxIn}", tax_output_2: "{tax2}",
    tax_input_2: "{tax2In}", tax_settlement: "{settle}", income_tax_payable: "Steuerrückstellungen",
    customer_deposits: "Erhaltene Anzahlungen", suspense: "Durchlaufende Posten",
    rounding: "Rundungsdifferenzen", loan: "Verbindlichkeiten gegenüber Kreditinstituten",
    retained: "Gewinnvortrag", owner_funds: "Privateinlagen", drawings: "Privatentnahmen",
    opening_balance: "Saldenvorträge Sachkonten", tuition: "Erlöse Unterricht und Kurse", class_passes: "Erlöse Kurskarten",
    registration: "Erlöse Anmeldegebühren", costume_sales: "Erlöse Kostüme und Trainingskleidung",
    shop_sales: "Erlöse Shop", tickets: "Erlöse Veranstaltungen und Eintritt",
    private_lessons: "Erlöse Einzelunterricht", hire_income: "Erlöse Raumvermietung",
    other_revenue: "Sonstige betriebliche Erträge", interest_income: "Zinserträge",
    instructors: "Fremdleistungen (freie Lehrkräfte)", cogs: "Wareneingang", advertising: "Werbekosten",
    bank_fees: "Nebenkosten des Geldverkehrs", cleaning: "Reinigung", accounting: "Buchführungskosten",
    entertainment: "Bewirtungskosten", freight: "Frachten und Porto", general: "Sonstige betriebliche Aufwendungen",
    insurance: "Versicherungen", interest_expense: "Zinsaufwendungen", legal: "Rechts- und Beratungskosten",
    utilities: "Gas, Strom, Wasser", vehicle: "Fahrzeugkosten", office: "Bürobedarf",
    printing: "Drucksachen", rent: "Miete Studio", repairs: "Reparaturen und Instandhaltung",
    wages: "Löhne und Gehälter", retirement: "{retire}", subscriptions: "Lizenzen und Software",
    phone: "Telefon und Internet", travel: "Reisekosten", music_licensing: "{music}",
    competitions: "Wettbewerbs- und Prüfungsgebühren", training: "Fortbildungskosten",
    depreciation: "Abschreibungen auf Sachanlagen", income_tax: "Steuern vom Einkommen und Ertrag",
  },
  es: {
    bank: "Bancos", savings: "Bancos – cuenta de ahorro", stripe_clearing: "Stripe – cobros pendientes de liquidar",
    cash: "Caja", ar: "Clientes", prepayments: "Gastos anticipados",
    inventory: "Mercaderías (vestuario y tienda)", equipment: "Mobiliario y equipamiento del estudio",
    equipment_dep: "Amortización acumulada del mobiliario", computers: "Equipos para procesos de información",
    computers_dep: "Amortización acumulada de equipos informáticos", ap: "Proveedores",
    wages_payable: "Remuneraciones pendientes de pago", payroll_tax: "{payroll}",
    retirement_payable: "{retirePay}", tax_output: "{tax}", tax_input: "{taxIn}", tax_output_2: "{tax2}",
    tax_input_2: "{tax2In}", tax_settlement: "{settle}",
    income_tax_payable: "HP acreedora por impuesto sobre beneficios", customer_deposits: "Anticipos de clientes",
    suspense: "Partidas pendientes de aplicación", rounding: "Diferencias por redondeo",
    loan: "Deudas a largo plazo con entidades de crédito", retained: "Remanente", owner_funds: "Capital",
    drawings: "Titular de la explotación", opening_balance: "Saldos de apertura",
    tuition: "Prestaciones de servicios – clases", class_passes: "Bonos de clases", registration: "Matrículas e inscripciones",
    costume_sales: "Ventas de vestuario", shop_sales: "Ventas de tienda", tickets: "Entradas a espectáculos",
    private_lessons: "Clases particulares", hire_income: "Ingresos por arrendamiento de sala",
    other_revenue: "Ingresos por servicios diversos", interest_income: "Otros ingresos financieros",
    instructors: "Trabajos realizados por profesores autónomos", cogs: "Compras de mercaderías",
    advertising: "Publicidad y propaganda", bank_fees: "Servicios bancarios y comisiones de cobro",
    cleaning: "Limpieza", accounting: "Servicios de profesionales independientes", entertainment: "Atenciones a clientes",
    freight: "Transportes", general: "Otros servicios", insurance: "Primas de seguros",
    interest_expense: "Intereses de deudas", legal: "Asesoría jurídica", utilities: "Suministros",
    vehicle: "Gastos de vehículos", office: "Material de oficina", printing: "Imprenta",
    rent: "Arrendamiento del estudio", repairs: "Reparaciones y conservación", wages: "Sueldos y salarios",
    retirement: "{retire}", subscriptions: "Suscripciones y software", phone: "Teléfono e internet",
    travel: "Viajes", music_licensing: "{music}", competitions: "Inscripciones a competiciones y exámenes",
    training: "Formación del personal", depreciation: "Amortización del inmovilizado material",
    income_tax: "Impuesto sobre beneficios",
  },
  it: {
    bank: "Banca c/c", savings: "Banca – conto deposito", stripe_clearing: "Stripe – incassi da accreditare",
    cash: "Cassa", ar: "Crediti verso clienti", prepayments: "Risconti attivi",
    inventory: "Rimanenze di merci (costumi, negozio)", equipment: "Attrezzature dello studio",
    equipment_dep: "Fondo ammortamento attrezzature", computers: "Macchine elettroniche d'ufficio",
    computers_dep: "Fondo ammortamento macchine elettroniche", ap: "Debiti verso fornitori",
    wages_payable: "Debiti verso dipendenti", payroll_tax: "{payroll}", retirement_payable: "{retirePay}",
    tax_output: "{tax}", tax_input: "{taxIn}", tax_output_2: "{tax2}", tax_input_2: "{tax2In}",
    tax_settlement: "{settle}", income_tax_payable: "Debiti tributari per imposte sul reddito",
    customer_deposits: "Anticipi da clienti", suspense: "Conto transitorio", rounding: "Arrotondamenti",
    loan: "Mutui passivi", retained: "Utili portati a nuovo", owner_funds: "Apporti del titolare",
    drawings: "Prelevamenti del titolare", opening_balance: "Bilancio di apertura",
    tuition: "Ricavi da corsi e lezioni", class_passes: "Carnet di lezioni", registration: "Quote di iscrizione",
    costume_sales: "Vendita costumi e abbigliamento", shop_sales: "Vendite negozio",
    tickets: "Biglietteria spettacoli ed eventi", private_lessons: "Lezioni private",
    hire_income: "Affitto sala", other_revenue: "Altri ricavi", interest_income: "Interessi attivi",
    instructors: "Compensi a insegnanti e collaboratori", cogs: "Acquisti di merci",
    advertising: "Pubblicità", bank_fees: "Spese e commissioni bancarie", cleaning: "Pulizie",
    accounting: "Consulenze contabili", entertainment: "Spese di rappresentanza", freight: "Spese di trasporto",
    general: "Spese generali", insurance: "Assicurazioni", interest_expense: "Interessi passivi",
    legal: "Spese legali", utilities: "Utenze (luce, gas, acqua)", vehicle: "Spese automezzi",
    office: "Cancelleria e materiale d'ufficio", printing: "Stampati", rent: "Affitto dello studio",
    repairs: "Manutenzioni e riparazioni", wages: "Salari e stipendi", retirement: "{retire}",
    subscriptions: "Abbonamenti e software", phone: "Telefono e internet", travel: "Viaggi e trasferte",
    music_licensing: "{music}", competitions: "Iscrizioni a concorsi ed esami", training: "Formazione del personale",
    depreciation: "Ammortamenti", income_tax: "Imposte sul reddito",
  },
  nl: {
    bank: "Bank", savings: "Spaarrekening", stripe_clearing: "Stripe – kruisposten", cash: "Kas",
    ar: "Debiteuren", prepayments: "Vooruitbetaalde kosten", inventory: "Voorraad (kostuums, winkel)",
    equipment: "Inventaris studio", equipment_dep: "Afschrijving inventaris studio", computers: "Computerapparatuur",
    computers_dep: "Afschrijving computerapparatuur", ap: "Crediteuren", wages_payable: "Te betalen lonen",
    payroll_tax: "{payroll}", retirement_payable: "{retirePay}", tax_output: "{tax}", tax_input: "{taxIn}",
    tax_output_2: "{tax2}", tax_input_2: "{tax2In}", tax_settlement: "{settle}",
    income_tax_payable: "Te betalen inkomsten-/vennootschapsbelasting", customer_deposits: "Vooruitontvangen lesgelden",
    suspense: "Vraagposten", rounding: "Afrondingsverschillen", loan: "Lening", retained: "Overige reserves",
    owner_funds: "Privéstortingen", drawings: "Privéopnamen", opening_balance: "Beginbalans",
    tuition: "Omzet lesgelden", class_passes: "Strippenkaarten", registration: "Inschrijfgelden", costume_sales: "Verkoop kostuums en kleding",
    shop_sales: "Omzet winkel", tickets: "Kaartverkoop voorstellingen", private_lessons: "Privélessen",
    hire_income: "Zaalverhuur", other_revenue: "Overige opbrengsten", interest_income: "Rentebaten",
    instructors: "Inhuur docenten (zzp)", cogs: "Inkoop goederen", advertising: "Reclame en marketing",
    bank_fees: "Bank- en betaalkosten", cleaning: "Schoonmaakkosten", accounting: "Administratiekosten",
    entertainment: "Representatiekosten", freight: "Verzendkosten", general: "Algemene kosten",
    insurance: "Verzekeringen", interest_expense: "Rentelasten", legal: "Juridische kosten",
    utilities: "Gas, water en licht", vehicle: "Autokosten", office: "Kantoorkosten", printing: "Drukwerk",
    rent: "Huur studio", repairs: "Onderhoud en reparaties", wages: "Lonen en salarissen", retirement: "{retire}",
    subscriptions: "Abonnementen en software", phone: "Telefoon en internet", travel: "Reiskosten",
    music_licensing: "{music}", competitions: "Inschrijfgeld wedstrijden en examens",
    training: "Opleidingskosten personeel", depreciation: "Afschrijvingskosten", income_tax: "Belastingen naar de winst",
  },
  ja: {
    bank: "普通預金", savings: "定期預金", stripe_clearing: "Stripe未入金", cash: "現金", ar: "売掛金",
    prepayments: "前払費用", inventory: "商品（衣装・物販）", equipment: "器具備品", equipment_dep: "器具備品減価償却累計額",
    computers: "パソコン等", computers_dep: "パソコン等減価償却累計額", ap: "買掛金", wages_payable: "未払給与",
    payroll_tax: "{payroll}", retirement_payable: "{retirePay}", tax_output: "{tax}", tax_input: "{taxIn}",
    tax_output_2: "{tax2}", tax_input_2: "{tax2In}", tax_settlement: "{settle}", income_tax_payable: "未払法人税等",
    customer_deposits: "前受金（月謝前受）", suspense: "仮勘定", rounding: "端数調整", loan: "長期借入金",
    retained: "繰越利益剰余金", owner_funds: "元入金", drawings: "事業主貸", opening_balance: "開始残高",
    tuition: "月謝・レッスン料収入", class_passes: "回数券収入", registration: "入会金収入", costume_sales: "衣装売上", shop_sales: "物販売上",
    tickets: "発表会・公演チケット収入", private_lessons: "個人レッスン収入", hire_income: "スタジオ貸出収入",
    other_revenue: "雑収入", interest_income: "受取利息", instructors: "外部講師料", cogs: "仕入高",
    advertising: "広告宣伝費", bank_fees: "支払手数料", cleaning: "清掃費", accounting: "支払報酬（会計）",
    entertainment: "接待交際費", freight: "荷造運賃", general: "雑費", insurance: "保険料", interest_expense: "支払利息",
    legal: "支払報酬（法務）", utilities: "水道光熱費", vehicle: "車両費", office: "事務用品費", printing: "印刷費",
    rent: "地代家賃", repairs: "修繕費", wages: "給料賃金", retirement: "{retire}", subscriptions: "通信・ソフトウェア利用料",
    phone: "通信費", travel: "旅費交通費", music_licensing: "{music}", competitions: "コンクール・検定参加費",
    training: "研修費", depreciation: "減価償却費", income_tax: "法人税等",
  },
  ko: {
    bank: "보통예금", savings: "정기예금", stripe_clearing: "Stripe 미정산금", cash: "현금", ar: "외상매출금",
    prepayments: "선급비용", inventory: "상품(의상·판매용품)", equipment: "비품", equipment_dep: "비품 감가상각누계액",
    computers: "전산장비", computers_dep: "전산장비 감가상각누계액", ap: "외상매입금", wages_payable: "미지급급여",
    payroll_tax: "{payroll}", retirement_payable: "{retirePay}", tax_output: "{tax}", tax_input: "{taxIn}",
    tax_output_2: "{tax2}", tax_input_2: "{tax2In}", tax_settlement: "{settle}", income_tax_payable: "미지급법인세",
    customer_deposits: "선수금(수강료)", suspense: "가지급금·가수금", rounding: "단수차이", loan: "장기차입금",
    retained: "이월이익잉여금", owner_funds: "자본금", drawings: "인출금", opening_balance: "기초잔액",
    tuition: "수강료 수입", class_passes: "회차권 수입", registration: "등록비 수입", costume_sales: "의상 매출", shop_sales: "용품 판매 매출",
    tickets: "공연·행사 티켓 수입", private_lessons: "개인레슨 수입", hire_income: "연습실 대관 수입",
    other_revenue: "잡이익", interest_income: "이자수익", instructors: "외부 강사료", cogs: "상품매입",
    advertising: "광고선전비", bank_fees: "지급수수료", cleaning: "청소비", accounting: "세무·회계 수수료",
    entertainment: "접대비", freight: "운반비", general: "잡비", insurance: "보험료", interest_expense: "이자비용",
    legal: "법률 수수료", utilities: "수도광열비", vehicle: "차량유지비", office: "사무용품비", printing: "인쇄비",
    rent: "임차료", repairs: "수선비", wages: "급여", retirement: "{retire}", subscriptions: "소프트웨어 이용료",
    phone: "통신비", travel: "여비교통비", music_licensing: "{music}", competitions: "대회·심사 참가비",
    training: "교육훈련비", depreciation: "감가상각비", income_tax: "법인세비용",
  },
};

/** National numbering where accountants expect it. Unlisted slugs keep the generic code. */
const NATIONAL_CODES: Partial<Record<string, Partial<Record<Slug, string>>>> = {
  // Plan comptable général
  FR: {
    bank: "512000", savings: "512100", stripe_clearing: "517000", cash: "530000", ar: "411000",
    prepayments: "486000", inventory: "370000", equipment: "215400", equipment_dep: "281540",
    computers: "218300", computers_dep: "281830", ap: "401000", wages_payable: "421000",
    payroll_tax: "431000", retirement_payable: "437000", tax_output: "445710", tax_input: "445660",
    tax_output_2: "445711", tax_input_2: "445661", tax_settlement: "445510", income_tax_payable: "444000",
    customer_deposits: "419100", suspense: "471000", rounding: "471100", loan: "164000",
    retained: "110000", owner_funds: "108000", drawings: "108100", opening_balance: "890000",
    tuition: "706000", class_passes: "706400", registration: "706100", costume_sales: "707000", shop_sales: "707100",
    tickets: "706200", private_lessons: "706300", hire_income: "708300", other_revenue: "708800",
    interest_income: "768000", instructors: "611000", cogs: "607000", advertising: "623000",
    bank_fees: "627000", cleaning: "615500", accounting: "622600", entertainment: "625700",
    freight: "624100", general: "628000", insurance: "616000", interest_expense: "661000",
    legal: "622700", utilities: "606100", vehicle: "625100", office: "606400", printing: "623600",
    rent: "613200", repairs: "615000", wages: "641000", retirement: "645000", subscriptions: "651000",
    phone: "626000", travel: "625600", music_licensing: "651600", competitions: "628100",
    training: "633300", depreciation: "681100", income_tax: "695000",
  },
  // DATEV SKR03
  DE: {
    bank: "1200", savings: "1210", stripe_clearing: "1360", cash: "1000", ar: "1400", prepayments: "0980",
    inventory: "3980", equipment: "0490", equipment_dep: "0491", computers: "0420", computers_dep: "0421",
    ap: "1600", wages_payable: "1740", payroll_tax: "1741", retirement_payable: "1742",
    tax_output: "1776", tax_input: "1576", tax_output_2: "1771", tax_input_2: "1571", tax_settlement: "1780",
    income_tax_payable: "0955", customer_deposits: "1710", suspense: "1590", rounding: "1595", loan: "0630",
    retained: "0860", owner_funds: "1890", drawings: "1800", opening_balance: "9000",
    tuition: "8400", class_passes: "8407", registration: "8401", costume_sales: "8402", shop_sales: "8403", tickets: "8404",
    private_lessons: "8405", hire_income: "8406", other_revenue: "2700", interest_income: "2650",
    instructors: "3100", cogs: "3400", advertising: "4600", bank_fees: "4970", cleaning: "4250",
    accounting: "4955", entertainment: "4650", freight: "4730", general: "4900", insurance: "4360",
    interest_expense: "2100", legal: "4950", utilities: "4240", vehicle: "4500", office: "4930",
    printing: "4940", rent: "4210", repairs: "4805", wages: "4120", retirement: "4130", subscriptions: "4964",
    phone: "4920", travel: "4660", music_licensing: "4969", competitions: "4980", training: "4945",
    depreciation: "4830", income_tax: "2200",
  },
  // Plan General de Contabilidad
  ES: {
    bank: "572000", savings: "572100", stripe_clearing: "572900", cash: "570000", ar: "430000",
    prepayments: "480000", inventory: "300000", equipment: "216000", equipment_dep: "281600",
    computers: "217000", computers_dep: "281700", ap: "400000", wages_payable: "465000",
    payroll_tax: "475100", retirement_payable: "476000", tax_output: "477000", tax_input: "472000",
    tax_output_2: "477100", tax_input_2: "472100", tax_settlement: "475000", income_tax_payable: "475200",
    customer_deposits: "438000", suspense: "555000", rounding: "555100", loan: "170000",
    retained: "120000", owner_funds: "102000", drawings: "550000", opening_balance: "129900",
    tuition: "705000", class_passes: "705400", registration: "705100", costume_sales: "700000", shop_sales: "700100",
    tickets: "705200", private_lessons: "705300", hire_income: "752000", other_revenue: "759000",
    interest_income: "769000", instructors: "607000", cogs: "600000", advertising: "627000",
    bank_fees: "626000", cleaning: "622100", accounting: "623000", entertainment: "627100",
    freight: "624000", general: "629000", insurance: "625000", interest_expense: "662000",
    legal: "623100", utilities: "628000", vehicle: "629100", office: "629200", printing: "629300",
    rent: "621000", repairs: "622000", wages: "640000", retirement: "642000", subscriptions: "629400",
    phone: "629500", travel: "629600", music_licensing: "629700", competitions: "629800",
    training: "649000", depreciation: "681000", income_tax: "630000",
  },
};

/** Germany books depreciation directly against the asset; no contra accounts. */
const OMIT: Partial<Record<string, Slug[]>> = {
  DE: ["equipment_dep", "computers_dep"],
};

export type AccountTemplate = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  subtype: AccountSubtype;
  systemKey: SystemKey | null;
  defaultTaxCode: string | null;
  bankKind: BankKind | null;
};

function typeFor(subtype: AccountSubtype): AccountTemplate["type"] {
  if (["bank", "current_asset", "receivable", "inventory", "fixed_asset", "non_current_asset"].includes(subtype)) return "asset";
  if (["current_liability", "payable", "tax", "non_current_liability"].includes(subtype)) return "liability";
  if (["equity", "retained_earnings"].includes(subtype)) return "equity";
  if (["revenue", "other_income"].includes(subtype)) return "revenue";
  return "expense";
}

/** Build the chart a studio in `j` (and optionally `region`) starts with. */
export function buildChart(j: Jurisdiction, region: RegionPack | null): AccountTemplate[] {
  const names = NAMES[j.chartLanguage];
  const codes = NATIONAL_CODES[j.code] ?? {};
  const omit = new Set(OMIT[j.code] ?? []);
  const rates = region?.taxRates ?? j.taxRates;
  const hasSecondTax = !!region?.extraTaxAccount || rates.some((r) =>
    (r.components ?? []).some((c) => c.salesAccountKey === "tax_collected_2"),
  );
  const salesCode = region?.defaultSalesCode ?? j.defaultSalesCode;
  const serviceCode = region?.serviceSalesCode ?? j.serviceSalesCode ?? salesCode;
  const purchaseCode = region?.defaultPurchaseCode ?? j.defaultPurchaseCode;

  const terms: Record<string, string> = {
    tax: j.chartTerms.taxOutput,
    taxIn: j.chartTerms.taxInput ?? j.chartTerms.taxOutput,
    settle: j.chartTerms.taxSettlement ?? j.chartTerms.taxOutput,
    tax2: region?.extraTaxAccount?.name ?? j.chartTerms.taxOutput2 ?? `${j.chartTerms.taxOutput} (2)`,
    tax2In: j.chartTerms.taxInput2 ?? `${j.chartTerms.taxInput ?? j.chartTerms.taxOutput} (2)`,
    payroll: j.chartTerms.payrollTax,
    retire: j.chartTerms.retirement,
    retirePay: j.chartTerms.retirementPayable,
    music: j.chartTerms.musicLicensing,
  };

  const taxCodeFor = (role: TaxRole): string | null => {
    switch (role) {
      case "sales":
        return salesCode;
      case "service_sales":
        return serviceCode;
      case "purchases":
        return purchaseCode;
      case "exempt_sales":
        return j.exemptSalesCode;
      case "exempt_purchases":
        return j.exemptPurchaseCode;
      default:
        return null;
    }
  };

  return BASE.filter((a) => !omit.has(a.slug))
    .filter((a) => !a.separateTaxOnly || j.separateTaxAccounts)
    .filter((a) => !a.secondTaxOnly || hasSecondTax)
    .map((a) => ({
      code: codes[a.slug] ?? a.code,
      name: names[a.slug].replace(/\{(\w+)\}/g, (_, k: string) => terms[k] ?? k),
      type: typeFor(a.subtype),
      subtype: a.subtype,
      systemKey: a.systemKey ?? null,
      defaultTaxCode: rates.length ? taxCodeFor(a.tax) : null,
      bankKind: a.bankKind ?? null,
    }));
}
