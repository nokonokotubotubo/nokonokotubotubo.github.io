chrome.action.onClicked.addListener(() => {
  const targetUrl = chrome.runtime.getURL('index.html');

  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(tab => tab.url === targetUrl);

    if (existingTab) {
      // 既存のタブがあれば、そのタブをアクティブにしてウィンドウを前面に表示
      chrome.tabs.update(existingTab.id, { active: true });
      chrome.windows.update(existingTab.windowId, { focused: true });

      // バッジを表示して通知
      chrome.action.setBadgeText({ text: 'OPEN' });
      chrome.action.setBadgeBackgroundColor({ color: '#4A90E2' });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 3000); // 3秒後にバッジを消す

    } else {
      // 既存のタブがなければ、新しいタブを作成
      chrome.tabs.create({ url: targetUrl });
    }
  });
});