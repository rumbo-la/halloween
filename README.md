# Dulce Rumbo

Juego de Halloween de Rumbo: guía al fantasma, atrapa los caramelos de tu stack y registra tu puntaje.

## Archivos

- `dulce-rumbo.html`: versión publicada en claude.ai (ranking en la base del artefacto).
- `web/`: versión alojable en GitHub Pages con ranking en Supabase. `web/index.html` se genera con `build-web.mjs`. La música (`halloween-0*.mp3`) vive solo aquí.
- `web/schema.sql`: tabla, políticas de seguridad y vista pública del ranking en Supabase.
- `build-web.mjs`: regenera `web/index.html` a partir de `dulce-rumbo.html`.

## Regenerar la versión web

```bash
node build-web.mjs https://<proyecto>.supabase.co <clave_publicable>
```

## Publicar en GitHub Pages

1. Crear el repositorio en GitHub y subir este proyecto a la rama `main`.
2. En Settings > Pages, elegir "GitHub Actions" como origen (solo la primera vez).
3. Cada push a `main` que toque `web/` ejecuta `.github/workflows/deploy-pages.yml` y publica el juego.

## Supabase

Ejecutar `web/schema.sql` en el SQL Editor del proyecto antes del primer despliegue. La clave publicable que va en el HTML es pública por diseño; la protección son las políticas RLS del esquema (inserción limitada, sin lectura de correos desde el cliente).
