// NiseNaka: juego de impostor de anime para un solo móvil.

const MIN_JUGADORES = 3;
const MAX_JUGADORES = 20;

const $ = (id) => document.getElementById(id);
const azar = (n) => Math.floor(Math.random() * n);

// Estado de la partida
let jugadores = [];   // nombres
let personajes = [];  // personajes disponibles según lo elegido
let puntos = [];      // puntos de cada jugador en esta partida
let ronda = null;     // { personaje, falso, impostor, turno, votos, acertaron }
const usados = new Set(); // personajes que ya han salido en esta sesión

const clave = (p) => `${p.nombre}|${p.anime}`;

function mostrar(id) {
  document.querySelectorAll('section').forEach((s) => { s.hidden = s.id !== id; });
  window.scrollTo(0, 0);
}

function boton(texto, alPulsar) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.onclick = alPulsar;
  return b;
}

// ---------- 1. Jugadores ----------

function pintarNombres(n) {
  const caja = $('nombres');
  while (caja.children.length > n) caja.lastChild.remove();
  while (caja.children.length < n) {
    const input = document.createElement('input');
    const num = caja.children.length + 1;
    input.placeholder = `Jugador ${num}`;
    input.setAttribute('aria-label', `Nombre del jugador ${num}`);
    input.maxLength = 20;
    input.autocomplete = 'off';
    caja.append(input);
  }
  $('numJugadores').textContent = n;
}

$('menos').onclick = () => pintarNombres(Math.max(MIN_JUGADORES, $('nombres').children.length - 1));
$('mas').onclick = () => pintarNombres(Math.min(MAX_JUGADORES, $('nombres').children.length + 1));

$('aPersonajes').onclick = () => {
  const nombres = [...$('nombres').children].map((i) => i.value.trim() || i.placeholder);
  if (new Set(nombres.map((n) => n.toLowerCase())).size < nombres.length) {
    $('errorNombres').textContent = 'Hay nombres repetidos.';
    return;
  }
  $('errorNombres').textContent = '';
  jugadores = nombres;
  puntos = nombres.map(() => 0);
  mostrar('personajes');
};

// ---------- 2. Personajes ----------

function pintarChips(caja, lista, esPack) {
  for (const grupo of lista) {
    const chip = boton(grupo.nombre, () => {
      const activo = chip.getAttribute('aria-pressed') === 'true';
      // Se puede elegir varias categorías o un solo pack, no las dos cosas.
      const aLimpiar = esPack ? '.chips button' : '#listaPacks button, #listaBusqueda button';
      document.querySelectorAll(aLimpiar).forEach((c) => c.setAttribute('aria-pressed', 'false'));
      chip.setAttribute('aria-pressed', String(!activo));
    });
    chip.setAttribute('aria-pressed', 'false');
    chip.grupo = grupo;
    caja.append(chip);
  }
}

async function cargarIndice() {
  try {
    const indice = await (await fetch('data/index.json')).json();
    pintarChips($('listaCategorias'), indice.categorias, false);
    pintarChips($('listaPacks'), indice.packs, true);
  } catch {
    $('errorSeleccion').textContent = 'No se han podido cargar los personajes. Revisa la conexión y recarga.';
  }
}

// Buscador: crea un pack al momento con cualquier anime de AniList (necesita internet).
const MIN_BUSQUEDA = 6; // personajes mínimos para que un anime buscado sirva
const CONSULTA_BUSQUEDA = `
query ($nombre: String) {
  Page(perPage: 6) {
    media(search: $nombre, type: ANIME, isAdult: false) {
      title { romaji english }
      characters(sort: FAVOURITES_DESC, perPage: 25) {
        edges { role node { name { full } image { large } } }
      }
    }
  }
}`;

