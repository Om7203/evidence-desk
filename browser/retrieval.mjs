// Independent browser search over the same PDF passages as the local API.
// BM25 is deliberately small enough to run without a server or an API key.
const filler = new Set('a an and are about according can could describe do does for from how in is it me of on or please say says should tell the these this to what when where which who why with would'.split(' '));
const domainFiller = new Set(['nist','document','documents','profile']);

function tokens(value) {
  return (value.toLowerCase().match(/[a-z0-9]+/g) || []).filter(term => term.length > 1 && !filler.has(term));
}

function queryTerms(value) {
  return [...new Set(tokens(value).filter(term => !domainFiller.has(term)))];
}

export class BrowserRetriever {
  constructor(passages) {
    if (!Array.isArray(passages) || !passages.length) throw new Error('No document passages available.');
    this.passages = passages;
    this.documents = passages.map(passage => {
      const terms = tokens(passage.text);
      const frequency = new Map();
      for (const term of terms) frequency.set(term, (frequency.get(term) || 0) + 1);
      return { passage, frequency, length: terms.length };
    });
    this.averageLength = this.documents.reduce((sum, document) => sum + document.length, 0) / this.documents.length;
    this.frequency = new Map();
    for (const document of this.documents) for (const term of document.frequency.keys()) this.frequency.set(term, (this.frequency.get(term) || 0) + 1);
  }

  search(question, limit = 3) {
    const input = question.trim();
    if (!input || input.length > 500) throw new RangeError('Enter a question between 1 and 500 characters.');
    const query = queryTerms(input);
    if (!query.length) return [];
    const defining = /^(what is|what are|define|how is)/i.test(input);
    const ranked = this.documents.map(document => {
      let score = 0;
      let matched = 0;
      for (const term of query) {
        const count = document.frequency.get(term) || 0;
        if (!count) continue;
        matched++;
        const docCount = this.frequency.get(term) || 0;
        const idf = Math.log(1 + (this.documents.length - docCount + 0.5) / (docCount + 0.5));
        const saturation = count * 2.2 / (count + 1.2 * (0.25 + 0.75 * document.length / this.averageLength));
        score += idf * saturation;
      }
      const coverage = matched / query.length;
      const text = document.passage.text.toLowerCase();
      if (defining && query.some(term => text.includes(term)) && /\b(refers to|is defined as|is a phenomenon|is a type of)\b/.test(text)) score *= 1.15;
      return { ...document.passage, score, coverage };
    }).filter(hit => hit.score > 0 && hit.coverage >= 0.7)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const seen = new Set();
    const results = [];
    for (const hit of ranked) {
      const page = `${hit.source_id}:${hit.page}`;
      if (seen.has(page)) continue;
      seen.add(page);
      results.push(hit);
      if (results.length >= limit) break;
    }
    return results;
  }
}
