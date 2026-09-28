package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/luma-app/luma/services/api/internal/config"
)

func testServer(key string, mint bool, eligible bool) *Server {
	return NewServer(config.Config{
		BindAddr:                     "127.0.0.1:8080",
		AllowedOrigins:               []string{"http://localhost:3000"},
		GeminiAPIKey:                 key,
		GeminiModel:                  "gemini-3.5-live-translate-preview",
		EnableLiveTokenMint:          mint,
		FreeTierEligibilityConfirmed: eligible,
		TargetLanguageCode:           "en",
	})
}

func TestHealthz(t *testing.T) {
	srv := testServer("", false, false)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d", rr.Code)
	}
}

func TestCapabilities_ReportsMissingEligibility(t *testing.T) {
	srv := testServer("k", true, false)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/capabilities", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	var body capabilitiesResponse
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if body.ProviderAvailable {
		t.Fatal("providerAvailable must stay false without eligibility")
	}
	if body.LiveTestAllowed {
		t.Fatal("liveTestAllowed should be false without eligibility")
	}
	if len(body.MissingEligibilityEvidence) == 0 {
		t.Fatal("expected missing eligibility guidance")
	}
	if body.LanguageFilterStatus != "unverified" {
		t.Fatalf("filter=%s", body.LanguageFilterStatus)
	}
	if body.DefaultSourceLanguage != "ko" || body.DefaultTargetLanguage != "en" {
		t.Fatalf("defaults=%s→%s", body.DefaultSourceLanguage, body.DefaultTargetLanguage)
	}
	if !body.AllDistinctPairsAllowed {
		t.Fatal("expected allDistinctPairsAllowed so UI can expand pairs from languages")
	}
	if len(body.Languages) < 10 {
		t.Fatalf("expected many languages, got %d", len(body.Languages))
	}
	if len(body.SupportedPairs) == 0 {
		t.Fatal("expected at least the default pair in supportedPairs")
	}
}

func TestCapabilities_SetsCORSForAllowedOrigin(t *testing.T) {
	srv := testServer("k", true, true)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/capabilities", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d", rr.Code)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("ACAO=%q", got)
	}
	var body capabilitiesResponse
	_ = json.Unmarshal(rr.Body.Bytes(), &body)
	if !body.ProviderAvailable || !body.LiveTestAllowed {
		t.Fatalf("expected providerAvailable and liveTestAllowed when mint+eligibility are set")
	}
}

func TestCapabilities_PreflightOPTIONS(t *testing.T) {
	srv := testServer("k", true, true)
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/live-token", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	req.Header.Set("Access-Control-Request-Method", "POST")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusNoContent {
		t.Fatalf("status=%d", rr.Code)
	}
	if got := rr.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3000" {
		t.Fatalf("ACAO=%q", got)
	}
}

func TestLiveToken_RejectsIdenticalLanguages(t *testing.T) {
	srv := testServer("k", true, true)
	payload := []byte(`{"sourceLanguage":"ko","targetLanguage":"ko"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d", rr.Code)
	}
}

func TestLiveToken_InvalidLanguage(t *testing.T) {
	srv := testServer("k", true, true)
	payload := []byte(`{"sourceLanguage":"xx","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
}

func TestLiveToken_NotConfigured(t *testing.T) {
	srv := testServer("", false, false)
	payload := []byte(`{"sourceLanguage":"ko","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d", rr.Code)
	}
	var errBody apiError
	_ = json.Unmarshal(rr.Body.Bytes(), &errBody)
	if errBody.Code != "CONFIGURATION_MISSING" {
		t.Fatalf("code=%s", errBody.Code)
	}
}

func TestLiveToken_RequiresEligibility(t *testing.T) {
	srv := testServer("fake-secret-key", true, false)
	payload := []byte(`{"sourceLanguage":"ko","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var errBody apiError
	_ = json.Unmarshal(rr.Body.Bytes(), &errBody)
	if errBody.Code != "NOT_AUTHORIZED" {
		t.Fatalf("code=%s", errBody.Code)
	}
	if strings.Contains(rr.Body.String(), "fake-secret") {
		t.Fatal("leaked key")
	}
}

func TestLiveToken_RejectsDisallowedOrigin(t *testing.T) {
	srv := testServer("", false, false)
	payload := []byte(`{"sourceLanguage":"ko","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "https://evil.example")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("status=%d", rr.Code)
	}
}