$('buscador').onsubmit = async (evento) => {
  evento.preventDefault();
  const nombre = $('busqueda').value.trim();
  if (!nombre) return;
  $('listaBusqueda').replaceChildren();
  $('estadoBusqueda').textContent = 'Buscando…';
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: CONSULTA_BUSQUEDA, variables: { nombre } }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error('AniList');
    const grupos = json.data.Page.media.map((m) => {
      const anime = m.title.english || m.title.romaji;
      const validos = m.characters.edges.filter((e) => (e.role === 'MAIN' || e.role === 'SUPPORTING')
        && e.node.name.full && e.node.image.large && !e.node.image.large.includes('default'));
      return { nombre: anime, personajes: validos.map((e) => ({ nombre: e.node.name.full.trim(), anime, imagen: e.node.image.large })) };
    }).filter((g) => g.personajes.length >= MIN_BUSQUEDA);
    pintarChips($('listaBusqueda'), grupos, true);
    $('estadoBusqueda').textContent = grupos.length
      ? 'Toca un anime para jugar con él.'
      : 'No hay ningún anime con suficientes personajes para ese nombre.';
  } catch {
    $('estadoBusqueda').textContent = 'No se ha podido buscar. Hace falta conexión a internet.';
  }
};

$('volverInicio').onclick = () => mostrar('inicio');

$('empezar').onclick = async () => {
  const elegidos = [...document.querySelectorAll('.chips button[aria-pressed="true"]')].map((c) => c.grupo);
  if (!elegidos.length) {
    $('errorSeleccion').textContent = 'Elige al menos una categoría o un pack.';
    return;
  }
  try {
    // Los animes buscados ya traen sus personajes; el resto se lee de /data.
    const grupos = await Promise.all(elegidos.map(async (g) => g.personajes ? g : (await fetch(`data/${g.archivo}`)).json()));
    // Un personaje puede estar en varias categorías: se queda una sola vez.
    const unicos = new Map();
    for (const p of grupos.flatMap((g) => g.personajes)) unicos.set(clave(p), p);
    personajes = [...unicos.values()];
  } catch {
    $('errorSeleccion').textContent = 'No se han podido cargar los personajes. Revisa la conexión.';
    return;
  }
  $('errorSeleccion').textContent = '';
  nuevaRonda();
};

// ---------- 3. Reparto ----------

// Elige un personaje que no haya salido todavía en esta sesión.
function elegirPersonaje() {
  let libres = personajes.filter((p) => !usados.has(clave(p)));
  if (!libres.length) { // ya han salido todos: se vuelve a empezar
    personajes.forEach((p) => usados.delete(clave(p)));
    libres = personajes;
  }
  const elegido = libres[azar(libres.length)];
  usados.add(clave(elegido));
  return elegido;
}

// Modo difícil: otro personaje del mismo anime y, si no hay, de lo que se haya elegido.
function elegirFalso(personaje) {
  const otros = personajes.filter((p) => p !== personaje);
  const mismoAnime = otros.filter((p) => p.anime === personaje.anime);
  const lista = mismoAnime.length ? mismoAnime : otros;
  return lista[azar(lista.length)];
}

// crossOrigin permite que el service worker guarde las imágenes para jugar sin internet.
function precargar(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
}

function nuevaRonda() {
  const personaje = elegirPersonaje();
  ronda = {
    personaje,
    falso: $('dificil').checked ? elegirFalso(personaje) : null,
    impostor: azar(jugadores.length),
    turno: 0,
    votos: jugadores.map(() => 0), // votos recibidos por cada jugador
    acertaron: [],                 // jugadores que han votado al impostor
  };
  // Se descargan ya las imágenes para que la carta salga al momento.
  precargar(personaje.imagen);
  if (ronda.falso) precargar(ronda.falso.imagen);
  pintarTurnoReparto();
  mostrar('reparto');
}

function pintarCarta(prefijo, personaje) {
  const img = $(`${prefijo}Img`);
  img.hidden = false;
  img.onerror = () => { img.hidden = true; }; // sin conexión puede no haber imagen
  img.crossOrigin = 'anonymous';
  img.src = personaje.imagen;
  img.alt = personaje.nombre;
  $(`${prefijo}Nombre`).textContent = personaje.nombre;
  $(`${prefijo}Anime`).textContent = personaje.anime;
}

function pintarTurnoReparto() {
  $('repartoNombre').textContent = jugadores[ronda.turno];
  $('carta').hidden = true;
  $('verCarta').hidden = false;
  $('ocultarCarta').hidden = true;
}

