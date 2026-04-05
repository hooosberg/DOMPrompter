import {
  app,
  BrowserView,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { InspectorService, generateAIPrompt, generateCSSClass, generateCSSVariables } from '@visual-inspector/core'
import type { CSSProperty, ICDPTransport, InspectedElement, PageContextSnapshot } from '@visual-inspector/core'
import { DEVELOPER_GITHUB_URL, PRIVACY_URL, SUPPORT_URL, TERMS_URL, WEBSITE_URL } from '../src/shared/externalLinks'
import { normalizeAppLanguage } from '../src/shared/languages'
import { registerLicenseHandlers } from './licenseService'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const APP_NAME = 'DOMPrompter'
const RIGHT_PANEL_WIDTH = 320
const TITLE_BAR_HEIGHT = 48
const CONTROL_BAR_HEIGHT = 56
const TOP_CHROME_HEIGHT = TITLE_BAR_HEIGHT + CONTROL_BAR_HEIGHT
const SETTINGS_FILE = 'app-settings.json'
const WINDOW_STATE_FILE = 'window-state.json'
const DEFAULT_WINDOW_SIZE = { width: 1200, height: 800, minWidth: 1120, minHeight: 680 }

interface PersistedWindowState {
  bounds?: Rectangle
}

interface PersistedAppSettings {
  theme: 'light' | 'dark'
  language: string
}

interface WindowSession {
  window: BrowserWindow
  browserView: BrowserView | null
  inspectorService: InspectorService | null
  debuggerTransport: ElectronDebuggerTransport | null
  builtinViewInteractive: boolean
  currentRightPanelWidth: number
}

interface MenuLabels {
  app: string
  about: string
  settings: string
  file: string
  openHtmlFile: string
  newWindow: string
  view: string
  reloadPage: string
  forceReload: string
  toggleToolbar: string
  focusAddressBar: string
  edit: string
  actions: string
  copyPagePrompt: string
  copyElementCss: string
  escape: string
  window: string
  minimize: string
  zoom: string
  front: string
  help: string
  visitWebsite: string
  supportCenter: string
  privacyPolicy: string
  termsOfService: string
  aboutDeveloper: string
  dockNewWindow: string
  dockOpenHtmlFile: string
  inspectorSelectParent: string
  inspectorSelectChild: string
  inspectorAddTag: string
}

type OverlaySyncState = Parameters<InspectorService['setExternalOverlayState']>[0]

function getDefaultTheme(): PersistedAppSettings['theme'] {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

const DEFAULT_SETTINGS: PersistedAppSettings = {
  theme: getDefaultTheme(),
  language: 'en',
}

const MENU_TRANSLATIONS: Record<'en' | 'zh' | 'zh-TW' | 'de' | 'es' | 'fr' | 'it' | 'pt' | 'ru' | 'ar' | 'ja' | 'ko', MenuLabels> = {
  en: {
    app: APP_NAME,
    about: `About ${APP_NAME}`,
    settings: 'Settings…',
    file: 'File',
    openHtmlFile: 'Open HTML File',
    newWindow: 'New Window',
    view: 'View',
    reloadPage: 'Reload Page',
    forceReload: 'Force Reload',
    toggleToolbar: 'Toggle Toolbar',
    focusAddressBar: 'Focus Address Bar',
    edit: 'Edit',
    actions: 'Actions',
    copyPagePrompt: 'Copy Page Prompt',
    copyElementCss: 'Copy Element CSS',
    escape: 'Escape',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    front: 'Bring All to Front',
    help: 'Help',
    visitWebsite: 'Visit Website',
    supportCenter: 'Support Center',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    aboutDeveloper: 'About Developer (hooosberg)',
    dockNewWindow: 'New Window',
    dockOpenHtmlFile: 'Open HTML File',
    inspectorSelectParent: 'Select Parent Element          Esc',
    inspectorSelectChild: 'Select Child Element          Enter',
    inspectorAddTag: 'Add Tag',
  },
  zh: {
    app: APP_NAME,
    about: `关于 ${APP_NAME}`,
    settings: '设置…',
    file: '文件',
    openHtmlFile: '打开 HTML 文件',
    newWindow: '新建窗口',
    view: '视图',
    reloadPage: '刷新页面',
    forceReload: '强制刷新',
    toggleToolbar: '切换工具栏',
    focusAddressBar: '聚焦地址栏',
    edit: '编辑',
    actions: '操作',
    copyPagePrompt: '复制页面提示词',
    copyElementCss: '复制元素 CSS',
    escape: '关闭 / 退出',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    front: '前置全部窗口',
    help: '帮助',
    visitWebsite: '访问官网首页',
    supportCenter: '支持中心',
    privacyPolicy: '隐私政策',
    termsOfService: '服务条款',
    aboutDeveloper: '关于开发者 (hooosberg)',
    dockNewWindow: '新建窗口',
    dockOpenHtmlFile: '打开 HTML 文件',
    inspectorSelectParent: '选择上一级元素          Esc',
    inspectorSelectChild: '选择下一级元素          Enter',
    inspectorAddTag: '添加标签',
  },
  'zh-TW': {
    app: APP_NAME,
    about: `關於 ${APP_NAME}`,
    settings: '設定…',
    file: '檔案',
    openHtmlFile: '開啟 HTML 檔案',
    newWindow: '新增視窗',
    view: '檢視',
    reloadPage: '重新整理頁面',
    forceReload: '強制重新整理',
    toggleToolbar: '切換工具列',
    focusAddressBar: '聚焦網址列',
    edit: '編輯',
    actions: '操作',
    copyPagePrompt: '複製頁面提示詞',
    copyElementCss: '複製元素 CSS',
    escape: '關閉 / 離開',
    window: '視窗',
    minimize: '最小化',
    zoom: '縮放',
    front: '全部移至最前',
    help: '輔助說明',
    visitWebsite: '造訪官網首頁',
    supportCenter: '支援中心',
    privacyPolicy: '隱私政策',
    termsOfService: '服務條款',
    aboutDeveloper: '關於開發者 (hooosberg)',
    dockNewWindow: '新增視窗',
    dockOpenHtmlFile: '開啟 HTML 檔案',
    inspectorSelectParent: '選擇上一級元素          Esc',
    inspectorSelectChild: '選擇下一級元素          Enter',
    inspectorAddTag: '新增標籤',
  },
  de: {
    app: APP_NAME,
    about: `Über ${APP_NAME}`,
    settings: 'Einstellungen…',
    file: 'Datei',
    openHtmlFile: 'HTML-Datei öffnen',
    newWindow: 'Neues Fenster',
    view: 'Ansicht',
    reloadPage: 'Seite neu laden',
    forceReload: 'Erzwinge Neu laden',
    toggleToolbar: 'Symbolleiste umschalten',
    focusAddressBar: 'Adressleiste fokussieren',
    edit: 'Bearbeiten',
    actions: 'Aktionen',
    copyPagePrompt: 'Seiten-Prompt kopieren',
    copyElementCss: 'Element-CSS kopieren',
    escape: 'Schließen / Abbrechen',
    window: 'Fenster',
    minimize: 'Minimieren',
    zoom: 'Zoom',
    front: 'Alle nach vorne bringen',
    help: 'Hilfe',
    visitWebsite: 'Website besuchen',
    supportCenter: 'Hilfecenter',
    privacyPolicy: 'Datenschutzrichtlinie',
    termsOfService: 'Nutzungsbedingungen',
    aboutDeveloper: 'Über den Entwickler (hooosberg)',
    dockNewWindow: 'Neues Fenster',
    dockOpenHtmlFile: 'HTML-Datei öffnen',
    inspectorSelectParent: 'Übergeordnetes Element auswählen          Esc',
    inspectorSelectChild: 'Untergeordnetes Element auswählen          Eingabe',
    inspectorAddTag: 'Tag hinzufügen',
  },
  es: {
    app: APP_NAME,
    about: `Acerca de ${APP_NAME}`,
    settings: 'Configuración…',
    file: 'Archivo',
    openHtmlFile: 'Abrir archivo HTML',
    newWindow: 'Nueva ventana',
    view: 'Ver',
    reloadPage: 'Recargar página',
    forceReload: 'Forzar recarga',
    toggleToolbar: 'Alternar barra de herramientas',
    focusAddressBar: 'Enfocar barra de direcciones',
    edit: 'Editar',
    actions: 'Acciones',
    copyPagePrompt: 'Copiar prompt de página',
    copyElementCss: 'Copiar CSS del elemento',
    escape: 'Cerrar / Cancelar',
    window: 'Ventana',
    minimize: 'Minimizar',
    zoom: 'Zoom',
    front: 'Traer todo al frente',
    help: 'Ayuda',
    visitWebsite: 'Visitar sitio web',
    supportCenter: 'Centro de soporte',
    privacyPolicy: 'Política de privacidad',
    termsOfService: 'Términos de servicio',
    aboutDeveloper: 'Acerca del desarrollador (hooosberg)',
    dockNewWindow: 'Nueva ventana',
    dockOpenHtmlFile: 'Abrir archivo HTML',
    inspectorSelectParent: 'Seleccionar elemento padre          Esc',
    inspectorSelectChild: 'Seleccionar elemento hijo          Intro',
    inspectorAddTag: 'Añadir etiqueta',
  },
  fr: {
    app: APP_NAME,
    about: `À propos de ${APP_NAME}`,
    settings: 'Paramètres…',
    file: 'Fichier',
    openHtmlFile: 'Ouvrir un fichier HTML',
    newWindow: 'Nouvelle fenêtre',
    view: 'Affichage',
    reloadPage: 'Recharger la page',
    forceReload: 'Forcer le rechargement',
    toggleToolbar: 'Activer/désactiver la barre d\'outils',
    focusAddressBar: 'Mettre l\'accent sur la barre d\'adresse',
    edit: 'Édition',
    actions: 'Actions',
    copyPagePrompt: 'Copier l\'invite de la page',
    copyElementCss: 'Copier le CSS de l\'élément',
    escape: 'Fermer / Annuler',
    window: 'Fenêtre',
    minimize: 'Réduire',
    zoom: 'Zoom',
    front: 'Tout amener au premier plan',
    help: 'Aide',
    visitWebsite: 'Visiter le site Web',
    supportCenter: 'Centre d\'assistance',
    privacyPolicy: 'Politique de confidentialité',
    termsOfService: 'Conditions d\'utilisation',
    aboutDeveloper: 'À propos du développeur (hooosberg)',
    dockNewWindow: 'Nouvelle fenêtre',
    dockOpenHtmlFile: 'Ouvrir un fichier HTML',
    inspectorSelectParent: 'Sélectionner l\'élément parent          Esc',
    inspectorSelectChild: 'Sélectionner l\'élément enfant          Entrée',
    inspectorAddTag: 'Ajouter une étiquette',
  },
  it: {
    app: APP_NAME,
    about: `Informazioni su ${APP_NAME}`,
    settings: 'Impostazioni…',
    file: 'File',
    openHtmlFile: 'Apri file HTML',
    newWindow: 'Nuova finestra',
    view: 'Visualizza',
    reloadPage: 'Ricarica pagina',
    forceReload: 'Ricarica forzata',
    toggleToolbar: 'Attiva/disattiva barra degli strumenti',
    focusAddressBar: 'Metti a fuoco la barra degli indirizzi',
    edit: 'Modifica',
    actions: 'Azioni',
    copyPagePrompt: 'Copia prompt della pagina',
    copyElementCss: 'Copia CSS dell\'elemento',
    escape: 'Chiudi / Annulla',
    window: 'Finestra',
    minimize: 'Riduci a icona',
    zoom: 'Zoom',
    front: 'Porta tutto in primo piano',
    help: 'Aiuto',
    visitWebsite: 'Visita il sito web',
    supportCenter: 'Centro assistenza',
    privacyPolicy: 'Informativa sulla privacy',
    termsOfService: 'Termini di servizio',
    aboutDeveloper: 'Informazioni sullo sviluppatore (hooosberg)',
    dockNewWindow: 'Nuova finestra',
    dockOpenHtmlFile: 'Apri file HTML',
    inspectorSelectParent: 'Seleziona elemento padre          Esc',
    inspectorSelectChild: 'Seleziona elemento figlio          Invio',
    inspectorAddTag: 'Aggiungi etichetta',
  },
  pt: {
    app: APP_NAME,
    about: `Sobre ${APP_NAME}`,
    settings: 'Configurações…',
    file: 'Arquivo',
    openHtmlFile: 'Abrir arquivo HTML',
    newWindow: 'Nova janela',
    view: 'Exibir',
    reloadPage: 'Recarregar página',
    forceReload: 'Forçar recarga',
    toggleToolbar: 'Alternar barra de ferramentas',
    focusAddressBar: 'Focar barra de endereços',
    edit: 'Editar',
    actions: 'Ações',
    copyPagePrompt: 'Copiar prompt da página',
    copyElementCss: 'Copiar CSS do elemento',
    escape: 'Fechar / Cancelar',
    window: 'Janela',
    minimize: 'Minimizar',
    zoom: 'Zoom',
    front: 'Trazer tudo para a frente',
    help: 'Ajuda',
    visitWebsite: 'Visitar site',
    supportCenter: 'Central de suporte',
    privacyPolicy: 'Política de privacidade',
    termsOfService: 'Termos de serviço',
    aboutDeveloper: 'Sobre o desenvolvedor (hooosberg)',
    dockNewWindow: 'Nova janela',
    dockOpenHtmlFile: 'Abrir arquivo HTML',
    inspectorSelectParent: 'Selecionar elemento pai          Esc',
    inspectorSelectChild: 'Selecionar elemento filho          Enter',
    inspectorAddTag: 'Adicionar etiqueta',
  },
  ru: {
    app: APP_NAME,
    about: `О программе ${APP_NAME}`,
    settings: 'Параметры…',
    file: 'Файл',
    openHtmlFile: 'Открыть HTML-файл',
    newWindow: 'Новое окно',
    view: 'Вид',
    reloadPage: 'Перезагрузить страницу',
    forceReload: 'Полная перезагрузка',
    toggleToolbar: 'Переключить панель инструментов',
    focusAddressBar: 'Сосредоточить адресную строку',
    edit: 'Правка',
    actions: 'Действия',
    copyPagePrompt: 'Копировать промпт страницы',
    copyElementCss: 'Копировать CSS элемента',
    escape: 'Закрыть / Отмена',
    window: 'Окно',
    minimize: 'Свернуть',
    zoom: 'Масштаб',
    front: 'Переместить все на передний план',
    help: 'Справка',
    visitWebsite: 'Посетить сайт',
    supportCenter: 'Центр поддержки',
    privacyPolicy: 'Политика конфиденциальности',
    termsOfService: 'Условия использования',
    aboutDeveloper: 'О разработчике (hooosberg)',
    dockNewWindow: 'Новое окно',
    dockOpenHtmlFile: 'Открыть HTML-файл',
    inspectorSelectParent: 'Выбрать родительский элемент          Esc',
    inspectorSelectChild: 'Выбрать дочерний элемент          Enter',
    inspectorAddTag: 'Добавить метку',
  },
  ar: {
    app: APP_NAME,
    about: `حول ${APP_NAME}`,
    settings: 'الإعدادات…',
    file: 'ملف',
    openHtmlFile: 'فتح ملف HTML',
    newWindow: 'نافذة جديدة',
    view: 'عرض',
    reloadPage: 'إعادة تحميل الصفحة',
    forceReload: 'إعادة تحميل قسرية',
    toggleToolbar: 'بدّل شريط الأدوات',
    focusAddressBar: 'ركّز شريط العنوان',
    edit: 'تحرير',
    actions: 'إجراءات',
    copyPagePrompt: 'نسخ أمر الصفحة',
    copyElementCss: 'نسخ CSS العنصر',
    escape: 'إغلاق / إلغاء',
    window: 'نافذة',
    minimize: 'تصغير',
    zoom: 'تكبير/تصغير',
    front: 'نقل الكل إلى الأمام',
    help: 'تعليمات',
    visitWebsite: 'زيارة الموقع',
    supportCenter: 'مركز الدعم',
    privacyPolicy: 'سياسة الخصوصية',
    termsOfService: 'شروط الخدمة',
    aboutDeveloper: 'حول المطور (hooosberg)',
    dockNewWindow: 'نافذة جديدة',
    dockOpenHtmlFile: 'فتح ملف HTML',
    inspectorSelectParent: 'حدد العنصر الأب          Esc',
    inspectorSelectChild: 'حدد العنصر الفرعي          Enter',
    inspectorAddTag: 'أضف وسم',
  },
  ja: {
    app: APP_NAME,
    about: `${APP_NAME}について`,
    settings: '設定…',
    file: 'ファイル',
    openHtmlFile: 'HTMLファイルを開く',
    newWindow: '新規ウインドウ',
    view: '表示',
    reloadPage: 'ページを再読み込み',
    forceReload: '完全に再読み込み',
    toggleToolbar: 'ツールバーを切り替え',
    focusAddressBar: 'アドレスバーにフォーカス',
    edit: '編集',
    actions: 'アクション',
    copyPagePrompt: 'ページプロンプトをコピー',
    copyElementCss: '要素CSSをコピー',
    escape: '閉じる / キャンセル',
    window: 'ウインドウ',
    minimize: '最小化',
    zoom: 'ズーム',
    front: 'すべてを前面に持ってくる',
    help: 'ヘルプ',
    visitWebsite: 'ウェブサイトにアクセス',
    supportCenter: 'サポートセンター',
    privacyPolicy: 'プライバシーポリシー',
    termsOfService: 'サービス規約',
    aboutDeveloper: '開発者について (hooosberg)',
    dockNewWindow: '新規ウインドウ',
    dockOpenHtmlFile: 'HTMLファイルを開く',
    inspectorSelectParent: '親要素を選択          Esc',
    inspectorSelectChild: '子要素を選択          Enter',
    inspectorAddTag: 'タグを追加',
  },
  ko: {
    app: APP_NAME,
    about: `${APP_NAME} 정보`,
    settings: '설정…',
    file: '파일',
    openHtmlFile: 'HTML 파일 열기',
    newWindow: '새 창',
    view: '보기',
    reloadPage: '페이지 새로고침',
    forceReload: '강제 새로고침',
    toggleToolbar: '도구 모음 전환',
    focusAddressBar: '주소 표시줄 포커스',
    edit: '편집',
    actions: '작업',
    copyPagePrompt: '페이지 프롬프트 복사',
    copyElementCss: '요소 CSS 복사',
    escape: '닫기 / 취소',
    window: '윈도우',
    minimize: '최소화',
    zoom: '확대/축소',
    front: '모두 앞으로 가져오기',
    help: '도움말',
    visitWebsite: '웹사이트 방문',
    supportCenter: '지원 센터',
    privacyPolicy: '개인정보처리방침',
    termsOfService: '서비스 약관',
    aboutDeveloper: '개발자 정보 (hooosberg)',
    dockNewWindow: '새 창',
    dockOpenHtmlFile: 'HTML 파일 열기',
    inspectorSelectParent: '부모 요소 선택          Esc',
    inspectorSelectChild: '자식 요소 선택          Enter',
    inspectorAddTag: '태그 추가',
  },
}

const windowSessions = new Map<number, WindowSession>()
let appSettings: PersistedAppSettings = { ...DEFAULT_SETTINGS }

function getWindowStatePath() {
  return join(app.getPath('userData'), WINDOW_STATE_FILE)
}

function getSettingsPath() {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

function normalizeLanguage(language: string): keyof typeof MENU_TRANSLATIONS {
  const normalized = normalizeAppLanguage(language)
  if (normalized === 'zh-TW') return 'zh-TW'
  if (normalized === 'zh') return 'zh'
  if (normalized === 'de') return 'de'
  if (normalized === 'es') return 'es'
  if (normalized === 'fr') return 'fr'
  if (normalized === 'it') return 'it'
  if (normalized === 'pt') return 'pt'
  if (normalized === 'ru') return 'ru'
  if (normalized === 'ar') return 'ar'
  if (normalized === 'ja') return 'ja'
  if (normalized === 'ko') return 'ko'
  return 'en'
}

function getMenuLabels(language: string): MenuLabels {
  return MENU_TRANSLATIONS[normalizeLanguage(language)] || MENU_TRANSLATIONS.en
}

function applyThemeSource(theme: PersistedAppSettings['theme']) {
  nativeTheme.themeSource = theme
}

function loadAppSettings(): PersistedAppSettings {
  try {
    const file = getSettingsPath()
    if (!existsSync(file)) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<PersistedAppSettings>
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark'
        ? parsed.theme
        : parsed.theme === 'auto'
          ? getDefaultTheme()
        : DEFAULT_SETTINGS.theme,
      language: normalizeAppLanguage(typeof parsed.language === 'string' ? parsed.language : DEFAULT_SETTINGS.language),
    }
  } catch (error) {
    console.error('Failed to load app settings:', error)
    return { ...DEFAULT_SETTINGS }
  }
}

function saveAppSettings(settings: PersistedAppSettings) {
  try {
    const file = getSettingsPath()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(settings), 'utf8')
  } catch (error) {
    console.error('Failed to save app settings:', error)
  }
}

function sanitizeBounds(bounds: Rectangle | null | undefined): Rectangle | null {
  if (!bounds) return null
  if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) return null
  if (bounds.width < DEFAULT_WINDOW_SIZE.minWidth || bounds.height < DEFAULT_WINDOW_SIZE.minHeight) return null
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function loadWindowState(): PersistedWindowState {
  try {
    const file = getWindowStatePath()
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as PersistedWindowState
    return {
      bounds: sanitizeBounds(parsed.bounds) || undefined,
    }
  } catch (error) {
    console.error('Failed to load window state:', error)
    return {}
  }
}

function saveWindowState(state: PersistedWindowState) {
  try {
    const file = getWindowStatePath()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(state), 'utf8')
  } catch (error) {
    console.error('Failed to save window state:', error)
  }
}

