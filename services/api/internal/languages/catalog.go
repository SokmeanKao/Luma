package languages

import "strings"

// Language is a catalog entry shown in the UI.
// Only codes that appear in a VerifiedPair are exposed via capabilities.
type Language struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// VerifiedPair is a source→target combination allowed for minting and Live sessions.
// Provider marketing lists are not enough: a pair is listed only after we accept it
// for this pipeline (token + Live Translate setup + client filter wiring).
// filterStatus documents whether source-language filtering has been proven for this pair.
type VerifiedPair struct {
	Source       string `json:"source"`
	Target       string `json:"target"`
	FilterStatus string `json:"filterStatus"` // "verified" | "unverified"
	Notes        string `json:"notes,omitempty"`
}

var catalog = []Language{
	{Code: "ko", Name: "Korean"},
	{Code: "en", Name: "English"},
	// Add more language rows only when at least one VerifiedPair references them.
}

// verifiedPairs is the allow-list for mint + UI. Expand only after real-audio evidence
// in docs/feasibility/F01_LIVE_TRANSLATE_EVIDENCE.md — never from dropdown mockups alone.
var verifiedPairs = []VerifiedPair{
	{
		Source:       "ko",
		Target:       "en",
		FilterStatus: "unverified",
		Notes:        "Default MVP pair. E2E Korean audio -> English subtitles still pending manual evidence.",
	},
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

func VerifiedPairs() []VerifiedPair {
	out := make([]VerifiedPair, len(verifiedPairs))
	copy(out, verifiedPairs)
	return out
}

func DefaultPair() (source, target string) {
	if len(verifiedPairs) == 0 {
		return "ko", "en"
	}
	return verifiedPairs[0].Source, verifiedPairs[0].Target
}

func IsPairAllowed(source, target string) bool {
	s := Normalize(source)
	t := Normalize(target)
	if s == "" || t == "" || s == t {
		return false
	}
	for _, p := range verifiedPairs {
		if p.Source == s && p.Target == t {
			return true
		}
	}
	return false
}

func PairFilterStatus(source, target string) string {
	s := Normalize(source)
	t := Normalize(target)
	for _, p := range verifiedPairs {
		if p.Source == s && p.Target == t {
			return p.FilterStatus
		}
	}
	return "unverified"
}

func SourceCodes() []string {
	seen := map[string]struct{}{}
	var out []string
	for _, p := range verifiedPairs {
		if _, ok := seen[p.Source]; ok {
			continue
		}
		seen[p.Source] = struct{}{}
		out = append(out, p.Source)
	}
	return out
}

func TargetCodes() []string {
	seen := map[string]struct{}{}
	var out []string
	for _, p := range verifiedPairs {
		if _, ok := seen[p.Target]; ok {
			continue
		}
		seen[p.Target] = struct{}{}
		out = append(out, p.Target)
	}
	return out
}

func TargetsForSource(source string) []string {
	s := Normalize(source)
	var out []string
	for _, p := range verifiedPairs {
		if p.Source == s {
			out = append(out, p.Target)
		}
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
