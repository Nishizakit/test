// JSONデータの保持用
let eventDataList = [];
let currentPage = 1;
let urlsNum = 0;
const rowsPerPage = 5; // 1ページあたりの行数

// Submitボタンのクリックイベント
document.getElementById('submit-button').addEventListener('click', () => {
    const url = document.getElementById('url-input').value;

    if (url) {
        window.open(url, '_blank', 'noopener'); // URLを別タブで開く

        // メッセージリスナーを登録しておく
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'click-event' || message.type === 'keydownEnter-event' || message.type === 'input-event') {
                console.log(`イベント発生: ${message.type}`, message.detail);
                eventDataList.push(message.detail);
                renderTable();
            }
        });
    } else {
        console.error('URLが入力されていません。');
    }
});

// Downloadボタンのクリックイベント
document.getElementById('download-button').addEventListener('click', () => {
    const title = document.getElementById('title-input').value || 'Untitled';
    const explanation = document.getElementById('explanation-input').value || 'No explanation provided';
    const mainUrl = document.getElementById('url-input').value;

    if (eventDataList.length > 0) {
        // 操作履歴をcurrentURLごとに分類
        const operationHistoryByURL = {};
        eventDataList.forEach(event => {
            const url = event.currentURL;
            if (!operationHistoryByURL[url]) {
                operationHistoryByURL[url] = [];
            }
            operationHistoryByURL[url].push(event);
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
    } else {
        console.warn('ダウンロードできるデータがありません。');
    }
});

// ファイル読み込み処理
function readFile(file, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const jsonData = JSON.parse(event.target.result);
            callback(jsonData);
        } catch (error) {
            console.error('JSONの読み込みに失敗しました:', error);
        }
    };
    reader.readAsText(file);
}

// JSONデータの検証
function validateJsonData(jsonData) {
    if (!jsonData.url || !jsonData.operationHistoryByURL) {
        console.error('JSONに必要なurlまたはoperationHistoryByURLが含まれていません。');
        return false;
    }
    if (!Array.isArray(jsonData.operationHistoryByURL)) {
        console.error('JSONのvalidateJsonDataが配列ではありません。');
        return false;
    }
    return true;
}

// タブを作成して操作
function openAndProcessTab(url, xpaths) {
    chrome.tabs.create({ url }, (tab) => {
        if (!tab) {
            console.error("タブの作成に失敗しました");
            return;
        }

        const tabId = tab.id;
        addTabUpdateListener(tabId, url, xpaths, false); // 切り出した関数を呼び出し

    });
}

// タブに対して、メッセージを送信するリスナー関数
function addTabUpdateListener(targetTabId, url, xpaths, isTabCheck) {
    const listener = function (tabIdUpdated, changeInfo) {
        if (isTabCheck) {
            if (changeInfo.status === 'complete') {
                try {
                    chrome.tabs.sendMessage(tabIdUpdated, {
                        type: 'execute-xpaths',
                        url,
                        xpaths
                    });
                    console.log("メッセージを送信しました:", xpaths);
                } catch (error) {
                    console.error("メッセージ送信中にエラーが発生しました:", error);
                }

                // リスナーを解除
                chrome.tabs.onUpdated.removeListener(listener);
            }
        } else {
            if (tabIdUpdated === targetTabId && changeInfo.status === 'complete') {
                try {
                    chrome.tabs.sendMessage(tabIdUpdated, {
                        type: 'execute-xpaths',
                        url,
                        xpaths
                    });
                    console.log("メッセージを送信しました:", xpaths);
                } catch (error) {
                    console.error("メッセージ送信中にエラーが発生しました:", error);
                }

                // リスナーを解除
                chrome.tabs.onUpdated.removeListener(listener);
            }
        }

    };

    chrome.tabs.onUpdated.addListener(listener);
}


// Uploadボタンのクリックイベント
document.getElementById('upload-button').addEventListener('click', () => {
    const fileInput = document.getElementById('upload-input');
    const file = fileInput.files[0];

    if (file) {
        readFile(file, (jsonData) => {
            if (jsonData.operationHistoryByURL && typeof jsonData.operationHistoryByURL === "object") {
                // operationHistoryByURLから最初のキーと対応する配列を取得
                const urls = Object.keys(jsonData.operationHistoryByURL);
                if (urls.length > 0) {
                    const firstUrl = urls[0];
                    const firstOperationHistory = jsonData.operationHistoryByURL[firstUrl];

                    // openAndProcessTabに最初のURLとその操作履歴を連携
                    if (firstOperationHistory && Array.isArray(firstOperationHistory)) {
                        const xpaths = firstOperationHistory.map(item => item.fullXPath);
                        openAndProcessTab(firstUrl, xpaths);

                        // メッセージリスナーを登録しておく
                        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                            if (message.type === 'end-replayJson') {
                                console.log(`おつかれ: ${message.type}`, message.detail);

                                if (urls.length > 1) {
                                    urlsNum = urlsNum + 1;
                                    if (urls.length > urlsNum) {
                                        addTabUpdateListener(message.detail.tabId, urls[urlsNum], jsonData.operationHistoryByURL[urls[urlsNum]].map(item => item.fullXPath), true);
                                    }
                                }


                            }
                        })
                    } else {
                        console.error('最初のURLに対応する操作履歴が不正です。');
                    }
                } else {
                    console.error('operationHistoryByURLが空です。');
                }

                // ページネーション用にoperationHistoryByURLをローカルに保持
                eventDataList = Object.values(jsonData.operationHistoryByURL).flat();
                currentPage = 1;
                renderTable();
            } else {
                console.error('JSONにoperationHistoryByURLが含まれていません。');
            }
        });
    } else {
        console.warn('ファイルが選択されていません。');
    }
});


// ページネーションボタンとテーブル表示更新はそのまま
document.getElementById('prev-button').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderTable();
    }
});
document.getElementById('next-button').addEventListener('click', () => {
    if (currentPage * rowsPerPage < eventDataList.length) {
        currentPage++;
        renderTable();
    }
});

function renderTable() {
    const tableBody = document.getElementById('event-table').querySelector('tbody');
    tableBody.innerHTML = ''; // テーブルをクリア

    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, eventDataList.length);

    for (let i = startIndex; i < endIndex; i++) {
        const detail = eventDataList[i];
        const newRow = tableBody.insertRow();

        const eventTypeCell = newRow.insertCell(0);
        eventTypeCell.textContent = detail.type || 'N/A';

        const timestampCell = newRow.insertCell(1);
        timestampCell.textContent = detail.timestamp || 'N/A';

        const xPathCell = newRow.insertCell(2);
        xPathCell.textContent = detail.fullXPath || 'N/A';

        const additionalInfoCell = newRow.insertCell(3);
        additionalInfoCell.textContent = JSON.stringify(detail, null, 2);
    }

    document.getElementById('page-info').textContent = `Page ${currentPage} of ${Math.ceil(eventDataList.length / rowsPerPage)}`;
}
