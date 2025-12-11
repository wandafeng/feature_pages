$(document).ready(function() {
    let languageData = {};
    //let moreTextsData = {}; // 專門存放 more_texts.json 的資料
    let supportedLanguages = [];

    // =======================================================
    // 【路徑計算區塊】 (保持不變)
    // =======================================================

    // 1. 取得當前頁面路徑並找出 JSON 檔案所在的目錄路徑
    // e.g., /C:/.../ProjectRoot/feature_pages/display_vesahdr_r/index.html
    const fullPath = decodeURI(window.location.pathname).replace(/\\/g, '/');
    // e.g., /C:/.../ProjectRoot/feature_pages/display_vesahdr_r/
    const directoryPath = fullPath.substring(0, fullPath.lastIndexOf('/') + 1);

    // 2. 透過路徑片段，推算出相對於專案根目錄的 BASE_PATH
    // 假設結構為：.../[CONTAINER_FOLDER]/[FEATURE_FOLDER]/
    let pathSegments = directoryPath.split('/').filter(s => s.length > 0);

    let ELECTRON_BASE_PATH = '';
    if (pathSegments.length >= 2) {
        // 取得功能目錄的父目錄名稱 (e.g., 'feature_pages')
        const containerFolder = pathSegments[pathSegments.length - 2];
        // 取得功能目錄名稱 (e.g., 'display_vesahdr_r')
        const featureFolder = pathSegments[pathSegments.length - 1];

        // 組合出傳給 Electron 的相對根路徑 (e.g., 'feature_pages/display_vesahdr_r/')
        ELECTRON_BASE_PATH = containerFolder + '/' + featureFolder + '/';
    }

    // 3. 定義原始檔名，並區分它們的類型
    // 檔名順序保持不變，languages.json 必須是第一個
    /*const RAW_FILENAMES = [
        { name: 'languages.json', type: 'language' },
        { name: 'more_texts.json', type: 'more_texts' }
    ];*/
    const RAW_FILENAMES = [
        { name: 'languages.json', type: 'language' }
    ];

    // 4. 準備兩種路徑列表
    const FILENAMES_DATA = RAW_FILENAMES.map(item => ({
        // Web Path: 僅檔名 (相對於 HTML 檔案，適用於 $.getJSON)
        webPath: item.name,
        // Electron Path: 完整相對路徑 (相對於 main.js 的根目錄，適用於 IPC)
        electronPath: ELECTRON_BASE_PATH + item.name,
        // 檔案類型
        type: item.type
    }));

    // =======================================================

    const DEFAULT_LANG = 'en';

    /**
     * 根據 JSON 資料動態產生語言選單 (保持不變)
     */
    function populateLanguageSwitcher(langCodes) {
        const switcher = $('#language-switcher');
        switcher.empty();

        langCodes.forEach(code => {
            // 從 languageData 中取得語言名稱
            const langName = (languageData[code] && languageData[code].languageName) ? languageData[code].languageName : code;
            switcher.append(`<option value="${code}">${langName}</option>`);
        });
    }

    /**
     * 獲取瀏覽器語言代碼，並嘗試匹配支援的語言 (保持不變)
     */
    function getBrowserLanguage(supportedCodes) {
        const browserLang = navigator.language || navigator.userLanguage;

        if (supportedCodes.includes(browserLang)) {
            return browserLang;
        }

        const langPrefix = browserLang.split('-')[0];

        if (langPrefix === 'zh' && supportedCodes.includes(DEFAULT_LANG)) {
             return DEFAULT_LANG;
        }

        const prefixMatch = supportedCodes.find(code => code.startsWith(langPrefix));
        if (prefixMatch) {
            return prefixMatch;
        }

        return supportedCodes.includes(DEFAULT_LANG) ? DEFAULT_LANG : supportedCodes[0] || '';
    }

    /**
     * 翻譯函數：根據語言代碼替換網頁內容 (保持不變)
     */
    function translate(langCode) {
        const translationSet = languageData[langCode];

        if (!translationSet) {
            console.warn(`Translation data for ${langCode} is not available.`);
            return;
        }

        $('[data-i18n]').each(function() {
            const key = $(this).data('i18n');
            if (key && translationSet[key]) {
                $(this).text(translationSet[key]);
            }
        });
    }

    /**
     * 載入多個 JSON 檔案，並依類型分開儲存
     * @param {{webPath: string, electronPath: string, type: string}[]} filenamesData
     * @returns {Promise<{languageData: Object, moreTextsData: Object, supportedCodes: string[]}>}
     */
    async function loadMultipleJsonData(filenamesData) {
        /*const result = {
            languageData: {},
            moreTextsData: {},
            supportedCodes: []
        };*/
        const result = {
            languageData: {},
            supportedCodes: []
        };

        for (const { webPath, electronPath, type } of filenamesData) {
            let jsonData = null;
            let loadedSuccessfully = false;

            // --- 1. 嘗試 Electron IPC 載入 (Primary method) ---
            if (window.i18n && window.i18n.getJsonData) {
                try {
                    // 使用 Electron 路徑 (相對於專案根目錄)
                    jsonData = await window.i18n.getJsonData(electronPath);
                    loadedSuccessfully = true;
                } catch (error) {
                    // IPC 失敗，進入 fallback
                }
            }

            // --- 2. 嘗試 Web Fallback 載入 (Secondary method) ---
            if (!loadedSuccessfully) {
                 try {
                     // 使用 Web 路徑 (相對於當前 HTML 目錄)
                     jsonData = await new Promise((resolve, reject) => {
                         $.getJSON(webPath)
                            .done(resolve)
                            .fail((jqxhr, textStatus, error) => {
                                reject(new Error(`Failed to load via Web Fallback: ${webPath}`));
                            });
                     });
                     loadedSuccessfully = true;
                 } catch (error) {
                     console.error(`All load attempts failed for ${webPath}`, error);
                     continue; // 載入失敗，跳過此檔案
                 }
            }


            // --- 3. 儲存資料到對應的物件 ---
            if (jsonData && loadedSuccessfully) {
                if (type === 'language') {
                    result.languageData = jsonData;
                    // 計算支援的語言代碼 (只從 languages.json 提取)
                    result.supportedCodes = Object.keys(jsonData);
                    result.supportedCodes = result.supportedCodes.filter(key => /^[a-z]{2,4}(-[A-Z]{2})?$/.test(key));
                /*} else if (type === 'more_texts') {
                    result.moreTextsData = jsonData;*/
                }
            }
        }

        // 4. 返回結果
        return result;
    }

    // 呼叫載入函數並處理結果
    loadMultipleJsonData(FILENAMES_DATA)
        .then(({ languageData: langData, supportedCodes }) => {
        //.then(({ languageData: langData, moreTextsData: moreData, supportedCodes }) => {
            // 將結果賦值給全域變數
            languageData = langData;
            //moreTextsData = moreData; // 儲存 more_texts.json 資料
            supportedLanguages = supportedCodes;

            if (supportedLanguages.length === 0) {
                console.error("No language data found. Please check file paths and permissions.");
                return;
            }

            populateLanguageSwitcher(supportedLanguages);

            const autoLang = getBrowserLanguage(supportedLanguages);

            translate(autoLang);
            $('#language-switcher').val(autoLang);

            // 【新增這行，方便 DevTools 檢查】
            //window.MORE_TEXTS_DATA = moreTextsData;

            // console.log("Languages Data loaded successfully:", languageData);
            // console.log("More Texts Data loaded successfully:", moreTextsData);
        })
        .catch(error => {
            console.error("Failed to initialize data:", error);
        });


    // 保持語言切換器的變化事件
    $('#language-switcher').on('change', function() {
        const selectedLang = $(this).val();
        if (languageData[selectedLang]) {
            translate(selectedLang);
        } else {
            // console.warn(`Translation data for ${selectedLang} is not available.`);
        }
    });
});