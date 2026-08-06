package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"

	"kubestronaut-sim/facilitator/internal/api"
)

const seedTimeout = 10 * time.Second

type conductorSeeder struct {
	client    *http.Client
	seedURL   string
	statusURL string
}

func newConductorSeeder(base *url.URL, rt http.RoundTripper) api.Seeder {
	return &conductorSeeder{
		client:    &http.Client{Timeout: seedTimeout, Transport: rt},
		seedURL:   base.JoinPath("/api/control/seed").String(),
		statusURL: base.JoinPath("/api/control/status").String(),
	}
}

func (c *conductorSeeder) Start(ctx context.Context, questions []string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, seedTimeout)
	defer cancel()

	body, err := json.Marshal(map[string]any{"questions": questions})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.seedURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("seed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {

		var errBody struct {
			Error string `json:"error"`
		}
		json.NewDecoder(resp.Body).Decode(&errBody)
		if errBody.Error != "" {
			return "", fmt.Errorf("seed: %s", errBody.Error)
		}
		return "", fmt.Errorf("seed: the environment service answered %s", resp.Status)
	}

	var ok struct {
		Job struct {
			ID string `json:"id"`
		} `json:"job"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&ok); err != nil {
		return "", fmt.Errorf("seed: %w", err)
	}
	if ok.Job.ID == "" {
		return "", fmt.Errorf("seed: the environment service accepted the job but named no id")
	}
	return ok.Job.ID, nil
}

func (c *conductorSeeder) Status(ctx context.Context, jobID string) (api.SeedStatus, error) {
	ctx, cancel := context.WithTimeout(ctx, seedTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.statusURL, nil)
	if err != nil {
		return api.SeedStatus{}, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return api.SeedStatus{}, fmt.Errorf("seed status: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return api.SeedStatus{}, fmt.Errorf("seed status: the environment service answered %s", resp.Status)
	}

	var snap struct {
		Busy bool `json:"busy"`
		Job  *struct {
			ID    string `json:"id"`
			Error string `json:"error"`
		} `json:"job"`
		LastJob *struct {
			ID    string `json:"id"`
			Error string `json:"error"`
		} `json:"lastJob"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&snap); err != nil {
		return api.SeedStatus{}, fmt.Errorf("seed status: %w", err)
	}

	if snap.Job != nil && snap.Job.ID == jobID {
		return api.SeedStatus{State: api.SeedRunning}, nil
	}
	if snap.LastJob != nil && snap.LastJob.ID == jobID {
		if snap.LastJob.Error != "" {
			return api.SeedStatus{State: api.SeedFailed, Error: snap.LastJob.Error}, nil
		}
		return api.SeedStatus{State: api.SeedDone}, nil
	}
	return api.SeedStatus{State: api.SeedUnknown}, nil
}
