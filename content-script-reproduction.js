/*
   ユーザー操作を再現するときに利用するJavaScript
 */

// 重複実行防止のための管理
let recentlyClicked = new Set();

//-------------------------------------------------------------------------------------------
// 実行ボタンのクリックイベント
//-------------------------------------------------------------------------------------------
console.log('[DEBUG] content-script-reproduction がロードされました:', window.location.href);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DEBUG] content-script-reproduction メッセージ受信:', message);
    console.log('[DEBUG] メッセージタイプ:', message.type);
    console.log('[DEBUG] 現在のURL:', window.location.href);
    console.log('[DEBUG] allOperationDataJSON:', message.allOperationDataJSON);
    console.log('[DEBUG] allOperationDataJSONの型:', typeof message.allOperationDataJSON);
    sendResponse({ status: '受信成功' });
    
    if (message.type === 'execute-operations') {
        const { url, operationData, allOperationDataJSON } = message;
        let allOperationData = null;
        
        try {
            allOperationData = allOperationDataJSON ? JSON.parse(allOperationDataJSON) : null;
            console.log('[DEBUG] JSON復元成功, allOperationData:', allOperationData);
        } catch (error) {
            console.warn('[DEBUG] JSON復元エラー:', error);
            allOperationData = null;
        }

        // 画面描画完了を待機してから処理を開始する非同期関数
        const processOperations = async () => {
            console.log('[DEBUG] processOperations開始, allOperationData:', allOperationData);
            console.log('[DEBUG] ===== NEW VERSION LOADED =====');
            // 再生開始フラグを設定（window グローバル変数）
            window.conectomeReplayMode = true;
            console.log('[DEBUG] 再生モード開始 - 記録を一時停止します');
            
            // 画面描画完了を待機
            await waitForPageLoad();
            console.log('画面描画完了を確認しました。操作を開始します。');
            for (const operation of operationData) {
                // 操作固有の遅延時間を使用（デフォルトは10ms - 高速化）
                const delayTime = operation.delayTime || 10;
                await delay(delayTime);
                
                // タブ閉じる操作の場合は自動実行
                if (operation.type === 'tab-close') {
                    console.log('[DEBUG] タブ閉じる操作が検出されました - 自動実行します');
                    console.log('[DEBUG] 閉じる対象タブ:', {
                        currentURL: operation.currentURL || window.location.href,
                        title: operation.title || document.title,
                        tabId: operation.tabId
                    });
                    
                    // background scriptに自動タブ閉じる要求を送信
                    chrome.runtime.sendMessage({
                        type: 'auto-close-tab',
                        tabId: operation.tabId,
                        currentURL: operation.currentURL || window.location.href,
                        title: operation.title || document.title
                    }, (response) => {
                        if (chrome.runtime.lastError) {
                            console.error('[ERROR] 自動タブ閉じる要求送信失敗:', chrome.runtime.lastError.message);
                        } else {
                            console.log('[SUCCESS] 自動タブ閉じる要求送信成功:', response);
                        }
                    });
                    
                    console.log('[DEBUG] タブを自動で閉じる処理を開始しました');
                    // タブが閉じられることで、これ以降のコードは実行されない
                    return;
                }

                // XPath存在チェック（最大10秒間、0.1秒間隔でリトライ - 高速化）
                const element = await waitForElement(operation.fullXPath, 10000, 100);
                if (element) {
                    if (operation.type === 'click') {
                        const elementId = operation.fullXPath + '_' + operation.tagName + '_' + (operation.text || '');
                        
                        // 重複クリック防止（500ms以内の同一要素クリックをスキップ）
                        if (recentlyClicked.has(elementId)) {
                            console.log(`[DEBUG] 重複クリックをスキップ: ${elementId}`);
                            continue;
                        }
                        
                        console.log(`クリック対象: ${element}`);
                        console.log(`記録時のイベントフェーズ: ${operation.eventPhase || 'UNKNOWN'}`);
                        
                        // 重複防止のため要素をマーク（2秒に延長して厳格化）
                        recentlyClicked.add(elementId);
                        setTimeout(() => recentlyClicked.delete(elementId), 2000);
                        
                        // クリック実行前にさらに50ms待機してイベント処理を安定化
                        await delay(50);
                        
                        // 要素タイプに応じた直接操作でAngularのイベント処理をバイパス
                        console.log(`クリックを再現します (eventPhase: ${operation.eventPhase || 'UNKNOWN'})`);
                        console.log(`[DEBUG] 要素タイプ: ${element.tagName}, allOperationData存在: ${!!allOperationData}`);
                        
                        if (element.tagName === 'A' && element.href) {
                            // リンク要素の場合は直接ナビゲーション
                            console.log('[DEBUG] リンク要素を検出 - 直接ナビゲーション実行');
                            
                            // CSPエラーを回避するため、javascript:URLをチェック
                            if (element.href.startsWith('javascript:')) {
                                console.log('[DEBUG] JavaScript URLを検出 - 通常クリック実行');
                                element.click();
                            } else {
                                console.log('[DEBUG] 通常URLを検出 - 新しいタブで開く');
                                window.open(element.href, '_blank');
                            }
                        } else if (element.tagName === 'BUTTON') {
                            // 複合判定でフォーム送信ボタンかどうかを判定
                            const buttonText = (operation.text || '').toLowerCase();
                            const condition1 = window.location.href.includes('/login') && element.closest('form');
                            const condition2 = element.type === 'submit' && element.closest('form');
                            const condition3 = buttonText === 'ログイン' || buttonText === 'login' ||
                                             buttonText === '送信' || buttonText === 'submit' ||
                                             buttonText === 'sign in' || buttonText === 'signin' ||
                                             buttonText === 'log in' || buttonText === 'continue';
                            
                            const isLoginFormButton = condition1 || condition2 || condition3;
                            
                            console.log(`[DEBUG] ボタン判定詳細:`);
                            console.log(`  - URL判定 (login & form): ${condition1} (URL includes login: ${window.location.href.includes('/login')}, closest form: ${!!element.closest('form')})`);
                            console.log(`  - type='submit' & form: ${condition2} (element.type: '${element.type}', closest form: ${!!element.closest('form')})`);
                            console.log(`  - テキスト判定: ${condition3} (buttonText: '${buttonText}')`);
                            console.log(`  - 最終判定: ${isLoginFormButton}`);
                            
                            if (isLoginFormButton) {
                                console.log('[DEBUG] フォーム送信ボタンを検出 - 通常クリック実行');
                                // ワンタイムフラグで重複防止
                                const uniqueFlag = 'conectome_clicked_' + Date.now();
                                if (!element.hasAttribute(uniqueFlag)) {
                                    element.setAttribute(uniqueFlag, 'true');
                                    element.click();
                                    setTimeout(() => {
                                        element.removeAttribute(uniqueFlag);
                                    }, 1000);
                                }
                            } else {
                                // その他のボタン要素の場合は、次のグループのURLに直接ナビゲーション
                                console.log('[DEBUG] ナビゲーションボタンを検出 - 直接ナビゲーション実行');
                                
                                // 現在の操作から次のグループのURLを取得
                                const nextGroupUrl = getNextGroupUrlFromOperation(allOperationData, operation);
                                
                                if (nextGroupUrl) {
                                    console.log(`[DEBUG] 次のグループURL検出: ${nextGroupUrl}`);
                                    console.log(`[DEBUG] 直接ナビゲーションでタブを開きます: ${nextGroupUrl}`);
                                    
                                    // 次のグループの操作データを取得
                                    const nextGroupKey = getNextGroupKeyFromUrl(allOperationData, nextGroupUrl);
                                    let nextOperationData = null;
                                    
                                    if (nextGroupKey && allOperationData.operationHistoryByURL[nextGroupKey]) {
                                        nextOperationData = allOperationData.operationHistoryByURL[nextGroupKey].map((item, index) => ({
                                            fullXPath: item.fullXPath,
                                            type: item.type,
                                            inputValue: item.inputValue,
                                            key: item.key,
                                            tagName: item.tagName,
                                            text: item.text,
                                            eventPhase: item.eventPhase,
                                            delayTime: item.delayTime || (index === 0 ? 1000 : 100)
                                        }));
                                        console.log(`[DEBUG] 次のグループ操作データ取得完了:`, nextOperationData);
                                    }
                                    
                                    // 新しいタブを開いて操作を実行
                                    const newTab = window.open(nextGroupUrl, '_blank');
                                    
                                    // 新しいタブが読み込まれたら操作を実行
                                    // 注意: この処理はplayback-handler.jsが既に管理しているため無効化
                                    console.log(`[DEBUG] 新しいタブ作成を検出しましたが、playback-handler.jsが管理するためスキップします`);
                                    
                                    console.log(`[DEBUG] 直接ナビゲーション実行完了`);
                                    
                                    return; // 直接ナビゲーション実行後はクリック処理を終了
                                } else {
                                    console.log('[DEBUG] 次のグループが見つからない - 通常クリック実行');
                                    // ワンタイムフラグで重複防止
                                    const uniqueFlag = 'conectome_clicked_' + Date.now();
                                    if (!element.hasAttribute(uniqueFlag)) {
                                        element.setAttribute(uniqueFlag, 'true');
                                        element.click();
                                        setTimeout(() => {
                                            element.removeAttribute(uniqueFlag);
                                        }, 1000);
                                    }
                                }
                            }
                        } else {
                            // その他の要素は通常のクリック
                            console.log('[DEBUG] その他要素 - 通常クリック実行');
                            element.click();
                        }
                        
                        // クリック実行後も50ms待機
                        await delay(50);
                        console.log('クリックが実行されました。');
                    } else if (operation.type === 'dblclick') {
                        console.log(`ダブルクリック対象: ${element}`);
                        
                        // 重複実行防止
                        const elementId = operation.fullXPath + '_dblclick_' + operation.tagName + '_' + (operation.text || '');
                        if (recentlyClicked.has(elementId)) {
                            console.log(`[DEBUG] 重複ダブルクリックをスキップ: ${elementId}`);
                            continue;
                        }
                        
                        // 重複防止マーク（3秒間）
                        recentlyClicked.add(elementId);
                        setTimeout(() => recentlyClicked.delete(elementId), 3000);
                        
                        // ダブルクリックイベントを直接発火
                        element.dispatchEvent(new MouseEvent('dblclick', { 
                            bubbles: true, 
                            cancelable: true,
                            view: window,
                            detail: 2 // ダブルクリックのクリック回数を指定
                        }));
                        
                        console.log('ダブルクリックイベントが実行されました。');
                    } else if (operation.type === 'keydown' && operation.key) {
                        console.log(`${operation.key}キー押下対象: ${element}`);
                        element.focus(); // フォーカスを当てる
                        
                        // キーコードマッピング
                        const keyCodeMap = {
                            'Enter': 13,
                            'Tab': 9,
                            'Backspace': 8,
                            'F1': 112, 'F2': 113, 'F3': 114, 'F4': 115, 'F5': 116, 'F6': 117,
                            'F7': 118, 'F8': 119, 'F9': 120, 'F10': 121, 'F11': 122, 'F12': 123,
                            'PageUp': 33,
                            'PageDown': 34,
                            'Home': 36,
                            'End': 35
                        };
                        
                        const keyCode = keyCodeMap[operation.key] || 0;
                        element.dispatchEvent(new KeyboardEvent('keydown', { 
                            key: operation.key, 
                            keyCode: keyCode, 
                            bubbles: true 
                        }));
                        console.log(`${operation.key}キーが押下されました。`);
                    } else if ((operation.type === 'blur' || operation.type === 'change') && operation.inputValue) {
                        console.log(`入力対象: ${element}`);
                        
                        // KeyboardEventを使った文字入力処理
                        const typeCharacterByCharacter = async (targetElement, valueToType) => {
                            const delayPerChar = 20; // 各文字入力間の遅延 (ミリ秒) - 高速化
                            const tagName = targetElement.tagName.toLowerCase();
                            
                            // 要素タイプに応じた初期化とフォーカス
                            if (tagName === 'select') {
                                // selectの場合は値を直接設定
                                targetElement.value = valueToType;
                                targetElement.dispatchEvent(new Event('change', { bubbles: true }));
                                console.log(`選択値が設定されました: ${valueToType}`);
                                return;
                            } else if (targetElement.contentEditable === 'true' || targetElement.isContentEditable) {
                                // contenteditable要素の場合
                                targetElement.textContent = '';
                                targetElement.focus();
                            } else {
                                // input, textareaの場合
                                targetElement.value = '';
                                targetElement.focus();
                            }
                            
                            for (let i = 0; i < valueToType.length; i++) {
                                const char = valueToType[i];
                                
                                // keydown イベント
                                targetElement.dispatchEvent(new KeyboardEvent('keydown', {
                                    key: char,
                                    code: `Key${char.toUpperCase()}`,
                                    charCode: char.charCodeAt(0),
                                    keyCode: char.charCodeAt(0),
                                    bubbles: true,
                                    cancelable: true,
                                    isComposing: false
                                }));
                                
                                // input イベント (テキストが変化するたびに発生)
                                if (targetElement.contentEditable === 'true' || targetElement.isContentEditable) {
                                    // contenteditable要素の場合
                                    targetElement.textContent += char;
                                } else {
                                    // input, textareaの場合
                                    targetElement.value += char;
                                }
                                targetElement.dispatchEvent(new Event('input', { bubbles: true }));
                                
                                // keyup イベント
                                targetElement.dispatchEvent(new KeyboardEvent('keyup', {
                                    key: char,
                                    code: `Key${char.toUpperCase()}`,
                                    charCode: char.charCodeAt(0),
                                    keyCode: char.charCodeAt(0),
                                    bubbles: true,
                                    cancelable: true,
                                    isComposing: false
                                }));
                                
                                console.log(`文字: ${char} を入力しました。`);
                                await delay(delayPerChar);
                            }
                            
                            // 全ての文字入力が完了した後、blurイベントを発生させる
                            targetElement.dispatchEvent(new Event('blur', { bubbles: true }));
                            
                            // 最終値をログ出力
                            const finalValue = targetElement.contentEditable === 'true' || targetElement.isContentEditable 
                                ? targetElement.textContent 
                                : targetElement.value;
                            console.log(`最終的に入力された値: ${finalValue}`);
                        };
                        
                        await typeCharacterByCharacter(element, operation.inputValue);
                        console.log(`値 "${operation.inputValue}" が入力されました。`);
                    }
                } else {
                    alert(`10秒経過してもXPathが見つかりません: ${operation.fullXPath}`);
                }
            }
            
            // 再生終了フラグをリセット（window グローバル変数）
            window.conectomeReplayMode = false;
            console.log('[DEBUG] 再生モード終了 - 記録を再開します');
            
            // 現在のタブIDを取得して送信
            chrome.runtime.sendMessage({
                type: 'get-current-tab-id'
            }, (response) => {
                const currentTabId = response ? response.tabId : 'unknown';
                
                sendTabInfo('end-replayJson', {
                    type: 'end-replayJson',
                    fullXPath: '',
                    tagName: '',
                    id: 2,
                    text: 'Jsonの処理が終わったお知らせだよ',
                    sourceTabId: currentTabId,
                    processedUrl: window.location.href,
                    timestamp: Date.now()
                });
                
                console.log(`[DEBUG] end-replayJsonメッセージ送信 - TabID: ${currentTabId}, URL: ${window.location.href}`);
            });
            console.log('おわった');
        };

        processOperations(); // 非同期関数を呼び出す
    }
});


