#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import traceback

def main():
    try:
        # 必要なライブラリのインポートテスト
        try:
            import yake
            print("YAKE!ライブラリインポート成功", file=sys.stderr)
        except ImportError as e:
            print(f"YAKE!ライブラリインポートエラー: {e}", file=sys.stderr)
            print(json.dumps({"keywords": [], "error": "YAKE library not found"}))
            return

        try:
            import MeCab
            print("MeCabライブラリインポート成功", file=sys.stderr)
        except ImportError as e:
            print(f"MeCabライブラリインポートエラー: {e}", file=sys.stderr)
            # MeCabなしでも続行
        
        # 標準入力からテキストを読み取り
        input_text = sys.stdin.read().strip()
        print(f"受信テキスト長: {len(input_text)}", file=sys.stderr)
        
        if not input_text:
            print(json.dumps({"keywords": []}))
            return
        
        # 簡単なキーワード抽出（YAKE!の代替処理）
        keywords = extract_simple_keywords(input_text)
        print(f"抽出キーワード: {keywords}", file=sys.stderr)
        
        # JSON形式で出力
        result = {"keywords": keywords}
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(f"メイン処理エラー: {e}", file=sys.stderr)
        print(f"スタックトレース: {traceback.format_exc()}", file=sys.stderr)
        print(json.dumps({"keywords": [], "error": str(e)}))
        sys.exit(1)

def extract_simple_keywords(text, top_k=3):
    """簡易キーワード抽出（YAKE!の代替）"""
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
        print(f"YAKE!結果（スコア付き）: {keywords_with_scores}", file=sys.stderr)
        
        # キーワードのみを抽出
        keywords = [keyword for score, keyword in keywords_with_scores]
        print(f"キーワードのみ: {keywords}", file=sys.stderr)
        
        return keywords
        
    except Exception as e:
        print(f"YAKE!処理エラー: {e}", file=sys.stderr)
        # YAKE!が失敗した場合の代替処理
        return extract_fallback_keywords(text, top_k)

def extract_fallback_keywords(text, top_k=3):
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
        
        print(f"代替キーワード: {top_keywords}", file=sys.stderr)
        return top_keywords
        
    except Exception as e:
        print(f"代替処理エラー: {e}", file=sys.stderr)
        return ["キーワード", "抽出", "エラー"]

if __name__ == "__main__":
    main()
