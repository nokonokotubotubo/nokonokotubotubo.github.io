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
        
        # デバッグ情報は標準エラーに出力
        print(f"入力テキスト長: {len(input_text)}", file=sys.stderr)
        
        # YAKE!でキーワード抽出
        keywords = extract_keywords_with_yake(input_text)
        
        # デバッグ情報
        print(f"抽出キーワード: {keywords}", file=sys.stderr)
        
        # 【重要】標準出力にはJSON文字列のみ出力
        result = {"keywords": keywords}
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(f"エラー: {e}", file=sys.stderr)
        print(json.dumps({"keywords": []}))
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
        
        # デバッグ情報（標準エラー）
        print(f"YAKE!結果（スコア付き）: {keywords_with_scores}", file=sys.stderr)
        
        # 【重要修正】キーワード文字列のみを正確に抽出
        keywords = []
        for score, keyword in keywords_with_scores:
            print(f"スコア: {score}, キーワード: {keyword}", file=sys.stderr)
            keywords.append(keyword)  # キーワード文字列のみ追加
        
        print(f"最終キーワードリスト: {keywords}", file=sys.stderr)
        return keywords
        
    except ImportError as e:
        print(f"YAKE!インポートエラー: {e}", file=sys.stderr)
        return extract_simple_keywords(text, top_k)
    except Exception as e:
        print(f"YAKE!処理エラー: {e}", file=sys.stderr)
        return extract_simple_keywords(text, top_k)

def extract_simple_keywords(text, top_k=3):
    """代替キーワード抽出（単語頻度ベース）"""
    try:
        import re
        from collections import Counter
        
        print("代替キーワード抽出を実行", file=sys.stderr)
        
        # 日本語・英数字のみ抽出
        words = re.findall(r'[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBFa-zA-Z0-9]+', text)
        
        # 2文字以上の単語のみ
        valid_words = [word for word in words if len(word) >= 2]
        
        # 頻度カウント
        word_freq = Counter(valid_words)
        
        # 上位キーワードを取得
        top_keywords = [word for word, freq in word_freq.most_common(top_k)]
        
        print(f"代替キーワード: {top_keywords}", file=sys.stderr)
        return top_keywords
        
    except Exception as e:
        print(f"代替処理エラー: {e}", file=sys.stderr)
        return ["キーワード", "抽出", "エラー"]

if __name__ == "__main__":
    main()