// 指定時間待機するPromise関数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// XPathで要素を取得する関数
function getElementByXPath(xpath) {
    const iterator = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    console.log(iterator)
    return iterator.singleNodeValue;
}

// 要素が見つかるまで待機する関数（リトライ機能付き）
async function waitForElement(xpath, maxWaitTime = 10000, retryInterval = 500) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
        const element = getElementByXPath(xpath);
        if (element) {
            console.log(`要素が見つかりました: ${xpath}`);
            return element;
        }
        
        console.log(`要素が見つかりません。${retryInterval}ms後にリトライします: ${xpath}`);
        await delay(retryInterval);
    }
    
    console.warn(`${maxWaitTime}ms経過しても要素が見つかりませんでした: ${xpath}`);
    return null;
}

// 画面描画完了を待機する関数
async function waitForPageLoad() {
    // DOMContentLoadedを待機
    if (document.readyState === 'loading') {
        await new Promise(resolve => {
            document.addEventListener('DOMContentLoaded', resolve, { once: true });
        });
    }
    
    // さらにページの完全読み込みを待機
    if (document.readyState !== 'complete') {
        await new Promise(resolve => {
            window.addEventListener('load', resolve, { once: true });
        });
    }
    
    // 追加の安全マージン（動的コンテンツの読み込み完了を考慮） - 高速化のため短縮
    await delay(200);
    
    console.log('ページ読み込み完了を確認しました。');
}

