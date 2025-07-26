// Minews PWA - UI・表示レイヤー 
(function() { 
'use strict'; 
// =========================================== 
// アプリケーション状態管理 
// =========================================== 
window.state = { viewMode: 'all', selectedFolder: 'all', showModal: null, articles: [], isLoading: false, lastUpdate: null }; 
window.setState = (newState) => { window.state = { ...window.state, ...newState }; window.render(); }; 
const initializeData = () => { 
const articlesData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.ARTICLES, window.DEFAULT_DATA.articles); 
const rssData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.RSS_FEEDS, window.DEFAULT_DATA.rssFeeds); 
const foldersData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.FOLDERS, window.DEFAULT_DATA.folders); 
const aiData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.AI_LEARNING, window.DEFAULT_DATA.aiLearning); 
const wordData = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.WORD_FILTERS, window.DEFAULT_DATA.wordFilters); 
// フィルタ設定の読み込み 
const viewSettings = window.LocalStorageManager.getItem(window.CONFIG.STORAGE_KEYS.VIEW_SETTINGS, { viewMode: 'all', selectedFolder: 'all' }); 
Object.assign(window.DataHooksCache, { articles: articlesData, rssFeeds: rssData, folders: foldersData, aiLearning: aiData, wordFilters: wordData }); 
window.state.articles = articlesData; 
window.state.viewMode = viewSettings.viewMode; 
window.state.selectedFolder = viewSettings.selectedFolder; 
if (window.state.articles.length === 0) { 
const sampleArticles = [ 
{ id: 'sample_1', title: 'Minews PWA：フォルダ機能追加完了', url: '#', content: 'RSSフィードをフォルダで分類管理し、記事表示もフォルダでフィルタリングできる機能を追加しました。リスト選択モーダルによりユーザビリティも向上。', publishDate: new Date().toISOString(), rssSource: 'NHKニュース', category: 'Design', readStatus: 'unread', readLater: false, userRating: 0, keywords: ['フォルダ', 'RSS', 'リスト選択', '機能追加'] }, 
{ id: 'sample_2', title: 'フォルダ管理で記事整理が便利に', url: '#', content: 'ニュース、テック、ブログなど用途別にRSSフィードを分類。記事表示もフォルダ単位でフィルタリングでき、情報収集効率が大幅向上。', publishDate: new Date(Date.now() - 3600000).toISOString(), rssSource: 'ITmedia', category: 'UX', readStatus: 'unread', readLater: false, userRating: 0, keywords: ['フォルダ管理', '記事整理', '分類', 'フィルタリング', '効率化'] } 
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
stars += `★`; 
} 
return ``; 
}; 
window.truncateText = (text, maxLength = 200) => text.length <= maxLength ? text : text.substring(0, maxLength).trim() + '...'; 
// XMLエスケープ関数 
window.escapeXml = (text) => { 
return text.replace(/[<> &'"]/g, (char) => { 
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
const exportData = { version: window.CONFIG.DATA_VERSION, exportDate: new Date().toISOString(), aiLearning: aiHook.aiLearning, wordFilters: wordHook.wordFilters }; 
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
let opmlContent = `
<opml version="1.0">
  <head>
    <title>Minews RSS Feeds</title>
  </head>
  <body>
`; 
foldersHook.folders.forEach(folder => { 
opmlContent += `    <outline text="${window.escapeXml(folder.name)}" title="${window.escapeXml(folder.name)}">\n`; 
rssHook.rssFeeds.filter(feed => feed.folderId === folder.id).forEach(feed => { 
opmlContent += `      <outline type="rss" text="${window.escapeXml(feed.title)}" title="${window.escapeXml(feed.title)}" xmlUrl="${window.escapeXml(feed.url)}"/>\n`; 
}); 
opmlContent += `    </outline>\n`; 
}); 
// 未分類フィード 
const uncategorizedFeeds = rssHook.rssFeeds.filter(feed => !feed.folderId || feed.folderId === 'uncategorized'); 
if (uncategorizedFeeds.length > 0) { 
opmlContent += `    <outline text="未分類" title="未分類">\n`; 
uncategorizedFeeds.forEach(feed => { 
opmlContent += `      <outline type="rss" text="${window.escapeXml(feed.title)}" title="${window.escapeXml(feed.title)}" xmlUrl="${window.escapeXml(feed.url)}"/>\n`; 
}); 
opmlContent += `    </outline>\n`; 
} 
opmlContent += `  </body>\n</opml>`; 
const blob = new Blob([opmlContent], { type: 'application/xml' }); 
const link = document.createElement('a'); 
link.href = URL.createObjectURL(blob); 
link.download = `minews_rss_feeds_${new Date().toISOString().split('T')[0]}.opml`; 
link.click(); 
alert('RSSデータをエクスポートしました'); 
}; 
// RSSデータインポート（OPML形式） 
window.handleImportRSSData = (event) => { 
const file = event.target.files[0]; 
if (!file) return; 
const reader = new FileReader(); 
reader.onload = (e) => { 
try { 
const parser = new DOMParser(); 
const xmlDoc = parser.parseFromString(e.target.result, "application/xml"); 
const outlines = xmlDoc.getElementsByTagName('outline'); 
const rssHook = window.DataHooks.useRSSManager(); 
const foldersHook = window.DataHooks.useFolders(); 
let currentFolderId = 'uncategorized'; 
for (let outline of outlines) { 
if (!outline.hasAttribute('xmlUrl')) { 
// フォルダ 
const folderName = outline.getAttribute('title') || outline.getAttribute('text') || '未分類'; 
let folder = foldersHook.folders.find(f => f.name.toLowerCase() === folderName.toLowerCase()); 
if (!folder) { 
folder = foldersHook.addFolder(folderName, window.CONFIG.FOLDER_COLORS[0].value); 
} 
currentFolderId = folder.id; 
} else { 
// RSSフィード 
const url = outline.getAttribute('xmlUrl'); 
const title = outline.getAttribute('title') || outline.getAttribute('text') || new URL(url).hostname; 
const existing = rssHook.rssFeeds.find(f => f.url === url); 
if (!existing) { 
rssHook.addRSSFeed(url, title, currentFolderId); 
} 
} 
} 
alert('RSSデータをインポートしました'); 
window.render(); 
} catch (error) { 
alert('インポートに失敗しました: ' + error.message); 
} 
}; 
reader.readAsText(file); 
event.target.value = ''; 
}; 
// =========================================== 
// イベントハンドラ 
// =========================================== 
window.handleArticleClick = (event) => { 
const button = event.target.closest('[data-action]'); 
if (!button) return; 
const action = button.dataset.action; 
const articleId = button.dataset.articleId; 
const articlesHook = window.DataHooks.useArticles(); 
const aiHook = window.DataHooks.useAILearning(); 
switch (action) { 
case 'read': 
const currentStatus = button.dataset.readStatus === 'unread' ? 'read' : 'unread'; 
articlesHook.updateArticle(articleId, { readStatus: currentStatus }); 
break; 
case 'read-later': 
const currentLater = button.dataset.active === 'true'; 
articlesHook.updateArticle(articleId, { readLater: !currentLater }); 
break; 
default: 
break; 
} 
}; 
window.handleStarClick = (event) => { 
const star = event.target; 
const rating = parseInt(star.dataset.rating); 
const articleId = star.dataset.articleId; 
const articlesHook = window.DataHooks.useArticles(); 
const aiHook = window.DataHooks.useAILearning(); 
const article = window.state.articles.find(a => a.id === articleId); 
if (!article) return; 
const previousRating = article.userRating; 
articlesHook.updateArticle(articleId, { userRating: rating }); 
aiHook.updateLearningData(article, rating); 
if (previousRating > 0) { 
aiHook.updateLearningData(article, previousRating, true); 
} 
}; 
// =========================================== 
// レンダリング関数 
// =========================================== 
window.render = () => { 
const app = document.getElementById('app'); 
if (!app) return; 
app.innerHTML = window.renderNav() + window.renderMain(); 
if (window.state.showModal) { 
app.appendChild(window.renderModal()); 
} 
}; 
window.renderNav = () => { 
const lastUpdate = window.state.lastUpdate ? `最終更新: ${window.formatDate(window.state.lastUpdate)}` : ''; 
return ` 
<nav class="nav"> 
<div class="nav-left"> 
<h1>Minews PWA</h1> 
<span class="last-update">${lastUpdate}</span> 
</div> 
<div class="nav-filters"> 
<div class="filter-group"> 
<label for="viewMode">表示:</label> 
<select id="viewMode" class="filter-select" onchange="window.setState({viewMode: this.value})"> 
<option value="all" ${window.state.viewMode === 'all' ? 'selected' : ''}>すべて</option> 
<option value="unread" ${window.state.viewMode === 'unread' ? 'selected' : ''}>未読</option> 
<option value="readLater" ${window.state.viewMode === 'readLater' ? 'selected' : ''}>後で読む</option> 
<option value="highScore" ${window.state.viewMode === 'highScore' ? 'selected' : ''}>高評価</option> 
</select> 
</div> 
<div class="filter-group"> 
<label for="folderSelect">フォルダ:</label> 
<select id="folderSelect" class="filter-select" onchange="window.setState({selectedFolder: this.value})"> 
<option value="all" ${window.state.selectedFolder === 'all' ? 'selected' : ''}>すべて</option> 
${window.DataHooksCache.folders.map(folder => `<option value="${folder.id}" ${window.state.selectedFolder === folder.id ? 'selected' : ''}>${folder.name}</option>`).join('')} 
</select> 
</div> 
</div> 
<div class="nav-actions"> 
<button class="action-btn refresh-btn" onclick="window.handleRefreshAllFeeds()" ${window.state.isLoading ? 'disabled' : ''}>${window.state.isLoading ? '更新中...' : '更新'}</button> 
<button class="action-btn" onclick="window.setState({showModal: 'rss'});">RSS管理</button> 
<button class="action-btn" onclick="window.setState({showModal: 'word'});">ワード管理</button> 
<button class="action-btn" onclick="window.setState({showModal: 'folder'});">フォルダ管理</button> 
<button class="action-btn" onclick="window.handleExportLearningData();">学習エクスポート</button> 
<label class="action-btn">学習インポート <input type="file" accept=".json" onchange="window.handleImportLearningData(event)" style="display:none;"></label> 
<button class="action-btn" onclick="window.handleExportRSSData();">RSSエクスポート</button> 
<label class="action-btn">RSSインポート <input type="file" accept=".opml" onchange="window.handleImportRSSData(event)" style="display:none;"></label> 
</div> 
</nav> 
`; 
}; 
window.renderMain = () => { 
let filteredArticles = window.state.articles; 
// フォルダフィルタ 
if (window.state.selectedFolder !== 'all') { 
const rssHook = window.DataHooks.useRSSManager(); 
const folderFeeds = rssHook.rssFeeds.filter(feed => feed.folderId === window.state.selectedFolder).map(feed => feed.title); 
filteredArticles = filteredArticles.filter(article => folderFeeds.includes(article.rssSource)); 
} 
// 表示モードフィルタ 
switch (window.state.viewMode) { 
case 'unread': 
filteredArticles = filteredArticles.filter(a => a.readStatus === 'unread'); 
break; 
case 'readLater': 
filteredArticles = filteredArticles.filter(a => a.readLater); 
break; 
case 'highScore': 
filteredArticles = filteredArticles.filter(a => a.userRating >= 4 || a.aiScore >= 80); 
break; 
} 
// NGワードフィルタ 
const wordHook = window.DataHooks.useWordFilters(); 
filteredArticles = window.WordFilterManager.filterArticles(filteredArticles, wordHook.wordFilters); 
// AIスコアリングとソート 
const aiHook = window.DataHooks.useAILearning(); 
filteredArticles = window.AIScoring.sortArticlesByScore(filteredArticles, aiHook.aiLearning, wordHook.wordFilters); 
return ` 
<main class="main-content"> 
<div class="article-grid"> 
${filteredArticles.length === 0 ? '<div class="empty-message">表示する記事がありません</div>' : filteredArticles.map(window.renderArticleCard).join('')} 
</div> 
</main> 
`; 
}; 
window.renderArticleCard = (article) => { 
const formattedDate = window.formatDate(article.publishDate); 
const truncatedContent = window.truncateText(article.content); 
const keywordsHtml = article.keywords ? article.keywords.map(k => `<span class="keyword">${k}</span>`).join('') : ''; 
const readButtonText = article.readStatus === 'unread' ? '既読' : '未読に戻す'; 
const laterButtonText = article.readLater ? '後で読む解除' : '後で読む'; 
return ` 
<article class="article-card" data-article-id="${article.id}" data-read-status="${article.readStatus}"> 
<header class="article-header"> 
<h2 class="article-title"><a href="${article.url}" target="_blank">${article.title}</a></h2> 
<div class="article-meta"> 
<span class="date">${formattedDate}</span> 
<span class="source">${article.rssSource}</span> 
${article.category ? `<span class="category">${article.category}</span>` : ''} 
${article.aiScore ? `<span class="ai-score">AI: ${article.aiScore}</span>` : ''} 
${article.userRating > 0 ? `<span class="rating-badge">★${article.userRating}</span>` : ''} 
</div> 
</header> 
<p class="article-content">${truncatedContent}</p> 
<div class="article-keywords">${keywordsHtml}</div> 
<div class="article-actions"> 
<button class="simple-btn read-status" data-action="read" data-article-id="${article.id}" data-read-status="${article.readStatus}">${readButtonText}</button> 
<button class="simple-btn read-later" data-action="read-later" data-article-id="${article.id}" data-active="${article.readLater}">${laterButtonText}</button> 
</div> 
<div class="star-rating"> 
${window.createStarRating(article.userRating, article.id)} 
</div> 
</article> 
`; 
}; 
window.renderModal = () => { 
const overlay = document.createElement('div'); 
overlay.className = 'modal-overlay'; 
overlay.onclick = (e) => { if (e.target === overlay) window.setState({showModal: null}); }; 
let modalContent = ''; 
switch (window.state.showModal) { 
case 'rss': 
modalContent = window.renderRSSModal(); 
break; 
case 'word': 
modalContent = window.renderWordModal(); 
break; 
case 'folder': 
modalContent = window.renderFolderModal(); 
break; 
case 'addRSS': 
modalContent = window.renderAddRSSModal(); 
break; 
case 'editRSS': 
modalContent = window.renderEditRSSModal(window.state.editFeedId); 
break; 
case 'addFolder': 
modalContent = window.renderAddFolderModal(); 
break; 
case 'editFolder': 
modalContent = window.renderEditFolderModal(window.state.editFolderId); 
break; 
case 'selectFolder': 
modalContent = window.renderSelectFolderModal(window.state.selectForFeedId); 
break; 
case 'selectColor': 
modalContent = window.renderSelectColorModal(window.state.selectForFolderId); 
break; 
} 
overlay.innerHTML = modalContent; 
return overlay; 
}; 
// RSS管理モーダル 
window.renderRSSModal = () => { 
const rssHook = window.DataHooks.useRSSManager(); 
const foldersHook = window.DataHooks.useFolders(); 
return ` 
<div class="modal"> 
<header class="modal-header"> 
<h2>RSS管理</h2> 
<button class="modal-close" onclick="window.setState({showModal: null})">×</button> 
</header> 
<div class="modal-body"> 
<div class="modal-actions"> 
<button class="action-btn success" onclick="window.setState({showModal: 'addRSS'})">RSS追加</button> 
</div> 
<div class="rss-list"> 
${rssHook.rssFeeds.map(feed => { 
const folder = foldersHook.folders.find(f => f.id === feed.folderId) || { name: '未分類', color: '#6c757d' }; 
const statusClass = feed.isActive ? 'active' : 'inactive'; 
const statusText = feed.isActive ? '有効' : '無効'; 
return ` 
<div class="rss-item"> 
<div class="rss-info"> 
<strong onclick="window.setState({showModal: 'editRSS', editFeedId: '${feed.id}'})">${feed.title}</strong> 
<span class="rss-url" onclick="window.setState({showModal: 'editRSS', editFeedId: '${feed.id}'})">${feed.url}</span> 
<div onclick="window.setState({showModal: 'selectFolder', selectForFeedId: '${feed.id}'})"> 
フォルダ: <span style="color: ${folder.color}">${folder.name}</span> 
</div> 
<span class="rss-updated">最終更新: ${window.formatDate(feed.lastUpdated)}</span> 
<span class="rss-status ${statusClass}">${statusText}</span> 
</div> 
<div class="rss-actions"> 
<button class="action-btn ${feed.isActive ? 'warning' : 'success'}" onclick="window.toggleRSSActive('${feed.id}', ${!feed.isActive})">${feed.isActive ? '無効化' : '有効化'}</button> 
<button class="action-btn danger" onclick="window.confirmDeleteRSS('${feed.id}')">削除</button> 
</div> 
</div> 
`; 
}).join('')} 
</div> 
<div class="rss-help"> 
<h4>ヘルプ</h4> 
<p>RSS管理の使い方:</p> 
<ul> 
<li>タイトルやURLをクリックして編集</li> 
<li>フォルダ名をクリックして変更</li> 
<li>有効/無効を切り替え可能</li> 
<li>削除は確認後実行</li> 
</ul> 
</div> 
</div> 
</div> 
`; 
}; 
// 他のrender関数（renderWordModal, renderFolderModalなど）は添付に基づき省略（変更なし）
initializeData(); 
window.render(); 
})();
