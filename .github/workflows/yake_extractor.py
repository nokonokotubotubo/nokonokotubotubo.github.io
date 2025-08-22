#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
import json

def main():
    try:
        input_text = sys.stdin.read().strip()
        
        if not input_text:
            print(json.dumps({"keywords": []}))
            return
        
        print(f"[DEBUG] 入力テキスト長: {len(input_text)}", file=sys.stderr)
        print(f"[DEBUG] 入力テキスト: {input_text[:200]}...", file=sys.stderr)
        
        import yake
        
        kw_extractor = yake.KeywordExtractor(
            lan="ja",
            n=3,
            dedupLim=0.7,
            top=3
        )
        
        raw_result = kw_extractor.extract_keywords(input_text)
        
        print(f"[DEBUG] YAKE戻り値型: {type(raw_result)}", file=sys.stderr)
        print(f"[DEBUG] YAKE戻り値長: {len(raw_result) if hasattr(raw_result, '__len__') else 'N/A'}", file=sys.stderr)
        print(f"[DEBUG] YAKE戻り値内容: {raw_result}", file=sys.stderr)
        
        keywords = []
        for i, item in enumerate(raw_result):
            print(f"[DEBUG] 項目{i}: 型={type(item)}, 値={item}", file=sys.stderr)
            
            if isinstance(item, (list, tuple)) and len(item) >= 2:
                # (score, keyword) または (keyword, score) の判定
                first, second = item[0], item[1]
                print(f"[DEBUG]   first型={type(first)}, 値={first}", file=sys.stderr)
                print(f"[DEBUG]   second型={type(second)}, 値={second}", file=sys.stderr)
                
                if isinstance(first, (int, float)) and isinstance(second, str):
                    # (score, keyword) パターン
                    keywords.append(second)
                    print(f"[DEBUG]   → キーワード抽出: '{second}' (score, keyword)", file=sys.stderr)
                elif isinstance(first, str) and isinstance(second, (int, float)):
                    # (keyword, score) パターン
                    keywords.append(first)
                    print(f"[DEBUG]   → キーワード抽出: '{first}' (keyword, score)", file=sys.stderr)
                elif isinstance(first, str):
                    # 最初が文字列なら採用
                    keywords.append(first)
                    print(f"[DEBUG]   → キーワード抽出: '{first}' (first string)", file=sys.stderr)
                elif isinstance(second, str):
                    # 2番目が文字列なら採用
                    keywords.append(second)
                    print(f"[DEBUG]   → キーワード抽出: '{second}' (second string)", file=sys.stderr)
                else:
                    print(f"[DEBUG]   → スキップ: 文字列なし", file=sys.stderr)
            elif isinstance(item, str):
                keywords.append(item)
                print(f"[DEBUG]   → キーワード抽出: '{item}' (直接文字列)", file=sys.stderr)
            else:
                print(f"[DEBUG]   → スキップ: 不明形式", file=sys.stderr)
        
        print(f"[DEBUG] 最終キーワードリスト: {keywords}", file=sys.stderr)
        
        # 空文字列や重複を除去
        final_keywords = []
        for kw in keywords:
            if kw and kw.strip() and kw not in final_keywords:
                final_keywords.append(kw.strip())
        
        print(f"[DEBUG] 清浄化後キーワード: {final_keywords}", file=sys.stderr)
        
        result = {"keywords": final_keywords[:3]}  # 上位3件
        output = json.dumps(result, ensure_ascii=False)
        print(f"[DEBUG] JSON出力: {output}", file=sys.stderr)
        print(output)
        
    except ImportError as e:
        print(f"[ERROR] YAKE import失敗: {e}", file=sys.stderr)
        print(json.dumps({"keywords": [], "error": f"YAKE import failed: {e}"}))
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] 予期しないエラー: {e}", file=sys.stderr)
        print(f"[ERROR] エラー型: {type(e)}", file=sys.stderr)
        import traceback
        print(f"[ERROR] スタック: {traceback.format_exc()}", file=sys.stderr)
        print(json.dumps({"keywords": [], "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