//-------------------------------------------------------------------------------------------
// URL照合のヘルパー関数
//-------------------------------------------------------------------------------------------
function urlMatches(actualUrl, expectedUrl) {
    try {
        console.log(`[DEBUG] URL比較: actual="${actualUrl}", expected="${expectedUrl}"`);
        const actual = new URL(actualUrl);
        const expected = new URL(expectedUrl);
        const matches = actual.protocol === expected.protocol &&
               actual.hostname === expected.hostname &&
               actual.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '');
        console.log(`[DEBUG] URL比較結果: ${matches}`);
        return matches;
    } catch (error) {
        console.warn(`[DEBUG] URL解析エラー: actual="${actualUrl}", expected="${expectedUrl}"`, error);
        // URL解析に失敗した場合は文字列の前方一致で判定
        const fallbackMatch = actualUrl.includes(expectedUrl) || expectedUrl.includes(actualUrl);
        console.log(`[DEBUG] フォールバック比較結果: ${fallbackMatch}`);
        return fallbackMatch;
    }
}

//-------------------------------------------------------------------------------------------
// URLからグループキーを取得するヘルパー関数
//-------------------------------------------------------------------------------------------
function getNextGroupKeyFromUrl(allOperationData, targetUrl) {
    if (!allOperationData || !allOperationData.operationHistoryByURL) {
        return null;
    }
    
    const groupKeys = Object.keys(allOperationData.operationHistoryByURL);
    for (const groupKey of groupKeys) {
        const operations = allOperationData.operationHistoryByURL[groupKey];
        if (operations && operations.length > 0) {
            const firstOperation = operations[0];
            if (firstOperation.currentURL && firstOperation.currentURL.includes(targetUrl.replace(/^https?:\/\/[^\/]+/, ''))) {
                console.log(`[DEBUG] URLマッチによるグループキー発見: ${groupKey}`);
                return groupKey;
            }
        }
    }
    return null;
}

