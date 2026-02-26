// recording-handler.js - 記録処理用モジュール

class RecordingHandler {
    constructor() {
        this.eventDataList = [];
        this.isRecording = false;
        this.intervalId = null;
        this.pendingClickEvents = new Map(); // click遅延処理用
        this.recentDoubleClicks = new Map(); // dblclick記録用
        this.initialTabIds = new Set(); // 記録開始時の既存タブID
        this.allowedTabIds = new Set(); // 記録中に許可されるタブID（既存 + 新規作成）
    }

    //-----------------------------------------------------------------------------
    // 記録を開始
    //-----------------------------------------------------------------------------
    startRecording(url) {
        if (!url) {
            alert('URLが入力されていません。');
            return false;
        }

        // 記録開始前に現在開いているタブを取得
        chrome.tabs.query({}, (tabs) => {
            // 既存タブIDを保存
            this.initialTabIds.clear();
            this.allowedTabIds.clear();
            
            tabs.forEach(tab => {
                this.initialTabIds.add(tab.id);
                this.allowedTabIds.add(tab.id);
            });
            
            console.log('記録開始時の既存タブID:', Array.from(this.initialTabIds));
            
            // 既存タブ制限をbackground.jsに送信
            chrome.runtime.sendMessage({
                type: 'set-initial-tabs',
                initialTabIds: Array.from(this.initialTabIds)
            });
        });

        // URLを別タブで開く
        chrome.tabs.create({ url: url }, (newTab) => {
            // 新規作成されたタブを許可リストに追加
            this.allowedTabIds.add(newTab.id);
            console.log('新規作成タブID:', newTab.id);
        });

        // background scriptのイベントデータをクリア
        chrome.runtime.sendMessage({ type: 'clear-event-data' }, (response) => {
            if (response && response.success) {
                console.log('background scriptのイベントデータをクリアしました');
                this.eventDataList = [];
                this.updateUI();
            }
        });

        // 定期的にbackground scriptからイベントデータを取得
        this.intervalId = setInterval(() => {
            chrome.runtime.sendMessage({ type: 'get-event-data' }, (response) => {
                if (response && response.eventData) {
                    const newEvents = response.eventData.filter(event => {
                        return !this.eventDataList.some(existing => 
                            existing.timestamp === event.detail.timestamp &&
                            existing.fullXPath === event.detail.fullXPath
                        );
                    });
                    
                    if (newEvents.length > 0) {
                        // タイムスタンプ順にソートしてから処理
                        newEvents.sort((a, b) => new Date(a.detail.timestamp) - new Date(b.detail.timestamp));
                        
                        newEvents.forEach(event => {
                            console.log(`新しいイベント: ${event.type}`, event.detail);
                            this.addEventWithDuplicateCheck(event.detail);
                        });
                        this.updateUI();
                    }
                }
            });
        }, 1000); // 1秒ごとにチェック

        // ページが閉じられる時に監視を停止
        window.addEventListener('beforeunload', () => {
            this.stopRecording();
        });

        this.isRecording = true;
        return true;
    }

    // 記録を停止
    stopRecording() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        // 未処理の遅延clickイベントをクリア
        this.pendingClickEvents.forEach(pendingData => {
            clearTimeout(pendingData.timeoutId);
        });
        this.pendingClickEvents.clear();
        
        // dblclickフラグをクリア
        this.recentDoubleClicks.clear();
        
        // background.jsに記録停止を通知
        chrome.runtime.sendMessage({ 
            type: 'stop-recording' 
        }).catch((error) => {
            console.log('[DEBUG] 記録停止通知失敗:', error.message);
        });
        
        // タブ制限をクリア
        this.initialTabIds.clear();
        this.allowedTabIds.clear();
        
