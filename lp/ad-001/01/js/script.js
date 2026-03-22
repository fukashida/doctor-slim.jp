

(function() {
    'use strict';

    // 設定
    const CONFIG = {
        storageKey: 'talkLabel_params',
        fbcTimestampKey: 'talkLabel_fbc_timestamp', // fbc用タイムスタンプ専用キー
        cookieExpireDays: 90, // 90日に延長（Facebook推奨期間）
        // 除外するパラメータ（システム用や一時的なもの）
        excludeParams: [
            '_ga',           // Google Analytics
            '_gid',          // Google Analytics
            '_gac_',         // Google Analytics
            '__hstc',        // HubSpot
            '__hssc',        // HubSpot
            '__hsfp',        // HubSpot
            '_hjid',         // Hotjar
            'timestamp',     // タイムスタンプ
            'url',           // URL
            'referrer',      // リファラー
            'random',        // ランダム値
            'cache',         // キャッシュ制御
            'v',             // バージョン
            'ver'            // バージョン
        ],
        // URLパラメータには含めないが、内部で保持する情報（セキュリティ・プライバシー考慮）
        internalOnlyParams: [
            'client_ip_address',     // IPアドレス（PII）
            'client_user_agent',     // User Agent（長すぎる）
            'referrer_url'           // リファラーURL（長い場合がある）
        ],
        // TalkLabel固有のパラメータ（上書き保護）
        protectedParams: ['flowPathId', 'basicId', 'liffId', 'clientId'],
        // クロスドメイン対応の有効化
        enableCrossDomain: true,
        // CAPI用のブラウザ情報パラメータ
        browserInfoParams: ['fbp', 'client_user_agent', 'client_ip_address', 'referrer_url',
            'browser_name', 'browser_version', 'os_name', 'os_version',
            'device_type', 'screen_width', 'screen_height', 'language']
    };

    // パラメータ管理クラス
    class TalkLabelParamManager {
        constructor() {
            this.params = {};
            this.initializeParams();
        }

        /**
         * 初期化処理
         */
        initializeParams() {
            // 1. 現在のURLからパラメータ取得
            this.extractUrlParams();

            // 2. ブラウザ情報の取得（CAPI用）
            this.extractBrowserInfo();

            // 3. 保存済みパラメータとマージ
            this.mergeStoredParams();

            // 4. 全ストレージに保存
            this.saveToAllStorages();

            // 5. イベントリスナー設定
            this.setupEventListeners();

            // 6. TalkLabelリンクにパラメータ付与
            this.updateTalkLabelLinks();

            // 7. DOM変更の監視開始
            this.observeDOMChanges();

            // 8. デバッグ情報出力
            this.logDebugInfo();
        }

        /**
         * URLからパラメータを抽出
         */
        extractUrlParams() {
            const currentParams = {};

            // URLSearchParamsから全パラメータを取得
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.forEach((value, key) => {
                // 除外リストに含まれていなければ保存
                if (!CONFIG.excludeParams.includes(key) && value) {
                    currentParams[key] = value;
                }
            });

            // ハッシュフラグメントからも取得（LIFF対応）
            if (window.location.hash) {
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                hashParams.forEach((value, key) => {
                    // 除外リストに含まれていなければ保存
                    if (!CONFIG.excludeParams.includes(key) && value && !currentParams[key]) {
                        currentParams[key] = value;
                    }
                });
            }

            // TalkLabelのLIFF URLをパース
            this.parseLiffUrl(currentParams);

            // fbcパラメータの生成（fbclidがある場合）
            if (currentParams.fbclid) {
                this.generateFbcParam(currentParams);
            }

            // 新規パラメータがある場合は更新
            if (Object.keys(currentParams).length > 0) {
                this.params = { ...this.params, ...currentParams };
                console.log('取得したパラメータ数:', Object.keys(currentParams).length);
            }
        }

        /**
         * LIFF URLの特殊なパラメータ処理
         */
        parseLiffUrl(currentParams) {
            const url = window.location.href;

            // LIFF URLパターンのマッチング
            const liffPattern = /liff\.line\.me\/(\d+-\w+)/;
            const match = url.match(liffPattern);

            if (match) {
                // LIFFIDが含まれている場合、それも保存
                const fullLiffId = match[1];
                if (!currentParams.liffId) {
                    currentParams.liffId = fullLiffId;
                }
            }

            // TalkLabelの流入経路IDを確実に取得
            if (!currentParams.flowPathId) {
                const flowPathMatch = url.match(/flowPathId=(\d+)/);
                if (flowPathMatch) {
                    currentParams.flowPathId = flowPathMatch[1];
                }
            }

            // Basic IDの取得
            if (!currentParams.basicId) {
                const basicIdMatch = url.match(/basicId=(@\w+)/);
                if (basicIdMatch) {
                    currentParams.basicId = basicIdMatch[1];
                }
            }
        }

        /**
         * fbcパラメータの生成（初回タイムスタンプを保持）
         */
        generateFbcParam(currentParams) {
            // 既存のfbcがあればそれを使用
            if (this.params.fbc) {
                currentParams.fbc = this.params.fbc;
                return;
            }

            // 保存済みのタイムスタンプを取得
            let fbcTimestamp = null;
            try {
                fbcTimestamp = localStorage.getItem(CONFIG.fbcTimestampKey);
            } catch (e) {
                console.warn('fbc timestamp取得エラー:', e);
            }

            // タイムスタンプがない場合は新規生成
            if (!fbcTimestamp) {
                fbcTimestamp = Date.now().toString();
                try {
                    localStorage.setItem(CONFIG.fbcTimestampKey, fbcTimestamp);
                } catch (e) {
                    console.warn('fbc timestamp保存エラー:', e);
                }
            }

            // Facebook推奨形式: fb.1.{timestamp}.{fbclid}
            currentParams.fbc = `fb.1.${fbcTimestamp}.${currentParams.fbclid}`;
            console.log('fbcパラメータ生成:', currentParams.fbc);
        }

        /**
         * ブラウザ情報の取得（CAPI用）
         */
        extractBrowserInfo() {
            const browserInfo = {};

            // 1. Facebook Pixel Cookie (_fbp) の取得
            browserInfo.fbp = this.getFbpCookie();

            // 2. User Agent（デバイス・ブラウザ情報）
            browserInfo.client_user_agent = navigator.userAgent;

            // 3. リファラー情報
            if (document.referrer) {
                browserInfo.referrer_url = document.referrer;

                // Facebook/Instagram経由かチェック
                if (document.referrer.includes('facebook.com') ||
                    document.referrer.includes('instagram.com') ||
                    document.referrer.includes('fb.com')) {
                    browserInfo.source_platform = document.referrer.includes('instagram') ? 'instagram' : 'facebook';
                }
            }

            // 4. ブラウザ情報の解析
            const parsedUA = this.parseUserAgent(navigator.userAgent);
            Object.assign(browserInfo, parsedUA);

            // 5. 画面情報
            browserInfo.screen_width = window.screen.width;
            browserInfo.screen_height = window.screen.height;
            browserInfo.viewport_width = window.innerWidth;
            browserInfo.viewport_height = window.innerHeight;

            // 6. 言語情報
            browserInfo.language = navigator.language || navigator.userLanguage;

            // 7. タイムゾーン
            try {
                browserInfo.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            } catch (e) {
                // タイムゾーン取得失敗時は無視
            }

            // 8. 接続情報（利用可能な場合）
            if (navigator.connection) {
                browserInfo.connection_type = navigator.connection.effectiveType;
            }

            // パラメータにマージ（既存値は上書きしない）
            Object.keys(browserInfo).forEach(key => {
                if (browserInfo[key] && !this.params[key]) {
                    this.params[key] = browserInfo[key];
                }
            });

            console.log('ブラウザ情報取得完了:', Object.keys(browserInfo).length, '個');

            // 9. クライアントIPアドレスの取得（非同期・オプション）
            // 注意: IPアドレスはプライバシー情報なので慎重に扱う
            // TalkLabel側で取得することも検討してください
            this.fetchClientIP();
        }

        /**
         * クライアントIPアドレスの取得（非同期）
         *
         * 重要な注意事項:
         * - IPアドレスは個人識別可能情報（PII）のため、URLパラメータには含めません
         * - CONFIG.internalOnlyParamsに登録されており、リンクには付与されません
         * - SessionStorage/LocalStorageにのみ保存され、getFacebookConversionData()で取得可能
         * - 推奨: TalkLabel側でサーバーから取得する方がより確実です
         */
        async fetchClientIP() {
            // 既にIPアドレスがある場合はスキップ
            if (this.params.client_ip_address) {
                return;
            }

            try {
                // ipify APIを使用（無料・制限あり）
                // 本番環境では独自のエンドポイントを使用することを推奨
                const response = await fetch('https://api.ipify.org?format=json', {
                    method: 'GET',
                    cache: 'no-cache'
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.ip) {
                        this.params.client_ip_address = data.ip;
                        this.saveToAllStorages();
                        // 注意: updateTalkLabelLinks()を呼んでもIPはURLに含まれません
                        console.log('クライアントIP取得成功（内部保持のみ）:', data.ip);
                    }
                }
            } catch (e) {
                // IPアドレス取得失敗は致命的ではないので警告のみ
                console.warn('クライアントIP取得失敗（TalkLabel側で取得されます）:', e.message);
            }
        }

        /**
         * Facebook Pixel Cookie (_fbp) の取得
         */
        getFbpCookie() {
            try {
                const cookies = document.cookie.split(';');
                for (let cookie of cookies) {
                    cookie = cookie.trim();
                    if (cookie.startsWith('_fbp=')) {
                        const fbp = cookie.substring(5);
                        console.log('_fbp cookie取得成功:', fbp);
                        return fbp;
                    }
                }
            } catch (e) {
                console.warn('_fbp cookie取得エラー:', e);
            }
            return null;
        }

        /**
         * User Agentの解析
         */
        parseUserAgent(ua) {
            const result = {};

            // OS検出
            if (ua.includes('Windows')) {
                result.os_name = 'Windows';
                const match = ua.match(/Windows NT (\d+\.\d+)/);
                if (match) result.os_version = match[1];
            } else if (ua.includes('Mac OS X')) {
                result.os_name = 'Mac OS X';
                const match = ua.match(/Mac OS X (\d+[._]\d+[._]\d+)/);
                if (match) result.os_version = match[1].replace(/_/g, '.');
            } else if (ua.includes('iPhone') || ua.includes('iPad')) {
                result.os_name = 'iOS';
                const match = ua.match(/OS (\d+_\d+(_\d+)?)/);
                if (match) result.os_version = match[1].replace(/_/g, '.');
                result.device_type = ua.includes('iPad') ? 'tablet' : 'mobile';
            } else if (ua.includes('Android')) {
                result.os_name = 'Android';
                const match = ua.match(/Android (\d+(\.\d+)?)/);
                if (match) result.os_version = match[1];
                result.device_type = ua.includes('Mobile') ? 'mobile' : 'tablet';
            } else if (ua.includes('Linux')) {
                result.os_name = 'Linux';
            }

            // ブラウザ検出
            if (ua.includes('Edg/')) {
                result.browser_name = 'Edge';
                const match = ua.match(/Edg\/(\d+\.\d+)/);
                if (match) result.browser_version = match[1];
            } else if (ua.includes('Chrome/') && !ua.includes('Edg')) {
                result.browser_name = 'Chrome';
                const match = ua.match(/Chrome\/(\d+\.\d+)/);
                if (match) result.browser_version = match[1];
            } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
                result.browser_name = 'Safari';
                const match = ua.match(/Version\/(\d+\.\d+)/);
                if (match) result.browser_version = match[1];
            } else if (ua.includes('Firefox/')) {
                result.browser_name = 'Firefox';
                const match = ua.match(/Firefox\/(\d+\.\d+)/);
                if (match) result.browser_version = match[1];
            }

            // デバイスタイプ（未設定の場合）
            if (!result.device_type) {
                result.device_type = ua.includes('Mobile') ? 'mobile' : 'desktop';
            }

            return result;
        }

        /**
         * 保存済みパラメータとマージ
         */
        mergeStoredParams() {
            // SessionStorageから取得（優先度: 高）
            const sessionData = this.getFromSessionStorage();

            // LocalStorageから取得（優先度: 中）
            const localData = this.getFromLocalStorage();

            // Cookieから取得（優先度: 低）
            const cookieData = this.getFromCookie();

            // マージ（古いデータから新しいデータの順で上書き）
            const mergedData = {
                ...cookieData,
                ...localData,
                ...sessionData,
                ...this.params  // 現在のURLパラメータが最優先
            };

            // 不要なメタデータを削除
            delete mergedData.url;
            delete mergedData.timestamp;
            delete mergedData.referrer;

            this.params = mergedData;
        }

        /**
         * SessionStorageから取得
         */
        getFromSessionStorage() {
            try {
                const data = sessionStorage.getItem(CONFIG.storageKey);
                if (data) {
                    const parsed = JSON.parse(data);
                    // 不要なメタデータを削除
                    delete parsed.url;
                    delete parsed.timestamp;
                    delete parsed.referrer;
                    return parsed;
                }
            } catch (e) {
                console.warn('SessionStorage読み込みエラー:', e);
            }
            return {};
        }

        /**
         * LocalStorageから取得
         */
        getFromLocalStorage() {
            try {
                const data = localStorage.getItem(CONFIG.storageKey);
                const timestamp = localStorage.getItem(CONFIG.storageKey + '_ts');

                if (data && timestamp) {
                    // 90日以上古いデータは無視
                    if ((Date.now() - parseInt(timestamp)) < 90 * 24 * 60 * 60 * 1000) {
                        const parsed = JSON.parse(data);
                        // 不要なメタデータを削除
                        delete parsed.url;
                        delete parsed.timestamp;
                        delete parsed.referrer;
                        return parsed;
                    }
                }
            } catch (e) {
                console.warn('LocalStorage読み込みエラー:', e);
            }
            return {};
        }

        /**
         * Cookieから取得
         */
        getFromCookie() {
            try {
                const name = CONFIG.storageKey + '=';
                const cookies = document.cookie.split(';');

                for (let cookie of cookies) {
                    cookie = cookie.trim();
                    if (cookie.indexOf(name) === 0) {
                        const value = decodeURIComponent(cookie.substring(name.length));
                        const parsed = JSON.parse(value);
                        // 不要なメタデータを削除
                        delete parsed.url;
                        delete parsed.timestamp;
                        delete parsed.referrer;
                        return parsed;
                    }
                }
            } catch (e) {
                console.warn('Cookie読み込みエラー:', e);
            }
            return {};
        }

        /**
         * 全ストレージに保存
         */
        saveToAllStorages() {
            if (Object.keys(this.params).length === 0) return;

            // パラメータのみを保存（メタデータは含めない）
            const dataToSave = { ...this.params };

            // SessionStorageに保存
            try {
                sessionStorage.setItem(CONFIG.storageKey, JSON.stringify(dataToSave));
            } catch (e) {
                console.warn('SessionStorage保存エラー:', e);
            }

            // LocalStorageに保存（タイムスタンプは別キーで管理）
            try {
                localStorage.setItem(CONFIG.storageKey, JSON.stringify(dataToSave));
                // 有効期限チェック用のタイムスタンプは別で保存
                localStorage.setItem(CONFIG.storageKey + '_ts', Date.now().toString());
            } catch (e) {
                console.warn('LocalStorage保存エラー:', e);
            }

            // Cookieに保存（データサイズを考慮）
            try {
                const cookieString = JSON.stringify(dataToSave);

                // Cookieのサイズ制限（4KB）を考慮
                if (cookieString.length < 3000) {
                    const expires = new Date();
                    expires.setDate(expires.getDate() + CONFIG.cookieExpireDays);

                    // クロスドメイン対応設定
                    let cookieOptions = `expires=${expires.toUTCString()}; path=/; `;

                    if (CONFIG.enableCrossDomain && window.location.protocol === 'https:') {
                        // クロスドメイン対応: SameSite=None; Secure（HTTPS必須）
                        cookieOptions += 'SameSite=None; Secure';
                    } else {
                        // 通常: SameSite=Lax（同一サイト内の遷移のみ）
                        cookieOptions += `SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
                    }

                    document.cookie = `${CONFIG.storageKey}=${encodeURIComponent(cookieString)}; ${cookieOptions}`;
                }
            } catch (e) {
                console.warn('Cookie保存エラー:', e);
            }
        }

        /**
         * イベントリスナーの設定
         */
        setupEventListeners() {
            // ページ離脱時に保存
            const saveHandler = () => this.saveToAllStorages();

            window.addEventListener('beforeunload', saveHandler);
            window.addEventListener('pagehide', saveHandler);

            // タブの表示/非表示切り替え時に保存
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.saveToAllStorages();
                }
            });

            // 定期的に保存（30秒ごと）
            setInterval(() => {
                this.saveToAllStorages();
            }, 30000);

            // ストレージイベントの監視（他のタブでの変更を検知）
            window.addEventListener('storage', (e) => {
                if (e.key === CONFIG.storageKey && e.newValue) {
                    try {
                        const newData = JSON.parse(e.newValue);
                        this.params = { ...this.params, ...newData };
                        console.log('他のタブからパラメータ更新:', newData);
                    } catch (error) {
                        console.warn('ストレージイベント処理エラー:', error);
                    }
                }
            });
        }

        /**
         * デバッグ情報をログ出力
         */
        logDebugInfo() {
            console.group('TalkLabel Parameter Manager 初期化完了');
            console.log('取得した全パラメータ:', this.params);
            console.log('パラメータ数:', Object.keys(this.params).length);
            console.log('保存先:', ['SessionStorage', 'LocalStorage', 'Cookie']);

            // 主要パラメータの確認
            const importantParams = ['flowPathId', 'basicId', 'liffId', 'fbclid', 'fbc', 'fbp', 'utm_source', 'gclid'];
            console.group('広告トラッキングパラメータ:');
            importantParams.forEach(param => {
                if (this.params[param]) {
                    console.log(`${param}:`, this.params[param]);
                }
            });
            console.groupEnd();

            // ブラウザ情報の確認
            const browserParams = ['client_user_agent', 'browser_name', 'browser_version',
                'os_name', 'os_version', 'device_type', 'language'];
            console.group('ブラウザ・デバイス情報:');
            browserParams.forEach(param => {
                if (this.params[param]) {
                    console.log(`${param}:`, this.params[param]);
                }
            });
            console.groupEnd();

            // その他の情報
            if (this.params.referrer_url || this.params.source_platform || this.params.client_ip_address) {
                console.group('追加情報:');
                if (this.params.referrer_url) console.log('referrer_url:', this.params.referrer_url);
                if (this.params.source_platform) console.log('source_platform:', this.params.source_platform);
                if (this.params.client_ip_address) console.log('client_ip_address:', this.params.client_ip_address);
                console.groupEnd();
            }

            console.groupEnd();
        }

        /**
         * ページ内のTalkLabelリンクにパラメータを付与
         */
        updateTalkLabelLinks() {
            // liff.line.meドメインのリンクを全て取得
            const links = document.querySelectorAll('a[href*="liff.line.me"]');
            let updatedCount = 0;

            links.forEach(link => {
                try {
                    const url = new URL(link.href);

                    // 保存されている全パラメータをリンクに追加
                    Object.keys(this.params).forEach(key => {
                        if (this.params[key]) {
                            // セキュリティ上の理由でURLパラメータに含めないもの
                            if (CONFIG.internalOnlyParams.includes(key)) {
                                return; // スキップ
                            }

                            // 保護されているパラメータは既存値を優先
                            if (CONFIG.protectedParams.includes(key)) {
                                if (!url.searchParams.has(key)) {
                                    url.searchParams.set(key, this.params[key]);
                                }
                            } else {
                                // その他のパラメータは常に追加/更新
                                url.searchParams.set(key, this.params[key]);
                            }
                        }
                    });

                    // 更新されたURLをセット
                    const newHref = url.toString();
                    if (link.href !== newHref) {
                        link.href = newHref;
                        updatedCount++;
                        console.log('リンク更新:', newHref);
                    }
                } catch (e) {
                    console.warn('リンク更新エラー:', e, link.href);
                }
            });

            if (updatedCount > 0) {
                console.log(`${updatedCount}個のTalkLabelリンクに${Object.keys(this.params).length}個のパラメータを付与しました`);
            }
        }

        /**
         * 動的に追加されるリンクも監視
         */
        observeDOMChanges() {
            // MutationObserverで動的に追加されるリンクも監視
            const observer = new MutationObserver((mutations) => {
                let hasNewLinks = false;

                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) { // Element node
                            if (node.tagName === 'A' && node.href && node.href.includes('liff.line.me')) {
                                hasNewLinks = true;
                            } else if (node.querySelectorAll) {
                                const links = node.querySelectorAll('a[href*="liff.line.me"]');
                                if (links.length > 0) {
                                    hasNewLinks = true;
                                }
                            }
                        }
                    });
                });

                if (hasNewLinks) {
                    // 少し遅延させて、DOMが完全に更新されてから処理
                    setTimeout(() => this.updateTalkLabelLinks(), 100);
                }
            });

            // 監視開始
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        /**
         * 特定のパラメータを取得
         */
        getParam(key) {
            return this.params[key] || null;
        }

        /**
         * 全パラメータを取得
         */
        getAllParams() {
            return { ...this.params };
        }

        /**
         * Facebook Conversion APIに送信するデータを準備
         */
        getFacebookConversionData() {
            return {
                // 広告トラッキングパラメータ
                fbclid: this.params.fbclid || null,
                fbc: this.params.fbc || null,
                fbp: this.params.fbp || null,

                // UTMパラメータ
                utm_source: this.params.utm_source || null,
                utm_medium: this.params.utm_medium || null,
                utm_campaign: this.params.utm_campaign || null,
                utm_content: this.params.utm_content || null,
                utm_term: this.params.utm_term || null,

                // TalkLabel固有パラメータ
                flowPathId: this.params.flowPathId || null,
                basicId: this.params.basicId || null,
                liffId: this.params.liffId || null,

                // ブラウザ・デバイス情報（CAPI推奨パラメータ）
                client_user_agent: this.params.client_user_agent || null,
                client_ip_address: this.params.client_ip_address || null,

                // 追加のコンテキスト情報
                referrer_url: this.params.referrer_url || null,
                source_platform: this.params.source_platform || null,
                browser_name: this.params.browser_name || null,
                browser_version: this.params.browser_version || null,
                os_name: this.params.os_name || null,
                os_version: this.params.os_version || null,
                device_type: this.params.device_type || null,
                language: this.params.language || null,
                timezone: this.params.timezone || null,

                // その他全パラメータも含める
                ...this.params
            };
        }

        /**
         * パラメータをクエリ文字列に変換
         */
        toQueryString() {
            const params = new URLSearchParams();
            Object.keys(this.params).forEach(key => {
                if (this.params[key] &&
                    !CONFIG.excludeParams.includes(key) &&
                    !CONFIG.internalOnlyParams.includes(key)) {
                    params.append(key, this.params[key]);
                }
            });
            return params.toString();
        }

        /**
         * 除外パラメータを追加
         */
        addExcludeParam(param) {
            if (!CONFIG.excludeParams.includes(param)) {
                CONFIG.excludeParams.push(param);
            }
        }

        /**
         * 除外パラメータを削除
         */
        removeExcludeParam(param) {
            const index = CONFIG.excludeParams.indexOf(param);
            if (index > -1) {
                CONFIG.excludeParams.splice(index, 1);
            }
        }
    }

    // グローバルに公開
    window.TalkLabelParamManager = new TalkLabelParamManager();

    // DOMContentLoaded後の処理
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDOMReady);
    } else {
        onDOMReady();
    }

    function onDOMReady() {
        // Facebook Conversion API用のデータを取得する例
        const fbData = window.TalkLabelParamManager.getFacebookConversionData();

        // Facebook Pixelイベントの送信例（実際のPixel IDに置き換えてください）
        if (fbData.fbclid && typeof fbq !== 'undefined') {
            fbq('track', 'PageView', {
                source: 'TalkLabel',
                flowPathId: fbData.flowPathId
            });
        }

        // ページ読み込み完了後に再度リンクを更新（念のため）
        setTimeout(() => {
            window.TalkLabelParamManager.updateTalkLabelLinks();
        }, 500);

        console.log('Facebook Conversion Data:', fbData);
    }

})();