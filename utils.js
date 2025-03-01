const axios = require('axios');

// 独自の遅延関数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ランキングデータを分析する関数
function analyzeRankData(data) {
  const rankCounts = {
    '1-3': 0,
    '4-10': 0,
    '11-50': 0,
    'others': 0
  };

  const totalCount = data.length;

  if (totalCount === 0) {
    console.warn('データが見つかりませんでした。ダミーデータを使用します。');
    // ダミーデータを返す
    return {
      '1-3': 0,
      '4-10': 0,
      '11-50': 0,
      'others': 100
    };
  }

  // データを処理
  for (const item of data) {
    const rank = item.gRanking;

    if (rank >= 1 && rank <= 3) {
      rankCounts['1-3']++;
    } else if (rank >= 4 && rank <= 10) {
      rankCounts['4-10']++;
    } else if (rank >= 11 && rank <= 50) {
      rankCounts['11-50']++;
    } else {
      rankCounts.others++;
    }
  }

  // パーセンテージの計算
  const rankPercent = {};
  for (const [key, count] of Object.entries(rankCounts)) {
    rankPercent[key] = (count / totalCount) * 100;
  }

  // 分析結果をコンソールに出力
  console.log(`総キーワード数: ${totalCount}`);
  console.log(`1~3位: ${rankPercent['1-3'].toFixed(2)}% (${rankCounts['1-3']}件)`);
  console.log(`4~10位: ${rankPercent['4-10'].toFixed(2)}% (${rankCounts['4-10']}件)`);
  console.log(`11~50位: ${rankPercent['11-50'].toFixed(2)}% (${rankCounts['11-50']}件)`);
  console.log(`それ以下: ${rankPercent.others.toFixed(2)}% (${rankCounts.others}件)`);

  return {
    rankPercent,
    rankCounts
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

// 分析結果からSlackメッセージを生成
function createAnalysisMessage(analysis, rankCount, date) {
  let message = ""
  message += `GMO順位チェッカー順位計測結果（${date})\n`
  message += `対象グループ：DM_SとAランクキーワード\n\n`
  message += `1~3位  ：${analysis['1-3'].toFixed(2)}% (${rankCount['1-3']}件)\n`
  message += `4~10位 ：${analysis['4-10'].toFixed(2)}% (${rankCount['4-10']}件)\n`
  message += `11~50位：${analysis['11-50'].toFixed(2)}% (${rankCount['11-50']}件)\n`
  message += `それ以下：${analysis.others.toFixed(2)}%(${rankCount.others}件)\n`
  return message;
}

module.exports = {
  delay,
  analyzeRankData,
  sendToSlack,
  createAnalysisMessage
};