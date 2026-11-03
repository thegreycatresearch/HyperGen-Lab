# Ejemplo reproducible: búsqueda bibliográfica

Este flujo no presupone resultados científicos ni una asociación con hEDS. Usa una búsqueda elegida por la persona investigadora.

1. Inicia FastAPI y Vite siguiendo el README.
2. Abre **Literatura científica** y ejecuta la consulta `("hypermobile Ehlers-Danlos" OR hEDS) AND TNXB`.
3. La aplicación consulta PubMed mediante NCBI Entrez E-utilities (`esearch` y `esummary`), guarda el resultado bruto y metadatos de la consulta en `data/hypergen_lab.sqlite3`, y muestra PMID/DOI y enlace al registro original.
4. Anota fecha y cadena de búsqueda. Abre y revisa el artículo original; el resumen bibliográfico no sustituye al texto completo ni a una evaluación crítica.
5. Si el artículo es pertinente a una hipótesis, regístralo manualmente como evidencia con dirección, dimensión, PMID/DOI/URL, diseño y limitaciones.
6. Repetir la misma consulta mientras la caché no haya expirado utiliza la respuesta almacenada. Cambia `CACHE_TTL_SECONDS` para ajustar la vigencia.

Para inspeccionar el endpoint reproducible: `GET /api/literature/search?q=...`. `GET /docs` describe el contrato API local. No se presenta aquí un resultado de búsqueda precalculado como si fuera un hallazgo.
