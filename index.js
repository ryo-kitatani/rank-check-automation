const path = require('path');
const { config, validateConfig, logConfig } = require('./config');
const browser = require('./browser');
const csvParser = require('./csvParser');
const { analyzeRankData, sendToSlack, createAnalysisMessage, delay } = require('./utils');

// ダウンロードディレクトリのパス
const downloadPath = path.join(__dirname, 'downloads');

// メイン処理
async function main() {
  console.log('GMO順位チェッカー CSVダウンロード自動化スクリプトを開始します...');

  // 設定の検証
  if (!validateConfig()) {
    process.exit(1);
  }

  // 設定のログ出力
  logConfig();

  let browserInstance = null;

  try {
    // ブラウザの初期化
    const { browser: instance, page } = await browser.initBrowser(config.headless);
    browserInstance = instance;

    // ダウンロードディレクトリの設定
    await browser.setupDownloadDir(page, downloadPath);

    // ログイン
    await browser.login(page, config.email, config.password);

    // ランキングページに移動
    await browser.navigateToGroup(page, 'DM_SとAランクキーワード');

    // CSVダウンロードボタンをクリック
    await browser.downloadCsv(page);

    // ダウンロードを待機
    await delay(3000);

    // ダウンロードしたCSVファイルを検索
    let downloadFileName = csvParser.findLatestCsvFile(downloadPath);

    // CSVファイルを分析
    let rankData = [];
    if (downloadFileName) {
      const csvFilePath = path.join(downloadPath, downloadFileName);
      rankData = csvParser.parseRankingCsv(csvFilePath);

      // ここからGoogleスプレッドシートへの書き込み処理を追加
      if (config.googleSheets && config.googleSheets.enabled) {
        try {
          console.log('Googleスプレッドシートにデータを書き込みます...');
          await writeToGoogleSheets(
            rankData,
            config.googleSheets.spreadsheetId || '1suoQqpEBwvVYYVTM5LKjAUP6m0XQE0iO22Apnd7Mu4s',
            config.date
          );
          console.log('Googleスプレッドシートへの書き込みが完了しました');
        } catch (sheetsError) {
          console.error('Googleスプレッドシートへの書き込み中にエラーが発生しました:', sheetsError);
          // スプレッドシートのエラーがあっても処理を続行
        }
    } else {
      console.error('CSVファイルが見つかりませんでした');
    }

    // ランキングデータを分析
    const result = analyzeRankData(rankData);

    // 分析結果をSlackに通知
    if (config.slackWebhook) {
      await sendToSlack({
        message: createAnalysisMessage(result, config.date),
        webhookUrl: config.slackWebhook,
        channel: "#coeteco-dm-product"
      });
    }

    console.log('処理が完了しました');
    return { success: true, result };
  } catch (error) {
    console.error('エラーが発生しました:', error.message);

    // エラーをSlackに通知
    if (config.slackWebhook) {
      try {
        await sendToSlack({
          message: `エラーが発生しました: ${error.message}`,
          webhookUrl: config.slackWebhook,
          channel: "#coeteco-dm-product"
        });
      } catch (slackError) {
        console.error('Slack通知エラー:', slackError.message);
      }
    }

    return { success: false, error: error.message };
  } finally {
    // ブラウザを閉じる
    if (browserInstance) {
      await browserInstance.close();
    }
  }
}

// スクリプト実行
(async () => {
  try {
    const result = await main();
    if (result.success) {
      console.log('スクリプトが正常に完了しました。');
      process.exit(0);
    } else {
      console.error('スクリプト実行エラー:', result.error);
      process.exit(1);
    }
  } catch (error) {
    console.error('予期せぬエラーが発生しました:', error);
    process.exit(1);
  }
})();