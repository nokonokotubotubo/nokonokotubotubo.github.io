#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json

def main():
    try:
        # 標準入力からテキストを読み取り
        input_text = sys.stdin.read().strip()
        
        if not input_text:
            print(json.dumps({"keywords": []}))
            return
        
        # YAKE!でキーワード抽出
        keywords = extract_keywords_with_yake(input_text)
        
        # JSON形式で出力
        result = {"keywords": keywords}
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"keywords": [], "error": str(e)}))
        sys.exit(1)

def extract_keywords_with_yake(text, top_k=3):
    """YAKE!を使用してキーワード抽出"""
    try:
        import yake
        
        # YAKE!設定
        kw_extractor = yake.KeywordExtractor(
            lan="ja",
            n=3,
            dedupLim=0.7,
            top=top_k
        )
        
        # キーワード抽出実行
        keywords_with_scores = kw_extractor.extract_keywords(text)
        
        # 【重要】キーワード文字列のみを抽出
        keywords = []
        for score, keyword in keywords_with_scores:
            keywords.append(keyword)
        
        return keywords
        
    except ImportError:
        # YAKE!が利用できない場合の代替処理
        return extract_simple_keywords(text, top_k)
    except Exception as e:
        return []

def extract_simple_keywords(text, top_k=3):
    """代替キーワード抽出（単語頻度ベース）"""
    try:
        import re
        from collections import Counter
        
        # 日本語・英数字のみ抽出
        words = re.findall(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9]+', text)
        
        # 2文字以上の単語のみ
        valid_words = [word for word in words if len(word) >= 2]
        
        # 頻度カウント
        word_freq = Counter(valid_words)
        
        # 上位キーワードを取得
        top_keywords = [word for word, freq in word_freq.most_common(top_k)]
        
        return top_keywords
        
    except Exception:
        return ["キーワード", "抽出", "エラー"]

if __name__ == "__main__":
    main()
