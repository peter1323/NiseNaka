// Genera los archivos de /data consultando la API GraphQL de AniList.
// Uso: node scripts/actualizar-datos.mjs   (necesita Node 18 o superior)
// Solo escribe en /data si todo ha ido bien: si algo falla, se conservan los archivos anteriores.

import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const API = 'https://graphql.anilist.co';
const DATA = new URL('../data/', import.meta.url);

const MIN_FAVORITOS = 300;        // "muchos favoritos"
const MIN_POR_PACK = 12;          // personajes válidos mínimos para que exista un pack
const NUM_PACKS = 40;
const ANIMES_POR_CATEGORIA = 50;  // animes más populares que se miran en cada categoría
const PERSONAJES_POR_ANIME = 8;   // máximo por anime dentro de una categoría, para que haya variedad
const MAX_POR_CATEGORIA = 150;

// genre = género de AniList, tag = etiqueta de AniList (isekai no es un género, es una etiqueta)
const CATEGORIAS = [
  { id: 'accion', nombre: 'Acción', genre: 'Action' },
  { id: 'aventura', nombre: 'Aventura', genre: 'Adventure' },
  { id: 'comedia', nombre: 'Comedia', genre: 'Comedy' },
  { id: 'drama', nombre: 'Drama', genre: 'Drama' },
  { id: 'fantasia', nombre: 'Fantasía', genre: 'Fantasy' },
  { id: 'romance', nombre: 'Romance', genre: 'Romance' },
  { id: 'isekai', nombre: 'Isekai', tag: 'Isekai' },
  { id: 'ciencia-ficcion', nombre: 'Ciencia ficción', genre: 'Sci-Fi' },
  { id: 'sobrenatural', nombre: 'Sobrenatural', genre: 'Supernatural' },
  { id: 'misterio', nombre: 'Misterio', genre: 'Mystery' },
  { id: 'psicologico', nombre: 'Psicológico', genre: 'Psychological' },
  { id: 'terror', nombre: 'Terror', genre: 'Horror' },
  { id: 'deportes', nombre: 'Deportes', genre: 'Sports' },
  { id: 'vida-cotidiana', nombre: 'Vida cotidiana', genre: 'Slice of Life' },
  { id: 'mecha', nombre: 'Mecha', genre: 'Mecha' },
  { id: 'manhwa', nombre: 'Manhwa', type: 'MANGA', country: 'KR' },
];

const CONSULTA = `
query ($type: MediaType, $genre: String, $tag: String, $country: CountryCode, $format: MediaFormat,
       $page: Int, $perPage: Int, $personajes: Int) {
  Page(page: $page, perPage: $perPage) {
    media(type: $type, genre: $genre, tag: $tag, countryOfOrigin: $country, format: $format,
          sort: POPULARITY_DESC, isAdult: false) {
      id
      title { romaji english }
      characters(sort: FAVOURITES_DESC, perPage: $personajes) {
        edges { role node { id name { full } image { large } favourites } }
      }
    }
  }
}`;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function consultar(variables, intento = 1) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: CONSULTA, variables }),
  });
  if (res.status === 429 && intento <= 5) {
    await esperar((Number(res.headers.get('Retry-After')) || 60) * 1000);
    return consultar(variables, intento + 1);
  }
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`AniList ${res.status}: ${JSON.stringify(json.errors)}`);
  await esperar(1500); // margen para el límite de peticiones de AniList
  return json.data.Page.media;
}

// Personajes válidos de un anime: principales o secundarios, con muchos favoritos y con imagen propia.
function personajesValidos(media) {
  const anime = media.title.english || media.title.romaji;
  return media.characters.edges
    .filter((e) => (e.role === 'MAIN' || e.role === 'SUPPORTING')
      && e.node.favourites >= MIN_FAVORITOS
      && e.node.name.full
      && e.node.image.large && !e.node.image.large.includes('default'))
    .map((e) => ({ id: e.node.id, favoritos: e.node.favourites, nombre: e.node.name.full.trim(), anime, imagen: e.node.image.large }));
}

