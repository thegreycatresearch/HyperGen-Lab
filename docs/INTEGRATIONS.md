# Estado de conectores e investigación

## Implementado en esta iteración

| Fuente | Uso | Procedencia/cache | Estado |
|---|---|---|---|
| NCBI Gene / Entrez E-utilities | Búsqueda por símbolo/nombre exacto o Gene ID humano | Término exacto en consulta, verificación de símbolo/nombre y taxid, respuesta original y hora en SQLite; caché versionada | Operativo |
| PubMed / Entrez E-utilities | Búsqueda bibliográfica limitada a título/resumen, metadatos y abstract si se informa | Cada término se consulta con AND; términos en Title/Abstract; ESearch/ESummary/EFetch y hora en SQLite; caché versionada | Operativo |
| NCBI ClinVar / Entrez E-utilities | Búsqueda de variantes por símbolo génico exacto; incluye clasificación enviada, revisión y coordenada GRCh38 cuando disponibles | Verificación exacta del símbolo asociado; respuesta original, parámetros y hora en SQLite; caché versionada | Operativo |
| Ensembl VEP REST | Consecuencias transcriptómicas para una variante HGVS | Consulta, respuesta original, anotación derivada y hora en SQLite | Operativo |
| UniProtKB REST | Fichas proteicas humanas por símbolo génico exacto; accession, secuencia, función y revisión | Taxid/símbolo verificados, respuesta original y hora en SQLite | Operativo |
| SQLite | genes candidatos, hipótesis, evidencia y caché de respuestas externas | Persistencia local | Operativo |

Documentación oficial: NCBI E-utilities <https://www.ncbi.nlm.nih.gov/books/NBK25499/>; Ensembl VEP HGVS endpoint <https://rest.ensembl.org/documentation/info/vep_hgvs_get>; UniProt REST API <https://www.uniprot.org/api-documentation> y términos/licencia <https://www.uniprot.org/help/license>. UniProt es CC BY 4.0 y debe atribuirse. Ensembl tiene sus propios términos de uso y cita; consulta <https://www.ensembl.org/info/about/legal/disclaimer.html>.

NCBI puede aplicar límites por IP; el conector limita las solicitudes a menos de 3 por segundo y aplica hasta dos reintentos acotados para fallos transitorios/429, respetando `Retry-After` hasta un máximo de cinco segundos. `NCBI_EMAIL` es opcional. El agotamiento de reintentos o una estructura no válida se devuelve como error visible. La navegación a PubMed usa el registro original por PMID.

La búsqueda de genes ahora prioriza identificadores exactos: consulta `Gene Name` y taxid 9606 para símbolos/nombres, o busca el Gene ID exacto. Además valida el símbolo/nombre y el taxid en el resumen antes de mostrarlo. Una búsqueda sin coincidencia exacta devuelve una lista vacía, no una alternativa aproximada. Esto evita que `TNXB` se sustituya por resultados que solo coinciden en otros campos.

La búsqueda de PubMed combina términos mediante AND y los restringe a Title/Abstract. Las frases entre comillas se consultan como frases. La lista evita la búsqueda automática amplia de campos de Entrez; no garantiza relevancia clínica, por lo que hay que revisar los abstracts y artículos originales.

ClinVar permite buscar por símbolo y verifica el gen asociado exacto en cada registro antes de mostrarlo. Las clasificaciones son afirmaciones de remitentes en ClinVar; pueden variar y no implican relación con hEDS. La interfaz incluye enlace al registro y muestra el estado de revisión.

VEP devuelve anotaciones computacionales, consecuencias y enlaces de transcritos cuando los ofrece. Acepta una variante HGVS, no un símbolo de gen; si se introduce un gen por error, la API responde con validación 422 e indica usar la búsqueda ClinVar. No se muestra como clasificación clínica ni patogenicidad. UniProt devuelve registros de proteína; el estado revisado significa revisión curatorial de UniProt, no evidencia relacionada con hEDS.

## Pendiente, sin datos simulados

El resto del encargo conserva su espacio de navegación, pero no se presenta como funcional hasta disponer de adaptadores y validaciones reales:

- dbSNP y gnomAD; carga de VCF, frecuencia poblacional y variantes estructurales. La búsqueda génica de ClinVar y consulta HGVS básica a Ensembl VEP ya funcionan.
- Ensembl/NCBI enriquecimiento de ficha genómica, transcritos y análisis especial TNXA/TNXB (incluida evaluación de mapeo); no hay inferencias de variante.
- STRING, Reactome, Gene Ontology, InterPro, Human Protein Atlas y PRIDE. La consulta de fichas de UniProtKB ya funciona.
- ClinPGx/PharmGKB, CPIC, PharmVar y fuentes regulatorias; sin recomendaciones clínicas.
- PRIDE/ProteomeXchange, ChEMBL y análisis farmacoproteómico.
- GEO, Expression Atlas y GTEx con pipelines de armonización.
- Redes NetworkX/Cytoscape, enriquecimiento funcional y pruebas estadísticas.
- Ingesta, deduplicación y lectura crítica de referencias; generación de informes y exportaciones DOCX/PDF/CSV/XLSX.
- Exportación/backup local y registro detallado de ejecuciones de análisis.

Esas tareas requieren incorporar fuente por fuente los esquemas, licencias, límites de uso, atribución, términos de respuesta y pruebas de contrato. No se han asignado puntuaciones compuestas, probabilidades causales ni pesos universales. La interfaz diferencia registros de evidencia y deja la evaluación científica a la persona investigadora.

## Política de datos y trazabilidad

- No hay envío automático de datos personales/experimentales.
- Las consultas externas se emiten solo cuando se usan los formularios correspondientes.
- Metadatos de PubMed y abstracts cuando están disponibles se guardan en la base local para reutilizar la caché; no se descarga ni almacena texto completo.
- Los candidatos semilla reflejan exclusivamente la lista que aportó la persona usuaria y llevan una clasificación explícita de «candidato».
- Las entradas manuales de evidencia conservan dimensión, dirección, fuente, ID/URL, diseño y limitaciones.