$('verCarta').onclick = () => {
  const esImpostor = ronda.turno === ronda.impostor;
  $('carta').classList.toggle('impostor', esImpostor && !ronda.falso);
  if (esImpostor && ronda.falso) {
    pintarCarta('carta', ronda.falso);
  } else if (esImpostor) {
    $('cartaImg').hidden = true;
    $('cartaNombre').textContent = 'Eres el impostor';
    $('cartaAnime').textContent = $('pista').checked
      ? `Pista: el personaje es de ${ronda.personaje.anime}.`
      : 'Disimula y descubre el personaje.';
  } else {
    pintarCarta('carta', ronda.personaje);
  }
  $('carta').hidden = false;
  $('verCarta').hidden = true;
  $('ocultarCarta').hidden = false;
};

$('ocultarCarta').onclick = () => {
  ronda.turno++;
  if (ronda.turno < jugadores.length) pintarTurnoReparto();
  else empezarPistas();
};

// ---------- 4. Ronda de pistas ----------

function empezarPistas() {
  $('carta').hidden = true; // que no se quede la última carta a la vista
  const primero = azar(jugadores.length);
  const orden = [...jugadores.slice(primero), ...jugadores.slice(0, primero)];
  $('orden').replaceChildren(...orden.map((nombre) => {
    const li = document.createElement('li');
    li.textContent = nombre;
    return li;
  }));
  mostrar('pistas');
}

$('irAVotar').onclick = () => {
  ronda.turno = 0;
  pintarTurnoVoto();
  mostrar('votacion');
};

// ---------- 5. Votación ----------

function pintarTurnoVoto() {
  $('votaNombre').textContent = jugadores[ronda.turno];
  const opciones = jugadores
    .map((nombre, i) => boton(nombre, () => votar(i)))
    .filter((_, i) => i !== ronda.turno); // nadie se vota a sí mismo
  $('opcionesVoto').replaceChildren(...opciones);
}

function votar(votado) {
  ronda.votos[votado]++;
  if (votado === ronda.impostor) ronda.acertaron.push(ronda.turno);
  ronda.turno++;
  if (ronda.turno < jugadores.length) pintarTurnoVoto();
  else mostrarResultado();
}

// ---------- 6. Resultado ----------

function fila(izquierda, derecha, marcada) {
  const li = document.createElement('li');
  li.classList.toggle('marcado', marcada);
  const a = document.createElement('span');
  a.textContent = izquierda;
  const b = document.createElement('span');
  b.textContent = derecha;
  li.append(a, b);
  return li;
}

function mostrarResultado() {
  // Se descubre al impostor solo si es el más votado, sin empate.
  const maximo = Math.max(...ronda.votos);
  const masVotados = ronda.votos.filter((v) => v === maximo).length;
  const descubierto = ronda.votos[ronda.impostor] === maximo && masVotados === 1;

  $('resTitulo').textContent = descubierto ? '¡Impostor descubierto!' : '¡El impostor se escapa!';
  $('resImpostor').textContent = jugadores[ronda.impostor];
  pintarCarta('res', ronda.personaje);
  $('resFalso').textContent = ronda.falso ? `El impostor tenía a ${ronda.falso.nombre} (${ronda.falso.anime}).` : '';
  $('resVotos').replaceChildren(...jugadores.map((nombre, i) =>
    fila(nombre, `${ronda.votos[i]} ${ronda.votos[i] === 1 ? 'voto' : 'votos'}`, i === ronda.impostor)));

  // Puntos: +1 a quien ha votado al impostor, +2 al impostor si no lo descubren.
  const ganado = jugadores.map(() => 0);
  ronda.acertaron.forEach((i) => { ganado[i] = 1; });
  if (!descubierto) ganado[ronda.impostor] = 2;
  ganado.forEach((g, i) => { puntos[i] += g; });
  const clasificacion = jugadores.map((_, i) => i).sort((a, b) => puntos[b] - puntos[a]);
  $('resPuntos').replaceChildren(...clasificacion.map((i) =>
    fila(jugadores[i], `${ganado[i] ? `+${ganado[i]} · ` : ''}${puntos[i]} pts`, false)));
  mostrar('resultado');
}

$('otraRonda').onclick = nuevaRonda;
$('nuevaPartida').onclick = () => mostrar('inicio');

// ---------- Arranque ----------

pintarNombres(4);
cargarIndice();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
