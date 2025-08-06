(function() {
  'use strict';

  window.CONFIG = {
    STORAGE_KEYS: {
      ARTICLES: 'minews_articles',
      AI_LEARNING: 'minews_aiLearning',
      WORD_FILTERS: 'minews_wordFilters'
    },
    DATA_VERSION: '1.0'
  };

  window.DEFAULT_DATA = {
    articles: [],
    aiLearning: {
      version: window.CONFIG.DATA_VERSION,
      wordWeights: {},
      sourceWeights: {},
      lastUpdated: new Date().toISOString()
    },
    wordFilters: {
      interestWords: [],
      ngWords: [],
      lastUpdated: new Date().toISOString()
    }
  };

  window.LocalStorageManager = {
    setItem(key, data) {
      try {
        const serialized = JSON.stringify({
          data,
          timestamp: new Date().toISOString(),
          version: window.CONFIG.DATA_VERSION
        });
        localStorage.setItem(key, serialized);
        return true;
      } catch {
        return false;
      }
    },
    getItem(key, def) {
      try {
        const stored = localStorage.getItem(key);
        if (!stored) {
          if (def) this.setItem(key, def);
          return def;
        }
        const parsed = JSON.parse(stored);
        return parsed.data;
      } catch {
        if (def) this.setItem(key, def);
        return def;
      }
    }
  };

  window.DataHooksCache = {
    articles: null,
    aiLearning: null,
    wordFilters: null,
    lastUpdate: { articles: null, aiLearning: null, wordFilters: null },
    clear(key) {
      if (key) {
        delete this[key];
        delete this.lastUpdate[key];
      } else {
        Object.keys(this).forEach(k => {
          if (k !== 'clear' && k !== 'lastUpdate') {
            delete this[k];
          }
        });
        this.lastUpdate = {};
      }
    }
  };

  window.DataHooks = {
    useArticles() {
      const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES);
      const timestamp = stored ? JSON.parse(stored).timestamp : null;
      if (!window.DataHooksCache.articles || window.DataHooksCache.lastUpdate.articles !== timestamp) {
        window.DataHooksCache.articles = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
        window.DataHooksCache.lastUpdate.articles = timestamp;
      }
      return {
        articles: window.DataHooksCache.articles,
        updateArticle(articleId, updates, options = {}) {
          const { skipRender = false } = options;
          const updatesWithTimestamp = {
            ...updates,
            lastModified: new Date().toISOString()
          };
          const updatedArticles = window.DataHooksCache.articles.map(article =>
            article.id === articleId ? { ...article, ...updatesWithTimestamp } : article
          );
          window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
          window.DataHooksCache.articles = updatedArticles;
          window.DataHooksCache.lastUpdate.articles = new Date().toISOString();
          if (window.state) window.state.articles = updatedArticles;
          if (window.render && !skipRender) window.render();
        }
      };
    },
    useAILearning() {
      const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING);
      const timestamp = stored ? JSON.parse(stored).timestamp : null;
      if (!window.DataHooksCache.aiLearning || window.DataHooksCache.lastUpdate.aiLearning !== timestamp) {
        window.DataHooksCache.aiLearning = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
        window.DataHooksCache.lastUpdate.aiLearning = timestamp;
      }
      return { aiLearning: window.DataHooksCache.aiLearning };
    },
    useWordFilters() {
      const stored = localStorage.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS);
      const timestamp = stored ? JSON.parse(stored).timestamp : null;
      if (!window.DataHooksCache.wordFilters || window.DataHooksCache.lastUpdate.wordFilters !== timestamp) {
        window.DataHooksCache.wordFilters = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);
        window.DataHooksCache.lastUpdate.wordFilters = timestamp;
      }
      return { wordFilters: window.DataHooksCache.wordFilters };
    }
  };

  // --- 最小単位で現行仕様に即した
  window.exportMinewsData = function() {
    const aiLearning = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
    const wordFilters = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);
    const articles = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, []);
    const articleStates = {};
    for (const article of articles) {
      if (
        article.readStatus === 'read' ||
        (article.userRating && article.userRating > 0) ||
        article.readLater === true
      ) {
        articleStates[article.id] = {
          readStatus: article.readStatus,
          userRating: article.userRating || 0,
          readLater: article.readLater || false,
          lastModified: article.lastModified || null
        };
      }
    }
    const data = {
      version: window.CONFIG.DATA_VERSION,
      exportedAt: new Date().toISOString(),
      aiLearning,
      wordFilters,
      articleStates
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "minews_learnstate_export.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.importMinewsData = async function(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.aiLearning) window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, data.aiLearning);
      if (data.wordFilters) window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, data.wordFilters);
      if (data.articleStates && typeof data.articleStates === 'object') {
        const articles = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, []);
        const updatedArticles = articles.map(article => {
          if (data.articleStates[article.id]) {
            const st = data.articleStates[article.id];
            return {
              ...article,
              readStatus: st.readStatus || 'unread',
              userRating: st.userRating || 0,
              readLater: st.readLater || false,
              lastModified: st.lastModified || article.lastModified
            };
          }
          return article;
        });
        window.LocalStorageManager.setItem(window.CONFIG.STORAGE_KEYS.ARTICLES, updatedArticles);
      }
      window.DataHooksCache.clear();
      alert('状態・学習データのインポートに成功しました');
      if (window.render) window.render();
    } catch (error) {
      alert('インポートエラー: ' + error.message);
    }
  };

})();
