const form = document.querySelector('#ask-form');
const input = document.querySelector('#question');
const result = document.querySelector('#result');
const submit = form.querySelector('.submit');

document.querySelectorAll('[data-question]').forEach(button => {
  button.addEventListener('click', () => { input.value = button.dataset.question; input.focus(); });
});

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  result.hidden = false;
  result.replaceChildren(node('p', 'loading', 'Searching the documents…'));
  submit.disabled = true;
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: input.value.trim() })
    });
    if (!response.ok) throw new Error(`The search service returned ${response.status}.`);
    const data = await response.json();
    const head = node('div', 'result-head');
    head.append(node('span', '', '02 / RESULT'), node('span', '', data.status === 'evidence_found' ? 'PASSAGES FOUND' : 'NO STRONG MATCH'));
    result.replaceChildren(head, node('h2', '', data.status === 'evidence_found' ? 'Source passages' : 'No clear evidence'), node('p', 'answer', data.answer));
    for (const [index, source] of data.sources.slice(0, 3).entries()) {
      const card = node('article', 'source');
      const link = node('a', 'source-link', `${source.title} · PDF page ${source.page} ↗`);
      link.href = `${source.url}#page=${source.page}`;
      link.target = '_blank'; link.rel = 'noopener';
      const excerpt = source.text.length > 720 ? `${source.text.slice(0, 717)}…` : source.text;
      card.append(node('span', 'rank', `0${index + 1}`), link, node('p', 'passage', excerpt));
      result.append(card);
    }
  } catch (error) {
    result.replaceChildren(node('p', 'error', `Could not run the search. ${error.message}`));
  } finally {
    submit.disabled = false;
  }
});
