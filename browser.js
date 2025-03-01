const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { delay } = require('./utils');

// スクリーンショット保存ディレクトリの定義
const screenshotDir = path.join(__dirname, 'screenshots');

// ブラウザを初期化し、セッションを開始
async function initBrowser(headless) {
  console.log('ブラウザを起動中...');
  const browser = await puppeteer.launch({
    headless: headless,
    defaultViewport: null,
    args: ['--window-size=1200,800', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // ブラウザのふりをする
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36');

  return { browser, page };
}

// ダウンロードディレクトリを設定
async function setupDownloadDir(page, downloadPath) {
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath);
  }

  // ダウンロードの設定
  const client = await page.target().createCDPSession();
  await client.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: downloadPath
  });

  return client;
}

// ログイン処理
async function login(page, email, password) {
  console.log('ログインページにアクセス中...');
  await page.goto('https://app.rank-checker.com/login', { waitUntil: 'networkidle2' });

  // Cloudflareのチャレンジがあれば待機
  await delay(5000);

  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }

  // スクリーンショットを撮って状態を確認（デバッグ用）
  await page.screenshot({ path: path.join(screenshotDir, 'login-page.png') });

  // ログインフォームに入力
  console.log('ログイン情報を入力中...');
  await page.type('#email', email);
  await page.type('#password', password);

  // ログインボタンをクリック
  console.log('ログイン中...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]')
  ]);

  await delay(2000);

  return true;
}

async function navigateToGroup(page, groupName) {
  console.log(`グループ「${groupName}」を選択中...`);

  try {
    // "グループ" タブをクリック
    const groupTabClicked = await page.evaluate(() => {
      const groupTab = Array.from(document.querySelectorAll('button.MuiTab-root'))
        .find(el => el.textContent.includes('グループ'));

      if (groupTab) {
        groupTab.click();
        return true;
      }
      return false;
    });

    if (!groupTabClicked) {
      console.log('グループタブが見つかりませんでした');
      return false;
    }

    // タブクリック後に少し待機
    await delay(1000);

    // 特定のグループ項目をクリック
    const targetGroupClicked = await page.evaluate((name) => {
      // グループ名を持つ要素を探す（.css-1k0psob クラスを持つ span 要素）
      const groupNameElements = document.querySelectorAll('.css-1k0psob');

      for (const element of groupNameElements) {
        if (element.textContent.trim() === name.trim()) {
          // 見つかったグループの親カード要素を取得
          const groupCard = element.closest('.MuiBox-root[data-index]');

          if (groupCard) {
            // クリックする要素
            element.click();

            // 念のため、グループカード自体もクリックを試みる
            groupCard.click();

            return true;
          }
        }
      }
      return false;
    }, groupName);

    if (!targetGroupClicked) {
      console.log(`グループ「${groupName}」が見つかりませんでした`);
      return false;
    }

    // クリック後の待機
    await delay(2000);

    // デバッグ用のスクリーンショット
    await page.screenshot({
      path: path.join(screenshotDir, 'group-selected.png'),
      fullPage: true
    });

    console.log(`グループ「${groupName}」を正常に選択しました`);
    return true;

  } catch (error) {
    console.error(`グループ選択中にエラーが発生: ${error.message}`);

    // エラー時のスクリーンショット
    await page.screenshot({
      path: path.join(screenshotDir, 'group-selection-error.png'),
      fullPage: true
    });

    return false;
  }
}

// CSVダウンロードボタンをクリック
/**
 * CSVダウンロードボタンをクリックする関数
 * @param {Object} page - Puppeteerのページオブジェクト
 * @returns {Promise<boolean>} - 成功した場合はtrue、失敗した場合はfalse
 */
async function downloadCsv(page) {
  console.log('CSVダウンロードボタンを探しています...');

  try {
    // ボタンが表示されるまで少し待つ
    await delay(2000);

    // データ出力ボタンをクリック
    const downloadButtonClicked = await page.evaluate(() => {
      // aria-label="データ出力"を持つ要素を探す
      const downloadButton = document.querySelector('span[aria-label="データ出力"]');
      if  (downloadButton) {
        downloadButton.click();
        return true;
      }
      return false;
    });

    if (!downloadButtonClicked) {
      console.log('データ出力/ダウンロードボタンが見つかりませんでした');

      // ページの状態を記録
      await page.screenshot({ path: './screenshots/download-button-not-found.png' });
      return false;
    }

    // ポップアップが表示されるまで待機
    console.log('ポップアップの表示を待機中...');
    await delay(2000);

    // ポップアップ内のデータ出力ボタンをクリック
    const popupButtonClicked = await page.evaluate(() => {
      // 1. type="submit" かつ "データ出力" テキストを持つボタン
      let submitButton = document.querySelector('button[type="submit"] span');
      if (submitButton && submitButton.textContent.includes('データ出力')) {
        submitButton.closest('button').click();
        return true;
      }

      // 2. id="mui-550" または同様のIDを持つボタン
      submitButton = document.querySelector('button[id^="mui-"]');
      if (submitButton && submitButton.textContent.includes('データ出力')) {
        submitButton.click();
        return true;
      }

      // 3. クラス名で探す
      submitButton = document.querySelector('.MuiButton-containedPrimary');
      if (submitButton && submitButton.textContent.includes('データ出力')) {
        submitButton.click();
        return true;
      }

      // 4. どのテキストがデータ出力を含むボタン
      const buttons = Array.from(document.querySelectorAll('button'));
      const exportButton = buttons.find(btn =>
        btn.textContent && btn.textContent.includes('データ出力')
      );

      if (exportButton) {
        exportButton.click();
        return true;
      }

      return false;
    });

    if (!popupButtonClicked) {
      console.log('ポップアップ内の「データ出力」ボタンが見つかりませんでした');

      // ページの状態を記録
      await page.screenshot({ path: './screenshots/popup-button-not-found.png' });

      return false;
    }

    // ダウンロード完了を待つ
    console.log('CSVダウンロードを待機中...');
    await delay(5000);

    console.log('CSVダウンロード処理が完了しました');
    return true;

  } catch (error) {
    console.error('CSVダウンロード中にエラーが発生しました:', error.message);

    // エラー時のスクリーンショット
    await page.screenshot({ path: './screenshots/csv-download-error.png' });

    return false;
  }
}

module.exports = {
  initBrowser,
  setupDownloadDir,
  login,
  navigateToGroup,
  downloadCsv,
};