// Lo que se guarda de cada personaje: nombre, anime e imagen.
const limpiar = ({ nombre, anime, imagen }) => ({ nombre, anime, imagen });

const slug = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function generarCategoria(cat) {
  const medias = await consultar({
    type: cat.type || 'ANIME', genre: cat.genre, tag: cat.tag, country: cat.country,
    page: 1, perPage: ANIMES_POR_CATEGORIA, personajes: 25,
  });
  const vistos = new Map(); // id de personaje -> personaje (sin repetidos entre temporadas)
  for (const media of medias) {
    let nuevos = 0;
    for (const p of personajesValidos(media)) {
      if (nuevos >= PERSONAJES_POR_ANIME) break;
      if (!vistos.has(p.id)) { vistos.set(p.id, p); nuevos++; }
    }
  }
  const personajes = [...vistos.values()].sort((a, b) => b.favoritos - a.favoritos).slice(0, MAX_POR_CATEGORIA);
  return { id: cat.id, nombre: cat.nombre, personajes: personajes.map(limpiar) };
}

async function generarPacks() {
  const packs = [];
  const idsUsados = new Set();
  for (let page = 1; page <= 4 && packs.length < NUM_PACKS; page++) {
    const medias = await consultar({ type: 'ANIME', format: 'TV', page, perPage: 50, personajes: 25 });
    for (const media of medias) {
      if (packs.length >= NUM_PACKS) break;
      const personajes = personajesValidos(media);
      if (personajes.length < MIN_POR_PACK) continue;
      // Si la mayoría ya está en otro pack, es otra temporada del mismo anime: se salta.
      const repetidos = personajes.filter((p) => idsUsados.has(p.id)).length;
      if (repetidos > personajes.length / 2) continue;
      personajes.forEach((p) => idsUsados.add(p.id));
      const nombre = personajes[0].anime;
      packs.push({ id: slug(nombre) || String(media.id), nombre, personajes: personajes.map(limpiar) });
    }
  }
  return packs;
}

function comprobar(lista, minimo) {
  for (const grupo of lista) {
    assert(grupo.personajes.length >= minimo, `${grupo.nombre}: solo ${grupo.personajes.length} personajes`);
    for (const p of grupo.personajes) {
      assert(p.nombre && p.anime && p.imagen.startsWith('https://'), `Personaje incompleto en ${grupo.nombre}`);
    }
  }
}

const categorias = [];
for (const cat of CATEGORIAS) {
  categorias.push(await generarCategoria(cat));
  console.log(`Categoría ${cat.nombre}: ${categorias.at(-1).personajes.length} personajes`);
}
const packs = await generarPacks();
packs.forEach((p) => console.log(`Pack ${p.nombre}: ${p.personajes.length} personajes`));

// Comprobaciones antes de tocar /data.
comprobar(categorias, MIN_POR_PACK);
comprobar(packs, MIN_POR_PACK);
assert(packs.length >= NUM_PACKS / 2, `Solo han salido ${packs.length} packs`);
assert.equal(new Set(packs.map((p) => p.id)).size, packs.length, 'Hay packs con el mismo id');

// Todo correcto: se sustituyen los archivos anteriores.
await mkdir(DATA, { recursive: true });
for (const archivo of await readdir(DATA)) {
  if (archivo.endsWith('.json')) await rm(new URL(archivo, DATA));
}
const guardar = (archivo, datos) => writeFile(new URL(archivo, DATA), JSON.stringify(datos, null, 1) + '\n');
const entrada = (prefijo) => (g) => ({ id: g.id, nombre: g.nombre, archivo: `${prefijo}-${g.id}.json`, total: g.personajes.length });
const indice = {
  categorias: categorias.map(entrada('categoria')),
  packs: packs.map(entrada('pack')),
};
for (const [i, c] of categorias.entries()) await guardar(indice.categorias[i].archivo, c);
for (const [i, p] of packs.entries()) await guardar(indice.packs[i].archivo, p);
await guardar('index.json', indice);
console.log(`Listo: ${categorias.length} categorías y ${packs.length} packs en /data`);