function persistWindowState(targetWindow: BrowserWindow | null) {
  if (!targetWindow || targetWindow.isDestroyed()) return
  const currentBounds = sanitizeBounds(targetWindow.getBounds())
  saveWindowState({
    bounds: currentBounds || undefined,
  })
}

function getPrimaryWindow() {
  return BrowserWindow.getAllWindows()[0] || null
}

function getWindowSession(targetWindow: BrowserWindow | null) {
  if (!targetWindow) return null
  return windowSessions.get(targetWindow.id) || null
}

function getSessionFromEvent(event: IpcMainInvokeEvent) {
  return getWindowSession(BrowserWindow.fromWebContents(event.sender))
}

function sendToRenderer(session: WindowSession, channel: string, ...args: unknown[]) {
  if (session.window.isDestroyed()) return
  session.window.webContents.send(channel, ...args)
}

function sendShortcut(channel: string) {
  const targetWindow = BrowserWindow.getFocusedWindow() || getPrimaryWindow()
  if (!targetWindow || targetWindow.isDestroyed()) return
  targetWindow.webContents.send(channel)
}

function refreshMenus() {
  const labels = getMenuLabels(appSettings.language)
  Menu.setApplicationMenu(buildApplicationMenu(labels))

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([
      { label: labels.dockNewWindow, click: () => { createWindow() } },
      { label: labels.dockOpenHtmlFile, click: () => sendShortcut('shortcuts:openHtmlFile') },
    ]))
  }
}

