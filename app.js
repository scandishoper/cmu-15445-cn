const state = {
  articles: [],
  activeId: null,
};

const nav = document.querySelector('#course-nav');
const count = document.querySelector('#article-count');
const searchInput = document.querySelector('#search-input');
const emptyState = document.querySelector('#empty-state');
const article = document.querySelector('#article');
const reader = document.querySelector('#reader');
const themeToggle = document.querySelector('#theme-toggle');

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderInline(value) {
  return value
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = escapeHtml(markdown).replaceAll('\r\n', '\n').split('\n');
  const output = [];
  let inCode = false;
  let codeLanguage = '';
  let code = [];
  let listType = null;

  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      closeList();
      if (!inCode) {
        inCode = true;
        codeLanguage = fence[1];
        code = [];
      } else {
        const languageClass = codeLanguage ? ` class="language-${codeLanguage}"` : '';
        output.push(`<pre><code${languageClass}>${code.join('\n')}</code></pre>`);
        inCode = false;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const text = heading[2];
      const id = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
      output.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeList();
      output.push('<hr>');
      continue;
    }

    const unordered = line.match(/^[-*+]\s+(.+)$/);
    if (unordered) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        output.push('<ul>');
      }
      output.push(`<li>${renderInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        output.push('<ol>');
      }
      output.push(`<li>${renderInline(ordered[1])}</li>`);
      continue;
    }

    closeList();
    if (line.startsWith('&gt; ')) {
      output.push(`<blockquote>${renderInline(line.slice(5))}</blockquote>`);
    } else {
      output.push(`<p>${renderInline(line)}</p>`);
    }
  }

  closeList();
  if (inCode) output.push(`<pre><code>${code.join('\n')}</code></pre>`);
  return output.join('\n');
}

function renderNav(items) {
  nav.innerHTML = '';
  count.textContent = String(items.length);

  if (!items.length) {
    nav.innerHTML = '<p class="no-result">没有匹配的内容</p>';
    return;
  }

  let currentGroup = null;
  for (const item of items) {
    if (item.group && item.group !== currentGroup) {
      currentGroup = item.group;
      const group = document.createElement('div');
      group.className = 'nav-group';
      group.textContent = currentGroup;
      nav.append(group);
    }

    const link = document.createElement('a');
    link.className = `nav-link${item.id === state.activeId ? ' active' : ''}`;
    link.href = `#${encodeURIComponent(item.id)}`;
    link.textContent = item.title;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      history.pushState(null, '', link.href);
      openArticle(item.id);
    });
    nav.append(link);
  }
}

async function openArticle(id) {
  const item = state.articles.find((entry) => entry.id === id);
  if (!item) return;

  try {
    const response = await fetch(`./content/${item.file}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();

    state.activeId = item.id;
    document.title = `${item.title} · CMU 15-445`;
    emptyState.hidden = true;
    article.hidden = false;
    article.innerHTML = `
      <header class="article-header">
        ${item.group ? `<p class="article-kicker">${escapeHtml(item.group)}</p>` : ''}
        <h1>${escapeHtml(item.title)}</h1>
        ${item.summary ? `<p class="article-summary">${escapeHtml(item.summary)}</p>` : ''}
      </header>
      ${markdownToHtml(markdown)}
    `;
    renderNav(filterArticles(searchInput.value));
    reader.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    article.hidden = true;
    emptyState.hidden = false;
    emptyState.querySelector('h1').textContent = '内容读取失败';
    emptyState.querySelector('p').textContent = `无法读取 ${item.file}。`;
    console.error(error);
  }
}

function filterArticles(keyword) {
  const query = keyword.trim().toLowerCase();
  if (!query) return state.articles;
  return state.articles.filter((item) =>
    [item.title, item.group, item.summary].filter(Boolean).some((value) => value.toLowerCase().includes(query))
  );
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  const preferred = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || preferred);
}

async function init() {
  initTheme();

  themeToggle.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });

  searchInput.addEventListener('input', () => renderNav(filterArticles(searchInput.value)));
  window.addEventListener('popstate', () => openArticle(decodeURIComponent(location.hash.slice(1))));

  try {
    const response = await fetch('./content/manifest.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.articles = await response.json();
    renderNav(state.articles);

    if (state.articles.length) {
      const requestedId = decodeURIComponent(location.hash.slice(1));
      await openArticle(state.articles.some((item) => item.id === requestedId) ? requestedId : state.articles[0].id);
    }
  } catch (error) {
    nav.innerHTML = '<p class="no-result">目录读取失败</p>';
    console.error(error);
  }
}

init();
