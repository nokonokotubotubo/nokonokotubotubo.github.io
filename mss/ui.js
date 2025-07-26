// Minews PWA - UI・表示レイヤー
(function() {
'use strict';

// ===========================================
// アプリケーション状態管理
// ===========================================

window.state = {
  viewMode: 'all',
  selectedSource: 'all',  // selectedFolderをselectedSourceに変更
  showModal: null,
  articles: [],
  isLoading: false,
  lastUpdate: null
};

window.setState = (newState) => {
  window.state = { ...window.state, ...newState };
  window.render();
};

const initializeData = () => {
  const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles);
  const rssData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, window.DEFAULT_DATA.rssFeeds);
  const foldersData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS, window.DEFAULT_DATA.folders);
  const aiData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning);
  const wordData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters);

  Object.assign(window.DataHooksCache, {
    articles: articlesData,
    rssFeeds: rssData,
    folders: foldersData,
    aiLearning: aiData,
    wordFilters: wordData
  });

  window.state.articles = articlesData;

  if (window.state.articles.length === 0) {
    const sampleArticles = [
      {
        id: 'sample_1',
        title: 'Minews PWA：フォルダ機能追加完了',
        url: '#',
        content: 'RSSフィードをフォルダで分類管理し、記事表示もフォルダでフィルタリングできる機能を追加しました。リスト選択モーダルによりユーザビリティも向上。',
        publishDate: new Date().toISOString(),
        rssSource: 'NHKニュース',
        category: 'Design',
        readStatus: 'unread',
        readLater: false,
        userRating: 0,
        keywords: ['フォルダ', 'RSS', 'リスト選択', '機能追加']
      },
      {
        id: 'sample_2',
        title: 'フォルダ管理で記事整理が便利に',
        url: '#',
        content: 'ニュース、テック、ブログなど用途別にRSSフィードを分類。記事表示もフォルダ単位でフィルタリングでき、情報収集効率が大幅向上。',
        publishDate: new Date(Date.now() - 3600000).toISOString(),
        rssSource: 'ITmedia',
        category: 'UX',
        readStatus: 'unread',
        readLater: false,
        userRating: 0,
        keywords: ['フォルダ管理', '記事整理', '分類', 'フィルタリング', '効率化']
      }
    ];

    const articlesHook = window.DataHooks.useArticles();
    sampleArticles.forEach(article => articlesHook.addArticle(article));
    window.state.articles = window.DataHooksCache.articles;
  }
};

// ===========================================
// ユーティリティ関数
// ===========================================

window.formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = now - date;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffTime / (1000 * 60 * 60));

  if (diffHours < 1) return '1時間以内';
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays === 1) return '昨日';
  if (diffDays < 7) return `${diffDays}日前`;
  return date.toLocaleDateString('ja-JP');
};

window.createStarRating = (rating, articleId) => {
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= rating ? 'filled' : '';
    stars += `<span class="star ${filled}" onclick="handleRatingChange('${articleId}', ${i})">★</span>`;
  }
  return `<div class="star-rating">${stars}</div>`;
};

window.truncateText = (text, maxLength = 200) => text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...';

// XMLエスケープ関数
window.escapeXml = (text) => {
  return text.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });
};

// ===========================================
// データ管理機能
// ===========================================