function buildApplicationMenu(labels: MenuLabels) {
  return Menu.buildFromTemplate([
    {
      label: labels.app,
      submenu: [
        { label: labels.about, click: () => sendShortcut('shortcuts:openSettings') },
        { type: 'separator' },
        { label: labels.settings, accelerator: 'CmdOrCtrl+,', click: () => sendShortcut('shortcuts:openSettings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: labels.file,
      submenu: [
        { label: labels.openHtmlFile, accelerator: 'CmdOrCtrl+O', click: () => sendShortcut('shortcuts:openHtmlFile') },
        { label: labels.newWindow, accelerator: 'CmdOrCtrl+Shift+W', click: () => { createWindow() } },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: labels.edit,
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' },
        { type: 'separator' },
        { role: 'startSpeaking' },
        { role: 'stopSpeaking' },
      ],
    },
    {
      label: labels.view,
      submenu: [
        { label: labels.reloadPage, accelerator: 'CmdOrCtrl+R', click: () => sendShortcut('shortcuts:reloadPage') },
        { label: labels.forceReload, accelerator: 'CmdOrCtrl+Shift+R', click: () => sendShortcut('shortcuts:forceReload') },
        { label: labels.toggleToolbar, accelerator: 'CmdOrCtrl+Shift+T', click: () => sendShortcut('shortcuts:toggleToolbar') },
        { label: labels.focusAddressBar, accelerator: 'CmdOrCtrl+L', click: () => sendShortcut('shortcuts:focusAddressBar') },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: labels.actions,
      submenu: [
        { label: labels.copyPagePrompt, accelerator: 'CmdOrCtrl+Shift+C', click: () => sendShortcut('shortcuts:copyPagePrompt') },
        { label: labels.copyElementCss, accelerator: 'CmdOrCtrl+Shift+E', click: () => sendShortcut('shortcuts:copyElementCSS') },
        { label: labels.escape, accelerator: 'Escape', click: () => sendShortcut('shortcuts:escape') },
      ],
    },
    {
      label: labels.window,
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      role: 'help',
      label: labels.help,
      submenu: [
        { label: labels.visitWebsite, click: () => { void shell.openExternal(WEBSITE_URL) } },
        { label: labels.supportCenter, click: () => { void shell.openExternal(SUPPORT_URL) } },
        { type: 'separator' },
        { label: labels.privacyPolicy, click: () => { void shell.openExternal(PRIVACY_URL) } },
        { label: labels.termsOfService, click: () => { void shell.openExternal(TERMS_URL) } },
        { type: 'separator' },
        { label: labels.aboutDeveloper, click: () => { void shell.openExternal(DEVELOPER_GITHUB_URL) } },
      ],
    },
  ])
}

function isOverlaySyncTag(value: unknown): value is OverlaySyncState['tags'][number] {
  if (!value || typeof value !== 'object') return false

  const candidate = value as {
    id?: unknown
    text?: unknown
    createdAt?: unknown
    targets?: unknown
  }

  if (typeof candidate.id !== 'string' || typeof candidate.text !== 'string' || typeof candidate.createdAt !== 'number') {
    return false
  }

  if (!Array.isArray(candidate.targets)) {
    return false
  }

  return candidate.targets.every((target) => {
    if (!target || typeof target !== 'object') return false
    const resolvedTarget = target as {
      backendNodeId?: unknown
      selector?: unknown
    }
    return typeof resolvedTarget.backendNodeId === 'number' && typeof resolvedTarget.selector === 'string'
  })
}

class ElectronDebuggerTransport implements ICDPTransport {
  private listeners = new Map<string, Set<(params: any) => void>>()
  private attached = false

  constructor(private view: BrowserView) {}

  get connected(): boolean {
    return this.attached
  }

  async attach(): Promise<void> {
    this.view.webContents.debugger.attach('1.3')
    this.attached = true

    this.view.webContents.debugger.on('message', (_event: any, method: string, params: any) => {
      const handlers = this.listeners.get(method)
      if (!handlers) return

      for (const handler of handlers) {
        try {
          handler(params)
        } catch (error) {
          console.error(`Debugger event error [${method}]:`, error)
        }
      }
    })

    this.view.webContents.debugger.on('detach', () => {
      this.attached = false
    })
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this.attached) {
      throw new Error('Debugger not attached')
    }
    return this.view.webContents.debugger.sendCommand(method, params || {})
  }

  on(event: string, callback: (params: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)?.add(callback)
  }

  off(event: string, callback: (params: any) => void): void {
    this.listeners.get(event)?.delete(callback)
  }

  disconnect(): void {
    if (this.attached) {
      try {
        this.view.webContents.debugger.detach()
      } catch {
        // ignore detach errors
      }
    }
    this.attached = false
    this.listeners.clear()
  }
}

function teardownInspectorService(session: WindowSession) {
  if (session.debuggerTransport) {
    session.debuggerTransport.disconnect()
    session.debuggerTransport = null
  }
  session.inspectorService = null
}

function cleanupBrowserView(session: WindowSession) {
  teardownInspectorService(session)

  if (session.browserView && !session.window.isDestroyed()) {
    session.window.removeBrowserView(session.browserView)
  }

  if (session.browserView) {
    ;(session.browserView.webContents as any).destroy?.()
    session.browserView = null
  }
}

function updateBrowserViewBounds(session: WindowSession) {
  if (!session.browserView || session.window.isDestroyed()) return

  const bounds = session.window.getContentBounds()
  const rightPanelWidth = Math.max(0, Math.round(session.currentRightPanelWidth))
  const nextBounds = {
    x: session.builtinViewInteractive ? 0 : -(bounds.width + 10000),
    y: TOP_CHROME_HEIGHT,
    width: Math.max(100, bounds.width - rightPanelWidth),
    height: Math.max(100, bounds.height - TOP_CHROME_HEIGHT),
  }

  session.browserView.setBounds(nextBounds)
}

function createBrowserView(session: WindowSession, url: string) {
  cleanupBrowserView(session)

  const browserView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  session.browserView = browserView
  session.window.setBrowserView(browserView)
  updateBrowserViewBounds(session)
  void browserView.webContents.loadURL(url)

  browserView.webContents.on('did-finish-load', () => {
    if (session.browserView !== browserView) return

    sendToRenderer(session, 'browser-view-loaded', {
      url: browserView.webContents.getURL(),
      title: browserView.webContents.getTitle(),
    })

    if (session.inspectorService) {
      void session.inspectorService.startInspecting().catch((error) => {
        console.error('Failed to restore inspect mode after load:', error)
      })
    }
  })
}

function createWindow() {
  const storedState = loadWindowState()
  const workArea = screen.getPrimaryDisplay().workArea
  const initialBounds = storedState.bounds

  const targetWindow = new BrowserWindow({
    width: initialBounds?.width || workArea.width,
    height: initialBounds?.height || workArea.height,
    ...(initialBounds
      ? { x: initialBounds.x, y: initialBounds.y }
      : { x: workArea.x, y: workArea.y }),
    minWidth: DEFAULT_WINDOW_SIZE.minWidth,
    minHeight: DEFAULT_WINDOW_SIZE.minHeight,
    title: APP_NAME,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    resizable: true,
  })

  const session: WindowSession = {
    window: targetWindow,
    browserView: null,
    inspectorService: null,
    debuggerTransport: null,
    builtinViewInteractive: false,
    currentRightPanelWidth: RIGHT_PANEL_WIDTH,
  }

  windowSessions.set(targetWindow.id, session)

  targetWindow.once('ready-to-show', () => {
    if (targetWindow.isDestroyed()) return

    const display = screen.getDisplayMatching(targetWindow.getBounds())
    targetWindow.setBounds(display.workArea)

    if (!targetWindow.isMaximized()) {
      targetWindow.maximize()
    }
  })

  if (VITE_DEV_SERVER_URL) {
    void targetWindow.loadURL(VITE_DEV_SERVER_URL)
  } else {
    void targetWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  targetWindow.on('resize', () => {
    updateBrowserViewBounds(session)
    persistWindowState(targetWindow)
  })

  targetWindow.on('move', () => {
    persistWindowState(targetWindow)
  })

  targetWindow.on('close', () => {
    persistWindowState(targetWindow)
  })

  targetWindow.on('closed', () => {
    cleanupBrowserView(session)
    windowSessions.delete(targetWindow.id)
  })

  return targetWindow
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const targetWindow = getPrimaryWindow()
    if (!targetWindow) return
    if (targetWindow.isMinimized()) targetWindow.restore()
    targetWindow.focus()
  })

  app.whenReady().then(() => {
    appSettings = loadAppSettings()
    applyThemeSource(appSettings.theme)
    registerLicenseHandlers()

    ipcMain.removeHandler('settings:get')
    ipcMain.removeHandler('settings:set')
    ipcMain.removeHandler('menu:changeLanguage')

    ipcMain.handle('settings:get', async (_event, key: keyof PersistedAppSettings) => appSettings[key])
    ipcMain.handle('settings:set', async (_event, key: keyof PersistedAppSettings, value: PersistedAppSettings[keyof PersistedAppSettings]) => {
      const nextValue = key === 'language' && typeof value === 'string'
        ? normalizeAppLanguage(value)
        : value
      appSettings = {
        ...appSettings,
        [key]: nextValue,
      }
      if (key === 'theme' && typeof value === 'string') {
        applyThemeSource(value as PersistedAppSettings['theme'])
      }
      saveAppSettings(appSettings)
      refreshMenus()
    })
    ipcMain.handle('menu:changeLanguage', async (_event, language: string) => {
      appSettings = {
        ...appSettings,
        language: normalizeAppLanguage(language),
      }
      saveAppSettings(appSettings)
      refreshMenus()
    })

    ipcMain.handle('open-external', async (_event, url: string) => {
      if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
        await shell.openExternal(url)
      }
    })

    refreshMenus()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('load-url', async (event, url: string): Promise<boolean> => {
  const session = getSessionFromEvent(event)
  if (!session) return false

  try {
    session.builtinViewInteractive = false
    createBrowserView(session, url)
    return true
  } catch (error) {
    console.error('Failed to load URL:', error)
    return false
  }
})

ipcMain.handle('attach-debugger', async (event): Promise<boolean> => {
  const session = getSessionFromEvent(event)
  if (!session?.browserView) return false

  try {
    teardownInspectorService(session)

    session.debuggerTransport = new ElectronDebuggerTransport(session.browserView)
    await session.debuggerTransport.attach()

    session.inspectorService = new InspectorService(session.debuggerTransport)
    session.inspectorService.setLanguage(appSettings.language)
    await session.inspectorService.initialize()

    session.inspectorService.onElementSelected((element: InspectedElement, meta) => {
      sendToRenderer(session, 'element-selected', element, meta)
    })
    session.inspectorService.onPropertyActivated((property: string) => {
      sendToRenderer(session, 'property-activated', property)
    })
    session.inspectorService.onPropertyIncrement((cssProperty: string) => {
      sendToRenderer(session, 'property-increment', cssProperty)
    })
    session.inspectorService.onContextMenu((_position) => {
      const sendKey = (keyCode: string) => {
        if (!session.browserView || session.browserView.webContents.isDestroyed()) return
        session.browserView.webContents.sendInputEvent({ type: 'keyDown', keyCode })
        session.browserView.webContents.sendInputEvent({ type: 'keyUp', keyCode })
      }
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '选择上一级元素          Esc',
          click: () => sendKey('Escape'),
        },
        {
          label: '选择下一级元素          Enter',
          click: () => sendKey('Return'),
        },
        { type: 'separator' },
        {
          label: '添加标签',
          click: () => sendToRenderer(session, 'context-action', 'add-tag'),
        },
      ])
      contextMenu.popup({ window: session.window })
    })
    await session.inspectorService.startInspecting()

    return true
  } catch (error) {
    console.error('Failed to attach debugger:', error)
    teardownInspectorService(session)
    return false
  }
})

ipcMain.handle('select-html-file', async (event, projectDir?: string) => {
  const session = getSessionFromEvent(event)
  if (!session) return null

  const result = await dialog.showOpenDialog(session.window, {
    title: 'Select HTML File',
    defaultPath: projectDir || undefined,
    properties: ['openFile'],
    filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
    buttonLabel: 'Open',
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('disconnect', async (event): Promise<void> => {
  const session = getSessionFromEvent(event)
  if (!session) return

  session.builtinViewInteractive = false
  if (session.inspectorService) {
    try {
      await session.inspectorService.stopInspecting()
    } catch {
      // ignore
    }
  }
  cleanupBrowserView(session)
})

ipcMain.handle('set-builtin-view-interactive', async (event, interactive: boolean): Promise<boolean> => {
  const session = getSessionFromEvent(event)
  if (!session) return false

  try {
    session.builtinViewInteractive = interactive
    updateBrowserViewBounds(session)
    return true
  } catch (error) {
    console.error('Failed to toggle BrowserView interactivity:', error)
    return false
  }
})

ipcMain.handle('start-inspect', async (event): Promise<boolean> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return false

  try {
    await session.inspectorService.startInspecting(false)
    return true
  } catch (error) {
    console.error('Start inspect error:', error)
    return false
  }
})

ipcMain.handle('stop-inspect', async (event): Promise<void> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return

  try {
    await session.inspectorService.stopInspecting()
  } catch {
    // ignore
  }
})

ipcMain.handle('set-active-edit-property', async (event, property: string | null): Promise<void> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return

  try {
    await session.inspectorService.setActiveEditProperty(property)
  } catch (error) {
    console.error('Failed to set active edit property:', error)
  }
})

ipcMain.handle('overlay:sync', async (event, payload: { tool?: string; tags?: unknown[] }): Promise<boolean> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return false

  try {
    const nextState: OverlaySyncState = {
      tool: payload?.tool === 'browse' ? 'browse' : 'select',
      tags: Array.isArray(payload?.tags) ? payload.tags.filter(isOverlaySyncTag) : [],
    }
    await session.inspectorService.setExternalOverlayState({
      tool: nextState.tool,
      tags: nextState.tags,
    })
    return true
  } catch (error) {
    console.error('Failed to sync overlay state:', error)
    return false
  }
})

ipcMain.handle('inspect-element-at-point', async (event, payload: {
  x: number
  y: number
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.getElementAtPoint(payload.x, payload.y)
  } catch (error) {
    console.error('Failed to inspect element at point:', error)
    return null
  }
})

ipcMain.handle('inspect-element-stack-at-point', async (event, payload: {
  x: number
  y: number
}): Promise<InspectedElement[]> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return []

  try {
    return await session.inspectorService.getElementStackAtPoint(payload.x, payload.y)
  } catch (error) {
    console.error('Failed to inspect element stack at point:', error)
    return []
  }
})

