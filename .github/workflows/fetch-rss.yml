name: RSS記事取得

on:
  schedule:
    - cron: '0 * * * *'  # 1時間間隔で実行
  workflow_dispatch:     # 手動実行も可能

jobs:
  fetch-rss:
    runs-on: ubuntu-latest
    steps:
    - name: Checkout
      uses: actions/checkout@v4
      
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        
    - name: Install MeCab and dependencies
      run: |
        sudo apt update
        sudo apt install -y mecab libmecab-dev mecab-ipadic-utf8 git make curl xz-utils file
        git clone --depth 1 https://github.com/neologd/mecab-ipadic-neologd.git
        cd mecab-ipadic-neologd
        ./bin/install-mecab-ipadic-neologd -y -n -p /usr/lib/mecab/dic/mecab-ipadic-neologd
        
    - name: Install npm dependencies
      run: |
        cd .github/workflows
        npm install
        
    - name: RSS記事取得スクリプト実行
      run: node .github/workflows/fetch-rss.js
      
    - name: Commit and push
      run: |
        git config --local user.email "action@github.com"
        git config --local user.name "GitHub Action"
        git add mss/articles.json
        git diff --staged --quiet || git commit -m "Update RSS articles $(date)"
        git push
