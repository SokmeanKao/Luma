package languages

import "testing"

func TestIsPairAllowed_Default(t *testing.T) {
	if !IsPairAllowed("ko", "en") {
		t.Fatal("ko→en must be allowed")
	}
	if !IsPairAllowed("KO-KR", "EN-US") {
		t.Fatal("BCP-47 primary tags should normalize")
	}
	if IsPairAllowed("en", "ko") {
		t.Fatal("en→ko is not verified yet")
	}
	if IsPairAllowed("ja", "en") {
		t.Fatal("ja→en must not appear until verified")
	}
	if IsPairAllowed("ko", "ko") {
		t.Fatal("identical languages rejected")
	}
	if IsPairAllowed("fr", "en") {
		t.Fatal("fr→en not verified")
	}
}

func TestTargetsForSource(t *testing.T) {
	targets := TargetsForSource("ko")
	if len(targets) != 1 || targets[0] != "en" {
		t.Fatalf("targets=%v", targets)
	}
	if len(TargetsForSource("en")) != 0 {
		t.Fatal("no verified targets from English yet")
	}
}
