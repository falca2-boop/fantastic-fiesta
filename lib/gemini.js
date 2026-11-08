/** Google Gemini (AI Studio) als Alternative zu Claude: gleiche Werkzeuge, anderes Anfrageformat. */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const TYPE = { string: 'STRING', number: 'NUMBER', integer: 'INTEGER', boolean: 'BOOLEAN', array: 'ARRAY', object: 'OBJECT' };

function convertSchema(s) {
  const out = { type: TYPE[s.type] || 'STRING' };
  if (s.description) out.description = s.description;
  if (s.type === 'array') out.items = convertSchema(s.items || { type: 'string' });
  if (s.type === 'object' && s.properties && Object.keys(s.properties).length) {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, convertSchema(v)]));
    if (s.required?.length) out.required = s.required;
  }
  return out;
}

/**
 * Wandelt die (Anthropic-förmigen) Werkzeugdefinitionen um.
 * - web_search wird zu einer normalen Funktion (siehe googleSearchText), weil Gemini Suche und Funktionen nicht immer in einer Anfrage mischen lässt.
 * - Objekte ohne feste Felder (z. B. "details") nimmt Gemini nicht an: sie werden als JSON-Text übergeben, jsonKeys merkt sich welche.
 */
export function toGeminiTools(tools) {
  const jsonKeys = {};
  const declarations = tools.map((t) => {
    if (t.name === 'web_search') {
      return { name: 'web_search', description: 'Sucht aktuelle Informationen im Web und gibt eine kurze Zusammenfassung zurück.',
        parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Suchanfrage' } }, required: ['query'] } };
    }
    const props = t.input_schema?.properties || {};
    const decl = { name: t.name, description: t.description };
    if (!Object.keys(props).length) return decl;
    const properties = {};
    for (const [k, v] of Object.entries(props)) {
      if (v.type === 'object' && !(v.properties && Object.keys(v.properties).length)) {
        (jsonKeys[t.name] ||= []).push(k);
        properties[k] = { type: 'STRING', description: (v.description ? v.description + ' ' : '') + '(als JSON-Text, z. B. {"to":"a@b.de"})' };
      } else properties[k] = convertSchema(v);
    }
    decl.parameters = { type: 'OBJECT', properties, ...(t.input_schema.required?.length ? { required: t.input_schema.required } : {}) };
    return decl;
  });
  return { declarations, jsonKeys };
}

/** Wandelt JSON-Text-Argumente zurück in Objekte. */
export function fixArgs(name, args, jsonKeys) {
  const out = { ...(args || {}) };
  for (const k of jsonKeys[name] || []) {
    if (typeof out[k] === 'string') { try { out[k] = JSON.parse(out[k]); } catch { out[k] = { text: out[k] }; } }
  }
  return out;
}

export async function geminiRequest({ apiKey, model, body, fetchFn }) {
  return fetchFn(`${BASE}${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });
}

/** Websuche über Googles Suchanbindung (Grounding). Gibt Text zurück. */
export async function googleSearchText({ apiKey, model, query, fetchFn }) {
  const res = await geminiRequest({ apiKey, model, fetchFn, body: {
    contents: [{ role: 'user', parts: [{ text: query }] }],
    tools: [{ googleSearch: {} }],
  } });
  if (!res.ok) return 'Websuche nicht verfügbar (HTTP ' + res.status + ').';
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join(' ').trim();
  return text.slice(0, 2000) || 'Keine Ergebnisse.';
}

export const textOf = (parts) => (parts || []).filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join(' ').trim();
