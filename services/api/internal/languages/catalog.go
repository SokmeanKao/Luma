package languages

import "strings"

// Language is a catalog entry shown in the UI.
type Language struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// VerifiedPair is a source→target combination allowed for minting and Live sessions.
// Codes come from Gemini Live Translate’s published language table.
// filterStatus stays "unverified" until real-audio evidence is recorded for that pair.
type VerifiedPair struct {
	Source       string `json:"source"`
	Target       string `json:"target"`
	FilterStatus string `json:"filterStatus"` // "verified" | "unverified"
	Notes        string `json:"notes,omitempty"`
}

// Primary BCP-47 tags from https://ai.google.dev/gemini-api/docs/live-api/live-translate
// (zh-Hans/zh-Hant → zh, pt-BR/pt-PT → pt, no/nb → no).
var catalog = []Language{
	{Code: "af", Name: "Afrikaans"},
	{Code: "ak", Name: "Akan"},
	{Code: "sq", Name: "Albanian"},
	{Code: "am", Name: "Amharic"},
	{Code: "ar", Name: "Arabic"},
	{Code: "hy", Name: "Armenian"},
	{Code: "az", Name: "Azerbaijani"},
	{Code: "eu", Name: "Basque"},
	{Code: "be", Name: "Belarusian"},
	{Code: "bn", Name: "Bengali"},
	{Code: "bg", Name: "Bulgarian"},
	{Code: "my", Name: "Burmese"},
	{Code: "ca", Name: "Catalan"},
	{Code: "zh", Name: "Chinese"},
	{Code: "hr", Name: "Croatian"},
	{Code: "cs", Name: "Czech"},
	{Code: "da", Name: "Danish"},
	{Code: "nl", Name: "Dutch"},
	{Code: "en", Name: "English"},
	{Code: "et", Name: "Estonian"},
	{Code: "fil", Name: "Filipino"},
	{Code: "fi", Name: "Finnish"},
	{Code: "fr", Name: "French"},
	{Code: "gl", Name: "Galician"},
	{Code: "ka", Name: "Georgian"},
	{Code: "de", Name: "German"},
	{Code: "el", Name: "Greek"},
	{Code: "gu", Name: "Gujarati"},
	{Code: "ha", Name: "Hausa"},
	{Code: "he", Name: "Hebrew"},
	{Code: "hi", Name: "Hindi"},
	{Code: "hu", Name: "Hungarian"},
	{Code: "is", Name: "Icelandic"},
	{Code: "id", Name: "Indonesian"},
	{Code: "it", Name: "Italian"},
	{Code: "ja", Name: "Japanese"},
	{Code: "jv", Name: "Javanese"},
	{Code: "kn", Name: "Kannada"},
	{Code: "kk", Name: "Kazakh"},
	{Code: "km", Name: "Khmer"},
	{Code: "rw", Name: "Kinyarwanda"},
	{Code: "ko", Name: "Korean"},
	{Code: "lo", Name: "Lao"},
	{Code: "lv", Name: "Latvian"},
	{Code: "lt", Name: "Lithuanian"},
	{Code: "mk", Name: "Macedonian"},
	{Code: "ms", Name: "Malay"},
	{Code: "ml", Name: "Malayalam"},
	{Code: "mr", Name: "Marathi"},
	{Code: "mn", Name: "Mongolian"},
	{Code: "ne", Name: "Nepali"},
	{Code: "no", Name: "Norwegian"},
	{Code: "fa", Name: "Persian"},
	{Code: "pl", Name: "Polish"},
	{Code: "pt", Name: "Portuguese"},
	{Code: "pa", Name: "Punjabi"},
	{Code: "ro", Name: "Romanian"},
	{Code: "ru", Name: "Russian"},
	{Code: "sr", Name: "Serbian"},
	{Code: "sd", Name: "Sindhi"},
	{Code: "si", Name: "Sinhala"},
	{Code: "sk", Name: "Slovak"},
	{Code: "sl", Name: "Slovenian"},
	{Code: "es", Name: "Spanish"},
	{Code: "su", Name: "Sundanese"},
	{Code: "sw", Name: "Swahili"},
	{Code: "sv", Name: "Swedish"},
	{Code: "ta", Name: "Tamil"},
	{Code: "te", Name: "Telugu"},
	{Code: "th", Name: "Thai"},
	{Code: "tr", Name: "Turkish"},
	{Code: "uk", Name: "Ukrainian"},
	{Code: "ur", Name: "Urdu"},
	{Code: "uz", Name: "Uzbek"},
	{Code: "vi", Name: "Vietnamese"},
	{Code: "zu", Name: "Zulu"},
}

const pairNote = "Listed for Gemini Live Translate. Source-language filter E2E not proven for this pair."

func known(code string) bool {
	c := Normalize(code)
	for _, lang := range catalog {
		if lang.Code == c {
			return true
		}
	}
	return false
}

func Normalize(code string) string {
	code = strings.TrimSpace(strings.ToLower(code))
	if i := strings.IndexAny(code, "-_"); i >= 0 {
		code = code[:i]
	}
	return code
}

func AllLanguages() []Language {
	out := make([]Language, len(catalog))
	copy(out, catalog)
	return out
}

// VerifiedPairs returns every ordered pair of distinct catalog languages.
// Default product pair remains ko→en via DefaultPair().
func VerifiedPairs() []VerifiedPair {
	out := make([]VerifiedPair, 0, len(catalog)*(len(catalog)-1))
	for _, s := range catalog {
		for _, t := range catalog {
			if s.Code == t.Code {
				continue
			}
			out = append(out, VerifiedPair{
				Source:       s.Code,
				Target:       t.Code,
				FilterStatus: "unverified",
				Notes:        pairNote,
			})
		}
	}
	return out
}

func DefaultPair() (source, target string) {
	return "ko", "en"
}

func IsPairAllowed(source, target string) bool {
	s := Normalize(source)
	t := Normalize(target)
	if s == "" || t == "" || s == t {
		return false
	}
	return known(s) && known(t)
}

func PairFilterStatus(source, target string) string {
	if !IsPairAllowed(source, target) {
		return "unverified"
	}
	return "unverified"
}

func SourceCodes() []string {
	out := make([]string, 0, len(catalog))
	for _, lang := range catalog {
		out = append(out, lang.Code)
	}
	return out
}

func TargetCodes() []string {
	return SourceCodes()
}

func TargetsForSource(source string) []string {
	s := Normalize(source)
	var out []string
	for _, lang := range catalog {
		if lang.Code == s {
			continue
		}
		out = append(out, lang.Code)
	}
	return out
}

func Name(code string) string {
	c := Normalize(code)
	for _, lang := range catalog {
		if lang.Code == c {
			return lang.Name
		}
	}
	return c
}
