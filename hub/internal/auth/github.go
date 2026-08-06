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

type GitHub struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string

	HTTP *http.Client

	AuthorizeURL string
	TokenURL     string
	UserURL      string
}

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

	if out.Error != "" {
		return "", fmt.Errorf("auth: token exchange refused: %s (%s)", out.Error, out.ErrorDescription)
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("auth: token exchange returned no token")
	}
	return out.AccessToken, nil
}

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

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("auth: %s: read response: %w", what, err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("auth: %s: %s", what, resp.Status)
	}
	return body, nil
}
