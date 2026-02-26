/*
   ユーザー操作を記録するときに利用するJavaScript
 */

//-------------------------------------------------------------------------------------------
// Global Variables
//-------------------------------------------------------------------------------------------
// 重複記録防止のための管理
let lastRecordedEvent = {
    xpath: null,
    type: null,
    timestamp: null,
    phase: null
};


// ブラウザのフォーカス状態を追跡
let browserHasFocus = true;

// ウィンドウのフォーカス状態を監視
window.addEventListener('focus', () => {
    browserHasFocus = true;
    console.log('[DEBUG] ブラウザがフォーカスを取得しました');
});

window.addEventListener('blur', () => {
    browserHasFocus = false;
    console.log('[DEBUG] ブラウザがフォーカスを失いました');
});

// 再生中フラグを window グローバル変数で管理（ページ内で共有）
if (typeof window.conectomeReplayMode === 'undefined') {
    window.conectomeReplayMode = false;
}

//-------------------------------------------------------------------------------------------
// イベントの登録
//-------------------------------------------------------------------------------------------

// クリックイベントを登録（キャプチャリングフェーズで処理）
document.addEventListener('click', (event) => {
    console.log('[DEBUG] click イベントが発生しました（キャプチャリングフェーズ）:', event.target);
    handleEvent(event);
}, true); // キャプチャリング - これでイベントの伝播が止められる前にキャッチできる

// バブリングフェーズでも監視（デバッグ用）
document.addEventListener('click', (event) => {
    console.log('[DEBUG] click イベントが発生しました（バブリングフェーズ）:', event.target);
}, false); // バブリング（デフォルト）

// ダブルクリックイベントを登録（キャプチャリングフェーズで処理）
document.addEventListener('dblclick', (event) => {
    console.log('[DEBUG] dblclick イベントが発生しました:', event.target);
    handleEvent(event);
}, true); // キャプチャリング

// 特定の要素での問題を調査するため、すべてのマウスイベントを監視
document.addEventListener('mousedown', (event) => {
    console.log('[DEBUG] mousedown イベントが発生:', event.target);
    console.log('[DEBUG] mousedown XPath:', getXpath(event.target));
});

document.addEventListener('mouseup', (event) => {
    console.log('[DEBUG] mouseup イベントが発生:', event.target);
    console.log('[DEBUG] mouseup XPath:', getXpath(event.target));
});

// ページが完全に読み込まれた後に、問題のある要素を直接調査
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        console.log('[DEBUG] ページ読み込み完了。問題の要素を調査中...');
        
        // XPathで要素を特定
        function getElementByXPath(xpath) {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            return result.singleNodeValue;
        }
        
        const problemElement = getElementByXPath('/html/body/app-root/div/div/app-biz-menu-page/bl-tab-container/div/div[1]/div[2]/div[1]/a');
        if (problemElement) {
            console.log('[DEBUG] 問題の要素が見つかりました:', problemElement);
            console.log('[DEBUG] 要素のイベントリスナー情報:', getEventListeners(problemElement));
            
            // 直接この要素にイベントリスナーを追加
            problemElement.addEventListener('click', (e) => {
                console.log('[DEBUG] 問題要素の直接リスナー: click イベント発生');
                console.log('[DEBUG] イベント詳細:', e);
                console.log('[DEBUG] defaultPrevented:', e.defaultPrevented);
                console.log('[DEBUG] cancelBubble:', e.cancelBubble);
            }, true);
        } else {
            console.log('[DEBUG] 問題の要素が見つかりませんでした');
        }
    }, 2000);
});

// 各種キー押下イベントを登録
document.addEventListener('keydown', (event) => {
    const supportedKeys = [
        'Enter', 'Tab', 'Backspace', 
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'PageUp', 'PageDown', 'Home', 'End'
    ];
    if (supportedKeys.includes(event.key)) handleEvent(event);
});

// 編集可能フィールドの値が変更された場合のイベント（フォーカスが外れたとき）
document.addEventListener('blur', (event) => {
    const element = event.target;
    if (!element || !element.tagName) return;
    const tagName = element.tagName.toLowerCase();
    const isEditable = element.contentEditable === 'true' || element.isContentEditable;
    
    if (tagName === 'input' || tagName === 'textarea' || isEditable) {
        handleInputEvent(event);
    }
}, true); // 第3引数 "true" でキャプチャリングフェーズを有効に

// selectタグの変更イベント
document.addEventListener('change', (event) => {
    if (!event.target || !event.target.tagName) return;
    const tagName = event.target.tagName.toLowerCase();
    if (tagName === 'select') handleInputEvent(event);
}, true);

