# Poly CLI Installation Guide

The `poly` CLI tool is required for the polymarket-agent skill to function. This guide covers installation on Ubuntu/Debian systems.

## Prerequisites

- Python 3.9+ installed
- pip (Python package manager)

Verify Python is installed:
```bash
python3 --version
```

## Installation Steps

### 1. Navigate to the skill directory

```bash
cd /home/onnwee/.openclaw/workspace/skills/polymarket-agent
```

### 2. Run the installation script

```bash
chmod +x install.sh
./install.sh
```

This will:
- Create a Python virtual environment at `.venv/`
- Install all dependencies from `requirements.txt`
- Install the package in editable mode
- Make the `poly` command available at `.venv/bin/poly`

### 3. Verify installation

```bash
# Test the CLI
./.venv/bin/poly --help
```

Expected output should show available commands like `markets`, `balance`, `buy`, `sell`, etc.

## Usage

### Direct execution (recommended for scripts/cron)

```bash
/home/onnwee/.openclaw/workspace/skills/polymarket-agent/.venv/bin/poly markets --limit 10
```

### With activated environment

```bash
source /home/onnwee/.openclaw/workspace/skills/polymarket-agent/.venv/bin/activate
poly markets --limit 10
```

### Optional: Create shell alias

Add to `~/.bashrc` or `~/.zshrc`:

```bash
alias poly='/home/onnwee/.openclaw/workspace/skills/polymarket-agent/.venv/bin/poly'
```

Then reload your shell:
```bash
source ~/.bashrc  # or ~/.zshrc
```

## Post-Install Configuration

The `poly` CLI requires wallet configuration to interact with Polymarket:

```bash
# Run setup wizard
/home/onnwee/.openclaw/workspace/skills/polymarket-agent/.venv/bin/poly setup
```

This will prompt you to configure your wallet connection.

## Troubleshooting

### Permission denied on install.sh
```bash
chmod +x install.sh
```

### Python not found
```bash
sudo apt update
sudo apt install python3 python3-pip python3-venv
```

### Module not found errors
If you get import errors, the venv may be corrupted. Reinstall:
```bash
cd /home/onnwee/.openclaw/workspace/skills/polymarket-agent
rm -rf .venv
./install.sh
```

### Missing POLYMARKET_KEY environment variable
The skill expects `POLYMARKET_KEY` to be set. Add to your environment:
```bash
export POLYMARKET_KEY="your_key_here"
```

Or configure via the setup wizard:
```bash
poly setup
```

## What Gets Installed

| Component | Location | Purpose |
|-----------|----------|---------|
| Virtual environment | `.venv/` | Isolated Python environment |
| poly CLI | `.venv/bin/poly` | Main command-line tool |
| Python packages | `.venv/lib/python*/site-packages/` | Dependencies (typer, web3, rich, etc.) |
| Source code | Skill root directory | CLI implementation (cli.py, trade.py, etc.) |

## Dependencies

The following Python packages are installed:
- `py-clob-client` - Polymarket CLOB API client
- `requests` - HTTP library
- `rich` - Terminal formatting
- `typer` - CLI framework
- `questionary` - Interactive prompts
- `web3` - Ethereum blockchain interaction

## Cron Job Integration

The polymarket-scan cron job expects the CLI at:
```
/home/onnwee/.openclaw/workspace/skills/polymarket-agent/.venv/bin/poly
```

Ensure this path exists after installation for the cron job to work properly.
