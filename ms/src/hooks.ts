import { useState, useCallback, useEffect } from 'react';
import { Article, RSSFeed, LearningData, ViewMode } from './utils';
import { fetchRSS, parseRSSXML, tokenize } from './utils';

// ローカルストレージ型安全管理フック
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`LocalStorage読み込みエラー (${key}):`, error);
      return initialValue;
    }
  });

  const setStoredValue = useCallback((newValue: T | ((val: T) => T)) => {
    try {
      const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
      setValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`LocalStorage保存エラー (${key}):`, error);
    }
  }, [key, value]);

  return [value, setStoredValue] as const;
}

// 記事管理フック
export function useArticles() {
  const [articles, setArticles] = useLocalStorage<Article[]>('articles', []);

  const toggleReadStatus = useCallback((id: string, forceStatus?: 'read' | 'unread') => {
    setArticles(prevArticles => 
      prevArticles.map(article => 
        article.id === id 
          ? { ...article, readStatus: forceStatus || (article.readStatus === 'read' ? 'unread' : 'read') }
          : article
      )
    );
  }, [setArticles]);

  const toggleReadLater = useCallback((id: string) => {
    setArticles(prevArticles => 
      prevArticles.map(article => 
        article.id === id 
          ? { ...article, readLater: !article.readLater }
          : article
      )
    );
  }, [setArticles]);

  const addArticles = useCallback((newArticles: Article[]) => {
    setArticles(prevArticles => {
      const existingIds = new Set(prevArticles.map(a => a.id));
      const uniqueNewArticles = newArticles.filter(a => !existingIds.has(a.id));
      const combined = [...prevArticles, ...uniqueNewArticles];
      
      // 最大1000件制限
      return combined.slice(-1000);
    });
  }, [setArticles]);

  return {
    articles,
    toggleReadStatus,
    toggleReadLater,
    addArticles
  };
}

// AIスコアリングフック
export function useAIScoring() {
  const [learningData, setLearningData] = useLocalStorage<LearningData>('aiLearning', {
    wordWeights: {},
    categoryWeights: {}
  });

  const getPersonalizedScore = useCallback((article: Article): number => {
    let score = 0;
    
    // キーワードスコア
    article.keywords.forEach(keyword => {
      const weight = learningData.wordWeights[keyword] || 0;
      score += weight;
    });
    
    // カテゴリスコア
    const categoryWeight = learningData.categoryWeights[article.category] || 0;
    score += categoryWeight;
    
    // 基本スコア（日付新しい順）
    const daysSincePublish = (Date.now() - new Date(article.publishDate).getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 100 - daysSincePublish);
    
    return Math.round(score);
  }, [learningData]);

  const updateScore = useCallback((article: Article, rating: number) => {
    // 1星=-30, 2星=-15, 3星=0, 4星=+15, 5星=+30
    const scoreChange = (rating - 3) * 15;
    
    setLearningData(prevData => {
      const newWordWeights = { ...prevData.wordWeights };
      const newCategoryWeights = { ...prevData.categoryWeights };
      
      // キーワード重み更新
      article.keywords.forEach(keyword => {
        newWordWeights[keyword] = (newWordWeights[keyword] || 0) + scoreChange * 0.1;
      });
      
      // カテゴリ重み更新
      newCategoryWeights[article.category] = (newCategoryWeights[article.category] || 0) + scoreChange * 0.2;
      
      return {
        wordWeights: newWordWeights,
        categoryWeights: newCategoryWeights
      };
    });
  }, [setLearningData]);

  return {
    learningData,
    getPersonalizedScore,
    updateScore
  };
}

// RSS管理フック
export function useRSSManager() {
  const [rssFeeds, setRssFeeds] = useLocalStorage<RSSFeed[]>('rssFeeds', []);
  const { addArticles } = useArticles();

  const addRSS = useCallback(async (url: string) => {
    try {
      const xmlContent = await fetchRSS(url);
      const articles = parseRSSXML(xmlContent);
      
      const newFeed: RSSFeed = {
        id: `feed-${Date.now()}`,
        url,
        title: `RSS Feed ${rssFeeds.length + 1}`,
        lastUpdated: new Date().toISOString()
      };
      
      setRssFeeds(prev => [...prev, newFeed]);
      addArticles(articles);
      
      return true;
    } catch (error) {
      console.error('RSS追加エラー:', error);
      throw error;
    }
  }, [rssFeeds, setRssFeeds, addArticles]);

  const removeRSS = useCallback((id: string) => {
    setRssFeeds(prev => prev.filter(feed => feed.id !== id));
  }, [setRssFeeds]);

  const updateAllRSS = useCallback(async () => {
    const updatePromises = rssFeeds.map(async (feed) => {
      try {
        const xmlContent = await fetchRSS(feed.url);
        const articles = parseRSSXML(xmlContent);
        addArticles(articles);
        
        return {
          ...feed,
          lastUpdated: new Date().toISOString()
        };
      } catch (error) {
        console.error(`RSS更新エラー (${feed.url}):`, error);
        return feed;
      }
    });
    
    const updatedFeeds = await Promise.all(updatePromises);
    setRssFeeds(updatedFeeds);
  }, [rssFeeds, setRssFeeds, addArticles]);

  return {
    rssFeeds,
    addRSS,
    removeRSS,
    updateAllRSS
  };
}

// ワード管理フック
export function useWordManager() {
  const [wordFilters, setWordFilters] = useLocalStorage('wordFilters', {
    interestedWords: [] as string[],
    ngWords: [] as string[]
  });

  const addInterestedWord = useCallback((word: string) => {
    if (word.trim()) {
      setWordFilters(prev => ({
        ...prev,
        interestedWords: [...prev.interestedWords, word.trim()]
      }));
    }
  }, [setWordFilters]);

  const addNGWord = useCallback((word: string) => {
    if (word.trim()) {
      setWordFilters(prev => ({
        ...prev,
        ngWords: [...prev.ngWords, word.trim()]
      }));
    }
  }, [setWordFilters]);

  const removeInterestedWord = useCallback((index: number) => {
    setWordFilters(prev => ({
      ...prev,
      interestedWords: prev.interestedWords.filter((_, i) => i !== index)
    }));
  }, [setWordFilters]);

  const removeNGWord = useCallback((index: number) => {
    setWordFilters(prev => ({
      ...prev,
      ngWords: prev.ngWords.filter((_, i) => i !== index)
    }));
  }, [setWordFilters]);

  return {
    wordFilters,
    addInterestedWord,
    addNGWord,
    removeInterestedWord,
    removeNGWord
  };
}
