import { BrowserRetriever } from './retrieval.mjs';

const form = document.querySelector('#ask-form');
const input = document.querySelector('#question');
const result = document.querySelector('#result');
const submit = form.querySelector('.submit');
let retriever;
let currentQuestion = '';

function restoreSharedQuestion() {
  const question = new URLSearchParams(window.location.search).get('q')?.trim();
  if (!question) return;
  input.value = question.slice(0, input.maxLength);
}

function rememberQuestion(question) {
  const url = new URL(window.location.href);
  url.searchParams.set('q', question);
  window.history.replaceState({}, '', url);
}

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
    restoreSharedQuestion();
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
    currentQuestion = input.value.trim();
    rememberQuestion(currentQuestion);
    const hits = retriever.search(currentQuestion);
    result.hidden = false;
    const head = node('div', 'result-head');
    head.append(node('span', '', '02 / RESULT'), node('span', '', hits.length ? 'PASSAGES FOUND' : 'NO STRONG MATCH'));
    result.replaceChildren(head, node('h2', '', hits.length ? 'Source passages' : 'No clear evidence'));
    result.append(node('p', 'answer', hits.length
      ? 'These are the closest passages. You can request a generated answer, then check its cited PDF pages.'
      : 'I could not find a strong match across these two documents. Try a more specific question or read the PDFs directly.'));
    if (hits.length) {
      const answerArea = node('div', 'generated');
      const button = node('button', 'generate', 'Generate a cited answer ↗');
      button.type = 'button';
      button.addEventListener('click', () => generateAnswer(currentQuestion, answerArea, button));
      answerArea.append(button, node('p', 'generation-note', 'Your question will be sent to the answer service. It searches its own fixed NIST corpus; the browser cannot choose its citations.'));
      result.append(answerArea);
    }
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

async function generateAnswer(question, area, button) {
  const endpoint = window.PORTFOLIO_CHAT_API;
  if (!endpoint) {
    area.append(node('p', 'error', 'The answer service is not connected. The passage search above still works.'));
    return;
  }
  button.disabled = true;
  button.textContent = 'Checking the source passages…';
  try {
    const response = await fetch(`${endpoint}/api/evidence`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The answer service is unavailable.');
    area.replaceChildren(node('span', 'generated-label', data.status === 'answer' ? 'GENERATED ANSWER / CHECK THE SOURCES' : 'NO SUPPORTED ANSWER'));
    area.append(node('p', 'generated-text', data.answer));
    if (data.status === 'answer') {
      const citations = node('div', 'citations');
      for (const source of data.sources) {
        const link = node('a', '', `${source.title} · PDF page ${source.page} ↗`);
        link.href = `${source.url}#page=${source.page}`;
        link.target = '_blank'; link.rel = 'noopener';
        citations.append(link);
      }
      area.append(citations, node('p', 'generation-note', data.note || 'Verify the answer against the cited pages.'));
    }
  } catch (error) {
    area.append(node('p', 'error', error.message));
    button.disabled = false;
    button.textContent = 'Try the cited answer again ↗';
  }
}

load();
