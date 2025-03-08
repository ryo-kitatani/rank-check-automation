const { google } = require('googleapis');
const { config } = require('./config');

/**
 * Googleスプレッドシートにランキングデータを書き込む
 * @param {Array} rankData - ランキングデータの配列
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} date - 日付
 */
async function writeToGoogleSheets(rankData, spreadsheetId, date) {
  try {
    // Google認証設定
    const auth = new google.auth.GoogleAuth({
      keyFile: config.googleSheets.keyFilePath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    console.log(`スプレッドシート(ID: ${spreadsheetId})からデータを取得中...`);

    // スプレッドシートの情報を取得
    const spreadsheetInfo = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    // 最初のシートIDを取得
    const sheetId = spreadsheetInfo.data.sheets[0].properties.sheetId;

    // スプレッドシートの値を取得
    const valueResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'GMO順位チェッカー', // シート名を調整
    });

    const values = valueResponse.data.values || [];

    // ヘッダー行が存在するか確認
    let hasHeader = false;
    if (values.length > 0 && values[0].length > 0) {
      hasHeader = values[0][0] === 'キーワード';
    }

    // ヘッダーがない場合は作成
    if (!hasHeader || values.length === 0) {
      console.log('ヘッダー行を作成します...');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'GMO順位チェッカー!A1',
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [['キーワード']]
        }
      });

      // ヘッダーを追加した後は値を再取得
      const refreshedValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'GMO順位チェッカー',
      });

      values.splice(0, values.length, ...(refreshedValues.data.values || []));
    }

    // 既にB列にデータがあるかどうかをチェック
    const hasBColumn = values.length > 0 && values[0].length > 1;

    console.log(`B列データの存在: ${hasBColumn ? 'あり' : 'なし'}`);

    // 新しい列を挿入する（既にB列にデータがある場合はB列の左に、なければB列に）
    if (hasBColumn) {
      console.log('既存データの左側に新しい列を挿入します...');

      // B列の左側（インデックス1）に新しい列を挿入
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 1, // B列の位置（0-indexed）
                  endIndex: 2, // 1列挿入
                },
                inheritFromBefore: false,
              },
            },
          ],
        },
      });
    }

    console.log('日付を設定します...');

    // B1に日付を設定
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'GMO順位チェッカー!B1',
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [[date]]
      }
    });

    // キーワードとその行番号をマッピング
    const keywordRows = {};

    // A列からキーワードを抽出（ヘッダー行はスキップ）
    for (let i = 1; i < values.length; i++) {
      if (values[i] && values[i][0]) {
        keywordRows[values[i][0]] = i + 1; // 1-indexedの行番号
      }
    }

    console.log(`${rankData.length}件のキーワードデータを更新します...`);

    // バッチ更新のためのデータ準備
    const valueRanges = [];
    const newKeywords = [];

    // 各キーワードの順位データを準備
    for (const item of rankData) {
      const { keyword, gRanking } = item;

      // キーワードがスプレッドシートにあるか確認
      let rowIndex = keywordRows[keyword];

      if (rowIndex) {
        // 既存キーワードの更新（B列に順位を設定）
        valueRanges.push({
          range: `GMO順位チェッカー!B${rowIndex}`,
          values: [[gRanking]]
        });
      } else {
        // 新しいキーワードをリストに追加
        newKeywords.push([keyword, gRanking]);
      }
    }

    // 既存データのバッチ更新
    if (valueRanges.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: 'USER_ENTERED',
          data: valueRanges
        }
      });
      console.log(`${valueRanges.length}件の既存キーワードを更新しました`);
    }

    // 新しいキーワードの追加
    if (newKeywords.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'GMO順位チェッカー!A:B',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: newKeywords
        }
      });
      console.log(`${newKeywords.length}件の新しいキーワードを追加しました`);
    }

    console.log('Googleスプレッドシートにデータを書き込みました');
    return true;
  } catch (error) {
    console.error('Googleスプレッドシートへの書き込み中にエラーが発生しました:', error);
    throw error;
  }
}

module.exports = {
  writeToGoogleSheets
};