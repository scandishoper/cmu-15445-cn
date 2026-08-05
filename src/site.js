(() => {
  const body = document.body;
  const root = body.dataset.root || "./";
  const menuButton = document.querySelector(".menu-button");
  const navigation = document.querySelector(".course-navigation");
  const backdrop = document.querySelector(".drawer-backdrop");
  const themeButton = document.querySelector(".theme-button");
  const searchButton = document.querySelector(".search-button");
  const searchDialog = document.querySelector(".search-dialog");
  const searchInput = document.querySelector("#site-search");
  const searchResults = document.querySelector("#search-results");
  const progress = document.querySelector(".reading-progress span");
  let searchIndex = null;

  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character]);

  const setNavigation = (open) => {
    body.classList.toggle("nav-open", open);
    menuButton?.setAttribute("aria-expanded", String(open));
    if (backdrop) backdrop.hidden = !open;
  };

  menuButton?.addEventListener("click", () => setNavigation(!body.classList.contains("nav-open")));
  backdrop?.addEventListener("click", () => setNavigation(false));
  navigation?.addEventListener("click", (event) => {
    if (event.target.closest("a")) setNavigation(false);
  });

  themeButton?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("cmu15445-theme", next);
  });

  const updateProgress = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0;
    if (progress) progress.style.width = `${ratio * 100}%`;
  };
  addEventListener("scroll", updateProgress, { passive: true });
  updateProgress();

  const headings = [...document.querySelectorAll(".article-body h1[id], .article-body h2[id], .article-body h3[id]")];
  const toc = document.querySelector("#page-toc");
  if (toc && headings.length > 1) {
    const list = document.createElement("ul");
    for (const heading of headings) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent.trim();
      link.dataset.level = heading.tagName.slice(1);
      item.append(link);
      list.append(item);
    }
    toc.append(list);

    const links = [...toc.querySelectorAll("a")];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (!visible.length) return;
        links.forEach((link) => link.classList.toggle("active", link.hash === `#${visible[0].target.id}`));
      },
      { rootMargin: "-80px 0px -72% 0px" },
    );
    headings.forEach((heading) => observer.observe(heading));
  } else {
    document.querySelector(".page-outline")?.setAttribute("hidden", "");
  }

  const loadSearch = async () => {
    if (searchIndex) return searchIndex;
    const response = await fetch(`${root}search-index.json`);
    if (!response.ok) throw new Error("Search index could not be loaded");
    searchIndex = await response.json();
    return searchIndex;
  };

  const search = async (query) => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      searchResults.innerHTML = '<p class="search-empty">Type a topic, assignment, or database concept.</p>';
      return;
    }

    try {
      const index = await loadSearch();
      const matches = index
        .map((entry) => {
          const title = `${entry.label} ${entry.title}`.toLowerCase();
          const headingsText = entry.headings.toLowerCase();
          const bodyText = entry.text.toLowerCase();
          if (!terms.every((term) => title.includes(term) || headingsText.includes(term) || bodyText.includes(term))) return null;
          const score = terms.reduce(
            (total, term) => total + (title.includes(term) ? 8 : 0) + (headingsText.includes(term) ? 4 : 0) + (bodyText.includes(term) ? 1 : 0),
            0,
          );
          const bodyMatches = terms.map((term) => bodyText.indexOf(term)).filter((position) => position >= 0);
          const firstPosition = bodyMatches.length ? Math.max(0, Math.min(...bodyMatches) - 65) : 0;
          const snippet = entry.text.slice(firstPosition, firstPosition + 210);
          return { ...entry, score, snippet: `${firstPosition ? "…" : ""}${snippet}${firstPosition + 210 < entry.text.length ? "…" : ""}` };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10);

      searchResults.innerHTML = matches.length
        ? matches
            .map(
              (entry) => `<a class="search-result" href="${root}${entry.path}">
                <strong>${escapeHtml(entry.label)}</strong>
                <small>${escapeHtml(entry.snippet)}</small>
              </a>`,
            )
            .join("")
        : '<p class="search-empty">No matching course pages.</p>';
    } catch {
      searchResults.innerHTML = '<p class="search-empty">Search is unavailable. Use the course navigation instead.</p>';
    }
  };

  const openSearch = () => {
    if (!searchDialog?.open) searchDialog?.showModal();
    searchInput?.focus();
    search(searchInput?.value || "");
  };

  searchButton?.addEventListener("click", openSearch);
  searchInput?.addEventListener("input", () => search(searchInput.value));
  document.addEventListener("keydown", (event) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "");
    if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
      event.preventDefault();
      openSearch();
    }
    if (event.key === "Escape") setNavigation(false);
  });
})();
