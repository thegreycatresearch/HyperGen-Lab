import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowUpRight, Beaker, BookOpen, Boxes,
  ChevronDown, CircleHelp, Dna, FlaskConical, GitFork, Layers3, Menu,
  Network, Pill, Search, Settings2, ShieldCheck, Sparkles, Table2, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import {
  api, type Article, type ClinVarVariant, type Dashboard, type Evidence, type Gene, type Hypothesis,
  type ProteinRecord, type VariantAnnotation,
} from "./api";

type ModuleKey =
  | "dashboard" | "genomics" | "variants" | "proteomics" | "pharmacogenomics"
  | "pharmacoproteomics" | "networks" | "expression" | "literature" | "hypotheses"
  | "statistics" | "insilico" | "reports" | "settings";

const navigation: Array<{ key: ModuleKey; label: string; icon: typeof Activity }> = [
  { key: "dashboard", label: "Dashboard", icon: Layers3 },
  { key: "genomics", label: "Centro genómico", icon: Dna },
  { key: "variants", label: "Variantes genéticas", icon: GitFork },
  { key: "proteomics", label: "Centro proteómico", icon: Boxes },
  { key: "pharmacogenomics", label: "Farmacogenómica", icon: Pill },
  { key: "pharmacoproteomics", label: "Farmacoproteómica", icon: Beaker },
  { key: "networks", label: "Redes moleculares", icon: Network },
  { key: "expression", label: "Expresión génica", icon: Activity },
  { key: "literature", label: "Literatura científica", icon: BookOpen },
  { key: "hypotheses", label: "Motor de hipótesis", icon: Sparkles },
  { key: "statistics", label: "Análisis estadístico", icon: Table2 },
  { key: "insilico", label: "Laboratorio in silico", icon: FlaskConical },
  { key: "reports", label: "Informes científicos", icon: BookOpen },
  { key: "settings", label: "Configuración y bases", icon: Settings2 },
];

const pendingModules: Record<string, string> = {
  pharmacogenomics: "Adaptadores ClinPGx, CPIC, PharmVar y FDA pendientes. No se ofrecen recomendaciones terapéuticas.",
  pharmacoproteomics: "Integración PRIDE/ProteomeXchange y ChEMBL pendiente; no se muestran interacciones simuladas.",
  networks: "Visualización de redes y análisis de grafos pendientes. Se añadirán solo interacciones con procedencia.",
  expression: "Conectores GEO, Expression Atlas, GTEx y HPA pendientes; no se compararán datasets incompatibles.",
  statistics: "Pipelines de enriquecimiento, expresión y meta-análisis pendientes; los resultados no se estiman.",
  insilico: "Herramientas de alineamiento, FASTA/VCF y predicción pendientes. Ningún análisis se simula.",
  reports: "Generación DOCX/PDF/XLSX pendiente. Los datos locales pueden exportarse tras validar los formatos.",
  settings: "La base SQLite local ya se crea automáticamente. Configuración de conectores y copias de seguridad pendiente.",
};

const colors = ["#8b7de2", "#b8a9ee", "#d7d0f7", "#eeeafd"];