        this.isRecording = false;
    }

    //-----------------------------------------------------------------------------
    // ダブルクリック重複除去付きでイベントを追加
    //-----------------------------------------------------------------------------
    addEventWithDuplicateCheck(eventDetail) {
        if (eventDetail.type === 'click') {
            // clickイベントは遅延処理で判定
            this.handleClickEvent(eventDetail);
        } else if (eventDetail.type === 'dblclick') {
            // dblclickイベントは即座に処理
            this.handleDoubleClickEvent(eventDetail);
        } else {
            // その他のイベントは即座に追加
            this.eventDataList.push(eventDetail);
        }
    }

    //-----------------------------------------------------------------------------
    // clickイベントの遅延処理
    //-----------------------------------------------------------------------------
    handleClickEvent(eventDetail) {
        const elementKey = eventDetail.fullXPath;
        const clickTime = new Date(eventDetail.timestamp);
        
        // 最近のdblclickイベントをチェック
        if (this.recentDoubleClicks && this.recentDoubleClicks.has(elementKey)) {
            const recentDblclickTime = this.recentDoubleClicks.get(elementKey);
            const timeDiff = Math.abs(clickTime - recentDblclickTime);
            
            if (timeDiff < 1000) {
                console.log(`[DEBUG] 最近のdblclickに関連するclickイベントを無視: ${elementKey}`);
                return;
            }
        }
        
        // 既存の遅延処理をキャンセル
        if (this.pendingClickEvents.has(elementKey)) {
            clearTimeout(this.pendingClickEvents.get(elementKey).timeoutId);
        }
        
        // 300ms後にclickイベントを確定する遅延処理を設定
        const timeoutId = setTimeout(() => {
            // 再度最近のdblclickをチェック（処理中にdblclickが発生した可能性）
            if (this.recentDoubleClicks && this.recentDoubleClicks.has(elementKey)) {
                const recentDblclickTime = this.recentDoubleClicks.get(elementKey);
                const timeDiff = Math.abs(clickTime - recentDblclickTime);
                
                if (timeDiff < 1000) {
                    console.log(`[DEBUG] 遅延処理中にdblclickが検出されたためclickイベントを破棄: ${elementKey}`);
                    this.pendingClickEvents.delete(elementKey);
                    return;
                }
            }
            
            // dblclickが来なかったので、clickイベントを確定
            console.log(`[DEBUG] clickイベント確定: ${eventDetail.fullXPath}`);
            this.eventDataList.push(eventDetail);
            this.pendingClickEvents.delete(elementKey);
            this.updateUI();
        }, 300);
        
        // 遅延処理情報を保存
        this.pendingClickEvents.set(elementKey, {
            eventDetail: eventDetail,
            timeoutId: timeoutId
        });
        
        console.log(`[DEBUG] clickイベント遅延処理開始: ${eventDetail.fullXPath}`);
    }

    //-----------------------------------------------------------------------------
    // dblclickイベントの処理
    //-----------------------------------------------------------------------------
    handleDoubleClickEvent(eventDetail) {
        const elementKey = eventDetail.fullXPath;
        const dblclickTime = new Date(eventDetail.timestamp);
        
        // 同じ要素の遅延中clickイベントをキャンセル
        if (this.pendingClickEvents.has(elementKey)) {
            const pendingData = this.pendingClickEvents.get(elementKey);
            clearTimeout(pendingData.timeoutId);
            this.pendingClickEvents.delete(elementKey);
            console.log(`[DEBUG] 遅延中のclickイベントをキャンセル: ${elementKey}`);
        }
        
        // 同じ要素で、dblclickの前後1秒以内のclickイベントをすべて削除
        const removedEvents = [];
        for (let i = this.eventDataList.length - 1; i >= 0; i--) {
            const event = this.eventDataList[i];
            const eventTime = new Date(event.timestamp);
            const timeDiff = Math.abs(dblclickTime - eventTime);
            
            if (event.type === 'click' && 
                event.fullXPath === eventDetail.fullXPath && 
                timeDiff < 1000) {
                
                removedEvents.push(`${event.type} at ${event.timestamp}`);
                this.eventDataList.splice(i, 1);
            }
        }
        
        if (removedEvents.length > 0) {
            console.log(`[DEBUG] 既存clickイベントを削除: [${removedEvents.join(', ')}]`);
        }
        
        // dblclickイベントを追加
        this.eventDataList.push(eventDetail);
        console.log(`[DEBUG] dblclickイベント追加: ${eventDetail.fullXPath}`);
        
        // dblclick処理後にフラグを設定（後続のclickイベント処理用）
        this.recentDoubleClicks = this.recentDoubleClicks || new Map();
        this.recentDoubleClicks.set(elementKey, dblclickTime);
        
        // 5秒後にフラグをクリア
        setTimeout(() => {
            if (this.recentDoubleClicks) {
                this.recentDoubleClicks.delete(elementKey);
            }
        }, 5000);
    }

    //-----------------------------------------------------------------------------
    // 2つのタイムスタンプ間の時間差を計算（ミリ秒）
    //-----------------------------------------------------------------------------
    getTimeDifference(timestamp1, timestamp2) {
        const time1 = new Date(timestamp1).getTime();
        const time2 = new Date(timestamp2).getTime();
        return Math.abs(time2 - time1);
    }

    //-----------------------------------------------------------------------------
    // 全グループをまたがったダブルクリック重複除去
    //-----------------------------------------------------------------------------
    cleanupDoubleClickAcrossGroups(operationHistoryByURL) {
        // すべてのダブルクリックイベントを収集
        const allDoubleClicks = [];
        Object.keys(operationHistoryByURL).forEach(groupKey => {
            const operations = operationHistoryByURL[groupKey];
            operations.forEach((operation, index) => {
                if (operation.type === 'dblclick') {
                    allDoubleClicks.push({
                        groupKey: groupKey,
                        index: index,
                        event: operation
                    });
                }
            });
        });

        // 各ダブルクリックに対して、関連するクリックイベントを他のグループからも除去
        allDoubleClicks.forEach(dblclickInfo => {
            const dblclickTime = new Date(dblclickInfo.event.timestamp);
            const dblclickXPath = dblclickInfo.event.fullXPath;
            
            console.log(`[DEBUG] グループ間ダブルクリック重複除去開始: ${dblclickXPath} at ${dblclickInfo.event.timestamp}`);
            
            // すべてのグループから関連するクリックイベントを探して除去
            Object.keys(operationHistoryByURL).forEach(groupKey => {
                const operations = operationHistoryByURL[groupKey];
                const removedEvents = [];
                
                for (let i = operations.length - 1; i >= 0; i--) {
                    const operation = operations[i];
                    if (operation.type === 'click' && operation.fullXPath === dblclickXPath) {
                        const operationTime = new Date(operation.timestamp);
                        const timeDiff = Math.abs(dblclickTime - operationTime);
                        
                        // 1秒以内のクリックイベントを除去
                        if (timeDiff < 1000) {
                            removedEvents.push(`${operation.type} at ${operation.timestamp} (group: ${groupKey})`);
                            operations.splice(i, 1);
                        }
                    }
                }
                
                if (removedEvents.length > 0) {
                    console.log(`[DEBUG] グループ ${groupKey} から関連clickイベントを削除: [${removedEvents.join(', ')}]`);
                }
            });
        });

        // 空になったグループを削除
        const emptyGroups = [];
        Object.keys(operationHistoryByURL).forEach(groupKey => {
            if (operationHistoryByURL[groupKey].length === 0) {
                emptyGroups.push(groupKey);
                delete operationHistoryByURL[groupKey];
            }
        });

        if (emptyGroups.length > 0) {
            console.log(`[DEBUG] 空のグループを削除: [${emptyGroups.join(', ')}]`);
        }
    }

    //-----------------------------------------------------------------------------
    // 連続した同じ要素への重複クリックを除去
    //-----------------------------------------------------------------------------
    cleanupConsecutiveClicks(operationHistoryByURL) {
        Object.keys(operationHistoryByURL).forEach(groupKey => {
            const operations = operationHistoryByURL[groupKey];
            const removedEvents = [];
            
            for (let i = operations.length - 1; i >= 1; i--) {
                const currentOp = operations[i];
                const prevOp = operations[i - 1];
                
                // 両方がclickイベントで、同じXPathの場合
                if (currentOp.type === 'click' && prevOp.type === 'click' && 
                    currentOp.fullXPath === prevOp.fullXPath) {
                    
                    const currentTime = new Date(currentOp.timestamp);
                    const prevTime = new Date(prevOp.timestamp);
                    const timeDiff = currentTime - prevTime;
                    
                    // 0.5秒以内の連続クリックは重複とみなす
                    if (timeDiff < 500) {
                        removedEvents.push(`${currentOp.type} at ${currentOp.timestamp}`);
                        operations.splice(i, 1);
                    }
                }
            }
            
            if (removedEvents.length > 0) {
                console.log(`[DEBUG] グループ ${groupKey} から連続重複clickを削除: [${removedEvents.join(', ')}]`);
            }
        });
    }

    //-----------------------------------------------------------------------------
    // JSONファイルをダウンロード
    //-----------------------------------------------------------------------------
    downloadRecording(title, explanation, mainUrl) {
        if (this.eventDataList.length === 0) {
            alert('ダウンロードできるデータがありません。');
            return;
        }

        // 操作履歴をcurrentURLの変更タイミングでグループ化
        const operationHistoryByURL = {};
        let currentGroupKey = null;
        let groupIndex = 0;

        this.eventDataList.forEach((event, index) => {
            const url = event.currentURL;
            const tabid = event.tabId;
            
            // URLが変更された場合、新しいグループを作成
            const urlTabKey = url + ':' + tabid;
            if (index === 0 || this.eventDataList[index - 1].currentURL !== url || this.eventDataList[index - 1].tabId !== tabid) {
                groupIndex++;
                currentGroupKey = urlTabKey + '_group_' + groupIndex;
            }
            
            if (!operationHistoryByURL[currentGroupKey]) {
                operationHistoryByURL[currentGroupKey] = [];
            }
            operationHistoryByURL[currentGroupKey].push(event);
        });

        // 全グループをまたがったダブルクリック重複除去処理
        this.cleanupDoubleClickAcrossGroups(operationHistoryByURL);
        
        // 連続した同じ要素への重複クリックを除去
        this.cleanupConsecutiveClicks(operationHistoryByURL);

        // 各URLグループ内で操作間の遅延時間を計算
        Object.keys(operationHistoryByURL).forEach(urlKey => {
            const operations = operationHistoryByURL[urlKey];
            for (let i = 0; i < operations.length; i++) {
                if (i === 0) {
                    // 最初の操作は1秒の初期遅延
                    operations[i].delayTime = 1000;
                } else {
                    // 前の操作との時間差を計算（ミリ秒）
                    const currentTime = new Date(operations[i].timestamp);
                    const previousTime = new Date(operations[i - 1].timestamp);
                    const timeDiff = currentTime - previousTime;
                    
                    // 最小100ms、最大10秒の範囲で制限
                    operations[i].delayTime = Math.max(100, Math.min(timeDiff, 10000));
                }
            }
        });

        // JSON構造の作成
        const jsonData = {
            title: title,
            url: mainUrl,
            timestamp: new Date().toISOString(),
            explanation: explanation,
            operationHistoryByURL: operationHistoryByURL
        };

        const jsonString = JSON.stringify(jsonData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // ダウンロードリンクを作成してダウンロード
        const a = document.createElement('a');
        a.href = url;
        a.download = 'event_data.json';
        a.click();

        URL.revokeObjectURL(url);
    }

    // イベントデータのゲッター
    getEventData() {
        return this.eventDataList;
    }

    // UIの更新（メインのUIハンドラーに委譲）
    updateUI() {
        if (window.uiHandler) {
            window.uiHandler.renderTable();
        }
    }
}

// グローバルインスタンス
window.recordingHandler = new RecordingHandler();