// 学習データエクスポート
window.handleExportLearningData = () => {
  const aiHook = window.DataHooks.useAILearning();
  const wordHook = window.DataHooks.useWordFilters();

  const exportData = {
    version: window.CONFIG.DATA_VERSION,
    exportDate: new Date().toISOString(),
    aiLearning: aiHook.aiLearning,
    wordFilters: wordHook.wordFilters
  };

  const dataStr = JSON.stringify(exportData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `minews_learning_data_${new Date().toISOString().split('T')[0]}.json`;
  link.click();

  alert('学習データをエクスポートしました');
};

// 学習データインポート
window.handleImportLearningData = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importData = JSON.parse(e.target.result);
      if (!importData.aiLearning || !importData.wordFilters) {
        throw new Error('無効なデータ形式です');
      }

      const aiHook = window.DataHooks.useAILearning();
      const wordHook = window.DataHooks.useWordFilters();

      // AI学習データのマージ
      Object.keys(importData.aiLearning.wordWeights || {}).forEach(word => {
        const weight = importData.aiLearning.wordWeights[word];
        aiHook.updateWordWeight(word, weight);
      });

      Object.keys(importData.aiLearning.categoryWeights || {}).forEach(category => {
        const weight = importData.aiLearning.categoryWeights[category];
        aiHook.updateCategoryWeight(category, weight);
      });

      // ワードフィルターのマージ
      (importData.wordFilters.interestWords || []).forEach(word => {
        wordHook.addInterestWord(word);
      });

      (importData.wordFilters.ngWords || []).forEach(word => {
        wordHook.addNGWord(word);
      });

      alert('学習データをインポートしました');
      window.render();
    } catch (error) {
      alert('インポートに失敗しました: ' + error.message);
    }
  };

  reader.readAsText(file);
  // ファイル選択をリセット
  event.target.value = '';
};

// RSSデータエクスポート（OPML形式）
window.handleExportRSSData = () => {
  const rssHook = window.DataHooks.useRSSManager();
  const foldersHook = window.DataHooks.useFolders();

  let opmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Minews RSS Feeds</title>
    <dateCreated>${new Date().toISOString()}</dateCreated>
  </head>
  <body>`;

  const folderMap = new Map();
  foldersHook.folders.forEach(folder => {
    folderMap.set(folder.id, { name: folder.name, feeds: [] });
  });

  // 未分類フォルダを追加
  folderMap.set('uncategorized', { name: '未分類', feeds: [] });

  // RSSフィードをフォルダ別に分類
  rssHook.rssFeeds.forEach(feed => {
    const folderId = feed.folderId || 'uncategorized';
    if (folderMap.has(folderId)) {
      folderMap.get(folderId).feeds.push(feed);
    } else {
      folderMap.get('uncategorized').feeds.push(feed);
    }
  });

  // OPMLに各フォルダを追加
  folderMap.forEach((folderData, folderId) => {
    if (folderData.feeds.length > 0) {
      opmlContent += `
    <outline text="${window.escapeXml(folderData.name)}" title="${window.escapeXml(folderData.name)}">`;
      
      folderData.feeds.forEach(feed => {
        opmlContent += `
      <outline text="${window.escapeXml(feed.title)}" title="${window.escapeXml(feed.title)}" xmlUrl="${window.escapeXml(feed.url)}" folderId="${folderId}"/>`;
      });
      
      opmlContent += `
    </outline>`;
    }
  });

  opmlContent += `
  </body>
</opml>`;

  const dataBlob = new Blob([opmlContent], { type: 'text/xml' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(dataBlob);
  link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`;
  link.click();

  alert('RSSデータをエクスポートしました');
};

// ===========================================
// フィルタリング・ソート処理
// ===========================================

// フィルタリングされた記事を取得
const getFilteredArticles = () => {
  const aiHook = window.DataHooks.useAILearning();
  const wordHook = window.DataHooks.useWordFilters();
  
  // ワードフィルター適用
  const filteredByWords = window.WordFilterManager.filterArticles(window.state.articles, wordHook.wordFilters);
  
  // ソースフィルター適用
  let filteredBySource = filteredByWords;
  if (window.state.selectedSource !== 'all') {
    filteredBySource = filteredByWords.filter(article => 
      article.rssSource === window.state.selectedSource
    );
  }
  
  // 表示モードフィルター適用
  let filteredByMode;
  switch (window.state.viewMode) {
    case 'unread': 
      filteredByMode = filteredBySource.filter(article => article.readStatus === 'unread'); 
      break;
    case 'read': 
      filteredByMode = filteredBySource.filter(article => article.readStatus === 'read'); 
      break;
    case 'readLater': 
      filteredByMode = filteredBySource.filter(article => article.readLater); 
      break;
    default: 
      filteredByMode = filteredBySource;
  }
  
  return window.AIScoring.sortArticlesByScore(filteredByMode, aiHook.aiLearning, wordHook.wordFilters);
};

