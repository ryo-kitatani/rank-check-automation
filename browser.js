const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { delay } = require('./utils');
const { env } = require('process');

// ブラウザを初期化し、セッションを開始
async function initBrowser() {
  console.log('ブラウザを起動中...');
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
    headless: 'new', // 'new'は新しいヘッドレスモード（検出されにくい）
    defaultViewport: null,
    args: [
      '--window-size=1920,1080', // 一般的な画面サイズに変更
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--hide-scrollbars',
      '--disable-notifications',
      '--disable-extensions',
      '--disable-infobars',
      '--ignore-certificate-errors',
      '--timezone=Asia/Tokyo' // Chromiumブラウザに直接タイムゾーンを指定
    ],
    env: {
      TZ: 'Asia/Tokyo', // タイムゾーンを日本に設定
      ...process.env
    }
  });

  const page = await browser.newPage();
  // ページ単位でもタイムゾーンを設定（より確実）
  await page.emulateTimezone('Asia/Tokyo');

  // ブラウザのふりをする
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  // 追加ヘッダーを設定
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1'
  });

  // Cookieとキャッシュを有効化（一般的なブラウザ動作）
  await page.setJavaScriptEnabled(true);
  await page.setCacheEnabled(true);

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
  await page.goto('https://app.rank-checker.com/login', {
    waitUntil: 'networkidle2',
    timeout: 10000
  });

  // Cloudflareのチャレンジがあれば待機
  await delay(5000);
  // ログインフォームが表示されるまで待機
  try {
    // 様々なセレクタを待つ
    await Promise.race([
      page.waitForSelector('#email', { timeout: 10000 }),
      page.waitForSelector('input[type="email"]', { timeout: 10000 }),
      page.waitForSelector('input[type="text"]', { timeout: 10000 })
    ]);
    console.log('ログインフォームの要素が見つかりました');
  } catch (e) {
    console.log('ログインフォームの要素が見つかりませんでした。ページ内容を確認します');

    // 実際に画面に何が表示されているか確認
    const visibleText = await page.evaluate(() => {
      return document.body.innerText;
    });
    console.log('ページに表示されているテキスト:', visibleText.substring(0, 500) + '...');

    // 何か防御メカニズムが表示されているか
    const hasCaptcha = await page.evaluate(() => {
      return document.body.innerHTML.includes('captcha') ||
        document.body.innerHTML.includes('Cloudflare') ||
        document.body.innerHTML.includes('challenge');
    });

    if (hasCaptcha) {
      console.log('CAPTCHA or Cloudflare challenge detected!');
    }
  }

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

  await delay(10000);

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

    console.log(`グループ「${groupName}」を正常に選択しました`);
    return true;

  } catch (error) {
    console.error(`グループ選択中にエラーが発生: ${error.message}`);

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
      if (downloadButton) {
        downloadButton.click();
        return true;
      }
      return false;
    });

    if (!downloadButtonClicked) {
      console.log('データ出力/ダウンロードボタンが見つかりませんでした');
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
      return false;
    }

    // ダウンロード完了を待つ
    console.log('CSVダウンロードを待機中...');
    await delay(5000);

    console.log('CSVダウンロード処理が完了しました');
    return true;

  } catch (error) {
    console.error('CSVダウンロード中にエラーが発生しました:', error.message);
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