ipcMain.handle('inspect-element-by-backend-id', async (event, payload: {
  backendNodeId: number
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.getElementDetails(payload.backendNodeId)
  } catch (error) {
    console.error('Failed to inspect element by backend id:', error)
    return null
  }
})

ipcMain.handle('select-parent-element', async (event, payload: {
  backendNodeId: number
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.selectParentElement(payload.backendNodeId)
  } catch (error) {
    console.error('Failed to select parent element:', error)
    return null
  }
})

ipcMain.handle('select-first-child-element', async (event, payload: {
  backendNodeId: number
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.selectFirstChildElement(payload.backendNodeId)
  } catch (error) {
    console.error('Failed to select first child element:', error)
    return null
  }
})

ipcMain.handle('update-element-style', async (event, payload: {
  nodeId: number
  backendNodeId: number
  name: string
  value: string
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.updateElementStyle(
      payload.nodeId,
      payload.backendNodeId,
      payload.name,
      payload.value,
    )
  } catch (error) {
    console.error('Failed to update element style:', error)
    return null
  }
})

ipcMain.handle('update-element-styles', async (event, payload: {
  nodeId: number
  backendNodeId: number
  styles: Record<string, string>
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.updateElementStyles(
      payload.nodeId,
      payload.backendNodeId,
      payload.styles,
    )
  } catch (error) {
    console.error('Failed to update element styles:', error)
    return null
  }
})

