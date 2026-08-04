package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// GitHub is the OAuth web flow, which is two HTTP POSTs and a GET.
//
// Hand-rolled rather than pulled from golang.org/x/oauth2 because that
// is the entire dependency: this module has no go.sum and the rule that
// it stays that way is the same rule conductor/internal/docker follows
// when it speaks the Docker Engine API directly for three calls.
//
// No scopes are requested. The hub needs a stable identity and a name to
// show, both of which /user returns unauthenticated-by-scope. Asking for
// less is the difference between "log in" and "grant this app access to
// your repositories".
type GitHub struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string

	HTTP *http.Client

	// Endpoints, overridable so the flow can be exercised end to end
	// against an httptest server rather than against github.com.
	AuthorizeURL string
	TokenURL     string
	UserURL      string
}

// NewGitHub returns a GitHub with the real endpoints filled in.
func NewGitHub(clientID, clientSecret, redirectURL string) *GitHub {
	return &GitHub{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		HTTP:         &http.Client{Timeout: 10 * time.Second},
		AuthorizeURL: "https://github.com/login/oauth/authorize",
		TokenURL:     "https://github.com/login/oauth/access_token",
		UserURL:      "https://api.github.com/user",
	}
}

func (g *GitHub) client() *http.Client {
	if g.HTTP != nil {
		return g.HTTP
	}
	return &http.Client{Timeout: 10 * time.Second}
}

// AuthCodeURL is where the browser is sent to log in. state is the CSRF
// token the caller must check on the way back.
func (g *GitHub) AuthCodeURL(state string) string {
	q := url.Values{
		"client_id":    {g.ClientID},
		"redirect_uri": {g.RedirectURL},
		"state":        {state},
	}
	sep := "?"
	if strings.Contains(g.AuthorizeURL, "?") {
		sep = "&"
	}
	return g.AuthorizeURL + sep + q.Encode()
}

// Exchange trades an authorization code for an access token.
func (g *GitHub) Exchange(ctx context.Context, code string) (string, error) {
	form := url.Values{
		"client_id":     {g.ClientID},
		"client_secret": {g.ClientSecret},
		"code":          {code},
		"redirect_uri":  {g.RedirectURL},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("auth: build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	// Without this GitHub answers in form encoding, which is a silent
	// parse failure rather than a loud one.
	req.Header.Set("Accept", "application/json")

	body, err := g.do(req, "token exchange")
	if err != nil {
		return "", err
	}
	var out struct {
		AccessToken      string `json:"access_token"`
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("auth: unreadable token response: %w", err)
	}
	// GitHub reports a bad code with HTTP 200 and an error field, so the
	// status alone is not enough to tell success from failure.
	if out.Error != "" {
		return "", fmt.Errorf("auth: token exchange refused: %s (%s)", out.Error, out.ErrorDescription)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("auth: token exchange returned no token")
	}
	return out.AccessToken, nil
}

// User resolves an access token to the identity the hub stores.
func (g *GitHub) User(ctx context.Context, token string) (Session, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.UserURL, nil)
	if err != nil {
		return Session{}, fmt.Errorf("auth: build user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	body, err := g.do(req, "user lookup")
	if err != nil {
		return Session{}, err
	}
	var out struct {
		Login string `json:"login"`
		// A number on the wire. Kept as a string everywhere else,
		// because it is an identifier and never an amount of anything.
		ID int64 `json:"id"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return Session{}, fmt.Errorf("auth: unreadable user response: %w", err)
	}
	if out.ID == 0 {
		return Session{}, fmt.Errorf("auth: user response carried no id")
	}
	return Session{UserID: strconv.FormatInt(out.ID, 10), Login: out.Login}, nil
}

func (g *GitHub) do(req *http.Request, what string) ([]byte, error) {
	resp, err := g.client().Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth: %s: %w", what, err)
	}
	defer resp.Body.Close()
	// Bounded: this is a response from a third party, and an unbounded
	// ReadAll on one is a memory bug waiting for a bad day.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("auth: %s: read response: %w", what, err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth: %s: %s", what, resp.Status)
	}
	return body, nil
}
