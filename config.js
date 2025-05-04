require('dotenv').config();

// 環境変数から設定を読み込む
const config = {
  email: process.env.RANK_CHECKER_EMAIL,
  password: process.env.RANK_CHECKER_PASSWORD,
  slackWebhook: process.env.RANK_CHECKER_SLACK_WEBHOOK_URL,
  // 今日の日付（YYYY-MM-DD形式）
  date: new Date().toISOString().split('T')[0],
  // Google Sheets APIの設定を追加
  googleSheets: {
    spreadsheetId: 'suoQqpEBwvVYYVTM5LKjAUP6m0XQE0iO22Apnd7Mu4s',
    percentSpreadsheetId: '1suoQqpEBwvVYYVTM5LKjAUP6m0XQE0iO22Apnd7Mu4s',
    // サービスアカウントのキーファイルパス
    keyFilePath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
  },
  headless: true
};

// 設定の検証
function validateConfig() {
  if (!config.email || !config.password) {
    console.error('環境変数が正しく設定されていません。');
    console.error('RANK_CHECKER_EMAIL, RANK_CHECKER_PASSWORD を設定してください。');
    return false;
  }
  return true;
}

// 設定情報をログ出力
function logConfig() {
  console.log('環境設定:', {
    email: config.email ? '設定済み' : '未設定',
    password: config.password ? '設定済み' : '未設定',
    slackWebhook: config.slackWebhook ? '設定済み' : '未設定',
    date: config.date
  });
}

module.exports = {
  config,
  validateConfig,
  logConfig
};