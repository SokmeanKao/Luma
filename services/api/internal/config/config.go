package config

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	BindAddr            string
	AllowedOrigins      []string
	GeminiAPIKey        string
	GeminiModel         string
	DemoMode            bool
	EnableLiveTokenMint bool
}

// Load reads process env. Optionally merges key=value pairs from nearby .env
// files without printing values. Existing process env wins over file values.
func Load() Config {
	loadDotEnvFiles()
	origins := strings.Split(envOr("ALLOWED_ORIGINS", "http://localhost:3000"), ",")
	cleaned := make([]string, 0, len(origins))
	for _, o := range origins {
		o = strings.TrimSpace(o)
		if o != "" {
			cleaned = append(cleaned, o)
		}
	}
	return Config{
		BindAddr:            envOr("BIND_ADDR", "127.0.0.1:8080"),
		AllowedOrigins:      cleaned,
		GeminiAPIKey:        os.Getenv("GEMINI_API_KEY"),
		GeminiModel:         envOr("GEMINI_MODEL", ""),
		DemoMode:            strings.EqualFold(os.Getenv("DEMO_MODE"), "true"),
		EnableLiveTokenMint: strings.EqualFold(os.Getenv("ENABLE_LIVE_TOKEN_MINT"), "true"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func loadDotEnvFiles() {
	candidates := []string{
		".env",
		filepath.Join("..", ".env"),
		filepath.Join("..", "..", ".env"),
	}
	for _, path := range candidates {
		applyDotEnvFile(path)
	}
}

func applyDotEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		_ = os.Setenv(key, value)
	}
}