//-------------------------------------------------------------------------------------------
// 操作から次のグループのURLを取得する関数
//-------------------------------------------------------------------------------------------
function getNextGroupUrlFromOperation(allOperationData, operation) {
    if (!allOperationData || !operation) return null;
    
    try {
        const groupKeys = Object.keys(allOperationData.operationHistoryByURL || {});
        console.log('[DEBUG] 操作ベース検索 - 全グループキー:', groupKeys);
        
        // 現在の操作が属するグループを特定
        let currentGroupIndex = -1;
        for (let i = 0; i < groupKeys.length; i++) {
            const groupOperations = allOperationData.operationHistoryByURL[groupKeys[i]] || [];
            
            console.log(`[DEBUG] グループ${i}の操作をチェック:`, groupOperations.length, '個の操作');
            
            // 同じXPath、タイプ、テキストの操作を探す
            const matchingOp = groupOperations.find(op => {
                const xpathMatch = op.fullXPath === operation.fullXPath;
                const typeMatch = op.type === operation.type;
                
                // テキストマッチング：厳格な比較
                const textMatch = op.text === operation.text;
                
                console.log(`[DEBUG] 操作比較 - XPath: ${xpathMatch}, Type: ${typeMatch}, Text: ${textMatch}`);
                console.log(`[DEBUG] 期待値: XPath="${operation.fullXPath}", Type="${operation.type}", Text="${operation.text}"`);
                console.log(`[DEBUG] 実際値: XPath="${op.fullXPath}", Type="${op.type}", Text="${op.text}"`);
                
                return xpathMatch && typeMatch && textMatch;
            });
            
            if (matchingOp) {
                currentGroupIndex = i;
                console.log(`[DEBUG] 現在の操作がグループ${i}で発見:`, groupKeys[i]);
                break;
            }
        }
        
        // 次のグループのURLを取得
        if (currentGroupIndex >= 0 && currentGroupIndex < groupKeys.length - 1) {
            const nextGroupKey = groupKeys[currentGroupIndex + 1];
            const lastColonIndex = nextGroupKey.lastIndexOf(':');
            const nextUrl = lastColonIndex !== -1 ? nextGroupKey.substring(0, lastColonIndex) : nextGroupKey;
            console.log('[DEBUG] 次のグループURL (操作ベース):', nextUrl);
            return nextUrl;
        }
        
        console.log('[DEBUG] 次のグループが見つからない（操作ベース）');
        return null;
    } catch (error) {
        console.warn('[DEBUG] getNextGroupUrlFromOperation エラー:', error);
        return null;
    }
}

