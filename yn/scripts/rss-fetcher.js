// RSS取得エンジン（記事ID安定化対応版・NGドメイン機能削除版）

class RSSFetcher {
constructor() {
// プロキシサービス設定（成功実績順）
this.proxyServices = [
{
name: 'AllOrigins-Primary',
endpoint: 'https://api.allorigins.win/get',
params: (url) => `?url=${encodeURIComponent(url)}`,
parser: (data) => {
try {
if (data && data.contents) {
const xml = new DOMParser().parseFromString(data.contents, 'text/xml');
const result = this.parseRSSXML(xml);
if (result && result.length > 0) {
console.log(`📰 AllOrigins-Primary: ${result.length} items parsed successfully`);
return result;
}
return null;
} catch (e) {
console.warn('AllOrigins-Primary parse error:', e);
return null;
}
},
timeout: 12000,
maxRetries: 2,
priority: 1,
headers: {
'Accept': 'application/json'
}
},
{
name: 'AllOrigins-Raw',
endpoint: 'https://api.allorigins.win/raw',
params: (url) => `?url=${encodeURIComponent(url)}`,
parser: (data) => {
try {
if (typeof data === 'string' && data.length > 0) {
const xml = new DOMParser().parseFromString(data, 'text/xml');
const result = this.parseRSSXML(xml);
if (result && result.length > 0) {
console.log(`📰 AllOrigins-Raw: ${result.length} items parsed successfully`);
return result;
}
return null;
} catch (e) {
console.warn('AllOrigins-Raw parse error:', e);
return null;
}
},
timeout: 10000,
maxRetries: 1,
priority: 2,
headers: {
'Accept': 'text/xml, application/xml, text/plain'
}
},
{
name: 'RSS2JSON-Free',
endpoint: 'https://api.rss2json.com/v1/api.json',
params: (url) => `?rss_url=${encodeURIComponent(url)}&count=20`,
parser: (data) => {
try {
if (data && data.status === 'ok' && data.items && data.items.length > 0) {
console.log(`📰 RSS2JSON-Free: ${data.items.length} items received`);
return data.items;
}
return null;
} catch (e) {
console.warn('RSS2JSON-Free parse error:', e);
return null;
}
},
timeout: 6000,
maxRetries: 1,
priority: 3,
headers: {
'Accept': 'application/json'
}
}
];

this.cache = new Map();
this.rateLimitDelay = 1500;
this.lastRequestTime = 0;

// サービス成功率トラッキング
this.serviceStats = new Map();
this.initializeServiceStats();
this.debugMode = true;
}

initializeServiceStats() {
this.proxyServices.forEach(service => {
this.serviceStats.set(service.name, {
attempts: 0,
successes: 0,
failures: 0,
lastSuccess: null,
avgResponseTime: 0,
lastError: null
});
});
}

// RSS取得メイン関数
async fetchRSSWithFallback(rssUrl) {
const errors = [];
const startTime = Date.now();

await this.enforceRateLimit();

const orderedServices = [...this.proxyServices].sort((a, b) => a.priority - b.priority);

this.log(`🚀 RSS取得開始: ${rssUrl}`);

for (let i = 0; i < orderedServices.length; i++) {
const service = orderedServices[i];
const serviceStats = this.serviceStats.get(service.name);

for (let retry = 0; retry <= service.maxRetries; retry++) {
const attemptStartTime = Date.now();
serviceStats.attempts++;

try {
this.log(`🔄 Trying ${service.name} (attempt ${retry + 1}/${service.maxRetries + 1})`);

const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), service.timeout);
const fetchUrl = service.endpoint + service.params(rssUrl);

const response = await fetch(fetchUrl, {
signal: controller.signal,
method: 'GET',
headers: service.headers,
mode: 'cors',
credentials: 'omit',
cache: 'no-cache'
});

clearTimeout(timeoutId);

if (!response.ok) {
throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const responseTime = Date.now() - attemptStartTime;
let data;

const contentType = response.headers.get('content-type') || '';
if (contentType.includes('application/json')) {
data = await response.json();
} else {
data = await response.text();
}

const articles = service.parser(data);

if (articles && articles.length > 0) {
serviceStats.successes++;
serviceStats.lastSuccess = new Date().toISOString();
serviceStats.avgResponseTime = (serviceStats.avgResponseTime + responseTime) / 2;
serviceStats.lastError = null;

this.log(`✅ SUCCESS with ${service.name}: ${articles.length} articles (${responseTime}ms)`);

const normalizedArticles = articles.map(article =>
this.normalizeArticleData(article, rssUrl)
);

this.cache.set(rssUrl, {
articles: normalizedArticles,
timestamp: Date.now(),
service: service.name,
responseTime: responseTime
});

return {
success: true,
articles: normalizedArticles,
service: service.name,
attempt: retry + 1,
responseTime: responseTime,
totalTime: Date.now() - startTime
};
}

throw new Error('No articles found or parse failed');

} catch (error) {
serviceStats.failures++;
serviceStats.lastError = error.message;

const errorInfo = {
service: service.name,
attempt: retry + 1,
error: error.message,
responseTime: Date.now() - attemptStartTime,
timestamp: new Date().toISOString()
};

errors.push(errorInfo);
this.log(`❌ ${service.name} attempt ${retry + 1} failed (${errorInfo.responseTime}ms): ${error.message}`);

if (retry < service.maxRetries) {
await new Promise(resolve => setTimeout(resolve, 2000));
}
}
}
}

// キャッシュフォールバック
const cachedData = this.cache.get(rssUrl);
if (cachedData && Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) {
this.log(`📦 Using cached data (${cachedData.articles.length} articles from ${cachedData.service})`);
return {
success: true,
articles: cachedData.articles,
service: cachedData.service + ' (cached)',
attempt: 1,
fromCache: true,
totalTime: Date.now() - startTime
};
}

this.log(`💥 ALL SERVICES FAILED for ${rssUrl}`);
return {
success: false,
articles: [],
errors: errors,
totalTime: Date.now() - startTime,
fallbackMessage: `全てのRSSサービスが利用できません (${errors.length}個のサービスで失敗)。`,
serviceStats: this.getServiceStatsReport()
};
}

// 【修正】記事データ正規化（NGドメイン削除・安定ID生成対応）
normalizeArticleData(rawArticle, sourceUrl) {
try {
const domain = this.extractDomain(rawArticle.link || rawArticle.url || sourceUrl);
const publishDate = this.parseDate(rawArticle.pubDate || rawArticle.published || rawArticle.date);

// 【重要】安定した記事ID生成（URLベース）
const articleId = this.generateStableArticleId(rawArticle, sourceUrl);

return {
articleId: articleId,
title: this.sanitizeText(rawArticle.title || '無題'),
excerpt: this.sanitizeText(rawArticle.description || rawArticle.content || rawArticle.summary || ''),
url: rawArticle.link || rawArticle.url || '',
domain: domain,
publishDate: publishDate,
category: this.inferCategory(rawArticle, sourceUrl),
readStatus: 'unread', // デフォルト値（マージ時に既存値で上書きされる）
favorited: false, // デフォルト値
interestScore: 50, // デフォルト値
matchedKeywords: [],
feedbackHistory: [],
addedDate: new Date().toISOString(),
sourceUrl: sourceUrl
// 【削除】ngDomain: false を削除
};
} catch (error) {
console.error('Article normalization error:', error, rawArticle);
return this.createErrorArticle(rawArticle, sourceUrl, error.message);
}
}

// 【新機能】安定した記事ID生成
generateStableArticleId(rawArticle, sourceUrl) {
try {
const url = rawArticle.link || rawArticle.url || '';
const title = rawArticle.title || '';
const domain = this.extractDomain(sourceUrl);

// URLが存在する場合はURL基準
if (url) {
const urlHash = this.simpleHash(url);
return `${domain}_url_${urlHash}`;
}

// URLがない場合はタイトル+ドメイン+日付基準
const titleHash = this.simpleHash(title);
const dateStr = rawArticle.pubDate || rawArticle.published || rawArticle.date || '';
const dateHash = this.simpleHash(dateStr);

return `${domain}_title_${titleHash}_${dateHash}`;
} catch (error) {
// エラー時はランダムID
return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
}

// RSS XML解析
parseRSSXML(xmlDoc) {
try {
const articles = [];

if (!xmlDoc || xmlDoc.querySelector('parsererror')) {
this.log(`⚠️ XML parse error detected`);
return null;
}

// RSS 2.0形式
let items = xmlDoc.querySelectorAll('item');
let format = 'RSS 2.0';

// Atom形式
if (items.length === 0) {
items = xmlDoc.querySelectorAll('entry');
format = 'Atom';
}

// RDF形式
if (items.length === 0) {
items = xmlDoc.querySelectorAll('rdf\\:item, item');
format = 'RDF';
}

this.log(`📰 Detected ${format} format with ${items.length} items`);

items.forEach((item, index) => {
try {
const article = {
title: this.getXMLText(item, 'title'),
description: this.getXMLText(item, 'description') ||
this.getXMLText(item, 'content') ||
this.getXMLText(item, 'summary') ||
this.getXMLText(item, 'content:encoded'),
link: this.getXMLText(item, 'link') ||
this.getXMLText(item, 'guid') ||
item.getAttribute('rdf:about'),
pubDate: this.getXMLText(item, 'pubDate') ||
this.getXMLText(item, 'published') ||
this.getXMLText(item, 'dc:date') ||
this.getXMLText(item, 'updated')
};

if (article.title && article.link) {
articles.push(article);
}
} catch (error) {
this.log(`❌ Item ${index + 1} parse error: ${error.message}`);
}
});

this.log(`✅ Successfully parsed ${articles.length} articles from ${format} feed`);
return articles;
} catch (error) {
this.log(`💥 RSS XML parse error: ${error.message}`);
return null;
}
}

getXMLText(element, tagName) {
try {
const node = element.querySelector(tagName);
return node ? node.textContent.trim() : '';
} catch (error) {
return '';
}
}

// 複数RSS一括取得
async fetchAllRSSFeeds(rssFeeds) {
try {
this.log(`🔄 Starting bulk RSS fetch for ${rssFeeds.length} feeds`);
const allArticles = [];
const results = [];

const enabledFeeds = rssFeeds.filter(feed => feed.enabled);
this.log(`📊 Processing ${enabledFeeds.length} enabled feeds`);

for (const feed of enabledFeeds) {
try {
this.log(`\n📡 === Fetching: "${feed.name}" ===`);
const result = await this.fetchRSSWithFallback(feed.url);

results.push({
feedName: feed.name,
feedUrl: feed.url,
success: result.success,
articleCount: result.articles.length,
service: result.service || 'unknown',
responseTime: result.responseTime || 0,
fromCache: result.fromCache || false,
error: result.success ? null : result.fallbackMessage
});

if (result.success) {
result.articles.forEach(article => {
if (feed.category) {
article.category = feed.category;
}
article.feedName = feed.name;
article.feedUrl = feed.url;
});

allArticles.push(...result.articles);

const cacheNote = result.fromCache ? ' (from cache)' : '';
this.log(`✅ SUCCESS: ${result.articles.length} articles${cacheNote}`);
} else {
this.log(`❌ FAILED: ${result.fallbackMessage}`);
}
} catch (error) {
this.log(`💥 Exception for feed "${feed.name}": ${error.message}`);
results.push({
feedName: feed.name,
feedUrl: feed.url,
success: false,
articleCount: 0,
error: error.message
});
}

await new Promise(resolve => setTimeout(resolve, 1000));
}

const uniqueArticles = this.removeDuplicateArticles(allArticles);
const successCount = results.filter(r => r.success).length;
const cacheCount = results.filter(r => r.fromCache).length;

this.log(`\n📊 === BULK FETCH SUMMARY ===`);
this.log(`✅ Success: ${successCount}/${enabledFeeds.length} feeds`);
this.log(`📦 From cache: ${cacheCount} feeds`);
this.log(`📄 Total articles: ${uniqueArticles.length}`);

return uniqueArticles;
} catch (error) {
this.log(`💥 Bulk RSS fetch error: ${error.message}`);
return [];
}
}

removeDuplicateArticles(articles) {
const seen = new Set();
const unique = [];

articles.forEach(article => {
const key = `${article.url}_${article.title.substring(0, 50)}`;
if (!seen.has(key)) {
seen.add(key);
unique.push(article);
}
});

if (articles.length !== unique.length) {
this.log(`🔄 Removed ${articles.length - unique.length} duplicate articles`);
}

return unique;
}

// ユーティリティ関数群
async enforceRateLimit() {
const now = Date.now();
const timeSinceLastRequest = now - this.lastRequestTime;

if (timeSinceLastRequest < this.rateLimitDelay) {
const waitTime = this.rateLimitDelay - timeSinceLastRequest;
await new Promise(resolve => setTimeout(resolve, waitTime));
}

this.lastRequestTime = Date.now();
}

simpleHash(str) {
let hash = 0;
for (let i = 0; i < str.length; i++) {
const char = str.charCodeAt(i);
hash = ((hash << 5) - hash) + char;
hash = hash & hash;
}
return Math.abs(hash);
}

extractDomain(url) {
try {
const urlObj = new URL(url);
return urlObj.hostname.replace('www.', '');
} catch (error) {
return 'unknown-domain';
}
}

parseDate(dateString) {
try {
if (!dateString) return new Date().toISOString();
const date = new Date(dateString);
return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
} catch (error) {
return new Date().toISOString();
}
}

sanitizeText(text) {
if (!text) return '';

const withoutTags = text.replace(/<[^>]*>/g, '');
const textarea = document.createElement('textarea');
textarea.innerHTML = withoutTags;
const decoded = textarea.value;

return decoded.replace(/\s+/g, ' ').trim().substring(0, 500);
}

inferCategory(article, sourceUrl) {
try {
const domain = this.extractDomain(sourceUrl);

const domainCategories = {
'nhk.or.jp': 'ニュース',
'nikkei.com': '経済',
'itmedia.co.jp': 'テクノロジー',
'techcrunch.com': 'テクノロジー',
'gigazine.net': 'テクノロジー',
'reuters.com': 'ニュース',
'bbc.com': 'ニュース',
'cnn.com': 'ニュース',
'asahi.com': 'ニュース',
'mainichi.jp': 'ニュース',
'yomiuri.co.jp': 'ニュース'
};

for (const [domainPattern, category] of Object.entries(domainCategories)) {
if (domain.includes(domainPattern)) {
return category;
}
}

return 'その他';
} catch (error) {
return 'その他';
}
}

createErrorArticle(rawArticle, sourceUrl, errorMessage) {
return {
articleId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
title: '記事解析エラー',
excerpt: `記事データの解析中にエラーが発生しました: ${errorMessage}`,
url: rawArticle.link || rawArticle.url || sourceUrl,
domain: this.extractDomain(sourceUrl),
publishDate: new Date().toISOString(),
category: 'エラー',
readStatus: 'read',
favorited: false,
interestScore: 0,
matchedKeywords: [],
feedbackHistory: [],
addedDate: new Date().toISOString(),
sourceUrl: sourceUrl,
isError: true
// 【削除】ngDomain: false を削除
};
}

getServiceStatsReport() {
const report = {};
this.serviceStats.forEach((stats, serviceName) => {
report[serviceName] = {
successRate: stats.attempts > 0 ?
Math.round((stats.successes / stats.attempts) * 100) : 0,
attempts: stats.attempts,
successes: stats.successes,
avgResponseTime: Math.round(stats.avgResponseTime),
lastSuccess: stats.lastSuccess,
lastError: stats.lastError
};
});
return report;
}

log(message) {
if (this.debugMode) {
console.log(`[RSSFetcher] ${message}`);
}
}

clearCache() {
this.cache.clear();
this.log('📦 RSS cache cleared');
}

setDebugMode(enabled) {
this.debugMode = enabled;
this.log(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
}

async testRSSFeed(url) {
try {
this.log(`🧪 Testing RSS feed: ${url}`);
const result = await this.fetchRSSWithFallback(url);

return {
success: result.success,
url: url,
articleCount: result.articles.length,
service: result.service,
responseTime: result.responseTime,
totalTime: result.totalTime,
sampleArticle: result.articles[0] || null,
errors: result.errors || [],
serviceStats: result.serviceStats,
fromCache: result.fromCache || false,
message: result.success ?
`✅ 取得成功: ${result.articles.length}件の記事 (${result.service}, ${result.totalTime}ms)` :
`❌ 取得失敗: ${result.fallbackMessage}`
};
} catch (error) {
this.log(`💥 RSS test error: ${error.message}`);
return {
success: false,
url: url,
articleCount: 0,
service: 'none',
responseTime: 0,
totalTime: 0,
sampleArticle: null,
errors: [{ error: error.message }],
serviceStats: this.getServiceStatsReport(),
message: `💥 テストエラー: ${error.message}`
};
}
}
}
