// playback-handler.js - 再生処理用モジュール

class PlaybackHandler {
    constructor() {
        this.tabIdMapping = new Map(); // 記録時tabID → 再生時物理tabID のマッピング
        this.currentActiveTab = null; // 現在アクティブなタブの物理ID
        this.messageListenerRegistered = false; // メッセージリスナーの重複登録を防ぐフラグ
        this.urlsNum = 0; // 現在処理中のURLインデックス
        this.processedGroups = new Set(); // 処理済みグループのトラッキング
        this.currentlyProcessingGroup = null; // 現在処理中のグループ
    }

    //-----------------------------------------------------------------------------
    // 再生を開始
    //-----------------------------------------------------------------------------
    startPlayback(file) {
        if (!file) {
            alert('ファイルが選択されていません。');
            return;
        }

        this.readFile(file, (jsonData) => {
            if (jsonData.operationHistoryByURL && typeof jsonData.operationHistoryByURL === "object") {
                // operationHistoryByURLから最初のキーと対応する配列を取得
                const urls = Object.keys(jsonData.operationHistoryByURL);
                if (urls.length > 0) {
                    const firstUrl = urls[0];
                    const firstOperationHistory = jsonData.operationHistoryByURL[firstUrl];

                    // openAndProcessTabに最初のURLとその操作履歴を連携
                    if (firstOperationHistory && Array.isArray(firstOperationHistory)) {
                        const operationData = firstOperationHistory.map((item, index) => ({
                            fullXPath: item.fullXPath,
                            type: item.type,
                            inputValue: item.inputValue,
                            key: item.key,
                            tagName: item.tagName,
                            text: item.text, // textデータを追加
                            eventPhase: item.eventPhase, // eventPhase情報を追加
                            delayTime: item.delayTime || (index === 0 ? 1000 : 100) // 既存JSONのフォールバック
                        }));
                        const urls2 = firstOperationHistory.map(item => item.currentURL);
                        const firstRecordedTabId = firstOperationHistory[0]?.tabId;
                        console.log(`初回タブ作成: URL=${urls2[0]}, 記録時TabID=${firstRecordedTabId}`);
                        
                        // マッピングと状態をクリア
                        this.tabIdMapping.clear();
                        this.currentActiveTab = null;
                        this.messageListenerRegistered = false; // リスナー登録フラグをリセット
                        this.urlsNum = 0; // URLカウンターをリセット
                        this.processedGroups.clear(); // 処理済みグループをクリア
                        this.currentlyProcessingGroup = null; // 処理中グループをリセット
                        
                        // 最初のグループ名を設定
                        const firstGroupKey = urls[0];
                        this.currentlyProcessingGroup = firstGroupKey;
                        console.log(`[DEBUG] 初回グループ処理開始: ${firstGroupKey}`);
                        
                        this.openAndProcessTab(urls2[0], operationData, firstRecordedTabId, jsonData);

                        // メッセージリスナーを登録しておく（重複登録を防ぐ）
                        if (!this.messageListenerRegistered) {
                            this.messageListenerRegistered = true;
                            console.log('[DEBUG] メッセージリスナーを登録します');
                            
                            // タブ監視を開始
                            chrome.runtime.sendMessage({ type: 'start-tab-monitoring' }, (response) => {
                                console.log('[DEBUG] タブ監視開始要求送信:', response);
                            });
                            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                                if (message.type === 'new-tab-created') {
                                    // 新しいタブが作成された時の自動マッピング処理
                                    this.handleNewTabCreated(message.tabId, message.url, jsonData);
                                } else if (message.type === 'tab-url-updated') {
                                    // タブのURLが更新された時の自動マッピング処理
                                    this.handleNewTabCreated(message.tabId, message.url, jsonData);
                                } else if (message.type === 'manual-tab-close-completed') {
                                    // 手動タブ閉じる完了時の処理
                                    this.handleManualTabCloseCompleted(message.tabId, message.url, jsonData);
                                } else if (message.type === 'end-replayJson') {
                                    console.log(`[DEBUG] end-replayJsonメッセージを受信: ${message.type}`, message.detail);
                                    
                                    // 送信者のタブID情報を含む詳細な情報をログ出力
                                    if (message.detail && message.detail.sourceTabId) {
                                        console.log(`[DEBUG] メッセージ送信者TabID: ${message.detail.sourceTabId}, URL: ${message.detail.processedUrl}`);
                                    }
                                    
                                    // 現在処理中のグループが完了したことをマーク
                                    if (this.currentlyProcessingGroup) {
                                        this.processedGroups.add(this.currentlyProcessingGroup);
                                        console.log(`[DEBUG] グループ処理完了: ${this.currentlyProcessingGroup}`);
                                        this.currentlyProcessingGroup = null;
                                    }

                                    if (urls.length > 1) {
                                        this.urlsNum = this.urlsNum + 1;
                                        if (urls.length > this.urlsNum) {
                                            const nextUrl = urls[this.urlsNum];
                                            
                                            // 重複実行チェック
                                            if (this.processedGroups.has(nextUrl)) {
                                                console.log(`[DEBUG] グループ ${nextUrl} は既に処理済みのためスキップ`);
                                                return;
                                            }
                                            
                                            // 現在処理中グループとして設定
                                            this.currentlyProcessingGroup = nextUrl;
                                            console.log(`[DEBUG] 次のグループ処理開始: ${nextUrl}`);
                                            const nextOperationData = jsonData.operationHistoryByURL[nextUrl].map((item, index) => ({
                                                fullXPath: item.fullXPath,
                                                type: item.type,
                                                inputValue: item.inputValue,
                                                key: item.key,
                                                tagName: item.tagName,
                                                text: item.text, // textデータを追加
                                                eventPhase: item.eventPhase, // eventPhase情報を追加
                                                delayTime: item.delayTime || (index === 0 ? 1000 : 100)
                                            }));
                                            const nextUrlValue = jsonData.operationHistoryByURL[nextUrl].map(item => item.currentURL)[0];
                                            
                                            // 次のグループの記録時tabIdを取得
                                            const nextRecordedTabId = jsonData.operationHistoryByURL[nextUrl][0]?.tabId;
                                            console.log(`次のグループ処理: URL=${nextUrlValue}, 記録時TabID=${nextRecordedTabId}`);
                                            
                                            if (nextRecordedTabId) {
                                                // 記録時tabIdが既存のマッピングに存在するかチェック
                                                const physicalTabId = this.tabIdMapping.get(nextRecordedTabId);
                                                
                                                if (physicalTabId) {
                                                    console.log(`マッピング発見: 記録時TabID=${nextRecordedTabId} → 物理TabID=${physicalTabId}`);
                                                    // 物理タブが存在するかチェック
                                                    chrome.tabs.get(physicalTabId, (tab) => {
                                                        if (chrome.runtime.lastError || !tab) {
                                                            console.log(`物理TabID ${physicalTabId} が見つからないため、新しいタブを作成します`);
                                                            this.openAndProcessTab(nextUrlValue, nextOperationData, nextRecordedTabId, jsonData);
                                                        } else {
                                                            console.log(`既存の物理TabID ${physicalTabId} に切り替えて操作を実行します`);
                                                            this.currentActiveTab = physicalTabId;
                                                            // 既存のタブに切り替えて操作を実行
                                                            chrome.tabs.update(physicalTabId, { active: true }, () => {
                                                                setTimeout(() => {
                                                                    chrome.tabs.sendMessage(physicalTabId, {
                                                                        type: 'execute-operations',
                                                                        url: nextUrlValue,
                                                                        operationData: nextOperationData,
                                                                        allOperationDataJSON: JSON.stringify(jsonData)
                                                                    }, (response) => {
                                                                        if (chrome.runtime.lastError) {
                                                                            console.error(`[ERROR] 既存タブ${physicalTabId}へのメッセージ送信失敗:`, chrome.runtime.lastError.message);
                                                                        } else {
                                                                            console.log(`[SUCCESS] 既存タブ${physicalTabId}へのメッセージ送信成功`);
                                                                        }
                                                                    });
                                                                    console.log(`既存タブにメッセージを送信しました:`, nextOperationData);
                                                                }, 500);
                                                            });
                                                        }
                                                    });
                                                } else {
                                                    console.log(`記録時TabID ${nextRecordedTabId} のマッピングが見つからないため、新しいタブを作成します`);
                                                    // マッピングが存在しない場合は新しいタブを作成
                                                    this.openAndProcessTab(nextUrlValue, nextOperationData, nextRecordedTabId, jsonData);
                                                }
                                            } else {
                                                console.warn('次のグループの記録時tabIdが取得できませんでした');
                                            }
                                        }
                                    }
                                }
                            });
                        } else {
                            console.log('[DEBUG] メッセージリスナーは既に登録済みです');
                        }

                        // UIを更新してデータを表示
                        if (window.uiHandler) {
                            window.uiHandler.updateEventDataFromPlayback(Object.values(jsonData.operationHistoryByURL).flat());
                        }

                    } else {
                        console.warn('最初のURLに対応する操作履歴が不正です。');
                    }
                } else {
                    console.warn('operationHistoryByURLが空です。');
                }
            } else {
                console.warn('JSONにoperationHistoryByURLが含まれていません。');
            }
        });
    }

    //-----------------------------------------------------------------------------
    // ファイル読み込み処理
    //-----------------------------------------------------------------------------
    readFile(file, callback) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                callback(jsonData);
            } catch (error) {
                alert('JSONの読み込みに失敗しました:', error);
            }
        };
        reader.readAsText(file);
    }

    // JSONデータの検証
    validateJsonData(jsonData) {
        if (!jsonData.url || !jsonData.operationHistoryByURL) {
            console.warn('JSONに必要なurlまたはoperationHistoryByURLが含まれていません。');
            return false;
        }
        if (!Array.isArray(jsonData.operationHistoryByURL)) {
            console.warn('JSONのvalidateJsonDataが配列ではありません。');
            return false;
        }
        return true;
    }

    // URLが一致するかどうかを判定する関数
    isUrlMatch(actualUrl, expectedUrl) {
        // 空URL、undefined、nullの場合はマッチしない
        if (!actualUrl || !expectedUrl || actualUrl.trim() === '' || expectedUrl.trim() === '') {
            return false;
        }
        
        try {
            const actual = new URL(actualUrl);
            const expected = new URL(expectedUrl);
            
            // プロトコル、ホスト名が一致するかチェック
            if (actual.protocol !== expected.protocol || actual.hostname !== expected.hostname) {
                return false;
            }
            
            // 特殊なパターン処理: customer/entry/ の場合はIDを無視
            if (expected.pathname.includes('/customer/entry/')) {
                const actualBasePath = actual.pathname.replace(/\/customer\/entry\/\d+/, '/customer/entry/*');
                const expectedBasePath = expected.pathname.replace(/\/customer\/entry\/\d+/, '/customer/entry/*');
                return actualBasePath === expectedBasePath;
            }
            
            // 通常のパス名比較（末尾のスラッシュを正規化）
            return actual.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '');
            
        } catch (error) {
            console.warn('URL解析エラー:', error);
            // URL解析に失敗した場合は文字列の前方一致で判定
            return actualUrl.startsWith(expectedUrl) || expectedUrl.startsWith(actualUrl);
        }
    }

    //-----------------------------------------------------------------------------
    // 新しいタブ作成時の自動マッピング処理
    //-----------------------------------------------------------------------------
    handleNewTabCreated(physicalTabId, tabUrl, allOperationData) {
        console.log(`[DEBUG] 新しいタブ作成通知を受信: physicalTabId=${physicalTabId}, url=${tabUrl}`);
        
        if (!allOperationData || !allOperationData.operationHistoryByURL) {
            console.log('[DEBUG] operation dataがないため、自動マッピングをスキップします');
            return;
        }
        
        // 空URLの場合は処理をスキップして、後でタブ更新時にマッピングを試行
        if (!tabUrl || tabUrl.trim() === '') {
            console.log(`[DEBUG] 空URLのため自動マッピングをスキップ: physicalTabId=${physicalTabId}`);
            return;
        }
        
        // URLマッチングで対応する記録時タブIDを探す
        const groupKeys = Object.keys(allOperationData.operationHistoryByURL);
        for (const groupKey of groupKeys) {
            const operations = allOperationData.operationHistoryByURL[groupKey];
            if (operations && operations.length > 0) {
                const recordedUrl = operations[0].currentURL;
                const recordedTabId = operations[0].tabId;
                
                // URLが一致し、まだマッピングされていない場合
                if (this.isUrlMatch(tabUrl, recordedUrl) && !this.tabIdMapping.has(recordedTabId)) {
                    this.tabIdMapping.set(recordedTabId, physicalTabId);
                    console.log(`[DEBUG] 自動マッピング追加: 記録時TabID=${recordedTabId} → 物理TabID=${physicalTabId} (URL: ${tabUrl})`);
                    
                    // 未処理のグループで、この記録時タブIDに対応するものがある場合、処理を開始
                    // 現在処理中のグループをチェックせずに、未処理グループなら実行
                    if (!this.processedGroups.has(groupKey)) {
                        console.log(`[DEBUG] 自動マッピングされたタブで未処理グループを実行: ${groupKey}`);
                        this.processGroupInExistingTab(groupKey, allOperationData);
                    }
                    break;
                }
            }
        }
    }

    //-----------------------------------------------------------------------------
    // 既存タブでグループ処理を実行
    //-----------------------------------------------------------------------------
    processGroupInExistingTab(groupKey, allOperationData) {
        if (this.processedGroups.has(groupKey)) {
            console.log(`[DEBUG] グループ ${groupKey} は既に処理済みのためスキップ`);
            return;
        }
        
        console.log(`[DEBUG] 既存タブでグループ処理開始: ${groupKey}`);
        
        const operations = allOperationData.operationHistoryByURL[groupKey];
        const operationData = operations.map((item, index) => ({
            fullXPath: item.fullXPath,
            type: item.type,
            inputValue: item.inputValue,
            key: item.key,
            tagName: item.tagName,
            text: item.text,
            eventPhase: item.eventPhase,
            delayTime: item.delayTime || (index === 0 ? 1000 : 100)
        }));
        
        const recordedTabId = operations[0].tabId;
        const physicalTabId = this.tabIdMapping.get(recordedTabId);
        
        if (physicalTabId) {
            // 処理済みグループに追加（重複実行を防ぐため）
            this.processedGroups.add(groupKey);
            
            // 既存のタブに切り替えて操作を実行
            chrome.tabs.update(physicalTabId, { active: true }, () => {
                setTimeout(() => {
                    chrome.tabs.sendMessage(physicalTabId, {
                        type: 'execute-operations',
                        url: operations[0].currentURL,
                        operationData: operationData,
                        allOperationDataJSON: JSON.stringify(allOperationData)
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(`[ERROR] 自動マッピングタブ${physicalTabId}へのメッセージ送信失敗:`, chrome.runtime.lastError.message);
                        } else {
                            console.log(`[SUCCESS] 自動マッピングタブ${physicalTabId}へのメッセージ送信成功`);
                        }
                    });
                    console.log(`自動マッピングタブにメッセージを送信しました:`, operationData);
                }, 1000); // タブ切り替え後の待機時間を少し長くする
            });
        } else {
            console.warn(`[ERROR] 記録時TabID ${recordedTabId} に対応する物理TabIDが見つかりません`);
        }
    }

    //-----------------------------------------------------------------------------
    // 手動タブ閉じる完了時の処理
    //-----------------------------------------------------------------------------
    handleManualTabCloseCompleted(tabId, tabUrl, allOperationData) {
        console.log(`タブ閉じる完了通知を受信: tabId=${tabId}`);
        
        if (!allOperationData || !allOperationData.operationHistoryByURL) {
            console.warn('操作データが見つかりません');
            return;
        }
        
        // 閉じられたタブに対応するグループを検索
        let completedGroupKey = null;
        let recordedTabId = null;
        
        // タブIDマッピングから記録時タブIDを取得
        for (const [rTabId, pTabId] of this.tabIdMapping.entries()) {
            if (pTabId === tabId) {
                recordedTabId = rTabId;
                break;
            }
        }
        
        if (recordedTabId) {
            // 記録時タブIDに対応するグループを検索
            const groupKeys = Object.keys(allOperationData.operationHistoryByURL);
            for (const groupKey of groupKeys) {
                const operations = allOperationData.operationHistoryByURL[groupKey];
                if (operations && operations.length > 0 && operations[0].tabId === recordedTabId && operations[0].type === 'tab-close') {
                    completedGroupKey = groupKey;
                    break;
                }
            }
        }
        
        // タブIDマッピングで見つからない場合はURLベースで検索
        if (!completedGroupKey) {
            const groupKeys = Object.keys(allOperationData.operationHistoryByURL);
            for (const groupKey of groupKeys) {
                const operations = allOperationData.operationHistoryByURL[groupKey];
                if (operations && operations.length > 0 && operations[0].type === 'tab-close') {
                    if (this.isUrlMatch(tabUrl, operations[0].currentURL)) {
                        completedGroupKey = groupKey;
                        break;
                    }
                }
            }
        }
        
        // グループが見つかった場合、完了処理を実行
        if (completedGroupKey) {
            console.log(`タブ閉じるグループ完了: ${completedGroupKey}`);
            this.processedGroups.add(completedGroupKey);
            
            if (this.currentlyProcessingGroup === completedGroupKey) {
                this.currentlyProcessingGroup = null;
            }
            
            this.startNextGroup(allOperationData);
        } else {
            console.warn('対応するタブ閉じるグループが見つかりませんでした');
        }
        
        // 閉じたタブのマッピングを削除
        for (const [recordedTabId, physicalTabId] of this.tabIdMapping.entries()) {
            if (physicalTabId === tabId) {
                console.log(`[DEBUG] タブIDマッピング削除: 記録時=${recordedTabId} → 物理=${physicalTabId}`);
                this.tabIdMapping.delete(recordedTabId);
                break;
            }
        }
    }

    //-----------------------------------------------------------------------------
    // 次のグループを開始するヘルパーメソッド
    //-----------------------------------------------------------------------------
    startNextGroup(allOperationData) {
        const urls = Object.keys(allOperationData.operationHistoryByURL);
        
        // 未処理のグループを検索
        let nextUrl = null;
        for (const groupKey of urls) {
            if (!this.processedGroups.has(groupKey)) {
                nextUrl = groupKey;
                break;
            }
        }
        
        if (nextUrl) {
            console.log(`次のグループ処理開始: ${nextUrl}`);
            
            this.urlsNum = urls.indexOf(nextUrl);
            this.currentlyProcessingGroup = nextUrl;
            
            const nextOperationData = allOperationData.operationHistoryByURL[nextUrl].map((item, index) => ({
                fullXPath: item.fullXPath,
                type: item.type,
                inputValue: item.inputValue,
                key: item.key,
                tagName: item.tagName,
                text: item.text,
                eventPhase: item.eventPhase,
                delayTime: item.delayTime || (index === 0 ? 1000 : 100)
            }));
            const nextUrlValue = allOperationData.operationHistoryByURL[nextUrl].map(item => item.currentURL)[0];
            
            // 次のグループの記録時tabIdを取得
            const nextRecordedTabId = allOperationData.operationHistoryByURL[nextUrl][0]?.tabId;
            console.log(`次のグループ処理: URL=${nextUrlValue}, 記録時TabID=${nextRecordedTabId}`);
            
            if (nextRecordedTabId) {
                // 記録時tabIdが既存のマッピングに存在するかチェック
                const physicalTabId = this.tabIdMapping.get(nextRecordedTabId);
                
                if (physicalTabId) {
                    console.log(`マッピング発見: 記録時TabID=${nextRecordedTabId} → 物理TabID=${physicalTabId}`);
                    // 物理タブが存在するかチェック
                    chrome.tabs.get(physicalTabId, (tab) => {
                        if (chrome.runtime.lastError || !tab) {
                            console.log(`物理TabID ${physicalTabId} が見つからないため、新しいタブを作成します`);
                            this.openAndProcessTab(nextUrlValue, nextOperationData, nextRecordedTabId, allOperationData);
                        } else {
                            console.log(`既存の物理TabID ${physicalTabId} に切り替えて操作を実行します`);
                            this.currentActiveTab = physicalTabId;
                            // 既存のタブに切り替えて操作を実行
                            chrome.tabs.update(physicalTabId, { active: true }, () => {
                                setTimeout(() => {
                                    chrome.tabs.sendMessage(physicalTabId, {
                                        type: 'execute-operations',
                                        url: nextUrlValue,
                                        operationData: nextOperationData,
                                        allOperationDataJSON: JSON.stringify(allOperationData)
                                    }, (response) => {
                                        if (chrome.runtime.lastError) {
                                            console.error(`[ERROR] 既存タブ${physicalTabId}へのメッセージ送信失敗:`, chrome.runtime.lastError.message);
                                        } else {
                                            console.log(`[SUCCESS] 既存タブ${physicalTabId}へのメッセージ送信成功`);
                                        }
                                    });
                                    console.log(`既存タブにメッセージを送信しました:`, nextOperationData);
                                }, 500);
                            });
                        }
                    });
                } else {
                    console.log(`記録時TabID ${nextRecordedTabId} のマッピングが見つからないため、新しいタブを作成します`);
                    // マッピングが存在しない場合は新しいタブを作成
                    this.openAndProcessTab(nextUrlValue, nextOperationData, nextRecordedTabId, allOperationData);
                }
            } else {
                console.warn('次のグループの記録時tabIdが取得できませんでした');
            }
        } else {
            console.log('再生完了 - 全てのグループが処理されました');
        }
    }

    //-----------------------------------------------------------------------------
    // タブを作成して操作
    //-----------------------------------------------------------------------------
    openAndProcessTab(url, operationData, recordedTabId = null, allOperationData = null) {
        chrome.tabs.create({ url }, (tab) => {
            if (!tab) {
                console.warn("タブの作成に失敗しました");
                return;
            }

            const physicalTabId = tab.id;
            this.currentActiveTab = physicalTabId;
            
            // 記録時のtabIDと再生時の物理tabIDをマッピング
            if (recordedTabId) {
                this.tabIdMapping.set(recordedTabId, physicalTabId);
                console.log(`タブIDマッピング追加: 記録時=${recordedTabId} → 物理=${physicalTabId}`);
            }
            
            this.addTabUpdateListener(physicalTabId, url, operationData, false, allOperationData);
        });
    }

    //-----------------------------------------------------------------------------
    // タブに対して、メッセージを送信するリスナー関数
    //-----------------------------------------------------------------------------
    addTabUpdateListener(targetTabId, url, operationData, isTabCheck, allOperationData = null) {
        console.log('[DEBUG] addTabUpdateListener called with allOperationData:', allOperationData);
        
        const listener = (tabIdUpdated, changeInfo) => {
            // タブIDチェック条件を決定
            const shouldProcess = isTabCheck ? 
                changeInfo.status === 'complete' : 
                (tabIdUpdated === targetTabId && changeInfo.status === 'complete');
            
            if (shouldProcess) {
                this.processTabUpdate(tabIdUpdated, url, operationData, allOperationData, listener);
            }
        };

        chrome.tabs.onUpdated.addListener(listener);
    }

    //-----------------------------------------------------------------------------
    // タブ更新処理の共通ロジック
    //-----------------------------------------------------------------------------
    processTabUpdate(tabId, url, operationData, allOperationData, listener) {
        chrome.tabs.get(tabId, (tab) => {
            if (tab && tab.url && this.isUrlMatch(tab.url, url)) {
                try {
                    chrome.tabs.sendMessage(tabId, {
                        type: 'execute-operations',
                        url,
                        operationData,
                        allOperationDataJSON: JSON.stringify(allOperationData),
                        currentGroup: this.currentlyProcessingGroup,
                        processedGroups: Array.from(this.processedGroups)
                    }, (response) => {
                        // メッセージ送信結果を確認
                        if (chrome.runtime.lastError) {
                            console.error(`[ERROR] タブ${tabId}へのメッセージ送信失敗:`, chrome.runtime.lastError.message);
                            console.error(`[ERROR] 失敗したURL: ${url}`);
                            console.error(`[ERROR] 実際のタブURL: ${tab.url}`);
                        } else {
                            console.log(`[SUCCESS] タブ${tabId}へのメッセージ送信成功`);
                        }
                    });
                    console.log("メッセージを送信しました:", operationData);
                    console.log("allOperationDataを送信:", allOperationData);
                    console.log("JSON文字列化したallOperationData:", JSON.stringify(allOperationData));
                } catch (error) {
                    console.warn("メッセージ送信中にエラーが発生しました:", error);
                }

                // リスナーを解除
                chrome.tabs.onUpdated.removeListener(listener);
            } else {
                console.log(`URLが一致しません。期待: ${url}, 実際: ${tab?.url}`);
            }
        });
    }
}

// グローバルインスタンス
window.playbackHandler = new PlaybackHandler();
