// イベントデータを保存するためのグローバル変数
let eventDataList = [];
// タブの情報を一時的に保存するためのマップ
let tabInfoMap = new Map();
// タブ作成の重複防止用
let recentTabCreations = new Map(); // URL -> timestamp のマップ
// 記録時のタブ制限管理
let initialTabIds = new Set(); // 記録開始時の既存タブID
let isRecordingMode = false; // 記録モードフラグ

chrome.action.onClicked.addListener(() => {
    chrome.tabs.create({ url: "popup.html" });
});

// タブが作成された時に情報を保存
chrome.tabs.onCreated.addListener((tab) => {
    const currentTime = Date.now();
    const tabUrl = tab.url || 'unknown';
    
    // 同一URLのタブが1秒以内に作成された場合は重複として検出（ログのみ）
    if (recentTabCreations.has(tabUrl)) {
        const lastCreationTime = recentTabCreations.get(tabUrl);
        if (currentTime - lastCreationTime < 1000) {
            console.warn(`[DEBUG] 重複タブ作成を検出: ${tabUrl} (前回作成から${currentTime - lastCreationTime}ms)`);
            // タブは閉じずに、ログのみで重複を記録
        }
    }
    
    // タブ作成時刻を記録
    recentTabCreations.set(tabUrl, currentTime);
    
    // 古いエントリを清理（5秒以上前のものを削除）
    setTimeout(() => {
        recentTabCreations.delete(tabUrl);
    }, 5000);
    
    tabInfoMap.set(tab.id, {
        url: tab.url,
        title: tab.title
    });
    console.log(`[DEBUG] 新しいタブが作成されました: tabId=${tab.id}, url=${tab.url}`);
    
    // playback-handlerに新しいタブ作成を通知
    chrome.runtime.sendMessage({
        type: 'new-tab-created',
        tabId: tab.id,
        url: tab.url
    }).catch(() => {
        // popup.htmlが開いていない場合はエラーが発生するが、問題ない
    });
});

// タブが更新された時に情報を更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title) {
        tabInfoMap.set(tabId, {
            url: tab.url,
            title: tab.title
        });
        console.log(`[DEBUG] タブ情報を更新: tabId=${tabId}, url=${tab.url}`);
        
        // URLが変更された場合、playback-handlerに通知（自動マッピング用）
        if (changeInfo.url && tab.url && tab.url.trim() !== '') {
            chrome.runtime.sendMessage({
                type: 'tab-url-updated',
                tabId: tabId,
                url: tab.url
            }).catch(() => {
                // popup.htmlが開いていない場合はエラーが発生するが、問題ない
            });
        }
    }
});

// 代替手段: タブ存在チェック機能を追加
function checkTabExists(tabId) {
    return new Promise((resolve) => {
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                resolve(false); // タブが存在しない
            } else {
                resolve(true); // タブが存在する
            }
        });
    });
}

// タブ削除を手動で検出する機能
let tabCheckInterval = null;
function startTabMonitoring() {
    if (tabCheckInterval) return;
    
    console.log('[DEBUG] タブ監視開始');
    tabCheckInterval = setInterval(async () => {
        // tabInfoMapに記録されているタブが実際に存在するかチェック
        for (const [tabId, tabInfo] of tabInfoMap.entries()) {
            const exists = await checkTabExists(tabId);
            if (!exists) {
                console.log(`手動タブ削除検出: tabId=${tabId}`);
                handleTabRemoval(tabId, { isWindowClosing: false, windowId: null });
            }
        }
    }, 1000); // 1秒ごとにチェック
}

// タブ削除処理を共通化
function handleTabRemoval(tabId, removeInfo) {
    console.log(`[DEBUG] タブ削除処理開始: tabId=${tabId}`, removeInfo);
    
    // 保存していたタブ情報を取得
    const savedTabInfo = tabInfoMap.get(tabId) || { url: 'unknown', title: 'unknown' };
    
    // 削除されたタブの情報を記録
    const tabCloseEvent = {
        type: 'tab-close-event',
        detail: {
            type: 'tab-close',
            tabId: tabId,
            windowId: removeInfo.windowId,
            isWindowClosing: removeInfo.isWindowClosing,
            timestamp: new Date().toISOString(),
            currentURL: savedTabInfo.url,
            fullXPath: 'browser-tab-close-button',
            tagName: 'TAB',
            id: 'tab-close-button',
            text: `タブを閉じる: ${savedTabInfo.title}`,
            key: '',
            title: savedTabInfo.title
        }
    };
    
    // イベントデータを保存
    eventDataList.push(tabCloseEvent);
    console.log(`[DEBUG] タブ閉じるイベントを記録しました: tabId=${tabId}, url=${savedTabInfo.url}`);
    
    // playback-handlerに手動タブ閉じる完了を通知
    console.log(`[DEBUG] playback-handlerにタブ閉じる完了通知を送信: tabId=${tabId}, url=${savedTabInfo.url}`);
    chrome.runtime.sendMessage({
        type: 'manual-tab-close-completed',
        tabId: tabId,
        url: savedTabInfo.url
    }).then(() => {
        console.log(`[DEBUG] タブ閉じる完了通知送信成功: tabId=${tabId}`);
    }).catch((error) => {
        console.log(`[DEBUG] タブ閉じる完了通知送信失敗: ${error.message}`);
    });
    
    // マップからタブ情報を削除
    tabInfoMap.delete(tabId);
}