// フィルタリングされた記事数を取得
const getFilteredArticleCount = (viewMode, sourceId) => {
  const wordHook = window.DataHooks.useWordFilters();
  
  // ワードフィルター適用
  const filteredByWords = window.WordFilterManager.filterArticles(window.state.articles, wordHook.wordFilters);
  
  // ソースフィルター適用
  let filteredBySource = filteredByWords;
  if (sourceId && sourceId !== 'all') {
    filteredBySource = filteredByWords.filter(article => 
      article.rssSource === sourceId
    );
  }
  
  // 表示モードによる最終フィルタリング
  switch (viewMode) {
    case 'unread': 
      return filteredBySource.filter(article => article.readStatus === 'unread').length;
    case 'read': 
      return filteredBySource.filter(article => article.readStatus === 'read').length;
    case 'readLater': 
      return filteredBySource.filter(article => article.readLater).length;
    default: 
      return filteredBySource.length;
  }
};

// ===========================================
// イベントハンドラー
// ===========================================

// 表示モード変更
const handleFilterChange = (mode) => window.setState({ viewMode: mode });

// ソース変更（handleFolderChangeからhandleSourceChangeに変更）
const handleSourceChange = (sourceId) => window.setState({ selectedSource: sourceId });

// RSS更新処理
const handleRefresh = async () => {
  window.setState({ isLoading: true });
  
  try {
    const rssHook = window.DataHooks.useRSSManager();
    const result = await rssHook.fetchAllFeeds();
    
    window.setState({ 
      isLoading: false,
      lastUpdate: new Date().toISOString()
    });
    
    if (result.totalAdded > 0) {
      alert(`更新完了: ${result.totalAdded}件の新記事を追加しました`);
    } else {
      alert('更新完了: 新しい記事はありませんでした');
    }
  } catch (error) {
    window.setState({ isLoading: false });
    alert('更新に失敗しました: ' + error.message);
  }
};

// 記事のアクション処理
const handleToggleRead = (articleId) => {
  const articlesHook = window.DataHooks.useArticles();
  const article = window.state.articles.find(a => a.id === articleId);
  if (article) {
    const newStatus = article.readStatus === 'read' ? 'unread' : 'read';
    articlesHook.updateArticle(articleId, { readStatus: newStatus });
  }
};

const handleToggleReadLater = (articleId) => {
  const articlesHook = window.DataHooks.useArticles();
  const article = window.state.articles.find(a => a.id === articleId);
  if (article) {
    articlesHook.updateArticle(articleId, { readLater: !article.readLater });
  }
};

const handleDeleteArticle = (articleId) => {
  if (confirm('この記事を削除しますか？')) {
    const articlesHook = window.DataHooks.useArticles();
    articlesHook.removeArticle(articleId);
  }
};

const handleRatingChange = (articleId, rating) => {
  const articlesHook = window.DataHooks.useArticles();
  const aiHook = window.DataHooks.useAILearning();
  
  const article = window.state.articles.find(a => a.id === articleId);
  if (article) {
    const oldRating = article.userRating;
    
    // AI学習データを更新（既存の評価があれば先に取り消し）
    if (oldRating > 0) {
      aiHook.updateLearningData(article, oldRating, true);
    }
    aiHook.updateLearningData(article, rating, false);
    
    // 記事の評価を更新
    articlesHook.updateArticle(articleId, { userRating: rating });
  }
};

// モーダル処理
const handleModalOpen = (type) => window.setState({ showModal: type });
const handleModalClose = () => window.setState({ showModal: null });

// ===========================================
// UI描画関数
// ===========================================