// 編集可能フィールドの各種キー押下イベント
document.addEventListener('keydown', (event) => {
    const supportedKeys = [
        'Enter', 'Tab', 'Backspace', 
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
        'PageUp', 'PageDown', 'Home', 'End'
    ];
    const element = event.target;
    if (!element || !element.tagName) return;
    const tagName = element.tagName.toLowerCase();
    const isEditable = element.contentEditable === 'true' || element.isContentEditable;
    
    if (supportedKeys.includes(event.key) && (tagName === 'input' || tagName === 'textarea' || isEditable)) {
        handleInputEvent(event);
    }
});


//-------------------------------------------------------------------------------------------
// 共通処理：XPath生成
//-------------------------------------------------------------------------------------------
function getXpath(element) {
    if (element && element.parentNode) {
        var xpath = getXpath(element.parentNode) + '/' + element.tagName;
        var s = [];

        for (var i = 0; i < element.parentNode.childNodes.length; i++) {
            var e = element.parentNode.childNodes[i];
            if (e.tagName == element.tagName) {
                s.push(e);
            }
        }

        if (1 < s.length) {
            for (var i = 0; i < s.length; i++) {
                if (s[i] === element) {
                    xpath += '[' + (i + 1) + ']';
                    break;
                }
            }
        }

        return xpath.toLowerCase();
    } else {
        return '';
    }
}

//-------------------------------------------------------------------------------------------
// タブ情報取得＆送信
//-------------------------------------------------------------------------------------------
function sendTabInfo(detailType, detailContent) {
    console.log(`[DEBUG] sendTabInfo が呼ばれました: detailType=${detailType}`, detailContent);
    
    chrome.runtime.sendMessage({ type: 'get-current-tab' }, (tabInfo) => {
        console.log(`[DEBUG] tabInfo取得結果:`, tabInfo);
        
        if (tabInfo) {
            const detail = {
                currentURL: window.location.href,
                tabId: tabInfo.id,
                timestamp: new Date().toISOString(),
                ...detailContent,
            };
            
            console.log(`[DEBUG] runtime.sendMessage を送信中: type=${detailType}`, detail);
            chrome.runtime.sendMessage({ type: detailType, detail });
        } else {
            console.warn('タブ情報の取得に失敗しました。');
        }
    });
}

//-------------------------------------------------------------------------------------------
// 入力完了時の処理
//-------------------------------------------------------------------------------------------
function handleInputEvent(event) {
    const element = event.target;
    if (!element || !element.tagName) return;
    const tagName = element.tagName.toLowerCase();
    let inputValue;

    // 要素のタイプに応じて値を取得
    if (tagName === 'select') {
        inputValue = element.value; // 選択された値
    } else if (element.contentEditable === 'true' || element.isContentEditable) {
        inputValue = element.textContent || element.innerText; // contenteditable要素のテキスト
    } else {
        inputValue = element.value; // input, textareaの値
    }

    console.log('入力値:', inputValue);

    // inputValueがundefinedまたは"undefined"文字列の場合は記録しない
    // 空文字は許容する
    if (inputValue === undefined || inputValue === 'undefined') {
        console.log('入力値が無効のため記録をスキップします:', inputValue);
        return;
    }

    // blur イベントの記録チェック
    if (event.type === 'blur') {
        // ブラウザがフォーカスを失った場合のblurイベントはスキップ
        if (!browserHasFocus) {
            console.log(`[DEBUG] ブラウザ外クリックによるblurイベントをスキップ: XPath=${getXpath(element)}, 値=${inputValue}`);
            return;
        }
    }

    sendTabInfo('input-event', {
        type: event.type,
        fullXPath: getXpath(element),
        inputValue,
        tagName: element.tagName,
        id: element.id,
    });
}

