package languages

import "testing"

func TestIsPairAllowed_ExpandedCatalog(t *testing.T) {
	if !IsPairAllowed("ko", "en") {
		t.Fatal("ko→en must be allowed")
	}
	if !IsPairAllowed("KO-KR", "EN-US") {
		t.Fatal("BCP-47 primary tags should normalize")
	}
	if !IsPairAllowed("en", "ko") {
		t.Fatal("en→ko should be selectable for swap")
	}
	if !IsPairAllowed("ja", "en") {
		t.Fatal("ja→en should be selectable (Live Translate language)")
	}
	if !IsPairAllowed("ko", "fr") {
		t.Fatal("ko→fr should be selectable (Live Translate language)")
	}
	if IsPairAllowed("ko", "ko") {
		t.Fatal("identical languages rejected")
	}
	if IsPairAllowed("xx", "en") {
		t.Fatal("unknown language rejected")
	}
}

func TestTargetsForSource(t *testing.T) {
	targets := TargetsForSource("ko")
	if len(targets) < 2 {
		t.Fatalf("expected many targets from Korean, got %d", len(targets))
	}
	foundEn := false
	for _, tcode := range targets {
		if tcode == "ko" {
			t.Fatal("source must not appear in its own targets")
		}
		if tcode == "en" {
			foundEn = true
		}
	}
	if !foundEn {
		t.Fatal("en missing from Korean targets")
	}
}

func TestDefaultPair(t *testing.T) {
	s, tgt := DefaultPair()
	if s != "ko" || tgt != "en" {
		t.Fatalf("default=%s→%s", s, tgt)
	}
}
