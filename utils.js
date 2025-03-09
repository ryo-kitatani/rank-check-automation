// 独自の遅延関数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 順位データを解析して統計情報を生成する
 * @param {Array} rankData ランキングデータの配列
 * @returns {Object} 解析結果
 */
// ランキングデータを分析する関数
function analyzeRankData(rankData) {
  const rankCounts = {
    '1-3': 0,
    '4-10': 0,
    '11-50': 0,
    'others': 0
  };

  // 順位変化の統計
  const changeStats = {
    improved: 0,    // 上昇したキーワード数
    worsened: 0,    // 下降したキーワード数
    unchanged: 0,   // 変化なしのキーワード数
    bigWinners: [], // 大きく上昇したキーワード（3位以上）
    bigLosers: []   // 大きく下降したキーワード（3位以上）
  };

  // 各キーワードの順位を分類
  rankData.forEach(item => {
    const ranking = item.gRanking === "-" ? 100 : parseInt(item.gRanking);

    // 順位帯の分類
    if (ranking >= 1 && ranking <= 3) {
      rankCounts['1-3']++;
    } else if (ranking >= 4 && ranking <= 10) {
      rankCounts['4-10']++;
    } else if (ranking >= 11 && ranking <= 50) {
      rankCounts['11-50']++;
    } else {
      rankCounts['others']++;
    }

    // 順位変化の分類
    if (item.gChange !== undefined && item.gChange !== null) {
      const change = parseInt(item.gChange);

      if (change > 0) { // 順位上昇（CSVでは正の数値が上昇を示す）
        changeStats.improved++;
        if (change >= 3) { // 3位以上上昇
          changeStats.bigWinners.push({
            keyword: item.keyword,
            ranking: ranking,
            change: change
          });
        }
      } else if (change < 0) { // 順位下降（CSVでは負の数値が下降を示す）
        changeStats.worsened++;
        if (change <= -3) { // 3位以上下降
          changeStats.bigLosers.push({
            keyword: item.keyword,
            ranking: ranking,
            change: change
          });
        }
      } else { // 変化なし
        changeStats.unchanged++;
      }
    }
  });

  // パーセンテージの計算
  const total = rankData.length;
  const rankPercent = {
    '1-3': (rankCounts['1-3'] / total) * 100,
    '4-10': (rankCounts['4-10'] / total) * 100,
    '11-50': (rankCounts['11-50'] / total) * 100,
    'others': (rankCounts['others'] / total) * 100
  };

  return {
    rankCounts,
    rankPercent,
    changeStats,
    total
  };
}


module.exports = {
  delay,
  analyzeRankData,
};