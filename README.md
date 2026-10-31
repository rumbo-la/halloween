# Dulce Rumbo

Juego de Halloween de Rumbo: guía al fantasma, atrapa los caramelos de tu stack y registra tu puntaje.

## Archivos

- `dulce-rumbo.html`: versión publicada en claude.ai (ranking en la base del artefacto).
- `web/`: versión alojable en GitHub Pages con ranking en Supabase. `web/index.html` se genera con `build-web.mjs`. La música (`halloween-0*.mp3`) vive solo aquí.
- `web/schema.sql`: tablas, políticas de seguridad, trigger y vista pública del ranking en Supabase.
- `game-core.js`: núcleo determinista del juego (semilla, paso fijo). Es la única fuente: `build-web.mjs` lo copia dentro de `dulce-rumbo.html`, de `web/index.html` y de las Edge Functions.
- `supabase/functions/`: Edge Functions `game-start` (emite una partida con semilla) y `game-finish` (vuelve a simular la partida con los movimientos enviados y registra el puntaje real). Se despliegan con el MCP de Supabase o con `supabase functions deploy`.
- `build-web.mjs`: sincroniza el núcleo y regenera `web/index.html` a partir de `dulce-rumbo.html`.

## Regenerar la versión web

```bash
node build-web.mjs https://<proyecto>.supabase.co <clave_publicable>
```

## Publicar en GitHub Pages

1. Crear el repositorio en GitHub y subir este proyecto a la rama `main`.
2. En Settings > Pages, elegir "GitHub Actions" como origen (solo la primera vez).
3. Cada push a `main` que toque `web/` ejecuta `.github/workflows/deploy-pages.yml` y publica el juego.

## Supabase

Ejecutar `web/schema.sql` en el SQL Editor del proyecto antes del primer despliegue. La clave publicable que va en el HTML es pública por diseño. El cliente no puede insertar puntajes: solo `game-finish` lo hace, con la clave de servicio, después de reproducir la partida en el servidor. El ranking conserva una fila por correo (la mejor); los intentos superados van a `scores_history`. Los correos no son legibles desde el cliente.
