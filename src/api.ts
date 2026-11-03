export type Dashboard = {
  candidate_genes: number;
  variants: number;
  proteins: number;
  interactions: number;
  publications: number;
  hypotheses: number;
  analyses: number;
  last_external_update: string | null;
};

export type Gene = {
  id: number;
  symbol: string;
  full_name: string | null;
  ncbi_gene_id: string | null;
  ensembl_gene_id: string | null;
  chromosome: string | null;
  description: string | null;
  evidence_status: string;
  source: string;
  updated_at: string;
};

export type Article = {
  pmid: string;
  title: string;
  journal: string | null;
  year: string | null;
  authors: string[];
  doi: string | null;
  abstract: string | null;
  url: string;
};

export type Hypothesis = {
  id: number;
  title: string;
  question: string | null;
  status: string;
  rationale: string | null;
  created_at: string;
  evidence_count: number;
};

export type Evidence = {
  id: number;
  direction: "supports" | "opposes" | "indirect" | "unknown";
  dimension: string;
  description: string;
  study_design: string | null;
  source_name: string;
  source_id: string | null;
  source_url: string | null;
  limitations: string | null;
  created_at: string;
};

export type VariantAnnotation = {
  input: string;
  id: string | null;
  seq_region_name: string | null;
  start: number | null;
  end: number | null;
  allele_string: string | null;
  most_severe_consequence: string | null;
  transcript_consequences: Array<{
    gene_id: string | null;
    gene_symbol: string | null;
    transcript_id: string | null;
    biotype: string | null;
    consequence_terms: string[];
    amino_acids: string | null;
    codons: string | null;
    protein_start: number | null;
    protein_end: number | null;
  }>;
};

export type ClinVarVariant = {
  uid: string;
  accession: string | null;
  gene_symbol: string;
  title: string;
  variant_type: string | null;
  hgvs: string[];
  protein_change: string | null;
  molecular_consequences: string[];
  clinical_significance: string | null;
  review_status: string | null;
  last_evaluated: string | null;
  chromosome: string | null;
  position_grch38: string | null;
};

export type ProteinRecord = {
  accession: string;
  protein_name: string;
  gene_symbol: string;
  reviewed: boolean;
  length: number | null;
  sequence: string | null;
  function: string[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? `Error HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  dashboard: () => request<Dashboard>("/dashboard"),
  genes: (query = "") => request<Gene[]>(`/genes${query ? `?q=${encodeURIComponent(query)}` : ""}`),
  addGene: (symbol: string, full_name: string) =>
    request<Gene>("/genes", { method: "POST", body: JSON.stringify({ symbol, full_name }) }),
  searchGenes: (query: string) =>
    request<{ source: string; fetched_at: string; results: Array<{ id: string; symbol: string; name: string; description: string }> }>(
      `/external/genes?q=${encodeURIComponent(query)}`,
    ),
  searchArticles: (query: string) =>
    request<{ source: string; fetched_at: string; results: Article[] }>(
      `/literature/search?q=${encodeURIComponent(query)}`,
    ),
  annotateVariant: (hgvs: string) =>
    request<{ source: string; fetched_at: string; request_url: string; notice: string; results: VariantAnnotation[] }>(
      `/variants/annotate?hgvs=${encodeURIComponent(hgvs)}`,
    ),
  searchVariantsByGene: (gene: string) =>
    request<{ source: string; fetched_at: string; query: string; results: ClinVarVariant[] }>(
      `/variants/search?gene=${encodeURIComponent(gene)}`,
    ),
  searchProteins: (gene: string) =>
    request<{ source: string; fetched_at: string; request_url: string; results: ProteinRecord[] }>(
      `/proteins/search?gene=${encodeURIComponent(gene)}`,
    ),
  hypotheses: () => request<Hypothesis[]>("/hypotheses"),
  addHypothesis: (payload: { title: string; question: string; rationale: string }) =>
    request<Hypothesis>("/hypotheses", { method: "POST", body: JSON.stringify(payload) }),
  evidence: (hypothesisId: number) => request<Evidence[]>(`/hypotheses/${hypothesisId}/evidence`),
  addEvidence: (hypothesisId: number, payload: Omit<Evidence, "id" | "created_at">) =>
    request<Evidence>(`/hypotheses/${hypothesisId}/evidence`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
