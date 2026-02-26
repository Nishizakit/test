// ui-handler.js - UI操作処理用モジュール

class UIHandler {
    constructor() {
        this.currentPage = 1;
        this.rowsPerPage = 5; // 1ページあたりの行数
        this.eventDataList = [];
        this.initializeEventListeners();
    }

    // イベントリスナーの初期化
    initializeEventListeners() {
        // Submitボタンのクリックイベント（記録開始）
        document.getElementById('submit-button').addEventListener('click', () => {
            const url = document.getElementById('url-input').value;
            const success = window.recordingHandler.startRecording(url);
            if (success) {
                this.showRecordingStatus(true);
            }
        });

        // Downloadボタンのクリックイベント（記録データのダウンロード）
        document.getElementById('download-button').addEventListener('click', () => {
            const title = document.getElementById('title-input').value || 'Untitled';
            const explanation = document.getElementById('explanation-input').value || 'No explanation provided';
            const mainUrl = document.getElementById('url-input').value;
            
            window.recordingHandler.downloadRecording(title, explanation, mainUrl);
        });

        // 実行ボタンのクリックイベント（再生開始）
        document.getElementById('upload-button').addEventListener('click', () => {
            const fileInput = document.getElementById('upload-input');
            const file = fileInput.files[0];
            
            window.playbackHandler.startPlayback(file);
        });

        // ページネーションボタンのクリックイベント
        document.getElementById('prev-button').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderTable();
            }
        });

        document.getElementById('next-button').addEventListener('click', () => {
            if (this.currentPage * this.rowsPerPage < this.eventDataList.length) {
                this.currentPage++;
                this.renderTable();
            }
        });
    }

    // 記録状態の表示
    showRecordingStatus(isRecording) {
        const statusElement = document.getElementById('recording-status');
        if (statusElement) {
            statusElement.textContent = isRecording ? '記録中...' : '記録停止';
            statusElement.style.color = isRecording ? 'red' : 'gray';
        }
    }

    // テーブルのレンダリング
    renderTable() {
        const tableBody = document.getElementById('event-table').querySelector('tbody');
        tableBody.innerHTML = ''; // テーブルをクリア

        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, this.eventDataList.length);

        for (let i = startIndex; i < endIndex; i++) {
            const detail = this.eventDataList[i];
            const newRow = tableBody.insertRow();

            const eventTypeCell = newRow.insertCell(0);
            eventTypeCell.textContent = detail.type || 'N/A';

            const tagCell = newRow.insertCell(1);
            tagCell.textContent = detail.tagName || 'N/A';

            const timestampCell = newRow.insertCell(2);
            timestampCell.textContent = detail.timestamp || 'N/A';

            const xPathCell = newRow.insertCell(3);
            xPathCell.textContent = detail.fullXPath || 'N/A';

            const additionalInfoCell = newRow.insertCell(4);
            additionalInfoCell.textContent = JSON.stringify(detail, null, 2);
        }

        this.updatePageInfo();
    }

    // ページ情報の更新
    updatePageInfo() {
        const totalPages = Math.ceil(this.eventDataList.length / this.rowsPerPage);
        document.getElementById('page-info').textContent = `Page ${this.currentPage} of ${totalPages}`;
    }

    // 記録用にイベントデータを更新
    updateEventDataFromRecording() {
        this.eventDataList = window.recordingHandler.getEventData();
        this.currentPage = 1;
        this.renderTable();
    }

    // 再生用にイベントデータを更新
    updateEventDataFromPlayback(data) {
        this.eventDataList = data;
        this.currentPage = 1;
        this.renderTable();
    }

    // 外部からテーブルを更新するためのパブリックメソッド
    refreshTable() {
        this.updateEventDataFromRecording();
    }

    // データをクリア
    clearData() {
        this.eventDataList = [];
        this.currentPage = 1;
        this.renderTable();
    }

    // フォームの値を取得
    getFormValues() {
        return {
            url: document.getElementById('url-input').value,
            title: document.getElementById('title-input').value || 'Untitled',
            explanation: document.getElementById('explanation-input').value || 'No explanation provided'
        };
    }

    // フォームの値を設定
    setFormValues(values) {
        if (values.url !== undefined) {
            document.getElementById('url-input').value = values.url;
        }
        if (values.title !== undefined) {
            document.getElementById('title-input').value = values.title;
        }
        if (values.explanation !== undefined) {
            document.getElementById('explanation-input').value = values.explanation;
        }
    }

    // エラーメッセージの表示
    showError(message) {
        alert(`エラー: ${message}`);
    }

    // 成功メッセージの表示
    showSuccess(message) {
        console.log(`成功: ${message}`);
        // 必要に応じてユーザーに表示する仕組みを追加
    }
}

// グローバルインスタンス
window.uiHandler = new UIHandler();
