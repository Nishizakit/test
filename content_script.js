//-------------------------------------------------------------------------------------------
// イベントの登録
//-------------------------------------------------------------------------------------------

// クリックイベントを登録
document.addEventListener('click', handleEvent);

// Enterキー押下イベントを登録
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') handleEvent(event);
});

// inputタグの値が変更された場合のイベント（フォーカスが外れたとき）
document.addEventListener('blur', (event) => {
    if (event.target.tagName.toLowerCase() === 'input') handleInputEvent(event);
}, true); // 第3引数 "true" でキャプチャリングフェーズを有効に

// inputタグのEnterキー押下イベント
document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target.tagName.toLowerCase() === 'input') handleInputEvent(event);
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
            console.error('タブ情報の取得に失敗しました。');
        }
    });
}

//-------------------------------------------------------------------------------------------
// 入力完了時の処理
//-------------------------------------------------------------------------------------------
function handleInputEvent(event) {
    const element = event.target;
    const inputValue = element.value;
    console.log('入力値:', inputValue);

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
    const element = event.target;
    eventType = "";

    // イベント判断
    if (event.type === 'click') {
        eventType = 'click-event';
    } else if (event.type === 'keydown') {
        eventType = 'keydownEnter-event';
    }

    sendTabInfo(eventType, {
        type: event.type,
        fullXPath: getXpath(element),
        tagName: element.tagName,
        id: element.id,
        text: element.innerText || '',
    });
}

//-------------------------------------------------------------------------------------------
// Uploadボタンのクリックイベント
//-------------------------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('受信メッセージ:', message);
    sendResponse({ status: '受信成功' });

    if (message.type === 'execute-xpaths') {
        const { url, xpaths } = message;

        //        if (url === window.location.href) {
        // 非同期関数を作成
        const processXpaths = async () => {
            for (const xpath of xpaths) {
                await delay(5000); // 1秒待機
                const element = getElementByXPath(xpath);
                if (element) {
                    console.log(`クリック対象: ${element}`);

                    element.click(); // 要素をクリック
                    console.log('クリックが実行されました。');
                } else {
                    alert(`XPathが見つかりません: ${xpath}`);
                }
            }
            sendTabInfo('end-replayJson', {
                type: 'end-replayJson',
                fullXPath: '',
                tagName: '',
                id: 2,
                text: 'Jsonの処理が終わったお知らせだよ',
            });
            console.log('おわった');
        };

        processXpaths(); // 非同期関数を呼び出す
        //        } else {
        //            console.warn(`現在のURLが一致しません。現在: ${window.location.href}, 指定: ${url}`);
        //        }
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
