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

func testServer(key string, mint bool) *Server {
	return NewServer(config.Config{
		BindAddr:            "127.0.0.1:8080",
		AllowedOrigins:      []string{"http://localhost:3000"},
		GeminiAPIKey:        key,
		GeminiModel:         "models/test-model",
		EnableLiveTokenMint: mint,
	})
}

func TestHealthz(t *testing.T) {
	srv := testServer("", false)
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d", rr.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["ok"] != true {
		t.Fatalf("body=%v", body)
	}
	raw := rr.Body.String()
	if strings.Contains(strings.ToLower(raw), "key") || strings.Contains(raw, "token") {
		t.Fatalf("healthz leaked sensitive fields: %s", raw)
	}
}

func TestCapabilities_NoFabricatedQuota(t *testing.T) {
	srv := testServer("", false)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/capabilities", nil)
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	raw := rr.Body.String()
	if strings.Contains(raw, "remainingMinutes") || strings.Contains(raw, "quota") {
		t.Fatalf("fabricated quota fields present: %s", raw)
	}
	var body capabilitiesResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.ProviderAvailable {
		t.Fatal("providerAvailable should stay false until live gates verified")
	}
}

func TestLiveToken_InvalidLanguage(t *testing.T) {
	srv := testServer("", false)
	payload := []byte(`{"sourceLanguage":"fr","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Origin", "http://localhost:3000")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status=%d", rr.Code)
	}
	var errBody apiError
	_ = json.Unmarshal(rr.Body.Bytes(), &errBody)
	if errBody.Code != "INVALID_CONFIG" {
		t.Fatalf("code=%s", errBody.Code)
	}
}

func TestLiveToken_NotConfigured(t *testing.T) {
	srv := testServer("", false)
	payload := []byte(`{"sourceLanguage":"ko","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d body=%s", rr.Code, rr.Body.String())
	}
	var errBody apiError
	_ = json.Unmarshal(rr.Body.Bytes(), &errBody)
	if errBody.Code != "CONFIGURATION_MISSING" {
		t.Fatalf("code=%s", errBody.Code)
	}
	if !strings.Contains(strings.ToLower(errBody.Message), "not configured") {
		t.Fatalf("message=%s", errBody.Message)
	}
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache-control=%s", rr.Header().Get("Cache-Control"))
	}
}

func TestLiveToken_KeyAloneDoesNotFabricateToken(t *testing.T) {
	// Key present but mint flag off → still not configured; never invent a credential.
	srv := testServer("fake-secret-key", false)
	payload := []byte(`{"sourceLanguage":"ko","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code == http.StatusOK {
		t.Fatal("must not return 200 with a fabricated token")
	}
	var errBody apiError
	_ = json.Unmarshal(rr.Body.Bytes(), &errBody)
	if errBody.Code != "CONFIGURATION_MISSING" {
		t.Fatalf("code=%s", errBody.Code)
	}
	raw := rr.Body.String()
	if strings.Contains(raw, "temporaryCredential") || strings.Contains(raw, "fake-secret") {
		t.Fatalf("response appears to include a credential: %s", raw)
	}
}

func TestLiveToken_NoStoreHeader(t *testing.T) {
	srv := testServer("", false)
	payload := []byte(`{"sourceLanguage":"ko","targetLanguage":"en"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/live-token", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("cache-control=%s", rr.Header().Get("Cache-Control"))
	}
}

func TestLiveToken_RejectsDisallowedOrigin(t *testing.T) {
	srv := testServer("", false)
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
