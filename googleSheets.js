const {google} = require('googleapis');
const {config} = require('./config');

/**
 * Google認証と接続を準備する関数
 * @returns {Object} 認証済みのGoogle Sheetsクライアント
 */
async function getGoogleSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.googleSheets.keyFilePath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  return google.sheets({version: 'v4', auth: client});
}

/**
 * スプレッドシートの基本情報を取得する関数
 * @param {Object} sheets - Google Sheetsクライアント
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} sheetName - シート名
 * @returns {Object} シートの情報とデータ値
 */
async function getSheetInfo(sheets, spreadsheetId, sheetName) {
  // スプレッドシートの情報を取得
  const spreadsheetInfo = await sheets.spreadsheets.get({
    spreadsheetId,
  });

  // 指定されたシート名に対応するシートIDを検索
  let sheetId = null;
  for (const sheet of spreadsheetInfo.data.sheets) {
    if (sheet.properties.title === sheetName) {
      sheetId = sheet.properties.sheetId;
      break;
    }
  }

  // シートが見つからない場合はエラー
  if (sheetId === null) {
    throw new Error(`シート "${sheetName}" が見つかりません`);
  }

  // スプレッドシートの値を取得
  const valueResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}`,
  });

  return {
    sheetId,
    values: valueResponse.data.values || []
  };
}

/**
 * 日付列の挿入と準備を行う関数
 * @param {Object} sheets - Google Sheetsクライアント
 * @param {Object} sheetInfo - シート情報
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} sheetName - シート名
 * @param {string} date - 日付
 * @returns {boolean} 成功したかどうか
 */
async function prepareNewDateColumn(sheets, sheetInfo, spreadsheetId, sheetName, date) {
  const {sheetId, values} = sheetInfo;

  // 既にB列にデータがあるかどうかをチェック
  const hasBColumn = values.length > 0 && values[0].length > 1;
  const hasTodayColumn = values.length > 0 && values[0][1] === date;

  if (hasTodayColumn) {
    console.log('今日の日付のデータが既に存在します');
    return false;
  }

  // 新しい列を挿入する（既にB列にデータがある場合はB列の左に、なければB列に）
  if (hasBColumn) {
    console.log('既存データの左側に新しい列を挿入します...');
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

  // B1に日付を設定
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!B1`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [[date]]
    }
  });

  return true;
}

/**
 * Googleスプレッドシートにランキングデータを書き込む
 * @param {Array} rankData - ランキングデータの配列
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} date - 日付
 * @param {string} sheetName - シート名
 */
async function writeToGoogleSheets(rankData, spreadsheetId, date, sheetName) {
  try {
    const sheets = await getGoogleSheetsClient();
    console.log(`スプレッドシート(ID: ${spreadsheetId})からデータを取得中...`);

    const sheetInfo = await getSheetInfo(sheets, spreadsheetId, sheetName);
    const {values} = sheetInfo;

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
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [['キーワード']]
        }
      });

      // ヘッダーを追加した後は値を再取得
      const refreshedValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}`,
      });

      values.splice(0, values.length, ...(refreshedValues.data.values || []));
    }

    // 新しい日付列を準備
    const success = await prepareNewDateColumn(sheets, sheetInfo, spreadsheetId, sheetName, date);
    if (!success) return false;

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
      const {keyword, gRanking} = item;

      // キーワードがスプレッドシートにあるか確認
      let rowIndex = keywordRows[keyword];

      if (rowIndex) {
        // 既存キーワードの更新（B列に順位を設定）
        valueRanges.push({
          range: `${sheetName}!B${rowIndex}`,
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
        range: `${sheetName}!A:B`,
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
    console.error('Googleスプレッドシートへの書き込み中にエラーが発生しました:');
    throw error;
  }
}

/**
 * Googleスプレッドシートに割合データを書き込む
 * @param {Object} result - analyzeRankData関数からの解析結果
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} date - 日付
 * @param {string} sheetName - シート名
 */
async function writePercentageToGoogleSheets(result, spreadsheetId, date, sheetName) {
  try {
    const sheets = await getGoogleSheetsClient();
    console.log(`割合データをスプレッドシート(ID: ${spreadsheetId})に書き込み中...`);

    const sheetInfo = await getSheetInfo(sheets, spreadsheetId, sheetName);
    const { values } = sheetInfo;

    // ヘッダー行が存在するか確認
    let hasHeader = false;
    if (values.length > 0 && values[0].length > 0) {
      hasHeader = values[0][0] === '割合';
    }

    // ヘッダーがない場合は作成
    if (!hasHeader || values.length === 0) {
      console.log('割合データのヘッダー行を作成します...');
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:A5`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: [
            ['割合'],
            ['1~3位'],
            ['4~10位'],
            ['11~50位'],
            ['それ以下']
          ]
        }
      });

      // ヘッダーを追加した後は値を再取得
      const refreshedValues = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}`,
      });

      values.splice(0, values.length, ...(refreshedValues.data.values || []));
    }

    // 新しい日付列を準備
    const success = await prepareNewDateColumn(sheets, sheetInfo, spreadsheetId, sheetName, date);
    if (!success) return false;

    // 解析結果から割合データを取得（小数点第一位までを文字列に変換）
    const percent1to3 = result.rankPercent['1-3'].toFixed(2);
    const percent4to10 = result.rankPercent['4-10'].toFixed(2);
    const percent11to50 = result.rankPercent['11-50'].toFixed(2);
    const percentBelow = result.rankPercent['others'].toFixed(2);

    console.log(`割合データ: 1~3位: ${percent1to3}%, 4~10位: ${percent4to10}%, 11~50位: ${percent11to50}%, それ以下: ${percentBelow}%`);

    // B2:B5にデータを設定
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!B2:B5`,
      valueInputOption: 'USER_ENTERED',
      resource: {
        values: [
          [percent1to3],
          [percent4to10],
          [percent11to50],
          [percentBelow]
        ]
      }
    });

    console.log('割合データをGoogleスプレッドシートに書き込みました');
    return true;
  } catch (error) {
    console.error('割合データのスプレッドシートへの書き込み中にエラーが発生しました:', error);
    throw error;
  }
}

module.exports = {
  writeToGoogleSheets,
  writePercentageToGoogleSheets
};