//-------------------------------------------------------------------------------------------
// イベントハンドラ（クリックやEnterキー押下時）
//-------------------------------------------------------------------------------------------
function handleEvent(event) {
    // 再生中は記録をスキップ（window グローバル変数を参照）
    if (window.conectomeReplayMode) {
        console.log(`[DEBUG] 再生中のため記録をスキップ: ${event.type}`);
        return;
    }

    const element = event.target;
    eventType = "";

    // イベントフェーズを判定
    const eventPhaseNames = {
        0: 'NONE',
        1: 'CAPTURING_PHASE', 
        2: 'AT_TARGET',
        3: 'BUBBLING_PHASE'
    };
    const currentPhase = eventPhaseNames[event.eventPhase] || 'UNKNOWN';
    const currentXPath = getXpath(element);
    const currentTime = Date.now();
    
    // 重複記録防止チェック（同じ要素・同じイベントタイプ・50ms以内）
    if (lastRecordedEvent.xpath === currentXPath && 
        lastRecordedEvent.type === event.type && 
        currentTime - lastRecordedEvent.timestamp < 50) {
        console.log(`[DEBUG] 重複イベントをスキップ: ${event.type}, フェーズ: ${currentPhase}`);
        return;
    }
    
    console.log(`[DEBUG] handleEvent が呼ばれました: ${event.type}, フェーズ: ${currentPhase}`, event);

    // イベント判断
    if (event.type === 'click') {
        eventType = 'click-event';
        console.log(`[DEBUG] click-eventとして処理中, フェーズ: ${currentPhase}`);
    } else if (event.type === 'dblclick') {
        eventType = 'dblclick-event';
        console.log(`[DEBUG] dblclick-eventとして処理中, フェーズ: ${currentPhase}`);
    } else if (event.type === 'keydown') {
        // キーに基づいてイベントタイプを設定
        switch (event.key) {
            case 'Enter':
                eventType = 'keydownEnter-event';
                break;
            case 'Tab':
                eventType = 'keydownTab-event';
                break;
            case 'Backspace':
                eventType = 'keydownBackspace-event';
                break;
            case 'F1':
            case 'F2':
            case 'F3':
            case 'F4':
            case 'F5':
            case 'F6':
            case 'F7':
            case 'F8':
            case 'F9':
            case 'F10':
            case 'F11':
            case 'F12':
                eventType = `keydown${event.key}-event`;
                break;
            case 'PageUp':
                eventType = 'keydownPageUp-event';
                break;
            case 'PageDown':
                eventType = 'keydownPageDown-event';
                break;
            case 'Home':
                eventType = 'keydownHome-event';
                break;
            case 'End':
                eventType = 'keydownEnd-event';
                break;
            default:
                eventType = 'keydown-event';
        }
    }

    console.log(`[DEBUG] sendTabInfo を呼び出し中: eventType=${eventType}, element=`, element);
    
    sendTabInfo(eventType, {
        type: event.type,
        fullXPath: currentXPath,
        tagName: element.tagName,
        id: element.id,
        text: element.innerText || '',
        key: event.key || '',
        eventPhase: currentPhase, // イベントフェーズ情報を追加
    });
    
    // 記録完了後に重複防止用の情報を更新
    lastRecordedEvent = {
        xpath: currentXPath,
        type: event.type,
        timestamp: currentTime,
        phase: currentPhase
    };
}

//-------------------------------------------------------------------------------------------
// 既存タブでの操作警告機能
//-------------------------------------------------------------------------------------------

// background.jsからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'show-existing-tab-warning') {
        showExistingTabWarning(message.eventType, message.url);
        sendResponse({ success: true });
    }
});

// 既存タブでの操作警告を表示
function showExistingTabWarning(eventType, url) {
    // 既存の警告があれば削除
    const existingWarning = document.getElementById('conectome-existing-tab-warning');
    if (existingWarning) {
        existingWarning.remove();
    }
    
    // 警告ダイアログを作成
    const warningDiv = document.createElement('div');
    warningDiv.id = 'conectome-existing-tab-warning';
    warningDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #ff4444;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        font-family: Arial, sans-serif;
        font-size: 14px;
        font-weight: bold;
        max-width: 500px;
        text-align: center;
        border: 2px solid #cc0000;
    `;
    
    warningDiv.innerHTML = `
        <div>⚠️ 既存タブでの操作が検出されました</div>
        <div style="font-size: 12px; margin-top: 8px; font-weight: normal;">
            記録時に既存のタブでの操作は再現性を保証できないため禁止されています。<br>
            操作タイプ: ${eventType}<br>
            URL: ${url}
        </div>
        <button onclick="this.parentElement.remove()" style="
            margin-top: 10px;
            background: white;
            color: #cc0000;
            border: none;
            padding: 5px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
        ">閉じる</button>
    `;
    
    document.body.appendChild(warningDiv);
    
    // 5秒後に自動で削除
    setTimeout(() => {
        if (warningDiv.parentElement) {
            warningDiv.remove();
        }
    }, 5000);
    
    console.warn(`[CONECTOME] 既存タブでの操作が検出されました: ${eventType} at ${url}`);
}
