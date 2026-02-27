# Rodeo Design Hub

Local + deployable creative brief hub.

- **Left pane**: brief list + status filters
- **Right pane**: renders the editorial HTML brief (same vibe as the Outdoorsy SXSW brief)

## Data

In production, this app reads briefs from `./data`.

Repository structure (mirrors the legacy Vault layout so existing code keeps working):

```
data/
  Agency HQ/
    briefs/
      <brief-slug>/
        brief.json
        feedback.json
        v1/
          site/index.html
          images/*
```

In local dev, you can also point at your Obsidian Vault:

```bash
export RODEO_DESIGN_HUB_VAULT_ROOT="/path/to/Vault/Vault"
```

## Run

```bash
npm run dev
# http://127.0.0.1:4174
```