ipcMain.handle('update-text-content', async (event, payload: {
  nodeId: number
  backendNodeId: number
  value: string
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.updateTextContent(
      payload.nodeId,
      payload.backendNodeId,
      payload.value,
    )
  } catch (error) {
    console.error('Failed to update text content:', error)
    return null
  }
})

ipcMain.handle('update-element-attribute', async (event, payload: {
  nodeId: number
  backendNodeId: number
  name: string
  value: string
}): Promise<InspectedElement | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.updateElementAttribute(
      payload.nodeId,
      payload.backendNodeId,
      payload.name,
      payload.value,
    )
  } catch (error) {
    console.error('Failed to update element attribute:', error)
    return null
  }
})

ipcMain.handle('capture-preview', async (event): Promise<{ dataUrl: string; viewport: Rectangle } | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.capturePreviewDataUrl()
  } catch (error) {
    console.error('Failed to capture preview:', error)
    return null
  }
})

ipcMain.handle('get-page-context-snapshot', async (event): Promise<PageContextSnapshot | null> => {
  const session = getSessionFromEvent(event)
  if (!session?.inspectorService) return null

  try {
    return await session.inspectorService.getPageContextSnapshot()
  } catch (error) {
    console.error('Failed to get page context snapshot:', error)
    return null
  }
})

ipcMain.handle('generate-ai-prompt', async (_event, element: InspectedElement): Promise<string> => (
  generateAIPrompt({
    tagName: element.tagName,
    classNames: element.classNames,
    id: element.id,
    computedStyles: element.computedStyles,
    cssVariables: element.cssVariables,
    outerHTMLPreview: element.outerHTMLPreview,
  })
))

ipcMain.handle('generate-css', async (_event, element: InspectedElement): Promise<string> => {
  const selector = element.id
    ? `#${element.id}`
    : element.classNames.length > 0
      ? `.${element.classNames[0]}`
      : element.tagName
  const properties: CSSProperty[] = Object.entries(element.computedStyles)
    .map(([name, value]) => ({ name, value }))
  return generateCSSClass(selector, properties)
})

ipcMain.handle('generate-css-variables', async (_event, variables: Record<string, string>): Promise<string> => (
  generateCSSVariables(variables)
))

ipcMain.handle('set-panel-width', async (event, width: number): Promise<void> => {
  const session = getSessionFromEvent(event)
  if (!session) return

  session.currentRightPanelWidth = Number.isFinite(width)
    ? Math.max(0, Math.round(width))
    : RIGHT_PANEL_WIDTH
  updateBrowserViewBounds(session)
})
