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
	SourceLanguages              []string `json:"sourceLanguages"`
	TargetLanguages              []string `json:"targetLanguages"`
	ProviderAvailable            bool     `json:"providerAvailable"`
	ModelConfigured              bool     `json:"modelConfigured"`
	MintEnabled                  bool     `json:"mintEnabled"`
	FreeTierEligibilityConfirmed bool     `json:"freeTierEligibilityConfirmed"`
	Model                        string   `json:"model,omitempty"`
	LiveTestAllowed              bool     `json:"liveTestAllowed"`
	MissingEligibilityEvidence   []string `json:"missingEligibilityEvidence,omitempty"`
	LanguageFilterStatus         string   `json:"languageFilterStatus"`
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
	return s.mux
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
	writeJSON(w, http.StatusOK, capabilitiesResponse{
		SourceLanguages:              []string{"ko"},
		TargetLanguages:              []string{"en"},
		ProviderAvailable:            false, // product Live stays unverified until evidence recorded
		ModelConfigured:              strings.TrimSpace(s.cfg.GeminiModel) != "",
		MintEnabled:                  mintOK,
		FreeTierEligibilityConfirmed: s.cfg.FreeTierEligibilityConfirmed,
		Model:                        s.cfg.GeminiModel,
		LiveTestAllowed:              mintOK && s.cfg.FreeTierEligibilityConfirmed,
		MissingEligibilityEvidence:   missing,
		LanguageFilterStatus:         "unverified", // echoTargetLanguage≠Korean-only allowlist
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
	if req.SourceLanguage != "ko" || req.TargetLanguage != "en" {
		writeErr(w, http.StatusBadRequest, "INVALID_CONFIG", "Unsupported language configuration")
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
		writeErr(w, http.StatusBadGateway, "PROVIDER_UNAVAILABLE", "Upstream token mint failed")
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
		TargetLanguageCode:  s.cfg.TargetLanguageCode,
		EchoTargetLanguage:  false,
		SetupLocked:         true,
	})
}

func (s *Server) mintEphemeralToken(ctx context.Context) (string, time.Time, error) {
	expire := time.Now().Add(30 * time.Minute)
	newSessionExpire := time.Now().Add(2 * time.Minute)
	modelPath := s.cfg.GeminiModel
	if !strings.HasPrefix(modelPath, "models/") {
		modelPath = "models/" + modelPath
	}

	// Lock Live Translation config server-side (docs: liveConnectConstraints).
	// echoTargetLanguage=false: stay silent when input is already English — NOT a Korean-only filter.
	payload := map[string]any{
		"uses":                 1,
		"expireTime":           expire.UTC().Format(time.RFC3339),
		"newSessionExpireTime": newSessionExpire.UTC().Format(time.RFC3339),
		"liveConnectConstraints": map[string]any{
			"model": modelPath,
			"config": map[string]any{
				"responseModalities":       []string{"AUDIO"},
				"inputAudioTranscription":  map[string]any{},
				"outputAudioTranscription": map[string]any{},
				"translationConfig": map[string]any{
					"targetLanguageCode": s.cfg.TargetLanguageCode,
					"echoTargetLanguage": false,
				},
			},
		},
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", time.Time{}, err
	}

	url := "https://generativelanguage.googleapis.com/v1beta/auth_tokens"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return "", time.Time{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-goog-api-key", s.cfg.GeminiAPIKey)

	res, err := s.client.Do(req)
	if err != nil {
		return "", time.Time{}, err
	}
	defer res.Body.Close()
	resBody, _ := io.ReadAll(io.LimitReader(res.Body, 64*1024))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", time.Time{}, fmt.Errorf("auth_tokens status %d", res.StatusCode)
	}
	var parsed googleAuthTokenResponse
	if err := json.Unmarshal(resBody, &parsed); err != nil {
		return "", time.Time{}, err
	}
	if parsed.Name == "" {
		return "", time.Time{}, errors.New("empty token name")
	}
	return parsed.Name, expire, nil
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

func (s *Server) checkOrigin(r *http.Request) error {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return nil
	}
	for _, allowed := range s.cfg.AllowedOrigins {
		if origin == allowed {
			return nil
		}
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
