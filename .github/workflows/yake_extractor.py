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
        return text

def extract_keywords_with_yake(text, top_k=3):
    """YAKE!を使用してキーワード抽出"""
    try:
        # 日本語用に前処理
        processed_text = preprocess_japanese_text(text)
        
        # YAKE!設定
        kw_extractor = yake.KeywordExtractor(
            lan="ja",           # 日本語設定
            n=3,               # 最大3-gram
            dedupLim=0.7,      # 重複除去閾値
            top=top_k          # 上位K個
        )
        
        # キーワード抽出実行
        keywords = kw_extractor.extract_keywords(processed_text)
        
        # スコア順（低いほど重要）にソートされているので、キーワードのみ抽出
        result_keywords = [kw[1] for kw in keywords]
        
        return result_keywords
        
    except Exception as e:
        return []

def main():
    try:
        # 標準入力からテキストを読み取り
        input_text = sys.stdin.read().strip()
        
        if not input_text:
            print(json.dumps({"keywords": []}))
            return
        
        # YAKE!でキーワード抽出
        keywords = extract_keywords_with_yake(input_text, top_k=3)
        
        # JSON形式で出力
        result = {"keywords": keywords}
        print(json.dumps(result, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"keywords": [], "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
