import { BrowserRetriever } from './retrieval.mjs';

const form = document.querySelector('#ask-form');
const input = document.querySelector('#question');
const result = document.querySelector('#result');
const submit = form.querySelector('.submit');
let retriever;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

async function load() {
  try {
    const response = await fetch('./corpus.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const corpus = await response.json();
    retriever = new BrowserRetriever(corpus.passages);
    submit.textContent = 'Find evidence ↗';
    submit.disabled = false;
  } catch (error) {
    submit.textContent = 'Could not load passages';
    result.hidden = false;
    result.replaceChildren(node('p', 'error', `The demo could not load its public document index. ${error.message}`));
  }
}

document.querySelectorAll('[data-question]').forEach(button => {
  button.addEventListener('click', () => { input.value = button.dataset.question; input.focus(); });
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!retriever) return;
  try {
    const hits = retriever.search(input.value);
    result.hidden = false;
    const head = node('div', 'result-head');
    head.append(node('span', '', '02 / RESULT'), node('span', '', hits.length ? 'PASSAGES FOUND' : 'NO STRONG MATCH'));
    result.replaceChildren(head, node('h2', '', hits.length ? 'Source passages' : 'No clear evidence'));
    result.append(node('p', 'answer', hits.length
      ? 'These are the closest passages I found. Open a cited PDF page to check the text in context.'
      : 'I could not find a strong match across these two documents. Try a more specific question or read the PDFs directly.'));
    for (const [index, hit] of hits.entries()) {
      const card = node('article', 'source');
      const link = node('a', 'source-link', `${hit.title} · PDF page ${hit.page} ↗`);
      link.href = `${hit.url}#page=${hit.page}`;
      link.target = '_blank'; link.rel = 'noopener';
      const excerpt = hit.text.length > 720 ? `${hit.text.slice(0, 717)}…` : hit.text;
      card.append(node('span', 'rank', `0${index + 1}`), link, node('p', 'passage', excerpt));
      result.append(card);
    }
  } catch (error) {
    result.hidden = false;
    result.replaceChildren(node('p', 'error', error.message));
  }
});

load();
