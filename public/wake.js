/* Erkennt "Jarvis" in dem, was die Browser-Spracherkennung (Deutsch) daraus macht. Sie schreibt das englische Wort oft
   anders: Dscharwis, Tscharvis, Charvis, Garvis, Jarwis, "Jar vis" … Verglichen wird ein Lautgerüst:
   Anlaut Dsch/Tsch/Sch/Ch/J/G/H/Y -> J, Vokale weg, v/w/f -> V, s/z/x/c -> S, Ergebnis muss JRV oder JRVS sein. */
(function (root) {
  function skeleton(word) {
    let w = String(word).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
    if (w.length < 4 || w.length > 11) return '';
    w = w.replace(/^(dsch|tsch|sch|ch|dj|j|y|g|h)/, 'J');
    if (w[0] !== 'J') return '';
    let rest = w.slice(1).replace(/[aeiouy]/g, '').replace(/r/g, 'R').replace(/[vwf]/g, 'V').replace(/[szxc]/g, 'S').replace(/(.)\1+/g, '$1');
    return 'J' + rest;
  }
  const isWake = (s) => /^JRVS?$/.test(skeleton(s));

  /** Gibt { start, end } (Zeichenpositionen) des Wake-Words im Text zurück oder null. Alles ab `end` ist der Befehl. */
  function findWake(text) {
    const toks = [];
    const re = /[A-Za-zÄÖÜäöüß]+/g;
    let m;
    while ((m = re.exec(text))) toks.push({ s: m[0], start: m.index, end: m.index + m[0].length });
    for (let i = 0; i < toks.length; i++) {
      if (isWake(toks[i].s)) return { start: toks[i].start, end: toks[i].end };
      if (i + 1 < toks.length && isWake(toks[i].s + toks[i + 1].s) && !isWake(toks[i].s)) return { start: toks[i].start, end: toks[i + 1].end };
    }
    return null;
  }

  root.findWake = findWake;
  root.wakeSkeleton = skeleton;
})(typeof window !== 'undefined' ? window : globalThis);
