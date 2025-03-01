const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

// CSVファイルを検索して最新のものを取得
function findLatestCsvFile(directory) {
  try {
    const files = fs.readdirSync(directory);
    const csvFiles = files.filter(file => file.endsWith('.csv'));

    if (csvFiles.length === 0) {
      console.log('ディレクトリ内にCSVファイルが見つかりません');
      return null;
    }

    // 最新のCSVファイルを使用
    csvFiles.sort((a, b) => {
      return fs.statSync(path.join(directory, b)).mtime.getTime() -
        fs.statSync(path.join(directory, a)).mtime.getTime();
    });

    return csvFiles[0];
  } catch (error) {
    console.error('CSVファイル検索中にエラーが発生しました:', error);
    return null;
  }
}

// CSVファイルを解析してランキングデータを抽出
function parseRankingCsv(filePath) {
  try {
    console.log(`CSVファイルの分析: ${filePath}`);

    // CSVファイルを読み込む
    const csvContent = fs.readFileSync(filePath, 'utf8');

    // CSVパースオプション
    const options = {
      columns: true,
      skip_empty_lines: true,
      trim: true
    };

    // CSVパース
    const records = parse(csvContent, options);
    console.log(`CSVから${records.length}件のレコードを読み込みました`);

    if (records.length === 0) {
      console.error('CSVファイルにデータがありません');
      return [];
    }

    // G順位の列名を特定
    const columnNames = Object.keys(records[0]);
    let gRankingColumn = findGRankingColumn(records, columnNames);

    if (gRankingColumn) {
      console.log(`G順位の列を特定しました: ${gRankingColumn}`);

      // データ変換
      const keywords = findKeywordColumn(records, columnNames);
      const rankData = records.map(record => ({
        keyword: record[keywords] || '',
        gRanking: parseInt(record[gRankingColumn], 10)
      })).filter(item => item.keyword && !isNaN(item.gRanking));

      console.log(`変換後のデータ: ${rankData.length}件`);
      return rankData;
    } else {
      console.error('G順位の列が見つかりませんでした。列名:', columnNames);
      throw new Error('G順位の列が見つかりませんでした');
    }
  } catch (error) {
    console.error('CSVファイルの処理中にエラーが発生しました:', error);
    return [];
  }
}

// G順位の列を特定する
function findGRankingColumn(records, columnNames) {
  // 可能性のある列名
  const possibleColumnNames = [
    'G順位', 'G_順位', 'Google順位', 'Google_順位',
    'g_ranking', 'google_ranking', 'ranking', '順位',
    'g_rank', 'google_rank', 'grank', 'rank'
  ];

  // まず、既知の列名パターンをチェック
  for (const col of possibleColumnNames) {
    if (columnNames.includes(col)) {
      return col;
    }
  }

  // 部分一致で列名をチェック
  for (const col of columnNames) {
    if (col.toLowerCase().includes('順位') ||
      col.toLowerCase().includes('rank')) {
      return col;
    }
  }

  // 数字を含む可能性のある列を探す
  for (const col of columnNames) {
    // サンプルとして最初の10行を確認
    const checkRows = Math.min(10, records.length);
    let numericCount = 0;

    for (let i = 0; i < checkRows; i++) {
      const sampleValue = records[i][col];
      if (sampleValue && !isNaN(parseInt(sampleValue))) {
        numericCount++;
      }
    }

    // 80%以上の行で数値の場合、この列を使用
    if (numericCount / checkRows >= 0.8) {
      console.log(`数値を含む列を見つけました: ${col}`);
      return col;
    }
  }

  return null;
}

// キーワード列を特定する
function findKeywordColumn(records, columnNames) {
  // 可能性のある列名
  const possibleColumnNames = [
    'キーワード', 'keyword', 'key_word', 'query', '検索キーワード'
  ];

  // まず、既知の列名パターンをチェック
  for (const col of possibleColumnNames) {
    if (columnNames.includes(col)) {
      return col;
    }
  }

  // 部分一致で列名をチェック
  for (const col of columnNames) {
    if (col.toLowerCase().includes('キーワード') ||
      col.toLowerCase().includes('key') ||
      col.toLowerCase().includes('word') ||
      col.toLowerCase().includes('query')) {
      return col;
    }
  }

  // 最初の列が文字列ならそれを使用
  if (columnNames.length > 0) {
    const firstCol = columnNames[0];
    // サンプルとして最初の行を確認
    const sampleValue = records[0][firstCol];
    if (sampleValue && isNaN(parseInt(sampleValue))) {
      return firstCol;
    }
  }

  return columnNames[0] || ''; // デフォルトで最初の列
}

module.exports = {
  findLatestCsvFile,
  parseRankingCsv
};