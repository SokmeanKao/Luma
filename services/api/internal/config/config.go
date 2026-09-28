package config

import (
	"os"
	"strings"
)

type Config struct {
	BindAddr       string
	AllowedOrigins []string
	GeminiAPIKey   string
	GeminiModel    string
	DemoMode       bool
}

func Load() Config {
	origins := strings.Split(envOr("ALLOWED_ORIGINS", "http://localhost:3000"), ",")
	cleaned := make([]string, 0, len(origins))
	for _, o := range origins {
		o = strings.TrimSpace(o)
		if o != "" {
			cleaned = append(cleaned, o)
		}
	}
	return Config{
		BindAddr:       envOr("BIND_ADDR", "127.0.0.1:8080"),
		AllowedOrigins: cleaned,
		GeminiAPIKey:   os.Getenv("GEMINI_API_KEY"),
		GeminiModel:    envOr("GEMINI_MODEL", ""),
		DemoMode:       strings.EqualFold(os.Getenv("DEMO_MODE"), "true"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
