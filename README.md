# HYPERGEN LAB

Entorno local para investigación reproducible sobre hEDS/SEDh. Los genes de partida se guardan como candidatos de investigación, no como genes causales demostrados. Las búsquedas remotas se realizan solo cuando el usuario las solicita y sus respuestas/caché quedan en la base SQLite local.

## Estado

La versión actual incluye un dashboard conectado a datos locales, catálogo editable de genes candidatos, búsqueda exacta de genes humanos en NCBI, búsqueda PubMed restringida a términos de título/resumen, búsqueda de variantes por gen en ClinVar, anotación HGVS real con Ensembl VEP, fichas de proteínas UniProtKB y registro de hipótesis/evidencia con procedencia. No produce puntuaciones de causalidad ni datos científicos ficticios. El estado de módulos e integraciones pendientes está en [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md).

## Requisitos

- Python 3.11 o posterior
- Node.js 20 o posterior y npm
- Conexión a Internet solo para consultar fuentes externas

## Inicio local (Windows PowerShell)

Desde la raíz del proyecto:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn backend.app.main:app --reload
```

En otra terminal:

```powershell
npm install
npm run dev
```

Abre la URL que muestra Vite (normalmente `http://localhost:5173`). La API está en `http://localhost:8000`; su documentación interactiva en `/docs`.

La base se crea como `hypergen_lab.sqlite3` en el directorio de datos local (por defecto `./data`). No se suben datos de investigación personales. Solo se envían a NCBI las consultas que se introducen explícitamente en las búsquedas externas.

## Variables de entorno

Consulta [`.env.example`](./.env.example). `DATABASE_URL` permite usar PostgreSQL sin cambiar los modelos. No se requieren claves privadas para las integraciones incluidas.

## Tests

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest
npm run build
```

El ejemplo reproducible de búsqueda y captura de procedencia está en [`examples/reproducible_search.md`](./examples/reproducible_search.md).

## Alcance científico

Esta herramienta organiza investigación y literatura; no es una herramienta diagnóstica ni de recomendación terapéutica. Una asociación, predicción in silico o interacción de base de datos no demuestra causalidad ni eficacia clínica. Las anotaciones deben revisarse frente a las fuentes originales antes de cualquier conclusión.
