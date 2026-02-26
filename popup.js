// popup.js - メインコントローラー

// すべてのハンドラーが読み込まれるまで待機
document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup initialized with modular structure');
    
    // 初期化完了後の処理
    if (window.uiHandler && window.recordingHandler && window.playbackHandler) {
        console.log('All handlers loaded successfully');
        
        // 初期テーブル表示
        window.uiHandler.renderTable();
        
        // 記録ハンドラーのUI更新メソッドを設定
        window.recordingHandler.updateUI = () => {
            window.uiHandler.refreshTable();
        };
    } else {
        console.error('One or more handlers failed to load');
    }
});

// グローバル関数として利用可能にする（後方互換性のため）
window.renderTable = () => {
    if (window.uiHandler) {
        window.uiHandler.renderTable();
    }
};
