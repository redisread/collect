// 支持的目标语言配置（前后端共享）
export interface SupportedLanguage {
	code: string;
	label: string;
	nativeLabel: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
	{ code: "zh-CN", label: "简体中文", nativeLabel: "简体中文" },
	{ code: "zh-TW", label: "繁体中文", nativeLabel: "繁體中文" },
	{ code: "en", label: "English", nativeLabel: "English" },
	{ code: "ja", label: "日语", nativeLabel: "日本語" },
	{ code: "ko", label: "韩语", nativeLabel: "한국어" },
	{ code: "fr", label: "法语", nativeLabel: "Français" },
	{ code: "de", label: "德语", nativeLabel: "Deutsch" },
	{ code: "es", label: "西班牙语", nativeLabel: "Español" },
	{ code: "pt", label: "葡萄牙语", nativeLabel: "Português" },
	{ code: "ru", label: "俄语", nativeLabel: "Русский" },
	{ code: "ar", label: "阿拉伯语", nativeLabel: "العربية" },
	{ code: "hi", label: "印地语", nativeLabel: "हिन्दी" },
	{ code: "it", label: "意大利语", nativeLabel: "Italiano" },
	{ code: "nl", label: "荷兰语", nativeLabel: "Nederlands" },
	{ code: "th", label: "泰语", nativeLabel: "ไทย" },
];

// 默认目标语言
export const DEFAULT_TARGET_LANG = "zh-CN";

// 获取支持的语言代码集合（用于快速查找）
export const SUPPORTED_LANG_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
