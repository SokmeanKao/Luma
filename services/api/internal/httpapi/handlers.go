package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/luma-app/luma/services/api/internal/config"
	"github.com/luma-app/luma/services/api/internal/languages"
)

const maxBody = 64 * 1024

type Server struct {
	cfg    config.Config
	mux    *http.ServeMux
	client *http.Client
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type healthResponse struct {
	OK bool `json:"ok"`
}

type capabilitiesResponse struct {
	Languages                    []languages.Language     `json:"languages"`
	SupportedPairs               []languages.VerifiedPair `json:"supportedPairs"`
	AllDistinctPairsAllowed      bool                     `json:"allDistinctPairsAllowed"`
	DefaultSourceLanguage        string                   `json:"defaultSourceLanguage"`
	DefaultTargetLanguage        string                   `json:"defaultTargetLanguage"`
	SourceLanguages              []string                 `json:"sourceLanguages"`
	TargetLanguages              []string                 `json:"targetLanguages"`
	ProviderAvailable            bool                     `json:"providerAvailable"`
	ModelConfigured              bool                     `json:"modelConfigured"`
	MintEnabled                  bool                     `json:"mintEnabled"`
	FreeTierEligibilityConfirmed bool                     `json:"freeTierEligibilityConfirmed"`
	Model                        string                   `json:"model,omitempty"`
	LiveTestAllowed              bool                     `json:"liveTestAllowed"`
	MissingEligibilityEvidence   []string                 `json:"missingEligibilityEvidence,omitempty"`
	LanguageFilterStatus         string                   `json:"languageFilterStatus"`
	PairVerificationNote         string                   `json:"pairVerificationNote"`
}

type liveTokenRequest struct {
	SourceLanguage string `json:"sourceLanguage"`
	TargetLanguage string `json:"targetLanguage"`
}

type liveTokenResponse struct {
	TemporaryCredential string `json:"temporaryCredential"`
	ExpiresAt           string `json:"expiresAt"`
	Model               string `json:"model"`
	APIVersion          string `json:"apiVersion"`
	WebsocketURL        string `json:"websocketUrl"`
	TargetLanguageCode  string `json:"targetLanguageCode"`
	EchoTargetLanguage  bool   `json:"echoTargetLanguage"`
	SetupLocked         bool   `json:"setupLocked"`
}

type googleAuthTokenResponse struct {
	Name string `json:"name"`
}

func NewServer(cfg config.Config) *Server {
	s := &Server{
		cfg: cfg,
		mux: http.NewServeMux(),
		client: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
	s.mux.HandleFunc("GET /healthz", s.handleHealthz)
	s.mux.HandleFunc("GET /api/v1/capabilities", s.withAPI(s.handleCapabilities))
	s.mux.HandleFunc("POST /api/v1/live-token", s.withAPI(s.handleLiveToken))
	return s
}

func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		s.mux.ServeHTTP(w, r)
	})
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{OK: true})
}

func (s *Server) missingEligibility() []string {
	missing := []string{}
	if !s.cfg.FreeTierEligibilityConfirmed {
		missing = append(missing,
			"Set FREE_TIER_ELIGIBILITY_CONFIRMED=true in .env only after you verify in Google AI Studio / rate-limits that gemini-3.5-live-translate-preview (or your GEMINI_MODEL) is available on free tier for this project",
			"Record model name, project id (not the API key), and observed free-tier limits in docs/feasibility/F01_LIVE_TRANSLATE_EVIDENCE.md",
		)
	}
	return missing
}

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	missing := s.missingEligibility()
	mintOK := s.cfg.EnableLiveTokenMint && s.cfg.GeminiAPIKey != ""
	defSrc, defTgt := languages.DefaultPair()
	// Keep the payload small: the UI expands all distinct pairs from `languages`
	// when allDistinctPairsAllowed is true (avoid shipping ~5k pair rows).
	writeJSON(w, http.StatusOK, capabilitiesResponse{
		Languages: languages.AllLanguages(),
		SupportedPairs: []languages.VerifiedPair{{
			Source:       defSrc,
			Target:       defTgt,
			FilterStatus: "unverified",
			Notes:        "Default product pair. Other Live Translate languages are selectable; filter E2E still pending.",
		}},
		AllDistinctPairsAllowed:      true,
		DefaultSourceLanguage:        defSrc,
		DefaultTargetLanguage:        defTgt,
		SourceLanguages:              languages.SourceCodes(),
		TargetLanguages:              languages.TargetCodes(),
		ProviderAvailable:            false, // product Live stays unverified until evidence recorded
		ModelConfigured:              strings.TrimSpace(s.cfg.GeminiModel) != "",
		MintEnabled:                  mintOK,
		FreeTierEligibilityConfirmed: s.cfg.FreeTierEligibilityConfirmed,
		Model:                        s.cfg.GeminiModel,
		LiveTestAllowed:              mintOK && s.cfg.FreeTierEligibilityConfirmed,
		MissingEligibilityEvidence:   missing,
		LanguageFilterStatus:         languages.PairFilterStatus(defSrc, defTgt),
		PairVerificationNote:         "Any distinct pair from the languages list is accepted for minting. Source-language filter proof is still pending per pair.",
	})
}

