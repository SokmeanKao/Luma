package main

import (
	"log"
	"net/http"

	"github.com/luma-app/luma/services/api/internal/config"
	"github.com/luma-app/luma/services/api/internal/httpapi"
)

func main() {
	cfg := config.Load()
	srv := httpapi.NewServer(cfg)
	log.Printf("luma api listening on http://%s (loopback local MVP)", cfg.BindAddr)
	if err := http.ListenAndServe(cfg.BindAddr, srv.Handler()); err != nil {
		log.Fatal(err)
	}
}
