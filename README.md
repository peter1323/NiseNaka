<p align="center">
  <img src="icons/icon-512.png" alt="Máscara de kitsune, icono de NiseNaka" width="160">
</p>

<h1 align="center">NiseNaka</h1>

<p align="center">Uno de vosotros no conoce al personaje. Descubrid al impostor.</p>

## Qué es

NiseNaka es un juego de impostor de anime para jugar en grupo con un solo móvil que se pasa de mano en mano. Todos reciben el mismo personaje menos uno: el impostor, que tiene que disimular mientras los demás intentan descubrirlo.

No hace falta registrarse ni instalar nada: se abre en el navegador y funciona.

## Jugar

👉 **https://peter1323.github.io/NiseNaka/**

Se puede instalar como aplicación desde el menú del navegador («Instalar» o «Añadir a pantalla de inicio») y, una vez cargada, se puede jugar sin internet.

## Cómo se juega

1. **Jugadores.** Indica cuántos sois (mínimo 3) y escribe los nombres.
2. **Personajes.** Elige una o varias categorías por género, un pack de un anime concreto o busca cualquier otro anime por su nombre.
3. **Reparto.** El móvil va pasando de jugador en jugador. Cada uno pulsa «Ver mi carta», mira en secreto su personaje (o el aviso de que es el impostor) y pulsa «Ocultar y pasar».
4. **Ronda de pistas.** En voz alta y en el orden que marca la app, cada jugador dice una pista sobre el personaje sin ser demasiado evidente. El impostor tiene que improvisar. No hay temporizador.
5. **Votación.** Cada jugador vota en el móvil a quién cree que es el impostor.
6. **Resultado.** Se revela el impostor y el personaje, y se actualiza el marcador.

### Puntos

- **+1** para cada jugador que vota al impostor.
- **+2** para el impostor si no lo descubren. Se le descubre solo si es el más votado, sin empate.

## Características

- Un solo móvil para todo el grupo.
- Categorías por género (acción, romance, isekai…), una de manhwa y packs de los animes más populares.
- **Buscador de anime:** escribe el nombre de cualquier anime y se crea un pack al momento (necesita internet).
- **Pista para el impostor** (opcional): el impostor ve de qué anime es el personaje.
- **Modo difícil:** el impostor recibe otro personaje del mismo anime o categoría y no sabe que es el impostor.
- Marcador de puntos entre rondas, con «Otra ronda» y «Nueva partida».
- No se repiten personajes durante la misma sesión.
- Instalable y jugable sin internet. Sin conexión, solo se ven las imágenes de los personajes que ya habían salido antes.
- Sin cuentas, sin servidor y sin anuncios.
- Hecho con HTML, CSS y JavaScript, sin frameworks.

## Cómo se actualizan los personajes

Los personajes están en archivos JSON dentro de [`data/`](data): uno por categoría, uno por pack de anime y un índice (`index.json`) con la lista de todos.

Esos archivos los genera el script [`scripts/actualizar-datos.mjs`](scripts/actualizar-datos.mjs) a partir de la API de [AniList](https://anilist.co):

- Solo personajes principales y secundarios con muchos favoritos.
- Packs de los 40 animes más populares que tengan al menos 12 personajes válidos.
- Sin contenido adulto.

Un workflow de GitHub Actions ejecuta el script una vez por semana y sube los cambios. Si algo falla, se conservan los archivos anteriores.

Para actualizarlos a mano (con Node.js 18 o superior):

```bash
node scripts/actualizar-datos.mjs
```

---

<p align="center">Creado por <a href="https://github.com/peter1323">peter1323</a></p>
