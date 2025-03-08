const axios = require('axios');

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
    // 順位帯の分類
    if (item.gRanking >= 1 && item.gRanking <= 3) {
      rankCounts['1-3']++;
    } else if (item.gRanking >= 4 && item.gRanking <= 10) {
      rankCounts['4-10']++;
    } else if (item.gRanking >= 11 && item.gRanking <= 50) {
      rankCounts['11-50']++;
    } else {
      rankCounts['others']++;
    }

    // 順位変化の分類
    if (item.gChange) {
      if (item.gChange < 0) { // 順位上昇
        changeStats.improved++;
        if (item.gChange <= -3) { // 3位以上上昇
          changeStats.bigWinners.push({
            keyword: item.keyword,
            ranking: item.gRanking,
            change: item.gChange
          });
        }
      } else if (item.gChange > 0) { // 順位下降
        changeStats.worsened++;
        if (item.gChange >= 3) { // 3位以上下降
          changeStats.bigLosers.push({
            keyword: item.keyword,
            ranking: item.gRanking,
            change: item.gChange
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

// Slackに通知する関数
async function sendToSlack({
                             message,
                             webhookUrl,
                             channel,
                             threadTs = "1740819204.046099",
                             broadcastToChannel = true,
                             username = "GMO順位チェッカー自動通知",
                             iconEmoji = ":rankneko:"
                           }) {
  if (!webhookUrl) {
    console.log('Slack Webhook URLが設定されていないため、通知をスキップします');
    return false;
  }

  const payload = {
    text: message,
    ...(channel && { channel }), // チャンネル指定
    ...(username && { username }), // ユーザー名指定
    ...(iconEmoji && { icon_emoji: iconEmoji }), // 絵文字指定
    ...(threadTs && {
      thread_ts: threadTs,
      ...(broadcastToChannel && { reply_broadcast: true })
    })
  };

  try {
    const response = await axios.post(webhookUrl, payload);
    if (response.status === 200) {
      console.log('Slack通知を送信しました');
      return response.data;
    } else {
      throw new Error(`ステータスコード: ${response.status}`);
    }
  } catch (error) {
    console.error('Slack通知の送信に失敗しました:', error.message);
    if (error.response) {
      console.error('レスポンス:', error.response.status, error.response.data);
    }
    throw error;
  }
}

/**
 * Slack通知用のメッセージを作成
 * @param {Object} analysis 解析結果
 * @param {string} date 日付
 * @returns {string} Slack通知用メッセージ
 */
function createAnalysisMessage(analysis, date) {
  const { rankPercent, rankCounts, changeStats, total } = analysis;

  let message = "";
  message += `GMO順位チェッカー順位計測結果（${date})\n`;
  message += `対象グループ：DM_SとAランクキーワード\n\n`;
  message += `■ 順位分布\n`;
  message += `1~3位  ：${rankPercent['1-3'].toFixed(2)}% (${rankCounts['1-3']}件)\n`;
  message += `4~10位 ：${rankPercent['4-10'].toFixed(2)}% (${rankCounts['4-10']}件)\n`;
  message += `11~50位：${rankPercent['11-50'].toFixed(2)}% (${rankCounts['11-50']}件)\n`;
  message += `それ以下：${rankPercent.others.toFixed(2)}%(${rankCounts.others}件)\n\n`;

  message += `■ 順位変化\n`;
  message += `上昇：${changeStats.improved}件 (${((changeStats.improved / total) * 100).toFixed(2)}%)\n`;
  message += `下降：${changeStats.worsened}件 (${((changeStats.worsened / total) * 100).toFixed(2)}%)\n`;
  message += `変化なし：${changeStats.unchanged}件 (${((changeStats.unchanged / total) * 100).toFixed(2)}%)\n\n`;

  // 大きく順位が上昇したキーワード
  if (changeStats.bigWinners.length > 0) {
    message += `■ 大きく上昇したキーワード（3位以上）\n`;
    changeStats.bigWinners
      .sort((a, b) => a.change - b.change) // 最も大きく上昇した順
      .slice(0, 5) // 上位5件のみ表示
      .forEach(item => {
        message += `・${item.keyword}: ${item.ranking}位 (↑${Math.abs(item.change)})\n`;
      });
    message += `\n`;
  }

  // 大きく順位が下降したキーワード
  if (changeStats.bigLosers.length > 0) {
    message += `■ 大きく下降したキーワード（3位以上）\n`;
    changeStats.bigLosers
      .sort((a, b) => b.change - a.change) // 最も大きく下降した順
      .slice(0, 5) // 上位5件のみ表示
      .forEach(item => {
        message += `・${item.keyword}: ${item.ranking}位 (↓${item.change})\n`;
      });
  }

  return message;
}



module.exports = {
  delay,
  analyzeRankData,
  sendToSlack,
  createAnalysisMessage
};