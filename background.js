chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "popup.html" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'get-current-tab') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const tabInfo = {
                    id: tabs[0].id,
                    url: tabs[0].url,
                    title: tabs[0].title,
                };
                sendResponse(tabInfo);
            }
        });
        // 非同期応答を待つために true を返す
        return true;
    }
});