//-------------------------------------------------------------------------------------------
// 次のグループのURLを取得する関数（旧版・予備用）
//-------------------------------------------------------------------------------------------
function getNextGroupUrl(allOperationData, currentUrl) {
    if (!allOperationData || !currentUrl) return null;
    
    try {
        // operationHistoryByURLからキーを取得
        const groupKeys = Object.keys(allOperationData.operationHistoryByURL || {});
        console.log('[DEBUG] 全グループキー:', groupKeys);
        
        // 現在のURLに対応するグループを特定
        let currentGroupIndex = -1;
        for (let i = 0; i < groupKeys.length; i++) {
            // 最後の':'を基準にしてURL部分を取得（tabId_group部分を除去）
            const lastColonIndex = groupKeys[i].lastIndexOf(':');
            const groupUrl = lastColonIndex !== -1 ? groupKeys[i].substring(0, lastColonIndex) : groupKeys[i];
            
            console.log(`[DEBUG] グループ${i}: キー="${groupKeys[i]}", 抽出URL="${groupUrl}"`);
            console.log(`[DEBUG] 現在URL="${currentUrl}"`);
            
            if (urlMatches(currentUrl, groupUrl)) {
                currentGroupIndex = i;
                console.log(`[DEBUG] マッチしたグループ: ${i}`);
                break;
            }
        }
        
        console.log('[DEBUG] 現在のグループインデックス:', currentGroupIndex);
        
        // 次のグループのURLを取得
        if (currentGroupIndex >= 0 && currentGroupIndex < groupKeys.length - 1) {
            const nextGroupKey = groupKeys[currentGroupIndex + 1];
            // 最後の':'を基準にしてURL部分を取得（tabId_group部分を除去）
            const lastColonIndex = nextGroupKey.lastIndexOf(':');
            const nextUrl = lastColonIndex !== -1 ? nextGroupKey.substring(0, lastColonIndex) : nextGroupKey;
            console.log('[DEBUG] 次のグループURL:', nextUrl);
            return nextUrl;
        }
        
        return null;
    } catch (error) {
        console.warn('[DEBUG] getNextGroupUrl エラー:', error);
        return null;
    }
}

//-------------------------------------------------------------------------------------------
// タブ情報取得＆送信
//-------------------------------------------------------------------------------------------
function sendTabInfo(detailType, detailContent) {
    chrome.runtime.sendMessage({ type: 'get-current-tab' }, (tabInfo) => {
        if (tabInfo) {
            const detail = {
                currentURL: window.location.href,
                tabId: tabInfo.id,
                timestamp: new Date().toISOString(),
                ...detailContent,
            };
            chrome.runtime.sendMessage({ type: detailType, detail });
        } else {
            console.warn('タブ情報の取得に失敗しました。');
        }
    });
}
