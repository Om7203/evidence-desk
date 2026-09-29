import { readFileSync, writeFileSync } from 'node:fs';
import { BrowserRetriever } from './retrieval.mjs';

const corpus = JSON.parse(readFileSync(new URL('./corpus.json', import.meta.url), 'utf8'));
const cases = JSON.parse(readFileSync(new URL('../evals/cases.json', import.meta.url), 'utf8'));
const search = new BrowserRetriever(corpus.passages);
const report = cases.map(test => {
  const hits = search.search(test.question);
  const match = hit => hit.source_id === test.source_id && test.pages.includes(hit.page);
  const negative = test.source_id === null;
  return {
    question: test.question,
    expected: negative ? 'abstain' : `${test.source_id}: PDF pages ${test.pages.join(', ')}`,
    actual: hits[0] ? `${hits[0].source_id}: PDF page ${hits[0].page}` : 'abstain',
    top1_hit: negative ? !hits.length : !!hits[0] && match(hits[0]),
    top3_hit: negative ? !hits.length : hits.slice(0, 3).some(match),
  };
});
const positive = report.filter((_, index) => cases[index].source_id !== null);
const negative = report.filter((_, index) => cases[index].source_id === null);
const summary = {
  method: 'browser-bm25-v1',
  note: 'Same source passages and small, non-blinded question set as the local API; this browser algorithm is different from the Python TF-IDF baseline.',
  page_top1: `${positive.filter(item => item.top1_hit).length}/${positive.length}`,
  page_top3: `${positive.filter(item => item.top3_hit).length}/${positive.length}`,
  out_of_scope_abstain: `${negative.filter(item => item.top1_hit).length}/${negative.length}`,
  cases: report,
};
writeFileSync(new URL('./evaluation.json', import.meta.url), JSON.stringify(summary, null, 2));
console.log(`Top-1 page ${summary.page_top1}; top-3 page ${summary.page_top3}; unrelated abstentions ${summary.out_of_scope_abstain}`);
for (const item of report) if (!item.top1_hit) console.log(`MISS ${item.question} -> ${item.actual} (expected ${item.expected})`);
if (positive.filter(item => item.top1_hit).length < 7 || positive.some(item => !item.top3_hit) || negative.some(item => !item.top1_hit)) {
  throw new Error('Browser retrieval regressed against the labeled cases.');
}
