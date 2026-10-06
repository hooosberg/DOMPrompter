/* Language switcher – shared across all pages */
(function () {
  const STORAGE_KEY = 'dp-lang';

  function setLang(lang) {
    document.querySelectorAll('.language-block').forEach(el => {
      el.classList.toggle('is-visible', el.dataset.lang === lang);
    });
    document.querySelectorAll('.lang-menu button').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.langTarget === lang);
    });
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    localStorage.setItem(STORAGE_KEY, lang);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Toggle dropdown
    const dropdown = document.querySelector('.lang-dropdown');
    const toggle = dropdown?.querySelector('.lang-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => dropdown.classList.toggle('is-open'));
      document.addEventListener('click', e => {
        if (!dropdown.contains(e.target)) dropdown.classList.remove('is-open');
      });
    }

    // Language buttons
    document.querySelectorAll('.lang-menu button').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.dataset.langTarget);
        dropdown.classList.remove('is-open');
      });
    });

    // Restore saved language
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setLang(saved);
  });
})();
