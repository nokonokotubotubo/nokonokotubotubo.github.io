// 型定義
export interface Article {
  id: string;
  title: string;
  url: string;
  content: string;
  publishDate: string;
  rssSource: string;
  category: string;
  readStatus: 'read' | 'unread';
  readLater: boolean;
  userRating: number;
  keywords: string[];
}

export interface RSSFeed {
  id: string;
  url: string;
  title: string;
  lastUpdated: string;
}

export interface LearningData {
  wordWeights: Record<string, number>;
  categoryWeights: Record<string, number>;
}

export type ViewMode = 'all' | 'unread' | 'read' | 'readLater';

// ユーティリティ関数
export async function fetchRSS(url: string): Promise<string> {
  try {
    // プロキシ経由での取得を想定
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl);
    const text = await response.text();
    return text;
  } catch (error) {
    throw new Error(`RSS取得エラー: ${error}`);
  }
}

export function parseRSSXML(xmlString: string): Article[] {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
    const items = xmlDoc.querySelectorAll('item');
    
    const articles: Article[] = [];
    items.forEach((item, index) => {
      const title = item.querySelector('title')?.textContent || '';
      const url = item.querySelector('link')?.textContent || '';
      const content = item.querySelector('description')?.textContent || '';
      const publishDate = item.querySelector('pubDate')?.textContent || new Date().toISOString();
      
      articles.push({
        id: `article-${Date.now()}-${index}`,
        title,
        url,
        content,
        publishDate,
        rssSource: 'RSS Feed',
        category: 'general',
        readStatus: 'unread',
        readLater: false,
        userRating: 0,
        keywords: tokenize(title + ' ' + content)
      });
    });
    
    return articles;
  } catch (error) {
    throw new Error(`RSS解析エラー: ${error}`);
  }
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 2);
}