function App() {
  const [active, setActive] = useState<ModuleKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [genes, setGenes] = useState<Gene[]>([]);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [metrics, geneRows, hypothesisRows] = await Promise.all([
        api.dashboard(), api.genes(), api.hypotheses(),
      ]);
      setDashboard(metrics);
      setGenes(geneRows);
      setHypotheses(hypothesisRows);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar con la API local.");
    }
  }

  useEffect(() => { void refresh(); }, []);

  const activeTitle = navigation.find((item) => item.key === active)?.label ?? "Dashboard";
  return (
    <div className="app-shell">
      {sidebarOpen && <button className="scrim" aria-label="Cerrar navegación" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Dna size={20} /></div>
          <div><strong>HYPERGEN</strong><span>RESEARCH LAB</span></div>
          <button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Cerrar menú"><X size={18} /></button>
        </div>
        <div className="workspace-label">ESPACIO DE TRABAJO</div>
        <button className="workspace-switch"><span className="workspace-dot" /> Investigación hEDS <ChevronDown size={15} /></button>
        <div className="nav-label">LABORATORIO</div>
        <nav className="side-nav">
          {navigation.map(({ key, label, icon: Icon }) => (
            <button key={key} className={`nav-item ${active === key ? "active" : ""}`} onClick={() => { setActive(key); setSidebarOpen(false); }}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {key === "hypotheses" && hypotheses.length > 0 && <small>{hypotheses.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card"><ShieldCheck size={17} /><div><b>Entorno local</b><span>Datos bajo tu control</span></div><span className="online-dot" /></div>
          <div className="user-row"><div className="avatar">HL</div><div><b>Investigación personal</b><span>Espacio privado</span></div><button className="icon-button" aria-label="Más opciones"><ChevronDown size={16} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir navegación"><Menu size={20} /></button>
          <div className="breadcrumb"><span>Espacio de trabajo</span><span className="crumb-slash">/</span><b>{activeTitle}</b></div>
          <div className="topbar-right">
            <div className="connection"><span /> API local</div>
            <button className="help-button" title="La aplicación organiza evidencia; no establece diagnósticos ni causalidad."><CircleHelp size={18} /></button>
          </div>
        </header>
        <div className="page-content">
          {error && <div className="error-banner" role="alert"><CircleHelp size={17} />{error}<button onClick={() => void refresh()}>Reintentar</button></div>}
          {active === "dashboard" && <DashboardPage dashboard={dashboard} genes={genes} hypotheses={hypotheses} onOpen={setActive} />}
          {active === "genomics" && <GenomicsPage genes={genes} onChange={refresh} />}
          {active === "variants" && <VariantsPage />}
          {active === "proteomics" && <ProteomicsPage />}
          {active === "literature" && <LiteraturePage />}
          {active === "hypotheses" && <HypothesesPage hypotheses={hypotheses} onChange={refresh} />}
          {!["dashboard", "genomics", "variants", "proteomics", "literature", "hypotheses"].includes(active) && <PendingPage moduleKey={active} />}
          <footer className="page-footer"><span>HYPERGEN LAB <i>·</i> Entorno de investigación independiente</span><span>Sin afirmaciones de causalidad no respaldadas</span></footer>
        </div>
      </main>
    </div>
  );
}

function DashboardPage({ dashboard, genes, hypotheses, onOpen }: {
  dashboard: Dashboard | null; genes: Gene[]; hypotheses: Hypothesis[]; onOpen: (key: ModuleKey) => void;
}) {
  const cards = [
    { label: "Genes candidatos", value: dashboard?.candidate_genes ?? "—", icon: Dna, tone: "lavender", trend: "Lista inicial editable" },
    { label: "Variantes registradas", value: dashboard?.variants ?? "—", icon: GitFork, tone: "blue", trend: "Sin anotación automática" },
    { label: "Publicaciones guardadas", value: dashboard?.publications ?? "—", icon: BookOpen, tone: "pink", trend: "Búsqueda PubMed disponible" },
    { label: "Hipótesis en evaluación", value: dashboard?.hypotheses ?? "—", icon: Sparkles, tone: "peach", trend: "Evidencia trazable" },
  ];
  const chartData = [
    { name: "Genética", value: dashboard?.candidate_genes ?? 0 },
    { name: "Proteómica", value: dashboard?.proteins ?? 0 },
    { name: "Literatura", value: dashboard?.publications ?? 0 },
    { name: "Hipótesis", value: dashboard?.hypotheses ?? 0 },
  ];
  const activityData = [
    { name: "Genes", value: dashboard?.candidate_genes ?? 0 },
    { name: "Publicaciones", value: dashboard?.publications ?? 0 },
    { name: "Hipótesis", value: dashboard?.hypotheses ?? 0 },
  ];
  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-dot" /> ESPACIO DE INVESTIGACIÓN</div><h1>Tu laboratorio, en contexto.</h1><p>Un espacio local para organizar y evaluar evidencia sobre hEDS.</p></div>
        <button className="primary-button" onClick={() => onOpen("hypotheses")}><Sparkles size={16} /> Nueva hipótesis</button>
      </div>
      <div className="notice-strip"><ShieldCheck size={18} /><span><b>Rigor científico:</b> los candidatos no se presentan como genes causales de hEDS. Toda evidencia debe conservar su fuente y limitaciones.</span><button onClick={() => onOpen("settings")}>Más información <ArrowUpRight size={14} /></button></div>
      <section className="metrics-grid">
        {cards.map(({ label, value, icon: Icon, tone, trend }) => (
          <div className="metric-card" key={label}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={17} /></span></div><strong className="metric-value">{value}</strong><div className="metric-foot"><span className="metric-note">{trend}</span></div></div>
        ))}
      </section>
      <section className="chart-grid">
        <div className="panel activity-panel">
          <div className="panel-heading"><div><h2>Panorama del espacio</h2><p>Registros locales por área de investigación</p></div><span className="panel-tag"><span /> Base local</span></div>
          <div className="activity-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                <defs><linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9385e8" stopOpacity={0.2} /><stop offset="100%" stopColor="#9385e8" stopOpacity={0.01} /></linearGradient></defs>
                <CartesianGrid stroke="#eef0f6" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#9297a8", fontSize: 11 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "#9297a8", fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#8274d8" strokeWidth={2.5} fill="url(#activityFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend"><span><i className="legend-dot violet" /> Registros guardados</span><span className="subtle">Conteos de datos locales · no son medidas de evidencia</span></div>
        </div>
        <div className="panel distribution-panel">
          <div className="panel-heading"><div><h2>Actividad por módulo</h2><p>Distribución de registros disponibles</p></div><button className="more-button" onClick={() => onOpen("genomics")}>Ver catálogo <ArrowUpRight size={14} /></button></div>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={chartData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={83} paddingAngle={3} stroke="none">{chartData.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><b>{(dashboard?.candidate_genes ?? 0) + (dashboard?.proteins ?? 0) + (dashboard?.publications ?? 0) + (dashboard?.hypotheses ?? 0)}</b><span>registros</span></div>
          </div>
          <div className="distribution-legend">{chartData.map((item, index) => <span key={item.name}><i style={{ background: colors[index] }} />{item.name}<b>{item.value}</b></span>)}</div>
        </div>
      </section>
      <section className="bottom-grid">
        <div className="panel table-panel">
          <div className="panel-heading"><div><h2>Genes candidatos</h2><p>Conjunto inicial definido para exploración</p></div><button className="more-button" onClick={() => onOpen("genomics")}>Explorar <ArrowUpRight size={14} /></button></div>
          <div className="gene-table">
            <div className="table-head"><span>SÍMBOLO</span><span>DESCRIPCIÓN</span><span>CLASIFICACIÓN</span></div>
            {genes.slice(0, 5).map((gene) => <div className="table-row" key={gene.id}><b className="gene-symbol">{gene.symbol}</b><span className="gene-description">{gene.full_name || "Descripción aún no consultada"}</span><span className="candidate-badge">Candidato</span></div>)}
            {genes.length === 0 && <div className="empty-row">Aún no hay genes registrados.</div>}
          </div>
        </div>
        <div className="panel hypotheses-panel">
          <div className="panel-heading"><div><h2>Hipótesis recientes</h2><p>Exploración científica, no conclusiones</p></div><button className="more-button" onClick={() => onOpen("hypotheses")}>Ver todas <ArrowUpRight size={14} /></button></div>
          {hypotheses.slice(0, 3).map((hypothesis) => <div className="hypothesis-row" key={hypothesis.id}><div className="hypothesis-icon"><Sparkles size={16} /></div><div><b>{hypothesis.title}</b><span>{hypothesis.evidence_count} registros de evidencia · {hypothesis.status}</span></div><ArrowDownRight size={15} className="hypothesis-arrow" /></div>)}
          {hypotheses.length === 0 && <div className="empty-hypotheses"><div className="empty-orbit"><Sparkles size={19} /></div><b>Sin hipótesis registradas</b><span>Formula una pregunta investigable y reúne evidencia a favor, en contra o indirecta.</span><button onClick={() => onOpen("hypotheses")}>Crear primera hipótesis <ArrowUpRight size={14} /></button></div>}
        </div>
      </section>
      <div className="source-line"><span>Catálogo de partida proporcionado por la persona investigadora</span><span>Actualización externa: {dashboard?.last_external_update ? new Date(dashboard.last_external_update).toLocaleString() : "sin consultas guardadas"}</span></div>
    </>
  );
}

function GenomicsPage({ genes, onChange }: { genes: Gene[]; onChange: () => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [remoteQuery, setRemoteQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<Array<{ id: string; symbol: string; name: string; description: string }>>([]);
  const [queryFetchedAt, setQueryFetchedAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const filtered = useMemo(() => genes.filter((gene) => `${gene.symbol} ${gene.full_name ?? ""} ${gene.description ?? ""}`.toLowerCase().includes(query.toLowerCase())), [genes, query]);
  async function searchExternal(event: React.FormEvent) {
    event.preventDefault();
    if (!remoteQuery.trim()) return;
    setBusy(true); setMessage("");
    setRemoteResults([]);
    setQueryFetchedAt("");
    try { const result = await api.searchGenes(remoteQuery.trim()); setRemoteResults(result.results); setQueryFetchedAt(result.fetched_at); }
    catch (e) { setMessage(e instanceof Error ? e.message : "La consulta NCBI falló."); }
    finally { setBusy(false); }
  }
  async function addGene(event: React.FormEvent) {
    event.preventDefault();
    try { await api.addGene(newSymbol.trim(), newName.trim()); setNewSymbol(""); setNewName(""); setMessage("Candidato agregado al catálogo local."); await onChange(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo guardar el gen."); }
  }
  return (
    <>
      <PageTitle eyebrow="INVESTIGACIÓN GENÉTICA" title="Centro genómico" description="Explora y organiza candidatos sin confundir plausibilidad biológica con causalidad de hEDS." />
      <div className="notice-strip"><Dna size={18} /><span>El listado inicial incluye genes relacionados con tejido conectivo y diagnósticos diferenciales. <b>No representa genes causales establecidos de hEDS.</b></span></div>
      <div className="content-two-col">
        <section className="panel content-panel">
          <div className="panel-heading"><div><h2>Catálogo local de candidatos</h2><p>{genes.length} genes en tu espacio de investigación</p></div><span className="panel-tag"><span /> Local</span></div>
          <label className="search-field"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar por símbolo o nombre…" /></label>
          <div className="gene-table full-table"><div className="table-head"><span>SÍMBOLO</span><span>NOMBRE</span><span>ESTADO DE EVIDENCIA</span></div>
            {filtered.map((gene) => <div className="table-row" key={gene.id}><b className="gene-symbol">{gene.symbol}</b><span className="gene-description">{gene.full_name || "—"}</span><span className="candidate-badge">Candidato · no causal</span></div>)}
            {filtered.length === 0 && <div className="empty-row">No hay coincidencias en el catálogo local.</div>}
          </div>
          <form className="add-gene-form" onSubmit={(e) => void addGene(e)}><b>Añadir un candidato</b><div><input required maxLength={32} value={newSymbol} onChange={(e) => setNewSymbol(e.target.value.toUpperCase())} placeholder="Símbolo HGNC" /><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nombre (opcional)" /><button className="primary-button" type="submit">Guardar candidato</button></div></form>
        </section>
        <section className="panel content-panel">
          <div className="panel-heading"><div><h2>Consulta externa · NCBI Gene</h2><p>Consulta en vivo del catálogo de NCBI</p></div><span className="external-pill">NCBI</span></div>
          <form className="search-row" onSubmit={(e) => void searchExternal(e)}><label className="search-field"><Search size={17} /><input value={remoteQuery} onChange={(e) => setRemoteQuery(e.target.value)} placeholder="Símbolo oficial (TNXB), Gene ID o nombre exacto" /></label><button className="primary-button" disabled={busy}>{busy ? "Buscando…" : "Buscar"}</button></form>
          <p className="small-note">Coincidencia exacta del símbolo/nombre en Homo sapiens; no se usan coincidencias amplias de texto. La consulta se envía a NCBI al buscar.{queryFetchedAt && ` Consulta/caché: ${new Date(queryFetchedAt).toLocaleString()}.`}</p>
          {message && <div className="inline-message" role="status">{message}</div>}
          <div className="remote-results">{remoteResults.map((item) => <div className="remote-result" key={item.id}><div><b>{item.symbol || "Sin símbolo"}</b><span>{item.name || "Sin nombre disponible"} · Gene ID {item.id}</span><p>{item.description || "NCBI no proporcionó una descripción."}</p></div><a href={`https://www.ncbi.nlm.nih.gov/gene/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">NCBI ↗</a></div>)}
            {remoteResults.length === 0 && <div className="remote-empty"><Dna size={24} /><span>{remoteQuery && queryFetchedAt ? "NCBI no encontró una coincidencia exacta de símbolo o nombre." : "Los resultados exactos recuperados de NCBI aparecerán aquí."}</span></div>}
          </div>
        </section>
      </div>
    </>
  );
}

function LiteraturePage() {
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<Article[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [queryFetchedAt, setQueryFetchedAt] = useState("");
  async function search(event: React.FormEvent) {
    event.preventDefault(); if (!query.trim()) return;
    setBusy(true); setError("");
    setArticles([]);
    setQueryFetchedAt("");
    try { const result = await api.searchArticles(query.trim()); setArticles(result.results); setQueryFetchedAt(result.fetched_at); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo consultar PubMed."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <PageTitle eyebrow="EVIDENCIA PUBLICADA" title="Literatura científica" description="Busca metadatos bibliográficos reales en PubMed y contrasta cada registro con el texto original." />
      <section className="panel content-panel literature-panel">
        <div className="panel-heading"><div><h2>Búsqueda PubMed</h2><p>NCBI Entrez E-utilities · búsqueda explícita</p></div><span className="external-pill">NCBI · PubMed</span></div>
        <form className="literature-search" onSubmit={(e) => void search(e)}><label className="search-field"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Ej.: "hypermobile Ehlers-Danlos" TNXB' /></label><button className="primary-button" disabled={busy}>{busy ? "Consultando…" : "Buscar publicaciones"}</button></form>
        <p className="small-note">Cada término se exige en título/resumen de PubMed (AND); usa comillas para una frase exacta. Revisa el artículo original antes de registrarlo como evidencia.{queryFetchedAt && ` Consulta/caché: ${new Date(queryFetchedAt).toLocaleString()}.`}</p>
        {error && <div className="error-banner compact" role="alert">{error}</div>}
        <div className="article-list">
          {articles.map((article) => <article className="article-card" key={article.pmid}><div className="article-meta"><span className="article-source">PMID {article.pmid}</span><span>{article.year || "Año no disponible"}</span><span>{article.journal || "Revista no disponible"}</span></div><h3>{article.title}</h3><div className="article-authors">{article.authors.join(", ") || "Autoría no disponible"}</div>{article.abstract && <p className="article-abstract">{article.abstract}</p>}<div className="article-links"><a href={article.url} target="_blank" rel="noreferrer">Abrir en PubMed ↗</a>{article.doi && <span>DOI: {article.doi}</span>}</div></article>)}
          {articles.length === 0 && <div className="empty-literature"><BookOpen size={25} /><b>Busca una publicación para comenzar</b><span>Los resultados proceden de PubMed; no se fabrican registros cuando el servicio falla o no hay coincidencias.</span></div>}
        </div>
      </section>
    </>
  );
}

function VariantsPage() {
  const [gene, setGene] = useState("");
  const [geneResults, setGeneResults] = useState<ClinVarVariant[]>([]);
  const [geneError, setGeneError] = useState("");
  const [geneBusy, setGeneBusy] = useState(false);
  const [geneFetchedAt, setGeneFetchedAt] = useState("");
  const [hgvs, setHgvs] = useState("");
  const [annotations, setAnnotations] = useState<VariantAnnotation[]>([]);
  const [notice, setNotice] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function searchGene(event: React.FormEvent) {
    event.preventDefault();
    if (!gene.trim()) return;
    setGeneBusy(true);
    setGeneError("");
    setGeneResults([]);
    setGeneFetchedAt("");
    try {
      const result = await api.searchVariantsByGene(gene.trim());
      setGeneResults(result.results);
      setGeneFetchedAt(result.fetched_at);
    } catch (e) {
      setGeneError(e instanceof Error ? e.message : "No se pudo consultar ClinVar.");
    } finally {
      setGeneBusy(false);
    }
  }

  async function annotate(event: React.FormEvent) {
    event.preventDefault();
    if (!hgvs.trim()) return;
    setBusy(true);
    setError("");
    setAnnotations([]);
    try {
      const result = await api.annotateVariant(hgvs.trim());
      setAnnotations(result.results);
      setNotice(result.notice);
      setFetchedAt(result.fetched_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar Ensembl VEP.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle eyebrow="VARIANTES Y ANOTACIÓN" title="Variantes genéticas" description="Busca variantes ClinVar por símbolo génico o anota una variante conocida mediante HGVS." />
      <div className="notice-strip"><ShieldCheck size={18} /><span><b>Interpretación:</b> ClinVar recopila afirmaciones clínicas enviadas por distintos remitentes; VEP aporta consecuencias computacionales. Ninguno determina por sí solo diagnóstico ni causalidad para hEDS.</span></div>
      <section className="panel content-panel literature-panel">
        <div className="panel-heading"><div><h2>Buscar variantes por gen</h2><p>NCBI ClinVar · coincidencia exacta de símbolo y Homo sapiens</p></div><span className="external-pill">ClinVar</span></div>
        <form className="literature-search" onSubmit={(e) => void searchGene(e)}>
          <label className="search-field"><Search size={18} /><input value={gene} onChange={(e) => setGene(e.target.value.toUpperCase())} placeholder="Símbolo oficial, por ejemplo TNXB" /></label>
          <button className="primary-button" disabled={geneBusy}>{geneBusy ? "Buscando…" : "Buscar variantes"}</button>
        </form>
        <p className="small-note">Se muestran hasta 50 registros ClinVar asociados exactamente al símbolo consultado; esto no implica que estén relacionados con hEDS.{geneFetchedAt && ` Consulta/caché: ${new Date(geneFetchedAt).toLocaleString()}.`}</p>
        {geneError && <div className="error-banner compact" role="alert">{geneError}</div>}
        {geneResults.map((variant) => <ClinVarVariantCard variant={variant} key={variant.uid} />)}
        {geneResults.length === 0 && !geneError && !geneBusy && <div className="remote-empty"><GitFork size={24} /><span>{geneFetchedAt ? "ClinVar no devolvió variantes para ese símbolo exacto." : "Las variantes recuperadas de ClinVar aparecerán aquí."}</span></div>}
      </section>

      <section className="panel content-panel literature-panel">
        <div className="panel-heading"><div><h2>Anotar una variante HGVS</h2><p>Ensembl Variant Effect Predictor · especie humana</p></div><span className="external-pill">Ensembl VEP</span></div>
        <form className="literature-search" onSubmit={(e) => void annotate(e)}>
          <label className="search-field"><GitFork size={18} /><input value={hgvs} onChange={(e) => setHgvs(e.target.value)} placeholder="ENST00000366667:c.803C>T" /></label>
          <button className="primary-button" disabled={busy}>{busy ? "Anotando…" : "Consultar VEP"}</button>
        </form>
        <p className="small-note">Este campo requiere HGVS; para encontrar variantes de un gen usa el buscador ClinVar de arriba. {fetchedAt && `Consulta/caché: ${new Date(fetchedAt).toLocaleString()}.`}</p>
        {error && <div className="error-banner compact" role="alert">{error}</div>}
        {notice && <div className="inline-message" role="note">{notice}</div>}
        {annotations.map((annotation, index) => (
          <div className="annotation-card" key={`${annotation.input}-${index}`}>
            <div className="panel-heading"><div><span className="eyebrow">HGVS CONSULTADO</span><h3>{annotation.input}</h3></div><span className="candidate-badge">Consecuencia in silico</span></div>
            <div className="annotation-summary">
              <span><small>Variante</small><b>{annotation.id || "Sin ID asignado"}</b></span>
              <span><small>Consecuencia principal</small><b>{annotation.most_severe_consequence || "No informada"}</b></span>
              <span><small>Región / posición</small><b>{annotation.seq_region_name ? `${annotation.seq_region_name}:${annotation.start ?? "?"}-${annotation.end ?? "?"}` : "No informada"}</b></span>
              <span><small>Alelo</small><b>{annotation.allele_string || "No informado"}</b></span>
            </div>
            <h4>Consecuencias por transcrito</h4>
            {annotation.transcript_consequences.map((consequence, consequenceIndex) => (
              <div className="transcript-row" key={`${consequence.transcript_id || consequence.gene_id}-${consequenceIndex}`}>
                <b>{consequence.gene_symbol || consequence.gene_id || "Gen no asignado"}</b>
                <span>{consequence.transcript_id || "Sin transcrito"}</span>
                <span>{consequence.consequence_terms.join(", ") || consequence.biotype || "Consecuencia no informada"}</span>
                {consequence.amino_acids && <span>{consequence.amino_acids}{consequence.protein_start ? ` · posición ${consequence.protein_start}` : ""}</span>}
              </div>
            ))}
            {annotation.transcript_consequences.length === 0 && <p className="small-note">VEP no informó consecuencias por transcrito para esta respuesta.</p>}
          </div>
        ))}
        {annotations.length === 0 && !error && !busy && <div className="remote-empty"><GitFork size={24} /><span>El resultado real de Ensembl aparecerá aquí; las consultas fallidas no se sustituyen por datos de ejemplo.</span></div>}
      </section>
    </>
  );
}

function ClinVarVariantCard({ variant }: { variant: ClinVarVariant }) {
  return (
    <article className="clinvar-card">
      <div className="panel-heading">
        <div><span className="eyebrow">{variant.gene_symbol} · {variant.accession || `UID ${variant.uid}`}</span><h3>{variant.title || "Variante sin título reportado"}</h3></div>
        <span className="candidate-badge">Registro ClinVar</span>
      </div>
      <div className="annotation-summary">
        <span><small>Significado clínico reportado</small><b>{variant.clinical_significance || "No informado"}</b></span>
        <span><small>Estado de revisión</small><b>{variant.review_status || "No informado"}</b></span>
        <span><small>Consecuencia molecular</small><b>{variant.molecular_consequences.join(", ") || "No informada"}</b></span>
        <span><small>Posición GRCh38</small><b>{variant.chromosome && variant.position_grch38 ? `${variant.chromosome}:${variant.position_grch38}` : "No informada"}</b></span>
      </div>
      {variant.hgvs.length > 0 && <p className="small-note"><b>HGVS:</b> {variant.hgvs.join(" · ")}</p>}
      {variant.protein_change && <p className="small-note"><b>Cambio proteico:</b> {variant.protein_change}</p>}
      {variant.last_evaluated && <p className="small-note"><b>Evaluada:</b> {variant.last_evaluated}{variant.variant_type ? ` · ${variant.variant_type}` : ""}</p>}
      <a className="protein-link" href={`https://www.ncbi.nlm.nih.gov/clinvar/${encodeURIComponent(variant.accession || variant.uid)}/`} target="_blank" rel="noreferrer">Ver envío y evidencia original en ClinVar ↗</a>
    </article>
  );
}

function ProteomicsPage() {
  const [gene, setGene] = useState("");
  const [proteins, setProteins] = useState<ProteinRecord[]>([]);
  const [expandedSequence, setExpandedSequence] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!gene.trim()) return;
    setBusy(true);
    setError("");
    setProteins([]);
    setExpandedSequence(null);
    try {
      const result = await api.searchProteins(gene.trim());
      setProteins(result.results);
      setFetchedAt(result.fetched_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar UniProt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle eyebrow="PROTEÍNAS · UNIPROTKB" title="Centro proteómico" description="Recupera fichas humanas de UniProtKB vinculadas a un símbolo génico exacto." />
      <div className="notice-strip"><Boxes size={18} /><span>La búsqueda filtra por símbolo génico exacto y organismo humano. Una ficha de proteína describe el registro de UniProt; no demuestra alteración en hEDS.</span></div>
      <section className="panel content-panel literature-panel">
        <div className="panel-heading"><div><h2>Buscar proteína por gen</h2><p>UniProtKB REST API · resultados revisados y no revisados identificados</p></div><span className="external-pill">UniProtKB</span></div>
        <form className="literature-search" onSubmit={(e) => void search(e)}>
          <label className="search-field"><Search size={18} /><input value={gene} onChange={(e) => setGene(e.target.value.toUpperCase())} placeholder="Símbolo oficial, por ejemplo TNXB" /></label>
          <button className="primary-button" disabled={busy}>{busy ? "Buscando…" : "Buscar proteína"}</button>
        </form>
        <p className="small-note">Se recupera nombre, estado de revisión, longitud, secuencia y función cuando UniProt los publica. Consulta/caché local: {fetchedAt ? new Date(fetchedAt).toLocaleString() : "aún sin consultar"}.</p>
        {error && <div className="error-banner compact" role="alert">{error}</div>}
        <div className="protein-list">
          {proteins.map((protein) => (
            <article className="protein-card" key={protein.accession}>
              <div className="panel-heading"><div><span className="eyebrow">{protein.gene_symbol} · {protein.accession}</span><h3>{protein.protein_name || "Nombre no disponible"}</h3></div><span className={`review-badge ${protein.reviewed ? "reviewed" : ""}`}>{protein.reviewed ? "Revisada · Swiss-Prot" : "No revisada · TrEMBL"}</span></div>
              <div className="annotation-summary protein-summary">
                <span><small>Accession</small><b>{protein.accession}</b></span>
                <span><small>Longitud</small><b>{protein.length ? `${protein.length.toLocaleString()} aa` : "No informada"}</b></span>
                <span><small>Fuente</small><b>UniProtKB</b></span>
              </div>
              {protein.function.map((description, index) => <p className="protein-function" key={index}>{description}</p>)}
              {protein.sequence && <button className="more-button sequence-toggle" onClick={() => setExpandedSequence(expandedSequence === protein.accession ? null : protein.accession)}>{expandedSequence === protein.accession ? "Ocultar secuencia" : "Mostrar secuencia"} <ChevronDown size={14} /></button>}
              {expandedSequence === protein.accession && protein.sequence && <pre className="protein-sequence">{protein.sequence.match(/.{1,60}/g)?.join("\n")}</pre>}
              <a className="protein-link" href={`https://www.uniprot.org/uniprotkb/${encodeURIComponent(protein.accession)}/entry`} target="_blank" rel="noreferrer">Ver ficha original en UniProt ↗</a>
            </article>
          ))}
          {proteins.length === 0 && !error && !busy && <div className="remote-empty"><Boxes size={24} /><span>Las proteínas recuperadas de UniProt aparecerán aquí.</span></div>}
        </div>
      </section>
    </>
  );
}

function HypothesesPage({ hypotheses, onChange }: { hypotheses: Hypothesis[]; onChange: () => Promise<void> }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", question: "", rationale: "" });
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [evidenceForm, setEvidenceForm] = useState({ direction: "unknown" as Evidence["direction"], dimension: "association", description: "", source_name: "", source_id: "", source_url: "", study_design: "", limitations: "" });
  const [message, setMessage] = useState("");
  const activeHypothesis = hypotheses.find((item) => item.id === selected) ?? hypotheses[0];
  useEffect(() => { if (!selected && hypotheses.length) setSelected(hypotheses[0].id); }, [hypotheses, selected]);
  useEffect(() => {
    if (!activeHypothesis) { setEvidence([]); return; }
    let cancelled = false;
    void api.evidence(activeHypothesis.id).then((rows) => { if (!cancelled) setEvidence(rows); }).catch((e) => { if (!cancelled) setMessage(e instanceof Error ? e.message : "No se pudo leer la evidencia."); });
    return () => { cancelled = true; };
  }, [activeHypothesis?.id]);

  async function createHypothesis(event: React.FormEvent) {
    event.preventDefault();
    try {
      const created = await api.addHypothesis(form);
      setForm({ title: "", question: "", rationale: "" }); setShowForm(false); setSelected(created.id); setMessage("Hipótesis guardada como hipótesis de trabajo."); await onChange();
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo guardar la hipótesis."); }
  }
  async function createEvidence(event: React.FormEvent) {
    event.preventDefault(); if (!activeHypothesis) return;
    try {
      await api.addEvidence(activeHypothesis.id, { ...evidenceForm, source_id: evidenceForm.source_id || null, source_url: evidenceForm.source_url || null, study_design: evidenceForm.study_design || null, limitations: evidenceForm.limitations || null });
      setEvidenceForm({ direction: "unknown", dimension: "association", description: "", source_name: "", source_id: "", source_url: "", study_design: "", limitations: "" });
      setEvidence(await api.evidence(activeHypothesis.id)); await onChange(); setMessage("Registro de evidencia guardado con su procedencia.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "No se pudo guardar la evidencia."); }
  }
  return (
    <>
      <PageTitle eyebrow="EVALUACIÓN AUDITABLE" title="Motor de hipótesis" description="Registra preguntas científicas y evidencia favorable, contraria, indirecta o ausente sin reducirla a una probabilidad de causalidad." />
      <div className="notice-strip"><Sparkles size={18} /><span><b>No hay puntuación automática ni ranking causal.</b> La valoración depende de la evidencia registrada, su independencia, el diseño del estudio y sus limitaciones.</span></div>
      <div className="hypothesis-layout">
        <section className="panel hypothesis-list-panel">
          <div className="panel-heading"><div><h2>Hipótesis de trabajo</h2><p>{hypotheses.length} registradas</p></div><button className="primary-button small-primary" onClick={() => setShowForm((value) => !value)}>+ Nueva</button></div>
          {showForm && <form className="form-stack" onSubmit={(e) => void createHypothesis(e)}><label>Título<input required maxLength={180} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label><label>Pregunta de investigación<textarea required rows={3} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></label><label>Razonamiento inicial (opcional)<textarea rows={2} value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} /></label><button className="primary-button" type="submit">Guardar hipótesis</button></form>}
          {hypotheses.map((item) => <button key={item.id} className={`hypothesis-select ${activeHypothesis?.id === item.id ? "selected" : ""}`} onClick={() => setSelected(item.id)}><span className="hypothesis-icon"><Sparkles size={16} /></span><span><b>{item.title}</b><small>{item.evidence_count} evidencias · {item.status}</small></span></button>)}
          {hypotheses.length === 0 && !showForm && <div className="empty-hypotheses compact-empty"><div className="empty-orbit"><Sparkles size={19} /></div><b>No has registrado hipótesis</b><span>Empieza por formular una pregunta que pueda contrastarse.</span><button onClick={() => setShowForm(true)}>Crear hipótesis</button></div>}
        </section>
        <section className="panel hypothesis-detail-panel">
          {activeHypothesis ? <>
            <div className="panel-heading"><div><span className="eyebrow">HIPÓTESIS DE TRABAJO</span><h2 className="detail-title">{activeHypothesis.title}</h2></div><span className="candidate-badge">No validada</span></div>
            {activeHypothesis.question && <div className="question-box"><b>Pregunta</b><span>{activeHypothesis.question}</span></div>}
            {activeHypothesis.rationale && <p className="rationale-text">{activeHypothesis.rationale}</p>}
            <div className="evidence-heading"><h3>Registro de evidencia</h3><span>{evidence.length} registros · no deduplicados automáticamente</span></div>
            <div className="evidence-list">{evidence.map((entry) => <div className="evidence-item" key={entry.id}><span className={`evidence-direction ${entry.direction}`}>{directionLabel(entry.direction)}</span><div><b>{entry.dimension} · {entry.source_name}</b><p>{entry.description}</p><small>{entry.study_design || "Diseño no especificado"}{entry.source_id ? ` · ${entry.source_id}` : ""}{entry.limitations ? ` · Limitaciones: ${entry.limitations}` : ""}</small>{entry.source_url && <a href={entry.source_url} target="_blank" rel="noreferrer">Abrir fuente ↗</a>}</div></div>)}
              {evidence.length === 0 && <div className="evidence-empty">Sin evidencia registrada. La ausencia de registro no equivale a evidencia contraria.</div>}
            </div>
            <form className="evidence-form" onSubmit={(e) => void createEvidence(e)}><h3>Añadir observación de evidencia</h3><div className="form-grid"><label>Relación<select value={evidenceForm.direction} onChange={(e) => setEvidenceForm({ ...evidenceForm, direction: e.target.value as Evidence["direction"] })}><option value="supports">Favorable</option><option value="opposes">Contraria</option><option value="indirect">Indirecta</option><option value="unknown">No determinada</option></select></label><label>Dimensión<select value={evidenceForm.dimension} onChange={(e) => setEvidenceForm({ ...evidenceForm, dimension: e.target.value })}><option value="association">Asociación</option><option value="biological_plausibility">Plausibilidad biológica</option><option value="functional">Evidencia funcional</option><option value="genetic_causality">Causalidad genética</option><option value="hEDS_relevance">Relevancia específica para hEDS</option><option value="pharmacogenomics">Farmacogenómica</option></select></label></div><label>Descripción<textarea required rows={3} value={evidenceForm.description} onChange={(e) => setEvidenceForm({ ...evidenceForm, description: e.target.value })} /></label><div className="form-grid"><label>Fuente / estudio<input required value={evidenceForm.source_name} onChange={(e) => setEvidenceForm({ ...evidenceForm, source_name: e.target.value })} placeholder="Nombre del estudio o base" /></label><label>PMID, DOI u otro ID<input value={evidenceForm.source_id} onChange={(e) => setEvidenceForm({ ...evidenceForm, source_id: e.target.value })} /></label></div><label>URL de fuente<input type="url" value={evidenceForm.source_url} onChange={(e) => setEvidenceForm({ ...evidenceForm, source_url: e.target.value })} placeholder="https://…" /></label><div className="form-grid"><label>Diseño del estudio<input value={evidenceForm.study_design} onChange={(e) => setEvidenceForm({ ...evidenceForm, study_design: e.target.value })} placeholder="Ej.: cohorte, ensayo funcional" /></label><label>Limitaciones<textarea rows={1} value={evidenceForm.limitations} onChange={(e) => setEvidenceForm({ ...evidenceForm, limitations: e.target.value })} /></label></div><button className="primary-button" type="submit">Guardar evidencia</button></form>
          </> : <div className="empty-literature"><Sparkles size={25} /><b>Selecciona o crea una hipótesis</b></div>}
          {message && <div className="inline-message" role="status">{message}</div>}
        </section>
      </div>
    </>
  );
}

function PendingPage({ moduleKey }: { moduleKey: ModuleKey }) {
  const item = navigation.find((entry) => entry.key === moduleKey);
  const Icon = item?.icon ?? CircleHelp;
  return <><PageTitle eyebrow="MÓDULO EN DESARROLLO" title={item?.label ?? "Módulo"} description="El módulo está visible en la arquitectura, pero aún no tiene conectores o análisis implementados." /><div className="pending-panel panel"><div className="pending-icon"><Icon size={25} /></div><span className="eyebrow">ESTADO TRANSPARENTE · SIN DATOS SIMULADOS</span><h2>Integración pendiente</h2><p>{pendingModules[moduleKey] ?? "Este módulo aún no está implementado."}</p><div className="pending-status"><span className="status-dot" /> No se han ejecutado análisis ni consultas externas desde este módulo.</div></div></>;
}

function PageTitle({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot" /> {eyebrow}</div><h1>{title}</h1><p>{description}</p></div></div>;
}

function directionLabel(direction: Evidence["direction"]) {
  return ({ supports: "Favorable", opposes: "Contraria", indirect: "Indirecta", unknown: "No determinada" })[direction];
}

export default App;