func (s *Server) handleLiveToken(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "Unable to read request body")
		return
	}
	if len(body) > maxBody {
		writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "Request body too large")
		return
	}

	var req liveTokenRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "Invalid JSON body")
		return
	}
	src := languages.Normalize(req.SourceLanguage)
	tgt := languages.Normalize(req.TargetLanguage)
	if src == "" || tgt == "" {
		writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "sourceLanguage and targetLanguage are required")
		return
	}
	if src == tgt {
		writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "Source and target languages must differ")
		return
	}
	if !languages.IsPairAllowed(src, tgt) {
		writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "Unsupported language pair: "+src+"→"+tgt+". Only verified pairs from /api/v1/capabilities are accepted.")
		return
	}

	if !s.cfg.EnableLiveTokenMint {
		writeErr(w, http.StatusServiceUnavailable, "CONFIGURATION_MISSING", "Live token minting is not configured (ENABLE_LIVE_TOKEN_MINT=false)")
		return
	}
	if strings.TrimSpace(s.cfg.GeminiAPIKey) == "" {
		writeErr(w, http.StatusServiceUnavailable, "CONFIGURATION_MISSING", "Live token minting is not configured (GEMINI_API_KEY missing)")
		return
	}
	if strings.TrimSpace(s.cfg.GeminiModel) == "" {
		writeErr(w, http.StatusServiceUnavailable, "CONFIGURATION_MISSING", "Live token minting is not configured (GEMINI_MODEL missing)")
		return
	}
	if !s.cfg.FreeTierEligibilityConfirmed {
		writeErr(w, http.StatusForbidden, "NOT_AUTHORIZED", "Free-tier eligibility not confirmed. Set FREE_TIER_ELIGIBILITY_CONFIRMED=true after AI Studio verification, then restart the API.")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	tokenName, expiresAt, err := s.mintEphemeralToken(ctx)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "PROVIDER_UNAVAILABLE", "Upstream token mint failed: "+err.Error())
		return
	}

	apiVersion := "v1beta"
	ws := fmt.Sprintf(
		"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.%s.GenerativeService.BidiGenerateContentConstrained?access_token=%s",
		apiVersion,
		tokenName,
	)

	writeJSON(w, http.StatusOK, liveTokenResponse{
		TemporaryCredential: tokenName,
		ExpiresAt:           expiresAt.UTC().Format(time.RFC3339),
		Model:               s.cfg.GeminiModel,
		APIVersion:          apiVersion,
		WebsocketURL:        ws,
		TargetLanguageCode:  tgt,
		EchoTargetLanguage:  false,
		SetupLocked:         false,
	})
}

func (s *Server) mintEphemeralToken(ctx context.Context) (string, time.Time, error) {
	expire := time.Now().Add(30 * time.Minute)
	newSessionExpire := time.Now().Add(2 * time.Minute)

	// Minimal AuthToken create body. Advanced constraint field names are rejected by
	// the current auth_tokens schema in this project; client sends Live Translate setup.
	payload := map[string]any{
		"uses":                 1,
		"expireTime":           expire.UTC().Format(time.RFC3339),
		"newSessionExpireTime": newSessionExpire.UTC().Format(time.RFC3339),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", time.Time{}, err
	}

	// Prefer v1beta (Live Translate ephemeral docs); fall back to v1alpha if needed.
	endpoints := []string{
		"https://generativelanguage.googleapis.com/v1beta/auth_tokens",
		"https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
	}

	var lastErr error
	for _, endpoint := range endpoints {
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
		if err != nil {
			return "", time.Time{}, err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-goog-api-key", s.cfg.GeminiAPIKey)

		res, err := s.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		resBody, _ := io.ReadAll(io.LimitReader(res.Body, 64*1024))
		_ = res.Body.Close()
		if res.StatusCode < 200 || res.StatusCode >= 300 {
			snippet := strings.TrimSpace(string(resBody))
			if len(snippet) > 160 {
				snippet = snippet[:160] + "…"
			}
			snippet = strings.ReplaceAll(snippet, s.cfg.GeminiAPIKey, "[redacted]")
			lastErr = fmt.Errorf("%s → HTTP %d %s", endpoint, res.StatusCode, snippet)
			continue
		}
		var parsed googleAuthTokenResponse
		if err := json.Unmarshal(resBody, &parsed); err != nil {
			lastErr = err
			continue
		}
		if parsed.Name == "" {
			lastErr = errors.New("empty token name")
			continue
		}
		return parsed.Name, expire, nil
	}
	if lastErr == nil {
		lastErr = errors.New("token mint failed")
	}
	return "", time.Time{}, lastErr
}

func (s *Server) withAPI(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := s.checkOrigin(r); err != nil {
			writeErr(w, http.StatusForbidden, "NOT_AUTHORIZED", "Origin not allowed")
			return
		}
		ct := r.Header.Get("Content-Type")
		if r.Method == http.MethodPost && ct != "" && !strings.HasPrefix(ct, "application/json") {
			writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "Content-Type must be application/json")
			return
		}
		next(w, r)
	}
}

func (s *Server) originAllowed(origin string) bool {
	for _, allowed := range s.cfg.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (s *Server) checkOrigin(r *http.Request) error {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return nil
	}
	if s.originAllowed(origin) {
		return nil
	}
	return errors.New("origin not allowed")
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, status, apiError{Code: code, Message: message})
}