// ナビゲーション描画
const renderNavigation = () => {
  const modes = [
    { key: 'all', label: '全て' },
    { key: 'unread', label: '未読' },
    { key: 'read', label: '既読' },
    { key: 'readLater', label: '後で読む' }
  ];

  // フィードソース一覧を取得
  const getSourceOptions = () => {
    const sources = new Set();
    window.state.articles.forEach(article => {
      if (article.rssSource) {
        sources.add(article.rssSource);
      }
    });
    
    const sourceOptions = [
      { id: 'all', name: '全て' },
      ...Array.from(sources).map(source => ({ id: source, name: source }))
    ];
    
    return sourceOptions;
  };

  const sourceOptions = getSourceOptions();
  const refreshButtonClass = window.state.isLoading ? 'action-btn refresh-btn loading' : 'action-btn refresh-btn';
  const refreshButtonText = window.state.isLoading ? '更新中...' : '更新';

  return `
    <nav class="nav">
      <div class="nav-left">
        <h1>Minews</h1>
        ${window.state.lastUpdate ? `<div class="last-update">${window.formatDate(window.state.lastUpdate)}</div>` : ''}
      </div>
      <div class="nav-filters">
        <div class="filter-group">
          <label>表示：</label>
          <select class="filter-select" onchange="handleFilterChange(this.value)">
            ${modes.map(mode => 
              `<option value="${mode.key}" ${window.state.viewMode === mode.key ? 'selected' : ''}>
                ${mode.label} (${getFilteredArticleCount(mode.key, window.state.selectedSource)})
              </option>`
            ).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label>配信元：</label>
          <select class="filter-select" onchange="handleSourceChange(this.value)">
            ${sourceOptions.map(source => 
              `<option value="${source.id}" ${window.state.selectedSource === source.id ? 'selected' : ''}>
                ${source.name} (${getFilteredArticleCount(window.state.viewMode, source.id)})
              </option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="nav-actions">
        <button class="${refreshButtonClass}" onclick="handleRefresh()">${refreshButtonText}</button>
        <button class="action-btn" onclick="handleModalOpen('rss')">RSS管理</button>
        <button class="action-btn" onclick="handleModalOpen('folders')">フォルダ</button>
        <button class="action-btn" onclick="handleModalOpen('words')">ワード管理</button>
        <button class="action-btn" onclick="handleModalOpen('dataManagement')">データ管理</button>
      </div>
    </nav>
  `;
};

// 記事グリッド描画
const renderArticleGrid = () => {
  const filteredArticles = getFilteredArticles();
  
  if (filteredArticles.length === 0) {
    return `
      <div class="empty-message">
        <p>表示する記事がありません</p>
        <p>RSS管理からフィードを追加するか、フィルター条件を変更してください</p>
      </div>
    `;
  }

  return `
    <div class="article-grid">
      ${filteredArticles.map(article => renderArticleCard(article)).join('')}
    </div>
  `;
};

// 記事カード描画
const renderArticleCard = (article) => {
  const readLaterText = article.readLater ? '後で読む解除' : '後で読む';
  const readStatusText = article.readStatus === 'read' ? '未読にする' : '既読にする';

  return `
    <article class="article-card" data-read-status="${article.readStatus}">
      <div class="article-header">
        <h3 class="article-title">
          <a href="${article.url}" target="_blank" rel="noopener noreferrer">
            ${article.title}
          </a>
        </h3>
        <div class="article-meta">
          <span class="date">${window.formatDate(article.publishDate)}</span>
          <span class="source">${article.rssSource}</span>
          <span class="category">${article.category}</span>
          <span class="ai-score">AI: ${article.aiScore || 50}</span>
          ${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''}
        </div>
      </div>
      
      <div class="article-content">
        ${window.truncateText(article.content)}
      </div>
      
      <div class="article-keywords">
        ${(article.keywords || []).map(keyword => 
          `<span class="keyword">${keyword}</span>`
        ).join('')}
      </div>
      
      <div class="article-actions">
        <button class="simple-btn read-status" onclick="handleToggleRead('${article.id}')">
          ${readStatusText}
        </button>
        <button class="simple-btn read-later" data-active="${article.readLater}" onclick="handleToggleReadLater('${article.id}')">
          ${readLaterText}
        </button>
        <button class="simple-btn" onclick="handleDeleteArticle('${article.id}')">
          削除
        </button>
      </div>
      
      ${window.createStarRating(article.userRating, article.id)}
    </article>
  `;
};

// モーダル描画
const renderModal = () => {
  if (!window.state.showModal) return '';

  let modalContent = '';
  let modalTitle = '';

  switch (window.state.showModal) {
    case 'rss':
      modalTitle = 'RSS管理';
      modalContent = renderRSSModal();
      break;
    case 'folders':
      modalTitle = 'フォルダ管理';
      modalContent = renderFoldersModal();
      break;
    case 'words':
      modalTitle = 'ワード管理';
      modalContent = renderWordsModal();
      break;
    case 'dataManagement':
      modalTitle = 'データ管理';
      modalContent = renderDataManagementModal();
      break;
    default:
      return '';
  }

  return `
    <div class="modal-overlay" onclick="event.target === this && handleModalClose()">
      <div class="modal">
        <div class="modal-header">
          <h2>${modalTitle}</h2>
          <button class="modal-close" onclick="handleModalClose()">×</button>
        </div>
        <div class="modal-body">
          ${modalContent}
        </div>
      </div>
    </div>
  `;
};

// RSS管理モーダル
const renderRSSModal = () => {
  const rssHook = window.DataHooks.useRSSManager();
  const foldersHook = window.DataHooks.useFolders();
  
  return `
    <div class="modal-actions">
      <button class="action-btn success" onclick="handleRSSAdd()">新しいRSSを追加</button>
      <button class="action-btn" onclick="handleExportRSSData()">OPML形式でエクスポート</button>
    </div>
    
    <div class="rss-list">
      ${rssHook.rssFeeds.map(feed => {
        const folder = foldersHook.folders.find(f => f.id === feed.folderId);
        const folderName = folder ? folder.name : '未分類';
        
        return `
          <div class="rss-item">
            <div class="rss-info">
              <strong onclick="handleRSSEdit('${feed.id}', 'title')">${feed.title}</strong>
              <div class="rss-url" onclick="handleRSSEdit('${feed.id}', 'url')">${feed.url}</div>
              <div onclick="handleRSSEdit('${feed.id}', 'folder')">フォルダ: ${folderName}</div>
              <div class="rss-updated">最終実行: ${window.formatDate(feed.lastUpdated)}</div>
              <span class="rss-status ${feed.isActive ? 'active' : 'inactive'}">
                ${feed.isActive ? '有効' : '無効'}
              </span>
            </div>
            <div class="rss-actions">
              <button class="action-btn" onclick="handleRSSToggle('${feed.id}')">
                ${feed.isActive ? '無効化' : '有効化'}
              </button>
              <button class="action-btn danger" onclick="handleRSSDelete('${feed.id}')">削除</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    <div class="rss-help">
      <h4>RSS管理について</h4>
      <ul>
        <li>新しいRSSフィードを追加できます</li>
        <li>フィード名、URL、フォルダをクリックして編集可能</li>
        <li>フィードを一時的に無効化できます</li>
        <li>OPMLファイルとしてバックアップできます</li>
      </ul>
      <p><strong>注意:</strong> フィードの追加・編集後は更新ボタンで記事を取得してください。</p>
    </div>
  `;
};

// フォルダ管理モーダル
const renderFoldersModal = () => {
  const foldersHook = window.DataHooks.useFolders();
  const rssHook = window.DataHooks.useRSSManager();
  
  return `
    <div class="modal-actions">
      <button class="action-btn success" onclick="handleFolderAdd()">新しいフォルダを追加</button>
    </div>
    
    <div class="folder-list">
      ${foldersHook.folders.map(folder => {
        const feedCount = rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).length;
        
        return `
          <div class="folder-item">
            <div class="folder-info">
              <div class="folder-color" style="background-color: ${folder.color}"></div>
              <div class="folder-details">
                <strong onclick="handleFolderEdit('${folder.id}', 'name')">${folder.name}</strong>
                <div class="folder-meta">
                  <span onclick="handleFolderEdit('${folder.id}', 'color')">色: ${window.FolderManager.getColorName(folder.color)}</span>
                  <span>RSSフィード: ${feedCount}件</span>
                  <span>作成日: ${window.formatDate(folder.createdAt)}</span>
                </div>
              </div>
            </div>
            <div class="folder-actions">
              <button class="action-btn danger" onclick="handleFolderDelete('${folder.id}')">削除</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    
    <div class="folder-help">
      <h4>フォルダ管理について</h4>
      <ul>
        <li>RSSフィードを分類するためのフォルダを管理できます</li>
        <li>フォルダ名と色をクリックして編集可能</li>
        <li>フォルダにRSSフィードが含まれている場合は削除できません</li>
        <li>記事表示時にフォルダでフィルタリングできます</li>
      </ul>
    </div>
  `;
};

// ワード管理モーダル
const renderWordsModal = () => {
  const wordHook = window.DataHooks.useWordFilters();
  
  return `
    <div class="word-section">
      <div class="word-section-header">
        <h3>興味ワード（記事スコア向上）</h3>
        <button class="action-btn success" onclick="handleWordAdd('interest')">興味ワード追加</button>
      </div>
      <div class="word-list">
        ${wordHook.wordFilters.interestWords.map(word => 
          `<span class="word-tag interest">
            ${word}
            <button class="word-remove" onclick="handleWordRemove('${word}', 'interest')">×</button>
          </span>`
        ).join('')}
      </div>
    </div>
    
    <div class="word-section">
      <div class="word-section-header">
        <h3>NGワード（記事を非表示）</h3>
        <button class="action-btn danger" onclick="handleWordAdd('ng')">NGワード追加</button>
      </div>
      <div class="word-list">
        ${wordHook.wordFilters.ngWords.map(word => 
          `<span class="word-tag ng">
            ${word}
            <button class="word-remove" onclick="handleWordRemove('${word}', 'ng')">×</button>
          </span>`
        ).join('')}
      </div>
    </div>
    
    <div class="word-help">
      <h4>ワード管理について</h4>
      <ul>
        <li><strong>興味ワード:</strong> これらの単語を含む記事のAIスコアが向上します</li>
        <li><strong>NGワード:</strong> これらの単語を含む記事は表示されません</li>
        <li>記事タイトルと本文の両方が対象です</li>
        <li>大文字小文字は区別されません</li>
      </ul>
    </div>
  `;
};

// データ管理モーダル
const renderDataManagementModal = () => {
  const storageInfo = window.LocalStorageManager.getStorageInfo();
  const usagePercent = Math.round((storageInfo.totalSize / 5000000) * 100);
  
  return `
    <div class="storage-info">
      <h3>ストレージ使用量</h3>
      <div class="storage-details">
        <p>使用中: ${Math.round(storageInfo.totalSize / 1024)}KB / 約5MB (${usagePercent}%)</p>
        <p>アイテム数: ${storageInfo.itemCount}個</p>
        <p>利用可能: ${Math.round(storageInfo.available / 1024)}KB</p>
      </div>
    </div>
    
    <div class="data-actions">
      <h3>学習データ管理</h3>
      <div class="action-group">
        <button class="action-btn success" onclick="handleExportLearningData()">学習データをエクスポート</button>
        <label class="action-btn" for="import-learning-data">
          学習データをインポート
          <input type="file" id="import-learning-data" accept=".json" onchange="handleImportLearningData(event)" style="display: none;">
        </label>
      </div>
      
      <h3>アプリケーション情報</h3>
      <div class="app-info">
        <p>バージョン: ${window.CONFIG.DATA_VERSION}</p>
        <p>最終更新: ${window.state.lastUpdate ? window.formatDate(window.state.lastUpdate) : '未実行'}</p>
        <p>記事数: ${window.state.articles.length}件</p>
      </div>
    </div>
  `;
};

// ===========================================
// RSS管理機能
// ===========================================

window.handleRSSAdd = () => {
  const url = prompt('RSSフィードのURLを入力してください:');
  if (!url || !url.trim()) return;
  
  const title = prompt('フィード名を入力してください:', 'New Feed');
  if (!title) return;
  
  const rssHook = window.DataHooks.useRSSManager();
  const foldersHook = window.DataHooks.useFolders();
  
  // フォルダ選択
  if (foldersHook.folders.length > 0) {
    const folderList = foldersHook.folders.map((folder, index) => 
      `${index + 1}. ${folder.name}`
    ).join('\n');
    
    const selection = prompt(`フォルダを選択してください (番号入力):\n0. 未分類\n${folderList}`);
    const folderIndex = parseInt(selection);
    
    let folderId = 'uncategorized';
    if (folderIndex > 0 && folderIndex <= foldersHook.folders.length) {
      folderId = foldersHook.folders[folderIndex - 1].id;
    }
    
    rssHook.addRSSFeed(url.trim(), title.trim(), folderId);
  } else {
    rssHook.addRSSFeed(url.trim(), title.trim(), 'uncategorized');
  }
  
  alert('RSSフィードを追加しました');
  window.render();
};

window.handleRSSEdit = (feedId, field) => {
  const rssHook = window.DataHooks.useRSSManager();
  const foldersHook = window.DataHooks.useFolders();
  const feed = rssHook.rssFeeds.find(f => f.id === feedId);
  
  if (!feed) return;
  
  switch (field) {
    case 'title':
      const newTitle = prompt('フィード名を編集:', feed.title);
      if (newTitle && newTitle.trim() !== feed.title) {
        rssHook.updateRSSFeed(feedId, { title: newTitle.trim() });
        window.render();
      }
      break;
      
    case 'url':
      const newUrl = prompt('フィードURLを編集:', feed.url);
      if (newUrl && newUrl.trim() !== feed.url) {
        rssHook.updateRSSFeed(feedId, { url: newUrl.trim() });
        window.render();
      }
      break;
      
    case 'folder':
      if (foldersHook.folders.length === 0) {
        alert('利用可能なフォルダがありません');
        return;
      }
      
      const folderList = foldersHook.folders.map((folder, index) => 
        `${index + 1}. ${folder.name}`
      ).join('\n');
      
      const selection = prompt(`フォルダを選択してください (番号入力):\n0. 未分類\n${folderList}`);
      const folderIndex = parseInt(selection);
      
      let newFolderId = 'uncategorized';
      if (folderIndex > 0 && folderIndex <= foldersHook.folders.length) {
        newFolderId = foldersHook.folders[folderIndex - 1].id;
      }
      
      if (newFolderId !== feed.folderId) {
        rssHook.updateRSSFeed(feedId, { folderId: newFolderId });
        window.render();
      }
      break;
  }
};

window.handleRSSToggle = (feedId) => {
  const rssHook = window.DataHooks.useRSSManager();
  const feed = rssHook.rssFeeds.find(f => f.id === feedId);
  
  if (feed) {
    rssHook.updateRSSFeed(feedId, { isActive: !feed.isActive });
    window.render();
  }
};

window.handleRSSDelete = (feedId) => {
  if (confirm('このRSSフィードを削除しますか？')) {
    const rssHook = window.DataHooks.useRSSManager();
    rssHook.removeRSSFeed(feedId);
    alert('RSSフィードを削除しました');
    window.render();
  }
};

// ===========================================
// フォルダ管理機能
// ===========================================

window.handleFolderAdd = () => {
  const name = prompt('フォルダ名を入力してください:');
  if (!name || !name.trim()) return;
  
  // 色選択
  const colorOptions = window.CONFIG.FOLDER_COLORS.map((color, index) => 
    `${index + 1}. ${color.name}`
  ).join('\n');
  
  const colorSelection = prompt(`色を選択してください (番号入力):\n${colorOptions}`);
  const colorIndex = parseInt(colorSelection) - 1;
  
  let selectedColor = '#4A90A4'; // デフォルト色
  if (colorIndex >= 0 && colorIndex < window.CONFIG.FOLDER_COLORS.length) {
    selectedColor = window.CONFIG.FOLDER_COLORS[colorIndex].value;
  }
  
  const foldersHook = window.DataHooks.useFolders();
  const newFolder = foldersHook.addFolder(name.trim(), selectedColor);
  
  if (newFolder) {
    alert('フォルダを追加しました');
    window.render();
  } else {
    alert('フォルダの追加に失敗しました');
  }
};

window.handleFolderEdit = (folderId, field) => {
  const foldersHook = window.DataHooks.useFolders();
  const folder = foldersHook.folders.find(f => f.id === folderId);
  
  if (!folder) return;
  
  switch (field) {
    case 'name':
      const newName = prompt('フォルダ名を編集:', folder.name);
      if (newName && newName.trim() !== folder.name) {
        foldersHook.updateFolder(folderId, { name: newName.trim() });
        window.render();
      }
      break;
      
    case 'color':
      const colorOptions = window.CONFIG.FOLDER_COLORS.map((color, index) => 
        `${index + 1}. ${color.name}`
      ).join('\n');
      
      const selection = prompt(`色を選択してください (番号入力):\n${colorOptions}`);
      const colorIndex = parseInt(selection) - 1;
      
      if (colorIndex >= 0 && colorIndex < window.CONFIG.FOLDER_COLORS.length) {
        const newColor = window.CONFIG.FOLDER_COLORS[colorIndex].value;
        if (newColor !== folder.color) {
          foldersHook.updateFolder(folderId, { color: newColor });
          window.render();
        }
      }
      break;
  }
};

window.handleFolderDelete = (folderId) => {
  const foldersHook = window.DataHooks.useFolders();
  const result = foldersHook.removeFolder(folderId);
  
  if (result.success) {
    alert('フォルダを削除しました');
    window.render();
  } else if (result.reason === 'FEEDS_EXIST') {
    alert(`このフォルダには${result.feedCount}個のRSSフィードが含まれているため、削除できません。先にRSSフィードを移動または削除してください。`);
  } else {
    alert('フォルダの削除に失敗しました');
  }
};

// ===========================================
// ワード管理機能
// ===========================================

window.handleWordAdd = (type) => {
  const wordType = type === 'interest' ? '興味ワード' : 'NGワード';
  const word = prompt(`${wordType}を入力してください:`);
  
  if (!word || !word.trim()) return;
  
  const wordHook = window.DataHooks.useWordFilters();
  const success = type === 'interest' 
    ? wordHook.addInterestWord(word.trim())
    : wordHook.addNGWord(word.trim());
  
  if (success) {
    alert(`${wordType}を追加しました`);
    window.render();
  } else {
    alert(`${wordType}は既に登録されています`);
  }
};

window.handleWordRemove = (word, type) => {
  const wordType = type === 'interest' ? '興味ワード' : 'NGワード';
  
  if (confirm(`${wordType}「${word}」を削除しますか？`)) {
    const wordHook = window.DataHooks.useWordFilters();
    const success = type === 'interest'
      ? wordHook.removeInterestWord(word)
      : wordHook.removeNGWord(word);
    
    if (success) {
      alert(`${wordType}を削除しました`);
      window.render();
    }
  }
};

// ===========================================
// メイン描画関数
// ===========================================

window.render = () => {
  const app = document.getElementById('app');
  if (!app) return;
  
  app.innerHTML = `
    ${renderNavigation()}
    <main class="main-content">
      ${renderArticleGrid()}
    </main>
    ${renderModal()}
  `;
};

// ===========================================
// 初期化とグローバル関数登録
// ===========================================

// グローバル関数の登録
window.handleFilterChange = handleFilterChange;
window.handleSourceChange = handleSourceChange;  // handleFolderChangeからhandleSourceChangeに変更
window.handleRefresh = handleRefresh;
window.handleToggleRead = handleToggleRead;
window.handleToggleReadLater = handleToggleReadLater;
window.handleDeleteArticle = handleDeleteArticle;
window.handleRatingChange = handleRatingChange;
window.handleModalOpen = handleModalOpen;
window.handleModalClose = handleModalClose;

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  initializeData();
  window.render();
});

})();
