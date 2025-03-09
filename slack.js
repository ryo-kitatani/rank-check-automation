const axios = require('axios');

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
    // if (webhookUrl) {
    //   console.log('Slack通知テストを送信します');
    //   console.log(message)
    //   return false;
    // }

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
  message += `■ 順位分布 [<https://docs.google.com/spreadsheets/d/1suoQqpEBwvVYYVTM5LKjAUP6m0XQE0iO22Apnd7Mu4s/edit?gid=1149902036#gid=1149902036|確認>]\n`;
  message += `1~3位  ：${rankPercent['1-3'].toFixed(2)}% (${rankCounts['1-3']}件)\n`;
  message += `4~10位 ：${rankPercent['4-10'].toFixed(2)}% (${rankCounts['4-10']}件)\n`;
  message += `11~50位：${rankPercent['11-50'].toFixed(2)}% (${rankCounts['11-50']}件)\n`;
  message += `それ以下：${rankPercent.others.toFixed(2)}%(${rankCounts.others}件)\n\n`;

  message += `■ 順位変化 [<https://docs.google.com/spreadsheets/d/1suoQqpEBwvVYYVTM5LKjAUP6m0XQE0iO22Apnd7Mu4s/edit?gid=1829259217#gid=1829259217|確認]>\n`;
  message += `上昇：${changeStats.improved}件 (${((changeStats.improved / total) * 100).toFixed(2)}%)\n`;
  message += `下降：${changeStats.worsened}件 (${((changeStats.worsened / total) * 100).toFixed(2)}%)\n`;
  message += `変化なし：${changeStats.unchanged}件 (${((changeStats.unchanged / total) * 100).toFixed(2)}%)\n\n`;

  // 大きく順位が上昇したキーワード
  if (changeStats.bigWinners.length > 0) {
    message += `■ 大きく上昇したキーワード（3位以上）\n`;
    changeStats.bigWinners
      .sort((a, b) => a.change - b.change) // 最も大きく上昇した順
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
      .forEach(item => {
        message += `・${item.keyword}: ${item.ranking}位 (↓${item.change})\n`;
      });
  }

  return message;
}

module.exports = {
  sendToSlack,
  createAnalysisMessage
};