// タブが削除された時のイベントを監視
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    console.log(`タブ削除イベント発生: tabId=${tabId}`);
    handleTabRemoval(tabId, removeInfo);
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
    } else if (message.type === 'get-current-tab-id') {
        // content scriptから現在のタブIDを取得する要求
        if (sender.tab && sender.tab.id) {
            sendResponse({ tabId: sender.tab.id });
        } else {
            sendResponse({ tabId: null });
        }
        return true;
    } else if (message.type === 'get-event-data') {
        // popup.jsからイベントデータの要求があった場合
        sendResponse({ eventData: eventDataList });
        return true;
    } else if (message.type === 'clear-event-data') {
        // イベントデータをクリア
        eventDataList = [];
        sendResponse({ success: true });
        return true;
    } else if (message.type === 'set-initial-tabs') {
        // 記録開始時の既存タブIDを設定
        initialTabIds = new Set(message.initialTabIds);
        isRecordingMode = true;
        console.log('[DEBUG] 記録モード開始 - 既存タブID:', Array.from(initialTabIds));
        sendResponse({ success: true });
        return true;
    } else if (message.type === 'stop-recording') {
        // 記録停止
        isRecordingMode = false;
        initialTabIds.clear();
        console.log('[DEBUG] 記録モード停止');
        sendResponse({ success: true });
        return true;
    } else if (message.type === 'start-tab-monitoring') {
        // タブ監視開始要求
        startTabMonitoring();
        sendResponse({ success: true });
        return true;
    } else if (message.type === 'auto-close-tab') {
        // 自動タブ閉じる要求
        console.log(`[DEBUG] 自動タブ閉じる要求を受信:`, message);
        
        // 現在のタブを取得して閉じる
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const currentTabId = tabs[0].id;
                console.log(`[DEBUG] 現在のアクティブタブを閉じます: tabId=${currentTabId}`);
                
                chrome.tabs.remove(currentTabId, () => {
                    if (chrome.runtime.lastError) {
                        console.error(`[ERROR] タブ閉じる失敗:`, chrome.runtime.lastError.message);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        console.log(`[SUCCESS] タブを自動で閉じました: tabId=${currentTabId}`);
                        sendResponse({ success: true, tabId: currentTabId });
                    }
                });
            } else {
                console.warn('[WARNING] 閉じるべきアクティブタブが見つかりませんでした');
                sendResponse({ success: false, error: 'No active tab found' });
            }
        });
        return true; // 非同期応答を待つ
    } else if (message.type === 'execute-operations-in-new-tab') {
        // 直接ナビゲーションで開いたタブで操作を実行
        console.log(`[BACKGROUND] execute-operations-in-new-tab メッセージを受信:`, message);
        
        // アクティブなタブを取得
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length > 0) {
                const targetTabId = tabs[0].id;
                console.log(`[BACKGROUND] アクティブタブ ${targetTabId} に操作メッセージを送信`);
                
                // アクティブなタブにメッセージを送信
                chrome.tabs.sendMessage(targetTabId, {
                    type: 'execute-operations',
                    url: message.url,
                    operationData: message.operationData,
                    allOperationDataJSON: message.allOperationDataJSON
                });
            }
        });
        return true;
    } else {
        // イベントメッセージを処理
        const supportedEventTypes = [
            'click-event', 'dblclick-event', 'input-event', 'change-event',
            'keydownEnter-event', 'keydownTab-event', 'keydownBackspace-event',
            'keydownF1-event', 'keydownF2-event', 'keydownF3-event', 'keydownF4-event',
            'keydownF5-event', 'keydownF6-event', 'keydownF7-event', 'keydownF8-event',
            'keydownF9-event', 'keydownF10-event', 'keydownF11-event', 'keydownF12-event',
            'keydownPageUp-event', 'keydownPageDown-event', 'keydownHome-event', 'keydownEnd-event',
            'keydown-event', 'end-replayJson', 'tab-close-event'
        ];
        
        if (supportedEventTypes.includes(message.type)) {
            console.log(`イベントメッセージを受信: ${message.type}`, message.detail);
            
            // 記録モード中の場合、既存タブでの操作をチェック
            if (isRecordingMode && message.detail.tabId && initialTabIds.has(message.detail.tabId)) {
                console.warn(`[WARNING] 既存タブでの操作を検出: tabId=${message.detail.tabId}, type=${message.type}`);
                
                // content scriptにアラート表示指示を送信
                chrome.tabs.sendMessage(message.detail.tabId, {
                    type: 'show-existing-tab-warning',
                    eventType: message.type,
                    url: message.detail.currentURL
                }).catch((error) => {
                    console.log('[DEBUG] アラート送信失敗:', error.message);
                });
                
                // 既存タブでの操作は記録しない
                console.log('[DEBUG] 既存タブでの操作のため記録をスキップしました');
                return;
            }
            
            // イベントデータを保存
            eventDataList.push({
                type: message.type,
                detail: message.detail
            });
            
            console.log(`イベントデータを保存しました: ${message.type}. 現在の保存数: ${eventDataList.length}`);
        }
    }
});


