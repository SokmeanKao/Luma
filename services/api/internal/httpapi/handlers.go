package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"github.com/luma-app/luma/services/api/internal/config"
)

const maxBody = 64 * 1024

type Server struct {
	cfg config.Config
	mux *http.ServeMux
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type healthResponse struct {
	OK bool `json:"ok"`
}

type capabilitiesResponse struct {
	SourceLanguages   []string `json:"sourceLanguages"`
	TargetLanguages   []string `json:"targetLanguages"`
	ProviderAvailable bool     `json:"providerAvailable"`
}

type liveTokenRequest struct {
	SourceLanguage string `json:"sourceLanguage"`
	TargetLanguage string `json:"targetLanguage"`
}

func NewServer(cfg config.Config) *Server {
	s := &Server{cfg: cfg, mux: http.NewServeMux()}
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

func (s *Server) handleCapabilities(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, capabilitiesResponse{
		SourceLanguages:   []string{"ko"},
		TargetLanguages:   []string{"en"},
		ProviderAvailable: false,
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

	// Foundation stub: never mint or fabricate a working token.
	_ = s.cfg.GeminiAPIKey
	writeErr(w, http.StatusServiceUnavailable, "CONFIGURATION_MISSING", "Live token minting is not configured")
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
		// Same-origin / non-browser tools (curl, Go tests) may omit Origin.
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
