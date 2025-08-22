#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json
import yake
import MeCab

def preprocess_japanese_text(text):
    """日本語テキストの前処理（分かち書き）"""
    try:
        # MeCabで分かち書き
        mecab = MeCab.Tagger("-Owakati")
        wakati_text = mecab.parse(text).strip()
        return wakati_text
    except Exception as e:
        # MeCabが利用できない場合はそのまま返す
        print(f"MeCab処理エラー: {e}", file=sys.stderr)
        return text

def extract_keywords_with_yake(text, top_k=3):
    """YAKE!を使用してキーワード抽出"""
    try:
        # デバッグ用出力
        print(f"入力テキスト: {text[:100]}...", file=sys.stderr)
        
        # 日本語用に前処理
        processed_text = preprocess_japanese_text(text)
        print(f"前処理後テキスト: {processed_text[:100]}...", file=sys.stderr)
        
        # YAKE!設定
        kw_extractor = yake.KeywordExtractor(
            lan="ja",           # 日本語設定
            n=3,               # 最大3-gram
            dedupLim=0.7,      # 重複除去閾値  
            top=top_k          # 上位K個
        )
        
        # キーワード抽出実行
        keywords = kw_extractor.extract_keywords(processed_text)
        print(f"YAKE!抽出結果: {keywords}", file=sys.stderr)
        
        # YAKE!は(score, keyword)のタプルを返すため、keywordのみ抽出
        result_keywords = []
        for score, keyword in keywords:
            result_keywords.append(keyword)
            print(f"キーワード: {keyword}, スコア: {score}", file=sys.stderr)
        
        return result_keywords
        
    except Exception as e:
        print(f"YAKE!処理エラー: {e}", file=sys.stderr)
        return []

def main():
    try:
        # 標準入力からテキストを読み取り
        input_text = sys.stdin.read().strip()
        
        if not input_text:
            print(json.dumps({"keywords": []}))
            return
        
        print(f"受信テキスト長: {len(input_text)}", file=sys.stderr)
        
        # YAKE!でキーワード抽出
        keywords = extract_keywords_with_yake(input_text, top_k=3)
        
        print(f"最終キーワード: {keywords}", file=sys.stderr)
        
        # JSON形式で出力
        result = {"keywords": keywords}
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(f"メイン処理エラー: {e}", file=sys.stderr)
        print(json.dumps({"keywords": [], "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
